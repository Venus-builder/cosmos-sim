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

// ---- 遠い未来(ドジッター)への延長
{
  const C = Cosmology_create();
  const hl = C.H0 * Math.sqrt(C.OL);
  const l1 = C.lnAOfT(5000), l2 = C.lnAOfT(6000);
  assert.ok(Math.abs((l2 - l1) - hl * 1000) < 1e-6, 'a ∝ exp(H_Λ t)');
  assert.ok(C.lnAOfT(1e91) > 1e89 && Number.isFinite(C.lnAOfT(1e91)), '10^100 年でも有限');
  assert.ok(Math.abs(Math.log(C.aOfT(500)) - C.lnAOfT(500)) < 1e-9, 'ln a の連続');
  assert.ok(C.TdS > 1e-31 && C.TdS < 1e-29, 'ドジッター温度は約 2e-30 K');
  assert.ok(C.lum(1e4) < C.lum(1e3) && C.lum(1e5) < 1e-6, '星の光は遠い未来に消える');
  console.log('cosmology(far future): ok');
}
function Cosmology_create() { return require('../cosmology.js').create(); }

// ---- 初期宇宙の物理量
{
  const C = require('../cosmology.js').create();
  const early = C.plasma(1e-17 / 100);
  assert.ok(early.TMeV > 10 && early.Yp === null, '非常に早い時期は元素合成の前');
  const mid = C.plasma(2000 / 3.15576e16);
  assert.ok(mid.Yp > 0.23 && mid.Yp < 0.27, 'ヘリウム4の質量比は約25%: ' + mid.Yp);
  const rec = C.plasma(C.tRecombination), late = C.plasma(0.001), pre = C.plasma(2e-5);
  assert.ok(pre.xe > rec.xe && rec.xe > late.xe, '電離度は時間とともに下がる');
  assert.ok(late.xe < 0.01, '晴れ上がりのあとは中性');
  console.log('cosmology(plasma): Yp=' + mid.Yp.toFixed(3) + ' xe(z=1100)=' + rec.xe.toFixed(3));
}
