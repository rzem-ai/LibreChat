import i18next from 'i18next';
import { createElement } from 'react';
import { initReactI18next } from 'react-i18next';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { registerResearchStrings } from '../../src/client/hooks/localize';
import { useResearchNavLinks } from '../../src/client/nav';

const mockStatus = jest.fn();

jest.mock('../../src/contract/service', () => ({
  ...jest.requireActual('../../src/contract/service'),
  getResearchStatus: (...args: unknown[]) => mockStatus(...args),
}));

const wrapper = () => {
  const queryClient = new QueryClient({
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
};

describe('useResearchNavLinks', () => {
  beforeAll(() =>
    i18next.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: { com_ui_feeds: 'Host feeds' } } },
    }),
  );

  beforeEach(() => mockStatus.mockReset());

  it('offers Research and Feeds once the server reports research enabled', async () => {
    mockStatus.mockResolvedValue({ enabled: true });
    const { result } = renderHook(() => useResearchNavLinks(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.map(({ id }) => id)).toEqual(['research', 'feeds']));
  });

  it('offers nothing while research is off', async () => {
    mockStatus.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useResearchNavLinks(true), { wrapper: wrapper() });
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);
  });

  it('does not ask the server when the user cannot use agents', () => {
    const { result } = renderHook(() => useResearchNavLinks(false), { wrapper: wrapper() });
    expect(mockStatus).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('registers the research copy without overriding host keys', () => {
    renderHook(() => useResearchNavLinks(false), { wrapper: wrapper() });
    expect(i18next.t('com_ui_research')).toBe('Research');
    expect(i18next.t('com_ui_feeds')).toBe('Host feeds');
  });

  it('ignores an i18n stand-in without resource bundles', () => {
    expect(() => registerResearchStrings(undefined)).not.toThrow();
  });
});
