// 調整用: node tests/civ.run.js [世界の数] [最大年数]
const Civ = require('../civ.js');
const N = +process.argv[2] || 8, MAXY = +process.argv[3] || 600000;
for (let s = 1; s <= N; s++) {
  const w = Civ.create({ seed: s * 7919 }), t0 = Date.now(); let steps = 0;
  while (w.year < MAXY && !w.ended && steps < 300000 && Date.now() - t0 < 25000) { w.step(w.stepSize()); steps++; }
  const m = w.ms, f = (k) => (m[k] === undefined ? '-' : Math.round(m[k] / 100) / 10 + 'k');
  console.log(`seed${s}: y=${Math.round(w.year)} pop=${w.pop.toExponential(1)} items=${w.items.length} steps=${steps} ${Date.now() - t0}ms | rec ${f('record')} agri ${f('agri')} metal ${f('metal')} city ${f('city')} sci ${f('science')} mach ${f('machine')} elec ${f('electric')} comp ${f('computer')} prog ${f('programming')} net ${f('network')} ai ${f('ai')} nuc ${f('nuclear')} space ${f('space')} crisis ${w.collapsed}${w.ended ? ' END' : ''}`);
}
