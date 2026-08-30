import { db } from '../db';
import { 
  recruitingNotes, 
  recruitingAuditEvents,
  users,
  notifications,
  InsertRecruitingNote,
  UpdateRecruitingNote,
  RecruitingNote,
  RecruitingNoteEntityType,
  RecruitingNoteVisibility,
  recruitingNoteEntityTypes,
  recruitingNoteVisibilityTypes
} from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

const EDIT_WINDOW_MINUTES = 5;

interface NoteWithAuthor extends RecruitingNote {
  author?: {
    id: string;
    email: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}

interface CreateNoteInput {
  entityType: RecruitingNoteEntityType;
  entityId: string;
  body: string;
  visibility?: RecruitingNoteVisibility;
  mentionedUserIds?: string[];
}

interface UpdateNoteInput {
  body?: string;
  visibility?: RecruitingNoteVisibility;
  mentionedUserIds?: string[];
}

const VISIBILITY_ROLE_MAP: Record<RecruitingNoteVisibility, string[]> = {
  'recruiter-only': ['recruiter', 'recruiting_admin', 'admin', 'super_user'],
  'hiring-team': ['recruiter', 'recruiting_admin', 'hiring_manager', 'admin', 'super_user'],
  'admin-only': ['admin', 'super_user', 'recruiting_admin'],
};

function canViewVisibility(visibility: string, userRole: string): boolean {
  const allowedRoles = VISIBILITY_ROLE_MAP[visibility as RecruitingNoteVisibility];
  if (!allowedRoles) return false;
  return allowedRoles.includes(userRole);
}

export class RecruitingNotesService {
  
  async createNote(
    input: CreateNoteInput,
    userId: string,
    userEmail: string,
    userName?: string
  ): Promise<RecruitingNote> {
    if (!recruitingNoteEntityTypes.includes(input.entityType)) {
      throw new Error(`Invalid entity type: ${input.entityType}`);
    }

    const mentionedIds = input.mentionedUserIds || [];
    const parsedMentions = this.extractMentionsFromBody(input.body);
    const allMentions = Array.from(new Set([...mentionedIds, ...parsedMentions]));

    const noteVisibility = input.visibility || 'recruiter-only';
    if (!recruitingNoteVisibilityTypes.includes(noteVisibility as any)) {
      throw new Error(`Invalid visibility: ${noteVisibility}. Must be one of: ${recruitingNoteVisibilityTypes.join(', ')}`);
    }

    const [note] = await db.insert(recruitingNotes).values({
      entityType: input.entityType,
      entityId: input.entityId,
      authorId: userId,
      authorEmail: userEmail,
      authorName: userName,
      body: input.body,
      visibility: noteVisibility,
      mentionedUserIds: allMentions,
    }).returning();

    await this.logAuditEvent({
      actionType: 'note_created',
      entityType: input.entityType,
      entityId: input.entityId,
      userId,
      userEmail,
      newValue: JSON.stringify({
        noteId: note.id,
        body: note.body,
        visibility: noteVisibility,
        mentionedUserIds: allMentions,
      }),
    });

    if (allMentions.length > 0) {
      await this.sendMentionNotifications(note.id, allMentions, userId, userEmail);
    }

    return note;
  }

  async updateNote(
    noteId: string,
    input: UpdateNoteInput,
    userId: string,
    userEmail: string
  ): Promise<RecruitingNote> {
    const existingNote = await this.getNoteById(noteId);
    if (!existingNote) {
      throw new Error('Note not found');
    }

    if (existingNote.isDeleted) {
      throw new Error('Cannot update a deleted note');
    }

    const createdAt = existingNote.createdAt ? new Date(existingNote.createdAt) : new Date();
    const minutesSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60);
    if (minutesSinceCreation > EDIT_WINDOW_MINUTES) {
      throw new Error(`Notes can only be edited within ${EDIT_WINDOW_MINUTES} minutes of creation`);
    }

    const updateData: any = {
      updatedAt: new Date(),
      isEdited: true,
      editedAt: new Date(),
      editedBy: userId,
    };

    const changedFields: string[] = [];

    if (input.visibility !== undefined && input.visibility !== existingNote.visibility) {
      if (!recruitingNoteVisibilityTypes.includes(input.visibility as any)) {
        throw new Error(`Invalid visibility: ${input.visibility}. Must be one of: ${recruitingNoteVisibilityTypes.join(', ')}`);
      }
      updateData.visibility = input.visibility;
      changedFields.push('visibility');
    }

    if (input.body !== undefined) {
      if (!existingNote.isEdited) {
        updateData.originalBody = existingNote.body;
      }
      updateData.body = input.body;
      changedFields.push('body');

      const newMentions = this.extractMentionsFromBody(input.body);
      const combinedMentions = input.mentionedUserIds 
        ? Array.from(new Set([...input.mentionedUserIds, ...newMentions]))
        : newMentions;
      updateData.mentionedUserIds = combinedMentions;

      const previousMentions = existingNote.mentionedUserIds || [];
      const addedMentions = combinedMentions.filter(id => !previousMentions.includes(id));
      if (addedMentions.length > 0) {
        await this.sendMentionNotifications(noteId, addedMentions, userId, userEmail);
      }
    }

    const [updatedNote] = await db.update(recruitingNotes)
      .set(updateData)
      .where(eq(recruitingNotes.id, noteId))
      .returning();

