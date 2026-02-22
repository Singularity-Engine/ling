import type { CSSProperties } from 'react';

export const canvasStyles = {
  background: {
    container: {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'auto',
    } as CSSProperties,
    image: {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      zIndex: 1,
    } as CSSProperties,
    video: {
      position: 'absolute' as const,
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      zIndex: 1,
      transform: 'scaleX(-1)' as const,
    },
  },
  canvas: {
    container: {
      position: 'relative',
      width: '100%',
      height: '100%',
      zIndex: '1',
      pointerEvents: 'auto',
    } as CSSProperties,
  },
  subtitle: {
    container: {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '15px 30px',
      borderRadius: '12px',
      minWidth: '60%',
      maxWidth: '95%',
    } as CSSProperties,
    text: {
      color: 'white',
      fontSize: '1.5rem',
      textAlign: 'center',
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
    } as CSSProperties,
  },
  wsStatus: {
    container: {
      position: 'relative',
      zIndex: 2,
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: 500,
      color: 'white',
      transition: 'background 0.2s, opacity 0.2s',
      cursor: 'pointer',
      userSelect: 'none',
    } as CSSProperties,
  },
};
