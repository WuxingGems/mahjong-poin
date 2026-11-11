import { RULES, COMING } from './rules/index.js';
import { tileHTML, flowerHTML, windTileHTML, WIND_NAME, countsOf } from './tiles.js';

const KEY = 'mahjong-poin-v1';
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

// ---------- state ----------
function freshState() {
  const settings = {};
  for (const id in RULES) settings[id] = { ...RULES[id].defaults };
  return { screen: 'setup', names: ['Pemain 1', 'Pemain 2', 'Pemain 3', 'Pemain 4'], firstDealer: 0, rule: 'classical', settings, game: null, cur: null };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || !Array.isArray(s.names)) return null;
    s.settings = s.settings || {};
    for (const id in RULES) s.settings[id] = { ...RULES[id].defaults, ...(s.settings[id] || {}) };
    if (!RULES[s.rule]) s.rule = 'classical';
    return s;
  } catch { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* penyimpanan tidak tersedia */ } }

let S = load() || freshState();
let lastSettle = null;

const rule = () => RULES[S.rule];
const settings = () => S.settings[S.rule];
const nameOf = (p) => (S.names[p] || '').trim() || `Pemain ${p + 1}`;
const seatOf = (p) => ((p - S.game.dealer + 4) % 4) + 1;
const prevailing = () => Math.min(4, 1 + Math.floor(S.game.passes / 4));
const P4 = [0, 1, 2, 3];

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n > 0 ? '+' : '') + n.toLocaleString('id-ID');
const cls = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : '');
const windBadge = (w) => windTileHTML(w);
const seal = (ch, txt) => `<span class="seal">${ch}</span><span>${txt}</span>`;
const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/></svg>';

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 3500);
}
function go(screen) {
  S.screen = screen;
  save();
  render();
  window.scrollTo(0, 0);
}

function scoreFor(p) {
  const c = S.cur, h = c.hands[p];
  return rule().scoreHand({
    tiles: h.tiles, flowers: h.flowers, open: h.open,
    isWinner: p === c.winner, seat: seatOf(p), prevailing: prevailing(),
    win: { selfDrawn: c.selfDrawn, extras: c.extras }, settings: settings(),
  });
}

function groupTiles(g) {
  if (g.type === 'chow') return [g.tile, g.tile + 1, g.tile + 2];
  return new Array({ pung: 3, kong: 4, pair: 2 }[g.type]).fill(g.tile);
}

// ---------- views ----------
function fieldHTML(sp, val) {
  if (sp.type === 'bool') return `<label class="check"><input type="checkbox" data-opt="${sp.key}" ${val ? 'checked' : ''}> ${sp.label}</label>`;
  if (sp.type === 'select') return `<label class="field"><span>${sp.label}</span><select data-opt="${sp.key}">${sp.options.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  return `<label class="field"><span>${sp.label}</span><input type="number" inputmode="numeric" data-opt="${sp.key}" value="${val}"></label>`;
}

function viewSetup() {
  const inGame = !!S.game;
  const R = rule(), st = settings();
  return `
  <h2>${inGame ? 'Pengaturan' : 'Permainan baru'}</h2>
  ${inGame ? '' : '<p class="lead">Isi nama pemain dan pilih aturan main di rumahmu.</p>'}
  <div class="card">
    <h3>Nama pemain (urut searah tempat duduk)</h3>
    ${S.names.map((n, i) => `<label class="field"><span>Pemain ${i + 1}</span><input type="text" data-name="${i}" value="${esc(n)}" maxlength="20"></label>`).join('')}
    ${inGame ? '' : `<label class="field"><span>Dealer (Timur) pertama</span><select data-set="firstDealer">${P4.map((i) => `<option value="${i}" ${S.firstDealer === i ? 'selected' : ''}>${esc(nameOf(i))}</option>`).join('')}</select></label>`}
  </div>
  <div class="card">
    <h3>Aturan main</h3>
    <select data-set="rule">${Object.values(RULES).map((r) => `<option value="${r.id}" ${r.id === S.rule ? 'selected' : ''}>${r.name}</option>`).join('')}${COMING.map((c) => `<option disabled>${c.name}</option>`).join('')}</select>
    ${R.settingsSpec.map((sp) => fieldHTML(sp, st[sp.key])).join('')}
  </div>
  <div class="actions">
    ${inGame ? '<button class="btn primary" data-act="go-board">Simpan & kembali ke meja</button>' : '<button class="btn primary big" data-act="start">Mulai permainan</button>'}
  </div>
  ${inGame ? '<div class="card"><h3>Permainan</h3><button class="btn danger big" data-act="new-game">Mulai permainan baru (skor direset)</button></div>' : ''}`;
}

function histHTML(h) {
  const who = h.winner == null ? 'Seri' : `${esc(nameOf(h.winner))} menang${h.selfDrawn ? ' (tarik sendiri)' : ''}`;
  return `<div class="hist-item"><b>#${h.no}</b> ${who}<br>${h.net.map((v, i) => `${esc(nameOf(i))} <span class="${cls(v)}">${fmt(v)}</span>`).join(' · ')}</div>`;
}

