import { useCallback, useRef } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useWebSocket } from '@/context/websocket-context';
import { useInterrupt } from '@/components/canvas/live2d';
import { useChatMessages, useHistoryList } from '@/context/chat-history-context';
import { useMode } from '@/context/mode-context';

export const useSidebar = () => {
  const disclosure = useDisclosure();
  const { sendMessage } = useWebSocket();
  const { interrupt } = useInterrupt();
  const { messages } = useChatMessages();
  const { currentHistoryUid, updateHistoryList } = useHistoryList();
  const { setMode, mode, isElectron } = useMode();

  // Ref mirrors so createNewHistory stays stable across message/session changes.
  // Without this, every new chat message creates a new createNewHistory reference,
  // defeating memo on SidebarContent → HeaderButtons (the entire child tree re-renders).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const currentHistoryUidRef = useRef(currentHistoryUid);
  currentHistoryUidRef.current = currentHistoryUid;

  const createNewHistory = useCallback((): void => {
    if (currentHistoryUidRef.current && messagesRef.current.length > 0) {
      const latestMessage = messagesRef.current[messagesRef.current.length - 1];
      updateHistoryList(currentHistoryUidRef.current, latestMessage);
    }

    interrupt();
    sendMessage({
      type: 'create-new-history',
    });
  }, [updateHistoryList, interrupt, sendMessage]);

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
