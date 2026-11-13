// Aturan Chinese Official (MCR / 国标麻将): hanya pemenang dihitung, minimal 8 fan.
// Bayar: tarik sendiri -> tiap pemain bayar 8 + fan. Dari buangan -> pembuang 8 + fan, 2 lainnya 8.
// Pola "knitted" (全不靠/组合龙) belum dihitung otomatis.
import { countsOf, suitOf, numOf, isHonor, isTerminal } from '../tiles.js';
import { decomposeWinning, isSevenPairs, isThirteenOrphans } from '../decompose.js';
import { groupLabel, netOf, windTile, flowerName, isDragon, isWind, isTermOrHonor, waitVariants } from './common.js';

export const id = 'mcr';
export const name = 'Chinese Official / MCR';
export const desc = 'Aturan turnamen resmi Tiongkok (国标). Hanya pemenang dihitung, minimal 8 fan (bunga tidak ikut dihitung untuk minimum). Tarik sendiri: tiap pemain bayar 8 + fan. Dari buangan: pembuang bayar 8 + fan, 2 pemain lain masing-masing 8. Pola langka "knitted" belum dihitung otomatis.';
export const needsAllHands = false;
export const unit = 'fan';

export const defaults = { minFan: 8, flowersOn: true };

export const settingsSpec = [
  { key: 'minFan', label: 'Fan minimum untuk menang', type: 'number', info: 'Aturan resmi: 8 fan. Bunga tidak ikut dihitung untuk minimum ini.' },
  { key: 'flowersOn', label: 'Main pakai bunga (+1 fan per bunga)', type: 'bool', info: 'Tiap bunga +1 fan, tapi tidak membantu mencapai minimum 8 fan.' },
];

export const winExtras = [
  { key: 'lastTile', label: 'Ubin terakhir tembok / buangan terakhir (+8)', info: 'Menang pakai ubin paling terakhir di tembok (妙手回春) atau buangan paling terakhir (海底撈月).' },
  { key: 'replacement', label: 'Dari ubin pengganti kong (+8)', info: 'Menang pakai ubin pengganti setelah membuat kong (槓上開花).' },
  { key: 'robKong', label: 'Merampok kong (+8)', info: 'Menang pakai ubin yang dipakai pemain lain untuk menambah pung jadi kong (搶槓和).' },
  { key: 'lastOfKind', label: 'Ubin terakhir dari jenisnya (+4)', info: 'Ubin kemenanganmu adalah lembar ke-4 dari jenis itu, 3 lainnya sudah terlihat di meja (和絕張).' },
];

