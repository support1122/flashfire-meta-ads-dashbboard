import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/db";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";

export const dynamic = "force-dynamic";

const MODEL_NAME = "gemini-2.0-flash";

// POST /api/chat  body: { message: string, currentFilters?: { from?: string; to?: string; campaignId?: string } }
// v1 approach per spec: pull last 30 days of campaign+insight rows (scoped by filters if provided)
// as context, send to Gemini, instruct it to answer only from given data.
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "GEMINI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const message: string = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) {
    return Response.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  const filters = body.currentFilters ?? {};
  const to = filters.to ? new Date(filters.to) : new Date();
  const from = filters.from ? new Date(filters.from) : daysBefore(to, 30);

  const [campaigns, insights, alerts] = await Promise.all([
    prisma.campaign.findMany({
      where: filters.campaignId ? { id: filters.campaignId } : undefined,
      select: {
        id: true,
        name: true,
        objective: true,
        status: true,
        dailyBudget: true,
        lifetimeBudget: true,
      },
    }),
    prisma.insight.groupBy({
      by: ["campaignId", "date"],
      where: {
        level: "campaign",
        date: { gte: from, lte: to },
        ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
      orderBy: { date: "asc" },
    }),
    prisma.alert.findMany({ where: { resolved: false } }),
  ]);

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));

  const dataSummary = {
    dateRange: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      dailyBudget: c.dailyBudget,
      lifetimeBudget: c.lifetimeBudget,
    })),
    dailyInsights: insights.map((i) => {
      const spend = i._sum.spend ?? 0;
      const leads = i._sum.leads ?? 0;
      const clicks = i._sum.clicks ?? 0;
      const impressions = i._sum.impressions ?? 0;
      return {
        campaign: i.campaignId ? campaignNameById.get(i.campaignId) ?? i.campaignId : "unknown",
        date: i.date.toISOString().slice(0, 10),
        spend,
        leads,
        cpl: calcCPL(spend, leads),
        ctr: calcCTR(clicks, impressions),
      };
    }),
    activeAlerts: alerts.map((a) => ({
      severity: a.severity,
      title: a.title,
      body: a.body,
    })),
  };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are an assistant embedded in a Meta Ads performance dashboard. Answer the user's question using ONLY the JSON data below, which covers the account's synced campaign performance data. If the data doesn't contain what's needed to answer, say so plainly instead of guessing. Be concise, use ₹ for currency (this is an Indian ad account), and reference specific campaign names and numbers when relevant.

DATA:
${JSON.stringify(dataSummary)}

QUESTION:
${message}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return Response.json({ ok: true, answer: text });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: errMessage }, { status: 500 });
  }
}

function daysBefore(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - n);
  return copy;
}
