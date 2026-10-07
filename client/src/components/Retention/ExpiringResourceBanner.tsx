import { Button, useToastContext } from '@librechat/client';
import type { Agent, TSkill } from 'librechat-data-provider';
import type { RetentionResourceType } from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useGetResourcesExpiringSoonQuery, useResourceRenewMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

type ResourceLocaleKeys = {
  title: TranslationKeys;
  titleOne: TranslationKeys;
  renew: TranslationKeys;
  renewed: TranslationKeys;
};

const LOCALE_KEYS: Record<RetentionResourceType, ResourceLocaleKeys> = {
  agent: {
    title: 'com_agents_expiring_soon_title',
    titleOne: 'com_agents_expiring_soon_title_one',
    renew: 'com_agents_expiring_soon_renew',
    renewed: 'com_agents_expiring_soon_renewed',
  },
  skill: {
    title: 'com_skills_expiring_soon_title',
    titleOne: 'com_skills_expiring_soon_title_one',
    renew: 'com_skills_expiring_soon_renew',
    renewed: 'com_skills_expiring_soon_renewed',
  },
};

function getResourceKey(resourceType: RetentionResourceType, resource: Agent | TSkill): string {
  return resourceType === 'agent' ? (resource as Agent).id : (resource as TSkill)._id;
}

function getResourceName(resourceType: RetentionResourceType, resource: Agent | TSkill): string {
  return resourceType === 'agent' ? ((resource as Agent).name ?? '') : (resource as TSkill).name;
}

export default function ExpiringResourceBanner({
  resourceType,
}: {
  resourceType: RetentionResourceType;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const locale = LOCALE_KEYS[resourceType];
  const { data: resources } = useGetResourcesExpiringSoonQuery(resourceType);
  const renewResource = useResourceRenewMutation(resourceType, {
    onSuccess: () => {
      showToast({ message: localize(locale.renewed), status: 'success' });
    },
  });

  if (!resources || resources.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-20 flex flex-col gap-2 bg-amber-100 px-4 py-2 text-sm text-text-primary dark:bg-amber-900 md:relative"
    >
      <span className="font-medium">
        {localize(resources.length === 1 ? locale.titleOne : locale.title, {
          count: resources.length,
        })}
      </span>
      <ul className="flex flex-col gap-1">
        {resources.map((resource) => {
          const key = getResourceKey(resourceType, resource);
          return (
            <li key={key} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {getResourceName(resourceType, resource)}
                {resource.expiredAt != null && (
                  <span className="ml-2 text-text-secondary">
                    {formatDate(new Date(resource.expiredAt).toISOString())}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={localize(locale.renew)}
                onClick={() => renewResource.mutate(key)}
                disabled={renewResource.isLoading}
              >
                {localize(locale.renew)}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
