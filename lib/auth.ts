import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "session";

function getSecret() {
  const secret = process.env.JWT_SECRET ?? "dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export type SessionPayload = { userId: string; username: string; role: string };

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