function viewBoard() {
  const g = S.game, prev = prevailing();
  // Pemain 1 di bawah, giliran berlawanan arah jarum jam: kanan, atas, kiri.
  const pos = ['s-bot', 's-right', 's-top', 's-left'];
  return `
  <div class="table">
    ${P4.map((p) => {
      const t = g.totals[p];
      return `<div class="seat ${pos[p]} ${p === g.dealer ? 'dealer' : ''}">
        ${windBadge(seatOf(p))}
        <div class="nm">${esc(nameOf(p))}</div>
        <div class="pts ${cls(t)}">${fmt(t)}</div>
        <div class="tag">${p === g.dealer ? seal('莊', 'Dealer') : ''}</div></div>`;
    }).join('')}
    <div class="mid">
      ${tileHTML(26 + prev)}
      <div class="lbl">Ronde ${WIND_NAME[prev]}</div>
      <div class="sub">Tangan ke-${g.handNo}</div>
    </div>
  </div>
  <button class="btn primary big" data-act="new-hand">Hitung tangan berikutnya</button>
  <p class="muted" style="text-align:center;margin-top:10px">${esc(rule().name)}</p>
  ${g.history.length ? `<div class="card"><h3>Riwayat</h3>${g.history.slice().reverse().map(histHTML).join('')}
    <div class="actions"><button class="btn small danger" data-act="undo">Batalkan tangan terakhir</button></div></div>` : ''}`;
}

function viewWho() {
  const c = S.cur;
  const isNum = typeof c.winner === 'number';
  const canNext = c.winner === 'draw' || (isNum && (c.selfDrawn || c.discarder != null));
  const others = isNum ? P4.filter((p) => p !== c.winner) : [];
  return `
  <h2>Tangan ke-${S.game.handNo}: siapa yang menang?</h2>
  <div class="grid2">${P4.map((p) => `<button class="btn chip ${c.winner === p ? 'on' : ''}" data-act="winner" data-p="${p}">${windBadge(seatOf(p))}${esc(nameOf(p))}</button>`).join('')}</div>
  <button class="btn ghost ${c.winner === 'draw' ? 'on' : ''}" style="width:100%;margin-top:10px" data-act="winner" data-p="draw">Seri — tidak ada yang menang</button>
  ${isNum ? `
  <div class="card">
    <h3>Cara menang</h3>
    <div class="row">
      <button class="btn ${c.selfDrawn ? 'on' : ''}" data-act="self" data-v="1">Tarik sendiri</button>
      <button class="btn ${!c.selfDrawn ? 'on' : ''}" data-act="self" data-v="0">Dari buangan</button>
    </div>
    ${!c.selfDrawn ? `<h3>Siapa yang membuang?</h3><div class="row">${others.map((p) => `<button class="btn small ${c.discarder === p ? 'on' : ''}" data-act="discarder" data-p="${p}">${esc(nameOf(p))}</button>`).join('')}</div>` : ''}
    <h3>Tambahan (centang kalau ada)</h3>
    ${rule().winExtras.map((x) => `<label class="check"><input type="checkbox" data-extra="${x.key}" ${c.extras[x.key] ? 'checked' : ''}> ${x.label}</label>`).join('')}
  </div>` : ''}
  <div class="actions"><button class="btn ghost" data-act="go-board">Batal</button><button class="btn primary" data-act="who-next" ${canNext ? '' : 'disabled'}>Lanjut →</button></div>`;
}

