// 実行: node tests/civ.test.js
const assert = require('assert');
const Civ = require('../civ.js');
const run = (seed, years) => { const w = Civ.create({ seed }); let n = 0; while (w.year < years && !w.ended && n++ < 2000) w.step(w.stepSize()); return w; };
const a = run(11, 8000), b = run(11, 8000), c = run(12, 8000);
assert.strictEqual(JSON.stringify(a.summary()), JSON.stringify(b.summary()), '同じシードなら同じ歴史');
assert.notStrictEqual(a.items.map((x) => x.name).join(), c.items.map((x) => x.name).join(), 'シードがちがえば別の世界');
for (const w of [a, c]) {
  assert.ok(w.items.length > 8, '技術が生まれる');
  assert.ok(Number.isFinite(w.pop) && w.caps.every(Number.isFinite), '値が有限');
  w.items.forEach((it) => it.parents.forEach((p) => assert.ok(p < it.id, '親は先に存在する')));
}
// 世界ごとに、到達の順番や時期がちがう(筋書きがない)
const orders = new Set();
for (let s = 1; s <= 6; s++) { const w = run(s * 31, 8000); orders.add(Object.keys(w.ms).join('>')); }
assert.ok(orders.size >= 3, '到達の順番が世界によってちがう: ' + [...orders].join(' | '));
console.log('civ: all tests passed (' + orders.size + ' distinct orders in 6 worlds)');

// ---- 全員が個人: 親子・結婚・誕生・死亡の記録がある
{
  const w = run(21, 3000), id = w.pickPerson('parent'), p = w.person(id);
  assert.ok(p && p.kids.length > 0, '子の多い人は子をもつ');
  assert.ok(p.log.length > 0 && p.known > 0, '個人の記録と知識がある');
  assert.strictEqual(w.pop, w.summary().pop, '人口=追跡中の個人の数');
  console.log('civ(individuals): ok pop=' + w.pop);
}
