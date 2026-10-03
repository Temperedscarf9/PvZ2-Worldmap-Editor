/** Nested global loading overlay helpers. */

let globalLoadingDepth = 0;

export function showGlobalLoading(text: string, sub: string = ''): void {
  const overlay = document.getElementById('global-loading-overlay') as HTMLDivElement | null;
  const title = document.getElementById('global-loading-text');
  const subEl = document.getElementById('global-loading-sub');
  if (title) title.textContent = text;
  if (subEl) subEl.textContent = sub;
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }
  globalLoadingDepth++;
}

export function updateGlobalLoading(text?: string, sub?: string): void {
  if (text != null) {
    const title = document.getElementById('global-loading-text');
    if (title) title.textContent = text;
  }
  if (sub != null) {
    const subEl = document.getElementById('global-loading-sub');
    if (subEl) subEl.textContent = sub;
  }
}

/** Force-close (error paths). */
export function forceHideGlobalLoading(): void {
  globalLoadingDepth = 0;
  const overlay = document.getElementById('global-loading-overlay') as HTMLDivElement | null;
  if (overlay) {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
}

export function hideGlobalLoading(): void {
  globalLoadingDepth = Math.max(0, globalLoadingDepth - 1);
  if (globalLoadingDepth > 0) return;
  const overlay = document.getElementById('global-loading-overlay') as HTMLDivElement | null;
  if (overlay) {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
}

/** Yield one animation frame so the loading mask paints before heavy work. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs `task`, showing the global loading overlay only if it hasn't settled within `delayMs`.
 * Use this instead of an unconditional showGlobalLoading/hideGlobalLoading pair for operations
 * that are usually fast (warm-cache hits) but could occasionally be slow - it avoids flashing a
 * spinner for the common instant case while still giving feedback on the rare slow one.
 */
export async function runWithDeferredLoading<T>(
    text: string,
    sub: string,
    task: () => Promise<T>,
    delayMs: number = 150
): Promise<T> {
  let shown = false;
  const timer = setTimeout(() => {
    shown = true;
    showGlobalLoading(text, sub);
  }, delayMs);
  try {
    return await task();
  } finally {
    clearTimeout(timer);
    if (shown) {
      // Only relevant once the overlay actually appeared: confirm the browser has painted
      // whatever task() just changed before hiding it, same reasoning as showGlobalLoading's
      // callers elsewhere - otherwise "loading gone" can still land ahead of "actually done".
      await nextFrame();
      await yieldToBrowser();
      hideGlobalLoading();
    }
  }
}