// 実行: node tests/scenario.test.js
const assert = require('assert');
const S = require('../scenario.js');
const a = S.simulate({}, 9), b = S.simulate({}, 9);
assert.strictEqual(JSON.stringify(a), JSON.stringify(b), '同じシードなら同じ結果');
const hot = S.simulate({ emis: 0, gov: 0.2 }, 9), cool = S.simulate({ emis: 1, gov: 0.8 }, 9);
assert.ok(S.at(cool, 2100).temp < S.at(hot, 2100).temp, '脱炭素を強めると気温上昇が小さい');
assert.ok(S.at(cool, 2100).fossil < S.at(hot, 2100).fossil, '化石燃料の割合が小さい');
const y0 = S.at(a, 2025); assert.ok(Math.abs(y0.pop - 8.2e9) < 1 && y0.co2 === 422, '初期値は表のとおり');
for (const k of ['pop', 'co2', 'temp', 'energy', 'bio', 'ai']) assert.ok(a[k].every(Number.isFinite), k + ' が有限');
assert.ok(S.NOW.every((x) => x.src && x.label), '出典欄がある');
console.log('scenario: all tests passed');
