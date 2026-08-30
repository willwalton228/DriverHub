/**
 * Employee Onboarding Service
 *
 * Manages the onboarding workflow for driver-employees and standalone employees.
 * For driver-employees, the Driver record is the source of truth for shared fields.
 *
 * Workflow lifecycle:
 *   1. Trigger: Driver classified as Employee → syncEmployeeFromDriver() creates employee
 *   2. seedOnboardingChecklist() called automatically — seeds default items
 *   3. Auto-completes items where data already exists (record created, manager, dept)
 *   4. Status set to 'in_progress'
 *   5. User works through checklist in EmployeeDetail → Onboarding
 *   6. User advances status when ready: 'ready_for_review' → 'completed'
 */

import { db } from "../db";
import { employees, employeeOnboardingItems, driverEmployeeSyncLog } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const ONBOARDING_STATUSES = ["not_started", "in_progress", "ready_for_review", "completed"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  completed: "Completed",
};

interface DefaultChecklistItem {
  category: string;
  label: string;
  description?: string;
  required: boolean;
  isDriverEmployeeItem: boolean;
  sortOrder: number;
}

/** Default checklist template applied to every driver-employee on onboarding start. */
const DRIVER_EMPLOYEE_DEFAULT_CHECKLIST: DefaultChecklistItem[] = [
  {
    category: "identity",
    label: "Employee record created",
    description: "Linked Employee record has been created from the Driver record.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 1,
  },
  {
    category: "hr",
    label: "Manager assigned",
    description: "A direct manager has been assigned to this employee.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 2,
  },
  {
    category: "hr",
    label: "Department / team assigned",
    description: "Employee has been assigned to a department or market team.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 3,
  },
  {
    category: "documentation",
    label: "Employment documents uploaded",
    description: "Offer letter, contract, and any applicable addenda have been uploaded.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 4,
  },
  {
    category: "payroll",
    label: "Tax forms received (W-4, I-9)",
    description: "Federal and state tax withholding forms and identity verification completed.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 5,
  },
  {
    category: "payroll",
    label: "Payroll setup completed",
    description: "Employee added to payroll system with correct pay rate and schedule.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 6,
  },
  {
    category: "payroll",
    label: "Direct deposit completed",
    description: "Banking information collected and direct deposit enrollment confirmed.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 7,
  },
  {
    category: "hr",
    label: "Handbook / policy acknowledgment",
    description: "Employee has read and signed the employee handbook and applicable policies.",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 8,
  },
  {
    category: "hr",
    label: "Benefits enrollment completed or waived",
    description: "Employee has enrolled in or waived benefits (health, dental, vision, 401k).",
    required: true,
    isDriverEmployeeItem: false,
    sortOrder: 9,
  },
  {
    category: "compliance",
    label: "Background check completed",
    description: "Pre-employment background check passed or waived per company policy.",
    required: false,
    isDriverEmployeeItem: false,
    sortOrder: 10,
  },
  {
    category: "compliance",
    label: "Driver compliance items completed",
    description: "MVR, license verification, and driver-specific compliance requirements met.",
    required: true,
    isDriverEmployeeItem: true,
    sortOrder: 11,
  },
];

/**
 * Seed the default onboarding checklist for a newly-linked driver-employee.
 * Auto-completes items where the data already exists on the employee record.
 * Sets onboarding_status = 'in_progress' and onboarding_started_at = now().
 * No-ops if checklist items already exist for this employee.
 */
