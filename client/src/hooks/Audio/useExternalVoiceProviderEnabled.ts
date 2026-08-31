import { useGetStartupConfig } from '~/data-provider';

/** Deloitte Custom Change: gates the external STT/TTS engine option via `customDeloitteFeatureFlags.externalVoiceProvider`. */
export default function useExternalVoiceProviderEnabled(): boolean {
  const { data: startupConfig } = useGetStartupConfig();
  return startupConfig?.interface?.customDeloitteFeatureFlags?.externalVoiceProvider !== false;
}
