import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, MoreHorizontal, Pencil, Trash2, Send, AtSign, Clock, User, Eye, Lock, Users, ShieldCheck } from "lucide-react";

type NoteVisibility = 'recruiter-only' | 'hiring-team' | 'admin-only';

const VISIBILITY_CONFIG: Record<NoteVisibility, { label: string; description: string; icon: typeof Eye; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  'recruiter-only': { label: 'Recruiter Only', description: 'Visible to recruiters and admins', icon: Lock, variant: 'secondary' },
  'hiring-team': { label: 'Hiring Team', description: 'Visible to recruiters, hiring managers, and admins', icon: Users, variant: 'outline' },
  'admin-only': { label: 'Admin Only', description: 'Visible to admins only', icon: ShieldCheck, variant: 'destructive' },
};

type RecruitingNote = {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  authorEmail: string;
  authorName?: string | null;
  body: string;
  visibility: string;
  mentionedUserIds?: string[] | null;
  isEdited: boolean;
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    email: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
};

type EntityType = 'candidate' | 'application' | 'requisition';

interface RecruitingNotesProps {
  entityType: EntityType;
  entityId: string;
  title?: string;
  userRole?: string;
}

interface MentionUser {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'UN';
}

function parseAndRenderBody(body: string): React.ReactNode {
  const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.substring(lastIndex, match.index));
    }
    parts.push(
      <Badge key={match.index} variant="secondary" className="mx-0.5 font-normal">
        @{match[1]}
      </Badge>
    );
    lastIndex = mentionPattern.lastIndex;
  }

  if (lastIndex < body.length) {
    parts.push(body.substring(lastIndex));
  }

  return parts.length > 0 ? parts : body;
}

