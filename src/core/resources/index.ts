/**
 * The single entry point for reading & caching raw assets out of the uploaded resource pack:
 * object URLs, decoded ImageBitmaps, and parsed+textured PAM animations. Each cache below
 * follows the same shape - Map<key, Promise<V>> (or plain V for the sync ObjectURL cache) with
 * a matching clear*Cache() that releases the underlying browser resource before dropping it -
 * so callers never touch File/Image/Blob lifetimes directly.
 *
 * find.ts / packet.ts / manifest.ts hold more specialized resource concerns and are re-exported
 * here so the rest of the app can keep doing `import { ... } from '.../core/resources'`.
 */
import { Animation } from '../../pam/types';
import { parseAnimation, parseImageFileName } from '../../pam/model';
import { RawAnimFolderData } from '../../domain/types';
import { State } from '../state';
import { clearFindAnimCaches } from './find';

export * from './find';
export * from './packet';
export * from './manifest';

export const animAssetsCache = new Map<
    string,
    Promise<{ animation: Animation; textureMap: Map<string, HTMLImageElement> } | null>
>();
export const imageBitmapCache = new Map<File, Promise<ImageBitmap>>();
export const fileUrlCache = new Map<File, string>();

export function getObjectUrlCached(file: File): string {
  let url = fileUrlCache.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    fileUrlCache.set(file, url);
  }
  return url;
}

export function clearFileUrlCache(): void {
  fileUrlCache.forEach((url) => URL.revokeObjectURL(url));
  fileUrlCache.clear();
}

export function getImageBitmapCached(file: File): Promise<ImageBitmap> {
  let promise = imageBitmapCache.get(file);
  if (!promise) {
    promise = createImageBitmap(file);
    imageBitmapCache.set(file, promise);
  }
  return promise;
}

/** Awaits every pending promise in an async cache and disposes its resolved value, then clears the Map. */
function disposeAsyncCache<V>(cache: Map<unknown, Promise<V>>, dispose: (value: V) => void): void {
  cache.forEach((promise) => {
    promise.then(dispose, () => { /* load already failed, nothing to release */ });
  });
  cache.clear();
}

export function clearImageBitmapCache(): void {
  disposeAsyncCache(imageBitmapCache, (bitmap) => bitmap.close());
}

function releaseTextureMap(textureMap: Map<string, HTMLImageElement> | undefined): void {
  if (!textureMap) return;
  textureMap.forEach((img) => {
    try {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      img.src = '';
    } catch { /* ignore */ }
  });
  textureMap.clear();
}

export function clearAnimAssetsCache(): void {
  disposeAsyncCache(animAssetsCache, (result) => {
    if (result) releaseTextureMap(result.textureMap);
  });
  // find.ts's memoized RawAnimFolderData lookups reference the same File objects; drop them together.
  clearFindAnimCaches();
}

export function compileAnimAssets(
    animData: RawAnimFolderData
): Promise<{ animation: Animation; textureMap: Map<string, HTMLImageElement> } | null> {
  const cacheKey = animData.path;
  let promise = animAssetsCache.get(cacheKey);
  if (promise) return promise;

  promise = (async () => {
    try {
      const jsonText = await animData.json.text();
      const rawData = JSON.parse(jsonText);
      const animation = parseAnimation(rawData);
      const textureMap = new Map<string, HTMLImageElement>();

      const loadImgPromises = animation.image.map(async (imgDef) => {
        const sanitizedName = parseImageFileName(imgDef.name);
        const found = animData.files.find((f) => {
          const name = f.name.replace(/\\/g, '/');
          return name === sanitizedName + '.png' || name.endsWith('/' + sanitizedName + '.png');
        });
        if (found) {
          const imgEl = new Image();
          const p = new Promise<HTMLImageElement>((res, rej) => {
            imgEl.onload = () => res(imgEl);
            imgEl.onerror = rej;
          });
          imgEl.src = getObjectUrlCached(found);
          try {
            const loadedImg = await p;
            textureMap.set(imgDef.name, loadedImg);
          } catch {
            // Ignore
          }
        }
      });

      await Promise.all(loadImgPromises);
      return { animation, textureMap };
    } catch (e) {
      console.error('[Worldmap compileAnimAssets error]', e);
      return null;
    }
  })();

  animAssetsCache.set(cacheKey, promise);
  return promise;
}

let fontLoadedPromise: Promise<void> | null = null;
export function loadCustomFontIfNeeded(): Promise<void> {
  if (fontLoadedPromise) return fontLoadedPromise;

  fontLoadedPromise = (async () => {
    try {
      let fontFile: File | null = null;
      let brianneFontFile: File | null = null;
      if (State.data.globalFiles) {
        for (const key of Object.keys(State.data.globalFiles)) {
          if (key.includes('fbUsv8C5eI.ttf') || key.endsWith('fbUsv8C5eI.ttf')) {
            fontFile = State.data.globalFiles[key];
          }
          if (key.includes('BrianneTod.ttf') || key.endsWith('BrianneTod.ttf')) {
            brianneFontFile = State.data.globalFiles[key];
          }
        }
      }
      if (State.data.indexedFiles) {
        for (const [key, val] of State.data.indexedFiles.entries()) {
          if (!fontFile && (key.includes('fbUsv8C5eI.ttf') || key.endsWith('fbUsv8C5eI.ttf'))) {
            fontFile = val;
          }
          if (!brianneFontFile && (key.includes('BrianneTod.ttf') || key.endsWith('BrianneTod.ttf'))) {
            brianneFontFile = val;
          }
        }
      }

      const fontFaceClass = (window as any).FontFace || (globalThis as any).FontFace;
      if (fontFaceClass) {
        if (fontFile) {
          const url = URL.createObjectURL(fontFile);
          const fontFace = new fontFaceClass('fbUsv8C5eI', `url(${url})`);
          await fontFace.load();
          document.fonts.add(fontFace);
          console.log('[FontLoader] Custom font fbUsv8C5eI loaded successfully');
        } else {
          console.warn('[FontLoader] Custom font fbUsv8C5eI.ttf not found in uploaded files');
        }

        if (brianneFontFile) {
          const url = URL.createObjectURL(brianneFontFile);
          const fontFace = new fontFaceClass('BrianneTod', `url(${url})`);
          await fontFace.load();
          document.fonts.add(fontFace);
          console.log('[FontLoader] Custom font BrianneTod loaded successfully');
        } else {
          console.warn('[FontLoader] Custom font BrianneTod.ttf not found in uploaded files');
        }
      } else {
        console.warn('[FontLoader] FontFace API not supported in this browser');
      }
    } catch (err) {
      console.error('[FontLoader] Failed to load custom font:', err);
    }
  })();

  return fontLoadedPromise;
}
