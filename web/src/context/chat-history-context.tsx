import {
  createContext, useContext, useState, useMemo, useCallback, useRef, type ReactNode,
} from 'react';
import { Message } from '@/services/websocket-service';
import { HistoryInfo } from './websocket-context';
import { createLogger } from '@/utils/logger';

const log = createLogger('ChatHistory');

/**
 * Context 1a-state — Read-only messages array.
 * Changes on every message add/remove/replace.
 * Only components that RENDER messages (ChatArea) subscribe here.
 * Components that only READ messages imperatively (e.g. MainContent
 * for createNewChat) should use useMessagesRef() instead.
 */
interface MessagesStateValue {
  messages: Message[];
}

/**
 * Context 1a-actions — Stable message mutators.
 * All callbacks use useCallback with [] deps, so this context value
 * never changes after mount. Consumers that only WRITE messages
 * (websocket-handler, InputBar, use-text-input) subscribe here
 * without re-rendering on every message change.
 */
interface MessagesActionsValue {
  appendHumanMessage: (content: string) => void;
  appendAIMessage: (content: string, name?: string, avatar?: string) => void;
  appendOrUpdateToolCallMessage: (toolMessageData: Partial<Message>) => void;
  popLastHumanMessage: () => void;
  setMessages: (messages: Message[]) => void;
}

/**
 * Context 1b-state — History list read-only state.
 * Changes when sidebar history preview updates or the active conversation switches.
 * Only components that RENDER history (sidebar, App) subscribe here.
 */
interface HistoryListReadState {
  historyList: HistoryInfo[];
  currentHistoryUid: string | null;
}

/**
 * Context 1b-actions — Stable history mutators.
 * All callbacks are state-setters or useCallback with stable deps, so this
 * context value never changes after mount. Consumers that only WRITE history
 * state (e.g. websocket-handler) subscribe here without re-rendering on
 * every history change.
 */
interface HistoryListActionsState {
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
 * Context 5 — Non-reactive ref to latest messages array.
 * Stable getter (never changes after mount). Use when you need
 * the current messages at call-time (e.g. saving history before
 * creating a new chat) without subscribing to every message update.
 */
interface MessagesRefState {
  getMessages: () => Message[];
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

const MessagesStateContext = createContext<MessagesStateValue | null>(null);
const MessagesActionsContext = createContext<MessagesActionsValue | null>(null);
const HistoryListStateContext = createContext<HistoryListReadState | null>(null);
const HistoryListActionsContext = createContext<HistoryListActionsState | null>(null);
const StreamingValueContext = createContext<StreamingValueState | null>(null);
const StreamingSetterContext = createContext<StreamingSetterState | null>(null);
const StreamingRefContext = createContext<StreamingRefState | null>(null);
const MessagesRefContext = createContext<MessagesRefState | null>(null);

/**
 * Combined provider — wraps three granular contexts so App.tsx only
 * needs a single <ChatHistoryProvider>.
 */
/** Trim to the most recent MAX_MESSAGES entries. */
const trimMessages = (msgs: Message[]): Message[] =>
  msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  // ── Messages & history state ──
  const [messages, setMessagesRaw] = useState<Message[]>(DEFAULT_HISTORY.messages);
  const [historyList, setHistoryList] = useState<HistoryInfo[]>(
    DEFAULT_HISTORY.historyList,
  );
  const [currentHistoryUid, setCurrentHistoryUid] = useState<string | null>(
    DEFAULT_HISTORY.currentHistoryUid,
  );

  // ── Ref mirror for messages — stable getter, never triggers re-renders ──
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ── Streaming state ──
  const [fullResponse, setFullResponse] = useState(DEFAULT_HISTORY.fullResponse);
  const fullResponseRef = useRef(DEFAULT_HISTORY.fullResponse);
  fullResponseRef.current = fullResponse;
  const forceNewMessageRef = useRef<boolean>(false);

  const setForceNewMessage = useCallback((value: boolean) => {
    forceNewMessageRef.current = value;
  }, []);

  /**
   * Wrapped setter exposed to external consumers.
   * Direct callers (e.g. Gateway history loading) may pass unbounded arrays;
   * trimming here guarantees MAX_MESSAGES is never exceeded in state.
   */
  const setMessages = useCallback(
    (msgs: Message[]) => setMessagesRaw(trimMessages(msgs)),
    [],
  );

  const appendHumanMessage = useCallback((content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'human',
      type: 'text',
      timestamp: new Date().toISOString(),
    };
    setMessagesRaw((prevMessages) => trimMessages([...prevMessages, newMessage]));
  }, []);

