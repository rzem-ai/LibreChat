import { ArrowLeft } from 'lucide-react';
import { Button, Typeset } from '@librechat/client';
import type { JSX } from 'react/jsx-runtime';
import { getArticle } from '../content/loader';
import { useLocalize } from '~/hooks';

interface ArticleProps {
  slug: string;
  onBack: () => void;
}

export default function Article({ slug, onBack }: ArticleProps): JSX.Element {
  const localize = useLocalize();
  const article = getArticle(slug);

  return (
    <div className="flex flex-col gap-6">
      <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {localize('com_learning_back_to_resources')}
      </Button>
      {article ? (
        <article className="max-w-2xl">
          <h1 className="text-3xl font-medium tracking-tight">{article.frontmatter.title}</h1>
          <p className="mt-2 text-xs text-text-secondary">
            {localize('com_learning_updated', { 0: article.frontmatter.updated })}
          </p>
          <Typeset className="mt-6">
            <article.Content />
          </Typeset>
        </article>
      ) : (
        <p className="text-sm text-text-secondary">{localize('com_learning_article_missing')}</p>
      )}
    </div>
  );
}
