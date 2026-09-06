import { Sparkles } from "lucide-react";
import { type App } from "obsidian";
import { ChipSelector } from "obsidian-llm-hub-chat-ui";
import type { SkillMetadata } from "src/core/skillsLoader";
import { isBuiltinSkillPath } from "src/core/builtinSkills";
import { isRuntimeSkillPath } from "src/core/runtimeSkills";
import { t } from "src/i18n";

interface SkillSelectorProps {
  skills: SkillMetadata[];
  activeSkillPaths: string[];
  onToggleSkill: (folderPath: string) => void;
  disabled?: boolean;
  app: App;
}

/** Maps skills onto the shared chip selector; the markup lives in obsidian-llm-hub-chat-ui. */
export default function SkillSelector({
  skills,
  activeSkillPaths,
  onToggleSkill,
  disabled,
  app,
}: SkillSelectorProps) {
  return (
    <ChipSelector
      classPrefix="gemini-helper"
      ownerDocument={activeDocument}
      icon={<Sparkles size={14} />}
      addLabel={t("skills.add")}
      activeIds={activeSkillPaths}
      onToggle={onToggleSkill}
      disabled={disabled}
      choices={skills.map((skill) => {
        const bundled = isBuiltinSkillPath(skill.folderPath) || isRuntimeSkillPath(skill.folderPath);
        return {
          id: skill.folderPath,
          name: skill.name,
          description: skill.description,
          chipTitle: skill.description,
          badge: isBuiltinSkillPath(skill.folderPath) ? "built-in" : isRuntimeSkillPath(skill.folderPath) ? "plugin" : undefined,
          // Bundled skills have no note to open, so their chips stay static.
          open: bundled ? undefined : {
            title: t("message.clickToOpen", { source: skill.name }),
            onOpen: () => {
              void app.workspace.openLinkText(skill.skillFilePath, "", false);
            },
          },
        };
      })}
    />
  );
}
