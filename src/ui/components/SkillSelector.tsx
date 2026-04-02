import { useState, useRef, useEffect } from "react";
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const activeSkills = skills.filter(s => activeSkillPaths.includes(s.folderPath));

  if (skills.length === 0) return null;

  return (
    <div className="gemini-helper-skill-selector">
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
      <div className="gemini-helper-skill-dropdown-wrapper" ref={dropdownRef}>
        <button
          className="gemini-helper-skill-add-btn"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={disabled}
          title={t("skills.add")}
        >
          <Plus size={12} />
        </button>
        {showDropdown && (
          <div className="gemini-helper-skill-dropdown">
            {skills.map(skill => (
              <label key={skill.folderPath} className="gemini-helper-skill-dropdown-item">
                <input
                  type="checkbox"
                  checked={activeSkillPaths.includes(skill.folderPath)}
                  onChange={() => {
                    onToggleSkill(skill.folderPath);
                  }}
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
          </div>
        )}
      </div>
    </div>
  );
}
