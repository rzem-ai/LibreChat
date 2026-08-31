import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import { EngineSTTDropdown } from '../SettingsTabs/Speech/STT';
import { EngineTTSDropdown } from '../SettingsTabs/Speech/TTS';
import { useExternalVoiceProviderEnabled } from '~/hooks';

export function EngineSTTSetting() {
  const { data } = useGetCustomConfigSpeechQuery();
  const externalVoiceProviderEnabled = useExternalVoiceProviderEnabled();
  return (
    <EngineSTTDropdown external={externalVoiceProviderEnabled && Boolean(data?.sttExternal)} />
  );
}

export function EngineTTSSetting() {
  const { data } = useGetCustomConfigSpeechQuery();
  const externalVoiceProviderEnabled = useExternalVoiceProviderEnabled();
  return (
    <EngineTTSDropdown external={externalVoiceProviderEnabled && Boolean(data?.ttsExternal)} />
  );
}
