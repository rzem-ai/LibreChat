import { useEffect, useRef } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
// Deloitte Custom Change: feature-flag gate for external voice provider (PR #629)
import { useExternalVoiceProviderEnabled } from '~/hooks/Audio';
import { STTEndpoints, TTSEndpoints } from '~/common';
import { logger } from '~/utils';
import store from '~/store';

const VALID_TTS_ENGINES: string[] = [TTSEndpoints.browser, TTSEndpoints.external];
// Deloitte Custom Change: migrate legacy enabled speech defaults once, then preserve user choices.
const DISABLED_SPEECH_DEFAULT_MIGRATION_KEYS = {
  speechToText: 'speechToTextDisabledDefaultV1',
  textToSpeech: 'textToSpeechDisabledDefaultV1',
} as const;

/**
 * Initializes speech-related Recoil values from the server-side custom
 * configuration on first load (only when the user is authenticated)
 */
export default function useSpeechSettingsInit(isAuthenticated: boolean) {
  const { data, isError, isFetched } = useGetCustomConfigSpeechQuery({ enabled: isAuthenticated });
  const [engineSTT, setEngineSTT] = useRecoilState<string>(store.engineSTT);
  const [engineTTS, setEngineTTS] = useRecoilState<string>(store.engineTTS);
  const setSpeechSettingsInitialized = useSetRecoilState(store.speechSettingsInitialized);
  // Deloitte Custom Change: feature-flag gate for external voice provider (PR #629)
  const externalVoiceProviderEnabled = useExternalVoiceProviderEnabled();

  const setters = useRef({
    conversationMode: useSetRecoilState(store.conversationMode),
    advancedMode: useSetRecoilState(store.advancedMode),
    speechToText: useSetRecoilState(store.speechToText),
    textToSpeech: useSetRecoilState(store.textToSpeech),
    cacheTTS: useSetRecoilState(store.cacheTTS),
    engineSTT: setEngineSTT,
    languageSTT: useSetRecoilState(store.languageSTT),
    autoTranscribeAudio: useSetRecoilState(store.autoTranscribeAudio),
    decibelValue: useSetRecoilState(store.decibelValue),
    autoSendText: useSetRecoilState(store.autoSendText),
    engineTTS: setEngineTTS,
    voice: useSetRecoilState(store.voice),
    cloudBrowserVoices: useSetRecoilState(store.cloudBrowserVoices),
    languageTTS: useSetRecoilState(store.languageTTS),
    automaticPlayback: useSetRecoilState(store.automaticPlayback),
    playbackRate: useSetRecoilState(store.playbackRate),
  }).current;

  useEffect(() => {
    if (!isAuthenticated) {
      setSpeechSettingsInitialized(false);
      return;
    }

    if (!isFetched) return;

    if (
      isError &&
      (localStorage.getItem('engineSTT') === null || localStorage.getItem('engineTTS') === null)
    ) {
      setSpeechSettingsInitialized(false);
      return;
    }

    const hasSavedEngineSTT = localStorage.getItem('engineSTT') !== null;
    const hasSavedEngineTTS = localStorage.getItem('engineTTS') !== null;

    if (data && data.message !== 'not_found') {
      logger.log('Initializing speech settings from config:', data);

      Object.entries(data).forEach(([key, value]) => {
        if (key === 'sttExternal' || key === 'ttsExternal') return;

        const migrationKey =
          value === false && (key === 'speechToText' || key === 'textToSpeech')
            ? DISABLED_SPEECH_DEFAULT_MIGRATION_KEYS[key]
            : undefined;
        const shouldApplyDisabledDefault =
          migrationKey !== undefined && localStorage.getItem(migrationKey) === null;

        if (localStorage.getItem(key) !== null && !shouldApplyDisabledDefault) return;

        let applied = false;

        // Deloitte Custom Change: apply speech defaults with key-specific type checks.
        switch (key) {
          case 'conversationMode':
            if (typeof value === 'boolean') {
              setters.conversationMode(value);
              applied = true;
            }
            break;
          case 'advancedMode':
            if (typeof value === 'boolean') {
              setters.advancedMode(value);
              applied = true;
            }
            break;
          case 'speechToText':
            if (typeof value === 'boolean') {
              setters.speechToText(value);
              applied = true;
            }
            break;
          case 'textToSpeech':
            if (typeof value === 'boolean') {
              setters.textToSpeech(value);
              applied = true;
            }
            break;
          case 'cacheTTS':
            if (typeof value === 'boolean') {
              setters.cacheTTS(value);
              applied = true;
            }
            break;
          case 'engineSTT':
            if (typeof value === 'string') {
              setters.engineSTT(value);
              applied = true;
            }
            break;
          case 'languageSTT':
            if (typeof value === 'string') {
              setters.languageSTT(value);
              applied = true;
            }
            break;
          case 'autoTranscribeAudio':
            if (typeof value === 'boolean') {
              setters.autoTranscribeAudio(value);
              applied = true;
            }
            break;
          case 'decibelValue':
            if (typeof value === 'number') {
              setters.decibelValue(value);
              applied = true;
            }
            break;
          case 'autoSendText':
            if (typeof value === 'number') {
              setters.autoSendText(value);
              applied = true;
            }
            break;
          case 'engineTTS':
            if (typeof value === 'string') {
              setters.engineTTS(value);
              applied = true;
            }
            break;
          case 'voice':
            if (typeof value === 'string') {
              setters.voice(value);
              applied = true;
            }
            break;
          case 'cloudBrowserVoices':
            if (typeof value === 'boolean') {
              setters.cloudBrowserVoices(value);
              applied = true;
            }
            break;
          case 'languageTTS':
            if (typeof value === 'string') {
              setters.languageTTS(value);
              applied = true;
            }
            break;
          case 'automaticPlayback':
            if (typeof value === 'boolean') {
              setters.automaticPlayback(value);
              applied = true;
            }
            break;
          case 'playbackRate':
            if (typeof value === 'number') {
              setters.playbackRate(value);
              applied = true;
            }
            break;
          default:
            break;
        }

        if (applied) {
          logger.log(`Setting default speech setting: ${key} = ${value}`);
          if (shouldApplyDisabledDefault && migrationKey) {
            localStorage.setItem(key, JSON.stringify(value));
            localStorage.setItem(migrationKey, 'true');
          }
        }
      });
    }

    const configuredEngineSTT = hasSavedEngineSTT ? engineSTT : data?.engineSTT;
    const configuredEngineTTS = hasSavedEngineTTS ? engineTTS : data?.engineTTS;
    const sttExternalUnavailable = data?.sttExternal != null && !data.sttExternal;
    const ttsExternalUnavailable = data?.ttsExternal != null && !data.ttsExternal;

    if (sttExternalUnavailable && configuredEngineSTT === STTEndpoints.external) {
      setEngineSTT(STTEndpoints.browser);
    }
    if (ttsExternalUnavailable && configuredEngineTTS === TTSEndpoints.external) {
      setEngineTTS(TTSEndpoints.browser);
    }

    setSpeechSettingsInitialized(true);
  }, [
    data,
    engineSTT,
    engineTTS,
    isAuthenticated,
    isError,
    isFetched,
    setEngineSTT,
    setEngineTTS,
    setSpeechSettingsInitialized,
    setters,
  ]);

  useEffect(() => {
    if (VALID_TTS_ENGINES.includes(engineTTS)) return;
    logger.log(`Resetting invalid TTS engine "${engineTTS}" to ${TTSEndpoints.browser}`);
    setEngineTTS(TTSEndpoints.browser);
  }, [engineTTS, setEngineTTS]);

  /** Deloitte Custom Change: force any persisted 'external' STT/TTS engine back to
   *  'browser' when externalVoiceProvider is disabled. Runs on app startup so it's
   *  enforced independently of whether the user ever opens the Speech settings tab. */
  useEffect(() => {
    if (externalVoiceProviderEnabled) return;

    if (engineSTT === TTSEndpoints.external) {
      logger.log('External voice provider disabled: resetting STT engine to browser');
      setters.engineSTT(TTSEndpoints.browser);
    }

    if (engineTTS === TTSEndpoints.external) {
      logger.log('External voice provider disabled: resetting TTS engine to browser');
      setEngineTTS(TTSEndpoints.browser);
    }
  }, [externalVoiceProviderEnabled, engineSTT, engineTTS, setters, setEngineTTS]);
}
