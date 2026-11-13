// Jalankan: node tests/test.mjs
import assert from 'node:assert/strict';
import * as classical from '../js/rules/classical.js';
import * as hongkong from '../js/rules/hongkong.js';
import * as riichi from '../js/rules/riichi.js';
import * as mcr from '../js/rules/mcr.js';
import * as G from '../js/game.js';

// "123m456p77z" -> indeks ubin. m=Karakter p=Bulat s=Bambu z=1..7 (Timur,Selatan,Barat,Utara,Putih,Hijau,Merah)
function parse(str) {
  const out = [];
  for (const [, nums, s] of str.matchAll(/(\d+)([mpsz])/g)) {
    for (const ch of nums) out.push({ m: -1, p: 8, s: 17, z: 26 }[s] + +ch);
  }
  return out.sort((a, b) => a - b);
}

const base = (rule) => ({ flowers: [], open: {}, seat: 1, prevailing: 1, win: { selfDrawn: false, extras: {} }, settings: { ...rule.defaults } });
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok -', name); }

test('Klasik: pung Merah tertutup + pung 2m terbuka + pasang Timur (kursi & ronde Timur)', () => {
  const r = classical.scoreHand({ ...base(classical), tiles: parse('222m345p678s11777z'), isWinner: true, open: { 'pung-1': true } });
  assert.equal(r.ok, true);
  // 8 (pung naga tertutup) + 2 (pung simpel terbuka) + 4 (pasang angin kursi+ronde) + 20 mahjong = 34, ×2 naga = 68 -> 70
  assert.equal(r.basic, 34);
  assert.equal(r.dbl, 1);
  assert.equal(r.total, 70);
});

test('Klasik: 111222333m dipilih jadi 3 pung (lebih tinggi daripada 3 chow)', () => {
  const r = classical.scoreHand({ ...base(classical), seat: 2, tiles: parse('111222333m456p99s'), isWinner: true });
  // 1m pung ujung tertutup 8 + 2m 4 + 3m 4 + 20 = 36 ; tertutup semua ×2 = 72 -> 80
  assert.equal(r.basic, 36);
  assert.equal(r.total, 80);
});

test('Klasik: tangan kalah hanya hitung pung/kong & 1 pasang terbaik', () => {
  const r = classical.scoreHand({ ...base(classical), seat: 3, tiles: parse('555p13m66z2468s9s'), isWinner: false });
  // pung 5p tertutup 4 + pasang Hijau 2 = 6 -> 10
  assert.equal(r.basic, 6);
  assert.equal(r.total, 10);
});

test('Klasik: bukan tangan menang -> error', () => {
  const r = classical.scoreHand({ ...base(classical), tiles: parse('1357m2468p13579s'), isWinner: true });
  assert.equal(r.ok, false);
});

test('Klasik: bayar-membayar dengan dealer dobel', () => {
  // dealer = pemain 0. Pemenang pemain 1 skor 100; pemain 0 = 20, pemain 2 = 40, pemain 3 = 0
  const results = [20, 100, 40, 0].map((total) => ({ ok: true, total }));
  const { net } = classical.settle({ results, winner: 1, dealer: 0, settings: classical.defaults });
  // ke pemenang: p0 bayar 200 (dealer dobel), p2 100, p3 100 -> p1 +400
  // selisih: p0 vs p2: (20-40)*2 = p0 bayar 40 ; p0 vs p3: (20-0)*2 = p3 bayar 40 ; p2 vs p3: p3 bayar 40
  assert.deepEqual(net, [-200, 400, -100 + 40 + 40, -100 - 40 - 40]);
  assert.equal(net.reduce((a, b) => a + b, 0), 0);
});

test('Klasik: 13 yatim = limit', () => {
  const r = classical.scoreHand({ ...base(classical), tiles: parse('19m19p19s12345677z'), isWinner: true });
  assert.equal(r.total, 1000);
});

test('HK: tarik sendiri, tertutup, tanpa bunga, semua chow = 4 faan = 16 poin', () => {
  const r = hongkong.scoreHand({ ...base(hongkong), seat: 2, tiles: parse('123456m789p234s55s'), isWinner: true, win: { selfDrawn: true, extras: {} } });
  assert.equal(r.faan, 4);
  assert.equal(r.total, 16);
});

test('HK: satu jenis murni semua pung kena limit 10 faan', () => {
  const r = hongkong.scoreHand({ ...base(hongkong), seat: 2, tiles: parse('11122233344455p'), isWinner: true, open: { 'pung-9': true } });
  assert.equal(r.limited, true);
  assert.equal(r.total, 1024);
});

