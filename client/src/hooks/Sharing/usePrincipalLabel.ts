// Deloitte Custom Change: builds people picker copy from the principal types enabled in config.
import { useMemo } from 'react';
import { usePeoplePickerPermissions } from './usePeoplePickerPermissions';
import { joinList } from './principals';
import { useLocalize } from '~/hooks';

type Conjunction = 'and' | 'or';
type Form = 'plural' | 'singular';

const KEYS = {
  plural: ['com_ui_users', 'com_ui_groups', 'com_ui_roles'],
  singular: ['com_ui_user', 'com_ui_group', 'com_ui_role'],
} as const;

/**
 * Lists the principal types the people picker allows (users, groups, roles), e.g.
 * `users or roles` / `User, Group and Role`. Falls back to all types when none are allowed,
 * matching the unfiltered picker.
 */
export const usePrincipalLabel = (conjunction: Conjunction, form: Form): string => {
  const localize = useLocalize();
  const { canViewUsers, canViewGroups, canViewRoles } = usePeoplePickerPermissions();

  return useMemo(() => {
    const allowed = [canViewUsers, canViewGroups, canViewRoles];
    const enabled = allowed.some(Boolean) ? allowed : [true, true, true];
    const labels = KEYS[form].filter((_, i) => enabled[i]).map((key) => localize(key));
    return joinList(labels, localize(conjunction === 'and' ? 'com_ui_and' : 'com_ui_or'));
  }, [canViewUsers, canViewGroups, canViewRoles, conjunction, form, localize]);
};
