// Log in on the start screen (username and password only) so your saved game follows you to any computer.
// The accounts live on the same Cloudflare program as online play (relay/src/accounts.js). Nothing but the username, a hash of the password
// and the saved game (colour, number, settings, best laps and ghosts) is stored there.
(function () {
  var TF = window.TF = window.TF || {};
  var BASE = 'https://tford-relay.papegojfisken.workers.dev', AUTH_KEY = 'tford-auth', SAVE_KEY = 'tford-speedway-v2', DIRTY_KEY = 'tford-dirty';
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }

  var auth = null; try { auth = JSON.parse(lsGet(AUTH_KEY) || 'null'); } catch (e) { auth = null; }
  if (auth && (typeof auth.token !== 'string' || typeof auth.u !== 'string')) auth = null;
  var available = !window.claude && typeof fetch === 'function'; // the Claude artifact viewer does not allow connections to other servers
  var timer = null, busy = false;

  var MSG = {
    'bad-name': 'The username needs 3 to 20 letters, numbers or _ (no spaces).',
    'bad-password': 'The password needs 6 to 100 characters.',
    'taken': 'That username is already taken. Pick another one.',
    'wrong': 'Wrong username or password.',
    'locked': 'Too many wrong tries. Wait a minute and try again.',
    'too-many': 'Too many new accounts from this connection today. Try again tomorrow.',
    'too-big': 'Your saved game is too big to store.',
    'network': 'Could not reach the server. Check the internet and try again.',
    'not-found': 'The account service is not switched on yet. Try again later.'
  };

  function api(path, method, body) {
    var h = { 'Content-Type': 'application/json' }; if (auth) h.Authorization = 'Bearer ' + auth.token;
    return fetch(BASE + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().then(function (j) { j.status = r.status; return j; }, function () { return { err: 'not-found', status: r.status }; });
    }, function () { return { err: 'network', status: 0 }; });
  }

  // ---- the panel ----
  var open = false;
  function say(text, bad) { var m = $('acMsg'); m.textContent = text || ''; m.className = 'ac-msg' + (bad ? ' bad' : ''); }
  function refresh() {
    $('btnAccount').textContent = auth ? auth.u : 'Log in';
    $('acOut').hidden = !auth; $('acIn').hidden = !!auth;
    if (auth) $('acName').textContent = auth.u;
  }
  function openPanel() { open = true; TF.uiLock = true; say(''); refresh(); $('account').hidden = false; var f = auth ? $('acLogout') : $('acUser'); if (f) f.focus(); }
  function closePanel() { open = false; TF.uiLock = false; $('account').hidden = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  // ---- keeping the saved game in step ----
  function push() {
    if (!auth) return;
    var data = lsGet(SAVE_KEY); if (!data) return;
    api('/auth/data', 'PUT', { data: data }).then(function (r) {
      if (r.ok) lsDel(DIRTY_KEY);
      else if (r.status === 401) { auth = null; lsDel(AUTH_KEY); refresh(); }
    });
  }
  // the game calls this every time it saves; the account copy follows a few seconds later
  function queue() {
    if (!auth) return;
    lsSet(DIRTY_KEY, '1');
    clearTimeout(timer); timer = setTimeout(push, 4000);
  }
  // a login (or opening the game while logged in) with a saved game on the server: use it, unless this computer has newer changes
  function adopt(serverData, fromLogin) {
    var local = lsGet(SAVE_KEY);
    if (serverData && serverData !== local && (fromLogin || !lsGet(DIRTY_KEY))) { lsSet(SAVE_KEY, serverData); lsDel(DIRTY_KEY); location.reload(); return true; }
    if (!serverData || lsGet(DIRTY_KEY)) push(); // a new account, or newer changes here: send this computer's game up
    return false;
  }

  function submit(create) {
    if (busy) return;
    var u = $('acUser').value.trim(), p = $('acPass').value;
    if (!u || !p) { say('Type a username and a password.', true); return; }
    busy = true; say(create ? 'Creating the account...' : 'Logging in...');
    $('acLogin').disabled = $('acCreate').disabled = true;
    api(create ? '/auth/register' : '/auth/login', 'POST', { u: u, p: p }).then(function (r) {
      busy = false; $('acLogin').disabled = $('acCreate').disabled = false;
      if (!r.ok) { say(MSG[r.err] || 'That did not work (' + (r.err || r.status) + ').', true); return; }
      auth = { u: r.user, token: r.token }; lsSet(AUTH_KEY, JSON.stringify(auth)); $('acPass').value = '';
      refresh(); say(create ? 'Account created. Your game is saved to it from now on.' : 'Logged in.');
      adopt(r.data, true);
    });
  }
  function logout() {
    var a = auth; push(); // one last save
    setTimeout(function () { api('/auth/logout', 'POST'); auth = null; lsDel(AUTH_KEY); lsDel(DIRTY_KEY); refresh(); say('Logged out. Your game stays on this computer.'); }, 400);
  }

  function init() {
    if (!available) { $('btnAccount').hidden = true; return; }
    $('btnAccount').addEventListener('click', openPanel);
    $('acBack').addEventListener('click', closePanel);
    $('acLogin').addEventListener('click', function () { submit(false); });
    $('acCreate').addEventListener('click', function () { submit(true); });
    $('acIn').addEventListener('submit', function (e) { e.preventDefault(); submit(false); });
    $('acLogout').addEventListener('click', logout);
    ['acUser', 'acPass'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { e.stopPropagation(); }); }); // typing must never drive the car
    window.addEventListener('keydown', function (e) { if (open && e.code === 'Escape') { e.preventDefault(); closePanel(); } });
    refresh();
    if (auth) api('/auth/data', 'GET').then(function (r) {
      if (r.ok) adopt(r.data, false);
      else if (r.status === 401) { auth = null; lsDel(AUTH_KEY); refresh(); }
    });
  }
  TF.account = { queue: queue, available: available, user: function () { return auth ? auth.u : null; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
