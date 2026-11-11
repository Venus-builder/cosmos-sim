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
    { key: 'city', jp: '都市・国家のような大きな組織', ok: (c, w) => c[O] >= 2.2 && w.pop >= 600 },
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
    const P = Object.assign({ attRate: 0.0007, base: 0.07, pop0: 120, maxN: 2000, k0: 400, kLoad: 1.5e4 }, opts.params || {});
    const w = {
      seed, year: 0, pop: 0, items: [], timeline: [], ms: {}, caps: new Array(K).fill(0), over: false, collapsed: 0,
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

    // ---- 個人: 追跡する全員が「ひとり」。名前・性別・年齢・親子・配偶者・知っている技術・生涯の記録をもつ。
    //      (人数の上限 maxN は、注目する地域の大きさ。その外側は扱わない)
    const agents = [], byId = new Map(), deadQ = []; let nextId = 1;
    function note(a, text) { a.log.push({ year: Math.round(w.year), text }); if (a.log.length > 40) a.log.shift(); }
    function newAgent(mother, father, age) {
      const id = nextId++;
      const a = { id, name: nameOf(seed, 20000 + id), sex: rnd() < 0.5 ? 0 : 1, age: age || 0, born: Math.round(w.year - (age || 0)), arr: [], set: new Set(), curious: 0.4 + 1.2 * rnd(),
        mother: mother ? mother.id : -1, father: father ? father.id : -1, grp: mother ? mother.grp : 0, lineage: mother ? mother.lineage : id, partner: null, kids: [], inv: 0, log: [], alive: true, died: null };
      if (mother) { for (const k of mother.arr) if (rnd() < 0.7) learn(a, k); if (father) for (const k of father.arr) if (rnd() < 0.4) learn(a, k); }
      else startKnown.forEach((k) => learn(a, k));
      byId.set(id, a); return a;
    }
    function learn(a, id) { if (a.set.has(id)) return false; a.set.add(id); a.arr.push(id); items[id].holders++; return true; }
    function forget(a) { for (const id of a.arr) { const it = items[id]; if (--it.holders <= 0 && !it.rec && it.alive) { it.alive = false; lost.push(it); } } }
    const lost = [];
    function kill(i, cause) {
      const a = agents[i];
      a.alive = false; a.died = { year: Math.round(w.year), cause }; note(a, '死去(' + cause + '、' + Math.floor(a.age) + '歳)');
      if (a.partner && a.partner.alive) { a.partner.partner = null; note(a.partner, '配偶者の' + a.name + 'が死去'); }
      forget(a); a.arr = a.arr.slice(0, 12); a.set = null;
      agents[i] = agents[agents.length - 1]; agents.pop();
      deadQ.push(a.id); if (deadQ.length > 1500) byId.delete(deadQ.shift());
    }
    for (let i = 0; i < P.pop0; i++) { const a = newAgent(null, null, 5 + rnd() * 40); a.sex = i % 2; note(a, '最初の集団の一員'); agents.push(a); }
    w.pop = agents.length;

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
    function attempt(a) {
      if (rnd() < 0.03 + 0.01 * w.caps[T]) { // 探検・観察: 身の回りの別の自然現象に気づく
        if (rnd() < 0.3 && prims.length < 48) { // まだ誰も知らない自然の素材・現象を見つける(世界の乱数で性質が決まる)
          const id = items.length, c = new Array(K).fill(0), dom = h32(seed, id, 21) % K;
          for (let d = 0; d < K; d++) c[d] = 0.08 * -Math.log(1 - u01(seed, id, d, 3));
          c[dom] += 0.4 + 0.8 * u01(seed, id, 9);
          capsAdd(addItem([], c, w.year, -1, nameOf(seed, 900 + id) + 'の' + NAT[h32(seed, id, 22) % NAT.length])); prims.push(id);
        }
        const unk = prims.filter((i) => !a.set.has(i));
        if (unk.length) { const id = unk[Math.floor(rnd() * unk.length)]; learn(a, id); note(a, '新しい自然の素材・現象に気づいた: ' + items[id].name); if (rnd() < 0.5) for (let t = 0; t < 3; t++) learn(agents[Math.floor(rnd() * agents.length)], id); }
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
      const it = addItem(ids, c, w.year, a.id, null);
      a.inv++; note(a, '【発明】' + it.name);
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

    // ---- 集団・国家・交易・戦争(個人が所属し、集団どうしの関係が個人の知識と生死に影響する)
    const CONCEPTS = ['水', '火', '人', '母', '太陽', '食べる', '大きい', '一', '二', '石', '獣', '夜'];
    const PROTO = CONCEPTS.map((_, k) => [SYL[h32(seed, 6000 + k, 1) % SYL.length], SYL[h32(seed, 6000 + k, 2) % SYL.length]]); // 祖語の単語
    const wordOf = (g, k) => (g.lang.loans[k] || PROTO[k].map((sy) => { for (const [f, t] of g.lang.shifts) if (sy === f) sy = t; return sy; })).join('');
    const intel = (A, B) => { let n = 0; for (let k = 0; k < CONCEPTS.length; k++) if (wordOf(A, k) === wordOf(B, k)) n++; return n / CONCEPTS.length; }; // 通じる度合い(同じ単語の割合)
    const groups = [{ id: 0, parent: -1, name: nameOf(seed, 30000) + '族', born: 0, alive: true, leader: null, lang: { shifts: [], loans: {} } }];
    const rel = new Map(); // 'a-b' → { trade, hostility, war }
    const relOf = (a, b) => { const k = a < b ? a + '-' + b : b + '-' + a; let r = rel.get(k); if (!r) { r = { a: Math.min(a, b), b: Math.max(a, b), trade: 0.1, hostility: 0.1, war: false }; rel.set(k, r); } return r; };
    const nameG = (id) => groups[id].name;
    function societyStep(dt) {
      const c = w.caps, cnt = new Map();
      for (const a of agents) { let l = cnt.get(a.grp); if (!l) cnt.set(a.grp, l = []); l.push(a); }
      // 分裂: 大きくなりすぎた集団は、血縁(系統)ごとに二つに分かれる
      const capG = 90 + 220 * Math.min(3, Math.max(0, c[O]));
      for (const [gid, mem] of Array.from(cnt)) {
        if (mem.length <= capG) continue;
        const moving = mem.filter((a) => u01(seed, 77 + groups.length, a.lineage) < 0.5);
        if (moving.length < 20 || mem.length - moving.length < 20 || w.year - (groups[gid].lastSplit || -1e9) < 60) continue;
        groups[gid].lastSplit = w.year;
        const ng = { id: groups.length, parent: gid, name: nameOf(seed, 30000 + groups.length) + (c[O] > 2.2 ? '国' : '族'), born: w.year, alive: true, leader: null, lang: { shifts: groups[gid].lang.shifts.slice(), loans: Object.assign({}, groups[gid].lang.loans) } };
        groups.push(ng);
        for (const a of moving) a.grp = ng.id;
        const r = relOf(gid, ng.id); r.trade = 0.3; r.hostility = 0.15;
        w.log(w.year, 'society', '【分裂】' + nameG(gid) + ' から ' + ng.name + ' が分かれた(人口 ' + mem.length + ')');
      }
      const alive = groups.filter((g) => g.alive);
      // 言葉は世代とともに少しずつ変わる(音の変化)。離れた集団ほど通じなくなる
      for (const g of alive) if (rnd() < 1 - Math.exp(-dt / 350)) g.lang.shifts.push([SYL[Math.floor(rnd() * SYL.length)], SYL[Math.floor(rnd() * SYL.length)]]);
      const size = new Map(); for (const a of agents) size.set(a.grp, (size.get(a.grp) || 0) + 1);
      const crowd = w.pop / Math.max(1, w.Kcap);
      for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
        const A = alive[i], B = alive[j], na = size.get(A.id) || 0, nb = size.get(B.id) || 0;
        if (na < 6 || nb < 6) continue;
        const r = relOf(A.id, B.id);
        // 交易が増えると敵意が下がり、人が増えて資源が足りなくなると敵意が上がる
        const it = intel(A, B); r.intel = it;
        r.trade = Math.max(0, Math.min(1, r.trade + 0.0012 * dt * (0.3 + c[T]) * (1 - r.hostility) * (0.35 + 0.65 * it) - 0.0006 * dt * r.trade)); // 言葉が通じるほど交易しやすい
        r.hostility = Math.max(0, Math.min(1, r.hostility + 0.003 * dt * Math.max(0, crowd - 0.6) - 0.004 * dt * (0.3 + c[O]) * r.trade));
        if (r.war) { r.war = false; r.hostility = Math.max(0.2, r.hostility * 0.6); }
        // 交易: 知識を交換する
        if (r.trade > 0.2 && rnd() < Math.min(0.9, r.trade * 0.12 * dt)) {
          const ma = cnt.get(A.id), mb = cnt.get(B.id);
          if (ma && mb) { const x = ma[Math.floor(rnd() * ma.length)], y = mb[Math.floor(rnd() * mb.length)]; if (y.arr.length) learn(x, y.arr[Math.floor(rnd() * y.arr.length)]); if (x.arr.length) learn(y, x.arr[Math.floor(rnd() * x.arr.length)]); if (rnd() < 0.08) { const k = Math.floor(rnd() * CONCEPTS.length); B.lang.loans[k] = wordOf(A, k).match(/ヴァ|./g); } }
        }
        // 戦争: 敵意が高く、武器(材料・エネルギー)が進むほど起こりやすい。組織力が高いと抑えられる
        const pw = 1 - Math.exp(-dt * 0.012 * r.hostility * r.hostility * (1 + 0.25 * (c[M] + c[E])) / (1 + 0.6 * c[O] * r.trade));
        if (rnd() < pw) {
          r.war = true;
          const Sa = na * (1 + 0.3 * c[M] + 0.3 * c[E]) * (0.8 + 0.4 * rnd()), Sb = nb * (1 + 0.3 * c[M] + 0.3 * c[E]) * (0.8 + 0.4 * rnd());
          const win = Sa >= Sb ? A : B, lose = win === A ? B : A, fl = 0.05 + 0.15 * rnd(), fw = 0.02 + 0.08 * rnd();
          let killed = 0;
          for (let k = agents.length - 1; k >= 0 && agents.length > 8; k--) { const a = agents[k]; if (a.age < 16 || a.age > 50) continue; const p = a.grp === lose.id ? fl * (a.sex ? 0.3 : 1) : a.grp === win.id ? fw * (a.sex ? 0.3 : 1) : 0; if (p && rnd() < p) { kill(k, '戦争'); killed++; } }
          const conquer = (size.get(lose.id) || 0) < 0.6 * (size.get(win.id) || 1) && rnd() < 0.45;
          if (conquer) { for (const a of agents) if (a.grp === lose.id) a.grp = win.id; lose.alive = false; r.hostility = 0.1; w.log(w.year, 'society', '【戦争】' + nameG(win.id) + ' が ' + nameG(lose.id) + ' を征服・併合(死者 ' + killed + '人)'); }
          else { r.hostility = 0.45; w.log(w.year, 'society', '【戦争】' + nameG(A.id) + ' と ' + nameG(B.id) + ' が衝突(死者 ' + killed + '人、勝ち: ' + nameG(win.id) + ')'); }
        }
      }
      // 結婚は集団内が多く、一部は集団をまたぐ(婚姻でも知識が伝わる)。ここでは状態の記録だけ更新
      for (const g of groups) if (g.alive && !(size.get(g.id) > 0)) g.alive = false;
      w.state = {
        nations: groups.filter((g) => g.alive).map((g) => { const m = (cnt.get(g.id) || []); const ld = m.reduce((b, a) => (a.kids.length + a.inv > (b ? b.kids.length + b.inv : -1) ? a : b), null); return { id: g.id, name: g.name, size: size.get(g.id) || 0, leader: ld ? ld.name : '—', born: g.born, words: [0, 1, 2, 4].map((k) => CONCEPTS[k] + '=' + wordOf(g, k)).join(' ') }; }),
        langs: groups.map((g) => ({ id: g.id, parent: g.parent, name: g.name, alive: g.alive, born: g.born, sample: wordOf(g, 0) + '・' + wordOf(g, 2), toRoot: intel(g, groups[0]) })),
        relations: Array.from(rel.values()).filter((r) => groups[r.a].alive && groups[r.b].alive).map((r) => ({ a: nameG(r.a), b: nameG(r.b), trade: r.trade, hostility: r.hostility, intel: r.intel === undefined ? 1 : r.intel, kind: r.hostility > 0.45 ? '敵対' : r.trade > 0.55 ? '交易が盛ん' : '中立' })),
      };
    }
    w.state = { nations: [], relations: [], langs: [] };

    // ---- 感染症: 新しい病気が現れ、人から人へ(同じ集団の中が多く、交易相手にも)うつる。世代ごとに個人を追う
    w.epidemics = []; let disN = 0;
    function epidemic(dt) {
      const c = w.caps;
      // 定住して家畜と暮らし、人が密集するほど、新しい病気が現れやすい
      if (rnd() >= 1 - Math.exp(-dt * 0.0022 * (agents.length / 400) * (1 + 0.5 * Math.min(3, c[L])))) return;
      const id = ++disN, name = nameOf(seed, 40000 + id) + '病';
      const R0 = (1.2 + 2.4 * rnd()) * (0.6 + 0.6 * Math.min(1, agents.length / Math.max(1, w.Kcap))) / (1 + 0.08 * c[L]); // 1人が何人にうつすか(医療で下がる)
      const mort = (0.04 + 0.45 * rnd() * rnd()) / (1 + 0.25 * c[L]);
      const byG = new Map(); for (const a of agents) { let l = byG.get(a.grp); if (!l) byG.set(a.grp, l = []); l.push(a); }
      const links = (g) => Array.from(rel.values()).filter((r) => (r.a === g || r.b === g) && r.trade > 0.15);
      const first = agents[Math.floor(rnd() * agents.length)]; first.sick = id;
      let cur = [first], infected = 1, gens = 0; const dead = [], hit = new Set([first.grp]);
      while (cur.length && gens++ < 40) {
        const next = [];
        for (const a of cur) {
          let n = Math.floor(R0); if (rnd() < R0 - n) n++;
          for (let t = 0; t < n; t++) {
            let pool = byG.get(a.grp);
            if (rnd() < 0.15) { const ls = links(a.grp); if (ls.length) { const r = ls[Math.floor(rnd() * ls.length)]; if (rnd() < r.trade) pool = byG.get(r.a === a.grp ? r.b : r.a) || pool; } }
            const b = pool[Math.floor(rnd() * pool.length)];
            if (!b || !b.alive || b.sick === id) continue;
            b.sick = id; next.push(b); infected++; hit.add(b.grp);
          }
          if (rnd() < mort * (a.age < 5 || a.age > 55 ? 1.6 : 1)) dead.push(a);
        }
        cur = next;
      }
      let died = 0;
      for (const a of dead) { const i = agents.indexOf(a); if (i >= 0 && agents.length > 8) { kill(i, name); died++; } }
      w.epidemics.push({ year: Math.round(w.year), name, R0, mort, infected, dead: died, groups: hit.size }); if (w.epidemics.length > 30) w.epidemics.shift();
      if (infected >= 15) w.log(w.year, 'crisis', '【感染症】' + name + ': ' + infected + '人が感染、' + died + '人が死亡(' + hit.size + '集団に広がった・1人が約' + R0.toFixed(1) + '人にうつす)');
      w.pop = agents.length;
    }

    // ---- 気候: エネルギー利用で CO₂ が増え、気温が上がる。科学が進むと排出の少ないエネルギーに替わる
    // (注目する地域の人口を、惑星全体の縮図とみなした換算。数値は仮説)
    w.climate = { co2: 280, dT: 0, emis: 0, clean: 0 };
    function climateStep(dt) {
      const c = w.caps, cl = w.climate;
      const ind = Math.max(0, c[E] - 3.5);
      cl.clean = Math.min(0.97, Math.max(0, (c[S] - 6) / 6) * 0.6 + (w.ms.nuclear !== undefined ? 0.3 : 0) + Math.min(0.2, Math.max(0, cl.dT - 1) * 0.08 * Math.min(1, c[O] / 4)));
      cl.emis = (agents.length / 2000) * Math.pow(ind, 1.6) * (1 - cl.clean) * 1.2; // ppm/年
      cl.co2 = Math.max(280, cl.co2 + (cl.emis - (cl.co2 - 280) / 250) * dt); // 海と陸が、ゆっくり吸収する
      const target = 3 * Math.log2(cl.co2 / 280); // 気候感度: CO₂ が2倍で約 3℃
      const before = cl.dT; cl.dT += (target - cl.dT) * Math.min(1, dt / 40);
      for (const th of [1.5, 3, 5]) if (before < th && cl.dT >= th) w.log(w.year, 'crisis', '【気候】気温が +' + th + '℃ を超えた(CO₂ ' + Math.round(cl.co2) + ' ppm)。土地の実りが減る');
      w.envClimate = Math.max(0.35, 1 - 0.09 * Math.max(0, cl.dT));
    }


    function step(dt) {
      if (w.ended) return;
      const c = w.caps;
      w.year += dt;
      w.Kcap = Math.min(P.maxN, P.k0 * (w.envK || 1) * (w.envClimate || 1) * Math.exp(0.9 * c[L] + 0.5 * c[E] + 0.3 * c[T] + 0.3 * c[O] + 0.2 * c[M])); // envK: 土地の実り(生態系の植物量)で変わる
      // 発明の試み(個人がそれぞれ、知っている技術を組み合わせて試す)
      const mult = 1 + 0.35 * c[I] + 0.15 * c[S] + 0.1 * c[O];
      const rate = P.attRate * (1 + (w.aliveN || 0) / 40) * mult * dt;
      const n0 = agents.length;
      for (let i = 0; i < n0; i++) {
        const a = agents[i]; if (a.age < 8) continue;
        const x = rate * a.curious; let k = Math.floor(x); if (rnd() < x - k) k++;
        for (let t = 0; t < k; t++) attempt(a);
      }
      // 知識の伝達(人から人へ)と、書き残された知識の学習
      const contacts = Math.min(4, 1 + Math.floor(0.5 * c[O] + 0.3 * c[T]));
      const learnP = Math.min(0.9, 0.06 * dt);
      const libP = Math.min(0.9, 0.02 * dt * (0.5 + c[I]));
      for (const a of agents) {
        for (let k = 0; k < contacts; k++) {
          const b = agents[Math.floor(rnd() * agents.length)];
          if (b === a || !b.arr.length) continue;
          if (rnd() < learnP) learn(a, b.arr[Math.floor(rnd() * b.arr.length)]);
        }
        if (lib.length && rnd() < libP) learn(a, lib[Math.floor(rnd() * lib.length)]);
        a.age += dt;
      }
      // 結婚(独り身の大人どうし)
      const single = agents.filter((a) => !a.partner && a.age >= 16 && a.age <= 55);
      const pp = Math.min(0.6, 0.25 * dt);
      for (const a of single) {
        if (a.partner || rnd() > pp) continue;
        for (let t = 0; t < 6; t++) {
          const b = single[Math.floor(rnd() * single.length)];
          if (b === a || b.partner || b.sex === a.sex || b.id === a.mother || b.id === a.father || a.id === b.mother || a.id === b.father) continue;
          a.partner = b; b.partner = a; note(a, b.name + 'と結婚'); note(b, a.name + 'と結婚'); break;
        }
      }
      // 出産(母親ごとに、その期間に生まれる子の数を決める)。生まれた子も、すぐに「ひとり」として追跡される
      const room = Math.max(0, 1 - agents.length / w.Kcap), n1 = agents.length;
      for (let i = 0; i < n1 && agents.length < P.maxN; i++) {
        const m = agents[i]; if (m.sex !== 1 || !m.partner || m.age < 16 || m.age - dt > 42) continue;
        const x = 0.13 * dt * room * Math.min(1, (42 - Math.max(16, m.age - dt)) / dt); let k = Math.floor(x); if (rnd() < x - k) k++;
        for (let t = 0; t < Math.min(k, 4) && agents.length < P.maxN; t++) {
          const f = m.partner, kid = newAgent(m, f, dt * rnd() * 0.9);
          m.kids.push(kid.id); f.kids.push(kid.id); note(m, '子の' + kid.name + 'が誕生'); note(f, '子の' + kid.name + 'が誕生'); note(kid, '誕生(母: ' + m.name + '、父: ' + f.name + ')');
          agents.push(kid);
        }
      }
      societyStep(dt); epidemic(dt); climateStep(dt);
      // 死亡(寿命は生命の力で伸びる。人が多すぎると食料が足りず死亡が増える)
      const life = 58 + 25 * (1 - Math.exp(-c[L] / 4)), crowd = 0.03 * Math.max(0, agents.length / w.Kcap - 1);
      for (let i = agents.length - 1; i >= 0; i--) {
        const a = agents[i];
        const h = 0.004 + 0.5 * Math.pow(a.age / life, 6) + (a.age < 5 ? 0.012 : 0) + crowd;
        if (rnd() < 1 - Math.exp(-h * dt)) kill(i, a.age / life > 0.8 ? '老衰' : crowd > 0.002 ? '飢え' : '病気・事故');
      }
      if (lost.length) { for (const it of lost.splice(0)) if (it.depth >= 8) w.log(w.year, 'lost', '失われた技術: ' + it.name); recomputeCaps(); }
      w.pop = agents.length;
      if (agents.length < 6) { w.ended = true; w.log(w.year, 'end', '人口が減りすぎて、文明は途絶えた'); return; }
      // 危機(疫病・戦乱・災害・環境の限界)
      const load = w.pop * Math.pow(0.2 + c[E], 1.3) / (P.kLoad * loadScale) / (1 + 0.35 * c[S]);
      const dens = w.pop / P.maxN;
      const hz = [0 * dens, // 疫病は epidemic() で個人ごとに扱う
         6e-5 * (1 + c[M] + c[E]) * (1 - 0.3 * Math.min(2, c[O]) / 2), 8e-5, 0.0008 * Math.max(0, load - 1)];
      const names = ['疫病の流行', '大きな戦乱', '天変地異', '環境・資源の限界'];
      for (let k = 0; k < 4; k++) if (rnd() < 1 - Math.exp(-hz[k] * dt)) {
        const sev = 0.25 + 0.55 * rnd(); let died = 0;
        for (let i = agents.length - 1; i >= 0 && agents.length > 6; i--) if (rnd() > sev) { kill(i, names[k]); died++; }
        w.collapsed++;
        if (sev < 0.6) w.log(w.year, 'crisis', '【危機】' + names[k] + ': ' + died + '人が亡くなった');
        for (const it of items) if (it.alive && !it.rec && rnd() < 0.15 && it.depth > 2) { it.alive = false; if (it.depth >= 8) w.log(w.year, 'lost', '失われた技術: ' + it.name); }
        recomputeCaps(); w.pop = agents.length;
        break;
      }
      checkMilestones(null);
    }
    // 推奨の刻み幅(年)。技術が増えるほど細かく
    function stepSize() { return w.caps[I] >= 6 ? 2 : 5; }
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
    function brief(id) { const a = byId.get(id); return a ? { id: a.id, name: a.name, alive: a.alive } : (id >= 0 ? { id, name: '(記録なし)', alive: false } : null); }
    function person(id) {
      const a = byId.get(id); if (!a) return null;
      const best = a.arr.slice().sort((x, y) => items[y].depth - items[x].depth).slice(0, 4).map((k) => items[k].name);
      return { id: a.id, name: a.name, sex: a.sex ? '女' : '男', age: Math.floor(a.age), born: a.born, alive: a.alive, died: a.died, mother: brief(a.mother), father: brief(a.father),
        partner: a.partner ? { id: a.partner.id, name: a.partner.name, alive: a.partner.alive } : null, kids: a.kids.slice(0, 20).map(brief), inv: a.inv, known: a.arr.length, best, log: a.log.slice(-25) };
    }
    // 追う個人の候補: 最多の発明者 / 最年長 / 最近生まれた人 / 子の多い人 / ランダム
    function pickPerson(kind) {
      const all = []; for (const a of byId.values()) all.push(a);
      const alive = agents;
      if (!alive.length) return null;
      let pick;
      if (kind === 'inventor') pick = all.reduce((m, a) => (a.inv > (m ? m.inv : -1) ? a : m), null);
      else if (kind === 'oldest') pick = alive.reduce((m, a) => (a.age > m.age ? a : m), alive[0]);
      else if (kind === 'newest') pick = alive.reduce((m, a) => (a.age < m.age ? a : m), alive[0]);
      else if (kind === 'parent') pick = all.reduce((m, a) => (a.kids.length > (m ? m.kids.length : -1) ? a : m), null);
      else pick = alive[Math.floor(rnd() * alive.length)];
      return pick ? pick.id : null;
    }
    function individuals() { return agents.slice(0, 5).map((a) => ({ age: Math.floor(a.age), known: a.arr.length, best: [] })); }
    w.person = person; w.pickPerson = pickPerson;
    w.programs = programs; w.individuals = individuals; w.runVM = runVM;
    w.step = step; w.stepSize = stepSize; w.summary = summary; w.MILESTONES = MILESTONES; w.DIM_JP = DIM_JP;
    return w;
  }
  return { create, DIM_JP, MILESTONES };
});
