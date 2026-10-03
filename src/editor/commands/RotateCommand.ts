import { showToast } from '../../ui/toast';
import { applyTransformOnly } from '../ObjectMount';
import { updateToolbarState } from '../../ui/toolbar';
import { autoSaveToLocalStorage } from '../MapIO';
import { HistoryManager } from '../HistoryManager';

let rotateTargetNode: any = null;
let rotateTargetKind: 'piece' | 'doodad' | null = null;

export function openRotatePanel(node: any, kind: 'piece' | 'doodad'): void {
  HistoryManager.recordBefore('旋转对象');
  rotateTargetNode = node;
  rotateTargetKind = kind;
  document.body.classList.add('rotate-editing');
  const panel = document.getElementById('rotate-panel');
  if (panel) {
    panel.style.display = 'flex';
    panel.setAttribute('aria-hidden', 'false');
  }
}

export function closeRotatePanel(): void {
  rotateTargetNode = null;
  rotateTargetKind = null;
  document.body.classList.remove('rotate-editing');
  const panel = document.getElementById('rotate-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
  }
  HistoryManager.endGesture();
  autoSaveToLocalStorage();
  updateToolbarState();
}

export function hasActiveRotateTarget(): boolean {
  return rotateTargetNode !== null;
}

export function applyRotateDelta(delta: number): void {
  if (!rotateTargetNode) return;
  const cur = rotateTargetNode.m_rotationAngle ?? 0;
  rotateTargetNode.m_rotationAngle = ((cur + delta) % 360 + 360) % 360;
  if (rotateTargetKind === 'piece' || rotateTargetKind === 'doodad') {
    applyTransformOnly(rotateTargetNode);
  }
  showToast(`当前角度: ${rotateTargetNode.m_rotationAngle}°`);
}

export function bindRotatePanel(): void {
  const panel = document.getElementById('rotate-panel');
  if (!panel) return;
  panel.querySelectorAll('[data-delta]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const delta = parseInt((btn as HTMLElement).getAttribute('data-delta') || '0', 10);
      if (!isNaN(delta) && delta !== 0) applyRotateDelta(delta);
    });
  });
  const ok = document.getElementById('rotate-panel-ok');
  if (ok) {
    ok.addEventListener('click', (e) => {
      e.stopPropagation();
      closeRotatePanel();
    });
  }
}
