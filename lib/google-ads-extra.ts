// Everything below campaign level: ad groups, ads, keywords, search terms and all
// segment breakdowns. Normalised into entity rows + one flat "stat" row shape.
import { gaqlStream } from "./google-ads-api";

const micros = (v?: string | number) => Number(v ?? 0) / 1_000_000;
const n = (v?: string | number) => Number(v ?? 0);

export interface GoogleAdGroupEntity {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  type?: string;
  cpcBid: number | null;
}

export interface GoogleAdEntity {
  id: string;
  adGroupId: string;
  campaignId: string;
  name: string | null;
  type?: string;
  status: string;
  finalUrls: string[];
  headlines: string[];
  descriptions: string[];
}

export interface GoogleKeywordEntity {
  id: string; // `${adGroupId}~${criterionId}`
  adGroupId: string;
  campaignId: string;
  text: string;
  matchType: string;
  status: string;
  negative: boolean;
  qualityScore: number | null;
}

export type StatLevel =
  | "ad_group" | "ad" | "keyword" | "search_term"
  | "device" | "network" | "hour" | "geo" | "age" | "gender" | "conversion_action";

export interface GoogleStatRow {
  level: StatLevel;
  date: string; // YYYY-MM-DD
  campaignId: string;
  adGroupId: string | null;
  entityId: string | null; // ad id / keyword key
  dim1: string | null; // search term, device, network, hour, geo id, age, gender, conversion action
  dim2: string | null; // match type / geo type / term status
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  allConversions: number;
  interactions: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = any;

const M = `metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
           metrics.conversions_value, metrics.all_conversions, metrics.interactions`;
const M_CONV = `metrics.conversions, metrics.conversions_value, metrics.all_conversions`;

function stat(
  level: StatLevel,
  r: R,
  extra: Partial<Pick<GoogleStatRow, "adGroupId" | "entityId" | "dim1" | "dim2">> = {},
): GoogleStatRow {
  const m = r.metrics ?? {};
  return {
    level,
    date: r.segments.date,
    campaignId: String(r.campaign.id),
    adGroupId: extra.adGroupId ?? null,
    entityId: extra.entityId ?? null,
    dim1: extra.dim1 ?? null,
    dim2: extra.dim2 ?? null,
    spend: micros(m.costMicros),
    impressions: n(m.impressions),
    clicks: n(m.clicks),
    conversions: n(m.conversions),
    conversionValue: n(m.conversionsValue),
    allConversions: n(m.allConversions),
    interactions: n(m.interactions),
  };
}

const win = (since: string, until: string) => `segments.date BETWEEN '${since}' AND '${until}'`;

/* ───────────── entities ───────────── */

export async function fetchAdGroups(): Promise<GoogleAdGroupEntity[]> {
  const rows = await gaqlStream<R>(`
    SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros, campaign.id
    FROM ad_group WHERE ad_group.status != 'REMOVED'`);
  return rows.map((r) => ({
    id: String(r.adGroup.id),
    campaignId: String(r.campaign.id),
    name: r.adGroup.name,
    status: r.adGroup.status,
    type: r.adGroup.type,
    cpcBid: r.adGroup.cpcBidMicros ? micros(r.adGroup.cpcBidMicros) : null,
  }));
}

export async function fetchAds(): Promise<GoogleAdEntity[]> {
  const rows = await gaqlStream<R>(`
    SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls,
           ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
           ad_group_ad.status, ad_group.id, campaign.id
    FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'`);
  return rows.map((r) => {
    const ad = r.adGroupAd.ad;
    return {
      id: String(ad.id),
      adGroupId: String(r.adGroup.id),
      campaignId: String(r.campaign.id),
      name: ad.name ?? null,
      type: ad.type,
      status: r.adGroupAd.status,
      finalUrls: ad.finalUrls ?? [],
      headlines: (ad.responsiveSearchAd?.headlines ?? []).map((h: R) => h.text),
      descriptions: (ad.responsiveSearchAd?.descriptions ?? []).map((d: R) => d.text),
    };
  });
}

export async function fetchKeywords(): Promise<GoogleKeywordEntity[]> {
  const rows = await gaqlStream<R>(`
    SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.quality_info.quality_score,
           ad_group.id, campaign.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`);
  return rows.map((r) => ({
    id: `${r.adGroup.id}~${r.adGroupCriterion.criterionId}`,
    adGroupId: String(r.adGroup.id),
    campaignId: String(r.campaign.id),
    text: r.adGroupCriterion.keyword.text,
    matchType: r.adGroupCriterion.keyword.matchType,
    status: r.adGroupCriterion.status,
    negative: Boolean(r.adGroupCriterion.negative),
    qualityScore: r.adGroupCriterion.qualityInfo?.qualityScore ?? null,
  }));
}

/* ───────────── daily stats at every level ───────────── */

export async function fetchStats(since: string, until: string): Promise<GoogleStatRow[]> {
  const w = win(since, until);

  const jobs: Array<Promise<GoogleStatRow[]>> = [
    gaqlStream<R>(`SELECT campaign.id, ad_group.id, segments.date, ${M} FROM ad_group WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("ad_group", r, { adGroupId: String(r.adGroup.id) }))),

    gaqlStream<R>(`SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, segments.date, ${M} FROM ad_group_ad WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("ad", r, { adGroupId: String(r.adGroup.id), entityId: String(r.adGroupAd.ad.id) }))),

    gaqlStream<R>(`SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type, segments.date, ${M} FROM keyword_view WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("keyword", r, {
        adGroupId: String(r.adGroup.id),
        entityId: `${r.adGroup.id}~${r.adGroupCriterion.criterionId}`,
        dim1: r.adGroupCriterion.keyword.text,
        dim2: r.adGroupCriterion.keyword.matchType,
      }))),

    gaqlStream<R>(`SELECT campaign.id, ad_group.id, search_term_view.search_term, search_term_view.status,
        segments.date, ${M} FROM search_term_view WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("search_term", r, {
        adGroupId: String(r.adGroup.id), dim1: r.searchTermView.searchTerm, dim2: r.searchTermView.status,
      }))),

