import React from 'react';
import { ResourceType } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TPrincipal } from 'librechat-data-provider';
import '@testing-library/jest-dom/extend-expect';
import GenericGrantAccessDialog from '../GenericGrantAccessDialog';

const mockRefetchPermissions = jest.fn();
const mockUseResourcePermissionState = jest.fn();
const mockUseAuthContext = jest.fn(() => ({ user: { role: 'ADMIN', id: 'user-1' } }));
const mockUsePeoplePickerPermissions = jest.fn(() => ({
  hasPeoplePickerAccess: true,
  peoplePickerTypeFilter: '' as string | null,
}));
const mockUseCanSharePublic = jest.fn(() => true);

const config = {
  defaultViewerRoleId: 'viewer',
  defaultEditorRoleId: 'editor',
  defaultOwnerRoleId: 'owner',
  getShareMessage: () => 'Share Agent',
  getResourceUrl: () => 'http://localhost/agent/1',
  getCopyUrlMessage: () => 'Copied',
};

const baseState = (overrides: Record<string, unknown> = {}) => ({
  config,
  permissionsData: { principals: [], public: false },
  isLoadingPermissions: false,
  isFetchingPermissions: false,
  permissionsError: null,
  refetchPermissions: mockRefetchPermissions,
  updatePermissionsMutation: { isLoading: false, mutateAsync: jest.fn() },
  currentShares: [],
  currentIsPublic: false,
  currentPublicRole: 'viewer',
  isPublic: false,
  setIsPublic: jest.fn(),
  publicRole: 'viewer',
  setPublicRole: jest.fn(),
  ...overrides,
});

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockUseAuthContext(),
  // Deloitte Custom Change: echoes the interpolated principal list for the heading/placeholder keys.
  useLocalize: () => (key: string, args?: Record<string, string>) =>
    key.endsWith('principals_permissions') || key.endsWith('principals_placeholder')
      ? `${key}:${args?.[0]}`
      : key,
  // Deloitte Custom Change: stubbed so the dialog test asserts wiring, not label building.
  usePrincipalLabel: (conjunction: string, form: string) => `${conjunction}-${form}`,
  useResourcePermissionState: () => mockUseResourcePermissionState(),
  usePeoplePickerPermissions: () => mockUsePeoplePickerPermissions(),
  useCanSharePublic: () => mockUseCanSharePublic(),
  useCopyToClipboard: () => jest.fn(),
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('../PeoplePicker/UnifiedPeopleSearch', () => ({
  __esModule: true,
  // Deloitte Custom Change: renders the placeholder so the dialog's copy can be asserted.
  default: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="unified-people-search">{placeholder}</div>
  ),
}));
jest.mock('../PeoplePickerAdminSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="admin-settings" />,
}));
jest.mock('../PublicSharingToggle', () => ({
  __esModule: true,
  default: () => <div data-testid="public-toggle" />,
}));
// Deloitte Custom Change: Exposes `onRoleChange`/`onRemoveHandler` as clickable
// controls (instead of an inert stub) so tests can drive the Skill
// editor-access-warning logic in GenericGrantAccessDialog without re-testing
// AccessRolesPicker's own dropdown interaction, which is covered elsewhere.
jest.mock('../PeoplePicker', () => ({
  __esModule: true,
  SelectedPrincipalsList: ({
    principles,
    onRoleChange,
    onRemoveHandler,
  }: {
    principles: TPrincipal[];
    onRoleChange?: (shareKey: string, newRole: string) => void;
    onRemoveHandler: (shareKey: string) => void;
  }) => (
    <div data-testid="principals-list">
      {principles.map((principal) => {
        // Mirrors `principalKey` from `../shareChanges`, inlined because jest.mock's
        // factory may not reference out-of-scope, non-`mock`-prefixed identifiers.
        const shareKey = `${principal.type}-${principal.id ?? principal.idOnTheSource}`;
        return (
          <div key={shareKey} data-testid={`principal-${principal.id}`}>
            <button onClick={() => onRoleChange?.(shareKey, 'viewer')}>
              {`make-viewer-${principal.id}`}
            </button>
            <button onClick={() => onRoleChange?.(shareKey, 'editor')}>
              {`make-editor-${principal.id}`}
            </button>
            <button onClick={() => onRemoveHandler(shareKey)}>{`remove-${principal.id}`}</button>
          </div>
        );
      })}
    </div>
  ),
}));

