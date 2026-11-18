import { prisma } from "@/lib/db";
import { fetchGoogleCampaigns, fetchGoogleInsights } from "@/lib/google-ads-api";
import { fetchAdGroups, fetchAds, fetchKeywords, fetchStats, fetchGeoNames } from "@/lib/google-ads-extra";

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID,
  );
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

// Pull campaigns + daily campaign metrics from Google Ads into GoogleCampaign / GoogleInsight.
export async function syncGoogleAds(lookbackDays: number) {
  const campaigns = await fetchGoogleCampaigns();

  for (const c of campaigns) {
    const data = {
      name: c.name,
      status: c.status,
      channelType: c.channelType ?? null,
      biddingStrategyType: c.biddingStrategyType ?? null,
      dailyBudget: c.dailyBudget,
    };
    await prisma.googleCampaign.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }

  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const rows = await fetchGoogleInsights(fmt(since), fmt(until));

  const known = new Set(campaigns.map((c) => c.id));
  const records = rows
    .filter((r) => known.has(r.campaignId))
    .map((r) => ({
      id: `${r.campaignId}_${r.date}`,
      campaignId: r.campaignId,
      date: new Date(r.date),
      spend: r.spend,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      cpc: r.cpc,
      cpm: r.cpm,
      conversions: r.conversions,
      conversionValue: r.conversionValue,
      costPerConversion: r.costPerConversion,
      allConversions: r.allConversions,
      interactions: r.interactions,
      videoViews: r.videoViews,
      searchImpressionShare: r.searchImpressionShare,
      searchBudgetLostIS: r.searchBudgetLostIS,
      searchRankLostIS: r.searchRankLostIS,
      searchTopIS: r.searchTopIS,
    }));

  if (records.length > 0) {
    await prisma.googleInsight.deleteMany({ where: { id: { in: records.map((r) => r.id) } } });
    await prisma.googleInsight.createMany({ data: records });
  }

  // ── Everything below campaign level ──
  const [adGroups, ads, keywords] = await Promise.all([fetchAdGroups(), fetchAds(), fetchKeywords()]);
  await replaceEntities("googleAdGroup", adGroups);
  await replaceEntities("googleAd", ads);
  await replaceEntities("googleKeyword", keywords);

  const stats = await fetchStats(fmt(since), fmt(until));
  const geoNames = await fetchGeoNames(stats.filter((s) => s.level === "geo").map((s) => s.dim1 ?? ""));
  const statRecords = stats.map((s) => {
    const dim1 = s.level === "geo" ? (geoNames.get(s.dim1 ?? "") ?? s.dim1) : s.dim1;
    return {
      ...s,
      dim1,
      id: [s.level, s.campaignId, s.adGroupId ?? "", s.entityId ?? "", dim1 ?? "", s.dim2 ?? "", s.date].join("|"),
      date: new Date(s.date),
    };
  });

  // Replace the synced window atomically so partial failures never leave a half-written range.
  await prisma.$transaction(async (tx) => {
    // Only clear levels that actually came back, so a failed breakdown keeps its old rows.
    const levels = [...new Set(statRecords.map((r) => r.level))];
    await tx.googleStat.deleteMany({
      where: { level: { in: levels }, date: { gte: new Date(fmt(since)), lte: new Date(fmt(until)) } },
    });
    for (let i = 0; i < statRecords.length; i += 5000) {
      await tx.googleStat.createMany({ data: statRecords.slice(i, i + 5000), skipDuplicates: true });
    }
  }, { timeout: 120_000 });

  return {
    campaigns: campaigns.length,
    insightRows: records.length,
    adGroups: adGroups.length,
    ads: ads.length,
    keywords: keywords.length,
    statRows: statRecords.length,
  };
}

type EntityModel = "googleAdGroup" | "googleAd" | "googleKeyword";

// Entities are small: replace the whole table so removed items disappear.
async function replaceEntities(model: EntityModel, rows: Array<{ id: string }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = prisma[model] as any;
  await prisma.$transaction([m.deleteMany({}), m.createMany({ data: rows, skipDuplicates: true })]);
}
