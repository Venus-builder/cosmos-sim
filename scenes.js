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
const fwdOf = (cam) => [Math.cos(cam.el) * Math.sin(cam.az), Math.sin(cam.el), Math.cos(cam.el) * Math.cos(cam.az)];
// 自由飛行のときは、カメラの位置と向きをそのまま使う。ふだんは原点を見る回り込み
const viewOf = (cam) => { if (cam.fly) { const f = fwdOf(cam); return [cam.pos, [cam.pos[0] + f[0], cam.pos[1] + f[1], cam.pos[2] + f[2]]]; } return [eyeOf(cam), [0, 0, 0]]; };
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
  let s = step(0.975, h) * exp(-dot(f, f) * 70.0) * (0.4 + hash31(id + 7.0));
  return vec3f(s) * vec3f(2.2, 2.35, 2.8);
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
          let green = mix(u.p3.xyz, u.p4.xyz, m);
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

const SURF_WGSL = /* wgsl */`
struct U { f: vec4f, r: vec4f, u: vec4f, L: vec4f, s0: vec4f, eb: vec4f, nb: vec4f, w: vec4f, atm: vec4f, sc: vec4f, m: vec4f, z: vec4f, y: vec4f };
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
  var s = 0.0; var a = 0.5; var q = p; var norm = 0.0;
  for (var k = 0; k < 8; k++) { if (k >= oct) { break; } s += a * noise3(q); norm += a; q = q * 2.02 + vec3f(1.7, 9.2, 3.3); a *= 0.5; }
  return s / max(norm, 0.001);
}
fn starfield(d: vec3f) -> vec3f {
  let q = d * 150.0; let id = floor(q); let f = fract(q) - 0.5;
  let h = hash31(id);
  let s = step(0.975, h) * exp(-dot(f, f) * 70.0) * (0.4 + hash31(id + 7.0));
  return vec3f(s) * vec3f(0.9, 0.95, 1.0);
}
// xz: 着陸点からの東・北方向のずれ[km]。大域の地形値(惑星全体の見た目と同じ式)
fn macroDir(xz: vec2f) -> vec3f {
  return normalize(u.s0.xyz + (u.eb.xyz * xz.x + u.nb.xyz * xz.y) / u.s0.w);
}
fn macroH(xz: vec2f) -> f32 { return fbm3(macroDir(xz) * 2.2 + u.w.z, 4); }
fn macroM(xz: vec2f) -> f32 { return fbm3(macroDir(xz) * 3.1 + u.w.z * 1.7 + 11.0, 4); }
fn elevAt(xz: vec2f, oct: i32) -> f32 {
  let h = macroH(xz);
  let land = max(h - u.nb.w, 0.0);
  var e = land * u.eb.w;
  let wgt = smoothstep(0.0, 0.02, land);
  let dn = fbm3(vec3f(xz * 0.35, u.w.z), oct) - 0.5;
  e += dn * 0.9 * (0.12 + min(land * 5.0, 1.0)) * wgt;
  return max(e, 0.0);
}
fn gH(q: vec2f, oct: i32) -> f32 { return elevAt(u.w.xy + q, oct) - dot(q, q) / (2.0 * u.s0.w); }

fn skyCol(rd: vec3f, Ls: vec3f, withDisk: bool) -> vec3f {
  let atm = u.atm.xyz; let atmD = u.atm.w;
  let sel = Ls.y;
  let day = smoothstep(-0.14, 0.18, sel);
  let hor = pow(1.0 - clamp(rd.y, 0.0, 1.0), 3.0);
  var c = vec3f(0.0);
  let mu = max(dot(rd, Ls), 0.0);
  if (atmD > 0.0) {
    let zen = atm * atmD * 0.55;
    let hz = mix(atm, vec3f(0.9, 0.9, 0.95), 0.45) * atmD * 0.95;
    c = mix(zen, hz, hor) * day;
    let warm = mix(vec3f(1.0, 0.5, 0.22), vec3f(1.0, 0.95, 0.85), smoothstep(0.0, 0.4, sel));
    c += warm * pow(mu, 6.0) * 0.28 * atmD * smoothstep(-0.25, 0.05, sel);
    c += vec3f(1.0, 0.42, 0.18) * exp(-abs(sel) * 7.0) * hor * 0.55 * atmD * (0.4 + 0.6 * mu * mu);
  }
  let vis = clamp(1.0 - atmD * day * 1.15, 0.0, 1.0);
  c += starfield(rd) * vis;
  if (u.y.y > 0.01 && rd.y > 0.01) { // 雲: 高い所にある平らな層を、視線との交点で見る
    let cuv = rd.xz / (rd.y + 0.12) * 1.3 + vec2f(u.L.w * 0.004, u.L.w * 0.0015);
    let cl = smoothstep(0.62 - 0.3 * u.y.y, 0.82 - 0.3 * u.y.y, fbm3(vec3f(cuv, 4.0), 4)) * smoothstep(0.01, 0.16, rd.y);
    let lit = mix(vec3f(0.035, 0.04, 0.06), mix(vec3f(1.0, 0.62, 0.42), vec3f(1.0), smoothstep(0.0, 0.35, sel)), day);
    c = mix(c, lit * (0.75 + 0.25 * fbm3(vec3f(cuv * 3.0, 9.0), 3)), cl * 0.85);
  }
  if (withDisk) {
    let ang = acos(clamp(dot(rd, Ls), -1.0, 1.0));
    let hs = u.sc.w;
    let tint = mix(vec3f(1.0), mix(vec3f(1.0, 0.4, 0.15), vec3f(1.0), smoothstep(0.0, 0.3, sel)), min(atmD, 1.0));
    c += u.sc.xyz * tint * 14.0 * (1.0 - smoothstep(hs * 0.92, hs * 1.08, ang));
  }
  return c;
}

struct FO { @location(0) col: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs(i: PO) -> FO {
  let uv = i.uv * 2.0 - 1.0;
  let rd = normalize(u.f.xyz + u.r.xyz * uv.x * u.f.w * u.r.w + u.u.xyz * uv.y * u.r.w);
  let Ls = normalize(u.L.xyz);
  let atmD = u.atm.w;
  let kind = i32(u.w.w + 0.5);
  let E0 = u.y.z; // 足元の標高(CPU で計算した値。立体物の高さと必ず一致させるため)
  var depth = 1.0;
  let ro = vec3f(0.0, u.u.w, 0.0);
  var col = skyCol(rd, Ls, true);
  var t = 0.0006; var tp = 0.0; var hit = false;
  let ymax = u.eb.w * 0.8 + 2.0;
  if (rd.y < 0.5) {
    let maxK = select(96, 36, rd.y > 0.12);
    for (var k = 0; k < 96; k++) {
      if (k >= maxK) { break; }
      let p = ro + rd * t;
      let lod = i32(clamp(log2(max(t, 0.35) / 0.35) * 0.6, 0.0, 3.0));
      let d = p.y - (gH(p.xz, 5 - lod) - E0);
      if (d < 0.0) { hit = true; break; }
      if (p.y > ymax && rd.y > 0.0) { break; }
      tp = t;
      t += max(d * 0.7, 0.03 * t + 0.0006);
      if (t > 200.0) { break; }
    }
  }
  if (hit) {
    var a = tp; var b = t;
    let lod0 = i32(clamp(log2(max(t, 0.35) / 0.35) * 0.6, 0.0, 3.0));
    let oct = 5 - lod0;
    for (var k = 0; k < 6; k++) {
      let m = 0.5 * (a + b); let p = ro + rd * m;
      if (p.y - (gH(p.xz, oct) - E0) < 0.0) { b = m; } else { a = m; }
    }
    t = b;
    depth = 1.0 - 0.0003 / max(t * dot(rd, u.f.xyz), 0.0003);
    let p = ro + rd * t; let q = p.xz;
    let eps = max(0.0004, 0.002 * t);
    let gx = gH(q + vec2f(eps, 0.0), oct) - gH(q - vec2f(eps, 0.0), oct);
    let gz = gH(q + vec2f(0.0, eps), oct) - gH(q - vec2f(0.0, eps), oct);
    var n = normalize(vec3f(-gx, 2.0 * eps, -gz));
    let xzW = u.w.xy + q;
    let h = macroH(xzW);
    let mo = macroM(xzW);
    let el = elevAt(xzW, oct);
    let near = 1.0 - smoothstep(0.05, 1.5, t);
    let micro = noise3(vec3f(xzW * 90.0, 1.0));
    let micro2 = noise3(vec3f(xzW * 12.0, 3.0));
    n = normalize(n + vec3f(micro - 0.5, 0.0, micro2 - 0.5) * 0.35 * near);
    let T = u.m.x + 35.0 * (1.0 - 3.0 * u.z.x * u.z.x) - 6.5 * el;
    let day = smoothstep(-0.12, 0.12, Ls.y);
    var alb = vec3f(0.5); var emis = vec3f(0.0);
    var water = u.m.z > 0.5 && h < u.nb.w && T >= 268.0;
    var lit = vec3f(0.0);
    if (water) {
      let wv = vec2f(noise3(vec3f(xzW * 25.0, u.L.w * 0.6)), noise3(vec3f(xzW * 25.0 + 7.0, u.L.w * 0.6 + 3.0))) - 0.5;
      let wn = normalize(vec3f(wv.x * 0.2, 1.0, wv.y * 0.2));
      let fres = 0.03 + 0.97 * pow(1.0 - max(dot(wn, -rd), 0.0), 5.0);
      let rr = reflect(rd, wn);
      let refl = skyCol(vec3f(rr.x, abs(rr.y), rr.z), Ls, true);
      let depth = clamp((u.nb.w - h) * 7.0, 0.0, 1.0);
      let wcol = mix(vec3f(0.05, 0.34, 0.5), vec3f(0.01, 0.06, 0.2), depth);
      lit = wcol * (0.05 + 0.9 * max(Ls.y, 0.0)) * day + refl * fres;
    } else {
      if (u.m.z > 0.5 && h < u.nb.w) { alb = vec3f(0.85, 0.92, 0.98); }
      else if (kind == 0) {
        if (u.m.y > 0.5) {
          let green = mix(u.z.yzw, min(u.z.yzw * 1.55 + vec3f(0.02), vec3f(1.0)), mo);
          alb = mix(vec3f(0.7, 0.58, 0.36), green, smoothstep(0.42, 0.56, mo));
          alb = mix(alb, alb * 0.55, smoothstep(0.12, 0.3, h - u.nb.w));
        } else { alb = mix(vec3f(0.5, 0.36, 0.26), vec3f(0.66, 0.54, 0.4), mo); }
        alb *= 0.82 + 0.36 * micro;
        alb = mix(alb, vec3f(0.95), 1.0 - smoothstep(262.0, 272.0, T));
      }
      else if (kind == 6) { alb = mix(vec3f(0.62, 0.34, 0.2), vec3f(0.78, 0.5, 0.3), mo) * (0.8 + 0.4 * micro2) * (0.9 + 0.2 * micro); }
      else if (kind == 2) {
        alb = vec3f(0.06, 0.045, 0.045) * (0.6 + h) * (0.8 + 0.4 * micro);
        let crack = 1.0 - smoothstep(0.0, 0.07, abs(fbm3(vec3f(xzW * 1.2, u.w.z), 4) - 0.5));
        emis = vec3f(1.0, 0.36, 0.05) * crack * 1.8;
      }
      else if (kind == 3) { alb = mix(vec3f(0.78, 0.88, 0.96), vec3f(0.55, 0.7, 0.85), h) * (0.9 + 0.2 * micro); }
      else if (kind == 5) { alb = vec3f(0.5, 0.32, 0.2) * (0.7 + 0.5 * micro2); }
      else { alb = vec3f(0.34 + 0.3 * h) * (0.8 + 0.35 * micro) * mix(1.0, 0.6, smoothstep(0.45, 0.55, fbm3(vec3f(xzW * 0.5, u.w.z), 3))); }
      let lvlU = i32(u.y.x + 0.5);
      if (lvlU >= 1) { // 文明の段階に応じた道: 主要な道(間隔が広い)と、町の中の細かい道
        let w2 = xzW + (vec2f(noise3(vec3f(xzW * 1.3, 7.0)), noise3(vec3f(xzW * 1.3 + 4.0, 8.0))) - 0.5) * 0.12;
        let town = smoothstep(0.5, 0.62, noise3(vec3f(xzW * 0.8, 11.0)));
        let g1 = abs(fract(w2 / 1.1 + 0.5) - 0.5) * 1.1; let g2 = abs(fract(w2 / 0.11 + 0.5) - 0.5) * 0.11;
        let rw1 = select(0.0016, 0.004, lvlU >= 3); let rw2 = select(0.0, select(0.0022, 0.0035, lvlU >= 3), lvlU >= 2);
        let r1 = 1.0 - smoothstep(rw1 * 0.7, rw1, min(g1.x, g1.y));
        let r2 = (1.0 - smoothstep(rw2 * 0.7, rw2 + 0.0001, min(g2.x, g2.y))) * town * select(0.0, 1.0, lvlU >= 2);
        let road = max(r1, r2);
        let rc = select(vec3f(0.5, 0.42, 0.3), vec3f(0.13, 0.13, 0.14), lvlU >= 3);
        alb = mix(alb, rc, road * 0.92);
      }
      let ext = select(1.0, smoothstep(-0.03, 0.14, Ls.y), atmD > 0.0);
      let tint = mix(vec3f(1.0), mix(vec3f(1.0, 0.5, 0.25), vec3f(1.0), smoothstep(0.0, 0.3, Ls.y)), min(atmD, 1.0));
      var shadow = 1.0;
      if (Ls.y > 0.0 && t < 8.0) {
        var ts = 0.004 + 0.01 * t;
        for (var k = 0; k < 10; k++) {
          let ps = p + Ls * ts;
          let dh = ps.y - (gH(ps.xz, oct) - E0);
          shadow = min(shadow, clamp(0.5 + dh / (0.08 * ts), 0.0, 1.0));
          if (shadow < 0.02) { break; }
          ts *= 1.7;
        }
      }
      let direct = max(dot(n, Ls), 0.0) * smoothstep(-0.02, 0.05, Ls.y) * ext * shadow;
      let amb = (u.atm.xyz * atmD * 0.35 + 0.012) * day + vec3f(0.022, 0.027, 0.04);
      lit = alb * (u.sc.xyz * tint * 1.25 * direct + amb * (0.55 + 0.45 * n.y)) + emis;
    }
    let fogDen = (0.05 + select(0.0, 0.5, kind == 5)) * atmD;
    let fa = 1.0 - exp(-t * fogDen);
    let fogC = skyCol(normalize(vec3f(rd.x, max(rd.y, 0.0) * 0.15, rd.z)), Ls, false);
    col = mix(lit, fogC, fa);
  }
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(0.92));
  var o: FO; o.col = vec4f(col, 1.0); o.depth = depth; return o;
}

@group(0) @binding(1) var<storage, read> cr: array<vec4f>;
// 立体物: 箱・球・円すいの組み合わせで、建物・木・動物・人を作る。奥行き(深度)で地形の向こうは隠れる。
// cr(部品1つにつき4つ): a=(基準の東, 基準の標高, 基準の北, 向き) b=(位置のずれxyz, 回す角度) c=(大きさxyz, 回し方) d=(色, 形*10+材質)
struct MO { @builtin(position) p: vec4f, @location(0) n: vec3f, @location(1) lp: vec3f, @location(2) @interpolate(flat) col: vec4f, @location(3) wp: vec3f, @location(4) ln: vec3f };
@vertex fn vsM(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> MO {
  let a = cr[ii * 4u]; let b = cr[ii * 4u + 1u]; let c = cr[ii * 4u + 2u]; let d = cr[ii * 4u + 3u];
  let prim = i32(d.w / 10.0 + 0.01);
  var v = vec3f(0.0); var n = vec3f(0.0, 1.0, 0.0);
  var qc = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  if (prim == 0) { // 箱(36頂点)
    let face = vi / 6u; let cc = qc[vi % 6u]; let ax = face / 2u; let sg = f32(face % 2u) * 2.0 - 1.0;
    v[ax] = sg; v[(ax + 1u) % 3u] = cc.x; v[(ax + 2u) % 3u] = cc.y;
    n = vec3f(0.0); n[ax] = sg;
  } else if (prim == 1) { // 球(経度10×緯度6 = 360頂点)
    let qd = vi / 6u; let cc = qc[vi % 6u] * 0.5 + 0.5; let iu = f32(qd % 10u); let iv = f32(qd / 10u);
    let th = (iv + cc.y) / 6.0 * 3.14159265; let ph = (iu + cc.x) / 10.0 * 6.2831853;
    v = vec3f(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)); n = v;
  } else { // 円すい(8面: 側面24 + 底面24 = 48頂点)。頂点は上(+1)、底は下(-1)
    let tr = vi / 3u; let k = vi % 3u; let side = tr < 8u; let j = f32(tr % 8u);
    let a0 = j / 8.0 * 6.2831853; let a1 = (j + 1.0) / 8.0 * 6.2831853;
    let p0 = vec3f(cos(a0), -1.0, sin(a0)); let p1 = vec3f(cos(a1), -1.0, sin(a1));
    if (side) { if (k == 0u) { v = vec3f(0.0, 1.0, 0.0); } else if (k == 1u) { v = p0; } else { v = p1; } let am = (a0 + a1) * 0.5; n = normalize(vec3f(cos(am), 0.5, sin(am))); }
    else { if (k == 0u) { v = vec3f(0.0, -1.0, 0.0); } else if (k == 1u) { v = p1; } else { v = p0; } n = vec3f(0.0, -1.0, 0.0); }
  }
  // 回し方: 1=上端を支点にZ軸まわり(脚・腕) 2,3=内側の端を支点にX軸まわり(翼) 4=中心でZ軸まわり(首・尾)
  let mode = i32(c.w + 0.5);
  if (mode == 1) { v.y -= 1.0; } else if (mode == 2) { v.z += 1.0; } else if (mode == 3) { v.z -= 1.0; }
  var l = v * c.xyz; var ln = n / max(c.xyz, vec3f(1e-6));
  let cr2 = cos(b.w); let sr = sin(b.w);
  if (mode == 1 || mode == 4) { l = vec3f(l.x * cr2 - l.y * sr, l.x * sr + l.y * cr2, l.z); ln = vec3f(ln.x * cr2 - ln.y * sr, ln.x * sr + ln.y * cr2, ln.z); }
  else if (mode == 2 || mode == 3) { l = vec3f(l.x, l.y * cr2 - l.z * sr, l.y * sr + l.z * cr2); ln = vec3f(ln.x, ln.y * cr2 - ln.z * sr, ln.y * sr + ln.z * cr2); }
  l += b.xyz;
  // 向き(yaw): 物体の前(+x)が、方位 yaw(北から東回り)を向く
  let sy = sin(a.w); let cy = cos(a.w);
  let X = vec3f(sy, 0.0, cy); let Z = vec3f(cy, 0.0, -sy);
  let q = a.xz - u.w.xy;
  let base = vec3f(q.x, a.y - u.y.z - dot(q, q) / (2.0 * u.s0.w), q.y);
  let wpos = base + X * l.x + vec3f(0.0, l.y, 0.0) + Z * l.z;
  let wn = normalize(X * ln.x + vec3f(0.0, ln.y, 0.0) + Z * ln.z);
  let vv = wpos - vec3f(0.0, u.u.w, 0.0);
  let cz = dot(vv, u.f.xyz); let cx = dot(vv, u.r.xyz); let cyy = dot(vv, u.u.xyz);
  var o: MO;
  o.p = vec4f(cx / (u.f.w * u.r.w), cyy / u.r.w, cz - 0.0003, cz);
  o.n = wn; o.lp = v * c.xyz; o.col = d; o.wp = vv; o.ln = n;
  return o;
}
@fragment fn fsM(i: MO) -> @location(0) vec4f {
  let Ls = normalize(u.L.xyz); let atmD = u.atm.w;
  let prim = floor(i.col.w / 10.0 + 0.01); let mat = i32(i.col.w - prim * 10.0 + 0.5);
  let day = smoothstep(-0.12, 0.12, Ls.y);
  var n = normalize(i.n); var alb = i.col.rgb; var emis = vec3f(0.0);
  let dist = length(i.wp);
  if (mat == 1) { // 建物: 壁に窓を並べる(1階=約3.2m)。夜は一部の窓に明かり
    if (abs(i.ln.y) < 0.5) {
      let hcoord = select(i.lp.x, i.lp.z, abs(i.ln.x) > 0.5) * 1000.0; let vcoord = i.lp.y * 1000.0;
      let cell = vec2f(floor(hcoord / 2.6), floor(vcoord / 3.2));
      let fx = fract(hcoord / 2.6); let fy = fract(vcoord / 3.2);
      let win = step(0.22, fx) * step(fx, 0.78) * step(0.3, fy) * step(fy, 0.8);
      let on = step(0.55, hash31(vec3f(cell, 3.0 + i.col.r * 10.0)));
      alb = mix(alb, vec3f(0.12, 0.16, 0.22), win * 0.85);
      emis = vec3f(1.0, 0.82, 0.5) * win * on * (1.0 - day) * 1.1;
    }
  } else if (mat == 2) { // 葉: むら
    alb *= 0.72 + 0.56 * noise3(i.wp * 900.0 + i.lp * 2000.0);
  } else if (mat == 3) { // 生き物: 腹側を少し明るく
    alb *= 0.85 + 0.25 * clamp(-n.y, 0.0, 1.0) + 0.1 * noise3(i.lp * 9000.0);
  }
  let ext = select(1.0, smoothstep(-0.03, 0.14, Ls.y), atmD > 0.0);
  let tint = mix(vec3f(1.0), mix(vec3f(1.0, 0.5, 0.25), vec3f(1.0), smoothstep(0.0, 0.3, Ls.y)), min(atmD, 1.0));
  let direct = max(dot(n, Ls), 0.0) * smoothstep(-0.02, 0.05, Ls.y) * ext;
  let amb = (u.atm.xyz * atmD * 0.35 + 0.012) * day + vec3f(0.022, 0.027, 0.04);
  var lit = alb * (u.sc.xyz * tint * 1.25 * direct + amb * (0.6 + 0.4 * n.y)) + emis;
  let fa = 1.0 - exp(-dist * (0.05 + select(0.0, 0.5, i32(u.w.w + 0.5) == 5)) * atmD);
  let rd = i.wp / max(dist, 1e-6);
  lit = mix(lit, skyCol(normalize(vec3f(rd.x, max(rd.y, 0.0) * 0.15, rd.z)), Ls, false), fa);
  lit = pow(clamp(lit, vec3f(0.0), vec3f(1.0)), vec3f(0.92));
  return vec4f(lit, 1.0);
}
`;

