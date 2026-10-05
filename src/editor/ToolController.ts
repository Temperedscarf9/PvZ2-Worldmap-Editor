/**
 * ToolController — single place for toolMode / pan / sub-mode transitions.
 * Toolbar buttons and hotkeys must go through here so mutual exclusion stays consistent.
 */

import { EditorState, setPanActive } from './EditorState';
import type { ToolMode, DrawSubMode, EventSubMode } from './types';
import { clearSelection } from './Selection';
import { updateToolbarState, setDrawSubMode, setEventSubMode } from '../ui/toolbar';
import { showToast } from '../ui/toast';

export type ModeSwitchOptions = {
  drawSub?: DrawSubMode;
  eventSub?: EventSubMode;
  toast?: string;
  clearSel?: boolean;
};

const DRAW_TOASTS: Record<Exclude<DrawSubMode, 'none'>, { on: string; off: string }> = {
  add: { on: '添加已激活：点击地图空白处放置', off: '添加已关闭' },
  move: { on: '移动已激活：拖拽 hitbox 移动', off: '移动已关闭' },
  flip: { on: '翻转已激活：点击 hitbox 切换水平翻转', off: '翻转已关闭' },
  rotation: { on: '旋转已激活：点击 hitbox 打开旋转面板', off: '旋转已关闭' },
  delete: { on: '删除已激活：点击 hitbox 删除', off: '删除已关闭' },
};

const EVENT_TOASTS: Record<Exclude<EventSubMode, 'none'>, { on: string; off: string }> = {
  add: { on: '事件添加已启用：点击地图放置节点', off: '事件添加已关闭' },
  move: { on: '事件移动已启用：拖拽节点调整位置', off: '事件移动已关闭' },
  edit: { on: '事件编辑已启用：点击事件节点编辑属性', off: '事件编辑已关闭' },
  delete: { on: '事件删除已启用：点击事件节点即可删除', off: '事件删除已关闭' },
};

function applyMode(mode: ToolMode, opts: ModeSwitchOptions = {}): void {
  EditorState.toolMode = mode;
  setPanActive(false);

  if (mode === 'island' || mode === 'doodad') {
    EditorState.drawSubMode = opts.drawSub ?? 'move';
    EditorState.eventSubMode = 'none';
  } else if (mode === 'event') {
    EditorState.drawSubMode = 'none';
    EditorState.eventSubMode = opts.eventSub ?? 'edit';
  } else {
    EditorState.drawSubMode = 'none';
    EditorState.eventSubMode = 'none';
  }

  if (opts.clearSel !== false) clearSelection();
  updateToolbarState();
  if (opts.toast) showToast(opts.toast);
}

export const ToolController = {
  setModeIsland(): void {
    applyMode('island', {
      drawSub: 'move',
      toast: '岛屿模式已启用：请先激活 添加/移动/翻转/旋转/删除，再点击地图元素',
    });
  },

  setModeDoodad(): void {
    applyMode('doodad', {
      drawSub: 'move',
      toast: '装饰物模式已启用：请先激活 添加/移动/翻转/旋转/删除，再点击地图元素',
    });
  },

  setModeEvent(): void {
    applyMode('event', {
      eventSub: 'edit',
      toast: '事件模式已启用：可从工具栏选择 添加/移动/编辑/删除',
    });
  },

  setModeSelect(): void {
    applyMode('select', {
      toast: '选择模式已启用：点击任意元素进行选择',
    });
  },

  togglePan(): void {
    const next = !EditorState.isPanActive;
    setPanActive(next);
    if (next) clearSelection();
    updateToolbarState();
    showToast(next ? '平移模式已启用' : '编辑模式已启用（请选择子工具）');
  },

  /** Toggle island/doodad sub-tool with toast. */
  setDrawSub(mode: Exclude<DrawSubMode, 'none'>): void {
    if (EditorState.toolMode !== 'island' && EditorState.toolMode !== 'doodad') return;
    setDrawSubMode(mode);
    const t = DRAW_TOASTS[mode];
    if (t) showToast(EditorState.drawSubMode === mode ? t.on : t.off);
  },

  /** Toggle event sub-tool with toast. */
  setEventSub(mode: Exclude<EventSubMode, 'none'>): void {
    if (EditorState.toolMode !== 'event') return;
    setEventSubMode(mode);
    const t = EVENT_TOASTS[mode];
    if (t) showToast(EditorState.eventSubMode === mode ? t.on : t.off);
  },

  handleHotkey(key: string): boolean {
    const k = key.toLowerCase();
    if (k === 'p') {
      this.togglePan();
      return true;
    }
    if (k === 'i') {
      this.setModeIsland();
      return true;
    }
    if (k === 'd') {
      this.setModeDoodad();
      return true;
    }
    if (k === 'e') {
      this.setModeEvent();
      return true;
    }
    if (k === 's') {
      this.setModeSelect();
      return true;
    }
    return false;
  },
};
