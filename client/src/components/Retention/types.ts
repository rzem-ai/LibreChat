import type { RetentionResourceType } from '~/data-provider';

export type ExpiringItemType = RetentionResourceType | 'file';

export type ExpiringItem = {
  type: ExpiringItemType;
  id: string;
  name: string;
  expiredAt: string | Date | null;
};