const OBJ_WGSL = /* wgsl */`
struct U { f: vec4f, r: vec4f, u: vec4f, e: vec4f, p0: vec4f, p1: vec4f, p2: vec4f };
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
  var s = 0.0; var a = 0.5; var q = p; var n = 0.0;
  for (var k = 0; k < 6; k++) { if (k >= oct) { break; } s += a * noise3(q); n += a; q = q * 2.03 + vec3f(1.7, 9.2, 3.3); a *= 0.5; }
  return s / max(n, 0.001);
}
fn starfield(d: vec3f) -> vec3f {
  var c = vec3f(0.0);
  let q = d * 170.0; let id = floor(q); let f = fract(q) - 0.5; let h = hash31(id);
  c += vec3f(step(0.985, h) * exp(-dot(f, f) * 60.0) * (0.35 + hash31(id + 7.0)));
  let q2 = d * 60.0; let id2 = floor(q2); let f2 = fract(q2) - 0.5; let h2 = hash31(id2 + 3.0);
  c += vec3f(1.0, 0.85, 0.7) * step(0.985, h2) * exp(-dot(f2, f2) * 40.0) * 0.8;
  let band = exp(-pow(d.y * 3.0 + 0.2 * sin(d.x * 2.0), 2.0)) * (0.5 + fbm3(d * 4.0, 4));
  c += vec3f(0.12, 0.14, 0.22) * band * 1.15;
  return c;
}
fn bbCol(T: f32) -> vec3f {
  let t = clamp(T, 1000.0, 40000.0) / 100.0;
  var red = 1.0; var green = 1.0; var blue = 1.0;
  if (t > 66.0) { red = clamp(1.2929 * pow(t - 60.0, -0.1332047592), 0.0, 1.0); }
  if (t <= 66.0) { green = clamp(0.39008 * log(t) - 0.63184, 0.0, 1.0); } else { green = clamp(1.12989 * pow(t - 60.0, -0.0755148492), 0.0, 1.0); }
  if (t < 66.0) { blue = select(clamp(0.5432 * log(t - 10.0) - 1.19625, 0.0, 1.0), 0.0, t <= 19.0); }
  return vec3f(red, green, blue);
}

// ブラックホール: シュワルツシルト時空の光の曲がり方(u''=-u+1.5u², 単位は地平線半径)を、画素ごとに数値積分する。
fn blackHole(ro: vec3f, rd: vec3f, jets: bool) -> vec3f {
  let D = length(ro); let e1 = ro / D;
  var nn = cross(ro, rd); let nl = length(nn);
  if (nl < 1e-5) { nn = cross(e1, vec3f(0.0, 1.0, 0.0)); }
  nn = normalize(nn);
  var e2 = cross(nn, e1);
  if (dot(rd, e2) < 0.0) { e2 = -e2; }
  let cosIn = dot(rd, -e1); let sinPsi = sqrt(max(0.0, 1.0 - cosIn * cosIn));
  let b = D * sinPsi / sqrt(max(0.05, 1.0 - 1.0 / D));
  var uu = 1.0 / D;
  let v0 = sqrt(max(0.0, 1.0 / (b * b) - uu * uu * (1.0 - uu)));
  var vv = select(-v0, v0, cosIn >= 0.0);
  var phi = 0.0; var col = vec3f(0.0); var alpha = 0.0; var pprev = ro; var escaped = false; var captured = false;
  let rin = 3.0; let rout = select(16.0, 24.0, jets);
  for (var k = 0; k < 220; k++) {
    let dphi = select(0.03, 0.06, uu < 0.12);
    vv += (-uu + 1.5 * uu * uu) * dphi; uu += vv * dphi; phi += dphi;
    if (uu >= 1.0) { captured = true; break; }
    if (uu <= 0.0005) { escaped = true; break; }
    let rr = 1.0 / uu;
    let p = (cos(phi) * e1 + sin(phi) * e2) * rr;
    if (pprev.y * p.y < 0.0 && alpha < 0.97) {
      let tt = pprev.y / (pprev.y - p.y);
      let pc = mix(pprev, p, tt); let rc = length(pc.xz);
      if (rc > rin && rc < rout) {
        let T0 = 9500.0 * pow(rin / rc, 0.75);
        let vdir = normalize(vec3f(-pc.z, 0.0, pc.x)); let ldir = normalize(pprev - p);
        let beta = min(0.55, sqrt(0.5 / rc)); let g = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(vdir, ldir));
        let ang = atan2(pc.z, pc.x) - u.e.w * 0.9 / pow(rc, 1.5);
        let tex = 0.55 + 0.9 * fbm3(vec3f(rc * 1.6, cos(ang) * 2.2, sin(ang) * 2.2), 4);
        let inten = pow(rin / rc, 1.4) * 1.5 * pow(g, 3.0) * tex * (1.0 - smoothstep(rout * 0.7, rout, rc));
        let a = 0.92;
        col += (1.0 - alpha) * bbCol(T0 * g) * inten * a;
        alpha += (1.0 - alpha) * a;
      }
    }
    pprev = p;
  }
  if (escaped) {
    let dOut = normalize(-sin(phi) * e1 + cos(phi) * e2);
    col += (1.0 - alpha) * starfield(dOut);
  }
  // 光子リング(光が何周もしてから届く細い輪)
  let ring = exp(-pow((b - 2.598) / 0.045, 2.0));
  if (!captured || ring > 0.01) { col += vec3f(1.0, 0.8, 0.5) * ring * 0.45 * (1.0 - alpha * 0.5); }
  if (jets) { // 銀河中心の巨大ブラックホール: 上下に細く伸びるジェット(曲がりは無視)
    for (var s = 0; s < 28; s++) {
      let t = 6.0 + f32(s) * 5.0; let p = ro + rd * t;
      let w = 0.9 + 0.05 * abs(p.y); let dens = exp(-pow(length(p.xz) / w, 2.0)) * select(0.0, 1.0, abs(p.y) > 3.5) * exp(-abs(p.y) / 55.0);
      col += vec3f(0.35, 0.55, 1.0) * dens * 0.07;
    }
  }
  return col;
}
fn pulsar(ro: vec3f, rd: vec3f) -> vec3f {
  var col = starfield(rd);
  let b = dot(ro, rd); let c = dot(ro, ro) - 1.0; let disc = b * b - c;
  let w = u.e.w * u.p1.x; let tilt = u.p1.y;
  let m = normalize(vec3f(sin(tilt) * cos(w), cos(tilt), sin(tilt) * sin(w)));
  let dm = dot(rd, m); let den = max(1.0 - dm * dm, 1e-4);
  let s = (dot(ro, m) - dm * dot(ro, rd)) / den;
  let cr = cross(rd, m); let d = abs(dot(cr, ro)) / max(length(cr), 1e-4);
  let width = 0.10 + 0.16 * abs(s);
  var beam = exp(-pow(d / width, 2.0)) * smoothstep(0.9, 1.7, abs(s)) / (1.0 + 0.22 * abs(s));
  col += vec3f(0.5, 0.75, 1.0) * beam * 2.4;
  let cp = ro + rd * (-b); let dc = length(cp);
  col += vec3f(0.25, 0.45, 1.0) * exp(-dc * dc * 0.9) * 0.5;
  if (disc > 0.0) {
    let t = -b - sqrt(disc); let p = ro + rd * t; let n = p;
    let limb = pow(max(dot(n, -rd), 0.0), 0.35);
    col = vec3f(0.75, 0.9, 1.0) * (0.45 + 0.7 * limb) * 0.9;
    let hot = smoothstep(0.6, 1.0, abs(dot(n, m)));
    col += vec3f(0.6, 0.8, 1.0) * hot * 0.8;
  }
  return col;
}
fn whiteDwarf(ro: vec3f, rd: vec3f) -> vec3f {
  var col = starfield(rd);
  let T = u.p1.z;
  let b = dot(ro, rd); let c = dot(ro, ro) - 1.0; let disc = b * b - c;
  let cp = ro + rd * (-b); let dc = length(cp);
  col += bbCol(T) * exp(-(dc - 1.0) * 2.2) * 0.35 * step(1.0, dc);
  if (disc > 0.0) {
    let t = -b - sqrt(disc); let p = ro + rd * t;
    let limb = pow(max(dot(p, -rd), 0.0), 0.5);
    col = bbCol(T) * (0.45 + 0.75 * limb) * 1.5;
  }
  // 伴星(白色矮星のまわりを回る小さな星)
  let ang = u.e.w * 0.5; let cpos = vec3f(cos(ang), 0.15, sin(ang)) * 7.0;
  let cb = dot(cpos - ro, rd); let cd = length(ro + rd * cb - cpos);
  if (cb > 0.0) { col += vec3f(1.0, 0.55, 0.3) * exp(-cd * cd * 8.0) * 1.6; }
  return col;
}
fn nebDens(p: vec3f, sub: i32) -> vec4f {
  let r = length(p); let seed = u.p0.z; var rgb = vec3f(0.0); var dens = 0.0;
  if (sub == 0) {
    let shell = exp(-pow((r - 1.55) / 0.3, 2.0));
    let fil = pow(fbm3(p * 3.2 + seed, 5), 2.4) * 2.6;
    dens = shell * fil;
    let k = fbm3(p * 1.8 + seed + 7.0, 3);
    rgb = mix(vec3f(0.95, 0.22, 0.15), vec3f(0.12, 0.85, 0.75), smoothstep(0.4, 0.6, k));
    if (u.p1.w > 0.5) { rgb += vec3f(0.3, 0.5, 1.0) * exp(-r * r * 4.0) * 0.8; dens += exp(-r * r * 6.0) * 0.6; }
  } else if (sub == 1) {
    let d = fbm3(p * 1.5 + seed, 5) - 0.32 - 0.22 * r;
    dens = max(d, 0.0) * 5.0;
    let k = fbm3(p * 2.4 + seed + 3.0, 3);
    rgb = mix(vec3f(1.0, 0.25, 0.35), vec3f(0.2, 0.7, 0.9), smoothstep(0.45, 0.65, k));
    for (var i = 0; i < 5; i++) { let sp = (vec3f(hash31(vec3f(f32(i), seed, 1.0)), hash31(vec3f(f32(i), seed, 2.0)), hash31(vec3f(f32(i), seed, 3.0))) - 0.5) * 1.8; let dd = length(p - sp); rgb += vec3f(0.7, 0.85, 1.0) * exp(-dd * dd * 40.0) * 1.8; dens += exp(-dd * dd * 40.0) * 0.5; }
  } else {
    let q = vec3f(p.x, p.y * 0.62, p.z); let rq = length(q);
    let shell1 = exp(-pow((rq - 1.05) / 0.16, 2.0)); let shell2 = exp(-pow((rq - 1.5) / 0.22, 2.0)) * 0.6;
    let lobes = exp(-pow(length(p.xz) / 0.5, 2.0)) * smoothstep(0.5, 1.8, abs(p.y)) * exp(-abs(p.y) * 0.6);
    let n = 0.55 + 0.9 * fbm3(p * 3.0 + seed, 4);
    dens = (shell1 + shell2 + lobes * 0.8) * n;
    rgb = mix(vec3f(0.95, 0.25, 0.2), vec3f(0.1, 0.85, 0.8), 1.0 - smoothstep(0.9, 1.3, rq));
    rgb += vec3f(0.9, 0.95, 1.0) * exp(-r * r * 60.0) * 3.0; dens += exp(-r * r * 60.0);
  }
  return vec4f(rgb, dens);
}
fn nebula(ro: vec3f, rd: vec3f) -> vec3f {
  let sub = i32(u.p0.y + 0.5);
  var col = vec3f(0.0); var T = 1.0;
  let b = dot(ro, rd); let c = dot(ro, ro) - 6.5 * u.p2.x * u.p2.x; let disc = b * b - c;
  if (disc > 0.0) {
    let t0 = max(0.0, -b - sqrt(disc)); let t1 = -b + sqrt(disc); let n = 56; let dt = (t1 - t0) / f32(n);
    for (var i = 0; i < 56; i++) {
      let p = ro + rd * (t0 + (f32(i) + 0.5) * dt);
      let d = nebDens(p / u.p2.x, sub);
      col += T * d.rgb * d.w * dt * 1.7 * u.p2.y;
      T *= exp(-d.w * dt * 0.55);
      if (T < 0.02) { break; }
    }
  }
  return col + T * starfield(rd);
}
fn globular(ro: vec3f, rd: vec3f) -> vec3f {
  var col = vec3f(0.0); let seed = u.p0.z;
  let b = dot(ro, rd); let c = dot(ro, ro) - 16.0; let disc = b * b - c;
  if (disc > 0.0) {
    let t0 = max(0.0, -b - sqrt(disc)); let t1 = -b + sqrt(disc); let dt = (t1 - t0) / 48.0;
    for (var i = 0; i < 48; i++) {
      let p = ro + rd * (t0 + (f32(i) + 0.5) * dt); let r2 = dot(p, p);
      let rho = pow(1.0 + r2 / 0.7, -2.5);
      col += vec3f(1.0, 0.85, 0.6) * rho * dt * 0.34;
      let q = p * 11.0; let id = floor(q); let fp = fract(q) - 0.5; let h = hash31(id + seed);
      let star = step(1.0 - 0.5 * rho, h) * exp(-dot(fp, fp) * 26.0);
      let hue = hash31(id + 9.0);
      col += mix(vec3f(1.0, 0.6, 0.35), vec3f(0.85, 0.9, 1.0), step(0.93, hue)) * star * (0.7 + hash31(id + 3.0)) * 0.9;
    }
  }
  return col + starfield(rd) * 0.4;
}
@fragment fn fs(i: PO) -> @location(0) vec4f {
  let uv = i.uv * 2.0 - 1.0;
  let rd = normalize(u.f.xyz + u.r.xyz * uv.x * u.f.w * u.r.w + u.u.xyz * uv.y * u.r.w);
  let ro = u.e.xyz; let kind = i32(u.p0.x + 0.5);
  var col = vec3f(0.0);
  if (kind == 0) { col = blackHole(ro, rd, false); }
  else if (kind == 1) { col = blackHole(ro, rd, true); }
  else if (kind == 2) { col = pulsar(ro, rd); }
  else if (kind == 3) { col = nebula(ro, rd); }
  else if (kind == 4) { col = whiteDwarf(ro, rd); }
  else { col = globular(ro, rd) * (0.3 + 0.7 * u.p2.y); }
  col = 1.0 - exp(-col * 1.25);
  col = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(0.95));
  return vec4f(col, 1.0);
}
`;

