import React, { useEffect, useRef, useCallback } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { FaCopy, FaRedo, FaVolumeUp } from 'react-icons/fa';
import { Message } from '@/services/websocket-service';
import { ttsService } from '@/services/tts-service';
import { useWebSocket } from '@/context/websocket-context';
import { useChatHistory } from '@/context/chat-history-context';
import { toaster } from '@/components/ui/toaster';

interface MessageContextMenuProps {
  message: Message;
  position: { x: number; y: number };
  onClose: () => void;
}

const menuItemStyle = {
  px: 3,
  py: 2,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 2.5,
  borderRadius: 'md',
  transition: 'background 0.15s',
  _hover: { bg: 'whiteAlpha.200' },
};

export function MessageContextMenu({ message, position, onClose }: MessageContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { sendMessage } = useWebSocket();
  const { messages } = useChatHistory();

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    document.addEventListener('touchstart', handler, true);
    return () => {
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('touchstart', handler, true);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Keep menu within viewport
  const adjustedPosition = { ...position };
  if (typeof window !== 'undefined') {
    const menuW = 160;
    const menuH = 140;
    if (position.x + menuW > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - menuW - 8;
    }
    if (position.y + menuH > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - menuH - 8;
    }
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      toaster.create({
        title: t('chat.textCopied'),
        type: 'success',
        duration: 1500,
      });
    });
    onClose();
  }, [message.content, onClose, t]);

  const handleRegenerate = useCallback(() => {
    // Find the last human message before this AI message
    const msgIndex = messages.findIndex((m) => m.id === message.id);
    let lastHumanText = '';
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'human' && messages[i].type === 'text') {
        lastHumanText = messages[i].content;
        break;
      }
    }
    if (lastHumanText) {
      // First interrupt current run if any
      sendMessage({ type: 'interrupt-signal' });
      // Then resend the user message
      setTimeout(() => {
        sendMessage({ type: 'text-input', text: lastHumanText });
      }, 200);
    }
    onClose();
  }, [message.id, messages, sendMessage, onClose]);

  const handleReadAloud = useCallback(async () => {
    onClose();
    const text = message.content;
    if (!text.trim()) return;

    try {
      const result = await ttsService.synthesize(text);
      if (result) {
        // Play audio directly without Live2D lip sync dependency
        const audio = new Audio(`data:audio/mp3;base64,${result.audioBase64}`);
        audio.play().catch((err) => console.error('[TTS] Playback error:', err));
      }
    } catch (err) {
      console.error('[TTS] Read aloud failed:', err);
      toaster.create({
        title: t('tts.error'),
        type: 'error',
        duration: 2000,
      });
    }
  }, [message.content, onClose, t]);

  const isAI = message.role === 'ai';

  return (
    <Box
      ref={menuRef}
      role="menu"
      aria-label={t('chat.messageActions')}
      position="fixed"
      left={`${adjustedPosition.x}px`}
      top={`${adjustedPosition.y}px`}
      zIndex={9999}
      minW="150px"
      py={1.5}
      px={1}
      borderRadius="xl"
      border="1px solid"
      borderColor="whiteAlpha.200"
      bg="rgba(30, 30, 40, 0.85)"
      backdropFilter="blur(16px) saturate(1.6)"
      boxShadow="0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)"
      animation="contextMenuFadeIn 0.12s ease-out"
      css={{
        '@keyframes contextMenuFadeIn': {
          from: { opacity: 0, transform: 'scale(0.95)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
      }}
    >
      {/* Copy */}
      <Flex {...menuItemStyle} role="menuitem" tabIndex={0} onClick={handleCopy} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopy(); } }}>
        <FaCopy size={13} color="var(--chakra-colors-whiteAlpha-700)" aria-hidden="true" />
        <Text fontSize="sm" color="whiteAlpha.900">{t('chat.copyText')}</Text>
      </Flex>

      {/* Regenerate — AI messages only */}
      {isAI && (
        <Flex {...menuItemStyle} role="menuitem" tabIndex={0} onClick={handleRegenerate} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRegenerate(); } }}>
          <FaRedo size={13} color="var(--chakra-colors-whiteAlpha-700)" aria-hidden="true" />
          <Text fontSize="sm" color="whiteAlpha.900">{t('chat.regenerate')}</Text>
        </Flex>
      )}

      {/* Read Aloud */}
      <Flex {...menuItemStyle} role="menuitem" tabIndex={0} onClick={handleReadAloud} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleReadAloud(); } }}>
        <FaVolumeUp size={13} color="var(--chakra-colors-whiteAlpha-700)" aria-hidden="true" />
        <Text fontSize="sm" color="whiteAlpha.900">{t('chat.readAloud')}</Text>
      </Flex>
    </Box>
  );
}
