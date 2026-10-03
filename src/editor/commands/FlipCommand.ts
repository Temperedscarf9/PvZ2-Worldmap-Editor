import { refreshSingleObject } from '../ObjectMount';
import { showToast } from '../../ui/toast';
import { HistoryManager } from '../HistoryManager';

/**
 * Toggles m_isArtFlipped and refreshes the piece. Both the island and doodad flip handlers
 * in bindEvents called this exact 3-line sequence (differing only in refresh mode: island
 * pieces just recompute their CSS transform, doodads rebuild their DOM since flip changes
 * the loaded image's matrix) - now shared here.
 */
export async function flipNode(node: any, mode: 'transform' | 'reload'): Promise<void> {
  HistoryManager.recordBefore('翻转对象');
  node.m_isArtFlipped = !node.m_isArtFlipped;
  await refreshSingleObject(node, mode);
  HistoryManager.endGesture();
  showToast(`水平翻转 → ${node.m_isArtFlipped ? '是' : '否'}`);
}
