import { useMemo } from 'react';
import type { Agent, TSkill } from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import type { ExpiringItem } from './types';
import { useGetResourcesExpiringSoonQuery, useGetFilesExpiringSoonQuery } from '~/data-provider';

function toAgentItem(agent: Agent): ExpiringItem {
  return {
    type: 'agent',
    id: agent.id,
    name: agent.name ?? '',
    expiredAt: agent.expiredAt ?? null,
  };
}

function toSkillItem(skill: TSkill): ExpiringItem {
  return { type: 'skill', id: skill._id, name: skill.name, expiredAt: skill.expiredAt ?? null };
}

function toFileItem(file: t.TFile): ExpiringItem {
  return { type: 'file', id: file.file_id, name: file.filename, expiredAt: file.expiredAt ?? null };
}

function expiredAtTime(item: ExpiringItem): number {
  return item.expiredAt ? new Date(item.expiredAt).getTime() : Infinity;
}

export type ExpiringItemsResult = {
  items: ExpiringItem[];
  /** True once all three underlying queries have completed their first fetch. */
  isReady: boolean;
};

/** Combines agents/skills/files expiring soon into one list, soonest-expiring first. */
export function useExpiringItems(): ExpiringItemsResult {
  const agentsQuery = useGetResourcesExpiringSoonQuery('agent');
  const skillsQuery = useGetResourcesExpiringSoonQuery('skill');
  const filesQuery = useGetFilesExpiringSoonQuery();
  const { data: agents } = agentsQuery;
  const { data: skills } = skillsQuery;
  const { data: files } = filesQuery;

  const items = useMemo(() => {
    const combined = [
      ...((agents ?? []) as Agent[]).map(toAgentItem),
      ...((skills ?? []) as TSkill[]).map(toSkillItem),
      ...(files ?? []).map(toFileItem),
    ];
    return combined.sort((a, b) => expiredAtTime(a) - expiredAtTime(b));
  }, [agents, skills, files]);

  const isReady = agentsQuery.isFetched && skillsQuery.isFetched && filesQuery.isFetched;

  return { items, isReady };
}
