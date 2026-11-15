"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Nube de particulas GPU con forma de llama, agitada por el cursor mediante un campo de fluido simplificado
 * (advección + disipación, sin proyección de presión). Se dibuja dentro de su contenedor, no a pantalla completa.
 */

const VERT_QUAD = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG_SPLAT = `
precision highp float; varying vec2 vUv;
uniform sampler2D tTarget; uniform vec2 uPoint; uniform vec2 uPrev; uniform vec3 uColor; uniform float uRadius; uniform float uAspect;
void main(){
  vec2 p = vUv - uPoint; p.x *= uAspect;
  vec2 d = uPoint - uPrev; d.x *= uAspect;
  float l2 = max(dot(d, d), 1e-8);
  float t = clamp(dot(vUv * vec2(uAspect, 1.0) - uPrev * vec2(uAspect, 1.0), d) / l2, 0.0, 1.0);
  vec2 closest = uPrev * vec2(uAspect, 1.0) + d * t;
  vec2 q = vUv * vec2(uAspect, 1.0) - closest;
  float splat = exp(-dot(q, q) / uRadius);
  gl_FragColor = texture2D(tTarget, vUv) + vec4(uColor * splat, 0.0);
}`;

const FRAG_ADVECT = `
precision highp float; varying vec2 vUv;
uniform sampler2D tVel; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uDt; uniform float uDiss;
void main(){
  vec2 v = texture2D(tVel, vUv).xy;
  vec2 coord = vUv - uDt * v * uTexel;
  gl_FragColor = uDiss * texture2D(tSrc, coord);
}`;

const SDF = `
float sdRoundCone(vec3 p, float r1, float r2, float h){
  float b = (r1 - r2) / h; float a = sqrt(1.0 - b * b);
  vec2 q = vec2(length(p.xz), p.y);
  float k = dot(q, vec2(-b, a));
  if (k < 0.0) return length(q) - r1;
  if (k > a * h) return length(q - vec2(0.0, h)) - r2;
  return dot(q, vec2(a, b)) - r1;
}
float sdfShape(vec3 p){
  vec3 q = p - vec3(0.0, -0.30, 0.0);
  q.x -= 0.20 * pow(max(q.y, 0.0), 2.0);
  float outer = abs(sdRoundCone(q, 0.27, 0.02, 0.78)) - 0.004;
  vec3 r = p - vec3(0.03, -0.30, 0.0);
  r.x -= 0.12 * pow(max(r.y, 0.0), 2.0);
  float inner = abs(sdRoundCone(r, 0.13, 0.01, 0.42)) - 0.004;
  return min(outer, inner);
}
vec3 sdfNormal(vec3 p){
  float e = 0.001;
  return vec3(sdfShape(p + vec3(e, 0.0, 0.0)) - sdfShape(p - vec3(e, 0.0, 0.0)),
              sdfShape(p + vec3(0.0, e, 0.0)) - sdfShape(p - vec3(0.0, e, 0.0)),
              sdfShape(p + vec3(0.0, 0.0, e)) - sdfShape(p - vec3(0.0, 0.0, e)));
}`;

