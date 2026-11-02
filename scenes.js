/* ズーム用シーン: 銀河 → 恒星系 → 惑星。WebGPU で描画し、天体は astro.js で生成する。 */
(function (root) {
'use strict';

// ---------------------------------------------------------------- 数学
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * nf, -1, 0, 0, far * near * nf, 0]);
}
function lookAt(e, c, u) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = nrm(sub(e, c)), x = nrm(crs(u, z)), y = crs(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
const eyeOf = (cam) => [cam.dist * Math.cos(cam.el) * Math.sin(cam.az), cam.dist * Math.sin(cam.el), cam.dist * Math.cos(cam.el) * Math.cos(cam.az)];
function project(vp, p, W, H) { // → CSS px [x, y, w]
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w];
}

// ---------------------------------------------------------------- シェーダー
const BB = /* wgsl */`
fn bbColor(T: f32) -> vec3f {
  let t = clamp(T, 1000.0, 40000.0) / 100.0;
  var red = 1.0; var green = 1.0; var blue = 1.0;
  if (t > 66.0) { red = clamp(1.2929 * pow(t - 60.0, -0.1332047592), 0.0, 1.0); }
  if (t <= 66.0) { green = clamp(0.39008 * log(t) - 0.63184, 0.0, 1.0); }
  else { green = clamp(1.12989 * pow(t - 60.0, -0.0755148492), 0.0, 1.0); }
  if (t < 66.0) { blue = select(clamp(0.5432 * log(t - 10.0) - 1.19625, 0.0, 1.0), 0.0, t <= 19.0); }
  return vec3f(red, green, blue);
}
`;
const GAL_WGSL = BB + /* wgsl */`
struct GU { vp: mat4x4f, a: vec4f, b: vec4f };
@group(0) @binding(0) var<uniform> g: GU;
@group(0) @binding(1) var<storage, read> sA: array<vec4f>;
@group(0) @binding(2) var<storage, read> sB: array<vec4f>;
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) col: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let A = sA[ii]; let B = sB[ii];
  let om = 0.225 / max(A.x, 0.3);
  let w = mix(om, 0.015, B.y * 0.75);
  let th = A.y + w * g.b.x;
  let world = vec3f(A.x * cos(th), A.z, A.x * sin(th)) * g.b.y;
  var clip = g.vp * vec4f(world, 1.0);
  let L = B.x;
  let px = g.a.z * (0.7 + 0.22 * log(1.0 + L));
  clip = vec4f(clip.xy + c * px * 2.0 / g.a.xy * clip.w, clip.z, clip.w);
  var o: VO;
  o.p = clip; o.uv = c;
  o.col = bbColor(A.w) * g.a.w * clamp(0.05 + 0.12 * pow(L, 0.3), 0.0, 1.2);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let d = dot(i.uv, i.uv);
  if (d > 1.0) { discard; }
  return vec4f(i.col * exp(-d * 3.5), 1.0);
}
`;
const SPR_WGSL = /* wgsl */`
struct SU { vp: mat4x4f, a: vec4f };
@group(0) @binding(0) var<uniform> s: SU;
@group(0) @binding(1) var<storage, read> spr: array<vec4f>;
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) light: vec3f, @location(3) kind: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let A = spr[ii * 3u]; let B = spr[ii * 3u + 1u]; let C = spr[ii * 3u + 2u];
  var clip = s.vp * vec4f(A.xyz, 1.0);
  let kind = B.w;
  var pxR = A.w * s.a.z / clip.w;
  if (kind < 0.5) { pxR = max(pxR * 2.4, 18.0); }
  else if (kind < 1.5) { pxR = max(pxR, 5.0); }
  else { pxR = 1.4; }
  clip = vec4f(clip.xy + c * pxR * 2.0 / s.a.xy * clip.w, clip.z, clip.w);
  var o: VO;
  o.p = clip; o.uv = c; o.col = vec4f(B.xyz, C.x); o.light = C.yzw; o.kind = kind;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let d = dot(i.uv, i.uv);
  if (d > 1.0) { discard; }
  if (i.kind < 0.5) {
    let core = exp(-d * 16.0) + 0.35 * exp(-d * 3.0);
    return vec4f(i.col.rgb * core, clamp(core, 0.0, 1.0));
  }
  if (i.kind < 1.5) {
    let n = vec3f(i.uv.x, i.uv.y, sqrt(max(1.0 - d, 0.0)));
    let diff = max(dot(n, normalize(i.light)), 0.0);
    let aa = 1.0 - smoothstep(0.88, 1.0, d);
    return vec4f(i.col.rgb * (0.06 + 0.98 * diff) * aa, aa);
  }
  let a = exp(-d * 2.5) * i.col.a;
  return vec4f(i.col.rgb * a, a);
}
`;
const PLANET_WGSL = /* wgsl */`
struct U { right: vec4f, up: vec4f, fwd: vec4f, light: vec4f, rot0: vec4f, rot1: vec4f, rot2: vec4f,
           p0: vec4f, p1: vec4f, p2: vec4f, p3: vec4f, p4: vec4f };
@group(0) @binding(0) var<uniform> u: U;
struct PO { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> PO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: PO; o.p = vec4f(p[vi], 0.0, 1.0); o.uv = p[vi] * 0.5 + 0.5; return o;
}
fn hash31(p: vec3f) -> f32 { var q = fract(p * 0.1031); q += dot(q, q.zyx + 31.32); return fract((q.x + q.y) * q.z); }
fn noise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  let x0 = mix(mix(hash31(i), hash31(i + vec3f(1.0, 0.0, 0.0)), w.x), mix(hash31(i + vec3f(0.0, 1.0, 0.0)), hash31(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y);
  let x1 = mix(mix(hash31(i + vec3f(0.0, 0.0, 1.0)), hash31(i + vec3f(1.0, 0.0, 1.0)), w.x), mix(hash31(i + vec3f(0.0, 1.0, 1.0)), hash31(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y);
  return mix(x0, x1, w.z);
}
fn fbm3(p: vec3f, oct: i32) -> f32 {
  var s = 0.0; var a = 0.5; var q = p;
  for (var k = 0; k < 8; k++) { if (k >= oct) { break; } s += a * noise3(q); q = q * 2.02 + vec3f(1.7, 9.2, 3.3); a *= 0.5; }
  return s / (1.0 - pow(0.5, f32(oct)));
}
fn starfield(d: vec3f) -> vec3f {
  let q = d * 150.0; let id = floor(q); let f = fract(q) - 0.5;
  let h = hash31(id);
  let s = step(0.988, h) * exp(-dot(f, f) * 70.0) * (0.4 + hash31(id + 7.0));
  return vec3f(s) * vec3f(0.9, 0.95, 1.0);
}
@fragment fn fs(i: PO) -> @location(0) vec4f {
  let asp = u.right.w; let tn = 0.42;
  let uv = i.uv * 2.0 - 1.0;
  let rd = normalize(u.fwd.xyz + u.right.xyz * uv.x * asp * tn + u.up.xyz * uv.y * tn);
  let ro = -u.fwd.xyz * u.up.w;
  let L = normalize(u.light.xyz);
  var col = starfield(rd);
  let b = dot(ro, rd); let c = dot(ro, ro) - 1.0; let disc = b * b - c;
  let kind = i32(u.p0.w + 0.5);
  let atm = u.p1.xyz; let atmD = u.p1.w;
  let tm = u.light.w;
  if (disc > 0.0) {
    let t = -b - sqrt(disc);
    let p = ro + rd * t; let n = p;
    let pb = vec3f(dot(u.rot0.xyz, p), dot(u.rot1.xyz, p), dot(u.rot2.xyz, p));
    let oct = i32(clamp(u.p2.y, 3.0, 8.0));
    let seed = u.p2.x;
    var c0 = vec3f(0.5); var emis = vec3f(0.0); var spec = 0.0;
    let diff = max(dot(n, L), 0.0);
    let lat = abs(pb.y);
    if (kind == 0 || kind == 6) {
      let h = fbm3(pb * 2.2 + seed, oct);
      let sea = select(0.0, u.p0.x, kind == 0);
      var T = u.p2.z + 35.0 * (1.0 - 3.0 * lat * lat);
      T -= 40.0 * max(h - sea, 0.0);
      let m = fbm3(pb * 3.1 + seed * 1.7 + 11.0, 4);
      if (h < sea) {
        let depth = clamp((sea - h) / max(sea, 0.01) * 1.6, 0.0, 1.0);
        c0 = mix(vec3f(0.05, 0.34, 0.5), vec3f(0.01, 0.05, 0.2), depth);
        spec = 1.0;
        c0 = mix(c0, vec3f(0.85, 0.92, 0.98), 1.0 - smoothstep(256.0, 266.0, T));
        if (T < 266.0) { spec = 0.2; }
      } else {
        if (kind == 6) { c0 = mix(vec3f(0.62, 0.34, 0.2), vec3f(0.78, 0.5, 0.3), m) * (0.65 + 0.7 * h); }
        else if (u.p3.w > 0.5) {
          let green = mix(vec3f(0.1, 0.28, 0.07), vec3f(0.26, 0.42, 0.12), m);
          c0 = mix(vec3f(0.7, 0.58, 0.36), green, smoothstep(0.42, 0.56, m));
          c0 = mix(c0, c0 * 0.55, smoothstep(sea + 0.12, sea + 0.3, h));
        } else {
          c0 = mix(vec3f(0.5, 0.36, 0.26), vec3f(0.66, 0.54, 0.4), m) * (0.7 + 0.6 * (h - sea));
        }
        if (kind == 0) { c0 = mix(c0, vec3f(0.95), 1.0 - smoothstep(262.0, 272.0, T)); }
      }
      if (kind == 6) { c0 = mix(c0, vec3f(0.92, 0.94, 0.97), smoothstep(0.86, 0.95, lat)); }
      let cl = fbm3(pb * 2.6 + vec3f(tm * 0.015, 0.0, seed), 5);
      let ca = smoothstep(1.0 - u.p0.z, 1.0 - u.p0.z + 0.18, cl) * step(0.001, u.p0.z);
      c0 = mix(c0, vec3f(1.0), ca * 0.92);
      spec *= (1.0 - ca);
    } else if (kind == 1) {
      let turb = fbm3(pb * vec3f(2.0, 4.0, 2.0) + seed, 5);
      let band = sin(pb.y * 16.0 + turb * 5.0) * 0.5 + 0.5;
      c0 = mix(u.p3.xyz, u.p4.xyz, band) * (0.85 + 0.3 * fbm3(pb * vec3f(5.0, 14.0, 5.0) + seed * 2.0, 4));
    } else if (kind == 2) {
      let h = fbm3(pb * 3.0 + seed, oct);
      let crack = 1.0 - smoothstep(0.0, 0.07, abs(h - 0.5));
      c0 = vec3f(0.06, 0.045, 0.045) * (0.6 + h);
      emis = vec3f(1.0, 0.36, 0.05) * crack * 1.6;
    } else if (kind == 3) {
      let h = fbm3(pb * 3.0 + seed, oct);
      let cr = 1.0 - smoothstep(0.0, 0.03, abs(fbm3(pb * 5.0 + seed, 4) - 0.5));
      c0 = mix(vec3f(0.78, 0.88, 0.96), vec3f(0.55, 0.7, 0.85), h) - vec3f(0.25, 0.15, 0.05) * cr;
    } else if (kind == 4) {
      let h = fbm3(pb * 3.0 + seed, oct);
      let mare = smoothstep(0.45, 0.55, fbm3(pb * 1.3 + seed * 3.0, 3));
      c0 = vec3f(0.34 + 0.3 * h) * mix(1.0, 0.55, mare);
      c0 *= (0.88 + 0.24 * noise3(pb * 40.0));
    } else {
      let sw = fbm3(pb * vec3f(2.0, 3.0, 2.0) + vec3f(tm * 0.01, 0.0, seed), 5);
      c0 = mix(vec3f(0.92, 0.8, 0.5), vec3f(0.72, 0.6, 0.35), sw);
    }
    var lit = c0 * (0.02 + 1.15 * smoothstep(-0.04, 0.55, dot(n, L))) + emis;
    let rv = reflect(-L, n);
    lit += vec3f(1.0, 0.95, 0.85) * spec * pow(max(dot(rv, -rd), 0.0), 70.0) * 0.7 * step(0.0, dot(n, L));
    let fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.6);
    lit += atm * fres * atmD * (0.15 + 0.9 * diff);
    col = lit;
  } else {
    let cp = ro + rd * (-b);
    let d = length(cp);
    let h = d - 1.0;
    if (h > 0.0) {
      let lit = smoothstep(-0.35, 0.5, dot(normalize(cp), L));
      col += atm * exp(-h * 14.0) * atmD * lit * 1.4;
    }
  }
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(0.92));
  return vec4f(col, 1.0);
}
`;

