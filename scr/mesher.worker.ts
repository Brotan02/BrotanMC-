import { meshChunk } from './mesher';
import type { MeshRequest, MeshResponse } from './mesher';

const ctx = self as unknown as { postMessage(msg: unknown, transfer: Transferable[]): void };

self.onmessage = (e: MessageEvent<MeshRequest>) => {
  const { cx, cz, padded } = e.data;
  const { vertices, indices } = meshChunk(cx, cz, padded);
  const res: MeshResponse = { cx, cz, vertices, indices };
  ctx.postMessage(res, [vertices.buffer, indices.buffer]);
};
