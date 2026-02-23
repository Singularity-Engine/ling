import { useState, useCallback } from 'react';
import { useWebSocketActions } from '@/context/websocket-context';
import { useAiStateRead } from '@/context/ai-state-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useChatMessages } from '@/context/chat-history-context';
import { useVADState, useVADActions } from '@/context/vad-context';
import { useMediaCapture } from '@/hooks/utils/use-media-capture';
import { useLatest } from '@/utils/use-latest';

export function useTextInput() {
  const [inputText, setInputText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const wsContext = useWebSocketActions();
  const { aiState } = useAiStateRead();
  const { interrupt } = useInterrupt();
  const { appendHumanMessage } = useChatMessages();
  const { autoStopMic } = useVADState();
  const { stopMic } = useVADActions();
  const { captureAllMedia } = useMediaCapture();

  // React state setters are stable — useCallback with [] is safe
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  }, []);

  // Capture frequently-changing values so handleSend/handleKeyPress stay stable
  const latest = useLatest({
    inputText, wsContext, aiState, interrupt,
    appendHumanMessage, autoStopMic, stopMic, captureAllMedia, isComposing,
  });

  const handleSend = useCallback(async () => {
    const { inputText, wsContext, aiState, interrupt, appendHumanMessage, autoStopMic, stopMic, captureAllMedia } = latest.current;
    if (!inputText.trim() || !wsContext) return;
    if (aiState === 'thinking-speaking') {
      interrupt();
    }

    const images = await captureAllMedia();

    appendHumanMessage(inputText.trim());
    wsContext.sendMessage({
      type: 'text-input',
      text: inputText.trim(),
      images,
    });

    if (autoStopMic) stopMic();
    setInputText('');
  }, [latest]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (latest.current.isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleCompositionStart = useCallback(() => setIsComposing(true), []);
  const handleCompositionEnd = useCallback(() => setIsComposing(false), []);

  return {
    inputText,
    setInputText: handleInputChange,
    handleSend,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
