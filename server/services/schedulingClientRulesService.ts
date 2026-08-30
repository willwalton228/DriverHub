import { db } from "../db";
import { schedulingClientRules, schedulingShifts, schedulingAssignments, schedulingSchedules, customers, drivers, users } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  customerName: string;
  customerId: string;
  violationType: "max_shift_length" | "driver_eligibility" | "blackout_period";
  severity: "warning";
  shiftId?: string;
  shiftName?: string;
  driverId?: string;
  driverName?: string;
  message: string;
  detail: string;
}

export interface EligibilityRequirement {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "min" | "max";
  value: string;
  label: string;
}

export interface BlackoutPeriod {
  startDate: string;
  endDate: string;
  reason: string;
}

export async function getClientRules(customerId?: string) {
  if (customerId) {
    return db.select().from(schedulingClientRules)
      .where(eq(schedulingClientRules.customerId, customerId));
  }
  return db.select().from(schedulingClientRules);
}

export async function getClientRuleById(id: string) {
  const [rule] = await db.select().from(schedulingClientRules)
    .where(eq(schedulingClientRules.id, id));
  return rule || null;
}

export async function createClientRule(data: {
  customerId: string;
  ruleName: string;
  maxShiftLengthHours?: string | null;
  eligibilityRequirements?: EligibilityRequirement[] | null;
  blackoutPeriods?: BlackoutPeriod[] | null;
  isActive?: boolean;
  notes?: string | null;
  createdBy?: string;
}) {
  const [rule] = await db.insert(schedulingClientRules).values({
    customerId: data.customerId,
    ruleName: data.ruleName,
    maxShiftLengthHours: data.maxShiftLengthHours || null,
    eligibilityRequirements: data.eligibilityRequirements || null,
    blackoutPeriods: data.blackoutPeriods || null,
    isActive: data.isActive ?? true,
    notes: data.notes || null,
    createdBy: data.createdBy || null,
  }).returning();
  return rule;
}

export async function updateClientRule(id: string, data: {
  ruleName?: string;
  maxShiftLengthHours?: string | null;
  eligibilityRequirements?: EligibilityRequirement[] | null;
  blackoutPeriods?: BlackoutPeriod[] | null;
  isActive?: boolean;
  notes?: string | null;
  updatedBy?: string;
}) {
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.ruleName !== undefined) updateData.ruleName = data.ruleName;
  if (data.maxShiftLengthHours !== undefined) updateData.maxShiftLengthHours = data.maxShiftLengthHours;
  if (data.eligibilityRequirements !== undefined) updateData.eligibilityRequirements = data.eligibilityRequirements;
  if (data.blackoutPeriods !== undefined) updateData.blackoutPeriods = data.blackoutPeriods;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.updatedBy !== undefined) updateData.updatedBy = data.updatedBy;

  const [rule] = await db.update(schedulingClientRules)
    .set(updateData)
    .where(eq(schedulingClientRules.id, id))
    .returning();
  return rule;
}

export async function deleteClientRule(id: string) {
  await db.delete(schedulingClientRules).where(eq(schedulingClientRules.id, id));
}

