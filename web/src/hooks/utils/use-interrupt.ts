import { useAiState } from '@/context/AiStateContext';
import { useWebSocket } from '@/context/WebsocketContext';
import { useStreamingRef, useStreamingSetters } from '@/context/ChatHistoryContext';
import { audioTaskQueue } from '@/utils/task-queue';
import { useSubtitle } from '@/context/SubtitleContext';
import { useAudioTask } from './use-audio-task';

export const useInterrupt = () => {
  const { aiState, setAiState } = useAiState();
  const { sendMessage } = useWebSocket();
  const { getFullResponse } = useStreamingRef();
  const { clearResponse } = useStreamingSetters();
  const { subtitleText, setSubtitleText } = useSubtitle();
  const { stopCurrentAudioAndLipSync } = useAudioTask();

  const interrupt = (sendSignal = true) => {
    if (aiState !== 'thinking-speaking') return;

    stopCurrentAudioAndLipSync();

    audioTaskQueue.clearQueue();

    setAiState('interrupted');

    if (sendSignal) {
      sendMessage({
        type: 'interrupt-signal',
        text: getFullResponse(),
      });
    }

    clearResponse();

    if (subtitleText === 'Thinking...') {
      setSubtitleText('');
    }
  };

  return { interrupt };
};