const FRAG_SIM = `
precision highp float; varying vec2 vUv;
uniform sampler2D tPos; uniform sampler2D tOrigin; uniform sampler2D tVel; uniform sampler2D tDen;
uniform float uTime; uniform float uHZ; uniform mat4 uProj; uniform float uStrength;
${SDF}
vec3 pot(vec3 p){
  return vec3(sin(p.y * 3.1 + p.z * 1.7 + uTime * 0.3), sin(p.z * 2.9 + p.x * 2.3 - uTime * 0.2), sin(p.x * 3.3 + p.y * 1.9 + uTime * 0.25));
}
vec3 curl(vec3 p){
  float e = 0.01;
  vec3 dx = pot(p + vec3(e,0,0)) - pot(p - vec3(e,0,0));
  vec3 dy = pot(p + vec3(0,e,0)) - pot(p - vec3(0,e,0));
  vec3 dz = pot(p + vec3(0,0,e)) - pot(p - vec3(0,0,e));
  return normalize(vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) + 1e-5);
}
void main(){
  vec3 pos = texture2D(tPos, vUv).xyz;
  vec3 origin = texture2D(tOrigin, vUv).xyz;
  if (length(pos) > 1.2) pos *= 0.5;
  pos += curl(pos * 1.2 + uTime * 0.05) * 0.0006 * uHZ;
  vec3 g = sdfNormal(pos);
  float sdf = sdfShape(pos);
  vec3 gn = normalize(g + 1e-6);
  pos += cross(normalize(pos + 1e-6), gn) * 0.0008 * uHZ;
  pos += -gn * sdf * 0.5;
  pos += (origin - pos) * 0.0002 * uHZ;
  vec4 clip = uProj * vec4(pos, 1.0);
  vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
  vec2 flow = texture2D(tVel, suv).xy;
  float den = texture2D(tDen, suv).r;
  pos += vec3(flow, 0.0) * 0.00012 * uHZ * uStrength * clamp(den, 0.0, 1.5);
  gl_FragColor = vec4(pos, 1.0);
}`;

const VERT_POINTS = `
uniform sampler2D tPos; uniform float uTime; uniform float uDpr; uniform float uSize;
attribute vec2 ref; attribute vec4 rnd;
varying vec4 vRnd; varying float vScale;
void main(){
  vec3 pos = texture2D(tPos, ref).xyz;
  pos *= mix(1.0, 1.35, pow(rnd.y, 150.0));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float dist = -mv.z;
  vScale = mix(0.5, 1.0, rnd.z);
  gl_PointSize = uSize * uDpr * vScale * (6.0 / dist);
  vRnd = rnd;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG_POINTS = `
