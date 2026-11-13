// Aturan Riichi Jepang: hanya tangan pemenang dihitung, dengan han (yaku + dora) dan fu.
// Poin dasar = fu × 2^(2+han), dibatasi mangan dst. Tanpa bunga.
import { countsOf, suitOf, numOf, isHonor, isTerminal } from '../tiles.js';
import { decomposeWinning, isSevenPairs, isThirteenOrphans } from '../decompose.js';
import { groupLabel, netOf, windTile, isDragon, isWind, isTermOrHonor, waitVariants } from './common.js';

export const id = 'riichi';
export const name = 'Riichi Jepang';
export const desc = 'Aturan Jepang. Hanya tangan pemenang yang dihitung. Wajib punya minimal 1 yaku (pola). Nilai = han (dari yaku + dora) dan fu (dari set & cara menang). Tanpa bunga. Poin di sini selisih dari modal awal, jadi semua mulai dari 0.';
export const needsAllHands = false;
export const unit = 'poin';

export const defaults = { kuitan: true, flowersOn: false };

export const settingsSpec = [
  { key: 'kuitan', label: 'Tanyao boleh dengan tangan terbuka (kuitan)', type: 'bool', info: 'Tanyao = tangan tanpa ubin 1, 9, dan kehormatan. Kebanyakan meja membolehkan walau ada set yang terbuka.' },
];

export const winExtras = [
  { key: 'riichi', label: 'Riichi (+1 han)', info: 'Kamu sudah menyatakan riichi (tangan tertutup, tinggal 1 ubin, taruh taruhan 1000).' },
  { key: 'doubleRiichi', label: 'Double riichi (+2 han)', info: 'Riichi dinyatakan pada giliran buang pertama, sebelum ada yang ambil ubin dari buangan.' },
  { key: 'ippatsu', label: 'Ippatsu (+1 han)', info: 'Menang dalam 1 putaran setelah riichi, tanpa ada yang ambil buangan di tengahnya.' },
  { key: 'lastTile', label: 'Haitei / Houtei (+1 han)', info: 'Menang pakai ubin terakhir tembok (haitei) atau buangan terakhir (houtei).' },
  { key: 'replacement', label: 'Rinshan kaihou (+1 han)', info: 'Menang pakai ubin pengganti setelah membuat kong.' },
  { key: 'robKong', label: 'Chankan (+1 han)', info: 'Menang dengan merampok ubin yang dipakai pemain lain untuk menambah pung jadi kong.' },
  { key: 'tenhou', label: 'Tenhou / Chiihou (yakuman)', info: 'Menang langsung dari ubin pembagian awal (dealer) atau tarikan pertama (non-dealer).' },
  { key: 'dora', label: 'Jumlah dora (termasuk ura & merah)', type: 'number', info: 'Hitung berapa ubin dora di tanganmu: dora dari penunjuk, ura-dora (kalau riichi), dan angka 5 merah. Tiap dora +1 han, tapi dora sendiri bukan yaku.' },
];

const GREEN = new Set([19, 20, 21, 23, 25, 32]);
const yakuhaiTile = (t, seat, prev) => isDragon(t) || t === windTile(seat) || t === windTile(prev);

function basic(han, fu, yakuman) {
  if (yakuman) return { base: 8000 * yakuman, lim: yakuman > 1 ? `${yakuman}× yakuman` : 'Yakuman' };
  if (han >= 13) return { base: 8000, lim: 'Kazoe yakuman' };
  if (han >= 11) return { base: 6000, lim: 'Sanbaiman' };
  if (han >= 8) return { base: 4000, lim: 'Baiman' };
  if (han >= 6) return { base: 3000, lim: 'Haneman' };
  const b = fu * 2 ** (2 + han);
  if (han >= 5 || b >= 2000) return { base: 2000, lim: 'Mangan' };
  return { base: b, lim: null };
}
const up100 = (x) => Math.ceil(x / 100) * 100;

/** Total poin yang diterima pemenang (untuk ringkasan). */
function handValue(base, dealer, selfDrawn) {
  if (dealer) return selfDrawn ? 3 * up100(2 * base) : up100(6 * base);
  return selfDrawn ? up100(2 * base) + 2 * up100(base) : up100(4 * base);
}

