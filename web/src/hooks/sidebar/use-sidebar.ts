import { useDisclosure } from '@chakra-ui/react';
import { useWebSocket } from '@/context/websocket-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useChatMessages, useHistoryList } from '@/context/chat-history-context';
import { useMode, ModeType } from '@/context/mode-context';

export const useSidebar = () => {
  const disclosure = useDisclosure();
  const { sendMessage } = useWebSocket();
  const { interrupt } = useInterrupt();
  const { messages } = useChatMessages();
  const { currentHistoryUid, updateHistoryList } = useHistoryList();
  const { setMode, mode, isElectron } = useMode();

  const createNewHistory = (): void => {
    if (currentHistoryUid && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      updateHistoryList(currentHistoryUid, latestMessage);
    }

    interrupt();
    sendMessage({
      type: 'create-new-history',
    });
  };

  return {
    settingsOpen: disclosure.open,
    onSettingsOpen: disclosure.onOpen,
    onSettingsClose: disclosure.onClose,
    createNewHistory,
    setMode,
    currentMode: mode,
    isElectron,
  };
};
