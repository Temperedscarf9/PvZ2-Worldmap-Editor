import type { Transform, Matrix6, Color, Animation, Sprite, Frame, FrameLabel } from './types';

export function parseImageFileName(value: string): string {
  let result = value;
  const a1 = result.indexOf('(');
  const a2 = result.indexOf(')');
  if (a1 !== -1 || a2 !== -1) {
    result = result.substring(0, a1) + result.substring(a2 + 1);
  }
  const b1 = result.indexOf('$');
  if (b1 !== -1) {
    result = result.substring(b1 + 1);
  }
  const c1 = result.indexOf('[');
  const c2 = result.indexOf(']');
  if (c1 !== -1 || c2 !== -1) {
    result = result.substring(0, c1) + result.substring(c2 + 1);
  }
  const d1 = result.indexOf('|');
  if (d1 !== -1) {
    result = result.substring(0, d1);
  }
  return result;
}

export function parseTransform(list: number[]): Transform {
  switch (list.length) {
    case 2: return { type: 'translate', x: list[0], y: list[1] };
    case 3: return { type: 'rotate_translate', angle: list[0], x: list[1], y: list[2] };
    case 6: return { type: 'matrix_translate', a: list[0], b: list[1], c: list[2], d: list[3], x: list[4], y: list[5] };
    default: throw new Error(`Invalid transform length: ${list.length}`);
  }
}

export function transformToMatrix(t: Transform): Matrix6 {
  switch (t.type) {
    case 'translate':
      return [1, 0, 0, 1, t.x, t.y];
    case 'rotate_translate': {
      const cos = Math.cos(t.angle);
      const sin = Math.sin(t.angle);
      return [cos, sin, -sin, cos, t.x, t.y];
    }
    case 'matrix_translate':
      return [t.a, t.b, t.c, t.d, t.x, t.y];
  }
}

export function multiplyMatrix(p: Matrix6, c: Matrix6): Matrix6 {
  return [
    p[0] * c[0] + p[2] * c[1],
    p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3],
    p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4],
    p[1] * c[4] + p[3] * c[5] + p[5],
  ];
}

export function multiplyColor(parent: Color, child: Color): Color {
  return {
    r: parent.r * child.r,
    g: parent.g * child.g,
    b: parent.b * child.b,
    a: parent.a * child.a,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAnimation(json: any): Animation {
  const parseFrame = (f: any): Frame => ({
    label: f.label ?? null,
    stop: f.stop ?? false,
    command: (f.command ?? []).map((c: [string, string]) => ({ command: c[0], argument: c[1] })),
    remove: (f.remove ?? []).map((r: any) => ({ index: r.index })),
    append: (f.append ?? []).map((a: any) => ({
      index: a.index,
      name: a.name ?? null,
      resource: a.resource,
      sprite: a.sprite,
      additive: a.additive ?? false,
      preloadFrame: a.preload_frame ?? 0,
      timeScale: a.time_scale ?? 1.0,
    })),
    change: (f.change ?? []).map((c: any) => ({
      index: c.index,
      transform: parseTransform(c.transform),
      color: c.color ? (() => {
        // 自动检测范围：如果 RGBA 四个值都 <= 1.0，说明已经是 0~1 的小数，除数因子取 1
        const isNormalized = c.color[0] <= 1.0 && c.color[1] <= 1.0 && c.color[2] <= 1.0 && c.color[3] <= 1.0;
        const factor = isNormalized ? 1 : 255;
        return {
          r: c.color[0] / factor,
          g: c.color[1] / factor,
          b: c.color[2] / factor,
          a: c.color[3] / factor
        };
      })() : null,
      spriteFrameNumber: c.sprite_frame_number ?? null,
      sourceRectangle: c.source_rectangle ?? null,
    })),
  });

  const parseSprite = (s: any): Sprite => ({
    name: s.name ?? null,
    frameRate: s.frame_rate ?? null,
    workArea: s.work_area ? { start: s.work_area[0], duration: s.work_area[1] } : null,
    frame: (s.frame ?? []).map(parseFrame),
  });

  return {
    version: json.version,
    frameRate: json.frame_rate,
    position: json.position,
    size: json.size,
    image: (json.image ?? []).map((img: any) => ({
      name: img.name,
      size: img.size ? { width: img.size[0], height: img.size[1] } : null,
      transform: parseTransform(img.transform),
      _cachedMatrix: transformToMatrix(img.transform)
    })),
    sprite: (json.sprite ?? []).map(parseSprite),
    mainSprite: json.main_sprite ? parseSprite(json.main_sprite) : null,
  };
}

export function parseSpriteFrameLabels(sprite: Sprite): FrameLabel[] {
  const labels: FrameLabel[] = [];
  const pending: { name: string; begin: number }[] = [];
  for (let i = 0; i < sprite.frame.length; i++) {
    const f = sprite.frame[i];
    if (f.label != null) {
      for (const item of pending) {
        labels.push({ name: item.name, begin: item.begin, end: i - 1 });
      }
      pending.length = 0;
      pending.push({ name: f.label, begin: i });
    }
    if (f.stop) {
      for (const item of pending) {
        labels.push({ name: item.name, begin: item.begin, end: i });
      }
      pending.length = 0;
    }
  }
  for (const item of pending) {
    labels.push({ name: item.name, begin: item.begin, end: sprite.frame.length - 1 });
  }
  return labels;
}
