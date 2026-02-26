// No-op stub for langfuse when not included in build.
// Only exports settings-related functions used by plugin.ts and SettingsTab.tsx.

export function isLangfuseAvailable(): boolean { return false; }
export function initLangfuse(): void {}
export function resetLangfuse(): void {}
export async function sendTestTrace(): Promise<void> {}