const F = {
  bigFourWinds: [88, 'Empat angin besar (大四喜)'], bigThreeDragons: [88, 'Tiga naga besar (大三元)'], allGreen: [88, 'Semua hijau (綠一色)'],
  nineGates: [88, 'Sembilan gerbang (九蓮寶燈)'], fourKongs: [88, 'Empat kong (四槓)'], sevenShiftedPairs: [88, 'Tujuh pasang berurutan (連七對)'],
  thirteenOrphans: [88, 'Tiga belas yatim (十三么)'],
  allTerminals: [64, 'Semua 1 & 9 (清幺九)'], littleFourWinds: [64, 'Empat angin kecil (小四喜)'], littleThreeDragons: [64, 'Tiga naga kecil (小三元)'],
  allHonors: [64, 'Semua kehormatan (字一色)'], fourConcealedPungs: [64, 'Empat pung tertutup (四暗刻)'], pureTerminalChows: [64, 'Naga ganda satu jenis (一色雙龍會)'],
  quadrupleChow: [48, 'Empat chow kembar (一色四同順)'], fourPureShiftedPungs: [48, 'Empat pung naik (一色四節高)'],
  fourPureShiftedChows: [32, 'Empat chow bertingkat (一色四步高)'], threeKongs: [32, 'Tiga kong (三槓)'], allTerminalsHonors: [32, 'Semua 1, 9 & kehormatan (混幺九)'],
  sevenPairs: [24, 'Tujuh pasang (七對)'], allEvenPungs: [24, 'Semua pung genap (全雙刻)'], fullFlush: [24, 'Satu jenis murni (清一色)'],
  pureTripleChow: [24, 'Tiga chow kembar (一色三同順)'], pureShiftedPungs: [24, 'Tiga pung naik (一色三節高)'],
  upperTiles: [24, 'Semua 7-8-9 (全大)'], middleTiles: [24, 'Semua 4-5-6 (全中)'], lowerTiles: [24, 'Semua 1-2-3 (全小)'],
  pureStraight: [16, 'Lurus 1-9 satu jenis (清龍)'], threeSuitedTerminalChows: [16, 'Naga ganda tiga jenis (三色雙龍會)'],
  pureShiftedChows: [16, 'Tiga chow bertingkat (一色三步高)'], allFives: [16, 'Semua ada angka 5 (全帶五)'], triplePung: [16, 'Tiga pung angka sama (三同刻)'],
  threeConcealedPungs: [16, 'Tiga pung tertutup (三暗刻)'],
  upperFour: [12, 'Semua 6-9 (大於五)'], lowerFour: [12, 'Semua 1-4 (小於五)'], bigThreeWinds: [12, 'Tiga pung angin (三風刻)'],
  mixedStraight: [8, 'Lurus 1-9 campur jenis (花龍)'], reversible: [8, 'Ubin simetris (推不倒)'], mixedTripleChow: [8, 'Chow sama 3 jenis (三色三同順)'],
  mixedShiftedPungs: [8, 'Pung naik 3 jenis (三色三節高)'], chickenHand: [8, 'Tangan tanpa fan (無番和)'], lastTileDraw: [8, 'Tarik ubin terakhir (妙手回春)'],
  lastTileClaim: [8, 'Buangan terakhir (海底撈月)'], replacement: [8, 'Ubin pengganti kong (槓上開花)'], robKong: [8, 'Merampok kong (搶槓和)'],
  twoConcealedKongs: [8, 'Dua kong tertutup (雙暗槓)'],
  allPungs: [6, 'Semua pung (碰碰和)'], halfFlush: [6, 'Satu jenis + kehormatan (混一色)'], mixedShiftedChows: [6, 'Chow bertingkat 3 jenis (三色三步高)'],
  allTypes: [6, 'Lima golongan lengkap (五門齊)'], meldedHand: [6, 'Semua set dari buangan (全求人)'], twoDragonPungs: [6, 'Dua pung naga (雙箭刻)'],
  mixedKongs: [5, 'Kong terbuka + tertutup (明暗槓)'],
  outsideHand: [4, 'Tiap set ada 1/9/kehormatan (全帶幺)'], fullyConcealed: [4, 'Tertutup & tarik sendiri (不求人)'], twoMeldedKongs: [4, 'Dua kong terbuka (雙明槓)'],
  lastOfKind: [4, 'Ubin terakhir dari jenisnya (和絕張)'],
  dragonPung: [2, 'Pung naga (箭刻)'], prevalentWind: [2, 'Pung angin ronde (圈風刻)'], seatWind: [2, 'Pung angin kursi (門風刻)'],
  concealedHand: [2, 'Tangan tertutup (門前清)'], allChows: [2, 'Semua chow (平和)'], tileHog: [2, '4 ubin sama tanpa kong (四歸一)'],
  doublePung: [2, 'Dua pung angka sama (雙同刻)'], twoConcealedPungs: [2, 'Dua pung tertutup (雙暗刻)'], concealedKong: [2, 'Kong tertutup (暗槓)'],
  allSimples: [2, 'Tanpa 1, 9 & kehormatan (斷幺)'],
  pureDoubleChow: [1, 'Dua chow kembar (一般高)'], mixedDoubleChow: [1, 'Chow sama beda jenis (喜相逢)'], shortStraight: [1, 'Dua chow nyambung (連六)'],
  twoTerminalChows: [1, 'Chow 1-2-3 + 7-8-9 (老少副)'], pungTermHonor: [1, 'Pung 1/9 atau angin lain (幺九刻)'], meldedKong: [1, 'Kong terbuka (明槓)'],
  voidedSuit: [1, 'Kurang satu jenis (缺一門)'], noHonors: [1, 'Tanpa kehormatan (無字)'], edgeWait: [1, 'Tunggu tepi (邊張)'],
  closedWait: [1, 'Tunggu tengah (嵌張)'], singleWait: [1, 'Tunggu pasangan (單釣將)'], selfDrawn: [1, 'Tarik sendiri (自摸)'],
};

