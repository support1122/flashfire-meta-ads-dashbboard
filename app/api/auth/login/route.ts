import { createSessionToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    return Response.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  if (password !== expected) {
    return Response.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  const token = await createSessionToken();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
        60 * 60 * 24 * 30
      }${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    },
  });
}
