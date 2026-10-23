import type { MDXComponents } from 'mdx/types';
import { Compare, Before, After } from './compare';
import { FeedbackLink } from './feedback';
import { CardGrid, Card } from './cards';
import { SharingNote } from './sharing';
import { Terms, Term } from './terms';
import { NextArticle } from './next';
import { ArticleLink } from './link';
import { Analogy } from './analogy';
import { H2, H3 } from './heading';
import { TryThis } from './cue';
import { Steps } from './steps';

export const mdxComponents: MDXComponents = {
  h2: H2,
  h3: H3,
  a: ArticleLink,
  TryThis,
  Analogy,
  Compare,
  Before,
  After,
  CardGrid,
  Card,
  NextArticle,
  Steps,
  Terms,
  Term,
  FeedbackLink,
  SharingNote,
};
