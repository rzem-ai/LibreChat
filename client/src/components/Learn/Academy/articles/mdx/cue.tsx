import { useEffect, useState } from 'react';
import copy from 'copy-to-clipboard';
import { Check, Copy, MessageSquare } from 'lucide-react';
import type { JSX } from 'react/jsx-runtime';
import { useLocalize } from '~/hooks';
import { ArticleLink } from './link';
import { cn } from '~/utils';

interface TryThisProps {
  action: string;
  prompt: string;
  /** Set when a "Try this now" heading already sits above the cue, so the label isn't repeated. */
  closing?: boolean;
  /** Set to false when the prompt needs an attachment or earlier context a new chat won't have. */
  chat?: boolean;
}

const COPIED_RESET_MS = 2000;

export function TryThis({
  action,
  prompt,
  closing = false,
  chat = true,
}: TryThisProps): JSX.Element {
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
        {/[.:!?]$/.test(action) ? action : `${action}:`}
      </p>
      <div className="relative mt-3 rounded-lg border border-border-light bg-surface-primary">
        <div className={cn('whitespace-pre-wrap p-4 pb-14 font-mono text-sm text-text-primary')}>
          {prompt}
        </div>
        {chat ? (
          <ArticleLink
            bare
            href={`/c/new?prompt=${encodeURIComponent(prompt)}`}
            className="absolute bottom-2 right-2 inline-flex items-center gap-2 rounded-md bg-surface-submit px-3 py-1.5 text-sm font-medium !text-text-on-status !no-underline transition-colors hover:bg-surface-submit-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-submit"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            {localize('com_learning_try_in_chat')}
          </ArticleLink>
        ) : (
          <button
            type="button"
            onClick={onCopy}
            aria-label={localize('com_learning_copy_prompt')}
            className="absolute bottom-2 right-2 rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <span className="sr-only" role="status">
        {copied ? localize('com_learning_copied') : ''}
      </span>
    </div>
  );
}
