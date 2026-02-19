import { memo, useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useWebSocket } from "@/context/websocket-context";
import { useChatHistory } from "@/context/chat-history-context";
import { useAiState } from "@/context/ai-state-context";
import { useInterrupt } from "@/components/canvas/live2d";
import { useVAD } from "@/context/vad-context";

// Inject styles once
const STYLE_ID = "input-bar-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes inputPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    @keyframes micPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); } }
    .ling-textarea { background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; color: white; font-size: 14px; padding: 10px 16px; min-height: 42px; max-height: 96px; resize: none; flex: 1; outline: none; font-family: inherit; line-height: 1.5; }
    .ling-textarea::placeholder { color: rgba(255, 255, 255, 0.4); }
    .ling-textarea:focus { border-color: rgba(139, 92, 246, 0.6); box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.4); }
  `;
  document.head.appendChild(style);
}

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const AI_STATE_KEYS: Record<string, string> = {
  idle: "",
  loading: "chat.loading",
  thinking: "chat.thinking",
  "thinking-speaking": "chat.speaking",
  interrupted: "",
};

const MAX_LENGTH = 2000;

export const InputBar = memo(() => {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState("");
  const isComposingRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsContext = useWebSocket();
  const { appendHumanMessage } = useChatHistory();
  const { aiState } = useAiState();
  const { interrupt } = useInterrupt();
  const { micOn, startMic, stopMic } = useVAD();

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (typeof text === 'string') {
        setInputText(text.slice(0, MAX_LENGTH));
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener('fill-input', handler);
    return () => window.removeEventListener('fill-input', handler);
  }, []);

  const trimmed = inputText.trim();
  const hasText = trimmed.length > 0;
  const isAiBusy = aiState === "thinking-speaking" || aiState === "loading";
  const isAiSpeaking = aiState === "thinking-speaking";
  const isConnected = wsContext?.wsState === "OPEN";
  const stateKey = AI_STATE_KEYS[aiState] || "";
  const stateText = stateKey ? t(stateKey) : "";
  const charCount = trimmed.length;
  const isOverLimit = charCount > MAX_LENGTH;
  const canSend = hasText && !isOverLimit && !isSending && isConnected;

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || text.length > MAX_LENGTH || isSending || !isConnected) return;

    if (aiState === "thinking-speaking") {
      interrupt();
    }

    setIsSending(true);
    appendHumanMessage(text);
    wsContext.sendMessage({
      type: "text-input",
      text: text,
      images: [],
    });

    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    // Debounce: prevent rapid-fire sends
    setTimeout(() => setIsSending(false), 500);
  }, [inputText, wsContext, aiState, interrupt, appendHumanMessage, isSending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isComposingRef.current) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    // Hard cap at MAX_LENGTH + small buffer for paste UX (counter turns red)
    setInputText(value.length > MAX_LENGTH + 200 ? value.slice(0, MAX_LENGTH + 200) : value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, []);

  const handleMicToggle = useCallback(() => {
    if (micOn) {
      stopMic();
    } else {
      startMic();
    }
  }, [micOn, startMic, stopMic]);

  const handleInterrupt = useCallback(() => {
    interrupt();
  }, [interrupt]);

  return (
    <div
      style={{
        padding: "10px 16px",
        background: "rgba(255, 255, 255, 0.03)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {stateText && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
          <span
            style={{
              fontSize: "11px",
              color: "rgba(139, 92, 246, 0.7)",
              animation: "inputPulse 1.5s ease-in-out infinite",
            }}
          >
            {stateText}
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          maxWidth: "720px",
          margin: "0 auto",
        }}
      >
        <button
          onClick={handleMicToggle}
          aria-label={micOn ? t("chat.micOn") : t("chat.micOff")}
          aria-pressed={micOn}
          title={micOn ? t("chat.micOn") : t("chat.micOff")}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: micOn ? "rgba(239, 68, 68, 0.2)" : "rgba(255,255,255,0.06)",
            border: micOn ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
            flexShrink: 0,
            color: micOn ? "#ef4444" : "rgba(255,255,255,0.5)",
            animation: micOn ? "micPulse 1.5s ease-in-out infinite" : "none",
            padding: 0,
          }}
        >
          <MicIcon />
        </button>

        <textarea
          ref={textareaRef}
          className="ling-textarea"
          value={inputText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder={!isConnected ? t("chat.placeholderDisconnected") : micOn ? t("chat.placeholderListening") : t("chat.placeholder")}
          aria-label={t("chat.inputLabel")}
          rows={1}
        />

        <button
          onClick={isAiSpeaking ? handleInterrupt : handleSend}
          disabled={!isAiSpeaking && !canSend}
          aria-label={isAiSpeaking ? t("chat.stopReply") : !isConnected ? t("chat.sendDisconnected") : t("chat.sendMessage")}
          title={isAiSpeaking ? t("chat.stopReply") : !isConnected ? t("chat.sendDisconnected") : t("chat.sendMessage")}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: isAiSpeaking
              ? "rgba(239, 68, 68, 0.2)"
              : canSend
                ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                : "rgba(255,255,255,0.06)",
            border: isAiSpeaking ? "1px solid rgba(239, 68, 68, 0.3)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: canSend || isAiSpeaking ? "pointer" : "default",
            opacity: !isAiSpeaking && !canSend && hasText ? 0.4 : 1,
            transition: "all 0.2s ease",
            flexShrink: 0,
            padding: 0,
          }}
        >
          {isAiSpeaking ? <StopIcon /> : <SendIcon />}
        </button>
      </div>
      <div style={{ maxWidth: "720px", margin: "2px auto 0", paddingLeft: "52px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>
          {t("chat.markdownHint")}
        </span>
        {charCount > 0 && (
          <span style={{ fontSize: "10px", color: isOverLimit ? "#ef4444" : charCount > MAX_LENGTH * 0.9 ? "rgba(251, 191, 36, 0.7)" : "rgba(255,255,255,0.25)", transition: "color 0.2s" }}>
            {charCount}/{MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
});

InputBar.displayName = "InputBar";
