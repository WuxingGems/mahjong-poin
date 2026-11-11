import * as classical from './classical.js';
import * as hongkong from './hongkong.js';

export const RULES = { classical, hongkong };

/** Aturan yang tampil di pilihan tapi belum jadi. */
export const COMING = [
  { id: 'riichi', name: 'Riichi Jepang (menyusul)' },
  { id: 'mcr', name: 'Chinese Official / MCR (menyusul)' },
];
