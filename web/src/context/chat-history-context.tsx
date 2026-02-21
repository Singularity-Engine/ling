/* eslint-disable no-else-return */
import {
  createContext, useContext, useState, useMemo, useCallback, useRef,
} from 'react';
import { Message } from '@/services/websocket-service';
import { HistoryInfo } from './websocket-context';

/**
 * Chat history context — messages, history list, session management.
 * Separated from streaming response to avoid cascade re-renders:
 * fullResponse changes ~60x/sec during streaming; keeping it in the same
 * context forced ALL 14 consumers to re-render even if they only need messages.
 */
interface ChatHistoryState {
  messages: Message[];
  historyList: HistoryInfo[];
  currentHistoryUid: string | null;
  appendHumanMessage: (content: string) => void;
  appendAIMessage: (content: string, name?: string, avatar?: string) => void;
  appendOrUpdateToolCallMessage: (toolMessageData: Partial<Message>) => void;
  setMessages: (messages: Message[]) => void;
  setHistoryList: (
    value: HistoryInfo[] | ((prev: HistoryInfo[]) => HistoryInfo[])
  ) => void;
  setCurrentHistoryUid: (uid: string | null) => void;
  updateHistoryList: (uid: string, latestMessage: Message | null) => void;
}

/**
 * Streaming response context — the rapidly-changing fullResponse string
 * and its mutators. Only components that render streaming output (ChatArea,
 * interrupt hook, audio task) subscribe here, so sidebar / InputBar / App
 * are shielded from ~60 fps re-renders during AI streaming.
 */
interface StreamingResponseState {
  fullResponse: string;
  setFullResponse: (text: string) => void;
  appendResponse: (text: string) => void;
  clearResponse: () => void;
  setForceNewMessage: (value: boolean) => void;
}

/**
 * Keep at most this many messages in memory.
 * Oldest messages are trimmed when the limit is exceeded to prevent
 * unbounded DOM growth and state-update slowdowns in long conversations.
 */
const MAX_MESSAGES = 200;

/**
 * Default values and constants
 */
const DEFAULT_HISTORY = {
  messages: [] as Message[],
  historyList: [] as HistoryInfo[],
  currentHistoryUid: null as string | null,
  fullResponse: '',
};

export const ChatHistoryContext = createContext<ChatHistoryState | null>(null);
export const StreamingResponseContext = createContext<StreamingResponseState | null>(null);

