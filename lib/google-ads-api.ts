// Google Ads REST client (campaign-wise data). Mirrors lib/meta-api.ts.
//
// Env vars:
//   GOOGLE_ADS_DEVELOPER_TOKEN (optional), GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
//   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID,
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID (optional, manager account), GOOGLE_ADS_API_VERSION (optional)

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? "v23";
const BASE = `https://googleads.googleapis.com/${API_VERSION}`;

const stripDashes = (v?: string) => (v ?? "").replace(/-/g, "");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export async function gaqlStream<T>(query: string): Promise<T[]> {
  const customerId = stripDashes(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginId = stripDashes(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Content-Type": "application/json",
  };
  // Developer tokens were sunset in Sept 2026 (access is per Cloud project); send only if set.
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (loginId) headers["login-customer-id"] = loginId;

  const res = await fetch(`${BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Google Ads API error ${res.status}: ${await res.text()}`);

  // searchStream returns an array of batches: [{ results: [...] }, ...]
  const batches = (await res.json()) as Array<{ results?: T[] }>;
  return batches.flatMap((b) => b.results ?? []);
}

export interface GoogleCampaign {
  id: string;
  name: string;
  status: string; // ENABLED | PAUSED | REMOVED
  channelType?: string; // SEARCH, DISPLAY, VIDEO, PERFORMANCE_MAX, ...
  biddingStrategyType?: string;
  dailyBudget: number | null; // account currency
}

export interface GoogleInsightRow {
  date: string; // YYYY-MM-DD
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // percent, like Meta
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  costPerConversion: number | null;
  allConversions: number;
  interactions: number;
  videoViews: number;
  searchImpressionShare: number | null; // 0..1
  searchBudgetLostIS: number | null;
  searchRankLostIS: number | null;
  searchTopIS: number | null;
}

interface CampaignResult {
  campaign: {
    id: string;
    name: string;
    status: string;
    advertisingChannelType?: string;
    biddingStrategyType?: string;
  };
  campaignBudget?: { amountMicros?: string };
}

interface InsightResult {
  campaign: { id: string };
  segments: { date: string };
  metrics: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
    allConversions?: number;
    interactions?: string;
    videoTrueviewViews?: string;
    searchImpressionShare?: number | string;
    searchBudgetLostImpressionShare?: number | string;
    searchRankLostImpressionShare?: number | string;
    searchTopImpressionShare?: number | string;
  };
}

const micros = (v?: string | number) => Number(v ?? 0) / 1_000_000;
const share = (v?: number | string) =>
  v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v);

export async function fetchGoogleCampaigns(): Promise<GoogleCampaign[]> {
  const rows = await gaqlStream<CampaignResult>(`
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type, campaign.bidding_strategy_type,
           campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `);
  return rows.map((r) => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
    channelType: r.campaign.advertisingChannelType,
    biddingStrategyType: r.campaign.biddingStrategyType,
    dailyBudget: r.campaignBudget?.amountMicros ? micros(r.campaignBudget.amountMicros) : null,
  }));
}

// Daily metrics per campaign (one row per campaign per day), `since`/`until` = YYYY-MM-DD.
export async function fetchGoogleInsights(since: string, until: string): Promise<GoogleInsightRow[]> {
  const rows = await gaqlStream<InsightResult>(`
    SELECT campaign.id, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value, metrics.all_conversions,
           metrics.interactions, metrics.video_trueview_views, metrics.search_impression_share,
           metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share,
           metrics.search_top_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND campaign.status != 'REMOVED'
  `);

  return rows.map((r) => {
    const spend = micros(r.metrics.costMicros);
    const impressions = Number(r.metrics.impressions ?? 0);
    const clicks = Number(r.metrics.clicks ?? 0);
    const conversions = Number(r.metrics.conversions ?? 0);
    return {
      date: r.segments.date,
      campaignId: r.campaign.id,
      spend,
      impressions,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      conversions,
      conversionValue: Number(r.metrics.conversionsValue ?? 0),
      costPerConversion: conversions > 0 ? spend / conversions : null,
      allConversions: Number(r.metrics.allConversions ?? 0),
      interactions: Number(r.metrics.interactions ?? 0),
      videoViews: Number(r.metrics.videoTrueviewViews ?? 0),
      searchImpressionShare: share(r.metrics.searchImpressionShare),
      searchBudgetLostIS: share(r.metrics.searchBudgetLostImpressionShare),
      searchRankLostIS: share(r.metrics.searchRankLostImpressionShare),
      searchTopIS: share(r.metrics.searchTopImpressionShare),
    };
  });
}
