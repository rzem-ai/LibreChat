import { useGetStartupConfig } from '~/data-provider';

/** Deloitte Custom Change: forces shadcn/ui-only artifact mode via `customDeloitteFeatureFlags.artifactsShadcnOnly`. */
export default function useArtifactsShadcnOnly(): boolean {
  const { data: startupConfig } = useGetStartupConfig();
  return startupConfig?.interface?.customDeloitteFeatureFlags?.artifactsShadcnOnly === true;
}
