import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSafePageFetcher, pageToMarkdown, PageFetchError } from '../../src/server/fetch';

let server: http.Server;
let origin: string;
let allowed: string[];

const ARTICLE = `<!doctype html><html><head><title>Widgets &amp; Co</title>
<script>var tracking = 'secret';</script><style>body{}</style></head>
<body><nav>Home | About</nav>
<main><h1>Widget prices</h1><p>Prices rose <b>4%</b> in Q3.</p>
<ul><li>First</li><li>Second</li></ul></main>
<footer>Copyright</footer></body></html>`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/article':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ARTICLE);
        return;
      case '/moved':
        res.writeHead(302, { Location: '/article' });
        res.end();
        return;
      case '/to-metadata':
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
        return;
      case '/loop':
        res.writeHead(302, { Location: '/loop' });
        res.end();
        return;
      case '/big':
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('x'.repeat(5000));
        return;
      case '/plain':
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Just text.');
        return;
      case '/slow-hop':
        setTimeout(() => {
          res.writeHead(302, { Location: '/slow-hop' });
          res.end();
        }, 150);
        return;
      case '/binary':
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.from([0, 1, 2]));
        return;
      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('missing');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  allowed = [`127.0.0.1:${port}`];
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const fetcher = (overrides: Partial<Parameters<typeof createSafePageFetcher>[0]> = {}) =>
  createSafePageFetcher({
    maxBytes: 1_000_000,
    timeoutMs: 5000,
    maxRedirects: 3,
    allowedAddresses: allowed,
    ...overrides,
  });

describe('createSafePageFetcher', () => {
  it('blocks a private address unless an operator exempts it', async () => {
    const guarded = createSafePageFetcher({ maxBytes: 1000, timeoutMs: 5000, maxRedirects: 3 });
    await expect(guarded.fetch(`${origin}/article`)).rejects.toMatchObject({
      code: 'fetch_blocked',
    });
  });

  it('fetches an exempted page and follows a relative redirect', async () => {
    const page = await fetcher().fetch(`${origin}/moved`);
    expect(page.finalUrl).toBe(`${origin}/article`);
    expect(page.status).toBe(200);
    expect(page.contentType).toContain('text/html');
    expect(page.body).toContain('Widget prices');
  });

  it('re-checks every redirect hop against the guard', async () => {
    await expect(fetcher().fetch(`${origin}/to-metadata`)).rejects.toMatchObject({
      code: 'fetch_blocked',
    });
  });

  it('stops after the redirect limit', async () => {
    await expect(fetcher().fetch(`${origin}/loop`)).rejects.toMatchObject({
      code: 'fetch_too_many_redirects',
    });
  });

  it('refuses bodies over the byte limit', async () => {
    await expect(fetcher({ maxBytes: 1000 }).fetch(`${origin}/big`)).rejects.toMatchObject({
      code: 'fetch_too_large',
    });
  });

  it('reports an error status with a stable code', async () => {
    await expect(fetcher().fetch(`${origin}/nope`)).rejects.toMatchObject({
      code: 'fetch_status',
      status: 404,
    });
  });

  it('rejects non-http schemes before any request', async () => {
    const error = await fetcher()
      .fetch('file:///etc/passwd')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PageFetchError);
    expect((error as PageFetchError).code).toBe('fetch_invalid_url');
  });

  it('refuses content it cannot turn into text', async () => {
    await expect(fetcher().fetch(`${origin}/binary`)).rejects.toMatchObject({
      code: 'fetch_unsupported_type',
    });
  });
});

describe('createSafePageFetcher resource bounds', () => {
  it('applies one deadline across the whole redirect chain', async () => {
    const started = Date.now();
    const error = await fetcher({ timeoutMs: 400, maxRedirects: 10 })
      .fetch(`${origin}/slow-hop`)
      .catch((e: unknown) => e);
    expect((error as PageFetchError).code).toBe('fetch_timeout');
    expect(Date.now() - started).toBeLessThan(1200);
  });

  it('connects directly even when an environment proxy is configured', async () => {
    let proxied = 0;
    const proxy = http.createServer((_req, res) => {
      proxied += 1;
      res.writeHead(502);
      res.end();
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const { port } = proxy.address() as AddressInfo;
    const saved = { http: process.env.HTTP_PROXY, https: process.env.HTTPS_PROXY };
    process.env.HTTP_PROXY = `http://127.0.0.1:${port}`;
    process.env.HTTPS_PROXY = `http://127.0.0.1:${port}`;
    try {
      const page = await fetcher().fetch(`${origin}/article`);
      expect(page.status).toBe(200);
      expect(proxied).toBe(0);
    } finally {
      process.env.HTTP_PROXY = saved.http;
      process.env.HTTPS_PROXY = saved.https;
      if (saved.http === undefined) delete process.env.HTTP_PROXY;
      if (saved.https === undefined) delete process.env.HTTPS_PROXY;
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });
});

describe('pageToMarkdown', () => {
  it('stays linear on pathological markup', () => {
    const hostile = `<title>${'a'.repeat(300_000)}${'<body '.repeat(30_000)}`;
    const started = Date.now();
    pageToMarkdown({
      finalUrl: 'https://e.example',
      status: 200,
      contentType: 'text/html',
      body: hostile,
    });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('keeps the main content as markdown and drops scripts, styles and chrome', () => {
    const { title, markdown } = pageToMarkdown({
      finalUrl: 'https://example.com/a',
      status: 200,
      contentType: 'text/html',
      body: ARTICLE,
    });
    expect(title).toBe('Widgets & Co');
    expect(markdown).toContain('# Widget prices');
    expect(markdown).toContain('Prices rose **4%** in Q3.');
    expect(markdown).toMatch(/\* First/);
    expect(markdown).not.toContain('tracking');
    expect(markdown).not.toContain('Home | About');
    expect(markdown).not.toContain('Copyright');
  });

  it('passes plain text through', () => {
    expect(
      pageToMarkdown({
        finalUrl: 'https://example.com/t',
        status: 200,
        contentType: 'text/plain',
        body: 'Just text.',
      }).markdown,
    ).toBe('Just text.');
  });
});
