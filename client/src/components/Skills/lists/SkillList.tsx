import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import { useSearchParams } from 'react-router-dom';
import type { TSkill } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { SkillGroup } from '~/common';
import { useLocalize, useAuthContext } from '~/hooks';
import { resolveSkillGroup } from '~/common';
import SkillListItem from './SkillListItem';
import { cn } from '~/utils';

interface SkillListProps {
  skills: TSkill[];
  isLoading: boolean;
  activeSkillId?: string;
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
  skills: TSkill[];
  activeSkillId?: string;
  activeFile: string | null;
  expandedSkillId: string | null;
  onToggleExpand: (skillId: string) => void;
}

/** One collapsible Public/Shared/Mine section. Hidden entirely when empty. */
function SkillListSection({
  group,
  skills,
  activeSkillId,
  activeFile,
  expandedSkillId,
  onToggleExpand,
}: SkillListSectionProps) {
  const localize = useLocalize();
  const [sectionOpen, setSectionOpen] = useState(true);

  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-px">
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          className="flex cursor-pointer items-center gap-1.5"
          aria-expanded={sectionOpen}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-text-secondary transition-transform duration-200',
              sectionOpen && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="text-xs text-text-secondary">{localize(GROUP_LABEL_KEYS[group])}</span>
        </button>
      </div>

      {sectionOpen && (
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
      )}
    </div>
  );
}

/**
 * Skill list grouped into Public / Shared / Mine sections — the same
 * precedence rule (`resolveSkillGroup`) used by the agent-builder skill
 * picker, so a skill lands in the same bucket on both surfaces.
 */
export default function SkillList({ skills, isLoading, activeSkillId }: SkillListProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [searchParams] = useSearchParams();
  const activeFile = searchParams.get('file');
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(activeSkillId ?? null);

  const grouped = useMemo(() => {
    const buckets: Record<SkillGroup, TSkill[]> = { public: [], shared: [], mine: [] };
    for (const skill of skills) {
      buckets[resolveSkillGroup(skill, user?.id)].push(skill);
    }
    return buckets;
  }, [skills, user?.id]);

  const handleToggleExpand = (id: string) => {
    setExpandedSkillId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-2 pt-2">
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    );
  }

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
        />
      ))}
    </div>
  );
}
