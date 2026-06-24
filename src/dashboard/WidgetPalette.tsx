import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { listWidgetDefs } from "./widgets/registry";
import type { WidgetDef } from "./types";
import { t } from "src/i18n";

interface WidgetPaletteProps {
  onSelect: (def: WidgetDef) => void;
  onClose: () => void;
}

/**
 * Modal palette showing all registered widget types. Selecting a type calls
 * onSelect with the WidgetDef.
 */
export function WidgetPalette({ onSelect, onClose }: WidgetPaletteProps) {
  const defs = listWidgetDefs();

  const modal = (
    <div className="llm-hub-db-modal-overlay" onClick={onClose}>
      <div className="llm-hub-db-modal" onClick={(e) => e.stopPropagation()}>
        <div className="llm-hub-db-modal-header">
          <h3>{t("dashboard.addWidget")}</h3>
          <button className="llm-hub-db-iconbtn" onClick={onClose} title={t("dashboard.cancel")}>
            <X size={18} />
          </button>
        </div>
        <div className="llm-hub-db-palette-grid">
          {defs.map((def) => (
            <button
              key={def.type}
              onClick={() => onSelect(def)}
              className="llm-hub-db-palette-item"
            >
              <div className="llm-hub-db-palette-icon">{def.icon}</div>
              <span>{def.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