precision highp float; varying vec4 vRnd; varying float vScale; uniform float uTime;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  vec3 base = mix(vec3(0.91, 0.34, 0.14), vec3(1.0, 0.51, 0.24), vRnd.x);
  float hot = pow(vRnd.z, 40.0);
  vec3 col = mix(base * (0.45 + 0.35 * vRnd.x), vec3(1.0, 0.85, 0.6), hot);
  float spark = 0.6 + (0.4 + sin(uTime * 3.0 + vRnd.y * 20.0)) * pow(vRnd.z, 8.0) * 1.8;
  float a = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(col * spark, a * 0.9);
}`;

class PingPong {
  a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget;
  constructor(w: number, h: number, type: THREE.TextureDataType, filter: THREE.TextureFilter) {
    const o = { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false } as THREE.RenderTargetOptions;
    this.a = new THREE.WebGLRenderTarget(w, h, o); this.b = new THREE.WebGLRenderTarget(w, h, o);
  }
  get read() { return this.a.texture; }
  swap() { const t = this.a; this.a = this.b; this.b = t; }
  dispose() { this.a.dispose(); this.b.dispose(); }
}

export default function LlamaFondo() {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = caja.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch { return; }
    const gl = renderer.getContext();
    if (!renderer.capabilities.isWebGL2 || !gl.getExtension("EXT_color_buffer_float")) { renderer.dispose(); return; }

    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const movil = window.innerWidth < 760 || window.matchMedia("(pointer: coarse)").matches;
    const N = movil ? 128 : 256;
    const FLU = 128;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });

    // Pasada de pantalla completa
    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quadScene.add(quad);
    const pasada = (mat: THREE.ShaderMaterial, destino: THREE.WebGLRenderTarget) => {
      quad.material = mat; renderer.setRenderTarget(destino); renderer.render(quadScene, quadCam); renderer.setRenderTarget(null);
    };

    // Posiciones iniciales aleatorias
    const total = N * N;
    const dataOrigen = new Float32Array(total * 4);
    for (let i = 0; i < total; i++) {
      let x, y, z;
      do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
      dataOrigen.set([x * 0.6, y * 0.7, z * 0.4, 1], i * 4);
    }
    const origen = new THREE.DataTexture(dataOrigen, N, N, THREE.RGBAFormat, THREE.FloatType);
    origen.needsUpdate = true;
    const posPP = new PingPong(N, N, THREE.FloatType, THREE.NearestFilter);
    const initMat = new THREE.ShaderMaterial({ vertexShader: VERT_QUAD, fragmentShader: `varying vec2 vUv; uniform sampler2D t; void main(){ gl_FragColor = texture2D(t, vUv); }`, uniforms: { t: { value: origen } }, depthTest: false });
    pasada(initMat, posPP.a); pasada(initMat, posPP.b);

    const velPP = new PingPong(FLU, FLU, THREE.HalfFloatType, THREE.LinearFilter);
    const denPP = new PingPong(FLU, FLU, THREE.HalfFloatType, THREE.LinearFilter);

    const matSim = new THREE.ShaderMaterial({
      vertexShader: VERT_QUAD, fragmentShader: FRAG_SIM, depthTest: false,
      uniforms: { tPos: { value: null }, tOrigin: { value: origen }, tVel: { value: null }, tDen: { value: null }, uTime: { value: 0 }, uHZ: { value: 1 }, uProj: { value: new THREE.Matrix4() }, uStrength: { value: 1.0 } },
    });
    const matSplat = new THREE.ShaderMaterial({
      vertexShader: VERT_QUAD, fragmentShader: FRAG_SPLAT, depthTest: false,
      uniforms: { tTarget: { value: null }, uPoint: { value: new THREE.Vector2() }, uPrev: { value: new THREE.Vector2() }, uColor: { value: new THREE.Vector3() }, uRadius: { value: 0.001 }, uAspect: { value: 1 } },
    });
    const matAdvect = new THREE.ShaderMaterial({
      vertexShader: VERT_QUAD, fragmentShader: FRAG_ADVECT, depthTest: false,
      uniforms: { tVel: { value: null }, tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1 / FLU, 1 / FLU) }, uDt: { value: 1 }, uDiss: { value: 0.98 } },
    });

    // Puntos
    const geo = new THREE.BufferGeometry();
    const refs = new Float32Array(total * 2); const rnd = new Float32Array(total * 4);
    for (let i = 0; i < total; i++) {
      refs[i * 2] = ((i % N) + 0.5) / N; refs[i * 2 + 1] = (Math.floor(i / N) + 0.5) / N;
      rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(total * 3), 3));
    geo.setAttribute("ref", new THREE.BufferAttribute(refs, 2));
    geo.setAttribute("rnd", new THREE.BufferAttribute(rnd, 4));
    const matPts = new THREE.ShaderMaterial({
      vertexShader: VERT_POINTS, fragmentShader: FRAG_POINTS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { tPos: { value: null }, uTime: { value: 0 }, uDpr: { value: dpr }, uSize: { value: movil ? 0.075 : 0.05 } },
    });
    const pts = new THREE.Points(geo, matPts);
    pts.frustumCulled = false;
    const grupo = new THREE.Group(); grupo.add(pts); grupo.scale.setScalar(2.9);
    const escena = new THREE.Scene(); escena.add(grupo);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const base = new THREE.Vector3(0, 0, 6);
    cam.position.copy(base);

    const mouse = { x: 0.5, y: 0.5 };
    const ultimo = { x: -1, y: -1, t: 0 };
    let aspecto = 1;

    const medir = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      aspecto = w / h; cam.aspect = aspecto; cam.updateProjectionMatrix();
      const altoVis = 2 * base.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      grupo.position.x = w > 760 ? (altoVis * aspecto) * 0.27 : 0;
      grupo.position.y = 0.05;
      grupo.scale.setScalar(Math.min(2.9, (altoVis * 0.92) / 1.1));
      renderer.domElement.style.opacity = w > 760 ? "1" : "0.55";
    };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(host);

    const splat = (pp: PingPong, x: number, y: number, px: number, py: number, color: THREE.Vector3, radius: number) => {
      matSplat.uniforms.tTarget.value = pp.read;
      matSplat.uniforms.uPoint.value.set(x, y); matSplat.uniforms.uPrev.value.set(px, py);
      matSplat.uniforms.uColor.value.copy(color); matSplat.uniforms.uRadius.value = radius; matSplat.uniforms.uAspect.value = aspecto;
      pasada(matSplat, pp.b); pp.swap();
    };

    const alMover = (ev: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = 1 - (ev.clientY - r.top) / r.height;
      mouse.x = Math.min(Math.max(x, 0), 1); mouse.y = Math.min(Math.max(y, 0), 1);
      if (x < -0.1 || x > 1.1 || y < -0.2 || y > 1.2) { ultimo.x = -1; return; }
      const ahora = performance.now();
      const px = ultimo.x < 0 || ahora - ultimo.t > 50 ? x : ultimo.x;
      const py = ultimo.x < 0 || ahora - ultimo.t > 50 ? y : ultimo.y;
      const dx = (x - px) * r.width, dy = (y - py) * r.height;
      const len = Math.hypot(dx, dy);
      if (len > 0.01) {
        const mult = Math.min(len / 15, 1) * 10;
        const radio = (Math.min(len / 5, 1) * 60 * 0.6) / 200;
        splat(velPP, x, y, px, py, new THREE.Vector3(dx * mult * 0.02, dy * mult * 0.02, 1), radio * radio * 0.6 + 0.0004);
        splat(denPP, x, y, px, py, new THREE.Vector3(1, 1, 1), radio * radio * 0.6 + 0.0004);
      }
      ultimo.x = x; ultimo.y = y; ultimo.t = ahora;
    };
    window.addEventListener("pointermove", alMover);

    let previo = performance.now();
    const delta = () => { const n = performance.now(); const d = (n - previo) / 1000; previo = n; return d; };
    const proj = new THREE.Matrix4();
    const objetivo = new THREE.Vector3();
    let t = 0;

    const paso = (dt: number) => {
      t += dt;
      // Campo de fluido: advectar velocidad y densidad
      matAdvect.uniforms.uDt.value = dt * 60;
      matAdvect.uniforms.tVel.value = velPP.read; matAdvect.uniforms.tSrc.value = velPP.read; matAdvect.uniforms.uDiss.value = 0.97;
      pasada(matAdvect, velPP.b); velPP.swap();
      matAdvect.uniforms.tVel.value = velPP.read; matAdvect.uniforms.tSrc.value = denPP.read; matAdvect.uniforms.uDiss.value = 0.96;
      pasada(matAdvect, denPP.b); denPP.swap();
      // Camara con mirada
      objetivo.set(base.x + (mouse.x * 2 - 1) * -0.4, base.y + (mouse.y * 2 - 1) * 0.5, base.z);
      cam.position.lerp(objetivo, 0.05); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      grupo.updateMatrixWorld();
      proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(grupo.matrixWorld);
      // Simulacion de particulas
      matSim.uniforms.tPos.value = posPP.read; matSim.uniforms.tVel.value = velPP.read; matSim.uniforms.tDen.value = denPP.read;
      matSim.uniforms.uTime.value = t; matSim.uniforms.uHZ.value = dt * 60; matSim.uniforms.uProj.value.copy(proj);
      pasada(matSim, posPP.b); posPP.swap();
    };
    const dibujar = () => {
      matPts.uniforms.tPos.value = posPP.read; matPts.uniforms.uTime.value = t;
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(escena, cam);
    };

    let raf = 0; let visible = true; let activo = true;
    const bucle = () => {
      raf = requestAnimationFrame(bucle);
      if (!visible || document.hidden) { delta(); return; }
      paso(Math.min(delta(), 0.05)); dibujar();
    };
    if (reducido) {
      for (let i = 0; i < 240; i++) paso(1 / 60);
      dibujar();
    } else {
      raf = requestAnimationFrame(bucle);
    }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(host);

    return () => {
      activo = false; void activo;
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      window.removeEventListener("pointermove", alMover);
      posPP.dispose(); velPP.dispose(); denPP.dispose(); origen.dispose(); geo.dispose();
      matSim.dispose(); matSplat.dispose(); matAdvect.dispose(); matPts.dispose(); initMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={caja} className="llama" aria-hidden="true" />;
}
