/* 天体の生成と物理(純関数)。ブラウザでは window.Astro、Node では require で使える。
 * 単位: 質量=太陽質量(M☉)または地球質量(M⊕)、距離=AU または kpc、時間=Gyr または年。
 * 実データ(太陽系)と、法則+乱数で作る恒星系・銀河を扱う。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Astro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TAU = Math.PI * 2;

  function rng(seed) {
    let a = seed >>> 0;
    const f = function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.logRange = (lo, hi) => Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * f());
    f.gauss = () => Math.sqrt(-2 * Math.log(1 - f())) * Math.cos(TAU * f());
    f.poisson = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= f(); } while (p > L && k < 50); return k - 1; };
    return f;
  }
  function hashSeed() {
    let h = 2166136261 >>> 0;
    for (const n of arguments) { h = Math.imul(h ^ (n | 0), 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b) >>> 0; }
    return h >>> 0;
  }

  // ---- 恒星(主系列)----
  // 初期質量関数 Kroupa(2001): dN/dm ∝ m^-1.3 (0.08–0.5), m^-2.3 (0.5–)
  function sampleMass(r, mMin, mMax) {
    mMin = mMin || 0.08; mMax = mMax || 100;
    const segs = [{ lo: 0.08, hi: 0.5, al: 1.3, w: 1 }, { lo: 0.5, hi: 150, al: 2.3, w: 0.5 }]
      .map((s) => ({ ...s, lo: Math.max(s.lo, mMin), hi: Math.min(s.hi, mMax) })).filter((s) => s.hi > s.lo);
    const area = (s) => s.w * (Math.pow(s.hi, 1 - s.al) - Math.pow(s.lo, 1 - s.al)) / (1 - s.al);
    const tot = segs.reduce((a, s) => a + area(s), 0);
    let u = r() * tot, seg = segs[segs.length - 1];
    for (const s of segs) { if (u < area(s)) { seg = s; break; } u -= area(s); }
    const e = 1 - seg.al, a = Math.pow(seg.lo, e), b = Math.pow(seg.hi, e);
    return Math.pow(a + r() * (b - a), 1 / e);
  }
  const starL = (m) => (m < 0.43 ? 0.23 * Math.pow(m, 2.3) : m < 2 ? Math.pow(m, 4) : m < 55 ? 1.4 * Math.pow(m, 3.5) : 32000 * m);
  const starR = (m) => (m < 1 ? Math.pow(m, 0.8) : Math.pow(m, 0.57));
  const starT = (L, R) => 5772 * Math.pow(L / (R * R), 0.25);
  const starLife = (m) => Math.min(1e5, 10 * m / starL(m)); // Gyr
  function spectralClass(T) {
    return T > 30000 ? 'O' : T > 10000 ? 'B' : T > 7500 ? 'A' : T > 6000 ? 'F' : T > 5200 ? 'G' : T > 3700 ? 'K' : 'M';
  }
  function blackbody(T) { // Tanner Helland 近似 → [r,g,b] 0..1
    const t = Math.min(40000, Math.max(1000, T)) / 100, c = (x) => Math.min(1, Math.max(0, x));
    const r = t <= 66 ? 1 : c(1.2929 * Math.pow(t - 60, -0.1332047592));
    const g = t <= 66 ? c(0.39008 * Math.log(t) - 0.63184) : c(1.12989 * Math.pow(t - 60, -0.0755148492));
    const b = t >= 66 ? 1 : t <= 19 ? 0 : c(0.5432 * Math.log(t - 10) - 1.19625);
    return [r, g, b];
  }
  function starFromMass(m, ageGyr) {
    const L = starL(m), R = starR(m), T = starT(L, R), life = starLife(m);
    return { mass: m, L, R, T, life, age: ageGyr, spec: spectralClass(T) };
  }

  // ---- 惑星の物理 ----
  const teq = (L, a, A) => 278.5 * Math.pow(L, 0.25) / Math.sqrt(a) * Math.pow(1 - A, 0.25); // K
  const jeans = (M, R, T) => { // 重い気体(N2)のジーンズ・パラメーター。>~100 で数十億年保持
    const vesc = 11186 * Math.sqrt(M / R); // m/s
    return vesc * vesc * 28 * 1.6605e-27 / (2 * 1.380649e-23 * T);
  };
  function solveKepler(M, e) {
    let E = e < 0.8 ? M : Math.PI;
    for (let i = 0; i < 30; i++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
    return E;
  }
  // ケプラー運動。a[AU], 周期[年]。戻り値 [x,y,z] AU
  function orbitPos(p, tYears) {
    const M = p.M0 + TAU * tYears / p.period;
    const E = solveKepler(((M % TAU) + TAU) % TAU, p.e);
    const x = p.a * (Math.cos(E) - p.e), y = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
    const cw = Math.cos(p.w), sw = Math.sin(p.w), ci = Math.cos(p.inc), si = Math.sin(p.inc), cO = Math.cos(p.node), sO = Math.sin(p.node);
    const x1 = x * cw - y * sw, y1 = x * sw + y * cw;
    const y2 = y1 * ci, z2 = y1 * si;
    return [x1 * cO - y2 * sO, z2, x1 * sO + y2 * cO]; // y を上方向に
  }
  function orbitPoints(p, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const E = TAU * i / n, x = p.a * (Math.cos(E) - p.e), y = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
      const cw = Math.cos(p.w), sw = Math.sin(p.w), ci = Math.cos(p.inc), si = Math.sin(p.inc), cO = Math.cos(p.node), sO = Math.sin(p.node);
      const x1 = x * cw - y * sw, y1 = x * sw + y * cw, y2 = y1 * ci, z2 = y1 * si;
      out.push([x1 * cO - y2 * sO, z2, x1 * sO + y2 * cO]);
    }
    return out;
  }

  // 惑星の分類・表面の性質(物理量から)
  function classify(p, star, r) {
    const L = star.L;
    p.teq = teq(L, p.a, p.albedo);
    p.g = p.massE / (p.radiusE * p.radiusE);
    p.vesc = 11.186 * Math.sqrt(p.massE / p.radiusE);
    p.density = 5.51 * p.massE / Math.pow(p.radiusE, 3);
    const giant = p.type === 'gas' || p.type === 'icegiant';
    if (giant) { p.atm = true; p.tsurf = p.teq; p.habitable = false; p.water = 0; p.kind = p.type; return p; }
    p.jeans = jeans(p.massE, p.radiusE, Math.max(p.teq, 50));
    p.atm = p.jeans > 100;
    if (p.massE < 0.02) p.atm = false;
    let ts = p.teq, kind = 'barren';
    if (p.atm) {
      if (p.teq > 1100) { kind = 'lava'; ts = p.teq + 50; }
      else if (p.teq > 320) { kind = 'venus'; ts = p.teq + 300; }
      else if (p.teq < 150) { kind = 'frozen'; ts = p.teq + 10; }
      else {
        ts = p.teq + 33;
        if (p.massE < 0.3) kind = 'desert';
        else if (ts < 273) kind = 'frozen';
        else if (ts > 373) kind = 'desert';
        else kind = 'earthlike';
      }
    } else if (p.teq > 1000) { kind = 'lava'; ts = p.teq; }
    p.tsurf = ts; p.kind = kind;
    p.habitable = kind === 'earthlike';
    p.water = p.habitable ? (p.water !== undefined ? p.water : r.range(0.25, 0.92)) : (kind === 'frozen' ? 0.4 : 0);
    return p;
  }

  // ---- 恒星系の生成 ----
  function makeSystem(spec) {
    const r = rng(spec.seed);
    const star = starFromMass(spec.mass, spec.age);
    const Z = spec.Z;
    const sqL = Math.sqrt(star.L);
    const snow = 2.7 * sqL, hz = [0.95 * sqL, 1.67 * sqL];
    const planets = [];
    const lam = Z < 0.04 ? 0.15 : 0.6 + 4.2 * Math.pow(Math.min(Z, 1.3), 0.7);
    let n = Math.min(9, r.poisson(lam * Math.min(1, 0.6 + spec.mass)));
    let a = r.logRange(0.04, 0.6) * Math.pow(star.L, 0.3);
    const aMax = 70 * Math.max(0.4, Math.sqrt(spec.mass));
    for (let i = 0; i < n && a < aMax; i++) {
      const outer = a > snow;
      const pG = outer ? Math.min(0.75, 0.15 + 0.5 * Math.min(Z, 1.5)) : 0.03 * Math.min(Z, 1.5);
      let type, massE, radiusE;
      if (r() < pG) {
        if (r() < 0.4) { type = 'icegiant'; massE = r.range(10, 25); radiusE = 3.9; }
        else { type = 'gas'; massE = r.logRange(40, 1500); radiusE = Math.min(13, Math.max(8, 11.2 * Math.pow(massE / 318, -0.04))); }
      } else {
        type = 'rock'; massE = r.logRange(0.05, 8); radiusE = Math.pow(massE, massE < 1 ? 0.3 : 0.27);
      }
      const p = {
        name: '惑星 ' + String.fromCharCode(98 + i), type, a, e: Math.pow(r(), 2.2) * (a < 0.1 ? 0.05 : 0.3),
        period: Math.sqrt(a * a * a / spec.mass), M0: r() * TAU, w: r() * TAU, node: r() * TAU, inc: (r.gauss() * 2) * Math.PI / 180,
        massE, radiusE, albedo: type === 'rock' ? 0.3 : 0.35, rotH: r.logRange(8, 70), tilt: r() < 0.1 ? r.range(60, 100) : r.range(0, 35), seed: r() * 100,
        tintA: [0.8, 0.7, 0.55], tintB: [0.6, 0.45, 0.35],
      };
      if (type === 'icegiant') { p.tintA = [0.45, 0.7, 0.85]; p.tintB = [0.3, 0.5, 0.75]; }
      else if (type === 'gas') { const k = r(); p.tintA = k < 0.5 ? [0.85, 0.72, 0.52] : [0.75, 0.8, 0.9]; p.tintB = k < 0.5 ? [0.6, 0.4, 0.28] : [0.45, 0.5, 0.65]; }
      p.albedo = type === 'rock' && teq(star.L, a, 0.3) > 700 ? 0.1 : p.albedo;
      classify(p, star, r);
      p.life = 0; // 生命の有無は第3段階で決める
      planets.push(p);
      a *= r.range(1.35, 2.1);
    }
    return { star, planets, hz, snow, Z, seed: spec.seed, real: false, name: spec.name || '名もなき恒星系' };
  }

  // ---- 実データ: 太陽系(NASA 惑星ファクトシート等の値)----
  const SOL = [
    // name, a[AU], e, period[yr], R[R⊕], M[M⊕], albedo, rot[h], tilt[°], type, incl[°]
    ['水星', 0.3871, 0.2056, 0.2408, 0.383, 0.0553, 0.088, 1407.6, 0.03, 'rock', 7.0],
    ['金星', 0.7233, 0.0068, 0.6152, 0.949, 0.815, 0.76, 5832.5, 177.4, 'rock', 3.39],
    ['地球', 1.0, 0.0167, 1.0, 1.0, 1.0, 0.306, 23.93, 23.44, 'rock', 0],
    ['火星', 1.5237, 0.0934, 1.8808, 0.532, 0.107, 0.25, 24.62, 25.19, 'rock', 1.85],
    ['木星', 5.2026, 0.0484, 11.862, 11.21, 317.8, 0.343, 9.925, 3.13, 'gas', 1.3],
    ['土星', 9.5549, 0.0539, 29.457, 9.45, 95.16, 0.342, 10.66, 26.73, 'gas', 2.49],
    ['天王星', 19.2184, 0.0473, 84.01, 4.01, 14.54, 0.3, 17.24, 97.77, 'icegiant', 0.77],
    ['海王星', 30.1104, 0.0086, 164.8, 3.88, 17.15, 0.29, 16.11, 28.32, 'icegiant', 1.77],
  ];
  function solarSystem() {
    const r = rng(1969);
    const star = starFromMass(1, 4.6);
    star.T = 5772; star.L = 1; star.R = 1;
    const planets = SOL.map((s, i) => {
      const p = { name: s[0], type: s[9], a: s[1], e: s[2], period: s[3], radiusE: s[4], massE: s[5], albedo: s[6], rotH: s[7], tilt: s[8],
        inc: s[10] * Math.PI / 180, M0: r() * TAU, w: r() * TAU, node: r() * TAU, seed: 7 + i * 3.1, tintA: [0.8, 0.7, 0.55], tintB: [0.6, 0.45, 0.35], real: true };
      if (s[0] === '木星') { p.tintA = [0.88, 0.78, 0.62]; p.tintB = [0.62, 0.42, 0.3]; }
      if (s[0] === '土星') { p.tintA = [0.9, 0.82, 0.6]; p.tintB = [0.7, 0.6, 0.42]; }
      if (s[0] === '天王星') { p.tintA = [0.6, 0.85, 0.88]; p.tintB = [0.5, 0.78, 0.85]; }
      if (s[0] === '海王星') { p.tintA = [0.25, 0.4, 0.85]; p.tintB = [0.2, 0.3, 0.7]; }
      classify(p, star, r);
      // 実際の姿に合わせた上書き
      if (s[0] === '水星') { p.atm = false; p.kind = 'barren'; p.tsurf = 440; }
      if (s[0] === '金星') { p.atm = true; p.kind = 'venus'; p.tsurf = 737; }
      if (s[0] === '地球') { p.atm = true; p.kind = 'earthlike'; p.tsurf = 288; p.water = 0.71; p.habitable = true; p.life = 1; }
      if (s[0] === '火星') { p.atm = true; p.kind = 'desert'; p.tsurf = 210; p.water = 0; p.habitable = false; }
      if (p.life === undefined) p.life = 0;
      return p;
    });
    return { star, planets, hz: [0.95, 1.67], snow: 2.7, Z: 1, seed: 1969, real: true, name: '太陽系' };
  }

  // ---- 銀河 ----
  function galaxyType(Mh) { return Mh > 8e12 ? 'cD' : Mh > 3e12 ? 'elliptical' : Mh > 2e11 ? 'spiral' : 'dwarf'; }
  const TYPE_JP = { cD: '巨大楕円銀河(銀河団の中心)', elliptical: '楕円銀河', spiral: '渦巻銀河', dwarf: '矮小銀河' };
  function galaxyFromHalo(Mh, r, tNow) {
    const type = galaxyType(Mh);
    const x = Mh / 2e12;
    const fstar = 0.03 * 2 / (Math.pow(x, -0.9) + Math.pow(x, 0.6));
    const Mstar = Mh * fstar;
    const g = { type, Mh, Mstar, seed: Math.floor(r() * 1e9) };
    const s = Mstar / 5e10;
    if (type === 'spiral') { g.h = 2.6 * Math.pow(s, 0.3); g.R = 6 * g.h; g.bulgeA = 0.7 * Math.pow(s, 0.3); g.fb = 0.2; }
    else if (type === 'dwarf') { g.h = 1.0 * Math.pow(Math.max(s, 1e-3), 0.3); g.R = 5 * g.h; }
    else { g.Re = (type === 'cD' ? 28 : 5) * Math.pow(Mstar / 1e11, type === 'cD' ? 0.5 : 0.6); g.R = 5 * g.Re; }
    g.tForm = Math.min(tNow * 0.6, r.range(0.3, 1.5) + (type === 'dwarf' ? 0.5 : 0));
    g.Zmax = Math.min(2.5, 1.4 * Math.pow(Math.max(s, 1e-3), 0.28));
    return g;
  }
  const metallicity = (gal, birth, rKpc) => Math.min(2.5, Math.max(0.002, gal.Zmax * (1 - Math.exp(-(birth - gal.tForm + 0.3) / 2.5)) * Math.pow(10, -0.06 * (rKpc - 8))));

  // 見た目用の星の標本: 半径r・方位θ・高さz[kpc]、質量、誕生時刻
  function genStars(gal, n, tNow, r) {
    const out = { r: new Float32Array(n), th: new Float32Array(n), z: new Float32Array(n), mass: new Float32Array(n), birth: new Float32Array(n), arm: new Uint8Array(n) };
    const hern = (a) => { const u = Math.min(0.999, r()); const s = Math.sqrt(u); return a * s / (1 - s); };
    const dirSph = (rad, flat) => { const ct = r.range(-1, 1), ph = r() * TAU, st = Math.sqrt(1 - ct * ct); return [rad * st * Math.cos(ph), rad * ct * flat, rad * st * Math.sin(ph)]; };
    for (let i = 0; i < n; i++) {
      let comp, birth, x, y, z, arm = 0;
      if (gal.type === 'spiral') comp = (() => { const u = r(); return u < gal.fb ? 0 : u < 0.97 ? 1 : 2; })();
      else if (gal.type === 'dwarf') comp = 3; else comp = 4;
      if (comp === 0) birth = gal.tForm + r.range(0, 1.5);
      else if (comp === 2) birth = gal.tForm + r.range(0, 0.5);
      else if (comp === 1 || comp === 3) birth = gal.tForm + 1 + (tNow - gal.tForm - 1) * Math.pow(r(), 0.8);
      else birth = gal.tForm + r.range(0, 2.5);
      birth = Math.min(birth, tNow - 0.01);
      const age = tNow - birth;
      let m = 0.4;
      for (let k = 0; k < 24; k++) { m = sampleMass(r, 0.3, 60); if (starLife(m) > age) break; if (k === 23) m = 0.3; }
      if (comp === 0) { const p = dirSph(hern(gal.bulgeA), 0.7); [x, y, z] = [p[0], p[2], p[1]]; }
      else if (comp === 1) {
        const rr = Math.min(gal.R * 1.3, gal.h * (-Math.log(1 - r()) - Math.log(1 - r())));
        let th;
        const pArm = age < 2 ? 0.7 : age < 6 ? 0.4 : 0.15;
        if (r() < pArm) { th = 4.0 * Math.log(Math.max(rr, 0.3) / 1.0) + (r() < 0.5 ? 0 : Math.PI) + r.gauss() * 0.3; arm = 1; }
        else th = r() * TAU;
        const hz = (age > 6 ? 0.9 : 0.3) * (gal.h / 2.6);
        const u = Math.min(0.999, Math.max(0.001, r()));
        x = rr * Math.cos(th); y = rr * Math.sin(th); z = hz * 0.5 * Math.log(u / (1 - u));
      } else if (comp === 2) { const p = dirSph(hern(12), 1); [x, y, z] = [p[0], p[2], p[1]]; }
      else if (comp === 3) {
        const rr = gal.h * 0.9 * (-Math.log(1 - r()) - Math.log(1 - r())), th = r() * TAU;
        x = rr * Math.cos(th); y = rr * Math.sin(th); z = gal.h * 0.35 * r.gauss();
      } else { const p = dirSph(hern(gal.Re / 1.8), 0.75); [x, y, z] = [p[0], p[2], p[1]]; }
      out.r[i] = Math.hypot(x, y); out.th[i] = Math.atan2(y, x); out.z[i] = z; out.mass[i] = m; out.birth[i] = birth; out.arm[i] = arm;
    }
    return out;
  }

  return {
    rng, hashSeed, sampleMass, starL, starR, starT, starLife, starFromMass, spectralClass, blackbody,
    teq, jeans, solveKepler, orbitPos, orbitPoints, classify, makeSystem, solarSystem,
    galaxyType, TYPE_JP, galaxyFromHalo, genStars, metallicity,
  };
});
