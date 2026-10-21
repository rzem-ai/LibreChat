import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { useAtomValue, useSetAtom } from 'jotai';
import { AutoSizer, List } from 'react-virtualized';
import { Button, Input, Spinner, useCombobox } from '@librechat/client';
import { SkillsScope, resolveAgentSkillsScope } from 'librechat-data-provider';
import type { TSkillSummary } from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import { useLocalize, useNewConvo, useSkillActiveState } from '~/hooks';
import { filterSkillsByScope, filterSkillsForPopover } from '~/utils';
import useInitPopoverInput from '~/hooks/Input/useInitPopoverInput';
import { useSkillsInfiniteQuery } from '~/data-provider';
import { showSkillsPopoverFamily } from './skillsState';
import { useAgentsMapContext } from '~/Providers';
import { ephemeralAgentByConvoId } from '~/store';
import { useActivePanel } from '~/Providers';
import { isEphemeralAgent } from '~/common';
import MentionItem from './MentionItem';
import store from '~/store';

const commandChar = '$';
const ROW_HEIGHT = 44;
const skillIcon = <ScrollText className="icon-md text-status-info" />;

// ---------------------------------------------------------------------------
// Empty-state discrimination
// ---------------------------------------------------------------------------

export type SkillsEmptyState =
  /** No skills exist in the user's catalog at all. */
  | { kind: 'catalog-empty' }
  /**
   * Current chat is an agent with skills disabled — no skills are
   * accessible regardless of what the catalog contains. Agent-disabled
   * takes precedence over catalog-empty so the CTA is always New General Chat.
   */
  | { kind: 'agent-disabled' }
  /**
   * Agent has a non-empty explicit skill allowlist but the current search
   * matched nothing within it. The rest of the catalog is reachable only
   * through a general chat.
   */
  | { kind: 'agent-scoped-miss' }
  /**
   * General chat (or full-catalog agent): no selectable result because
   * every eligible skill is toggled off or a search matched nothing among
   * active skills. `disabledSkills` carries every personally-disabled,
   * manually invocable skill so "Enable all" is a single blanket action.
   */
  | { kind: 'unscoped-empty'; disabledSkills: TSkillSummary[] };

/**
 * Decides which empty-state the `$` popover should show. Catalog absence
 * takes precedence: when no accessible skills exist, a general chat cannot
 * help the user and Manage Skills is the useful next action.
 */
export function resolveSkillsEmptyState(ctx: {
  allSkills: TSkillSummary[];
  agentSkillIds: string[] | null | undefined;
  isAgentDisabled: boolean;
  disabledSkills: TSkillSummary[];
}): SkillsEmptyState {
  const { allSkills, agentSkillIds, isAgentDisabled, disabledSkills } = ctx;

  // No accessible skills at all.
  if (allSkills.length === 0) {
    return { kind: 'catalog-empty' };
  }
  // Agent with skills explicitly disabled.
  if (isAgentDisabled) {
    return { kind: 'agent-disabled' };
  }
  // Agent has a non-empty allowlist but the search matched nothing in it.
  if (agentSkillIds != null && agentSkillIds.length > 0) {
    return { kind: 'agent-scoped-miss' };
  }
  // General chat / full-catalog agent: report disabled skills for Enable all.
  return { kind: 'unscoped-empty', disabledSkills };
}

// ---------------------------------------------------------------------------
// Empty-state UI
// ---------------------------------------------------------------------------

function EmptyStateWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 text-center text-sm text-text-secondary">
      {children}
    </div>
  );
}

function NewGeneralChatButton({
  onClick,
  localize,
}: {
  onClick: () => void;
  localize: ReturnType<typeof useLocalize>;
}) {
  return (
    <Button type="button" size="sm" variant="submit" onClick={onClick}>
      {localize('com_ui_skills_start_new_chat')}
    </Button>
  );
}

