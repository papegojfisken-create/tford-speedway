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

  // ---------- room codes: direct connection between computers, for when the game is NOT running as an artifact ----------
  // One player hosts and gets a short code; the others type it in. The free PeerJS service is used only to help the
  // computers find each other; after that the car positions travel directly between them (WebRTC).
  net.canCode = !window.claude && !!window.RTCPeerConnection; // artifacts do not allow this kind of connection
  net.code = null;
  function frz(o) { return Object.freeze(JSON.parse(JSON.stringify(o))); }
  // Relay (TURN) servers from the website (functions/api/turn.js) for players whose routers block direct connections.
  // If the site has none (a local test server, a plain file), PeerJS's own defaults are used.
  var iceOpts = null;
  function getIce(done) {
    if (iceOpts !== null || location.protocol.indexOf('http') !== 0 || !window.fetch) return done();
    var finished = false, t = setTimeout(function () { if (!finished) { finished = true; iceOpts = {}; done(); } }, 5000);
    fetch('/api/turn', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      iceOpts = d && Array.isArray(d.iceServers) && d.iceServers.length ? { config: { iceServers: d.iceServers } } : {};
    }).catch(function () { iceOpts = {}; }).then(function () { if (!finished) { finished = true; clearTimeout(t); done(); } });
  }
  function loadPeer(done) {
    getIce(function () {
      if (window.Peer) return done();
      var s = document.createElement('script'); s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = function () { done(window.Peer ? null : 'load'); }; s.onerror = function () { done('load'); };
      document.head.appendChild(s);
    });
  }
  net.relay = function () { return !!(iceOpts && iceOpts.config); };
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
  // cb(error) or cb(null, code)
  net.hostGame = function (cb) {
    loadPeer(function (err) {
      if (err) return cb('load');
      var code = '', abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (var i = 0; i < 5; i++) code += abc[Math.floor(Math.random() * abc.length)];
      var myId = 'tford-' + code, others = {}, conns = [], done = false, peer = new window.Peer(myId, iceOpts || {});
      peer.on('open', function () {
        done = true; net.code = code; net.status = 'online';
        // the host passes everyone's position on to everyone else
        net.room = codeRoom(myId, others, function (pres) {
          var table = {}; table[myId] = pres; for (var k in others) table[k] = others[k].p;
          for (var j = 0; j < conns.length; j++) if (conns[j].open) { try { conns[j].send({ all: table }); } catch (e) { /* one dropped message is fine */ } }
        });
        cb(null, code);
      });
      peer.on('connection', function (c) {
        conns.push(c);
        c.on('data', function (d) { if (d && d.p && typeof d.p === 'object') others[c.peer] = { p: frz(d.p), at: Date.now() }; });
        c.on('close', function () { delete others[c.peer]; conns = conns.filter(function (x) { return x !== c; }); });
      });
      peer.on('error', function (e) { if (!done) { done = true; cb(e && e.type || 'error'); } });
    });
  };
  // cb(error) or cb(null)
  net.joinGame = function (code, cb) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return cb('code');
    loadPeer(function (err) {
      if (err) return cb('load');
      var others = {}, done = false, peer = new window.Peer(iceOpts || {});
      function finish(e) { if (!done) { done = true; cb(e); } }
      var timer = setTimeout(function () { finish('timeout'); }, 25000); // going through the relay can take a little longer
      peer.on('open', function (id) {
        var c = peer.connect('tford-' + code);
        c.on('open', function () {
          clearTimeout(timer); net.code = code; net.status = 'online';
          net.room = codeRoom(id, others, function (pres) { if (c.open) { try { c.send({ p: pres }); } catch (e) { /* fine */ } } });
          finish(null);
        });
        c.on('data', function (d) {
          if (!d || !d.all || typeof d.all !== 'object') return;
          var seen = {}, k;
          for (k in d.all) { if (k === id || !d.all[k] || typeof d.all[k] !== 'object') continue; others[k] = { p: frz(d.all[k]), at: Date.now() }; seen[k] = 1; }
          for (k in others) if (!seen[k]) delete others[k];
        });
        c.on('close', function () { net.code = null; drop(); if (net.onLost) net.onLost(); });
      });
      peer.on('error', function (e) { clearTimeout(timer); finish(e && e.type || 'error'); });
    });
  };

  // send my state; failures are normal (not connected yet, not allowed) and must never break the game
  net.send = function (obj) {
    if (!net.room) return;
    try { var p = net.room.presence(obj); if (p && p.catch) p.catch(function (e) { if (e && (e.code === 'not_granted' || e.code === 'revoked' || e.code === 'capability_disabled' || e.code === 'capability_removed')) drop(); }); }
    catch (e) { /* ignore */ }
  };
  net.peers = function () { if (!net.room) return []; try { return net.room.peers() || []; } catch (e) { return []; } };
})();
