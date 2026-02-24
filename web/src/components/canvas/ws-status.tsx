import React, { memo, useCallback, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasStyles } from './canvas-styles';
import { useWSStatus } from '@/hooks/canvas/use-ws-status';

// Type definitions
interface StatusContentProps {
  textKey: string
}

// Reusable components
const StatusContent: React.FC<StatusContentProps> = ({ textKey }) => {
  const { t } = useTranslation();
  return t(textKey);
};
const MemoizedStatusContent = memo(StatusContent);

// Main component
const WebSocketStatus = memo((): JSX.Element => {
  const {
    color, textKey, handleClick, isDisconnected,
  } = useWSStatus();

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDisconnected) e.currentTarget.style.opacity = '0.8';
  }, [isDisconnected]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
  }, []);

  const containerStyle = useMemo<CSSProperties>(() => ({
    ...canvasStyles.wsStatus.container,
    backgroundColor: color,
    cursor: isDisconnected ? 'pointer' : 'default',
  }), [color, isDisconnected]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isDisconnected && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  }, [isDisconnected, handleClick]);

  return (
    <div
      style={containerStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role={isDisconnected ? 'button' : 'status'}
      tabIndex={isDisconnected ? 0 : undefined}
    >
      <MemoizedStatusContent textKey={textKey} />
    </div>
  );
});

WebSocketStatus.displayName = 'WebSocketStatus';

export default WebSocketStatus;
