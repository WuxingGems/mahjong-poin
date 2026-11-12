import { RULES, COMING } from './rules/index.js';
import { tileHTML, flowerHTML, windTileHTML, WIND_NAME, countsOf } from './tiles.js';
import * as G from './game.js';
import { createRoom, roomExists, connectRoom, readTiles, visionInfo } from './net.js';

const SOLO_KEY = 'mahjong-poin-v1';
// ?hp=2 hanya untuk uji coba: satu browser berpura-pura jadi HP lain.
const HP = (new URLSearchParams(location.search).get('hp') || '').replace(/\W/g, '');
const PREF_KEY = 'mahjong-poin-prefs' + (HP ? `-${HP}` : '');
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const P4 = G.P4;

// ---------- penyimpanan ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* tidak tersedia */ } },
};
function loadSolo() {
  const s = store.get(SOLO_KEY);
  if (!s || !Array.isArray(s.names)) return G.initialState();
  if (!s.v) { // data versi lama
    const n = G.initialState({ rule: s.rule, settings: s.settings });
    n.names = s.names.map((x) => x || '');
    n.firstDealer = s.firstDealer || 0;
    n.game = s.game || null;
    return n;
  }
  return G.normalize(s);
}
const prefs = store.get(PREF_KEY) || {};
if (!prefs.clientId) prefs.clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) ;
const savePrefs = () => store.set(PREF_KEY, prefs);
savePrefs();

let solo = loadSolo();
let S = null; // state permainan yang sedang tampil
let conn = null;
const U = { mode: null, screen: null, draft: null, editSeat: null, handSeat: null, status: '', code: null, tips: new Set(), photos: {}, reading: false, vision: null };
const MODELS = [
  ['free', 'Gratis (Cloudflare AI)'],
  ['haiku', 'Claude Haiku 5.5 — cepat & murah'],
  ['sonnet', 'Claude Sonnet 5.5 — seimbang'],
  ['opus', 'Claude Opus 5.5 — paling teliti'],
];
if (!prefs.visionModel) prefs.visionModel = 'free';

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n > 0 ? '+' : '') + n.toLocaleString('id-ID');
const cls = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : '');
const seal = (ch, txt) => `<span class="seal">${ch}</span>${txt ? `<span>${txt}</span>` : ''}`;
const nameOf = (p) => G.nameOf(S, p);
const windBadge = (p) => windTileHTML(G.seatWind(S, p));
const mySeat = () => (U.mode === 'online' && S ? S.seats.indexOf(prefs.clientId) : -1);
const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>';

function toast(msg) {
  if (!msg) return;
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 3500);
}
function groupTiles(g) {
  if (g.type === 'chow') return [g.tile, g.tile + 1, g.tile + 2];
  return new Array({ pung: 3, kong: 4, pair: 2 }[g.type]).fill(g.tile);
}
function setUrl(code) {
  const q = [code ? `room=${code}` : '', HP ? `hp=${HP}` : ''].filter(Boolean).join('&');
  const url = location.pathname + (q ? `?${q}` : '');
  history.replaceState(null, '', url);
}

// ---------- perubahan state ----------
function dispatch(op) {
  if (U.mode === 'solo') {
    const before = S;
    S = solo = G.reduce(S, op);
    store.set(SOLO_KEY, solo);
    afterChange(before, S);
    render();
  } else if (conn) {
    conn.send(op);
  }
}
function afterChange(before, after) {
  if (!before || !after) return;
  if (before.game && after.game) {
    if (after.game.handNo > before.game.handNo) { toast(G.commitMessage(before, after)); U.editSeat = null; }
    else if (after.game.handNo < before.game.handNo) toast('Tangan terakhir dibatalkan.');
  }
  if (!before.game && after.game) toast('Permainan dimulai!');
  if (!before.cur && after.cur) U.screen = null; // ada yang mencatat pemenang -> semua HP pindah ke layar isi ubin
  if (before.cur && !after.cur) U.editSeat = null;
}

// ---------- mode ----------
function useSolo() {
  U.mode = 'solo'; U.screen = null; S = solo;
  prefs.mode = 'solo'; savePrefs();
  go();
}
function enterRoom(code) {
  if (conn) conn.close();
  U.mode = 'online'; U.code = code; U.screen = null; U.status = 'connecting'; S = null;
  prefs.mode = 'online'; prefs.room = code; savePrefs();
  setUrl(code);
  conn = connectRoom(code, prefs.clientId, {
    onState(st) { const before = S; S = G.normalize(st); afterChange(before, S); render(); },
    onStatus(x) {
      U.status = x;
      if (x === 'gone') { toast('Ruang tidak ditemukan atau sudah kedaluwarsa.'); leaveRoom(); return; }
      render();
    },
  });
  go();
}
function leaveRoom() {
  if (conn && S && mySeat() >= 0) conn.send({ type: 'release', clientId: prefs.clientId });
  const c = conn; conn = null;
  if (c) setTimeout(() => c.close(), 300);
  prefs.room = null; toHome();
}
function toHome() {
  if (conn) { conn.close(); conn = null; }
  U.mode = null; U.screen = null; S = null;
  prefs.mode = null; savePrefs(); setUrl(null);
  go();
}
function go() { render(); window.scrollTo(0, 0); }

