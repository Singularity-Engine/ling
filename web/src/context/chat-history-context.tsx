/* eslint-disable no-else-return */
import {
  createContext, useContext, useState, useMemo, useCallback, useRef,
} from 'react';
import { Message } from '@/services/websocket-service';
import { HistoryInfo } from './websocket-context';

/**
 * Context 1 — Chat messages, history list, session management.
 * Changes only when a message is added/removed or history changes.
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
 * Context 2 — Streaming response VALUE.
 * Changes ~60fps during AI streaming. Only ChatArea and interrupt hook
 * subscribe here; sidebar / InputBar / App are shielded.
 */
interface StreamingValueState {
  fullResponse: string;
}

/**
 * Context 3 — Streaming response SETTERS.
 * All callbacks are stable (useCallback with empty deps / React setState),
 * so this context value never changes after mount. Consumers that only
 * need to WRITE streaming state (e.g. websocket-handler) subscribe here
 * without incurring ~60fps re-renders.
 */
interface StreamingSetterState {
  setFullResponse: (text: string) => void;
  appendResponse: (text: string) => void;
  clearResponse: () => void;
  setForceNewMessage: (value: boolean) => void;
}

/**
 * Context 4 — Non-reactive ref to latest fullResponse.
 * Value is a stable getter (never changes after mount), so subscribing
 * components NEVER re-render from streaming updates. Use when you need
 * to READ fullResponse at call-time (e.g. interrupt signal) but don't
 * need to re-render on every streaming delta.
 */
interface StreamingRefState {
  getFullResponse: () => string;
}

/**
 * Keep at most this many messages in memory.
 * Oldest messages are trimmed when the limit is exceeded to prevent
 * unbounded DOM growth and state-update slowdowns in long conversations.
 */
const MAX_MESSAGES = 200;

const DEFAULT_HISTORY = {
  messages: [] as Message[],
  historyList: [] as HistoryInfo[],
  currentHistoryUid: null as string | null,
  fullResponse: '',
};

export const ChatHistoryContext = createContext<ChatHistoryState | null>(null);
const StreamingValueContext = createContext<StreamingValueState | null>(null);
const StreamingSetterContext = createContext<StreamingSetterState | null>(null);
const StreamingRefContext = createContext<StreamingRefState | null>(null);

/**
 * Combined provider — wraps three granular contexts so App.tsx only
 * needs a single <ChatHistoryProvider>.
 */