function getAvailableVisibilityOptions(userRole?: string): NoteVisibility[] {
  const role = userRole || 'recruiter';
  if (role === 'admin' || role === 'super_user' || role === 'recruiting_admin') {
    return ['recruiter-only', 'hiring-team', 'admin-only'];
  }
  if (role === 'hiring_manager') {
    return ['hiring-team'];
  }
  return ['recruiter-only', 'hiring-team'];
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const config = VISIBILITY_CONFIG[visibility as NoteVisibility];
  if (!config) {
    return <Badge variant="outline" className="text-xs">{visibility}</Badge>;
  }
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="text-xs gap-1" data-testid={`badge-visibility-${visibility}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export function RecruitingNotes({ entityType, entityId, title = "Notes", userRole }: RecruitingNotesProps) {
  const { toast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>('recruiter-only');
  const [editingNote, setEditingNote] = useState<RecruitingNote | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editVisibility, setEditVisibility] = useState<NoteVisibility>('recruiter-only');
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<RecruitingNote | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const availableVisibilities = getAvailableVisibilityOptions(userRole);

  const { data: notes = [], isLoading } = useQuery<RecruitingNote[]>({
    queryKey: ['/api/recruiting/notes', entityType, entityId],
  });

  const { data: searchedUsers = [] } = useQuery<MentionUser[]>({
    queryKey: ['/api/recruiting/notes/search-users', mentionSearch],
    enabled: mentionSearch.length >= 2,
  });

  useEffect(() => {
    if (searchedUsers.length > 0) {
      setMentionUsers(searchedUsers);
    }
  }, [searchedUsers]);

  const createNoteMutation = useMutation({
    mutationFn: async ({ body, visibility }: { body: string; visibility: NoteVisibility }) => {
      return apiRequest('POST', '/api/recruiting/notes', {
        entityType,
        entityId,
        body,
        visibility,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/notes', entityType, entityId] });
      setNewNote('');
      setNoteVisibility('recruiter-only');
      toast({ title: "Note added", description: "Your note has been saved." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add note", 
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, body, visibility }: { noteId: string; body: string; visibility?: NoteVisibility }) => {
      return apiRequest('PATCH', `/api/recruiting/notes/${noteId}`, { body, visibility });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/notes', entityType, entityId] });
      setEditingNote(null);
      setEditBody('');
      toast({ title: "Note updated", description: "Your changes have been saved." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update note", 
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest('DELETE', `/api/recruiting/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/notes', entityType, entityId] });
      setDeleteConfirmNote(null);
      toast({ title: "Note deleted", description: "The note has been removed." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete note", 
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    },
  });

  const handleSubmitNote = () => {
    if (!newNote.trim()) return;
    createNoteMutation.mutate({ body: newNote, visibility: noteVisibility });
  };

  const handleStartEdit = (note: RecruitingNote) => {
    setEditingNote(note);
    setEditBody(note.body);
    setEditVisibility((note.visibility as NoteVisibility) || 'recruiter-only');
  };

  const handleSaveEdit = () => {
    if (!editingNote || !editBody.trim()) return;
    updateNoteMutation.mutate({ 
      noteId: editingNote.id, 
      body: editBody, 
      visibility: editVisibility !== editingNote.visibility ? editVisibility : undefined 
    });
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setEditBody('');
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, isEdit = false) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;
    
    if (isEdit) {
      setEditBody(value);
    } else {
      setNewNote(value);
    }
    setCursorPosition(position);

    const textBeforeCursor = value.substring(0, position);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setMentionSearch(atMatch[1]);
      setShowMentionMenu(true);
    } else {
      setShowMentionMenu(false);
      setMentionSearch('');
    }
  };

  const insertMention = (user: MentionUser, isEdit = false) => {
    const currentText = isEdit ? editBody : newNote;
    const textBeforeCursor = currentText.substring(0, cursorPosition);
    const textAfterCursor = currentText.substring(cursorPosition);
    
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const userName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user.email || 'Unknown';
    
    const mentionText = `@[${userName}](${user.id})`;
    const newText = textBeforeCursor.substring(0, atIndex) + mentionText + ' ' + textAfterCursor;
    
    if (isEdit) {
      setEditBody(newText);
    } else {
      setNewNote(newText);
    }
    
    setShowMentionMenu(false);
    setMentionSearch('');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {title}
          <Badge variant="secondary" className="ml-2">{notes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Add a note... Use @ to mention someone"
              value={newNote}
              onChange={(e) => handleTextChange(e)}
              className="min-h-[80px] resize-none"
              data-testid="input-new-note"
            />
            {showMentionMenu && mentionUsers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-w-xs bg-popover border rounded-md shadow-lg p-1">
                {mentionUsers.slice(0, 5).map((user) => (
                  <button
                    key={user.id}
                    className="w-full text-left px-3 py-2 text-sm hover-elevate rounded flex items-center gap-2"
                    onClick={() => insertMention(user)}
                    data-testid={`mention-user-${user.id}`}
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}` 
                        : user.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Select
                value={noteVisibility}
                onValueChange={(v) => setNoteVisibility(v as NoteVisibility)}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-note-visibility">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  {availableVisibilities.map((v) => {
                    const config = VISIBILITY_CONFIG[v];
                    const Icon = config.icon;
                    return (
                      <SelectItem key={v} value={v} data-testid={`select-visibility-${v}`}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AtSign className="h-3 w-3" /> Mention with @
              </span>
              <Button 
                size="sm" 
                onClick={handleSubmitNote}
                disabled={!newNote.trim() || createNoteMutation.isPending}
                data-testid="button-submit-note"
              >
                <Send className="h-4 w-4 mr-1" />
                Add Note
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notes yet</p>
            <p className="text-sm">Be the first to add a note</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Separator />
            {notes.map((note) => (
              <div key={note.id} className="flex gap-3" data-testid={`note-${note.id}`}>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="text-xs">
                    {getInitials(
                      note.author?.firstName && note.author?.lastName 
                        ? `${note.author.firstName} ${note.author.lastName}` 
                        : note.authorName,
                      note.author?.email || note.authorEmail
                    )}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {note.author?.firstName && note.author?.lastName 
                        ? `${note.author.firstName} ${note.author.lastName}` 
                        : note.authorName || note.authorEmail}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(note.createdAt)}
                    </span>
                    {note.isEdited && (
                      <span className="text-xs text-muted-foreground">(edited)</span>
                    )}
                    <VisibilityBadge visibility={note.visibility} />
                  </div>
                  
                  {editingNote?.id === note.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editBody}
                        onChange={(e) => handleTextChange(e, true)}
                        className="min-h-[60px] resize-none"
                        data-testid="input-edit-note"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select
                          value={editVisibility}
                          onValueChange={(v) => setEditVisibility(v as NoteVisibility)}
                        >
                          <SelectTrigger className="w-[180px]" data-testid="select-edit-visibility">
                            <SelectValue placeholder="Visibility" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableVisibilities.map((v) => {
                              const config = VISIBILITY_CONFIG[v];
                              const Icon = config.icon;
                              return (
                                <SelectItem key={v} value={v} data-testid={`select-edit-visibility-${v}`}>
                                  <span className="flex items-center gap-2">
                                    <Icon className="h-3 w-3" />
                                    {config.label}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button 
                          size="sm" 
                          onClick={handleSaveEdit}
                          disabled={!editBody.trim() || updateNoteMutation.isPending}
                          data-testid="button-save-edit"
                        >
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={handleCancelEdit}
                          data-testid="button-cancel-edit"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                      {parseAndRenderBody(note.body)}
                    </p>
                  )}
                </div>

                {editingNote?.id !== note.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-note-menu-${note.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleStartEdit(note)} data-testid={`button-edit-note-${note.id}`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeleteConfirmNote(note)}
                        className="text-destructive"
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!deleteConfirmNote} onOpenChange={() => setDeleteConfirmNote(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Note</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this note? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmNote(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => deleteConfirmNote && deleteNoteMutation.mutate(deleteConfirmNote.id)}
                disabled={deleteNoteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
