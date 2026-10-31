/**
 * Studio shell bindings: drawers, tabs, palette, zoom and map information.
 * Kept separate from the editing commands so the visual layer stays replaceable.
 */
import { State } from '../core/state';
import { DOM } from '../app/dom';
import { EditorState, EVENT_TYPE_CYCLE } from '../editor/EditorState';
import { collectAvailableImageIds } from '../editor/commands/AddCommand';
import { getWorldAnimationBoundary } from '../core/worldMeta';
import { getObjectUrlCached, findPieceAnim, getAvailableTextureResolutions } from '../core/resources';
import { ZoomHelper } from '../core/camera';
import { Matrix } from '../utils/mathTool';
import { updateToolbarState } from './toolbar';
import { updateInspector } from './sidebar';
import { bindBoundsPanel, renderBoundsPanel, updateBoundsOverlay } from './boundsPanel';
import { refreshSingleObject } from '../editor/ObjectMount';

const EVENT_META: Record<string, { label: string; glyph: string; desc: string }> = {
  level: { label: '关卡节点', glyph: '★', desc: '普通关卡/路径节点' },
  plant: { label: '植物', glyph: '❀', desc: '可种植植物节点' },
  plantbox: { label: '植物箱', glyph: '▣', desc: '植物奖励箱' },
  upgrade: { label: '升级', glyph: '⬆', desc: '升级/强化节点' },
  powerup: { label: '能量强化', glyph: '⚡', desc: 'Power-up 节点' },
  star_gate: { label: '星星门', glyph: '✧', desc: '星星解锁门' },
  key_gate: { label: '钥匙门', glyph: '⚿', desc: '钥匙解锁门' },
  path_node: { label: '路径点', glyph: '⌁', desc: '路径连接节点' },
  island: { label: '岛屿事件', glyph: '◈', desc: '事件型岛屿' },
  doodad: { label: '装饰物', glyph: '❖', desc: '复用岛屿动画的装饰' },
  giftbox: { label: '礼盒', glyph: '🎁', desc: '奖励礼盒' },
  pinata: { label: '皮纳塔', glyph: '◉', desc: '皮纳塔入口' },
};

let assetCacheKey: string | null = null;
let assetCacheIds: number[] = [];
let lastActiveImageId: number | null = null;
let refreshTimer: number | null = null;

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setActiveTab(group: 'left' | 'right', name: string): void {
  const tabSelector = group === 'left' ? '[data-left-tab]' : '[data-right-tab]';
  const pageSelector = group === 'left' ? '[data-left-page]' : '[data-right-page]';
  document.querySelectorAll<HTMLElement>(tabSelector).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset[group === 'left' ? 'leftTab' : 'rightTab'] === name);
  });
  document.querySelectorAll<HTMLElement>(pageSelector).forEach((page) => {
    page.classList.toggle('active', page.dataset[group === 'left' ? 'leftPage' : 'rightPage'] === name);
  });
}

function bindDrawers(): void {
  document.querySelectorAll<HTMLElement>('[data-left-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab('left', btn.dataset.leftTab!));
  });
  document.querySelectorAll<HTMLElement>('[data-right-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab('right', btn.dataset.rightTab!));
  });

  const toggle = (bodyClass: string) => document.body.classList.toggle(bodyClass);
  el<HTMLButtonElement>('btn-toggle-left')?.addEventListener('click', () => toggle('left-collapsed'));
  el<HTMLButtonElement>('btn-toggle-right')?.addEventListener('click', () => toggle('right-collapsed'));
  el<HTMLButtonElement>('btn-collapse-left')?.addEventListener('click', () => toggle('left-collapsed'));
  el<HTMLButtonElement>('btn-collapse-right')?.addEventListener('click', () => toggle('right-collapsed'));

  // Double-click drawer header resets to expanded state (handy after an accidental collapse).
  document.querySelectorAll<HTMLElement>('.drawer-head').forEach((head) => {
    head.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      document.body.classList.remove('left-collapsed', 'right-collapsed');
    });
  });
}

const RES_OPTIONS = [1536, 768];

/**
 * The editor only keeps two texture resolutions resident at a time (1536 and 768); this is
 * the pair the original code and the PAM JSON layout were designed around. Keep the selector
 * to those two and disable 768 when the uploaded pack has no 768 world imagery.
 */
function refreshResolutionOptions(): void {
  const select = el<HTMLSelectElement>('texture-res-select');
  if (!select) return;

  const available = getAvailableTextureResolutions();
  const known = new Set(available);
  const current = State.data.textureResolution;

  select.innerHTML = '';
  for (const n of RES_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(n);
    const ok = available.length === 0 || known.has(n);
    opt.disabled = available.length > 0 && !ok;
    opt.textContent = ok ? String(n) : `${n} · 缺失`;
    opt.title = ok ? `${n}px 纹理` : `资源包没有 convert/images/${n}/worldmap/ 图片`;
    select.appendChild(opt);
  }

  if (available.length > 0 && !known.has(current)) {
    const fallback = known.has(1536) ? 1536 : available[0];
    State.data.textureResolution = fallback;
    select.value = String(fallback);
  } else {
    select.value = String(current);
  }
}

