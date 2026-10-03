import { State } from '../../core/state';
import { getWorldAnimationBoundary } from '../../core/worldMeta';
import { getResDirName } from '../../utils/constants';
import { EditorState } from '../EditorState';
import { HistoryManager } from '../HistoryManager';

/**
 * Next free m_eventId among m_eventList only.
 * m_mapPieces never participate (islands are not events and carry no event id contract).
 * Uses a Set so gaps / duplicate legacy ids still yield a unique value.
 */
export function allocateUniqueEventId(eventList: any[] | null | undefined): number {
  const used = new Set<number>();
  let max = -1;
  if (eventList) {
    for (const e of eventList) {
      const id = Number(e?.m_eventId);
      if (!Number.isFinite(id) || id < 0) continue;
      const n = Math.floor(id);
      used.add(n);
      if (n > max) max = n;
    }
  }
  // Prefer max+1 (stable sequential growth); fall back if that slot is somehow taken.
  let candidate = max + 1;
  if (candidate < 0) candidate = 0;
  while (used.has(candidate)) candidate++;
  return candidate;
}

export function addNewMapPiece(worldX: number, worldY: number): any {
  if (!State.data.mapConfig) return null;
  HistoryManager.recordBefore('添加岛屿');
  const piecesList = State.data.mapConfig.objdata.m_mapPieces || [];
  State.data.mapConfig.objdata.m_mapPieces = piecesList;

  // Islands: no m_eventId — only map-piece fields.
  const newPieceNode: any = {
    m_imageID: EditorState.defaultImageID,
    m_position: { x: Math.round(worldX), y: Math.round(worldY) },
    m_parallaxLayer: 0,
    m_drawLayer: EditorState.defaultDrawLayer,
    m_rotationAngle: 0,
    m_scaleX: 1,
    m_scaleY: 1,
    m_name: `mapPiece_${Date.now()}`
  };

  piecesList.push(newPieceNode);
  HistoryManager.endGesture();
  return newPieceNode;
}

export function addNewEventNode(type: string, worldX: number, worldY: number, parentName?: string): any {
  if (!State.data.mapConfig) return null;
  HistoryManager.recordBefore(type === 'doodad' ? '添加装饰物' : '添加事件');
  const eventList = State.data.mapConfig.objdata.m_eventList || [];
  State.data.mapConfig.objdata.m_eventList = eventList;

  const eventId = allocateUniqueEventId(eventList);

  const newNode: any = {
    m_eventType: type,
    m_position: { x: Math.round(worldX), y: Math.round(worldY) },
    m_rotationAngle: 0,
    m_scaleX: 1,
    m_scaleY: 1,
    m_name: `${type}_${Date.now()}`,
    m_eventId: eventId,
    m_dataString: ''
  };

  if (parentName) {
    newNode.m_parentEvent = parentName;
  }

  eventList.push(newNode);
  HistoryManager.endGesture();
  return newNode;
}

/** Doodads are event nodes with a fixed type and an extra m_drawLayer default; reuse addNewEventNode for the rest. */
export function addNewDoodad(worldX: number, worldY: number): any {
  const newDoodadNode = addNewEventNode('doodad', worldX, worldY);
  if (newDoodadNode) {
    newDoodadNode.m_drawLayer = EditorState.defaultDrawLayer;
    newDoodadNode.m_imageID = EditorState.defaultImageID;
  }
  return newDoodadNode;
}

/**
 * Collect valid m_imageID values for the current world from the uploaded pack:
 * - Static: islandN.png → imageId = N - offset (offset 0 if min file is island0, else 1)
 * - Animation: anim{K}/ or anim_{world}{K}/ → imageId = maxImageId + K
 * Sorted ascending for prev/next cycling.
 */
export function collectAvailableImageIds(): number[] {
  const worldName = State.data.selectedWorld;
  if (!worldName) return [0];

  const maxImageId = getWorldAnimationBoundary();
  const ids = new Set<number>();

  // ---- Static island images ----
  const assets = State.data.worlds[worldName];
  if (assets?.images) {
    let minFileNum = Infinity;
    const fileNums: number[] = [];
    for (const filename of Object.keys(assets.images)) {
      const m = filename.match(/^island(\d+)\.png$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        fileNums.push(num);
        if (num < minFileNum) minFileNum = num;
      }
    }
    if (fileNums.length > 0) {
      const offset = minFileNum === 0 ? 0 : 1;
      for (const num of fileNums) {
        const imageId = num - offset;
        if (imageId >= 0) ids.add(imageId);
      }
    }
  }

  // ---- Animation folders → reverse formula: imageId = maxImageId + animIndex ----
  if (State.data.filesByDir) {
    const worldLower = worldName.toLowerCase();
    for (const dir of State.data.filesByDir.keys()) {
      const d = dir.replace(/\\/g, '/');
      // .../anim{N}/
      const resDirName = getResDirName(worldName);
      const resDirLower = resDirName.toLowerCase();

      let m = d.match(/\/worldmap\/([^/]+)\/anim(\d+)\/$/i);
      if (m) {
        const folder = m[1];
        const animIndex = parseInt(m[2], 10);
        if (animIndex >= 1 && folder.toLowerCase() === resDirLower) {
          const dirFiles = State.data.filesByDir.get(dir);
          if (dirFiles?.some((f) => f.name.endsWith('.json'))) {
            ids.add(maxImageId + animIndex);
          }
        }
        continue;
      }

      m = d.match(/\/anim_([a-z0-9_]+?)(\d+)\/$/i);
      if (m && m[1].toLowerCase() === worldLower) {
        const animIndex = parseInt(m[2], 10);
        if (animIndex >= 1) {
          const dirFiles = State.data.filesByDir.get(dir);
          if (dirFiles?.some((f) => f.name.endsWith('.json'))) {
            ids.add(maxImageId + animIndex);
          }
        }
      }
    }
  }

  const sorted = Array.from(ids).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : [0];
}

/** Cycle current imageId within available pack IDs. dir = -1 | +1 */
export function cycleImageId(current: number, dir: -1 | 1): number {
  const ids = collectAvailableImageIds();
  if (ids.length === 0) return Math.max(0, current + dir);

  const idx = ids.indexOf(current);
  if (idx !== -1) {
    return ids[(idx + dir + ids.length) % ids.length];
  }

  // current not in pack list: step to nearest neighbor in the requested direction
  const firstGreater = ids.findIndex((id) => id > current);
  if (dir > 0) {
    return firstGreater === -1 ? ids[0] : ids[firstGreater];
  }
  if (firstGreater === -1) return ids[ids.length - 1];
  if (firstGreater === 0) return ids[ids.length - 1];
  return ids[firstGreater - 1];
}