    await this.logAuditEvent({
      actionType: changedFields.includes('visibility') ? 'note_visibility_changed' : 'note_updated',
      entityType: existingNote.entityType,
      entityId: existingNote.entityId,
      userId,
      userEmail,
      previousValue: JSON.stringify({
        noteId: existingNote.id,
        body: existingNote.body,
        visibility: existingNote.visibility,
      }),
      newValue: JSON.stringify({
        noteId: updatedNote.id,
        body: updatedNote.body,
        visibility: updatedNote.visibility,
      }),
      changedFields,
    });

    return updatedNote;
  }

  async deleteNote(
    noteId: string,
    userId: string,
    userEmail: string
  ): Promise<void> {
    const existingNote = await this.getNoteById(noteId);
    if (!existingNote) {
      throw new Error('Note not found');
    }

    await db.update(recruitingNotes)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(recruitingNotes.id, noteId));

    await this.logAuditEvent({
      actionType: 'note_deleted',
      entityType: existingNote.entityType,
      entityId: existingNote.entityId,
      userId,
      userEmail,
      previousValue: JSON.stringify({
        noteId: existingNote.id,
        body: existingNote.body,
      }),
    });
  }

  async getNoteById(noteId: string): Promise<RecruitingNote | null> {
    const [note] = await db.select()
      .from(recruitingNotes)
      .where(eq(recruitingNotes.id, noteId))
      .limit(1);
    return note || null;
  }

  async getNotesByEntity(
    entityType: RecruitingNoteEntityType,
    entityId: string,
    userRole: string,
    includeDeleted: boolean = false
  ): Promise<NoteWithAuthor[]> {
    let query = db.select({
      note: recruitingNotes,
      author: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      }
    })
    .from(recruitingNotes)
    .leftJoin(users, eq(recruitingNotes.authorId, users.id))
    .where(
      and(
        eq(recruitingNotes.entityType, entityType),
        eq(recruitingNotes.entityId, entityId),
        includeDeleted ? undefined : eq(recruitingNotes.isDeleted, false)
      )
    )
    .orderBy(desc(recruitingNotes.createdAt));

    const results = await query;

    return results
      .filter(r => canViewVisibility(r.note.visibility, userRole))
      .map(r => ({
        ...r.note,
        author: r.author || undefined,
      }));
  }

  async getNotesByAuthor(
    authorId: string,
    limit: number = 50
  ): Promise<RecruitingNote[]> {
    return db.select()
      .from(recruitingNotes)
      .where(
        and(
          eq(recruitingNotes.authorId, authorId),
          eq(recruitingNotes.isDeleted, false)
        )
      )
      .orderBy(desc(recruitingNotes.createdAt))
      .limit(limit);
  }

  async searchUsers(query: string, limit: number = 10): Promise<Array<{
    id: string;
    email: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }>> {
    if (!query || query.length < 2) return [];

    const searchPattern = `%${query.toLowerCase()}%`;
    
    const results = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(
      sql`(
        lower(${users.email}) LIKE ${searchPattern}
        OR lower(${users.firstName}) LIKE ${searchPattern}
        OR lower(${users.lastName}) LIKE ${searchPattern}
        OR lower(concat(${users.firstName}, ' ', ${users.lastName})) LIKE ${searchPattern}
      )`
    )
    .limit(limit);

    return results;
  }

  private extractMentionsFromBody(body: string): string[] {
    const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionPattern.exec(body)) !== null) {
      mentions.push(match[2]);
    }
    
    return Array.from(new Set(mentions));
  }

  private async sendMentionNotifications(
    noteId: string,
    mentionedUserIds: string[],
    authorId: string,
    authorEmail: string
  ): Promise<void> {
    try {
      const note = await this.getNoteById(noteId);
      if (!note) return;

      const mentionedUsers = mentionedUserIds.filter(id => id !== authorId);
      if (mentionedUsers.length === 0) return;

      const entityLabel = note.entityType === 'application' ? 'an application' 
        : note.entityType === 'candidate' ? 'a candidate profile' 
        : 'a requisition';
      const bodyPreview = note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body;

      const notificationValues = mentionedUsers.map(userId => ({
        userId,
        type: 'mention',
        title: `You were mentioned in a note`,
        message: `${authorEmail} mentioned you in a note on ${entityLabel}: "${bodyPreview}"`,
        relatedEntityType: `recruiting_${note.entityType}`,
        relatedEntityId: note.entityId,
      }));

      if (notificationValues.length > 0) {
        await db.insert(notifications).values(notificationValues);
      }

      console.log(`[Notes] Sent ${notificationValues.length} mention notification(s) for note ${noteId}`);
    } catch (error) {
      console.error('[Notes] Failed to send mention notifications:', error);
    }
  }

  private async logAuditEvent(params: {
    actionType: string;
    entityType: string;
    entityId: string;
    userId: string;
    userEmail: string;
    previousValue?: string;
    newValue?: string;
    changedFields?: string[];
    reason?: string;
  }): Promise<void> {
    try {
      await db.insert(recruitingAuditEvents).values({
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
        userEmail: params.userEmail,
        previousValue: params.previousValue,
        newValue: params.newValue,
        changedFields: params.changedFields,
        reason: params.reason,
      });
    } catch (error) {
      console.error('[Notes] Failed to log audit event:', error);
    }
  }
}

export const recruitingNotesService = new RecruitingNotesService();
