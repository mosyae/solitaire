'use strict';
// ---------- constants ----------
const SUIT_PATH = [
  // spade, heart, diamond, club (24x24)
  'M12,2C9,7 4,9 4,14C4,16 6,18 8,18C9,18 10,18 11,17C11,17 11.32,19 9,22H15C13,19 13,17 13,17C14,18 15,18 16,18C18,18 20,16 20,14C20,9 15,7 12,2Z',
  'M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z',
  'M12,1L20,12L12,23L4,12Z',
  'M12,2C14.3,2 16.3,4 16.3,6.2C16.3,7.8 15.4,9.2 14.1,10C15.1,9.4 16.3,9 17.6,9C20,9 22,11 22,13.4C22,15.9 20,17.9 17.6,17.9C16,17.9 14.6,17.2 13.8,16C13.8,17.4 14.1,19.8 15.5,22H8.5C9.9,19.8 10.2,17.4 10.2,16C9.4,17.2 8,17.9 6.4,17.9C4,17.9 2,15.9 2,13.4C2,11 4,9 6.4,9C7.7,9 8.9,9.4 9.9,10C8.6,9.2 7.7,7.8 7.7,6.2C7.7,4 9.7,2 12,2Z'
];
const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const isRed = s => s === 1 || s === 2;
const last = a => a[a.length - 1];
const $ = id => document.getElementById(id);
const board = $('board');

// ---------- storage ----------
function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const settings = Object.assign({ draw: 1 }, load('sol.settings', {}));
const stats = Object.assign({ played: 0, won: 0, bestTime: 0, bestScore: 0, streak: 0, bestStreak: 0 }, load('sol.stats', {}));

// ---------- state ----------
let S = null;          // game state
let hist = [];         // undo stack (JSON snapshots)
let busy = false;      // auto-play in progress
const els = [];        // card elements by id
const locs = [];       // card id -> source descriptor
let G = {};            // geometry

function snapshot() { return JSON.stringify(S); }
function pushHist() { hist.push(snapshot()); if (hist.length > 300) hist.shift(); }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame(order) {
  closeDlg();
  if (S && S.counted && !S.won) { stats.streak = 0; store('sol.stats', stats); }
  const deck = order ? order.slice() : shuffle([...Array(52).keys()]);
  S = { stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []],
        score: 0, moves: 0, time: 0, started: false, counted: false, won: false, draw: settings.draw, deck: deck.slice() };
  // deal row by row so column i gets i+1 cards, top one face up
  let k = 0;
  const dealOrder = [];
  for (let row = 0; row < 7; row++) for (let col = row; col < 7; col++) {
    const n = deck[k++]; S.tab[col].push({ id: n, s: Math.floor(n / 13), r: n % 13 + 1, up: false }); dealOrder.push(n);
  }
  S.tab.forEach(c => last(c).up = true);
  while (k < 52) { const n = deck[k++]; S.stock.push({ id: n, s: Math.floor(n / 13), r: n % 13 + 1, up: false }); }
  hist = [];
  // deal animation: start everything at the stock, then fly out
  board.classList.add('notrans');
  for (const el of els) { el.style.left = G.stockX + 'px'; el.style.top = G.topY + 'px'; }
  render();                       // set faces/z
  for (const el of els) { el.style.left = G.stockX + 'px'; el.style.top = G.topY + 'px'; }
  void board.offsetWidth;
  board.classList.remove('notrans');
  dealOrder.forEach((id, i) => els[id].style.transitionDelay = (i * 22) + 'ms');
  render();
  setTimeout(() => dealOrder.forEach(id => els[id].style.transitionDelay = ''), 1200);
  saveGame(); updateHud();
}

function saveGame() { store('sol.game', { S, hist: hist.slice(-60) }); store('sol.stats', stats); }
window.saveGame = saveGame;