function finish(groups, yaku, fu, p, extraNote) {
  const ex = p.win.extras || {};
  const yakuman = yaku.filter((y) => y.yakuman).reduce((a, y) => a + y.yakuman, 0);
  const items = groups.map((g) => ({ label: groupLabel(g, !!p.open[g.key]) }));
  let han = 0;
  if (yakuman) {
    for (const y of yaku.filter((y) => y.yakuman)) items.push({ label: y.label, val: y.yakuman > 1 ? `${y.yakuman}× yakuman` : 'yakuman' });
  } else {
    for (const y of yaku) { items.push({ label: y.label, val: `${y.han} han` }); han += y.han; }
    const dora = Math.max(0, Math.floor(Number(ex.dora) || 0));
    if (dora && yaku.length) { items.push({ label: 'Dora', val: `${dora} han` }); han += dora; }
    items.push({ label: extraNote || 'Fu (dihitung otomatis)', val: `${fu} fu` });
  }
  const { base, lim } = basic(han, fu, yakuman);
  const dealer = p.seat === 1;
  const total = yaku.length ? handValue(base, dealer, p.win.selfDrawn) : 0;
  const warning = yaku.length ? null : 'Tidak ada yaku — di Riichi tangan ini tidak sah untuk menang (dora saja tidak cukup).';
  const head = yakuman ? lim : `${han} han ${fu} fu${lim ? ` (${lim})` : ''}`;
  return { groups, items, han, fu, base, total, limited: !!lim, warning, summary: `${head} = ${total.toLocaleString('id-ID')}` };
}

function situational(closed, p, yaku) {
  const ex = p.win.extras || {};
  if (closed && ex.doubleRiichi) yaku.push({ label: 'Double riichi', han: 2 });
  else if (closed && ex.riichi) yaku.push({ label: 'Riichi', han: 1 });
  if (closed && (ex.riichi || ex.doubleRiichi) && ex.ippatsu) yaku.push({ label: 'Ippatsu', han: 1 });
  if (closed && p.win.selfDrawn) yaku.push({ label: 'Menzen tsumo (tertutup, tarik sendiri)', han: 1 });
  if (ex.lastTile) yaku.push({ label: p.win.selfDrawn ? 'Haitei (ubin terakhir tembok)' : 'Houtei (buangan terakhir)', han: 1 });
  if (ex.replacement) yaku.push({ label: 'Rinshan kaihou', han: 1 });
  if (ex.robKong) yaku.push({ label: 'Chankan', han: 1 });
}

function tileYakuman(tiles, p, yaku) {
  const c = countsOf(tiles);
  if (tiles.every(isHonor)) yaku.push({ label: 'Tsuuiisou — semua kehormatan', yakuman: 1 });
  if (tiles.every((t) => GREEN.has(t))) yaku.push({ label: 'Ryuuiisou — semua hijau', yakuman: 1 });
  if (tiles.every(isTerminal)) yaku.push({ label: 'Chinroutou — semua 1 & 9', yakuman: 1 });
  if ((p.win.extras || {}).tenhou) yaku.push({ label: 'Tenhou / Chiihou', yakuman: 1 });
  return c;
}

function flushYaku(tiles, closed, yaku) {
  const suits = new Set(tiles.filter((t) => !isHonor(t)).map(suitOf));
  const hon = tiles.some(isHonor);
  if (suits.size === 1 && !hon) yaku.push({ label: 'Chinitsu — satu jenis murni', han: closed ? 6 : 5 });
  else if (suits.size === 1 && hon) yaku.push({ label: 'Honitsu — satu jenis + kehormatan', han: closed ? 3 : 2 });
}

