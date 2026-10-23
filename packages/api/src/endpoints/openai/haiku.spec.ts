import { EModelEndpoint } from 'librechat-data-provider';
import { getOpenAILLMConfig } from './llm';

const sampling = ['temperature', 'topP', 'top_p', 'topK', 'top_k'];

const build = (model: string, overrides: Partial<Parameters<typeof getOpenAILLMConfig>[0]> = {}) =>
  getOpenAILLMConfig({
    apiKey: 'test-key',
    streaming: false,
    endpoint: EModelEndpoint.custom,
    modelOptions: { model },
    ...overrides,
  }).llmConfig;

const present = (config: ReturnType<typeof build>) => {
  const target = config as Record<string, unknown>;
  const kwargs = (target.modelKwargs ?? {}) as Record<string, unknown>;
  return sampling.filter((key) => key in target || key in kwargs);
};

describe.each(['claude-haiku-5-5', 'anthropic/claude-haiku-5.5', 'claude-haiku-5-10'])(
  'Haiku 5.5+ OpenAI-compatible requests (%s)',
  (model) => {
    it('strips saved temperature and topP values', () => {
      const config = build(model, { modelOptions: { model, temperature: 0.7, top_p: 0.9 } });

      expect(present(config)).toEqual([]);
    });

    it('strips configured default params', () => {
      const config = build(model, { defaultParams: { temperature: 0.5, topP: 0.8, top_k: 40 } });

      expect(present(config)).toEqual([]);
    });

    it('strips sampling values supplied through addParams', () => {
      const config = build(model, { addParams: { temperature: 0.3, top_p: 0.4, topK: 20 } });

      expect(present(config)).toEqual([]);
    });

    it('keeps unrelated params', () => {
      const config = build(model, {
        modelOptions: { model, temperature: 0.7, max_tokens: 512 },
      });

      expect(config).toHaveProperty('maxTokens', 512);
    });
  },
);

describe.each(['claude-haiku-5-4', 'claude-haiku-4-5', 'claude-sonnet-4-6'])(
  'pre-5.5 OpenAI-compatible requests (%s)',
  (model) => {
    it('keeps saved sampling values', () => {
      const config = build(model, { modelOptions: { model, temperature: 0.7, top_p: 0.9 } });

      expect(config).toHaveProperty('temperature', 0.7);
      expect(config).toHaveProperty('top_p', 0.9);
    });
  },
);