export async function evaluateRulesForSchedule(scheduleId: string): Promise<RuleViolation[]> {
  const violations: RuleViolation[] = [];

  const [schedule] = await db.select().from(schedulingSchedules)
    .where(eq(schedulingSchedules.id, scheduleId));
  if (!schedule) return violations;

  const shifts = await db.select().from(schedulingShifts)
    .where(eq(schedulingShifts.scheduleId, scheduleId));
  if (shifts.length === 0) return violations;

  const shiftIds = shifts.map(s => s.id);
  const assignments = await db.select().from(schedulingAssignments)
    .where(inArray(schedulingAssignments.shiftId, shiftIds));

  const allRules = await db.select().from(schedulingClientRules)
    .where(eq(schedulingClientRules.isActive, true));
  if (allRules.length === 0) return violations;

  const customerIds = Array.from(new Set(allRules.map(r => r.customerId)));
  const customerRows = await db.select().from(customers)
    .where(inArray(customers.id, customerIds));
  const customerMap = new Map(customerRows.map(c => [c.id, c]));

  const driverIds = Array.from(new Set(assignments.filter(a => a.driverId).map(a => a.driverId!)));
  let driverMap = new Map<string, any>();
  if (driverIds.length > 0) {
    const driverRows = await db.select({
      id: drivers.id,
      firstName: users.firstName,
      lastName: users.lastName,
      market: drivers.market,
      driverType: drivers.driverType,
      driverClassification: drivers.driverClassification,
      status: drivers.status,
    }).from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(inArray(drivers.id, driverIds));
    driverMap = new Map(driverRows.map(d => [d.id, d]));
  }

  for (const rule of allRules) {
    const customer = customerMap.get(rule.customerId);
    const customerName = customer?.customerName || "Unknown Client";

    if (rule.maxShiftLengthHours) {
      const maxHours = parseFloat(rule.maxShiftLengthHours);
      for (const shift of shifts) {
        const durationHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
        if (durationHours > maxHours) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.ruleName,
            customerId: rule.customerId,
            customerName,
            violationType: "max_shift_length",
            severity: "warning",
            shiftId: shift.id,
            shiftName: shift.name || "Unnamed Shift",
            message: `Shift exceeds ${maxHours}h max for ${customerName}`,
            detail: `Shift "${shift.name || "Unnamed"}" is ${durationHours.toFixed(1)}h, max allowed is ${maxHours}h`,
          });
        }
      }
    }

    if (rule.blackoutPeriods && Array.isArray(rule.blackoutPeriods)) {
      const periods = rule.blackoutPeriods as BlackoutPeriod[];
      for (const period of periods) {
        const bStart = new Date(period.startDate);
        const bEnd = new Date(period.endDate);
        for (const shift of shifts) {
          const shiftStart = new Date(shift.startTime);
          const shiftEnd = new Date(shift.endTime);
          if (shiftStart <= bEnd && shiftEnd >= bStart) {
            violations.push({
              ruleId: rule.id,
              ruleName: rule.ruleName,
              customerId: rule.customerId,
              customerName,
              violationType: "blackout_period",
              severity: "warning",
              shiftId: shift.id,
              shiftName: shift.name || "Unnamed Shift",
              message: `Shift falls within blackout period for ${customerName}`,
              detail: `"${shift.name || "Unnamed"}" overlaps blackout ${period.startDate} – ${period.endDate} (${period.reason})`,
            });
          }
        }
      }
    }

    if (rule.eligibilityRequirements && Array.isArray(rule.eligibilityRequirements)) {
      const reqs = rule.eligibilityRequirements as EligibilityRequirement[];
      for (const assignment of assignments) {
        if (!assignment.driverId) continue;
        const driver = driverMap.get(assignment.driverId);
        if (!driver) continue;
        for (const req of reqs) {
          const fieldVal = (driver as any)[req.field];
          let violated = false;
          switch (req.operator) {
            case "equals":
              violated = String(fieldVal) !== String(req.value);
              break;
            case "not_equals":
              violated = String(fieldVal) === String(req.value);
              break;
            case "contains":
              violated = !String(fieldVal || "").toLowerCase().includes(String(req.value).toLowerCase());
              break;
            case "min":
              violated = Number(fieldVal || 0) < Number(req.value);
              break;
            case "max":
              violated = Number(fieldVal || 0) > Number(req.value);
              break;
          }
          if (violated) {
            const shift = shifts.find(s => s.id === assignment.shiftId);
            violations.push({
              ruleId: rule.id,
              ruleName: rule.ruleName,
              customerId: rule.customerId,
              customerName,
              violationType: "driver_eligibility",
              severity: "warning",
              shiftId: assignment.shiftId,
              shiftName: shift?.name || "Unnamed Shift",
              driverId: assignment.driverId,
              driverName: `${driver.firstName || ""} ${driver.lastName || ""}`.trim(),
              message: `Driver does not meet ${req.label} requirement for ${customerName}`,
              detail: `${req.label}: expected ${req.operator} "${req.value}", found "${fieldVal ?? "N/A"}"`,
            });
          }
        }
      }
    }
  }

  return violations;
}
