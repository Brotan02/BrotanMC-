import { CHUNK_SIZE } from './blocks';
import { Input } from './input';
import { lookAt, multiply, perspective } from './math';
import type { Vec3 } from './math';
import type { MeshResponse } from './mesher';
import { Renderer } from './renderer';
import { World } from './world';

const RENDER_DISTANCE = 8;   // в чанках
const GEN_PER_FRAME = 2;     // генерация чанков за кадр
const MAX_IN_FLIGHT = 6;     // одновременно мешится чанков в воркерах

interface Wanted { cx: number; cz: number; d2: number }

export class Game {
  private renderer: Renderer;
  private input: Input;
  private world = new World();

  private workers: Worker[];
  private nextWorker = 0;
  private inFlight = 0;

  private pos = { x: 8, y: 60, z: 8 };
  private yaw = Math.PI * 0.75;
  private pitch = -0.5;

  private wanted: Wanted[] = [];
  private lastPcx = NaN;
  private lastPcz = NaN;

  private lastTime = performance.now();
  private hudTimer = 0;
  private frames = 0;
  private fps = 0;

  constructor(canvas: HTMLCanvasElement, private hud: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.renderer.setFog(RENDER_DISTANCE * CHUNK_SIZE * 0.55, RENDER_DISTANCE * CHUNK_SIZE * 0.95);
    this.input = new Input(canvas);

    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<MeshResponse>) => this.onMeshed(e.data);
      return w;
    });
  }

  start() {
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.update(dt);
    this.stream();
    this.render();
    this.updateHud(dt);

    requestAnimationFrame(this.frame);
  };

  // ---------- Движение (пока свободный полёт, физика — следующий этап) ----------
  private update(dt: number) {
    const { dx, dy } = this.input.consumeMouse();
    this.yaw -= dx * 0.0025;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.0025));

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = 0, mz = 0, my = 0;
    const k = this.input;
    if (k.isDown('KeyW')) { mx += fx; mz += fz; }
    if (k.isDown('KeyS')) { mx -= fx; mz -= fz; }
    if (k.isDown('KeyD')) { mx += rx; mz += rz; }
    if (k.isDown('KeyA')) { mx -= rx; mz -= rz; }
    if (k.isDown('Space')) my += 1;
    if (k.isDown('ShiftLeft')) my -= 1;

    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const speed = (k.isDown('ControlLeft') ? 48 : 14) * dt;
    this.pos.x += mx * speed;
    this.pos.z += mz * speed;
    this.pos.y += my * speed;
  }

  // ---------- Стриминг чанков ----------
  private rebuildWanted(pcx: number, pcz: number) {
    const R = RENDER_DISTANCE + 1;
    const list: Wanted[] = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= R * R) list.push({ cx: pcx + dx, cz: pcz + dz, d2 });
      }
    }
    list.sort((a, b) => a.d2 - b.d2);
    this.wanted = list;

    const unloadR2 = (R + 2) * (R + 2);
    for (const c of [...this.world.all()]) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > unloadR2) {
        this.world.remove(c.cx, c.cz);
        if (c.mesh) this.renderer.deleteMesh(c.mesh);
      }
    }
  }

  private stream() {
    const pcx = Math.floor(this.pos.x / CHUNK_SIZE);
    const pcz = Math.floor(this.pos.z / CHUNK_SIZE);
    if (pcx !== this.lastPcx || pcz !== this.lastPcz) {
      this.lastPcx = pcx;
      this.lastPcz = pcz;
      this.rebuildWanted(pcx, pcz);
    }

    // 1) генерация данных (ближайшие первыми)
    let gen = 0;
    for (const w of this.wanted) {
      if (gen >= GEN_PER_FRAME) break;
      if (!this.world.get(w.cx, w.cz)) {
        this.world.load(w.cx, w.cz);
        gen++;
      }
    }

    // 2) отправка на мешинг в воркеры
    const meshR2 = RENDER_DISTANCE * RENDER_DISTANCE;
    for (const w of this.wanted) {
      if (w.d2 > meshR2 || this.inFlight >= MAX_IN_FLIGHT) break;
      const c = this.world.get(w.cx, w.cz);
      if (!c || !c.dirty || c.meshing) continue;
      if (!this.world.hasNeighbors(c.cx, c.cz)) continue;

      c.meshing = true;
      const padded = this.world.buildPadded(c);
      const worker = this.workers[this.nextWorker++ % this.workers.length];
      worker.postMessage({ cx: c.cx, cz: c.cz, padded }, [padded.buffer]);
      this.inFlight++;
    }
  }

  private onMeshed(res: MeshResponse) {
    this.inFlight--;
    const c = this.world.get(res.cx, res.cz);
    if (!c) return; // чанк успели выгрузить
    c.meshing = false;
    c.dirty = false;
    if (c.mesh) { this.renderer.deleteMesh(c.mesh); c.mesh = null; }
    if (res.indices.length > 0) c.mesh = this.renderer.createMesh(res.vertices, res.indices);
  }

  // ---------- Рендер ----------
  private render() {
    const aspect = this.renderer.resize();
    const eye: Vec3 = [this.pos.x, this.pos.y, this.pos.z];
    const cp = Math.cos(this.pitch);
    const forward: Vec3 = [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
    const center: Vec3 = [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]];

    const proj = perspective((70 * Math.PI) / 180, aspect, 0.1, 1000);
    const view = lookAt(eye, center, [0, 1, 0]);
    this.renderer.begin(multiply(proj, view), eye);

    for (const c of this.world.all()) {
      if (c.mesh) this.renderer.draw(c.mesh);
    }
  }

  private updateHud(dt: number) {
    this.frames++;
    this.hudTimer += dt;
    if (this.hudTimer < 0.5) return;
    this.fps = Math.round(this.frames / this.hudTimer);
    this.frames = 0;
    this.hudTimer = 0;

    let meshed = 0;
    for (const c of this.world.all()) if (c.mesh) meshed++;
    const p = this.pos;
    this.hud.textContent =
      `${this.fps} FPS\n` +
      `XYZ: ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
      `Чанки: ${this.world.size} (мешей: ${meshed}, в очереди: ${this.inFlight})\n` +
      (this.input.locked
        ? 'WASD — движение, Space/Shift — вверх/вниз, Ctrl — быстрее, Esc — отпустить мышь'
        : 'Кликни по экрану, чтобы захватить мышь');
  }
}
