export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
/** Размер чанка с "рамкой" в 1 блок — нужна мешеру для отсечения граней на стыках. */
export const PAD = CHUNK_SIZE + 2;

export const ATLAS_TILES = 4; // атлас 4x4 тайла
export const ATLAS_PX = 64;   // 64x64 пикселей (тайл 16x16)

export const Block = { Air: 0, Grass: 1, Dirt: 2, Stone: 3, Sand: 4 } as const;
export const Tile = { GrassTop: 0, GrassSide: 1, Dirt: 2, Stone: 3, Sand: 4 } as const;

/** Для каждого блока: [верх, низ, бока] — индексы тайлов в атласе. */
export const BLOCK_TILES: Record<number, readonly [number, number, number]> = {
  [Block.Grass]: [Tile.GrassTop, Tile.Dirt, Tile.GrassSide],
  [Block.Dirt]: [Tile.Dirt, Tile.Dirt, Tile.Dirt],
  [Block.Stone]: [Tile.Stone, Tile.Stone, Tile.Stone],
  [Block.Sand]: [Tile.Sand, Tile.Sand, Tile.Sand],
};
