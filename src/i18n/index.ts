// Registers this plugin's catalogues with the shared translation registry.
import { registerTranslations, t as translate, type TranslationVars } from "obsidian-llm-hub-common/i18n";
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
export { getLocale, setLocale, initLocale, getSupportedLocales } from "obsidian-llm-hub-common/i18n";

registerTranslations({ en, ja, es, fr, zh, ko, pt, it, de });

/** Typed wrapper: plugin code may only use keys this plugin actually defines. */
export function t(key: TranslationKey, vars?: TranslationVars): string {
  return translate(key, vars);
}