// Fan yang sudah "termasuk" di fan lain, jadi tidak dihitung lagi (prinsip tidak dobel).
const EXCL = {
  bigFourWinds: ['bigThreeWinds', 'allPungs', 'seatWind', 'prevalentWind', 'littleFourWinds'],
  bigThreeDragons: ['dragonPung', 'twoDragonPungs'],
  allGreen: ['halfFlush'],
  nineGates: ['fullFlush', 'concealedHand', 'pungTermHonor', 'noHonors', 'voidedSuit'],
  fourKongs: ['threeKongs', 'twoMeldedKongs', 'twoConcealedKongs', 'mixedKongs', 'meldedKong', 'concealedKong', 'allPungs', 'singleWait'],
  sevenShiftedPairs: ['sevenPairs', 'fullFlush', 'concealedHand', 'singleWait', 'noHonors', 'voidedSuit'],
  thirteenOrphans: ['allTypes', 'concealedHand', 'singleWait'],
  allTerminals: ['allTerminalsHonors', 'allPungs', 'pungTermHonor', 'outsideHand', 'noHonors'],
  littleFourWinds: ['bigThreeWinds'],
  littleThreeDragons: ['dragonPung', 'twoDragonPungs'],
  allHonors: ['allTerminalsHonors', 'allPungs', 'pungTermHonor', 'outsideHand'],
  fourConcealedPungs: ['allPungs', 'threeConcealedPungs', 'twoConcealedPungs', 'concealedHand'],
  pureTerminalChows: ['fullFlush', 'allChows', 'pureDoubleChow', 'twoTerminalChows'],
  quadrupleChow: ['pureTripleChow', 'pureDoubleChow', 'tileHog'],
  fourPureShiftedPungs: ['pureShiftedPungs', 'allPungs'],
  fourPureShiftedChows: ['pureShiftedChows'],
  threeKongs: ['twoMeldedKongs', 'twoConcealedKongs', 'mixedKongs', 'meldedKong', 'concealedKong'],
  allTerminalsHonors: ['allPungs', 'pungTermHonor', 'outsideHand'],
  sevenPairs: ['concealedHand', 'singleWait'],
  allEvenPungs: ['allPungs', 'allSimples', 'noHonors'],
  fullFlush: ['noHonors'],
  pureTripleChow: ['pureDoubleChow'],
  upperTiles: ['noHonors'], middleTiles: ['allSimples', 'noHonors'], lowerTiles: ['noHonors'],
  threeSuitedTerminalChows: ['allChows', 'noHonors', 'mixedDoubleChow', 'twoTerminalChows'],
  allFives: ['allSimples'],
  threeConcealedPungs: ['twoConcealedPungs'],
  upperFour: ['noHonors'], lowerFour: ['noHonors'],
  reversible: ['voidedSuit'],
  twoConcealedKongs: ['concealedKong', 'twoConcealedPungs'],
  fullyConcealed: ['selfDrawn', 'concealedHand'],
  meldedHand: ['singleWait'],
  allSimples: ['noHonors'],
  twoDragonPungs: ['dragonPung'],
  mixedKongs: ['concealedKong', 'meldedKong'],
  twoMeldedKongs: ['meldedKong'],
  lastTileDraw: ['selfDrawn'],
  replacement: ['selfDrawn'],
  robKong: ['lastOfKind'],
};

const GREEN = new Set([19, 20, 21, 23, 25, 32]);
const REVERSIBLE = new Set([9, 10, 11, 12, 13, 16, 17, 19, 21, 22, 23, 25, 26, 31]);

function tileFans(tiles, add) {
  const suits = new Set(tiles.filter((t) => !isHonor(t)).map(suitOf));
  const hon = tiles.some(isHonor);
  if (tiles.every((t) => GREEN.has(t))) add('allGreen');
  if (tiles.every((t) => REVERSIBLE.has(t))) add('reversible');
  if (!suits.size) add('allHonors');
  else if (tiles.every(isTermOrHonor)) add(hon ? 'allTerminalsHonors' : 'allTerminals');
  if (suits.size === 1) add(hon ? 'halfFlush' : 'fullFlush');
  if (!hon) {
    const ns = tiles.map(numOf), inR = (a, b) => ns.every((n) => n >= a && n <= b);
    if (inR(7, 9)) add('upperTiles');
    else if (inR(4, 6)) add('middleTiles');
    else if (inR(1, 3)) add('lowerTiles');
    else if (inR(6, 9)) add('upperFour');
    else if (inR(1, 4)) add('lowerFour');
    if (tiles.every((t) => !isTerminal(t))) add('allSimples');
    add('noHonors');
  }
  if (suits.size === 2) add('voidedSuit');
  if (suits.size === 3 && tiles.some(isWind) && tiles.some(isDragon)) add('allTypes');
}

