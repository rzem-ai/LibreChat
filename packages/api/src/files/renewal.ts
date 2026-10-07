import type { IMongoFile } from '@librechat/data-schemas';

export interface FileRenewalUser {
  id?: string;
  tenantId?: string;
}

export interface FileRenewalBody {
  file_id?: unknown;
}

/** HTTP-shaped outcome the thin route wrapper serializes verbatim. */
export interface FileRenewalResult {
  status: number;
  body: Record<string, unknown>;
}

export interface FileRenewalDeps {
  /** Owner-scoped usage/TTL recompute (`db.updateFileUsage`-shaped). */
  updateFileUsage: (data: {
    file_id: string;
    inc?: number;
    user?: string;
    tenantId?: string | null;
    fileRetentionHours?: number;
  }) => Promise<IMongoFile | null>;
  /** Configured independent file-retention window; unset means nothing to renew. */
  fileRetentionHours?: number;
}

/**
 * Renews a file's independent retention deadline. Renewal is just an explicit
 * use event, so it reuses the same `updateFileUsage` recompute path with
 * `inc: 0` (no usage-count change), scoped to the owning user/tenant.
 */
export async function handleFileRenewRequest(
  user: FileRenewalUser,
  body: FileRenewalBody,
  deps: FileRenewalDeps,
): Promise<FileRenewalResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const { file_id } = body;
  if (typeof file_id !== 'string' || file_id.length === 0) {
    return { status: 400, body: { code: 'INVALID_FILE_ID' } };
  }
  if (deps.fileRetentionHours == null) {
    return { status: 400, body: { code: 'RENEWAL_NOT_CONFIGURED' } };
  }
  const file = await deps.updateFileUsage({
    file_id,
    inc: 0,
    user: user.id,
    tenantId: user.tenantId,
    fileRetentionHours: deps.fileRetentionHours,
  });
  if (!file) {
    return { status: 404, body: { code: 'FILE_NOT_FOUND' } };
  }
  return { status: 200, body: { file } };
}

export interface FilesExpiringSoonDeps {
  /** Owner-scoped expiring-soon lookup (`db.getFilesExpiringSoon`-shaped). */
  getFilesExpiringSoon: (
    owner: { userId: string; tenantId?: string | null },
    withinMs: number,
    options?: { now?: Date; limit?: number },
  ) => Promise<IMongoFile[]>;
  /** Warning window; always resolved by `getFileRetentionWarningHours` upstream. */
  fileRetentionWarningHours: number;
}

/**
 * Lists the authenticated user's own files expiring within the configured
 * warning window, so the client can render a renewal prompt before the sweep
 * deletes them.
 */
export async function handleFilesExpiringSoonRequest(
  user: FileRenewalUser,
  deps: FilesExpiringSoonDeps,
): Promise<FileRenewalResult> {
  if (!user.id) {
    return { status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  const withinMs = deps.fileRetentionWarningHours * 60 * 60 * 1000;
  const files = await deps.getFilesExpiringSoon(
    { userId: user.id, tenantId: user.tenantId },
    withinMs,
  );
  return { status: 200, body: { files } };
}
