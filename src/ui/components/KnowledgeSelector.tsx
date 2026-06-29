import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Plus, X } from "lucide-react";
import type { KnowledgeSource } from "src/types";
import { t } from "src/i18n";

interface KnowledgeSelectorProps {
  sources: KnowledgeSource[];
  activeSourceIds: string[];
  onToggleSource: (id: string) => void;
  disabled?: boolean;
}

export default function KnowledgeSelector({
  sources,
  activeSourceIds,
  onToggleSource,
  disabled,
}: KnowledgeSelectorProps) {
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

  const activeSources = sources.filter(source => activeSourceIds.includes(source.id));
  if (sources.length === 0) return null;

  return (
    <div className="gemini-helper-skill-selector" ref={selectorRef}>
      <BookOpen size={14} className="gemini-helper-skill-icon" />
      {activeSources.map(source => (
        <span key={source.id} className="gemini-helper-skill-chip" title={source.path}>
          <span className="gemini-helper-skill-chip-name is-static">{source.name}</span>
          <button
            className="gemini-helper-skill-chip-remove"
            onClick={() => onToggleSource(source.id)}
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
        title={t("knowledge.add")}
      >
        <Plus size={12} />
      </button>
      {showDropdown && createPortal(
        <div className="gemini-helper-skill-dropdown" ref={dropdownRef}>
          {sources.map(source => (
            <label key={source.id} className="gemini-helper-skill-dropdown-item">
              <input
                type="checkbox"
                checked={activeSourceIds.includes(source.id)}
                onChange={() => onToggleSource(source.id)}
                disabled={disabled}
              />
              <div className="gemini-helper-skill-dropdown-info">
                <span className="gemini-helper-skill-dropdown-name">{source.name}</span>
                <span className="gemini-helper-skill-dropdown-desc">{source.path}</span>
              </div>
            </label>
          ))}
        </div>,
        activeDocument.body,
      )}
    </div>
  );
}
