// Logika permainan bersama. Dipakai di HP (mode satu HP) DAN di server ruang (mode HP masing-masing),
// supaya hitungan di semua HP selalu sama. Semua perubahan lewat reduce(state, op).
import { RULES } from './rules/index.js';
import { WIND_NAME } from './tiles.js';

export const P4 = [0, 1, 2, 3];

export function initialState(opts = {}) {
  const settings = {};
  for (const id in RULES) settings[id] = { ...RULES[id].defaults, ...(opts.settings?.[id] || {}) };
  return {
    v: 1,
    names: opts.names || ['', '', '', ''],
    seats: [null, null, null, null], // clientId per kursi (mode HP masing-masing)
    rule: RULES[opts.rule] ? opts.rule : 'classical',
    settings,
    firstDealer: 0,
    game: null,
    cur: null,
  };
}

const emptyHand = () => ({ tiles: [], flowers: [], open: {}, submitted: false });

export const ruleOf = (s) => RULES[s.rule];
export const settingsOf = (s) => s.settings[s.rule];
export const nameOf = (s, p) => (s.names[p] || '').trim() || `Pemain ${p + 1}`;
export const seatWind = (s, p) => ((p - s.game.dealer + 4) % 4) + 1;
export const prevailing = (s) => Math.min(4, 1 + Math.floor(s.game.passes / 4));

/** Kursi yang tangannya wajib diisi, urut mulai pemenang. */
export function neededSeats(s) {
  const c = s.cur;
  if (!c || c.winner === 'draw') return [];
  if (!ruleOf(s).needsAllHands) return [c.winner];
  return P4.map((k) => (c.winner + k) % 4);
}
export const allSubmitted = (s) => !!s.cur && neededSeats(s).every((p) => s.cur.hands[p].submitted);

export function scoreSeat(s, p) {
  const c = s.cur, h = c.hands[p];
  return ruleOf(s).scoreHand({
    tiles: h.tiles, flowers: h.flowers, open: h.open,
    isWinner: p === c.winner, seat: seatWind(s, p), prevailing: prevailing(s),
    win: { selfDrawn: c.selfDrawn, extras: c.extras || {} }, settings: settingsOf(s),
  });
}