  /** Remove the last message if it's a human message (undo optimistic update on send failure). */
  const popLastHumanMessage = useCallback(() => {
    setMessagesRaw((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'human') {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  const appendAIMessage = useCallback((content: string, name?: string, avatar?: string) => {
    setMessagesRaw((prevMessages) => {
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
      log.error('Incomplete tool message data, missing fields for tool_id:', toolMessageData.tool_id);
      return;
    }

    setMessagesRaw((prevMessages) => {
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
      }

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
      return trimMessages([...prevMessages, newToolMessage]);
    });
  }, []);

  // Ref mirror so the callback can read currentHistoryUid for DEV warnings
  // without depending on it — keeps the callback stable across session switches.
  const currentHistoryUidRef = useRef(currentHistoryUid);
  currentHistoryUidRef.current = currentHistoryUid;

  const updateHistoryList = useCallback(
    (uid: string, latestMessage: Message | null) => {
      if (!uid) {
        log.debug('updateHistoryList: uid is null');
      }
      if (!currentHistoryUidRef.current) {
        log.debug('updateHistoryList: currentHistoryUid is null');
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
    [],
  );

  const appendResponse = useCallback((text: string) => {
    setFullResponse((prev) => prev + (text || ''));
  }, []);

  const clearResponse = useCallback(() => {
    setFullResponse(DEFAULT_HISTORY.fullResponse);
  }, []);

  // ── Context values ──

  // Context 1a-state: read-only messages — changes on message add/remove/replace
  const messagesStateValue = useMemo(
    () => ({ messages }),
    [messages],
  );

  // Context 1a-actions: stable mutators — never changes after mount
  const messagesActionsValue = useMemo(
    () => ({
      appendHumanMessage,
      appendAIMessage,
      appendOrUpdateToolCallMessage,
      popLastHumanMessage,
      setMessages,
    }),
    [appendHumanMessage, appendAIMessage, appendOrUpdateToolCallMessage, popLastHumanMessage, setMessages],
  );

  // Context 1b-state: history read-only state — changes on sidebar preview / session switch
  const historyStateValue = useMemo(
    () => ({ historyList, currentHistoryUid }),
    [historyList, currentHistoryUid],
  );

  // Context 1b-actions: stable history mutators — never changes after mount
  const historyActionsValue = useMemo(
    () => ({ setHistoryList, setCurrentHistoryUid, updateHistoryList }),
    [setHistoryList, setCurrentHistoryUid, updateHistoryList],
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
    [setFullResponse, appendResponse, clearResponse, setForceNewMessage],
  );

  // Context 4: streaming REF — stable getter, never triggers re-renders
  const streamRefValue = useMemo<StreamingRefState>(
    () => ({ getFullResponse: () => fullResponseRef.current }),
    [],
  );

  // Context 5: messages REF — stable getter, never triggers re-renders
  const messagesRefValue = useMemo<MessagesRefState>(
    () => ({ getMessages: () => messagesRef.current }),
    [],
  );

  return (
    <MessagesActionsContext.Provider value={messagesActionsValue}>
      <MessagesStateContext.Provider value={messagesStateValue}>
        <MessagesRefContext.Provider value={messagesRefValue}>
          <HistoryListActionsContext.Provider value={historyActionsValue}>
            <HistoryListStateContext.Provider value={historyStateValue}>
              <StreamingSetterContext.Provider value={streamSetters}>
                <StreamingValueContext.Provider value={streamValue}>
                  <StreamingRefContext.Provider value={streamRefValue}>
                    {children}
                  </StreamingRefContext.Provider>
                </StreamingValueContext.Provider>
              </StreamingSetterContext.Provider>
            </HistoryListStateContext.Provider>
          </HistoryListActionsContext.Provider>
        </MessagesRefContext.Provider>
      </MessagesStateContext.Provider>
    </MessagesActionsContext.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────

/** Read-only messages — re-renders on every message add/remove/replace. */
export function useChatMessagesState() {
  const ctx = useContext(MessagesStateContext);
  if (!ctx) throw new Error('useChatMessagesState must be used within ChatHistoryProvider');
  return ctx;
}

/** Stable message mutators — never causes re-renders. */
export function useChatMessagesActions() {
  const ctx = useContext(MessagesActionsContext);
  if (!ctx) throw new Error('useChatMessagesActions must be used within ChatHistoryProvider');
  return ctx;
}

/**
 * Combined hook — returns both state and actions.
 * Prefer useChatMessagesState() or useChatMessagesActions() for targeted subscriptions.
 */
export function useChatMessages() {
  return { ...useChatMessagesState(), ...useChatMessagesActions() };
}

/**
 * History list read-only state — re-renders on history list / session changes.
 * Use for components that RENDER the sidebar or display current session info.
 */
export function useHistoryListState() {
  const ctx = useContext(HistoryListStateContext);
  if (!ctx) throw new Error('useHistoryListState must be used within ChatHistoryProvider');
  return ctx;
}

/**
 * Stable history mutators — never triggers re-renders.
 * Use for components that only WRITE history state (e.g. websocket-handler).
 */
export function useHistoryListActions() {
  const ctx = useContext(HistoryListActionsContext);
  if (!ctx) throw new Error('useHistoryListActions must be used within ChatHistoryProvider');
  return ctx;
}

/**
 * Combined hook — returns both state and actions.
 * Kept for backward compatibility with components that need both.
 * Prefer useHistoryListState() or useHistoryListActions() for targeted subscriptions.
 */
export function useHistoryList() {
  return { ...useHistoryListState(), ...useHistoryListActions() };
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

/** Non-reactive ref getter — never triggers re-renders from streaming updates. */
export function useStreamingRef() {
  const ctx = useContext(StreamingRefContext);
  if (!ctx) throw new Error('useStreamingRef must be used within ChatHistoryProvider');
  return ctx;
}

/**
 * Non-reactive ref getter for messages — never triggers re-renders.
 * Use when you need current messages at call-time (e.g. saving history)
 * without subscribing to every message update.
 */
export function useMessagesRef() {
  const ctx = useContext(MessagesRefContext);
  if (!ctx) throw new Error('useMessagesRef must be used within ChatHistoryProvider');
  return ctx;
}

