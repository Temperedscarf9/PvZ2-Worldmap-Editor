import {transformToMatrix, multiplyMatrix, parseSpriteFrameLabels} from './model';
import {
  buildAllTimelines,
  computeAnimationBounds,
  getChildSpriteInfo,
  getTimelineSnapshot,
} from './timeline';
import type { Animation, TimelinesMap, Matrix6, Color } from './types';

// 缓存已经做过 RGB 乘法的 Canvas（alpha 保持与原图一致）
const tintCache = new Map<string, HTMLCanvasElement>();

const TINT_EPSILON = 1e-3;

function getCacheKey(
    img: HTMLImageElement,
    sourceRect: [number, number, number, number] | null,
    rgb: { r: number; g: number; b: number }
): string {
  const srcPart = sourceRect
      ? `${sourceRect[0]}_${sourceRect[1]}_${sourceRect[2]}_${sourceRect[3]}`
      : 'full';
  const r = (rgb.r * 255) | 0;
  const g = (rgb.g * 255) | 0;
  const b = (rgb.b * 255) | 0;
  const srcKey = img.currentSrc || img.src;
  return `${srcKey}_${srcPart}_${r}_${g}_${b}`;
}

/**
 * 对图像应用 RGB 乘法（严格不改变 alpha）。
 */
