export function calcCTR(clicks: number, impressions: number): number {
  return impressions > 0 ? (clicks / impressions) * 100 : 0;
}

export function calcCPC(spend: number, clicks: number): number {
  return clicks > 0 ? spend / clicks : 0;
}

export function calcCPM(spend: number, impressions: number): number {
  return impressions > 0 ? (spend / impressions) * 1000 : 0;
}

export function calcFrequency(impressions: number, reach: number): number {
  return reach > 0 ? impressions / reach : 0;
}

export function calcCPL(spend: number, leads: number): number | null {
  return leads > 0 ? spend / leads : null;
}

export function calcPercentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function calcBudgetPacing(spend: number, dailyBudget: number, daysElapsed: number): number | null {
  if (dailyBudget <= 0 || daysElapsed <= 0) return null;
  return spend / (dailyBudget * daysElapsed);
}

export function calcHealthFlag(params: {
  cpl: number | null;
  ctr: number;
  frequency: number;
  spend: number;
  budget: number | null;
  leads: number;
  accountAvgCpl: number | null;
  accountAvgCtr: number;
}): "good" | "warning" | "critical" | "neutral" {
  const { cpl, ctr, frequency, spend, budget, leads, accountAvgCpl, accountAvgCtr } = params;

  if (spend === 0) return "neutral";

  let score = 0;

  if (accountAvgCpl !== null && cpl !== null) {
    if (cpl > accountAvgCpl * 1.5) score -= 2;
    else if (cpl > accountAvgCpl * 1.2) score -= 1;
    else if (cpl <= accountAvgCpl * 0.8) score += 1;
  }

  if (accountAvgCtr > 0) {
    if (ctr < accountAvgCtr * 0.5) score -= 2;
    else if (ctr < accountAvgCtr * 0.8) score -= 1;
    else if (ctr >= accountAvgCtr * 1.2) score += 1;
  }

  if (frequency > 5) score -= 2;
  else if (frequency > 3) score -= 1;

  if (budget !== null && budget > 0) {
    const pacing = spend / budget;
    if (pacing > 0.95) score -= 1;
  }

  if (score <= -3) return "critical";
  if (score <= -1) return "warning";
  if (score >= 1) return "good";
  return "neutral";
}
