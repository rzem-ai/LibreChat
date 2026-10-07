import { logger, ResourceCapabilityMap } from '@librechat/data-schemas';
import {
  PermissionBits,
  Permissions,
  PermissionTypes,
  ResourceType,
} from 'librechat-data-provider';
import type { IAgent, IMongoFile, IRole, IUser, SystemCapability } from '@librechat/data-schemas';
import type { FilterQuery, Types } from 'mongoose';
import type { Request, Response } from 'express';
import type { AgentResourceDeletionDeps, FileDeletionOutcome } from '../files/deletion';
import type { AgentManagementProjectionSource } from './management';
import { agentManagementDeleteResponseSchema, mapAgentManagementError } from './management';
import { collectToolResourceFileIds, TOOL_RESOURCE_KEYS } from './orphans';
import { checkAccessWithRequestCache } from '../middleware/access';
import { deleteAgentResourceFiles } from '../files/deletion';

type AgentManagementRecord = AgentManagementProjectionSource & { _id: Types.ObjectId };

export interface AgentManagementDeleteDeps
  extends Pick<
    CascadeDeleteAgentDeps,
    | 'getFiles'
    | 'getFileIdsAttachedToLiveConversations'
    | 'getSharedResourceFileIds'
    | 'removeAgentResourceFiles'
    | 'deleteFileByFilter'
  > {
  getRoleByName: (roleName: string, fieldsToSelect?: string | string[]) => Promise<IRole | null>;
  getAgentWithVersionCount: (search: {
    id: string;
    tenantId: string;
  }) => Promise<AgentManagementRecord | null>;
  checkPermission: (params: {
    userId: string;
    role?: string;
    resourceType: ResourceType;
    resourceId: Types.ObjectId;
    requiredPermission: PermissionBits;
  }) => Promise<boolean>;
  hasCapability: (user: IUser, capability: SystemCapability) => Promise<boolean>;
  getAgent: (search: { id: string; tenantId: string }) => Promise<IAgent | null>;
  deleteFiles: (req: Request, files: IMongoFile[]) => Promise<FileDeletionOutcome>;
  deleteAvatarBlob: (req: Request, avatar: { filepath: string; source: string }) => Promise<void>;
  deleteAgent: (search: { id: string; tenantId: string }) => Promise<IAgent | null>;
}

function sendError(res: Response, code: Parameters<typeof mapAgentManagementError>[0]) {
  const mapped = mapAgentManagementError(code);
  return res.status(mapped.status).json(mapped.body);
}

async function hasManageAgentsCapability(user: IUser, deps: AgentManagementDeleteDeps) {
  const capability = ResourceCapabilityMap[ResourceType.AGENT];
  try {
    return capability != null && (await deps.hasCapability(user, capability));
  } catch (error) {
    logger.warn(
      `[AgentManagement] Agent capability check failed, denying bypass: ${(error as Error).message}`,
    );
    return false;
  }
}

/** Authorize a tenant-scoped deletion, then reuse the Agent model's existing cleanup path. */
export function createAgentManagementDeleteHandler(
  deps: AgentManagementDeleteDeps,
): (req: Request, res: Response) => Promise<Response> {
  return async function deleteAgent(req: Request, res: Response): Promise<Response> {
    try {
      const user = req.user as IUser | undefined;
      if (!user?.id || !user.tenantId) {
        return sendError(res, 'permission_denied');
      }

      const canDelete = await checkAccessWithRequestCache({
        req,
        user,
        permissionType: PermissionTypes.AGENTS,
        permissions: [Permissions.USE, Permissions.CREATE],
        getRoleByName: deps.getRoleByName,
      });
      if (!canDelete) {
        return sendError(res, 'permission_denied');
      }

      const agent = await deps.getAgentWithVersionCount({
        id: req.params.id,
        tenantId: user.tenantId,
      });
      if (!agent) {
        return sendError(res, 'not_found');
      }

      const canManageAll = await hasManageAgentsCapability(user, deps);
      if (
        !canManageAll &&
        !(await deps.checkPermission({
          userId: user.id,
          role: user.role,
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          requiredPermission: PermissionBits.DELETE,
        }))
      ) {
        return sendError(res, 'permission_denied');
      }

      const tenantId = user.tenantId;
      const deleted = await cascadeDeleteAgent(req.params.id, {
        getAgent: () => deps.getAgent({ id: req.params.id, tenantId }),
        getFiles: deps.getFiles,
        getFileIdsAttachedToLiveConversations: deps.getFileIdsAttachedToLiveConversations,
        getSharedResourceFileIds: deps.getSharedResourceFileIds,
        removeAgentResourceFiles: deps.removeAgentResourceFiles,
        deleteFiles: (files) => deps.deleteFiles(req, files),
        deleteAvatarBlob: (avatar) => deps.deleteAvatarBlob(req, avatar),
        deleteFileByFilter: deps.deleteFileByFilter,
        deleteAgent: () => deps.deleteAgent({ id: req.params.id, tenantId }),
      });
      if (!deleted) {
        return sendError(res, 'not_found');
      }

      return res.status(200).json(
        agentManagementDeleteResponseSchema.parse({
          id: req.params.id,
          deleted: true,
        }),
      );
    } catch (error) {
      logger.error('[AgentManagement] Error deleting Agent', error);
      return sendError(res, 'internal_error');
    }
  };
}

