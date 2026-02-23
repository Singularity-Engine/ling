import { memo } from 'react';
import { canvasStyles } from './canvas-styles';
import { useSubtitleDisplay } from '@/hooks/canvas/use-subtitle-display';
import { useSubtitleRead } from '@/context/subtitle-context';

// Type definitions
interface SubtitleTextProps {
  text: string
}

// Reusable components
const SubtitleText = memo(({ text }: SubtitleTextProps) => (
  <span style={canvasStyles.subtitle.text}>
    {text}
  </span>
));

SubtitleText.displayName = 'SubtitleText';

// Main component
const Subtitle = memo((): JSX.Element | null => {
  const { subtitleText, isLoaded } = useSubtitleDisplay();
  const { showSubtitle } = useSubtitleRead();

  if (!isLoaded || !subtitleText || !showSubtitle) return null;

  return (
    <div style={canvasStyles.subtitle.container}>
      <SubtitleText text={subtitleText} />
    </div>
  );
});

Subtitle.displayName = 'Subtitle';

export default Subtitle;
