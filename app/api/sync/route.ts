export const maxDuration = 300;

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

// Cron + manual trigger: incremental (last 3 days only — fast, ~10s)
export async function POST(req: Request) {
  const full = new URL(req.url).searchParams.get("full") === "1";
  return runSync(full ? 365 : 3);
}

export async function GET(req: Request) {
  const full = new URL(req.url).searchParams.get("full") === "1";
  return runSync(full ? 365 : 3);
}

async function runSync(lookbackDays: number) {
  const startedAt = Date.now();
  try {
    const [campaigns, adSets, ads] = await Promise.all([
      fetchCampaigns(),
      fetchAdSets(),
      fetchAds(),
    ]);

    // Upsert campaigns, adsets, ads in parallel batches
    await Promise.all(campaigns.map((c) =>
      prisma.campaign.upsert({
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
      })
    ));

    const campaignIds = new Set(campaigns.map((c) => c.id));
    await Promise.all(
      adSets
        .filter((as) => campaignIds.has(as.campaign_id))
        .map((as) =>
          prisma.adSet.upsert({
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
          })
        )
    );

    const adSetIds = new Set(adSets.map((a) => a.id));
    await Promise.all(
      ads
        .filter((ad) => adSetIds.has(ad.adset_id))
        .map((ad) =>
          prisma.ad.upsert({
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
          })
        )
    );

    // Pull insights — incremental uses single window, full uses 90-day chunks
    const until = formatDate(new Date());
    const adIds = new Set(ads.map((a) => a.id));
    let insightRowCount = 0;

    const chunks = lookbackDays <= 7
      ? [{ since: formatDate(daysAgo(lookbackDays)), until }]
      : dateChunks(daysAgo(lookbackDays), new Date(), 90);

    for (const { since: s, until: u } of chunks) {
      // Fetch all 3 levels in parallel
      const [campaignInsights, adSetInsights, adInsights] = await Promise.all([
        fetchInsights("campaign", s, u),
        fetchInsights("adset", s, u),
        fetchInsights("ad", s, u),
      ]);
      // Upsert all 3 levels in parallel using batch upsert
      const [c, a, d] = await Promise.all([
        batchUpsertInsights("campaign", campaignInsights, campaignIds, adSetIds, adIds),
        batchUpsertInsights("adset", adSetInsights, campaignIds, adSetIds, adIds),
        batchUpsertInsights("ad", adInsights, campaignIds, adSetIds, adIds),
      ]);
      insightRowCount += c + a + d;
    }

    // Rebuild DailyAccountSummary only for the synced window (not all-time)
    await rebuildDailyAccountSummary(daysAgo(lookbackDays + 1));

    // Breakdown insights (only on full sync to keep incremental fast)
    if (lookbackDays > 7) {
      const breakdownSince = formatDate(daysAgo(90));
      const [placementRows, audienceRows] = await Promise.all([
        fetchPlacementBreakdown(breakdownSince, until),
        fetchAudienceBreakdown(breakdownSince, until),
      ]);
      await upsertBreakdownInsights("placement", placementRows, breakdownSince, until);
      await upsertBreakdownInsights("audience", audienceRows, breakdownSince, until);
    }

    const alertResult = await runAlertsEngine();

    const mode = lookbackDays <= 7 ? "incremental" : "full";
    await prisma.syncLog.create({
      data: {
        status: "success",
        message: `[${mode}] Synced ${campaigns.length} campaigns, ${adSets.length} adsets, ${ads.length} ads, ${insightRowCount} insight rows in ${Date.now() - startedAt}ms. ${alertResult.created} alerts generated.`,
      },
    });

    return Response.json({
      ok: true,
      mode,
      campaigns: campaigns.length,
      adSets: adSets.length,
      ads: ads.length,
      insightRows: insightRowCount,
      alerts: alertResult.created,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncLog.create({ data: { status: "failed", message } });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

function buildInsightRecord(
  level: string,
  row: MetaInsightRow,
) {
  const spend = Number(row.spend ?? 0);
  const impressions = Math.round(Number(row.impressions ?? 0));
  const reach = Math.round(Number(row.reach ?? 0));
  const clicks = Math.round(Number(row.clicks ?? 0));
  const leads = extractLeads(row.actions);
  const ctr = row.ctr !== undefined ? Number(row.ctr) : calcCTR(clicks, impressions);
  const cpc = row.cpc !== undefined ? Number(row.cpc) : calcCPC(spend, clicks);
  const cpm = row.cpm !== undefined ? Number(row.cpm) : calcCPM(spend, impressions);
  const frequency = row.frequency !== undefined ? Number(row.frequency) : calcFrequency(impressions, reach);
  const cpl = calcCPL(spend, leads);
  const videoPlays = row.video_play_actions?.[0] ? Math.round(Number(row.video_play_actions[0].value)) : null;
  const videoAvgWatchSec = row.video_avg_time_watched_actions?.[0] ? Number(row.video_avg_time_watched_actions[0].value) : null;
  const videoP25 = row.video_p25_watched_actions?.[0] ? Math.round(Number(row.video_p25_watched_actions[0].value)) : null;
  const videoP50 = row.video_p50_watched_actions?.[0] ? Math.round(Number(row.video_p50_watched_actions[0].value)) : null;
  const videoP75 = row.video_p75_watched_actions?.[0] ? Math.round(Number(row.video_p75_watched_actions[0].value)) : null;
  const videoP100 = row.video_p100_watched_actions?.[0] ? Math.round(Number(row.video_p100_watched_actions[0].value)) : null;
  const thruPlays = row.video_thruplay_watched_actions?.[0] ? Math.round(Number(row.video_thruplay_watched_actions[0].value)) : null;
  const id = `${level}_${row.campaign_id ?? ""}_${row.adset_id ?? ""}_${row.ad_id ?? ""}_${row.date_start}`;
  const date = new Date(row.date_start);

  return {
    id, date, level,
    campaignId: row.campaign_id ?? null,
    adSetId: row.adset_id ?? null,
    adId: row.ad_id ?? null,
    spend, impressions, reach, frequency, clicks, ctr, cpc, cpm, leads, cpl,
    videoPlays, videoAvgWatchSec, videoP25, videoP50, videoP75, videoP100, thruPlays,
  };
}

// Batch upsert: delete existing rows for this window then createMany — single DB round trip
async function batchUpsertInsights(
  level: "campaign" | "adset" | "ad",
  rows: MetaInsightRow[],
  campaignIds: Set<string>,
  adSetIds: Set<string>,
  adIds: Set<string>
): Promise<number> {
  const filtered = rows.filter((row) => {
    if (level === "campaign") return row.campaign_id && campaignIds.has(row.campaign_id);
    if (level === "adset") return row.adset_id && adSetIds.has(row.adset_id);
    if (level === "ad") return row.ad_id && adIds.has(row.ad_id);
    return false;
  });
  if (filtered.length === 0) return 0;

  const records = filtered.map((row) => buildInsightRecord(level, row));

  // Delete existing rows for these IDs, then insert fresh — avoids upsert per-row overhead
  const ids = records.map((r) => r.id);
  await prisma.insight.deleteMany({ where: { id: { in: ids } } });
  await prisma.insight.createMany({ data: records });

  return records.length;
}

async function upsertBreakdownInsights(
  kind: "placement" | "audience",
  rows: MetaInsightRow[],
  since: string,
  until: string
) {
  const date = new Date(until);
  const level = kind === "placement" ? "placement_breakdown" : "audience_breakdown";
  await prisma.insight.deleteMany({ where: { level } });

  if (rows.length === 0) return;

  const data = rows.map((row) => {
    const spend = Number(row.spend ?? 0);
    const impressions = Math.round(Number(row.impressions ?? 0));
    const reach = Math.round(Number(row.reach ?? 0));
    const clicks = Math.round(Number(row.clicks ?? 0));
    const leads = extractLeads(row.actions);
    const ctr = row.ctr !== undefined ? Number(row.ctr) : calcCTR(clicks, impressions);
    const cpc = row.cpc !== undefined ? Number(row.cpc) : calcCPC(spend, clicks);
    const cpm = row.cpm !== undefined ? Number(row.cpm) : calcCPM(spend, impressions);
    const frequency = row.frequency !== undefined ? Number(row.frequency) : calcFrequency(impressions, reach);
    const placement = kind === "placement" ? `${row.publisher_platform ?? "unknown"} / ${row.platform_position ?? "unknown"}` : null;
    const ageGender = kind === "audience" ? `${row.age ?? "unknown"} / ${row.gender ?? "unknown"}` : null;
    const id = `${level}_${placement ?? ageGender}_${since}_${until}`;
    return { id, date, level, spend, impressions, reach, frequency, clicks, ctr, cpc, cpm, leads, cpl: calcCPL(spend, leads), placement, ageGender };
  });

  await prisma.insight.createMany({ data });
}

async function rebuildDailyAccountSummary(since: Date) {
  const rows = await prisma.insight.groupBy({
    by: ["date"],
    where: { level: "campaign", date: { gte: since } },
    _sum: { spend: true, impressions: true, reach: true, clicks: true, leads: true },
  });

  await Promise.all(rows.map((row) => {
    const spend = row._sum.spend ?? 0;
    const impressions = row._sum.impressions ?? 0;
    const reach = row._sum.reach ?? 0;
    const clicks = row._sum.clicks ?? 0;
    const leads = row._sum.leads ?? 0;
    return prisma.dailyAccountSummary.upsert({
      where: { date: row.date },
      create: { date: row.date, spend, impressions, reach, clicks, ctr: calcCTR(clicks, impressions), cpc: calcCPC(spend, clicks), cpm: calcCPM(spend, impressions), leads, cpl: calcCPL(spend, leads) },
      update: { spend, impressions, reach, clicks, ctr: calcCTR(clicks, impressions), cpc: calcCPC(spend, clicks), cpm: calcCPM(spend, impressions), leads, cpl: calcCPL(spend, leads) },
    });
  }));
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
