/** Screen-space selection frame; drawn above the map so neighbouring layers cannot cover it. */
import { State } from '../core/state';
import { EditorState } from '../editor/EditorState';
import { getSelectedNode } from '../editor/types';

function findSelectedElement(node: any): HTMLElement | null {
  for (const p of State.data.pieces) {
    if (p.piece === node) return p.element;
  }
  for (const ep of State.data.eventPieces) {
    if (ep.node === node) return ep.element;
  }
  return null;
}

export function hideSelectionFrame(): void {
  const frame = document.getElementById('selection-frame');
  if (frame) frame.style.display = 'none';
}

export function updateSelectionFrame(): void {
  const frame = document.getElementById('selection-frame');
  if (!frame) return;

  const ref = EditorState.selectedPieceRef;
  if (!ref) {
    frame.style.display = 'none';
    return;
  }

  const node = getSelectedNode(ref);
  const element = node ? findSelectedElement(node) : null;
  if (!element) {
    frame.style.display = 'none';
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    frame.style.display = 'none';
    return;
  }

  const vp = document.getElementById('viewport')?.getBoundingClientRect();
  if (!vp) {
    frame.style.display = 'none';
    return;
  }
  const left = rect.left - vp.left;
  const top = rect.top - vp.top;
  const visible =
    left + rect.width >= 0 &&
    left <= vp.width &&
    top + rect.height >= 0 &&
    top <= vp.height;
  if (!visible) {
    frame.style.display = 'none';
    return;
  }

  frame.style.display = 'block';
  frame.style.left = `${left}px`;
  frame.style.top = `${top}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}
