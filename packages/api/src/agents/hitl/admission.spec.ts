import type { PluginHookSource } from '~/agents/hooks/source';
import type { ToolApprovalAdmissionAgent } from './admission';
import type { ToolApprovalHook } from './hooks';
import { agentRunUsesCheckpointer, canAgentGraphPause } from './admission';

const askHook: ToolApprovalHook = async () => ({ decision: 'ask' });

function pluginSource(
  hasToolApprovalHooks: PluginHookSource['hasToolApprovalHooks'],
): PluginHookSource {
  return {
    hasHooks: () => true,
    hasToolApprovalHooks,
    register: () => 0,
  };
}

describe('canAgentGraphPause', () => {
  test.each([
    ['configured tool names', { tools: ['read_file'] }, 'read_file'],
    ['loaded tool objects', { tools: [{ name: 'read_file' }] }, 'read_file'],
    ['tool definitions', { toolDefinitions: [{ name: 'read_file' }] }, 'read_file'],
    ['tool registries', { toolRegistry: new Map([['read_file', {}]]) }, 'read_file'],
  ])('discovers %s', (_label, agent, toolName) => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: [toolName] },
        agents: [agent],
      }),
    ).toBe(true);
  });

  test.each([
    ['initialized children', { subagentAgentConfigs: [{ tools: ['write_file'] }] }],
    ['lazy children', { lazySubagentConfigs: [{ tools: ['write_file'] }] }],
    ['graph members', { subagentGraphConfigs: [{ memberConfigs: [{ tools: ['write_file'] }] }] }],
    ['graph member metadata', { subagentGraphMemberMetadata: [{ tools: ['write_file'] }] }],
  ])('intersects approval policy with %s', (_label, agent) => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['write_*'] },
        agents: [agent],
      }),
    ).toBe(true);
  });

  test('keeps the durable approval path for an unresolved lazy tool surface', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['write_*'] },
        agents: [{ lazySubagentConfigs: [{}] }],
      }),
    ).toBe(true);
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass' },
        agents: [{ lazySubagentConfigs: [{}] }],
      }),
    ).toBe(true);
  });

  test('does not enable the durable approval path when a lazy tool surface is denied', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, deny: ['*'] },
        agents: [{ lazySubagentConfigs: [{}] }],
      }),
    ).toBe(false);
  });

  // [Deloitte: Ensure lazy-agent admission retains the independent question pause capability.]
  test('preserves ask-user pause admission when approval is disabled and a lazy child exists', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: false },
        agents: [{ tools: ['ask_user_question'], lazySubagentConfigs: [{}] }],
      }),
    ).toBe(true);
  });

  test('does not match an approval rule outside the reachable tool surface', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['delete_*'] },
        agents: [{ tools: ['read_file'] }],
      }),
    ).toBe(false);
  });

  test('includes host-generated runtime tools in approval admission', () => {
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['check_background_task'] },
        agents: [{}],
        hostGeneratedToolNames: ['check_background_task'],
      }),
    ).toBe(true);
  });

  test('matches static and request-scoped rules against MCP aliases', () => {
    const agent: ToolApprovalAdmissionAgent = {
      tools: ['mcp__server__read_file'],
      mcpToolAliases: [{ name: 'mcp__server__read_file', aliasName: 'read_file' }],
    };
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass', ask: ['read_file'] },
        agents: [agent],
      }),
    ).toBe(true);
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass' },
        agents: [agent],
        resolvedProgrammaticHooks: [{ hook: askHook, matcher: '^read_file$' }],
      }),
    ).toBe(true);
  });

  test('asks deployment hook sources only about concrete runtime tool names', () => {
    const hasToolApprovalHooks = jest.fn(
      (names?: readonly string[]) => names?.includes('write_file') === true,
    );
    expect(
      canAgentGraphPause({
        policy: { enabled: true, mode: 'bypass' },
        agents: [{ tools: ['read_file', 'write_file'] }],
        pluginHookSource: pluginSource(hasToolApprovalHooks),
      }),
    ).toBe(true);
    expect(hasToolApprovalHooks).toHaveBeenCalledWith(['read_file']);
    expect(hasToolApprovalHooks).toHaveBeenCalledWith(['write_file']);
  });

  test('classifies top-level ask_user_question unless it is filtered or denied', () => {
    const agents = [{ tools: ['ask_user_question'] }];
    expect(canAgentGraphPause({ policy: undefined, agents })).toBe(true);
    expect(
      canAgentGraphPause({
        policy: { enabled: true, deny: ['ask_*'] },
        agents,
      }),
    ).toBe(false);
    expect(
      canAgentGraphPause({
        policy: { enabled: true },
        agents,
        askUserQuestionAdminDisabled: true,
      }),
    ).toBe(false);
  });

  test('does not promote nested ask_user_question to a parent pause capability', () => {
    expect(
      canAgentGraphPause({
        policy: undefined,
        agents: [{ subagentAgentConfigs: [{ tools: ['ask_user_question'] }] }],
      }),
    ).toBe(false);
  });

  test('admits gateway-classified writes without endpoint approval config', () => {
    expect(
      canAgentGraphPause({
        policy: undefined,
        agents: [
          {
            toolRegistry: new Map([
              ['write_mcp_gateway', { toolClass: 'W2' as const }],
              ['read_mcp_gateway', { toolClass: 'R1' as const }],
            ]),
          },
        ],
      }),
    ).toBe(true);
  });

  test('honors explicit denies for gateway-classified writes', () => {
    expect(
      canAgentGraphPause({
        policy: { deny: ['delete_mcp_gateway'] },
        agents: [{ toolRegistry: new Map([['delete_mcp_gateway', { toolClass: 'D' as const }]]) }],
      }),
    ).toBe(false);
  });
});

describe('agentRunUsesCheckpointer', () => {
  test('tracks checkpointer attachment independently from current pause capability', () => {
    const policy = { enabled: true, mode: 'bypass' as const };
    const agents = [{ tools: ['read_file'] }];
    expect(canAgentGraphPause({ policy, agents })).toBe(false);
    expect(agentRunUsesCheckpointer({ policy, agents })).toBe(true);
  });

  test('uses the same top-level ask-tool admin gate as createRun', () => {
    const agents = [{ tools: ['ask_user_question'] }];
    expect(agentRunUsesCheckpointer({ policy: undefined, agents })).toBe(true);
    expect(
      agentRunUsesCheckpointer({
        policy: undefined,
        agents,
        askUserQuestionAdminDisabled: true,
      }),
    ).toBe(false);
  });

  test('attaches a checkpointer for classified and unresolved lazy tool surfaces', () => {
    expect(
      agentRunUsesCheckpointer({
        policy: undefined,
        agents: [{ toolRegistry: new Map([['delete_mcp_gateway', { toolClass: 'D' as const }]]) }],
      }),
    ).toBe(true);
    expect(
      agentRunUsesCheckpointer({ policy: undefined, agents: [{ lazySubagentConfigs: [{}] }] }),
    ).toBe(true);
  });
});
