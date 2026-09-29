import { X } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface TourPopoverProps {
  titleHtml: string;
  descriptionHtml: string;
  progressText: string;
  nextLabel: string;
  canGoPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

const footerButtonClassName = 'h-8 text-xs';

/**
 * Getting Started tour popover content, mounted into driver.js's popover
 * wrapper via `onPopoverRender` in useGettingStartedTour.ts. driver.js still
 * owns positioning; this replaces the content it would otherwise render.
 */
export default function TourPopover({
  titleHtml,
  descriptionHtml,
  progressText,
  nextLabel,
  canGoPrevious,
  onPrevious,
  onNext,
  onClose,
}: TourPopoverProps) {
  const localize = useLocalize();
  return (
    <div className="max-w-[320px] rounded-xl bg-surface-primary p-4 font-sans text-text-primary shadow-lg duration-150 animate-in fade-in-0">
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-medium leading-tight text-text-primary"
          dangerouslySetInnerHTML={{ __html: titleHtml }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={localize('com_ui_close')}
          className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary focus:text-text-primary"
        >
          <X className="size-4" />
        </button>
      </div>
      <p
        className="mt-1.5 text-xs leading-relaxed text-text-secondary"
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      />
      <div className="mt-3.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-tertiary">{progressText}</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGoPrevious}
            onClick={onPrevious}
            className={footerButtonClassName}
          >
            {localize('com_learning_tour_previous')}
          </Button>
          <Button
            type="button"
            variant="submit"
            size="sm"
            onClick={onNext}
            className={footerButtonClassName}
          >
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
