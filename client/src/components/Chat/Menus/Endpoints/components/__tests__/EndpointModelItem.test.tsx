import { render, screen } from '@testing-library/react';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { Endpoint, SelectedValues } from '~/common';
import { EndpointModelItem } from '../EndpointModelItem';
import { getSelectedIcon } from '../../utils';

const mockHandleSelectModel = jest.fn();
let mockSelectedValues: SelectedValues;

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    handleSelectModel: mockHandleSelectModel,
    selectedValues: mockSelectedValues,
  }),
}));

jest.mock('~/components/Chat/Menus/Endpoints/CustomMenu', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    CustomMenuItem: React.forwardRef(function MockMenuItem(
      { children, ...rest }: { children?: React.ReactNode },
      ref: React.Ref<HTMLDivElement>,
    ) {
      return React.createElement('div', { ref, role: 'menuitem', ...rest }, children);
    }),
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Menus/Endpoints/useActiveItem', () => ({
  __esModule: true,
  default: () => ({ ref: { current: null }, isActive: false }),
}));

// Deloitte Custom Change: represent URLIcon's authenticated image source in avatar regression tests.
jest.mock('~/components/Endpoints/URLIcon', () => ({
  URLIcon: ({ iconURL, altName }: { iconURL: string; altName?: string }) => (
    <img src={`authenticated:${iconURL}`} alt={altName ?? ''} />
  ),
}));

const renderItem = (props: Partial<React.ComponentProps<typeof EndpointModelItem>> = {}) =>
  render(
    <EndpointModelItem
      modelId="claude-opus-4-6"
      endpoint={baseEndpoint}
      isFavorite={false}
      onToggleFavorite={jest.fn()}
      {...props}
    />,
  );

const baseEndpoint: Endpoint = {
  value: 'anthropic',
  label: 'Anthropic',
  hasModels: true,
  models: [{ name: 'claude-opus-4-6' }],
  icon: null,
};

describe('EndpointModelItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders checkmark when model and endpoint match with no active spec', () => {
    mockSelectedValues = { endpoint: 'anthropic', model: 'claude-opus-4-6', modelSpec: '' };
    renderItem();

    const menuItem = screen.getByRole('menuitem');
    expect(menuItem).toHaveAttribute('aria-selected', 'true');
  });

  it('does NOT render checkmark when a model spec is active even if endpoint and model match', () => {
    mockSelectedValues = {
      endpoint: 'anthropic',
      model: 'claude-opus-4-6',
      modelSpec: 'my-anthropic-spec',
    };
    renderItem();

    const menuItem = screen.getByRole('menuitem');
    expect(menuItem).not.toHaveAttribute('aria-selected');
  });

  it('does NOT render checkmark when model matches but endpoint differs', () => {
    mockSelectedValues = { endpoint: 'openai', model: 'claude-opus-4-6', modelSpec: '' };
    renderItem();

    const menuItem = screen.getByRole('menuitem');
    expect(menuItem).not.toHaveAttribute('aria-selected');
  });

  it('does NOT render checkmark when endpoint matches but model differs', () => {
    mockSelectedValues = { endpoint: 'anthropic', model: 'claude-sonnet-4-5', modelSpec: '' };
    renderItem();

    const menuItem = screen.getByRole('menuitem');
    expect(menuItem).not.toHaveAttribute('aria-selected');
  });

  // Deloitte Custom Change: cover authenticated avatar rendering in the agent selector row.
  it('uses the authenticated avatar icon for an agent profile picture', () => {
    mockSelectedValues = { endpoint: 'agents', model: 'agent-1', modelSpec: '' };
    renderItem({
      modelId: 'agent-1',
      endpoint: {
        ...baseEndpoint,
        value: 'agents',
        label: 'My Agents',
        models: [{ name: 'agent-1' }],
        agentNames: { 'agent-1': 'MCP test agent' },
        modelIcons: { 'agent-1': '/api/files/images/avatar?file_id=avatar-1' },
      },
    });

    expect(screen.getByRole('img', { name: 'MCP test agent' })).toHaveAttribute(
      'src',
      'authenticated:/api/files/images/avatar?file_id=avatar-1',
    );
  });

  // Deloitte Custom Change: cover authenticated avatar rendering in the selected model header.
  it('uses the authenticated avatar icon in the selected model header', () => {
    const avatarUrl = '/api/files/images/avatar?file_id=avatar-1';
    const icon = getSelectedIcon({
      mappedEndpoints: [
        {
          ...baseEndpoint,
          value: 'agents',
          modelIcons: { 'agent-1': avatarUrl },
        },
      ],
      selectedValues: { endpoint: 'agents', model: 'agent-1', modelSpec: '' },
      modelSpecs: [],
      endpointsConfig: {} as TEndpointsConfig,
    });

    render(<>{icon}</>);

    expect(screen.getByRole('img')).toHaveAttribute('src', `authenticated:${avatarUrl}`);
  });
});
