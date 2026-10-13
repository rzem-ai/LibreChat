import * as React from 'react';
import { X } from 'lucide-react';
import {
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogFooter,
  OGDialogContent,
  OGDialogDescription,
} from '../OriginalDialog';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export const GelDialog: typeof OGDialog = OGDialog;

export type GelDialogContentProps = React.ComponentProps<typeof OGDialogContent>;

export function GelDialogContent({
  className,
  showCloseButton = false,
  ...props
}: GelDialogContentProps): React.JSX.Element {
  return (
    <OGDialogContent
      showCloseButton={showCloseButton}
      className={cn('gap-0 overflow-hidden rounded-xl bg-surface-dialog p-0 shadow-lg', className)}
      {...props}
    />
  );
}

export interface GelDialogHeaderProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Renders a close (X) button. Omit for dialogs that require an explicit choice. */
  onClose?: () => void;
}

export function GelDialogHeader({
  title,
  eyebrow,
  description,
  onClose,
  className,
  ...props
}: GelDialogHeaderProps): React.JSX.Element {
  const localize = useLocalize();

  return (
    <div className={cn('flex items-start justify-between gap-3 px-6 py-4', className)} {...props}>
      <div className="flex flex-col gap-0.5">
        {eyebrow != null && <p className="text-sm font-medium text-text-secondary">{eyebrow}</p>}
        <OGDialogTitle className="text-xl font-medium tracking-tight text-text-primary">
          {title}
        </OGDialogTitle>
        {description != null && (
          <OGDialogDescription className="text-sm text-text-secondary">
            {description}
          </OGDialogDescription>
        )}
      </div>
      {onClose != null && (
        <OGDialogClose
          onClick={onClose}
          className="shrink-0 rounded-sm text-text-secondary opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">{localize('com_ui_close')}</span>
        </OGDialogClose>
      )}
    </div>
  );
}

export function GelDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof OGDialogFooter>): React.JSX.Element {
  return (
    <OGDialogFooter
      className={cn('justify-end gap-3 px-6 py-4 sm:space-x-0', className)}
      {...props}
    />
  );
}
