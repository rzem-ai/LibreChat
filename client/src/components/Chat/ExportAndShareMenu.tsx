import { useState, useId } from 'react';
import { Share2 } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup, TooltipAnchor, useMediaQuery } from '@librechat/client';
import useExportShare from '~/hooks/Chat/useExportShare';
import { useLocalize } from '~/hooks';

export default function ExportAndShareMenu({
  isExportEnabled,
  isSharedButtonEnabled,
}: {
  isExportEnabled: boolean;
  isSharedButtonEnabled: boolean;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { show, items, hasSharedLink, dialogs } = useExportShare({ isSharedButtonEnabled });

  if (!show) {
    return null;
  }

  const description = localize(
    hasSharedLink ? 'com_ui_export_share_link_active' : 'com_endpoint_export_share',
  );

  /** Deloitte Custom Change: the shared `useExportShare` hook always includes the export
   *  item; gate it here by the `exportChat` interface flag so "Disable features via
   *  librechat.yaml" (PR #411) still hides export when the deployment turned it off. The
   *  share item is already gated inside the hook via `isSharedButtonEnabled`. */
  const exportLabel = localize('com_endpoint_export');
  const gatedItems = items.map((item) =>
    item.label === exportLabel ? { ...item, show: isExportEnabled } : item,
  );

  return (
    <>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        unmountOnHide={true}
        isOpen={isPopoverActive}
        setIsOpen={setIsPopoverActive}
        trigger={
          <TooltipAnchor
            description={description}
            render={
              <Ariakit.MenuButton
                id="export-menu-button"
                aria-label={description}
                className="relative inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
              >
                <Share2
                  className="icon-md text-text-primary"
                  aria-hidden="true"
                  focusable="false"
                />
                {hasSharedLink && (
                  <span
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-status-info ring-2 ring-presentation"
                    data-testid="header-shared-link-indicator"
                    aria-hidden="true"
                  />
                )}
              </Ariakit.MenuButton>
            }
          />
        }
        items={gatedItems}
        className={isSmallScreen ? '' : 'absolute right-0 top-0 mt-2'}
      />
      {dialogs}
    </>
  );
}
