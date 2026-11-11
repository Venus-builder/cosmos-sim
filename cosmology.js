/* 宇宙論エンジン(ΛCDM)。ブラウザでは window.Cosmology、Node では require で使える。
 * 時間の単位は Gyr(10億年)。H は 1/Gyr。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Cosmology = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function create(opts) {
    opts = opts || {};
    const h = opts.h !== undefined ? opts.h : 0.677;
    const Om = opts.Om !== undefined ? opts.Om : 0.31;
    const Or = opts.Or !== undefined ? opts.Or : 9.0e-5;
    const OL = 1 - Om - Or;
    const TMAX = opts.tMax !== undefined ? opts.tMax : 1e91; // 1e100 年(ブラックホール蒸発の時代の終わり)
    const H0 = (100 * h) / 977.792; // 1/Gyr
    const T0 = 2.7255; // 現在のCMB温度 [K]

    const E2 = (a) => Or / (a * a * a * a) + Om / (a * a * a) + OL;
    const H = (a) => H0 * Math.sqrt(E2(a));

    const zRecombination = 1100, zEquality = 3400;
    const aRecombination = 1 / (1 + zRecombination), aEquality = 1 / (1 + zEquality);
    const rhoRatioMatterRadiation = (a) => Om * a / Or;
    // ---- t(a) 表(ln a 等間隔) ----
    const LN0 = Math.log(1e-10), LN1 = Math.log(1e30), DL = 0.002;
    const n = Math.round((LN1 - LN0) / DL) + 1;
    const tArr = new Float64Array(n);
    tArr[0] = 1e-20 / (2 * H0 * Math.sqrt(Or)); // 放射優勢: t = 1/(2H)
    for (let i = 0; i < n - 1; i++) {
      const a0 = Math.exp(LN0 + i * DL), a1 = Math.exp(LN0 + (i + 1) * DL);
      tArr[i + 1] = tArr[i] + 0.5 * (1 / H(a0) + 1 / H(a1)) * DL;
    }
    function tOfA(a) {
      const x = (Math.log(a) - LN0) / DL;
      if (x <= 0) return tArr[0] * (a / 1e-10) * (a / 1e-10);
      if (x >= n - 1) return tArr[n - 1];
      const i = Math.floor(x), f = x - i;
      return tArr[i] * (1 - f) + tArr[i + 1] * f;
    }
    // 十分未来(a>1e30)は ΛだけのドジッターDe Sitter空間: a ∝ exp(H_Λ t)。ln a を厳密に延長する。
    const HL = H0 * Math.sqrt(OL), tEnd = tArr[n - 1];
    const TdS = 1.054571817e-34 * (HL / 3.15576e16) / (2 * Math.PI * 1.380649e-23); // ドジッター温度[K]
    function lnAOfT(t) {
      if (t >= tEnd) return LN1 + HL * (t - tEnd);
      return Math.log(aOfTTable(t));
    }
    function aOfT(t) {
      if (t >= tEnd) return Math.exp(Math.min(LN1 + HL * (t - tEnd), 700));
      return aOfTTable(t);
    }
    function aOfTTable(t) {
      if (t <= tArr[0]) return 1e-10 * Math.sqrt(Math.max(t, 0) / tArr[0]);
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (tArr[mid] <= t) lo = mid; else hi = mid;
      }
      const f = (t - tArr[lo]) / (tArr[hi] - tArr[lo]);
      return Math.exp(LN0 + (lo + f) * DL);
    }

    // ---- 線形成長率 D(a)(物質+Λ。D(1)=1 に正規化)----
    const DA0 = 1e-6, DLN0 = Math.log(DA0), DDL = 0.005, dn = Math.round((Math.log(2) - DLN0) / DDL) + 1;
    const cum = new Float64Array(dn);
    cum[0] = (2 / 5) * Math.pow(DA0, 2.5) / Math.pow(Om, 1.5);
    const Eg = (a) => Math.sqrt(Om / (a * a * a) + OL);
    const g = (a) => 1 / (a * a * Math.pow(Eg(a), 3)); // ∫da/(aE)^3 = ∫ g dlna
    for (let i = 0; i < dn - 1; i++) {
      const a0 = Math.exp(DLN0 + i * DDL), a1 = Math.exp(DLN0 + (i + 1) * DDL);
      cum[i + 1] = cum[i] + 0.5 * (g(a0) + g(a1)) * DDL;
    }
    function integral(a) {
      if (a <= DA0) return (2 / 5) * Math.pow(a, 2.5) / Math.pow(Om, 1.5);
      const x = (Math.log(a) - DLN0) / DDL;
      const i = Math.min(Math.floor(x), dn - 2), f = x - i;
      return cum[i] * (1 - f) + cum[i + 1] * f;
    }
    const Draw = (a) => 2.5 * Om * Eg(a) * integral(a);
    const D1 = Draw(1);
    const D = (a) => Draw(a) / D1;
    const fGrowth = (a) => {
      const e = 0.01;
      return (Math.log(D(a * Math.exp(e))) - Math.log(D(a * Math.exp(-e)))) / (2 * e);
    };

    // ---- 恒星の明るさ(近似): 宇宙の星形成率(Madau & Dickinson 2014)を積分、年齢で減光 ----
    const lumT = [], lumV = [];
    (function buildLum() {
      const sfr = (a) => {
        const opz = 1 / a; // 1+z
        return 0.015 * Math.pow(opz, 2.7) / (1 + Math.pow(opz / 2.9, 5.6));
      };
      const w = (age) => Math.pow(1 + age / 0.1, -0.8) * Math.exp(-age / 1000);
      const LUM_END = Math.min(TMAX, 400);
      for (let t = 0.004; t <= LUM_END * 1.001; t *= 1.02) lumT.push(t);
      const ps = lumT.map((t) => sfr(aOfT(t)));
      let max = 0;
      for (let i = 0; i < lumT.length; i++) {
        let s = 0;
        for (let j = 0; j < i; j++) {
          s += 0.5 * (ps[j] * w(lumT[i] - lumT[j]) + ps[j + 1] * w(lumT[i] - lumT[j + 1])) * (lumT[j + 1] - lumT[j]);
        }
        lumV.push(s);
        if (s > max) max = s;
      }
      for (let i = 0; i < lumV.length; i++) lumV[i] /= max;
    })();
    function lum(t) {
      if (t <= lumT[0]) return 0;
      if (t >= lumT[lumT.length - 1]) { // 星形成が尽きた後は、星が死んで暗くなっていく(減光時間 約1兆年)
        const te = lumT[lumT.length - 1];
        return lumV[lumV.length - 1] * Math.exp(-(t - te) / 1000);
      }
      let lo = 0, hi = lumT.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lumT[mid] <= t) lo = mid; else hi = mid;
      }
      const f = (t - lumT[lo]) / (lumT[hi] - lumT[lo]);
      return lumV[lo] * (1 - f) + lumV[hi] * f;
    }

    // ---- 初期宇宙の物理量(標準的な式による近似) ----
    // 温度は T = T0/a。中性子と陽子の比は、約0.8MeVまでは熱平衡(n/p = exp(-Δm/kT)、Δm=1.293MeV)、
    // それ以降は凍結して中性子が壊れ(寿命880秒)、重水素のボトルネックが開く約0.07MeVで元素合成が起きる。
    // 水素の電離度は Saha の式(再結合の厳密な計算ではなく、起こる時期の目安)。
    const KEV = 8.617333e-5; // eV/K
    const NB0 = 0.2523 * (0.0224 / 0.0224); // 現在のバリオン数密度 [m^-3](Ωb h²=0.0224)
    function plasma(t) {
      const a = aOfT(t), TK = T0 / a, TMeV = TK * KEV * 1e-6, tSec = t * 3.15576e16;
      let phase = 'クォーク・グルーオン〜ハドロンの時代', xn = null;
      const np = (T, ts) => (T > 0.8 ? Math.exp(-1.293 / T) : (1 / 6) * Math.exp(-Math.max(0, ts - 1.0) / 880));
      let Yp = null;
      if (TMeV < 100) phase = 'ニュートリノが分離する前の熱い宇宙(電子・陽電子・光)';
      if (TMeV < 0.8) phase = '中性子と陽子の比が凍結(約1/6)し、中性子が壊れていく';
      if (TMeV < 0.09) { const x = np(0.07, 180); Yp = 2 * x / (1 + x); phase = 'ビッグバン元素合成が終わり、ヘリウム4が質量の約25%'; }
      const x0 = np(Math.max(TMeV, 0.07), Math.min(tSec, 180));
      xn = x0;
      // Saha: x²/(1−x) = S, S = (1/n_b)(m_e kT / 2πħ²)^{3/2} exp(−13.6eV/kT)
      let xe = null;
      if (TK < 20000 && TK > 500) {
        const nb = NB0 / (a * a * a), kT = TK * 1.380649e-23, me = 9.109e-31, hb = 1.0546e-34;
        const S = Math.pow(me * kT / (2 * Math.PI * hb * hb), 1.5) / nb * Math.exp(-13.6 / (TK * KEV));
        xe = S > 1e8 ? 1 : (-S + Math.sqrt(S * S + 4 * S)) / 2;
        xe = Math.min(1, Math.max(0, xe));
      }
      return { TK, TMeV, np: xn, Yp, xe, phase };
    }

    return {
      h, Om, Or, OL, H0, TMAX,
      H, tOfA, aOfT, lnAOfT, TdS, D, f: fGrowth, lum,
      zOfA: (a) => 1 / a - 1,
      TOfA: (a) => T0 / a,
      plasma, cmbAtRedshift: (z) => T0 * (1 + z), rhoRatioMatterRadiation,
      aRecombination, aEquality, zRecombination, zEquality,
      tRecombination: tOfA(aRecombination), tEquality: tOfA(aEquality),
      tMin: tArr[0],
      tNow: tOfA(1),
    };
  }
  return { create };
});
