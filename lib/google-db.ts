// Prisma client for the separate Google Ads database (GOOGLE_DATABASE_URL).
import { PrismaClient } from "@/lib/generated/google-client";

const globalForGoogle = globalThis as unknown as { googlePrisma?: PrismaClient };

export const googlePrisma = globalForGoogle.googlePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForGoogle.googlePrisma = googlePrisma;
