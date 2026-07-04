import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X, Plus } from "lucide-react";
import type { OkfBundle } from "src/core/okfLoader";
import { t } from "src/i18n";

interface OkfSelectorProps {
  bundles: OkfBundle[];
  activeBundleIds: string[];
  onToggleBundle: (id: string) => void;
  disabled?: boolean;
}

export default function OkfSelector({
  bundles,
  activeBundleIds,
  onToggleBundle,
  disabled,
}: OkfSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const dropdown = dropdownRef.current;
    const selector = selectorRef.current;
    if (!dropdown || !selector) return;
    const rect = selector.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.top = `${rect.top - dropdown.offsetHeight - 4}px`;
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        selectorRef.current && !selectorRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    activeDocument.addEventListener("mousedown", handleClick);
    window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      activeDocument.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showDropdown, updatePosition]);

  const activeBundles = bundles.filter(bundle => activeBundleIds.includes(bundle.id));

  if (bundles.length === 0) return null;

  return (
    <div className="gemini-helper-skill-selector gemini-helper-okf-selector" ref={selectorRef}>
      <BookOpen size={14} className="gemini-helper-skill-icon" />
      {activeBundles.map(bundle => (
        <span key={bundle.id} className="gemini-helper-skill-chip" title={bundle.id || bundle.name}>
          <span className="gemini-helper-skill-chip-name is-static">{bundle.name}</span>
          <button
            className="gemini-helper-skill-chip-remove"
            onClick={() => onToggleBundle(bundle.id)}
            disabled={disabled}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <button
        className="gemini-helper-skill-add-btn"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled}
        title={t("okf.add")}
      >
        <Plus size={12} />
      </button>
      {showDropdown && createPortal(
        <div className="gemini-helper-skill-dropdown" ref={dropdownRef}>
          {bundles.map(bundle => (
            <label key={bundle.id} className="gemini-helper-skill-dropdown-item">
              <input
                type="checkbox"
                checked={activeBundleIds.includes(bundle.id)}
                onChange={() => onToggleBundle(bundle.id)}
                disabled={disabled}
              />
              <div className="gemini-helper-skill-dropdown-info">
                <span className="gemini-helper-skill-dropdown-name">
                  {bundle.name}
                  {bundle.builtin && (
                    <span className="gemini-helper-skill-builtin-badge">built-in</span>
                  )}
                </span>
                <span className="gemini-helper-skill-dropdown-desc">
                  {bundle.builtin ? t("okf.builtinHelpDescription") : (bundle.id || bundle.name)}
                </span>
              </div>
            </label>
          ))}
        </div>,
        activeDocument.body,
      )}
    </div>
  );
}
