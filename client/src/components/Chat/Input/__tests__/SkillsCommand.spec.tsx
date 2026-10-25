/**
 * Locks in the selection-flow contract that the follow-up `manualSkills`
 * PR has to honor: when a user picks a skill in the `$` popover the
 * component must (a) push the skill name onto the per-conversation
 * `pendingManualSkillsByConvoId` atom, (b) flip `ephemeralAgent.skills`
 * to true, and (c) consume only the `$` command prefix from the textarea.
 *
 * Also covers filter composition: per-agent skill scope intersects with the
 * ACL catalog. General and ALL-agent catalogs hide inactive entries, while
 * skills deliberately attached to a SELECT agent remain available there.
 */
import React from 'react';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillsScope } from 'librechat-data-provider';
import { render, screen, waitFor } from '@testing-library/react';
import type { TSkillSummary } from 'librechat-data-provider';

const CONVO_ID = 'convo-1';

const mockSetShowSkillsPopover = jest.fn();
const mockSetEphemeralAgent = jest.fn();
const mockSetPendingManualSkills = jest.fn();
const mockShowSkillsPopover = { current: true };
const mockNewGeneralConversation = jest.fn();
const mockSetActive = jest.fn();

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useAtomValue: jest.fn((atom: unknown) =>
    atom === 'show-skills-popover' ? mockShowSkillsPopover.current : undefined,
  ),
  useSetAtom: jest.fn((atom: unknown) =>
    atom === 'show-skills-popover' ? mockSetShowSkillsPopover : jest.fn(),
  ),
}));

jest.mock('../skillsState', () => ({
  showSkillsPopoverFamily: () => 'show-skills-popover',
}));

jest.mock('recoil', () => {
  const actual = jest.requireActual('recoil');
  return {
    ...actual,
    useRecoilValue: jest.fn(() => undefined),
    useRecoilState: jest.fn(() => [null, jest.fn()]),
    useSetRecoilState: jest.fn((atom: unknown) => {
      if (atom === 'ephemeral-agent') {
        return mockSetEphemeralAgent;
      }
      if (atom === 'pending-manual-skills') {
        return mockSetPendingManualSkills;
      }
      if (atom === 'sidebar-expanded') {
        return jest.fn();
      }
      return jest.fn();
    }),
  };
});

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    pendingManualSkillsByConvoId: () => 'pending-manual-skills',
    sidebarExpanded: 'sidebar-expanded',
  },
  ephemeralAgentByConvoId: () => 'ephemeral-agent',
  pendingManualSkillsByConvoId: () => 'pending-manual-skills',
}));

const mockUseSkillsInfiniteQuery = jest.fn();
jest.mock('~/data-provider', () => ({
  useSkillsInfiniteQuery: () => mockUseSkillsInfiniteQuery(),
}));

/* Phase 2: the popover reads agent skill config via useAgentsMapContext
   and the agent id is threaded down as a prop from ChatForm (so the
   component stays memoizable across unrelated convo-shape changes). The
   test harness swaps the agents map in so cases can configure ephemeral
   vs. agent-scoped behavior without standing up a real provider. */
const mockUseAgentsMapContext = jest.fn();
jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => mockUseAgentsMapContext(),
  useActivePanel: () => ({ setActive: mockSetActive }),
}));

const mockIsActive = jest.fn();
const mockToggleMany = jest.fn();
/* Factory mock — individual tests call mockUseSkillActiveState.mockReturnValue(...)
   to override isLoading/isError/isUpdating without needing jest.resetModules(). */
const mockUseSkillActiveState = jest.fn();
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSkillActiveState: () => mockUseSkillActiveState(),
  useNewConvo: () => ({ newGeneralConversation: mockNewGeneralConversation }),
}));

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    Spinner: () => null,
  };
});

/* react-virtualized renders nothing in jsdom without measured size; replace
   AutoSizer + List with a flat ul so row clicks are exercised normally. */
