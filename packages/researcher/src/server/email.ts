import { micromark } from 'micromark';
import { checkEmailConfig } from '@librechat/api';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import type { DeliveryChannel, ChannelSendResult } from './channels';
import { researchJobTitle } from './service';

export const RESEARCH_EMAIL_TEMPLATE = 'researchReport.handlebars';

export type ResearchEmailParams = {
  email: string;
  subject: string;
  template: string;
  payload: {
    appName: string;
    name: string;
    title: string;
    /** Rendered by micromark, which escapes raw HTML and drops unsafe link protocols. */
    reportHtml: string;
    conversationUrl: string;
    year: string;
  };
};

/** Images would load remote content when the email is opened, so image syntax is off. */
const NO_IMAGES = { disable: { null: ['labelStartImage'] } };

/**
 * Report markdown as email HTML. Raw HTML in the report is escaped and links with
 * dangerous protocols are dropped (micromark's defaults), so the template can insert it
 * unescaped.
 */
export function renderReportHtml(markdown: string): string {
  return micromark(markdown, {
    extensions: [gfm(), NO_IMAGES],
    htmlExtensions: [gfmHtml()],
  });
}

/** Display name for the To header: no quotes, angle brackets or line breaks. */
function headerName(value: string | undefined): string {
  return (value ?? '')
    .replace(/["<>\r\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What the host supplies for email delivery. */
export type ResearchEmailDeps = {
  sendEmail: (params: ResearchEmailParams) => Promise<unknown>;
  /** The client's public origin, for the conversation link. */
  appUrl: string;
  appName?: string;
};

/**
 * Email delivery deps from the deployment's email settings, or undefined when no
 * provider is configured, so a schedule asking for email records `channel_unavailable`.
 */
export function createResearchEmail(
  sendEmail: ResearchEmailDeps['sendEmail'],
  env: NodeJS.ProcessEnv = process.env,
): ResearchEmailDeps | undefined {
  if (!checkEmailConfig() || !env.DOMAIN_CLIENT) {
    return undefined;
  }
  return {
    sendEmail,
    appUrl: env.DOMAIN_CLIENT,
    ...(env.APP_TITLE ? { appName: env.APP_TITLE } : {}),
  };
}

/**
 * Email delivery through the host's `sendEmail` (nodemailer or Mailgun) and the
 * `researchReport` template (design 5.8). The body links to the conversation, which
 * holds the report file.
 */
export function createEmailDeliveryChannel(
  deps: ResearchEmailDeps & {
    getUser: (userId: string) => Promise<{
      email?: string;
      emailVerified?: boolean;
      name?: string;
      username?: string;
    } | null>;
    now?: () => Date;
  },
): DeliveryChannel {
  const now = deps.now ?? (() => new Date());
  const origin = deps.appUrl.replace(/\/+$/, '');

  async function send({
    job,
    title,
    markdown,
  }: Parameters<DeliveryChannel['send']>[0]): Promise<ChannelSendResult> {
    const user = await deps.getUser(String(job.user));
    if (!user?.email) {
      return { ok: false, code: 'email_no_address', retryable: false };
    }
    /** Only a verified address, so the server never mails an address the user does not own. */
    if (user.emailVerified !== true) {
      return { ok: false, code: 'email_unverified', retryable: false };
    }
    const date = new Date(job.completedAt ?? now()).toISOString().slice(0, 10);
    try {
      await deps.sendEmail({
        email: user.email,
        subject: `${researchJobTitle(job.jobType)} - ${date}`,
        template: RESEARCH_EMAIL_TEMPLATE,
        payload: {
          appName: deps.appName ?? 'LibreChat',
          name: headerName(user.name ?? user.username) || user.email,
          title,
          reportHtml: renderReportHtml(markdown),
          conversationUrl: `${origin}/c/${encodeURIComponent(job.conversationId)}`,
          year: String(now().getUTCFullYear()),
        },
      });
      return { ok: true };
    } catch {
      return { ok: false, code: 'email_failed', retryable: true };
    }
  }

  return { channel: 'email', send };
}
