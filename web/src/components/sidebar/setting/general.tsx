/* eslint-disable import/no-extraneous-dependencies */
import { memo, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Stack, createListCollection } from "@chakra-ui/react";
import { useBgUrlState } from "@/context/bgurl-context";
import { settingStyles } from "./setting-styles";
import { useConfigState } from "@/context/character-config-context";
import { useGeneralSettings } from "@/hooks/sidebar/setting/use-general-settings";
import { SelectField, SwitchField, InputField } from "./common";

interface GeneralProps {
  onSave?: (callback: () => void) => () => void;
  onCancel?: (callback: () => void) => () => void;
}

// Static collection — labels never change, no need to recreate
const LANGUAGE_COLLECTION = createListCollection({
  items: [
    { label: "English", value: "en" },
    { label: "中文", value: "zh" },
  ],
});

// Memoized collections — avoids recreating on every render
const useCollections = (t: (key: string) => string) => {
  const { backgroundFiles } = useBgUrlState();
  const { configFiles } = useConfigState();

  const themes = useMemo(() => createListCollection({
    items: [
      { label: t("settings.general.themeDark"), value: "dark" },
      { label: t("settings.general.themeLight"), value: "light" },
      { label: t("settings.general.themeSystem"), value: "system" },
    ],
  }), [t]);

  const backgrounds = useMemo(() => createListCollection({
    items:
      backgroundFiles?.map((filename) => ({
        label: String(filename),
        value: `/bg/${filename}`,
      })) || [],
  }), [backgroundFiles]);

  const characterPresets = useMemo(() => createListCollection({
    items: configFiles.map((config) => ({
      label: config.name,
      value: config.filename,
    })),
  }), [configFiles]);

  return useMemo(() => ({
    languages: LANGUAGE_COLLECTION,
    themes,
    backgrounds,
    characterPresets,
  }), [themes, backgrounds, characterPresets]);
};

const General = memo(function General({ onSave, onCancel }: GeneralProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const { confName } = useConfigState();
  const collections = useCollections(t);

  const {
    settings,
    handleSettingChange,
    handleCameraToggle,
    handleCharacterPresetChange,
    showSubtitle,
    setShowSubtitle,
  } = useGeneralSettings({ onSave, onCancel });

  // Sync settings.language with i18n — must be in useEffect, not render phase
  useEffect(() => {
    if (settings.language[0] !== i18n.language) {
      handleSettingChange("language", [i18n.language]);
    }
  }, [i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable handler refs — prevent memo'd SelectField/InputField from re-rendering
  const handleLanguageChange = useCallback(
    (value: string[]) => handleSettingChange("language", value),
    [handleSettingChange],
  );
  const handleBgUrlChange = useCallback(
    (value: string[]) => handleSettingChange("selectedBgUrl", value),
    [handleSettingChange],
  );
  const handleCustomBgUrlChange = useCallback(
    (value: string) => handleSettingChange("customBgUrl", value),
    [handleSettingChange],
  );
  const handleWsUrlChange = useCallback(
    (value: string) => handleSettingChange("wsUrl", value),
    [handleSettingChange],
  );
  const handleBaseUrlChange = useCallback(
    (value: string) => handleSettingChange("baseUrl", value),
    [handleSettingChange],
  );
  const handleCompressionQualityChange = useCallback(
    (value: string) => {
      const quality = parseFloat(value);
      if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
        handleSettingChange("imageCompressionQuality", quality);
      } else if (value === "") {
        handleSettingChange("imageCompressionQuality", settings.imageCompressionQuality);
      }
    },
    [handleSettingChange, settings.imageCompressionQuality],
  );
  const handleImageMaxWidthChange = useCallback(
    (value: string) => {
      const maxWidth = parseInt(value, 10);
      if (!Number.isNaN(maxWidth) && maxWidth >= 0) {
        handleSettingChange("imageMaxWidth", maxWidth);
      } else if (value === "") {
        handleSettingChange("imageMaxWidth", settings.imageMaxWidth);
      }
    },
    [handleSettingChange, settings.imageMaxWidth],
  );

  return (
    <Stack {...settingStyles.common.container}>
      <SelectField
        label={t("settings.general.language")}
        value={settings.language}
        onChange={handleLanguageChange}
        collection={collections.languages}
        placeholder={t("settings.general.language")}
      />

      <SwitchField
        label={t("settings.general.useCameraBackground")}
        checked={settings.useCameraBackground}
        onChange={handleCameraToggle}
      />

      <SwitchField
        label={t("settings.general.showSubtitle")}
        checked={showSubtitle}
        onChange={setShowSubtitle}
      />

      {!settings.useCameraBackground && (
        <>
          <SelectField
            label={t("settings.general.backgroundImage")}
            value={settings.selectedBgUrl}
            onChange={handleBgUrlChange}
            collection={collections.backgrounds}
            placeholder={t("settings.general.backgroundImage")}
          />

          <InputField
            label={t("settings.general.customBgUrl")}
            value={settings.customBgUrl}
            onChange={handleCustomBgUrlChange}
            placeholder={t("settings.general.customBgUrlPlaceholder")}
          />
        </>
      )}

      <SelectField
        label={t("settings.general.characterPreset")}
        value={settings.selectedCharacterPreset}
        onChange={handleCharacterPresetChange}
        collection={collections.characterPresets}
        placeholder={confName || t("settings.general.characterPreset")}
      />

      <InputField
        label={t("settings.general.wsUrl")}
        value={settings.wsUrl}
        onChange={handleWsUrlChange}
        placeholder="Enter WebSocket URL"
      />

      <InputField
        label={t("settings.general.baseUrl")}
        value={settings.baseUrl}
        onChange={handleBaseUrlChange}
        placeholder="Enter Base URL"
      />

      <InputField
        label={t("settings.general.imageCompressionQuality")}
        value={settings.imageCompressionQuality.toString()}
        onChange={handleCompressionQualityChange}
        help={t("settings.general.imageCompressionQualityHelp")}
      />

      <InputField
        label={t("settings.general.imageMaxWidth")}
        value={settings.imageMaxWidth.toString()}
        onChange={handleImageMaxWidthChange}
        help={t("settings.general.imageMaxWidthHelp")}
      />
    </Stack>
  );
});

export default General;
