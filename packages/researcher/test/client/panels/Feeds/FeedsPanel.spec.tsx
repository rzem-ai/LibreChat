import userEvent from '@testing-library/user-event';
import { render, screen, within, waitFor } from '@testing-library/react';
import type {
  TResearchFeed,
  TOpmlImportResult,
  TResearchFeedItem,
  TResearchFeedSubscription,
} from '../../../../src/contract/types';
import FeedsPanel from '../../../../src/client/panels/Feeds/FeedsPanel';
import { chrome } from '../chrome';

type Mutation = { mutate: jest.Mock; isLoading: boolean };

const mockRefetch = jest.fn();
const mockToast = jest.fn();
const mockExport = jest.fn();
let mockFeeds: {
  data?: { subscriptions: TResearchFeedSubscription[]; maxPerUser: number };
  isLoading: boolean;
  isError: boolean;
};
let mockCatalogue: { data?: { feeds: TResearchFeed[] }; isLoading: boolean; isError: boolean };
let mockItems: Record<string, TResearchFeedItem[]>;
const mockItemsQuery = jest.fn();
let mockImport: Mutation;
let mockUnsubscribe: Mutation;
let mockSubscribe: Mutation;
let mockMove: Mutation;
let mockRename: Mutation;

jest.mock('../../../../src/client/hooks', () => ({
  useResearchFeedsQuery: () => ({ ...mockFeeds, refetch: mockRefetch }),
  useResearchFeedCatalogueQuery: () => mockCatalogue,
  useResearchFeedItemsQuery: (feedId: string, config?: { enabled?: boolean }) => {
    mockItemsQuery(feedId, config);
    return config?.enabled === false
      ? { isLoading: false, isError: false }
      : { data: { feedId, items: mockItems[feedId] ?? [] }, isLoading: false, isError: false };
  },
  useImportResearchFeedsMutation: () => mockImport,
  useUnsubscribeResearchFeedMutation: () => mockUnsubscribe,
  useSubscribeResearchCatalogueFeedMutation: () => mockSubscribe,
  useMoveResearchFeedMutation: () => mockMove,
  useRenameResearchFeedFolderMutation: () => mockRename,
}));
jest.mock('../../../../src/contract/service', () => ({
  ...jest.requireActual('../../../../src/contract/service'),
  exportResearchFeeds: () => mockExport(),
}));
jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    useLocalize: () => (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    useToastContext: () => ({ showToast: mockToast }),
  };
});

const feed = (overrides: Partial<TResearchFeed> = {}): TResearchFeed => ({
  id: 'f1',
  url: 'https://a.example/rss',
  title: 'Alpha News',
  disabled: false,
  catalogue: false,
  lastStatus: 'ok',
  ...overrides,
});

const subscription = (
  overrides: Partial<TResearchFeed> = {},
  folder?: string[],
): TResearchFeedSubscription => ({
  feedId: overrides.id ?? 'f1',
  source: 'opml',
  ...(folder ? { folder } : {}),
  feed: feed(overrides),
});

const mutation = (): Mutation => ({ mutate: jest.fn(), isLoading: false });

beforeEach(() => {
  mockRefetch.mockClear();
  mockToast.mockClear();
  mockExport.mockReset();
  mockItemsQuery.mockClear();
  mockFeeds = { data: { subscriptions: [], maxPerUser: 3 }, isLoading: false, isError: false };
  mockCatalogue = { data: { feeds: [] }, isLoading: false, isError: false };
  mockItems = {};
  mockImport = mutation();
  mockUnsubscribe = mutation();
  mockSubscribe = mutation();
  mockMove = mutation();
  mockRename = mutation();
});

