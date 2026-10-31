import { State } from '../core/state';
import { CoordinateSystem } from '../core/camera';
import { HistoryManager } from '../editor/HistoryManager';

function overlay(): HTMLDivElement | null {
  return document.getElementById('bounds-overlay') as HTMLDivElement | null;
}

export function updateBoundsOverlay(): void {
  const el = overlay();
  if (!el) return;

  const rect = State.data.mapConfig?.objdata?.m_boundingRect;
  if (!rect || !State.data.showBounds) {
    el.style.display = 'none';
    return;
  }

  const res = State.data.textureResolution;
  const p1 = CoordinateSystem.worldToScreen((rect.mX * res) / 600, (rect.mY * res) / 600);
  const p2 = CoordinateSystem.worldToScreen(
    ((rect.mX + rect.mWidth) * res) / 600,
    ((rect.mY + rect.mHeight) * res) / 600
  );

  el.style.display = 'block';
  el.style.left = `${p1.x}px`;
  el.style.top = `${p1.y}px`;
  el.style.width = `${p2.x - p1.x}px`;
  el.style.height = `${p2.y - p1.y}px`;
}

export function renderBoundsPanel(): void {
  const panel = document.getElementById('bounds-panel');
  if (!panel) return;
  const rect = State.data.mapConfig?.objdata?.m_boundingRect;
  const disabled = !State.data.mapConfig?.objdata;
  panel.querySelectorAll<HTMLInputElement>('[data-bounds-field]').forEach((input) => {
    const key = input.dataset.boundsField as 'x' | 'y' | 'width' | 'height';
    input.disabled = disabled;
    const value = rect
      ? key === 'x' ? rect.mX : key === 'y' ? rect.mY : key === 'width' ? rect.mWidth : rect.mHeight
      : 0;
    if (document.activeElement !== input) input.value = String(Math.round(value * 1000) / 1000);
  });

  const toggle = document.getElementById('show-bounds-checkbox') as HTMLInputElement | null;
  if (toggle) {
    toggle.disabled = disabled;
    toggle.checked = State.data.showBounds;
  }
}

export function bindBoundsPanel(): void {
  const panel = document.getElementById('bounds-panel');
  if (!panel) return;

  panel.querySelectorAll<HTMLInputElement>('[data-bounds-field]').forEach((input) => {
    input.addEventListener('focus', () => HistoryManager.recordBefore('编辑地图边界'));
    input.addEventListener('change', () => {
      const od = State.data.mapConfig?.objdata;
      if (!od) return;
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      od.m_boundingRect = od.m_boundingRect || { mX: 0, mY: 0, mWidth: 0, mHeight: 0 };
      const key = input.dataset.boundsField as 'x' | 'y' | 'width' | 'height';
      if (key === 'x') od.m_boundingRect.mX = n;
      else if (key === 'y') od.m_boundingRect.mY = n;
      else if (key === 'width') od.m_boundingRect.mWidth = Math.max(0, n);
      else od.m_boundingRect.mHeight = Math.max(0, n);
      HistoryManager.endGesture();
      updateBoundsOverlay();
      renderBoundsPanel();
    });
  });

  const toggle = document.getElementById('show-bounds-checkbox') as HTMLInputElement | null;
  toggle?.addEventListener('change', () => {
    State.data.showBounds = toggle.checked;
    updateBoundsOverlay();
  });
}
