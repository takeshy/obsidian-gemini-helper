import type { ButtonComponent } from "obsidian";

type WarningButtonComponent = {
  setWarning: () => ButtonComponent;
};

/** Style a destructive button using the API available at the minimum version. */
export function setDestructiveButton(button: ButtonComponent): ButtonComponent {
  return (button as unknown as WarningButtonComponent).setWarning();
}