// ---------- rules ----------
function canTab(card, col) {
  if (!col.length) return card.r === 13;
  const t = last(col);
  return t.up && isRed(t.s) !== isRed(card.s) && t.r === card.r + 1;
}
function canFound(card, f) {
  if (!f.length) return card.r === 1;
  const t = last(f);
  return t.s === card.s && t.r + 1 === card.r;
}
function cardsOf(src) {
  if (src.p === 'w') return S.waste.length ? [last(S.waste)] : [];
  if (src.p === 'f') return S.found[src.i].length ? [last(S.found[src.i])] : [];
  if (src.p === 't') return S.tab[src.i].slice(src.k);
  return [];
}
function legal(src, dst) {
  const cs = cardsOf(src);
  if (!cs.length || !cs[0].up) return false;
  if (dst.p === 'f') return cs.length === 1 && !(src.p === 'f' && src.i === dst.i) && canFound(cs[0], S.found[dst.i]);
  if (dst.p === 't') return !(src.p === 't' && src.i === dst.i) && canTab(cs[0], S.tab[dst.i]);
  return false;
}
function pileOf(d) { return d.p === 'w' ? S.waste : d.p === 'f' ? S.found[d.i] : S.tab[d.i]; }

function doMove(src, dst, opt = {}) {
  if (!legal(src, dst)) return false;
  if (!opt.noHist) pushHist();
  const from = pileOf(src);
  const n = src.p === 't' ? from.length - src.k : 1;
  const moving = from.splice(from.length - n, n);
  pileOf(dst).push(...moving);
  // scoring (Windows-style)
  if (src.p === 'w' && dst.p === 't') S.score += 5;
  else if (dst.p === 'f' && src.p !== 'f') S.score += 10;
  else if (src.p === 'f' && dst.p === 't') S.score = Math.max(0, S.score - 15);
  if (src.p === 't' && from.length && !last(from).up) { last(from).up = true; S.score += 5; }
  afterMove();
  return true;
}

function drawStock() {
  if (busy || S.won) return;
  if (S.stock.length) {
    pushHist();
    const n = Math.min(S.draw, S.stock.length);
    for (let i = 0; i < n; i++) { const c = S.stock.pop(); c.up = true; S.waste.push(c); }
  } else if (S.waste.length) {
    pushHist();
    while (S.waste.length) { const c = S.waste.pop(); c.up = false; S.stock.push(c); }
    if (S.draw === 1) S.score = Math.max(0, S.score - 100);
  } else { toast('No cards left in the deck'); return; }
  afterMove();
}

function afterMove() {
  S.moves++;
  if (!S.started) S.started = true;
  if (!S.counted) { S.counted = true; stats.played++; }
  render(); updateHud(); saveGame();
  if (S.found.every(f => f.length === 13)) return win();
  if (!busy && canAutoFinish()) autoFinish();
}

function undo() {
  if (busy || S.won) return;
  if (!hist.length) { toast('Nothing to undo'); return; }
  S = JSON.parse(hist.pop());
  S.moves++; // undo counts as a move
  render(); updateHud(); saveGame();
}

// ---------- auto move on tap ----------
function autoTarget(src) {
  const cs = cardsOf(src);
  if (!cs.length || !cs[0].up) return null;
  if (cs.length === 1 && src.p !== 'f') {
    for (let i = 0; i < 4; i++) if (legal(src, { p: 'f', i })) return { p: 'f', i };
  }
  // non-empty tableau columns first
  for (let i = 0; i < 7; i++) if (S.tab[i].length && legal(src, { p: 't', i })) return { p: 't', i };
  // empty columns (not pointless king shuffles)
  if (!(src.p === 't' && src.k === 0)) {
    for (let i = 0; i < 7; i++) if (!S.tab[i].length && legal(src, { p: 't', i })) return { p: 't', i };
  }
  return null;
}