function winFans(p, add) {
  const ex = p.win.extras || {};
  if (p.win.selfDrawn) add('selfDrawn');
  if (ex.oneTile) { if (ex.waitKind === 'edge') add('edgeWait'); else if (ex.waitKind === 'closed') add('closedWait'); else if (ex.waitKind === 'single') add('singleWait'); }
  if (ex.lastTile) add(p.win.selfDrawn ? 'lastTileDraw' : 'lastTileClaim');
  if (ex.replacement) add('replacement');
  if (ex.robKong) add('robKong');
  if (ex.lastOfKind) add('lastOfKind');
}

function chowFans(chows, pair, add) {
  const C = chows.map((g) => ({ s: suitOf(g.tile), n: numOf(g.tile) }));
  const groupsUsed = []; // indeks chow yang sudah dipakai fan besar
  const combos = (k) => {
    const out = [];
    const rec = (st, acc) => { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = st; i < C.length; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); } };
    rec(0, []);
    return out;
  };
  const sameSuit = (ix) => ix.every((i) => C[i].s === C[ix[0]].s);
  const sortedN = (ix) => ix.map((i) => C[i].n).sort((a, b) => a - b);
  const step = (ns, d) => ns.every((n, i) => i === 0 || n - ns[i - 1] === d);
  if (C.length === 4) {
    const all = [0, 1, 2, 3], ns = sortedN(all);
    if (sameSuit(all) && step(ns, 0)) { add('quadrupleChow'); return; }
    if (sameSuit(all) && (step(ns, 1) || step(ns, 2))) { add('fourPureShiftedChows'); return; }
    if (sameSuit(all) && ns.join() === '1,1,7,7' && pair && pair.tile < 27 && suitOf(pair.tile) === C[0].s && numOf(pair.tile) === 5) { add('pureTerminalChows'); return; }
    const suitsW = [...new Set(C.map((c) => c.s))];
    if (suitsW.length === 2 && suitsW.every((s) => sortedN(all.filter((i) => C[i].s === s)).join() === '1,7') && pair && pair.tile < 27
      && !suitsW.includes(suitOf(pair.tile)) && numOf(pair.tile) === 5) { add('threeSuitedTerminalChows'); return; }
  }
  // fan 3 chow: ambil yang nilainya paling besar
  const tri = [];
  for (const ix of combos(3)) {
    const ns = sortedN(ix), suits = new Set(ix.map((i) => C[i].s));
    if (sameSuit(ix) && step(ns, 0)) tri.push(['pureTripleChow', ix]);
    if (sameSuit(ix) && ns.join() === '1,4,7') tri.push(['pureStraight', ix]);
    if (sameSuit(ix) && (step(ns, 1) || step(ns, 2))) tri.push(['pureShiftedChows', ix]);
    if (suits.size === 3 && ns.join() === '1,4,7') tri.push(['mixedStraight', ix]);
    if (suits.size === 3 && step(ns, 0)) tri.push(['mixedTripleChow', ix]);
    if (suits.size === 3 && step(ns, 1)) tri.push(['mixedShiftedChows', ix]);
  }
  if (tri.length) {
    tri.sort((a, b) => F[b[0]][0] - F[a[0]][0]);
    add(tri[0][0]);
    groupsUsed.push(tri[0][1]);
  }
  // fan 1 dari pasangan chow; tiap chow hanya dipakai sekali, dan tidak dengan teman satu fan besar
  const cand = [];
  for (const [i, j] of combos(2)) {
    if (groupsUsed.some((g) => g.includes(i) && g.includes(j))) continue;
    const a = C[i], b = C[j];
    let id = null;
    if (a.s === b.s && a.n === b.n) id = 'pureDoubleChow';
    else if (a.n === b.n) id = 'mixedDoubleChow';
    else if (a.s === b.s && Math.abs(a.n - b.n) === 3) id = 'shortStraight';
    else if (a.s === b.s && Math.min(a.n, b.n) === 1 && Math.max(a.n, b.n) === 7) id = 'twoTerminalChows';
    if (id) cand.push([id, i, j]);
  }
  let best = [];
  for (let m = 0; m < 1 << cand.length; m++) {
    const pick = cand.filter((_, k) => m & (1 << k));
    const use = {};
    let ok = true;
    for (const [, i, j] of pick) { use[i] = (use[i] || 0) + 1; use[j] = (use[j] || 0) + 1; if (use[i] > 1 || use[j] > 1) ok = false; }
    if (ok && pick.length > best.length) best = pick;
  }
  for (const [id] of best) add(id);
}

