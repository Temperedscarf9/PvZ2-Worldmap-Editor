import { State } from '../../core/state';
import { clearSelection } from '../Selection';
import { HistoryManager } from '../HistoryManager';

export function deletePieceOrNode(node: any): void {
  if (!State.data.mapConfig) return;
  HistoryManager.recordBefore('删除对象');
  const mapPieces = State.data.mapConfig.objdata.m_mapPieces || [];
  const eventList = State.data.mapConfig.objdata.m_eventList || [];

  const mpIdx = mapPieces.indexOf(node);
  if (mpIdx !== -1) {
    mapPieces.splice(mpIdx, 1);
  }

  const evIdx = eventList.indexOf(node);
  if (evIdx !== -1) {
    eventList.splice(evIdx, 1);
  }

  if (node.m_name) {
    eventList.forEach((e) => {
      if (e.m_parentEvent === node.m_name) {
        delete e.m_parentEvent;
      }
    });
  }

  HistoryManager.endGesture();
  clearSelection();
}
