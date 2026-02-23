import { ChangeEvent, KeyboardEvent, useCallback } from 'react';
import { useVADState, useVADActions } from '@/context/vad-context';
import { useTextInput } from '@/hooks/footer/use-text-input';
import { useInterrupt } from '@/hooks/utils/use-interrupt';
import { useMicToggle } from '@/hooks/utils/use-mic-toggle';
import { useAiStateRead, useAiStateActions, AiStateEnum } from '@/context/ai-state-context';
import { useTriggerSpeak } from '@/hooks/utils/use-trigger-speak';
import { useProactiveSpeak } from '@/context/proactive-speak-context';
import { useLatest } from '@/utils/use-latest';

export const useFooter = () => {
  const {
    inputText: inputValue,
    setInputText: handleChange,
    handleKeyPress: handleKey,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextInput();

  const { interrupt } = useInterrupt();
  const { autoStartMicOn } = useVADState();
  const { startMic } = useVADActions();
  const { handleMicToggle: rawMicToggle, micOn } = useMicToggle();
  const { aiState } = useAiStateRead();
  const { setAiState } = useAiStateActions();
  const { sendTriggerSignal } = useTriggerSpeak();
  const { settings } = useProactiveSpeak();

  // Capture closure deps in a ref so the callbacks below stay referentially
  // stable and never break the memo() on ActionButtons / MessageInput.
  const latest = useLatest({
    handleChange, handleKey, setAiState,
    aiState, interrupt, autoStartMicOn, startMic,
    rawMicToggle, sendTriggerSignal, settings,
  });

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const { handleChange, setAiState } = latest.current;
    handleChange({ target: { value: e.target.value } } as ChangeEvent<HTMLInputElement>);
    setAiState(AiStateEnum.WAITING);
  }, [latest]);

  const handleKeyPress = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    latest.current.handleKey(e);
  }, [latest]);

  const handleInterrupt = useCallback(() => {
    const { aiState, interrupt, autoStartMicOn, startMic, sendTriggerSignal, settings } = latest.current;
    if (aiState === AiStateEnum.THINKING_SPEAKING) {
      interrupt();
      if (autoStartMicOn) {
        startMic();
      }
    } else if (settings.allowButtonTrigger) {
      sendTriggerSignal(-1);
    }
  }, [latest]);

  const handleMicToggle = useCallback(() => {
    latest.current.rawMicToggle();
  }, [latest]);

  return {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleMicToggle,
    micOn,
  };
};
