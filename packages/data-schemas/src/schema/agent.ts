import { Schema } from 'mongoose';
import { Constants, SkillsScope } from 'librechat-data-provider';
import type { IAgent } from '~/types';

const agentSchema: Schema<IAgent> = new Schema<IAgent>(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      maxlength: Number(Constants.AGENT_NAME_MAX_LENGTH),
    },
    description: {
      type: String,
    },
    instructions: {
      type: String,
    },
    avatar: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    provider: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    model_parameters: {
      type: Object,
    },
    artifacts: {
      type: String,
    },
    access_level: {
      type: Number,
    },
    recursion_limit: {
      type: Number,
    },
    tools: {
      type: [String],
      default: undefined,
    },
    skills: {
      type: [String],
      default: undefined,
    },
    skills_enabled: {
      type: Boolean,
      default: undefined,
    },
    skill_authoring_enabled: {
      type: Boolean,
      default: undefined,
    },
    skills_scope: {
      type: String,
      enum: Object.values(SkillsScope),
      default: undefined,
    },
    tool_kwargs: {
      type: [{ type: Schema.Types.Mixed }],
    },
    actions: {
      type: [String],
      default: undefined,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authorName: {
      type: String,
      default: undefined,
    },
    hide_sequential_outputs: {
      type: Boolean,
    },
    end_after_tools: {
      type: Boolean,
    },
    stateful_code_sessions: {
      type: Boolean,
    },
    stateful_code_environment: {
      type: String,
      enum: ['user', 'agent-user', 'conversation'],
    },
    code_environment_id: {
      type: String,
    },
    code_workspace_id: { type: String },
    repositoryInstructions: { type: String, enum: ['prefer', 'defer', 'off'] },
    git_identity: {
      type: new Schema(
        {
          name: { type: String, required: true },
          email: { type: String, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
    /** @deprecated Use edges instead */
    agent_ids: {
      type: [String],
    },
    edges: {
      type: [{ type: Schema.Types.Mixed }],
      default: [],
    },
    conversation_starters: {
      type: [String],
      default: [],
    },
    tool_resources: {
      type: Schema.Types.Mixed,
      default: {},
    },
    versions: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    category: {
      type: String,
      trim: true,
      index: true,
      default: 'general',
    },
    support_contact: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    is_promoted: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** MCP server names extracted from tools for efficient querying */
    mcpServerNames: {
      type: [String],
      default: [],
    },
    /** Per-tool configuration (defer_loading, allowed_callers, run_in_background, describe_intent) */
    tool_options: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    /** Subagent spawning configuration — isolated-context child agents. */
    subagents: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    /** Memory partition: 'agent' isolates memories per (user, agent); default shared pool */
    memory_scope: {
      type: String,
      enum: ['user', 'agent'],
      default: undefined,
    },
    tenantId: {
      type: String,
      index: true,
    },
    /** Explicit activity anchor for retention; never inferred from `updatedAt`. */
    lastActivityAt: {
      type: Date,
    },
    expiredAt: {
      type: Date,
    },
    /** Explicit, auditable carve-out from default retention. Only a narrow,
     * permissioned caller should ever set `exempt: true`. */
    retentionException: {
      exempt: { type: Boolean, default: false },
      reason: { type: String },
      setBy: { type: String },
      setAt: { type: Date },
    },
    /** Lease holder for the in-flight purge sweep claiming this agent, so two
     * sweep ticks (or replicas) never cascade-delete the same expired agent twice. */
    purgeClaimId: {
      type: String,
    },
    purgeClaimedAt: {
      type: Date,
    },
    purgeAttempts: {
      type: Number,
      default: 0,
    },
    /** Earliest time a sweep tick may claim this agent again, set on release to
     * back off a failed attempt or to let an expired lease be reclaimed. */
    purgeNotBefore: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

agentSchema.index({ id: 1, tenantId: 1 }, { unique: true });
agentSchema.index({ mcpServerNames: 1, tenantId: 1 });
agentSchema.index({ updatedAt: -1, _id: 1 });
agentSchema.index({ tenantId: 1, updatedAt: -1, _id: 1 });
agentSchema.index({ 'edges.to': 1 });
/** Deletion is app-owned by the purge sweep worker, not MongoDB's TTL monitor: a native
 * TTL index deletes directly and bypasses the cascade (resource files, avatar) that only
 * the sweep's `cascadeDeleteAgent` call runs. */
agentSchema.index({ expiredAt: 1, purgeNotBefore: 1 });

export default agentSchema;
