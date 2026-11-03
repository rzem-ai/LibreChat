import type { ResearchEmailParams } from '../../src/server/email';
import type { IResearchJob } from '../../src/db';
import { createEmailDeliveryChannel, renderReportHtml } from '../../src/server/email';
import { ResearchJobType } from '../../src/contract/types';

const job = {
  id: 'research_1',
  user: 'u1',
  jobType: ResearchJobType.DIGEST,
  conversationId: 'c-123',
  completedAt: new Date('2026-11-03T07:30:00.000Z'),
} as unknown as IResearchJob;

const markdown = [
  '# Daily digest: widgets',
  '',
  'Widgets grew <script>alert(1)</script> this week.',
  '',
  '[click](javascript:alert(1)) and [source](https://example.com/a)',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
].join('\n');

function channel(overrides: Partial<Parameters<typeof createEmailDeliveryChannel>[0]> = {}) {
  const sent: ResearchEmailParams[] = [];
  const email = createEmailDeliveryChannel({
    getUser: async () => ({
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada "Admin" <x>',
    }),
    sendEmail: async (params) => {
      sent.push(params);
    },
    appUrl: 'https://chat.example.com/',
    appName: 'LibreChat',
    ...overrides,
  });
  return { email, sent };
}

describe('renderReportHtml', () => {
  it('renders markdown and GFM tables while escaping raw HTML and unsafe links', () => {
    const html = renderReportHtml(markdown);
    expect(html).toContain('<h1>Daily digest: widgets</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com/a"');
  });

  it('never renders images, so opening the email loads nothing remote', () => {
    const html = renderReportHtml(
      '![pixel](https://tracker.example/p.gif?d=secret)\n\n<img src="https://t.example/x">',
    );
    expect(html).not.toContain('<img');
  });
});

describe('createEmailDeliveryChannel', () => {
  it('sends the rendered report with the job type and date in the subject', async () => {
    const { email, sent } = channel();
    expect(email.channel).toBe('email');
    expect(await email.send({ job, title: 'Daily digest: widgets', markdown })).toEqual({
      ok: true,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      email: 'ada@example.com',
      subject: 'Daily digest - 2026-11-03',
      template: 'researchReport.handlebars',
    });
    expect(sent[0].payload).toMatchObject({
      appName: 'LibreChat',
      name: 'Ada Admin x',
      title: 'Daily digest: widgets',
      conversationUrl: 'https://chat.example.com/c/c-123',
    });
    expect(sent[0].payload.reportHtml).toContain('<table>');
    expect(sent[0].payload.reportHtml).not.toContain('<script>');
  });

  it('fails without retry when the address is not verified', async () => {
    const { email, sent } = channel({
      getUser: async () => ({ email: 'someone@else.example', emailVerified: false }),
    });
    expect(await email.send({ job, title: 't', markdown })).toEqual({
      ok: false,
      code: 'email_unverified',
      retryable: false,
    });
    expect(sent).toEqual([]);
  });

  it('fails without retry when the user has no email address', async () => {
    const { email, sent } = channel({ getUser: async () => ({ name: 'Ada' }) });
    expect(await email.send({ job, title: 't', markdown })).toEqual({
      ok: false,
      code: 'email_no_address',
      retryable: false,
    });
    expect(sent).toEqual([]);
  });

  it('reports a provider failure as retryable without its message', async () => {
    const { email } = channel({
      sendEmail: async () => {
        throw new Error('535 auth failed for smtp-user:hunter2');
      },
    });
    const result = await email.send({ job, title: 't', markdown });
    expect(result).toEqual({ ok: false, code: 'email_failed', retryable: true });
  });
});