export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
  // ── Messages & history state ──
  const [messages, setMessages] = useState<Message[]>(DEFAULT_HISTORY.messages);
  const [historyList, setHistoryList] = useState<HistoryInfo[]>(
    DEFAULT_HISTORY.historyList,
  );
  const [currentHistoryUid, setCurrentHistoryUid] = useState<string | null>(
    DEFAULT_HISTORY.currentHistoryUid,
  );

  // ── Streaming state ──
  const [fullResponse, setFullResponse] = useState(DEFAULT_HISTORY.fullResponse);
  const fullResponseRef = useRef(DEFAULT_HISTORY.fullResponse);
  fullResponseRef.current = fullResponse;
  const forceNewMessageRef = useRef<boolean>(false);

  const setForceNewMessage = useCallback((value: boolean) => {
    forceNewMessageRef.current = value;
  }, []);

  /** Trim to the most recent MAX_MESSAGES entries. */
  const trimMessages = (msgs: Message[]): Message[] =>
    msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;

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

  const appendOrUpdateToolCallMessage = useCallback((toolMessageData: Partial<Message>) => {
    if (!toolMessageData.tool_id || !toolMessageData.tool_name || !toolMessageData.status || !toolMessageData.timestamp) {
      console.error('[ChatHistory] Incomplete tool message data, missing fields for tool_id:', toolMessageData.tool_id);
      return;
    }

    setMessages((prevMessages) => {
      const existingMessageIndex = prevMessages.findIndex(
        (msg) => msg.type === 'tool_call_status' && msg.tool_id === toolMessageData.tool_id!,
      );

      if (existingMessageIndex !== -1) {
        const updatedMessages = [...prevMessages];
        const existingMsg = updatedMessages[existingMessageIndex];
        updatedMessages[existingMessageIndex] = {
          ...existingMsg,
          status: toolMessageData.status,
          name: toolMessageData.name || existingMsg.name,
          content: toolMessageData.content || existingMsg.content,
          timestamp: toolMessageData.timestamp!,
        };
        return updatedMessages;
      } else {
        const newToolMessage: Message = {
          id: toolMessageData.tool_id!,
          role: 'ai',
          type: 'tool_call_status',
          name: toolMessageData.name || '',
          tool_id: toolMessageData.tool_id,
          tool_name: toolMessageData.tool_name,
          status: toolMessageData.status,
          content: toolMessageData.content || '',
          timestamp: toolMessageData.timestamp!,
        };
        return [...prevMessages, newToolMessage];
      }
    });
  }, []);

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

  // ── Context values ──

  // Context 1: messages & history — changes only on message/history updates
  const chatValue = useMemo(
    () => ({
      messages,
      historyList,
      currentHistoryUid,
      appendHumanMessage,
      appendAIMessage,
      appendOrUpdateToolCallMessage,
      setMessages,
      setHistoryList,
      setCurrentHistoryUid,
      updateHistoryList,
    }),
    [
      messages,
      historyList,
      currentHistoryUid,
      appendHumanMessage,
      appendAIMessage,
      appendOrUpdateToolCallMessage,
      updateHistoryList,
    ],
  );

  // Context 2: streaming VALUE — changes ~60fps during streaming
  const streamValue = useMemo(
    () => ({ fullResponse }),
    [fullResponse],
  );

  // Context 3: streaming SETTERS — stable after mount (all callbacks have [] deps)
  const streamSetters = useMemo(
    () => ({
      setFullResponse,
      appendResponse,
      clearResponse,
      setForceNewMessage,
    }),
    [appendResponse, clearResponse, setForceNewMessage],
  );

  // Context 4: streaming REF — stable getter, never triggers re-renders
  const streamRefValue = useMemo<StreamingRefState>(
    () => ({ getFullResponse: () => fullResponseRef.current }),
    [],
  );

  return (
    <ChatHistoryContext.Provider value={chatValue}>
      <StreamingSetterContext.Provider value={streamSetters}>
        <StreamingValueContext.Provider value={streamValue}>
          {children}
        </StreamingValueContext.Provider>
      </StreamingSetterContext.Provider>
    </ChatHistoryContext.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────

/**
 * Messages & history only — shielded from streaming re-renders.
 * Prefer this over useChatHistory() when you don't need fullResponse.
 */
export function useChatMessages() {
  const ctx = useContext(ChatHistoryContext);
  if (!ctx) throw new Error('useChatMessages must be used within ChatHistoryProvider');
  return ctx;
}

/** Streaming response VALUE — subscribes to ~60fps updates during streaming. */
export function useStreamingValue() {
  const ctx = useContext(StreamingValueContext);
  if (!ctx) throw new Error('useStreamingValue must be used within ChatHistoryProvider');
  return ctx;
}

/** Streaming response SETTERS only — stable, never triggers re-renders. */
export function useStreamingSetters() {
  const ctx = useContext(StreamingSetterContext);
  if (!ctx) throw new Error('useStreamingSetters must be used within ChatHistoryProvider');
  return ctx;
}

/**
 * Backward-compatible hook — merges all three contexts.
 * ⚠️ Subscribes to streaming VALUE, so consumers re-render ~60fps during streaming.
 * Prefer useChatMessages() + useStreamingSetters()/useStreamingValue() for new code.
 */
export function useChatHistory() {
  const chat = useContext(ChatHistoryContext);
  const streamVal = useContext(StreamingValueContext);
  const streamSet = useContext(StreamingSetterContext);

  if (!chat || !streamVal || !streamSet) {
    throw new Error('useChatHistory must be used within a ChatHistoryProvider');
  }

  return useMemo(
    () => ({ ...chat, ...streamVal, ...streamSet }),
    [chat, streamVal, streamSet],
  );
}
