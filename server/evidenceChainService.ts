import { db } from "./db";
import { 
  moveExecutionLedger, 
  moveProofsIndex, 
  moveMedia, 
  moveIncidents, 
  drivers, 
  users,
  trips
} from "@shared/schema";
import { sql, eq, asc } from "drizzle-orm";

export interface EvidenceChainEntry {
  id: string;
  type: "state_change" | "proof" | "media" | "incident" | "ai_finding";
  occurredAt: string;
  eventId: string | null;
  actor: {
    type: "driver" | "system" | "user";
    id: string | null;
    name: string | null;
  };
  title: string;
  description: string;
  details: Record<string, any>;
  mediaUrl?: string;
  sourceOfTruth: string;
}

export interface EvidenceChain {
  moveId: string;
  moveNumber?: string;
  entries: EvidenceChainEntry[];
  totalEntries: number;
  chainStartedAt: string;
  chainEndedAt: string;
  generatedAt: string;
}

function formatEventType(eventType: string): string {
  const typeMap: Record<string, string> = {
    "move.assigned": "Move Assigned",
    "move.started": "Move Started",
    "move.pickup_arrived": "Arrived at Pickup",
    "move.pickup_completed": "Pickup Completed",
    "move.dropoff_arrived": "Arrived at Dropoff",
    "move.dropoff_completed": "Dropoff Completed",
    "move.completed": "Move Completed",
    "move.cancelled": "Move Cancelled",
    "shift.clock_in": "Driver Clocked In",
    "shift.clock_out": "Driver Clocked Out",
    "shift.break_start": "Break Started",
    "shift.break_end": "Break Ended",
    "proof.photo_captured": "Photo Captured",
    "proof.signature_captured": "Signature Captured",
    "incident.reported": "Incident Reported",
    "location.updated": "Location Updated",
  };
  return typeMap[eventType] || eventType.replace(/[._]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function getActorType(driverId: string | null, payload: any): "driver" | "system" | "user" {
  if (driverId) return "driver";
  if (payload?.userId) return "user";
  return "system";
}

export async function getEvidenceChain(moveId: string): Promise<EvidenceChain> {
  const entries: EvidenceChainEntry[] = [];

  const tripInfo = await db
    .select({ moveNumber: trips.moveNumber })
    .from(trips)
    .where(eq(trips.id, moveId))
    .limit(1);

  const ledgerEntries = await db
    .select({
      id: moveExecutionLedger.id,
      eventType: moveExecutionLedger.eventType,
      occurredAt: moveExecutionLedger.occurredAt,
      eventId: moveExecutionLedger.eventId,
      driverId: moveExecutionLedger.driverId,
      payloadJson: moveExecutionLedger.payloadJson,
    })
    .from(moveExecutionLedger)
    .where(eq(moveExecutionLedger.moveId, moveId))
    .orderBy(asc(moveExecutionLedger.occurredAt));

  for (const entry of ledgerEntries) {
    const payload = entry.payloadJson as Record<string, any> || {};
    let driverName: string | null = null;
    
    if (entry.driverId) {
      const driverInfo = await db
        .select({ 
          firstName: users.firstName, 
          lastName: users.lastName 
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.userId, users.id))
        .where(eq(drivers.id, entry.driverId))
        .limit(1);
      if (driverInfo[0]) {
        driverName = `${driverInfo[0].firstName} ${driverInfo[0].lastName}`;
      }
    }

    entries.push({
      id: `ledger-${entry.id}`,
      type: "state_change",
      occurredAt: entry.occurredAt?.toISOString() || new Date().toISOString(),
      eventId: entry.eventId,
      actor: {
        type: getActorType(entry.driverId, payload),
        id: entry.driverId || payload?.userId || null,
        name: driverName || payload?.userName || "System",
      },
      title: formatEventType(entry.eventType),
      description: payload?.description || `Event: ${entry.eventType}`,
      details: {
        eventType: entry.eventType,
        ...payload,
      },
      sourceOfTruth: "Move Execution Ledger",
    });
  }

  const proofEntries = await db
    .select({
      id: moveProofsIndex.id,
      proofType: moveProofsIndex.proofType,
      mediaRef: moveProofsIndex.mediaRef,
      occurredAt: moveProofsIndex.occurredAt,
      eventId: moveProofsIndex.eventId,
      driverId: moveProofsIndex.driverId,
      geoLat: moveProofsIndex.geoLat,
      geoLng: moveProofsIndex.geoLng,
    })
    .from(moveProofsIndex)
    .where(eq(moveProofsIndex.moveId, moveId))
    .orderBy(asc(moveProofsIndex.occurredAt));

  for (const proof of proofEntries) {
    let driverName: string | null = null;
    
    if (proof.driverId) {
      const driverInfo = await db
        .select({ 
          firstName: users.firstName, 
          lastName: users.lastName 
        })
        .from(drivers)
        .innerJoin(users, eq(drivers.userId, users.id))
        .where(eq(drivers.id, proof.driverId))
        .limit(1);
      if (driverInfo[0]) {
        driverName = `${driverInfo[0].firstName} ${driverInfo[0].lastName}`;
      }
    }

    entries.push({
      id: `proof-${proof.id}`,
      type: "proof",
      occurredAt: proof.occurredAt?.toISOString() || new Date().toISOString(),
      eventId: proof.eventId,
      actor: {
        type: proof.driverId ? "driver" : "system",
        id: proof.driverId || null,
        name: driverName || "System",
      },
      title: `${proof.proofType?.charAt(0).toUpperCase()}${proof.proofType?.slice(1)} Captured`,
      description: `${proof.proofType} evidence recorded`,
      details: {
        proofType: proof.proofType,
        geoLat: proof.geoLat,
        geoLng: proof.geoLng,
      },
      mediaUrl: proof.mediaRef || undefined,
      sourceOfTruth: "Move Proofs Index",
    });
  }

  const mediaEntries = await db
    .select({
      id: moveMedia.id,
      stage: moveMedia.stage,
      category: moveMedia.category,
      fileUrl: moveMedia.fileUrl,
      capturedAt: moveMedia.capturedAt,
      capturedByUserId: moveMedia.capturedByUserId,
      qualityScore: moveMedia.qualityScore,
    })
    .from(moveMedia)
    .where(eq(moveMedia.moveId, moveId))
    .orderBy(asc(moveMedia.capturedAt));

  for (const media of mediaEntries) {
    let userName: string | null = null;
    
    if (media.capturedByUserId) {
      const userInfo = await db
        .select({ 
          firstName: users.firstName, 
          lastName: users.lastName 
        })
        .from(users)
        .where(eq(users.id, media.capturedByUserId))
        .limit(1);
      if (userInfo[0]) {
        userName = `${userInfo[0].firstName} ${userInfo[0].lastName}`;
      }
    }

    entries.push({
      id: `media-${media.id}`,
      type: "media",
      occurredAt: media.capturedAt?.toISOString() || new Date().toISOString(),
      eventId: null,
      actor: {
        type: "user",
        id: media.capturedByUserId,
        name: userName || "Unknown",
      },
      title: `${media.stage?.charAt(0).toUpperCase()}${media.stage?.slice(1)} Photo - ${media.category}`,
      description: `Photo captured during ${media.stage}`,
      details: {
        stage: media.stage,
        category: media.category,
        qualityScore: media.qualityScore,
      },
      mediaUrl: media.fileUrl,
      sourceOfTruth: "Move Media",
    });
  }

  const incidentEntries = await db
    .select({
      id: moveIncidents.id,
      incidentType: moveIncidents.incidentType,
      occurredAt: moveIncidents.occurredAt,
      description: moveIncidents.description,
      severity: moveIncidents.severity,
      reportedByUserId: moveIncidents.reportedByUserId,
      reportedByName: moveIncidents.reportedByName,
      accidentId: moveIncidents.accidentId,
    })
    .from(moveIncidents)
    .where(eq(moveIncidents.moveId, moveId))
    .orderBy(asc(moveIncidents.occurredAt));

  for (const incident of incidentEntries) {
    entries.push({
      id: `incident-${incident.id}`,
      type: "incident",
      occurredAt: incident.occurredAt?.toISOString() || new Date().toISOString(),
      eventId: null,
      actor: {
        type: "user",
        id: incident.reportedByUserId,
        name: incident.reportedByName || "Unknown",
      },
      title: `Incident: ${incident.incidentType}`,
      description: incident.description || "Incident reported",
      details: {
        incidentType: incident.incidentType,
        severity: incident.severity,
        linkedClaimId: incident.accidentId,
      },
      sourceOfTruth: "Move Incidents",
    });
  }

  entries.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const chainStartedAt = entries.length > 0 ? entries[0].occurredAt : new Date().toISOString();
  const chainEndedAt = entries.length > 0 ? entries[entries.length - 1].occurredAt : new Date().toISOString();

  return {
    moveId,
    moveNumber: tripInfo[0]?.moveNumber || undefined,
    entries,
    totalEntries: entries.length,
    chainStartedAt,
    chainEndedAt,
    generatedAt: new Date().toISOString(),
  };
}

export async function getEvidenceChainForClaim(claimId: string): Promise<EvidenceChain | null> {
  const claimMoveResult = await db.execute(sql`
    SELECT move_id FROM accidents WHERE id = ${claimId} AND move_id IS NOT NULL
  `);

  if (!claimMoveResult.rows.length || !claimMoveResult.rows[0].move_id) {
    return null;
  }

  return getEvidenceChain(claimMoveResult.rows[0].move_id as string);
}