function evaluate(groups, p) {
  const { tiles, open, seat, prevailing, settings, win } = p;
  const ex = win.extras || {};
  const badWait = ['single', 'closed', 'edge'].includes(ex.waitKind);
  const isOpen = (g) => !!open[g.key];
  const closed = groups.every((g) => !isOpen(g));
  const melds = groups.filter((g) => g.type !== 'pair');
  const pair = groups.find((g) => g.type === 'pair');
  const chows = melds.filter((g) => g.type === 'chow');
  const pungs = melds.filter((g) => g.type !== 'chow');
  const kongs = melds.filter((g) => g.type === 'kong');
  const pungOpen = (g) => isOpen(g) || g.key === ex.ronPung;
  const closedPungs = pungs.filter((g) => !pungOpen(g)).length;
  const dragonP = pungs.filter((g) => isDragon(g.tile)).length;
  const windP = pungs.filter((g) => isWind(g.tile)).length;

  // --- yakuman ---
  const ym = [];
  tileYakuman(tiles, p, ym);
  if (closedPungs === 4) ym.push({ label: 'Suuankou — 4 pung tertutup', yakuman: 1 });
  if (dragonP === 3) ym.push({ label: 'Daisangen — tiga naga besar', yakuman: 1 });
  if (windP === 4) ym.push({ label: 'Daisuushii — empat angin besar', yakuman: 1 });
  else if (windP === 3 && pair && isWind(pair.tile)) ym.push({ label: 'Shousuushii — empat angin kecil', yakuman: 1 });
  if (kongs.length === 4) ym.push({ label: 'Suukantsu — empat kong', yakuman: 1 });
  if (closed && !kongs.length) {
    const c = countsOf(tiles);
    const s = suitOf(tiles[0]);
    if (tiles.every((t) => !isHonor(t) && suitOf(t) === s)) {
      const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      if (need.every((k, i) => c[s * 9 + i] >= k)) ym.push({ label: 'Chuuren poutou — sembilan gerbang', yakuman: 1 });
    }
  }
  if (ym.length) return finish(groups, ym, 0, p);

  // --- yaku biasa ---
  const yaku = [];
  situational(closed, p, yaku);
  const pairYakuhai = pair && yakuhaiTile(pair.tile, seat, prevailing);
  const pinfu = closed && chows.length === 4 && !pairYakuhai && !badWait;
  if (pinfu) yaku.push({ label: 'Pinfu — semua chow, tanpa fu', han: 1 });
  if (tiles.every((t) => !isTermOrHonor(t)) && (closed || settings.kuitan)) yaku.push({ label: 'Tanyao — tanpa 1, 9 & kehormatan', han: 1 });

  if (closed) {
    const seen = {};
    for (const g of chows) seen[g.tile] = (seen[g.tile] || 0) + 1;
    const twins = Object.values(seen).reduce((a, k) => a + Math.floor(k / 2), 0);
    if (twins === 2) yaku.push({ label: 'Ryanpeikou — dua kali chow kembar', han: 3 });
    else if (twins === 1) yaku.push({ label: 'Iipeikou — chow kembar', han: 1 });
  }
  for (const g of pungs) {
    if (isDragon(g.tile)) yaku.push({ label: `Yakuhai — pung naga`, han: 1 });
    if (g.tile === windTile(seat)) yaku.push({ label: 'Yakuhai — pung angin kursi', han: 1 });
    if (g.tile === windTile(prevailing)) yaku.push({ label: 'Yakuhai — pung angin ronde', han: 1 });
  }
  const chowKey = (g) => [suitOf(g.tile), numOf(g.tile)];
  for (let n = 1; n <= 7; n++) {
    if ([0, 1, 2].every((s) => chows.some((g) => chowKey(g)[0] === s && chowKey(g)[1] === n))) { yaku.push({ label: 'Sanshoku doujun — chow sama 3 jenis', han: closed ? 2 : 1 }); break; }
  }
  for (let s = 0; s < 3; s++) {
    if ([1, 4, 7].every((n) => chows.some((g) => chowKey(g)[0] === s && chowKey(g)[1] === n))) { yaku.push({ label: 'Ittsu — lurus 1 sampai 9', han: closed ? 2 : 1 }); break; }
  }
  for (let n = 1; n <= 9; n++) {
    if ([0, 1, 2].every((s) => pungs.some((g) => g.tile === s * 9 + n - 1))) { yaku.push({ label: 'Sanshoku doukou — pung sama 3 jenis', han: 2 }); break; }
  }
  const hasTerm = (g) => (g.type === 'chow' ? numOf(g.tile) === 1 || numOf(g.tile) === 7 : isTermOrHonor(g.tile));
  const allTH = tiles.every(isTermOrHonor);
  if (allTH && !chows.length) yaku.push({ label: 'Honroutou — semua 1, 9 & kehormatan', han: 2 });
  else if (chows.length && groups.every(hasTerm)) {
    if (tiles.some(isHonor)) yaku.push({ label: 'Chanta — tiap set ada 1/9/kehormatan', han: closed ? 2 : 1 });
    else yaku.push({ label: 'Junchan — tiap set ada 1/9', han: closed ? 3 : 2 });
  }
  if (melds.length === 4 && !chows.length) yaku.push({ label: 'Toitoi — semua pung', han: 2 });
  if (closedPungs >= 3) yaku.push({ label: 'Sanankou — 3 pung tertutup', han: 2 });
  if (kongs.length === 3) yaku.push({ label: 'Sankantsu — 3 kong', han: 2 });
  if (dragonP === 2 && pair && isDragon(pair.tile)) yaku.push({ label: 'Shousangen — tiga naga kecil', han: 2 });
  flushYaku(tiles, closed, yaku);

  // --- fu ---
  let fu;
  if (pinfu) fu = win.selfDrawn ? 20 : 30;
  else {
    fu = 20;
    if (closed && !win.selfDrawn) fu += 10;
    if (win.selfDrawn) fu += 2;
    for (const g of pungs) {
      let f = isTermOrHonor(g.tile) ? 4 : 2;
      if (!pungOpen(g)) f *= 2;
      if (g.type === 'kong') f *= 4;
      fu += f;
    }
    if (pair) {
      if (isDragon(pair.tile)) fu += 2;
      if (pair.tile === windTile(seat)) fu += 2;
      if (pair.tile === windTile(prevailing)) fu += 2;
    }
    if (badWait) fu += 2;
    if (fu === 20 && !closed) fu = 30; // tangan terbuka tanpa fu tambahan
    fu = Math.ceil(fu / 10) * 10;
  }
  return finish(groups, yaku, fu, p);
}

