/* eslint-disable import/order */
import { useState, useEffect, useCallback } from 'react';
import { BgUrlContextState } from '@/context/bgurl-context';
import { defaultBaseUrl, defaultWsUrl } from '@/context/websocket-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useCameraActions } from '@/context/camera-context';
import { useSwitchCharacter } from '@/hooks/utils/use-switch-character';
import { useConfig } from '@/context/character-config-context';
import i18n from 'i18next';
import { createLogger } from '@/utils/logger';

const log = createLogger('Settings');

export const IMAGE_COMPRESSION_QUALITY_KEY = 'appImageCompressionQuality';
export const DEFAULT_IMAGE_COMPRESSION_QUALITY = 0.8;
export const IMAGE_MAX_WIDTH_KEY = 'appImageMaxWidth';
export const DEFAULT_IMAGE_MAX_WIDTH = 0;

interface GeneralSettings {
  language: string[]
  customBgUrl: string
  selectedBgUrl: string[]
  backgroundUrl: string
  selectedCharacterPreset: string[]
  useCameraBackground: boolean
  wsUrl: string
  baseUrl: string
  showSubtitle: boolean
  imageCompressionQuality: number;
  imageMaxWidth: number;
}

interface UseGeneralSettingsProps {
  bgUrlContext: BgUrlContextState | null
  confName: string | undefined
  setConfName: (name: string) => void
  baseUrl: string
  wsUrl: string
  onWsUrlChange: (url: string) => void
  onBaseUrlChange: (url: string) => void
  onSave?: (callback: () => void) => () => void
  onCancel?: (callback: () => void) => () => void
}

const loadInitialCompressionQuality = (): number => {
  const storedQuality = localStorage.getItem(IMAGE_COMPRESSION_QUALITY_KEY);
  if (storedQuality) {
    const quality = parseFloat(storedQuality);
    if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
      return quality;
    }
  }
  return DEFAULT_IMAGE_COMPRESSION_QUALITY;
};

const loadInitialImageMaxWidth = (): number => {
  const storedMaxWidth = localStorage.getItem(IMAGE_MAX_WIDTH_KEY);
  if (storedMaxWidth) {
    const maxWidth = parseInt(storedMaxWidth, 10);
    if (!Number.isNaN(maxWidth) && maxWidth >= 0) {
      return maxWidth;
    }
  }
  return DEFAULT_IMAGE_MAX_WIDTH;
};

