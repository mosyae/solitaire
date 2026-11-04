'use strict';
// Klondike solver + deal generator.
// Used to deal games that are guaranteed to be winnable, at a chosen difficulty.
// Every function here is self-contained so it can also run inside a Web Worker
// (the worker is built from these functions' source text).

function shuffleDeck() {
  const a = [];
  for (let i = 0; i < 52; i++) a.push(i);
  for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// Returns {solved, nodes}. nodes = how many positions the search had to look at:
// small = the obvious moves win, large = the deal needs careful play.
function solveDeal(deck, draw, budget) {
  const SU = c => (c / 13) | 0;
  const RK = c => c % 13 + 1;
  const RED = c => { const s = (c / 13) | 0; return s === 1 || s === 2; };
  const canF = (c, F) => F[SU(c)] === RK(c) - 1;
  const canOn = (c, t) => RED(c) !== RED(t) && RK(t) === RK(c) + 1;
  const safe = (c, F) => {
    const r = RK(c); if (r <= 2) return true;
    return RED(c) ? (F[0] >= r - 1 && F[3] >= r - 1) : (F[1] >= r - 1 && F[2] >= r - 1);
  };

  const tab = [[], [], [], [], [], [], []];
  let k = 0;
  for (let row = 0; row < 7; row++) for (let col = row; col < 7; col++) tab[col].push(deck[k++]);
  const T = deck.slice(k).reverse();               // talon in draw order
  const start = { tab, down: [0, 1, 2, 3, 4, 5, 6], T, p: 0, F: [0, 0, 0, 0] };

  const clone = s => ({ tab: s.tab.map(a => a.slice()), down: s.down.slice(), T: s.T.slice(), p: s.p, F: s.F.slice() });
  const fix = (s, i) => { if (s.down[i] > 0 && s.tab[i].length === s.down[i]) s.down[i]--; };

  // talon positions that can be brought to the top of the waste (unlimited redeals)
  function access(s) {
    const L = s.T.length, out = [];
    if (!L) return out;
    const add = i => { if (out.indexOf(i) < 0) out.push(i); };
    if (s.p > 0) add(s.p - 1);
    for (let i = s.p + draw - 1; ; i += draw) { if (i >= L - 1) { add(L - 1); break; } add(i); }
    for (let i = draw - 1; ; i += draw) { if (i >= L - 1) { add(L - 1); break; } add(i); }
    return out;
  }

  function autoSafe(s) {
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < 7; i++) {
        const col = s.tab[i]; if (!col.length) continue;
        const c = col[col.length - 1];
        if (canF(c, s.F) && safe(c, s.F)) { col.pop(); s.F[SU(c)]++; fix(s, i); moved = true; }
      }
    }
  }

  function key(s) {
    const cols = [];
    for (let i = 0; i < 7; i++) {
      let t = String.fromCharCode(48 + s.down[i]);
      for (const c of s.tab[i]) t += String.fromCharCode(64 + c);
      cols.push(t);
    }
    cols.sort();
    let t = s.F.join(',') + '|' + cols.join('/') + '|' + s.p + ':';
    for (const c of s.T) t += String.fromCharCode(64 + c);
    return t;
  }

  function moves(s) {
    const out = [];
    const firstEmpty = s.tab.findIndex(c => !c.length);
    const acc = access(s);
    // 1. to foundation
    for (const idx of acc) if (canF(s.T[idx], s.F)) out.push({ t: 'xf', idx });
    for (let i = 0; i < 7; i++) {
      const col = s.tab[i];
      if (col.length && canF(col[col.length - 1], s.F)) out.push({ t: 'tf', i });
    }
    // 2. moves that reveal a face-down card
    for (let i = 0; i < 7; i++) {
      const col = s.tab[i], k0 = s.down[i];
      if (k0 === 0 || col.length <= k0) continue;
      const c = col[k0];
      for (let j = 0; j < 7; j++) {
        if (j === i) continue;
        const tj = s.tab[j];
        if (tj.length ? canOn(c, tj[tj.length - 1]) : (j === firstEmpty && RK(c) === 13)) out.push({ t: 'tt', i, k: k0, j });
      }
    }
    // 3. talon to tableau
    for (const idx of acc) {
      const c = s.T[idx];
      for (let j = 0; j < 7; j++) {
        const tj = s.tab[j];
        if (tj.length ? canOn(c, tj[tj.length - 1]) : (j === firstEmpty && RK(c) === 13)) out.push({ t: 'xt', idx, j });
      }
    }
    // 4. partial run moves that free a card for the foundation; whole-column moves
    for (let i = 0; i < 7; i++) {
      const col = s.tab[i], k0 = s.down[i];
      for (let k = k0; k < col.length; k++) {
        const partial = k > k0;
        if (partial && !canF(col[k - 1], s.F)) continue;
        if (!partial && k0 > 0) continue;               // already covered in step 2
        const c = col[k];
        if (!partial && RK(c) === 13) continue;         // king already at the base
        for (let j = 0; j < 7; j++) {
          if (j === i) continue;
          const tj = s.tab[j];
          if (tj.length && canOn(c, tj[tj.length - 1])) out.push({ t: 'tt', i, k, j });
        }
      }
    }
    return out;
  }

  function apply(s, m) {
    if (m.t === 'tf') { const c = s.tab[m.i].pop(); s.F[SU(c)]++; fix(s, m.i); }
    else if (m.t === 'xf') { const c = s.T.splice(m.idx, 1)[0]; s.p = m.idx; s.F[SU(c)]++; }
    else if (m.t === 'tt') { const mv = s.tab[m.i].splice(m.k); s.tab[m.j].push(...mv); fix(s, m.i); }
    else { const c = s.T.splice(m.idx, 1)[0]; s.p = m.idx; s.tab[m.j].push(c); }
    return s;
  }

  const seen = new Set();
  let nodes = 0;
  function dfs(s) {
    if (++nodes > budget) return false;
    autoSafe(s);
    if (s.down.every(d => d === 0)) return true;      // everything revealed = won
    const kk = key(s);
    if (seen.has(kk)) return false;
    seen.add(kk);
    for (const m of moves(s)) {
      if (dfs(apply(clone(s), m))) return true;
      if (nodes > budget) return false;
    }
    return false;
  }
  const solved = dfs(start);
  return { solved, nodes };
}

// level: 'easy' | 'medium' | 'hard'. Returns {deck, nodes}.
function makeDeal(level, draw, timeLimitMs) {
  // thresholds calibrated on random deals: ~45% of winnable deals need <100 nodes, ~15% need >3000
  const range = { easy: [0, 100], medium: [100, 3000], hard: [3000, 1e9] }[level] || [0, 1e9];
  const budget = level === 'hard' ? 150000 : 30000;
  const t0 = Date.now();
  let fallback = null;
  for (;;) {
    const deck = shuffleDeck();
    const r = solveDeal(deck, draw, budget);
    if (r.solved) {
      if (r.nodes >= range[0] && r.nodes < range[1]) return { deck, nodes: r.nodes };
      const dist = r.nodes < range[0] ? range[0] - r.nodes : r.nodes - range[1];
      if (!fallback || dist < fallback.dist) fallback = { deck, nodes: r.nodes, dist };
    }
    if (Date.now() - t0 > timeLimitMs && fallback) return { deck: fallback.deck, nodes: fallback.nodes };
  }
}
