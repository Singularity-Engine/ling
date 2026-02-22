import { memo } from 'react';
import {
  Box,
  Stack,
  Text,
  Heading,
  HStack,
  Icon,
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaBook } from 'react-icons/fa';
import { settingStyles } from './setting-styles';
import { Button } from '@/components/ui/button';

// Static click handlers — URLs never change, no need to recreate per render
const openGithub = () => window.open('https://github.com/Singularity-Engine/ling-web', '_blank');
const openDocs = () => window.open('https://docs.llmvtuber.com', '_blank');
const openLicense = () => window.open('https://github.com/Singularity-Engine/ling-web/blob/main/LICENSE', '_blank');

const APP_VERSION = '1.2.1';

const About = memo(function About(): JSX.Element {
  const { t } = useTranslation();

  return (
    <Stack {...settingStyles.common.container} gap={3}>
      <Heading size="md" mb={1}>
        {t("settings.about.title")}
      </Heading>
      <Box>
        <Text fontWeight="bold" mb={0}>
          {t("settings.about.version")}
        </Text>
        <Text>{APP_VERSION}</Text>
      </Box>
      <Box borderTop="1px solid" borderColor="whiteAlpha.200" pt={2} mt={1} />
      <Box mt={1}>
        <Text fontWeight="bold" mb={1}>
          {t("settings.about.projectLinks")}
        </Text>
        <HStack mt={1} gap={2}>
          <Button size="sm" onClick={openGithub}>
            <Icon as={FaGithub} mr={2} /> {t("settings.about.github")}
          </Button>
          <Button size="sm" onClick={openDocs}>
            <Icon as={FaBook} mr={2} /> {t("settings.about.documentation")}
          </Button>
        </HStack>
      </Box>
      <Box borderTop="1px solid" borderColor="whiteAlpha.200" pt={2} mt={1} />
      <Box mt={1}>
        <Button size="xs" colorPalette="blue" onClick={openLicense}>
          {t("settings.about.viewLicense")}
        </Button>
      </Box>
      <Box mt={1}>
        <Text fontWeight="bold" mb={0}>
          {t("settings.about.copyright")}
        </Text>
        <Text>© {new Date().getFullYear()} Singularity Engine</Text>
      </Box>
    </Stack>
  );
});

export default About;
