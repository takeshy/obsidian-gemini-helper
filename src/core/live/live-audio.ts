/** Use an exact selection so a missing microphone never silently records another device. */
export function liveMicrophoneConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true, noiseSuppression: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

/**
 * Opens the microphone and replaces opaque browser failures with an explanation the
 * dialog can show. Chromium rejects an exact selection of a disconnected device with an
 * OverconstrainedError whose message is empty, and older versions do not extend Error at all.
 */
export async function openLiveMicrophone(constraints: MediaTrackConstraints): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
  } catch (error) {
    const detail = error && typeof error === "object" ? error as { name?: unknown; message?: unknown } : {};
    const name = typeof detail.name === "string" ? detail.name : "";
    const message = typeof detail.message === "string" ? detail.message : "";
    if (name === "OverconstrainedError" || name === "NotFoundError") throw new Error("The selected microphone is unavailable. Refresh the devices or choose the system default microphone.");
    if (name === "NotAllowedError") throw new Error("Microphone access was denied. Check microphone permission in your system settings and try again.");
    throw new Error(message || `Could not access the microphone.${name ? ` (${name})` : ""}`);
  }
}

export function supportsLiveAudioOutput(audio?: HTMLAudioElement): boolean {
  const target = audio ?? (typeof HTMLMediaElement === "undefined" ? undefined : HTMLMediaElement.prototype);
  return typeof (target as { setSinkId?: unknown } | undefined)?.setSinkId === "function";
}

export async function setLiveAudioOutput(audio: HTMLAudioElement, deviceId = ""): Promise<void> {
  if (!supportsLiveAudioOutput(audio)) {
    if (deviceId) throw new Error("Audio output selection is unavailable. Choose the system default output.");
    return;
  }
  try {
    // Reset the sink too when returning to the system default between sessions.
    await audio.setSinkId(deviceId);
  } catch (error) {
    throw new Error(`Could not use the selected audio output. Refresh the devices or choose the system default. ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Chromium aliases that follow OS settings; selecting one would defeat the exact-device guarantee. */
const PSEUDO_DEVICE_IDS = new Set(["default", "communications"]);

/** Permission is requested only by the explicit refresh action; temporary tracks always close. */
export async function listLiveAudioDevices(requestAccess = false): Promise<MediaDeviceInfo[]> {
  const media = navigator.mediaDevices;
  if (!media?.enumerateDevices) throw new Error("Audio device selection is unavailable in this environment.");
  let stream: MediaStream | undefined;
  try {
    if (requestAccess) stream = await openLiveMicrophone(liveMicrophoneConstraints());
    return (await media.enumerateDevices()).filter(device =>
      (device.kind === "audioinput" || device.kind === "audiooutput") && device.deviceId && !PSEUDO_DEVICE_IDS.has(device.deviceId));
  } finally {
    stream?.getTracks().forEach(track => track.stop());
  }
}
