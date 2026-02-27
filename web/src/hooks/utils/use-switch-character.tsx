import { useCallback } from 'react';
import { useWebSocket } from '@/context/WebsocketContext';
import { useConfig } from '@/context/CharacterConfigContext';
import { useInterrupt } from '@/components/canvas/live2d';
import { useVAD } from '@/context/VadContext';
import { useSubtitle } from '@/context/SubtitleContext';
import { useAiState } from '@/context/AiStateContext';
import { useLive2DConfig } from '@/context/Live2dConfigContext';

export function useSwitchCharacter() {
  const { sendMessage } = useWebSocket();
  const { confName, getFilenameByName } = useConfig();
  const { interrupt } = useInterrupt();
  const { stopMic } = useVAD();
  const { setSubtitleText } = useSubtitle();
  const { setAiState } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const switchCharacter = useCallback((fileName: string) => {
    const currentFilename = getFilenameByName(confName);

    if (currentFilename === fileName) {
      return;
    }

    setSubtitleText('New Character Loading...');
    interrupt();
    stopMic();
    setAiState('loading');
    setModelInfo(undefined);
    sendMessage({
      type: 'switch-config',
      file: fileName,
    });
  }, [confName, getFilenameByName, sendMessage, interrupt, stopMic, setSubtitleText, setAiState]);

  return { switchCharacter };
}
