import { Chip } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import type { TourStatus } from '../content/schema';

interface StatusChipProps {
  status: TourStatus;
  /** Already-localized text, e.g. "Complete" or "60% complete". */
  label: string;
}

export function StatusChip({ status, label }: StatusChipProps): JSX.Element {
  return <Chip tone={status === 'complete' ? 'success' : 'neutral'}>{label}</Chip>;
}
