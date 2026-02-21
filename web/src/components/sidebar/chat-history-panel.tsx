/* eslint-disable function-paren-newline */
/* eslint-disable react/jsx-one-expression-per-line */
/* eslint-disable no-trailing-spaces */
/* eslint-disable no-nested-ternary */
/* eslint-disable import/order */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable react/require-default-props */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Box, Spinner, Flex, Text, Icon } from '@chakra-ui/react';
import { sidebarStyles, chatPanelStyles } from './sidebar-styles';
import { MainContainer, ChatContainer, MessageList as ChatMessageList, Message as ChatMessage, Avatar as ChatAvatar } from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import { useChatHistory } from '@/context/chat-history-context';
import { Global } from '@emotion/react';
import { useConfig } from '@/context/character-config-context';
import { useWebSocket } from '@/context/websocket-context';
import { FaTools, FaCheck, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { Message } from '@/services/websocket-service';
import { MessageContextMenu } from './message-context-menu';
import { toaster } from '@/components/ui/toaster';

// Long-press threshold in ms
const LONG_PRESS_MS = 500;

/**
 * Max messages to render in the sidebar at once.
 * Older ones are hidden behind a "load more" button to prevent DOM bloat.
 */
const SIDEBAR_RENDER_WINDOW = 60;

// Main component
function ChatHistoryPanel(): JSX.Element {
  const { t } = useTranslation();
  const { messages } = useChatHistory();
  const { confName } = useConfig();
  const { baseUrl } = useWebSocket();
  const userName = "Me";

  // Context menu state
  const [menuState, setMenuState] = useState<{
    message: Message;
    position: { x: number; y: number };
  } | null>(null);

  const [extraBatches, setExtraBatches] = useState(0);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const openMenu = useCallback((msg: Message, x: number, y: number) => {
    setMenuState({ message: msg, position: { x, y } });
  }, []);

  const closeMenu = useCallback(() => setMenuState(null), []);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(msg, e.clientX, e.clientY);
  }, [openMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent, msg: Message) => {
    longPressFired.current = false;
    const touch = e.touches[0];
    const { clientX, clientY } = touch;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      openMenu(msg, clientX, clientY);
    }, LONG_PRESS_MS);
  }, [openMenu]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long-press if finger moves
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const validMessages = useMemo(
    () => messages.filter((msg) => msg.content ||
       (msg.type === 'tool_call_status' && msg.status === 'running') ||
       (msg.type === 'tool_call_status' && msg.status === 'completed') ||
       (msg.type === 'tool_call_status' && msg.status === 'error')),
    [messages],
  );

  // Render windowing: only mount the last SIDEBAR_RENDER_WINDOW messages
  const renderLimit = SIDEBAR_RENDER_WINDOW + extraBatches * SIDEBAR_RENDER_WINDOW;
  const hiddenCount = Math.max(0, validMessages.length - renderLimit);
  const visibleMessages = useMemo(
    () => hiddenCount > 0 ? validMessages.slice(hiddenCount) : validMessages,
    [validMessages, hiddenCount],
  );

  useEffect(() => {
    if (validMessages.length <= SIDEBAR_RENDER_WINDOW) setExtraBatches(0);
  }, [validMessages.length]);

  const handleLoadMore = useCallback(() => setExtraBatches((n) => n + 1), []);

  return (
    <Box
      h="full"
      overflow="hidden"
      bg="gray.900"
    >
      <Global styles={chatPanelStyles} />
      <MainContainer>
        <ChatContainer>
          <ChatMessageList>
            {validMessages.length === 0 ? (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
                color="whiteAlpha.500"
                fontSize="sm"
              >
                {t('sidebar.noMessages')}
              </Box>
            ) : (
              <>
              {hiddenCount > 0 && (
                <Flex justify="center" py={2}>
                  <button
                    onClick={handleLoadMore}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '4px 12px',
                      color: 'rgba(255,255,255,0.4)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {t('chat.loadOlder', { count: hiddenCount })}
                  </button>
                </Flex>
              )}
              {visibleMessages.map((msg) => {
                // Tool call indicator — no context menu
                if (msg.type === 'tool_call_status') {
                  return (
                    <Flex
                      key={msg.id}
                      {...sidebarStyles.toolCallIndicator.container}
                      alignItems="center"
                    >
                      <Icon
                        as={FaTools}
                        {...sidebarStyles.toolCallIndicator.icon}
                      />
                      <Text {...sidebarStyles.toolCallIndicator.text}>
                        {msg.status === "running" ? `${msg.name} is using tool ${msg.tool_name}` : `${msg.name} used tool ${msg.tool_name}`}
                      </Text>
                      {msg.status === "running" && (
                        <Spinner
                          size="xs"
                          color={sidebarStyles.toolCallIndicator.spinner.color}
                          ml={sidebarStyles.toolCallIndicator.spinner.ml}
                        />
                      )}
                      {msg.status === "completed" && (
                        <Icon
                          as={FaCheck}
                          {...sidebarStyles.toolCallIndicator.completedIcon}
                        />
                      )}
                      {msg.status === "error" && (
                        <Icon
                          as={FaTimes}
                          {...sidebarStyles.toolCallIndicator.errorIcon}
                        />
                      )}
                    </Flex>
                  );
                }
                // Standard chat message — with context menu
                return (
                  <Box
                    key={msg.id}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                    onTouchStart={(e) => handleTouchStart(e, msg)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    css={{ WebkitTouchCallout: 'none' }}
                  >
                    <ChatMessage
                      model={{
                        message: msg.content,
                        sentTime: msg.timestamp,
                        sender: msg.role === 'ai'
                          ? (msg.name || confName || 'AI')
                          : userName,
                        direction: msg.role === 'ai' ? 'incoming' : 'outgoing',
                        position: 'single',
                      }}
                      avatarPosition={msg.role === 'ai' ? 'tl' : 'tr'}
                      avatarSpacer={false}
                    >
                      <ChatAvatar>
                        {msg.role === 'ai' ? (
                          msg.avatar ? (
                            <img
                              src={`${baseUrl}/avatars/${msg.avatar}`}
                              alt="avatar"
                              style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                const fallbackName = msg.name || confName || 'A';
                                target.outerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 50%; background-color: var(--chakra-colors-blue-500); color: white; font-size: 14px;">${fallbackName[0].toUpperCase()}</div>`;
                              }}
                            />
                          ) : (
                            (msg.name && msg.name[0].toUpperCase()) ||
                              (confName && confName[0].toUpperCase()) ||
                              'A'
                          )
                        ) : (
                          userName[0].toUpperCase()
                        )}
                      </ChatAvatar>
                    </ChatMessage>
                  </Box>
                );
              })}
              </>
            )}
          </ChatMessageList>
        </ChatContainer>
      </MainContainer>

      {/* Context Menu Portal */}
      {menuState && (
        <MessageContextMenu
          message={menuState.message}
          position={menuState.position}
          onClose={closeMenu}
        />
      )}
    </Box>
  );
}

export default ChatHistoryPanel;
