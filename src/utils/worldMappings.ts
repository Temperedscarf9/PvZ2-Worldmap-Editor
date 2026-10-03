export const WORLD_TO_RES_DIR: Readonly<Record<string, string>> = Object.freeze({
  iceage: 'Iceage',
});

export const RES_DIR_TO_WORLD: Readonly<Record<string, string>> = Object.freeze({
  Iceage: 'iceage',
});

export const WORLD_TO_PINATA: Readonly<Record<string, string>> = Object.freeze({
  eighties: '80s',
});

export const WORLD_TO_PACKET: Readonly<Record<string, string>> = Object.freeze({
  modern: 'modernday',
  tutorial: 'ready',
});

const makeNameMapper = (map: Record<string, string>) => (worldName: string): string => map[worldName] ?? worldName;

export const getResDirName = makeNameMapper(WORLD_TO_RES_DIR);
export const getPinataName = makeNameMapper(WORLD_TO_PINATA);
export const getPacketName = makeNameMapper(WORLD_TO_PACKET);
