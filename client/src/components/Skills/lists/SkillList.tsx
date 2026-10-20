import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { TSkillSummary } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { SkillGroup } from '~/common';
import { useLocalize, useAuthContext } from '~/hooks';
import { resolveSkillGroup } from '~/common';
import SkillListItem from './SkillListItem';
import { Collapse } from '~/components/ui';
import { cn } from '~/utils';

interface SkillListProps {
  skills: TSkillSummary[];
  activeSkillId?: string;
  sectionOpen: boolean;
  onSectionOpenChange: (open: boolean) => void;
}

/**
 * Deloitte Custom Change: order/labels for the Public/Shared/Created by me
 * sections rendered by `SkillList`, driven by the shared `resolveSkillGroup`
 * grouping rule (see `client/src/common/skills.ts`).
 */
const GROUP_ORDER: SkillGroup[] = ['public', 'shared', 'mine'];

const GROUP_LABEL_KEYS: Record<SkillGroup, TranslationKeys> = {
  public: 'com_ui_skills_view_public',
  shared: 'com_ui_skills_view_shared',
  mine: 'com_ui_skills_view_mine',
};

interface SkillListSectionProps {
  group: SkillGroup;
  skills: TSkillSummary[];
  activeSkillId?: string;
  activeFile: string | null;
  expandedSkillId: string | null;
  onToggleExpand: (skillId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One collapsible Public/Shared/Mine section. Hidden entirely when empty.
 * Deloitte Custom Change: open/close state is now a controlled prop (instead
 * of a local `useState`) so `SkillList` can derive an aggregate "is any group
 * visible" signal for the lifted `sectionOpen`/`onSectionOpenChange` contract
 * added upstream for infinite-scroll gating (see `SkillsSidePanel.tsx`).
 */
function SkillListSection({
  group,
  skills,
  activeSkillId,
  activeFile,
  expandedSkillId,
  onToggleExpand,
  open,
  onOpenChange,
}: SkillListSectionProps) {
  const localize = useLocalize();

  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-px">
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex cursor-pointer items-center gap-1.5"
          aria-expanded={open}
          id={`skills-section-${group}`}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-text-secondary transition-transform duration-200',
              open && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="text-xs text-text-secondary">{localize(GROUP_LABEL_KEYS[group])}</span>
        </button>
      </div>

      <Collapse open={open}>
        <div className="flex flex-col gap-px">
          {skills.map((skill) => (
            <SkillListItem
              key={skill._id}
              skill={skill}
              isActive={skill._id === activeSkillId}
              isExpanded={skill._id === expandedSkillId}
              activeFile={skill._id === activeSkillId ? activeFile : null}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

/**
 * Skill list grouped into Public / Shared / Mine sections — the same
 * precedence rule (`resolveSkillGroup`) used by the agent-builder skill
 * picker, so a skill lands in the same bucket on both surfaces.
 */
export default function SkillList({
  skills,
  activeSkillId,
  sectionOpen,
  onSectionOpenChange,
}: SkillListProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [searchParams] = useSearchParams();
  const activeFile = searchParams.get('file');
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(activeSkillId ?? null);
  /**
   * Deloitte Custom Change: one open/closed flag per Public/Shared/Mine
   * group, seeded from the lifted `sectionOpen` prop. `SkillsSidePanel` uses
   * that prop only to gate infinite-scroll fetching while the list is
   * visible, so any group being open is reported upstream as "section open."
   */
  const [groupOpen, setGroupOpen] = useState<Record<SkillGroup, boolean>>({
    public: sectionOpen,
    shared: sectionOpen,
    mine: sectionOpen,
  });

  const grouped = useMemo(() => {
    const buckets: Record<SkillGroup, TSkillSummary[]> = { public: [], shared: [], mine: [] };
    for (const skill of skills) {
      buckets[resolveSkillGroup(skill, user?.id)].push(skill);
    }
    return buckets;
  }, [skills, user?.id]);

  const handleToggleExpand = (id: string) => {
    setExpandedSkillId((prev) => (prev === id ? null : id));
  };

  const handleGroupOpenChange = (group: SkillGroup, open: boolean) => {
    const next = { ...groupOpen, [group]: open };
    setGroupOpen(next);
    onSectionOpenChange(Object.values(next).some(Boolean));
  };

  if (skills.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-text-secondary">
        {localize('com_ui_skills_empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {GROUP_ORDER.map((group) => (
        <SkillListSection
          key={group}
          group={group}
          skills={grouped[group]}
          activeSkillId={activeSkillId}
          activeFile={activeFile}
          expandedSkillId={expandedSkillId}
          onToggleExpand={handleToggleExpand}
          open={groupOpen[group]}
          onOpenChange={(open) => handleGroupOpenChange(group, open)}
        />
      ))}
    </div>
  );
}
