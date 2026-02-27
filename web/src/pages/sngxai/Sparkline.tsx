import { memo, useRef, useEffect, useState } from 'react';
import styles from './Sparkline.module.css';

interface SparklineProps {
  data: number[];
  animate: boolean;
  width?: number;
  height?: number;
  className?: string;
}

function buildPoints(data: number[], width: number, height: number, padding = 8): string {
  if (data.length < 2) return '';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  return data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * usableW;
      const y = padding + usableH - ((v - min) / range) * usableH;
      return `${x},${y}`;
    })
    .join(' ');
}

function buildAreaPath(data: number[], width: number, height: number, padding = 8): string {
  if (data.length < 2) return '';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * usableW;
    const y = padding + usableH - ((v - min) / range) * usableH;
    return `${x},${y}`;
  });

  const baseline = padding + usableH;
  const firstX = padding;
  const lastX = padding + usableW;

  return `M ${firstX},${baseline} L ${points.join(' L ')} L ${lastX},${baseline} Z`;
}

export const Sparkline = memo(function Sparkline({
  data,
  animate,
  width = 1000,
  height = 120,
  className,
}: SparklineProps) {
  const lineRef = useRef<SVGPolylineElement>(null);
  const glowRef = useRef<SVGPolylineElement>(null);
  const [pathLength, setPathLength] = useState(0);

  const points = buildPoints(data, width, height);
  const areaPath = buildAreaPath(data, width, height);

  // Last point for end dot
  const lastIdx = data.length - 1;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padding = 8;
  const lastX = padding + (lastIdx / (data.length - 1)) * (width - padding * 2);
  const lastY = padding + (height - padding * 2) - ((data[lastIdx] - min) / range) * (height - padding * 2);

  useEffect(() => {
    if (lineRef.current && typeof lineRef.current.getTotalLength === 'function') {
      const len = lineRef.current.getTotalLength();
      setPathLength(len);
    }
  }, [points]);

  return (
    <div className={`${styles.root} ${className || ''}`} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ling-accent)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--ling-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        {areaPath && (
          <path
            className={styles.areaFill}
            d={areaPath}
            fill="url(#sparklineGradient)"
          />
        )}

        {/* Glow line */}
        <polyline
          ref={glowRef}
          className={`${styles.glow} ${animate ? styles.glowAnimated : ''}`}
          points={points}
          style={
            pathLength > 0
              ? ({
                  strokeDasharray: pathLength,
                  strokeDashoffset: animate ? undefined : pathLength,
                  '--sparkline-length': pathLength,
                } as React.CSSProperties)
              : undefined
          }
        />

        {/* Main line */}
        <polyline
          ref={lineRef}
          className={`${styles.line} ${animate ? styles.lineAnimated : ''}`}
          points={points}
          style={
            pathLength > 0
              ? ({
                  strokeDasharray: pathLength,
                  strokeDashoffset: animate ? undefined : pathLength,
                  '--sparkline-length': pathLength,
                } as React.CSSProperties)
              : undefined
          }
        />

        {/* End dot */}
        <circle
          className={`${styles.endDotGlow} ${animate ? styles.endDotGlowAnimated : ''}`}
          cx={lastX}
          cy={lastY}
          r={8}
        />
        <circle
          className={`${styles.endDot} ${animate ? styles.endDotAnimated : ''}`}
          cx={lastX}
          cy={lastY}
          r={4}
        />
      </svg>
    </div>
  );
});
