// Main game: input, lap timer, ghost car, cameras, HUD, menus.
(function () {
  var TF = window.TF, T = THREE, K = TF.Track, LAP = K.LAP;
  var COLORS = [['Black', 0x0e0e0f], ['Brewster green', 0x1f3d2b], ['Maroon', 0x6b1420], ['Royal blue', 0x16306b], ['Cream', 0xd8c9a0], ['Fire red', 0xb3201a]];
  // GT3 and LMP1 paint: same slots, named after racing marques
  var COLORS_RACE = [['Audi', 0x0e0e0f], ['Aston Martin', 0x0f6b4a], ['McLaren', 0xff6a00], ['BMW', 0x1c4fd1], ['Porsche', 0xf4f4f2], ['Ferrari', 0xd8141b]];
  function livery(hex) { return hex === TF.PORSCHE ? 1 : hex === TF.FERRARI ? 2 : hex === TF.AUDI ? 3 : hex === TF.BMW ? 4 : hex === TF.MCLAREN ? 5 : hex === TF.ASTON ? 6 : 0; } // paints that come with extra parts
  function palette(v) { return v === 'tford' ? COLORS : COLORS_RACE; }
  var SAVE_KEY = 'tford-speedway-v2', RATE = 30, START_S = K.START; // v2: new track layout, old best laps do not apply
  function $(id) { return document.getElementById(id); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function fmt(t) { if (t == null) return '-:--.--'; var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }

  // ---------- saved data (paint colour, best lap and its ghost) ----------
  var VEH = TF.VEHICLES;
  // Best lap and ghost are kept per vehicle: save.best / save.ghost belong to the vehicle in use, the other one waits in save.store.
  // ai = Model T drivers on the speedway, aiGt3 and aiLmp = GT3 and LMP1 drivers at Spa.
  var LMP_UNLOCK = 119; // seconds: a GT3 lap under 1:59 at Spa unlocks the LMP1
  var save = { laps: 5, lmpOk: false, num: 7, color: 0, best: null, ghost: null, ai: 3, aiGt3: 8, aiLmp: 3, veh: 'tford', store: {} };
  // a saved lap only counts if it was driven on the circuit this vehicle uses now (laps saved before there were two circuits are 'classic')
  function okLap(l, v) { return l && typeof l.best === 'number' && l.ghost && Array.isArray(l.ghost.x) && l.ghost.x.length > 10 && Array.isArray(l.ghost.q) && (l.track || 'classic') === VEH[v].track; }
  try {
    var raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (raw.ai >= 0 && raw.ai <= 8) save.ai = raw.ai | 0;
      if (raw.aiGt3 >= 0 && raw.aiGt3 <= 20) save.aiGt3 = raw.aiGt3 | 0;
      if (raw.aiLmp >= 0 && raw.aiLmp <= 10) save.aiLmp = raw.aiLmp | 0;
      if (raw.color >= 0 && raw.color < COLORS.length) save.color = raw.color | 0;
      if (raw.num >= 0 && raw.num <= 99) save.num = raw.num | 0;
      if (raw.laps >= 1 && raw.laps <= 50) save.laps = raw.laps | 0;
      if (raw.lmpU === true) save.lmpOk = true; // (an earlier build wrote 'lmpOk' too eagerly; that flag is ignored)
      if (typeof raw.veh === 'string' && VEH[raw.veh]) save.veh = raw.veh;
      if (!save.lmpOk && save.veh === 'lmp1') save.veh = 'gt3'; // the prototype has to be unlocked first
      if (raw.store && typeof raw.store === 'object') { for (var vk in VEH) if (okLap(raw.store[vk], vk)) save.store[vk] = raw.store[vk]; }
      else if (okLap(raw, 'tford')) save.store.tford = { best: raw.best, ghost: raw.ghost, track: 'classic' }; // saved before there were two vehicles
      var cur = save.store[save.veh]; if (cur) { save.best = cur.best; save.ghost = cur.ghost; }    }
  } catch (e) { /* no saved data */ }
  function lapEntry(v) { return save.best != null && save.ghost ? { best: save.best, ghost: save.ghost, track: VEH[v].track } : undefined; }
  function persist() {
    save.store[save.veh] = lapEntry(save.veh);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ laps: save.laps, lmpU: save.lmpOk, num: save.num, color: save.color, ai: save.ai, aiGt3: save.aiGt3, aiLmp: save.aiLmp, veh: save.veh, store: save.store })); } catch (e) { /* storage unavailable */ }
    if (TF.account) TF.account.queue(); // when logged in, the saved game is copied to the account a few seconds later
  }

  TF.setTrack(VEH[save.veh].track); LAP = K.LAP; START_S = K.START; // the circuit that goes with the vehicle in use

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

  var myVeh = save.veh;
  var car = TF.buildVehicle(myVeh, palette(myVeh)[save.color][1], false, save.num), body = car.userData.body; scene.add(car);
  var ghostCar = TF.buildVehicle(myVeh, 0, true); ghostCar.visible = false; scene.add(ghostCar);
  var phys = new TF.Physics(world.colliders), fx = new TF.Effects(scene), sound = new TF.Sound();
  phys.setVehicle(myVeh); sound.setProfile(myVeh);
  var me = { mesh: car, body: body, phys: phys, spin: 0, flT: -1 };
  // the GT3's headlight flash also lights up the road ahead (a spotlight that is off unless flashing)
  var flashLight = new T.SpotLight(0xfff0d0, 0, 90, 0.5, 0.5, 1); scene.add(flashLight); scene.add(flashLight.target);
  // speed the AI may carry at every point of the lap, for each kind of vehicle. On the big circuit they follow the racing line.
  var profiles = {};
  function profileFor(v) {
    var c = VEH[v], key = K.id + ':' + v;
    return profiles[key] || (profiles[key] = K.kind === 'circuit' ? K.makeLineProfile(c.aiG, c.downforce, c.aiVmax, c.aiDecel) : K.makeProfile(c.aiG, c.downforce, c.aiVmax, c.aiDecel));
  }

  // ---------- AI drivers ----------
  // AI cars come in three kinds. On the classic speedway they are Model Ts. At Spa they are GT3s and LMP1s, each with its own slider.
  // The car specs are the same as the player's. What differs is how hard the driver pushes ("pace": the share of the speed each corner allows).
  var AI_ORDER = ['lmp1', 'gt3', 'tford'], AI_MAX = { tford: 8, gt3: 20, lmp1: 10 };
  // base pace per kind, chosen so a lone GT3 laps Spa in about 2:02 and a lone LMP1 in about 1:45 (traffic adds a little)
  var AI_PACE = { tford: 0.97, gt3: 1.0, lmp1: 1.01 }, AI_SPREAD = { tford: 0.01, gt3: 0.012, lmp1: 0.025 };
  var AI_NUMS = [3, 12, 5, 21, 9, 14, 2, 18];
  // the k-th car of a kind gets its own habits: where it likes to run, how hard it pushes, its race number
  function aiTraits(veh, k) {
    var f = (k * 0.6180339887) % 1, g = (k * 0.7548776662 + 0.3) % 1;
    return { lane: (f - 0.5) * 2.4, pace: AI_PACE[veh] * (1 + (g - 0.5) * AI_SPREAD[veh]), power: 1, num: veh === 'lmp1' ? 1 + k : veh === 'gt3' ? 11 + k : AI_NUMS[k % AI_NUMS.length] };
  }
  var ais = [], mapSvg = $('mapGhost').parentNode, mapSc = 1; // mapSc: how many map units one screen unit is, so dots keep their size on any circuit
  function ownTrack() { return K.id === VEH[myVeh].track; } // laps and ghosts only mean something on the circuit of the vehicle that drove them
  // the cars start in rows of two, the fastest kind in front, ahead of the player
  // within a class, the car that starts at the front is 0.5 s per lap slower than the one at the back (others in between, evenly),
  // so the cars behind close up and there is something to overtake
  var LAP_NOM = { lmp1: 103, gt3: 123, tford: 35 };
  function gridHandicap() {
    ais.forEach(function (a) { a.spec.pace = a.basePace; });
    AI_ORDER.forEach(function (v) {
      var cls = ais.filter(function (a) { return a.veh === v; }); // sorted front of the grid first
      cls.forEach(function (a, r) { a.spec.pace = a.basePace * (1 - (0.5 / LAP_NOM[v]) * (cls.length > 1 ? 1 - r / (cls.length - 1) : 0)); });
    });
  }
  function placeAis() {
    gridHandicap();
    var circuit = K.kind !== 'oval';
    ais.forEach(function (a, i) {
      if (circuit) {
        // two cars per row; the list is sorted prototypes first, and the first car is at the very front.
        // When you drive the prototype, the GT3 cars start behind you.
        var behindMe = save.veh === 'lmp1' && a.veh === 'gt3';
        var grid = ais.filter(function (x) { return !(save.veh === 'lmp1' && x.veh === 'gt3'); });
        var rowsAhead = Math.ceil(grid.length / 2), lane = i % 2 ? 3 : -3;
        if (behindMe) { var j = i - grid.length; a.phys.place(START_S - 10 - 8 * Math.floor(j / 2), j % 2 ? 3 : -3); }
        else a.phys.place(START_S + 8 * (rowsAhead - Math.floor(i / 2)), lane);
      }
      else a.phys.place(START_S + 9 * (Math.floor(i / 2) + 1), i % 2 ? 2.2 : -2.2);
      a.lane = a.phys.loc.d; a.stuck = 0; a.phys.boostE = 0.4; a.phys.ps = null;
    });
  }
  function makeAi(veh, k) {
    var sp = aiTraits(veh, k), colIdx = (k + 1 + (veh === 'lmp1' ? 2 : 0)) % COLORS.length, mesh = TF.buildVehicle(veh, palette(veh)[colIdx][1], false, sp.num, true);
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', String(8 * mapSc)); dot.setAttribute('fill', veh === 'lmp1' ? '#f2b705' : '#fff8ea'); dot.setAttribute('opacity', '.85');
    mapSvg.insertBefore(dot, $('mapGhost'));
    var a = { veh: veh, k: k, basePace: sp.pace, col: colIdx, num: sp.num, mesh: mesh, body: mesh.userData.body, phys: new TF.Physics(world.colliders), spin: 0, spec: sp, lane: sp.lane, stuck: 0, dot: dot, flT: -1, prof: profileFor(veh), inp: { thr: false, brk: false, hand: false, steer: 0, boost: false } };
    a.phys.power = sp.power; a.phys.setVehicle(veh); scene.add(mesh); return a;
  }
  // how many AI cars the sliders ask for on the current circuit
  function wantedCounts() { return K.kind === 'oval' ? { tford: save.ai, gt3: 0, lmp1: 0 } : { tford: 0, gt3: save.aiGt3, lmp1: save.aiLmp }; }
  function aiCounts() { var c = [0, 0, 0]; ais.forEach(function (a) { c[AI_ORDER.indexOf(a.veh)]++; }); return c; }
  // add or remove AI cars until the field matches the counts; the cars stay sorted fastest kind first
  function applyAiCounts(want) {
    var have = { tford: 0, gt3: 0, lmp1: 0 }, changed = false, v, i;
    ais.forEach(function (a) { have[a.veh]++; });
    AI_ORDER.forEach(function (v) {
      while (have[v] > want[v]) {
        for (i = ais.length - 1; i >= 0; i--) if (ais[i].veh === v) { scene.remove(ais[i].mesh); ais[i].dot.remove(); ais.splice(i, 1); break; }
        have[v]--; changed = true;
      }
      while (have[v] < want[v]) { ais.push(makeAi(v, have[v])); have[v]++; changed = true; }
    });
    if (changed) { ais.sort(function (a, b) { return AI_ORDER.indexOf(a.veh) - AI_ORDER.indexOf(b.veh) || a.k - b.k; }); placeAis(); }
    syncAiUi();
  }
  // the sliders: Model T drivers on the speedway, GT3 and LMP1 drivers at Spa
  function syncAiUi() {
    var circuit = K.kind !== 'oval';
    [['aiCount', 'aiLabel', save.ai], ['aiGt3', 'aiGt3Label', save.aiGt3], ['aiLmp', 'aiLmpLabel', save.aiLmp]].forEach(function (s) {
      if ($(s[0]).value !== String(s[2])) $(s[0]).value = s[2];
      if ($(s[1]).textContent !== String(s[2])) $(s[1]).textContent = s[2];
    });
    if ($('rowFord').hidden === !circuit) $('rowFord').hidden = circuit;
    if ($('rowGt3').hidden === circuit) $('rowGt3').hidden = !circuit;
    if ($('rowLmp').hidden === circuit) $('rowLmp').hidden = !circuit;
  }
  // the main slider on the current circuit (what the arrow keys change)
  function mainAi() { return K.kind === 'oval' ? save.ai : save.aiGt3; }
  function setAiCount(n) {
    if (K.kind === 'oval') save.ai = clamp(n | 0, 0, AI_MAX.tford); else save.aiGt3 = clamp(n | 0, 0, AI_MAX.gt3);
    persist(); applyAiCounts(wantedCounts());
  }
  // The AI copies your best lap. From the ghost we keep, for every metre of the lap, where you were across the
  // track and how fast you were going. Without a best lap yet, the AI uses the track's own suggested speeds.
  var ghostLine = null;
  function buildGhostLine() {
    var g = save.ghost; ghostLine = null;
    if (!g || g.x.length < 60 || !ownTrack()) return;
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
    var circuit = K.kind !== 'oval', p = a.phys, loc = p.loc, u = p.u, sp = a.spec, look = 6 + Math.abs(u) * 0.6, thr = true, brk = false, near = circuit ? 32 : 16, gl = circuit ? null : ghostLine, chase = false;
    // on the big circuit everyone drives the racing line; on the speedway they copy your best lap. Either way a small personal
    // offset keeps the cars from all sitting on the same strip of road.
    var target = circuit ? clamp(K.lineOffset(loc.s + look) + sp.lane * 0.35, -4.6, 4.6) : gl ? clamp(gl.d[ghostBin(loc.s + look)] + sp.lane * 0.5, -4.2, 4.2) : sp.lane, free = true;
    // traffic: move over for a slower car ahead, lift if there is no room yet
    var all = everyone();
    for (var i = 0; i < all.length; i++) {
      var o = all[i]; if (o === p) continue;
      var ds = K.wrap(o.loc.s - loc.s), dd = loc.d - o.loc.d;
      if (ds > 0 && ds < near && o.loc.d > -9 && Math.abs(dd) < 2.0 && u > o.u - 1) {
        near = ds; free = false; chase = true;
        // pick the side to overtake on: a free side, keeping the one chosen last time if it is still free
        var best = null, bestScore = 1e9, cands = [o.loc.d + 2.3, o.loc.d - 2.3];
        for (var ci = 0; ci < 2; ci++) {
          var cd = cands[ci]; if (cd > 5.0 || cd < -5.4) continue;
          var blocked = 0;
          for (var bj = 0; bj < all.length; bj++) {
            var ob = all[bj]; if (ob === p || ob === o) continue;
            var bs = K.wrap(ob.loc.s - loc.s);
            if (bs > -6 && bs < ds + 6 && Math.abs(ob.loc.d - cd) < 2.1) blocked++;
          }
          var score = blocked * 10 + Math.abs(cd - target) * 0.3 - (a.passSide === ci ? 2 : 0);
          if (score < bestScore) { bestScore = score; best = ci; }
        }
        if (best === null) { best = dd >= 0 ? 0 : 1; bestScore = 10; } // no room at all
        a.passSide = best; a.passT = 1.5;
        var openSide = bestScore < 10;
        target = clamp(cands[best], -5.4, 5.0);
        // with room to pass, keep the throttle down and only lift when about to touch; without room, tuck in behind
        thr = openSide ? !(ds < 3.2 && Math.abs(dd) < 1.4) : !(ds < 6.5 && Math.abs(dd) < 1.7);
        brk = openSide ? (ds < 2.6 && Math.abs(dd) < 1.4 && u > o.u + 2) : (ds < 4.6 && Math.abs(dd) < 1.7 && u > o.u);
      }
    }
    if (free) a.passT = Math.max(0, (a.passT || 0) - dt);
    var rate = (gl || circuit) && free ? 9 : (circuit ? 6 : 2.5); // follow the line closely; dive out to pass quickly on the circuit
    a.lane += clamp(target - a.lane, -rate * dt, rate * dt);
    var tg = K.pos(loc.s + look, a.lane, 0);
    var err = wrapPi(Math.atan2(-(tg.z - p.z), tg.x - p.x) - p.psi);
    // speed: yours at this point of the lap (looking a few metres ahead so braking starts in time);
    // without a ghost, the track's own suggested corner speed
    var want = a.prof(loc.s + 2) * sp.pace * (chase && circuit ? 1.02 : 1); // pushes a little harder when a car is right ahead
    // never above what the corner can physically take, so the AI does not copy the moments you ran wide
    if (gl) want = Math.min(a.prof(loc.s + 2) * (gl.w[ghostBin(loc.s + 2)] ? 0.97 : 1.04), Math.max(want * 0.88, Math.min(gl.v[ghostBin(loc.s + 2)], gl.v[ghostBin(loc.s + 7)]) * (sp.pace + 0.02)));
    if (p.surface !== 'road') want = Math.min(want, 9);
    if (u > want) thr = false;
    if (u > want + 1.2) brk = true;
    a.inp.thr = thr; a.inp.brk = brk; a.inp.steer = clamp(err * 3, -1, 1);
    a.inp.boost = !!VEH[a.veh].boost && thr && !brk && p.boostE > 0.15 && Math.abs(err) < 0.05; // AI prototypes boost on the straights
    // now and then an AI driver alongside you kicks back
    a.kickCd = Math.max(0, (a.kickCd || 0) - dt);
    if (VEH[a.veh].kick && a.kickCd === 0 && aiKickCd <= 0 && state === 'drive' && u > 5 && Math.hypot(phys.x - p.x, phys.z - p.z) < 3.2 && Math.random() < dt * 0.15) {
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

  // GT3 headlight flash: two quick blinks. Every car (mine, AI, other players') plays it from its own timer flT.
  function flashOn(t) { return t < 0.14 || (t > 0.26 && t < 0.40); }
  function flashHeadlights() { if (me.flT >= 0 && me.flT < 0.3) return; me.flT = 0; flashSeq++; }
  function animateFlash(c, dt) {
    if (c.flT < 0) return;
    c.flT += dt;
    var sf = c.mesh.userData.setFlash, on = flashOn(c.flT);
    if (sf) sf(on ? 1 : 0);
    if (c.flT > 0.5) { c.flT = -1; if (sf) sf(0); }
  }
  // the Shift key: the Model T kicks, the GT3 flashes its headlights
  function onShift() {
    var cf = VEH[myVeh];
    if (cf.boost) { if (phys.boostE < 0.02) toast('Boost empty: brake to charge it'); } // boost is a hold: simulate() reads the key
    else if (cf.flash) flashHeadlights(); else playerKick();
  }

  // ---------- multiplayer ----------
  // Every car in the world: mine, the AI cars, and the other players' cars.
  // A car with remote = true is driven by another computer; here it is only shown and bumped into.
  var net = TF.net, remotes = {}, myPeer = null, isHost = true, kickSeq = 0, kickTo = '', flashSeq = 0, lastSend = 0, slot = 0, online = 0, joinedAt = 0, netMsg = '';
  function everyone() { var all = [phys]; ais.forEach(function (a) { all.push(a.phys); }); for (var id in remotes) all.push(remotes[id].phys); return all; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function makeRemote(peer, col, veh) {
    veh = VEH[veh] ? veh : 'tford';
    var num = (parseInt(peer.replace(/[^0-9a-z]/gi, '').slice(-3), 36) || 7) % 89 + 10;
    var mesh = TF.buildVehicle(veh, palette(veh)[col] ? palette(veh)[col][1] : COLORS[0][1], false, num); scene.add(mesh);
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', String(10 * mapSc)); dot.setAttribute('fill', '#7fd0ff'); dot.setAttribute('stroke', '#fff8ea'); dot.setAttribute('stroke-width', String(3 * mapSc));
    mapSvg.insertBefore(dot, $('mapCar'));
    var ph = new TF.Physics([]); ph.remote = true; ph.setVehicle(veh);
    return { mesh: mesh, body: mesh.userData.body, phys: ph, spin: 0, tgt: null, pres: null, kn: null, fn: null, flT: -1, dot: dot, col: col, veh: veh, num: num };
  }
  // another player switched vehicle: give their car the new body and physics
  function swapRemoteModel(o, v) {
    scene.remove(o.mesh); o.veh = v; o.mesh = TF.buildVehicle(v, palette(v)[o.col] ? palette(v)[o.col][1] : COLORS[0][1], false, o.num);
    o.body = o.mesh.userData.body; scene.add(o.mesh); o.phys.setVehicle(v);
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
      if (!o) { o = remotes[pr.peer] = makeRemote(pr.peer, ps.col | 0, ps.veh); o.phys.x = +ps.c[0] || 0; o.phys.z = +ps.c[1] || 0; o.phys.psi = +ps.c[2] || 0; }
      if (o.pres !== ps) {
        o.pres = ps; var c = ps.c;
        o.phys.boosting = !!ps.bo;
        var pv = VEH[ps.veh] ? ps.veh : 'tford';
        var pn = +ps.n; if (pn >= 0 && pn <= 99 && (pn | 0) !== o.num) { o.num = pn | 0; swapRemoteModel(o, pv); }
        else if (pv !== o.veh) swapRemoteModel(o, pv);
        if (typeof ps.fl === 'number') { if (o.fn !== null && ps.fl !== o.fn) o.flT = 0; o.fn = ps.fl; } // their headlight-flash counter went up
        o.tgt = { x: +c[0] || 0, z: +c[1] || 0, psi: +c[2] || 0, u: +c[3] || 0, v: +c[4] || 0, r: +c[5] || 0, delta: +c[6] || 0, at: performance.now() };
        o.phys.air = +c[7] || 0; o.phys.airSide = c[8] < 0 ? -1 : 1; o.phys.wobble = +c[9] || 0;
        if ((ps.col | 0) !== o.col && COLORS[ps.col | 0]) {
          var oldP = livery(palette(o.veh)[o.col][1]); o.col = ps.col | 0;
          if (oldP !== livery(palette(o.veh)[o.col][1])) swapRemoteModel(o, o.veh);
          else o.mesh.userData.paint.forEach(function (m) { m.color.setHex(palette(o.veh)[o.col][1]); });
        }
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
      var hp = remotes[hostId].pres, arr = hp && Array.isArray(hp.ai) ? hp.ai : [], ac = hp && Array.isArray(hp.ac) ? hp.ac : [0, 0, 0];
      var ht = hp && TF.tracks.indexOf(hp.trk) >= 0 ? hp.trk : K.id;
      if (K.id !== ht) setTrack(ht); // everyone drives the host's circuit
      var comp = {}; AI_ORDER.forEach(function (v, qi) { comp[v] = clamp(ac[qi] | 0, 0, AI_MAX[v]); });
      applyAiCounts(comp); // the AI field is the host's
      var n = Math.min(ais.length, Math.floor(arr.length / 5));
      for (i = 0; i < n; i++) {
        var a = ais[i]; a.phys.remote = true;
        if (a.netPres !== hp) { a.netPres = hp; a.tgt = { x: +arr[i * 5] || 0, z: +arr[i * 5 + 1] || 0, psi: +arr[i * 5 + 2] || 0, u: +arr[i * 5 + 3] || 0, v: 0, r: 0, delta: +arr[i * 5 + 4] || 0, at: performance.now() }; }
        netMove(a, dt);
      }
    } else {
      if (K.id !== VEH[myVeh].track) setTrack(VEH[myVeh].track); // my own circuit again
      applyAiCounts(wantedCounts()); // I drive the AI, so the field is the one my sliders ask for
      for (i = 0; i < ais.length; i++) ais[i].phys.remote = false;
    }
    // tell the others where I am, about 15 times a second
    var now = performance.now();
    if (net.room && now - lastSend > 66) {
      lastSend = now;
      var moving = state === 'drive', msg = {
        c: [r2(phys.x), r2(phys.z), r3(phys.psi), moving ? r2(phys.u) : 0, moving ? r2(phys.v) : 0, moving ? r3(phys.r) : 0, r3(phys.delta), r2(Math.max(0, phys.air)), phys.airSide, r2(phys.wobble)],
        col: save.color, n: save.num, veh: myVeh, trk: K.id, bo: phys.boosting ? 1 : 0, st: state === 'menu' ? 0 : moving ? 1 : 2, t: joinedAt, k: [kickSeq, kickTo], fl: flashSeq, ai: null, ac: aiCounts()
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
        var R = c.cfg.draftRange; // a fast car has a longer slipstream
        if (back > 2.5 && back < 25 * R && side < 1.6) best = Math.max(best, (1 - side / 1.6) * (back < 8 * R ? 1 : (25 * R - back) / (17 * R)));
      }
      c.draft += (best - c.draft) * Math.min(1, 3 * dt);
    }
  }
  // cars are two circles each (front and rear); overlapping circles push apart and trade speed
  function collideCars() {
    var all = everyone();
    var hitMe = 0;
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      var a = all[i], b = all[j];
      if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6 || (a.remote && b.remote)) continue;
      var offA = a.cfg.cOff, offB = b.cfg.cOff, RR = a.cfg.cRad + b.cfg.cRad; // each car is two circles; bigger cars, bigger circles
      // a car driven by another computer cannot be moved from here: the local car takes the whole bump,
      // and the other computer does the same for its own car
      var wa = a.remote ? 0 : b.remote ? 1 : 0.5, wb = 1 - wa;
      for (var m = -1; m <= 1; m += 2) for (var n = -1; n <= 1; n += 2) {
        var ax = a.x + Math.cos(a.psi) * offA * m, az = a.z - Math.sin(a.psi) * offA * m, bx = b.x + Math.cos(b.psi) * offB * n, bz = b.z - Math.sin(b.psi) * offB * n;
        var dx = ax - bx, dz = az - bz, dist = Math.hypot(dx, dz);
        if (dist >= RR || dist < 1e-4) continue;
        var nx = dx / dist, nz = dz / dist, push = RR - dist;
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
  var state = 'menu', camMode = 'chase', ghostOn = true, time = 0, CAM_NAMES = { chase: 'CHASE CAM', driver: "DRIVER'S SEAT", hood: 'HOOD CAM' };
  var keys = {}, inp = { thr: false, brk: false, hand: false, steer: 0 };
  var q, sPrev, lap, lapT, lapValid, lapsDone = 0, rec, gp = 0, gap = null, wrongT = 0, exT = 0, spin = 0, camYaw = 0, flag = '';
  var raceCount = 0, raceT = 0, finished = false, endT = 0; // the race: laps finished, total time, and the pause on the finish before the start screen
  var posAll = 1, posCls = 1, nAll = 1, nCls = 1;           // my places, kept up to date by the leaderboards
  function newRec() { return { x: [], z: [], y: [], psi: [], rx: [], rz: [], q: [] }; }
  function resetRun() {
    phys.place(START_S, 0); phys.ps = null; for (var rid in remotes) remotes[rid].phys.ps = null; q = START_S - K.LINE; sPrev = START_S; lap = -1; lapT = 0; lapValid = true; rec = newRec(); gp = 0; gap = null; wrongT = 0;
    raceCount = 0; raceT = 0; finished = false; endT = 0;
    camYaw = phys.psi; placeAis();
  }
  resetRun();

  // ---------- HUD ----------
  var hud = $('hud'), hLap = $('hLap'), hTime = $('hTime'), hBest = $('hBest'), hGap = $('hGap'), hFlag = $('hFlag'), hCam = $('hCam'), mapCar = $('mapCar'), mapGhost = $('mapGhost'), toastEl = $('toast'), toastT = 0;
  // the dial sweeps 240 degrees from 0 to its maximum: 120 km/h for the Model T, 240 km/h for the GT3
  var needle, hSpeed, speedoMax = 120;
  function buildSpeedo(max) {
    speedoMax = max;
    var deg = 240 / max, step = max > 150 ? 20 : 10, lab = max > 300 ? 60 : max > 150 ? 40 : 20;
    var s = '<svg viewBox="0 0 120 120" role="img" aria-label="Speedometer"><circle cx="60" cy="60" r="56" fill="rgba(16,14,12,.62)" stroke="#e6bb5c" stroke-width="4"/>';
    for (var k = 0; k <= max; k += step) {
      var a = (-210 + k * deg) * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
      s += '<line x1="' + (60 + c * 44) + '" y1="' + (60 + n * 44) + '" x2="' + (60 + c * 51) + '" y2="' + (60 + n * 51) + '" stroke="#fff8ea" stroke-width="2"/>';
      if (k % lab === 0) s += '<text x="' + (60 + c * 34) + '" y="' + (60 + n * 34 + 3.5) + '" font-size="9" fill="#fff8ea" text-anchor="middle" font-family="Consolas,monospace">' + k + '</text>';
    }
    s += '<line id="needle" x1="60" y1="60" x2="102" y2="60" stroke="#f07a48" stroke-width="3" stroke-linecap="round" transform="rotate(-210 60 60)"/><circle cx="60" cy="60" r="5" fill="#e6bb5c"/>';
    s += '<text id="hSpeed" x="60" y="92" font-size="17" font-weight="600" fill="#fff8ea" text-anchor="middle" font-family="Consolas,monospace">0</text><text x="60" y="103" font-size="7" fill="#e6bb5c" text-anchor="middle" font-family="Consolas,monospace" letter-spacing="1">KM/H</text></svg>';
    $('speedo').innerHTML = s; needle = $('needle'); hSpeed = $('hSpeed');
  }
  buildSpeedo(VEH[myVeh].speedoMax);
  var hDraft = $('hDraft'), hNet = $('hNet'), menuNet = $('menuNet'), hBoost = $('hBoost'), hBoostFill = $('hBoostFill');
  // track map: drawn from the real centre line, so it always matches the circuit
  function buildMap() {
    var b = K.bounds, pad = 22, vb = K.kind === 'oval' ? [-185, -92, 370, 184] : [b.minx - pad, b.minz - pad, b.maxx - b.minx + 2 * pad, b.maxz - b.minz + 2 * pad];
    mapSc = Math.max(1, Math.max(vb[2], vb[3]) / 370); // the map box is square at most, so the longer side sets the scale
    mapSvg.setAttribute('viewBox', vb.join(' '));
    $('mapTrack').setAttribute('d', 'M' + K.outline(6).map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'Z');
    $('mapTrack').setAttribute('stroke-width', String(11 * mapSc));
    var a = K.pos(K.LINE, -11, 0), c = K.pos(K.LINE, 11, 0), l = $('mapLine');
    l.setAttribute('x1', a.x); l.setAttribute('y1', a.z); l.setAttribute('x2', c.x); l.setAttribute('y2', c.z); l.setAttribute('stroke-width', String(6 * mapSc));
    $('mapCar').setAttribute('r', String(11 * mapSc)); $('mapCar').setAttribute('stroke-width', String(3 * mapSc)); $('mapGhost').setAttribute('r', String(10 * mapSc));
    ais.forEach(function (a) { a.dot.setAttribute('r', String(8 * mapSc)); });
    for (var id in remotes) { remotes[id].dot.setAttribute('r', String(10 * mapSc)); remotes[id].dot.setAttribute('stroke-width', String(3 * mapSc)); }
  }
  buildMap();
  function toast(text, cls) { toastEl.textContent = text; toastEl.className = cls || ''; toastEl.hidden = false; toastT = 2.6; }
  TF.toast = toast;
  // ---------- leaderboards ----------
  // every car keeps a running distance (phys.pg): metres past the start line, growing lap after lap
  var lbClass = $('lbClass'), lbAll = $('lbAll'), lbT = 0, hLapNow = $('hLapNow'), hLapOf = $('hLapOf');
  function trackProgress(ph) {
    var l = ph.loc; if (!l) return;
    if (ph.ps == null) { ph.pg = l.s - START_S; ph.ps = l.s; return; }
    var d = l.s - ph.ps; if (d > LAP / 2) d -= LAP; else if (d < -LAP / 2) d += LAP;
    ph.pg += d; ph.ps = l.s;
  }
  function racers() {
    var r = [{ ph: phys, veh: myVeh, name: palette(myVeh)[save.color][0] + ' #' + save.num, hex: palette(myVeh)[save.color][1], me: true }];
    ais.forEach(function (a) { r.push({ ph: a.phys, veh: a.veh, name: palette(a.veh)[a.col][0] + ' #' + a.num, hex: palette(a.veh)[a.col][1] }); });
    for (var id in remotes) { var o = remotes[id], p = palette(o.veh)[o.col] || COLORS[0]; r.push({ ph: o.phys, veh: o.veh, name: p[0] + ' #' + o.num, hex: p[1] }); }
    return r;
  }
  function boardHtml(title, list) {
    var mi = 0; list.forEach(function (c, i) { if (c.me) mi = i; });
    var show = list.slice(0, 6).map(function (c, i) { return [c, i]; });
    if (mi >= 6) show.push([list[mi], mi]);
    var h = '<div class="lb-h"><span>' + title + '</span><b>P' + (mi + 1) + '/' + list.length + '</b></div>';
    show.forEach(function (x, j) {
      var c = x[0], hex = ('00000' + c.hex.toString(16)).slice(-6);
      h += '<div class="lb-r' + (c.me ? ' me' : '') + (j === 6 ? ' gap' : '') + '"><em>' + (x[1] + 1) + '</em><i style="background:#' + hex + '"></i><span>' + (c.me ? 'YOU · ' : '') + c.name + '</span></div>';
    });
    return h;
  }
  function updateLeaderboards(dt) {
    var r = racers(); r.forEach(function (c) { trackProgress(c.ph); });
    lbT -= dt; if (lbT > 0) return; lbT = 0.25;
    r.sort(function (a, b) { return (b.ph.pg || 0) - (a.ph.pg || 0); });
    var cls = r.filter(function (c) { return c.veh === myVeh; });
    var title = myVeh === 'lmp1' ? 'LMP1 CLASS' : myVeh === 'gt3' ? 'GT3 CLASS' : 'RACE';
    var a = boardHtml(title, cls), b = cls.length === r.length ? '' : boardHtml('OVERALL', r);
    if (lbClass.innerHTML !== a) lbClass.innerHTML = a;
    if (lbAll.innerHTML !== b) lbAll.innerHTML = b;
    lbAll.hidden = !b;
    r.forEach(function (c, i) { if (c.me) posAll = i + 1; }); cls.forEach(function (c, i) { if (c.me) posCls = i + 1; }); nAll = r.length; nCls = cls.length;
    // time gaps to the car in front and the car behind (all classes): the distance between you divided by the speed of the one who has to close it
    var mi = 0; r.forEach(function (c, i) { if (c.me) mi = i; });
    var gapTxt = function (x, other, sign) {
      var el = $(x), sp = el.querySelector('span'), nm = el.querySelector('em');
      if (!other) { sp.textContent = '--'; nm.textContent = ''; return; }
      var dist = Math.abs(other.ph.pg - phys.pg), who = sign > 0 ? phys : other.ph, t = dist / Math.max(10, Math.abs(who.u));
      sp.textContent = dist >= LAP ? sign * Math.floor(dist / LAP) + ' LAP' : (sign > 0 ? '+' : '-') + t.toFixed(1) + 's';
      nm.textContent = other.name;
    };
    gapTxt('gAhead', mi > 0 ? r[mi - 1] : null, 1); gapTxt('gBehind', mi < r.length - 1 ? r[mi + 1] : null, -1);
  }
  function updateHud() {
    hLap.textContent = 'LAP ' + (lap < 0 ? 1 : lap + 1);
    var lapNow = String(Math.min(save.laps, lap < 0 ? 1 : lap + 1)), lapOf = '/ ' + save.laps; // the big counter, bottom left
    if (hLapNow.textContent !== lapNow) hLapNow.textContent = lapNow;
    if (hLapOf.textContent !== lapOf) hLapOf.textContent = lapOf;
    hTime.textContent = fmt(lap < 0 ? 0 : lapT);
    hBest.textContent = fmt(save.best);
    if (gap == null) { hGap.textContent = '--'; hGap.className = 'v ghost'; }
    else { hGap.textContent = (gap >= 0 ? '+' : '-') + Math.abs(gap).toFixed(2); hGap.className = 'v ' + (gap <= 0 ? 'ahead' : 'behind'); }
    if (hFlag.textContent !== flag) hFlag.textContent = flag;
    var camTxt = keys.KeyB && camMode === 'chase' ? 'REAR VIEW' : CAM_NAMES[camMode];
    if (hCam.textContent !== camTxt) hCam.textContent = camTxt;
    // boost energy bar (LMP1 only)
    var hasBoost = phys.cfg.boost; if (hBoost.hidden === hasBoost) hBoost.hidden = !hasBoost;
    if (hasBoost) { hBoostFill.style.width = Math.round(phys.boostE * 100) + '%'; hBoost.classList.toggle('on', !!phys.boosting); }
    var kmh = Math.abs(phys.u) * 3.6;
    hSpeed.textContent = Math.round(kmh);
    needle.setAttribute('transform', 'rotate(' + (-210 + Math.min(kmh, speedoMax * 1.04) * (240 / speedoMax)).toFixed(1) + ' 60 60)');
    mapCar.setAttribute('cx', phys.x.toFixed(1)); mapCar.setAttribute('cy', phys.z.toFixed(1));
    for (var i = 0; i < ais.length; i++) { ais[i].dot.setAttribute('cx', ais[i].phys.x.toFixed(1)); ais[i].dot.setAttribute('cy', ais[i].phys.z.toFixed(1)); }
    hDraft.style.opacity = phys.draft > 0.08 ? Math.min(1, phys.draft * 1.3).toFixed(2) : '0';
    if (ghostCar.visible) { mapGhost.setAttribute('cx', ghostCar.position.x.toFixed(1)); mapGhost.setAttribute('cy', ghostCar.position.z.toFixed(1)); mapGhost.setAttribute('visibility', 'visible'); }
    else mapGhost.setAttribute('visibility', 'hidden');
  }

  // ---------- menus ----------
  var swatchSets = [];
  function setColor(i) {
    var wasP = livery(palette(myVeh)[save.color][1]), nowP = livery(palette(myVeh)[i][1]);
    save.color = i;
    if (wasP !== nowP) { // the Porsche livery has its own parts, so the car is rebuilt
      scene.remove(car); car = TF.buildVehicle(myVeh, palette(myVeh)[i][1], false, save.num); body = car.userData.body; scene.add(car); me.mesh = car; me.body = body;
    } else car.userData.paint.forEach(function (m) { m.color.setHex(palette(myVeh)[i][1]); });
    swatchSets.forEach(function (set) { set.forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); }); });
    persist();
  }
  function buildSwatches() {
   swatchSets = [];
   ['menuSwatches', 'pauseSwatches'].forEach(function (id) {
    var set = [];
    $(id).innerHTML = '';
    palette(myVeh).forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.title = c[0]; b.setAttribute('aria-label', c[0] + ' paint');
      b.style.background = '#' + ('00000' + c[1].toString(16)).slice(-6);
      b.setAttribute('aria-pressed', i === save.color ? 'true' : 'false');
      b.addEventListener('click', function () { setColor(i); b.blur(); });
      $(id).appendChild(b); set.push(b);
    });
    swatchSets.push(set);
   });
  }
  buildSwatches();
  // your race number: typed on the start screen, painted on the car
  var carNum = $('carNum'); carNum.value = save.num;
  carNum.addEventListener('input', function () {
    var n = parseInt(this.value, 10); if (isNaN(n)) return; n = clamp(n, 0, 99);
    if (n === save.num) return;
    save.num = n; scene.remove(car);
    car = TF.buildVehicle(myVeh, palette(myVeh)[save.color][1], false, n); body = car.userData.body; scene.add(car);
    me.mesh = car; me.body = body; persist();
  });
  carNum.addEventListener('change', function () { var n = clamp(parseInt(this.value, 10) || 0, 0, 99); this.value = n; this.blur(); });
  // ---------- switching circuit ----------
  // rebuild the world and everything that depends on the circuit; the cars go back to the grid
  function setTrack(id) {
    if (TF.trackId === id) return;
    TF.setTrack(id); LAP = K.LAP; START_S = K.START; profiles = {};
    world.setTrack(); fx.reset(); buildMap();
    ais.forEach(function (a) { a.prof = profileFor(a.veh); });
    applyAiCounts(wantedCounts()); // the field depends on the circuit
    buildGhostLine(); gap = null;
    resetRun();
  }

  // ---------- settings: choose the vehicle ----------
  var settingsOpen = false;
  function updateVehicleUi() {
    var cf = VEH[myVeh];
    $('menuSub').textContent = 'FREE PRACTICE · ' + cf.name.toUpperCase() + ' · ' + K.name.toUpperCase();
    document.querySelectorAll('.veh').forEach(function (b) { b.setAttribute('aria-checked', VEH[b.dataset.veh].family === cf.family ? 'true' : 'false'); }); // the GT3 tile also covers the LMP1
    document.querySelectorAll('.shift-desc').forEach(function (el) { el.textContent = cf.shiftText; });
    // the little button at the top left: only for the GT3 family, switches between GT3 and LMP1
    var lb = $('btnLmp'); lb.hidden = cf.family !== 'gt3';
    lb.textContent = myVeh === 'lmp1' ? 'Switch to GT3' : save.lmpOk ? 'Switch to LMP1' : 'LMP1 locked · drive a GT3 lap under ' + fmt(LMP_UNLOCK);
    lb.disabled = myVeh !== 'lmp1' && !save.lmpOk; lb.classList.toggle('locked', lb.disabled);
  }
  function setVehicle(id) {
    if (!VEH[id] || id === myVeh || (id === 'lmp1' && !save.lmpOk)) return;
    save.store[myVeh] = lapEntry(myVeh); // keep this vehicle's best lap
    myVeh = id; save.veh = id;
    var st = save.store[id]; save.best = st ? st.best : null; save.ghost = st ? st.ghost : null;
    scene.remove(car); scene.remove(ghostCar);
    car = TF.buildVehicle(id, palette(id)[save.color][1], false, save.num); body = car.userData.body; scene.add(car);
    ghostCar = TF.buildVehicle(id, 0, true); ghostCar.visible = false; scene.add(ghostCar);
    me.mesh = car; me.body = body; me.flT = -1; me.spin = 0; flashLight.intensity = 0;
    phys.setVehicle(id); sound.setProfile(id); buildSpeedo(VEH[id].speedoMax);
    setTrack(VEH[id].track); // each vehicle has its own circuit
    buildGhostLine(); gap = null;
    resetRun();
    buildSwatches();
    updateVehicleUi(); persist();
  }
  function openSettings() {
    settingsOpen = true; $('menu').hidden = true; $('settings').hidden = false;
    var b = document.querySelector('.veh[aria-checked="true"]'); if (b) b.focus();
  }
  function closeSettings() {
    settingsOpen = false; $('settings').hidden = true; $('menu').hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  $('btnSettings').addEventListener('click', openSettings);
  $('btnSetBack').addEventListener('click', closeSettings);
  document.querySelectorAll('.veh').forEach(function (b) { b.addEventListener('click', function () { if (VEH[b.dataset.veh].family !== VEH[myVeh].family) setVehicle(b.dataset.veh); }); });
  $('btnLmp').addEventListener('click', function () { setVehicle(myVeh === 'lmp1' ? 'gt3' : 'lmp1'); this.blur(); });
  updateVehicleUi();

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
  function toMenu() {
    state = 'menu'; keys = {}; sound.silence(); resetRun(); // everyone, AI included, goes back to the starting positions
    $('pause').hidden = true; hud.hidden = true; $('menu').hidden = false;
  }
  $('btnMenu').addEventListener('click', toMenu);
  // the race is over: show the result for a few seconds, then back to the start screen
  function endRace() {
    finished = true; endT = 4.5;
    var cl = myVeh === 'lmp1' ? 'LMP1' : myVeh === 'gt3' ? 'GT3' : '';
    toast('FINISHED · P' + posAll + ' of ' + nAll + (cl && nCls !== nAll ? ' · P' + posCls + ' ' + cl : '') + ' · ' + fmt(raceT), 'best'); toastT = endT;
  }
  $('menu').addEventListener('click', function (e) { if (!e.target.closest('.swatches, .ai-row, .online-row, .settings-btn, .lmp-btn')) startDrive(); });

  // online with a room code (only when the game is opened as a normal page, not as an artifact)
  var NET_ERRORS = { load: 'Could not reach the connection service. Check the internet.', code: 'A code has 5 letters or numbers.', 'peer-unavailable': 'No game with that code. Check the code with the host.', timeout: 'No answer from the host. Try again.', 'unavailable-id': 'Could not create a code. Try again.', full: 'That game is full (9 players).' };
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
  [['aiCount', 'ai', AI_MAX.tford], ['aiGt3', 'aiGt3', AI_MAX.gt3], ['aiLmp', 'aiLmp', AI_MAX.lmp1]].forEach(function (s) {
    var el = $(s[0]);
    el.addEventListener('input', function () { save[s[1]] = clamp(+this.value | 0, 0, s[2]); persist(); applyAiCounts(wantedCounts()); });
    el.addEventListener('change', function () { this.blur(); });
  });
  applyAiCounts(wantedCounts());
  // how many laps the race lasts (1 to 50)
  var raceLapsEl = $('raceLaps');
  function syncLapsUi() { raceLapsEl.value = save.laps; $('raceLapsLabel').textContent = save.laps; }
  syncLapsUi();
  raceLapsEl.addEventListener('input', function () { save.laps = clamp(+this.value | 0, 1, 50); syncLapsUi(); persist(); });
  raceLapsEl.addEventListener('change', function () { this.blur(); });

  // ---------- keyboard ----------
  var DRIVE_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1 };
  window.addEventListener('keydown', function (e) {
    if (TF.uiLock) return; // the account panel is open
    var c = e.code;
    if (e.target && e.target.id === 'joinCode') { if (c === 'Enter' || c === 'NumpadEnter') doJoin(); return; } // typing a game code
    if (e.target && /^(ai(Count|Gt3|Lmp)|carNum|raceLaps)$/.test(e.target.id) && c !== 'Enter' && c !== 'NumpadEnter') return; // let the sliders use their own keys
    if (settingsOpen) { if (c === 'Escape') { e.preventDefault(); closeSettings(); } return; } // the settings panel works with the mouse, Tab and Enter
    if (DRIVE_KEYS[c]) e.preventDefault();
    if (e.repeat) return;
    if (c === 'KeyM') { sound.setMuted(!sound.muted); if (state === 'drive') toast(sound.muted ? 'Sound off' : 'Sound on'); return; }
    if (state === 'menu') {
      if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); startDrive(); }
      else if (c === 'ArrowRight' || c === 'KeyD') setColor((save.color + 1) % COLORS.length);
      else if (c === 'ArrowLeft' || c === 'KeyA') setColor((save.color + COLORS.length - 1) % COLORS.length);
      else if (c === 'ArrowUp' || c === 'KeyW') setAiCount(mainAi() + 1);
      else if (c === 'ArrowDown' || c === 'KeyS') setAiCount(mainAi() - 1);
      return;
    }
    if (state === 'pause') { if (c === 'Escape' || c === 'KeyP') resume(); return; }
    sound.start();
    keys[c] = true;
    if (c === 'Escape' || c === 'KeyP') pause();
    else if (c === 'KeyC') { camMode = camMode === 'chase' ? 'driver' : camMode === 'driver' ? 'hood' : 'chase'; hCam.textContent = CAM_NAMES[camMode]; } // chase -> driver's seat -> on the hood
    else if (c === 'KeyH') sound.horn();
    else if (c === 'KeyG') { ghostOn = !ghostOn; toast(ghostOn ? 'Ghost on' : 'Ghost off'); }
    else if (c === 'KeyR') resetCar();
    else if (c === 'ShiftLeft' || c === 'ShiftRight') onShift();
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
    if (!ownTrack()) { toast('Lap ' + fmt(t)); return; } // another player's circuit: no records
    if (TF.account && (save.best == null || t < save.best)) TF.account.lap(K.id, myVeh, t); // a new personal best also goes to the global leaderboard
    if (myVeh === 'gt3' && !save.lmpOk && t < LMP_UNLOCK) { save.lmpOk = true; persist(); updateVehicleUi(); toast('LMP1 unlocked! ' + fmt(t), 'best'); if (save.best == null || t < save.best) { save.best = t; save.ghost = packRec(rec); persist(); buildGhostLine(); } return; }
    if (save.best == null || t < save.best) { save.best = t; save.ghost = packRec(rec); persist(); buildGhostLine(); toast('New best lap ' + fmt(t), 'best'); }
    else toast('Lap ' + fmt(t) + '  +' + (t - save.best).toFixed(2));
  }
  function simulate(dt) {
    inp.thr = !!(keys.KeyW || keys.ArrowUp); inp.brk = !!(keys.KeyS || keys.ArrowDown); inp.hand = !!keys.Space; inp.boost = !!(keys.ShiftLeft || keys.ShiftRight);
    inp.steer = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
    if (finished) { inp.thr = false; inp.brk = true; inp.boost = false; inp.steer = 0; endT -= dt; if (endT <= 0) { toMenu(); return; } } // over the line: the car stops, then the start screen
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
        finishLap(lapT - over); raceT += lapT - over; raceCount++;
        lap++; lapT = over; lapValid = true; rec = newRec(); gp = 0;
        if (!finished && raceCount >= save.laps) endRace();
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
    if (g && lap >= 0 && lapValid && ownTrack()) {
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
    var ex = phys.cfg.exhaust;
    exT += dt * (5 + (inp.thr ? 12 : 0));
    while (exT > 1) { exT -= 1; if (phys.cfg.puffs) fx.spawn('exhaust', phys.x - fxv * ex[0] + rxv * ex[1], loc.y + ex[2], phys.z - fzv * ex[0] + rzv * ex[1], wx * 0.4 - fxv, 0.4, wz * 0.4 - fzv); }
    if (phys.hit > 1) sound.thump(phys.hit);
    var flyNow = phys.air > 0; // thump on take-off and on landing
    if (flyNow !== wasBump) sound.thump(flyNow ? 2 : 4);
    wasBump = flyNow;
    var sparks = (phys.hit > 1.5 ? Math.min(14, phys.hit * 3) : 0) + (phys.scrape && Math.random() < dt * 30 ? 1 : 0);
    var snx = phys.wnx, snz = phys.wnz;
    for (i = 0; i < sparks; i++) fx.spawn('spark', phys.x + snx * 0.8 + fxv * (Math.random() * 2 - 1), loc.y + 0.3 + Math.random() * 0.5, phys.z + snz * 0.8 + fzv * (Math.random() * 2 - 1),
      wx * 0.5 - snx * (1 + Math.random() * 2) + (Math.random() - .5) * 2, 1 + Math.random() * 2.5, wz * 0.5 - snz * (1 + Math.random() * 2) + (Math.random() - .5) * 2);

    // sound
    var rpm = phys.cfg.rpm(phys.gear, sp);
    var squeal = paved && sp > 2 ? clamp((Math.max(phys.slipF, phys.slipR) - 0.06) / 0.14, 0, 1) * Math.min(1, sp / 6) : 0;
    if (inp.hand && sp > 3 && paved) squeal = 1;
    sound.update({ rpm: rpm, thr: inp.thr ? 1 : 0, slide: squeal, speed: sp, scrape: phys.scrape, boost: phys.boosting });
    TF.rpm = rpm;
  }

  // ---------- visuals ----------
  var camOverride = null;
  var tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), eul = new T.Euler(0, 0, 0, 'YXZ'), lookQ = new T.Quaternion();
  // put a car model where its physics says: position, lean, wheels, steering wheel
  function pose(c, dt) {
    var p = c.phys, loc = p.loc, k = Math.min(1, 8 * (dt || 0.016)), b = c.body, ud = c.mesh.userData, cf = p.cfg;
    // ramp kerbs: height under the left and right wheels tips and lifts the car; a launch adds a hop
    var sxv = Math.sin(p.psi) * cf.halfTrack, szv = Math.cos(p.psi) * cf.halfTrack;
    var rhL = K.locate(p.x - sxv, p.z - szv, loc.s).rh, rhR = K.locate(p.x + sxv, p.z + szv, loc.s).rh;
    var fly = p.air > 0 ? 1 - p.air / TF.AIR : -1, hop = fly >= 0 ? 4 * 0.5 * fly * (1 - fly) : 0;
    var rampRoll = -(rhR - rhL) / (2 * cf.halfTrack) + (fly >= 0 ? -p.airSide * 0.22 * Math.sin(fly * Math.PI) : 0);
    c.mesh.position.set(p.x, loc.y + (rhL + rhR) / 2 + hop, p.z); c.mesh.rotation.y = p.psi;
    // kick animation: the leg swings out to horizontal and back in 0.4 s
    if (p.kickT > 0) {
      p.kickT -= dt;
      var leg = p.kickSide > 0 ? ud.legs.R : ud.legs.L, ang = Math.sin((1 - Math.max(0, p.kickT) / 0.4) * Math.PI) * 1.4;
      ud.legs.L.visible = ud.legs.R.visible = false;
      if (p.kickT > 0) { leg.visible = true; leg.rotation.x = p.kickSide > 0 ? -ang : ang; }
    }
    var fxv = Math.cos(p.psi), fzv = -Math.sin(p.psi), rxv = Math.sin(p.psi), rzv = Math.cos(p.psi);
    var bank = (loc.b >= 0 ? loc.d > -K.HW : loc.d < K.HW) ? loc.b : 0; // on the road or its raised side
    var rollT = -bank * (rxv * loc.nx + rzv * loc.nz) + clamp(cf.rollK * p.latAcc, -cf.rollMax, cf.rollMax) + 0.09 * Math.sin(p.wobble * 13) * Math.min(1, p.wobble) + rampRoll;
    var pitchT = bank * (fxv * loc.nx + fzv * loc.nz) + clamp(cf.pitchK * p.longAcc, -cf.pitchMax, cf.pitchMax);
    b.rotation.x += (rollT - b.rotation.x) * k; b.rotation.z += (pitchT - b.rotation.z) * k;
    c.spin -= p.u / cf.wheelR * dt;
    for (var i = 0; i < 4; i++) { ud.wheels[i].spin.rotation.z = c.spin; if (ud.wheels[i].front) ud.wheels[i].steer.rotation.y = p.delta; }
    ud.steeringWheel.rotation.z = p.steer * 1.7;
    animateFlash(c, dt);
    if (ud.setBoost) ud.setBoost(p.boosting ? 1 : 0);
  }
  function updateCar(dt) {
    var loc = phys.loc;
    pose(me, dt);
    for (var i = 0; i < ais.length; i++) { // cars far away are not drawn at all, which keeps a field of 30 cars quick to render
      var af = Math.hypot(ais[i].phys.x - phys.x, ais[i].phys.z - phys.z) > 700;
      if (ais[i].mesh.visible === af) ais[i].mesh.visible = !af;
      if (!af) pose(ais[i], dt);
    }
    for (var id in remotes) { var ro = remotes[id]; pose(ro, dt); ro.dot.setAttribute('cx', ro.phys.x.toFixed(1)); ro.dot.setAttribute('cy', ro.phys.z.toFixed(1)); }
    body.position.y = state === 'drive' ? Math.sin(time * (TF.rpm || 450) / 60 * 2 * Math.PI * 2) * phys.cfg.vibe : 0;
    // while flashing, the GT3's spotlight lights the road just ahead
    var fon = me.flT >= 0 && flashOn(me.flT);
    flashLight.intensity = fon ? 40 : 0;
    if (fon) {
      var ffx = Math.cos(phys.psi), ffz = -Math.sin(phys.psi);
      flashLight.position.set(phys.x + ffx * 2.2, loc.y + 0.7, phys.z + ffz * 2.2);
      flashLight.target.position.set(phys.x + ffx * 30, loc.y, phys.z + ffz * 30); flashLight.target.updateMatrixWorld();
    }
    if (!car.userData.vehicle) car.userData.driver.visible = !(state === 'drive' && camMode === 'driver') && !(state === 'pause' && camMode === 'driver'); // (the GT3 and prototype have no driver at all)
    car.updateMatrixWorld(true);
    world.followSun(phys.x, loc.y, phys.z);
  }
  function updateGhost() {
    var g = save.ghost, show = false;
    if (g && ghostOn && lap >= 0 && state !== 'menu' && ownTrack()) {
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
    var lookBack = state === 'drive' && !!keys.KeyB; // hold B to look behind you
    if (camOverride) { // test hook: a fixed camera, given in the car's own coordinates
      var co = camOverride; cam.fov = co.fov || 36; cam.near = 0.05; cam.up.set(0, 1, 0);
      cam.position.copy(body.localToWorld(tmpV.set(co.pos[0], co.pos[1], co.pos[2]))); cam.lookAt(body.localToWorld(tmpV.set(co.look[0], co.look[1], co.look[2])));
      cam.updateProjectionMatrix(); return;
    }
    if (state === 'menu') {
      var a = 0.73 + 0.3 * Math.sin(time * 0.2), mc = phys.cfg.menuCam;
      cam.fov = 36; cam.near = 0.5; cam.up.set(0, 1, 0);
      cam.position.copy(body.localToWorld(tmpV.set(mc.r * Math.cos(a), mc.h, -mc.r * Math.sin(a))));
      cam.lookAt(body.localToWorld(tmpV.set(mc.look[0], mc.look[1], mc.look[2])));
    } else if (lookBack && camMode === 'chase') {
      // rear view: just above the car, looking back along the track
      var cb = phys.cfg.chase, bf = Math.cos(phys.psi), bz = -Math.sin(phys.psi);
      camYaw = phys.psi; // so the normal chase camera does not swing round when B is released
      cam.fov = 62; cam.near = 0.3; cam.up.set(0, 1, 0);
      cam.position.set(phys.x + bf * 0.3, phys.loc.y + cb.up - 0.6, phys.z + bz * 0.3);
      cam.lookAt(phys.x - bf * 25, phys.loc.y + 0.9, phys.z - bz * 25);
    } else if (camMode === 'hood') {
      // on the bonnet, a little above it, looking straight down the road (the car can give its own spot; otherwise a place ahead of the seat)
      var hp = car.userData.hood || [phys.cfg.eye[0] + 1.5, phys.cfg.eye[1] - 0.2, 0];
      cam.fov = 72; cam.near = 0.1;
      cam.position.copy(body.localToWorld(tmpV.set(hp[0], hp[1], hp[2])));
      eul.set(phys.cfg.eyePitch * .5, lookBack ? Math.PI / 2 : -Math.PI / 2, 0);
      cam.quaternion.copy(body.getWorldQuaternion(tmpQ)).multiply(lookQ.setFromEuler(eul));
    } else if (camMode === 'driver') {
      var ey = car.userData.eye || phys.cfg.eye; // a model can give its own seat position
      cam.fov = 66; cam.near = 0.1;
      cam.position.copy(body.localToWorld(tmpV.set(ey[0], ey[1], ey[2])));
      eul.set(phys.cfg.eyePitch, lookBack ? Math.PI / 2 : -Math.PI / 2, 0); // turned right round when looking back
      cam.quaternion.copy(body.getWorldQuaternion(tmpQ)).multiply(lookQ.setFromEuler(eul));
    } else {
      camYaw += wrapPi(phys.psi - camYaw) * Math.min(1, 4.5 * dt);
      var ch = phys.cfg.chase, cx = phys.x - Math.cos(camYaw) * ch.back, cz = phys.z + Math.sin(camYaw) * ch.back, cw = K.stadium(cx, cz, phys.loc.s);
      if (cw.d > 6.2) { cx -= cw.nx * (cw.d - 6.2); cz -= cw.nz * (cw.d - 6.2); }
      var cl = K.locate(cx, cz, phys.loc.s);
      cam.fov = 55 + Math.min(1, Math.abs(phys.u) / phys.cfg.topSpeed) * 9 + phys.draft * 5; cam.near = 0.5; cam.up.set(0, 1, 0);
      cam.position.set(cx, Math.max(phys.loc.y, cl.y) + ch.up, cz);
      cam.lookAt(phys.x + Math.cos(phys.psi) * ch.ahead, phys.loc.y + ch.look, phys.z - Math.sin(phys.psi) * ch.ahead);
    }
    // with the settings panel open, slide the picture left so the car sits in the free part of the screen
    var vw = window.innerWidth, vh = window.innerHeight, panel = Math.min(400, vw);
    if (state === 'menu' && settingsOpen && vw > 520) cam.setViewOffset(vw, vh, panel / 2, 0, vw, vh); else if (cam.view) cam.clearViewOffset();
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
    if (state === 'drive') { updateHud(); updateLeaderboards(dt); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }
    renderer.render(scene, cam);
  }
  var last = performance.now();
  function frame(now) { var dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt > 0) tick(dt); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  // handles for testing from the browser console
  TF.game = {
    // test hook: render one frame at a given size and return it as a JPEG data URL, whatever the preview pane is doing
    setCamOverride: function (o) { camOverride = o; },
    snapshot: function (w, h) {
      var ow = window.innerWidth, oh = window.innerHeight; renderer.setPixelRatio(1); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      updateCamera(0); renderer.render(scene, cam); var url = renderer.domElement.toDataURL('image/jpeg', 0.88);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); resize(); return url;
    },
    raceInfo: function () { return { count: raceCount, laps: save.laps, finished: finished, endT: endT, raceT: raceT, state: state }; },
    unlockLmp: function (on) { save.lmpOk = on !== false; updateVehicleUi(); }, finishLapTest: function (t) { lapValid = true; finishLap(t); },
    phys: phys, fx: fx, ais: ais, kick: playerKick, onShift: onShift, boostInfo: function () { return { e: phys.boostE, on: phys.boosting }; }, setVehicle: setVehicle, setTrack: setTrack, trackId: function () { return K.id; }, vehicle: function () { return myVeh; }, aiKinds: aiCounts, setAiMix: function (g, l) { save.aiGt3 = clamp(g | 0, 0, 20); save.aiLmp = clamp(l | 0, 0, 10); applyAiCounts(wantedCounts()); },
    flashInfo: function () { return { flT: me.flT, seq: flashSeq, intensity: flashLight.intensity }; },
    netInfo: function () { return { status: net.status, online: online, isHost: isHost, slot: slot, me: myPeer, remotes: Object.keys(remotes).map(function (id) { var p = remotes[id].phys; return { id: id, x: r2(p.x), z: r2(p.z), u: r2(p.u), wobble: p.wobble }; }), ais: ais.length, aiRemote: ais.length ? !!ais[0].phys.remote : null, ai0: ais.length ? [r2(ais[0].phys.x), r2(ais[0].phys.z)] : null }; }, buildGhostLine: buildGhostLine, hasGhostLine: function () { return !!ghostLine; }, setAiCount: setAiCount, keys: function () { return keys; }, tick: tick, start: startDrive, save: save,
    info: function () { return { track: K.id, state: state, lap: lap, lapT: lapT, q: q, valid: lapValid, best: save.best, gap: gap, kmh: Math.abs(phys.u) * 3.6, s: phys.loc.s, d: phys.loc.d, lapsDone: lapsDone, cam: camMode }; },
    press: function (code, down) { keys[code] = down; }
  };
})();
