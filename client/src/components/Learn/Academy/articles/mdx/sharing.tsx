import type { JSX } from 'react/jsx-runtime';
import { useLocalize } from '~/hooks';

export function SharingNote(): JSX.Element {
  const localize = useLocalize();

  return <p>{localize('com_learning_sharing_note')}</p>;
}
