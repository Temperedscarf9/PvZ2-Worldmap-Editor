import { LayerDef } from '../domain/types';

function loadImageFromFile(file: File, tempUrls: string[]): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    tempUrls.push(url);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

export async function composePlantPacket(
  layers: LayerDef[]
): Promise<{ url: string; width: number; height: number }> {
  const tempObjectUrls: string[] = [];
  const loaded: { img: HTMLImageElement; x: number; y: number }[] = [];

  try {
    for (const layer of layers) {
      if (!layer.file) continue;
      const img = await loadImageFromFile(layer.file, tempObjectUrls);
      loaded.push({ img, x: layer.offset?.x ?? 0, y: layer.offset?.y ?? 0 });
    }

    let maxWidth = 0;
    let maxHeight = 0;
    for (const it of loaded) {
      maxWidth = Math.max(maxWidth, it.x + it.img.width);
      maxHeight = Math.max(maxHeight, it.y + it.img.height);
    }

    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = maxHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      for (const it of loaded) {
        ctx.drawImage(it.img, it.x, it.y);
      }
    }

    const resultUrl: string = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob failed'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      });
    });

    tempObjectUrls.forEach((u) => URL.revokeObjectURL(u));
    loaded.length = 0;
    canvas.width = 0;
    canvas.height = 0;

    return { url: resultUrl, width: maxWidth, height: maxHeight };
  } catch (e) {
    tempObjectUrls.forEach((u) => URL.revokeObjectURL(u));
    throw e;
  }
}