const renderDialog = (overrides: Record<string, unknown> = {}) =>
  render(
    <GenericGrantAccessDialog
      resourceDbId="agent-db-1"
      resourceId="agent-1"
      resourceName="Test Agent"
      resourceType={ResourceType.AGENT}
      {...overrides}
    />,
  );

describe('GenericGrantAccessDialog - permissions load failure', () => {
  beforeEach(() => {
    mockUseResourcePermissionState.mockReset();
    mockRefetchPermissions.mockReset();
    mockUseAuthContext.mockReturnValue({ user: { role: 'ADMIN', id: 'user-1' } });
    mockUsePeoplePickerPermissions.mockReturnValue({
      hasPeoplePickerAccess: true,
      peoplePickerTypeFilter: '',
    });
    mockUseCanSharePublic.mockReturnValue(true);
  });

  it('renders a compact alert button (not the share trigger, not raw text) when permissions fail to load', () => {
    mockUseResourcePermissionState.mockReturnValue(
      baseState({ permissionsError: new Error('boom'), permissionsData: undefined }),
    );

    const { container } = renderDialog();

    expect(
      screen.getByRole('button', { name: 'com_ui_permissions_failed_load' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_share_var' })).not.toBeInTheDocument();
    expect(container.querySelector('.spinner')).not.toBeInTheDocument();
  });

  it('retries the permissions fetch when the alert button is clicked', () => {
    mockUseResourcePermissionState.mockReturnValue(
      baseState({ permissionsError: new Error('boom'), permissionsData: undefined }),
    );

    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_permissions_failed_load' }));
    expect(mockRefetchPermissions).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner instead of the alert icon while refetching', () => {
    mockUseResourcePermissionState.mockReturnValue(
      baseState({
        permissionsError: new Error('boom'),
        permissionsData: undefined,
        isFetchingPermissions: true,
      }),
    );

    const { container } = renderDialog();

    expect(
      screen.getByRole('button', { name: 'com_ui_permissions_failed_load' }),
    ).toBeInTheDocument();
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('renders the normal share trigger and dialog body when permissions load successfully', () => {
    mockUseResourcePermissionState.mockReturnValue(baseState());

    renderDialog();

    expect(
      screen.queryByRole('button', { name: 'com_ui_permissions_failed_load' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveClass('max-w-5xl', 'overflow-hidden', 'p-0');
    // Deloitte Custom Change: heading lists enabled principal types.
    expect(
      screen.getByRole('heading', { level: 3, name: 'com_ui_principals_permissions:and-singular' }),
    ).toBeInTheDocument();
    expect(screen.getByText('com_ui_share_access_description')).toHaveClass('sr-only');
    expect(screen.getByTestId('unified-people-search').closest('section')).toHaveClass('w-full');
    // Deloitte Custom Change: placeholder lists enabled principal types.
    expect(screen.getByTestId('unified-people-search')).toHaveTextContent(
      'com_ui_search_principals_placeholder:or-plural',
    );
    // Deloitte Custom Change: verify the firm-wide capability publication prompt and form link.
    expect(screen.getByText('com_ui_share_publish_capability_prompt')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'com_ui_share_publish_capability_link' }),
    ).toHaveAttribute('href', 'https://forms.cloud.microsoft/e/r5Q2gGYGQJ');
    expect(screen.getByTestId('public-toggle').parentElement).toHaveClass('border-t');
    expect(screen.getByTestId('admin-settings')).toBeInTheDocument();
    expect(dialog.firstElementChild).not.toHaveClass('border-b');
    const saveButton = screen.getByRole('button', { name: 'com_ui_save' });
    // Save's direct parent is the action row; `bg-transparent`/`border-t` live one
    // level up, on the dialog footer itself (the warning row renders as a sibling
    // above this action row when `showEditorAccessWarning` is true).
    const footer = saveButton.parentElement?.parentElement;
    expect(footer).toHaveClass('bg-transparent');
    expect(footer).not.toHaveClass('border-t');
    expect(saveButton).toHaveClass('sm:w-auto');
    expect(saveButton).not.toHaveClass('min-w-[140px]');
    expect(screen.queryByRole('button', { name: 'com_ui_cancel' })).not.toBeInTheDocument();
  });

  it('shows the capability publication prompt and form link for skills', () => {
    mockUseResourcePermissionState.mockReturnValue(baseState());

    renderDialog({ resourceType: ResourceType.SKILL });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));

    expect(screen.getByText('com_ui_share_publish_capability_prompt')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'com_ui_share_publish_capability_link' }),
    ).toHaveAttribute('href', 'https://forms.cloud.microsoft/e/r5Q2gGYGQJ');
  });

  it('does not show the capability publication prompt for other resource types', () => {
    mockUseResourcePermissionState.mockReturnValue(baseState());

    renderDialog({ resourceType: ResourceType.REMOTE_AGENT });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));

    expect(screen.queryByText('com_ui_share_publish_capability_prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'com_ui_share_publish_capability_link' }),
    ).not.toBeInTheDocument();
  });

  it('lets an admin manage agent principals without people picker or public sharing permissions', () => {
    mockUseResourcePermissionState.mockReturnValue(baseState());
    mockUsePeoplePickerPermissions.mockReturnValue({
      hasPeoplePickerAccess: false,
      peoplePickerTypeFilter: null,
    });
    mockUseCanSharePublic.mockReturnValue(false);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));

    expect(screen.getByTestId('unified-people-search')).toBeInTheDocument();
    // Deloitte Custom Change: heading lists enabled principal types.
    expect(
      screen.getByRole('heading', { level: 3, name: 'com_ui_principals_permissions:and-singular' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('public-toggle')).not.toBeInTheDocument();
  });

  it('discards the draft through the shared close path', () => {
    const setIsPublic = jest.fn();
    const setPublicRole = jest.fn();
    mockUseResourcePermissionState.mockReturnValue(baseState({ setIsPublic, setPublicRole }));

    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(setIsPublic).toHaveBeenCalledWith(false);
    expect(setPublicRole).toHaveBeenCalledWith('viewer');
  });
});

// Deloitte Custom Change: Warn a Skill owner, before saving, when the unsaved
// sharing draft grants Editor access to someone else.
describe('GenericGrantAccessDialog - skill editor access warning', () => {
  // `type`/`accessRoleId` are plain strings here (matching the plain-string
  // `config` mock above) rather than the real `PrincipalType`/`AccessRoleIds`
  // enums, so these fixtures go through `unknown` before `TPrincipal`.
  const owner = {
    type: 'user',
    id: 'user-1',
    name: 'Owner',
    accessRoleId: 'owner',
  } as unknown as TPrincipal;
  const editor = {
    type: 'user',
    id: 'user-2',
    name: 'Editor Person',
    accessRoleId: 'editor',
  } as unknown as TPrincipal;
  const viewer = {
    type: 'user',
    id: 'user-3',
    name: 'Viewer Person',
    accessRoleId: 'viewer',
  } as unknown as TPrincipal;
  const secondOwner = {
    type: 'user',
    id: 'user-4',
    name: 'Second Owner',
    accessRoleId: 'owner',
  } as unknown as TPrincipal;

  const renderSkillDialog = (principals: TPrincipal[], overrides: Record<string, unknown> = {}) => {
    mockUseResourcePermissionState.mockReturnValue(
      baseState({
        permissionsData: { principals, public: false },
        currentShares: principals,
        ...overrides,
      }),
    );
    renderDialog({
      resourceDbId: 'skill-db-1',
      resourceId: 'skill-1',
      resourceName: 'Test Skill',
      resourceType: ResourceType.SKILL,
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));
  };

  beforeEach(() => {
    mockUseResourcePermissionState.mockReset();
    mockUseAuthContext.mockReturnValue({ user: { role: 'USER', id: 'user-1' } });
    mockUsePeoplePickerPermissions.mockReturnValue({
      hasPeoplePickerAccess: true,
      peoplePickerTypeFilter: '',
    });
    mockUseCanSharePublic.mockReturnValue(true);
  });

  it('shows the warning when the owner has an Editor in the unsaved draft', () => {
    renderSkillDialog([owner, editor]);

    expect(screen.getByText('com_ui_skill_editor_access_warning')).toBeInTheDocument();
  });

  it('does not show the warning when the draft only has Viewers', () => {
    renderSkillDialog([owner, viewer]);

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });

  it('does not show the warning for a non-owner viewing the same draft', () => {
    mockUseAuthContext.mockReturnValue({ user: { role: 'USER', id: 'user-2' } });
    renderSkillDialog([owner, editor]);

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });

  it('does not show the warning for a non-Skill resource even with an Editor in the draft', () => {
    mockUseResourcePermissionState.mockReturnValue(
      baseState({
        permissionsData: { principals: [owner, editor], public: false },
        currentShares: [owner, editor],
      }),
    );
    renderDialog({ resourceType: ResourceType.AGENT });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_share_var' }));

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });

  it('disappears once the only Editor is downgraded to Viewer, before saving', () => {
    renderSkillDialog([owner, editor]);

    expect(screen.getByText('com_ui_skill_editor_access_warning')).toBeInTheDocument();

    fireEvent.click(screen.getByText(`make-viewer-${editor.id}`));

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });

  it('disappears once the only Editor is removed from the draft, before saving', () => {
    renderSkillDialog([owner, editor]);

    expect(screen.getByText('com_ui_skill_editor_access_warning')).toBeInTheDocument();

    fireEvent.click(screen.getByText(`remove-${editor.id}`));

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });

  it('appears once a Viewer is promoted to Editor in the draft, before saving', () => {
    renderSkillDialog([owner, viewer]);

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(`make-editor-${viewer.id}`));

    expect(screen.getByText('com_ui_skill_editor_access_warning')).toBeInTheDocument();
  });

  // Deloitte Custom Change: With two persisted owners, the current user removing their
  // own owner entry from the draft must not hide the warning — they are still a
  // persisted owner of the Skill until the draft is saved.
  it('still shows the warning when the owner removes their own entry from the draft', () => {
    renderSkillDialog([owner, secondOwner, viewer]);

    fireEvent.click(screen.getByText(`remove-${owner.id}`));
    fireEvent.click(screen.getByText(`make-editor-${viewer.id}`));

    expect(screen.getByText('com_ui_skill_editor_access_warning')).toBeInTheDocument();
  });

  // Deloitte Custom Change: Granting Editor access to everyone via the public toggle
  // is the broadest form of the Editor grant this warning exists for, so it must
  // surface the warning the same as an individual Editor share.
  it('shows the warning when public access is enabled with the Editor role', () => {
    renderSkillDialog([owner], { isPublic: true, publicRole: 'editor' });

    expect(screen.getByText('com_ui_skill_editor_access_warning')).toBeInTheDocument();
  });

  it('does not show the warning when public access is off, even with the Editor role set', () => {
    renderSkillDialog([owner], { isPublic: false, publicRole: 'editor' });

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });

  it('does not show the warning when public access is enabled with the Viewer role', () => {
    renderSkillDialog([owner], { isPublic: true, publicRole: 'viewer' });

    expect(screen.queryByText('com_ui_skill_editor_access_warning')).not.toBeInTheDocument();
  });
});
