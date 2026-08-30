import { storage } from "../storage";
import type { RecruitingTask, InsertRecruitingTask } from "@shared/schema";

const AUTO_TASK_CONFIGS: Record<string, {
  type: "docs_requested" | "background_pending" | "interview_followup";
  title: string;
  description: string;
  priority: "normal" | "high" | "urgent";
  dueDaysFromNow: number;
}> = {
  background_check: {
    type: "background_pending",
    title: "Background check pending",
    description: "Initiate and track background check for this candidate. Ensure all required documentation has been submitted.",
    priority: "high",
    dueDaysFromNow: 3,
  },
  interview_scheduled: {
    type: "interview_followup",
    title: "Interview follow-up required",
    description: "Follow up with the candidate after the scheduled interview. Collect feedback and determine next steps.",
    priority: "normal",
    dueDaysFromNow: 2,
  },
};

const DOCS_TRIGGER_STAGES = [
  "phone_screen",
  "interview_scheduled",
  "interview_completed",
  "background_check",
];

export async function generateAutoTasksForTransition(
  applicationId: string,
  toStage: string,
  ownerId: string | null,
  createdBy: string,
): Promise<RecruitingTask[]> {
  if (!ownerId) return [];

  const created: RecruitingTask[] = [];

  const config = AUTO_TASK_CONFIGS[toStage];
  if (config) {
    const existing = await storage.getRecruitingTasks({
      entityType: "application",
      entityId: applicationId,
      type: config.type,
      status: "pending",
    });
    const hasInProgress = (await storage.getRecruitingTasks({
      entityType: "application",
      entityId: applicationId,
      type: config.type,
      status: "in_progress",
    })).length > 0;

    if (existing.length === 0 && !hasInProgress) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + config.dueDaysFromNow);

      const task = await storage.createRecruitingTask({
        entityType: "application",
        entityId: applicationId,
        ownerId,
        title: config.title,
        description: config.description,
        dueDate,
        type: config.type,
        priority: config.priority,
        createdBy,
      });
      created.push(task);
    }
  }

  if (DOCS_TRIGGER_STAGES.includes(toStage)) {
    const { db } = await import("../db");
    const { recruitingApplications } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [app] = await db.select().from(recruitingApplications).where(eq(recruitingApplications.id, applicationId));
    if (app && !app.docsComplete) {
      const existing = await storage.getRecruitingTasks({
        entityType: "application",
        entityId: applicationId,
        type: "docs_requested",
        status: "pending",
      });
      const hasInProgress = (await storage.getRecruitingTasks({
        entityType: "application",
        entityId: applicationId,
        type: "docs_requested",
        status: "in_progress",
      })).length > 0;

      if (existing.length === 0 && !hasInProgress) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 5);

        const task = await storage.createRecruitingTask({
          entityType: "application",
          entityId: applicationId,
          ownerId,
          title: "Documents requested from candidate",
          description: "Request and collect required documents from the candidate. Follow up if documents are not received within the due date.",
          dueDate,
          type: "docs_requested",
          priority: "normal",
          createdBy,
        });
        created.push(task);
      }
    }
  }

  return created;
}

export async function completeTask(
  taskId: string,
  userId: string,
): Promise<RecruitingTask | undefined> {
  return storage.updateRecruitingTask(taskId, {
    status: "completed",
    completedAt: new Date(),
    completedBy: userId,
  });
}

export async function cancelTask(
  taskId: string,
  userId: string,
): Promise<RecruitingTask | undefined> {
  return storage.updateRecruitingTask(taskId, {
    status: "cancelled",
    completedAt: new Date(),
    completedBy: userId,
  });
}

export async function createManualTask(
  data: {
    entityType: "candidate" | "application" | "requisition";
    entityId: string;
    ownerId: string;
    title: string;
    description?: string;
    dueDate?: Date;
    priority?: "low" | "normal" | "high" | "urgent";
  },
  createdBy: string,
): Promise<RecruitingTask> {
  return storage.createRecruitingTask({
    entityType: data.entityType,
    entityId: data.entityId,
    ownerId: data.ownerId,
    title: data.title,
    description: data.description || null,
    dueDate: data.dueDate || null,
    type: "manual",
    priority: data.priority || "normal",
    createdBy,
  });
}
