import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Header from '../Header';

const mockEndpoint = { current: 'agents' };

jest.mock('react-router-dom', () => ({
  useParams: () => ({ conversationId: 'convo-1' }),
}));
jest.mock('recoil', () => ({
  useRecoilValue: (selector: string) =>
    selector === 'effectiveEndpoint' ? mockEndpoint.current : false,
}));
jest.mock('librechat-data-provider', () => ({
  getConfigDefaults: () => ({ interface: {} }),
  Constants: { NEW_CONVO: 'new' },
  EModelEndpoint: { agents: 'agents' },
  PermissionTypes: { BOOKMARKS: 'bookmarks', MULTI_CONVO: 'multi_convo', TEMPORARY_CHAT: 'temp' },
  Permissions: { USE: 'use' },
}));
jest.mock('~/data-provider', () => ({ useGetStartupConfig: () => ({ data: undefined }) }));
jest.mock('~/hooks', () => ({ useHasAccess: () => false }));
/*
 * Deloitte Custom Change: ConversationTitle now renders the shared rename UI
 * (ConvoOptions/RenameForm), pulling in a much larger dependency graph
 * (data-provider mutations, @librechat/client's provider icon registry, etc.)
 * than this stacking-order suite's narrow mocks can satisfy. These tests only
 * assert on Header's own layout/mount behavior, so mock it out directly
 * instead of growing every transitive mock to match.
 */
jest.mock('../ConversationTitle', () => () => null);
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    sidebarExpanded: {},
    isSubmittingFamily: () => ({}),
    effectiveEndpointByIndex: () => 'effectiveEndpoint',
  },
}));
jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
}));
jest.mock('../Menus', () => ({
  OpenSidebar: () => null,
  PresetsMenu: () => null,
  NewChat: () => null,
  HeaderMenu: () => null,
}));
jest.mock('../TemporaryChat', () => ({
  TemporaryChat: () => null,
  TemporaryChatIndicator: () => null,
}));
jest.mock('../Trace', () => ({ useTraceControl: () => ({ show: false }) }));
jest.mock('../BackgroundTasks', () => ({
  BackgroundTasksButton: jest.fn(() => <div data-testid="conversation-tasks" />),
}));
jest.mock('../Menus/Endpoints/ModelSelector', () => () => null);
jest.mock('../ExportAndShareMenu', () => () => null);
jest.mock('../SubagentThreadLink', () => () => null);
jest.mock('../Menus/BookmarkMenu', () => () => null);
jest.mock('../AddMultiConvo', () => () => null);

describe('Header stacking', () => {
  const backgroundTasks = jest.requireMock('../BackgroundTasks').BackgroundTasksButton as jest.Mock;

  beforeEach(() => {
    backgroundTasks.mockClear();
    mockEndpoint.current = 'agents';
  });

  test('keeps header controls above the z-10 composer approval review', () => {
    const { container } = render(<Header />);

    expect(container.firstElementChild).toHaveClass('absolute', 'top-0', 'z-20');
    expect(backgroundTasks).toHaveBeenCalled();
  });

  test('keeps conversation task controls mounted across endpoint switches', () => {
    const { rerender } = render(<Header />);
    mockEndpoint.current = 'openAI';
    rerender(<Header />);
    expect(screen.getByTestId('conversation-tasks')).toBeInTheDocument();
  });

  test('does not mount parent task controls on child threads', () => {
    render(<Header parentConversationId="parent" />);
    expect(backgroundTasks).not.toHaveBeenCalled();
  });
});
