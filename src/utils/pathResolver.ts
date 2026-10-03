import { CONFIG } from './config';

export function toTexturePath(subPath: string, res: number): string {
  // Replace "images/number/" with "images/target_resolution/"
  return subPath.replace(/^images\/\d+\//, `images/${res}/`);
}

export function toJsonPath(subPath: string): string {
  // Animation JSON files always use the CONFIG.animJsonRes (e.g. 768) resolution
  return subPath.replace(/^images\/\d+\//, `images/${CONFIG.animJsonRes}/`);
}

export function toTextureKey(key: string, res: number): string {
  // Keep logic: replace "images/number/" with "images/res/"
  return key.replace(/images\/\d+\//, `images/${res}/`);
}
