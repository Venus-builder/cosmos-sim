/* 第3a段階: 惑星の環境の時間変化(物理層)。生命が可能な期間を求める。
 * 恒星の増光、放射平衡、温室効果の自己調整(簡略)、大気の保持、潮汐固定を扱う。
 * 単位: 時間 Gyr、距離 AU、質量 M⊕/M☉、温度 K。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Life = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const g = (x) => 1 / (1 + 0.4 * (1 - x / 0.457)); // Gough(1981): 太陽の増光

  // 恒星の光度の時間変化。寿命が30Gyr以下の星は主系列での増光を入れ、長寿の星は一定とする。
  function starLumAt(star, tau) {
    if (star.life > 30) return star.L;
    const x = Math.min(Math.max(tau, 0) / star.life, 1);
    return star.L * g(x) / g(0.457);
  }

  const TEQ = (S, A) => 278.5 * Math.pow(S, 0.25) * Math.pow(1 - A, 0.25); // S: 地球が受ける光の量=1

  // 時刻 tau(恒星の年齢[Gyr])での惑星の状態
  function stateAt(p, star, tau) {
    const L = starLumAt(star, tau);
    const S = L / (p.a * p.a);
    const teq = TEQ(S, p.albedo);
    if (p.type === 'gas' || p.type === 'icegiant') return { S, teq, ts: teq, state: 'giant', liquid: false };
    const vesc = 11186 * Math.sqrt(p.massE / p.radiusE);
    const jeans = vesc * vesc * 28 * 1.6605e-27 / (2 * 1.380649e-23 * Math.max(teq, 50));
    if (jeans < 100 || p.massE < 0.02) return { S, teq, ts: teq, state: 'airless', liquid: false };
    if (p.massE < 0.3) { // 小さい惑星: 火山活動が弱く、温室効果の自己調整が働かない
      const ts = teq + 5;
      return { S, teq, ts, state: ts < 273 ? 'frozen' : 'dry', liquid: false };
    }
    if (S > 1.1) return { S, teq, ts: teq + 300, state: 'runaway', liquid: false };
    if (S < 0.36) { const ts = teq + 60; return { S, teq, ts, state: ts < 273 ? 'frozen' : 'temperate', liquid: ts >= 273 && ts <= 373 }; }
    const gh = Math.min(70, Math.max(10, 33 + 0.8 * (255 - teq))); // 炭酸塩・ケイ酸塩サイクルによる自己調整(簡略)
    const ts = teq + gh;
    return { S, teq, ts, state: ts < 273 ? 'frozen' : ts > 373 ? 'scorched' : 'temperate', liquid: ts >= 273 && ts <= 373 };
  }

  // 潮汐固定にかかる時間[Gyr](Gladman ほか 1996 の近似式)
  function tidalLockGyr(p, star) {
    const G = 6.674e-11, a = p.a * 1.496e11, m = p.massE * 5.972e24, R = p.radiusE * 6.371e6, Ms = star.mass * 1.989e30;
    const w = 2 * Math.PI / (12 * 3600), Q = 100, k2 = 0.3;
    const t = 0.4 * w * Math.pow(a, 6) * m * Q / (3 * G * Ms * Ms * k2 * Math.pow(R, 3));
    return t / 3.156e7 / 1e9;
  }

  // 惑星の環境の履歴。窓(液体の水が可能な連続期間)と現在の状態を返す。
  function environment(p, star, ageNow, steps) {
    steps = steps || 300;
    const range = Math.min(star.life, Math.max(15, ageNow * 1.6));
    const seg = [];
    let cur = null;
    for (let i = 0; i < steps; i++) {
      const tau = (i + 0.5) / steps * range, s = stateAt(p, star, tau);
      if (!cur || cur.state !== s.state || cur.liquid !== s.liquid) { cur = { from: tau - range / steps / 2, to: tau, state: s.state, liquid: s.liquid }; seg.push(cur); }
      else cur.to = tau + range / steps / 2;
    }
    seg[0].from = 0; seg[seg.length - 1].to = range;
    const windows = seg.filter((x) => x.liquid).map((x) => [x.from, x.to]);
    const longest = windows.reduce((m, w) => Math.max(m, w[1] - w[0]), 0);
    const now = stateAt(p, star, Math.min(ageNow, range));
    const w = windows.find((x) => x[0] <= ageNow && ageNow <= x[1]);
    const lock = tidalLockGyr(p, star);
    return { range, seg, windows, longest, now, nowLiquid: !!w, windowEnd: w ? w[1] : null, lockGyr: lock, locked: lock < ageNow, starEnds: star.life };
  }

  const STATE_JP = { temperate: '温暖(液体の水が存在しうる)', frozen: '全球凍結', scorched: '高温(水は蒸発)', runaway: '暴走温室(金星型)', airless: '大気なし', dry: '薄い大気・乾燥', giant: 'ガス・氷の巨大惑星' };
  const STATE_COLOR = { temperate: '#3b82f6', frozen: '#94a3b8', scorched: '#f97316', runaway: '#ef4444', airless: '#475569', dry: '#a16207', giant: '#64748b' };


  // ------------------------------------------------------------------ 第3b〜3d: 生命の段階と生き物(確率モデル=仮説)
  // 段階の遷移は「液体の水がある期間」だけ進むポアソン過程。待ち時間の平均は地球の実績(約45億年で知的生命)を目安にした。
  const STAGE_JP = ['生命なし', '前生物化学(有機分子)', '原始的な膜・自己複製', '単純な生命(微生物)', '光合成', '真核生物', '多細胞生物', '複雑な生態系(動物・植物)', '神経系・脳をもつ動物', '知的生命'];
  // 各段階は水環境での化学反応・自然選択の積算時間に依存。値は仮説モデル。
  const MEAN = [0.35, 0.25, 1.2, 1.0, 1.1, 0.45, 0.2, 0.4, 0.6]; // Gyr(液体の水がある期間での平均待ち時間)
  const mb = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cfg = { ease: 1 }; // 大きいほど生命が生まれにくい世界

  function habToAge(windows, hab) { // 液体の水がある期間を hab[Gyr] 積算した時点の恒星の年齢
    let acc = 0;
    for (const [a, b] of windows) { if (acc + (b - a) >= hab) return a + (hab - acc); acc += b - a; }
    return null;
  }
  function biosphere(p, star, ageNow, env, seed) {
    if (p.life && p.real !== false && p.name === '地球') return { stage: 9, real: true, intelligent: true, extinct: false, times: [], ageNow };
    if (p.type !== 'rock' || !env || !env.windows.length) return { stage: 0, extinct: false, times: [], ageNow, intelligent: false };
    const r = mb(Math.floor(seed * 1000003) ^ 0x9e3779b1);
    // 「生命を配置」するのではなく、海・温度・化学材料がそろった時だけ起源イベントを発生させる。
    const chemistry = (p.water || 0) * Math.max(0, Math.min(1, (env.now.ts - 180) / 120)) * (p.atm ? 1 : 0.35);
    const originWait = chemistry > 0.08 ? -0.7 * cfg.ease * Math.log(1 - r()) / chemistry : Infinity;
    const originAge = habToAge(env.windows, originWait);
    const times = [originAge]; let hab = originWait;
    for (let i = 0; i < MEAN.length; i++) { hab += -MEAN[i] * cfg.ease * Math.log(1 - r()); times.push(habToAge(env.windows, hab)); }
    let stage = 0; for (let i = 0; i < times.length; i++) if (times[i] !== null && times[i] <= ageNow) stage = i + 1;
    const extinct = stage > 0 && !env.nowLiquid;
    const origin = originAge === null ? null : { age: originAge, route: ['浅い海の有機物＋雷・紫外線','海底熱水噴出孔の化学反応','鉱物表面での分子反応'][Math.floor(r()*3)], molecules: ['水','炭素化合物','窒素化合物','リン・硫黄化合物'] };
    const raceName = stage >= 9 ? ['ア','エ','オ','カ','キ','ク','サ','シ','タ','ト','ナ','ネ','ハ','ミ','ラ','リ'][Math.floor(r()*16)] + ['ル','ン','ア','イ','オ','カ','ス','ト','ム','ラ'][Math.floor(r()*10)] + ['族','人','民','種'][Math.floor(r()*4)] : null;
    const brainAt = times[8], intellectAt = times[9];
    const span = brainAt !== null && intellectAt !== null ? Math.max(1e-6, intellectAt - brainAt) : 1;
    const cognitiveAge = brainAt === null ? 0 : Math.max(0, ageNow - brainAt);
    const intelligence = brainAt === null ? 0 : Math.max(0, Math.min(1, cognitiveAge / span));
    // 段階は 0〜9 に収める(9=知的生命。10番目の時刻は、知能がじゅうぶん育つまでの目安として intelligence の計算にだけ使う)
    return { stage: extinct ? 0 : Math.min(9, stage), peak: Math.min(9, stage), extinct, times, origin, raceName, ageNow, intelligence, intelligent: !extinct && stage >= 9 };
  }
  const SYL2 = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'タ', 'チ', 'テ', 'ト', 'ナ', 'ニ', 'ネ', 'ノ', 'ハ', 'ヒ', 'フ', 'ホ', 'マ', 'ミ', 'ム', 'メ', 'モ', 'ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'ロ'];
  // 生き物(種)を手続き生成する。実在の生物の再現ではなく、惑星の条件と乱数から作る。
  // 植物の色: 地球は緑。ほかの惑星は、緑が多めだが紫・赤・黄・青緑・黒もありうる(光合成の色は恒星の光で変わる、という仮説)
  const PLANT_PAL = [
    [[0.10, 0.28, 0.07], [0.26, 0.42, 0.12]], [[0.45, 0.40, 0.08], [0.70, 0.62, 0.15]], [[0.45, 0.12, 0.06], [0.70, 0.30, 0.12]],
    [[0.22, 0.08, 0.32], [0.45, 0.20, 0.55]], [[0.05, 0.30, 0.30], [0.12, 0.50, 0.55]], [[0.04, 0.04, 0.05], [0.12, 0.10, 0.14]],
  ];
  function plantColor(p, star) {
    if (p.name === '地球' && p.life) { const A = PLANT_PAL[0][0]; return { a: A, b: A.map((v) => Math.min(1, v * 1.55 + 0.02)), idx: 0 }; }
    const r = mb(Math.floor((p.seed || 1) * 131071) ^ 0x2545f491), cool = star.T < 3800;
    const W = cool ? [0.34, 0.08, 0.05, 0.22, 0.08, 0.23] : [0.62, 0.12, 0.1, 0.06, 0.06, 0.04];
    let x = r(), idx = 0; for (; idx < 5; idx++) { x -= W[idx]; if (x < 0) break; }
    const j = () => 0.9 + 0.2 * r(), pal = PLANT_PAL[idx];
    const A = pal[0].map((v) => Math.min(1, v * j()));
    return { a: A, b: A.map((v) => Math.min(1, v * 1.55 + 0.02)), idx, black: idx === 5 };
  }
  function species(p, star, bio, seed) {
    const r = mb(Math.floor(seed * 7919) ^ 0x1b873593), out = [];
    const nm = () => { let s = ''; const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) s += SYL2[Math.floor(r() * SYL2.length)]; return s; };
    const g = p.g || 1, sz = Math.pow(1 / g, 0.4); // 重力が小さいと大きな体が作れる
    const hsv = (h, sat, v) => { const f = (n) => { const k = (n + h * 6) % 6; return v - v * sat * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; };
    // 光合成の色は恒星の色で変わる(冷たい星の下では黒っぽい植物になる、という仮説)
    const pc = plantColor(p, star);
    const PLANS = [0, 0, 0, 1, 2, 2, 3, 3, 4, 5, 5]; // 体の作り(哺乳類型・首の長い草食・虫のような多足・二足・蛇のような細長い・足の長い走者)
    const stage = bio.stage, atm = p.atm || p.kind === 'earthlike';
    const add = (kind, label, habitat, n, base) => { for (let i = 0; i < n; i++) {
      const hue = r(), mixv = r(), jit = 0.85 + 0.3 * r();
      const col = kind === 3 ? pc.a.map((v, k) => Math.min(1, (v + (pc.b[k] - v) * mixv) * jit)) : hsv(hue, 0.15 + r() * 0.5, 0.3 + r() * 0.55);
      const col2 = kind === 3 ? (pc.black ? [0.07, 0.06, 0.07] : [0.3 * jit, 0.2 * jit, 0.12 * jit]) : hsv((hue + 0.05 + r() * 0.2) % 1, 0.2 + r() * 0.5, 0.2 + r() * 0.6);
      const plan = kind === 0 ? PLANS[Math.floor(r() * PLANS.length)] : 0;
      let legs = kind === 0 ? 2 + 2 * Math.floor(r() * 3) : kind === 3 ? Math.floor(r() * 3) : 0;
      if (kind === 0) legs = plan === 4 ? 0 : plan === 3 ? 2 : plan === 2 ? 6 : 4;
      out.push({ kind, habitat, label, name: nm() + (kind === 3 ? (r() < 0.5 ? '樹' : '草') : kind === 2 ? '魚' : kind === 1 ? '鳥' : kind === 4 ? '人' : '獣'),
        size: base * (0.5 + r() * 1.5) * (kind === 3 ? 1 : sz), legs, plan, col, col2, speed: 0.3 + r() * 1.2, abundance: 0.4 + r() });
    } };
    if (stage >= 3) add(2, '微生物・水中生物', 'sea', Math.min(80, 8 + Math.floor(r() * (stage * stage * 3))), 0.00008);
    if (stage >= 6) add(2, '水中の生物', 'sea', Math.min(80, 20 + Math.floor(r() * stage * 8)), 0.0006);
    if (stage >= 7) {
      const diversity = Math.min(80, 12 + Math.floor(r() * (stage * 9)));
      add(3, '光合成生物・植物', 'land', diversity, 0.004);
      add(0, '陸上動物・節足動物など', 'land', Math.min(80, diversity + Math.floor(r() * 20)), 0.0011);
      if (atm) add(1, '飛翔生物', 'air', Math.min(50, 5 + Math.floor(r() * stage * 5)), 0.0005);
    }
    if (bio.intelligent) add(4, '知的生命', 'land', 1 + Math.floor(r() * 3), 0.0017);
    return out;
  }
  return { starLumAt, stateAt, tidalLockGyr, environment, STATE_JP, STATE_COLOR, TEQ, biosphere, species, plantColor, STAGE_JP, cfg };
});
