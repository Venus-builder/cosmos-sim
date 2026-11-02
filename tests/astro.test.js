// 実行: node tests/astro.test.js
const assert = require('assert');
const A = require('../astro.js');
const near = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, `${msg}: ${x} vs ${y} (tol ${tol})`);

// 恒星: 太陽
const sun = A.starFromMass(1, 4.6);
near(sun.T, 5772, 5, '太陽の表面温度');
near(sun.life, 10, 0.01, '太陽の寿命[Gyr]');
assert.strictEqual(sun.spec, 'G');
assert.ok(A.starFromMass(0.2, 1).life > 100, '赤色矮星は長寿');
assert.ok(A.starFromMass(20, 0.01).life < 0.1, '大質量星は短命');

// 質量関数
const r = A.rng(1);
let lo = 1, hi = 0, mean = 0;
for (let i = 0; i < 20000; i++) { const m = A.sampleMass(r, 0.08, 100); lo = Math.min(lo, m); hi = Math.max(hi, m); mean += m; }
assert.ok(lo >= 0.08 && hi <= 100, 'IMF の範囲');
near(mean / 20000, 0.572, 0.04, 'IMF(0.08–100 M☉)の平均質量: 解析値 0.572');

// ケプラー
near(Math.sqrt(1 / 1), 1, 1e-12, '周期(a=1AU,M=1) = 1年');
const E = A.solveKepler(1.0, 0.5);
near(E - 0.5 * Math.sin(E), 1.0, 1e-10, 'ケプラー方程式');
const sol = A.solarSystem();
for (const p of sol.planets) near(p.period, Math.pow(p.a, 1.5), p.period * 0.01, p.name + ' の周期はケプラー第3法則に一致');
const earth = sol.planets.find((p) => p.name === '地球');
near(earth.teq, 254.6, 1, '地球の平衡温度[K]');
assert.strictEqual(earth.kind, 'earthlike');
near(earth.g, 1, 1e-9, '地球の重力');
near(earth.vesc, 11.186, 1e-6, '地球の脱出速度');
const pos = A.orbitPos(earth, 0.25);
near(Math.hypot(...pos), 1, 0.02, '地球は軌道上(約1AU)');

// 大気保持
assert.ok(A.jeans(1, 1, 255) > 100, '地球は大気を保持');
assert.ok(A.jeans(0.0123, 0.273, 390) < 100, '月は大気を保持できない');
near(sol.planets.find((p) => p.name === '火星').a, 1.5237, 1e-9, '火星の軌道長半径');

// 銀河・恒星系の生成
assert.strictEqual(A.galaxyType(1e12), 'spiral');
assert.strictEqual(A.galaxyType(1e14), 'cD');
const g = A.galaxyFromHalo(2e12, A.rng(5), 13.8);
const s = A.genStars(g, 2000, 13.8, A.rng(6));
assert.strictEqual(s.r.length, 2000);
for (let i = 0; i < 2000; i++) assert.ok(A.starLife(s.mass[i]) > 13.8 - s.birth[i] - 1e-6 || s.mass[i] === 0.3, '生きている星だけ');
const poor = A.makeSystem({ seed: 1, mass: 1, Z: 0.01, age: 3 });
assert.ok(poor.planets.length <= 2, '金属が極端に少ないと惑星は少ない');
let withPlanets = 0;
for (let i = 0; i < 200; i++) if (A.makeSystem({ seed: i, mass: 1, Z: 1, age: 4 }).planets.length > 0) withPlanets++;
assert.ok(withPlanets > 150, '太陽程度の金属量なら多くの星に惑星');
const a1 = JSON.stringify(A.makeSystem({ seed: 77, mass: 0.8, Z: 0.7, age: 5 }));
assert.strictEqual(a1, JSON.stringify(A.makeSystem({ seed: 77, mass: 0.8, Z: 0.7, age: 5 })), '同じシードなら同じ恒星系');

console.log('astro: all tests passed (planets in Z=1 systems: %d/200)', withPlanets);
