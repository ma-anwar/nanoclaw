import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

interface TranscriptionConfig {
  enabled: boolean;
  fallbackMessage: string;
}

const DEFAULT_CONFIG: TranscriptionConfig = {
  enabled: true,
  fallbackMessage: '[Voice Message - transcription unavailable]',
};

async function transcribeWithElevenLabs(
  audioBuffer: Buffer,
): Promise<string | null> {
  const env = readEnvFile(['ELEVENLABS_API_KEY']);
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    logger.warn('ELEVENLABS_API_KEY not set in .env');
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('model_id', 'scribe_v2');
    formData.append(
      'file',
      new Blob([audioBuffer], { type: 'audio/ogg' }),
      'voice.ogg',
    );

    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText },
        'ElevenLabs STT request failed',
      );
      return null;
    }

    const data = (await response.json()) as { text?: string };
    return data.text || null;
  } catch (err) {
    logger.error({ err }, 'ElevenLabs transcription failed');
    return null;
  }
}

export async function transcribeAudioMessage(
  msg: WAMessage,
  sock: WASocket,
): Promise<string | null> {
  const config = DEFAULT_CONFIG;

  if (!config.enabled) {
    return config.fallbackMessage;
  }

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as any,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      logger.error('Failed to download audio message');
      return config.fallbackMessage;
    }

    logger.info({ bytes: buffer.length }, 'Downloaded audio message');

    const transcript = await transcribeWithElevenLabs(buffer);

    if (!transcript) {
      return config.fallbackMessage;
    }

    return transcript.trim();
  } catch (err) {
    logger.error({ err }, 'Transcription error');
    return config.fallbackMessage;
  }
}

export function isVoiceMessage(msg: WAMessage): boolean {
  return msg.message?.audioMessage?.ptt === true;
}
