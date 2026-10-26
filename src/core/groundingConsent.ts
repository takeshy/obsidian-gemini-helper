/** Keep the approval boundary testable without a UI or a Gemini request. */
export async function requestGoogleSearchConsent(options: {
  isRestricted: () => boolean;
  isCurrent: () => boolean;
  confirm: () => Promise<boolean>;
  restrict: () => Promise<unknown>;
}): Promise<boolean> {
  if (!options.isCurrent()) return false;
  if (options.isRestricted()) return true;
  if (!await options.confirm() || !options.isCurrent()) return false;
  await options.restrict();
  return options.isCurrent();
}
