/* eslint-disable i18next/no-literal-string */
import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Article from '../Academy/articles/Page';

const mockArticle = {
  id: 'sample',
  frontmatter: { title: 'Sample article', updated: '2026-01-01', summary: 'A short lede.' },
  headings: [
    { id: 'getting-started', text: 'Getting started', level: 2 },
    { id: 'advanced-setup', text: 'Advanced setup', level: 2 },
    { id: 'tuning', text: 'Tuning', level: 3 },
  ],
  Content: ({ components }: { components?: { h2?: React.ElementType } }) => {
    const Heading = components?.h2 ?? 'h2';
    return (
      <>
        <Heading>Getting started</Heading>
        <p>Opening paragraph.</p>
        <Heading>Advanced setup</Heading>
        <p>Closing paragraph.</p>
      </>
    );
  },
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../content/loader', () => ({
  loadArticle: (slug: string) => {
    if (slug === 'broken') {
      return Promise.reject(new Error('chunk failed'));
    }
    return Promise.resolve(slug === 'sample' || slug === 'guides/sample' ? mockArticle : null);
  },
}));

describe('Academy article', () => {
  const scrolledIds: string[] = [];
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeAll(() => {
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolledIds.push(this.id);
    };
  });

  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  afterEach(() => {
    scrolledIds.length = 0;
  });

  const renderAt = (path: string) =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/learn/articles/*" element={<Article />} />
            <Route path="/learn/resources" element={<p>resources list</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('renders the article and an on-this-page link for each section heading', async () => {
    renderAt('/learn/articles/sample');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sample article' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'com_learning_on_this_page' });
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Getting started' }));
    expect(screen.getByRole('link', { name: 'Advanced setup' })).toHaveAttribute(
      'href',
      '#advanced-setup',
    );
    expect(document.getElementById('advanced-setup')).toHaveTextContent('Advanced setup');
  });

  it('renders the summary as a lede under the title', async () => {
    renderAt('/learn/articles/sample');

    expect(await screen.findByText('A short lede.')).toBeInTheDocument();
  });

  it('loads an article from a nested path', async () => {
    renderAt('/learn/articles/guides/sample');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sample article' }),
    ).toBeInTheDocument();
  });

  it('lists sub-section headings in the on-this-page nav', async () => {
    renderAt('/learn/articles/sample');

    expect(await screen.findByRole('link', { name: 'Tuning' })).toHaveAttribute('href', '#tuning');
  });

  it('scrolls the matching section into view when its link is clicked', async () => {
    renderAt('/learn/articles/sample');

    fireEvent.click(await screen.findByRole('link', { name: 'Advanced setup' }));
    expect(scrolledIds).toEqual(['advanced-setup']);
  });

  it('returns to resources from the back action', () => {
    renderAt('/learn/articles/sample');

    fireEvent.click(screen.getByRole('button', { name: /com_learning_back_to_resources/ }));
    expect(screen.getByText('resources list')).toBeInTheDocument();
  });

  it('shows a retryable failure, not "not found", when the article fails to load', async () => {
    renderAt('/learn/articles/broken');

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'com_learning_load_error',
    );
    expect(screen.queryByText('com_learning_article_missing')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
  });

  it('shows the missing message for an unknown slug while keeping the back action', async () => {
    renderAt('/learn/articles/missing');

    expect(await screen.findByText('com_learning_article_missing')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /com_learning_back_to_resources/ }),
    ).toBeInTheDocument();
  });
});