function SkillsEmptyStateView({
  state,
  localize,
  onEnableSkills,
  onNewChat,
  onManageSkills,
}: {
  state: SkillsEmptyState;
  localize: ReturnType<typeof useLocalize>;
  onEnableSkills: (skills: TSkillSummary[]) => void;
  onNewChat: () => void;
  onManageSkills: () => void;
}) {
  switch (state.kind) {
    case 'catalog-empty':
      return (
        <EmptyStateWrapper>
          <p>{localize('com_ui_skills_catalog_empty')}</p>
          <Button type="button" size="sm" variant="outline" onClick={onManageSkills}>
            {localize('com_ui_skills_manage_cta')}
          </Button>
        </EmptyStateWrapper>
      );
    case 'agent-disabled':
      return (
        <EmptyStateWrapper>
          <p>{localize('com_ui_skills_none_for_chat')}</p>
          <NewGeneralChatButton onClick={onNewChat} localize={localize} />
        </EmptyStateWrapper>
      );
    case 'agent-scoped-miss':
      return (
        <EmptyStateWrapper>
          <p>{localize('com_ui_skills_agent_scope_miss')}</p>
          <NewGeneralChatButton onClick={onNewChat} localize={localize} />
        </EmptyStateWrapper>
      );
    case 'unscoped-empty':
      return (
        <EmptyStateWrapper>
          <p>{localize('com_ui_no_skills_found')}</p>
          <div className="flex items-center gap-2">
            {state.disabledSkills.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="submit"
                /* Keep focus in the search input so the blur-driven auto-close
                   doesn't dismiss the popover — unlike Manage Skills, this
                   action doesn't navigate away. */
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onEnableSkills(state.disabledSkills)}
              >
                {localize('com_ui_skills_enable_all_cta')}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={onManageSkills}>
              {localize('com_ui_skills_manage_cta')}
            </Button>
          </div>
        </EmptyStateWrapper>
      );
    default:
      return null;
  }
}

