export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { syncGoogleAds, googleConfigured } from "@/lib/google-sync";

// GET/POST /api/sync/google[?full=1] — incremental = last 3 days, full = last 365 days.
async function run(req: Request) {
  const full = new URL(req.url).searchParams.get("full") === "1";
  if (!googleConfigured()) {
    return Response.json({ ok: false, error: "Google Ads env vars not set" }, { status: 400 });
  }
  const startedAt = Date.now();
  try {
    const result = await syncGoogleAds(full ? 365 : 3);
    await prisma.syncLog.create({
      data: {
        status: "success",
        message: `[google ${full ? "full" : "incremental"}] ${result.campaigns} campaigns, ${result.insightRows} insight rows in ${Date.now() - startedAt}ms`,
      },
    });
    return Response.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncLog.create({ data: { status: "failed", message: `[google] ${message}`.slice(0, 1000) } });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
