import { useId } from 'react';
import { Switch, useToastContext } from '@librechat/client';
import type { ReactElement } from 'react';
import type { TResearchSchedule, ResearchDeliveryChannel } from '../../../contract/types';
import { useResearchSchedulesQuery, useUpdateResearchScheduleMutation } from '../../hooks';
import { JOB_TYPE_KEYS } from './labels';
import { useLocalize } from '../../hooks/localize';

function ScheduleRow({ schedule }: { schedule: TResearchSchedule }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const update = useUpdateResearchScheduleMutation();
  const emailOffered = schedule.availableChannels.includes('email');
  const emailOn = schedule.channels.includes('email');

  const setEmail = (checked: boolean) => {
    const channels: ResearchDeliveryChannel[] = checked
      ? ['conversation', 'email']
      : ['conversation'];
    update.mutate(
      { scheduleId: schedule.scheduleId, channels },
      {
        onError: () =>
          showToast({ message: localize('com_ui_research_schedule_save_error'), status: 'error' }),
      },
    );
  };

  return (
    <li className="rounded-lg border border-border-light px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-text-primary">{schedule.name}</span>
        <span className="shrink-0 text-xs text-text-secondary">
          {localize(JOB_TYPE_KEYS[schedule.jobType])}
        </span>
      </div>
      {!schedule.enabled && (
        <p className="mt-0.5 text-xs text-text-secondary">
          {localize('com_ui_research_schedule_paused')}
        </p>
      )}
      {emailOffered ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary">
            {localize('com_ui_research_schedule_email_label')}
          </span>
          <Switch
            checked={emailOn}
            disabled={update.isLoading}
            onCheckedChange={setEmail}
            aria-label={localize('com_ui_research_schedule_email', { name: schedule.name })}
          />
        </div>
      ) : (
        <p className="mt-1 text-xs text-text-secondary">
          {localize('com_ui_research_schedule_conversation_only')}
        </p>
      )}
    </li>
  );
}

/**
 * Delivery settings for the user's schedules that run a research agent (design 5.8). The
 * schedule itself is created and edited in the schedule dialog; this only adds channels.
 */
export default function ResearchSchedules(): ReactElement | null {
  const localize = useLocalize();
  const headingId = useId();
  const { data } = useResearchSchedulesQuery();
  const schedules = data?.schedules ?? [];
  if (schedules.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="mt-4">
      <h3 id={headingId} className="text-sm font-medium text-text-primary">
        {localize('com_ui_research_schedules')}
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {schedules.map((schedule) => (
          <ScheduleRow key={schedule.scheduleId} schedule={schedule} />
        ))}
      </ul>
    </section>
  );
}