    gaqlStream<R>(`SELECT campaign.id, segments.device, segments.date, ${M} FROM campaign WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("device", r, { dim1: r.segments.device }))),

    gaqlStream<R>(`SELECT campaign.id, segments.ad_network_type, segments.date, ${M} FROM campaign WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("network", r, { dim1: r.segments.adNetworkType }))),

    gaqlStream<R>(`SELECT campaign.id, segments.hour, segments.date, ${M} FROM campaign WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("hour", r, { dim1: String(r.segments.hour) }))),

    gaqlStream<R>(`SELECT campaign.id, geographic_view.country_criterion_id, geographic_view.location_type,
        segments.date, ${M} FROM geographic_view WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("geo", r, {
        dim1: String(r.geographicView.countryCriterionId), dim2: r.geographicView.locationType,
      }))),

    gaqlStream<R>(`SELECT campaign.id, ad_group.id, ad_group_criterion.age_range.type, segments.date, ${M}
        FROM age_range_view WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("age", r, {
        adGroupId: String(r.adGroup.id), dim1: r.adGroupCriterion.ageRange.type,
      }))),

    gaqlStream<R>(`SELECT campaign.id, ad_group.id, ad_group_criterion.gender.type, segments.date, ${M}
        FROM gender_view WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("gender", r, {
        adGroupId: String(r.adGroup.id), dim1: r.adGroupCriterion.gender.type,
      }))),

    gaqlStream<R>(`SELECT campaign.id, segments.conversion_action_name, segments.date, ${M_CONV}
        FROM campaign WHERE ${w}`)
      .then((rs) => rs.map((r) => stat("conversion_action", r, { dim1: r.segments.conversionActionName }))),
  ];

  // allSettled-style: one failing breakdown must not lose the rest
  const settled = await Promise.allSettled(jobs);
  const out: GoogleStatRow[] = [];
  const errors: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
    else errors.push(String(s.reason).slice(0, 400));
  }
  if (errors.length) console.error("[google-ads] some breakdowns failed:\n" + errors.join("\n"));
  return out;
}

// Resolve country criterion ids (geo rows) to names.
export async function fetchGeoNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return map;
  const rows = await gaqlStream<R>(`
    SELECT geo_target_constant.id, geo_target_constant.name
    FROM geo_target_constant WHERE geo_target_constant.id IN (${unique.join(",")})`);
  for (const r of rows) map.set(String(r.geoTargetConstant.id), r.geoTargetConstant.name);
  return map;
}