function currentScreen() {
  if (!U.mode) return 'home';
  if (!S) return 'connecting';
  if (U.screen === 'setup') return 'setup';
  if (!S.game) return U.mode === 'solo' ? 'setup' : 'lobby';
  if (U.screen === 'who') return 'who';
  if (!S.cur) return 'board';
  if (S.cur.winner === 'draw' || G.allSubmitted(S)) return 'result';
  return 'hand';
}

// ---------- potongan tampilan ----------
/** Tombol "?" + kotak penjelasan yang muncul kalau diketuk. */
function tipBtn(id, text) {
  return text ? `<button type="button" class="info ${U.tips.has(id) ? 'on' : ''}" data-act="tip" data-tip="${id}" aria-label="Penjelasan">?</button>` : '';
}
function tipBox(id, text) {
  return text ? `<div class="tipbox" data-tipbox="${id}" ${U.tips.has(id) ? '' : 'hidden'}>${text}</div>` : '';
}
function fieldHTML(sp, val, attr = 'data-opt') {
  const id = `${attr}-${sp.key}`;
  let ctl;
  if (sp.type === 'bool') ctl = `<label class="check"><input type="checkbox" ${attr}="${sp.key}" ${val ? 'checked' : ''}> ${sp.label}</label>`;
  else if (sp.type === 'select') ctl = `<label class="field"><span>${sp.label}</span><select ${attr}="${sp.key}">${sp.options.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  else ctl = `<label class="field"><span>${sp.label}</span><input type="number" inputmode="numeric" min="0" data-focus="${id}" ${attr}="${sp.key}" value="${val ?? 0}"></label>`;
  return `<div class="opt">${ctl}${tipBtn(id, sp.info)}</div>${tipBox(id, sp.info)}`;
}
function ruleCardHTML(withDealer) {
  const R = G.ruleOf(S), st = G.settingsOf(S);
  return `<div class="card">
    <h3>Aturan main</h3>
    <select data-set="rule">${Object.values(RULES).map((r) => `<option value="${r.id}" ${r.id === S.rule ? 'selected' : ''}>${r.name}</option>`).join('')}${COMING.map((c) => `<option disabled>${c.name}</option>`).join('')}</select>
    <p class="ruledesc">${R.desc}</p>
    ${R.settingsSpec.map((sp) => fieldHTML(sp, st[sp.key])).join('')}
    ${withDealer ? `<label class="field"><span>Dealer (Timur) pertama</span><select data-set="firstDealer">${P4.map((i) => `<option value="${i}" ${S.firstDealer === i ? 'selected' : ''}>${esc(nameOf(i))}</option>`).join('')}</select></label>` : ''}
  </div>`;
}
function statusHTML(withShare = true) {
  if (U.mode !== 'online') return '';
  const t = { online: 'Tersambung', offline: 'Menyambung ulang…', connecting: 'Menyambung…' }[U.status] || '';
  return `<div class="roombar"><span class="dot ${U.status === 'online' ? 'on' : ''}"></span>Ruang <b>${U.code}</b> · ${t}${withShare ? `<button class="linkbtn" data-act="share">${ICON_SHARE}Bagikan</button>` : ''}</div>`;
}
function histHTML(h) {
  const who = h.winner == null ? 'Seri' : `${esc(nameOf(h.winner))} menang${h.selfDrawn ? ' (tarik sendiri)' : ''}`;
  return `<div class="hist-item"><b>#${h.no}</b> ${who}<br>${h.net.map((v, i) => `${esc(nameOf(i))} <span class="${cls(v)}">${fmt(v)}</span>`).join(' · ')}</div>`;
}
function itemValue(x) {
  if (x.val) return x.val;
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
  const rows = res.items.filter((x) => x.val || x.pts || x.dbl || x.faan || x.note);
  return `${groups}
    <h3>Hitungan</h3>
    <table class="score">${rows.map((x) => `<tr><td>${x.label}</td><td class="n">${itemValue(x)}</td></tr>`).join('') || '<tr><td class="muted">Tidak ada poin</td><td></td></tr>'}
      <tr class="total"><td>Total</td><td class="n">${res.summary}</td></tr></table>
    ${res.warning ? `<p class="warn">${res.warning}</p>` : ''}`;
}
const photoKey = () => `${S?.game?.handNo}-${U.handSeat}`;
const modelName = () => (MODELS.find((m) => m[0] === prefs.visionModel) || MODELS[0])[1];