export interface CascadeDeleteAgentDeps {
  getAgent: (searchParameter: FilterQuery<IAgent>) => Promise<IAgent | null>;
  getFiles: (filter: FilterQuery<IMongoFile>) => Promise<IMongoFile[] | null>;
  getFileIdsAttachedToLiveConversations: (fileIds: string[]) => Promise<Set<string>>;
  getSharedResourceFileIds: AgentResourceDeletionDeps<IMongoFile>['getSharedResourceFileIds'];
  removeAgentResourceFiles: AgentResourceDeletionDeps<IMongoFile>['removeAgentResourceFiles'];
  deleteFiles: AgentResourceDeletionDeps<IMongoFile>['deleteFiles'];
  deleteAvatarBlob: (avatar: { filepath: string; source: string }) => Promise<void>;
  deleteFileByFilter: (filter: { user: string; filepath: string }) => Promise<unknown>;
  deleteAgent: (searchParameter: FilterQuery<IAgent>) => Promise<IAgent | null>;
}

/**
 * Removes an agent's resource files (except any still attached to a live
 * conversation, or still shared with another agent), its avatar blob, and
 * then the agent document itself via the existing `deleteAgent` cleanup
 * (ACL, handoff edges, favorites). Each cleanup step is isolated: a failure
 * in one tool resource or the avatar does not prevent the others from
 * running or the agent document from being removed.
 */
export async function cascadeDeleteAgent(
  agentId: string,
  deps: CascadeDeleteAgentDeps,
): Promise<IAgent | null> {
  const agent = await deps.getAgent({ id: agentId });
  if (!agent) {
    return null;
  }

  const allFileIds = collectToolResourceFileIds(agent.tool_resources);
  if (allFileIds.length > 0) {
    const [liveFileIds, dbFiles] = await Promise.all([
      deps.getFileIdsAttachedToLiveConversations(allFileIds),
      deps.getFiles({ file_id: { $in: allFileIds } }),
    ]);
    const fileById = new Map((dbFiles ?? []).map((file) => [file.file_id, file]));

    for (const toolResource of TOOL_RESOURCE_KEYS) {
      const attachedFileIds = agent.tool_resources?.[toolResource]?.file_ids ?? [];
      const requestedFileIds = attachedFileIds.filter((fileId) => !liveFileIds.has(fileId));
      if (requestedFileIds.length === 0) {
        continue;
      }
      try {
        await deleteAgentResourceFiles(
          {
            agentId: agent.id,
            agentObjectId: String(agent._id),
            toolResource,
            requestedFileIds,
            attachedFileIds,
            files: requestedFileIds
              .map((fileId) => fileById.get(fileId))
              .filter((file): file is IMongoFile => file != null)
              .map((file) => ({ file_id: file.file_id, owner: file.user.toString(), file })),
            userId: String(agent.author),
          },
          {
            getSharedResourceFileIds: deps.getSharedResourceFileIds,
            removeAgentResourceFiles: deps.removeAgentResourceFiles,
            deleteFiles: deps.deleteFiles,
          },
        );
      } catch (error) {
        logger.error(
          `[cascadeDeleteAgent] Error deleting "${toolResource}" files for agent ${agentId}`,
          error,
        );
      }
    }
  }

  if (agent.avatar?.source && agent.avatar.filepath) {
    try {
      await deps.deleteAvatarBlob(agent.avatar);
      await deps.deleteFileByFilter({
        user: String(agent.author),
        filepath: agent.avatar.filepath,
      });
    } catch (error) {
      logger.error(`[cascadeDeleteAgent] Error deleting avatar for agent ${agentId}`, error);
    }
  }

  return deps.deleteAgent({ id: agentId });
}
