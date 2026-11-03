/* 第4段階: 知的生命と文明(創発型の技術モデル)。
 * 技術の順番や中身はコードに書かない。世界ごとの「法則」(シードから決まる乱数表)に従って、
 * 個人(注目集団のエージェント)が既知の技術を組み合わせて試し、成功したものが新しい技術になる。
 * できた技術の「能力ベクトル」(エネルギー・材料・情報…)の水準を見て、人間が見て分かる名前(文字・農耕・計算機・
 * プログラミング…)を後から付ける。起きるかどうか、いつ起きるか、順番は世界ごとにちがう。
 * これは仮説にもとづく思考実験であり、人類の未来の予測ではない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Civ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const K = 7;
  const DIM_JP = ['エネルギー', '材料', '情報', '輸送', '生命(農・医)', '科学の理解', '社会の組織'];
  const E = 0, M = 1, I = 2, T = 3, L = 4, S = 5, O = 6;

  function h32() {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < arguments.length; i++) {
      h ^= (arguments[i] | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b);
    }
    h ^= h >>> 16; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 15;
    return h >>> 0;
  }
  const u01 = function () { return h32.apply(null, arguments) / 4294967296; };
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const SYL = ['カ', 'ケ', 'コ', 'サ', 'シ', 'ス', 'タ', 'ト', 'ナ', 'ニ', 'ノ', 'ハ', 'ヒ', 'マ', 'ミ', 'ム', 'ヤ', 'ユ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ワ', 'ザ', 'ジ', 'ゼ', 'ダ', 'デ', 'バ', 'ビ', 'ガ', 'ギ', 'ゲ', 'ヴァ', 'ソ'];
  const nameOf = (seed, id) => { const n = 2 + (h32(seed, id, 5) % 2); let s = ''; for (let k = 0; k < n; k++) s += SYL[h32(seed, id, 11 + k) % SYL.length]; return s; };
  const WORDS = [
    ['炉', '機関', '動力源'], ['合金', '素材', '加工法'], ['記録法', '符号', '演算法'], ['乗り物', '航路', '輸送網'],
    ['栽培法', '治療法', '飼育法'], ['観測法', '理論', '測定法'], ['取り決め', '制度', '共同体'],
  ];
  const NAT = ['鉱石', '草', '鳥の羽', '粘土', '樹液', '風', '光る石', '磁性の石', '毒', '貝', '油', '塩', '骨', '種', '雷', '粉'];
  const PRIM = [['火', E], ['石', M], ['野の実', L], ['木', M], ['水の流れ', T], ['星の動き', S], ['群れの力', O], ['獣', L]];

  // 能力水準の見た目の名前(閾値は「この水準に達した」という目印で、起きる順番や時期は決めない)
  const MILESTONES = [
    { key: 'record', jp: '記録(文字・符号)', ok: (c) => c[I] >= 1.2 },
    { key: 'agri', jp: '農耕と定住', ok: (c) => c[L] >= 1.8 },
    { key: 'metal', jp: '金属・高度な材料加工', ok: (c) => c[M] >= 2.4 },
    { key: 'city', jp: '都市・国家のような大きな組織', ok: (c, w) => c[O] >= 2.2 && w.pop >= 3e4 },
    { key: 'science', jp: '体系的な科学', ok: (c) => c[S] >= 3 },
    { key: 'machine', jp: '機械・大規模なエネルギー利用', ok: (c) => c[E] >= 4 && c[M] >= 3 },
    { key: 'electric', jp: '電力', ok: (c) => c[E] >= 6 && c[S] >= 4 },
    { key: 'computer', jp: '計算機', ok: (c) => c[I] >= 5 && c[E] >= 5 },
    { key: 'programming', jp: 'プログラミング(機械に手順を書いて動かす)', ok: (c, w) => c[I] >= 7 && c[S] >= 5 && w.ms.computer !== undefined },
    { key: 'network', jp: '情報ネットワーク', ok: (c, w) => c[I] >= 9 && c[T] >= 5 && w.ms.programming !== undefined },
    { key: 'ai', jp: '人工知能', ok: (c, w) => c[I] >= 13 && c[S] >= 8 && w.ms.programming !== undefined },
    { key: 'nuclear', jp: '原子のエネルギー', ok: (c) => c[E] >= 11 && c[S] >= 8 },
    { key: 'space', jp: '宇宙への進出', ok: (c) => c[T] >= 9 && c[E] >= 8 },
  ];

  function create(opts) {
    opts = opts || {};
    const seed = (opts.seed >>> 0) || 1, rnd = mulberry(seed ^ 0x5bd1e995);
    const P = Object.assign({ attRate: 0.0002, base: 0.07, pop0: 260, agentsMax: 150, kLoad: 1.4e5 }, opts.params || {});
    const w = {
      seed, year: 0, pop: P.pop0, items: [], timeline: [], ms: {}, caps: new Array(K).fill(0), over: false, collapsed: 0,
      Kcap: 0, ended: false, log: (year, kind, text) => w.timeline.push({ year: Math.round(year), kind, text }),
    };
    const items = w.items, tried = new Map();
    const lib = []; // 記録された(書き残された)技術
    const loadScale = 0.5 + 1.5 * u01(seed, 77);

    function addItem(parents, c, year, inventor, name) {
      const id = items.length, depth = parents.length ? Math.max.apply(null, parents.map((p) => items[p].depth)) + 1 : 0;
      let dom = 0; for (let d = 1; d < K; d++) if (c[d] > c[dom]) dom = d;
      const nm = name || (nameOf(seed, id) + WORDS[dom][Math.min(2, Math.floor(depth / 4))]);
      const it = { id, parents, c, depth, year, name: nm, dom, rec: false, holders: 0, alive: true };
      items.push(it); return it;
    }
    // 自然の素材・現象(どの世界にもあるが、性質は世界ごとにちがう)
    PRIM.forEach(([word, dom], i) => {
      const c = new Array(K).fill(0);
      for (let d = 0; d < K; d++) c[d] = 0.08 * -Math.log(1 - u01(seed, i, d, 3));
      c[dom] += 0.5 + 0.7 * u01(seed, i, 9);
      addItem([], c, 0, -1, nameOf(seed, 500 + i) + 'の' + word);
    });
    const startKnown = [0, 1, 2].map((k) => k), prims = PRIM.map((x, i) => i);

    // ---- 個人(注目集団)
    const agents = [];
    function newAgent(parent) {
      const a = { age: parent ? 0 : 8 + rnd() * 30, arr: [], set: new Set(), curious: 0.4 + 1.2 * rnd() };
      if (parent) { for (const id of parent.arr) if (rnd() < 0.7) learn(a, id); }
      else startKnown.forEach((id) => learn(a, id));
      return a;
    }
    function learn(a, id) { if (a.set.has(id)) return false; a.set.add(id); a.arr.push(id); items[id].holders++; return true; }
    function forget(a) { for (const id of a.arr) { const it = items[id]; if (--it.holders <= 0 && !it.rec && it.alive) { it.alive = false; lost.push(it); } } }
    const lost = [];
    function syncAgents() {
      const n = Math.min(P.agentsMax, Math.floor(w.pop));
      while (agents.length < n) agents.push(newAgent(agents.length ? agents[Math.floor(rnd() * agents.length)] : null));
      while (agents.length > n) { const i = Math.floor(rnd() * agents.length); forget(agents[i]); agents[i] = agents[agents.length - 1]; agents.pop(); }
    }
    syncAgents();

    // ---- 社会の能力(生きている技術から)
    const mx = new Array(K).fill(0), sm = new Array(K).fill(0);
    function setCaps() { for (let d = 0; d < K; d++) w.caps[d] = mx[d] * 0.92 + 0.08 * Math.log(1 + sm[d]); }
    function recomputeCaps() { // 失われた技術があるときだけ全体を数え直す
      mx.fill(0); sm.fill(0); let n = 0;
      for (const it of items) if (it.alive) { n++; for (let d = 0; d < K; d++) { if (it.c[d] > mx[d]) mx[d] = it.c[d]; sm[d] += it.c[d]; } }
      w.aliveN = n; setCaps();
    }
    function capsAdd(it) { w.aliveN = (w.aliveN || 0) + 1; for (let d = 0; d < K; d++) { if (it.c[d] > mx[d]) mx[d] = it.c[d]; sm[d] += it.c[d]; } setCaps(); }
    recomputeCaps();
    function checkMilestones(trigger) {
      for (const m of MILESTONES) if (w.ms[m.key] === undefined && m.ok(w.caps, w)) {
        w.ms[m.key] = w.year;
        w.log(w.year, 'milestone', '【到達】' + m.jp + (trigger ? '(きっかけ: ' + trigger.name + ')' : ''));
      }
    }

    function pickKnown(a) {
      const n = a.arr.length;
      if (n > 30 && rnd() < 0.5) return a.arr[n - 1 - Math.floor(rnd() * 30)];
      return a.arr[Math.floor(rnd() * n)];
    }
    function attempt() {
      const a = agents[Math.floor(rnd() * agents.length)];
      if (rnd() < 0.03 + 0.01 * w.caps[T]) { // 探検・観察: 身の回りの別の自然現象に気づく
        if (rnd() < 0.3 && prims.length < 48) { // まだ誰も知らない自然の素材・現象を見つける(世界の乱数で性質が決まる)
          const id = items.length, c = new Array(K).fill(0), dom = h32(seed, id, 21) % K;
          for (let d = 0; d < K; d++) c[d] = 0.08 * -Math.log(1 - u01(seed, id, d, 3));
          c[dom] += 0.4 + 0.8 * u01(seed, id, 9);
          capsAdd(addItem([], c, w.year, -1, nameOf(seed, 900 + id) + 'の' + NAT[h32(seed, id, 22) % NAT.length])); prims.push(id);
        }
        const unk = prims.filter((i) => !a.set.has(i));
        if (unk.length) { const id = unk[Math.floor(rnd() * unk.length)]; learn(a, id); if (rnd() < 0.5) for (let t = 0; t < 3; t++) learn(agents[Math.floor(rnd() * agents.length)], id); }
        return;
      }
      if (a.arr.length < 2) return;
      const k = rnd() < 0.78 ? 2 : 3, ids = [];
      for (let t = 0; t < 6 && ids.length < k; t++) { const id = pickKnown(a); if (!ids.includes(id)) ids.push(id); }
      if (ids.length < 2) return;
      ids.sort((x, y) => x - y);
      const ctx = Math.floor((w.caps[M] + w.caps[E] + w.caps[S]) * 1.5), key = ids.join(',') + '@' + ctx;
      const ft = tried.get(key);
      if (ft !== undefined) return;
      const aliveN = w.aliveN || items.length, ps = ids.map((id) => items[id]), depth = Math.max.apply(null, ps.map((p) => p.depth)) + 1;
      const spread = Math.max.apply(null, ps.map((p) => p.depth)) - Math.min.apply(null, ps.map((p) => p.depth));
      const needE = depth > 2 ? 0.1 * Math.pow(depth - 2, 1.5) : 0, needM = depth > 2 ? 0.08 * Math.pow(depth - 2, 1.5) : 0;
      const gate = Math.min(1, (w.caps[E] + 0.3) / (needE + 0.3)) * Math.min(1, (w.caps[M] + 0.3) / (needM + 0.3));
      if (rnd() > gate) return;
      const p = Math.min(0.5, P.base * Math.exp(-0.22 * spread - 0.2 * depth) / Math.pow(1 + aliveN / 120, 0.7) * (1 + 0.12 * w.caps[S] + 0.06 * w.caps[O]) * (0.6 + 0.4 * a.curious));
      const u = u01.apply(null, [seed, 1, ctx].concat(ids));
      if (u >= p) { tried.set(key, 0); return; }
      // 成功: 新しい技術。能力は親から受け継ぎ、法則(乱数表)から決まる新しい性質が加わる
      const c = new Array(K).fill(0);
      for (let d = 0; d < K; d++) {
        let mxv = 0, sm = 0; for (const q of ps) { if (q.c[d] > mxv) mxv = q.c[d]; sm += q.c[d]; }
        const keep = u01.apply(null, [seed, 2, d].concat(ids)) < 0.4 ? 1 : 0.15;
        const jump = keep * -Math.log(1 - u01.apply(null, [seed, 3, d].concat(ids))) * (0.18 + 0.05 * depth);
        c[d] = 0.62 * mxv + 0.22 * sm / ps.length + jump;
      }
      const it = addItem(ids, c, w.year, 0, null);
      tried.set(key, 1e9);
      learn(a, it.id);
      for (let t = 0; t < 3; t++) learn(agents[Math.floor(rnd() * agents.length)], it.id);
      it.rec = rnd() < 1 / (1 + Math.exp(-(w.caps[I] - 1.0) * 3));
      if (it.rec) lib.push(it.id);
      capsAdd(it);
      w.log(w.year, 'item', it.name + '(' + DIM_JP[it.dom] + '系)');
      checkMilestones(it);
      if (w.caps[I] >= 1.2 && !w.recRetro) { w.recRetro = true; for (const x of items) if (x.alive && !x.rec && rnd() < 0.6) { x.rec = true; lib.push(x.id); } }
    }

    function step(dt) {
      if (w.ended) return;
      const c = w.caps;
      w.year += dt;
      // 人口(ロジスティック)。収容力は農・医・エネルギー・輸送・社会の力で上がる
      w.Kcap = 2500 * Math.exp(0.55 * c[L] + 0.35 * c[E] + 0.2 * c[T] + 0.2 * c[O] + 0.15 * c[M]);
      w.pop = Math.max(0, w.pop + w.pop * Math.min(0.3, 0.01 * dt) * (1 - w.pop / w.Kcap));
      syncAgents();
      if (agents.length < 8) { w.ended = true; w.log(w.year, 'end', '人口が減りすぎて、文明は途絶えた'); return; }
      // 発明の試み
      const mult = 1 + 0.35 * c[I] + 0.15 * c[S] + 0.1 * c[O];
      let nAtt = Math.min(20 * dt, w.pop * P.attRate * dt * mult);
      let whole = Math.floor(nAtt); if (rnd() < nAtt - whole) whole++;
      for (let i = 0; i < whole; i++) attempt();
      // 個人間の知識の伝達と、書き残された知識の学習
      const contacts = Math.min(4, 1 + Math.floor(0.5 * c[O] + 0.3 * c[T]));
      const learnP = Math.min(0.9, 0.06 * dt);
      for (const a of agents) {
        for (let k = 0; k < contacts; k++) {
          const b = agents[Math.floor(rnd() * agents.length)];
          if (b === a || !b.arr.length) continue;
          const id = b.arr[Math.floor(rnd() * b.arr.length)];
          if (rnd() < learnP) learn(a, id);
        }
        if (lib.length && rnd() < Math.min(0.9, 0.02 * dt * (0.5 + c[I]))) learn(a, lib[Math.floor(rnd() * lib.length)]);
        a.age += dt;
      }
      // 世代交代(寿命は生命の力で伸びる)。亡くなる個人と共に、書き残されていない知識が消えることがある
      const life = 35 + 40 * (1 - Math.exp(-c[L] / 4));
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (rnd() < 1 - Math.exp(-dt * Math.pow(a.age / life, 6) * 0.5 - dt * 0.004)) {
          const par = agents[Math.floor(rnd() * agents.length)];
          forget(a); agents[i] = newAgent(par);
        }
      }
      if (lost.length) { for (const it of lost.splice(0)) if (it.depth >= 8) w.log(w.year, 'lost', '失われた技術: ' + it.name); recomputeCaps(); }
      // 危機(疫病・戦乱・災害・環境の限界)
      const load = w.pop * Math.pow(0.2 + c[E], 1.3) / (P.kLoad * loadScale) / (1 + 0.35 * c[S]);
      const dens = w.pop / 1e5;
      const hz = [3e-5 + 4e-5 * dens * (1 - 0.15 * c[L]), 2e-5 * (1 + c[M] + c[E]) * (1 - 0.3 * Math.min(2, c[O]) / 2), 3e-5, 0.0008 * Math.max(0, load - 1)];
      const names = ['疫病の流行', '大きな戦乱', '天変地異', '環境・資源の限界'];
      for (let k = 0; k < 4; k++) if (rnd() < 1 - Math.exp(-hz[k] * dt)) {
        const sev = 0.25 + 0.55 * rnd();
        w.pop *= sev; w.collapsed++;
        if (sev < 0.6) w.log(w.year, 'crisis', '【危機】' + names[k] + ': 人口が ' + Math.round((1 - sev) * 100) + '% 減少');
        for (const it of items) if (it.alive && !it.rec && rnd() < 0.15 && it.depth > 2) { it.alive = false; if (it.depth >= 8) w.log(w.year, 'lost', '失われた技術: ' + it.name); }
        recomputeCaps();
        break;
      }
      checkMilestones(null);
    }
    // 推奨の刻み幅(年)。技術が増えるほど細かく
    function stepSize() { return w.caps[I] >= 6 ? 8 : 25; }
    function summary() { return { year: w.year, pop: w.pop, items: items.filter((x) => x.alive).length, total: items.length, caps: w.caps.slice(), ms: Object.assign({}, w.ms), collapsed: w.collapsed, ended: w.ended }; }
    // ---- プログラム: 小さなスタックマシン。命令の名前は、この世界の「情報」系の技術名から付く。実際に実行して出力を得る。
    const OPS = [['PUSH', '値を積む'], ['ADD', '足す'], ['SUB', '引く'], ['MUL', '掛ける'], ['DUP', '複製する'], ['SWAP', '入れ替える'], ['OVER', '2番目を複製'], ['ROT', '3つを回す'], ['POP', '捨てる'], ['JZ', '0ならジャンプ'], ['JMP', 'ジャンプ'], ['PRINT', '出力する'], ['HALT', '停止']];
    const loopBody = (op) => [['DUP'], ['JZ', 13], ['OVER'], ['OVER'], [op], ['ROT'], ['POP'], ['SWAP'], ['PUSH', 1], ['SUB'], ['JMP', 2], ['POP'], ['PRINT'], ['HALT']];
    const TASKS = [
      { title: 'カウントダウン(5から1まで出力)', code: [['PUSH', 5], ['DUP'], ['PRINT'], ['PUSH', 1], ['SUB'], ['DUP'], ['JZ', 8], ['JMP', 1], ['HALT']] },
      { title: '1から10までの合計', code: [['PUSH', 0], ['PUSH', 10]].concat(loopBody('ADD').slice(0)) },
      { title: '6の階乗', code: [['PUSH', 1], ['PUSH', 6]].concat(loopBody('MUL').slice(0)) },
      { title: '2のべき乗を8個出力', code: [['PUSH', 1], ['PUSH', 8], ['DUP'], ['JZ', 13], ['SWAP'], ['DUP'], ['PRINT'], ['PUSH', 2], ['MUL'], ['SWAP'], ['PUSH', 1], ['SUB'], ['JMP', 2], ['HALT']] },
    ];
    function runVM(code) {
      const st = [], out = []; let pc = 0, n = 0;
      while (pc < code.length && n++ < 5000) {
        const [op, a] = code[pc++]; let x, y, z;
        switch (op) {
          case 'PUSH': st.push(a); break; case 'ADD': y = st.pop(); x = st.pop(); st.push(x + y); break; case 'SUB': y = st.pop(); x = st.pop(); st.push(x - y); break;
          case 'MUL': y = st.pop(); x = st.pop(); st.push(x * y); break; case 'DUP': st.push(st[st.length - 1]); break; case 'SWAP': y = st.pop(); x = st.pop(); st.push(y, x); break;
          case 'OVER': st.push(st[st.length - 2]); break; case 'ROT': z = st.pop(); y = st.pop(); x = st.pop(); st.push(y, z, x); break; case 'POP': st.pop(); break;
          case 'JZ': if (st.pop() === 0) pc = a; break; case 'JMP': pc = a; break; case 'PRINT': out.push(st.pop()); break; case 'HALT': return out;
        }
      }
      return out;
    }
    function programs() {
      if (w.ms.programming === undefined) return [];
      const pool = items.filter((x) => x.dom === I && x.alive && x.depth >= 2).map((x) => x.name), used = new Set(), names = {};
      OPS.forEach(([op, jp], k) => { let nm = pool.length ? pool[h32(seed, 4000 + k) % pool.length] : null; if (!nm || used.has(nm)) nm = nameOf(seed, 3000 + k) + '式' + jp; used.add(nm); names[op] = nm; });
      const order = TASKS.map((t, i) => [h32(seed, 5000 + i), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      const unlocked = Math.max(1, Math.min(TASKS.length, 1 + Math.floor((w.caps[I] - 7) / 1.2)));
      return order.slice(0, unlocked).map((ti) => {
        const t = TASKS[ti], out = runVM(t.code);
        return { title: t.title, out, code: t.code.map(([op, a], addr) => ({ addr, name: names[op], meaning: OPS.find((o) => o[0] === op)[1], arg: a })) };
      });
    }
    function individuals() {
      return agents.slice(0, 5).map((a) => ({ age: Math.floor(a.age), known: a.arr.length, best: a.arr.slice().sort((x, y) => items[y].depth - items[x].depth).slice(0, 3).map((id) => items[id].name) }));
    }
    w.programs = programs; w.individuals = individuals; w.runVM = runVM;
    w.step = step; w.stepSize = stepSize; w.summary = summary; w.MILESTONES = MILESTONES; w.DIM_JP = DIM_JP;
    return w;
  }
  return { create, DIM_JP, MILESTONES };
});
