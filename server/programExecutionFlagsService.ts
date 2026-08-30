import { db } from "./db";
import { programExecutionFlags, ProgramExecutionFlags, blockerTypes, customers } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_ALLOWED_BLOCKER_TYPES = [...blockerTypes];

export interface ProgramExecutionFlagsForOpsConsole {
  programId: string | null;
  customerName: string | null;
  flags: {
    allowReassignmentAfterInProgress: boolean;
    strictSlaEnforcement: boolean;
    requirePhotoOnPickup: boolean;
    requirePhotoOnDelivery: boolean;
    requireSignatureOnDelivery: boolean;
    allowPartialCompletion: boolean;
    autoAssignEnabled: boolean;
    allowedBlockerTypes: string[];
    maxBlockerResolutionMinutes: number;
    escalateBlockerAfterMinutes: number;
    gracePeriodMinutes: number;
    maxLateArrivalMinutes: number;
    requireCertifiedDriver: boolean;
    minimumDriverRating: number | null;
  };
  isSystemDefault: boolean;
  lastUpdatedAt: string;
}

const SYSTEM_DEFAULT_FLAGS: Omit<ProgramExecutionFlags, 'id' | 'customerId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
  isSystemDefault: true,
  allowReassignmentAfterInProgress: false,
  strictSlaEnforcement: true,
  requirePhotoOnPickup: false,
  requirePhotoOnDelivery: true,
  requireSignatureOnDelivery: true,
  allowPartialCompletion: false,
  autoAssignEnabled: true,
  allowedBlockerTypes: DEFAULT_ALLOWED_BLOCKER_TYPES,
  maxBlockerResolutionMinutes: 60,
  escalateBlockerAfterMinutes: 30,
  gracePeriodMinutes: 15,
  maxLateArrivalMinutes: 30,
  requireCertifiedDriver: false,
  minimumDriverRating: null,
};

export async function ensureSystemDefaultExists(): Promise<void> {
  const existing = await db.query.programExecutionFlags.findFirst({
    where: eq(programExecutionFlags.isSystemDefault, true),
  });

  if (!existing) {
    await db.insert(programExecutionFlags).values({
      isSystemDefault: true,
      allowReassignmentAfterInProgress: SYSTEM_DEFAULT_FLAGS.allowReassignmentAfterInProgress,
      strictSlaEnforcement: SYSTEM_DEFAULT_FLAGS.strictSlaEnforcement,
      requirePhotoOnPickup: SYSTEM_DEFAULT_FLAGS.requirePhotoOnPickup,
      requirePhotoOnDelivery: SYSTEM_DEFAULT_FLAGS.requirePhotoOnDelivery,
      requireSignatureOnDelivery: SYSTEM_DEFAULT_FLAGS.requireSignatureOnDelivery,
      allowPartialCompletion: SYSTEM_DEFAULT_FLAGS.allowPartialCompletion,
      autoAssignEnabled: SYSTEM_DEFAULT_FLAGS.autoAssignEnabled,
      allowedBlockerTypes: SYSTEM_DEFAULT_FLAGS.allowedBlockerTypes,
      maxBlockerResolutionMinutes: SYSTEM_DEFAULT_FLAGS.maxBlockerResolutionMinutes,
      escalateBlockerAfterMinutes: SYSTEM_DEFAULT_FLAGS.escalateBlockerAfterMinutes,
      gracePeriodMinutes: SYSTEM_DEFAULT_FLAGS.gracePeriodMinutes,
      maxLateArrivalMinutes: SYSTEM_DEFAULT_FLAGS.maxLateArrivalMinutes,
      requireCertifiedDriver: SYSTEM_DEFAULT_FLAGS.requireCertifiedDriver,
      minimumDriverRating: SYSTEM_DEFAULT_FLAGS.minimumDriverRating,
      createdBy: 'system',
      updatedBy: 'system',
    });
    console.log('[ProgramFlags] Created system default execution flags');
  }
}

