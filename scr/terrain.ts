import { Block, CHUNK_HEIGHT, CHUNK_SIZE } from './blocks';

const SEED = 1337;
export const SEA_LEVEL = 22;

function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(SEED, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function fbm(x: number, y: number): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < 4; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // 0..1
}

export function terrainHeight(wx: number, wz: number): number {
  const h = Math.floor(18 + fbm(wx / 48, wz / 48) * 26);
  return Math.min(h, CHUNK_HEIGHT - 1);
}

/** Раскладка: index = (y * 16 + z) * 16 + x */
export function generateChunk(cx: number, cz: number): Uint8Array {
  const S = CHUNK_SIZE;
  const blocks = new Uint8Array(S * CHUNK_HEIGHT * S);

  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const h = terrainHeight(cx * S + x, cz * S + z);
      const beach = h <= SEA_LEVEL + 1;
      for (let y = 0; y <= h; y++) {
        let b: number;
        if (y === h) b = beach ? Block.Sand : Block.Grass;
        else if (y > h - 4) b = beach ? Block.Sand : Block.Dirt;
        else b = Block.Stone;
        blocks[(y * S + z) * S + x] = b;
      }
    }
  }
  return blocks;
}
