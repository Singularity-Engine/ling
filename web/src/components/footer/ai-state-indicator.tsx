import { Box, Text } from '@chakra-ui/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiStateRead } from '@/context/ai-state-context';
import { footerStyles } from './footer-styles';

const AIStateIndicator = memo(() => {
  const { t } = useTranslation();
  const { aiState } = useAiStateRead();
  const styles = footerStyles.aiIndicator;

  return (
    <Box className="ling-ai-indicator" {...styles.container}>
      <Text {...styles.text}>{t(`aiState.${aiState}`)}</Text>
    </Box>
  );
});

AIStateIndicator.displayName = 'AIStateIndicator';

export default AIStateIndicator;
