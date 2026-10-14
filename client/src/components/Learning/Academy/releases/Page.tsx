import { Typeset } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { RELEASES } from '../../content/loader';

export default function Releases(): JSX.Element {
  return (
    <div className="flex max-w-xl flex-col gap-12">
      {RELEASES.map(({ id, frontmatter, Content }) => (
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