function itemValue(x) {
  if (x.pts) return `+${x.pts}`;
  if (x.dbl) return `×${2 ** x.dbl}`;
  if (x.faan) return `${x.faan} faan`;
  return '';
}

function scoreHTML(res, h) {
  if (!h.tiles.length) return '<div class="muted">Belum ada ubin. Foto tangan atau ketuk ubin di atas.</div>';
  if (!res.ok) return `<div class="err">${res.error}</div>`;
  const groups = res.groups.length ? `
    <h3>Susunan terbaca — samakan Terbuka/Tertutup dengan di meja</h3>
    <div class="groups">${res.groups.map((g) => `<div class="group"><div class="set">${groupTiles(g).map((t) => tileHTML(t)).join('')}</div>
      ${g.type !== 'pair' ? `<button class="toggle ${h.open[g.key] ? 'open' : ''}" data-act="toggle-open" data-key="${g.key}">${h.open[g.key] ? 'Terbuka' : 'Tertutup'}</button>` : ''}</div>`).join('')}</div>` : '';
  const rows = res.items.filter((x) => x.pts || x.dbl || x.faan || x.note);
  return `${groups}
    <h3>Hitungan</h3>
    <table class="score">${rows.map((x) => `<tr><td>${x.label}</td><td class="n">${itemValue(x)}</td></tr>`).join('') || '<tr><td class="muted">Tidak ada poin</td><td></td></tr>'}
      <tr class="total"><td>Total</td><td class="n">${res.summary}</td></tr></table>
    ${res.warning ? `<p class="warn">${res.warning}</p>` : ''}`;
}

function viewHand() {
  const c = S.cur, p = c.order[c.step], h = c.hands[p];
  const isW = p === c.winner, last = c.step === c.order.length - 1;
  const res = scoreFor(p);
  const counts = countsOf(h.tiles);
  const showFlowers = settings().flowersOn !== false;
  return `
  ${c.order.length > 1 ? `<div class="stepbar">${c.order.map((_, k) => `<i class="${k <= c.step ? 'done' : ''}"></i>`).join('')}</div>` : ''}
  <h2 class="who">${windBadge(seatOf(p))}<span>${esc(nameOf(p))}</span>${isW ? seal('胡', 'Menang') : ''}</h2>
  <button class="btn big" data-act="photo">${ICON_CAM}Foto tangan</button>
  <div class="card">
    <h3>Di tangan · ${h.tiles.length} ubin${h.flowers.length ? ` + ${h.flowers.length} bunga` : ''} · ketuk untuk hapus</h3>
    <div class="rack" data-zone="hand">${h.tiles.map((t) => tileHTML(t)).join('')}${h.flowers.map((f) => flowerHTML(f)).join('')}${h.tiles.length || h.flowers.length ? '' : '<span class="empty">Rak masih kosong</span>'}</div>
    <h3>Ketuk ubin untuk menambah</h3>
    <div class="palette" data-zone="pal">${[...Array(34).keys()].map((i) => tileHTML(i, counts[i] >= 4 ? 'dim' : '')).join('')}</div>
    ${showFlowers ? `<div class="palette flowers" data-zone="pal">${[1, 2, 3, 4, 5, 6, 7, 8].map((f) => flowerHTML(f, h.flowers.includes(f) ? 'dim' : '')).join('')}</div>` : ''}
    <div class="actions"><button class="btn small ghost" data-act="clear-hand">Kosongkan rak</button></div>
  </div>
  <div class="card">${scoreHTML(res, h)}</div>
  <div class="actions">
    <button class="btn ghost" data-act="hand-back">← Kembali</button>
    <button class="btn primary" data-act="hand-next" ${!isW || res.ok ? '' : 'disabled'}>${last ? 'Lihat hasil →' : 'Lanjut →'}</button>
  </div>`;
}

