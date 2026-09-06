import { ModelSelector as SharedModelSelector } from "obsidian-llm-hub-common";
import { t } from "src/i18n";
import type { ModelInfo, ModelType } from "src/types";

interface ModelSelectorProps {
  models: ModelInfo[]; value: ModelType; onChange: (model: ModelType) => void; disabled?: boolean;
}

export default function ModelSelector({ models, value, onChange, disabled }: ModelSelectorProps) {
  return <SharedModelSelector classPrefix="gemini-helper"
    models={models.map(model => ({ value: model.name, label: model.displayName }))}
    value={value} onChange={value => onChange(value as ModelType)} disabled={disabled}
    filterLabel={t("input.modelFilterPlaceholder")} emptyLabel={t("input.modelFilterEmpty")} />;
}
