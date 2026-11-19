// T-Ford Speedway accounts: a username and a password, and a place to keep your saved game (colour, best laps, ghost...).
// This file only uses standard web APIs, so it also runs in a browser tab for testing; the Cloudflare wrapper is in index.js.
// What is stored: the username, a random salt and a slow hash of the password (never the password itself), login tokens and the saved game.

const ITER = 60000;                       // how many rounds of hashing; slow on purpose so guessing passwords is expensive
const TOKEN_DAYS = 30, MAX_TOKENS = 5, MAX_DATA = 1000000, CHUNK = 100000;
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const BOARDS = { 'classic:tford': 1, 'spa:miata': 1, 'spa:gt3': 1, 'spa:lmp1': 1 }; // circuit:car class
const MIN_LAP = 15, MAX_LAP = 900;      // seconds; anything outside this is not a real lap

// Driver rating (Elo), one per car class. A race is a set of duels against every other car in your class;
// AI cars count as a 1000-rated driver, real players with their own rating. See the plan page for the numbers.
const CLASSES = ['tford', 'miata', 'gt3', 'lmp1'], START_R = 1000, AI_R = 1000, ELO_K = 16, ELO_S = 550, FLOOR_R = 100;
async function ratings(storage, lower) {
  const r = (await storage.get('elo:' + lower)) || {}, out = {};
  for (const c of CLASSES) out[c] = typeof r[c] === 'number' ? r[c] : START_R;
  return out;
}
export function eloChange(R, opps, n, p, laps) { // opps: ratings of the real players among the n-1 opponents
  let exp = 0;
  for (let i = 0; i < n - 1; i++) exp += 1 / (1 + Math.pow(10, ((i < opps.length ? opps[i] : AI_R) - R) / ELO_S));
  const lf = Math.sqrt(Math.min(laps, 20) / 10);
  let d = ELO_K * lf * ((n - p) - exp) / Math.sqrt(n - 1);
  if (d > 0) d = Math.max(1, d); // a gain is never smaller than +1
  return d;
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
const err = (code, status = 400) => json({ err: code }, status);

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));
function randomHex(n) { return hex(crypto.getRandomValues(new Uint8Array(n))); }

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
}
function same(a, b) { // compares without stopping at the first difference
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function newToken(storage, lower) {
  const token = randomHex(32), list = (await storage.get('tl:' + lower)) || [];
  await storage.put('tok:' + token, { u: lower, exp: Date.now() + TOKEN_DAYS * 86400000 });
  list.push(token);
  while (list.length > MAX_TOKENS) await storage.delete('tok:' + list.shift());
  await storage.put('tl:' + lower, list);
  return token;
}
async function userFromToken(storage, request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const t = await storage.get('tok:' + m[1]);
  if (!t || t.exp < Date.now()) return null;
  return { lower: t.u, token: m[1] };
}
async function readData(storage, lower) {
  const n = await storage.get('dn:' + lower); if (!n) return null;
  let s = ''; for (let i = 0; i < n; i++) s += (await storage.get('d:' + lower + ':' + i)) || '';
  return s;
}
async function writeData(storage, lower, text) {
  const old = (await storage.get('dn:' + lower)) || 0, n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) await storage.put('d:' + lower + ':' + i, text.slice(i * CHUNK, (i + 1) * CHUNK));
  for (let i = n; i < old; i++) await storage.delete('d:' + lower + ':' + i);
  await storage.put('dn:' + lower, n);
}