jest.mock('react-virtualized', () => ({
  ...jest.requireActual('react-virtualized'),
  AutoSizer: ({ children }: { children: (size: { width: number }) => React.ReactNode }) =>
    children({ width: 320 }),
  List: ({
    rowCount,
    rowRenderer,
  }: {
    rowCount: number;
    rowRenderer: (args: {
      index: number;
      key: string;
      style: React.CSSProperties;
    }) => React.ReactNode;
  }) => {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push(rowRenderer({ index: i, key: `row-${i}`, style: {} }));
    }
    return <ul data-testid="skills-list">{rows}</ul>;
  },
}));

import SkillsCommand from '../SkillsCommand';
import { filterSkillsForPopover } from '~/utils';

const makeTextarea = (initial = '$', selectionStart = initial.length) => {
  const textarea = document.createElement('textarea');
  textarea.value = initial;
  textarea.setSelectionRange(selectionStart, selectionStart);
  document.body.appendChild(textarea);
  return { current: textarea } as React.MutableRefObject<HTMLTextAreaElement | null>;
};

const makeSkill = (overrides: Partial<TSkillSummary>): TSkillSummary => ({
  _id: '1',
  name: 'brand-guidelines',
  displayTitle: 'Brand Guidelines',
  description: 'Apply brand styling',
  author: 'u',
  authorName: 'U',
  version: 1,
  source: 'inline',
  fileCount: 0,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const skillsResponse = {
  pages: [
    {
      skills: [makeSkill({})],
      has_more: false,
      after: null,
    },
  ],
};

const twoSkillsResponse = {
  pages: [
    {
      skills: [
        makeSkill({ _id: '1', name: 'brand-guidelines', displayTitle: 'Brand Guidelines' }),
        makeSkill({ _id: '2', name: 'style-guide', displayTitle: 'Style Guide' }),
      ],
      has_more: false,
      after: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  mockShowSkillsPopover.current = true;
  mockUseSkillsInfiniteQuery.mockReturnValue({
    data: skillsResponse,
    isLoading: false,
    isError: false,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  /* Default active-state: all skills active, no loading or error. */
  mockUseSkillActiveState.mockReturnValue({
    isActive: mockIsActive,
    toggleMany: mockToggleMany,
    isLoading: false,
    isError: false,
    isUpdating: false,
  });
  /* Defaults: empty agents map, every skill active, and no in-flight
     mutation. Individual tests override these to exercise empty states,
     CTA behavior, and active-state lifecycle. */
  mockUseAgentsMapContext.mockReturnValue({});
  mockIsActive.mockReturnValue(true);
  mockToggleMany.mockReset();
  mockNewGeneralConversation.mockReset();
  mockSetActive.mockReset();
});

describe('SkillsCommand', () => {
  it('renders nothing when the popover atom is false', () => {
    mockShowSkillsPopover.current = false;
    const textAreaRef = makeTextarea();
    const { container } = render(
      <SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('preserves an existing draft when $ is inserted at the beginning', async () => {
    const user = userEvent.setup();
    const textAreaRef = makeTextarea('$Keep this draft', 1);

    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    expect(screen.getByPlaceholderText('com_ui_skills_command_placeholder')).toHaveValue('');
    expect(textAreaRef.current).toHaveValue('Keep this draft');
    expect(textAreaRef.current?.selectionStart).toBe(0);

    await user.click(await screen.findByRole('button', { name: /Brand Guidelines/i }));

    expect(textAreaRef.current).toHaveValue('Keep this draft');
    expect(document.activeElement).toBe(textAreaRef.current);
  });

  it('preserves a trailing $ in the existing draft after selecting a skill', async () => {
    const user = userEvent.setup();
    const textAreaRef = makeTextarea('$Keep this $', 1);

    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    await user.click(await screen.findByRole('button', { name: /Brand Guidelines/i }));

    expect(textAreaRef.current).toHaveValue('Keep this $');
  });

  it('does not consume a preserved leading $ when the popover input ref reattaches', () => {
    const textAreaRef = makeTextarea('$$100', 1);
    const { rerender } = render(
      <SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />,
    );
    const nextTextAreaRef = {
      current: textAreaRef.current,
    } as React.MutableRefObject<HTMLTextAreaElement | null>;

    rerender(<SkillsCommand index={0} textAreaRef={nextTextAreaRef} conversationId={CONVO_ID} />);

    expect(nextTextAreaRef.current).toHaveValue('$100');
  });

  it('selecting a skill pushes to pendingManualSkillsByConvoId, flips ephemeralAgent.skills, strips the $ trigger from the textarea, and closes the popover', async () => {
    const user = userEvent.setup();
    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    const skillButton = await screen.findByRole('button', { name: /Brand Guidelines/i });
    await act(async () => {
      await user.click(skillButton);
    });

    /* Structured channel: the skill name is pushed into the per-convo atom
       and drained by `useChatFunctions.ask` on submission. */
    expect(mockSetPendingManualSkills).toHaveBeenCalledTimes(1);
    const updater = mockSetPendingManualSkills.mock.calls[0][0] as (prev: string[]) => string[];
    expect(updater([])).toEqual(['brand-guidelines']);
    expect(updater(['brand-guidelines'])).toEqual(['brand-guidelines']);

    /* Ephemeral agent gets skills enabled so the badge lights up and the
       backend includes the skill catalog. */
    expect(mockSetEphemeralAgent).toHaveBeenCalledTimes(1);
    const agentUpdater = mockSetEphemeralAgent.mock.calls[0][0] as (
      prev: { skills?: boolean } | null,
    ) => { skills?: boolean };
    expect(agentUpdater(null)).toEqual({ skills: true });
    expect(agentUpdater({ skills: true })).toEqual({ skills: true });

    /* Textarea is cleared of the `$` trigger but no `$skill-name ` cue is
       inserted — visual confirmation is the `SkillPills` row that
       renders on the submitted user message, and injecting text would
       mislead users into thinking free-form `$name` invocation works. */
    expect(textAreaRef.current?.value).toBe('');

    /* Popover dismisses on selection. */
    expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false);
  });

  it('narrows the list to the agent-configured scope when agent.skills is set and skills_enabled is true', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({
      agent_1: { id: 'agent_1', skills: ['2'], skills_enabled: true },
    });

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    /* Only the skill whose _id is in agent.skills should appear. */
    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(await screen.findByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });

  it('shows nothing when the agent has skills_enabled:false, regardless of allowlist', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({
      agent_1: { id: 'agent_1', skills: ['1', '2'], skills_enabled: false },
    });

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('hides all skills for a persisted agent with skills_enabled undefined (default off)', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({
      agent_1: { id: 'agent_1' },
    });

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    /* Mirrors backend `resolveAgentScopedSkillIds`: persisted agents are
       off by default; the builder's `skills_enabled` master toggle is
       the only signal that activates skills for the agent. */
    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('shows the full catalog for a persisted agent with skills_enabled:true and empty allowlist', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({
      agent_1: { id: 'agent_1', skills: [], skills_enabled: true },
    });

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    expect(await screen.findByRole('button', { name: /Brand Guidelines/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });

  it('shows no catalog entries for an enabled authoring-only agent', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({
      agent_1: {
        id: 'agent_1',
        skills: [],
        skills_enabled: false,
        skill_authoring_enabled: true,
        skills_scope: SkillsScope.none,
      },
    });

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('treats an ephemeral agent id as unscoped and shows the full ACL catalog', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({});

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="ephemeral"
      />,
    );

    /* `ephemeral` doesn't start with `agent_`, so it's an ephemeral id;
       scope filter should be skipped and the full catalog displayed. */
    expect(await screen.findByRole('button', { name: /Brand Guidelines/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });

  it('fails closed for persisted agents while the agents map is hydrating', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue(undefined);

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    /* Hydration race: agents map not yet loaded. Without `skills_enabled`
       visibility we cannot prove the persisted agent opted in, so fail
       closed; otherwise the user can pick a skill the backend will then
       refuse for the turn. */
    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('fails closed when the agent id is set but missing from the agents map', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({});

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('hides inactive skills from the popover', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockIsActive.mockImplementation((skill: { _id: string }) => skill._id !== '1');

    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });

  it('shows an inactive skill when it is explicitly assigned to a SELECT agent', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseAgentsMapContext.mockReturnValue({
      agent_1: { id: 'agent_1', skills: ['1'], skills_enabled: true },
    });
    mockIsActive.mockReturnValue(false);

    const textAreaRef = makeTextarea('$');
    render(
      <SkillsCommand
        index={0}
        textAreaRef={textAreaRef}
        conversationId={CONVO_ID}
        agentId="agent_1"
      />,
    );

    /* An explicit attachment is an agent capability, not a general-library
       preference: PR #673 keeps it invocable in this agent chat. */
    expect(screen.getByRole('button', { name: /Brand Guidelines/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('resumes catalog pagination after an external refetch clears an error', () => {
    const fetchNextPage = jest.fn();
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: skillsResponse,
      isLoading: false,
      isError: true,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    });

    const textAreaRef = makeTextarea('$');
    const { rerender } = render(
      <SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />,
    );
    expect(fetchNextPage).not.toHaveBeenCalled();

    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: skillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    });
    rerender(<SkillsCommand index={1} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Phase 1: CTA hardening
  // ---------------------------------------------------------------------------

  describe('New General Chat CTA', () => {
    it('shows the empty-library state before the disabled-agent state', async () => {
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: { pages: [{ skills: [], has_more: false, after: null }] },
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockUseAgentsMapContext.mockReturnValue({
        agent_1: { id: 'agent_1', skills_enabled: false },
      });

      const textAreaRef = makeTextarea('$');
      render(
        <SkillsCommand
          index={0}
          textAreaRef={textAreaRef}
          conversationId={CONVO_ID}
          agentId="agent_1"
        />,
      );

      expect(await screen.findByText('com_ui_skills_catalog_empty')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /com_ui_skills_manage_cta/i })).toBeInTheDocument();
      expect(screen.queryByText('com_ui_skills_none_for_chat')).toBeNull();
      expect(screen.queryByRole('button', { name: /com_ui_skills_start_new_chat/i })).toBeNull();
    });

    it('shows the disabled-agent message and New General Chat button for an agent with skills_enabled:false', async () => {
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: twoSkillsResponse,
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockUseAgentsMapContext.mockReturnValue({
        agent_1: { id: 'agent_1', skills: ['1', '2'], skills_enabled: false },
      });

      const textAreaRef = makeTextarea('$');
      render(
        <SkillsCommand
          index={0}
          textAreaRef={textAreaRef}
          conversationId={CONVO_ID}
          agentId="agent_1"
        />,
      );

      expect(await screen.findByText('com_ui_skills_none_for_chat')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /com_ui_skills_start_new_chat/i }),
      ).toBeInTheDocument();
    });

    it('calls newGeneralConversation and closes the popover when New General Chat is clicked', async () => {
      const user = userEvent.setup();
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: skillsResponse,
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockUseAgentsMapContext.mockReturnValue({
        agent_1: { id: 'agent_1', skills: ['1'], skills_enabled: false },
      });

      const textAreaRef = makeTextarea('$');
      render(
        <SkillsCommand
          index={0}
          textAreaRef={textAreaRef}
          conversationId={CONVO_ID}
          agentId="agent_1"
        />,
      );

      const btn = await screen.findByRole('button', { name: /com_ui_skills_start_new_chat/i });
      await user.click(btn);

      /* SkillsCommand delegates to newGeneralConversation, which owns the
         endpoint resolution logic and is tested separately in useNewConvo. */
      expect(mockNewGeneralConversation).toHaveBeenCalledTimes(1);
      expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false);
    });

    it('shows the scoped-miss message and New General Chat for a restricted agent with no matching search', async () => {
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: twoSkillsResponse,
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      /* Agent scoped to skill '2' only; skill '1' (Brand Guidelines) is not in scope
         so a search for it returns no match within the agent's allowlist. */
      mockUseAgentsMapContext.mockReturnValue({
        agent_1: { id: 'agent_1', skills: ['2'], skills_enabled: true },
      });

      const textAreaRef = makeTextarea('$');
      render(
        <SkillsCommand
          index={0}
          textAreaRef={textAreaRef}
          conversationId={CONVO_ID}
          agentId="agent_1"
        />,
      );

      /* Only 'Style Guide' (_id:'2') is in scope and is shown. */
      expect(await screen.findByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
      /* The scoped-miss empty state only shows when the search produces no scoped result. */
      expect(screen.queryByText('com_ui_skills_agent_scope_miss')).toBeNull();
    });
  });

  describe('Manage Skills CTA', () => {
    describe('keyboard navigation', () => {
      const BLUR_DELAY_MS = 250;
      const wait = () => act(() => new Promise((resolve) => setTimeout(resolve, BLUR_DELAY_MS)));

      beforeEach(() => {
        mockUseSkillsInfiniteQuery.mockReturnValue({
          data: { pages: [{ skills: [], has_more: false, after: null }] },
          isLoading: false,
          isError: false,
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
        });
      });

      it('moves focus from the search input into the empty-state action and keeps the picker open', async () => {
        const user = userEvent.setup();
        const textAreaRef = makeTextarea('$');
        render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

        const input = screen.getByPlaceholderText('com_ui_skills_command_placeholder');
        const manageButton = screen.getByRole('button', { name: /com_ui_skills_manage_cta/i });
        expect(input).toHaveFocus();

        await user.tab();
        await wait();

        expect(manageButton).toHaveFocus();
        expect(mockSetShowSkillsPopover).not.toHaveBeenCalled();

        await user.keyboard('{Enter}');

        expect(mockSetActive).toHaveBeenCalledWith('skills');
        expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false);
      });

      it('dismisses the picker only once focus leaves the whole popover', async () => {
        const user = userEvent.setup();
        const textAreaRef = makeTextarea('$');
        render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);
        const outsideButton = document.createElement('button');
        document.body.append(outsideButton);

        await user.tab();
        await wait();
        expect(screen.getByRole('button', { name: /com_ui_skills_manage_cta/i })).toHaveFocus();
        expect(mockSetShowSkillsPopover).not.toHaveBeenCalled();

        await user.tab();

        expect(outsideButton).toHaveFocus();
        await waitFor(() => expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false));
      });

      it('does not move focus into the action on Shift+Tab from the search input', async () => {
        const user = userEvent.setup();
        const textAreaRef = makeTextarea('$');
        render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

        const manageButton = screen.getByRole('button', { name: /com_ui_skills_manage_cta/i });

        await user.tab({ shift: true });

        expect(manageButton).not.toHaveFocus();
        expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false);
      });
    });

    it('calls setActive("skills") and closes the popover when Manage Skills is clicked', async () => {
      const user = userEvent.setup();
      /* No skills in catalog → catalog-empty state → Manage Skills button. */
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: { pages: [{ skills: [], has_more: false, after: null }] },
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });

      const textAreaRef = makeTextarea('$');
      render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

      const btn = await screen.findByRole('button', { name: /com_ui_skills_manage_cta/i });
      await user.click(btn);

      expect(mockSetActive).toHaveBeenCalledWith('skills');
      expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false);
    });
  });

  describe('Enable all CTA', () => {
    it('calls toggleMany with all disabled skills when Enable all is clicked', async () => {
      const user = userEvent.setup();
      /* Two skills; isActive returns false for both → both are disabled →
         disabledSkills has two entries → Enable all is shown. */
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: twoSkillsResponse,
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockIsActive.mockReturnValue(false);

      const textAreaRef = makeTextarea('$');
      render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

      const btn = await screen.findByRole('button', { name: /com_ui_skills_enable_all_cta/i });
      await user.click(btn);

      expect(mockToggleMany).toHaveBeenCalledTimes(1);
      const [skills, nextActive] = mockToggleMany.mock.calls[0] as [{ _id: string }[], boolean];
      expect(nextActive).toBe(true);
      expect(skills.map((s) => s._id).sort()).toEqual(['1', '2']);
    });

    it('does not show Enable all while skill states are loading (statesLoading:true)', () => {
      /* statesLoading folds into catalogLoading. SkillsEmptyStateView — and
         therefore Enable all — only renders when catalogLoading is false. */
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: twoSkillsResponse,
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockIsActive.mockReturnValue(false);
      /* Override the active-state hook to report loading. */
      mockUseSkillActiveState.mockReturnValue({
        isActive: mockIsActive,
        toggleMany: mockToggleMany,
        isLoading: true, // ← statesLoading → catalogLoading → gate closed
        isError: false,
        isUpdating: false,
      });

      const textAreaRef = makeTextarea('$');
      render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

      expect(screen.queryByRole('button', { name: /com_ui_skills_enable_all_cta/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /com_ui_skills_manage_cta/i })).toBeNull();
    });

    it('does not show Enable all when active-state query fails (statesError:true)', () => {
      /* statesError folds into catalogError. The error message is shown instead. */
      mockUseSkillsInfiniteQuery.mockReturnValue({
        data: twoSkillsResponse,
        isLoading: false,
        isError: false,
        fetchNextPage: jest.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockIsActive.mockReturnValue(false);
      mockUseSkillActiveState.mockReturnValue({
        isActive: mockIsActive,
        toggleMany: mockToggleMany,
        isLoading: false,
        isError: true, // ← statesError → catalogError → error message shown
        isUpdating: false,
      });

      const textAreaRef = makeTextarea('$');
      render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

      expect(screen.queryByRole('button', { name: /com_ui_skills_enable_all_cta/i })).toBeNull();
      /* The safe error message is rendered in place of the empty-state CTAs. */
      expect(screen.getByText('com_ui_skills_load_error')).toBeInTheDocument();
    });
  });
});

describe('filterSkillsForPopover', () => {
  const active = () => true;
  const inactive = () => false;
  const s1 = makeSkill({ _id: '1', name: 'a' });
  const s2 = makeSkill({ _id: '2', name: 'b' });
  const s3 = makeSkill({ _id: '3', name: 'c', userInvocable: false });

  it('passes everything through when agentSkillIds is undefined', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: undefined, isActive: active });
    expect(out.map((s) => s._id)).toEqual(['1', '2']);
  });

  it('passes everything through when agentSkillIds is null', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: null, isActive: active });
    expect(out.map((s) => s._id)).toEqual(['1', '2']);
  });

  it('returns empty when agentSkillIds is []', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: [], isActive: active });
    expect(out).toEqual([]);
  });

  it('intersects with a non-empty agentSkillIds', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: ['2'], isActive: active });
    expect(out.map((s) => s._id)).toEqual(['2']);
  });

  it('excludes inactive skills', () => {
    const isActive = (skill: { _id: string }) => skill._id !== '1';
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: null, isActive });
    expect(out.map((s) => s._id)).toEqual(['2']);
  });

  it('excludes skills with userInvocable: false via isUserInvocable', () => {
    const out = filterSkillsForPopover([s1, s3], { agentSkillIds: null, isActive: active });
    expect(out.map((s) => s._id)).toEqual(['1']);
  });

  it('still empty when agent scope is [] even if everything is active and invocable', () => {
    const out = filterSkillsForPopover([s1, s2, s3], { agentSkillIds: [], isActive: active });
    expect(out).toEqual([]);
  });

  it('bypasses active state for SELECT-agent skills while preserving scope and invocability', () => {
    const isActive = (skill: { _id: string }) => skill._id !== '2';
    const out = filterSkillsForPopover([s1, s2, s3], {
      agentSkillIds: ['1', '2', '3'],
      isActive,
    });
    /* s1 and s2 are explicitly assigned, so both remain available even though
       s2 is inactive generally. s3 remains excluded because it is model-only. */
    expect(out.map((s) => s._id)).toEqual(['1', '2']);
  });

  it('drops everything when isActive returns false for all inputs', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: null, isActive: inactive });
    expect(out).toEqual([]);
  });
});
