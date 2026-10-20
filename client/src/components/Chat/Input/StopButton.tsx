import { memo } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
// Deloitte Custom Change: restore cn for the GEL bg-primary CTA styling kept below; composerSubmitClasses is upstream's generic style and isn't used here
import { cn } from '~/utils';

export default memo(function StopButton({
  stop,
  setShowStopButton,
}: {
  stop: (e: React.MouseEvent<HTMLButtonElement>) => void;
  setShowStopButton: (value: boolean) => void;
}) {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_nav_stop_generating')}
      render={
        <button
          type="button"
          data-testid="stop-generation-button"
          // Deloitte Custom Change: keep GEL brand CTA styling (bg-primary) instead of upstream's composerSubmitClasses(), pairing with the icon's text-primary-foreground below
          className={cn(
            'rounded-full bg-primary p-1.5 text-primary-foreground outline-offset-4 transition-all duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary',
          )}
          aria-label={localize('com_nav_stop_generating')}
          onClick={(e) => {
            setShowStopButton(false);
            stop(e);
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="icon-lg text-primary-foreground"
          >
            <rect x="7" y="7" width="10" height="10" rx="1.25" fill="currentColor"></rect>
          </svg>
        </button>
      }
    ></TooltipAnchor>
  );
});