export async function seedOnboardingChecklist(
  employeeId: string,
  options: { isDriverEmployee?: boolean; triggeredByUserId?: string } = {}
): Promise<void> {
  const { isDriverEmployee = true, triggeredByUserId } = options;

  // Idempotency guard — don't re-seed if items already exist
  const existing = await db
    .select({ id: employeeOnboardingItems.id })
    .from(employeeOnboardingItems)
    .where(eq(employeeOnboardingItems.employeeId, employeeId))
    .limit(1);
  if (existing.length > 0) return;

  // Load employee record to auto-complete applicable items
  const empRows = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  const emp = (empRows[0] as Record<string, any>) ?? {};

  const now = new Date();

  const items = DRIVER_EMPLOYEE_DEFAULT_CHECKLIST.map((template) => {
    let completed = false;
    let autoCompleted = false;
    let completedAt: Date | null = null;

    // Auto-complete items where data is already present
    if (template.label === "Employee record created") {
      completed = true;
      autoCompleted = true;
      completedAt = now;
    } else if (template.label === "Manager assigned" && emp.directManagerId) {
      completed = true;
      autoCompleted = true;
      completedAt = now;
    } else if (template.label === "Department / team assigned" && emp.department) {
      completed = true;
      autoCompleted = true;
      completedAt = now;
    }

    return {
      employeeId,
      category: template.category,
      label: template.label,
      description: template.description ?? null,
      required: template.required,
      isDriverEmployeeItem: template.isDriverEmployeeItem,
      sortOrder: template.sortOrder,
      completed,
      autoCompleted,
      completedAt,
      completedByUserId: autoCompleted ? (triggeredByUserId ?? null) : null,
      notes: null,
      createdAt: now,
    };
  });

  await db.insert(employeeOnboardingItems).values(items as any[]);

  // Set onboarding status to in_progress
  await db
    .update(employees)
    .set({
      onboardingStatus: "in_progress",
      onboardingStartedAt: now,
      updatedAt: now,
    } as any)
    .where(eq(employees.id, employeeId));
}

/**
 * Get onboarding summary for an employee: status + item counts.
 */
export async function getOnboardingSummary(employeeId: string) {
  const empRows = await db
    .select({
      onboardingStatus: employees.onboardingStatus,
      onboardingStartedAt: employees.onboardingStartedAt,
      onboardingCompletedAt: employees.onboardingCompletedAt,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  const emp = empRows[0] ?? {};

  const items = await db
    .select()
    .from(employeeOnboardingItems)
    .where(eq(employeeOnboardingItems.employeeId, employeeId))
    .orderBy(employeeOnboardingItems.sortOrder);

  const total = items.length;
  const completedCount = items.filter((i: any) => i.completed).length;
  const requiredItems = items.filter((i: any) => i.required);
  const requiredCompleted = requiredItems.filter((i: any) => i.completed).length;
  const blockers = requiredItems.filter((i: any) => !i.completed);

  return {
    onboardingStatus: (emp as any).onboardingStatus ?? "not_started",
    onboardingStartedAt: (emp as any).onboardingStartedAt ?? null,
    onboardingCompletedAt: (emp as any).onboardingCompletedAt ?? null,
    total,
    completed: completedCount,
    requiredTotal: requiredItems.length,
    requiredCompleted,
    blockers: blockers.map((b: any) => b.label),
    items,
  };
}

/**
 * Complete a single onboarding item.
 */
export async function completeOnboardingItem(
  employeeId: string,
  itemId: string,
  userId: string,
  notes?: string
): Promise<void> {
  await db
    .update(employeeOnboardingItems)
    .set({
      completed: true,
      completedAt: new Date(),
      completedByUserId: userId,
      autoCompleted: false,
      notes: notes ?? null,
    } as any)
    .where(
      and(
        eq(employeeOnboardingItems.id, itemId),
        eq(employeeOnboardingItems.employeeId, employeeId)
      )
    );
}

/**
 * Uncomplete a single onboarding item (unless auto-completed).
 */
export async function uncompleteOnboardingItem(
  employeeId: string,
  itemId: string
): Promise<void> {
  await db
    .update(employeeOnboardingItems)
    .set({
      completed: false,
      completedAt: null,
      completedByUserId: null,
      autoCompleted: false,
      notes: null,
    } as any)
    .where(
      and(
        eq(employeeOnboardingItems.id, itemId),
        eq(employeeOnboardingItems.employeeId, employeeId),
        eq(employeeOnboardingItems.autoCompleted, false) // can't uncheck auto-completed items
      )
    );
}

/**
 * Update onboarding status on an employee.
 * Automatically sets onboardingCompletedAt when status = 'completed'.
 */
export async function updateOnboardingStatus(
  employeeId: string,
  status: OnboardingStatus
): Promise<void> {
  const patch: Record<string, any> = {
    onboardingStatus: status,
    updatedAt: new Date(),
  };
  if (status === "completed") {
    patch.onboardingCompletedAt = new Date();
  } else {
    patch.onboardingCompletedAt = null;
  }
  await db.update(employees).set(patch as any).where(eq(employees.id, employeeId));
}
