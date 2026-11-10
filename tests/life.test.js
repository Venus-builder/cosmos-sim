// 実行: node tests/life.test.js
const assert = require('assert');
const A = require('../astro.js');
const Life = require('../life.js');
const near = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, `${msg}: ${x} vs ${y} (tol ${tol})`);

const sol = A.solarSystem();
const earth = sol.planets.find((p) => p.name === '地球');
const mars = sol.planets.find((p) => p.name === '火星');
const venus = sol.planets.find((p) => p.name === '金星');
const jup = sol.planets.find((p) => p.name === '木星');

near(Life.starLumAt(sol.star, 4.57), 1, 1e-9, '現在の太陽光度');
near(Life.starLumAt(sol.star, 0) / 1, 1 / 1.4 / (1 / (1 + 0.4 * (1 - 1))) , 0.01, '誕生時の太陽は約 71% の明るさ');
assert.ok(Life.starLumAt(sol.star, 0) > 0.69 && Life.starLumAt(sol.star, 0) < 0.73, '誕生時の太陽は約 70%');

const e = Life.stateAt(earth, sol.star, 4.6);
assert.strictEqual(e.state, 'temperate');
near(e.ts, 288, 2, '地球の表面温度[K]');
assert.ok(e.liquid, '現在の地球は液体の水が可能');
assert.strictEqual(Life.stateAt(venus, sol.star, 4.6).state, 'runaway', '金星は暴走温室');
assert.ok(!Life.stateAt(mars, sol.star, 4.6).liquid, '火星は(このモデルでは)液体の水が持続しない');
assert.strictEqual(Life.stateAt(jup, sol.star, 4.6).state, 'giant');

const env = Life.environment(earth, sol.star, 4.6);
assert.ok(env.nowLiquid, '現在は窓の中');
assert.ok(env.longest > 5, `地球の液体の水の期間は 5 Gyr 以上: ${env.longest}`);
assert.ok(env.windowEnd > 5 && env.windowEnd < 8, `地球の窓は約 5〜8 Gyr で終わる(暴走温室): ${env.windowEnd}`);
assert.ok(env.lockGyr > 100 && !env.locked, '地球は潮汐固定されない(固定まで約200 Gyr)');

// 太陽の寿命を超えた先は範囲に入らない
assert.ok(env.range <= sol.star.life);

// 低質量星のごく近い惑星は潮汐固定
const dwarf = A.starFromMass(0.2, 5);
const close = { a: 0.05, massE: 1, radiusE: 1, albedo: 0.3, type: 'rock' };
assert.ok(Life.tidalLockGyr(close, dwarf) < 1, '赤色矮星のそばの惑星は短時間で潮汐固定');

// 生成された恒星系でも動く(例外・NaN が出ない)
for (let i = 0; i < 100; i++) {
  const sys = A.makeSystem({ seed: i, mass: 0.3 + (i % 10) * 0.15, Z: 1, age: 3 });
  for (const p of sys.planets) {
    const ev = Life.environment(p, sys.star, sys.star.age);
    assert.ok(Number.isFinite(ev.longest) && ev.seg.length > 0, '履歴が有限');
  }
}
console.log('life: all tests passed (Earth window ends at %s Gyr)', env.windowEnd.toFixed(2));

// ---- 生命の段階と生き物
{
  const sol2 = A.solarSystem(), ea = sol2.planets.find((x) => x.name === '地球');
  ea.env = Life.environment(ea, sol2.star, 4.6);
  const bE = Life.biosphere(ea, sol2.star, 4.6, ea.env, 1);
  assert.ok(bE.real && bE.intelligent && bE.stage === 9, '地球には知的生命がいる(実際)');
  const spE = Life.species(ea, sol2.star, bE, 5);
  assert.ok(spE.some((x) => x.kind === 4) && spE.some((x) => x.kind === 3), '地球の生き物に人と植物がいる');
  const dist = new Array(10).fill(0); let tested = 0;
  for (let i = 0; i < 300; i++) {
    const sys = A.makeSystem({ seed: 1000 + i, mass: 1, Z: 1, age: 4.5 });
    for (const p of sys.planets) {
      if (p.type !== 'rock') continue;
      p.env = Life.environment(p, sys.star, sys.star.age);
      const b = Life.biosphere(p, sys.star, sys.star.age, p.env, p.seed);
      assert.deepStrictEqual(b, Life.biosphere(p, sys.star, sys.star.age, p.env, p.seed), '同じシードなら同じ結果');
      dist[b.stage]++; tested++;
      Life.species(p, sys.star, b, p.seed).forEach((x) => assert.ok(Number.isFinite(x.size) && x.col.every(Number.isFinite)));
    }
  }
  assert.ok(tested > 100, 'テスト対象の惑星が十分ある');
  assert.ok(dist[0] > dist[9], '知的生命は稀(生命なしの惑星のほうが多い): ' + dist.join(','));
  console.log('life(biosphere): stages', dist.join(','), 'of', tested);
}
