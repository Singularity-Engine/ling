import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { SK_LANGUAGE } from "./constants/storage-keys";

// Bundled translations (primary user base — zero latency)
import enTranslation from "./locales/en/translation.json";
import zhTranslation from "./locales/zh/translation.json";

// ─── Language registry (single source of truth) ───

export const SUPPORTED_LANGUAGES = [
  "en",
  "zh",
  "ja",
  "ko",
  "es",
  "pt-BR",
  "de",
  "fr",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Native display names for the language switcher */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  "pt-BR": "Português",
  de: "Deutsch",
  fr: "Français",
};

/** Map language codes to BCP-47 / og:locale values */
export const LOCALE_MAP: Record<SupportedLanguage, string> = {
  en: "en_US",
  zh: "zh_CN",
  ja: "ja_JP",
  ko: "ko_KR",
  es: "es_ES",
  "pt-BR": "pt_BR",
  de: "de_DE",
  fr: "fr_FR",
};

// ─── Lazy-load map for non-bundled languages ───

const LAZY_IMPORTS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  ja: () => import("./locales/ja/translation.json"),
  ko: () => import("./locales/ko/translation.json"),
  es: () => import("./locales/es/translation.json"),
  "pt-BR": () => import("./locales/pt-BR/translation.json"),
  de: () => import("./locales/de/translation.json"),
  fr: () => import("./locales/fr/translation.json"),
};

const loadedLanguages = new Set<string>(["en", "zh"]);

/**
 * Ensure a language's translation bundle is loaded.
 * No-ops for already-loaded or bundled languages.
 */
export async function ensureLanguageLoaded(lng: string): Promise<void> {
  if (loadedLanguages.has(lng)) return;
  const loader = LAZY_IMPORTS[lng];
  if (!loader) return;
  const mod = await loader();
  i18n.addResourceBundle(lng, "translation", mod.default, true, true);
  loadedLanguages.add(lng);
}

// ─── Initialize i18next ───

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    debug: process.env.NODE_ENV === "development",
    defaultNS: "translation",
    ns: ["translation"],
    resources: {
      en: { translation: enTranslation },
      zh: { translation: zhTranslation },
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      htmlTag: document.documentElement,
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
  });

// Auto-load lazy language on language change
i18n.on("languageChanged", (lng) => {
  localStorage.setItem(SK_LANGUAGE, lng);
  document.documentElement.lang = lng;
  // Trigger lazy load for non-bundled languages
  ensureLanguageLoaded(lng);
});

export default i18n;