function getWorldImages(): Record<string, File> | null {
  const world = State.data.selectedWorld;
  if (!world) return null;
  return (State.data.worlds[world]?.images as Record<string, File> | undefined) || null;
}

function findStaticFile(imageId: number, images: Record<string, File>): File | null {
  let minFileNum = Infinity;
  for (const name of Object.keys(images)) {
    const m = name.match(/^island(\d+)\.png$/i);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (num < minFileNum) minFileNum = num;
  }
  const offset = minFileNum === 0 ? 0 : 1;
  return images[`island${imageId + offset}.png`] || images[`island${imageId}.png`] || null;
}

function animationThumb(world: string, animId: number): File | null {
  try {
    const anim = findPieceAnim(world, animId);
    if (!anim || !anim.files.length) return null;
    // Prefer a png frame; PAM folder files are direct images in the converted pack.
    return anim.files.find((f) => /\.(png|webp)$/i.test(f.name)) || anim.files[0] || null;
  } catch {
    return null;
  }
}

function buildAssetPalette(): void {
  const host = el<HTMLDivElement>('asset-palette');
  if (!host) return;

  const world = State.data.selectedWorld;
  const images = getWorldImages();
  if (!world || !images) {
    host.innerHTML = '<div class="empty-inline">加载世界后显示素材</div>';
    const count = el('asset-count');
    if (count) count.textContent = '0';
    assetCacheKey = null;
    assetCacheIds = [];
    return;
  }

  const cacheKey = `${world}|${State.data.isLinear ? 'L' : 'N'}|${State.data.textureResolution}`;
  if (assetCacheKey === cacheKey && assetCacheIds.length > 0) {
    // Palette already built; just update active highlighting.
    updatePaletteActive();
    return;
  }

  const maxImageId = getWorldAnimationBoundary();
  const ids = collectAvailableImageIds();
  assetCacheKey = cacheKey;
  assetCacheIds = ids;

  host.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const id of ids) {
    const isAnim = id > maxImageId;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'asset-card';
    card.dataset.imageId = String(id);
    card.title = isAnim ? `动画 ${id - maxImageId}` : `静态岛屿 ${id}`;

    const thumb = document.createElement('div');
    thumb.className = 'asset-thumb';
    const file = isAnim ? animationThumb(world, id - maxImageId) : findStaticFile(id, images);
    if (file) {
      const img = document.createElement('img');
      img.src = getObjectUrlCached(file);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = `image ${id}`;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
      thumb.appendChild(img);
    } else {
      thumb.style.background =
        'radial-gradient(circle at 50% 45%, rgba(89,201,189,.16), transparent 65%)';
      thumb.textContent = isAnim ? 'ANIM' : 'IMG';
      thumb.style.display = 'grid';
      thumb.style.placeItems = 'center';
      thumb.style.fontSize = '9px';
      thumb.style.letterSpacing = '1px';
      thumb.style.color = isAnim ? 'var(--teal)' : 'var(--text-faint)';
    }

    const meta = document.createElement('div');
    meta.className = 'asset-meta';
    meta.innerHTML = isAnim
      ? `<b>#${id}</b><span class="anim-tag">ANIM ${id - maxImageId}</span>`
      : `<b>#${id}</b><span>ISLAND</span>`;

    card.append(thumb, meta);
    card.addEventListener('click', () => {
      EditorState.defaultImageID = id;
      if (EditorState.toolMode !== 'island' && EditorState.toolMode !== 'doodad') {
        EditorState.toolMode = 'island';
        EditorState.eventSubMode = 'none';
      }
      updateToolbarState();
      updatePaletteActive();
      // Reflect the chosen image on an existing selection if it is an island.
      const ref = EditorState.selectedPieceRef;
      if (ref) {
        const node = (ref as any).piece || (ref as any).node;
        if (node && (ref as any).piece) {
          node.m_imageID = id;
          void refreshSingleObject(node, 'reload').then(() => updateInspector());
        }
      }
    });
    frag.appendChild(card);
  }

  host.appendChild(frag);
  const count = el('asset-count');
  if (count) count.textContent = String(ids.length);
  updatePaletteActive();
}

function updatePaletteActive(): void {
  const ref = EditorState.selectedPieceRef;
  const selected = ref ? ((ref as any).piece || (ref as any).node) : null;
  const activeId = selected && (ref as any).piece
    ? selected.m_imageID
    : ref
      ? null
      : EditorState.defaultImageID;
  lastActiveImageId = typeof activeId === 'number' ? activeId : null;

  document.querySelectorAll<HTMLElement>('.asset-card').forEach((card) => {
    card.classList.toggle('active', Number(card.dataset.imageId) === lastActiveImageId);
  });

  const label = el('active-image-id');
  if (label) label.textContent = lastActiveImageId == null ? '—' : String(lastActiveImageId);
}

