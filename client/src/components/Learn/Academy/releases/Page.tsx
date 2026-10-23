import { GEL } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react/jsx-runtime';
import { loadReleases } from '../../content/loader';
import { READING_COLUMN } from '../column';
import { useLocalize } from '~/hooks';
import Failure from '../Failure';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split('-');
  const monthName = MONTHS[Number(month) - 1];
  return monthName && day ? `${day} ${monthName} ${year}` : isoDate;
};

export default function Releases(): JSX.Element | null {
  const localize = useLocalize();
  const {
    data: releases,
    isLoading,
    isError,
    refetch,
  } = useQuery(['learningReleases'], loadReleases, { staleTime: Infinity, retry: 1 });

  if (isLoading) {
    return null;
  }

  if (isError) {
    return <Failure onRetry={() => refetch()} />;
  }

  if (!releases?.length) {
    return <p className="text-sm text-text-secondary">{localize('com_learning_no_releases')}</p>;
  }

  return (
    <div className={`${READING_COLUMN} flex flex-col gap-12`}>
      {releases.map(({ id, frontmatter, Content }) => (
        <article key={id}>
          <p className="text-sm text-text-secondary">
            {formatDate(frontmatter.date)} · {frontmatter.version}
          </p>
          <h2 className="mt-1 text-xl font-medium">{frontmatter.title}</h2>
          <GEL.Typeset className="[&_h3]:mt-5 [&_p]:mt-1">
            <Content />
          </GEL.Typeset>
        </article>
      ))}
    </div>
  );
}
