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
    'too-soon': 'That race was not counted: races less than 20 seconds apart.',
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
    drawElo();
    if (TF.onAccount) TF.onAccount();
  }
  // ---- driver rating (one per class) ----
  var elo = null, ELO_NAMES = { tford: 'Model T', miata: 'Miata', gt3: 'GT3', lmp1: 'LMP1' };
  // a title for every rating level: the ones under 800 are jokes, from 800 up you earn your way to Immortal
  var TITLES = [[0, 'Lawn Mower Pilot'], [300, 'Gravel Trap Tourist'], [450, 'Professional Spinner'], [600, 'Tyre Wall Inspector'], [700, 'Sunday Driver'],
    [800, 'Rookie'], [900, 'Club Racer'], [1000, 'Racer'], [1100, 'Contender'], [1200, 'Podium Hunter'], [1300, 'Pro'], [1400, 'Ace'],
    [1500, 'Champion'], [1650, 'Legend'], [1800, 'Hall of Famer'], [2000, 'Immortal']];
  function titleFor(r) { var t = TITLES[0][1]; for (var i = 0; i < TITLES.length; i++) if (r >= TITLES[i][0]) t = TITLES[i][1]; return t; }
  TF.titleFor = titleFor;
  function drawElo() {
    var box = $('acElo'); if (!box) return;
    box.textContent = '';
    ['tford', 'miata', 'gt3', 'lmp1'].forEach(function (c) {
      var d = document.createElement('div'), a = document.createElement('span'), b = document.createElement('b'), t = document.createElement('em');
      a.textContent = ELO_NAMES[c]; b.textContent = elo ? String(Math.round(elo[c])) : '…'; t.textContent = elo ? titleFor(elo[c]) : '';
      d.appendChild(a); d.appendChild(b); d.appendChild(t); box.appendChild(d);
    });
  }
  function loadElo() {
    if (!auth) { elo = null; return Promise.resolve(null); }
    return api('/auth/elo', 'GET').then(function (r) { if (r.ok) { elo = r.r; drawElo(); } return elo; });
  }
  // a finished race: the server works out the new rating. res = { veh, n, p, laps, opp: [usernames] }
  function race(res) {
    if (!auth) return Promise.resolve(null);
    return api('/auth/race', 'POST', res).then(function (r) {
      if (!r.ok) return null;
      var before = r.r - r.d;
      if (titleFor(before) !== titleFor(r.r)) r.title = titleFor(r.r); // reached (or dropped to) a new title
      if (elo) elo[r.veh] = r.r; else loadElo();
      drawElo(); return r;
    });
  }
  // sent while the page is closing (leaving mid-race counts as last): keepalive lets it finish after the tab is gone
  function raceBeacon(res) {
    if (!auth) return;
    try { fetch(BASE + '/auth/race', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token }, body: JSON.stringify(res) }); } catch (e) { /* closing anyway */ }
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
      if (!adopt(r.data, true)) { syncBests(); loadElo(); }
    });
  }
  function logout() {
    var a = auth; push(); // one last save
    setTimeout(function () { api('/auth/logout', 'POST'); auth = null; elo = null; lsDel(AUTH_KEY); lsDel(DIRTY_KEY); refresh(); say('Logged out. Your game stays on this computer.'); }, 400);
  }

  // ---- global leaderboards ----
  var TABS = [['classic', 'tford', 'Model T', 'Classic speedway'], ['spa', 'miata', 'Miata', 'Spa-Francorchamps'], ['spa', 'gt3', 'GT3', 'Spa-Francorchamps'], ['spa', 'lmp1', 'LMP1', 'Spa-Francorchamps']];
  var lbOpen = false, lbTab = 1, lbSeq = 0, lbKind = 'lap';
  function fmtT(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
  function sendLap(track, veh, t) {
    if (!auth || typeof t !== 'number') return Promise.resolve(null);
    return api('/auth/lap', 'POST', { track: track, veh: veh, t: t }).then(function (r) {
      if (r.status === 401) { auth = null; lsDel(AUTH_KEY); refresh(); }
      return r.ok ? r : null;
    });
  }
  // a new personal best goes to the global list; the game calls this
  function lap(track, veh, t) {
    sendLap(track, veh, t).then(function (r) { if (r && r.rank && TF.toast) TF.toast('Global rank #' + r.rank, 'best'); });
  }
  // best laps already on this computer (or in the account's saved game) are sent too, so old records count
  function syncBests() {
    var s = null; try { s = JSON.parse(lsGet(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || !s.store) return;
    TABS.forEach(function (tb) { var e = s.store[tb[1]]; if (e && typeof e.best === 'number' && (e.track || 'classic') === tb[0]) sendLap(tb[0], tb[1], e.best); });
  }
  function drawBoard(rows, msg) {
    var box = $('lbRows'); box.textContent = '';
    if (!rows) { box.textContent = msg || ''; return; }
    if (!rows.length) { box.textContent = lbKind === 'elo' ? 'No ranked races yet. Log in, switch Ranked on and race!' : 'No laps yet. Log in and set the first one!'; return; }
    var me = auth ? auth.u.toLowerCase() : null;
    rows.forEach(function (r, i) {
      var d = document.createElement('div'); d.className = 'lb-row' + (me && r.n.toLowerCase() === me ? ' me' : '');
      var a = document.createElement('span'); a.textContent = (i + 1) + '.';
      var b = document.createElement('b'); b.textContent = r.n;
      if (lbKind === 'elo') { var tl = document.createElement('small'); tl.textContent = titleFor(r.r); b.appendChild(tl); }
      var c = document.createElement('em'); c.textContent = lbKind === 'elo' ? String(r.r) : fmtT(r.t);
      d.appendChild(a); d.appendChild(b); d.appendChild(c); box.appendChild(d);
    });
  }
  function loadBoard() {
    var tb = TABS[lbTab], seq = ++lbSeq;
    var tabs = document.querySelectorAll('#lbTabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-checked', i === lbTab ? 'true' : 'false');
    var kinds = document.querySelectorAll('#lbKind button');
    for (var k = 0; k < kinds.length; k++) kinds[k].setAttribute('aria-checked', kinds[k].dataset.kind === lbKind ? 'true' : 'false');
    $('lbTrack').textContent = lbKind === 'elo' ? 'Driver rating · ' + tb[2] : tb[3]; drawBoard(null, 'Loading...');
    api('/auth/board?' + (lbKind === 'elo' ? 'kind=elo&' : 'track=' + tb[0] + '&') + 'veh=' + tb[1], 'GET').then(function (r) {
      if (seq !== lbSeq) return;
      if (r.ok) drawBoard(r.rows); else drawBoard(null, MSG[r.err] || 'Could not load the list.');
    });
  }
  function openBoard() { lbOpen = true; TF.uiLock = true; $('board').hidden = false; loadBoard(); }
  function closeBoard() { lbOpen = false; TF.uiLock = false; $('board').hidden = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  function init() {
    if (!available) { $('btnAccount').hidden = true; $('btnBoard').hidden = true; return; }
    $('btnBoard').addEventListener('click', openBoard);
    $('lbBack').addEventListener('click', closeBoard);
    var tabs = document.querySelectorAll('#lbTabs button');
    for (var ti = 0; ti < tabs.length; ti++) (function (n) { tabs[n].addEventListener('click', function () { lbTab = n; loadBoard(); }); })(ti);
    document.querySelectorAll('#lbKind button').forEach(function (b) { b.addEventListener('click', function () { lbKind = b.dataset.kind; loadBoard(); }); });
    window.addEventListener('keydown', function (e) { if (lbOpen && e.code === 'Escape') { e.preventDefault(); closeBoard(); } });
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
      if (r.ok) { if (!adopt(r.data, false)) { syncBests(); loadElo(); } }
      else if (r.status === 401) { auth = null; lsDel(AUTH_KEY); refresh(); }
    });
  }
  TF.account = { queue: queue, lap: lap, race: race, raceBeacon: raceBeacon, loadElo: loadElo,
    ratings: function () { return elo; }, token: function () { return auth ? auth.token : null; }, available: available, user: function () { return auth ? auth.u : null; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
