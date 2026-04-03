import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Plus } from "lucide-react";
import type { SkillMetadata } from "src/core/skillsLoader";
import { isBuiltinSkillPath } from "src/core/builtinSkills";
import { t } from "src/i18n";

interface SkillSelectorProps {
  skills: SkillMetadata[];
  activeSkillPaths: string[];
  onToggleSkill: (folderPath: string) => void;
  disabled?: boolean;
}

export default function SkillSelector({
  skills,
  activeSkillPaths,
  onToggleSkill,
  disabled,
}: SkillSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Position dropdown above the selector, matching its full width
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
    // Close on outside click
    const handleClick = (e: MouseEvent) => {
      if (
        selectorRef.current && !selectorRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showDropdown, updatePosition]);

  const activeSkills = skills.filter(s => activeSkillPaths.includes(s.folderPath));

  if (skills.length === 0) return null;

  return (
    <div className="gemini-helper-skill-selector" ref={selectorRef}>
      <Sparkles size={14} className="gemini-helper-skill-icon" />
      {activeSkills.map(skill => (
        <span key={skill.folderPath} className="gemini-helper-skill-chip" title={skill.description}>
          {skill.name}
          <button
            className="gemini-helper-skill-chip-remove"
            onClick={() => onToggleSkill(skill.folderPath)}
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
        title={t("skills.add")}
      >
        <Plus size={12} />
      </button>
      {showDropdown && createPortal(
        <div className="gemini-helper-skill-dropdown" ref={dropdownRef}>
          {skills.map(skill => (
            <label key={skill.folderPath} className="gemini-helper-skill-dropdown-item">
              <input
                type="checkbox"
                checked={activeSkillPaths.includes(skill.folderPath)}
                onChange={() => onToggleSkill(skill.folderPath)}
                disabled={disabled}
              />
              <div className="gemini-helper-skill-dropdown-info">
                <span className="gemini-helper-skill-dropdown-name">
                  {skill.name}
                  {isBuiltinSkillPath(skill.folderPath) && (
                    <span className="gemini-helper-skill-builtin-badge">built-in</span>
                  )}
                </span>
                {skill.description && (
                  <span className="gemini-helper-skill-dropdown-desc">{skill.description}</span>
                )}
              </div>
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
