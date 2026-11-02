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

  return { starLumAt, stateAt, tidalLockGyr, environment, STATE_JP, STATE_COLOR, TEQ };
});