/**
 * Chat History Provider Component
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 */
export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
  // State management
  const [messages, setMessages] = useState<Message[]>(DEFAULT_HISTORY.messages);
  const [historyList, setHistoryList] = useState<HistoryInfo[]>(
    DEFAULT_HISTORY.historyList,
  );
  const [currentHistoryUid, setCurrentHistoryUid] = useState<string | null>(
    DEFAULT_HISTORY.currentHistoryUid,
  );
  const [fullResponse, setFullResponse] = useState(DEFAULT_HISTORY.fullResponse);
  const forceNewMessageRef = useRef<boolean>(false);

  const setForceNewMessage = useCallback((value: boolean) => {
    forceNewMessageRef.current = value;
  }, []);

  /** Trim to the most recent MAX_MESSAGES entries. */
  const trimMessages = (msgs: Message[]): Message[] =>
    msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;

  /**
   * Append a human message to the chat history
   * @param content - Message content
   */
  const appendHumanMessage = useCallback((content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'human',
      type: 'text',
      timestamp: new Date().toISOString(),
    };
    setMessages((prevMessages) => trimMessages([...prevMessages, newMessage]));
  }, []);

  /**
   * Append or update an AI message in the chat history
   * @param content - Message content
   */
  const appendAIMessage = useCallback((content: string, name?: string, avatar?: string) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];

      // Use ref to avoid stale closure — always reads latest value
      if (forceNewMessageRef.current || !lastMessage || lastMessage.role !== 'ai' || lastMessage.type !== 'text') {
        forceNewMessageRef.current = false;
        return trimMessages([...prevMessages, {
          id: Date.now().toString(),
          content,
          role: 'ai',
          type: 'text',
          timestamp: new Date().toISOString(),
          name,
          avatar,
        }]);
      }

      // Otherwise, merge with last AI text message
      return [
        ...prevMessages.slice(0, -1),
        {
          ...lastMessage,
          content: lastMessage.content + content,
          timestamp: new Date().toISOString(),
        },
      ];
    });
  }, []);

  /**
   * Append or update a Tool Call message using its tool_id
   * @param toolMessageData - The partial tool call message data from WebSocket
   */
  const appendOrUpdateToolCallMessage = useCallback((toolMessageData: Partial<Message>) => {
    // Ensure required fields for a tool call are present
    if (!toolMessageData.tool_id || !toolMessageData.tool_name || !toolMessageData.status || !toolMessageData.timestamp) {
      console.error('[ChatHistory] Incomplete tool message data, missing fields for tool_id:', toolMessageData.tool_id);
      return;
    }

    setMessages((prevMessages) => {
      const existingMessageIndex = prevMessages.findIndex(
        (msg) => msg.type === 'tool_call_status' && msg.tool_id === toolMessageData.tool_id!,
      );

      if (existingMessageIndex !== -1) {
        // Update existing tool call message status and content
        const updatedMessages = [...prevMessages];
        const existingMsg = updatedMessages[existingMessageIndex];
        updatedMessages[existingMessageIndex] = {
          ...existingMsg,
          status: toolMessageData.status, // Update status
          name: toolMessageData.name || existingMsg.name,
          content: toolMessageData.content || existingMsg.content, // Update content (result/error or keep input)
          timestamp: toolMessageData.timestamp!, // Update timestamp
        };
        return updatedMessages;
      } else {
        // Append new tool call message
        const newToolMessage: Message = {
          id: toolMessageData.tool_id!, // Use tool_id as the main ID for uniqueness
          role: 'ai',
          type: 'tool_call_status',
          name: toolMessageData.name || '',
          tool_id: toolMessageData.tool_id,
          tool_name: toolMessageData.tool_name,
          status: toolMessageData.status,
          content: toolMessageData.content || '', // Initial content (input)
          timestamp: toolMessageData.timestamp!,
          // name/avatar could potentially be added if needed
        };
        return [...prevMessages, newToolMessage];
      }
    });
  }, []);

  /**
   * Update the history list with the latest message
   * @param uid - History unique identifier
   * @param latestMessage - Latest message to update with
   */
  const updateHistoryList = useCallback(
    (uid: string, latestMessage: Message | null) => {
      if (import.meta.env.DEV && !uid) {
        console.warn('[ChatHistory] updateHistoryList: uid is null');
      }
      if (import.meta.env.DEV && !currentHistoryUid) {
        console.warn('[ChatHistory] updateHistoryList: currentHistoryUid is null');
      }

      setHistoryList((prevList) => prevList.map((history) => {
        if (history.uid === uid) {
          return {
            ...history,
            latest_message: latestMessage
              ? {
                content: latestMessage.content,
                role: latestMessage.role,
                timestamp: latestMessage.timestamp,
              }
              : null,
            timestamp: latestMessage?.timestamp || history.timestamp,
          };
        }
        return history;
      }));
    },
    [currentHistoryUid],
  );

  const appendResponse = useCallback((text: string) => {
    setFullResponse((prev) => prev + (text || ''));
  }, []);

  const clearResponse = useCallback(() => {
    setFullResponse(DEFAULT_HISTORY.fullResponse);
  }, []);

  // Memoized context value
  const contextValue = useMemo(
    () => ({
      messages,
      historyList,
      currentHistoryUid,
      appendHumanMessage,
      appendAIMessage,
      appendOrUpdateToolCallMessage, // Add to context value
      setMessages,
      setHistoryList,
      setCurrentHistoryUid,
      updateHistoryList,
      fullResponse,
      setFullResponse,
      appendResponse,
      clearResponse,
      setForceNewMessage,
    }),
    [
      messages,
      historyList,
      currentHistoryUid,
      appendHumanMessage,
      appendAIMessage,
      appendOrUpdateToolCallMessage, // Add dependency
      updateHistoryList,
      fullResponse,
      appendResponse,
      clearResponse,
      setForceNewMessage,
    ],
  );

  return (
    <ChatHistoryContext.Provider value={contextValue}>
      {children}
    </ChatHistoryContext.Provider>
  );
}

/**
 * Custom hook to use the chat history context
 * @throws {Error} If used outside of ChatHistoryProvider
 */
export function useChatHistory() {
  const context = useContext(ChatHistoryContext);

  if (!context) {
    throw new Error('useChatHistory must be used within a ChatHistoryProvider');
  }

  return context;
}