// ---------------------------------------------------------------- 本体
function create(env) {
  const { device, ctx, canvas, format, astro, cosmo } = env;
  const S = { kind: 'cosmos', clock: 0, tCosmic: 0, gal: null, sys: null, pl: null, plIdx: -1, stack: [], labels: [] };
  const cams = {
    galaxy: { az: 0.4, el: 0.95, dist: 2.6, min: 0.04, max: 12 },
    system: { az: 0.3, el: 0.75, dist: 4.4, min: 0.4, max: 40 },
    planet: { az: 0.5, el: 0.25, dist: 4.2, min: 1.015, max: 10 },
  };
  const GS = 1 / 20; // kpc → 表示単位
  let moduleOK = false;
  const mkMod = (code, label) => {
    const m = device.createShaderModule({ code, label });
    m.getCompilationInfo().then((info) => info.messages.forEach((x) => console[x.type === 'error' ? 'error' : 'warn'](label, x.lineNum + ':' + x.linePos, x.message)));
    return m;
  };
  const galMod = mkMod(GAL_WGSL, 'galaxy'), sprMod = mkMod(SPR_WGSL, 'sprites'), plMod = mkMod(PLANET_WGSL, 'planet');
  const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
  const mkLayout = (entries) => { const b = device.createBindGroupLayout({ entries }); return { b, p: device.createPipelineLayout({ bindGroupLayouts: [b] }) }; };
  const galL = mkLayout([{ binding: 0, visibility: V | F, buffer: { type: 'uniform' } }, { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } }, { binding: 2, visibility: V, buffer: { type: 'read-only-storage' } }]);
  const sprL = mkLayout([{ binding: 0, visibility: V | F, buffer: { type: 'uniform' } }, { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } }]);
  const plL = mkLayout([{ binding: 0, visibility: F, buffer: { type: 'uniform' } }]);
  const additive = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
  const premul = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
  const galPipe = device.createRenderPipeline({ layout: galL.p, vertex: { module: galMod, entryPoint: 'vs' }, fragment: { module: galMod, entryPoint: 'fs', targets: [{ format, blend: additive }] } });
  const sprPipe = device.createRenderPipeline({ layout: sprL.p, vertex: { module: sprMod, entryPoint: 'vs' }, fragment: { module: sprMod, entryPoint: 'fs', targets: [{ format, blend: premul }] } });
  const plPipe = device.createRenderPipeline({ layout: plL.p, vertex: { module: plMod, entryPoint: 'vs' }, fragment: { module: plMod, entryPoint: 'fs', targets: [{ format }] } });
  const U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const galU = device.createBuffer({ size: 96, usage: U }), sprU = device.createBuffer({ size: 80, usage: U }), plU = device.createBuffer({ size: 192, usage: U });
  const plBG = device.createBindGroup({ layout: plL.b, entries: [{ binding: 0, resource: { buffer: plU } }] });
  let galBufs = null, galBG = null, sprBuf = null, sprBG = null, sprCap = 0;

  const active = () => S.kind !== 'cosmos';
  const curCam = () => cams[S.kind] || null;
  const fade = (fn) => { const f = document.getElementById('fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 60); }, 220); };
  const clearLabels = () => { env.ui.markers.innerHTML = ''; S.labels = []; };
  function addLabel(text, onclick, cls) {
    const b = document.createElement('button'); b.className = 'mk ' + (cls || ''); b.textContent = text; b.onclick = (e) => { e.stopPropagation(); onclick(); };
    env.ui.markers.appendChild(b); return b;
  }
  function placeLabels(vp, W, H, pts) {
    for (let i = 0; i < S.labels.length; i++) {
      const l = S.labels[i], p = pts[i];
      if (!p) { l.style.display = 'none'; continue; }
      const q = project(vp, p, W, H);
      const ok = q[2] > 0 && q[0] > -50 && q[0] < W + 50 && q[1] > -50 && q[1] < H + 50;
      l.style.display = ok ? '' : 'none';
      if (ok) l.style.transform = `translate(${q[0].toFixed(0)}px, ${q[1].toFixed(0)}px) translate(-50%, 10px)`;
    }
  }

  // ------------------------------------------------------------ 銀河
  function enterGalaxy(halo) {
    const r = astro.rng(halo.seed);
    const gal = astro.galaxyFromHalo(halo.Mh, r, halo.tNow);
    const n = env.coarse ? 60000 : 140000;
    const sts = astro.genStars(gal, n, halo.tNow, r);
    const A = new Float32Array(n * 4), B = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const m = sts.mass[i], L = astro.starL(m), R = astro.starR(m);
      A.set([sts.r[i], sts.th[i], sts.z[i], astro.starT(L, R)], i * 4);
      B.set([L, sts.arm[i], i, 0], i * 4);
    }
    if (galBufs) galBufs.forEach((b) => b.destroy());
    galBufs = [device.createBuffer({ size: A.byteLength, usage: ST }), device.createBuffer({ size: B.byteLength, usage: ST })];
    device.queue.writeBuffer(galBufs[0], 0, A); device.queue.writeBuffer(galBufs[1], 0, B);
    galBG = device.createBindGroup({ layout: galL.b, entries: [{ binding: 0, resource: { buffer: galU } }, { binding: 1, resource: { buffer: galBufs[0] } }, { binding: 2, resource: { buffer: galBufs[1] } }] });
    S.gal = { ...gal, sts, n, A, B, tNow: halo.tNow, rho: halo.rho };
    S.kind = 'galaxy'; S.clock = 0; S.stack = ['cosmos'];
    Object.assign(cams.galaxy, { az: 0.4, el: 0.95, dist: Math.max(1.2, gal.R * GS * 2.4) });
    clearLabels();
    env.onEnter('galaxy');
  }
  const galScale = () => GS;
  function starPos(i, tMyr) {
    const g = S.gal, A = g.A, B = g.B;
    const r = A[i * 4], om = 0.225 / Math.max(r, 0.3), arm = B[i * 4 + 1];
    const w = om + (0.015 - om) * arm * 0.75, th = A[i * 4 + 1] + w * tMyr;
    return [r * Math.cos(th) * GS, A[i * 4 + 2] * GS, r * Math.sin(th) * GS];
  }
  function pickStar(x, y) {
    const g = S.gal, W = canvas.clientWidth, H = canvas.clientHeight, cam = cams.galaxy;
    const vp = mul(perspective(0.9, W / H, 0.005, 100), lookAt(eyeOf(cam), [0, 0, 0], [0, 1, 0]));
    let best = -1, bd = 34 * 34;
    for (let i = 0; i < g.n; i += 1) {
      const q = project(vp, starPos(i, S.clock), W, H);
      if (q[2] <= 0) continue;
      const dx = q[0] - x, dy = q[1] - y, d2 = (dx * dx + dy * dy) / (0.4 + Math.pow(g.B[i * 4], 0.2));
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }
  function enterStarSystem(i) {
    const g = S.gal, r = g.A[i * 4], m = g.sts.mass[i], birth = g.sts.birth[i];
    const spec = { seed: astro.hashSeed(g.seed, i), mass: m, Z: astro.metallicity(g, birth, r), age: g.tNow - birth, name: '恒星 #' + i };
    const sys = astro.makeSystem(spec);
    sys.gal = { type: g.type, r };
    enterSystem(sys, 'galaxy');
  }

  // ------------------------------------------------------------ 恒星系
  const compress = (p) => { const r = Math.hypot(p[0], p[1], p[2]); if (r < 1e-9) return [0, 0, 0]; const f = 0.35 * Math.log(1 + r / 0.2) / r; return [p[0] * f, p[1] * f, p[2] * f]; };
  const planetDispR = (p) => 0.028 + 0.012 * Math.log2(1 + p.radiusE);
  function enterSystem(sys, from) {
    S.sys = sys; S.kind = 'system'; S.clock = 0; S.pl = null;
    if (from && S.stack[S.stack.length - 1] !== from) S.stack.push(from);
    S.orbit = sys.planets.map((p) => astro.orbitPoints(p, 140).map(compress));
    const sq = Math.sqrt(sys.star.L);
    S.hzPts = [0.95 * sq, 1.67 * sq].flatMap((rr) => Array.from({ length: 120 }, (_, k) => { const a = k / 120 * Math.PI * 2; return compress([rr * Math.cos(a), 0, rr * Math.sin(a)]); }));
    const maxA = sys.planets.reduce((m, p) => Math.max(m, p.a * (1 + p.e)), 1);
    cams.system.dist = Math.max(2.2, compress([maxA, 0, 0])[0] * 2.3);
    clearLabels();
    S.labels = sys.planets.map((p, i) => addLabel(p.name, () => enterPlanet(i), 'pl'));
    env.onEnter('system');
  }
  function enterSun() {
    const sys = astro.solarSystem();
    S.stack = ['cosmos']; enterSystem(sys, null);
  }
  function systemFrame(dt, W, H, dpr) {
    const sys = S.sys, cam = cams.system;
    const vp = mul(perspective(0.9, W / H, 0.02, 400), lookAt(eyeOf(cam), [0, 0, 0], [0, 1, 0]));
    const kinds = { rock: [0.55, 0.5, 0.45], gas: [0.85, 0.75, 0.55], icegiant: [0.5, 0.75, 0.9] };
    const colOf = { barren: [0.5, 0.48, 0.45], earthlike: [0.25, 0.5, 0.85], desert: [0.75, 0.45, 0.28], venus: [0.9, 0.78, 0.5], lava: [0.9, 0.3, 0.08], frozen: [0.8, 0.9, 1.0] };
    const list = [];
    const push = (pos, rad, rgb, kind, a, light) => list.push(pos[0], pos[1], pos[2], rad, rgb[0], rgb[1], rgb[2], kind, a, light[0], light[1], light[2]);
    const hzc = [0.2, 0.9, 0.35];
    S.hzPts.forEach((p) => push(p, 0, hzc, 2, 0.28, [0, 0, 0]));
    S.orbit.forEach((pts) => pts.forEach((p) => push(p, 0, [0.55, 0.65, 0.9], 2, 0.45, [0, 0, 0])));
    const ev = eyeOf(cam), ez = Math.hypot(...ev), fwd = [-ev[0] / ez, -ev[1] / ez, -ev[2] / ez];
    const right = (() => { const x = [-fwd[2], 0, fwd[0]], l = Math.hypot(x[0], x[2]) || 1; return [x[0] / l, 0, x[2] / l]; })();
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    const labelPts = [];
    sys.planets.forEach((p, i) => {
      const cp = astro.orbitPos(p, S.clock), d = compress(cp);
      const rgb = sys.planets[i].kind ? (colOf[p.kind] || kinds[p.type] || [0.6, 0.6, 0.6]) : kinds[p.type];
      const col = p.type === 'gas' ? p.tintA : p.type === 'icegiant' ? p.tintA : rgb;
      const lr = Math.hypot(...d) || 1, ldw = [-d[0] / lr, -d[1] / lr, -d[2] / lr];
      const light = [ldw[0] * right[0] + ldw[1] * right[1] + ldw[2] * right[2], ldw[0] * up[0] + ldw[1] * up[1] + ldw[2] * up[2], -(ldw[0] * fwd[0] + ldw[1] * fwd[1] + ldw[2] * fwd[2])];
      push(d, planetDispR(p), col, 1, 1, light);
      labelPts.push(d);
    });
    const sc = astro.blackbody(sys.star.T);
    push([0, 0, 0], 0.07 + 0.03 * Math.log10(1 + sys.star.R), sc, 0, 1, [0, 0, 0]);
    const data = new Float32Array(list), count = data.length / 12;
    if (count > sprCap) { if (sprBuf) sprBuf.destroy(); sprCap = count * 2; sprBuf = device.createBuffer({ size: sprCap * 48, usage: ST }); sprBG = device.createBindGroup({ layout: sprL.b, entries: [{ binding: 0, resource: { buffer: sprU } }, { binding: 1, resource: { buffer: sprBuf } }] }); }
    device.queue.writeBuffer(sprBuf, 0, data);
    const u = new Float32Array(20); u.set(vp, 0); u.set([canvas.width, canvas.height, (canvas.height / 2) / Math.tan(0.45), S.clock], 16);
    device.queue.writeBuffer(sprU, 0, u);
    placeLabels(vp, W, H, labelPts);
    return { count };
  }

  // ------------------------------------------------------------ 惑星
  const KIND_CODE = { earthlike: 0, gas: 1, icegiant: 1, lava: 2, frozen: 3, barren: 4, venus: 5, desert: 6 };
  function enterPlanet(i) {
    S.plIdx = i; S.pl = S.sys.planets[i]; S.kind = 'planet'; S.clock = 0; S.stack.push('system');
    cams.planet.dist = 4.2;
    clearLabels();
    env.onEnter('planet');
  }
  function planetFrame(dt, W, H) {
    const p = S.pl, cam = cams.planet;
    const ev = eyeOf(cam), el = Math.hypot(...ev), fwd = [-ev[0] / el, -ev[1] / el, -ev[2] / el];
    let right = [-fwd[2], 0, fwd[0]]; const rl = Math.hypot(right[0], right[2]) || 1; right = [right[0] / rl, 0, right[2] / rl];
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    const hours = S.clock, phi = hours / p.rotH * Math.PI * 2 * (p.name === '金星' || p.name === '天王星' ? -1 : 1);
    const tl = p.tilt * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(tl), st = Math.sin(tl);
    // body→world = Rz(tilt) * Ry(phi)。 world→body の行 = その列
    const Ry = [[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]], Rz = [[ct, -st, 0], [st, ct, 0], [0, 0, 1]];
    const Wb = [0, 1, 2].map((r) => [0, 1, 2].map((c) => Rz[r][0] * Ry[0][c] + Rz[r][1] * Ry[1][c] + Rz[r][2] * Ry[2][c]));
    const alpha = 0.6 + (hours / 8766 / p.period) * Math.PI * 2;
    const kind = KIND_CODE[p.kind] !== undefined ? KIND_CODE[p.kind] : 4;
    const atmCol = { earthlike: [0.35, 0.6, 1.0, 0.95], venus: [1.0, 0.8, 0.4, 1.0], desert: [0.85, 0.55, 0.4, 0.3], frozen: [0.6, 0.75, 1.0, 0.5], gas: [0.7, 0.8, 1.0, 0.5], icegiant: [0.5, 0.8, 0.95, 0.6], lava: [1.0, 0.45, 0.15, 0.6], barren: [0, 0, 0, 0] }[p.kind] || [0, 0, 0, 0];
    const sea = 0.3 + 0.4 * (p.water || 0);
    const cloud = p.kind === 'earthlike' ? 0.5 : p.kind === 'frozen' ? 0.3 : p.kind === 'desert' ? 0.08 : 0;
    const u = new Float32Array(48);
    u.set([...right, W / H], 0); u.set([...up, cam.dist], 4); u.set([...fwd, 0], 8);
    u.set([Math.cos(alpha), 0.15, Math.sin(alpha), S.clock], 12);
    u.set([Wb[0][0], Wb[1][0], Wb[2][0], 0], 16); u.set([Wb[0][1], Wb[1][1], Wb[2][1], 0], 20); u.set([Wb[0][2], Wb[1][2], Wb[2][2], 0], 24);
    u.set([sea, 0, cloud, kind], 28);
    u.set([atmCol[0], atmCol[1], atmCol[2], atmCol[3]], 32);
    u.set([p.seed || 1, 8.4 - cam.dist * 1.2, p.tsurf || 280, 0], 36);
    u.set([...(p.type === 'rock' ? [0, 0, 0] : p.tintA), p.life ? 1 : 0], 40);
    u.set([...(p.tintB || [0, 0, 0]), 0], 44);
    device.queue.writeBuffer(plU, 0, u);
  }

  // ------------------------------------------------------------ 共通
  function back() {
    const prev = S.stack.pop();
    if (!prev) return;
    fade(() => {
      clearLabels();
      if (prev === 'cosmos') { S.kind = 'cosmos'; env.onEnter('cosmos'); }
      else if (prev === 'galaxy') { S.kind = 'galaxy'; S.sys = null; env.onEnter('galaxy'); }
      else if (prev === 'system') { S.kind = 'system'; S.pl = null; S.labels = S.sys.planets.map((p, i) => addLabel(p.name, () => enterPlanet(i), 'pl')); env.onEnter('system'); }
    });
  }
  function onTap(x, y) {
    if (S.kind === 'galaxy') {
      const i = pickStar(x, y);
      if (i >= 0) fade(() => enterStarSystem(i)); else env.toast('星の近くをタップしてください');
    }
  }
  function speedText(mult) {
    if (S.kind === 'galaxy') return '1秒 = ' + (mult * 10).toFixed(mult >= 10 ? 0 : 1) + '百万年(銀河の回転)';
    if (S.kind === 'system') return '1秒 = ' + (mult * 0.2).toFixed(2) + '年(公転)';
    return '1秒 = ' + (mult * 2).toFixed(1) + '時間(自転)';
  }

  const fmt = (x, d) => (x >= 1e4 || (x < 0.01 && x > 0) ? x.toExponential(d === undefined ? 2 : d).replace('e+', '×10^').replace('e-', '×10^-') : x.toFixed(d === undefined ? 2 : d));
  const KIND_JP = { earthlike: '地球型(液体の水が存在しうる)', frozen: '凍結した世界', desert: '砂漠・乾燥した世界', venus: '厚い大気の灼熱世界(金星型)', lava: '溶岩の世界', barren: '大気のない岩石惑星', gas: 'ガス惑星', icegiant: '氷の巨大惑星' };
  function info() {
    const g = S.gal, sys = S.sys, p = S.pl;
    const crumb = ['宇宙'];
    if (S.kind === 'galaxy') {
      crumb.push('銀河');
      return { crumb, era: '星をタップすると、その恒星系へズームします', big: astro.TYPE_JP[g.type],
        rows: [['ハロー質量(近似)', fmt(g.Mh, 1) + ' M☉'], ['星の総質量(近似)', fmt(g.Mstar, 1) + ' M☉'], ['半径', (g.R).toFixed(1) + ' kpc'], ['宇宙年齢', env.fmtYears(g.tNow * 1e9)], ['表示している星', g.n.toLocaleString() + ' 個(標本)']] };
    }
    if (S.kind === 'system') {
      crumb.push('銀河', '恒星系'); const s = sys.star;
      return { crumb: sys.real ? ['宇宙', '太陽系'] : crumb, era: sys.real ? '実データ(NASA等の値): 惑星をタップ' : '法則+乱数で生成した恒星系: 惑星をタップ', big: sys.name,
        rows: [['恒星', s.spec + '型 ' + Math.round(s.T) + ' K'], ['質量', s.mass.toFixed(2) + ' M☉'], ['光度', fmt(s.L, 2) + ' L☉'], ['年齢/寿命', s.age.toFixed(1) + ' / ' + (s.life > 1e4 ? '>10兆' : s.life.toFixed(1)) + ' Gyr'],
          ['金属量 Z', sys.Z.toFixed(2) + ' Z☉'], ['惑星の数', sys.planets.length + ' 個'], ['ハビタブルゾーン', sys.hz[0].toFixed(2) + '–' + sys.hz[1].toFixed(2) + ' AU']] };
    }
    crumb.push('銀河', '恒星系', p.name);
    return { crumb: sys.real ? ['宇宙', '太陽系', p.name] : crumb, era: (KIND_JP[p.kind] || '') + (p.habitable ? ' ★' : ''), big: p.name,
      rows: [['軌道長半径', p.a.toFixed(3) + ' AU(周期 ' + (p.period < 1 ? (p.period * 365.25).toFixed(1) + ' 日' : p.period.toFixed(2) + ' 年') + ')'], ['質量 / 半径', p.massE.toFixed(2) + ' / ' + p.radiusE.toFixed(2) + ' (地球=1)'],
        ['表面重力', p.g.toFixed(2) + ' g'], ['脱出速度', p.vesc.toFixed(1) + ' km/s'], ['平衡温度', Math.round(p.teq) + ' K'], ['表面温度(推定)', Math.round(p.tsurf) + ' K(' + Math.round(p.tsurf - 273.15) + ' ℃)'],
        ['大気', p.atm ? (p.type === 'rock' ? 'あり' : '厚い(水素・ヘリウム主体)') : 'なし(軽いガスは逃げる)'], ['自転', (p.rotH < 100 ? p.rotH.toFixed(1) + ' 時間' : (p.rotH / 24).toFixed(0) + ' 日') + '、傾き ' + p.tilt.toFixed(0) + '°'],
        ['生命', p.life ? '地球の生命(実際)' : '未判定(第3段階で追加)']] };
  }

  function frame(dtReal, dpr) {
    const dir = env.getDir(), mult = env.getMult();
    if (dir !== 0) {
      if (S.kind === 'galaxy') S.clock += dir * mult * 10 * dtReal;
      else if (S.kind === 'system') S.clock += dir * mult * 0.2 * dtReal;
      else S.clock += dir * mult * 2 * dtReal;
    }
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0.008, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
    if (S.kind === 'galaxy') {
      const cam = cams.galaxy, g = S.gal;
      const vp = mul(perspective(0.9, canvas.width / canvas.height, 0.005, 100), lookAt(eyeOf(cam), [0, 0, 0], [0, 1, 0]));
      const u = new Float32Array(24); u.set(vp, 0);
      u.set([canvas.width, canvas.height, 1.7 * dpr * (env.coarse ? 1.2 : 1), (g.type === 'dwarf' ? 1.6 : 1) * Math.pow(140000 / g.n, 0.4) * env.getExpo()], 16);
      u.set([S.clock, GS, 0, 0], 20);
      device.queue.writeBuffer(galU, 0, u);
      pass.setPipeline(galPipe); pass.setBindGroup(0, galBG); pass.draw(6, g.n);
    } else if (S.kind === 'system') {
      const { count } = systemFrame(dtReal, W, H, dpr);
      pass.setPipeline(sprPipe); pass.setBindGroup(0, sprBG); pass.draw(6, count);
    } else if (S.kind === 'planet') {
      planetFrame(dtReal, W, H);
      pass.setPipeline(plPipe); pass.setBindGroup(0, plBG); pass.draw(3);
    }
    pass.end(); device.queue.submit([enc.finish()]);
    env.setInfo(info());
  }

  return {
    get kind() { return S.kind; }, active, curCam, enterGalaxy, enterSun, back, onTap, frame, speedText,
    canBack: () => S.stack.length > 0, enterPlanet, labelsRef: () => S.labels,
    getSystem: () => S.sys, planetIndex: () => S.plIdx,
    cosmosReturn: () => { S.kind = 'cosmos'; S.stack = []; clearLabels(); },
  };
}
root.Scenes = { create };
})(window);
