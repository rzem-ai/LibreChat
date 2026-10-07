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
import { cn } from '~/utils';

// Re-exported under the Gel prefix too — it's just the Radix root/context provider with no
// styling of its own, but keeping the name consistent avoids mixing OGDialog/GelDialog* in callers.
export { OGDialog as GelDialog };

export const GelDialogContent: React.ForwardRefExoticComponent<
  Omit<React.ComponentPropsWithoutRef<typeof OGDialogContent>, 'ref'> &
    React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  React.ElementRef<typeof OGDialogContent>,
  React.ComponentPropsWithoutRef<typeof OGDialogContent>
>(({ className, showCloseButton = false, ...props }, ref) => (
  <OGDialogContent
    ref={ref}
    showCloseButton={showCloseButton}
    className={cn(
      'overflow-hidden rounded-xl border border-border-light bg-surface-dialog p-0 shadow-lg',
      className,
    )}
    {...props}
  />
));
GelDialogContent.displayName = 'GelDialogContent';

export interface GelDialogHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Renders a close (X) button that dismisses the dialog. Omit for dialogs that require an explicit choice. */
  onClose?: () => void;
}

export const GelDialogHeader = ({
  title,
  eyebrow,
  description,
  onClose,
  className,
  ...props
}: GelDialogHeaderProps): React.JSX.Element => (
  <div
    className={cn(
      'flex items-start justify-between gap-3 border-b border-border-light px-6 py-4',
      className,
    )}
    {...props}
  >
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
        <span className="sr-only">Close</span>
      </OGDialogClose>
    )}
  </div>
);

export const GelDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <OGDialogFooter
    className={cn('justify-end gap-3 px-6 py-4 sm:space-x-0', className)}
    {...props}
  />
);
