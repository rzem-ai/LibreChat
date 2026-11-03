import { useId } from 'react';
import { FlaskConical, TriangleAlert } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@librechat/client';
import type { ReactElement } from 'react';
import type { PanelChromeProps } from '../chrome';
import { defaultPanelChrome } from '../frame';
import ResearchSchedules from './ResearchSchedules';
import { useResearchJobsQuery } from '../../hooks';
import ResearchJobCard from './ResearchJobCard';
import { useLocalize } from '../../hooks/localize';

function ResearchSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function ResearchPanel({
  chrome = defaultPanelChrome,
}: PanelChromeProps): ReactElement {
  const { Header: PanelHeader, Content: PanelContent } = chrome;
  const localize = useLocalize();
  const headingId = useId();
  const { data, isLoading, isError, refetch } = useResearchJobsQuery();
  const jobs = data?.jobs ?? [];

  let content;
  if (isError) {
    content = (
      <EmptyState
        icon={TriangleAlert}
        title={localize('com_ui_research_error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            {localize('com_ui_retry')}
          </Button>
        }
      />
    );
  } else if (jobs.length === 0) {
    content = (
      <EmptyState
        icon={FlaskConical}
        title={localize('com_ui_research_empty_title')}
        description={localize('com_ui_research_empty')}
      />
    );
  } else {
    content = (
      <ul className="flex flex-col gap-2" aria-labelledby={headingId}>
        {jobs.map((job) => (
          <ResearchJobCard key={job.id} job={job} />
        ))}
      </ul>
    );
  }

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className="flex h-full w-full flex-col overflow-hidden pt-2"
    >
      <PanelHeader title={localize('com_ui_research')} titleId={headingId} />
      <PanelContent isLoading={isLoading} skeleton={<ResearchSkeleton />} className="px-3 pb-3">
        {content}
        <ResearchSchedules />
      </PanelContent>
    </div>
  );
}
