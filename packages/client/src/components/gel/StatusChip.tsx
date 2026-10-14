import type { JSX } from 'react/jsx-runtime';
import type { TourStatus } from './types';
import { Chip } from '../Chip';

interface StatusChipProps {
  status: TourStatus;
  /** Already-localized text, e.g. "Complete" or "60% complete". */
  label: string;
}

export function StatusChip({ status, label }: StatusChipProps): JSX.Element {
  return <Chip tone={status === 'complete' ? 'success' : 'neutral'}>{label}</Chip>;
}