function shapeFans(groups, p, add) {
  const { open, seat, prevailing, win } = p;
  const isOpen = (g) => !!open[g.key];
  const melds = groups.filter((g) => g.type !== 'pair');
  const pair = groups.find((g) => g.type === 'pair');
  const chows = melds.filter((g) => g.type === 'chow');
  const pungs = melds.filter((g) => g.type !== 'chow');
  const kongs = melds.filter((g) => g.type === 'kong');
  const windP = pungs.filter((g) => isWind(g.tile)).length;
  const dragP = pungs.filter((g) => isDragon(g.tile)).length;
  if (windP === 4) add('bigFourWinds');
  else if (windP === 3 && pair && isWind(pair.tile)) add('littleFourWinds');
  else if (windP === 3) add('bigThreeWinds');
  if (dragP === 3) add('bigThreeDragons');
  else if (dragP === 2 && pair && isDragon(pair.tile)) add('littleThreeDragons');
  else if (dragP === 2) add('twoDragonPungs');
  else if (dragP === 1) add('dragonPung');
  for (const g of pungs) {
    if (g.tile === windTile(seat)) add('seatWind');
    if (g.tile === windTile(prevailing)) add('prevalentWind');
    const otherWind = isWind(g.tile) && g.tile !== windTile(seat) && g.tile !== windTile(prevailing) && windP < 3;
    if (isTerminal(g.tile) || otherWind) add('pungTermHonor');
  }
  const ck = kongs.filter((g) => !isOpen(g)).length, ok = kongs.length - ck;
  if (kongs.length === 4) add('fourKongs');
  else if (kongs.length === 3) add('threeKongs');
  else if (kongs.length === 2) add(ck === 2 ? 'twoConcealedKongs' : ck === 1 ? 'mixedKongs' : 'twoMeldedKongs');
  else if (kongs.length === 1) add(ck ? 'concealedKong' : 'meldedKong');
  void ok;
  const ronPung = (win.extras || {}).ronPung;
  const cp = pungs.filter((g) => !isOpen(g) && g.key !== ronPung).length;
  if (cp === 4) add('fourConcealedPungs'); else if (cp === 3) add('threeConcealedPungs'); else if (cp === 2) add('twoConcealedPungs');
  if (melds.length === 4 && !chows.length) add('allPungs');
  if (chows.length === 4 && pair && !isHonor(pair.tile)) add('allChows');

  // pung angka
  const sp = pungs.filter((g) => !isHonor(g.tile)).map((g) => ({ s: suitOf(g.tile), n: numOf(g.tile) }));
  let triple = false;
  for (let n = 1; n <= 9; n++) {
    const k = new Set(sp.filter((x) => x.n === n).map((x) => x.s)).size;
    if (k === 3) { add('triplePung'); triple = true; } else if (k === 2 && !triple) add('doublePung');
  }
  let shifted = false;
  for (let s = 0; s < 3; s++) {
    const ns = [...new Set(sp.filter((x) => x.s === s).map((x) => x.n))].sort((a, b) => a - b);
    for (let i = 0; i < ns.length; i++) {
      let run = 1;
      while (ns[i + run] === ns[i] + run) run++;
      if (run >= 4) { add('fourPureShiftedPungs'); shifted = true; break; }
      if (run === 3) { add('pureShiftedPungs'); shifted = true; break; }
    }
  }
  if (!shifted) {
    for (let n = 1; n <= 7 && !shifted; n++) {
      for (const [a, b, c] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
        if (sp.some((x) => x.s === a && x.n === n) && sp.some((x) => x.s === b && x.n === n + 1) && sp.some((x) => x.s === c && x.n === n + 2)) { add('mixedShiftedPungs'); shifted = true; break; }
      }
    }
  }
  if (melds.length === 4 && !chows.length && pungs.every((g) => !isHonor(g.tile) && numOf(g.tile) % 2 === 0)
    && pair && !isHonor(pair.tile) && numOf(pair.tile) % 2 === 0) add('allEvenPungs');

  chowFans(chows, pair, add);

  const hasTH = (g) => (g.type === 'chow' ? numOf(g.tile) === 1 || numOf(g.tile) === 7 : isTermOrHonor(g.tile));
  if (groups.every(hasTH) && chows.length) add('outsideHand');
  const has5 = (g) => !isHonor(g.tile) && (g.type === 'chow' ? numOf(g.tile) >= 3 && numOf(g.tile) <= 5 : numOf(g.tile) === 5);
  if (groups.every(has5)) add('allFives');

  const allClosed = melds.every((g) => !isOpen(g));
  if (allClosed) add(win.selfDrawn ? 'fullyConcealed' : 'concealedHand');
  if (melds.every(isOpen) && !win.selfDrawn) add('meldedHand');

  // 4 ubin sama yang tidak dijadikan kong
  const c = countsOf(p.tiles);
  for (let t = 0; t < 34; t++) if (c[t] === 4 && !kongs.some((g) => g.tile === t)) add('tileHog');

  if (allClosed && !kongs.length) {
    const s = suitOf(p.tiles[0]);
    if (p.tiles.every((t) => !isHonor(t) && suitOf(t) === s) && [3, 1, 1, 1, 1, 1, 1, 1, 3].every((k, i) => c[s * 9 + i] >= k)) add('nineGates');
  }
}