export const useGeneralSettings = ({
  bgUrlContext,
  confName,
  setConfName,
  baseUrl,
  wsUrl,
  onWsUrlChange,
  onBaseUrlChange,
  onSave,
  onCancel,
}: UseGeneralSettingsProps) => {
  const { showSubtitle, setShowSubtitle } = useSubtitle();
  const { setUseCameraBackground } = bgUrlContext || {};
  const { startBackgroundCamera, stopBackgroundCamera } = useCameraActions();
  const { configFiles, getFilenameByName } = useConfig();
  const { switchCharacter } = useSwitchCharacter();

  const getCurrentBgKey = (): string[] => {
    if (!bgUrlContext?.backgroundUrl) return [];
    const currentBgUrl = bgUrlContext.backgroundUrl;
    const path = currentBgUrl.replace(baseUrl, '');
    return path.startsWith('/bg/') ? [path] : [];
  };

  const getCurrentCharacterFilename = (): string[] => {
    if (!confName) return [];
    const filename = getFilenameByName(confName);
    return filename ? [filename] : [];
  };

  const initialSettings: GeneralSettings = {
    language: [i18n.language || 'en'],
    customBgUrl: !bgUrlContext?.backgroundUrl?.includes('/bg/')
      ? bgUrlContext?.backgroundUrl || ''
      : '',
    selectedBgUrl: getCurrentBgKey(),
    backgroundUrl: bgUrlContext?.backgroundUrl || '',
    selectedCharacterPreset: getCurrentCharacterFilename(),
    useCameraBackground: bgUrlContext?.useCameraBackground || false,
    wsUrl: wsUrl || defaultWsUrl,
    baseUrl: baseUrl || defaultBaseUrl,
    showSubtitle,
    imageCompressionQuality: loadInitialCompressionQuality(),
    imageMaxWidth: loadInitialImageMaxWidth(),
  };

  const [settings, setSettings] = useState<GeneralSettings>(initialSettings);
  const [originalSettings, setOriginalSettings] = useState<GeneralSettings>(initialSettings);
  const originalConfName = confName;

  useEffect(() => {
    if (confName) {
      const filename = getFilenameByName(confName);
      if (filename) {
        const newSettings = {
          ...settings,
          selectedCharacterPreset: [filename],
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
      }
    }
  }, [confName]);

  const handleSettingChange = useCallback((
    key: keyof GeneralSettings,
    value: GeneralSettings[keyof GeneralSettings],
  ): void => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };

      // Apply per-key side-effects in the same tick (event-driven, not effect-driven).
      // This replaces the old eager useEffect that ran ALL side-effects on every
      // settings change — causing double-triggers for wsUrl/baseUrl/language and
      // redundant calls when unrelated keys changed.
      switch (key) {
        case 'wsUrl':
          onWsUrlChange(value as string);
          break;
        case 'baseUrl':
          onBaseUrlChange(value as string);
          break;
        case 'language':
          if (Array.isArray(value) && value.length > 0 && value[0] !== i18n.language) {
            i18n.changeLanguage(value[0]);
          }
          break;
        case 'showSubtitle':
          setShowSubtitle(value as boolean);
          break;
        case 'customBgUrl':
        case 'selectedBgUrl': {
          const bgVal = key === 'customBgUrl'
            ? (value as string)
            : (Array.isArray(value) ? value[0] : '');
          const resolvedBgUrl = bgVal || (key === 'customBgUrl' ? next.selectedBgUrl[0] : next.customBgUrl);
          if (resolvedBgUrl && bgUrlContext) {
            const fullUrl = resolvedBgUrl.startsWith('http') ? resolvedBgUrl : `${baseUrl}${resolvedBgUrl}`;
            bgUrlContext.setBackgroundUrl(fullUrl);
          }
          break;
        }
        case 'imageCompressionQuality':
          localStorage.setItem(IMAGE_COMPRESSION_QUALITY_KEY, String(value));
          break;
        case 'imageMaxWidth':
          localStorage.setItem(IMAGE_MAX_WIDTH_KEY, String(value));
          break;
        default:
          break;
      }

      return next;
    });
  }, [onWsUrlChange, onBaseUrlChange, setShowSubtitle, bgUrlContext, baseUrl]);

  const handleSave = useCallback((): void => {
    setSettings((current) => {
      setOriginalSettings(current);
      return current;
    });
  }, []);

  const handleCancel = useCallback((): void => {
    setOriginalSettings((orig) => {
      setSettings(orig);

      // Restore all settings to original values
      setShowSubtitle(orig.showSubtitle);
      if (bgUrlContext) {
        bgUrlContext.setBackgroundUrl(orig.backgroundUrl);
        bgUrlContext.setUseCameraBackground(orig.useCameraBackground);
      }
      onWsUrlChange(orig.wsUrl);
      onBaseUrlChange(orig.baseUrl);

      // Restore original character preset
      if (originalConfName) {
        setConfName(originalConfName);
      }

      // Handle camera state
      if (orig.useCameraBackground) {
        startBackgroundCamera();
      } else {
        stopBackgroundCamera();
      }

      return orig;
    });
  }, [bgUrlContext, onWsUrlChange, onBaseUrlChange, originalConfName, setConfName, setShowSubtitle, startBackgroundCamera, stopBackgroundCamera]);

  // Register save/cancel callbacks with the settings panel.
  // deps include handleSave/handleCancel so stale closures are avoided.
  useEffect(() => {
    if (!onSave || !onCancel) return;

    const cleanupSave = onSave(() => {
      handleSave();
    });

    const cleanupCancel = onCancel(() => {
      handleCancel();
    });

    return () => {
      cleanupSave?.();
      cleanupCancel?.();
    };
  }, [onSave, onCancel, handleSave, handleCancel]);

  const handleCharacterPresetChange = useCallback((value: string[]): void => {
    const selectedFilename = value[0];
    const selectedConfig = configFiles.find((config) => config.filename === selectedFilename);
    const currentFilename = confName ? getFilenameByName(confName) : '';

    handleSettingChange('selectedCharacterPreset', value);

    if (currentFilename === selectedFilename) {
      return;
    }

    if (selectedConfig) {
      switchCharacter(selectedFilename);
    }
  }, [configFiles, confName, getFilenameByName, handleSettingChange, switchCharacter]);

  const handleCameraToggle = useCallback(async (checked: boolean) => {
    if (!setUseCameraBackground) return;

    if (checked) {
      try {
        await startBackgroundCamera();
        handleSettingChange('useCameraBackground', true);
        setUseCameraBackground(true);
      } catch (error) {
        log.error('Failed to start camera:', error);
        handleSettingChange('useCameraBackground', false);
        setUseCameraBackground(false);
      }
    } else {
      stopBackgroundCamera();
      handleSettingChange('useCameraBackground', false);
      setUseCameraBackground(false);
    }
  }, [setUseCameraBackground, startBackgroundCamera, stopBackgroundCamera, handleSettingChange]);

  return {
    settings,
    handleSettingChange,
    handleSave,
    handleCancel,
    handleCameraToggle,
    handleCharacterPresetChange,
    showSubtitle,
    setShowSubtitle,
  };
};
