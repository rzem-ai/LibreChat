import { useCallback, useMemo } from 'react';
import { useGetStartupConfig } from '~/data-provider';

/** Deloitte Custom Change: resolves model IDs to the model spec labels configured in `librechat.yaml`. */
export default function useModelLabel(provider: string): (modelId: string) => string {
  const { data: startupConfig } = useGetStartupConfig();

  const labels = useMemo(
    () =>
      new Map(
        (startupConfig?.modelSpecs?.list ?? []).map((spec) => [
          `${spec.preset.endpoint}:${spec.preset.model}`,
          spec.label,
        ]),
      ),
    [startupConfig?.modelSpecs?.list],
  );

  return useCallback(
    (modelId: string) => labels.get(`${provider}:${modelId}`) ?? modelId,
    [labels, provider],
  );
}