function createTintedImage(
    img: HTMLImageElement,
    sourceRect: [number, number, number, number] | null,
    rgb: { r: number; g: number; b: number }
): HTMLCanvasElement {
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;

  let srcX = 0, srcY = 0, srcW = imgW, srcH = imgH;
  if (sourceRect) {
    srcX = Math.max(0, sourceRect[0] | 0);
    srcY = Math.max(0, sourceRect[1] | 0);
    srcW = Math.min(sourceRect[2] | 0, imgW - srcX);
    srcH = Math.min(sourceRect[3] | 0, imgH - srcY);
    if (srcW <= 0 || srcH <= 0) {
      srcX = 0; srcY = 0; srcW = imgW; srcH = imgH;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  if (rgb.r === 1 && rgb.g === 1 && rgb.b === 1) {
    return canvas;
  }

  try {
    const imageData = ctx.getImageData(0, 0, srcW, srcH);
    const data = imageData.data;
    const rF = rgb.r;
    const gF = rgb.g;
    const bF = rgb.b;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = data[i]     * rF;
      data[i + 1] = data[i + 1] * gF;
      data[i + 2] = data[i + 2] * bF;
    }
    ctx.putImageData(imageData, 0, 0);
  } catch (e) {
    console.warn(
        '[PamCanvasPlayer] Pixel-level tint failed (cross-origin image without CORS?). ' +
        'Falling back to untinted image to preserve alpha.',
        e
    );
  }

  return canvas;
}

function renderSpriteTree2D(
    ctx: CanvasRenderingContext2D,
    animation: Animation,
    textures: Map<string, HTMLImageElement>,
    timelines: TimelinesMap,
    spriteIndex: number,
    frameIndex: number,
    parentMatrix: Matrix6,
    parentColor: Color,
    spriteVisible: boolean[],
): void {
  const snapshotContext = getTimelineSnapshot(animation, timelines, spriteIndex, frameIndex);
  if (!snapshotContext) return;

  const { actualFrame, snapshot } = snapshotContext;

  for (const layer of snapshot) {
    const layerMatrix = multiplyMatrix(parentMatrix, layer.transform);
    const accumulatedColor = {
      r: parentColor.r * layer.color.r,
      g: parentColor.g * layer.color.g,
      b: parentColor.b * layer.color.b,
      a: parentColor.a * layer.color.a,
    };

    if (layer.isSprite) {
      if (layer.resource < spriteVisible.length && !spriteVisible[layer.resource]) {
        continue;
      }
      const childInfo = getChildSpriteInfo(animation, layer, actualFrame);
      if (!childInfo) continue;
      const { childSpriteIndex, adjustedFrame } = childInfo;

      ctx.save();
      if (layer.additive) {
        ctx.globalCompositeOperation = 'lighter';
      }
      renderSpriteTree2D(
          ctx,
          animation,
          textures,
          timelines,
          childSpriteIndex,
          adjustedFrame,
          layerMatrix,
          accumulatedColor,
          spriteVisible,
      );
      ctx.restore();
      continue;
    }

    const imageDef = animation.image[layer.resource];
    if (!imageDef) continue;

    const img = textures.get(imageDef.name);
    if (!img) continue;

    const imgMatrix = imageDef._cachedMatrix || transformToMatrix(imageDef.transform);
    const finalMatrix = multiplyMatrix(layerMatrix, imgMatrix);

    const baseW = img.naturalWidth || img.width;
    const baseH = img.naturalHeight || img.height;
    if (baseW <= 0 || baseH <= 0) continue;

    const drawW = imageDef.size?.width ?? baseW;
    const drawH = imageDef.size?.height ?? baseH;
    if (drawW <= 0 || drawH <= 0) continue;

    const scaleX = drawW / baseW;
    const scaleY = drawH / baseH;

    const scaledMatrix: Matrix6 = [
      finalMatrix[0] * scaleX, finalMatrix[1] * scaleX,
      finalMatrix[2] * scaleY, finalMatrix[3] * scaleY,
      finalMatrix[4], finalMatrix[5],
    ];

    ctx.save();

    if (layer.additive) {
      ctx.globalCompositeOperation = 'lighter';
    }

    ctx.setTransform(
        scaledMatrix[0], scaledMatrix[1],
        scaledMatrix[2], scaledMatrix[3],
        scaledMatrix[4], scaledMatrix[5],
    );

    ctx.globalAlpha = accumulatedColor.a;

    const needRgbTint =
        accumulatedColor.r < 1 - TINT_EPSILON ||
        accumulatedColor.g < 1 - TINT_EPSILON ||
        accumulatedColor.b < 1 - TINT_EPSILON;

    if (needRgbTint) {
      const rgb = {
        r: accumulatedColor.r,
        g: accumulatedColor.g,
        b: accumulatedColor.b,
      };
      const key = getCacheKey(img, layer.sourceRect, rgb);
      let tintedCanvas = tintCache.get(key);
      if (!tintedCanvas) {
        if (tintCache.size > 2000) {
          tintCache.clear();
        }
        tintedCanvas = createTintedImage(img, layer.sourceRect, rgb);
        tintCache.set(key, tintedCanvas);
      }
      if (layer.sourceRect) {
        ctx.drawImage(tintedCanvas, layer.sourceRect[0], layer.sourceRect[1]);
      } else {
        ctx.drawImage(tintedCanvas, 0, 0);
      }
    } else {
      if (layer.sourceRect) {
        const [sx, sy, sw, sh] = layer.sourceRect;
        const clippedW = Math.min(sw, baseW - sx);
        const clippedH = Math.min(sh, baseH - sy);
        if (clippedW > 0 && clippedH > 0) {
          ctx.drawImage(img, sx, sy, clippedW, clippedH, sx, sy, clippedW, clippedH);
        }
      } else {
        ctx.drawImage(img, 0, 0);
      }
    }

    ctx.restore();
  }
}

export function clearTintCache(): void {
  tintCache.clear();
}

/**
 * 当前循环区间信息。所有"应该在哪一帧回绕"、"随机延迟期间停留在哪一帧"
 * 的决策都集中在这里，避免不同代码路径各自为政。
 */
interface CycleInfo {
  /** 循环区间起点（label 起点或 0） */
  begin: number;
  /** 循环区间终点（label 终点或 sprite 末帧） */
  end: number;
  /** 回绕边界：currentFrame 一旦越过 loopEnd，就触发回绕 */
  loopEnd: number;
  /** 随机延迟期间停留显示的帧 */
  pauseFrame: number;
}

export class PamCanvasPlayer {
  private canvas: HTMLCanvasElement;
  private anim: Animation;
  private textures: Map<string, HTMLImageElement>;
  private timelines: TimelinesMap;
  private bounds: { x: number; y: number; width: number; height: number };
  private currentFrame = 0;
  private targetFps = 30;
  private lastTime = 0;
  private playing = true;
  private currentLabel: string | null = null;
  private labelRange: { begin: number; end: number } | null = null;
  private loop = true;
  private destroyed = false;
  private spriteVisible: boolean[] = [];
  private animKey: string = '';

  private isVisible = true;
  private lastRenderedFrame = -1;

  private static observer: IntersectionObserver | null = null;

  private static getObserver(): IntersectionObserver | null {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return null;
    }
    if (!PamCanvasPlayer.observer) {
      PamCanvasPlayer.observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const canvas = entry.target as HTMLCanvasElement;
              const player = (canvas as any).__player;
              if (player) {
                player.isVisible = entry.isIntersecting;
                if (player.isVisible && player.playing) {
                  player.lastRenderedFrame = -1;
                  player.lastTime = performance.now();
                }
              }
            }
          },
          { rootMargin: '120px', threshold: 0 },
      );
    }
    return PamCanvasPlayer.observer;
  }

  private delayMin = 0;
  private delayMax = 0;
  private currentDelayRemaining = 0;
  private hasDelayDetails = false;

  /**
   * 计算当前 sprite / label 对应的循环区间和暂停帧。
   *
   * stop 语义：
   *   - 循环区间末帧带 stop 时，该帧不参与循环回绕（loopEnd = end - 1）
   *   - pauseFrame 与无延迟路径的落点保持一致，落在 [begin, loopEnd] 内，
   *     即 stop 帧（若存在）不被随机延迟显示
   *   - 若希望随机延迟期间显示 stop 帧本身，把 pauseFrame 改为
   *     `isStopFrame ? end : loopEnd` 即可
   */
  private computeCycleInfo(): CycleInfo | null {
    const activeSprite = this.anim.mainSprite || this.anim.sprite[0];
    if (!activeSprite || activeSprite.frame.length === 0) return null;

    const begin = this.labelRange ? this.labelRange.begin : 0;
    const end = this.labelRange ? this.labelRange.end : activeSprite.frame.length - 1;
    const isStopFrame = activeSprite.frame[end]?.stop === true;
    const hasExclusiveStop = !!this.labelRange && isStopFrame && end > begin;

    const loopEnd = hasExclusiveStop ? end - 1 : end;
    const pauseFrame = loopEnd;

    return { begin, end, loopEnd, pauseFrame };
  }

  public setDelayDetails(min: number, max: number): void {
    this.delayMin = min;
    this.delayMax = max;
    this.hasDelayDetails = true;
    const delay = this.delayMin + Math.random() * (this.delayMax - this.delayMin);
    this.currentDelayRemaining = delay;

    const cycle = this.computeCycleInfo();
    if (cycle) {
      // 与 tick() 中"回绕那一刻"的落点保持一致：停在 pauseFrame
      this.currentFrame = cycle.pauseFrame;
      this.lastRenderedFrame = -1;
      this.draw();
    }
  }

  private labelProbabilityBucket: Record<string, number> | null = null;
  private probabilitySide: string | null = null;
  private excludedThreshold: number = -1;

  public setLabelProbabilityBucket(bucket: Record<string, number> | null, side?: string | null): void {
    this.labelProbabilityBucket = bucket;
    this.probabilitySide = side || null;
    this.excludedThreshold = -1;
    if (bucket) {
      this.selectAndPlayBucketLabel();
    }
  }

  private selectAndPlayBucketLabel(startFrameOffset = 0): void {
    if (!this.labelProbabilityBucket) return;
    const selectedKey = this.chooseLabelFromBucket();
    if (!selectedKey) return;

    let finalLabel = selectedKey;
    if (this.probabilitySide) {
      if (selectedKey.includes('%s')) {
        finalLabel = selectedKey.replace('%s', this.probabilitySide);
      } else if (selectedKey.startsWith('_')) {
        finalLabel = 'locked_' + this.probabilitySide + selectedKey;
      }
    }

    this.playLabel(finalLabel, true, startFrameOffset);
  }

  private chooseLabelFromBucket(): string | null {
    if (!this.labelProbabilityBucket) return null;
    const keys = Object.keys(this.labelProbabilityBucket);
    if (keys.length === 0) return null;

    const totalOriginalWeight = keys.reduce((sum, k) => sum + (this.labelProbabilityBucket![k] || 0), 0);
    if (totalOriginalWeight <= 0) {
      return keys[Math.floor(Math.random() * keys.length)];
    }

    const originalProbabilities = new Map<string, number>();
    for (const key of keys) {
      const weight = this.labelProbabilityBucket[key] || 0;
      originalProbabilities.set(key, weight / totalOriginalWeight);
    }

    let filteredKeys = keys.filter(key => {
      const originalP = originalProbabilities.get(key) || 0;
      return originalP > this.excludedThreshold;
    });

    if (filteredKeys.length === 0) {
      this.excludedThreshold = -1;
      filteredKeys = keys;
    }

    const filteredTotalWeight = filteredKeys.reduce((sum, k) => sum + (this.labelProbabilityBucket![k] || 0), 0);
    let selectedKey: string;
    if (filteredTotalWeight <= 0) {
      selectedKey = filteredKeys[Math.floor(Math.random() * filteredKeys.length)];
    } else {
      let rand = Math.random() * filteredTotalWeight;
      let found = false;
      selectedKey = filteredKeys[filteredKeys.length - 1];
      for (const key of filteredKeys) {
        const weight = this.labelProbabilityBucket[key] || 0;
        if (rand < weight) {
          selectedKey = key;
          found = true;
          break;
        }
        rand -= weight;
      }
      if (!found) {
        selectedKey = filteredKeys[filteredKeys.length - 1];
      }
    }

    const chosenOriginalProb = originalProbabilities.get(selectedKey) || 0;
    if (chosenOriginalProb <= 0.15) {
      this.excludedThreshold = chosenOriginalProb;
    } else {
      this.excludedThreshold = -1;
    }

    return selectedKey;
  }

  constructor(
      canvas: HTMLCanvasElement,
      animation: Animation,
      textures: Map<string, HTMLImageElement>,
      animKey?: string,
  ) {
    this.canvas = canvas;
    this.anim = animation;
    this.textures = textures;
    this.animKey = animKey || '';

    const animAny = animation as any;
    if (!animAny._timelines) {
      animAny._timelines = buildAllTimelines(animation);
    }
    this.timelines = animAny._timelines;

    this.targetFps = animation.frameRate || 30;
    this.initSpriteVisibility();

    if (!animAny._bounds) {
      animAny._bounds = new Map<any, { x: number; y: number; width: number; height: number }>();
    }
    let bounds = animAny._bounds.get(textures);
    if (!bounds) {
      bounds = computeAnimationBounds(animation, textures, this.timelines);
      if (bounds.width <= 0 || bounds.height <= 0 || !isFinite(bounds.x)) {
        bounds = {
          x: 0,
          y: 0,
          width: animation.size[0] || 400,
          height: animation.size[1] || 400,
        };
      }
      animAny._bounds.set(textures, bounds);
    }
    this.bounds = bounds;

    const width = Math.ceil(this.bounds.width);
    const height = Math.ceil(this.bounds.height);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = `${this.bounds.x}px`;
    this.canvas.style.top = `${this.bounds.y}px`;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.lastTime = performance.now();

    const obs = PamCanvasPlayer.getObserver();
    if (obs) {
      (this.canvas as any).__player = this;
      this.isVisible = false;
      obs.observe(this.canvas);
    } else {
      this.isVisible = true;
    }

    this.draw();
  }

  private initSpriteVisibility(): void {
    const spriteCount = this.anim.sprite.length;
    this.spriteVisible = new Array(spriteCount).fill(true);

    const key = (this.animKey || '').toLowerCase();
    const isPlant = key.includes('plant');

    const shadowPowerStems = [
      'dragonbabybruit',
      'dragonbruit',
      'dusklobber',
      'gloomvine',
      'grimrose',
      'guardshroom',
      'moonflower',
      'murkadamia',
      'nightshade',
      'noctarine',
      'powervine',
      'shadowpea',
      'shadowshroom',
    ];

    const isShadowPower = shadowPowerStems.some(stem => key.includes(stem));
    const isNightshade = key.includes('nightshade');
    const isMagnetshroom = key.includes('magnetshroom');
    const isWallnut = key.includes('wallnut') && !key.includes('tallnut');
    const isTallnut = key.includes('tallnut');
    const isEndurian = key.includes('endurian');

    for (let i = 0; i < spriteCount; i++) {
      const sp = this.anim.sprite[i];
      if (!sp.name) continue;
      const name = sp.name;

      let shouldHide = false;

      if (isPlant && name.startsWith('custom_')) shouldHide = true;
      if (isNightshade && name.endsWith('_pf')) shouldHide = true;
      if (isShadowPower && name.includes('dark')) shouldHide = true;
      if (isMagnetshroom && name.includes('Magnet_Item')) shouldHide = true;
      if (isWallnut && name.includes('_wallnut_armor_states')) shouldHide = true;
      if (isTallnut && name.includes('_tallnut_plantfood_armor')) shouldHide = true;
      if (isEndurian && name.includes('endurian_plantfood_armor')) shouldHide = true;
      if (name === 'ink' || name === 'butter' || name === 'ground_swatch' || name === 'ground_swatch_plane') {
        shouldHide = true;
      }

      if (shouldHide) {
        this.spriteVisible[i] = false;
      }
    }
  }

  public setPlayState(playing: boolean): void {
    this.playing = playing;
  }

  public getCurrentLabel(): string | null {
    return this.currentLabel;
  }

  public playLabel(label: string, loop = true, startFrameOffset = 0): void {
    this.currentLabel = label;
    this.loop = loop;
    this.lastRenderedFrame = -1;

    const activeSprite = this.anim.mainSprite || this.anim.sprite[0];
    if (!activeSprite) return;

    let begin = 0;
    let end = activeSprite.frame.length - 1;

    const labels = parseSpriteFrameLabels(activeSprite);
    const matched = labels.find(l => l.name === label);
    if (matched) {
      this.labelRange = { begin: matched.begin, end: matched.end };
      begin = matched.begin;
      end = matched.end;
    } else {
      const idx = activeSprite.frame.findIndex(f => f.label === label);
      if (idx !== -1) {
        this.labelRange = { begin: idx, end: activeSprite.frame.length - 1 };
        begin = idx;
        end = activeSprite.frame.length - 1;
      } else {
        this.labelRange = null;
        begin = 0;
        end = activeSprite.frame.length - 1;
      }
    }

    const cycle = this.computeCycleInfo();
    if (!cycle) return;
    const { loopEnd } = cycle;
    const frameCount = loopEnd - begin + 1;

    const matchedOffset = frameCount > 0 ? (startFrameOffset % frameCount) : 0;
    this.currentFrame = begin + matchedOffset;

    this.lastTime = performance.now();
    this.draw();
  }

  public setFrame(frameNum: number): void {
    const activeSprite = this.anim.mainSprite || this.anim.sprite[0];
    if (!activeSprite) return;
    this.currentFrame = Math.max(0, Math.min(frameNum, activeSprite.frame.length - 1));
    this.lastRenderedFrame = -1;
    this.draw();
  }

  public tick(now: number): void {
    if (this.destroyed) return;

    if (!this.playing) {
      this.lastTime = now;
      return;
    }

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (dt > 0.1) dt = 0.1;

    // 延迟倒计时分支：期间不推进 currentFrame，仅减 dt
    if (this.currentDelayRemaining > 0) {
      this.currentDelayRemaining -= dt;
      if (this.currentDelayRemaining <= 0) {
        this.currentDelayRemaining = 0;
        const cycle = this.computeCycleInfo();
        if (cycle) {
          this.currentFrame = cycle.begin;
        }
      }
      if (this.isVisible) {
        this.draw();
      }
      return;
    }

    const cycle = this.computeCycleInfo();
    if (!cycle) return;
    const { begin, loopEnd, pauseFrame } = cycle;
    const frameCount = loopEnd - begin + 1;

    this.currentFrame += dt * this.targetFps;

    if (this.currentFrame >= loopEnd + 1) {
      if (this.loop) {
        if (this.labelProbabilityBucket) {
          this.selectAndPlayBucketLabel();
        } else if (this.hasDelayDetails) {
          // 停在 pauseFrame（由 computeCycleInfo 根据 stop 语义决定），
          // 不再硬编码为 loopEnd，也不再不做二次校验
          this.currentFrame = pauseFrame;
          const delay = this.delayMin + Math.random() * (this.delayMax - this.delayMin);
          this.currentDelayRemaining = delay;
          if (this.currentDelayRemaining > 0) {
            if (this.isVisible) {
              this.draw();
            }
            return;
          } else {
            this.currentFrame = begin;
          }
        } else {
          // 无延迟路径：用取模落到 [begin, loopEnd]（不含 stop 帧）
          this.currentFrame = begin + ((this.currentFrame - begin) % frameCount);
        }
      } else {
        this.currentFrame = loopEnd;
        this.playing = false;
      }
    }

    if (this.isVisible) {
      this.draw();
    }
  }

  private draw() {
    if (this.destroyed) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.ceil(this.bounds.width);
    const height = Math.ceil(this.bounds.height);

    const activeSpriteIndex = this.anim.mainSprite ? -1 : 0;
    const activeSprite = this.anim.mainSprite || this.anim.sprite[0];
    if (!activeSprite || activeSprite.frame.length === 0) return;

    const cycle = this.computeCycleInfo();
    if (!cycle) return;
    const { begin, loopEnd } = cycle;

    let frameToRender = Math.floor(this.currentFrame);
    if (frameToRender > loopEnd) frameToRender = loopEnd;
    if (frameToRender < begin) frameToRender = begin;

    if (frameToRender === this.lastRenderedFrame) return;
    this.lastRenderedFrame = frameToRender;

    ctx.clearRect(0, 0, width, height);

    const baseMatrix: Matrix6 = [1, 0, 0, 1, -this.bounds.x, -this.bounds.y];
    const whiteColor: Color = { r: 1, g: 1, b: 1, a: 1 };

    renderSpriteTree2D(
        ctx,
        this.anim,
        this.textures,
        this.timelines,
        activeSpriteIndex,
        frameToRender,
        baseMatrix,
        whiteColor,
        this.spriteVisible,
    );
  }

  public destroy(): void {
    this.destroyed = true;
    const obs = PamCanvasPlayer.getObserver();
    if (obs) {
      obs.unobserve(this.canvas);
      (this.canvas as any).__player = null;
    }
  }
}