// Kode dari AI -> indeks ubin. m=karakter, p=bulat, s=bambu.
function codesToTiles(codes) {
  const tiles = [], flowers = [];
  const HON = { E: 27, S: 28, W: 29, N: 30, WH: 31, GR: 32, RD: 33 };
  for (const raw of codes || []) {
    const c = String(raw).trim().toUpperCase();
    let t = null;
    const m = c.match(/^([1-9])([MPS])$/);
    if (m) t = { M: 0, P: 9, S: 18 }[m[2]] + (+m[1] - 1);
    else if (HON[c] != null) t = HON[c];
    else if (/^F[1-8]$/.test(c)) { const f = +c[1]; if (!flowers.includes(f)) flowers.push(f); continue; }
    if (t != null && tiles.filter((x) => x === t).length < 4) tiles.push(t);
  }
  return { tiles, flowers };
}

async function shrinkPhoto(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Foto tidak bisa dibuka.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

async function onPhoto(file) {
  if (!file || !S?.cur || U.handSeat == null) return;
  const seat = U.handSeat, key = photoKey();
  U.reading = true; render();
  try {
    const dataUrl = await shrinkPhoto(file);
    U.photos[key] = dataUrl; render();
    const r = await readTiles(dataUrl, prefs.visionModel);
    let { tiles, flowers } = codesToTiles(r.tiles);
    if (G.settingsOf(S).flowersOn === false) flowers = [];
    if (!tiles.length && !flowers.length) toast('Tidak ada ubin yang terbaca. Coba foto lebih dekat & terang, atau ketuk ubin manual.');
    else {
      dispatch({ type: 'hand', seat, tiles, flowers, open: {} });
      toast(`Terbaca ${tiles.length} ubin${flowers.length ? ` + ${flowers.length} bunga` : ''}. Cocokkan dengan foto ya.`);
    }
  } catch (err) {
    toast(err.message || 'Gagal membaca foto. Cek internet lalu coba lagi.');
  }
  U.reading = false; render();
}

function tablePos(p) {
  const me = mySeat(), rot = me >= 0 ? me : 0;
  return ['s-bot', 's-right', 's-top', 's-left'][(p - rot + 4) % 4];
}

// ---------- layar ----------
function viewHome() {
  const resume = solo.game ? `Lanjutkan permainan (tangan ke-${solo.game.handNo})` : 'Main pakai satu HP';
  return `
  <section class="hero">
    <div class="hero-tiles">${[33, 32, 31, 27].map((i) => tileHTML(i)).join('')}</div>
    <h2>Hitung poin mahjong,<br>tanpa kertas.</h2>
    <p class="lead">Isi ubin tiap pemain, poin dan bayar-membayar dihitung otomatis.</p>
  </section>
  ${prefs.room ? `<button class="btn primary big" data-act="rejoin">Kembali ke ruang ${esc(prefs.room)}</button>` : ''}
  <div class="card">
    <h3>Main bareng · HP masing-masing</h3>
    <p class="muted">Satu orang membuat ruang, yang lain gabung pakai kode. Tiap pemain mengisi ubinnya sendiri.</p>
    <button class="btn ${prefs.room ? '' : 'primary'} big" data-act="create-room">Buat ruang baru</button>
    <div class="join">
      <input type="text" id="join-code" data-focus="join" maxlength="4" placeholder="KODE" autocapitalize="characters" autocomplete="off" spellcheck="false">
      <button class="btn" data-act="join-room">Gabung</button>
    </div>
  </div>
  <div class="card">
    <h3>Satu HP saja</h3>
    <p class="muted">Satu orang mengisi ubin semua pemain bergantian.</p>
    <button class="btn big" data-act="solo">${resume}</button>
  </div>`;
}

function viewConnecting() {
  return `<div class="card center"><p>Menyambung ke ruang <b>${esc(U.code)}</b>…</p><button class="btn ghost" data-act="home">Batal</button></div>`;
}

function viewSetup() {
  const inGame = !!S.game, online = U.mode === 'online';
  return `
  <h2>${inGame || online ? 'Pengaturan' : 'Permainan baru'}</h2>
  ${!inGame && !online ? '<p class="lead">Isi nama pemain dan pilih aturan main di rumahmu.</p>' : ''}
  ${online ? statusHTML() : ''}
  <div class="card">
    <h3>Nama pemain (urut searah tempat duduk)</h3>
    ${P4.map((i) => `<label class="field"><span>Kursi ${i + 1}${online && S.seats[i] ? ' · pakai HP' : ''}</span><input type="text" data-focus="name${i}" data-name="${i}" value="${esc(S.names[i] || '')}" placeholder="Pemain ${i + 1}" maxlength="20"></label>`).join('')}
  </div>
  ${ruleCardHTML(!inGame)}
  <div class="card">
    <h3>Pembaca foto (pengaturan HP ini)</h3>
    <select data-set="vision">${MODELS.map(([v, l]) => {
      const off = v !== 'free' && U.vision && !U.vision.claude;
      return `<option value="${v}" ${v === prefs.visionModel ? 'selected' : ''} ${off ? 'disabled' : ''}>${l}${off ? ' — perlu kunci API' : ''}</option>`;
    }).join('')}</select>
    <p class="ruledesc">Yang gratis bisa langsung dicoba, tapi kurang teliti. Model Claude jauh lebih akurat, dan baru bisa dipilih setelah kunci API Anthropic dipasang di server. Apa pun hasilnya, ubin tetap bisa dibetulkan dengan diketuk.</p>
  </div>
  ${!inGame && !online ? '<button class="btn primary big" data-act="start">Mulai permainan</button>' : '<div class="actions"><button class="btn primary" data-act="close-setup">Kembali ke meja</button></div>'}
  ${inGame ? `<div class="card"><h3>Permainan</h3><button class="btn danger big" data-act="new-game">Mulai permainan baru (skor direset${online ? ' untuk semua' : ''})</button></div>` : ''}
  <div class="actions">
    <button class="btn ghost small" data-act="home">Menu awal</button>
    ${online ? '<button class="btn danger small" data-act="leave">Keluar dari ruang</button>' : ''}
  </div>`;
}

function viewLobby() {
  const me = mySeat();
  return `
  <div class="roomhead">
    <div><h3>Kode ruang</h3><div class="code">${U.code.split('').map((ch) => `<span>${ch}</span>`).join('')}</div></div>
    <button class="btn" data-act="share">${ICON_SHARE}Bagikan</button>
  </div>
  ${statusHTML(false)}
  <div class="card">
    <label class="field"><span>Nama kamu</span><input type="text" data-focus="myname" data-myname value="${esc(prefs.myName || '')}" placeholder="Misal: Calvin" maxlength="20"></label>
  </div>
  <h3>Pilih tempat duduk</h3>
  <div class="table">
    ${P4.map((p) => {
      const owner = S.seats[p], mine = owner === prefs.clientId;
      return `<div class="seat ${tablePos(p)} ${mine ? 'me' : ''}">
        ${owner
          ? `<div class="nm">${esc(nameOf(p))}</div><div class="tag">${mine ? '<span class="you">Kamu</span>' : '<span class="dot on"></span><span class="muted">pakai HP</span>'}</div>`
          : `<input type="text" class="seat-name" data-focus="seat${p}" data-seatname="${p}" value="${esc(S.names[p] || '')}" placeholder="Kursi ${p + 1}" maxlength="20">
             <button class="btn small" data-act="claim" data-p="${p}">${me >= 0 ? 'Pindah ke sini' : 'Duduk di sini'}</button>`}
      </div>`;
    }).join('')}
    <div class="mid">${tileHTML(27)}<div class="sub">Giliran berlawanan arah jarum jam</div></div>
  </div>
  ${ruleCardHTML(true)}
  <button class="btn primary big" data-act="start">Mulai permainan</button>
  <p class="muted center">Kursi tanpa HP cukup diisi namanya — ubinnya bisa diisi dari HP lain.</p>
  <div class="actions"><button class="btn ghost small" data-act="home">Menu awal</button><button class="btn danger small" data-act="leave">Keluar dari ruang</button></div>`;
}

function viewBoard() {
  const g = S.game, prev = G.prevailing(S), me = mySeat();
  return `
  ${statusHTML()}
  <div class="table">
    ${P4.map((p) => {
      const t = g.totals[p];
      return `<div class="seat ${tablePos(p)} ${p === g.dealer ? 'dealer' : ''} ${p === me ? 'me' : ''}">
        ${windBadge(p)}
        <div class="nm">${esc(nameOf(p))}</div>
        <div class="pts ${cls(t)}">${fmt(t)}</div>
        <div class="tag">${p === g.dealer ? seal('莊', 'Dealer') : p === me ? '<span class="you">Kamu</span>' : ''}</div></div>`;
    }).join('')}
    <div class="mid">
      ${tileHTML(26 + prev)}
      <div class="lbl">Ronde ${WIND_NAME[prev]}</div>
      <div class="sub">Tangan ke-${g.handNo}</div>
    </div>
  </div>
  ${U.mode === 'online' && me < 0 ? `<div class="card"><h3>Kamu belum duduk</h3><p class="muted">Pilih kursimu supaya bisa mengisi ubin sendiri.</p>
    <div class="row">${P4.filter((p) => !S.seats[p]).map((p) => `<button class="btn small" data-act="claim" data-p="${p}">${esc(nameOf(p))}</button>`).join('') || '<span class="muted">Semua kursi sudah dipakai HP lain.</span>'}</div></div>` : ''}
  <button class="btn primary big" data-act="new-hand">Tangan selesai — catat hasil</button>
  <p class="muted center" style="margin-top:10px">${esc(G.ruleOf(S).name)}</p>
  ${g.history.length ? `<div class="card"><h3>Riwayat</h3>${g.history.slice().reverse().map(histHTML).join('')}
    <div class="actions"><button class="btn small danger" data-act="undo">Batalkan tangan terakhir</button></div></div>` : ''}`;
}

function viewWho() {
  const c = U.draft;
  const isNum = typeof c.winner === 'number';
  const canNext = c.winner === 'draw' || (isNum && (c.selfDrawn || c.discarder != null));
  const others = isNum ? P4.filter((p) => p !== c.winner) : [];
  return `
  <h2>Tangan ke-${S.game.handNo}: siapa yang menang?</h2>
  <div class="grid2">${P4.map((p) => `<button class="btn chip ${c.winner === p ? 'on' : ''}" data-act="winner" data-p="${p}">${windBadge(p)}${esc(nameOf(p))}</button>`).join('')}</div>
  <button class="btn ghost ${c.winner === 'draw' ? 'on' : ''}" style="width:100%;margin-top:10px" data-act="winner" data-p="draw">Seri — tidak ada yang menang</button>
  ${isNum ? `
  <div class="card">
    <h3>Cara menang</h3>
    <div class="row">
      <button class="btn ${c.selfDrawn ? 'on' : ''}" data-act="self" data-v="1">Tarik sendiri</button>
      <button class="btn ${!c.selfDrawn ? 'on' : ''}" data-act="self" data-v="0">Dari buangan</button>
    </div>
    ${!c.selfDrawn ? `<h3>Siapa yang membuang?</h3><div class="row">${others.map((p) => `<button class="btn small ${c.discarder === p ? 'on' : ''}" data-act="discarder" data-p="${p}">${esc(nameOf(p))}</button>`).join('')}</div>` : ''}
    <h3>Tambahan (centang kalau ada) · ketuk ? untuk penjelasan</h3>
    ${G.ruleOf(S).winExtras.map((x) => fieldHTML({ ...x, type: x.type || 'bool' }, c.extras[x.key], 'data-extra')).join('')}
  </div>` : ''}
  <div class="actions"><button class="btn ghost" data-act="who-cancel">Batal</button><button class="btn primary" data-act="who-next" ${canNext ? '' : 'disabled'}>Lanjut →</button></div>`;
}

function handSeatToShow() {
  const need = G.neededSeats(S), hands = S.cur.hands;
  if (U.mode === 'solo') return need.find((p) => !hands[p].submitted) ?? null;
  if (U.editSeat != null && need.includes(U.editSeat) && !hands[U.editSeat].submitted) return U.editSeat;
  const me = mySeat();
  return need.includes(me) && !hands[me].submitted ? me : null;
}

function submitStrip(need, current) {
  return `<div class="strip">${need.map((p) => {
    const h = S.cur.hands[p];
    return `<span class="pill ${h.submitted ? 'done' : ''} ${p === current ? 'cur' : ''}">${h.submitted ? '✓ ' : ''}${esc(nameOf(p))}</span>`;
  }).join('')}</div>`;
}

function winInfo() {
  const c = S.cur;
  if (c.winner === 'draw') return 'Seri';
  return `${esc(nameOf(c.winner))} menang — ${c.selfDrawn ? 'tarik sendiri' : `dari buangan ${esc(nameOf(c.discarder))}`}`;
}

function viewHand() {
  const seat = handSeatToShow();
  if (seat == null) return viewWaiting();
  U.handSeat = seat;
  const need = G.neededSeats(S), h = S.cur.hands[seat];
  const isW = seat === S.cur.winner, me = mySeat(), online = U.mode === 'online';
  const res = G.scoreSeat(S, seat);
  const counts = countsOf(h.tiles);
  const showFlowers = G.settingsOf(S).flowersOn !== false;
  const lastSolo = !online && need.filter((p) => !S.cur.hands[p].submitted).length === 1;
  return `
  ${statusHTML()}
  ${need.length > 1 ? submitStrip(need, seat) : ''}
  <h2 class="who">${windBadge(seat)}<span>${esc(nameOf(seat))}${online && seat === me ? ' <small>(kamu)</small>' : ''}</span>${isW ? seal('胡', 'Menang') : ''}</h2>
  <p class="muted">${winInfo()}</p>
  <button class="btn big" data-act="photo" ${U.reading ? 'disabled' : ''}>${ICON_CAM}${U.reading ? 'Membaca foto… (±10–30 detik)' : 'Foto tangan'}</button>
  <p class="muted small center">Pembaca foto: ${esc(modelName())} · ganti di ⚙</p>
  ${U.photos[photoKey()] ? `<div class="card photo"><img src="${U.photos[photoKey()]}" alt="Foto tangan">
    <p class="muted small">Bandingkan dengan rak di bawah. Ubin salah? Ketuk untuk hapus, lalu ketuk yang benar di daftar.</p>
    <button class="linkbtn" data-act="clear-photo">Tutup foto</button></div>` : ''}
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
    ${online
      ? (seat !== me ? '<button class="btn ghost" data-act="stop-edit">Batal</button>' : '')
      : '<button class="btn ghost" data-act="hand-back">← Kembali</button>'}
    <button class="btn primary" data-act="hand-submit" ${!isW || res.ok ? '' : 'disabled'}>${online ? 'Kirim' : lastSolo ? 'Lihat hasil →' : 'Lanjut →'}</button>
  </div>
  ${online ? '<div class="actions"><button class="btn danger small" data-act="cancel-hand">Batalkan tangan ini</button></div>' : ''}`;
}

function viewWaiting() {
  const need = G.neededSeats(S), me = mySeat();
  return `
  ${statusHTML()}
  <h2>Menunggu yang lain…</h2>
  <p class="muted">${winInfo()}</p>
  <div class="card">
    <h3>Kiriman ubin</h3>
    ${need.map((p) => {
      const h = S.cur.hands[p], owner = S.seats[p];
      const right = h.submitted
        ? `<b class="ok">Terkirim</b>${p === me ? ' <button class="btn small ghost" data-act="unsubmit" data-p="' + p + '">Ubah</button>' : ''}`
        : `${owner && owner !== prefs.clientId ? '<span class="muted">sedang mengisi…</span> ' : ''}<button class="btn small" data-act="edit-seat" data-p="${p}">${owner ? 'Bantu isi' : 'Isi'}</button>`;
      return `<div class="statusrow">${windBadge(p)}<span class="nm">${esc(nameOf(p))}</span><span class="right">${right}</span></div>`;
    }).join('')}
  </div>
  <div class="actions"><button class="btn ghost small" data-act="edit-win">Ubah info pemenang</button><button class="btn danger small" data-act="cancel-hand">Batalkan tangan ini</button></div>`;
}

function viewResult() {
  const r = G.computeResult(S), online = U.mode === 'online';
  const warn = r.winner != null && r.results[r.winner]?.warning;
  return `
  ${statusHTML()}
  <h2>Hasil tangan ke-${S.game.handNo}</h2>
  <p class="muted">${winInfo()}</p>
  ${r.winner == null ? '<div class="card">Seri — tidak ada yang bayar.</div>' : `
  <div class="card"><h3>Skor tangan</h3><table class="score">
    ${P4.filter((p) => r.results[p]).map((p) => `<tr><td>${esc(nameOf(p))} ${p === r.winner ? seal('胡', '') : ''}${online ? ` <button class="linkbtn" data-act="unsubmit" data-p="${p}">ubah</button>` : ''}</td><td class="n">${r.results[p].summary}</td></tr>`).join('')}
  </table></div>
  <div class="card"><h3>Siapa bayar siapa</h3><table class="score">
    ${r.transfers.map((t) => `<tr><td>${esc(nameOf(t.from))} → ${esc(nameOf(t.to))}<span class="why">${t.why}</span></td><td class="n">${t.amt.toLocaleString('id-ID')}</td></tr>`).join('') || '<tr><td>Tidak ada</td></tr>'}
  </table></div>`}
  <div class="card"><h3>Perubahan poin</h3><table class="score">
    ${P4.map((p) => `<tr><td>${esc(nameOf(p))}</td><td class="n ${cls(r.net[p])}">${fmt(r.net[p])}</td><td class="n muted">jadi ${fmt(S.game.totals[p] + r.net[p])}</td></tr>`).join('')}
  </table></div>
  ${warn ? `<p class="warn">${warn}</p>` : ''}
  <div class="actions"><button class="btn ghost" data-act="result-back">← Kembali</button><button class="btn primary" data-act="commit">Simpan tangan</button></div>`;
}

function render() {
  const view = {
    home: viewHome, connecting: viewConnecting, setup: viewSetup, lobby: viewLobby,
    board: viewBoard, who: viewWho, hand: viewHand, result: viewResult,
  }[currentScreen()];
  // Jaga kolom yang sedang diketik supaya tidak hilang saat layar diperbarui.
  const a = document.activeElement;
  const focusKey = a && a.dataset ? a.dataset.focus : null;
  const keep = focusKey ? { value: a.value, start: a.selectionStart, end: a.selectionEnd } : null;
  $app.innerHTML = view();
  if (focusKey) {
    const el = $app.querySelector(`[data-focus="${focusKey}"]`);
    if (el) {
      el.value = keep.value;
      el.focus();
      try { el.setSelectionRange(keep.start, keep.end); } catch { /* bukan kolom teks */ }
    }
  }
}

// ---------- aksi ----------
function draftFromCur() {
  const c = S.cur;
  return c ? { winner: c.winner, selfDrawn: c.selfDrawn, discarder: c.discarder, extras: { ...(c.extras || {}) } }
    : { winner: null, selfDrawn: true, discarder: null, extras: {} };
}
const curHand = () => S.cur.hands[U.handSeat];

const actions = {
  solo: useSolo,
  home: toHome,
  leave() { if (confirm('Keluar dari ruang ini?')) leaveRoom(); },
  rejoin() { enterRoom(prefs.room); },
  async 'create-room'(b) {
    b.disabled = true;
    try { enterRoom(await createRoom({})); }
    catch { toast('Gagal membuat ruang. Cek internet lalu coba lagi.'); b.disabled = false; }
  },
  async 'join-room'() {
    const code = (document.getElementById('join-code').value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) return toast('Kode ruang 4 huruf/angka.');
    try {
      if (!(await roomExists(code))) return toast(`Ruang ${code} tidak ditemukan.`);
      enterRoom(code);
    } catch { toast('Gagal menyambung. Cek internet lalu coba lagi.'); }
  },
  async share() {
    const url = `${location.origin}${location.pathname}?room=${U.code}`;
    const text = `Gabung meja mahjong di ruang ${U.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Mahjong Poin', text, url });
      else { await navigator.clipboard.writeText(`${text}: ${url}`); toast('Link ruang disalin.'); }
    } catch { /* dibatalkan */ }
  },
  claim(b) {
    const seat = +b.dataset.p;
    let name = (prefs.myName || '').trim();
    if (S.game) name = ''; // sudah main: pakai nama kursi yang ada
    else if (!name) { toast('Isi nama kamu dulu.'); $app.querySelector('[data-myname]')?.focus(); return; }
    const me = mySeat();
    if (name && P4.some((p) => p !== seat && p !== me && S.seats[p] && S.names[p].trim().toLowerCase() === name.toLowerCase()))
      return toast(`Nama "${name}" sudah dipakai pemain lain. Ganti nama kamu dulu.`);
    dispatch({ type: 'claim', seat, clientId: prefs.clientId, name });
  },
  tip(b) {
    const id = b.dataset.tip, box = $app.querySelector(`[data-tipbox="${id}"]`);
    if (U.tips.has(id)) U.tips.delete(id); else U.tips.add(id);
    if (box) box.hidden = !U.tips.has(id);
    b.classList.toggle('on', U.tips.has(id));
  },
  'pick-photo'() {
    if (U.reading) return;
    document.getElementById('photo-input').click();
  },
  'clear-photo'() { delete U.photos[photoKey()]; render(); },
  start() { dispatch({ type: 'start' }); },
  'close-setup'() { U.screen = null; go(); },
  'new-game'() { if (confirm('Reset semua skor dan mulai permainan baru?')) { U.screen = null; dispatch({ type: 'new-game' }); } },
  'new-hand'() { U.draft = draftFromCur(); U.screen = 'who'; go(); },
  'edit-win'() { U.draft = draftFromCur(); U.screen = 'who'; go(); },
  winner(b) {
    const v = b.dataset.p === 'draw' ? 'draw' : +b.dataset.p;
    if (U.draft.winner !== v) U.draft.discarder = null;
    U.draft.winner = v; render();
  },
  self(b) { U.draft.selfDrawn = b.dataset.v === '1'; if (U.draft.selfDrawn) U.draft.discarder = null; render(); },
  discarder(b) { U.draft.discarder = +b.dataset.p; render(); },
  'who-cancel'() { U.screen = null; go(); },
  'who-next'() {
    const d = U.draft;
    U.screen = null; U.editSeat = null;
    dispatch({ type: 'declare', winner: d.winner, selfDrawn: d.selfDrawn, discarder: d.discarder, extras: d.extras });
    window.scrollTo(0, 0);
  },
  photo() { actions['pick-photo'](); },
  'clear-hand'() { dispatch({ type: 'hand', seat: U.handSeat, tiles: [], flowers: [], open: {} }); },
  'toggle-open'(b) {
    const open = { ...curHand().open, [b.dataset.key]: !curHand().open[b.dataset.key] };
    dispatch({ type: 'hand', seat: U.handSeat, open });
  },
  'hand-submit'() {
    const seat = U.handSeat, h = curHand(), res = G.scoreSeat(S, seat);
    if (seat !== S.cur.winner && G.ruleOf(S).needsAllHands) {
      if (!h.tiles.length && !confirm('Rak masih kosong. Kirim saja? Skor tangan ini dihitung 0.')) return;
      if (h.tiles.length && res.warning && !confirm(`${res.warning}\n\nTetap kirim?`)) return;
    }
    U.editSeat = null;
    dispatch({ type: 'hand', seat, submitted: true });
    window.scrollTo(0, 0);
  },
  'hand-back'() { // mode satu HP
    const need = G.neededSeats(S), k = need.indexOf(U.handSeat);
    if (k > 0) { dispatch({ type: 'hand', seat: need[k - 1], submitted: false }); window.scrollTo(0, 0); }
    else { U.draft = draftFromCur(); U.screen = 'who'; go(); }
  },
  'stop-edit'() { U.editSeat = null; go(); },
  'edit-seat'(b) { U.editSeat = +b.dataset.p; go(); },
  unsubmit(b) {
    const p = +b.dataset.p;
    U.editSeat = p;
    dispatch({ type: 'hand', seat: p, submitted: false });
    window.scrollTo(0, 0);
  },
  'cancel-hand'() { if (confirm('Batalkan tangan ini? Ubin yang sudah diisi akan hilang.')) dispatch({ type: 'cancel-hand' }); },
  'result-back'() {
    if (S.cur.winner === 'draw') { U.draft = draftFromCur(); U.screen = 'who'; return go(); }
    const need = G.neededSeats(S), last = need[need.length - 1];
    const target = U.mode === 'online' && need.includes(mySeat()) ? mySeat() : last;
    U.editSeat = target;
    dispatch({ type: 'hand', seat: target, submitted: false });
  },
  commit() { dispatch({ type: 'commit' }); window.scrollTo(0, 0); },
  undo() {
    const h = S.game.history[S.game.history.length - 1];
    if (h && confirm(`Batalkan tangan #${h.no}?`)) dispatch({ type: 'undo' });
  },
};

function onTile(zone, el) {
  const h = curHand();
  const t = el.dataset.t != null ? +el.dataset.t : null;
  const f = el.dataset.f != null ? +el.dataset.f : null;
  let tiles = h.tiles.slice(), flowers = h.flowers.slice();
  if (zone === 'pal') {
    if (t != null) {
      if (tiles.filter((x) => x === t).length >= 4) return toast('Ubin itu sudah 4.');
      tiles.push(t);
    } else if (f != null) {
      if (flowers.includes(f)) return;
      flowers.push(f);
    }
  } else if (zone === 'hand') {
    if (t != null) tiles.splice(tiles.indexOf(t), 1);
    else if (f != null) flowers.splice(flowers.indexOf(f), 1);
  }
  dispatch({ type: 'hand', seat: U.handSeat, tiles, flowers });
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
  if (t.id === 'join-code') t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.dataset.myname != null) { prefs.myName = t.value; savePrefs(); }
});

