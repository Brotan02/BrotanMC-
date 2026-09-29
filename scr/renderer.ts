import { createAtlas } from './atlas';
import type { Mat4, Vec3 } from './math';

export interface GpuMesh {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ebo: WebGLBuffer;
  indexCount: number;
}

const VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in float aShade;
uniform mat4 uViewProj;
uniform vec3 uCamPos;
out vec2 vUV;
out float vShade;
out float vDist;
void main() {
  vUV = aUV;
  vShade = aShade;
  vDist = length(aPos - uCamPos);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 vUV;
in float vShade;
in float vDist;
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform vec2 uFog;
out vec4 outColor;
void main() {
  vec3 col = texture(uAtlas, vUV).rgb * vShade;
  float f = clamp((vDist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  outColor = vec4(mix(col, uFogColor, f), 1.0);
}`;

const SKY: Vec3 = [0.53, 0.81, 0.92];

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  return s;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uViewProj: WebGLUniformLocation;
  private uCamPos: WebGLUniformLocation;
  private uFog: WebGLUniformLocation;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('WebGL2 не поддерживается');
    this.gl = gl;

    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
    this.program = p;
    gl.useProgram(p);

    this.uViewProj = gl.getUniformLocation(p, 'uViewProj')!;
    this.uCamPos = gl.getUniformLocation(p, 'uCamPos')!;
    this.uFog = gl.getUniformLocation(p, 'uFog')!;
    gl.uniform3f(gl.getUniformLocation(p, 'uFogColor'), SKY[0], SKY[1], SKY[2]);
    gl.uniform1i(gl.getUniformLocation(p, 'uAtlas'), 0);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createAtlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
  }

  setFog(start: number, end: number) {
    this.gl.uniform2f(this.uFog, start, end);
  }

  /** Подгоняет размер буфера под canvas, возвращает aspect. */
  resize(): number {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    return w / h;
  }

  begin(viewProj: Mat4, camPos: Vec3) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uViewProj, false, viewProj);
    gl.uniform3f(this.uCamPos, camPos[0], camPos[1], camPos[2]);
  }

  createMesh(vertices: Float32Array, indices: Uint32Array): GpuMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const stride = 6 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);

    const ebo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    return { vao, vbo, ebo, indexCount: indices.length };
  }

  draw(mesh: GpuMesh) {
    this.gl.bindVertexArray(mesh.vao);
    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_INT, 0);
  }

  deleteMesh(mesh: GpuMesh) {
    const gl = this.gl;
    gl.deleteVertexArray(mesh.vao);
    gl.deleteBuffer(mesh.vbo);
    gl.deleteBuffer(mesh.ebo);
  }
}
