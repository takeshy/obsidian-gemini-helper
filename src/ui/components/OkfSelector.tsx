import { BookOpen } from "lucide-react";
import { ChipSelector } from "obsidian-llm-hub-common";
import type { OkfBundle } from "src/core/okfLoader";
import { t } from "src/i18n";

interface OkfSelectorProps {
  bundles: OkfBundle[];
  activeBundleIds: string[];
  onToggleBundle: (id: string) => void;
  disabled?: boolean;
}

/** Maps OKF bundles onto the shared chip selector; the markup lives in obsidian-llm-hub-common. */
export default function OkfSelector({
  bundles,
  activeBundleIds,
  onToggleBundle,
  disabled,
}: OkfSelectorProps) {
  return (
    <ChipSelector
      classPrefix="gemini-helper"
      className="gemini-helper-okf-selector"
      ownerDocument={activeDocument}
      icon={<BookOpen size={14} />}
      addLabel={t("okf.add")}
      activeIds={activeBundleIds}
      onToggle={onToggleBundle}
      disabled={disabled}
      choices={bundles.map((bundle) => ({
        id: bundle.id,
        name: bundle.name,
        description: bundle.builtin ? t("okf.builtinHelpDescription") : (bundle.id || bundle.name),
        chipTitle: bundle.id || bundle.name,
        badge: bundle.builtin ? "built-in" : undefined,
        removeTitle: t("okf.remove", { name: bundle.name }),
      }))}
    />
  );
}
