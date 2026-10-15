import { GEL } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react/jsx-runtime';
import { loadReleases } from '../../content/loader';
import { useLocalize } from '~/hooks';
import Failure from '../Failure';

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
    <div className="flex max-w-xl flex-col gap-12">
      {releases.map(({ id, frontmatter, Content }) => (
        <article key={id}>
          <p className="text-sm text-text-secondary">
            {frontmatter.date} · {frontmatter.version}
          </p>
          <h2 className="mt-1 text-xl font-medium">{frontmatter.title}</h2>
          <GEL.Typeset>
            <Content />
          </GEL.Typeset>
        </article>
      ))}
    </div>
  );
}