function filterAssets(query: string): void {
  const q = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('.asset-card').forEach((card) => {
    const id = card.dataset.imageId || '';
    const text = card.textContent || '';
    card.style.display = !q || id.includes(q) || text.toLowerCase().includes(q) ? '' : 'none';
  });
}

function buildEventPalette(): void {
  const host = el<HTMLDivElement>('event-palette');
  if (!host) return;
  host.innerHTML = '';
  for (const type of EVENT_TYPE_CYCLE) {
    const meta = EVENT_META[type] || { label: type, glyph: '•', desc: '' };
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'event-card';
    card.dataset.eventType = type;
    card.innerHTML = `
      <span class="event-glyph">${meta.glyph}</span>
      <span style="min-width:0;text-align:left;">
        <span class="event-name">${meta.label}</span>
        <span class="event-desc">${type}${meta.desc ? ' · ' + meta.desc : ''}</span>
      </span>`;
    card.addEventListener('click', () => {
      EditorState.pendingEventType = type;
      if (EditorState.toolMode !== 'event') {
        EditorState.toolMode = 'event';
        EditorState.isPanActive = false;
        EditorState.drawSubMode = 'none';
        EditorState.eventSubMode = 'edit';
      }
      updateToolbarState();
      updateEventActive();
    });
    host.appendChild(card);
  }
  updateEventActive();
}

function updateEventActive(): void {
  document.querySelectorAll<HTMLElement>('.event-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.eventType === EditorState.pendingEventType);
  });
  const label = el('active-event-type');
  if (label) label.textContent = EditorState.pendingEventType;
}

function zoomBy(factor: number): void {
  const rect = DOM.viewport.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const t = EditorState.targetCamera;
  const m = Matrix.multiply(Matrix.scale(t.scale, t.scale), Matrix.translate(t.x, t.y));
  const inv = Matrix.inverse(m);
  const world = Matrix.transformPoint(inv, cx, cy);
  const next = ZoomHelper.clamp(t.scale * factor, rect.height);
  if (next === t.scale) return;
  t.scale = next;
  t.x = cx / next - world.x;
  t.y = cy / next - world.y;
}

function bindZoom(): void {
  el<HTMLButtonElement>('zoom-in')?.addEventListener('click', () => zoomBy(1.15));
  el<HTMLButtonElement>('zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.15));
  el<HTMLButtonElement>('btn-fit-map')?.addEventListener('click', fitMap);
}

function fitMap(): void {
  const rect = State.data.mapConfig?.objdata?.m_boundingRect;
  if (!rect) return;
  const res = State.data.textureResolution;
  const x = (rect.mX * res) / 600;
  const y = (rect.mY * res) / 600;
  const w = Math.max(1, (rect.mWidth * res) / 600);
  const h = Math.max(1, (rect.mHeight * res) / 600);
  const vp = DOM.viewport.getBoundingClientRect();
  const scale = ZoomHelper.clamp(Math.min(vp.width / w, vp.height / h) * 0.92, vp.height);
  EditorState.targetCamera.scale = scale;
  EditorState.targetCamera.x = vp.width / 2 / scale - (x + w / 2);
  EditorState.targetCamera.y = vp.height / 2 / scale - (y + h / 2);
}

function updateMapInfo(): void {
  document.body.classList.toggle('editing', EditorState.toolMode !== 'select' && !EditorState.isPanActive);
}

function scheduleRefresh(delay = 60): void {
  if (refreshTimer != null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    buildAssetPalette();
    updateMapInfo();
    updatePaletteActive();
    updateEventActive();
  }, delay);
}

function bindSearch(): void {
  const search = el<HTMLInputElement>('asset-search');
  search?.addEventListener('input', () => filterAssets(search.value));
}

export function initStudioUI(): void {
  bindDrawers();
  bindZoom();
  buildEventPalette();
  bindSearch();
  buildAssetPalette();
  bindBoundsPanel();
  renderBoundsPanel();
  updateBoundsOverlay();
  refreshResolutionOptions();
  updateMapInfo();

  window.addEventListener('studio:worlds-updated', () => {
    assetCacheKey = null;
    assetCacheIds = [];
    refreshResolutionOptions();
    scheduleRefresh(30);
  });
  window.addEventListener('studio:selection-updated', () => {
    updatePaletteActive();
    updateMapInfo();
  });
  window.addEventListener('studio:map-updated', () => {
    refreshResolutionOptions();
    renderBoundsPanel();
    updateBoundsOverlay();
    scheduleRefresh(20);
  });
  window.addEventListener('studio:toolbar-updated', () => {
    updateMapInfo();
    updateEventActive();
    updatePaletteActive();
  });
  window.addEventListener('trigger-map-render', () => scheduleRefresh(320));

  // Toolbar mode changes are not evented; poll cheaply at a low rate to keep the HUD in sync.
  window.setInterval(() => {
    updateMapInfo();
    updateEventActive();
  }, 900);

  // If the pack has just loaded, the selector may be populated before this module binds.
  scheduleRefresh(120);
}
