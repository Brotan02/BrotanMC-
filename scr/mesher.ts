import { ATLAS_TILES, BLOCK_TILES, CHUNK_HEIGHT, CHUNK_SIZE, PAD } from './blocks';

export interface MeshRequest {
  cx: number;
  cz: number;
  padded: Uint8Array;
}
export interface MeshResponse {
  cx: number;
  cz: number;
  vertices: Float32Array; // на вершину: x y z u v shade (6 float)
  indices: Uint32Array;
}

interface Face {
  n: [number, number, number];
  corners: number[][]; // порядок: левый-нижний, правый-нижний, правый-верхний, левый-верхний (CCW снаружи)
  shade: number;
  tile: 0 | 1 | 2; // 0 = верх, 1 = низ, 2 = бок
}

const FACES: Face[] = [
  { n: [1, 0, 0], shade: 0.6, tile: 2, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], shade: 0.6, tile: 2, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], shade: 1.0, tile: 0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], shade: 0.5, tile: 1, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], shade: 0.8, tile: 2, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], shade: 0.8, tile: 2, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const T = 1 / ATLAS_TILES;
const EPS = 0.0005;

/** Наивный мешинг: по 2 треугольника на каждую видимую грань. Greedy meshing — следующий шаг. */
export function meshChunk(cx: number, cz: number, padded: Uint8Array): { vertices: Float32Array; indices: Uint32Array } {
  const H = CHUNK_HEIGHT, S = CHUNK_SIZE;
  const verts: number[] = [];
  const idx: number[] = [];
  const ox = cx * S, oz = cz * S;
  let vc = 0;

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const b = padded[(y * PAD + z + 1) * PAD + x + 1];
        if (b === 0) continue;
        const tiles = BLOCK_TILES[b];
        if (!tiles) continue;

        for (const f of FACES) {
          const nx = x + 1 + f.n[0];
          const ny = y + f.n[1];
          const nz = z + 1 + f.n[2];
          let nbk: number;
          if (ny < 0) nbk = 1;          // под миром — "твёрдое", низ не рисуем
          else if (ny >= H) nbk = 0;    // над миром — воздух
          else nbk = padded[(ny * PAD + nz) * PAD + nx];
          if (nbk !== 0) continue;

          const tile = tiles[f.tile];
          const u0 = (tile % ATLAS_TILES) * T + EPS;
          const v0 = Math.floor(tile / ATLAS_TILES) * T + EPS;
          const u1 = u0 + T - 2 * EPS;
          const v1 = v0 + T - 2 * EPS;
          const us = [u0, u1, u1, u0];
          const vs = [v1, v1, v0, v0];

          for (let i = 0; i < 4; i++) {
            const c = f.corners[i];
            verts.push(ox + x + c[0], y + c[1], oz + z + c[2], us[i], vs[i], f.shade);
          }
          idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
          vc += 4;
        }
      }
    }
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}
