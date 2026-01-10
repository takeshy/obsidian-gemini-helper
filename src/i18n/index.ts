// i18n module for Obsidian Gemini Helper
import { en, type TranslationKey } from "./en";
import { ja } from "./ja";
import { es } from "./es";
import { fr } from "./fr";
import { zh } from "./zh";
import { ko } from "./ko";
import { pt } from "./pt";
import { it } from "./it";
import { de } from "./de";

export type { TranslationKey };

type Translations = Record<string, string>;

const translations: Record<string, Translations> = {
  en,
  ja,
  es,
  fr,
  zh,
  ko,
  pt,
  it,
  de,
};

// Current locale
let currentLocale = "en";

/**
 * Get the current locale
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Set the current locale
 */
export function setLocale(locale: string): void {
  // Normalize locale (e.g., "en-US" -> "en", "zh-CN" -> "zh")
  const normalizedLocale = locale.split("-")[0].toLowerCase();

  if (translations[normalizedLocale]) {
    currentLocale = normalizedLocale;
  } else {
    // Fallback to English if locale not supported
    currentLocale = "en";
  }
}

/**
 * Initialize locale from Obsidian's moment locale
 * Call this in plugin onload()
 */
export function initLocale(): void {
  // Try to get locale from Obsidian's moment (most reliable)
  // moment.locale() returns the current locale set by Obsidian
  try {
    const momentLocale = window.moment?.locale?.() || navigator.language || "en";
    setLocale(momentLocale);
  } catch {
    setLocale("en");
  }
}

/**
 * Translate a key with optional variable substitution
 * @param key Translation key
 * @param vars Optional variables to substitute (e.g., { name: "John" } for "Hello, {{name}}")
 * @returns Translated string, or the key itself if not found
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  // Get translation from current locale, fallback to English
  const localeTranslations = translations[currentLocale] || translations.en;
  let result = localeTranslations[key] || translations.en[key] || key;

  // Substitute variables if provided
  if (vars) {
    for (const [varName, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, "g"), String(value));
    }
  }

  return result;
}

/**
 * Get all supported locales
 */
export function getSupportedLocales(): string[] {
  return Object.keys(translations);
}
