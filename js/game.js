// Main game: input, lap timer, ghost car, cameras, HUD, menus.
(function () {
  var TF = window.TF, T = THREE, K = TF.Track, LAP = K.LAP;
  var COLORS = [['Black', 0x0e0e0f], ['Brewster green', 0x1f3d2b], ['Maroon', 0x6b1420], ['Royal blue', 0x16306b], ['Cream', 0xd8c9a0], ['Fire red', 0xb3201a]];
  var SAVE_KEY = 'tford-speedway-v2', RATE = 30, START_S = K.START; // v2: new track layout, old best laps do not apply
  function $(id) { return document.getElementById(id); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function fmt(t) { if (t == null) return '-:--.--'; var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }

  // ---------- saved data (paint colour, best lap and its ghost) ----------
  var MAX_AI = 8;
  var save = { color: 0, best: null, ghost: null, ai: 3 };
  try {
    var raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (raw.ai >= 0 && raw.ai <= MAX_AI) save.ai = raw.ai | 0;
      if (raw.color >= 0 && raw.color < COLORS.length) save.color = raw.color | 0;
      if (typeof raw.best === 'number' && raw.ghost && Array.isArray(raw.ghost.x) && raw.ghost.x.length > 10 && Array.isArray(raw.ghost.q)) { save.best = raw.best; save.ghost = raw.ghost; }
    }
  } catch (e) { /* no saved data */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ } }

  // ---------- renderer and scene ----------
  var renderer;
  try { renderer = new T.WebGLRenderer({ canvas: $('view'), antialias: true }); }
  catch (e) { TF.fatal('This browser could not start 3D graphics (WebGL). Try a current version of Chrome, Edge or Firefox.'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  var world = TF.buildWorld(renderer), scene = world.scene;
  var cam = new T.PerspectiveCamera(55, 1, 0.5, 7000);
  function resize() { var w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();

  var car = TF.buildCar(COLORS[save.color][1], false), body = car.userData.body; scene.add(car);
  var ghostCar = TF.buildCar(0, true); ghostCar.visible = false; scene.add(ghostCar);
  var phys = new TF.Physics(world.colliders), fx = new TF.Effects(scene), sound = new TF.Sound();
  var me = { mesh: car, body: body, phys: phys, spin: 0 };

  // ---------- AI drivers ----------
  // lane: where the driver likes to run (d). power: engine strength. pace: how close to the ideal corner speed they dare go.
  var AI_SPEC = [
    // every AI car has the same engine as the player; pace differs only slightly so they do not run as one clump
    { lane: -1.0, power: 1, pace: 0.98, num: 3 }, { lane: 0.5, power: 1, pace: 0.97, num: 12 },
    { lane: -1.5, power: 1, pace: 0.97, num: 5 }, { lane: -0.5, power: 1, pace: 0.96, num: 21 },
    { lane: 1.5, power: 1, pace: 0.97, num: 9 }, { lane: 0.0, power: 1, pace: 0.98, num: 14 },
    { lane: 1.0, power: 1, pace: 0.96, num: 2 }, { lane: 0.2, power: 1, pace: 0.97, num: 18 }
  ];
  var ais = [], mapSvg = $('mapGhost').parentNode;
  function placeAis() {
    ais.forEach(function (a, i) { a.phys.place(START_S + 9 * (Math.floor(i / 2) + 1), i % 2 ? 2.2 : -2.2); a.lane = a.phys.loc.d; a.stuck = 0; });
  }
  // fromNet: the count comes from the host of an online game, so it is not saved as your own choice
  function setAiCount(n, fromNet) {
    n = clamp(n | 0, 0, MAX_AI); if (!fromNet) { save.ai = n; persist(); }
    while (ais.length > n) { var old = ais.pop(); scene.remove(old.mesh); old.dot.remove(); }
    while (ais.length < n) {
      var i = ais.length, sp = AI_SPEC[i], mesh = TF.buildCar(COLORS[(i + 1) % COLORS.length][1], false, sp.num);
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '8'); dot.setAttribute('fill', '#fff8ea'); dot.setAttribute('opacity', '.85');
      mapSvg.insertBefore(dot, $('mapGhost'));
      var a = { mesh: mesh, body: mesh.userData.body, phys: new TF.Physics(world.colliders), spin: 0, spec: sp, lane: sp.lane, stuck: 0, dot: dot, inp: { thr: false, brk: false, hand: false, steer: 0 } };
      a.phys.power = sp.power; scene.add(mesh); ais.push(a);
    }
    placeAis();
    $('aiCount').value = n; $('aiLabel').textContent = n;
  }
  // The AI copies your best lap. From the ghost we keep, for every metre of the lap, where you were across the
  // track and how fast you were going. Without a best lap yet, the AI uses the track's own suggested speeds.
  var ghostLine = null;
  function buildGhostLine() {
    var g = save.ghost; ghostLine = null;
    if (!g || g.x.length < 60) return;
    var n = Math.ceil(LAP), D = new Float32Array(n), V = new Float32Array(n), has = new Uint8Array(n), hint = null, first = -1, i, b;
    for (i = 0; i < g.x.length; i++) {
      var l = K.locate(g.x[i], g.z[i], hint), j = i < g.x.length - 1 ? i : i - 1; hint = l.s;
      b = Math.floor(l.s) % n; D[b] = l.d; V[b] = Math.hypot(g.x[j + 1] - g.x[j], g.z[j + 1] - g.z[j]) * RATE; has[b] = 1; if (first < 0) first = b;
    }
    for (i = first + 1; i < first + n; i++) { b = i % n; if (!has[b]) { var pb = (b + n - 1) % n; D[b] = D[pb]; V[b] = V[pb]; } }
    var D2 = new Float32Array(n), V2 = new Float32Array(n); // smooth over 5 m
    for (i = 0; i < n; i++) { var sd = 0, sv = 0; for (var k = -2; k <= 2; k++) { b = (i + k + n) % n; sd += D[b]; sv += V[b]; } D2[i] = sd / 5; V2[i] = sv / 5; }
    // W marks the places where you ran wide (close to or over the edge); the AI takes those more carefully
    var W = new Uint8Array(n); for (i = 0; i < n; i++) if (Math.abs(D2[i]) > 5.8) for (k = -12; k <= 4; k++) W[(i + k + n) % n] = 1;
    ghostLine = { d: D2, v: V2, w: W, n: n };
  }
  function ghostBin(s) { return ((Math.floor(s) % ghostLine.n) + ghostLine.n) % ghostLine.n; }
  buildGhostLine();

  function driveAi(a, dt) {
    var p = a.phys, loc = p.loc, u = p.u, sp = a.spec, look = 6 + Math.abs(u) * 0.6, thr = true, brk = false, near = 16, gl = ghostLine;
    // your line, plus a small personal offset so the cars do not all sit on the same strip of road
    var target = gl ? clamp(gl.d[ghostBin(loc.s + look)] + sp.lane * 0.5, -4.2, 4.2) : sp.lane, free = true;
    // traffic: move over for a slower car ahead, lift if there is no room yet
    var all = everyone();
    for (var i = 0; i < all.length; i++) {
      var o = all[i]; if (o === p) continue;
      var ds = K.wrap(o.loc.s - loc.s), dd = loc.d - o.loc.d;
      if (ds > 0 && ds < near && o.loc.d > -9 && Math.abs(dd) < 2.0 && u > o.u - 1) {
        near = ds; free = false;
        var side = dd >= 0 ? 1 : -1, t = o.loc.d + side * 2.5;
        if (t > 4.8 || t < -5.2) t = o.loc.d - side * 2.5;
        target = clamp(t, -5.2, 4.8);
        thr = !(ds < 6.5 && Math.abs(dd) < 1.7); brk = ds < 4.6 && Math.abs(dd) < 1.7 && u > o.u;
      }
    }
    var rate = gl && free ? 9 : 2.5; // follow your line closely; move over for traffic more gently
    a.lane += clamp(target - a.lane, -rate * dt, rate * dt);
    var tg = K.pos(loc.s + look, a.lane, 0);
    var err = wrapPi(Math.atan2(-(tg.z - p.z), tg.x - p.x) - p.psi);
    // speed: yours at this point of the lap (looking a few metres ahead so braking starts in time);
    // without a ghost, the track's own suggested corner speed
    var want = K.vAt(loc.s + 2) * sp.pace;
    // never above what the corner can physically take, so the AI does not copy the moments you ran wide
    if (gl) want = Math.min(K.vAt(loc.s + 2) * (gl.w[ghostBin(loc.s + 2)] ? 0.97 : 1.04), Math.max(want * 0.88, Math.min(gl.v[ghostBin(loc.s + 2)], gl.v[ghostBin(loc.s + 7)]) * (sp.pace + 0.02)));
    if (p.surface !== 'road') want = Math.min(want, 9);
    if (u > want) thr = false;
    if (u > want + 1.2) brk = true;
    a.inp.thr = thr; a.inp.brk = brk; a.inp.steer = clamp(err * 3, -1, 1);
    // now and then an AI driver alongside you kicks back
    a.kickCd = Math.max(0, (a.kickCd || 0) - dt);
    if (a.kickCd === 0 && aiKickCd <= 0 && state === 'drive' && u > 5 && Math.hypot(phys.x - p.x, phys.z - p.z) < 3.2 && Math.random() < dt * 0.15) {
      kick(p, phys); a.kickCd = 10; aiKickCd = 6; sound.thump(3); toast('You got kicked by number ' + sp.num + '!');
    }
    p.update(dt, a.inp);
    // spun or stuck for a while: put the car back on its lane
    var facing = Math.cos(p.psi) * p.loc.tx - Math.sin(p.psi) * p.loc.tz;
    a.stuck = (Math.abs(p.u) < 1 || facing < 0) ? a.stuck + dt : 0;
    if (a.stuck > 4) { p.place(p.loc.s, clamp(p.loc.d, -4, 4)); a.lane = p.loc.d; a.stuck = 0; }
  }
  // kick: shove the other car sideways, away from the kicker, and leave it weaving for a moment
  var wasBump = false;
  var kickCd = 0, aiKickCd = 0; // aiKickCd: at most one AI kick on you every few seconds
  function kick(from, to) {
    var side = ((to.x - from.x) * -Math.sin(to.psi) + (to.z - from.z) * -Math.cos(to.psi)) >= 0 ? 1 : -1;
    to.v += side * 4.5; to.r += side * 1.0; to.wobble = 2.0; to.u *= 0.93;
    swingLeg(from, ((to.x - from.x) * Math.sin(from.psi) + (to.z - from.z) * Math.cos(from.psi)) >= 0 ? 1 : -1);
    var mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
    for (var i = 0; i < 8; i++) fx.spawn('spark', mx, from.loc.y + 0.6 + Math.random() * 0.4, mz, (Math.random() - .5) * 4, 1 + Math.random() * 2, (Math.random() - .5) * 4);
  }
  // the kicker's leg swings out on that side (1 = right, -1 = left); pose() plays the animation
  function swingLeg(p, side) { p.kickT = 0.4; p.kickSide = side; }
  function playerKick() {
    if (kickCd > 0) return;
    var best = null, bestId = '', bd = 4.2;
    ais.forEach(function (a, i) { var d = Math.hypot(a.phys.x - phys.x, a.phys.z - phys.z); if (d < bd) { bd = d; best = a.phys; bestId = 'ai:' + i; } });
    for (var id in remotes) { var rp = remotes[id].phys, d = Math.hypot(rp.x - phys.x, rp.z - phys.z); if (d < bd) { bd = d; best = rp; bestId = id; } }
    kickCd = 0.8;
    if (!best) { swingLeg(phys, 1); toast('Nobody close enough to kick'); return; }
    if (!best.remote) kick(phys, best); // a car this computer drives: shove it right away
    else {
      // a car another computer drives: show the kick here and tell that computer, which applies the shove
      kickSeq++; kickTo = bestId;
      swingLeg(phys, ((best.x - phys.x) * Math.sin(phys.psi) + (best.z - phys.z) * Math.cos(phys.psi)) >= 0 ? 1 : -1);
    }
    sound.thump(3); toast('Kick!');
  }

  // ---------- multiplayer ----------
  // Every car in the world: mine, the AI cars, and the other players' cars.
  // A car with remote = true is driven by another computer; here it is only shown and bumped into.
  var net = TF.net, remotes = {}, myPeer = null, isHost = true, kickSeq = 0, kickTo = '', lastSend = 0, slot = 0, online = 0, joinedAt = 0, netMsg = '';
  function everyone() { var all = [phys]; ais.forEach(function (a) { all.push(a.phys); }); for (var id in remotes) all.push(remotes[id].phys); return all; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function makeRemote(peer, col) {
    var num = (parseInt(peer.replace(/[^0-9a-z]/gi, '').slice(-3), 36) || 7) % 89 + 10;
    var mesh = TF.buildCar(COLORS[col] ? COLORS[col][1] : COLORS[0][1], false, num); scene.add(mesh);
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', '10'); dot.setAttribute('fill', '#7fd0ff'); dot.setAttribute('stroke', '#fff8ea'); dot.setAttribute('stroke-width', '3');
    mapSvg.insertBefore(dot, $('mapCar'));
    var ph = new TF.Physics([]); ph.remote = true;
    return { mesh: mesh, body: mesh.userData.body, phys: ph, spin: 0, tgt: null, pres: null, kn: null, dot: dot, col: col };
  }
  // glide a remote car towards where its owner last said it was, predicting a little ahead from its speed
  function netMove(o, dt) {
    var t = o.tgt, p = o.phys; if (!t) return;
    var age = Math.min(0.3, (performance.now() - t.at) / 1000), c = Math.cos(t.psi), s = Math.sin(t.psi);
    var px = t.x + (t.u * c - t.v * s) * age, pz = t.z + (-t.u * s - t.v * c) * age, pp = t.psi + t.r * age, k = Math.min(1, 12 * dt);
    if (Math.hypot(px - p.x, pz - p.z) > 15) { p.x = px; p.z = pz; p.psi = pp; }
    else { p.x += (px - p.x) * k; p.z += (pz - p.z) * k; p.psi = wrapPi(p.psi + wrapPi(pp - p.psi) * k); }
    p.u = t.u; p.v = t.v; p.r = t.r; p.delta = t.delta; p.steer = clamp(t.delta / 0.4, -1, 1);
    p.loc = K.locate(p.x, p.z, p.loc ? p.loc.s : null);
  }
  function netUpdate(dt) {
    var peers = net.peers(), seen = {}, ids = [], since = {}, id;
    for (var i = 0; i < peers.length; i++) {
      var pr = peers[i]; if (pr.kind !== 'viewer') continue;
      if (pr.sameTab) { myPeer = pr.peer; if (state !== 'menu') { ids.push(pr.peer); since[pr.peer] = joinedAt; } continue; }
      var ps = pr.presence; if (!ps || !Array.isArray(ps.c) || ps.c.length < 7 || !ps.st) continue; // still on the start screen: not on track
      ids.push(pr.peer); seen[pr.peer] = 1; since[pr.peer] = +ps.t || 0;
      var o = remotes[pr.peer];
      if (!o) { o = remotes[pr.peer] = makeRemote(pr.peer, ps.col | 0); o.phys.x = +ps.c[0] || 0; o.phys.z = +ps.c[1] || 0; o.phys.psi = +ps.c[2] || 0; }
      if (o.pres !== ps) {
        o.pres = ps; var c = ps.c;
        o.tgt = { x: +c[0] || 0, z: +c[1] || 0, psi: +c[2] || 0, u: +c[3] || 0, v: +c[4] || 0, r: +c[5] || 0, delta: +c[6] || 0, at: performance.now() };
        o.phys.air = +c[7] || 0; o.phys.airSide = c[8] < 0 ? -1 : 1; o.phys.wobble = +c[9] || 0;
        if ((ps.col | 0) !== o.col && COLORS[ps.col | 0]) { o.col = ps.col | 0; o.mesh.userData.paint.forEach(function (m) { m.color.setHex(COLORS[o.col][1]); }); }
        // their kick counter went up: play the leg swing, and take the shove if it was aimed at a car this computer drives
        var kk = ps.k;
        if (Array.isArray(kk)) {
          if (o.kn !== null && kk[0] !== o.kn) {
            swingLeg(o.phys, 1);
            if (kk[1] === myPeer && state === 'drive') { kick(o.phys, phys); sound.thump(3); toast('You got kicked!'); }
            else if (isHost && typeof kk[1] === 'string' && kk[1].indexOf('ai:') === 0 && ais[+kk[1].slice(3)]) kick(o.phys, ais[+kk[1].slice(3)].phys);
          }
          o.kn = kk[0];
        }
      }
      netMove(o, dt);
    }
    for (id in remotes) if (!seen[id]) { scene.remove(remotes[id].mesh); remotes[id].dot.remove(); delete remotes[id]; }
    // the host is the player who has been on track longest; the host's computer drives the AI cars for everyone
    ids.sort(function (a, b) { return (since[a] - since[b]) || (a < b ? -1 : 1); }); online = ids.length;
    var hostId = ids.length ? ids[0] : null;
    isHost = !hostId || hostId === myPeer;
    slot = state === 'menu' ? ids.length : Math.max(0, ids.indexOf(myPeer));
    if (!isHost && remotes[hostId]) {
      var hp = remotes[hostId].pres, arr = hp && Array.isArray(hp.ai) ? hp.ai : [], n = Math.min(MAX_AI, Math.floor(arr.length / 5));
      if (ais.length !== n) setAiCount(n, true);
      for (i = 0; i < n; i++) {
        var a = ais[i]; a.phys.remote = true;
        if (a.netPres !== hp) { a.netPres = hp; a.tgt = { x: +arr[i * 5] || 0, z: +arr[i * 5 + 1] || 0, psi: +arr[i * 5 + 2] || 0, u: +arr[i * 5 + 3] || 0, v: 0, r: 0, delta: +arr[i * 5 + 4] || 0, at: performance.now() }; }
        netMove(a, dt);
      }
    } else {
      if (ais.length && ais[0].phys.remote && ais.length !== save.ai && !hostId) setAiCount(save.ai); // back on my own: my own AI count
      for (i = 0; i < ais.length; i++) ais[i].phys.remote = false;
    }
    // tell the others where I am, about 15 times a second
    var now = performance.now();
    if (net.room && now - lastSend > 66) {
      lastSend = now;
      var moving = state === 'drive', msg = {
        c: [r2(phys.x), r2(phys.z), r3(phys.psi), moving ? r2(phys.u) : 0, moving ? r2(phys.v) : 0, moving ? r3(phys.r) : 0, r3(phys.delta), r2(Math.max(0, phys.air)), phys.airSide, r2(phys.wobble)],
        col: save.color, st: state === 'menu' ? 0 : moving ? 1 : 2, t: joinedAt, k: [kickSeq, kickTo], ai: null
      };
      if (isHost && state !== 'menu') { msg.ai = []; for (i = 0; i < ais.length; i++) { var q2 = ais[i].phys; msg.ai.push(r2(q2.x), r2(q2.z), r3(q2.psi), r2(q2.u), r3(q2.delta)); } }
      net.send(msg);
    }
    var others = Object.keys(remotes).length;
    var label = net.status === 'online' ? (net.code ? 'CODE ' + net.code + ' · ' : 'ONLINE · ') + (others ? (others + 1) + ' DRIVERS' : 'WAITING FOR OTHERS')
      : net.status === 'connecting' ? 'CONNECTING' : netMsg;
    if (hNet.textContent !== label) { hNet.textContent = label; hNet.hidden = !label; menuNet.textContent = label; }
  }

  // slipstream: strongest 3 to 8 m straight behind another car, fading out by 25 m and 1.6 m to the side
  function updateDrafts(dt) {
    var all = everyone();
    for (var i = 0; i < all.length; i++) {
      var c = all[i], best = 0;
      if (c.remote) continue;
      if (c.u > 8) for (var j = 0; j < all.length; j++) {
        var o = all[j]; if (j === i || o.u < 8) continue;
        var rx = c.x - o.x, rz = c.z - o.z, fx_ = Math.cos(o.psi), fz_ = -Math.sin(o.psi);
        var back = -(rx * fx_ + rz * fz_), side = Math.abs(rx * -fz_ + rz * fx_);
        if (back > 2.5 && back < 25 && side < 1.6) best = Math.max(best, (1 - side / 1.6) * (back < 8 ? 1 : (25 - back) / 17));
      }
      c.draft += (best - c.draft) * Math.min(1, 3 * dt);
    }
  }
  // cars are two circles each (front and rear); overlapping circles push apart and trade speed
  function collideCars() {
    var all = everyone();
    var OFF = 0.85, RAD = 0.8, hitMe = 0;
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      var a = all[i], b = all[j];
      if (Math.abs(a.x - b.x) > 4 || Math.abs(a.z - b.z) > 4 || (a.remote && b.remote)) continue;
      // a car driven by another computer cannot be moved from here: the local car takes the whole bump,
      // and the other computer does the same for its own car
      var wa = a.remote ? 0 : b.remote ? 1 : 0.5, wb = 1 - wa;
      for (var m = -1; m <= 1; m += 2) for (var n = -1; n <= 1; n += 2) {
        var ax = a.x + Math.cos(a.psi) * OFF * m, az = a.z - Math.sin(a.psi) * OFF * m, bx = b.x + Math.cos(b.psi) * OFF * n, bz = b.z - Math.sin(b.psi) * OFF * n;
        var dx = ax - bx, dz = az - bz, dist = Math.hypot(dx, dz);
        if (dist >= 2 * RAD || dist < 1e-4) continue;
        var nx = dx / dist, nz = dz / dist, push = 2 * RAD - dist;
        a.x += nx * push * wa; a.z += nz * push * wa; b.x -= nx * push * wb; b.z -= nz * push * wb;
        var va = a.worldVel(), vb = b.worldVel(), vr = (va[0] - vb[0]) * nx + (va[1] - vb[1]) * nz;
        if (vr < 0) {
          var k = -1.3 * vr;
          if (wa) a.setWorldVel(va[0] + nx * k * wa, va[1] + nz * k * wa);
          if (wb) b.setWorldVel(vb[0] - nx * k * wb, vb[1] - nz * k * wb);
          if (i === 0 && -vr > hitMe) hitMe = -vr;
        }
        a.loc = K.locate(a.x, a.z, a.loc.s); b.loc = K.locate(b.x, b.z, b.loc.s);
      }
    }
    return hitMe;
  }

  // ---------- game state ----------
  var state = 'menu', camMode = 'chase', ghostOn = true, time = 0;
  var keys = {}, inp = { thr: false, brk: false, hand: false, steer: 0 };
  var q, sPrev, lap, lapT, lapValid, lapsDone = 0, rec, gp = 0, gap = null, wrongT = 0, exT = 0, spin = 0, camYaw = 0, flag = '';
  function newRec() { return { x: [], z: [], y: [], psi: [], rx: [], rz: [], q: [] }; }
  function resetRun() {
    phys.place(START_S, 0); q = START_S - K.LINE; sPrev = START_S; lap = -1; lapT = 0; lapValid = true; rec = newRec(); gp = 0; gap = null; wrongT = 0;
    camYaw = phys.psi; placeAis();
  }
  resetRun();

  // ---------- HUD ----------
  var hud = $('hud'), hLap = $('hLap'), hTime = $('hTime'), hBest = $('hBest'), hGap = $('hGap'), hFlag = $('hFlag'), hCam = $('hCam'), mapCar = $('mapCar'), mapGhost = $('mapGhost'), toastEl = $('toast'), toastT = 0;
  (function buildSpeedo() {
    var s = '<svg viewBox="0 0 120 120" role="img" aria-label="Speedometer"><circle cx="60" cy="60" r="56" fill="rgba(16,14,12,.62)" stroke="#e6bb5c" stroke-width="4"/>';
    for (var k = 0; k <= 120; k += 10) {
      var a = (-210 + k * 2) * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
      s += '<line x1="' + (60 + c * 44) + '" y1="' + (60 + n * 44) + '" x2="' + (60 + c * 51) + '" y2="' + (60 + n * 51) + '" stroke="#fff8ea" stroke-width="2"/>';
      if (k % 20 === 0) s += '<text x="' + (60 + c * 34) + '" y="' + (60 + n * 34 + 3.5) + '" font-size="9" fill="#fff8ea" text-anchor="middle" font-family="Consolas,monospace">' + k + '</text>';
    }
    s += '<line id="needle" x1="60" y1="60" x2="102" y2="60" stroke="#f07a48" stroke-width="3" stroke-linecap="round" transform="rotate(-210 60 60)"/><circle cx="60" cy="60" r="5" fill="#e6bb5c"/>';
    s += '<text id="hSpeed" x="60" y="92" font-size="17" font-weight="600" fill="#fff8ea" text-anchor="middle" font-family="Consolas,monospace">0</text><text x="60" y="103" font-size="7" fill="#e6bb5c" text-anchor="middle" font-family="Consolas,monospace" letter-spacing="1">KM/H</text></svg>';
    $('speedo').innerHTML = s;
  })();
  var needle = $('needle'), hSpeed = $('hSpeed'), hDraft = $('hDraft'), hNet = $('hNet'), menuNet = $('menuNet');
  // track map: drawn from the real centre line, so it always matches the circuit
  $('mapTrack').setAttribute('d', 'M' + K.outline(6).map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'Z');
  (function () { var a = K.pos(K.LINE, -11, 0), b = K.pos(K.LINE, 11, 0), l = $('mapLine'); l.setAttribute('x1', a.x); l.setAttribute('y1', a.z); l.setAttribute('x2', b.x); l.setAttribute('y2', b.z); })();
  function toast(text, cls) { toastEl.textContent = text; toastEl.className = cls || ''; toastEl.hidden = false; toastT = 2.6; }
  function updateHud() {
    hLap.textContent = 'LAP ' + (lap < 0 ? 1 : lap + 1);
    hTime.textContent = fmt(lap < 0 ? 0 : lapT);
    hBest.textContent = fmt(save.best);
    if (gap == null) { hGap.textContent = '--'; hGap.className = 'v ghost'; }
    else { hGap.textContent = (gap >= 0 ? '+' : '-') + Math.abs(gap).toFixed(2); hGap.className = 'v ' + (gap <= 0 ? 'ahead' : 'behind'); }
    if (hFlag.textContent !== flag) hFlag.textContent = flag;
    var kmh = Math.abs(phys.u) * 3.6;
    hSpeed.textContent = Math.round(kmh);
    needle.setAttribute('transform', 'rotate(' + (-210 + Math.min(kmh, 125) * 2).toFixed(1) + ' 60 60)');
    mapCar.setAttribute('cx', phys.x.toFixed(1)); mapCar.setAttribute('cy', phys.z.toFixed(1));
    for (var i = 0; i < ais.length; i++) { ais[i].dot.setAttribute('cx', ais[i].phys.x.toFixed(1)); ais[i].dot.setAttribute('cy', ais[i].phys.z.toFixed(1)); }
    hDraft.style.opacity = phys.draft > 0.08 ? Math.min(1, phys.draft * 1.3).toFixed(2) : '0';
    if (ghostCar.visible) { mapGhost.setAttribute('cx', ghostCar.position.x.toFixed(1)); mapGhost.setAttribute('cy', ghostCar.position.z.toFixed(1)); mapGhost.setAttribute('visibility', 'visible'); }
    else mapGhost.setAttribute('visibility', 'hidden');
  }

  // ---------- menus ----------
  var swatchSets = [];
  function setColor(i) {
    save.color = i; car.userData.paint.forEach(function (m) { m.color.setHex(COLORS[i][1]); });
    swatchSets.forEach(function (set) { set.forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); }); });
    persist();
  }
  ['menuSwatches', 'pauseSwatches'].forEach(function (id) {
    var set = [];
    COLORS.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.title = c[0]; b.setAttribute('aria-label', c[0] + ' paint');
      b.style.background = '#' + ('00000' + c[1].toString(16)).slice(-6);
      b.setAttribute('aria-pressed', i === save.color ? 'true' : 'false');
      b.addEventListener('click', function () { setColor(i); b.blur(); });
      $(id).appendChild(b); set.push(b);
    });
    swatchSets.push(set);
  });
  // online, each player who joins takes the next free place on the grid so cars do not start inside each other
  function gridPlace(sl) {
    var s = START_S - 6 * Math.floor(sl / 3); phys.place(s, [0, 3, -3][sl % 3]);
    q = s - K.LINE; sPrev = phys.loc.s; camYaw = phys.psi;
  }
  function startDrive() { if (state === 'menu') { if (slot > 0) gridPlace(slot); joinedAt = Date.now(); } state = 'drive'; $('menu').hidden = true; $('pause').hidden = true; hud.hidden = false; sound.start(); }
  function pause() {
    if (state !== 'drive') return;
    state = 'pause'; keys = {}; sound.silence();
    $('pBest').textContent = fmt(save.best); $('pLaps').textContent = lapsDone;
    clearArmed = false; $('btnClear').textContent = 'Clear best lap';
    $('pause').hidden = false;
  }
  function resume() { if (state === 'pause') { state = 'drive'; $('pause').hidden = true; } }
  var clearArmed = false;
  $('btnResume').addEventListener('click', resume);
  $('btnClear').addEventListener('click', function () {
    if (!clearArmed) { clearArmed = true; this.textContent = 'Click again to clear'; return; }
    save.best = null; save.ghost = null; persist(); buildGhostLine(); gap = null; clearArmed = false;
    this.textContent = 'Best lap cleared'; $('pBest').textContent = fmt(null);
  });
  $('btnMenu').addEventListener('click', function () {
    state = 'menu'; keys = {}; sound.silence(); resetRun();
    $('pause').hidden = true; hud.hidden = true; $('menu').hidden = false;
  });
  $('menu').addEventListener('click', function (e) { if (!e.target.closest('.swatches, .ai-row, .online-row')) startDrive(); });

  // online with a room code (only when the game is opened as a normal page, not as an artifact)
  var NET_ERRORS = { load: 'Could not reach the connection service. Check the internet.', code: 'A code has 5 letters or numbers.', 'peer-unavailable': 'No game with that code. Check the code with the host.', timeout: 'No answer from the host. Try again.', 'unavailable-id': 'Could not create a code. Try again.' };
  function netBusy(b) { $('btnHost').disabled = b; $('btnJoin').disabled = b; $('joinCode').disabled = b; }
  function netDone(err) {
    netBusy(false);
    if (err) { netMsg = NET_ERRORS[err] || 'Could not connect (' + err + ').'; return; }
    netMsg = ''; $('onlineRow').hidden = true;
  }
  function doJoin() { if ($('btnJoin').disabled) return; netBusy(true); netMsg = 'CONNECTING…'; net.joinGame($('joinCode').value, netDone); $('joinCode').blur(); }
  if (net.canCode && net.status === 'solo') {
    $('onlineRow').hidden = false;
    $('btnHost').addEventListener('click', function () { netBusy(true); netMsg = 'CREATING A CODE…'; net.hostGame(netDone); this.blur(); });
    $('btnJoin').addEventListener('click', doJoin);
    net.onLost = function () { netMsg = 'The host left. You are driving alone.'; $('onlineRow').hidden = false; toast('Connection to the host lost'); };
  }
  $('aiCount').addEventListener('input', function () { setAiCount(+this.value); });
  $('aiCount').addEventListener('change', function () { this.blur(); });
  setAiCount(save.ai);

  // ---------- keyboard ----------
  var DRIVE_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1 };
  window.addEventListener('keydown', function (e) {
    var c = e.code;
    if (e.target && e.target.id === 'joinCode') { if (c === 'Enter' || c === 'NumpadEnter') doJoin(); return; } // typing a game code
    if (e.target && e.target.id === 'aiCount' && c !== 'Enter' && c !== 'NumpadEnter') return; // let the slider use its own keys
    if (DRIVE_KEYS[c]) e.preventDefault();
    if (e.repeat) return;
    if (c === 'KeyM') { sound.setMuted(!sound.muted); if (state === 'drive') toast(sound.muted ? 'Sound off' : 'Sound on'); return; }
    if (state === 'menu') {
      if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); startDrive(); }
      else if (c === 'ArrowRight' || c === 'KeyD') setColor((save.color + 1) % COLORS.length);
      else if (c === 'ArrowLeft' || c === 'KeyA') setColor((save.color + COLORS.length - 1) % COLORS.length);
      else if (c === 'ArrowUp' || c === 'KeyW') setAiCount(save.ai + 1);
      else if (c === 'ArrowDown' || c === 'KeyS') setAiCount(save.ai - 1);
      return;
    }
    if (state === 'pause') { if (c === 'Escape' || c === 'KeyP') resume(); return; }
    sound.start();
    keys[c] = true;
    if (c === 'Escape' || c === 'KeyP') pause();
    else if (c === 'KeyC') { camMode = camMode === 'chase' ? 'driver' : 'chase'; hCam.textContent = camMode === 'chase' ? 'CHASE CAM' : "DRIVER'S SEAT"; }
    else if (c === 'KeyH') sound.horn();
    else if (c === 'KeyG') { ghostOn = !ghostOn; toast(ghostOn ? 'Ghost on' : 'Ghost off'); }
    else if (c === 'KeyR') resetCar();
    else if (c === 'ShiftLeft' || c === 'ShiftRight') playerKick();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; pause(); });

  function resetCar() {
    var l = phys.loc;
    phys.place(l.s, clamp(l.d, -5, 5));
    if (lap >= 0) lapValid = false;
    camYaw = phys.psi; toast('Car reset');
  }

  // ---------- one step of driving ----------
  function packRec(r) {
    function rd(a, n) { var k = Math.pow(10, n); return a.map(function (v) { return Math.round(v * k) / k; }); }
    return { x: rd(r.x, 2), z: rd(r.z, 2), y: rd(r.y, 2), psi: rd(r.psi, 3), rx: rd(r.rx, 3), rz: rd(r.rz, 3), q: rd(r.q, 2) };
  }
  function finishLap(t) {
    lapsDone++;
    if (!lapValid) { toast('Lap ' + fmt(t) + ' not counted'); return; }
    if (save.best == null || t < save.best) { save.best = t; save.ghost = packRec(rec); persist(); buildGhostLine(); toast('New best lap ' + fmt(t), 'best'); }
    else toast('Lap ' + fmt(t) + '  +' + (t - save.best).toFixed(2));
  }
  function simulate(dt) {
    inp.thr = !!(keys.KeyW || keys.ArrowUp); inp.brk = !!(keys.KeyS || keys.ArrowDown); inp.hand = !!keys.Space;
    inp.steer = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
    updateDrafts(dt);
    if (kickCd > 0) kickCd -= dt;
    if (aiKickCd > 0) aiKickCd -= dt;
    phys.update(dt, inp);
    if (isHost) for (var ai = 0; ai < ais.length; ai++) driveAi(ais[ai], dt); // online, only the host's computer drives the AI
    var bump = collideCars();
    if (bump > phys.hit) phys.hit = bump;
    var loc = phys.loc, sp = Math.abs(phys.u);

    // progress around the lap
    var ds = 0;
    if (Math.abs(loc.d) < 30) { ds = K.wrap(loc.s - sPrev); q += ds; sPrev = loc.s; }
    if (lap < 0) { if (q >= 0) { lap = 0; lapT = ds > 0 ? Math.min(dt, q / ds * dt) : 0; lapValid = true; rec = newRec(); gp = 0; } }
    else {
      lapT += dt;
      // cutting across the grass cancels the lap; running wide into gravel is punishment enough
      if ((loc.surface === 'grass' && Math.abs(loc.d) > 11) || q < lap * LAP - 25) lapValid = false;
      if (q >= (lap + 1) * LAP) {
        var over = ds > 0 ? clamp((q - (lap + 1) * LAP) / ds, 0, 1) * dt : 0;
        finishLap(lapT - over);
        lap++; lapT = over; lapValid = true; rec = newRec(); gp = 0;
      }
    }
    // record this lap for the ghost
    if (lap >= 0) {
      while (rec.x.length <= lapT * RATE && rec.x.length < RATE * 600) {
        rec.x.push(phys.x); rec.z.push(phys.z); rec.y.push(loc.y); rec.psi.push(phys.psi); rec.rx.push(body.rotation.x); rec.rz.push(body.rotation.z); rec.q.push(q - lap * LAP);
      }
    }
    // gap to the ghost at the same point on the track
    var g = save.ghost; gap = null;
    if (g && lap >= 0 && lapValid) {
      var p = q - lap * LAP, n = g.q.length;
      while (gp < n - 2 && g.q[gp + 1] < p) gp++;
      while (gp > 0 && g.q[gp] > p) gp--;
      var fr = clamp((p - g.q[gp]) / Math.max(0.001, g.q[gp + 1] - g.q[gp]), 0, 1);
      gap = lapT - (gp + fr) / RATE;
    }
    // flags
    var along = (phys.u * Math.cos(phys.psi)) * loc.tx + (phys.u * -Math.sin(phys.psi)) * loc.tz;
    wrongT = along < -3 ? wrongT + dt : 0;
    flag = wrongT > 1 ? 'WRONG WAY' : (lap >= 0 && !lapValid ? 'LAP NOT COUNTED' : '');

    // effects
    var fxv = Math.cos(phys.psi), fzv = -Math.sin(phys.psi), rxv = Math.sin(phys.psi), rzv = Math.cos(phys.psi);
    var wx = phys.u * fxv - phys.v * rxv, wz = phys.u * fzv - phys.v * rzv;
    var slideF = sp > 2 ? clamp((phys.slipF - 0.1) / 0.15, 0, 1) : 0, slideR = sp > 2 ? clamp((phys.slipR - 0.1) / 0.15, 0, 1) : 0;
    if (inp.hand && sp > 2) slideR = 1;
    var paved = loc.surface === 'road', ws = car.userData.wheels;
    for (var i = 0; i < 4; i++) {
      var w = ws[i], px = phys.x + fxv * w.x + rxv * w.z, pz = phys.z + fzv * w.x + rzv * w.z, sl = w.front ? slideF : slideR;
      var py = K.locate(px, pz, loc.s).y;
      fx.mark(i, px, py, pz, wx, wz, paved && sl > 0.3);
      if (paved && sl > 0.7 && Math.random() < dt * 12) fx.spawn('smoke', px, py + 0.15, pz, wx * 0.25 + (Math.random() - .5), 0.5, wz * 0.25 + (Math.random() - .5));
      if (!paved && sp > 3 && !w.front && Math.random() < dt * sp) fx.spawn(loc.surface === 'gravel' ? 'dust' : 'smoke', px, py + 0.1, pz, wx * 0.2 + (Math.random() - .5), 0.8, wz * 0.2 + (Math.random() - .5));
    }
    exT += dt * (5 + (inp.thr ? 12 : 0));
    while (exT > 1) { exT -= 1; fx.spawn('exhaust', phys.x - fxv * 1.6 + rxv * 0.3, loc.y + 0.3, phys.z - fzv * 1.6 + rzv * 0.3, wx * 0.4 - fxv, 0.4, wz * 0.4 - fzv); }
    if (phys.hit > 1) sound.thump(phys.hit);
    var flyNow = phys.air > 0; // thump on take-off and on landing
    if (flyNow !== wasBump) sound.thump(flyNow ? 2 : 4);
    wasBump = flyNow;
    var sparks = (phys.hit > 1.5 ? Math.min(14, phys.hit * 3) : 0) + (phys.scrape && Math.random() < dt * 30 ? 1 : 0);
    var snx = phys.wnx, snz = phys.wnz;
    for (i = 0; i < sparks; i++) fx.spawn('spark', phys.x + snx * 0.8 + fxv * (Math.random() * 2 - 1), loc.y + 0.3 + Math.random() * 0.5, phys.z + snz * 0.8 + fzv * (Math.random() * 2 - 1),
      wx * 0.5 - snx * (1 + Math.random() * 2) + (Math.random() - .5) * 2, 1 + Math.random() * 2.5, wz * 0.5 - snz * (1 + Math.random() * 2) + (Math.random() - .5) * 2);

    // sound
    var rpm = phys.gear === 1 ? 450 + sp / 8.5 * 1250 : 520 + sp / 29 * 1400;
    var squeal = paved && sp > 2 ? clamp((Math.max(phys.slipF, phys.slipR) - 0.06) / 0.14, 0, 1) * Math.min(1, sp / 6) : 0;
    if (inp.hand && sp > 3 && paved) squeal = 1;
    sound.update({ rpm: rpm, thr: inp.thr ? 1 : 0, slide: squeal, speed: sp, scrape: phys.scrape });
    TF.rpm = rpm;
  }

  // ---------- visuals ----------
  var tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), eul = new T.Euler(0, 0, 0, 'YXZ'), lookQ = new T.Quaternion();
  // put a car model where its physics says: position, lean, wheels, steering wheel
  function pose(c, dt) {
    var p = c.phys, loc = p.loc, k = Math.min(1, 8 * (dt || 0.016)), b = c.body, ud = c.mesh.userData;
    // ramp kerbs: height under the left and right wheels tips and lifts the car; a launch adds a hop
    var sxv = Math.sin(p.psi) * 0.71, szv = Math.cos(p.psi) * 0.71;
    var rhL = K.locate(p.x - sxv, p.z - szv, loc.s).rh, rhR = K.locate(p.x + sxv, p.z + szv, loc.s).rh;
    var fly = p.air > 0 ? 1 - p.air / TF.AIR : -1, hop = fly >= 0 ? 4 * 0.5 * fly * (1 - fly) : 0;
    var rampRoll = -(rhR - rhL) / 1.42 + (fly >= 0 ? -p.airSide * 0.22 * Math.sin(fly * Math.PI) : 0);
    c.mesh.position.set(p.x, loc.y + (rhL + rhR) / 2 + hop, p.z); c.mesh.rotation.y = p.psi;
    // kick animation: the leg swings out to horizontal and back in 0.4 s
    if (p.kickT > 0) {
      p.kickT -= dt;
      var leg = p.kickSide > 0 ? ud.legs.R : ud.legs.L, ang = Math.sin((1 - Math.max(0, p.kickT) / 0.4) * Math.PI) * 1.4;
      ud.legs.L.visible = ud.legs.R.visible = false;
      if (p.kickT > 0) { leg.visible = true; leg.rotation.x = p.kickSide > 0 ? -ang : ang; }
    }
    var fxv = Math.cos(p.psi), fzv = -Math.sin(p.psi), rxv = Math.sin(p.psi), rzv = Math.cos(p.psi);
    var bank = loc.d > -K.HW ? loc.b : 0;
    var rollT = -bank * (rxv * loc.nx + rzv * loc.nz) + clamp(0.02 * p.latAcc, -0.09, 0.09) + 0.09 * Math.sin(p.wobble * 13) * Math.min(1, p.wobble) + rampRoll;
    var pitchT = bank * (fxv * loc.nx + fzv * loc.nz) + clamp(0.012 * p.longAcc, -0.05, 0.05);
    b.rotation.x += (rollT - b.rotation.x) * k; b.rotation.z += (pitchT - b.rotation.z) * k;
    c.spin -= p.u / 0.38 * dt;
    for (var i = 0; i < 4; i++) { ud.wheels[i].spin.rotation.z = c.spin; if (ud.wheels[i].front) ud.wheels[i].steer.rotation.y = p.delta; }
    ud.steeringWheel.rotation.z = p.steer * 1.7;
  }
  function updateCar(dt) {
    var loc = phys.loc;
    pose(me, dt);
    for (var i = 0; i < ais.length; i++) pose(ais[i], dt);
    for (var id in remotes) { var ro = remotes[id]; pose(ro, dt); ro.dot.setAttribute('cx', ro.phys.x.toFixed(1)); ro.dot.setAttribute('cy', ro.phys.z.toFixed(1)); }
    body.position.y = state === 'drive' ? Math.sin(time * (TF.rpm || 450) / 60 * 2 * Math.PI * 2) * 0.003 : 0;
    car.userData.driver.visible = !(state === 'drive' && camMode === 'driver') && !(state === 'pause' && camMode === 'driver');
    car.updateMatrixWorld(true);
    world.followSun(phys.x, loc.y, phys.z);
  }
  function updateGhost() {
    var g = save.ghost, show = false;
    if (g && ghostOn && lap >= 0 && state !== 'menu') {
      var t = lapT * RATE, i = Math.floor(t), f = t - i;
      if (i + 1 < g.x.length) {
        ghostCar.position.set(g.x[i] + (g.x[i + 1] - g.x[i]) * f, g.y[i] + (g.y[i + 1] - g.y[i]) * f, g.z[i] + (g.z[i + 1] - g.z[i]) * f);
        ghostCar.rotation.y = g.psi[i] + wrapPi(g.psi[i + 1] - g.psi[i]) * f;
        var gb = ghostCar.userData.body; gb.rotation.x = g.rx[i]; gb.rotation.z = g.rz[i];
        show = true;
      }
    }
    ghostCar.visible = show;
  }
  function updateCamera(dt) {
    if (state === 'menu') {
      var a = 0.73 + 0.3 * Math.sin(time * 0.2);
      cam.fov = 36; cam.near = 0.5; cam.up.set(0, 1, 0);
      cam.position.copy(body.localToWorld(tmpV.set(6.1 * Math.cos(a), 1.25, -6.1 * Math.sin(a))));
      cam.lookAt(body.localToWorld(tmpV.set(-0.1, 1.15, 0)));
    } else if (camMode === 'driver') {
      cam.fov = 66; cam.near = 0.15;
      cam.position.copy(body.localToWorld(tmpV.set(-0.6, 1.66, -0.22)));
      eul.set(-0.1, -Math.PI / 2 + phys.steer * 0.16, 0);
      cam.quaternion.copy(body.getWorldQuaternion(tmpQ)).multiply(lookQ.setFromEuler(eul));
    } else {
      camYaw += wrapPi(phys.psi - camYaw) * Math.min(1, 4.5 * dt);
      var cx = phys.x - Math.cos(camYaw) * 6.4, cz = phys.z + Math.sin(camYaw) * 6.4, cw = K.stadium(cx, cz);
      if (cw.d > 6.2) { cx -= cw.nx * (cw.d - 6.2); cz -= cw.nz * (cw.d - 6.2); }
      var cl = K.locate(cx, cz, phys.loc.s);
      cam.fov = 55 + Math.min(1, Math.abs(phys.u) / 29) * 9 + phys.draft * 5; cam.near = 0.5; cam.up.set(0, 1, 0);
      cam.position.set(cx, Math.max(phys.loc.y, cl.y) + 2.5, cz);
      cam.lookAt(phys.x + Math.cos(phys.psi) * 3, phys.loc.y + 1.05, phys.z - Math.sin(phys.psi) * 3);
    }
    cam.updateProjectionMatrix();
  }

  // ---------- main loop ----------
  function tick(dt) {
    time += dt;
    netUpdate(dt);
    if (state === 'drive') { simulate(dt); fx.update(dt); }
    updateCar(state === 'drive' ? dt : 0);
    updateGhost();
    updateCamera(dt);
    if (state === 'drive') updateHud();
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }
    renderer.render(scene, cam);
  }
  var last = performance.now();
  function frame(now) { var dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt > 0) tick(dt); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  // handles for testing from the browser console
  TF.game = {
    phys: phys, fx: fx, ais: ais, kick: playerKick,
    netInfo: function () { return { status: net.status, online: online, isHost: isHost, slot: slot, me: myPeer, remotes: Object.keys(remotes).map(function (id) { var p = remotes[id].phys; return { id: id, x: r2(p.x), z: r2(p.z), u: r2(p.u), wobble: p.wobble }; }), ais: ais.length, aiRemote: ais.length ? !!ais[0].phys.remote : null, ai0: ais.length ? [r2(ais[0].phys.x), r2(ais[0].phys.z)] : null }; }, buildGhostLine: buildGhostLine, hasGhostLine: function () { return !!ghostLine; }, setAiCount: setAiCount, keys: function () { return keys; }, tick: tick, start: startDrive, save: save,
    info: function () { return { state: state, lap: lap, lapT: lapT, q: q, valid: lapValid, best: save.best, gap: gap, kmh: Math.abs(phys.u) * 3.6, s: phys.loc.s, d: phys.loc.d, lapsDone: lapsDone, cam: camMode }; },
    press: function (code, down) { keys[code] = down; }
  };
})();
