import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { EModelEndpoint, ProviderId, request } from 'librechat-data-provider';
import type {
  Agent,
  Assistant,
  TConversation,
  TAgentsMap,
  TAssistantsMap,
  TEndpointsConfig,
} from 'librechat-data-provider';
import ConvoIcon from '../ConvoIcon';

// Deloitte Custom Change: intercept the authenticated image request the avatar route relies on.
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  request: { getResponse: jest.fn() },
}));

const endpointsConfig = {
  [EModelEndpoint.agents]: { order: 0 },
  [EModelEndpoint.assistants]: { order: 1 },
  [EModelEndpoint.anthropic]: { order: 2 },
  [ProviderId.cohere]: { order: 3 },
} as TEndpointsConfig;

const agent = {
  id: 'agent_123',
  name: 'Research Agent',
  avatar: { filepath: '/images/agents/agent_123/avatar.png', source: 'local' },
} as Agent;

const agentsMap = { [agent.id]: agent } as TAgentsMap;

const assistant = {
  id: 'asst_123',
  name: 'Support Assistant',
  metadata: { avatar: '/images/assistants/asst_123/avatar.png' },
} as unknown as Assistant;

const assistantMap = {
  [EModelEndpoint.assistants]: { [assistant.id]: assistant },
} as TAssistantsMap;

const cohereConversation = { endpoint: ProviderId.cohere } as unknown as TConversation;

const renderIcon = (conversation: TConversation) =>
  render(
    <ConvoIcon
      conversation={conversation}
      endpointsConfig={endpointsConfig}
      assistantMap={assistantMap}
      agentsMap={agentsMap}
      className="h-2/3 w-2/3 text-text-primary"
      context="landing"
      size={41}
    />,
  );

describe('ConvoIcon', () => {
  it('renders the provider mark for a first-class endpoint', () => {
    renderIcon({ endpoint: EModelEndpoint.anthropic } as TConversation);

    expect(screen.getByRole('img', { name: 'Anthropic' })).toBeInTheDocument();
  });

  it('keeps the agent avatar rather than provider art', () => {
    renderIcon({
      endpoint: EModelEndpoint.agents,
      agent_id: agent.id,
    } as TConversation);

    expect(screen.getByAltText('Research Agent')).toHaveAttribute(
      'src',
      '/images/agents/agent_123/avatar.png',
    );
  });

  // Deloitte Custom Change: private Azure avatars must load through the authenticated route.
  it('loads a private Azure agent avatar through the authenticated image route', async () => {
    const blobPath = 'images/0123456789abcdef01234567/agent-agent_azure-avatar-1730000000000.png';
    const getResponse = request.getResponse as jest.Mock;
    getResponse.mockResolvedValue({ data: new Blob(['avatar-bytes'], { type: 'image/png' }) });
    const createObjectURL = jest.fn(() => 'blob:agent-avatar');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), writable: true });

    const azureAgent = {
      id: 'agent_azure',
      name: 'Private Agent',
      avatar: {
        filepath: `https://storage.blob.core.windows.net/files/${blobPath}`,
        source: 'azure_blob',
      },
    } as Agent;

    render(
      <ConvoIcon
        conversation={{ endpoint: EModelEndpoint.agents, agent_id: azureAgent.id } as TConversation}
        endpointsConfig={endpointsConfig}
        assistantMap={assistantMap}
        agentsMap={{ [azureAgent.id]: azureAgent } as TAgentsMap}
        className="h-2/3 w-2/3 text-text-primary"
        context="landing"
        size={41}
      />,
    );

    await waitFor(() =>
      expect(screen.getByAltText('Private Agent')).toHaveAttribute('src', 'blob:agent-avatar'),
    );
    expect(getResponse).toHaveBeenCalledWith(
      `/api/files/images/avatar?file=${Buffer.from(blobPath).toString('base64url')}`,
      { responseType: 'blob' },
    );
  });

  it('falls back to the agent mark when the agent has no avatar', () => {
    renderIcon({
      endpoint: EModelEndpoint.agents,
      agent_id: 'missing_agent',
    } as TConversation);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps the assistant avatar rather than provider art', () => {
    renderIcon({
      endpoint: EModelEndpoint.assistants,
      assistant_id: assistant.id,
    } as TConversation);

    expect(screen.getByAltText('Support Assistant')).toHaveAttribute(
      'src',
      '/images/assistants/asst_123/avatar.png',
    );
  });

  it('keeps Cohere landing padding off other contexts and on landing', () => {
    const { container: landing } = renderIcon(cohereConversation);
    expect(landing.querySelector('img')).toHaveClass('p-2');

    const { container: nav } = render(
      <ConvoIcon
        conversation={cohereConversation}
        endpointsConfig={endpointsConfig}
        assistantMap={assistantMap}
        agentsMap={agentsMap}
        context="nav"
        size={20}
      />,
    );
    expect(nav.querySelector('img')).not.toHaveClass('p-2');
  });
});
