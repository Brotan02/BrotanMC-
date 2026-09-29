import { CHUNK_HEIGHT, CHUNK_SIZE, PAD } from './blocks';
import { generateChunk } from './terrain';
import type { GpuMesh } from './renderer';

export const chunkKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class Chunk {
  readonly blocks: Uint8Array;
  mesh: GpuMesh | null = null;
  dirty = true;
  meshing = false;

  constructor(readonly cx: number, readonly cz: number) {
    this.blocks = generateChunk(cx, cz);
  }
}

export class World {
  private chunks = new Map<number, Chunk>();

  get(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  load(cx: number, cz: number): Chunk {
    const c = new Chunk(cx, cz);
    this.chunks.set(chunkKey(cx, cz), c);
    return c;
  }

  remove(cx: number, cz: number): Chunk | undefined {
    const c = this.get(cx, cz);
    this.chunks.delete(chunkKey(cx, cz));
    return c;
  }

  all(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  get size(): number {
    return this.chunks.size;
  }

  /** Мешить чанк можно только когда загружены 4 соседа (иначе будут лишние грани на стыках). */
  hasNeighbors(cx: number, cz: number): boolean {
    return !!(this.get(cx + 1, cz) && this.get(cx - 1, cz) && this.get(cx, cz + 1) && this.get(cx, cz - 1));
  }

  /** Копия чанка с рамкой в 1 блок из соседей: 18 x H x 18. index = (y * PAD + z) * PAD + x */
  buildPadded(chunk: Chunk): Uint8Array {
    const S = CHUNK_SIZE, H = CHUNK_HEIGHT;
    const out = new Uint8Array(PAD * H * PAD);

    const nb: (Chunk | undefined)[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) nb.push(this.get(chunk.cx + dx, chunk.cz + dz));
    }

    for (let pz = 0; pz < PAD; pz++) {
      const lz = pz - 1;
      const oz = lz < 0 ? 0 : lz >= S ? 2 : 1;
      const bz = (lz + S) % S;
      for (let px = 0; px < PAD; px++) {
        const lx = px - 1;
        const ox = lx < 0 ? 0 : lx >= S ? 2 : 1;
        const bx = (lx + S) % S;
        const src = nb[oz * 3 + ox];
        if (!src) continue;
        for (let y = 0; y < H; y++) {
          out[(y * PAD + pz) * PAD + px] = src.blocks[(y * S + bz) * S + bx];
        }
      }
    }
    return out;
  }
}
