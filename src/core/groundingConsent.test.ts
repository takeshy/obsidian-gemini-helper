import { describe, expect, it, vi } from "vitest";
import { requestGoogleSearchConsent } from "./groundingConsent";
import { GoogleSearchConsentModal } from "src/ui/components/GoogleSearchConsentModal";
import type { App } from "obsidian";

describe("Google Search approval", () => {
  it("does not change search or saving policy until explicit approval", async () => {
    let complete!: (approved: boolean) => void;
    let restricted = false;
    const confirm = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    const restrict = vi.fn(async () => { restricted = true; });
    const result = requestGoogleSearchConsent({ isCurrent: () => true, isRestricted: () => restricted, confirm, restrict });
    expect(restricted).toBe(false); expect(restrict).not.toHaveBeenCalled();
    complete(true); expect(await result).toBe(true); expect(restricted).toBe(true);
    await requestGoogleSearchConsent({ isCurrent: () => true, isRestricted: () => restricted, confirm, restrict });
    expect(confirm).toHaveBeenCalledOnce();
  });
  it("cancel and modal close leave the policy unchanged", async () => {
    const restrict = vi.fn();
    expect(await requestGoogleSearchConsent({ isCurrent: () => true, isRestricted: () => false,
      confirm: async () => false, restrict })).toBe(false);
    expect(restrict).not.toHaveBeenCalled();
    const modal = new GoogleSearchConsentModal({} as App);
    const result = modal.openAndWait(); modal.onClose();
    expect(await result).toBe(false);
  });
  it("does not restrict a different chat or provider after the dialog was opened", async () => {
    let current = true;
    const restrict = vi.fn();
    expect(await requestGoogleSearchConsent({ isCurrent: () => current, isRestricted: () => false,
      confirm: async () => { current = false; return true; }, restrict })).toBe(false);
    expect(restrict).not.toHaveBeenCalled();
  });
});
