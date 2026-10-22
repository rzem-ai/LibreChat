import type { JSX } from 'react/jsx-runtime';
import type { ReactNode } from 'react';
import { useLearningCenterConfig } from '~/hooks/Learning';
import { ArticleLink } from './link';

interface FeedbackLinkProps {
  children: ReactNode;
}

export function FeedbackLink({ children }: FeedbackLinkProps): JSX.Element | null {
  const { feedbackUrl } = useLearningCenterConfig();

  if (!feedbackUrl) {
    return null;
  }

  return <ArticleLink href={feedbackUrl}>{children}</ArticleLink>;
}
