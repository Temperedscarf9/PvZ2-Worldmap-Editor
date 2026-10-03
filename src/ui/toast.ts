/** Prefer the static #toast in index.html; fall back to a body-level node. */
function getToastEl(): HTMLDivElement {
  let toast =
    (document.getElementById('toast') as HTMLDivElement | null) ||
    (document.getElementById('editor-toast') as HTMLDivElement | null);

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'editor-toast';
    document.body.appendChild(toast);
  }

  // Keep above intro modal / loading overlays so hide timers still apply to a visible node.
  if (toast.parentElement !== document.body) {
    document.body.appendChild(toast);
  }
  return toast;
}

export function showToast(message: string, _parent?: HTMLElement, durationMs: number = 3000): void {
  const toast = getToastEl();
  toast.innerHTML = `<span style="font-size:16px;">💡</span> ${message}`;
  toast.classList.add('is-visible');
  toast.style.display = 'flex';

  const prev = (toast as any).timeoutId as number | undefined;
  if (prev) clearTimeout(prev);

  (toast as any).timeoutId = window.setTimeout(() => {
    hideToast();
  }, durationMs);
}

export function hideToast(): void {
  const toast =
    (document.getElementById('toast') as HTMLDivElement | null) ||
    (document.getElementById('editor-toast') as HTMLDivElement | null);
  if (!toast) return;
  const prev = (toast as any).timeoutId as number | undefined;
  if (prev) {
    clearTimeout(prev);
    (toast as any).timeoutId = undefined;
  }
  toast.classList.remove('is-visible');
  toast.style.display = 'none';
}