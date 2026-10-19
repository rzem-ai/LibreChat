import { Alert } from '@librechat/client';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import type { ReactElement } from 'react';
import { useLocalize } from '~/hooks';

/**
 * Deloitte Custom Change: explain browser speech capabilities when STT and TTS default off.
 *
 * This component accepts no parameters.
 * @returns A localized informational notice when both speech defaults are disabled, or `null`.
 */
export default function SpeechNotice(): ReactElement | null {
  const localize = useLocalize();
  const { data } = useGetCustomConfigSpeechQuery();

  if (data?.textToSpeech !== false || data?.speechToText !== false) {
    return null;
  }

  return (
    <Alert variant="info" role="note" className="mx-1 mb-6 text-text-primary">
      <div className="space-y-1">
        <p className="font-semibold">{localize('com_nav_speech_notice_title')}</p>
        <p>{localize('com_nav_speech_notice_description')}</p>
      </div>
    </Alert>
  );
}
