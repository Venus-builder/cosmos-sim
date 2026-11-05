/* 第3c〜3d段階: 生態系(群れ・個体・進化・絶滅)。確率モデル(仮説)。
 * 一定の広さ(0.8km四方、端はつながる)にいる動物を「一匹ずつ」動かす。個体は餌を食べ、逃げ、追い、
 * 配偶者と子を作り、遺伝子(大きさ・速さ・肉食度・群れやすさ・効率)を少しずつ変えて子に伝える。
 * 餌の取り合いから種が分かれ(種分化)、数が減れば絶える(絶滅)。隕石・氷期・噴火で大量絶滅も起こせる。
 * 進化を見やすくするため、世代あたりの変異は実際より大きく(誇張して)あります。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Eco = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const L = 0.8, G = 8, CELL = L / G, MAXN = 900, DT = 0.1, NR = 5, OPT = [0.45, 0.75, 1.1, 1.55, 2.1]; // 餌の種類(植物の大きさ)ごとに、合う動物の大きさがちがう
  const GS = [0.5, 0.5, 0.4, 0.4, 0.5]; // 遺伝子ごとの尺度(種の違いの測り方)
  const SYL = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'タ', 'チ', 'テ', 'ト', 'ナ', 'ニ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ホ', 'マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'ロ'];
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function create(opts) {
    const rnd = mulberry((opts.seed >>> 0) || 1), blocked = opts.blocked || (() => false);
    const w = { year: 0, species: [], inds: [], log: [], events: 0, cover: opts.cover === undefined ? 0.85 : opts.cover, coverMul: 1, nextId: 1, extinctCount: 0, born: 0, died: 0 };
    const gR = Array.from({ length: NR }, () => new Float32Array(G * G).fill(0.8)), fert = new Float32Array(G * G);
    for (let i = 0; i < G * G; i++) fert[i] = 0.55 + 0.9 * rnd();
    const nm = () => { let s = ''; const n = 2 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) s += SYL[Math.floor(rnd() * SYL.length)]; return s; };
    const say = (text, kind) => { w.log.push({ year: w.year, text, kind: kind || '' }); if (w.log.length > 200) w.log.shift(); };

    function addSpecies(vis, parent, centroid) {
      const sp = { id: w.species.length, parent: parent === undefined ? -1 : parent, born: w.year, ext: null, vis, name: vis.name, count: 0, cen: centroid.slice(), peak: 0 };
      w.species.push(sp); return sp;
    }
    function genesFor(vis, role) {
      const diet = role === 'carn' ? 0.85 + 0.1 * rnd() : role === 'omni' ? 0.45 : 0.05 + 0.1 * rnd();
      return [clamp(vis.sizeRel || (role === 'carn' ? 1.3 : 0.6 + 1.0 * rnd()), 0.4, 2.5), clamp((vis.speed || 1) * (0.8 + 0.4 * rnd()), 0.3, 2.5), diet, 0.2 + 0.7 * rnd(), 0.8 + 0.4 * rnd()];
    }
    function addInd(spId, g, mother, x, z, age) {
      const sp = w.species[spId], id = w.nextId++, size = g[0];
      const a = { id, sp: spId, sex: rnd() < 0.5 ? 0 : 1, age: age === undefined ? rnd() * 3 : age, e: 100 * size * (0.8 + 0.5 * rnd()), x, z, vx: 0, vz: 0, g, mother: mother ? mother.id : -1, born: w.year, alive: true, name: nm(), act: '歩く' };
      w.inds.push(a); sp.count++; if (sp.count > sp.peak) sp.peak = sp.count; w.born++; return a;
    }
    // 初期の種: 外から渡された見た目の一覧から作る(4つに1つは肉食)
    const SIZES = [0.5, 0.75, 1.1, 1.55, 2.1, 0.9, 1.3, 1.8];
    const pool = (opts.species || []).map((vis, i) => ({ vis, role: i % 4 === 3 ? 'carn' : i % 6 === 5 ? 'omni' : 'herb', size: SIZES[i % SIZES.length] }));
    w.pool = pool;
    function introduce(p, n) {
      const v = Object.assign({}, p.vis); v.sizeRel = p.role === 'carn' ? 1.3 : p.size;
      if (w.species.some((q) => q.vis.name === v.name)) v.name = nm() + v.name.slice(-1);
      const g = genesFor(v, p.role), sp = addSpecies(v, -1, g);
      for (let k = 0; k < n; k++) addInd(sp.id, g.map((x, j) => clamp(x + (rnd() - 0.5) * 0.12 * GS[j], 0.3, 2.6)), null, rnd() * L, rnd() * L, rnd() * 4);
      return sp;
    }
    pool.forEach((p) => introduce(p, p.role === 'carn' ? 10 : 16));
    const cellOf = (x, z) => Math.min(G - 1, Math.floor(x / CELL)) + G * Math.min(G - 1, Math.floor(z / CELL));
    const wrap = (v) => ((v % L) + L) % L;
    const dd = (a, b) => { let d = Math.abs(a - b); return d > L / 2 ? L - d : d; };
    const sdir = (a, b) => { let d = b - a; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; };

    let grid = null;
    function buildGrid() { // 近くの個体を探すための格子(0.1km)
      grid = Array.from({ length: G * G }, () => []);
      for (const a of w.inds) if (a.alive) grid[cellOf(a.x, a.z)].push(a);
    }
    function nearby(a, r, fn) {
      const cx = Math.min(G - 1, Math.floor(a.x / CELL)), cz = Math.min(G - 1, Math.floor(a.z / CELL)), rc = Math.ceil(r / CELL);
      for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) { const c = ((cx + dx + G) % G) + G * ((cz + dz + G) % G); for (const b of grid[c]) if (b !== a && b.alive) fn(b); }
    }

    function step(dt) {
      w.year += dt; w.stepN = (w.stepN || 0) + 1;
      // 植物の再生(草: 小さな動物向き、茂み: 大きな動物向き)
      const cm = w.cover * w.coverMul;
      for (let i = 0; i < G * G; i++) {
        const cap = cm * fert[i];
        for (let k = 0; k < NR; k++) { const gk = gR[k], rr = 6 - k * 0.9; gk[i] += (rr * gk[i] * (1 - gk[i] / cap) + 0.1) * dt; if (gk[i] < 0.02) gk[i] = 0.02; }
      }
      if (w.coverMul < 1) w.coverMul = Math.min(1, w.coverMul + 0.04 * dt);
      buildGrid();
      const byS = new Map(); for (const a of w.inds) { let l = byS.get(a.sp); if (!l) byS.set(a.sp, l = []); l.push(a); }
      const L0 = w.inds.length;
      for (let i = 0; i < L0; i++) {
        const a = w.inds[i]; if (!a.alive) continue;
        const sp = w.species[a.sp], g = a.g, size = g[0], diet = g[2];
        a.age += dt;
        let tx = 0, tz = 0, spd = 0.00025 * g[1] * (dt / 0.1), act = '歩く', mate = null;
        const think = ((w.stepN + a.id) % 3) === 0 || a.tx === undefined; // 周りを見て判断するのは3ステップに1回(軽くするため)
        if (think) {
        // 逃げる / 追う / 群れる
        let pred = null, pd = 0.05, prey = null, qd = 0.08, herdX = 0, herdZ = 0, hn = 0, md = 0.12;
        nearby(a, 0.12, (b) => {
          const d = Math.hypot(sdir(a.x, b.x), sdir(a.z, b.z));
          if (b.g[2] > 0.5 && diet < 0.5 && b.g[0] > size * 0.7 && d < pd) { pred = b; pd = d; }
          if (diet > 0.5 && b.g[2] < 0.5 && b.g[0] < size * 1.4 && d < qd) { prey = b; qd = d; }
          if (b.sp === a.sp) { if (d < 0.12) { herdX += sdir(a.x, b.x); herdZ += sdir(a.z, b.z); hn++; } if (d < md && b.age > 1) { mate = b; md = d; } }
        });
        if (pred) { const d = Math.max(pd, 1e-4); tx = -sdir(a.x, pred.x) / d; tz = -sdir(a.z, pred.z) / d; spd *= 1.5; act = '逃げる'; }
        else if (prey) {
          const d = Math.max(qd, 1e-4); tx = sdir(a.x, prey.x) / d; tz = sdir(a.z, prey.z) / d; spd *= 1.6; act = '追う';
          if (qd < 0.008) { // 捕まえるか。群れている獲物は捕まえにくい
            const pc = clamp(1.2 * (g[1] / Math.max(0.3, prey.g[1])) * (1 - 0.5 * prey.g[3]), 0.1, 0.95);
            if (rnd() < pc) { prey.alive = false; prey.cause = '捕食'; w.species[prey.sp].count--; w.died++; a.e += 90 * prey.g[0] * Math.min(1, 1.3 * size / prey.g[0] + 0.3); act = '食べる'; }
          }
        } else {
          if (hn > 0) { tx += (herdX / hn) * g[3] * 30; tz += (herdZ / hn) * g[3] * 30; }
          if (a.age > 1 && !mate) { // 相手を探す: 同種の異性のうち、いちばん近い個体のほうへ向かう
            let best = null, bd = 9; const l = byS.get(a.sp);
            for (let q = 0; q < l.length && q < 80; q++) { const b = l[q]; if (b === a || b.age <= 1) continue; const d = Math.hypot(sdir(a.x, b.x), sdir(a.z, b.z)); if (d < bd) { bd = d; best = b; } }
            if (best) { tx += sdir(a.x, best.x) / bd * 3; tz += sdir(a.z, best.z) / bd * 3; spd *= 1.2; }
          }
          tx += (rnd() - 0.5) * 1.5; tz += (rnd() - 0.5) * 1.5;
        }
        a.tx = tx; a.tz = tz; a.sfac = spd / (0.00025 * g[1] * (dt / 0.1)); a.act0 = act;
        } else { tx = a.tx; tz = a.tz; spd *= a.sfac; act = a.act0 === '逃げる' || a.act0 === '追う' ? a.act0 : '歩く'; }
        // 食べる(草食・雑食): 自分の大きさに合う植物から
        if (diet < 0.7 && act !== '逃げる') {
          const c = cellOf(a.x, a.z); let took = 0;
          for (let k = 0; k < NR; k++) { const eff = Math.exp(-Math.pow((size - OPT[k]) / 0.3, 2)); if (eff < 0.02) continue; const t = Math.min(gR[k][c], 0.6 * dt * size * eff); gR[k][c] -= t; took += t; }
          a.e += took * 220 * g[4] * (1 - diet); if (took > 0.002 * size) act = '食べる';
        }
        // 体力: 代謝で減る
        a.e -= (16 * Math.pow(size, 0.75) / g[4]) * dt * (1 + 0.5 * g[1] * 0.3);
        // 移動(水の上には行かない)
        const tl = Math.hypot(tx, tz) || 1, nx = wrap(a.x + (tx / tl) * spd), nz = wrap(a.z + (tz / tl) * spd);
        if (!blocked(nx, nz)) { a.vx = (tx / tl) * spd; a.vz = (tz / tl) * spd; a.x = nx; a.z = nz; } else { act = '休む'; a.vx = a.vz = 0; }
        if (act === '歩く' && a.e < 60 * size) act = '探す';
        a.act = act;
        // 繁殖: 体力があり、近くに同種のオスがいるとき
        if (think && a.age > 1.2 && a.e > 75 * size && mate && w.inds.length < MAXN && rnd() < Math.min(0.9, 1.5 * (dt / 0.1)) * Math.max(0.03, 1 - w.inds.length / 600)) {
          const kids = 1 + (rnd() < 0.3 ? 1 : 0);
          for (let k = 0; k < kids; k++) {
            const cg = g.map((v, j) => clamp((v + mate.g[j]) / 2 + (rnd() + rnd() + rnd() - 1.5) * (j === 2 ? 0.004 : 0.07) * GS[j] * 1.7, j === 2 ? 0 : 0.3, j === 2 ? 1 : 2.6));
            const kid = addInd(a.sp, cg, a, wrap(a.x + (rnd() - 0.5) * 0.01), wrap(a.z + (rnd() - 0.5) * 0.01), 0);
            kid.e = 50 * cg[0]; a.e -= 35 * size;
          }
        }
        // 死亡: 餓え・老衰
        const maxAge = 22 + 10 * size;
        if (a.e <= 0) { a.alive = false; a.cause = '飢え'; sp.count--; w.died++; }
        else if (a.age > maxAge && rnd() < 0.3 * dt * 5) { a.alive = false; a.cause = '老衰'; sp.count--; w.died++; }
      }
      // 死んだ個体を取り除く
      if (w.inds.some((a) => !a.alive)) w.inds = w.inds.filter((a) => a.alive);
      w.epochT = (w.epochT || 0) + dt;
      if (w.epochT >= 2) { w.epochT = 0; epoch(); }
      // まわりの土地から、動物が入ってくることがある(この区画の外にも同じ種がいる)
      if (w.pool.length && rnd() < dt / 45) {
        const alive = new Set(w.species.filter((s) => s.ext === null && s.count > 0).map((s) => s.vis.name));
        const cand = w.pool.filter((p) => !alive.has(p.vis.name));
        if (cand.length) { const p = cand[Math.floor(rnd() * cand.length)], sp = introduce(p, p.role === 'carn' ? 5 : 10); say('移入: ' + sp.name + ' が周辺から入ってきた', 'in'); }
      }
      // 自然に起こる大量絶滅(1500年に1度ほどの頻度)
      if (rnd() < dt / 1500) event(['asteroid', 'ice', 'volcano'][Math.floor(rnd() * 3)], 0.35 + 0.5 * rnd());
    }

    // 2年ごと: 絶滅の記録と種分化(餌の取り合いで、遺伝子が2つの山に分かれた種を2つに分ける)
    function epoch() {
      for (const sp of w.species) if (sp.ext === null && sp.count <= 0) { sp.ext = w.year; w.extinctCount++; say('絶滅: ' + sp.name, 'ext'); }
      for (const sp of w.species.slice()) {
        if (sp.ext !== null || sp.count < 16) continue;
        const mem = w.inds.filter((a) => a.sp === sp.id);
        for (const gene of [0, 2, 1]) {
          const vals = mem.map((a) => a.g[gene]).sort((x, y) => x - y);
          let best = 0, bi = -1;
          for (let i = 5; i < vals.length - 5; i++) { const gap = vals[i + 1] - vals[i]; if (gap > best) { best = gap; bi = i; } }
          if (bi >= 0 && best > 0.2 * GS[gene]) {
            const cut = (vals[bi] + vals[bi + 1]) / 2, hi = mem.filter((a) => a.g[gene] > cut);
            const cen = [0, 1, 2, 3, 4].map((j) => hi.reduce((s, a) => s + a.g[j], 0) / hi.length);
            const vis = Object.assign({}, sp.vis); vis.name = nm() + sp.vis.name.slice(-1); vis.col = sp.vis.col.map((v) => clamp(v * (0.75 + 0.5 * rnd()), 0, 1)); vis.col2 = sp.vis.col2.map((v) => clamp(v * (0.75 + 0.5 * rnd()), 0, 1));
            const ns = addSpecies(vis, sp.id, cen);
            for (const a of hi) { a.sp = ns.id; sp.count--; ns.count++; }
            ns.peak = ns.count;
            say('種分化: ' + sp.name + ' から ' + ns.name + ' が分かれた(' + ['大きさ', '速さ', '肉食度'][[0, 1, 2].indexOf(gene)] + 'の違い)', 'spec');
            break;
          }
        }
      }
    }
    function event(kind, sev) {
      w.events++;
      const jp = { asteroid: '隕石の衝突', ice: '氷期', volcano: '大噴火' }[kind];
      let killed = 0;
      for (const a of w.inds) {
        const size = a.g[0];
        const p = kind === 'asteroid' ? sev * (0.35 + 0.5 * size / 2.5) : kind === 'ice' ? sev * (0.5 + 0.2 * (size > 1 ? 1 : 0) + 0.15 * (a.g[2] > 0.5 ? 1 : 0)) : sev * 0.55;
        if (rnd() < p) { a.alive = false; a.cause = jp; w.species[a.sp].count--; w.died++; killed++; }
      }
      w.inds = w.inds.filter((a) => a.alive);
      w.coverMul = kind === 'ice' ? 0.55 : kind === 'volcano' ? 0.5 : 0.35;
      say('大量絶滅【' + jp + '】: 個体の ' + Math.round(100 * killed / Math.max(1, killed + w.inds.length)) + '% が死んだ', 'mass');
      epoch();
    }
    function run(years) { // 経過した年数だけ進める(1ステップ=0.1年)。多すぎるときは打ち切って、進んだ年数を返す
      let n = 0; const t0 = Date.now();
      while (years > 0 && Date.now() - t0 < 4) { const d = Math.min(DT, years); step(d); years -= d; n++; }
      return n * DT;
    }
    function list() {
      return w.species.map((sp) => {
        const mem = w.inds.filter((a) => a.sp === sp.id), n = mem.length || 1;
        const mean = (j) => mem.reduce((s, a) => s + a.g[j], 0) / n;
        return { id: sp.id, parent: sp.parent, name: sp.name, count: mem.length, born: sp.born, ext: sp.ext, peak: sp.peak, size: mean(0), speed: mean(1), diet: mean(2), kind: sp.vis.kind };
      });
    }
    function tree() {
      const sp = list(), out = [];
      const walk = (id, depth) => { const s = sp[id]; out.push({ depth, ...s }); sp.filter((x) => x.parent === id).forEach((c) => walk(c.id, depth + 1)); };
      sp.filter((s) => s.parent < 0).forEach((s) => walk(s.id, 0));
      return out;
    }
    function plantFrac() { let s = 0; for (let i = 0; i < G * G; i++) { let m = 0; for (let k = 0; k < NR; k++) m += gR[k][i]; s += m / NR / Math.max(0.05, w.cover * fert[i]); } return clamp(s / (G * G), 0, 1.2); }
    w.step = step; w.run = run; w.event = event; w.list = list; w.tree = tree; w.plantFrac = plantFrac; w.L = L;
    w.stats = () => ({ year: w.year, n: w.inds.length, alive: w.species.filter((s) => s.ext === null && s.count > 0).length, total: w.species.length, extinct: w.extinctCount, events: w.events, born: w.born, died: w.died });
    return w;
  }
  return { create, L };
});
