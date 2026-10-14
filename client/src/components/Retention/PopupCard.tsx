import { useState } from 'react';
import { X } from 'lucide-react';
import { Trans } from 'react-i18next';
import { Button, useToastContext } from '@librechat/client';
import type { ExpiringItem, ExpiringItemType } from './types';
import type { TranslationKeys } from '~/hooks';
import { useResourceRenewMutation, useRenewFileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

type ItemLocaleKeys = {
  renew: TranslationKeys;
  renewed: TranslationKeys;
};

const MAX_NAME_LENGTH = 40;

function truncateName(name: string): string {
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

const LOCALE_KEYS: Record<ExpiringItemType, ItemLocaleKeys> = {
  agent: {
    renew: 'com_agents_expiring_soon_renew',
    renewed: 'com_agents_expiring_soon_renewed',
  },
  skill: {
    renew: 'com_skills_expiring_soon_renew',
    renewed: 'com_skills_expiring_soon_renewed',
  },
  file: {
    renew: 'com_files_expiring_soon_renew',
    renewed: 'com_files_expiring_soon_renewed',
  },
};

/**
 * Trans's generic i18nKey type checking against the full TranslationKeys union
 * blows up (TS2590) when the key is a dynamically-typed variable rather than a
 * literal, so each resource type gets its own literal-keyed branch here.
 */
function ExpiringMessage({
  type,
  name,
  date,
}: {
  type: ExpiringItemType;
  name: string;
  date: string;
}) {
  const components = { strong: <strong /> };
  if (type === 'agent') {
    return (
      <Trans
        i18nKey="com_agents_expiring_soon_popup_message"
        values={{ name, date }}
        components={components}
      />
    );
  }
  if (type === 'skill') {
    return (
      <Trans
        i18nKey="com_skills_expiring_soon_popup_message"
        values={{ name, date }}
        components={components}
      />
    );
  }
  return (
    <Trans
      i18nKey="com_files_expiring_soon_popup_message"
      values={{ name, date }}
      components={components}
    />
  );
}

export default function PopupCard({
  item,
  onRenewed,
  onRemoveForever,
}: {
  item: ExpiringItem;
  onRenewed: () => void;
  onRemoveForever: () => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const locale = LOCALE_KEYS[item.type];
  const isFile = item.type === 'file';
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const onRenewSuccess = () => {
    showToast({ message: localize(locale.renewed), status: 'success' });
    onRenewed();
  };

  const renewFile = useRenewFileMutation(isFile ? { onSuccess: onRenewSuccess } : undefined);
  const renewResource = useResourceRenewMutation(item.type === 'skill' ? 'skill' : 'agent', {
    onSuccess: onRenewSuccess,
  });

  const isLoading = isFile ? renewFile.isLoading : renewResource.isLoading;

  const handleRenew = () => {
    if (isFile) {
      renewFile.mutate(item.id);
      return;
    }
    renewResource.mutate(item.id);
  };

  const expiryDate =
    item.expiredAt != null ? formatDate(new Date(item.expiredAt).toISOString()) : '';
  const daysRemaining =
    item.expiredAt != null
      ? Math.max(1, Math.ceil((new Date(item.expiredAt).getTime() - Date.now()) / 86400000))
      : 0;

  if (confirmingRemoval) {
    return (
      <div className="flex flex-col overflow-hidden rounded-md border border-border-medium bg-surface-primary shadow-xl">
        <div className="flex items-center justify-between gap-6 px-3 py-3">
          <span className="flex-1 text-left text-sm text-text-primary">
            {localize(
              daysRemaining === 1
                ? 'com_ui_expiring_item_confirm_remove_message_one'
                : 'com_ui_expiring_item_confirm_remove_message',
              { name: truncateName(item.name), count: daysRemaining },
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRenew}
            disabled={isLoading}
            aria-label={localize(locale.renew)}
            className="shrink-0"
          >
            {localize(locale.renew)}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onRemoveForever}
            className="shrink-0"
            aria-label={localize('com_ui_expiring_item_remove')}
          >
            {localize('com_ui_expiring_item_remove')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border-medium bg-surface-primary shadow-xl">
      <div className="flex items-center justify-between gap-6 px-3 py-3">
        <span className="flex-1 text-left text-sm text-text-primary">
          <ExpiringMessage type={item.type} name={truncateName(item.name)} date={expiryDate} />
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRenew}
          disabled={isLoading}
          aria-label={localize(locale.renew)}
          className="shrink-0"
        >
          {localize(locale.renew)}
        </Button>
        <button
          type="button"
          aria-label={localize('com_ui_close')}
          onClick={() => setConfirmingRemoval(true)}
          className="shrink-0 rounded-sm p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
