import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAiStateRead } from '@/context/ai-state-context';
import { footerStyles } from './footer-styles';

function AIStateIndicator(): JSX.Element {
  const { t } = useTranslation();
  const { aiState } = useAiStateRead();
  const styles = footerStyles.aiIndicator;

  return (
    <Box className="ling-ai-indicator" {...styles.container}>
      <Text {...styles.text}>{t(`aiState.${aiState}`)}</Text>
    </Box>
  );
}

export default AIStateIndicator;
