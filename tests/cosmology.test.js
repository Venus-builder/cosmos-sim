// 実行: node tests/cosmology.test.js
const assert = require('assert');
const c = require('../cosmology.js').create();

const near = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, `${msg}: ${x} vs ${y} (tol ${tol})`);

near(c.tNow, 13.8, 0.15, '現在の宇宙年齢[Gyr]');
near(c.aOfT(c.tNow), 1, 1e-4, 'a(tNow)');
near(c.TOfA(1), 2.7255, 1e-9, '現在のCMB温度');

const aRec = 1 / 1091;
const tRec = c.tOfA(aRec);
assert.ok(tRec > 3e-4 && tRec < 4.5e-4, `再結合の時刻 ${tRec} Gyr (約38万年)`);

for (const a of [1e-9, 1e-5, 1e-3, 0.02, 0.5, 1, 5, 100]) {
  near(c.aOfT(c.tOfA(a)) / a, 1, 1e-4, `往復 a=${a}`);
}

let prev = 0;
for (let lna = -20; lna < 12; lna += 0.5) {
  const t = c.tOfA(Math.exp(lna));
  assert.ok(t > prev, 't(a) は単調増加');
  prev = t;
}

near(c.D(1), 1, 1e-9, 'D(1)');
near(c.D(0.02) / 0.02, 1.3, 0.2, '物質優勢での D ∝ a(D(a)/a ≈ 1.2〜1.4)');
near(c.f(0.02), 1, 0.03, '初期の成長率 f≈1');
assert.ok(c.f(1) > 0.45 && c.f(1) < 0.57, `現在の f ≈ Ωm^0.55 ≈ 0.51: ${c.f(1)}`);

assert.ok(c.aOfT(200) > 1e3, '200Gyr までに加速膨張で a が巨大化');
assert.ok(c.lum(c.tNow) > 0.1, '現在も星は明るい');
assert.ok(c.lum(200) < c.lum(c.tNow), '遠い未来は星の光が弱くなる');
assert.strictEqual(c.lum(0.001), 0, '最初の星より前は 0');

console.log('cosmology: all tests passed (age=%s Gyr, tRec=%s Myr)', c.tNow.toFixed(3), (tRec * 1000).toFixed(3));
