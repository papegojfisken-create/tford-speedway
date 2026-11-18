// T-Ford Speedway accounts: a username and a password, and a place to keep your saved game (colour, best laps, ghost...).
// This file only uses standard web APIs, so it also runs in a browser tab for testing; the Cloudflare wrapper is in index.js.
// What is stored: the username, a random salt and a slow hash of the password (never the password itself), login tokens and the saved game.

const ITER = 60000;                       // how many rounds of hashing; slow on purpose so guessing passwords is expensive
const TOKEN_DAYS = 30, MAX_TOKENS = 5, MAX_DATA = 1000000, CHUNK = 100000;
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

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