describe('FeedsPanel', () => {
  it('labels the panel region', () => {
    render(<FeedsPanel chrome={chrome} />);
    expect(screen.getByRole('region', { name: 'com_ui_feeds' })).toBeInTheDocument();
  });

  it('offers a retry when subscriptions fail to load', async () => {
    mockFeeds = { isLoading: false, isError: true };
    render(<FeedsPanel chrome={chrome} />);
    expect(screen.getByText('com_ui_feeds_error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('explains how to add feeds when there are none', () => {
    render(<FeedsPanel chrome={chrome} />);
    expect(screen.getByText('com_ui_feeds_empty_title')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_feeds_import')).toBeInTheDocument();
  });

  it('lists subscriptions with their count and poll problems', () => {
    mockFeeds.data = {
      maxPerUser: 3,
      subscriptions: [
        subscription(),
        subscription({ id: 'f2', title: 'Broken', lastStatus: 'error', lastError: 'fetch_status' }),
        subscription({ id: 'f3', title: undefined, url: 'https://c.example/rss', disabled: true }),
      ],
    };
    render(<FeedsPanel chrome={chrome} />);
    expect(screen.getByText('com_ui_feeds_count:{"used":3,"max":3}')).toBeInTheDocument();
    const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
    expect(row('Alpha News')).toBeInTheDocument();
    expect(within(row('Broken')).getByText('com_ui_feeds_status_error')).toBeInTheDocument();
    expect(
      within(row('https://c.example/rss')).getByText('com_ui_feeds_status_disabled'),
    ).toBeInTheDocument();
  });

  describe('folders', () => {
    beforeEach(() => {
      mockFeeds.data = {
        maxPerUser: 10,
        subscriptions: [
          subscription({ id: 'f1', title: 'Alpha News' }, ['AI', 'Agents']),
          subscription({ id: 'f2', title: 'Beta' }, ['AI']),
          subscription({ id: 'f3', title: 'Gamma' }, ['AI']),
          subscription({ id: 'f4', title: 'Loose' }),
        ],
      };
    });

    it('groups feeds by folder path with counts, unfiled last', () => {
      render(<FeedsPanel chrome={chrome} />);
      const toggles = screen
        .getAllByRole('button', { expanded: true })
        .map((button) => button.textContent);
      expect(toggles).toEqual(['AI2', 'AI / Agents1', 'com_ui_feeds_unfiled1']);
    });

    it('collapses a folder', async () => {
      render(<FeedsPanel chrome={chrome} />);
      const toggle = screen.getByRole('button', { name: /^AI\s*2$/ });
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
      expect(screen.getByText('Alpha News')).toBeInTheDocument();
    });

    it('renames a folder', async () => {
      render(<FeedsPanel chrome={chrome} />);
      await userEvent.click(
        screen.getByRole('button', { name: 'com_ui_feeds_folder_rename:{"name":"AI"}' }),
      );
      const input = screen.getByLabelText('com_ui_feeds_folder_name');
      expect(input).toHaveValue('AI');
      await userEvent.clear(input);
      await userEvent.type(input, 'Artificial Intelligence{Enter}');
      expect(mockRename.mutate).toHaveBeenCalledWith(
        { from: ['AI'], to: ['Artificial Intelligence'] },
        expect.any(Object),
      );
    });

    it('moves a feed into a nested folder and out of folders', async () => {
      render(<FeedsPanel chrome={chrome} />);
      await userEvent.click(
        screen.getByRole('button', { name: 'com_ui_feeds_move:{"name":"Loose"}' }),
      );
      const input = screen.getByLabelText('com_ui_feeds_move_folder');
      await userEvent.type(input, 'Cyber / Daily');
      await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
      expect(mockMove.mutate).toHaveBeenCalledWith(
        { feedId: 'f4', folder: ['Cyber', 'Daily'] },
        expect.any(Object),
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'com_ui_feeds_move:{"name":"Beta"}' }),
      );
      const second = screen.getByLabelText('com_ui_feeds_move_folder');
      expect(second).toHaveValue('AI');
      await userEvent.clear(second);
      await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
      expect(mockMove.mutate).toHaveBeenLastCalledWith(
        { feedId: 'f2', folder: null },
        expect.any(Object),
      );
    });

    it('reports a failed move', async () => {
      render(<FeedsPanel chrome={chrome} />);
      await userEvent.click(
        screen.getByRole('button', { name: 'com_ui_feeds_move:{"name":"Loose"}' }),
      );
      await userEvent.type(screen.getByLabelText('com_ui_feeds_move_folder'), 'X{Enter}');
      mockMove.mutate.mock.calls[0][1].onError(new Error('x'));
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'com_ui_feeds_move_error', status: 'error' }),
      );
    });
  });

  it('unsubscribes from a feed and reports a failure', async () => {
    mockFeeds.data = { maxPerUser: 3, subscriptions: [subscription()] };
    render(<FeedsPanel chrome={chrome} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_feeds_unsubscribe:{"name":"Alpha News"}' }),
    );
    expect(mockUnsubscribe.mutate).toHaveBeenCalledWith('f1', expect.any(Object));
    mockUnsubscribe.mutate.mock.calls[0][1].onError(new Error('x'));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_feeds_unsubscribe_error', status: 'error' }),
    );
  });

  it('loads a feed’s history only when expanded and marks cited items', async () => {
    mockFeeds.data = { maxPerUser: 3, subscriptions: [subscription()] };
    mockItems.f1 = [
      {
        guid: 'g1',
        title: 'Widgets up',
        link: 'https://a.example/1',
        publishedAt: '2026-11-02T00:00:00.000Z',
        archived: true,
      },
    ];
    render(<FeedsPanel chrome={chrome} />);
    const toggle = screen.getByRole('button', {
      name: 'com_ui_feeds_history:{"name":"Alpha News"}',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(mockItemsQuery).not.toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ enabled: true }),
    );
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const link = screen.getByRole('link', { name: 'Widgets up' });
    expect(link).toHaveAttribute('href', 'https://a.example/1');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText('com_ui_feeds_item_cited')).toBeInTheDocument();
  });

  it('renders a non-http item link as plain text', async () => {
    mockFeeds.data = { maxPerUser: 3, subscriptions: [subscription()] };
    mockItems.f1 = [
      {
        guid: 'g1',
        title: 'Click me',
        link: 'javascript:alert(1)',
        publishedAt: '2026-11-02T00:00:00.000Z',
        archived: false,
      },
    ];
    render(<FeedsPanel chrome={chrome} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_feeds_history:{"name":"Alpha News"}' }),
    );
    expect(screen.getByText('Click me')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Click me' })).not.toBeInTheDocument();
  });

  it('says so when a feed has no items in the window', async () => {
    mockFeeds.data = { maxPerUser: 3, subscriptions: [subscription()] };
    render(<FeedsPanel chrome={chrome} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_feeds_history:{"name":"Alpha News"}' }),
    );
    expect(screen.getByText('com_ui_feeds_history_empty')).toBeInTheDocument();
  });

  it('imports an OPML file and reports feeds left out by the cap', async () => {
    render(<FeedsPanel chrome={chrome} />);
    const file = new File(['<opml version="2.0"></opml>'], 'feeds.opml', { type: 'text/xml' });
    await userEvent.upload(screen.getByLabelText('com_ui_feeds_import'), file);
    await waitFor(() => expect(mockImport.mutate).toHaveBeenCalled());
    const [payload, handlers] = mockImport.mutate.mock.calls[0];
    expect(payload).toEqual({ opml: '<opml version="2.0"></opml>' });
    const result: TOpmlImportResult = { added: 2, existing: 1, overLimit: 4, maxPerUser: 3 };
    handlers.onSuccess(result);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'com_ui_feeds_imported_over_limit:{"added":2,"overLimit":4,"max":3}',
        status: 'warning',
      }),
    );
  });

  it('maps an invalid OPML refusal to its own message', async () => {
    render(<FeedsPanel chrome={chrome} />);
    const file = new File(['nope'], 'feeds.opml', { type: 'text/xml' });
    await userEvent.upload(screen.getByLabelText('com_ui_feeds_import'), file);
    await waitFor(() => expect(mockImport.mutate).toHaveBeenCalled());
    mockImport.mutate.mock.calls[0][1].onError({
      response: { data: { error_code: 'research_opml_invalid' } },
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_feeds_import_invalid', status: 'error' }),
    );
  });

  it('refuses an oversized file before uploading it', async () => {
    render(<FeedsPanel chrome={chrome} />);
    const file = new File(['x'.repeat(1_000_001)], 'big.opml', { type: 'text/xml' });
    await userEvent.upload(screen.getByLabelText('com_ui_feeds_import'), file);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'com_ui_feeds_import_too_large', status: 'error' }),
      ),
    );
    expect(mockImport.mutate).not.toHaveBeenCalled();
  });

  it('exports subscriptions as an OPML download', async () => {
    mockFeeds.data = { maxPerUser: 3, subscriptions: [subscription()] };
    mockExport.mockResolvedValueOnce('<opml/>');
    const createUrl = jest.fn(() => 'blob:feeds');
    const revokeUrl = jest.fn();
    Object.assign(window.URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<FeedsPanel chrome={chrome} />);
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_feeds_export' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createUrl).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:feeds');
    click.mockRestore();
  });

  it('subscribes from the catalogue, grouped by category, until the cap', async () => {
    mockFeeds.data = {
      maxPerUser: 2,
      subscriptions: [subscription({ id: 'c1', title: 'Tax One' })],
    };
    mockCatalogue.data = {
      feeds: [
        feed({ id: 'c1', title: 'Tax One', catalogue: true, catalogueCategory: 'Tax' }),
        feed({ id: 'c2', title: 'Audit One', catalogue: true, catalogueCategory: 'Audit' }),
      ],
    };
    const { rerender } = render(<FeedsPanel chrome={chrome} />);
    const catalogue = screen.getByRole('region', { name: 'com_ui_feeds_catalogue' });
    expect(within(catalogue).getByRole('heading', { name: 'Tax' })).toBeInTheDocument();
    expect(within(catalogue).getByRole('heading', { name: 'Audit' })).toBeInTheDocument();
    expect(
      within(catalogue).getByRole('button', { name: 'com_ui_feeds_subscribed:{"name":"Tax One"}' }),
    ).toBeDisabled();
    await userEvent.click(
      within(catalogue).getByRole('button', {
        name: 'com_ui_feeds_subscribe:{"name":"Audit One"}',
      }),
    );
    expect(mockSubscribe.mutate).toHaveBeenCalledWith('c2', expect.any(Object));

    mockFeeds.data = {
      maxPerUser: 1,
      subscriptions: [subscription({ id: 'c1', title: 'Tax One' })],
    };
    rerender(<FeedsPanel chrome={chrome} />);
    expect(
      screen.getByRole('button', { name: 'com_ui_feeds_subscribe:{"name":"Audit One"}' }),
    ).toBeDisabled();
    expect(screen.getByText('com_ui_feeds_limit_reached')).toBeInTheDocument();
  });
});
