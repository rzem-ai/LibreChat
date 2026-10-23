/* eslint-disable i18next/no-literal-string */
import React from 'react';
import '@testing-library/jest-dom';
import copy from 'copy-to-clipboard';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { mdxComponents } from '../Academy/articles/mdx';

const {
  NextArticle,
  TryThis,
  Analogy,
  Compare,
  Before,
  After,
  CardGrid,
  Card,
  Steps,
  Terms,
  Term,
} = mdxComponents as Record<string, React.ElementType>;
const {
  FeedbackLink,
  SharingNote,
  a: Anchor,
  h2: H2,
  h3: H3,
} = mdxComponents as Record<string, React.ElementType>;

let mockFeedbackUrl: string | undefined;

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/Learning', () => ({
  useLearningCenterConfig: () => ({ feedbackUrl: mockFeedbackUrl }),
}));

const renderInRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TryThis', () => {
  it('shows the label, the action and the prompt as plain text', () => {
    renderInRouter(<TryThis action="Rewrite a recent prompt" prompt="Summarise this report" />);

    expect(screen.getByText('com_learning_try_this')).toBeInTheDocument();
    expect(screen.getByText(/Rewrite a recent prompt/)).toBeInTheDocument();
    expect(screen.getByText('Summarise this report')).toBeInTheDocument();
  });

  it('drops the label when a heading above already says it', () => {
    renderInRouter(<TryThis closing action="Apply it" prompt="Do the thing" />);

    expect(screen.queryByText('com_learning_try_this')).not.toBeInTheDocument();
    expect(screen.getByText('Apply it:')).toBeInTheDocument();
  });

  it('does not double up punctuation already on the action', () => {
    renderInRouter(<TryThis closing action="Apply it:" prompt="Do the thing" />);

    expect(screen.getByText('Apply it:')).toBeInTheDocument();
  });

  it('copies the prompt text and confirms it', () => {
    renderInRouter(<TryThis action="Copy it" prompt="Goal: Summarise the risks" />);

    fireEvent.click(screen.getByRole('button', { name: 'com_learning_copy_prompt' }));

    expect(copy).toHaveBeenCalledWith('Goal: Summarise the risks');
    expect(screen.getByRole('status')).toHaveTextContent('com_learning_copied');
  });
});

describe('TryThis in chat', () => {
  it('links to a new chat with the prompt prefilled', () => {
    renderInRouter(<TryThis action="Try it" prompt="Summarise this & that" />);

    expect(screen.getByRole('link', { name: 'com_learning_try_in_chat' })).toHaveAttribute(
      'href',
      '/c/new?prompt=Summarise%20this%20%26%20that',
    );
  });

  it('hides the link when the cue opts out', () => {
    renderInRouter(<TryThis chat={false} action="Try it" prompt="Needs an attachment" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('Analogy', () => {
  it('renders its body beside an info icon, with no label', () => {
    const { container } = renderInRouter(<Analogy>Body text</Analogy>);

    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('Compare', () => {
  it('labels the before and after panels', () => {
    renderInRouter(
      <Compare>
        <Before>Summarise this report</Before>
        <After>Goal, context, source, expectations</After>
      </Compare>,
    );

    expect(screen.getByText('com_learning_compare_before')).toBeInTheDocument();
    expect(screen.getByText('com_learning_compare_after')).toBeInTheDocument();
    expect(screen.getByText('Summarise this report')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders an internal card as a link that can open in a new tab', () => {
    renderInRouter(
      <CardGrid>
        <Card href="/learn/articles/guides/skills" title="Guide to skills">
          Find, create and share skills
        </Card>
      </CardGrid>,
    );

    const link = screen.getByRole('link', { name: /Guide to skills/ });
    expect(link).toHaveAttribute('href', '/learn/articles/guides/skills');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveTextContent('Find, create and share skills');
  });

  it('opens an external card in a new tab with noopener', () => {
    renderInRouter(<Card href="https://example.test/page" title="Read the article" />);

    const link = screen.getByRole('link', { name: 'Read the article' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('NextArticle', () => {
  it('links to the next article with a label, title and description', () => {
    renderInRouter(
      <NextArticle href="/learn/articles/guides/skills" title="Guide to skills">
        Find, create and share skills
      </NextArticle>,
    );

    const link = screen.getByRole('link', { name: /Guide to skills/ });
    expect(link).toHaveAttribute('href', '/learn/articles/guides/skills');
    expect(link).toHaveTextContent('com_learning_next_article');
    expect(link).toHaveTextContent('Find, create and share skills');
  });
});

describe('Anchor', () => {
  it('renders internal links through the router', () => {
    renderInRouter(<Anchor href="/learn/articles/glossary#skill">Glossary</Anchor>);

    expect(screen.getByRole('link', { name: 'Glossary' })).toHaveAttribute(
      'href',
      '/learn/articles/glossary#skill',
    );
  });

  it('opens external links in a new tab with an external icon', () => {
    const { container } = renderInRouter(<Anchor href="https://example.test">Example</Anchor>);

    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute('target', '_blank');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows no icon on internal links', () => {
    const { container } = renderInRouter(<Anchor href="/learn/articles/glossary">Glossary</Anchor>);

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('leaves in-page hash links alone', () => {
    renderInRouter(<Anchor href="#section">Jump</Anchor>);

    expect(screen.getByRole('link', { name: 'Jump' })).not.toHaveAttribute('target');
  });
});

describe('headings', () => {
  it('gives plain-text h2 and h3 headings a slug id', () => {
    renderInRouter(
      <>
        <H2>Create a skill</H2>
        <H3>Plan before you create</H3>
      </>,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('id', 'create-a-skill');
    expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute(
      'id',
      'plan-before-you-create',
    );
  });

  it('adds no id when the heading holds more than plain text', () => {
    renderInRouter(
      <H2>
        Use <code>/</code> commands
      </H2>,
    );

    expect(screen.getByRole('heading', { level: 2 })).not.toHaveAttribute('id');
  });
});

describe('Steps', () => {
  it('wraps an ordered list', () => {
    renderInRouter(
      <Steps>
        <ol>
          <li>Open Prompts</li>
          <li>Select Create</li>
        </ol>
      </Steps>,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('Terms', () => {
  it('gives each term an anchor and links the term name only when a guide is provided', () => {
    renderInRouter(
      <Terms>
        <Term name="Connector (MCP)" href="/learn/articles/guides/connectors#what-it-is">
          A secure link to an approved source.
        </Term>
        <Term name="Memory">What MyAssist remembers about you.</Term>
      </Terms>,
    );

    expect(document.getElementById('connector-mcp')).toHaveTextContent('Connector (MCP)');
    expect(document.getElementById('memory')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Connector (MCP)' })).toBeInTheDocument();
  });
});

describe('FeedbackLink', () => {
  afterEach(() => {
    mockFeedbackUrl = undefined;
  });

  it('links to the configured feedback form in a new tab', () => {
    mockFeedbackUrl = 'https://forms.example.test/feedback';
    renderInRouter(<FeedbackLink>Share feedback</FeedbackLink>);

    const link = screen.getByRole('link', { name: 'Share feedback' });
    expect(link).toHaveAttribute('href', 'https://forms.example.test/feedback');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders nothing when no feedback url is configured', () => {
    renderInRouter(<FeedbackLink>Share feedback</FeedbackLink>);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('SharingNote', () => {
  it('renders the shared sharing statement', () => {
    renderInRouter(<SharingNote />);

    expect(screen.getByText('com_learning_sharing_note')).toBeInTheDocument();
  });
});
