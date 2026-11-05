// 実行: node tests/eco.test.js
const assert = require('assert');
const Eco = require('../eco.js');
const vis = (i) => ({ kind: 0, name: 'S' + i + '獣', col: [0.5, 0.4, 0.3], col2: [0.3, 0.3, 0.3], speed: 1 });
const run = (seed, years) => { const e = Eco.create({ seed, species: [0, 1, 2, 3, 4, 5, 6, 7].map(vis) }); while (e.year < years) e.step(0.1); return e; };
const a = run(3, 200), b = run(3, 200);
assert.deepStrictEqual(a.stats(), b.stats(), '同じシードなら同じ歴史');
assert.ok(a.inds.every((x) => Number.isFinite(x.x) && Number.isFinite(x.e)), '値が有限');
assert.ok(a.species.length > 6, '種分化または移入で種が増える');
let specs = 0; for (let s = 1; s <= 4; s++) { const e = run(s, 500); specs += e.log.filter((l) => l.kind === 'spec').length; assert.ok(e.stats().extinct > 0, '絶滅が起きる'); }
assert.ok(specs > 0, '種分化が起きる: ' + specs);
const e = run(5, 100), n0 = e.inds.length; e.event('asteroid', 0.9);
assert.ok(e.inds.length < n0 * 0.7, '大量絶滅で個体が大きく減る');
console.log('eco: all tests passed (speciation events in 4 worlds:', specs + ')');
