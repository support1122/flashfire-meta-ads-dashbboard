export const maxDuration = 300; // 5 minutes (Vercel Pro allows up to 300s)

import { prisma } from "@/lib/db";
import {
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchInsights,
  fetchPlacementBreakdown,
  fetchAudienceBreakdown,
  extractLeads,
  type MetaInsightRow,
} from "@/lib/meta-api";
import { calcCTR, calcCPC, calcCPM, calcFrequency, calcCPL } from "@/lib/kpi-calc";
import { runAlertsEngine } from "@/lib/alerts-engine";

export const dynamic = "force-dynamic";

// This route is only ever hit by the cron job / a manual trigger — never by page loads.
export async function POST() {
  return runSync();
}

// Allow GET too, for easy manual triggering via curl/browser during setup.
export async function GET() {
  return runSync();
}

async function runSync() {
  const startedAt = Date.now();
  try {
    const [campaigns, adSets, ads] = await Promise.all([
      fetchCampaigns(),
      fetchAdSets(),
      fetchAds(),
    ]);

    // Upsert Campaigns
    for (const c of campaigns) {
      await prisma.campaign.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          name: c.name,
          objective: c.objective ?? null,
          status: c.effective_status ?? c.status,
          dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        },
        update: {
          name: c.name,
          objective: c.objective ?? null,
          status: c.effective_status ?? c.status,
          dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        },
      });
    }

    // Upsert AdSets (skip any whose campaign wasn't returned, to satisfy FK)
    const campaignIds = new Set(campaigns.map((c) => c.id));
    for (const as of adSets) {
      if (!campaignIds.has(as.campaign_id)) continue;
      await prisma.adSet.upsert({
        where: { id: as.id },
        create: {
          id: as.id,
          campaignId: as.campaign_id,
          name: as.name,
          status: as.effective_status ?? as.status,
          dailyBudget: as.daily_budget ? Number(as.daily_budget) / 100 : null,
        },
        update: {
          name: as.name,
          status: as.effective_status ?? as.status,
          dailyBudget: as.daily_budget ? Number(as.daily_budget) / 100 : null,
        },
      });
    }

    // Upsert Ads (skip any whose adset wasn't returned, to satisfy FK)
    const adSetIds = new Set(adSets.map((a) => a.id));
    for (const ad of ads) {
      if (!adSetIds.has(ad.adset_id)) continue;
      await prisma.ad.upsert({
        where: { id: ad.id },
        create: {
          id: ad.id,
          adSetId: ad.adset_id,
          name: ad.name,
          status: ad.effective_status ?? ad.status,
          creativeThumbnailUrl: ad.creative?.thumbnail_url ?? null,
          creativeTitle: ad.creative?.title ?? null,
          creativeBody: ad.creative?.body ?? null,
        },
        update: {
          name: ad.name,
          status: ad.effective_status ?? ad.status,
          creativeThumbnailUrl: ad.creative?.thumbnail_url ?? null,
          creativeTitle: ad.creative?.title ?? null,
          creativeBody: ad.creative?.body ?? null,
        },
      });
    }

    // Pull daily insights for the last 365 days in 90-day chunks to avoid Meta's payload limit.
    const until = formatDate(new Date());
    const adIds = new Set(ads.map((a) => a.id));
    let insightRowCount = 0;

    const chunks = dateChunks(daysAgo(365), new Date(), 90);
    for (const { since: s, until: u } of chunks) {
      const [campaignInsights, adSetInsights, adInsights] = await Promise.all([
        fetchInsights("campaign", s, u),
        fetchInsights("adset", s, u),
        fetchInsights("ad", s, u),
      ]);
      insightRowCount += await upsertInsights("campaign", campaignInsights, campaignIds, adSetIds, adIds);
      insightRowCount += await upsertInsights("adset", adSetInsights, campaignIds, adSetIds, adIds);
      insightRowCount += await upsertInsights("ad", adInsights, campaignIds, adSetIds, adIds);
    }

    // Rebuild DailyAccountSummary from campaign-level insights (source of truth for account totals).
    await rebuildDailyAccountSummary();

    // Placement + audience breakdowns (account-level, aggregated over the window, refreshed each sync).
    // Breakdowns use a shorter window (90 days) to keep the request fast.
    const breakdownSince = formatDate(daysAgo(90));
    const [placementRows, audienceRows] = await Promise.all([
      fetchPlacementBreakdown(breakdownSince, until),
      fetchAudienceBreakdown(breakdownSince, until),
    ]);
    await upsertBreakdownInsights("placement", placementRows, breakdownSince, until);
    await upsertBreakdownInsights("audience", audienceRows, breakdownSince, until);

    // Run alerts engine.
    const alertResult = await runAlertsEngine();

    await prisma.syncLog.create({
      data: {
        status: "success",
        message: `Synced ${campaigns.length} campaigns, ${adSets.length} adsets, ${ads.length} ads, ${insightRowCount} insight rows in ${Date.now() - startedAt}ms. ${alertResult.created} alerts generated.`,
      },
    });

    return Response.json({
      ok: true,
      campaigns: campaigns.length,
      adSets: adSets.length,
      ads: ads.length,
      insightRows: insightRowCount,
      alerts: alertResult.created,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncLog.create({
      data: { status: "failed", message },
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

async function upsertInsights(
  level: "campaign" | "adset" | "ad",
  rows: MetaInsightRow[],
  campaignIds: Set<string>,
  adSetIds: Set<string>,
  adIds: Set<string>
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    // Skip rows referencing entities we don't have (e.g. deleted between metadata & insights fetch).
    if (level === "campaign" && (!row.campaign_id || !campaignIds.has(row.campaign_id))) continue;
    if (level === "adset" && (!row.adset_id || !adSetIds.has(row.adset_id))) continue;
    if (level === "ad" && (!row.ad_id || !adIds.has(row.ad_id))) continue;

    const spend = Number(row.spend ?? 0);
    const impressions = Math.round(Number(row.impressions ?? 0));
    const reach = Math.round(Number(row.reach ?? 0));
    const clicks = Math.round(Number(row.clicks ?? 0));
    const leads = extractLeads(row.actions);

    const ctr = row.ctr !== undefined ? Number(row.ctr) : calcCTR(clicks, impressions);
    const cpc = row.cpc !== undefined ? Number(row.cpc) : calcCPC(spend, clicks);
    const cpm = row.cpm !== undefined ? Number(row.cpm) : calcCPM(spend, impressions);
    const frequency =
      row.frequency !== undefined ? Number(row.frequency) : calcFrequency(impressions, reach);
    const cpl = calcCPL(spend, leads);

    const date = new Date(row.date_start);
    // Deterministic id so re-syncing the same day/entity/level updates in place.
    const id = `${level}_${row.campaign_id ?? ""}_${row.adset_id ?? ""}_${row.ad_id ?? ""}_${row.date_start}`;

    await prisma.insight.upsert({
      where: { id },
      create: {
        id,
        date,
        level,
        campaignId: row.campaign_id ?? null,
        adSetId: row.adset_id ?? null,
        adId: row.ad_id ?? null,
        spend,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        leads,
        cpl,
      },
      update: {
        spend,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        leads,
        cpl,
      },
    });
    count++;
  }
  return count;
}

/**
 * Upserts account-level breakdown insight rows (placement or audience) for the current sync window.
 * These are aggregated over [since, until], not daily, so `date` is stored as `until` and old rows
 * for this breakdown type within the window are cleared first to avoid stale duplicates.
 */
async function upsertBreakdownInsights(
  kind: "placement" | "audience",
  rows: MetaInsightRow[],
  since: string,
  until: string
) {
  const date = new Date(until);
  const level = kind === "placement" ? "placement_breakdown" : "audience_breakdown";

  await prisma.insight.deleteMany({ where: { level } });

  for (const row of rows) {
    const spend = Number(row.spend ?? 0);
    const impressions = Math.round(Number(row.impressions ?? 0));
    const reach = Math.round(Number(row.reach ?? 0));
    const clicks = Math.round(Number(row.clicks ?? 0));
    const leads = extractLeads(row.actions);
    const ctr = row.ctr !== undefined ? Number(row.ctr) : calcCTR(clicks, impressions);
    const cpc = row.cpc !== undefined ? Number(row.cpc) : calcCPC(spend, clicks);
    const cpm = row.cpm !== undefined ? Number(row.cpm) : calcCPM(spend, impressions);
    const frequency =
      row.frequency !== undefined ? Number(row.frequency) : calcFrequency(impressions, reach);
    const cpl = calcCPL(spend, leads);

    const placement =
      kind === "placement"
        ? `${row.publisher_platform ?? "unknown"} / ${row.platform_position ?? "unknown"}`
        : null;
    const ageGender = kind === "audience" ? `${row.age ?? "unknown"} / ${row.gender ?? "unknown"}` : null;

    const id = `${level}_${placement ?? ageGender}_${since}_${until}`;

    await prisma.insight.create({
      data: {
        id,
        date,
        level,
        spend,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        leads,
        cpl,
        placement,
        ageGender,
      },
    });
  }
}

async function rebuildDailyAccountSummary() {
  const rows = await prisma.insight.groupBy({
    by: ["date"],
    where: { level: "campaign" },
    _sum: { spend: true, impressions: true, reach: true, clicks: true, leads: true },
  });

  for (const row of rows) {
    const spend = row._sum.spend ?? 0;
    const impressions = row._sum.impressions ?? 0;
    const reach = row._sum.reach ?? 0;
    const clicks = row._sum.clicks ?? 0;
    const leads = row._sum.leads ?? 0;

    await prisma.dailyAccountSummary.upsert({
      where: { date: row.date },
      create: {
        date: row.date,
        spend,
        impressions,
        reach,
        clicks,
        ctr: calcCTR(clicks, impressions),
        cpc: calcCPC(spend, clicks),
        cpm: calcCPM(spend, impressions),
        leads,
        cpl: calcCPL(spend, leads),
      },
      update: {
        spend,
        impressions,
        reach,
        clicks,
        ctr: calcCTR(clicks, impressions),
        cpc: calcCPC(spend, clicks),
        cpm: calcCPM(spend, impressions),
        leads,
        cpl: calcCPL(spend, leads),
      },
    });
  }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateChunks(from: Date, to: Date, chunkDays: number): { since: string; until: string }[] {
  const chunks = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + chunkDays - 1);
    if (end > to) end.setTime(to.getTime());
    chunks.push({ since: formatDate(cursor), until: formatDate(end) });
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}