function SkillsCommandContent({
  index,
  textAreaRef,
  conversationId,
  agentId,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  agentId?: string | null;
}) {
  const localize = useLocalize();
  const setShowSkillsPopover = useSetAtom(showSkillsPopoverFamily(index));
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const setPendingManualSkills = useSetRecoilState(
    store.pendingManualSkillsByConvoId(conversationId),
  );

  const agentsMap = useAgentsMapContext();
  const {
    isActive,
    toggleMany,
    isLoading: statesLoading,
    isError: statesError,
  } = useSkillActiveState();
  const { newGeneralConversation } = useNewConvo(index);
  const { setActive } = useActivePanel();
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);

  /* Resolve the per-agent skill scope. Mirrors backend
     `resolveAgentScopedSkillIds`: ephemeral agents always see the full
     catalog (picking any skill flips `ephemeralAgent.skills = true` and
     activates for the turn); persisted agents gate on the builder's
     `skills_enabled` master toggle and explicit catalog scope. Legacy agents
     without a scope retain empty allowlist = full catalog. Persisted agents
     fail closed during the `agentsMap` hydration window so the user cannot
     pick a skill the backend will then refuse, and again when the map is
     authoritative but the agent isn't in it (deleted, or VIEW revoked
     mid-session). `agentId` is threaded in as a prop so this component stays
     memoizable. */
  const { agentSkillIds, isAgentDisabled } = useMemo<{
    agentSkillIds: string[] | null | undefined;
    isAgentDisabled: boolean;
  }>(() => {
    if (!agentId || isEphemeralAgent(agentId)) {
      return { agentSkillIds: undefined, isAgentDisabled: false };
    }
    if (!agentsMap) {
      return { agentSkillIds: [], isAgentDisabled: false };
    }
    const agent = agentsMap[agentId];
    if (!agent) {
      return { agentSkillIds: [], isAgentDisabled: false };
    }
    if (agent.skills_enabled !== true) {
      return { agentSkillIds: [], isAgentDisabled: true };
    }
    const scope = resolveAgentSkillsScope(agent.skills, agent.skills_enabled, agent.skills_scope);
    if (scope === SkillsScope.none) {
      return { agentSkillIds: [], isAgentDisabled: true };
    }
    if (scope === SkillsScope.all) {
      return { agentSkillIds: undefined, isAgentDisabled: false };
    }
    return { agentSkillIds: agent.skills ?? [], isAgentDisabled: false };
  }, [agentId, agentsMap]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSkillsInfiniteQuery({ limit: 50 });

  /* Auto-fetch all pages so client-side search covers the full catalog,
     not just the first page. The skills API is server-side capped. */
  useEffect(() => {
    if (isError) {
      return;
    }
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const allSkills = useMemo<TSkillSummary[]>(() => {
    if (!data?.pages) {
      return [];
    }
    const skills: TSkillSummary[] = [];
    for (const page of data.pages) {
      for (const skill of page.skills) {
        skills.push(skill);
      }
    }
    return skills;
  }, [data?.pages]);

  const skillOptions: MentionOption[] = useMemo(() => {
    const filtered = filterSkillsForPopover(allSkills, { agentSkillIds, isActive });
    const options: MentionOption[] = [];
    for (const skill of filtered) {
      options.push({
        label: skill.displayTitle ?? skill.name,
        value: skill.name,
        description: skill.description,
        type: 'skill',
        icon: skillIcon,
      });
    }
    return options;
  }, [allSkills, agentSkillIds, isActive]);

  /* Every personally-disabled, manually invocable, in-scope skill — feeds
     the `unscoped-empty` Enable all action. Only meaningful for general chat
     or full-catalog agents: a skill explicitly scoped to an agent is always
     active in that chat, so there is nothing to enable via a bulk toggle. */
  const disabledSkills = useMemo<TSkillSummary[]>(() => {
    if (agentSkillIds != null && agentSkillIds.length > 0) {
      return [];
    }
    return filterSkillsByScope(allSkills, agentSkillIds).filter((skill) => !isActive(skill));
  }, [allSkills, isActive, agentSkillIds]);

  const [activeIndex, setActiveIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: '',
    options: skillOptions,
  });

  const initInputRef = useInitPopoverInput({
    inputRef,
    textAreaRef,
    commandChar,
    preserveTextAfterCursor: true,
    setSearchValue,
    setOpen,
  });

  const handleSelect = useCallback(
    (mention?: MentionOption) => {
      if (!mention) {
        return;
      }

      setSearchValue('');
      setOpen(false);
      setShowSkillsPopover(false);

      setEphemeralAgent((prev) => {
        if (prev?.skills) {
          return prev;
        }
        return { ...(prev || {}), skills: true };
      });

      /* Structured channel for manual skill invocations. The submit
         pipeline reads this and primes SKILL.md as a meta user message
         before the LLM turn — no textarea-level marker is needed, and
         injecting `$skill-name ` as text would mislead users into thinking
         free-form text invocation is supported. Visual confirmation after
         submit comes from `SkillPills` on the user message bubble
         until the live skill-card stream takes over. */
      setPendingManualSkills((prev) =>
        prev.includes(mention.value) ? prev : [...prev, mention.value],
      );

      textAreaRef.current?.focus();
    },
    [
      setSearchValue,
      setOpen,
      setShowSkillsPopover,
      textAreaRef,
      setEphemeralAgent,
      setPendingManualSkills,
    ],
  );

  /* "Enable all" — activates every personally-disabled skill in one atomic
     write. Clears the search term so newly enabled skills become visible.
     onMouseDown prevents the blur-driven auto-close so the popover stays
     open after clicking. */
  const handleEnableSkills = useCallback(
    (skills: TSkillSummary[]) => {
      toggleMany(skills, true);
      setSearchValue('');
    },
    [toggleMany, setSearchValue],
  );

  /* "New General Chat" — delegates to `newGeneralConversation`, which
     resolves the first non-agents endpoint from the already-loaded
     `endpointsConfig` inside `useNewConvo` and passes it explicitly in the
     template. This prevents `buildDefaultConvo` from reading
     `lastConversationSetup` out of localStorage and restoring the previous
     agent via `isExistingAgentConvo`. */
  const handleStartNewChat = useCallback(() => {
    setOpen(false);
    setShowSkillsPopover(false);
    newGeneralConversation();
  }, [setOpen, setShowSkillsPopover, newGeneralConversation]);

  /* "Manage Skills" — expands the persistent app sidebar and switches to the
     Skills section without navigating away from the current chat. */
  const handleManageSkills = useCallback(() => {
    setOpen(false);
    setShowSkillsPopover(false);
    setActive('skills');
    setSidebarExpanded(true);
  }, [setOpen, setShowSkillsPopover, setActive, setSidebarExpanded]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(matches.length - 1, 0)));
  }, [matches.length]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = document.getElementById(`skill-item-${activeIndex}`);
    el?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [activeIndex]);

  const rowRenderer = ({
    index,
    key,
    style,
  }: {
    index: number;
    key: string;
    style: React.CSSProperties;
  }) => {
    const mention = matches[index] as MentionOption;
    return (
      <MentionItem
        index={index}
        type="skill"
        key={key}
        style={style}
        onClick={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = null;
          handleSelect(mention);
        }}
        name={mention.label ?? ''}
        icon={mention.icon}
        description={mention.description}
        isActive={index === activeIndex}
      />
    );
  };

  /* Both catalog pagination and skill-state resolution must complete before
     any empty-state or CTA is shown. Folding `statesLoading` here (following
     the pattern in SkillsSection.tsx) ensures the spinner is visible while
     `isActive` / `disabledSkills` may still return incorrect defaults, so
     Enable all never appears in an unactionable state. */
  const catalogLoading = isLoading || isFetchingNextPage || hasNextPage || statesLoading;
  /* Error from either the catalog fetch or the active-state fetch. */
  const catalogError = isError || statesError;
  const hasEmptyStateActions = open && !catalogLoading && !catalogError && matches.length === 0;

  return (
    <div className="absolute bottom-28 z-10 w-full space-y-2">
      <div
        ref={popoverRef}
        className="popover border-token-border-light rounded-2xl border bg-surface-tertiary-alt p-2 shadow-lg"
        onBlur={(e) => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          if (e.currentTarget.contains(e.relatedTarget)) {
            timeoutRef.current = null;
            return;
          }
          timeoutRef.current = setTimeout(() => {
            if (popoverRef.current?.contains(document.activeElement)) {
              timeoutRef.current = null;
              return;
            }
            setOpen(false);
            setShowSkillsPopover(false);
            timeoutRef.current = null;
          }, 150);
        }}
      >
        <Input
          ref={initInputRef}
          placeholder={localize('com_ui_skills_command_placeholder')}
          className="mb-1 h-auto w-full rounded-none border-0 bg-surface-tertiary-alt p-2 text-sm text-text-primary focus:outline-none"
          autoComplete="off"
          value={searchValue}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setShowSkillsPopover(false);
              textAreaRef.current?.focus();
              return;
            }
            if (e.key === 'ArrowDown') {
              if (matches.length === 0) {
                return;
              }
              setActiveIndex((prevIndex) => (prevIndex + 1) % matches.length);
            } else if (e.key === 'ArrowUp') {
              if (matches.length === 0) {
                return;
              }
              setActiveIndex((prevIndex) => (prevIndex - 1 + matches.length) % matches.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              if (matches.length === 0) {
                /* Forward Tab moves focus into the empty-state actions; the
                   popover-level blur handler dismisses once focus leaves. */
                if (e.key === 'Tab' && !e.shiftKey && hasEmptyStateActions) {
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
                setOpen(false);
                setShowSkillsPopover(false);
                textAreaRef.current?.focus();
                return;
              }
              e.preventDefault();
              handleSelect(matches[activeIndex] as MentionOption | undefined);
            } else if (e.key === 'Backspace' && searchValue === '') {
              setOpen(false);
              setShowSkillsPopover(false);
              textAreaRef.current?.focus();
            }
          }}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {open && !catalogError && catalogLoading && matches.length === 0 && (
          <div className="flex h-32 items-center justify-center text-text-primary">
            <Spinner />
          </div>
        )}
        {open && catalogError && (
          <div className="p-4 text-center text-sm text-text-secondary">
            {localize('com_ui_skills_load_error')}
          </div>
        )}
        {open && !catalogLoading && !catalogError && matches.length === 0 && (
          <SkillsEmptyStateView
            state={resolveSkillsEmptyState({
              allSkills,
              agentSkillIds,
              isAgentDisabled,
              disabledSkills,
            })}
            localize={localize}
            onEnableSkills={handleEnableSkills}
            onNewChat={handleStartNewChat}
            onManageSkills={handleManageSkills}
          />
        )}
        {open && matches.length > 0 && (
          <div className="max-h-40">
            <AutoSizer disableHeight>
              {({ width }) => (
                <List
                  width={width}
                  overscanRowCount={5}
                  rowHeight={ROW_HEIGHT}
                  rowCount={matches.length}
                  rowRenderer={rowRenderer}
                  scrollToIndex={activeIndex}
                  height={Math.min(matches.length * ROW_HEIGHT, 160)}
                />
              )}
            </AutoSizer>
          </div>
        )}
      </div>
    </div>
  );
}

const SkillsCommand = memo(function SkillsCommand({
  index,
  textAreaRef,
  conversationId,
  agentId,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  agentId?: string | null;
}) {
  const show = useAtomValue(showSkillsPopoverFamily(index));
  if (!show) {
    return null;
  }
  return (
    <SkillsCommandContent
      index={index}
      textAreaRef={textAreaRef}
      conversationId={conversationId}
      agentId={agentId}
    />
  );
});

export default SkillsCommand;
