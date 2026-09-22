import { useState } from 'react';
import { Star } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const STAR_VALUES = [1, 2, 3, 4, 5];

type RatingStarsProps = {
  selected: number | null;
  onSelect: (value: number) => void;
};

export default function RatingStars({ selected, onSelect }: RatingStarsProps) {
  const localize = useLocalize();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div
      data-testid="course-rating-prompt"
      className="flex flex-col items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3"
    >
      <p className="text-xs font-semibold text-text-primary">
        {localize('com_learning_rate_prompt')}
      </p>
      <div
        className="mt-1 flex items-center gap-1"
        role="radiogroup"
        aria-label={localize('com_learning_rate_prompt')}
        onMouseLeave={() => setHovered(null)}
      >
        {STAR_VALUES.map((value) => {
          const isFilled = value <= (hovered ?? selected ?? 0);
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected === value}
              aria-label={String(value)}
              onMouseEnter={() => setHovered(value)}
              onClick={() => onSelect(value)}
              data-testid={`course-rating-star-${value}`}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  'size-5',
                  isFilled ? 'fill-current text-surface-submit' : 'text-text-tertiary',
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
