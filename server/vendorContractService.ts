import { db } from "./db";
import { vendorContracts } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export async function expireVendorContracts(): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const expired = await db.update(vendorContracts)
    .set({ contractStatus: "expired", updatedAt: new Date() })
    .where(and(
      eq(vendorContracts.contractStatus, "active"),
      sql`${vendorContracts.endDate} < ${today}`
    ))
    .returning();
  return expired.length;
}
