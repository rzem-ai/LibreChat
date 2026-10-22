import { useEffect, useState } from 'react';
import copy from 'copy-to-clipboard';
import { Check, Copy } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import { useLocalize } from '~/hooks';

interface TryThisProps {
  action: string;
  prompt: string;
  closing?: boolean;
}

const COPIED_RESET_MS = 2000;

export function TryThis({ action, prompt, closing = false }: TryThisProps): JSX.Element {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = (): void => {
    copy(prompt);
    setCopied(true);
  };

  return (
    <aside className="mt-6 rounded-xl border border-border-heavy bg-surface-secondary p-4">
      <div className="text-sm">
        <span className="font-medium">
          {localize(closing ? 'com_learning_try_this_now' : 'com_learning_try_this')}
        </span>{' '}
        {action}
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-lg bg-surface-primary p-3">
        <span className="flex-1 whitespace-pre-line text-sm italic text-text-primary">
          {`“${prompt}”`}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={localize('com_learning_copy_prompt')}
          className="shrink-0 rounded-md p-1.5 text-text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <span className="sr-only" role="status">
        {copied ? localize('com_learning_copied') : ''}
      </span>
    </aside>
  );
}
