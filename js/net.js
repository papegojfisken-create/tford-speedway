// Multiplayer connection. When the game runs as a Claude artifact, everyone who has the page open shares a "room".
// Each player keeps one small "presence" object up to date (where their car is); the platform passes it to the others.
// Opened as a plain file there is no room, and the game is single-player.
(function () {
  var TF = window.TF;
  var net = TF.net = { room: null, status: 'solo' };

  // Stand-in room for testing on one computer: two browser tabs opened with ?mock in the address see each other.
  function mockRoom() {
    var id = 'm' + Math.random().toString(36).slice(2, 10), ch = new BroadcastChannel('tford-mock'), pres = {}, others = {};
    function frz(o) { return Object.freeze(JSON.parse(JSON.stringify(o))); }
    var mine = frz({});
    ch.onmessage = function (e) {
      var m = e.data; if (m.bye) { delete others[m.id]; return; }
      others[m.id] = { peer: m.id, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: frz(m.p), updatedAt: Date.now() };
    };
    window.addEventListener('pagehide', function () { ch.postMessage({ bye: 1, id: id }); });
    return {
      presence: function (patch) {
        for (var k in patch) { if (patch[k] === null) delete pres[k]; else pres[k] = patch[k]; }
        mine = frz(pres); ch.postMessage({ id: id, p: pres }); return Promise.resolve();
      },
      peers: function () {
        var a = [{ peer: id, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }], now = Date.now();
        for (var k in others) { if (now - others[k].updatedAt > 4000) delete others[k]; else a.push(others[k]); }
        return a;
      },
      connected: function () { return true; }
    };
  }

  function drop() { net.room = null; net.status = 'solo'; }
  if (!window.claude && location.search.indexOf('mock') >= 0 && window.BroadcastChannel) { net.room = mockRoom(); net.status = 'online'; }
  else if (window.claude && window.claude.use) {
    net.status = 'connecting';
    window.claude.use('room').then(function (r) {
      if (!r) { drop(); return; }
      net.room = r; net.status = 'online';
      if (r.onPeers) r.onPeers(function () { }, drop); // the error callback fires once if this viewer cannot be connected
    }).catch(drop);
  }

  // ---------- room codes: online play for when the game is NOT running as an artifact ----------
  // One player hosts and gets a short code; the others type it in. Everyone connects to a small relay program on
  // Cloudflare (relay/ in this project), which passes each player's car position on to the others in the same room.
  // This works through home routers, unlike a direct computer-to-computer connection.
  var RELAY = 'wss://tford-relay.papegojfisken.workers.dev';
  net.canCode = !window.claude && !!window.WebSocket; // artifacts do not allow this kind of connection
  net.code = null;
  function frz(o) { return Object.freeze(JSON.parse(JSON.stringify(o))); }
  function codeRoom(myId, others, sendOut) {
    var pres = {}, mine = frz({});
    return {
      presence: function (patch) {
        for (var k in patch) { if (patch[k] === null) delete pres[k]; else pres[k] = patch[k]; }
        mine = frz(pres); sendOut(pres); return Promise.resolve();
      },
      peers: function () {
        var a = [{ peer: myId, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }], now = Date.now();
        for (var k in others) { if (now - others[k].at > 5000) delete others[k]; else a.push({ peer: k, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: true, presence: others[k].p, updatedAt: others[k].at }); }
        return a;
      },
      connected: function () { return true; }
    };
  }
  // connect to the relay room for this code; cb(error) or cb(null)
  function relayRoom(code, asHost, cb, query) {
    var ws, others = {}, done = false, live = false;
    function finish(e) { if (!done) { done = true; clearTimeout(timer); cb(e); } }
    var timer = setTimeout(function () { try { ws.close(); } catch (e) { /* fine */ } finish('timeout'); }, 12000);
    try { ws = new WebSocket(RELAY + '/room/' + code + (asHost ? '?host=1' : query || '')); } catch (e) { return finish('load'); }
    function lost() {
      if (!live) return; live = false;
      net.code = null; drop(); if (net.onLost) net.onLost();
    }
    ws.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (!d || typeof d !== 'object') return;
      if (d.err) { finish(d.err); return; }
      if (d.hello) {
        live = true; net.code = code; net.status = 'online';
        net.room = codeRoom(String(d.hello), others, function (pres) { if (ws.readyState === 1) { try { ws.send(JSON.stringify({ p: pres })); } catch (e) { /* one lost message is fine */ } } });
        finish(null); return;
      }
      if (d.id && d.p && typeof d.p === 'object') others[d.id] = { p: frz(d.p), at: Date.now() };
      else if (d.left) delete others[d.left];
      else if (d.hostLeft) lost();
    };
    ws.onerror = function () { finish('load'); };
    ws.onclose = function () { finish('load'); lost(); };
  }
  // cb(error) or cb(null, code)
  net.hostGame = function (cb) {
    var code = '', abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (var i = 0; i < 5; i++) code += abc[Math.floor(Math.random() * abc.length)];
    relayRoom(code, true, function (err) { if (err) cb(err); else cb(null, code); });
  };
  // cb(error) or cb(null)
  net.joinGame = function (code, cb, query) { // query: extra '?...' for the ranked public server (login token and class)
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return cb('code');
    relayRoom(code, false, cb, query);
  };
  // the two public servers: always open, fixed settings (see relay/src/index.js)
  net.PUBLIC = { PUBLC: { name: 'Spa Open', ranked: false }, RANKD: { name: 'Spa Ranked', ranked: true, min: 1250 } };
  net.status_url = RELAY.replace('wss:', 'https:') + '/status';

  // send my state; failures are normal (not connected yet, not allowed) and must never break the game
  net.send = function (obj) {
    if (!net.room) return;
    try { var p = net.room.presence(obj); if (p && p.catch) p.catch(function (e) { if (e && (e.code === 'not_granted' || e.code === 'revoked' || e.code === 'capability_disabled' || e.code === 'capability_removed')) drop(); }); }
    catch (e) { /* ignore */ }
  };
  net.peers = function () { if (!net.room) return []; try { return net.room.peers() || []; } catch (e) { return []; } };
})();