test('HK: tujuh pasang', () => {
  const r = hongkong.scoreHand({ ...base(hongkong), seat: 2, tiles: parse('1133m5577p2299s11z'), isWinner: true });
  // 4 tujuh pasang + 1 tertutup + 1 tanpa bunga = 6
  assert.equal(r.faan, 6);
});

test('HK: bayar dari buangan (setengah) & tarik sendiri', () => {
  const results = [null, { ok: true, total: 16 }, null, null];
  let s = hongkong.settle({ results, winner: 1, discarder: 3, selfDrawn: false, settings: hongkong.defaults });
  assert.deepEqual(s.net, [-8, 32, -8, -16]);
  s = hongkong.settle({ results, winner: 1, discarder: null, selfDrawn: true, settings: hongkong.defaults });
  assert.deepEqual(s.net, [-16, 48, -16, -16]);
  s = hongkong.settle({ results, winner: 1, discarder: 3, selfDrawn: false, settings: { ...hongkong.defaults, payMode: 'full' } });
  assert.deepEqual(s.net, [0, 32, 0, -32]);
});

test('Alur permainan: catat pemenang → isi 4 tangan → simpan → dealer pindah', () => {
  let s = G.initialState();
  s = G.reduce(s, { type: 'start' });
  s = G.reduce(s, { type: 'declare', winner: 1, selfDrawn: true });
  const hands = { 1: parse('222m345p678s11777z'), 2: parse('555p13m66z2468s9s'), 3: parse('1234567m123456p'), 0: parse('555s13m2468p1357s') };
  for (const p of [0, 1, 2, 3]) s = G.reduce(s, { type: 'hand', seat: p, tiles: hands[p] });
  assert.equal(G.allSubmitted(s), false);
  for (const p of [0, 1, 2, 3]) s = G.reduce(s, { type: 'hand', seat: p, submitted: true });
  assert.equal(G.allSubmitted(s), true);
  const r = G.computeResult(s);
  assert.equal(r.net.reduce((a, b) => a + b, 0), 0);
  s = G.reduce(s, { type: 'commit' });
  assert.equal(s.cur, null);
  assert.equal(s.game.dealer, 1);
  assert.deepEqual(s.game.totals, r.net);
  s = G.reduce(s, { type: 'undo' });
  assert.deepEqual(s.game.totals, [0, 0, 0, 0]);
  assert.equal(s.game.dealer, 0);
});

test('Kursi: tidak bisa merebut kursi orang lain', () => {
  let s = G.initialState();
  s = G.reduce(s, { type: 'claim', seat: 0, clientId: 'a', name: 'Calvin' });
  s = G.reduce(s, { type: 'claim', seat: 0, clientId: 'b', name: 'Eva' });
  assert.equal(s.seats[0], 'a');
  s = G.reduce(s, { type: 'claim', seat: 2, clientId: 'b', name: 'Eva' });
  s = G.reduce(s, { type: 'claim', seat: 1, clientId: 'a' });
  assert.deepEqual(s.seats, [null, 'a', 'b', null]);
});

test('Nama: pindah kursi tidak meninggalkan nama, nama dobel ditolak', () => {
  let s = G.initialState();
  s = G.reduce(s, { type: 'claim', seat: 0, clientId: 'a', name: 'calvin' });
  s = G.reduce(s, { type: 'claim', seat: 1, clientId: 'a', name: 'calvin' });
  assert.deepEqual(s.names, ['', 'calvin', '', '']);
  assert.deepEqual(s.seats, [null, 'a', null, null]);
  const t = G.reduce(s, { type: 'claim', seat: 2, clientId: 'b', name: 'Calvin' });
  assert.equal(t.seats[2], null); // nama sama dengan pemain lain -> ditolak
  assert.equal(G.reduce(s, { type: 'name', seat: 3, name: 'CALVIN ' }).names[3], '');
  // nama yang tadinya diketik di kursi kosong lain, lalu orangnya duduk di kursi lain -> tidak dobel
  let u = G.reduce(s, { type: 'name', seat: 3, name: 'Eva' });
  u = G.reduce(u, { type: 'claim', seat: 2, clientId: 'b', name: 'eva' });
  assert.deepEqual(u.names, ['', 'calvin', 'eva', '']);
});

test('Catat pemenang: pembuang tidak boleh sama dengan pemenang', () => {
  let s = G.reduce(G.initialState({ names: ['A', 'B', 'C', 'D'] }), { type: 'start' });
  assert.equal(G.reduce(s, { type: 'declare', winner: 1, selfDrawn: false, discarder: 1 }).cur, null);
  assert.equal(G.reduce(s, { type: 'declare', winner: 1, selfDrawn: false, discarder: 2 }).cur.discarder, 2);
});