// ---------------------------------------------------------------- 本体
function create(env) {
  const { device, ctx, canvas, format, astro, cosmo } = env;
  const S = { kind: 'cosmos', clock: 0, tCosmic: 0, worldYears: 0, gal: null, sys: null, pl: null, plIdx: -1, stack: [], labels: [], ecoWorlds: new Map() };
  const cams = {
    galaxy: { az: 0.4, el: 0.95, dist: 2.6, min: 0.04, max: 12 },
    system: { az: 0.3, el: 0.75, dist: 4.4, min: 0.4, max: 40 },
    planet: { az: 0.5, el: 0.25, dist: 4.2, min: 1.015, max: 10 },
    surface: { az: 0, el: 0.12, dist: 1, min: 0.25, max: 2.2 },
    object: { az: 0.6, el: 0.3, dist: 16, min: 3, max: 150 },
  };
  const GS = 1 / 20; // kpc → 表示単位
  let moduleOK = false;
  const mkMod = (code, label) => {
    const m = device.createShaderModule({ code, label });
    m.getCompilationInfo().then((info) => info.messages.forEach((x) => console[x.type === 'error' ? 'error' : 'warn'](label, x.lineNum + ':' + x.linePos, x.message)));
    return m;
  };
  const galMod = mkMod(GAL_WGSL, 'galaxy'), sprMod = mkMod(SPR_WGSL, 'sprites'), plMod = mkMod(PLANET_WGSL, 'planet'), surfMod = mkMod(SURF_WGSL, 'surface'), objMod = mkMod(OBJ_WGSL, 'object');
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
  const surfPipe = device.createRenderPipeline({ layout: plL.p, vertex: { module: surfMod, entryPoint: 'vs' }, fragment: { module: surfMod, entryPoint: 'fs', targets: [{ format }] }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'always' } });
  const objPipe = device.createRenderPipeline({ layout: plL.p, vertex: { module: objMod, entryPoint: 'vs' }, fragment: { module: objMod, entryPoint: 'fs', targets: [{ format }] } });
  const objU = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const objBG = device.createBindGroup({ layout: plL.b, entries: [{ binding: 0, resource: { buffer: objU } }] });
  const surfCL = mkLayout([{ binding: 0, visibility: V | F, buffer: { type: 'uniform' } }, { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } }]);
  const crPipe = device.createRenderPipeline({ layout: surfCL.p, vertex: { module: surfMod, entryPoint: 'vsM' }, fragment: { module: surfMod, entryPoint: 'fsM', targets: [{ format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' } });
  const U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const galU = device.createBuffer({ size: 96, usage: U }), sprU = device.createBuffer({ size: 80, usage: U }), plU = device.createBuffer({ size: 192, usage: U });
  const plBG = device.createBindGroup({ layout: plL.b, entries: [{ binding: 0, resource: { buffer: plU } }] });
  const surfU = device.createBuffer({ size: 256, usage: U });
  const surfBG = device.createBindGroup({ layout: plL.b, entries: [{ binding: 0, resource: { buffer: surfU } }] });
  const MAXC = 9000, crBuf = device.createBuffer({ size: MAXC * 64, usage: ST }); // 立体の部品の上限
  const crBG = device.createBindGroup({ layout: surfCL.b, entries: [{ binding: 0, resource: { buffer: surfU } }, { binding: 1, resource: { buffer: crBuf } }] });
  let crCount = 0, crN = [0, 0, 0], depthTex = null, depthW = 0, depthH = 0;
  const depthView = () => { if (!depthTex || depthW !== canvas.width || depthH !== canvas.height) { if (depthTex) depthTex.destroy(); depthW = canvas.width; depthH = canvas.height; depthTex = device.createTexture({ size: [depthW, depthH], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT }); } return depthTex.createView(); };
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
    Object.assign(cams.galaxy, { fly: false, az: 0.4, el: 0.95, dist: Math.max(1.2, gal.R * GS * 2.4) });
    clearLabels(); S.gfound = []; S.scanTok = null;
    S.objs = astro.genObjects(gal, halo.tNow, astro.rng(halo.seed ^ 0x2d1f3a));
    addGalaxyLabels();
    env.onEnter('galaxy');
  }
  // 銀河の中で、押しやすい印をつける: 太陽に近い恒星(最大14個)と、生命のいる惑星が見つかった恒星(🌱)
  function addGalaxyLabels() {
    clearLabels();
    const g = S.gal; if (!g) return;
    const r = astro.rng(g.seed ^ 0x3c6ef372), picks = [];
    for (let t = 0; t < 4000 && picks.length < 14; t++) {
      const i = Math.floor(r() * g.n), m = g.sts.mass[i];
      if (m < 0.75 || m > 1.25 || g.tNow - g.sts.birth[i] < 1 || g.A[i * 4] > 9) continue;
      picks.push(i);
    }
    S.gpts = []; S.labels = [];
    for (const f of S.gfound || []) {
      S.gpts.push(f.i);
      S.labels.push(addLabel('🌱 ' + (f.intelligent ? '知的生命' : env.life.STAGE_JP[f.stage].split('(')[0]), () => flyTo(f.i, f.k), 'pl'));
    }
    S.objLab = [];
    for (const o of S.objs || []) {
      S.gpts.push(o); S.objLab.push(S.labels.length);
      S.labels.push(addLabel(astro.OBJ_TYPES[o.type].icon + ' ' + astro.OBJ_TYPES[o.type].jp.split('(')[0], () => fade(() => enterObject(astro.makeObject(o.type, o.seed, o.hint), 'galaxy')), 'obj'));
    }
    // 生命のいる惑星を表示している間は、通常の恒星一覧を隠してラベルの重なりを防ぐ
    if (!(S.gfound && S.gfound.length)) {
      for (const i of picks) {
        const m = g.sts.mass[i], sp = astro.starFromMass(m, Math.max(0.1, g.tNow - g.sts.birth[i])).spec;
        S.gpts.push(i); S.labels.push(addLabel('☆ ' + sp + '型 ' + m.toFixed(1) + 'M☉', () => fade(() => enterStarSystem(i))));
      }
    }
  }
  function objPos(o, tMyr) {
    const om = 0.225 / Math.max(o.r, 0.3), th = o.th + om * tMyr;
    return [o.r * Math.cos(th) * GS, o.z * GS, o.r * Math.sin(th) * GS];
  }
  // ---- 天体の画面(ブラックホール・中性子星・星雲など)
  function enterObject(o, from) {
    S.obj = o; S.kind = 'object'; S.clock = 0; S.objT = 0;
    if (from === 'galaxy') { if (S.stack[S.stack.length - 1] !== 'galaxy') S.stack.push('galaxy'); } else S.stack = ['cosmos'];
    const dist = { 0: 18, 1: 34, 2: 6, 3: 6.5, 4: 7, 5: 9 }[o.kind], c = cams.object;
    Object.assign(c, { az: 0.6, el: o.kind <= 1 ? 0.12 : 0.3, dist, min: o.kind <= 1 ? 3 : 1.6, max: o.kind <= 1 ? 160 : 24 });
    clearLabels(); env.onEnter('object');
  }
  function viewObject(type) { // 宇宙のどこからでも、種類を選んで見に行く
    const seed = astro.hashSeed(env.getSeed ? env.getSeed() : 1, type.length, type.charCodeAt(0));
    const o = astro.makeObject(type, seed, type === 'smbh' ? { mass: 4e6 * Math.pow(10, (seed % 100) / 50) } : null);
    if (S.kind === 'galaxy') { clearLabels(); fade(() => enterObject(o, 'galaxy')); } else fade(() => enterObject(o, 'cosmos'));
  }
  // ---- 天体の時間変化(標準的な式による近似)。T は見はじめてからの経過年数
  const OBJ_RATE = { snr: 200, pn: 300, neb: 2e4, bh: 1e6, smbh: 2e6, ns: 1e4, magnetar: 50, wd: 1e7, gc: 1e8 }; // ×1 のとき、1秒あたりの年数
  const fy = (y) => env.fmtYears(y);
  function objState(o, T) {
    const st = { scale: 1, bright: 1, rows: [['見はじめてからの時間', fy(T)]] };
    if (o.type === 'snr') { // セドフ・テイラー解: 半径 ∝ 年齢^0.4、速さ ∝ 年齢^-0.6
      const age = o.age + T, R = 12 * Math.pow(age / 1e4, 0.4), v = 0.4 * R * 3.086e13 / (age * 3.156e7);
      st.scale = Math.min(2.4, Math.pow(age / o.age, 0.4)); st.bright = Math.max(0.03, Math.pow(o.age / age, 0.7));
      st.rows.push(['いまの年齢', fy(age)], ['いまの殻の半径', R.toFixed(1) + ' パーセク'], ['いまの広がる速さ', Math.round(v) + ' km/s'], ['行く末', age > 1e5 ? '星間ガスに溶けこみ、ほとんど見えない' : '数万〜10万年で星間ガスに溶けこむ']);
    } else if (o.type === 'pn') { // 約20 km/s で広がり、中心星が冷えるにつれて光らなくなる
      const age = o.age + T; st.scale = Math.min(2.4, age / o.age); st.bright = Math.max(0.02, Math.exp(-(age - o.age) / 15000));
      st.rows.push(['いまの年齢', fy(age)], ['いまの広がり', (o.Rpc * 2 * age / o.age).toFixed(2) + ' パーセク'], ['行く末', age > 30000 ? 'ガスは散り、白色矮星だけが残る' : '約2〜3万年でガスが散る']);
    } else if (o.type === 'neb') { // 若い星の光と風で、数百万年かけてガスが吹き払われる
      st.scale = 1 + 0.35 * Math.min(1, T / 4e6); st.bright = Math.max(0.03, Math.exp(-T / 3e6));
      st.rows.push(['行く末', T > 6e6 ? 'ガスは吹き払われ、若い星団が残る' : '数百万年でガスが吹き払われ、星団が残る']);
    } else if (o.type === 'bh' || o.type === 'smbh') { // 降着による成長: 質量 ∝ exp(λ t / 4500万年)。λ はエディントン限界に対する割合
      const lam = o.type === 'smbh' ? 0.1 : 1e-4, M = o.mass * Math.exp(lam * T / 4.5e7), km = 2.953 * M;
      st.rows.push(['いまの質量', (M >= 1e5 ? M.toExponential(2) : M.toFixed(2)) + ' M☉(降着で成長)'], ['いまの地平線の半径', km < 1e6 ? km.toFixed(1) + ' km' : (km / 1.496e8).toFixed(2) + ' AU'], ['降着の強さ', 'エディントン限界の ' + (lam * 100) + '%(仮定)']);
    } else if (o.type === 'ns' || o.type === 'magnetar') { // 磁気双極子放射による減速: P(t) = √(P0² + 2 (B/3.2e19)² t)
      const k = Math.pow(o.B / 3.2e19, 2), P = Math.sqrt(o.P * o.P + 2 * k * T * 3.156e7), Pd = k / P;
      st.P = P; st.rows.push(['いまの自転周期', P < 1 ? (P * 1000).toFixed(2) + ' ミリ秒' : P.toFixed(3) + ' 秒'], ['遅くなる速さ', Pd.toExponential(1) + ' 秒/秒'], ['特性年齢', fy(P / (2 * Pd) / 3.156e7)], ['行く末', P > 5 && o.type !== 'magnetar' ? '自転が遅くなり、電波が出なくなる(パルサーの死)' : '自転が遅くなると電波が止まる']);
    } else if (o.type === 'wd') { // メステルの冷却則: 光度 ∝ t^-1.4 → 温度 ∝ t^-0.35
      const t0 = 3e7 * Math.pow(25000 / o.T, 2.86), Tn = o.T * Math.pow(1 + T / t0, -0.35);
      st.T = Tn; st.rows.push(['いまの表面温度', Math.round(Tn) + ' K'], ['行く末', '何兆年もかけて冷え、光らない黒色矮星になる(まだ宇宙に存在しない)']);
    } else if (o.type === 'gc') { // 星が少しずつ蒸発して逃げる(緩和時間の数十倍で消える)
      const N = Math.round(o.N * Math.max(0.02, 1 - T / 4e10)); st.bright = Math.max(0.1, N / o.N);
      st.rows.push(['いまの星の数', N.toLocaleString() + ' 個'], ['行く末', '星が少しずつ逃げ、数百億年で散る']);
    }
    return st;
  }
  function objectFrame(dt, W, H) {
    const o = S.obj, cam = cams.object, os = S.objSt = objState(o, S.objT || 0);
    const ev = eyeOf(cam), el = Math.hypot(...ev), fwd = [-ev[0] / el, -ev[1] / el, -ev[2] / el];
    let right = [-fwd[2], 0, fwd[0]]; const rl = Math.hypot(right[0], right[2]) || 1; right = [right[0] / rl, 0, right[2] / rl];
    const up = cross3(right, fwd), t = performance.now() / 1000;
    const omega = o.P ? 2 * Math.PI / Math.min(12, Math.max(1.2, os.P || o.P)) : 3;
    const u = new Float32Array(28);
    u.set([...fwd, W / H], 0); u.set([...right, 0.5], 4); u.set([...up, cam.dist], 8); u.set([...ev, t], 12);
    u.set([o.kind, o.sub || 0, (o.seed % 1000) / 10, o.spin || 0], 16);
    u.set([omega, o.tilt || 0.7, os.T || o.T || 20000, o.pulsar ? 1 : 0], 20); u.set([os.scale, os.bright, 1, 0], 24);
    device.queue.writeBuffer(objU, 0, u);
  }
  function specOf(i) {
    const g = S.gal, r = g.A[i * 4], birth = g.sts.birth[i];
    return { seed: astro.hashSeed(g.seed, i), mass: g.sts.mass[i], Z: astro.metallicity(g, birth, r), age: g.tNow - birth, name: '恒星 #' + i };
  }
  function flyTo(i, k) {
    if (S.kind !== 'galaxy') { env.toast('銀河画面から生命惑星を選択してください'); return; }
    const g = S.gal;
    if (!g || !Number.isInteger(i) || i < 0 || i >= g.n || !Number.isInteger(k) || k < 0) {
      env.toast('生命惑星データが不正です。生命探索をやり直してください'); return;
    }
    S.scanTok = null;
    const sys = astro.makeSystem(specOf(i));
    sys.gal = { type: g.type, r: g.A[i * 4] };
    if (!sys.planets[k] || sys.planets[k].type !== 'rock') { env.toast('対象惑星を再生成できませんでした'); return; }
    // フェード・タイマーを介さず惑星状態まで直接確定させる。
    S.stack = ['cosmos', 'galaxy'];
    S.sys = sys; S.clock = 0; S.pl = sys.planets[k]; S.plIdx = k;
    sys.planets.forEach((p) => {
      if (!p.env) p.env = env.life.environment(p, sys.star, sys.star.age);
      if (!p.bio) p.bio = sys.real && p.name !== '地球' ? { stage: 0, real: true } : p.type === 'rock' ? env.life.biosphere(p, sys.star, sys.star.age, p.env, p.seed || 1) : null;
    });
    S.orbit = sys.planets.map((p) => astro.orbitPoints(p, 140).map(compress));
    const sq = Math.sqrt(sys.star.L);
    S.hzPts = [0.95 * sq, 1.67 * sq].flatMap((rr) => Array.from({ length: 120 }, (_, n) => { const a = n / 120 * Math.PI * 2; return compress([rr * Math.cos(a), 0, rr * Math.sin(a)]); }));
    const maxA = sys.planets.reduce((m, p) => Math.max(m, p.a * (1 + p.e)), 1);
    cams.system.fly = false; cams.system.dist = Math.max(2.2, compress([maxA, 0, 0])[0] * 2.3);
    S.kind = 'planet'; S.clock = 0; S.stack.push('system'); cams.planet.dist = 4.2;
    clearLabels(); env.onEnter('planet');
  }
  // 生命のいる惑星を探す(太陽に近い恒星を順に調べる。結果は少しずつ cb に渡す)
  function scanLife(cb) {
    if (S.kind !== 'galaxy') return false;
    const g = S.gal, tok = S.scanTok = {}, start = Math.floor(Math.random() * g.n);
    let scanned = 0; const found = S.gfound = [];
    const MAX_SCAN = Math.min(1200, g.n), MAX_FOUND = 8;
    const chunk = () => {
      if (S.scanTok !== tok || S.kind !== 'galaxy') return;
      try {
        // 1フレームに恒星1個だけ調べる。大量の同期計算で画面全体が固まるのを防ぐ。
        if (scanned < MAX_SCAN && found.length < MAX_FOUND) {
          const idx = (start + scanned * 7919) % g.n; scanned++;
          const m = g.sts.mass[idx], age = g.tNow - g.sts.birth[idx];
          if (m >= 0.6 && m <= 1.4 && age >= 2.5) {
            const sys = astro.makeSystem(specOf(idx));
            let best = null;
            sys.planets.forEach((p, k) => {
              if (p.type !== 'rock') return;
              const ev = env.life.environment(p, sys.star, sys.star.age);
              const bio = env.life.biosphere(p, sys.star, sys.star.age, ev, p.seed || 1);
              if (bio.stage >= 7 && (!best || bio.stage > best.stage)) best = { i: idx, k, name: p.name, stage: bio.stage, intelligent: !!bio.intelligent };
            });
            if (best) found.push(best);
          }
        }
        const done = scanned >= MAX_SCAN || found.length >= MAX_FOUND;
        found.sort((a, b) => b.stage - a.stage);
        if (found.length) addGalaxyLabels();
        cb(found.slice(), done, scanned);
        if (!done) requestAnimationFrame(chunk);
      } catch (e) {
        console.error('生命探索処理エラー', e);
        cb(found.slice(), true, scanned, e);
      }
    };
    cb([], false, 0);
    requestAnimationFrame(chunk);
    return true;
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
    const vp = mul(perspective(0.9, W / H, 0.005, 100), lookAt(...viewOf(cam), [0, 1, 0]));
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
    sys.planets.forEach((p) => {
      if (!p.env) p.env = env.life.environment(p, sys.star, sys.star.age);
      if (!p.bio) p.bio = sys.real && p.name !== '地球' ? { stage: 0, real: true } : p.type === 'rock' ? env.life.biosphere(p, sys.star, sys.star.age, p.env, p.seed || 1) : null;
    });
    S.orbit = sys.planets.map((p) => astro.orbitPoints(p, 140).map(compress));
    const sq = Math.sqrt(sys.star.L);
    S.hzPts = [0.95 * sq, 1.67 * sq].flatMap((rr) => Array.from({ length: 120 }, (_, k) => { const a = k / 120 * Math.PI * 2; return compress([rr * Math.cos(a), 0, rr * Math.sin(a)]); }));
    const maxA = sys.planets.reduce((m, p) => Math.max(m, p.a * (1 + p.e)), 1);
    cams.system.fly = false; cams.system.dist = Math.max(2.2, compress([maxA, 0, 0])[0] * 2.3);
    clearLabels();
    S.labels = sys.planets.map((p, i) => addLabel(p.name + (p.env.nowLiquid ? ' ★' : ''), () => enterPlanet(i), 'pl'));
    env.onEnter('system');
  }
  function enterSun() {
    const sys = astro.solarSystem();
    S.stack = ['cosmos']; enterSystem(sys, null);
  }
  function systemFrame(dt, W, H, dpr) {
    const sys = S.sys, cam = cams.system;
    const vp = mul(perspective(0.9, W / H, 0.02, 400), lookAt(...viewOf(cam), [0, 1, 0]));
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
  const vegOf = (p) => p.vegCol || (p.vegCol = env.life.plantColor(p, S.sys.star));
  const greenOf = (p) => (p.life || (p.bio && p.bio.stage >= 7)) ? 1 : 0;
  const bioText = (p) => {
    const b = p.bio, SJ = env.life.STAGE_JP;
    if (!b) return p.type === 'rock' ? '—' : '考えない(ガス・氷の巨大惑星)';
    if (b.real) return p.name === '地球' ? '地球の生命(実際)' : '見つかっていない(実際)';
    if (b.extinct) return '絶えた(かつて到達: ' + SJ[b.peak] + ')・確率モデル(仮説)';
    return (b.stage ? SJ[b.stage] : '生命なし(液体の水が無い、または誕生に至らず)') + '・確率モデル(仮説)';
  };
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
    const veg = vegOf(p);
    u.set([...(p.type === 'rock' ? veg.a : p.tintA), greenOf(p)], 40);
    u.set([...(p.type === 'rock' ? veg.b : (p.tintB || [0, 0, 0])), 0], 44);
    device.queue.writeBuffer(plU, 0, u);
    S.pcam = { right, up, fwd, dist: cam.dist, asp: W / H, Wb, alpha };
  }

  // ------------------------------------------------------------ 地表
  const ATM_COL = { earthlike: [0.35, 0.6, 1.0, 0.95], venus: [1.0, 0.8, 0.4, 1.0], desert: [0.85, 0.55, 0.4, 0.3], frozen: [0.6, 0.75, 1.0, 0.5], lava: [1.0, 0.45, 0.15, 0.6], barren: [0, 0, 0, 0] };
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const basisAt = (s) => { // 本体座標の点 s での 東・北
    const lat = Math.asin(Math.max(-1, Math.min(1, s[1]))), lon = Math.atan2(s[2], s[0]);
    return { lat, lon, E: [-Math.sin(lon), 0, Math.cos(lon)], N: [-Math.sin(lat) * Math.cos(lon), Math.cos(lat), -Math.sin(lat) * Math.sin(lon)] };
  };
  const mulWb = (Wb, v) => [0, 1, 2].map((r) => Wb[r][0] * v[0] + Wb[r][1] * v[1] + Wb[r][2] * v[2]);
  const toBody = (Wb, v) => [0, 1, 2].map((c) => Wb[0][c] * v[0] + Wb[1][c] * v[1] + Wb[2][c] * v[2]);
  const keys = {}; S.walk = 0;
  window.addEventListener('keydown', (e) => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; S.walk = 0; });

  function planetPick(x, y) {
    const c = S.pcam; if (!c) return null;
    const W = canvas.clientWidth, H = canvas.clientHeight, tn = 0.42;
    const nx = x / W * 2 - 1, ny = 1 - y / H * 2;
    const rd = norm3([0, 1, 2].map((k) => c.fwd[k] + c.right[k] * nx * c.asp * tn + c.up[k] * ny * tn));
    const ro = c.fwd.map((v) => -v * c.dist);
    const b = dot3(ro, rd), disc = b * b - (dot3(ro, ro) - 1);
    if (disc <= 0) return null;
    const t = -b - Math.sqrt(disc);
    return toBody(c.Wb, [0, 1, 2].map((k) => ro[k] + rd[k] * t));
  }
  // 地表シェーダーの大域地形(macroH)と同じ式の CPU 版。着陸地点を陸に寄せるために使う。
  const fract = (x) => x - Math.floor(x);
  function hash31(x, y, z) {
    let qx = fract(x * 0.1031), qy = fract(y * 0.1031), qz = fract(z * 0.1031);
    const d = qx * (qz + 31.32) + qy * (qy + 31.32) + qz * (qx + 31.32);
    qx += d; qy += d; qz += d;
    return fract((qx + qy) * qz);
  }
  function noise3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
    const wx = fx * fx * (3 - 2 * fx), wy = fy * fy * (3 - 2 * fy), wz = fz * fz * (3 - 2 * fz), mix = (a, b, t) => a + (b - a) * t;
    const h = (dx, dy, dz) => hash31(ix + dx, iy + dy, iz + dz);
    return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), wx), mix(h(0, 1, 0), h(1, 1, 0), wx), wy), mix(mix(h(0, 0, 1), h(1, 0, 1), wx), mix(h(0, 1, 1), h(1, 1, 1), wx), wy), wz);
  }
  function terrainH(d, seed) { // fbm3(d*2.2+seed, 4)
    let sum = 0, a = 0.5, nrm = 0, x = d[0] * 2.2 + seed, y = d[1] * 2.2 + seed, z = d[2] * 2.2 + seed;
    for (let k = 0; k < 4; k++) { sum += a * noise3(x, y, z); nrm += a; x = x * 2.02 + 1.7; y = y * 2.02 + 9.2; z = z * 2.02 + 3.3; a *= 0.5; }
    return sum / nrm;
  }
  function snapToLand(s0, p) {
    if (p.kind !== 'earthlike') return s0;
    const sea = 0.3 + 0.4 * (p.water || 0), seed = p.seed || 1, ok = (d) => terrainH(d, seed) > sea + 0.04;
    if (ok(s0)) return s0;
    const e = basisAt(s0), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i <= 400; i++) { // 視点の近くから、らせん状に陸を探す
      const ang = Math.acos(1 - i / 400 * 0.9 * 1.0) * 0.9 + 0.02, az = i * ga, sa = Math.sin(ang);
      const d = norm3([0, 1, 2].map((k) => s0[k] * Math.cos(ang) + (e.E[k] * Math.cos(az) + e.N[k] * Math.sin(az)) * sa));
      if (ok(d)) { env.toast('そこは海なので、近くの陸に降りました(海に降りたいときは、惑星を直接タップ)', 4200); return d; }
    }
    return s0;
  }
  function land(s0) {
    const p = S.pl;
    if (S.kind !== 'planet') return;
    if (p.type !== 'rock') { env.toast('ガス・氷の巨大惑星には地表がありません(降りられるのは岩石惑星)'); return; }
    if (!s0) { const c = S.pcam; s0 = snapToLand(norm3(toBody(c.Wb, c.fwd.map((v) => -v))), p); }
    fade(() => enterSurface(norm3(s0)));
  }
  function enterSurface(s0) {
    const p = S.pl, b = basisAt(s0);
    S.kind = 'surface'; S.stack.push('planet');
    S.follow = null; S.near = []; cellCache.clear();
    S.sf = { s0, Eb: b.E, Nb: b.N, wx: 0, wz: 0, sel: 0, lat: b.lat, lon: b.lon, hd: 0 };
    Object.assign(cams.surface, { az: 0, el: 0.12, dist: 1 });
    clearLabels(); env.onEnter('surface');
    // 惑星ごとの生態系を保存し、再訪時に同じ個体群・進化履歴を復元する
    S.ecoKey = String(S.sys.seed || 0) + ':' + String(p.seed || 0) + ':' + p.name;
    const savedEco = S.ecoWorlds.get(S.ecoKey);
    if (savedEco) { S.fauna = savedEco.fauna; S.eco = savedEco.eco; S.ecoLog = savedEco.ecoLog; }
    else {
      S.fauna = p.bio && p.bio.stage >= 3 ? env.life.species(p, S.sys.star, p.bio, (p.seed || 1) + 0.5) : [];
      makeEco(p, S.sf);
      if (S.eco) S.ecoWorlds.set(S.ecoKey, { fauna: S.fauna, eco: S.eco, ecoLog: S.ecoLog });
    }
    env.toast(p.name === '地球' ? '地球の地表です(生き物は手続き生成の姿で、実在の種そのものではありません)' : '地表に降り立ちました: ' + bioText(p), 5200);
  }
  // ---- 生き物と建物(地表のセルごとに、シードから決まる配置)
  const smoothstep01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const noise3js = (x, y, z) => noise3(x, y, z);
  const hh = (a, b, c, d) => { let h = 2166136261 ^ (a | 0); h = Math.imul(h ^ (b | 0), 16777619); h = Math.imul(h ^ (c | 0), 0x85ebca6b); h = Math.imul(h ^ (d | 0), 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  function civLevel() {
    const p = S.pl, b = p.bio; if (!b || !b.intelligent) return 0;
    const w = env.getCiv ? env.getCiv(S.sys.seed + ':' + p.name) : null;
    if (w) { const m = w.ms; return (m.electric || m.computer) ? 4 : m.machine ? 3 : m.city ? 2 : m.agri ? 1 : 0; }
    return b.real ? 4 : 0;
  }
  // 地表シェーダーの elevAt と同じ式の CPU 版(立体物を地面に正しく置くため)。戻り値: [標高km, 水かどうか]
  function elevJS(x, z) {
    const p = S.pl, sf = S.sf, R = p.radiusE * 6371, seed = p.seed || 1, hasWater = p.kind === 'earthlike';
    const base = hasWater ? 0.3 + 0.4 * (p.water || 0) : 0.35, relief = Math.max(5, Math.min(150, 45 / (p.g || 1)));
    const d = norm3([0, 1, 2].map((k) => sf.s0[k] + (sf.Eb[k] * x + sf.Nb[k] * z) / R));
    const h = terrainH(d, seed), land = Math.max(h - base, 0);
    let sum = 0, am = 0.5, nrm = 0, qx = x * 0.35, qy = z * 0.35, qz = seed;
    for (let k = 0; k < 5; k++) { sum += am * noise3(qx, qy, qz); nrm += am; qx = qx * 2.02 + 1.7; qy = qy * 2.02 + 9.2; qz = qz * 2.02 + 3.3; am *= 0.5; }
    const e = land * relief + (sum / nrm - 0.5) * 0.9 * (0.12 + Math.min(land * 5, 1)) * smoothstep01(0, 0.02, land);
    return [Math.max(e, 0), hasWater && h < base];
  }
  // 部品を足す: out[形] に16個ずつ。形: 0=箱 1=球 2=円すい。大きさは「半分の長さ」
  const part = (out, prim, ax, ay, az, yaw, s, ox, oy, oz, sx, sy, sz, col, mat, rot, mode) => { out[prim].push(ax, ay, az, yaw, ox * s, oy * s, oz * s, rot || 0, sx * s, sy * s, sz * s, mode || 0, col[0], col[1], col[2], prim * 10 + mat); };
  const cellCache = new Map();
  function emitCreature(out, v, tsec) {
    const x = v[0], z = v[1], s = v[2], kind = v[3], c1 = [v[4], v[5], v[6]], c2 = [v[8], v[9], v[10]], ph = v[11], yaw = v[12], hab = v[13], alt = v[14];
    const [el, wet] = elevJS(x, z);
    if ((hab === 0 && wet) || (hab === 1 && !wet)) return;
    const y = hab === 1 ? -0.12 * s : el + alt, P = (prim, ox, oy, oz, sx, sy, sz, col, rot, mode) => part(out, prim, x, y, z, yaw, s, ox, oy, oz, sx, sy, sz, col, 3, rot, mode);
    const legs = (xs, hy, len, th, zs) => { let k = 0; for (const lx of xs) for (const lz of [-zs, zs]) { P(0, lx, hy, lz, th, len / 2, th, c2, 0.5 * Math.sin(ph * 3 + k * Math.PI + lx * 3), 1); k++; } };
    if (kind === 0) {
      const plan = Math.floor(v[7] / 10);
      if (plan === 1) { P(1, 0, 0.45, 0, 0.5, 0.19, 0.2, c1); P(0, 0.52, 0.72, 0, 0.26, 0.06, 0.06, c1, 0.95, 4); P(1, 0.72, 0.97, 0, 0.12, 0.07, 0.07, c2); P(0, -0.72, 0.42, 0, 0.3, 0.035, 0.035, c1, 0.25, 4); legs([-0.3, 0.3], 0.36, 0.36, 0.05, 0.12); }
      else if (plan === 2) { P(1, 0, 0.28, 0, 0.55, 0.17, 0.26, c1); P(1, 0.6, 0.3, 0, 0.15, 0.13, 0.14, c2); legs([-0.3, 0, 0.3], 0.24, 0.24, 0.025, 0.24); }
      else if (plan === 3) { P(1, 0, 0.6, 0, 0.28, 0.27, 0.2, c1); P(0, 0.22, 0.84, 0, 0.14, 0.05, 0.05, c1, 1.1, 4); P(1, 0.34, 0.97, 0, 0.11, 0.07, 0.07, c2); P(0, -0.4, 0.55, 0, 0.16, 0.04, 0.04, c1, 0.2, 4); legs([0], 0.42, 0.42, 0.045, 0.1); }
      else if (plan === 4) { for (let k = 0; k < 7; k++) P(1, -0.75 + 0.25 * k, 0.09, 0.09 * Math.sin(ph * 2 + k), 0.14, 0.085, 0.085, k === 6 ? c2 : c1); }
      else if (plan === 5) { P(1, 0, 0.64, 0, 0.4, 0.14, 0.14, c1); P(0, 0.42, 0.8, 0, 0.15, 0.045, 0.045, c1, 1.0, 4); P(1, 0.52, 0.94, 0, 0.12, 0.07, 0.07, c2); legs([-0.28, 0.28], 0.56, 0.56, 0.03, 0.09); }
      else { P(1, 0, 0.52, 0, 0.5, 0.2, 0.2, c1); P(1, 0.58, 0.64, 0, 0.16, 0.14, 0.13, c2); P(0, -0.6, 0.55, 0, 0.12, 0.03, 0.03, c1, 0.2, 4); legs([-0.3, 0.3], 0.42, 0.42, 0.045, 0.11); }
    } else if (kind === 1) { const f = 0.7 * Math.sin(ph * 6); P(1, 0, 0, 0, 0.3, 0.12, 0.12, c1); P(1, 0.3, 0.06, 0, 0.09, 0.08, 0.08, c2); P(0, 0, 0.03, 0.08, 0.13, 0.012, 0.28, c2, f, 2); P(0, 0, 0.03, -0.08, 0.13, 0.012, 0.28, c2, -f, 3); P(0, -0.36, 0, 0, 0.12, 0.01, 0.07, c1); }
    else if (kind === 2) { P(1, 0, 0, 0, 0.6, 0.2, 0.12, c1); P(0, -0.7, 0, 0, 0.15, 0.17, 0.02, c2, 0.3 * Math.sin(ph * 5), 0); P(0, 0, 0.2, 0, 0.14, 0.08, 0.015, c2); }
    else { const sw = 0.6 * Math.sin(ph * 3); P(0, 0, 0.62, 0, 0.07, 0.17, 0.11, c1); P(1, 0, 0.9, 0, 0.09, 0.1, 0.09, c2); P(0, 0, 0.46, 0.06, 0.045, 0.23, 0.045, c2, sw, 1); P(0, 0, 0.46, -0.06, 0.045, 0.23, 0.045, c2, -sw, 1); P(0, 0, 0.77, 0.15, 0.035, 0.16, 0.035, c1, -sw, 1); P(0, 0, 0.77, -0.15, 0.035, 0.16, 0.035, c1, sw, 1); }
  }
  function buildCreatures(sf, tsec) {
    const p = S.pl, F = S.fauna || [], by = (k) => F.filter((x) => x.kind === k), list = [], out = [[], [], []];
    const stat = (x, z, fn) => { const [el, wet] = elevJS(x, z); if (!wet) fn(el); }; // 動かない物(木・建物): 陸の上だけ
    const eco = S.eco, pfac = eco ? 0.25 + 0.75 * Math.min(1, eco.plantFrac()) : 1;
    const plants = by(3), animals = eco ? by(0).filter(x => eco.species.some(q => q.vis.name === x.name && q.ext === null && q.count > 0)) : by(0), birds = eco ? by(1).filter(x => eco.species.some(q => q.vis.name === x.name && q.ext === null && q.count > 0)) : by(1), fish = by(2), people = by(4), lvl = S.civNow || 0;
    const cell = 0.04, R = 7, seed = Math.floor((p.seed || 1) * 1000) | 0;
    const ci0 = Math.floor(sf.wx / cell), cj0 = Math.floor(sf.wz / cell);
    const mk = (sp, k, ci, cj) => ({ sp, key: ((ci * 73856093) ^ (cj * 19349663) ^ (k * 83492791)) | 0 });
    const add = (kind, x, z, size, sp, style, phase, head, hab, alt, wr, c1, c2, m) => (x - sf.wx) ** 2 + (z - sf.wz) ** 2 > 1.5e-4 && list.push({ m, d2: (x - sf.wx) ** 2 + (z - sf.wz) ** 2, v: [x, z, size, kind, c1[0], c1[1], c1[2], style, c2[0], c2[1], c2[2], phase, head, hab, alt, wr] });
    const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
    if (eco) {
      const Le = eco.L;
      for (const ind of eco.inds) {
        const vis = eco.species[ind.sp].vis;
        let dx = (((ind.x - Le / 2 - sf.wx + Le / 2) % Le) + Le) % Le - Le / 2, dz = (((ind.z - Le / 2 - sf.wz + Le / 2) % Le) + Le) % Le - Le / 2;
        if (dx * dx + dz * dz > 0.3 * 0.3) continue;
        const bird = vis.kind === 1, fishy = vis.kind === 2, baseKm = vis.size * ind.g[0];
        add(vis.kind, sf.wx + dx, sf.wz + dz, baseKm, vis, bird || fishy ? 0 : vis.legs + 10 * vis.plan, tsec * ind.g[1] * 2 + ind.id, Math.atan2(ind.vx, ind.vz), bird ? 2 : fishy ? 1 : 0, bird ? 0.02 + 0.03 * ((ind.id * 37) % 10) / 10 : 0, bird ? 1.0 : fishy ? 1.1 : 1.4, vis.col, vis.col2, { ind, eco: true });
      }
    }
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      if (di * di + dj * dj > R * R) continue;
      const ci = ci0 + di, cj = cj0 + dj, r = (k) => hh(seed, ci, cj, k), X = (k) => (ci + r(k)) * cell, Z = (k) => (cj + r(k + 50)) * cell;
      const ck = ci + ',' + cj + ',' + lvl + ',' + Math.round(pfac * 4) + ',' + plants.length;
      let cc = cellCache.get(ck);
      if (!cc) {
        const o2 = [[], [], []];
        if (plants.length && r(1) < 0.45 * pfac) {
          const sp = pick(plants, r(2)), x = X(3), z = Z(3), sz = sp.size * (0.7 + 0.6 * r(4)), yaw = r(5) * 6.28;
          stat(x, z, (el) => { const Q = (prim, ox, oy, oz, sx, sy, s2, col, mat) => part(o2, prim, x, el, z, yaw, sz, ox, oy, oz, sx, sy, s2, col, mat);
            if (sp.legs === 1) { Q(0, 0, 0.1, 0, 0.03, 0.1, 0.03, sp.col2, 0); Q(2, 0, 0.36, 0, 0.36, 0.2, 0.36, sp.col, 2); Q(2, 0, 0.6, 0, 0.27, 0.18, 0.27, sp.col, 2); Q(2, 0, 0.82, 0, 0.17, 0.17, 0.17, sp.col, 2); }
            else if (sp.legs === 2) { Q(1, -0.22, 0.2, 0, 0.36, 0.22, 0.3, sp.col, 2); Q(1, 0.2, 0.26, 0.1, 0.38, 0.27, 0.32, sp.col, 2); }
            else { Q(0, 0, 0.25, 0, 0.035, 0.25, 0.035, sp.col2, 0); Q(1, 0, 0.72, 0, 0.42, 0.3, 0.42, sp.col, 2); Q(1, -0.25, 0.6, 0.1, 0.28, 0.22, 0.28, sp.col, 2); Q(1, 0.25, 0.62, -0.12, 0.28, 0.22, 0.28, sp.col, 2); } });
        }
        if (lvl >= 1 && people.length) {
          const wall = [[0.62, 0.5, 0.36], [0.72, 0.68, 0.6], [0.55, 0.58, 0.62], [0.7, 0.74, 0.78]], roof = [[0.42, 0.3, 0.16], [0.55, 0.25, 0.2], [0.3, 0.3, 0.32], [0.3, 0.35, 0.4]];
          const cx = (ci + 0.5) * cell * 0.8, cz = (cj + 0.5) * cell * 0.8, town = smoothstep01(0.5, 0.62, noise3js(cx, cz, 11)), core = smoothstep01(0.6, 0.7, noise3js(cx, cz, 11));
          const bld = (lv, prob, size, k) => { if (lvl < lv + 1 || r(k) >= prob) return; const x = X(k + 1), z = Z(k + 1), sz = size * (0.8 + 0.4 * r(k + 2)), yaw = r(k + 3) < 0.5 ? 0 : 1.5708;
            stat(x, z, (el) => { const Q = (prim, ox, oy, oz, sx, sy, s2, col, mat) => part(o2, prim, x, el, z, yaw, sz, ox, oy, oz, sx, sy, s2, col, mat);
              if (lv === 0) { Q(0, 0, 0.3, 0, 0.45, 0.3, 0.45, wall[0], 0); Q(2, 0, 0.82, 0, 0.66, 0.24, 0.66, roof[0], 0); }
              else if (lv === 1) { Q(0, 0, 0.32, 0, 0.7, 0.32, 0.5, wall[1], 1); Q(2, 0, 0.82, 0, 0.9, 0.2, 0.66, roof[1], 0); }
              else if (lv === 2) { Q(0, 0, 0.5, 0, 0.2, 0.5, 0.2, wall[2], 1); Q(0, 0, 1.02, 0, 0.22, 0.02, 0.22, roof[2], 0); }
              else { Q(0, 0, 0.45, 0, 0.26, 0.45, 0.26, wall[3], 1); Q(0, 0, 0.95, 0, 0.18, 0.06, 0.18, wall[3], 1); Q(0, 0, 1.06, 0, 0.012, 0.06, 0.012, roof[3], 0); } }); };
          if (lvl >= 1) { bld(0, 0.10 * town, 0.0038, 60); bld(0, 0.035 * town, 0.0055, 70); }
          if (lvl >= 2) { bld(1, 0.24 * town, 0.008, 80); bld(0, 0.10 * town, 0.0045, 90); }
          if (lvl >= 3) bld(2, 0.07 * core, 0.035, 100);
          if (lvl >= 4) bld(3, 0.06 * core, 0.07, 110);
          bld(0, lvl >= 2 ? 0.012 : 0.045, 0.004, 30); if (lvl < 2) bld(1, 0.025, 0.008, 40);
        }
        cc = o2.map((arr) => new Float32Array(arr));
        if (cellCache.size > 1500) cellCache.clear();
        cellCache.set(ck, cc);
      }
      for (let q = 0; q < 3; q++) for (let t = 0; t < cc[q].length; t++) out[q].push(cc[q][t]);
      if (!eco && animals.length && r(6) < 0.05) { const sp = pick(animals, r(7)), a = tsec * 0.25 * sp.speed + r(8) * 6.28; add(0, X(9) + 0.012 * Math.sin(a), Z(9) + 0.012 * Math.cos(a), sp.size, sp, sp.legs + 10 * (sp.plan || 0), tsec * sp.speed * 2 + r(10) * 6, Math.atan2(Math.cos(a), -Math.sin(a)), 0, 0, 1.4, sp.col, sp.col2, mk(sp, 1, ci, cj)); }
      if (!eco && birds.length && r(11) < 0.03) { const sp = pick(birds, r(12)), a = tsec * 0.5 * sp.speed + r(13) * 6.28; add(1, X(14) + 0.03 * Math.sin(a), Z(14) + 0.03 * Math.cos(a), sp.size, sp, 0, tsec * sp.speed * 2 + r(15) * 6, Math.atan2(Math.cos(a), -Math.sin(a)), 2, 0.02 + 0.04 * r(16), 1.0, sp.col, sp.col2, mk(sp, 2, ci, cj)); }
      if (!eco && fish.length && r(17) < 0.08) { const sp = pick(fish, r(18)), a = tsec * 0.2 * sp.speed + r(19) * 6.28; add(2, X(20) + 0.008 * Math.sin(a), Z(20) + 0.008 * Math.cos(a), sp.size, sp, 0, tsec * sp.speed * 2 + r(21) * 6, Math.atan2(Math.cos(a), -Math.sin(a)), 1, 0, 1.1, sp.col, sp.col2, mk(sp, 3, ci, cj)); }
      if (people.length && lvl >= 0 && r(22) < (lvl ? 0.012 : 0.006)) { const sp = people[0], a = tsec * 0.1 + r(23) * 6.28; add(4, X(24) + 0.005 * Math.sin(a), Z(24) + 0.005 * Math.cos(a), sp.size, sp, 0, tsec * 3 + r(25) * 6, Math.atan2(Math.cos(a), -Math.sin(a)), 0, 0, 0.5, sp.col, sp.col2, mk(sp, 4, ci, cj)); }
    }
    list.sort((a, b) => b.d2 - a.d2);
    // ---- 近くの生き物を「一匹ずつ」の個体として扱う(名前・性別・年齢・体力・行動)。状態は個体の番号と時刻から決まる。
    const SYLJ = 'カキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモラリルレロ';
    const near = [];
    for (let i = list.length - 1; i >= 0 && near.length < 12; i--) {
      const e = list[i]; if (!e.m) continue;
      if (e.m.ind) { // 生態系の個体: 本物の状態
        const q = e.m.ind, vis = eco.species[q.sp].vis, dx = e.v[0] - sf.wx, dz = e.v[1] - sf.wz;
        near.push({ key: q.id, name: q.name, species: vis.name, kind: vis.kind, sex: q.sex ? '♀' : '♂', age: Math.floor(q.age), energy: Math.max(0, Math.min(100, Math.round(q.e / (1.5 * 100 * q.g[0]) * 100))), act: q.act, dist: Math.round(Math.sqrt(e.d2) * 1000), bearing: Math.atan2(dx, dz),
          genes: '大きさ' + q.g[0].toFixed(2) + ' 速さ' + q.g[1].toFixed(2) + ' 肉食度' + q.g[2].toFixed(2) + ' 群れ' + q.g[3].toFixed(2), mother: q.mother, born: Math.round(q.born), real: true });
        continue;
      }
      const h = (k) => hh(seed, e.m.key, k, 99), sp = e.m.sp, kind = e.v[3];
      let nm = ''; for (let t = 0; t < 2 + Math.floor(h(5) * 2); t++) nm += SYLJ[Math.floor(h(10 + t) * SYLJ.length)];
      const s4 = Math.sin(tsec * sp.speed * 0.3 + h(4) * 6);
      const act = kind === 2 ? '泳いでいる' : kind === 1 ? '飛んでいる' : s4 > 0.3 ? '歩いている' : s4 < -0.6 ? '食べている' : '休んでいる';
      const dx = e.v[0] - sf.wx, dz = e.v[1] - sf.wz;
      near.push({ key: e.m.key, name: nm, species: sp.name, kind, sex: h(1) < 0.5 ? '♂' : '♀', age: Math.floor(h(2) * (kind === 4 ? 60 : kind === 1 ? 8 : 15) + 1), energy: Math.round(45 + 50 * (0.5 + 0.5 * Math.sin(tsec * 0.05 + h(3) * 6))), act, dist: Math.round(Math.sqrt(e.d2) * 1000), bearing: Math.atan2(dx, dz) });
    }
    S.near = near;
    if (S.follow !== null && S.follow !== undefined) {
      const f = near.find((x) => x.key === S.follow);
      if (!f) S.follow = null;
      else { const cam = cams.surface; let d = f.bearing - cam.az; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; cam.az += d * 0.12; cam.el += (0.05 - cam.el) * 0.1; }
    }
    for (const e of list) emitCreature(out, e.v, tsec);
    // 形ごとにまとめて送る(箱→球→円すい)
    let nb = out[0].length / 16, ns = out[1].length / 16, nc = out[2].length / 16;
    if (nb + ns + nc > MAXC) { const k = MAXC / (nb + ns + nc); nb = Math.floor(nb * k); ns = Math.floor(ns * k); nc = Math.floor(nc * k); }
    const data = new Float32Array((nb + ns + nc) * 16);
    data.set(out[0].slice(0, nb * 16), 0); data.set(out[1].slice(0, ns * 16), nb * 16); data.set(out[2].slice(0, nc * 16), (nb + ns) * 16);
    crN = [nb, ns, nc]; crCount = nb + ns + nc;
    if (crCount) device.queue.writeBuffer(crBuf, 0, data);
  }
  // ---- 生態系(eco.js)を地表に結びつける
  function makeEco(p, sf) {
    S.eco = null; if (!env.eco) return;
    const animals = (S.fauna || []).filter((x) => x.kind === 0 || x.kind === 1 || (x.kind === 2 && p.kind === 'earthlike' && x.size > 0.0003)); // 目に見える大きさの水中生物も入れる
    if (!animals.length) return;
    const R = p.radiusE * 6371, hasWater = p.kind === 'earthlike', sea = 0.3 + 0.4 * (p.water || 0), seed = p.seed || 1, Lr = env.eco.L, M = 48;
    const mask = new Uint8Array(M * M);
    if (hasWater) for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = ((i + 0.5) / M - 0.5) * Lr, z = ((j + 0.5) / M - 0.5) * Lr;
      const d = norm3([0, 1, 2].map((k) => sf.s0[k] + (sf.Eb[k] * x + sf.Nb[k] * z) / R));
      mask[i + j * M] = terrainH(d, seed) < sea ? 1 : 0;
    }
    const water = (x, z) => hasWater && mask[Math.min(M - 1, Math.floor(x / Lr * M)) + Math.min(M - 1, Math.floor(z / Lr * M)) * M] === 1;
    const blocked = (x, z) => mask[Math.min(M - 1, Math.floor(x / Lr * M)) + Math.min(M - 1, Math.floor(z / Lr * M)) * M] === 1;
    const species = animals.map((x) => ({ kind: x.kind, name: x.name, plan: x.plan || 0, legs: x.legs, col: x.col, col2: x.col2, speed: x.speed, size: x.size }));
    S.eco = env.eco.create({ seed: Math.floor(seed * 1000) ^ astro.hashSeed(Math.floor(sf.s0[0] * 1e4), Math.floor(sf.s0[2] * 1e4)), species, blocked, water, cover: p.kind === 'desert' ? 0.45 : 0.85 });
    S.eco.baseCover = S.eco.cover;
    // 生態系の初期化時点を世界時計に合わせる。過去の時間を初期個体へ一括適用しない
    S.ecoLog = S.worldYears;
  }
  function surfaceFrame(dt, W, H) {
    const p = S.pl, sf = S.sf, cam = cams.surface, R = p.radiusE * 6371;
    const fi = (S.walk || 0) + (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    const si = (S.strafe || 0) + (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    const spd = 0.05 * (keys.shift ? 12 : 1) * dt, hd = cam.az;
    const clampW = (v) => Math.max(-600, Math.min(600, v));
    sf.wx = clampW(sf.wx + (Math.sin(hd) * fi + Math.cos(hd) * si) * spd);
    sf.wz = clampW(sf.wz + (Math.cos(hd) * fi - Math.sin(hd) * si) * spd);
    // いまの足元(本体座標)と、そこでの 東・北・上
    const sc = norm3([0, 1, 2].map((k) => sf.s0[k] + (sf.Eb[k] * sf.wx + sf.Nb[k] * sf.wz) / R));
    const b = basisAt(sc); sf.lat = b.lat; sf.lon = b.lon;
    const c = S.pcam, Wb = c.Wb, alpha = c.alpha;
    const Lw = norm3([Math.cos(alpha), 0.15, Math.sin(alpha)]);
    const Ew = mulWb(Wb, b.E), Nw = mulWb(Wb, b.N), Uw = mulWb(Wb, sc);
    const Ls = [dot3(Lw, Ew), dot3(Lw, Uw), dot3(Lw, Nw)];
    sf.sel = Math.asin(Math.max(-1, Math.min(1, Ls[1]))) * 180 / Math.PI;
    const cp = Math.cos(cam.el), sp = Math.sin(cam.el);
    const f = [cp * Math.sin(hd), sp, cp * Math.cos(hd)], r = [Math.cos(hd), 0, -Math.sin(hd)], up = cross3(f, r);
    const kind = KIND_CODE[p.kind] !== undefined ? KIND_CODE[p.kind] : 4;
    const atm = ATM_COL[p.kind] || [0, 0, 0, 0];
    const sea = 0.3 + 0.4 * (p.water || 0), hasWater = p.kind === 'earthlike' ? 1 : 0;
    const star = S.sys.star, bb = astro.blackbody(star.T), bm = Math.max(bb[0], bb[1], bb[2], 0.01);
    const half = Math.max(0.0008, 0.00465 * (star.R || 1) / p.a);
    const relief = Math.max(5, Math.min(150, 45 / (p.g || 1)));
    const u = new Float32Array(52);
    u.set([...f, W / H], 0); u.set([...r, 0.6 * cam.dist], 4); u.set([...up, 0.0018], 8); u.set([...Ls, S.clock], 12);
    u.set([...sf.s0, R], 16); u.set([...sf.Eb, relief], 20); u.set([...sf.Nb, hasWater ? sea : 0.35], 24);
    u.set([sf.wx, sf.wz, p.seed || 1, kind], 28); u.set(atm, 32); u.set([bb[0] / bm, bb[1] / bm, bb[2] / bm, half], 36);
    const veg = vegOf(p), lvl = S.civNow = civLevel();
    u.set([p.tsurf || 280, greenOf(p), hasWater, sea], 40); u.set([Math.abs(sf.s0[1]), ...veg.a], 44); u.set([lvl, p.kind === 'earthlike' ? 0.5 : p.kind === 'frozen' ? 0.35 : p.kind === 'venus' ? 0.9 : p.kind === 'desert' ? 0.12 : 0, elevJS(sf.wx, sf.wz)[0], 0], 48);
    device.queue.writeBuffer(surfU, 0, u);
    // 生態系は世界時間(worldYears)側だけで進める。描画dtでの二重進行を廃止。
    buildCreatures(sf, performance.now() / 1000);
  }

  // ------------------------------------------------------------ 共通
  function back() {
    const prev = S.stack.pop();
    if (!prev) return;
    fade(() => {
      clearLabels();
      if (prev === 'cosmos') { S.kind = 'cosmos'; env.onEnter('cosmos'); }
      else if (prev === 'galaxy') { S.kind = 'galaxy'; S.sys = null; addGalaxyLabels(); env.onEnter('galaxy'); }
      else if (prev === 'planet') { S.kind = 'planet'; S.sf = null; env.onEnter('planet'); }
      else if (prev === 'system') { S.kind = 'system'; S.pl = null; S.labels = S.sys.planets.map((p, i) => addLabel(p.name + (p.env.nowLiquid ? ' ★' : ''), () => enterPlanet(i), 'pl')); env.onEnter('system'); }
    });
  }
  function onTap(x, y) {
    if (S.kind === 'galaxy') {
      const i = pickStar(x, y);
      if (i >= 0) fade(() => enterStarSystem(i)); else env.toast('星の近くをタップしてください');
    } else if (S.kind === 'planet') {
      const s0 = planetPick(x, y);
      if (s0) land(s0); else env.toast('惑星の上をタップすると、その地点に降りられます');
    }
  }
  function speedText(mult) {
    if (S.kind === 'object') return '1秒 = ' + env.fmtYears(mult * (OBJ_RATE[S.obj.type] || 1)) + '(天体の変化。回転は見やすい速さ)';
    if (S.kind === 'galaxy') return '1秒 = ' + (mult * 10).toFixed(mult >= 10 ? 0 : 1) + '百万年(銀河の回転)';
    if (S.kind === 'system') return '1秒 = ' + (mult * 0.2).toFixed(2) + '年(公転)';
    return '1秒 = ' + (mult * 2).toFixed(1) + '時間(自転)';
  }

  const fmt = (x, d) => (x >= 1e4 || (x < 0.01 && x > 0) ? x.toExponential(d === undefined ? 2 : d).replace('e+', '×10^').replace('e-', '×10^-') : x.toFixed(d === undefined ? 2 : d));
  const KIND_JP = { earthlike: '地球型(液体の水が存在しうる)', frozen: '凍結した世界', desert: '砂漠・乾燥した世界', venus: '厚い大気の灼熱世界(金星型)', lava: '溶岩の世界', barren: '大気のない岩石惑星', gas: 'ガス惑星', icegiant: '氷の巨大惑星' };
  function envRows(p, sys) {
    const e = p.env, L = env.life, age = sys.star.age;
    const pct = (x) => (x / e.range * 100).toFixed(2);
    const stops = e.seg.map((s) => `${L.STATE_COLOR[s.state]} ${pct(s.from)}% ${pct(s.to)}%`).join(',');
    const bar = `<div style="position:relative;width:170px;height:10px;border-radius:5px;background:linear-gradient(90deg,${stops})"><i style="position:absolute;left:${Math.min(100, age / e.range * 100).toFixed(1)}%;top:-3px;width:2px;height:16px;background:#fff"></i></div><div style="font-size:10px;color:#8e9bc4;display:flex;justify-content:space-between;width:170px"><span>0</span><span>${e.range.toFixed(1)} Gyr</span></div>`;
    const rows = [['環境の履歴(青=水が可能)', bar], ['いまの状態', L.STATE_JP[e.now.state] || ''], ['恒星の年齢', age.toFixed(1) + ' Gyr(寿命 ' + (e.starEnds > 1e4 ? '>10兆' : e.starEnds.toFixed(1)) + ')']];
    if (p.type === 'rock') {
      rows.push(['液体の水の連続期間', e.longest > 0 ? '最長 ' + e.longest.toFixed(2) + ' Gyr' : 'なし']);
      if (e.nowLiquid) rows.push(['この状態が続くのは', '約 ' + e.windowEnd.toFixed(1) + ' Gyr まで(あと ' + Math.max(0, e.windowEnd - age).toFixed(1) + ' Gyr)']);
      rows.push(['潮汐固定', e.locked ? '固定済み(同じ面を恒星に向ける)' : e.lockGyr < 1e4 ? 'あと約 ' + Math.max(0, e.lockGyr - age).toFixed(0) + ' Gyr で固定' : 'されない']);
    }
    return rows;
  }
  function info() {
    const g = S.gal, sys = S.sys, p = S.pl;
    const crumb = ['宇宙'];
    if (S.kind === 'object') {
      const o = S.obj; return { crumb: S.stack.includes('galaxy') ? ['宇宙', '銀河', o.jp.split('(')[0]] : ['宇宙', o.jp.split('(')[0]], era: 'ドラッグで回り込み、ホイール/ピンチで近づく・離れる。実在する物理の式で計算した値と、その見え方です', big: o.icon + ' ' + o.jp, rows: [...(S.objSt ? S.objSt.rows : []), ...o.rows] };
    }
    if (S.kind === 'galaxy') {
      crumb.push('銀河');
      return { crumb, era: '星をタップすると、その恒星系へズームします', big: astro.TYPE_JP[g.type],
        rows: [['ハロー質量(近似)', fmt(g.Mh, 1) + ' M☉'], ['星の総質量(近似)', fmt(g.Mstar, 1) + ' M☉'], ['半径', (g.R).toFixed(1) + ' kpc'], ['宇宙年齢', env.fmtYears(g.tNow * 1e9)], ['表示している星', g.n.toLocaleString() + ' 個(標本)'], ['生命・文明', '恒星系ごとに確率モデルで判定(仮説)']] };
    }
    if (S.kind === 'system') {
      crumb.push('銀河', '恒星系'); const s = sys.star;
      return { crumb: sys.real ? ['宇宙', '太陽系'] : crumb, era: sys.real ? '実データ(NASA等の値): 惑星をタップ' : '法則+乱数で生成した恒星系: 惑星をタップ', big: sys.name,
        rows: [['恒星', s.spec + '型 ' + Math.round(s.T) + ' K'], ['質量', s.mass.toFixed(2) + ' M☉'], ['光度', fmt(s.L, 2) + ' L☉'], ['年齢/寿命', s.age.toFixed(1) + ' / ' + (s.life > 1e4 ? '>10兆' : s.life.toFixed(1)) + ' Gyr'],
          ['金属量 Z', sys.Z.toFixed(2) + ' Z☉'], ['惑星の数', sys.planets.length + ' 個'], ['ハビタブルゾーン', sys.hz[0].toFixed(2) + '–' + sys.hz[1].toFixed(2) + ' AU'], ['生命のいる惑星', sys.real ? '地球(実際)' : sys.planets.filter((q) => q.bio && q.bio.stage >= 2).length + ' 個(確率モデル・仮説)']] };
    }
    if (S.kind === 'surface') {
      const sf = S.sf, sel = Math.round(sf.sel), dn = sel > 6 ? '昼' : sel > -6 ? '朝夕(日の出・日の入り)' : '夜';
      return { crumb: sys.real ? ['宇宙', '太陽系', p.name, '地表'] : [...crumb, '銀河', '恒星系', p.name, '地表'], era: '地表に立っています: ドラッグで見回し、PCは W/A/S/D(Shiftで速く)、スマホは🚶を長押しで歩けます。↩で軌道へ戻る',
        big: p.name + 'の地表',
        rows: [['太陽の高さ', sel + '°(' + dn + ')'], ['緯度・経度', (sf.lat * 180 / Math.PI).toFixed(1) + '° / ' + (sf.lon * 180 / Math.PI).toFixed(1) + '°'], ['表面重力', p.g.toFixed(2) + ' g'],
          ['気温(推定の平均)', Math.round(p.tsurf - 273.15) + ' ℃'], ['大気', p.atm ? (p.kind === 'venus' ? '厚い(地表は灼熱)' : 'あり') : 'なし(空は黒く、星が昼でも見える)'],
          ['生命', bioText(p)], ...(p.bio && p.bio.origin ? [['生命の起源', p.bio.origin.route + ' / ' + p.bio.origin.molecules.join('・')]] : []), ...(p.bio && p.bio.raceName ? [['知的生命の種族', p.bio.raceName]] : []), ['見える生き物', S.fauna.length ? S.fauna.length + ' 種(環境・進化段階から生成): ' + S.fauna.slice(0, 5).map((x) => x.name).join('・') + (S.fauna.length > 5 ? '…' : '') : 'いない(微生物以下は目に見えない)'], ...(S.civNow ? [['文明の段階', ['なし', '集落(小屋)', '街', '塔・工場', '電灯のともる都市'][S.civNow]]] : []), ['歩いた距離', Math.hypot(sf.wx, sf.wz).toFixed(2) + ' km']] };
    }
    crumb.push('銀河', '恒星系', p.name);
    return { crumb: sys.real ? ['宇宙', '太陽系', p.name] : crumb, era: (KIND_JP[p.kind] || '') + (p.habitable ? ' ★' : ''), big: p.name,
      rows: [['軌道長半径', p.a.toFixed(3) + ' AU(周期 ' + (p.period < 1 ? (p.period * 365.25).toFixed(1) + ' 日' : p.period.toFixed(2) + ' 年') + ')'], ['質量 / 半径', p.massE.toFixed(2) + ' / ' + p.radiusE.toFixed(2) + ' (地球=1)'],
        ['表面重力', p.g.toFixed(2) + ' g'], ['脱出速度', p.vesc.toFixed(1) + ' km/s'], ['平衡温度', Math.round(p.teq) + ' K'], ['表面温度(推定)', Math.round(p.tsurf) + ' K(' + Math.round(p.tsurf - 273.15) + ' ℃)'],
        ['大気', p.atm ? (p.type === 'rock' ? 'あり' : '厚い(水素・ヘリウム主体)') : 'なし(軽いガスは逃げる)'], ['自転', (p.rotH < 100 ? p.rotH.toFixed(1) + ' 時間' : (p.rotH / 24).toFixed(0) + ' 日') + '、傾き ' + p.tilt.toFixed(0) + '°'],
        ['生命', bioText(p)], ...envRows(p, sys)] };
  }

  // 自由飛行(銀河・恒星系): W/S=前後 A/D=左右 Q/E=下上 Shift=速く。🚀前進ボタンの長押しでも進む
  function flyMove(dt) {
    const cam = cams[S.kind]; if (!cam || !cam.fly) return;
    const f = fwdOf(cam), r = [Math.cos(cam.az), 0, -Math.sin(cam.az)];
    const fi = (S.walk || 0) + (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0), si = (S.strafe || 0) + (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), vi = (S.vert || 0) + (keys.e || keys[' '] ? 1 : 0) - (keys.q ? 1 : 0);
    const sp = (S.kind === 'galaxy' ? 0.5 : 2.5) * (cam.spd || 1) * (keys.shift ? 5 : 1) * dt;
    for (let k = 0; k < 3; k++) cam.pos[k] += f[k] * fi * sp + r[k] * si * sp + (k === 1 ? vi * sp : 0);
  }
  function setFly(on) {
    const cam = cams[S.kind]; if (!cam || (S.kind !== 'galaxy' && S.kind !== 'system')) return false;
    if (on && !cam.fly) { const e = eyeOf(cam), l = Math.hypot(...e), f = e.map((v) => -v / l); Object.assign(cam, { fly: true, pos: e.slice(), el: Math.asin(f[1]), az: Math.atan2(f[0], f[2]), spd: 1 }); }
    else if (!on && cam.fly) { const p = cam.pos, d = Math.min(cam.max, Math.max(cam.min, Math.hypot(...p))); Object.assign(cam, { fly: false, dist: d, az: Math.atan2(p[0], p[2]), el: Math.asin(Math.max(-1, Math.min(1, p[1] / (Math.hypot(...p) || 1)))) }); }
    return true;
  }
  function frame(dtReal, dpr) {
    flyMove(dtReal);
    const dir = env.getDir(), mult = env.getMult();
    if (dir !== 0) {
      if (S.kind === 'galaxy') S.clock += dir * mult * 10 * dtReal;
      else if (S.kind === 'system') S.clock += dir * mult * 0.2 * dtReal;
      else if (S.kind === 'object') S.objT = Math.max(0, (S.objT || 0) + dir * mult * (OBJ_RATE[S.obj.type] || 1) * dtReal);
      else { S.clock += dir * mult * 2 * dtReal; S.worldYears = Math.max(0, S.worldYears + dir * mult * 2 * dtReal / 8760); }
      if (S.kind === 'surface' && S.eco && S.worldYears > (S.ecoLog || 0)) {
        const delta = S.worldYears - (S.ecoLog || 0);
        // 生態系側の実処理上限(約4ms)に合わせ、進んだ分だけ世界時計との差を埋める
        const advanced = S.eco.run(Math.min(1000, delta));
        S.ecoLog = (S.ecoLog || 0) + Math.max(0, advanced);
        const saved = S.ecoWorlds.get(S.ecoKey);
        if (saved) saved.ecoLog = S.ecoLog;
      }
    }
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const enc = device.createCommandEncoder();
    const desc = { colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0.008, a: 1 }, loadOp: 'clear', storeOp: 'store' }] };
    if (S.kind === 'surface') desc.depthStencilAttachment = { view: depthView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }; // 地表だけ奥行きを使う
    const pass = enc.beginRenderPass(desc);
    if (S.kind === 'galaxy') {
      const cam = cams.galaxy, g = S.gal;
      const vp = mul(perspective(0.9, canvas.width / canvas.height, 0.005, 100), lookAt(...viewOf(cam), [0, 1, 0]));
      const u = new Float32Array(24); u.set(vp, 0);
      u.set([canvas.width, canvas.height, 1.7 * dpr * (env.coarse ? 1.2 : 1), (g.type === 'dwarf' ? 1.6 : 1) * Math.pow(140000 / g.n, 0.4) * env.getExpo()], 16);
      u.set([S.clock, GS, 0, 0], 20);
      device.queue.writeBuffer(galU, 0, u);
      pass.setPipeline(galPipe); pass.setBindGroup(0, galBG); pass.draw(6, g.n);
      if (S.gpts) {
        const pts = S.gpts.map((i) => (typeof i === 'number' ? starPos(i, S.clock) : objPos(i, S.clock)));
        placeLabels(vp, W, H, pts);
        if (S.objLab && S.objLab.length > 14) { // 天体の印が多すぎると見づらいので、近い順に14個だけ出す(巨大ブラックホールは常に出す)
          const eye = viewOf(cam)[0], order = S.objLab.map((li, k) => [li, Math.hypot(pts[li][0] - eye[0], pts[li][1] - eye[1], pts[li][2] - eye[2]) - (S.gpts[li].type === 'smbh' ? 1e3 : 0)]).sort((a, b) => a[1] - b[1]);
          order.slice(14).forEach(([li]) => { S.labels[li].style.display = 'none'; });
        }
      }
    } else if (S.kind === 'system') {
      const { count } = systemFrame(dtReal, W, H, dpr);
      pass.setPipeline(sprPipe); pass.setBindGroup(0, sprBG); pass.draw(6, count);
    } else if (S.kind === 'planet') {
      planetFrame(dtReal, W, H);
      pass.setPipeline(plPipe); pass.setBindGroup(0, plBG); pass.draw(3);
    } else if (S.kind === 'object') {
      objectFrame(dtReal, W, H);
      pass.setPipeline(objPipe); pass.setBindGroup(0, objBG); pass.draw(3);
    } else if (S.kind === 'surface') {
      planetFrame(dtReal, W, H); // 惑星の自転と太陽の向きの更新(軌道の絵は描かない)
      surfaceFrame(dtReal, W, H);
      pass.setPipeline(surfPipe); pass.setBindGroup(0, surfBG); pass.draw(3);
      if (crCount) { pass.setPipeline(crPipe); pass.setBindGroup(0, crBG); if (crN[0]) pass.draw(36, crN[0], 0, 0); if (crN[1]) pass.draw(360, crN[1], 0, crN[0]); if (crN[2]) pass.draw(48, crN[2], 0, crN[0] + crN[1]); }
    }
    pass.end(); device.queue.submit([enc.finish()]);
    env.setInfo(info());
  }

  return {
    get kind() { return S.kind; }, active, curCam, enterGalaxy, enterSun, back, onTap, frame, speedText,
    canBack: () => S.stack.length > 0, enterPlanet, labelsRef: () => S.labels,
    getSystem: () => S.sys, getPlanet: () => S.pl, planetIndex: () => S.plIdx, eco: () => S.eco, worldTime: () => S.worldYears, ecoLag: () => (S.eco ? Math.max(0, S.worldYears - (S.ecoLog || 0)) : 0), setHumanLoad: (x) => { S.humanLoad = Math.max(0, Math.min(1, x)); if (S.eco) S.eco.cover = (S.eco.baseCover || 0.85) * (1 - 0.6 * S.humanLoad) * Math.max(0.35, 1 - 0.09 * Math.max(0, S.dT || 0)); }, setClimate: (dT) => { S.dT = dT; }, ecoEvent: (k) => { if (S.eco) S.eco.event(k, 0.6 + 0.3 * Math.random()); }, setFly, flying: () => { const c = cams[S.kind]; return !!(c && c.fly); }, viewObject, nearby: () => S.near || [], follow: (k) => { S.follow = (S.follow === k ? null : k); }, following: () => S.follow, scanLife, flyTo, land: () => land(null), setWalk: (v) => { S.walk = v; }, setMove: (f, s2) => { S.walk = f; S.strafe = s2; }, setVert: (v) => { S.vert = v; },
    dbg: () => ({ crCount, fauna: (S.fauna||[]).map((x) => x.kind + ':' + x.size.toFixed(4)).join(' '), h: terrainH(S.sf.s0, S.pl.seed || 1), sea: 0.3 + 0.4 * (S.pl.water || 0), seed: S.pl.seed, kind: S.pl.kind, s0: S.sf.s0 }),
    civTarget: () => (S.pl && S.pl.bio && S.pl.bio.intelligent && S.sys ? { key: S.sys.seed + ':' + S.pl.name, name: S.pl.name, real: !!S.pl.bio.real, seed: Math.floor((S.pl.seed || 1) * 1000) } : null),
    cosmosReturn: () => { S.kind = 'cosmos'; S.stack = []; clearLabels(); },
  };
}
root.Scenes = { create };
})(window);