function tally(found, groups, p) {
  for (const id of [...found.keys()]) for (const x of EXCL[id] || []) found.delete(x);
  let fan = 0;
  for (const [id, n] of found) fan += F[id][0] * n;
  if (!fan) { found.set('chickenHand', 1); fan = 8; }
  const items = groups.map((g) => ({ label: groupLabel(g, !!p.open[g.key]) }));
  for (const [id, n] of found) items.push({ label: F[id][1] + (n > 1 ? ` ×${n}` : ''), val: `${F[id][0] * n} fan` });
  const flowers = p.settings.flowersOn ? p.flowers : [];
  for (const f of flowers) items.push({ label: `Bunga — ${flowerName(f)}`, val: '1 fan' });
  const total = fan + flowers.length;
  const min = p.settings.minFan ?? 8;
  const warning = fan < min ? `Baru ${fan} fan (tanpa bunga) — kurang dari minimum ${min} fan.` : null;
  return { groups, items, fan, total, warning, summary: `${total} fan${flowers.length ? ` (termasuk ${flowers.length} bunga)` : ''}` };
}

function collector() {
  const found = new Map();
  return { found, add: (id) => found.set(id, (found.get(id) || 0) + 1) };
}

export function scoreHand(p) {
  if (!p.isWinner) return { ok: true, groups: [], items: [], total: 0, summary: 'Tidak dihitung' };
  const c = countsOf(p.tiles);
  const cands = [];
  if (isThirteenOrphans(c)) {
    const { found, add } = collector();
    add('thirteenOrphans'); winFans(p, add);
    cands.push(tally(found, [], p));
  }
  for (const groups of decomposeWinning(c)) {
    for (const v of waitVariants(p, groups)) {
      const { found, add } = collector();
      tileFans(v.tiles, add); shapeFans(groups, v, add); winFans(v, add);
      cands.push(tally(found, groups, v));
    }
  }
  if (isSevenPairs(c)) {
    const { found, add } = collector();
    const ps = [...Array(34).keys()].filter((t) => c[t] === 2);
    const shifted = ps.length === 7 && ps.every((t) => !isHonor(t) && suitOf(t) === suitOf(ps[0])) && ps[6] - ps[0] === 6;
    add(shifted ? 'sevenShiftedPairs' : 'sevenPairs');
    tileFans(p.tiles, add); winFans(p, add);
    if (!p.win.selfDrawn) add('concealedHand');
    cands.push(tally(found, [], p));
  }
  if (!cands.length) return { ok: false, error: 'Ubin belum membentuk tangan menang (4 set + 1 pasang, 7 pasang, atau 13 yatim).' };
  cands.sort((a, b) => b.total - a.total);
  return { ok: true, ...cands[0] };
}

export function settle({ results, winner, discarder, selfDrawn }) {
  const transfers = [];
  if (winner == null) return { transfers, net: [0, 0, 0, 0] };
  const B = results[winner]?.total || 0;
  for (const l of [0, 1, 2, 3].filter((i) => i !== winner)) {
    if (selfDrawn) transfers.push({ from: l, to: winner, amt: 8 + B, why: 'tarik sendiri · 8 + fan' });
    else if (l === discarder) transfers.push({ from: l, to: winner, amt: 8 + B, why: 'pembuang · 8 + fan' });
    else transfers.push({ from: l, to: winner, amt: 8, why: 'dasar 8' });
  }
  return { transfers, net: netOf(transfers) };
}
