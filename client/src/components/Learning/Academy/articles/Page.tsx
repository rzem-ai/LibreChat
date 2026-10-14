import { useQuery } from '@tanstack/react-query';
import { Button, Typeset, GEL } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';
import type { ComponentProps } from 'react';
import { loadArticle } from '../../content/loader';
import { slugify } from '../../content/headings';
import { useLocalize } from '~/hooks';

const mdxComponents = {
  h2: function SectionHeading({ children, ...props }: ComponentProps<'h2'>): JSX.Element {
    const id = typeof children === 'string' ? slugify(children) : undefined;
    return (
      <h2 id={id} {...props}>
        {children}
      </h2>
    );
  },
};

export default function Article(): JSX.Element {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { slug = '' } = useParams<{ slug: string }>();
  const { data: article, isLoading } = useQuery(
    ['learningArticle', slug],
    () => loadArticle(slug),
    {
      staleTime: Infinity,
    },
  );

  const backButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="w-fit text-text-secondary"
      onClick={() => navigate('/learning/resources')}
    >
      <GEL.Icon.Back className="size-4" aria-hidden="true" />
      {localize('com_learning_back_to_resources')}
    </Button>
  );

  if (isLoading) {
    return backButton;
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
        <p className="mt-2 text-xs text-text-secondary">
          {localize('com_learning_updated', { 0: article.frontmatter.updated })}
        </p>
      </div>
      <div className="flex items-start gap-16">
        <div className="max-w-2xl flex-1">
          <Typeset className="[&>:first-child]:mt-0">
            <article.Content components={mdxComponents} />
          </Typeset>
        </div>
        {article.headings.length > 0 && (
          <nav
            aria-label={localize('com_learning_on_this_page')}
            className="sticky top-6 hidden w-52 shrink-0 flex-col gap-1 lg:flex"
          >
            <p className="text-xs text-text-secondary">{localize('com_learning_on_this_page')}</p>
            {article.headings.map(({ id, text }) => (
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
