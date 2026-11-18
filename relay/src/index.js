// T-Ford Speedway relay: a tiny program on Cloudflare that passes car positions between players.
// Every player connects here (a WebSocket, which works through home routers); each game code gets its own
// "room" (a Durable Object) that forwards each player's messages to everyone else in the same room.
import { DurableObject } from 'cloudflare:workers';
import { handleAuth } from './accounts.js';

const MAX_PLAYERS = 9;

// Accounts: one Durable Object keeps every username, password hash and saved game (see accounts.js).
export class Accounts extends DurableObject {
  async fetch(request) { return handleAuth(this.ctx.storage, request, request.headers.get('CF-Connecting-IP') || 'unknown'); }
}

export class Room extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const isHost = url.searchParams.get('host') === '1';
    const socks = this.ctx.getWebSockets();
    const hostHere = socks.some((ws) => (ws.deserializeAttachment() || {}).host);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    let err = null;
    if (isHost && hostHere) err = 'unavailable-id';            // that code is already in use
    else if (!isHost && !hostHere) err = 'peer-unavailable';   // nobody is hosting this code
    else if (socks.length >= MAX_PLAYERS) err = 'full';
    if (err) {
      server.accept();
      server.send(JSON.stringify({ err }));
      server.close(1000, err);
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, host: isHost });
    server.send(JSON.stringify({ hello: id }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4000) return;
    let d;
    try { d = JSON.parse(message); } catch (e) { return; }
    if (!d || !d.p || typeof d.p !== 'object') return;
    const me = ws.deserializeAttachment() || {};
    this.toOthers(ws, JSON.stringify({ id: me.id, p: d.p }));
  }

  webSocketClose(ws) { this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const me = ws.deserializeAttachment() || {};
    if (me.host) {
      // the host left: tell everyone and close the room
      for (const o of this.ctx.getWebSockets()) if (o !== ws) { try { o.send('{"hostLeft":1}'); o.close(1000, 'host left'); } catch (e) { /* already gone */ } }
    } else {
      this.toOthers(ws, JSON.stringify({ left: me.id }));
    }
    try { ws.close(1000, 'bye'); } catch (e) { /* already closed */ }
  }

  toOthers(ws, text) {
    for (const o of this.ctx.getWebSockets()) if (o !== ws) { try { o.send(text); } catch (e) { /* one lost message is fine */ } }
  }
}

function originOk(origin) {
  if (!origin || origin === 'null') return true;             // the game opened as a file on someone's computer
  try {
    const h = new URL(origin).hostname;
    return h === 'tford-speedway.pages.dev' || h.endsWith('.tford-speedway.pages.dev') || h === 'localhost' || h === '127.0.0.1';
  } catch (e) { return false; }
}

function withCors(resp, origin) {
  const r = new Response(resp.body, resp);
  r.headers.set('Access-Control-Allow-Origin', origin || '*');
  r.headers.set('Vary', 'Origin');
  r.headers.set('Cache-Control', 'no-store');
  return r;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/auth/')) { // log in / create account / saved game
      const origin = request.headers.get('Origin');
      if (!originOk(origin)) return new Response('Not allowed', { status: 403 });
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' } });
      }
      return withCors(await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main')).fetch(request), origin);
    }
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{5})$/);
    if (!m) return new Response('T-Ford Speedway relay is running.', { headers: { 'Content-Type': 'text/plain' } });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!originOk(request.headers.get('Origin'))) return new Response('Not allowed', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
  }
};
