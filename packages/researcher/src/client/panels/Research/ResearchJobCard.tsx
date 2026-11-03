import { Link } from 'react-router-dom';
import { Button, useToastContext } from '@librechat/client';
import type { TranslationKeys } from '@librechat/client';
import type { ReactElement } from 'react';
import type { TResearchJob, ResearchJobStatus } from '../../../contract/types';
import { CHANNEL_KEYS, JOB_TYPE_KEYS, STATUS_KEYS } from './labels';
import { researchBriefSubject } from '../../../contract/types';
import { useCancelResearchJobMutation } from '../../hooks';
import { useLocalize } from '../../hooks/localize';

const LIVE: ReadonlySet<ResearchJobStatus> = new Set([
  'submitted',
  'briefing',
  'researching',
  'drafting',
  'verifying',
]);

/** Known failure codes have their own copy; anything else gets the generic message. */
const FAILURE_KEYS: Record<string, TranslationKeys> = {
  brief_failed: 'com_ui_research_failed_brief_failed',
  verification_failed: 'com_ui_research_failed_verification_failed',
};

export default function ResearchJobCard({ job }: { job: TResearchJob }): ReactElement {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const cancel = useCancelResearchJobMutation();
  const live = LIVE.has(job.status);
  const title = researchBriefSubject(job.brief, job.prompt);

  const onCancel = () =>
    cancel.mutate(job.id, {
      onError: () =>
        showToast({ message: localize('com_ui_research_cancel_error'), status: 'error' }),
    });

  return (
    <li className="rounded-lg border border-border-light px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-text-primary">
          {localize(JOB_TYPE_KEYS[job.jobType])}
        </span>
        <span className="shrink-0 text-xs text-text-secondary">
          {localize(STATUS_KEYS[job.status])}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span>
          {localize('com_ui_research_steps', {
            used: job.budgetUsed.steps,
            max: job.budget.maxSteps,
          })}
        </span>
        {job.verification && (
          <span>
            {localize('com_ui_research_verification', {
              supported: job.verification.supported,
              unsupported: job.verification.unsupported,
              unavailable: job.verification.unavailable,
            })}
          </span>
        )}
        {job.verification?.uncited ? (
          <span>{localize('com_ui_research_uncited', { count: job.verification.uncited })}</span>
        ) : null}
        {job.partial && <span className="font-medium">{localize('com_ui_research_partial')}</span>}
      </div>
      {job.deliveries
        .filter((delivery) => delivery.channel !== 'conversation' && delivery.state !== 'sent')
        .map((delivery) => (
          <p
            key={delivery.channel}
            className={
              delivery.state === 'failed'
                ? 'mt-1 text-xs text-text-destructive'
                : 'mt-1 text-xs text-text-secondary'
            }
          >
            {delivery.error === 'email_unverified'
              ? localize('com_ui_research_delivery_email_unverified')
              : localize(
                  delivery.state === 'failed'
                    ? 'com_ui_research_delivery_failed'
                    : 'com_ui_research_delivery_pending',
                  {
                    channel: localize(CHANNEL_KEYS[delivery.channel]),
                  },
                )}
          </p>
        ))}
      {job.status === 'failed' && (
        <p className="mt-1 text-xs text-text-destructive">
          {localize(
            (job.failureReason && FAILURE_KEYS[job.failureReason]) || 'com_ui_research_failed',
          )}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Link
          to={`/c/${job.conversationId}`}
          className="text-xs font-medium text-text-primary underline-offset-2 hover:underline focus-visible:underline"
        >
          {localize('com_ui_research_open')}
        </Link>
        {live && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            onClick={onCancel}
            disabled={cancel.isLoading}
            aria-label={localize('com_ui_research_cancel')}
          >
            {localize('com_ui_cancel')}
          </Button>
        )}
      </div>
    </li>
  );
}
