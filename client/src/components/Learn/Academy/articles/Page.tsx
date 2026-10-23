import { Button, GEL } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';
import { loadArticle } from '../../content/loader';
import useActiveHeading from './useActiveHeading';
import { useLocalize } from '~/hooks';
import { mdxComponents } from './mdx';
import Failure from '../Failure';
import { cn } from '~/utils';

const articleTypesetClass = [
  '[&>:first-child]:!mt-6',
  '[&_strong]:font-medium',
  '[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
  '[&_th]:pb-2 [&_th]:pr-6 [&_th]:text-sm [&_th]:font-medium [&_th]:text-text-secondary',
  '[&_td]:border-t [&_td]:border-border-light [&_td]:py-3 [&_td]:pr-6 [&_td]:align-top',
].join(' ');

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

  const [activeId, setActiveId] = useActiveHeading(
    article?.headings.map((heading) => heading.id) ?? [],
  );

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
      <div className="lg:grid lg:grid-cols-[minmax(0,52rem)_14rem] lg:justify-start lg:gap-16">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">{article.frontmatter.title}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {localize('com_learning_updated', { 0: article.frontmatter.updated })}
          </p>
          <GEL.Typeset className={articleTypesetClass}>
            {article.frontmatter.summary && <p>{article.frontmatter.summary}</p>}
            <article.Content components={mdxComponents} />
          </GEL.Typeset>
        </div>
        {article.headings.length > 0 && (
          <nav
            aria-label={localize('com_learning_on_this_page')}
            className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-56 self-start overflow-y-auto lg:flex lg:flex-col lg:gap-3"
          >
            <p className="mb-2 text-sm text-text-secondary">
              {localize('com_learning_on_this_page')}
            </p>
            {article.headings.map(({ id, text, level }) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={id === activeId ? 'location' : undefined}
                className={cn(
                  'text-[15px] leading-snug underline-offset-4 transition-colors hover:text-text-primary hover:underline',
                  id === activeId ? 'text-text-primary' : 'text-text-secondary',
                  level === 3 && 'pl-3',
                )}
                onClick={(event) => {
                  event.preventDefault();
                  setActiveId(id);
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
