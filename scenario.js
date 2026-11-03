/* 第4c段階: 「いまの地球」を初期条件にしたシナリオ実験。
 * 予測ではなく、条件(レバー)を変えたときに何がどう変わるかを比べるための、ごく単純な年次モデル。
 * 初期値は、公表されている統計の概数を手で入れたもの(下の NOW)。自動取得はしていません。
 * 数値は記憶にもとづく概数なので、正確な値は必ず出典で確認してください。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scenario = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 初期条件(2024〜2025年ごろ)。出典欄は「どこの数字か」の目印で、値の検証は済んでいません。
  const NOW = [
    { key: 'pop', label: '世界人口', value: 8.2e9, unit: '人', src: '国連 世界人口推計2024(2024年中 約81.6億人)' },
    { key: 'tfr', label: '合計特殊出生率', value: 2.25, unit: '', src: '国連 世界人口推計(約2.2〜2.3)' },
    { key: 'co2', label: '大気中のCO₂濃度', value: 422, unit: 'ppm', src: 'NOAA マウナロア観測 2024年(約422〜423)' },
    { key: 'temp', label: '世界平均気温の上昇(産業革命前比)', value: 1.3, unit: '℃', src: 'WMO・Copernicus 等(直近10年平均は約1.2〜1.3、2024年単年は約1.5)' },
    { key: 'energy', label: '一次エネルギー消費', value: 620, unit: 'EJ/年', src: 'Energy Institute 世界エネルギー統計 2023年(約620)' },
    { key: 'fossil', label: '化石燃料の割合', value: 0.81, unit: '', src: 'Energy Institute 2023年(約8割)' },
    { key: 'emis', label: 'CO₂排出(化石燃料由来)', value: 37.4, unit: 'GtCO₂/年', src: 'Global Carbon Budget 2023(約37)' },
    { key: 'bio', label: '野生脊椎動物の個体群の指数(1970年=1)', value: 0.27, unit: '', src: 'WWF/ZSL 生きている地球指数 2024(1970年比で約73%減、概数)' },
    { key: 'ai', label: 'AI能力の指数(2025年=1。この実験が決めた指標)', value: 1, unit: '', src: '定義上の値(実測ではない)' },
  ];
  const DEFAULT = { emis: 0.25, tfr: 1.7, ai: 0.5, gov: 0.5, nature: 0.3 };

  function h32() { let h = 2166136261 >>> 0; for (let i = 0; i < arguments.length; i++) { h ^= (arguments[i] | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b); } h ^= h >>> 16; return (h >>> 0) / 4294967296; }

  // levers: emis=脱炭素の強さ(0〜1) tfr=目標の出生率 ai=AI投資(0〜1) gov=国際協調・統治(0〜1) nature=自然保護(0〜1)
  function simulate(levers, seed, years) {
    const Lv = Object.assign({}, DEFAULT, levers || {}); years = years || 275;
    const v = (k) => NOW.find((x) => x.key === k).value;
    let pop = v('pop'), tfr = v('tfr'), co2 = v('co2'), temp = v('temp'), fossil = v('fossil'), bio = v('bio'), ai = v('ai'), gdp = 1, eff = 1, cool = 0, boost = 0;
    const out = { year: [], pop: [], co2: [], temp: [], energy: [], fossil: [], bio: [], ai: [], emis: [], events: [] };
    const U = (y, k) => h32(seed >>> 0, y, k);
    const ev = (y, text) => out.events.push({ year: y, text });
    for (let t = 0; t <= years; t++) {
      const y = 2025 + t;
      const energy = v('energy') * Math.pow(pop / v('pop'), 0.3) * Math.pow(gdp, 0.65) * eff;
      const emis = energy * fossil * (v('emis') / (v('energy') * v('fossil')));
      out.year.push(y); out.pop.push(pop); out.co2.push(co2); out.temp.push(temp - cool); out.energy.push(energy); out.fossil.push(fossil); out.bio.push(bio); out.ai.push(ai); out.emis.push(emis);
      // ---- 次の年へ
      tfr += (Lv.tfr - tfr) * 0.03 + (U(y, 1) - 0.5) * 0.01;
      const mom = Math.exp(-t / 40), r = 0.0105 * mom + (tfr - 2.1) * 0.012 * (1 - mom);
      pop *= Math.exp(r);
      const dmg = 0.02 * Math.pow(Math.max(0, temp - 1.5), 2);
      gdp *= Math.exp((0.022 + 0.012 * Math.log(1 + ai / 20)) / (1 + 0.25 * (gdp - 1)) - dmg + (U(y, 2) - 0.5) * 0.01);
      eff *= 0.995;
      fossil = Math.max(0.04, fossil - (0.003 + 0.035 * Lv.emis * (0.4 + 0.6 * Lv.gov) + boost) * fossil + (U(y, 3) - 0.5) * 0.004);
      boost *= 0.97;
      co2 += emis * 0.6 / 7.81 - 0.006 * (co2 - 280);
      temp += 0.00045 * emis; if (cool > 0) cool = Math.max(0, cool - 0.1);
      bio = Math.max(0.02, bio - (0.004 + 0.004 * (pop / v('pop')) + 0.003 * Math.max(0, temp - 1.5)) * (1 - 0.7 * Lv.nature) * bio + 0.0012 * Lv.nature * (1 - bio));
      ai = Math.min(1e4, ai * Math.exp(0.03 + 0.09 * Lv.ai));
      // ---- ランダムな出来事(同じシードなら、レバーを変えても同じ乱数列)
      if (U(y, 10) < 0.015 * (pop / v('pop'))) { const k = (0.002 + 0.018 * U(y, 11)) * (1 - 0.5 * Lv.gov); pop *= 1 - k; ev(y, '大きな感染症の流行(人口の ' + (k * 100).toFixed(1) + '% が減少)'); }
      if (U(y, 12) < 0.012 * (1 + (1 - Lv.gov))) { const k = 0.001 + 0.01 * U(y, 13); pop *= 1 - k; gdp *= 0.97; ev(y, '大きな戦争・紛争(人口の ' + (k * 100).toFixed(1) + '% が減少)'); }
      if (ai > 20 && U(y, 14) < 0.004 * Math.pow(ai, 0.6) / 10 * (1 - 0.8 * Lv.gov)) { gdp *= 0.9; ev(y, 'AIの悪用・暴走による大きな混乱(経済が1割縮小)'); }
      if (U(y, 15) < 0.003) { cool = 0.4; gdp *= 0.98; ev(y, '大規模な火山噴火(数年間、気温が下がる)'); }
      if (y > 2040 && U(y, 16) < 0.006 * Math.pow(ai, 0.3) / 2) { boost += 0.02; ev(y, '低コストなクリーンエネルギーの技術的な突破'); }
      if (temp > 3 && U(y, 17) < 0.5) { pop *= 0.995; if (U(y, 18) < 0.05) ev(y, '猛暑・食料不足による被害が広がる'); }
      if (bio < 0.1 && U(y, 19) < 0.3) pop *= 0.997;
    }
    return out;
  }
  function at(sim, year) { const i = Math.min(sim.year.length - 1, Math.max(0, year - 2025)); return { pop: sim.pop[i], co2: sim.co2[i], temp: sim.temp[i], energy: sim.energy[i], fossil: sim.fossil[i], bio: sim.bio[i], ai: sim.ai[i] }; }
  return { NOW, DEFAULT, simulate, at };
});
