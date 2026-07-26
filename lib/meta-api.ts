const BASE = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;

async function metaGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("access_token", TOKEN ?? "");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const results: T[] = [];
  let data = (await metaGet(path, params)) as { data: T[]; paging?: { next?: string } };
  results.push(...(data.data ?? []));

  while (data.paging?.next) {
    const res = await fetch(data.paging.next);
    if (!res.ok) break;
    data = await res.json();
    results.push(...(data.data ?? []));
  }

  return results;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status?: string;
  daily_budget?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  adset_id: string;
  status: string;
  effective_status?: string;
  creative?: {
    thumbnail_url?: string;
    title?: string;
    body?: string;
  };
}

export interface MetaInsightRow {
  date_start: string;
  date_stop?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  video_play_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  publisher_platform?: string;
  platform_position?: string;
  age?: string;
  gender?: string;
}

export function extractLeads(actions?: MetaInsightRow["actions"]): number {
  if (!actions) return 0;
  const leadAction = actions.find(
    (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
  );
  return leadAction ? Math.round(Number(leadAction.value)) : 0;
}

export async function fetchCampaigns(): Promise<MetaCampaign[]> {
  return fetchAllPages<MetaCampaign>(`/${ACCOUNT}/campaigns`, {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
    limit: "200",
  });
}

export async function fetchAdSets(): Promise<MetaAdSet[]> {
  return fetchAllPages<MetaAdSet>(`/${ACCOUNT}/adsets`, {
    fields: "id,name,campaign_id,status,effective_status,daily_budget",
    limit: "200",
  });
}

export async function fetchAds(): Promise<MetaAd[]> {
  return fetchAllPages<MetaAd>(`/${ACCOUNT}/ads`, {
    fields: "id,name,adset_id,status,effective_status,creative{thumbnail_url,title,body}",
    limit: "200",
  });
}

export async function fetchInsights(
  level: "campaign" | "adset" | "ad",
  since: string,
  until: string
): Promise<MetaInsightRow[]> {
  return fetchAllPages<MetaInsightRow>(`/${ACCOUNT}/insights`, {
    level,
    fields: "campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,video_play_actions,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
}

export async function fetchPlacementBreakdown(_since: string, _until: string): Promise<MetaInsightRow[]> {
  return [];
}

export async function fetchAudienceBreakdown(_since: string, _until: string): Promise<MetaInsightRow[]> {
  return [];
}
