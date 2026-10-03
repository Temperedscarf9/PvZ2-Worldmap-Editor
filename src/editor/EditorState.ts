import { DrawSubMode, EventSubMode, SelectedRef, ToolMode } from './types';

/**
 * Shared mutable editor-UI state: which tool/sub-mode is active, what's selected, in-progress
 * drag bookkeeping, and the rotate-panel target. This is the editor-side analogue of
 * core/state's `State` object - plain mutable fields, read/written directly by whichever
 * module needs them (ToolModeController, Selection, the commands/, ui/toolbar, ui/sidebar),
 * rather than threading a dozen parameters through every function.
 */
export const EditorState = {
  toolMode: 'island' as ToolMode,
  isPanActive: true,
  drawSubMode: 'none' as DrawSubMode,
  eventSubMode: 'none' as EventSubMode,
  selectedPieceRef: null as SelectedRef | null,

  isCurLayerActive: false,
  defaultDrawLayer: 0,
  defaultImageID: 0,

  pendingEventType: 'level',

  isDraggingPiece: false,
  hasActuallyDragged: false,
  dragStartPiecePos: { x: 0, y: 0 },
  dragStartMousePos: { x: 0, y: 0 },
  /**
   * Data-space offset from the parallax-corrected world point under the cursor at mousedown
   * to the node's m_position. Keeps the grab point glued to the cursor when converting
   * mouse → data via the inverse of the layer's translateX((layer/10)*dx) each move.
   */
  dragGrabOffset: { x: 0, y: 0 },

  rotateTargetNode: null as any,
  rotateTargetKind: null as 'piece' | 'doodad' | null,

  cameraDirty: true,
  targetCamera: { x: 0, y: 0, scale: 1 },
  rotatingPieces: [] as any[],

  /** Rotating cursor into State.players for the time-budgeted tick loop in EditorApp.ts - lets
   * a frame with too many active players to fully update within its time budget pick up where
   * it left off next frame, instead of either doing all of them unconditionally (locks up the
   * main thread for however long that takes) or skipping any of them permanently. */
  playerTickCursor: 0,

  /** Depth counter (not a plain boolean, so nested blocking UI can't have one closer re-widen
   * the budget while another still needs it narrow) - tightens the per-frame animation time
   * budget while set, so a modal doing DOM/input work gets more of each frame's time without
   * animation ever actually stopping. See FRAME_BUDGET_MS/FRAME_BUDGET_MS_TIGHT in EditorApp.ts. */
  uiFocusDepth: 0,
};

/** Call when UI that wants more of each frame's time budget (a modal doing text input, for
 * example) opens - narrows (not zeroes) the per-frame animation budget in EditorApp.ts's tick()
 * loop until every caller of this has paired it with requestNormalFrameBudget(). Animation never
 * stops; it just yields more of each frame back to input/DOM work sooner. */
export function requestTighterFrameBudget(): void {
  EditorState.uiFocusDepth++;
}

export function requestNormalFrameBudget(): void {
  EditorState.uiFocusDepth = Math.max(0, EditorState.uiFocusDepth - 1);
}

export const EVENT_TYPE_CYCLE = [
  'level', 'plant', 'plantbox', 'upgrade', 'powerup',
  'star_gate', 'key_gate', 'path_node', 'island', 'doodad',
  'giftbox', 'pinata'
];

/** Restores editor-local UI state to its startup defaults; used by MapIO.unloadResourcePack. */
export function resetEditorState(): void {
  EditorState.defaultImageID = 0;
  EditorState.defaultDrawLayer = 0;
  EditorState.toolMode = 'island';
  EditorState.isPanActive = true;
  EditorState.drawSubMode = 'none';
  EditorState.eventSubMode = 'none';
  EditorState.pendingEventType = 'level';
  EditorState.selectedPieceRef = null;
  EditorState.isDraggingPiece = false;
  EditorState.hasActuallyDragged = false;
  EditorState.dragGrabOffset.x = 0;
  EditorState.dragGrabOffset.y = 0;
  EditorState.rotatingPieces = [];
  EditorState.isCurLayerActive = false;
  EditorState.rotateTargetNode = null;
  EditorState.rotateTargetKind = null;
  EditorState.playerTickCursor = 0;
  EditorState.uiFocusDepth = 0;
}

/**
 * Pan 与所有绘制/事件子工具互斥。
 * - 开启 Pan：强制 drawSubMode / eventSubMode = 'none'，避免残留子模式在 UI 上“复活”。
 * - 关闭 Pan：不改动子模式，需用户显式点选子工具。
 * 调用方在开启后不要再调用 setDrawSubMode / setEventSubMode，否则会立刻把 isPanActive 设回 false。
 */
export function setPanActive(active: boolean): void {
  EditorState.isPanActive = active;
  if (active) {
    EditorState.drawSubMode = 'none';
    EditorState.eventSubMode = 'none';
  }
}