function viewResult() {
  const c = S.cur, R = rule();
  const winner = c.winner === 'draw' ? null : c.winner;
  const results = P4.map((p) => (winner == null ? null : R.needsAllHands || p === winner ? scoreFor(p) : null));
  const st = R.settle({ results, winner, discarder: c.discarder, selfDrawn: c.selfDrawn, dealer: S.game.dealer, settings: settings() });
  lastSettle = { st, winner };
  const warn = winner != null && results[winner]?.warning;
  return `
  <h2>Hasil tangan ke-${S.game.handNo}</h2>
  ${winner == null ? '<div class="card">Seri — tidak ada yang bayar.</div>' : `
  <div class="card"><h3>Skor tangan</h3><table class="score">
    ${P4.filter((p) => results[p]).map((p) => `<tr><td>${esc(nameOf(p))} ${p === winner ? seal('胡', '') : ''}</td><td class="n">${results[p].summary}</td></tr>`).join('')}
  </table></div>
  <div class="card"><h3>Siapa bayar siapa</h3><table class="score">
    ${st.transfers.map((t) => `<tr><td>${esc(nameOf(t.from))} → ${esc(nameOf(t.to))}<span class="why">${t.why}</span></td><td class="n">${t.amt.toLocaleString('id-ID')}</td></tr>`).join('') || '<tr><td>Tidak ada</td></tr>'}
  </table></div>`}
  <div class="card"><h3>Perubahan poin</h3><table class="score">
    ${P4.map((p) => `<tr><td>${esc(nameOf(p))}</td><td class="n ${cls(st.net[p])}">${fmt(st.net[p])}</td><td class="n muted">jadi ${fmt(S.game.totals[p] + st.net[p])}</td></tr>`).join('')}
  </table></div>
  ${warn ? `<p class="warn">${warn}</p>` : ''}
  <div class="actions"><button class="btn ghost" data-act="result-back">← Kembali</button><button class="btn primary" data-act="commit">Simpan tangan</button></div>`;
}

function render() {
  if (['who', 'hand', 'result'].includes(S.screen) && !S.cur) S.screen = 'board';
  if (S.screen !== 'setup' && !S.game) S.screen = 'setup';
  const view = { setup: viewSetup, board: viewBoard, who: viewWho, hand: viewHand, result: viewResult }[S.screen] || viewBoard;
  $app.innerHTML = view();
}

