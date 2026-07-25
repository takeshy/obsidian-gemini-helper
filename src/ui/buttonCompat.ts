import type { ButtonComponent } from "obsidian";

type DestructiveButtonComponent = ButtonComponent & {
  setDestructive?: () => ButtonComponent;
};

type WarningButtonComponent = {
  setWarning: () => ButtonComponent;
};

/** Style a destructive button across Obsidian versions 1.10 and later. */
export function setDestructiveButton(button: ButtonComponent): ButtonComponent {
  const compatibleButton = button as DestructiveButtonComponent;
  if (typeof compatibleButton.setDestructive === "function") {
    return compatibleButton.setDestructive();
  }
  return (button as unknown as WarningButtonComponent).setWarning();
}