test('Riichi: riichi + pinfu + tanyao, ron non-dealer = 3 han 30 fu = 3.900; +2 dora = mangan 8.000', () => {
  const p = { ...base(riichi), seat: 2, tiles: parse('234567m234p55p678s'), isWinner: true, win: { selfDrawn: false, extras: { riichi: true } } };
  const r = riichi.scoreHand(p);
  assert.equal(r.han, 3); assert.equal(r.fu, 30); assert.equal(r.total, 3900);
  const m = riichi.scoreHand({ ...p, win: { selfDrawn: false, extras: { riichi: true, dora: 2 } } });
  assert.equal(m.total, 8000);
  const st = riichi.settle({ results: [null, null, m, null], winner: 2, discarder: 0, selfDrawn: false, dealer: 0 });
  assert.deepEqual(st.net, [-8000, 0, 8000, 0]);
});

test('Riichi: tangan terbuka tanpa yaku diberi peringatan', () => {
  const r = riichi.scoreHand({ ...base(riichi), seat: 2, tiles: parse('123m456p789s234s99m'), isWinner: true, open: { 'chow-0': true } });
  assert.equal(r.ok, true);
  assert.ok(r.warning);
  assert.equal(r.total, 0);
});

test('MCR: lurus 1-9 + semua chow + tertutup + tanpa kehormatan = 21 fan; pembuang bayar 29, lainnya 8', () => {
  const r = mcr.scoreHand({ ...base(mcr), seat: 2, tiles: parse('123456789m234p55s'), isWinner: true });
  assert.equal(r.total, 21);
  const st = mcr.settle({ results: [null, null, r, null], winner: 2, discarder: 0, selfDrawn: false });
  assert.deepEqual(st.net, [-29, -8, 45, -8]);
});

test('MCR: tiga naga besar tidak dobel dengan pung naga', () => {
  const r = mcr.scoreHand({ ...base(mcr), seat: 2, tiles: parse('555666777z123m99p'), isWinner: true, win: { selfDrawn: true, extras: {} } });
  const labels = r.items.map((x) => x.label).join('|');
  assert.ok(labels.includes('大三元'));
  assert.ok(!labels.includes('箭刻'));
});

test('Tunggu otomatis dari ubin menang: 4_6 bambu nunggu 5 = tunggu tengah, 1 macam ubin', () => {
  let s = G.reduce(G.initialState({ names: ['A', 'B', 'C', 'D'], rule: 'riichi' }), { type: 'start' });
  s = G.reduce(s, { type: 'declare', winner: 1, selfDrawn: false, discarder: 0 });
  const five = parse('5s')[0];
  s = G.reduce(s, { type: 'hand', seat: 1, tiles: parse('123456m78999p456s'), winTile: five });
  const r = G.scoreSeat(s, 1);
  assert.ok(!r.items.some((x) => x.label.startsWith('Pinfu'))); // kanchan -> bukan pinfu
  assert.equal(r.fu, 40); // 20 + 10 tertutup-ron + 2 tunggu tengah = 32 -> 40
  // tanpa ubin menang: pinfu dianggap boleh
  s = G.reduce(s, { type: 'hand', seat: 1, winTile: null });
  assert.ok(G.scoreSeat(s, 1).items.some((x) => x.label.startsWith('Pinfu')));
  // klasik: tunggu 1 macam ubin +2
  let k = G.reduce(G.initialState({ names: ['A', 'B', 'C', 'D'] }), { type: 'start' });
  k = G.reduce(k, { type: 'declare', winner: 1, selfDrawn: false, discarder: 0 });
  k = G.reduce(k, { type: 'hand', seat: 1, tiles: parse('123456m78999p456s'), winTile: five });
  assert.ok(G.scoreSeat(k, 1).items.some((x) => x.label.startsWith('Tunggu 1 macam')));
});

test('Riichi: pung dilengkapi buangan tidak membatalkan riichi, tapi pungnya dihitung terbuka', () => {
  let s = G.reduce(G.initialState({ names: ['A', 'B', 'C', 'D'], rule: 'riichi' }), { type: 'start' });
  s = G.reduce(s, { type: 'declare', winner: 1, selfDrawn: false, discarder: 0, extras: { riichi: true } });
  const t2 = parse('2p')[0];
  s = G.reduce(s, { type: 'hand', seat: 1, tiles: parse('222p555p888s345m77s'), winTile: t2 });
  const r = G.scoreSeat(s, 1);
  assert.ok(r.items.some((x) => x.label === 'Riichi'));
  // 3 pung tertutup jadi 2 karena 222p dari buangan -> tidak ada sanankou
  assert.ok(!r.items.some((x) => x.label.startsWith('Sanankou')));
});

console.log(`\nSemua ${n} tes lulus.`);