// ---------- actions ----------
const actions = {
  start() {
    S.game = { dealer: S.firstDealer || 0, passes: 0, totals: [0, 0, 0, 0], handNo: 1, history: [] };
    go('board');
  },
  'go-board'() { go(S.game ? 'board' : 'setup'); },
  'new-game'() {
    if (!confirm('Reset semua skor dan mulai permainan baru?')) return;
    S.game = null; S.cur = null; go('setup');
  },
  'new-hand'() {
    S.cur = { winner: null, selfDrawn: true, discarder: null, extras: {}, hands: P4.map(() => ({ tiles: [], flowers: [], open: {} })), order: [], step: 0 };
    go('who');
  },
  winner(b) {
    const v = b.dataset.p === 'draw' ? 'draw' : +b.dataset.p;
    if (S.cur.winner !== v) S.cur.discarder = null;
    S.cur.winner = v; save(); render();
  },
  self(b) { S.cur.selfDrawn = b.dataset.v === '1'; if (S.cur.selfDrawn) S.cur.discarder = null; save(); render(); },
  discarder(b) { S.cur.discarder = +b.dataset.p; save(); render(); },
  'who-next'() {
    const c = S.cur;
    if (c.winner === 'draw') return go('result');
    c.order = rule().needsAllHands ? [0, 1, 2, 3].map((k) => (c.winner + k) % 4) : [c.winner];
    c.step = 0;
    go('hand');
  },
  photo() { toast('Baca foto otomatis menyusul — 3 model AI diuji dulu pakai foto ubinmu. Sementara ketuk ubin di bawah.'); },
  'clear-hand'() { const h = S.cur.hands[S.cur.order[S.cur.step]]; h.tiles = []; h.flowers = []; h.open = {}; save(); render(); },
  'toggle-open'(b) { const h = S.cur.hands[S.cur.order[S.cur.step]]; h.open[b.dataset.key] = !h.open[b.dataset.key]; save(); render(); },
  'hand-next'() { const c = S.cur; if (c.step < c.order.length - 1) { c.step++; go('hand'); } else go('result'); },
  'hand-back'() { const c = S.cur; if (c.step > 0) { c.step--; go('hand'); } else go('who'); },
  'result-back'() { const c = S.cur; if (c.winner === 'draw') return go('who'); c.step = c.order.length - 1; go('hand'); },
  commit() {
    const g = S.game, { st, winner } = lastSettle;
    g.history.push({ no: g.handNo, winner, selfDrawn: S.cur.selfDrawn, net: st.net, before: { dealer: g.dealer, passes: g.passes } });
    g.totals = g.totals.map((v, i) => v + st.net[i]);
    let msg = 'Tersimpan.';
    if (winner != null && winner !== g.dealer) {
      g.dealer = (g.dealer + 1) % 4; g.passes++;
      msg = `Tersimpan. Dealer pindah ke ${nameOf(g.dealer)}.`;
      if (g.passes % 4 === 0 && g.passes <= 12) msg += ` Angin ronde jadi ${WIND_NAME[prevailing()]}.`;
      if (g.passes === 16) msg = 'Tersimpan. Satu permainan penuh (4 angin) selesai!';
    } else if (winner != null) msg = 'Tersimpan. Dealer menang, tetap jadi dealer.';
    g.handNo++;
    S.cur = null;
    go('board');
    toast(msg);
  },
  undo() {
    const g = S.game, h = g.history[g.history.length - 1];
    if (!h || !confirm(`Batalkan tangan #${h.no}?`)) return;
    g.history.pop();
    g.totals = g.totals.map((v, i) => v - h.net[i]);
    g.dealer = h.before.dealer; g.passes = h.before.passes; g.handNo = h.no;
    save(); render();
  },
};

function onTile(zone, el) {
  const h = S.cur.hands[S.cur.order[S.cur.step]];
  const t = el.dataset.t != null ? +el.dataset.t : null;
  const f = el.dataset.f != null ? +el.dataset.f : null;
  if (zone === 'pal') {
    if (t != null) {
      if (h.tiles.filter((x) => x === t).length >= 4) return toast('Ubin itu sudah 4.');
      h.tiles.push(t); h.tiles.sort((a, b) => a - b);
    } else if (f != null && !h.flowers.includes(f)) {
      h.flowers.push(f); h.flowers.sort((a, b) => a - b);
    }
  } else if (zone === 'hand') {
    if (t != null) h.tiles.splice(h.tiles.indexOf(t), 1);
    else if (f != null) h.flowers.splice(h.flowers.indexOf(f), 1);
  }
  save(); render();
}

$app.addEventListener('click', (e) => {
  const tileEl = e.target.closest('.tile');
  const zone = e.target.closest('[data-zone]')?.dataset.zone;
  if (tileEl && zone) return onTile(zone, tileEl);
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  actions[b.dataset.act]?.(b);
});

$app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.name != null) { S.names[+t.dataset.name] = t.value; save(); }
});

$app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.set === 'rule') { S.rule = t.value; save(); render(); }
  else if (t.dataset.set === 'firstDealer') { S.firstDealer = +t.value; save(); }
  else if (t.dataset.opt) {
    settings()[t.dataset.opt] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
    save();
  } else if (t.dataset.extra) { S.cur.extras[t.dataset.extra] = t.checked; save(); }
});

document.getElementById('btn-settings').addEventListener('click', () => go('setup'));
document.getElementById('brand-tile').innerHTML = tileHTML(33, 'mini');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

render();