function tap(src, el) {
  if (busy || S.won) return;
  if (src.p === 's') return drawStock();
  if (src.p === 't') {
    const col = S.tab[src.i], c = col[src.k];
    if (!c.up) {
      if (src.k === col.length - 1) { pushHist(); c.up = true; S.score += 5; afterMove(); }
      return;
    }
  }
  const dst = autoTarget(src);
  if (dst) doMove(src, dst);
  else { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
}

// ---------- auto finish ----------
function canAutoFinish() {
  return !S.won && !S.stock.length && !S.waste.length && S.tab.every(c => c.every(x => x.up)) &&
         S.tab.some(c => c.length);
}
function autoFinish() {
  busy = true;
  const step = () => {
    if (S.won || !S.tab.some(c => c.length)) { busy = false; return; }
    let best = null;
    for (let i = 0; i < 7; i++) {
      const col = S.tab[i]; if (!col.length) continue;
      const c = last(col);
      for (let f = 0; f < 4; f++) if (canFound(c, S.found[f]) && (!best || c.r < best.r)) best = { r: c.r, src: { p: 't', i, k: col.length - 1 }, dst: { p: 'f', i: f } };
    }
    if (!best) { busy = false; return; }
    pushHist();
    const from = S.tab[best.src.i]; S.found[best.dst.i].push(from.pop()); S.score += 10; S.moves++;
    render(); updateHud();
    if (S.found.every(f => f.length === 13)) { busy = false; saveGame(); return win(); }
    setTimeout(step, 90);
  };
  setTimeout(step, 250);
}

// ---------- hint ----------
function findHint() {
  const srcs = [];
  for (let i = 0; i < 7; i++) if (S.tab[i].length) srcs.push({ p: 't', i, k: S.tab[i].length - 1 });
  if (S.waste.length) srcs.push({ p: 'w' });
  // 1. to foundation
  for (const s of srcs) for (let f = 0; f < 4; f++) if (legal(s, { p: 'f', i: f })) return { src: s, dst: { p: 'f', i: f } };
  // 2. tableau run that reveals a face-down card
  for (let i = 0; i < 7; i++) {
    const col = S.tab[i]; const k = col.findIndex(c => c.up);
    if (k <= 0) continue;
    for (let j = 0; j < 7; j++) if (S.tab[j].length && legal({ p: 't', i, k }, { p: 't', i: j })) return { src: { p: 't', i, k }, dst: { p: 't', i: j } };
  }
  // 3. waste to tableau
  if (S.waste.length) for (let j = 0; j < 7; j++) if (legal({ p: 'w' }, { p: 't', i: j })) return { src: { p: 'w' }, dst: { p: 't', i: j } };
  // 4. king run to empty column (revealing a card)
  for (let i = 0; i < 7; i++) {
    const col = S.tab[i]; const k = col.findIndex(c => c.up);
    if (k <= 0) continue;
    for (let j = 0; j < 7; j++) if (!S.tab[j].length && legal({ p: 't', i, k }, { p: 't', i: j })) return { src: { p: 't', i, k }, dst: { p: 't', i: j } };
  }
  // 5. partial run move that frees a card for the foundation
  for (let i = 0; i < 7; i++) {
    const col = S.tab[i];
    for (let k = col.findIndex(c => c.up) + 1; k > 0 && k < col.length; k++) {
      const under = col[k - 1];
      if (!S.found.some(f => canFound(under, f))) continue;
      for (let j = 0; j < 7; j++) if (legal({ p: 't', i, k }, { p: 't', i: j })) return { src: { p: 't', i, k }, dst: { p: 't', i: j } };
    }
  }
  if (S.stock.length || S.waste.length) return { stock: true };
  return null;
}
function hint() {
  if (busy || S.won) return;
  const h = findHint();
  if (!h) { toast('No moves available — try Undo or a New game'); return; }
  if (h.stock) {
    flash([S.stock.length ? els[last(S.stock).id] : G.slotStock]);
    toast(S.stock.length ? 'Draw from the deck' : 'Turn the deck over');
    return;
  }
  const list = cardsOf(h.src).map(c => els[c.id]);
  const dp = pileOf(h.dst);
  list.push(dp.length ? els[last(dp).id] : (h.dst.p === 'f' ? G.slotF[h.dst.i] : G.slotT[h.dst.i]));
  flash(list);
}
function flash(list) {
  list.forEach(el => { el.classList.remove('hint'); void el.offsetWidth; el.classList.add('hint'); });
  setTimeout(() => list.forEach(el => el.classList.remove('hint')), 1900);
}

// ---------- win ----------
function win() {
  if (S.won) return;
  S.won = true;
  const bonus = S.time > 30 ? Math.round(700000 / S.time) : 0;
  S.score += bonus;
  stats.won++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  if (!stats.bestTime || S.time < stats.bestTime) stats.bestTime = S.time;
  stats.bestScore = Math.max(stats.bestScore, S.score);
  updateHud(); saveGame();
  celebrate();
  setTimeout(() => showDlg('🎉 You won!',
    `<div class="stats"><span>Time</span><span>${fmt(S.time)}</span><span>Moves</span><span>${S.moves}</span>
     <span>Time bonus</span><span>${bonus}</span><span>Score</span><span>${S.score}</span>
     <span>Best time</span><span>${fmt(stats.bestTime)}</span><span>Games won</span><span>${stats.won} / ${stats.played}</span></div>`,
    [['New game', () => newGame(), 'pri']]), 1400);
}
function celebrate() {
  els.forEach((el, i) => {
    el.style.transitionDelay = (i * 18) + 'ms';
    el.style.transition = 'left 1s ease-in, top 1s ease-in';
    setTimeout(() => {
      el.style.left = (Math.random() * (G.W - G.w)) + 'px';
      el.style.top = (Math.random() * (G.H - G.h)) + 'px';
    }, 20);
  });
  setTimeout(() => els.forEach(el => { el.style.transition = ''; el.style.transitionDelay = ''; }), 2500);
}

// ---------- layout / render ----------
function layout() {
  const W = board.clientWidth, H = board.clientHeight;
  const gap = Math.max(3, Math.round(W * 0.01));
  let w = Math.floor((W - gap * 8) / 7);
  w = Math.min(w, Math.floor(H / 1.5 / 4.2), 130);
  const h = Math.round(w * 1.5);
  const left = Math.round((W - (w * 7 + gap * 6)) / 2);
  const colX = i => left + i * (w + gap);
  G = { W, H, w, h, gap, colX, topY: gap * 2, tabY: gap * 2 + h + gap * 3, stockX: colX(6), slotF: G.slotF, slotT: G.slotT, slotStock: G.slotStock };
  const st = document.documentElement.style;
  st.setProperty('--w', w + 'px'); st.setProperty('--h', h + 'px'); st.setProperty('--rad', Math.round(w * 0.075) + 'px');
  const pos = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
  G.slotF.forEach((el, i) => pos(el, colX(i), G.topY));
  G.slotT.forEach((el, i) => pos(el, colX(i), G.tabY));
  pos(G.slotStock, colX(6), G.topY);
}

function setCard(c, x, y, z, src) {
  const el = els[c.id];
  const cls = 'card ' + (c.up ? 'up ' : 'down ') + (isRed(c.s) ? 'red' : 'blk');
  if (el.className.replace(/ (hint|shake|drag)/g, '') !== cls) el.className = cls;
  const nx = Math.round(x) + 'px', ny = Math.round(y) + 'px';
  if (el.style.left !== nx || el.style.top !== ny) {
    // lift moving cards above everything while they travel
    el.style.zIndex = 500 + z;
    clearTimeout(el._zt); el._zt = setTimeout(() => { el.style.zIndex = z; }, 230);
    el.style.left = nx; el.style.top = ny;
  } else if (!el._zt || el.style.zIndex < 500) el.style.zIndex = z;
  locs[c.id] = src;
}

function render() {
  const { w, h, colX, topY, tabY, H } = G;
  S.stock.forEach((c, i) => setCard(c, colX(6), topY, 10 + i, { p: 's' }));
  // waste (fan last 3 in draw-3 mode)
  const wl = S.waste.length, vis = S.draw === 3 ? Math.min(3, wl) : 1, fan = w * 0.3;
  const wx = colX(5) - (S.draw === 3 ? fan * 2 : 0);
  S.waste.forEach((c, i) => {
    const off = Math.max(0, i - (wl - vis));
    setCard(c, wx + off * fan, topY, 10 + i, { p: 'w' });
  });
  S.found.forEach((f, fi) => f.forEach((c, i) => setCard(c, colX(fi), topY, 10 + i, { p: 'f', i: fi })));
  const avail = H - tabY - h - G.gap * 2;
  S.tab.forEach((col, ci) => {
    const nd = col.filter(c => !c.up).length, nu = col.length - nd;
    let od = h * 0.085, ou = h * 0.3;
    const need = () => nd * od + Math.max(0, nu - 1) * ou;
    if (need() > avail) { ou = Math.max(h * 0.14, (avail - nd * od) / Math.max(1, nu - 1)); }
    if (need() > avail) { od = Math.max(h * 0.04, (avail - Math.max(0, nu - 1) * ou) / Math.max(1, nd)); }
    let y = tabY;
    col.forEach((c, i) => { setCard(c, colX(ci), y, 10 + i, { p: 't', i: ci, k: i }); y += c.up ? ou : od; });
  });
}

function fmt(t) { const m = Math.floor(t / 60), s = t % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
function updateHud() {
  $('score').textContent = S.score; $('moves').textContent = S.moves; $('time').textContent = fmt(S.time);
  $('bUndo').disabled = !hist.length;
}

// ---------- build DOM ----------
function suitSvg(s, cls) { return `<svg class="${cls}" viewBox="0 0 24 24"><path d="${SUIT_PATH[s]}"/></svg>`; }
function build() {
  const mkSlot = (html) => { const d = document.createElement('div'); d.className = 'slot'; d.innerHTML = html; board.appendChild(d); return d; };
  G.slotF = [0, 1, 2, 3].map(() => mkSlot('A'));
  G.slotT = [0, 1, 2, 3, 4, 5, 6].map(() => mkSlot(''));
  G.slotStock = mkSlot('<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>');
  G.slotStock.dataset.stock = '1';
  for (let n = 0; n < 52; n++) {
    const s = Math.floor(n / 13), r = n % 13 + 1;
    const el = document.createElement('div');
    el.className = 'card down'; el.dataset.id = n;
    el.innerHTML = `<span class="r${r === 10 ? ' ten' : ''}">${RANK[r]}</span>${suitSvg(s, 's')}${suitSvg(s, 'c')}`;
    board.appendChild(el); els[n] = el;
  }
}

// ---------- input (tap + drag) ----------
let drag = null;
board.addEventListener('pointerdown', e => {
  if (drag || busy || !S || S.won) return;
  const el = e.target.closest('.card, .slot');
  if (!el) return;
  if (el.dataset.stock) { drag = { stockTap: true, x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
  if (!el.classList.contains('card')) return;
  const id = +el.dataset.id, src = locs[id];
  if (!src) return;
  if (src.p === 's') { drag = { stockTap: true, x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
  let s = src;
  if (src.p === 'w' || src.p === 'f') s = Object.assign({}, src); // always the top card
  const cs = cardsOf(s);
  const draggable = cs.length && cs[0].up;
  drag = { src: s, el, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, draggable,
           list: draggable ? cs.map(c => els[c.id]) : [] };
  try { board.setPointerCapture(e.pointerId); } catch (_) {}
});
board.addEventListener('pointermove', e => {
  if (!drag || drag.stockTap || e.pointerId !== drag.id || !drag.draggable) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    drag.list.forEach((el, i) => { el.classList.add('drag'); el.style.zIndex = 1000 + i; });
  }
  drag.dx = dx; drag.dy = dy;
  drag.list.forEach(el => el.style.transform = `translate(${dx}px,${dy}px)`);
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (d.stockTap) { if (!cancel && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) drawStock(); return; }
  if (!d.moved) { if (!cancel) tap(d.src, d.el); return; }
  // bake the drag offset into left/top so cards animate from where they were dropped
  d.list.forEach(el => {
    el.style.left = (parseFloat(el.style.left) + d.dx) + 'px';
    el.style.top = (parseFloat(el.style.top) + d.dy) + 'px';
    el.style.transform = '';
  });
  void board.offsetWidth;
  d.list.forEach(el => el.classList.remove('drag'));
  let dst = null;
  if (!cancel) {
    const r0 = d.list[0].getBoundingClientRect();
    let best = 0;
    const tryTarget = (t, rect) => {
      const ox = Math.max(0, Math.min(r0.right, rect.right) - Math.max(r0.left, rect.left));
      const oy = Math.max(0, Math.min(r0.bottom, rect.bottom) - Math.max(r0.top, rect.top));
      const a = ox * oy;
      if (a > best && legal(d.src, t)) { best = a; dst = t; }
    };
    for (let i = 0; i < 4; i++) {
      const f = S.found[i];
      tryTarget({ p: 'f', i }, (f.length ? els[last(f).id] : G.slotF[i]).getBoundingClientRect());
    }
    for (let i = 0; i < 7; i++) {
      const col = S.tab[i];
      const r = (col.length ? els[last(col).id] : G.slotT[i]).getBoundingClientRect();
      // make the column target a bit taller to be forgiving
      tryTarget({ p: 't', i }, { left: r.left, right: r.right, top: r.top, bottom: r.bottom + G.h * 0.5 });
    }
  }
  if (!(dst && doMove(d.src, dst))) render();
}
board.addEventListener('pointerup', e => endDrag(e, false));
board.addEventListener('pointercancel', e => endDrag(e, true));

// ---------- dialogs / menu ----------
function showDlg(title, body, buttons) {
  $('dlgT').textContent = title; $('dlgB').innerHTML = body;
  const bb = $('dlgBtns'); bb.innerHTML = '';
  buttons.forEach(([label, fn, cls]) => {
    const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
    b.onclick = fn; bb.appendChild(b);
  });
  $('dlg').hidden = false;
}
function closeDlg() { $('dlg').hidden = true; }
$('dlg').addEventListener('click', e => { if (e.target.id === 'dlg' && !S.won) closeDlg(); });

function confirmNew() {
  if (busy) return;
  if (S.moves > 0 && !S.won) {
    showDlg('New game?', 'Your current game will be counted as a loss.',
      [['Deal new game', () => newGame(), 'pri'], ['Cancel', closeDlg]]);
  } else newGame();
}
function menu() {
  if (busy) return;
  const seg = `<div class="seg"><button data-d="1" class="${settings.draw === 1 ? 'on' : ''}">Draw 1</button><button data-d="3" class="${settings.draw === 3 ? 'on' : ''}">Draw 3</button></div>
    <div class="muted">Draw mode applies when you start a new game.</div><br>
    <div class="stats"><span>Games played</span><span>${stats.played}</span><span>Games won</span><span>${stats.won}${stats.played ? ' (' + Math.round(stats.won / stats.played * 100) + '%)' : ''}</span>
    <span>Best time</span><span>${stats.bestTime ? fmt(stats.bestTime) : '—'}</span><span>Best score</span><span>${stats.bestScore}</span>
    <span>Current streak</span><span>${stats.streak}</span><span>Best streak</span><span>${stats.bestStreak}</span></div>`;
  showDlg('Solitaire', seg, [
    ['New game', () => { closeDlg(); confirmNew(); }, 'pri'],
    ['Restart this deal', () => { closeDlg(); const d = S.deck; newGame(d); }],
    ['Reset statistics', () => showDlg('Reset statistics?', 'This cannot be undone.', [
      ['Reset', () => { Object.assign(stats, { played: 0, won: 0, bestTime: 0, bestScore: 0, streak: 0, bestStreak: 0 }); store('sol.stats', stats); menu(); }, 'pri'],
      ['Cancel', menu]])],
    ['Close', closeDlg]
  ]);
  $('dlgB').querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    settings.draw = +b.dataset.d; store('sol.settings', settings);
    $('dlgB').querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  });
}
$('bMenu').onclick = menu;
$('bNew').onclick = confirmNew;
$('bHint').onclick = hint;
$('bUndo').onclick = undo;

let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

// Android back button: close dialog if open, otherwise let the app close
window.onBack = function () { if (!$('dlg').hidden && !(S && S.won)) { closeDlg(); return true; } return false; };

// ---------- timer ----------
setInterval(() => {
  if (S && S.started && !S.won && !document.hidden && $('dlg').hidden) { S.time++; $('time').textContent = fmt(S.time); if (S.time % 10 === 0) saveGame(); }
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden && S) saveGame(); });
window.addEventListener('pagehide', () => S && saveGame());
window.addEventListener('resize', () => {
  board.classList.add('notrans'); layout(); if (S) render(); void board.offsetWidth; board.classList.remove('notrans');
});

// ---------- start ----------
build();
layout();
const saved = load('sol.game', null);
if (saved && saved.S && saved.S.tab && !saved.S.won) {
  S = saved.S; hist = saved.hist || [];
  board.classList.add('notrans'); render(); void board.offsetWidth; board.classList.remove('notrans');
  updateHud();
} else newGame();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