export async function handleAuth(storage, request, ip) {
  const path = new URL(request.url).pathname;
  const post = request.method === 'POST', put = request.method === 'PUT', get = request.method === 'GET';

  if ((path === '/auth/register' || path === '/auth/login') && post) {
    let b; try { b = await request.json(); } catch (e) { return err('bad-request'); }
    const name = typeof b.u === 'string' ? b.u.trim() : '', pw = typeof b.p === 'string' ? b.p : '';
    if (!NAME_RE.test(name)) return err('bad-name');
    if (pw.length < 6 || pw.length > 100) return err('bad-password');
    const lower = name.toLowerCase();

    if (path === '/auth/register') {
      const day = new Date().toISOString().slice(0, 10), rk = 'reg:' + ip + ':' + day, count = (await storage.get(rk)) || 0;
      if (count >= 8) return err('too-many', 429);
      if (await storage.get('u:' + lower)) return err('taken', 409);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await storage.put('u:' + lower, { name, salt: hex(salt), hash: hex(await hashPassword(pw, salt)), created: Date.now() });
      await storage.put(rk, count + 1);
      return json({ ok: 1, user: name, token: await newToken(storage, lower), data: null });
    }

    // login: after 5 wrong passwords in a row the account waits a minute
    const lk = 'lock:' + lower, lock = (await storage.get(lk)) || { n: 0, until: 0 };
    if (lock.until > Date.now()) return err('locked', 429);
    const user = await storage.get('u:' + lower);
    const salt = user ? unhex(user.salt) : new Uint8Array(16), h = await hashPassword(pw, salt); // (a hash is computed even for unknown names, so timing gives nothing away)
    if (!user || !same(h, unhex(user.hash))) {
      lock.n += 1; if (lock.n >= 5) { lock.until = Date.now() + 60000; lock.n = 0; }
      await storage.put(lk, lock);
      return err('wrong', 401);
    }
    if (lock.n || lock.until) await storage.delete(lk);
    return json({ ok: 1, user: user.name, token: await newToken(storage, lower), data: await readData(storage, lower) });
  }

  if (path === '/auth/data') {
    const who = await userFromToken(storage, request);
    if (!who) return err('auth', 401);
    if (get) return json({ ok: 1, data: await readData(storage, who.lower) });
    if (put) {
      let b; try { b = await request.json(); } catch (e) { return err('bad-request'); }
      if (typeof b.data !== 'string' || b.data.length > MAX_DATA) return err('too-big', 413);
      await writeData(storage, who.lower, b.data);
      return json({ ok: 1 });
    }
  }

  // Global leaderboards: one list per car class on its circuit (the best lap of each player; top 100 kept).
  if (path === '/auth/board' && get && new URL(request.url).searchParams.get('kind') === 'elo') {
    const veh = new URL(request.url).searchParams.get('veh');
    if (CLASSES.indexOf(veh) < 0) return err('bad-board');
    const rows = (await storage.get('eb:' + veh)) || [];
    return json({ ok: 1, rows: rows.slice(0, 50).map((r) => ({ n: r.n, r: Math.round(r.r) })) });
  }
  if (path === '/auth/elo' && get) {
    const who = await userFromToken(storage, request);
    if (!who) return err('auth', 401);
    return json({ ok: 1, r: await ratings(storage, who.lower) });
  }
  if (path === '/auth/race' && post) {
    const who = await userFromToken(storage, request);
    if (!who) return err('auth', 401);
    let b; try { b = await request.json(); } catch (e) { return err('bad-request'); }
    const veh = b.veh, n = b.n, p = b.p, laps = b.laps, opp = Array.isArray(b.opp) ? b.opp : [];
    const int = (v, a, c) => Number.isInteger(v) && v >= a && v <= c;
    if (CLASSES.indexOf(veh) < 0 || !int(n, 3, 40) || !int(p, 1, n) || !int(laps, 1, 50) || opp.length > Math.min(9, n - 1)) return err('bad-race');
    const now = Date.now(), lastK = 'elot:' + who.lower, last = (await storage.get(lastK)) || 0;
    if (now - last < 20000) return err('too-soon', 429); // one result per race, not a stream of them
    const all = await ratings(storage, who.lower), R = all[veh], seen = {}, oppR = [];
    for (const nm of opp) {
      if (typeof nm !== 'string') continue;
      const l = nm.toLowerCase(); if (l === who.lower || seen[l]) continue; seen[l] = 1;
      oppR.push((await storage.get('u:' + l)) ? (await ratings(storage, l))[veh] : AI_R);
    }
    const d = eloChange(R, oppR, n, p, laps), nr = Math.round(Math.max(FLOOR_R, R + d) * 10) / 10;
    all[veh] = nr;
    await storage.put('elo:' + who.lower, all); await storage.put(lastK, now);
    const bk = 'eb:' + veh, rows = ((await storage.get(bk)) || []).filter((r) => r.u !== who.lower), user = await storage.get('u:' + who.lower);
    rows.push({ u: who.lower, n: user ? user.name : who.lower, r: nr });
    rows.sort((a, c) => c.r - a.r); if (rows.length > 100) rows.length = 100;
    await storage.put(bk, rows);
    return json({ ok: 1, veh, r: nr, d: Math.round((nr - R) * 10) / 10 });
  }
  if (path === '/auth/board' && get) {
    const q = new URL(request.url).searchParams, key = q.get('track') + ':' + q.get('veh');
    if (!BOARDS[key]) return err('bad-board');
    const rows = (await storage.get('lb:' + key)) || [];
    return json({ ok: 1, rows: rows.slice(0, 50).map((r) => ({ n: r.n, t: r.t })) });
  }
  if (path === '/auth/lap' && post) {
    const who = await userFromToken(storage, request);
    if (!who) return err('auth', 401);
    let b; try { b = await request.json(); } catch (e) { return err('bad-request'); }
    const key = b.track + ':' + b.veh;
    if (!BOARDS[key] || typeof b.t !== 'number' || !(b.t >= MIN_LAP && b.t <= MAX_LAP)) return err('bad-lap');
    const t = Math.round(b.t * 100) / 100, bk = 'lb:' + key, rows = (await storage.get(bk)) || [];
    const mine = rows.findIndex((r) => r.u === who.lower);
    if (mine < 0 || t < rows[mine].t) {
      const user = await storage.get('u:' + who.lower);
      if (mine >= 0) rows.splice(mine, 1);
      rows.push({ u: who.lower, n: user ? user.name : who.lower, t });
      rows.sort((a, c) => a.t - c.t);
      if (rows.length > 100) rows.length = 100;
      await storage.put(bk, rows);
    }
    return json({ ok: 1, rank: rows.findIndex((r) => r.u === who.lower) + 1 });
  }

  if (path === '/auth/logout' && post) {
    const who = await userFromToken(storage, request);
    if (who) {
      await storage.delete('tok:' + who.token);
      const list = ((await storage.get('tl:' + who.lower)) || []).filter((t) => t !== who.token);
      await storage.put('tl:' + who.lower, list);
    }
    return json({ ok: 1 });
  }
  return err('not-found', 404);
}
