import type { RequestHandler } from "express";
import { decryptSsnOrEin } from "../driverEncryption";
import { hasCorporateAccess } from "./payrollPermissions";
import {
  DRIVER_FULL_SSN_AUDIT_EVENT,
  buildDriverSsnViewAuditMetadata,
  hasExplicitFullDriverSsnAccess,
} from "./driverSsnAccess";

export interface DriverSsnRevealDependencies {
  getUser(userId: string): Promise<any>;
  getDriverScope(
    driverId: string,
  ): Promise<{
    id: string;
  } | undefined>;
  getEncryptedDriver(
    driverId: string,
  ): Promise<{ id: string; ssnOrEinEncrypted: string | null } | undefined>;
  recordAudit(entry: {
    eventType: typeof DRIVER_FULL_SSN_AUDIT_EVENT;
    actorUserId: string;
    actorUserEmail: string | null;
    targetEntityType: "driver";
    targetEntityId: string;
    targetEntityLabel: string;
    metadata: ReturnType<typeof buildDriverSsnViewAuditMetadata>;
    ipAddress?: string;
  }): Promise<void>;
}

function getRequestUserId(req: any): string | undefined {
  return req.user?.claims?.sub || req.session?.userId;
}

export function createDriverSsnRevealHandler(
  dependencies: DriverSsnRevealDependencies,
): RequestHandler {
  return async (req: any, res) => {
    try {
      const userId = getRequestUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await dependencies.getUser(userId);
      if (!hasCorporateAccess(user?.role)) {
        console.warn("[Driver SSN Reveal] Authorization denied", {
          reason: "corporate_access_required",
          actorUserId: userId,
          driverId: req.params.id,
        });
        return res.status(403).json({ message: "Forbidden: Corporate access only" });
      }

      if (!hasExplicitFullDriverSsnAccess(user)) {
        console.warn("[Driver SSN Reveal] Authorization denied", {
          reason: "active_explicit_full_ssn_permission_required",
          actorUserId: userId,
          driverId: req.params.id,
        });
        return res.status(403).json({ message: "Forbidden: Drivers — View Full SSN permission required" });
      }

      const driverScope = await dependencies.getDriverScope(req.params.id, userId);
      if (!driverScope) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const driver = await dependencies.getEncryptedDriver(driverScope.id);
      if (!driver?.ssnOrEinEncrypted) {
        return res.status(404).json({ message: "No SSN/EIN is recorded for this driver" });
      }

      try {
        await dependencies.recordAudit({
          eventType: DRIVER_FULL_SSN_AUDIT_EVENT,
          actorUserId: userId,
          actorUserEmail: user.email ?? null,
          targetEntityType: "driver",
          targetEntityId: driver.id,
          targetEntityLabel: `Driver ${driver.id}`,
          metadata: buildDriverSsnViewAuditMetadata(),
          ipAddress: req.ip,
        });
      } catch (auditError) {
        console.error("[Driver SSN Reveal] Audit write failed; refusing reveal:", auditError);
        return res.status(503).json({ message: "Unable to record SSN/EIN access. Please try again." });
      }

      try {
        const decryptedValue = decryptSsnOrEin(driver.ssnOrEinEncrypted);
        return res.json({ value: decryptedValue });
      } catch (decryptError) {
        console.error("[Driver SSN Reveal] Decryption failed; refusing to return stored value:", decryptError);
        return res.status(500).json({ message: "Unable to securely read SSN/EIN" });
      }
    } catch (error) {
      console.error("[Driver SSN Reveal] Error:", error);
      return res.status(500).json({ message: "Failed to reveal SSN/EIN" });
    }
  };
}