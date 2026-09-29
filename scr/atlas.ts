import { ATLAS_PX, ATLAS_TILES, Tile } from './blocks';

const TILE_PX = ATLAS_PX / ATLAS_TILES;
type RGB = [number, number, number];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Процедурно генерирует атлас текстур (никаких ассетов Mojang).
 * Позже можно заменить на загрузку своего PNG или ресурспака.
 */
export function createAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(1337);

  const paint = (
    tile: number,
    base: RGB,
    variance: number,
    override?: (x: number, y: number) => RGB | null,
  ) => {
    const ox = (tile % ATLAS_TILES) * TILE_PX;
    const oy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const c = override?.(x, y) ?? base;
        const n = (rand() - 0.5) * variance;
        ctx.fillStyle = `rgb(${clamp(c[0] + n)},${clamp(c[1] + n)},${clamp(c[2] + n)})`;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  };

  const GRASS: RGB = [96, 160, 64];
  const DIRT: RGB = [134, 96, 67];

  paint(Tile.GrassTop, GRASS, 28);
  paint(Tile.Dirt, DIRT, 24);
  paint(Tile.GrassSide, DIRT, 24, (x, y) => (y < 3 + ((x * 7) % 3) ? GRASS : null));
  paint(Tile.Stone, [125, 125, 125], 30);
  paint(Tile.Sand, [219, 207, 163], 16);

  return canvas;
}
