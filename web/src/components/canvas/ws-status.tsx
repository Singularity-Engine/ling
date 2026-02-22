import React, { memo, useCallback } from 'react';
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

  return (
    <div
      style={{
        ...canvasStyles.wsStatus.container,
        backgroundColor: color,
        cursor: isDisconnected ? 'pointer' : 'default',
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <MemoizedStatusContent textKey={textKey} />
    </div>
  );
});

WebSocketStatus.displayName = 'WebSocketStatus';

export default WebSocketStatus;
