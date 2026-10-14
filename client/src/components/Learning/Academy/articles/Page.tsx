import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Typeset, gelIcons } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { getArticle } from '../../content/loader';
import { useLocalize } from '~/hooks';

interface Heading {
  id: string;
  text: string;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function Article(): JSX.Element {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { slug = '' } = useParams<{ slug: string }>();
  const article = getArticle(slug);
  const contentRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const nodes = Array.from(contentRef.current?.querySelectorAll('h2') ?? []);
    setHeadings(
      nodes.map((node) => {
        const text = node.textContent ?? '';
        node.id = node.id || slugify(text);
        return { id: node.id, text };
      }),
    );
  }, [slug]);

  const backButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="w-fit text-text-secondary"
      onClick={() => navigate('/learning/resources')}
    >
      <gelIcons.back className="size-4" aria-hidden="true" />
      {localize('com_learning_back_to_resources')}
    </Button>
  );

  if (!article) {
    return (
      <>
        {backButton}
        <p className="text-sm text-text-secondary">{localize('com_learning_article_missing')}</p>
      </>
    );
  }

  return (
    <>
      {backButton}
      <div>
        <h1 className="text-3xl font-medium tracking-tight">{article.frontmatter.title}</h1>
        <p className="mt-2 text-xs text-text-secondary">
          {localize('com_learning_updated', { 0: article.frontmatter.updated })}
        </p>
      </div>
      <div className="flex items-start gap-16">
        <div ref={contentRef} className="max-w-2xl flex-1">
          <Typeset className="[&>:first-child]:mt-0">
            <article.Content />
          </Typeset>
        </div>
        {headings.length > 0 && (
          <nav
            aria-label={localize('com_learning_on_this_page')}
            className="sticky top-6 hidden w-52 shrink-0 flex-col gap-1 lg:flex"
          >
            <p className="text-xs text-text-secondary">{localize('com_learning_on_this_page')}</p>
            {headings.map(({ id, text }) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-sm text-text-primary underline-offset-4 hover:underline"
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {text}
              </a>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
