import { State } from '../core/state';
import { DOM } from '../app/dom';
import { EditorState } from './EditorState';
import { updateToolbarState } from '../ui/toolbar';
import { updateInspector } from '../ui/sidebar';

export function clearSelection(): void {
  if (EditorState.selectedPieceRef) {
    document.querySelectorAll('.selected-piece').forEach(el => {
      el.classList.remove('selected-piece');
    });
    EditorState.selectedPieceRef = null;
    updateToolbarState();
    updateInspector();
  }
}

export function selectPiece(pieceRef: any): void {
  clearSelection();
  EditorState.selectedPieceRef = pieceRef;
  if (pieceRef) {
    const node = pieceRef.piece || pieceRef.node;
    if (node) {
      // Highlight ALL elements that share this node/piece
      State.data.pieces.forEach(p => {
        if (p.piece === node) {
          p.element.classList.add('selected-piece');
        }
      });
      State.data.eventPieces.forEach(ep => {
        if (ep.node === node) {
          ep.element.classList.add('selected-piece');
        }
      });

      // Coordinates + identity live in the right-panel inspector (updateInspector).
      void node;
    }
  }
  updateToolbarState();
  updateInspector();
}