/** Hasil tangan yang sedang berjalan: skor tiap pemain + siapa bayar siapa. */
export function computeResult(s) {
  const c = s.cur, R = ruleOf(s);
  const winner = c.winner === 'draw' ? null : c.winner;
  const need = neededSeats(s);
  const results = P4.map((p) => (need.includes(p) ? scoreSeat(s, p) : null));
  const st = R.settle({ results, winner, discarder: c.discarder, selfDrawn: c.selfDrawn, dealer: s.game.dealer, settings: settingsOf(s) });
  return { winner, results, ...st };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const isSeat = (p) => Number.isInteger(p) && p >= 0 && p < 4;
const sameName = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
/** Nama sudah dipakai kursi lain? (nama kosong boleh dobel) */
export const nameTaken = (s, name, seat) => !!String(name || '').trim() && P4.some((p) => p !== seat && sameName(s.names[p], name));

/** Lengkapi state lama (misal ruang dibuat sebelum ada aturan baru). */
export function normalize(s) {
  if (!s || !s.settings) return s;
  for (const id in RULES) s.settings[id] = { ...RULES[id].defaults, ...(s.settings[id] || {}) };
  if (!RULES[s.rule]) s.rule = 'classical';
  return s;
}

export function reduce(state, op) {
  const s = normalize(clone(state));
  switch (op.type) {
    case 'config': {
      if (Array.isArray(op.names)) {
        const nn = op.names.slice(0, 4).map((n) => String(n || '').slice(0, 20));
        if (!nn.some((n, i) => nn.some((m, j) => j > i && sameName(n, m)))) s.names = nn;
      }
      if (op.rule && RULES[op.rule]) s.rule = op.rule;
      if (op.settings && RULES[op.ruleId || s.rule]) Object.assign(s.settings[op.ruleId || s.rule], op.settings);
      if (isSeat(op.firstDealer) && !s.game) s.firstDealer = op.firstDealer;
      return s;
    }
    case 'name': {
      if (!isSeat(op.seat)) return s;
      const nm = String(op.name || '').slice(0, 20);
      if (nameTaken(s, nm, op.seat)) return s; // nama sudah dipakai kursi lain
      s.names[op.seat] = nm;
      return s;
    }
    case 'claim': {
      if (!isSeat(op.seat) || !op.clientId) return s;
      if (s.seats[op.seat] && s.seats[op.seat] !== op.clientId) return s; // sudah diduduki orang lain
      const nm = String(op.name || '').trim().slice(0, 20);
      const old = s.seats.indexOf(op.clientId);
      // Nama yang sama sudah dipakai pemain lain yang pegang HP -> tolak.
      if (nm && P4.some((p) => p !== op.seat && p !== old && s.seats[p] && sameName(s.names[p], nm))) return s;
      if (old >= 0 && old !== op.seat) {
        s.seats[old] = null;
        if (!s.game) s.names[old] = ''; // pindah kursi: kursi lama dikosongkan, jangan tinggal nama kita
      }
      s.seats[op.seat] = op.clientId;
      if (nm) {
        // Nama kita yang tadinya diketik orang di kursi kosong lain -> hapus supaya tidak dobel.
        for (const p of P4) if (p !== op.seat && !s.seats[p] && sameName(s.names[p], nm)) s.names[p] = '';
        s.names[op.seat] = nm;
      }
      return s;
    }
    case 'release': {
      s.seats = s.seats.map((c) => (c === op.clientId ? null : c));
      return s;
    }
    case 'start': {
      if (s.game) return s;
      s.game = { dealer: s.firstDealer || 0, passes: 0, totals: [0, 0, 0, 0], handNo: 1, history: [] };
      return s;
    }
    case 'declare': {
      if (!s.game) return s;
      const winner = op.winner === 'draw' ? 'draw' : isSeat(op.winner) ? op.winner : null;
      if (winner == null) return s;
      const discarder = winner !== 'draw' && !op.selfDrawn && isSeat(op.discarder) && op.discarder !== winner ? op.discarder : null;
      if (winner !== 'draw' && !op.selfDrawn && discarder == null) return s; // dari buangan wajib ada pembuang (bukan pemenang)
      s.cur = {
        winner,
        selfDrawn: winner === 'draw' ? false : !!op.selfDrawn,
        discarder,
        extras: op.extras || {},
        // Ubah info pemenang tanpa menghapus ubin yang sudah diisi.
        hands: s.cur ? s.cur.hands.map((h) => ({ ...h, submitted: false })) : P4.map(emptyHand),
      };
      return s;
    }
    case 'hand': {
      if (!s.cur || !isSeat(op.seat)) return s;
      const h = s.cur.hands[op.seat];
      if (Array.isArray(op.tiles)) h.tiles = op.tiles.filter((t) => Number.isInteger(t) && t >= 0 && t < 34).sort((a, b) => a - b);
      if (Array.isArray(op.flowers)) h.flowers = op.flowers.filter((f) => Number.isInteger(f) && f >= 1 && f <= 8).sort((a, b) => a - b);
      if (op.open && typeof op.open === 'object') h.open = op.open;
      if (typeof op.submitted === 'boolean') h.submitted = op.submitted;
      return s;
    }
    case 'cancel-hand': {
      s.cur = null;
      return s;
    }
    case 'commit': {
      if (!s.cur || !allSubmitted(s)) return s;
      const g = s.game, r = computeResult(s);
      if (r.winner != null && !r.results[r.winner]?.ok) return s;
      g.history.push({ no: g.handNo, winner: r.winner, selfDrawn: s.cur.selfDrawn, net: r.net, before: { dealer: g.dealer, passes: g.passes } });
      g.totals = g.totals.map((v, i) => v + r.net[i]);
      if (r.winner != null && r.winner !== g.dealer) { g.dealer = (g.dealer + 1) % 4; g.passes++; }
      g.handNo++;
      s.cur = null;
      return s;
    }
    case 'undo': {
      const g = s.game, h = g?.history[g.history.length - 1];
      if (!h) return s;
      g.history.pop();
      g.totals = g.totals.map((v, i) => v - h.net[i]);
      g.dealer = h.before.dealer; g.passes = h.before.passes; g.handNo = h.no;
      s.cur = null;
      return s;
    }
    case 'new-game': {
      s.game = null; s.cur = null;
      return s;
    }
    default:
      return s;
  }
}

/** Pesan singkat setelah tangan disimpan (dibandingkan sebelum/sesudah). */
export function commitMessage(before, after) {
  const g0 = before.game, g1 = after.game;
  if (!g0 || !g1 || g1.handNo === g0.handNo) return null;
  if (g1.dealer !== g0.dealer) {
    let msg = `Tersimpan. Dealer pindah ke ${nameOf(after, g1.dealer)}.`;
    if (g1.passes % 4 === 0 && g1.passes <= 12) msg += ` Angin ronde jadi ${WIND_NAME[prevailing(after)]}.`;
    if (g1.passes === 16) msg = 'Tersimpan. Satu permainan penuh (4 angin) selesai!';
    return msg;
  }
  return 'Tersimpan.';
}
