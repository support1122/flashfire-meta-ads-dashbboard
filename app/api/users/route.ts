import { prisma } from "@/lib/db";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session || session.role !== "admin") return null;
  return session;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  let pwd = "";
  for (let i = 0; i < 16; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// GET — list all users (admin only)
export async function GET() {
  const session = await requireAdmin();
  if (!session) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ ok: true, users });
}

// POST — create a new viewer user (admin only)
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { username } = await req.json();
  if (!username?.trim()) return Response.json({ ok: false, error: "Username required" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (existing) return Response.json({ ok: false, error: "Username already exists" }, { status: 400 });

  const plainPassword = generatePassword();
  const passwordHash = await bcrypt.hash(plainPassword, 12);

  const user = await prisma.user.create({
    data: { username: username.trim(), passwordHash, role: "viewer" },
    select: { id: true, username: true, role: true, createdAt: true },
  });

  return Response.json({ ok: true, user, plainPassword });
}

// DELETE — remove a user (admin only, cannot delete self)
export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ ok: false, error: "User ID required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "User not found" }, { status: 404 });
  if (target.username === session.username) return Response.json({ ok: false, error: "Cannot delete your own account" }, { status: 400 });

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