export function scoreHand(p) {
  if (!p.isWinner) return { ok: true, groups: [], items: [], total: 0, summary: 'Tidak dihitung' };
  const c = countsOf(p.tiles);
  if (isThirteenOrphans(c)) return { ok: true, ...finish([], [{ label: 'Kokushi musou — 13 yatim', yakuman: 1 }], 0, p) };
  let best = null;
  for (const groups of decomposeWinning(c)) {
    for (const v of waitVariants(p, groups)) {
      const r = evaluate(groups, v);
      if (!best || r.total > best.total || (r.total === best.total && r.han > best.han)) best = r;
    }
  }
  if (isSevenPairs(c)) {
    const ym = [];
    tileYakuman(p.tiles, p, ym);
    let r;
    if (ym.length) r = finish([], ym, 0, p);
    else {
      const yaku = [{ label: 'Chiitoitsu — tujuh pasang', han: 2 }];
      situational(true, p, yaku);
      if (p.tiles.every((t) => !isTermOrHonor(t))) yaku.push({ label: 'Tanyao — tanpa 1, 9 & kehormatan', han: 1 });
      if (p.tiles.every(isTermOrHonor)) yaku.push({ label: 'Honroutou — semua 1, 9 & kehormatan', han: 2 });
      flushYaku(p.tiles, true, yaku);
      r = finish([], yaku, 25, p, 'Fu tujuh pasang (tetap)');
    }
    if (!best || r.total > best.total) best = r;
  }
  if (!best) return { ok: false, error: 'Ubin belum membentuk tangan menang (4 set + 1 pasang, 7 pasang, atau 13 yatim).' };
  return { ok: true, ...best };
}

export function settle({ results, winner, discarder, selfDrawn, dealer }) {
  const transfers = [];
  if (winner == null) return { transfers, net: [0, 0, 0, 0] };
  const r = results[winner];
  if (!r || !r.total) return { transfers, net: [0, 0, 0, 0] };
  const base = r.base, wd = winner === dealer;
  if (selfDrawn) {
    for (const l of [0, 1, 2, 3].filter((i) => i !== winner)) {
      const amt = up100(base * (wd || l === dealer ? 2 : 1));
      transfers.push({ from: l, to: winner, amt, why: l === dealer ? 'tsumo · dealer bayar 2×' : 'tsumo' });
    }
  } else if (discarder != null) {
    transfers.push({ from: discarder, to: winner, amt: up100(base * (wd ? 6 : 4)), why: 'ron · pembuang bayar semua' });
  }
  return { transfers, net: netOf(transfers) };
}
