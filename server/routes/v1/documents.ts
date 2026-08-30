/**
 * DriverConnect Integration API v1 — Document & Proof Upload Endpoints
 *
 * POST /api/v1/documents/upload        — Upload a proof document (multipart binary OR URL-register)
 * POST /api/v1/documents/pod           — Shortcut: Proof of Delivery + optional signature
 * GET  /api/v1/documents               — List documents with filters
 * GET  /api/v1/documents/:id           — Retrieve document metadata + signed access URL (15 min TTL)
 * GET  /api/v1/moves/:id/documents     — All documents linked to a move (canonical URL)
 * GET  /api/v1/documents/move/:moveId  — All documents linked to a move (legacy alias)
 *
 * Document Types:
 *   PHOTO, SIGNATURE, DAMAGE_PHOTO, PROOF_OF_DELIVERY, TRIP_ATTACHMENT,
 *   INCIDENT_PHOTO, RECEIPT, ID_VERIFICATION, CARGO_MANIFEST, OTHER
 *
 * Supported MIME types:
 *   image/jpeg, image/png, image/webp, image/heic, image/heif
 *   application/pdf
 *   video/mp4, video/quicktime
 *
 * Size limits:  Images → 25 MB  |  PDF → 20 MB  |  Video → 100 MB
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { db } from '../../db';
import { documents, trips, v1AuditLog, v1IdempotencyKeys } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireScope } from '../../middleware/v1ApiKeyAuth';
import { dispatchWebhook } from '../../services/webhookService';
import { uploadDocument } from '../../services/documentService';
import { signObjectURL, getStorageProvider } from '../../objectStorage';
import { isS3Configured, S3StorageService } from '../../s3Storage';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
export const DOCUMENT_TYPES = [
  'PHOTO',
  'SIGNATURE',
  'DAMAGE_PHOTO',
  'PROOF_OF_DELIVERY',
  'TRIP_ATTACHMENT',
  'INCIDENT_PHOTO',
  'RECEIPT',
  'ID_VERIFICATION',
  'CARGO_MANIFEST',
  'OTHER',
] as const;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
] as const;

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Per-MIME size limits
const SIZE_LIMITS: Record<string, number> = {
  'image/jpeg':        25 * 1024 * 1024,
  'image/png':         25 * 1024 * 1024,
  'image/webp':        25 * 1024 * 1024,
  'image/heic':        25 * 1024 * 1024,
  'image/heif':        25 * 1024 * 1024,
  'application/pdf':   20 * 1024 * 1024,
  'video/mp4':        100 * 1024 * 1024,
  'video/quicktime':  100 * 1024 * 1024,
};
const DEFAULT_MAX_SIZE = 25 * 1024 * 1024;

const VALID_ENTITY_TYPES = ['move', 'driver', 'account', 'exception'] as const;

// ─── Multer (in-memory, 100 MB hard cap; per-MIME limits enforced below) ──────
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ─── Idempotency helpers ──────────────────────────────────────────────────────
async function checkIdempotency(idemKey: string, orgId: string | null) {
  try {
    const [cached] = await db
      .select({ statusCode: v1IdempotencyKeys.statusCode, response: v1IdempotencyKeys.response })
      .from(v1IdempotencyKeys)
      .where(
        orgId
          ? and(eq(v1IdempotencyKeys.key, idemKey), eq(v1IdempotencyKeys.orgId, orgId))
          : eq(v1IdempotencyKeys.key, idemKey)
      )
      .limit(1);
    return cached ?? null;
  } catch {
    return null;
  }
}

async function saveIdempotency(
  idemKey: string | undefined,
  orgId: string | null,
  statusCode: number,
  response: any
) {
  if (!idemKey) return;
  await db
    .insert(v1IdempotencyKeys)
    .values({
      key: idemKey,
      orgId,
      statusCode,
      response,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()
    .catch(() => {});
}

async function auditWrite(
  req: Request,
  action: string,
  resource: string,
  resourceId: string,
  statusCode: number
) {
  await db
    .insert(v1AuditLog)
    .values({
      apiKeyId:       req.v1ApiKey?.apiKeyId,
      keyName:        req.v1ApiKey?.keyName,
      orgId:          req.v1ApiKey?.orgId,
      action,
      resource,
      resourceId,
      requestBody: {
        entity_type:   req.body?.entity_type,
        entity_id:     req.body?.entity_id,
        document_type: req.body?.document_type,
      } as any,
      responseStatus: statusCode,
      ipAddress:
        ((req.headers['x-forwarded-for'] as string) || '').split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
    })
    .catch(() => {});
}

// ─── Signed access URL helper ─────────────────────────────────────────────────
async function buildAccessUrl(
  storageKey: string,
  provider: string
): Promise<string | null> {
  try {
    if (provider === 's3' && isS3Configured()) {
      const s3 = new S3StorageService();
      return await s3.getSignedDownloadUrl(storageKey, 900);
    }
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return null;
    return await signObjectURL({
      bucketName: bucketId,
      objectName: storageKey,
      method:     'GET',
      ttlSec:     900,
    });
  } catch {
    return null;
  }
}

// ─── Entity validation ────────────────────────────────────────────────────────
async function validateEntity(
  entityType: string,
  entityId: string
): Promise<{ valid: boolean; error?: string }> {
  if (entityType === 'move') {
    const [row] = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.id, entityId))
      .limit(1);
    if (!row) return { valid: false, error: `Move ${entityId} not found.` };
  }
  return { valid: true };
}

// ─── Document row formatter ───────────────────────────────────────────────────
// DTO spec (Section 11): documentId, relatedEntityType, relatedEntityId,
// documentType, fileName, mimeType, fileSize, uploadedAt — all camelCase.
// Internal fields (storageProvider) are not exposed to DriverConnect.
function formatDoc(doc: any, accessUrl: string | null) {
  return {
    documentId:         doc.id,
    relatedEntityType:  doc.ownerType,
    relatedEntityId:    doc.ownerId,
    documentType:       doc.category,
    title:              doc.title,
    fileName:           doc.fileName,
    mimeType:           doc.contentType,
    fileSize:           doc.fileSizeBytes,
    status:             doc.status,
    uploadedAt:         doc.uploadedAt,
    tags:               doc.tags,
    accessUrl:          accessUrl,
    accessUrlExpiresAt: accessUrl ? new Date(Date.now() + 900 * 1000).toISOString() : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/documents/upload
//
// Mode A — multipart/form-data with field `file`   → real binary upload to Object Storage
// Mode B — application/json with `file_url`         → URL registration (external storage)
//
// New contract fields (camelCase):  relatedEntityType, relatedEntityId, documentType,
//                                   uploadedByType, uploadedById
// Legacy field aliases (snake_case): entity_type, entity_id, document_type (still accepted)
// Headers:  X-Idempotency-Key (new) | Idempotency-Key (legacy)
// ═══════════════════════════════════════════════════════════════════════════════

// Map new lowercase contract documentType → internal uppercase DB value
const CONTRACT_TO_DB_DOC_TYPE: Record<string, string> = {
  photo:             'PHOTO',
  signature:         'SIGNATURE',
  proof_of_delivery: 'PROOF_OF_DELIVERY',
  damage_photo:      'DAMAGE_PHOTO',
  other:             'OTHER',
};

// Resolve a move by UUID or move number — returns { id, moveNumber } or null
async function resolveRelatedMove(raw: string): Promise<{ id: string; moveNumber: string | null } | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  const [row] = await db
    .select({ id: trips.id, moveNumber: trips.moveNumber })
    .from(trips)
    .where(isUuid ? eq(trips.id, raw) : eq(trips.moveNumber, raw.toUpperCase()))
    .limit(1);
  return row ?? null;
}

router.post(
  '/documents/upload',
  requireScope('write:documents'),
  (req: Request, res: Response, next: NextFunction) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      multerUpload.single('file')(req as any, res as any, next);
    } else {
      next();
    }
  },
  async (req: Request, res: Response) => {
    // Accept new X-Idempotency-Key OR legacy Idempotency-Key
    const idemKey = (req.headers['x-idempotency-key'] as string)
      || (req.headers['idempotency-key'] as string)
      || undefined;
    const orgId   = req.v1ApiKey?.orgId ?? null;

    try {
      if (idemKey) {
        const cached = await checkIdempotency(idemKey, orgId);
        if (cached) return res.status(cached.statusCode).json(cached.response);
      }

      const multerFile  = (req as any).file as Express.Multer.File | undefined;
      const isMultipart = !!multerFile;

      // ── Field resolution: accept new camelCase OR legacy snake_case ─────────
      const rawEntityType  = req.body.relatedEntityType || req.body.entity_type;
      const rawEntityId    = req.body.relatedEntityId   || req.body.entity_id;
      const rawDocType     = req.body.documentType      || req.body.document_type;
      const uploadedByType = req.body.uploadedByType    || null;
      const uploadedById   = req.body.uploadedById      || null;
      const title          = req.body.title as string | undefined;
      const description    = req.body.description as string | undefined;
      let   tags: any      = req.body.tags;
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch { tags = {}; }
      }
      tags = tags || {};

      // Normalise documentType — accept lowercase (contract) or uppercase (legacy)
      const docTypeInput  = String(rawDocType || 'photo').toLowerCase();
      const document_type = (
        CONTRACT_TO_DB_DOC_TYPE[docTypeInput]
        ?? (rawDocType ? String(rawDocType).toUpperCase() : 'PHOTO')
      );

      // ── Required field validation ─────────────────────────────────────────
      if (!rawEntityType || !rawEntityId) {
        return res.status(400).json({
          success: false,
          error: {
            code:    'MISSING_FIELD',
            message: !rawEntityType
              ? '`relatedEntityType` is required.'
              : '`relatedEntityId` is required.',
            validEntityTypes: [...VALID_ENTITY_TYPES],
          },
        });
      }

      const entity_type = String(rawEntityType).toLowerCase();
      if (!(VALID_ENTITY_TYPES as readonly string[]).includes(entity_type)) {
        return res.status(400).json({
          success: false,
          error: {
            code:             'INVALID_ENTITY_TYPE',
            message:          `'${rawEntityType}' is not a valid entity type.`,
            validEntityTypes: [...VALID_ENTITY_TYPES],
          },
        });
      }

      if (!(DOCUMENT_TYPES as readonly string[]).includes(document_type)) {
        return res.status(400).json({
          success: false,
          error: {
            code:              'INVALID_DOCUMENT_TYPE',
            message:           `'${rawDocType}' is not a valid document type.`,
            validDocumentTypes: [...Object.keys(CONTRACT_TO_DB_DOC_TYPE)],
          },
        });
      }

      // ── Resolve entity ID (move accepts UUID or move number) ──────────────
      let entity_id   = String(rawEntityId);
      let externalId: string | null = null;  // move number if applicable
      if (entity_type === 'move') {
        const resolved = await resolveRelatedMove(entity_id);
        if (!resolved) {
          return res.status(422).json({
            success: false,
            error: { code: 'ENTITY_NOT_FOUND', message: `Move '${rawEntityId}' not found.` },
          });
        }
        entity_id  = resolved.id;
        externalId = resolved.moveNumber ?? null;
      } else {
        const entityCheck = await validateEntity(entity_type, entity_id);
        if (!entityCheck.valid) {
          return res.status(422).json({
            success: false,
            error: { code: 'ENTITY_NOT_FOUND', message: entityCheck.error },
          });
        }
      }

      const uploaderMeta = {
        document_type,
        description:          description || null,
        source:               'driverconnect_api',
        uploaded_by_type:     uploadedByType,
        uploaded_by_id:       uploadedById,
        uploaded_by_api_key:  req.v1ApiKey?.apiKeyId,
        uploaded_by_key_name: req.v1ApiKey?.keyName,
      };
      const category = document_type.toLowerCase().replace(/_/g, '-');
      let doc: any;

      // ─── Mode A: Multipart binary upload ─────────────────────────────────
      if (isMultipart) {
        const contentType = multerFile!.mimetype;
        const fileBuffer  = multerFile!.buffer;
        const fileName    = multerFile!.originalname;
        const fileSize    = multerFile!.size;

        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(contentType)) {
          return res.status(415).json({
            error:             'UNSUPPORTED_MEDIA_TYPE',
            message:           `File type "${contentType}" is not supported.`,
            allowed_mime_types: ALLOWED_MIME_TYPES,
          });
        }

        const sizeLimit = SIZE_LIMITS[contentType] ?? DEFAULT_MAX_SIZE;
        if (fileSize > sizeLimit) {
          return res.status(413).json({
            error:          'FILE_TOO_LARGE',
            message:        `${contentType} files are limited to ${(sizeLimit / 1024 / 1024).toFixed(0)} MB. Received ${(fileSize / 1024 / 1024).toFixed(2)} MB.`,
            limit_bytes:    sizeLimit,
            received_bytes: fileSize,
          });
        }

        doc = await uploadDocument({
          ownerType:        entity_type,
          ownerId:          entity_id,
          category,
          title:            title || `${document_type} — ${fileName}`,
          fileName,
          contentType,
          fileSizeBytes:    fileSize,
          fileBuffer,
          uploadedByUserId: null as any, // machine-to-machine; stored in tags
          tenantId:         orgId,
          tags:             { ...tags, ...uploaderMeta },
        });

      // ─── Mode B: JSON / URL registration (external pre-uploaded file) ─────
      } else {
        // Accept camelCase (new contract) or snake_case (legacy)
        const file_url        = req.body.fileUrl        || req.body.file_url;
        const file_name       = req.body.fileName       || req.body.file_name;
        const content_type    = req.body.mimeType       || req.body.content_type;
        const file_size_bytes = req.body.fileSize       || req.body.file_size_bytes;

        if (!file_url || !file_name || !content_type) {
          return res.status(400).json({
            success: false,
            error: {
              code:    'MISSING_FIELD',
              message: 'For URL registration: `fileUrl`, `fileName`, and `mimeType` are required.',
            },
          });
        }

        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(content_type)) {
          return res.status(415).json({
            error:              'UNSUPPORTED_MEDIA_TYPE',
            message:            `mimeType "${content_type}" is not supported.`,
            allowed_mime_types: ALLOWED_MIME_TYPES,
          });
        }

        const [inserted] = await db
          .insert(documents)
          .values({
            ownerType:       entity_type,
            ownerId:         entity_id,
            category,
            title:           title || `${document_type} — ${file_name}`,
            fileName:        file_name,
            contentType:     content_type,
            fileSizeBytes:   file_size_bytes || null,
            storageProvider: 'external',
            storageKey:      file_url,
            status:          'active',
            tags:            { ...tags, ...uploaderMeta },
          })
          .returning();
        doc = inserted;
      }

      // Build access URL
      const accessUrl =
        doc.storageProvider !== 'external'
          ? await buildAccessUrl(doc.storageKey, doc.storageProvider).catch(() => null)
          : doc.storageKey;

      await auditWrite(req, 'UPLOAD', 'document', doc.id, 201);

      // Contract-compliant response — data envelope; meta added by v1ResponseTransform
      const response = {
        success: true,
        data: {
          documentId:        doc.id,
          relatedEntityType: entity_type,
          relatedEntityId:   entity_id,
          externalId:        externalId,         // move number, if applicable
          documentType:      docTypeInput,        // return lowercase contract name
          fileName:          doc.fileName,
          fileSize:          doc.fileSizeBytes,
          mimeType:          doc.contentType,
          uploadedAt:        (doc.uploadedAt ?? doc.createdAt ?? new Date()).toISOString
            ? new Date(doc.uploadedAt ?? doc.createdAt).toISOString()
            : (doc.uploadedAt ?? doc.createdAt),
          uploadedBy: {
            type: uploadedByType ?? 'system',
            id:   uploadedById   ?? req.v1ApiKey?.apiKeyId ?? null,
          },
          // Extended fields (beyond contract minimum — useful for integrators)
          accessUrl,
          accessUrlExpiresAt:
            accessUrl && doc.storageProvider !== 'external'
              ? new Date(Date.now() + 900_000).toISOString()
              : null,
          uploadMode: isMultipart ? 'binary' : 'url_registration',
        },
      };

      await saveIdempotency(idemKey, orgId, 201, response);

      if (orgId) {
        dispatchWebhook(orgId, 'pod.submitted' as any, {
          documentId:        doc.id,
          relatedEntityType: entity_type,
          relatedEntityId:   entity_id,
          documentType:      docTypeInput,
        }).catch(() => {});
      }

      return res.status(201).json(response);
    } catch (err: any) {
      console.error('[v1] POST /documents/upload error:', err);
      if (err.errorCode === 'FILE_TOO_LARGE') {
        return res.status(413).json({ error: 'FILE_TOO_LARGE', message: err.message });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to upload document.' });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/documents/pod
//
// Creates PROOF_OF_DELIVERY + optional SIGNATURE in one request.
// Mode A — multipart/form-data fields: photo_file (required), signature_file (optional)
// Mode B — JSON:  file_url (required), signature_url (optional)
// ═══════════════════════════════════════════════════════════════════════════════
router.post(
  '/documents/pod',
  requireScope('write:documents'),
  (req: Request, res: Response, next: NextFunction) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      multerUpload.fields([
        { name: 'photo_file', maxCount: 1 },
        { name: 'signature_file', maxCount: 1 },
      ])(req as any, res as any, next);
    } else {
      next();
    }
  },
  async (req: Request, res: Response) => {
    const idemKey = req.headers['idempotency-key'] as string | undefined;
    const orgId   = req.v1ApiKey?.orgId ?? null;

    try {
      if (idemKey) {
        const cached = await checkIdempotency(idemKey, orgId);
        if (cached) return res.status(cached.statusCode).json(cached.response);
      }

      const { move_id, file_url, file_name, content_type, file_size_bytes,
              signature_url, recipient_name, delivery_notes } = req.body;

      if (!move_id) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'move_id is required.' });
      }

      // Validate move exists
      const [move] = await db
        .select({ id: trips.id, moveNumber: trips.moveNumber })
        .from(trips)
        .where(eq(trips.id, move_id))
        .limit(1);
      if (!move) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Move ${move_id} not found.` });
      }

      const multerFiles = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const photoFile   = multerFiles?.['photo_file']?.[0];
      const sigFile     = multerFiles?.['signature_file']?.[0];
      const isMultipart = !!photoFile;

      const commonTags = {
        recipient_name:       recipient_name ?? null,
        delivery_notes:       delivery_notes ?? null,
        source:               'driverconnect_api',
        uploaded_by_api_key:  req.v1ApiKey?.apiKeyId,
        uploaded_by_key_name: req.v1ApiKey?.keyName,
      };

      let podDocId: string | null  = null;
      let sigDocId: string | null  = null;
      let docsCreated = 0;

      if (isMultipart) {
        // ── Photo ────────────────────────────────────────────────────────────
        if (!IMAGE_MIME_TYPES.includes(photoFile.mimetype)) {
          return res.status(415).json({
            error:   'UNSUPPORTED_MEDIA_TYPE',
            message: 'photo_file must be an image (jpeg, png, webp, heic).',
          });
        }
        const photoSizeLimit = SIZE_LIMITS[photoFile.mimetype] ?? DEFAULT_MAX_SIZE;
        if (photoFile.size > photoSizeLimit) {
          return res.status(413).json({
            error:   'FILE_TOO_LARGE',
            message: `Photo file exceeds ${(photoSizeLimit / 1024 / 1024).toFixed(0)} MB limit.`,
          });
        }

        const photoDoc = await uploadDocument({
          ownerType:        'move',
          ownerId:          move_id,
          category:         'proof-of-delivery',
          title:            `POD — ${move.moveNumber}`,
          fileName:         photoFile.originalname,
          contentType:      photoFile.mimetype,
          fileSizeBytes:    photoFile.size,
          fileBuffer:       photoFile.buffer,
          uploadedByUserId: null as any,
          tenantId:         orgId,
          tags:             { document_type: 'PROOF_OF_DELIVERY', ...commonTags },
        });
        podDocId = photoDoc.id;
        docsCreated++;

        // ── Signature (optional) ─────────────────────────────────────────────
        if (sigFile) {
          if (!IMAGE_MIME_TYPES.includes(sigFile.mimetype) && sigFile.mimetype !== 'image/svg+xml') {
            return res.status(415).json({
              error:   'UNSUPPORTED_MEDIA_TYPE',
              message: 'signature_file must be an image (jpeg, png, webp, heic, svg).',
            });
          }
          const sigDoc = await uploadDocument({
            ownerType:        'move',
            ownerId:          move_id,
            category:         'signature',
            title:            `Signature — ${move.moveNumber}`,
            fileName:         sigFile.originalname,
            contentType:      sigFile.mimetype,
            fileSizeBytes:    sigFile.size,
            fileBuffer:       sigFile.buffer,
            uploadedByUserId: null as any,
            tenantId:         orgId,
            tags:             { document_type: 'SIGNATURE', ...commonTags },
          });
          sigDocId = sigDoc.id;
          docsCreated++;
        }
      } else {
        // ── JSON / URL registration ───────────────────────────────────────────
        if (!file_url || !file_name) {
          return res.status(400).json({
            error:   'VALIDATION_ERROR',
            message: 'file_url and file_name are required for URL-registration mode.',
          });
        }
        const ct = content_type || 'image/jpeg';
        if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(ct)) {
          return res.status(415).json({
            error:             'UNSUPPORTED_MEDIA_TYPE',
            message:           `content_type "${ct}" is not supported.`,
            allowed_mime_types: ALLOWED_MIME_TYPES,
          });
        }

        const [photoRow] = await db
          .insert(documents)
          .values({
            ownerType:       'move',
            ownerId:         move_id,
            category:        'proof-of-delivery',
            title:           `POD — ${move.moveNumber}`,
            fileName:        file_name,
            contentType:     ct,
            fileSizeBytes:   file_size_bytes ?? null,
            storageProvider: 'external',
            storageKey:      file_url,
            status:          'active',
            tags:            { document_type: 'PROOF_OF_DELIVERY', ...commonTags },
          })
          .returning();
        podDocId = photoRow.id;
        docsCreated++;

        if (signature_url) {
          const [sigRow] = await db
            .insert(documents)
            .values({
              ownerType:       'move',
              ownerId:         move_id,
              category:        'signature',
              title:           `Signature — ${move.moveNumber}`,
              fileName:        `sig_${file_name}`,
              contentType:     'image/png',
              fileSizeBytes:   null,
              storageProvider: 'external',
              storageKey:      signature_url,
              status:          'active',
              tags:            { document_type: 'SIGNATURE', ...commonTags },
            })
            .returning();
          sigDocId = sigRow.id;
          docsCreated++;
        }
      }

      if (orgId) {
        dispatchWebhook(orgId, 'pod.submitted' as any, {
          move_id,
          move_number:           move.moveNumber,
          pod_document_id:       podDocId,
          signature_document_id: sigDocId,
        }).catch(() => {});
      }

      const response = {
        success:               true,
        move_id,
        move_number:           move.moveNumber,
        pod_document_id:       podDocId,
        signature_document_id: sigDocId,
        upload_mode:           isMultipart ? 'binary' : 'url_registration',
        documents_created:     docsCreated,
      };

      await auditWrite(req, 'UPLOAD_POD', 'document', podDocId ?? '', 201);
      await saveIdempotency(idemKey, orgId, 201, response);

      return res.status(201).json(response);
    } catch (err: any) {
      console.error('[v1] POST /documents/pod error:', err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record proof of delivery.' });
    }
  }
);

// ─── GET /api/v1/documents ────────────────────────────────────────────────────
router.get('/documents', requireScope('read:documents'), async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const { entity_type, entity_id, document_type, status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (entity_type)   conditions.push(eq(documents.ownerType, entity_type));
    if (entity_id)     conditions.push(eq(documents.ownerId, entity_id));
    if (document_type) conditions.push(eq(documents.category, document_type.toLowerCase().replace(/_/g, '-')));
    if (status)        conditions.push(eq(documents.status, status));

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db
        .select({
          id:              documents.id,
          ownerType:       documents.ownerType,
          ownerId:         documents.ownerId,
          category:        documents.category,
          title:           documents.title,
          fileName:        documents.fileName,
          contentType:     documents.contentType,
          fileSizeBytes:   documents.fileSizeBytes,
          storageProvider: documents.storageProvider,
          storageKey:      documents.storageKey,
          status:          documents.status,
          tags:            documents.tags,
          uploadedAt:      documents.uploadedAt,
        })
        .from(documents)
        .where(whereClause)
        .orderBy(desc(documents.uploadedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(whereClause),
    ]);

    const total = Number(countRes[0]?.count || 0);
    const data  = rows.map(r =>
      formatDoc(r, r.storageProvider === 'external' ? r.storageKey : null)
    );

    return res.json({
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list documents.' });
  }
});

// ─── GET /api/v1/documents/move/:moveId  (legacy alias) ──────────────────────
// IMPORTANT: Must be registered BEFORE /documents/:id to prevent `:id = "move"` match.
router.get('/documents/move/:moveId', requireScope('read:documents'), async (req: Request, res: Response) => {
  return handleMoveDocuments(req, res, req.params.moveId);
});

// ─── GET /api/v1/moves/:moveId/documents  (canonical) ────────────────────────
router.get('/moves/:moveId/documents', requireScope('read:documents'), async (req: Request, res: Response) => {
  return handleMoveDocuments(req, res, req.params.moveId);
});

// Convert internal DB category (e.g. "proof-of-delivery") → contract documentType (e.g. "proof_of_delivery")
function categoryToContractType(category: string): string {
  return category.replace(/-/g, '_');
}

async function handleMoveDocuments(req: Request, res: Response, rawMoveId: string) {
  try {
    // Resolve by UUID or move number (e.g. MV-000006)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawMoveId);
    const [move] = await db
      .select({ id: trips.id, moveNumber: trips.moveNumber })
      .from(trips)
      .where(isUuid ? eq(trips.id, rawMoveId) : eq(trips.moveNumber, rawMoveId.toUpperCase()))
      .limit(1);

    if (!move) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Move '${rawMoveId}' not found.` },
      });
    }

    // Accept camelCase (new contract) or snake_case (legacy) query params
    const q = req.query as Record<string, string>;
    const rawDocType = q.documentType || q.document_type;
    const status     = q.status;

    const conditions: any[] = [
      eq(documents.ownerType, 'move'),
      eq(documents.ownerId, move.id),
    ];
    // Map contract documentType to internal category format ("proof_of_delivery" → "proof-of-delivery")
    if (rawDocType) {
      conditions.push(eq(documents.category, rawDocType.toLowerCase().replace(/_/g, '-')));
    }
    if (status) conditions.push(eq(documents.status, status));

    const rows = await db
      .select({
        id:          documents.id,
        category:    documents.category,
        fileName:    documents.fileName,
        contentType: documents.contentType,
        uploadedAt:  documents.uploadedAt,
      })
      .from(documents)
      .where(and(...conditions))
      .orderBy(desc(documents.uploadedAt));

    // Contract-compliant compact list items
    const data = rows.map(r => ({
      documentId:   r.id,
      documentType: categoryToContractType(r.category ?? ''),
      fileName:     r.fileName,
      mimeType:     r.contentType,
      uploadedAt:   r.uploadedAt
        ? new Date(r.uploadedAt).toISOString()
        : null,
    }));

    return res.json({
      success: true,
      data,
      meta: {
        moveId:     move.id,
        externalId: move.moveNumber ?? null,
        total:      data.length,
      },
    });
  } catch (err: any) {
    console.error('[v1] GET /moves/:id/documents error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list move documents.' });
  }
}

// ─── GET /api/v1/documents/:id ────────────────────────────────────────────────
// Returns full metadata + a short-lived signed access URL (15-minute TTL).
router.get('/documents/:id', requireScope('read:documents'), async (req: Request, res: Response) => {
  try {
    const [doc] = await db
      .select({
        id:              documents.id,
        ownerType:       documents.ownerType,
        ownerId:         documents.ownerId,
        category:        documents.category,
        title:           documents.title,
        fileName:        documents.fileName,
        contentType:     documents.contentType,
        fileSizeBytes:   documents.fileSizeBytes,
        storageProvider: documents.storageProvider,
        storageKey:      documents.storageKey,
        status:          documents.status,
        tags:            documents.tags,
        uploadedAt:      documents.uploadedAt,
      })
      .from(documents)
      .where(eq(documents.id, req.params.id))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found.' });
    }
    if (doc.status === 'deleted') {
      return res.status(410).json({ error: 'GONE', message: 'Document has been deleted.' });
    }

    const accessUrl =
      doc.storageProvider === 'external'
        ? doc.storageKey
        : await buildAccessUrl(doc.storageKey, doc.storageProvider).catch(() => null);

    await auditWrite(req, 'READ', 'document', doc.id, 200);

    return res.json({ success: true, data: formatDoc(doc, accessUrl) });
  } catch (err: any) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch document.' });
  }
});

export default router;
