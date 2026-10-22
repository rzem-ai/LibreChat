import { Button, GEL } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';
import { loadArticle } from '../../content/loader';
import { useLocalize } from '~/hooks';
import { mdxComponents } from './mdx';
import Failure from '../Failure';
import { cn } from '~/utils';

export default function Article(): JSX.Element {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { '*': slug = '' } = useParams<{ '*': string }>();
  const {
    data: article,
    isLoading,
    isError,
    refetch,
  } = useQuery(['learningArticle', slug], () => loadArticle(slug), {
    staleTime: Infinity,
    retry: 1,
  });

  const backButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="w-fit text-text-secondary"
      onClick={() => navigate('/learn/resources')}
    >
      <GEL.Icon name="back" className="size-4" aria-hidden="true" />
      {localize('com_learning_back_to_resources')}
    </Button>
  );

  if (isLoading) {
    return backButton;
  }

  if (isError) {
    return (
      <>
        {backButton}
        <Failure onRetry={() => refetch()} />
      </>
    );
  }

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
        {article.frontmatter.summary && (
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-text-secondary">
            {article.frontmatter.summary}
          </p>
        )}
        <p className="mt-2 text-xs text-text-secondary">
          {localize('com_learning_updated', { 0: article.frontmatter.updated })}
        </p>
      </div>
      <div className="flex items-start gap-16">
        <div className="max-w-2xl flex-1">
          <GEL.Typeset className="[&>:first-child]:mt-0">
            <article.Content components={mdxComponents} />
          </GEL.Typeset>
        </div>
        {article.headings.length > 0 && (
          <nav
            aria-label={localize('com_learning_on_this_page')}
            className="sticky top-6 hidden w-52 shrink-0 flex-col gap-1 lg:flex"
          >
            <p className="text-xs text-text-secondary">{localize('com_learning_on_this_page')}</p>
            {article.headings.map(({ id, text, level }) => (
              <a
                key={id}
                href={`#${id}`}
                className={cn(
                  'text-sm text-text-primary underline-offset-4 hover:underline',
                  level === 3 && 'pl-3 text-text-secondary',
                )}
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