$app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.set === 'rule') dispatch({ type: 'config', rule: t.value });
  else if (t.dataset.set === 'firstDealer') dispatch({ type: 'config', firstDealer: +t.value });
  else if (t.dataset.set === 'vision') { prefs.visionModel = t.value; savePrefs(); render(); }
  else if (t.dataset.opt) {
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(0, Number(t.value) || 0) : t.value;
    dispatch({ type: 'config', settings: { [t.dataset.opt]: v } });
  } else if (t.dataset.extra) U.draft.extras[t.dataset.extra] = t.type === 'checkbox' ? t.checked : Math.max(0, Number(t.value) || 0);
  else if (t.dataset.name != null || t.dataset.seatname != null || t.dataset.myname != null) {
    const seat = t.dataset.myname != null ? mySeat() : +(t.dataset.name ?? t.dataset.seatname);
    if (seat < 0) return;
    if (G.nameTaken(S, t.value, seat)) { toast(`Nama "${t.value.trim()}" sudah dipakai kursi lain. Pakai nama lain.`); render(); return; }
    dispatch({ type: 'name', seat, name: t.value });
  }
});

$app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'join-code') actions['join-room']();
});

document.getElementById('btn-settings').addEventListener('click', () => {
  if (!U.mode || !S) return;
  U.screen = 'setup'; go();
});
document.getElementById('brand-tile').innerHTML = tileHTML(33, 'mini');

document.getElementById('photo-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; onPhoto(f); });
visionInfo().then((v) => {
  U.vision = v;
  if (!v.claude && prefs.visionModel !== 'free') { prefs.visionModel = 'free'; savePrefs(); }
  if (U.mode) render();
}).catch(() => {});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- mulai ----------
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom && /^[A-Za-z0-9]{4}$/.test(urlRoom)) enterRoom(urlRoom.toUpperCase());
else if (prefs.mode === 'online' && prefs.room) enterRoom(prefs.room);
else if (prefs.mode === 'solo') useSolo();
else render();
