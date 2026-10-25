// Deloitte Custom Change: covers copy for each enabled principal type combination.
import { renderHook } from '@testing-library/react';
import { usePrincipalLabel } from '../usePrincipalLabel';

const mockPermissions = jest.fn();

const translations: Record<string, string> = {
  com_ui_users: 'users',
  com_ui_groups: 'groups',
  com_ui_roles: 'roles',
  com_ui_user: 'User',
  com_ui_group: 'Group',
  com_ui_role: 'Role',
  com_ui_and: 'and',
  com_ui_or: 'or',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => translations[key],
}));

jest.mock('../usePeoplePickerPermissions', () => ({
  usePeoplePickerPermissions: () => mockPermissions(),
}));

const setPermissions = (canViewUsers: boolean, canViewGroups: boolean, canViewRoles: boolean) =>
  mockPermissions.mockReturnValue({ canViewUsers, canViewGroups, canViewRoles });

describe('usePrincipalLabel', () => {
  it('lists every type when all are enabled', () => {
    setPermissions(true, true, true);
    expect(renderHook(() => usePrincipalLabel('or', 'plural')).result.current).toBe(
      'users, groups or roles',
    );
    expect(renderHook(() => usePrincipalLabel('and', 'singular')).result.current).toBe(
      'User, Group and Role',
    );
  });

  it('omits groups when groups are disabled', () => {
    setPermissions(true, false, true);
    expect(renderHook(() => usePrincipalLabel('or', 'plural')).result.current).toBe(
      'users or roles',
    );
    expect(renderHook(() => usePrincipalLabel('and', 'singular')).result.current).toBe(
      'User and Role',
    );
  });

  it('omits roles when roles are disabled', () => {
    setPermissions(true, true, false);
    expect(renderHook(() => usePrincipalLabel('and', 'singular')).result.current).toBe(
      'User and Group',
    );
  });

  it('returns a single type when only one is enabled', () => {
    setPermissions(true, false, false);
    expect(renderHook(() => usePrincipalLabel('or', 'plural')).result.current).toBe('users');
  });

  it('falls back to all types when none are enabled', () => {
    setPermissions(false, false, false);
    expect(renderHook(() => usePrincipalLabel('or', 'plural')).result.current).toBe(
      'users, groups or roles',
    );
  });
});
