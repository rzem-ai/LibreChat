import { useEffect, useState } from 'react';
import copy from 'copy-to-clipboard';
import { Check, Copy } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import { useLocalize } from '~/hooks';

interface TryThisProps {
  action: string;
  prompt: string;
  /** Set when a "Try this now" heading already sits above the cue, so the label isn't repeated. */
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
    <div className="mt-4">
      <p className="!mt-0">
        {!closing && <span className="font-medium">{localize('com_learning_try_this')} </span>}
        {action}
      </p>
      <div className="relative mt-3 rounded-lg bg-surface-tertiary">
        <div className="whitespace-pre-wrap p-4 pr-12 font-mono text-sm text-text-primary">
          {prompt}
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={localize('com_learning_copy_prompt')}
          className="absolute right-2 top-2 rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
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
    </div>
  );
}
