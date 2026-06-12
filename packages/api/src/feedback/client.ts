export interface LangfuseConfig {
  authHeader: string;
  baseUrl: string;
}

let config: LangfuseConfig | null | undefined;

export function getLangfuseConfig(): LangfuseConfig | null {
  if (config !== undefined) return config;
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = process.env;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY || !LANGFUSE_BASE_URL) {
    config = null;
    return null;
  }
  const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64');
  config = { authHeader: `Basic ${auth}`, baseUrl: LANGFUSE_BASE_URL };
  return config;
}

/** Reset the cached config — for testing only. */
export function resetLangfuseConfig(): void {
  config = undefined;
}
