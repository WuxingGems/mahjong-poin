// Server ruang permainan: tiap ruang = satu Durable Object yang menyimpan state permainan
// dan menyiarkannya ke semua HP yang tersambung lewat WebSocket.
// Logika permainan (reduce) SAMA PERSIS dengan yang dipakai di HP: ../../js/game.js
import { DurableObject } from 'cloudflare:workers';
import { initialState, reduce } from '../../js/game.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // tanpa I, L, O, 0, 1 supaya tidak tertukar
const ROOM_TTL_MS = 7 * 24 * 3600 * 1000; // ruang dihapus 7 hari setelah aktivitas terakhir
const ALLOWED_ORIGINS = ['https://wuxinggems.github.io', 'http://localhost:5810', 'http://127.0.0.1:5810'];

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

function corsHeaders(req) {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      for (let i = 0; i < 8; i++) {
        const code = randomCode();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        if ((await room.init(body)).ok) return json(req, { code });
      }
      return json(req, { error: 'Gagal membuat ruang, coba lagi.' }, 500);
    }

    const ws = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})\/ws$/);
    if (ws) {
      if (req.headers.get('Upgrade') !== 'websocket') return json(req, { error: 'Perlu WebSocket' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(ws[1])).fetch(req);
    }

    const check = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4})$/);
    if (check) {
      const exists = await env.ROOMS.get(env.ROOMS.idFromName(check[1])).exists();
      return json(req, { exists }, exists ? 200 : 404);
    }

    return json(req, { app: 'mahjong-poin-server', ok: true });
  },
};

export class Room extends DurableObject {
  async init(opts = {}) {
    if (await this.ctx.storage.get('state')) return { ok: false };
    const state = initialState({ rule: opts.rule, settings: opts.settings });
    await this.ctx.storage.put('state', state);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return { ok: true };
  }

  async exists() {
    return !!(await this.ctx.storage.get('state'));
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const state = await this.ctx.storage.get('state');
    if (!state) server.close(4404, 'Ruang tidak ditemukan');
    else server.send(JSON.stringify({ type: 'state', state }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'ping') { ws.send('{"type":"pong"}'); return; }
    if (msg.type !== 'op' || !msg.op || typeof msg.op.type !== 'string') return;
    const state = await this.ctx.storage.get('state');
    if (!state) { ws.close(4404, 'Ruang tidak ditemukan'); return; }
    const next = reduce(state, msg.op);
    await this.ctx.storage.put('state', next);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    const out = JSON.stringify({ type: 'state', state: next, by: msg.id || null });
    for (const sock of this.ctx.getWebSockets()) {
      try { sock.send(out); } catch { /* HP terputus */ }
    }
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* sudah tertutup */ }
  }

  async alarm() {
    for (const sock of this.ctx.getWebSockets()) sock.close(4404, 'Ruang sudah kedaluwarsa');
    await this.ctx.storage.deleteAll();
  }
}
