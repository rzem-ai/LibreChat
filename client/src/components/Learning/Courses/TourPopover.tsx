import { Button, gelIcons } from '@librechat/client';
import { createConfigHtmlSanitizer } from '~/utils/configHtml';
import { useLocalize } from '~/hooks';

// Several tour descriptions use <br>/<strong> for line breaks and emphasis
// (see content/tours/getting-started.json) — sanitize rather than render as plain
// text, so the markup renders instead of showing up as literal tag text.
const sanitizeDescription = createConfigHtmlSanitizer();

interface TourPopoverProps {
  title: string;
  description: string;
  progressText: string;
  nextLabel: string;
  canGoPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export default function TourPopover({
  title,
  description,
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
        <p className="text-sm font-medium leading-tight text-text-primary">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={localize('com_ui_close')}
          className="flex size-6 shrink-0 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary focus:text-text-primary"
        >
          <gelIcons.close className="size-4" />
        </button>
      </div>
      <p
        className="mt-1.5 text-xs leading-relaxed text-text-secondary"
        dangerouslySetInnerHTML={{ __html: sanitizeDescription(description) }}
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
            className="h-8 text-xs"
          >
            {localize('com_learning_tour_previous')}
          </Button>
          <Button type="button" variant="submit" size="sm" onClick={onNext} className="h-8 text-xs">
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