async function getSystemDefault(): Promise<ProgramExecutionFlags> {
  await ensureSystemDefaultExists();
  
  const systemDefault = await db.query.programExecutionFlags.findFirst({
    where: eq(programExecutionFlags.isSystemDefault, true),
  });

  return systemDefault!;
}

function mapToOpsConsoleFormat(
  flags: ProgramExecutionFlags,
  customerName: string | null = null
): ProgramExecutionFlagsForOpsConsole {
  return {
    programId: flags.customerId,
    customerName,
    flags: {
      allowReassignmentAfterInProgress: flags.allowReassignmentAfterInProgress,
      strictSlaEnforcement: flags.strictSlaEnforcement,
      requirePhotoOnPickup: flags.requirePhotoOnPickup,
      requirePhotoOnDelivery: flags.requirePhotoOnDelivery,
      requireSignatureOnDelivery: flags.requireSignatureOnDelivery,
      allowPartialCompletion: flags.allowPartialCompletion,
      autoAssignEnabled: flags.autoAssignEnabled,
      allowedBlockerTypes: flags.allowedBlockerTypes || DEFAULT_ALLOWED_BLOCKER_TYPES,
      maxBlockerResolutionMinutes: flags.maxBlockerResolutionMinutes || 60,
      escalateBlockerAfterMinutes: flags.escalateBlockerAfterMinutes || 30,
      gracePeriodMinutes: flags.gracePeriodMinutes || 15,
      maxLateArrivalMinutes: flags.maxLateArrivalMinutes || 30,
      requireCertifiedDriver: flags.requireCertifiedDriver,
      minimumDriverRating: flags.minimumDriverRating ? parseFloat(flags.minimumDriverRating) : null,
    },
    isSystemDefault: flags.isSystemDefault,
    lastUpdatedAt: flags.updatedAt.toISOString(),
  };
}

export async function getProgramExecutionFlagsForProgram(
  customerId: string
): Promise<ProgramExecutionFlagsForOpsConsole> {
  const programFlags = await db.query.programExecutionFlags.findFirst({
    where: eq(programExecutionFlags.customerId, customerId),
  });

  if (programFlags) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      columns: { customerName: true },
    });
    return mapToOpsConsoleFormat(programFlags, customer?.customerName || null);
  }

  const systemDefault = await getSystemDefault();
  return mapToOpsConsoleFormat(systemDefault);
}

export async function getAllProgramExecutionFlags(): Promise<{
  systemDefault: ProgramExecutionFlagsForOpsConsole;
  programs: ProgramExecutionFlagsForOpsConsole[];
}> {
  await ensureSystemDefaultExists();

  const allFlags = await db.select()
    .from(programExecutionFlags)
    .orderBy(programExecutionFlags.isSystemDefault);

  const systemDefault = allFlags.find(f => f.isSystemDefault);
  const programFlags = allFlags.filter(f => !f.isSystemDefault);

  const customerIds = programFlags
    .map(f => f.customerId)
    .filter((id): id is string => id !== null);

  let customerNames: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { customers } = await import("@shared/schema");
    const customerRecords = await db.select({ id: customers.id, customerName: customers.customerName })
      .from(customers);
    customerNames = Object.fromEntries(
      customerRecords.map(c => [c.id, c.customerName])
    );
  }

  return {
    systemDefault: mapToOpsConsoleFormat(systemDefault || await getSystemDefault()),
    programs: programFlags.map(f => 
      mapToOpsConsoleFormat(f, f.customerId ? customerNames[f.customerId] || null : null)
    ),
  };
}

export async function getProgramExecutionFlagsForOpsConsole(): Promise<{
  systemDefault: ProgramExecutionFlagsForOpsConsole;
  programs: ProgramExecutionFlagsForOpsConsole[];
  blockerTypesAllowed: readonly string[];
}> {
  const { systemDefault, programs } = await getAllProgramExecutionFlags();
  
  return {
    systemDefault,
    programs,
    blockerTypesAllowed: blockerTypes,
  };
}
