/**
 * Tauri Integration Module
 *
 * Provides integration with Tauri v2 native APIs when running in the native app.
 * Handles deep links for OAuth callbacks and provides platform detection.
 */

// Type declarations for Tauri APIs (loaded at runtime)
type TauriEvent = {
  listen: (
    event: string,
    handler: (event: { payload: string }) => void,
  ) => Promise<() => void>;
};

type TauriCore = {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
};

type TauriOpener = {
  openUrl: (url: string) => Promise<void>;
};

/**
 * Check if running inside Tauri native app
 */
export function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Get Tauri event API
 */
async function getTauriEvent(): Promise<TauriEvent | null> {
  if (!isTauriApp()) return null;

  try {
    const { listen } = await import("@tauri-apps/api/event");
    return { listen };
  } catch {
    return null;
  }
}

/**
 * Get Tauri core API
 */
async function getTauriCore(): Promise<TauriCore | null> {
  if (!isTauriApp()) return null;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return { invoke };
  } catch {
    return null;
  }
}

/**
 * Get Tauri opener API
 */
async function getTauriOpener(): Promise<TauriOpener | null> {
  if (!isTauriApp()) return null;

  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    return { openUrl };
  } catch {
    return null;
  }
}

/**
 * Platform info returned from Tauri
 */
export type PlatformInfo = {
  os: string;
  arch: string;
  family: string;
};

/**
 * Get platform information from Tauri
 */
export async function getPlatformInfo(): Promise<PlatformInfo | null> {
  const core = await getTauriCore();
  if (!core) return null;

  try {
    return await core.invoke<PlatformInfo>("get_platform_info");
  } catch (error) {
    console.error("[Tauri] Failed to get platform info:", error);
    return null;
  }
}

/**
 * Open URL in system browser (for OAuth flows)
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  const opener = await getTauriOpener();
  if (!opener) {
    // Fallback to window.open for web
    window.open(url, "_blank");
    return true;
  }

  try {
    await opener.openUrl(url);
    return true;
  } catch (error) {
    console.error("[Tauri] Failed to open URL:", error);
    return false;
  }
}

/**
 * Subscribe to deep link events for OAuth callbacks
 * Returns unsubscribe function
 */
export async function onDeepLink(
  callback: (url: string) => void,
): Promise<(() => void) | null> {
  const event = await getTauriEvent();
  if (!event) return null;

  try {
    const unlisten = await event.listen("deep-link", (e) => {
      console.log("[Tauri] Deep link received:", e.payload);
      callback(e.payload);
    });
    return unlisten;
  } catch (error) {
    console.error("[Tauri] Failed to listen for deep links:", error);
    return null;
  }
}

/**
 * Parse OAuth callback URL and extract auth code
 */
export function parseOAuthCallback(url: string): {
  code: string | null;
  state: string | null;
  error: string | null;
} {
  try {
    const parsed = new URL(url);
    return {
      code: parsed.searchParams.get("code"),
      state: parsed.searchParams.get("state"),
      error: parsed.searchParams.get("error"),
    };
  } catch {
    return { code: null, state: null, error: "Invalid URL" };
  }
}
