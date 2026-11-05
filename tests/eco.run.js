// 調整用: node tests/eco.run.js [年数] [シード]
const Eco = require('../eco.js');
const years = +process.argv[2] || 600, seed = +process.argv[3] || 1;
const vis = (i) => ({ kind: i % 5 === 4 ? 1 : 0, name: 'S' + i + '獣', plan: i % 6, legs: 4, col: [0.5, 0.4, 0.3], col2: [0.3, 0.3, 0.3], speed: 1, size: 0.001 });
const e = Eco.create({ seed, species: Array.from({length:14},(_, i)=>i).map(vis) });
const t0 = Date.now();
for (let y = 0; y < years; y += 50) { while (e.year < y + 50) e.step(0.1); const s = e.stats(); console.log(`y=${Math.round(e.year)} n=${s.n} species alive/total=${s.alive}/${s.total} ext=${s.extinct} plant=${e.plantFrac().toFixed(2)} ev=${s.events}`); }
console.log(e.tree().map((x) => ' '.repeat(x.depth) + x.name + ' n=' + x.count + ' sz=' + x.size.toFixed(2) + ' diet=' + x.diet.toFixed(2) + (x.ext !== null ? ' ✝' + Math.round(x.ext) : '')).join('\n'));
console.log(Date.now() - t0, 'ms');
