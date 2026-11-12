// Sambungan ke server ruang. Perubahan langsung diterapkan di HP sendiri (supaya terasa cepat),
// lalu disamakan dengan state resmi dari server begitu siaran server datang.
import { reduce } from './game.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const SERVER = LOCAL ? 'http://localhost:8787' : 'https://mahjong-poin-server.mahjongpoin.workers.dev';
const WS_SERVER = SERVER.replace(/^http/, 'ws');

export async function createRoom(opts) {
  const res = await fetch(`${SERVER}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) });
  if (!res.ok) throw new Error('Gagal membuat ruang');
  return (await res.json()).code;
}

export async function visionInfo() {
  const res = await fetch(`${SERVER}/api/vision`);
  return res.json();
}

/** Kirim foto (data URL JPEG) ke server, balikannya { tiles: ['1m','E',...], model }. */
export async function readTiles(image, model) {
  let res;
  try {
    res = await fetch(`${SERVER}/api/read-tiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, model }) });
  } catch { throw new Error('Gagal mengirim foto. Cek internet lalu coba lagi.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Gagal membaca foto.');
  return data;
}

export async function roomExists(code) {
  const res = await fetch(`${SERVER}/api/rooms/${code}`);
  return res.ok;
}

/**
 * onState(state) dipanggil tiap state berubah; onStatus('online'|'offline'|'gone').
 */
export function connectRoom(code, clientId, { onState, onStatus }) {
  let ws = null, closed = false, retry = 0, seq = 0, server = null, pingTimer = null;
  let pending = []; // op yang sudah dikirim tapi belum dikonfirmasi server
  const queue = []; // op saat sedang terputus

  const view = () => pending.reduce((s, p) => reduce(s, p.op), server);

  function open() {
    ws = new WebSocket(`${WS_SERVER}/api/rooms/${code}/ws`);
    ws.onopen = () => {
      retry = 0;
      onStatus('online');
      // Setelah tersambung ulang, state server yang benar; buang op lama yang tidak jelas nasibnya.
      pending = pending.filter((p) => queue.some((q) => q.id === p.id));
      while (queue.length) ws.send(queue.shift().raw);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 25000);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'state') return;
      server = msg.state;
      if (msg.by) {
        const k = pending.findIndex((p) => p.id === msg.by);
        if (k >= 0) pending = pending.slice(k + 1);
      }
      onState(view());
    };
    ws.onclose = (e) => {
      clearInterval(pingTimer);
      if (closed) return;
      if (e.code === 4404) { onStatus('gone'); return; }
      onStatus('offline');
      setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
    };
  }
  open();

  return {
    send(op) {
      if (!server) return;
      const id = `${clientId}:${++seq}`;
      pending.push({ id, op });
      onState(view());
      const raw = JSON.stringify({ type: 'op', id, op });
      if (ws && ws.readyState === 1) ws.send(raw); else queue.push({ id, raw });
    },
    close() { closed = true; clearInterval(pingTimer); ws && ws.close(); },
  };
}
