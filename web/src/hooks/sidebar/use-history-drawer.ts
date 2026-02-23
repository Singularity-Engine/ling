import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatMessages, useHistoryList } from '@/context/chat-history-context';
import { useWebSocketActions, HistoryInfo, LegacyMessage } from '@/context/websocket-context';
import { toaster } from '@/components/ui/toaster';

export const useHistoryDrawer = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { messages } = useChatMessages();
  const {
    historyList,
    currentHistoryUid,
    setCurrentHistoryUid,
    setHistoryList,
    updateHistoryList,
  } = useHistoryList();
  const { sendMessage } = useWebSocketActions();

  // Refs for values that change frequently — lets callbacks stay stable
  const messagesRef = useRef<LegacyMessage[]>(messages);
  messagesRef.current = messages;
  const currentHistoryUidRef = useRef(currentHistoryUid);
  currentHistoryUidRef.current = currentHistoryUid;

  const fetchAndSetHistory = useCallback((uid: string) => {
    const curUid = currentHistoryUidRef.current;
    const msgs = messagesRef.current;
    if (!uid || uid === curUid) return;

    if (curUid && msgs.length > 0) {
      const latestMessage = msgs[msgs.length - 1];
      updateHistoryList(curUid, latestMessage);
    }

    setCurrentHistoryUid(uid);
    sendMessage({
      type: 'fetch-and-set-history',
      history_uid: uid,
    });
  }, [sendMessage, setCurrentHistoryUid, updateHistoryList]);

  const deleteHistory = useCallback((uid: string) => {
    if (uid === currentHistoryUidRef.current) {
      toaster.create({
        title: t('error.cannotDeleteCurrentHistory'),
        type: 'warning',
        duration: 2000,
      });
      return;
    }

    sendMessage({
      type: 'delete-history',
      history_uid: uid,
    });
    setHistoryList((prev) => prev.filter((history) => history.uid !== uid));
  }, [sendMessage, setHistoryList, t]);

  const getLatestMessageContent = (history: HistoryInfo) => {
    if (history.uid === currentHistoryUid && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      return {
        content: latestMessage.content,
        timestamp: latestMessage.timestamp,
      };
    }
    return {
      content: history.latest_message?.content || '',
      timestamp: history.timestamp,
    };
  };

  return {
    open,
    setOpen,
    historyList,
    currentHistoryUid,
    fetchAndSetHistory,
    deleteHistory,
    getLatestMessageContent,
  };
};
