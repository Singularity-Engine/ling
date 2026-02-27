import { memo, useCallback, useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { canvasStyles } from './canvas-styles';
import { useWSStatus } from '@/hooks/canvas/use-ws-status';

// Type definitions
interface StatusContentProps {
  textKey: string
}

// Reusable components
const StatusContent = ({ textKey }: StatusContentProps) => {
  const { t } = useTranslation();
  return t(textKey);
};
const MemoizedStatusContent = memo(StatusContent);

// Main component
const WebSocketStatus = memo((): JSX.Element => {
  const {
    color, textKey, handleClick, isDisconnected,
  } = useWSStatus();

  const containerStyle = useMemo<CSSProperties>(() => ({
    ...canvasStyles.wsStatus.container,
    backgroundColor: color,
    cursor: isDisconnected ? 'pointer' : 'default',
  }), [color, isDisconnected]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (isDisconnected && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  }, [isDisconnected, handleClick]);

  return (
    <div
      className="ling-ws-status"
      data-clickable={isDisconnected || undefined}
      style={containerStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={isDisconnected ? 'button' : 'status'}
      tabIndex={isDisconnected ? 0 : undefined}
    >
      <MemoizedStatusContent textKey={textKey} />
    </div>
  );
});

WebSocketStatus.displayName = 'WebSocketStatus';

export default WebSocketStatus;
