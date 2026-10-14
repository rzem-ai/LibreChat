import { Typeset } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react/jsx-runtime';
import { loadReleases } from '../../content/loader';

export default function Releases(): JSX.Element {
  const { data: releases = [] } = useQuery(['learningReleases'], loadReleases, {
    staleTime: Infinity,
  });

  return (
    <div className="flex max-w-xl flex-col gap-12">
      {releases.map(({ id, frontmatter, Content }) => (
        <article key={id}>
          <p className="text-sm text-text-secondary">
            {frontmatter.date} · {frontmatter.version}
          </p>
          <h2 className="mt-1 text-xl font-medium">{frontmatter.title}</h2>
          <Typeset>
            <Content />
          </Typeset>
        </article>
      ))}
    </div>
  );
}
