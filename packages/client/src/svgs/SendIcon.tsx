import { JSX } from 'react/jsx-runtime';
import { cn } from '~/utils';

export default function SendIcon({
  size = 24,
  className = '',
}: {
  size?: number | undefined;
  className?: string | undefined;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox={'0 0 24 24'}
      fill="none"
      // Deloitte Custom Change: text-primary-foreground pairs with SendButton's GEL bg-primary CTA styling (upstream's text-text-inverted assumes the default dark SendButton background)
      className={cn('text-primary-foreground', className)}
      aria-hidden="true"
    >
      <path
        d="M7 11L12 6L17 11M12 18V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
