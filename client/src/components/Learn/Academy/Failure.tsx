import { Button } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { useLocalize } from '~/hooks';

interface FailureProps {
  onRetry: () => void;
}

export default function Failure({ onRetry }: FailureProps): JSX.Element {
  const localize = useLocalize();

  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-text-secondary">{localize('com_learning_load_error')}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {localize('com_ui_retry')}
      </Button>
    </div>
  );
}
