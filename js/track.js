// Track maths. No rendering here, only geometry. There are two circuits and the game can switch between them:
//   'classic'  the 727 m circuit inside the old oval stadium (Model T Ford): banked turn, chicane, hairpin, infield.
//   'spa'      the real Spa-Francorchamps (GT3), with banking added: fast sweepers lean in up to 15 degrees, slow hairpins hardly at all.
// s = distance along the centre line, d = sideways offset (negative = left of travel, positive = right).
// TF.Track is one live object. TF.setTrack(id) swaps everything on it, so every module keeps using TF.Track as before.
(function () {
  var TF = window.TF = window.TF || {};
  var HW = 7, STEP = 0.5, BANK_GRIP = 1.2, D2R = Math.PI / 180; // BANK_GRIP: banking presses the car into the road, which adds grip
  var RAMP0 = 7, RAMP1 = 8.6, RAMPH = 0.35, RAMPBACK = 0.15;   // inside ramp kerbs: rise away from the track, then drop off sharply

  function sm(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ---------- the "turtle": draws a centre line from straight lines and arcs ----------
  // per sample: position, heading, distance, curvature (left positive), bank, gravel width left/right, kerb flag
  function newTurtle(x, z, psi) {
    var t = { PX: [], PZ: [], PH: [], PS: [], PK: [], PB: [], GL: [], GR: [], KB: [], segs: {}, x: x, z: z, psi: psi, s: 0 };
    function put(k, b, o) { t.PX.push(t.x); t.PZ.push(t.z); t.PH.push(t.psi); t.PS.push(t.s); t.PK.push(k); t.PB.push(b); t.GL.push(o.gl || 0); t.GR.push(o.gr || 0); t.KB.push(o.kerb ? 1 : 0); }
    function mark(o, s0) { if (o.name) { if (!t.segs[o.name]) t.segs[o.name] = { s0: s0, s1: t.s }; else t.segs[o.name].s1 = t.s; } }
    t.line = function (len, o) {
      o = o || {}; var n = Math.max(1, Math.round(len / STEP)), st = len / n, s0 = t.s;
      for (var i = 0; i < n; i++) { put(0, 0, o); t.x += Math.cos(t.psi) * st; t.z -= Math.sin(t.psi) * st; t.s += st; }
      mark(o, s0);
    };
    t.arc = function (r, deg, o) { // deg > 0 turns left
      o = o || {}; var ang = deg * D2R, len = Math.abs(ang) * r, n = Math.max(1, Math.round(len / STEP)), st = len / n, dp = ang / n, s0 = t.s;
      var chord = 2 * r * Math.sin(Math.abs(dp) / 2);
      for (var i = 0; i < n; i++) {
        var u = i / n; put((deg > 0 ? 1 : -1) / r, o.bank ? o.bank * sm(Math.min(u, 1 - u) / 0.13) : 0, o);
        var pm = t.psi + dp / 2; t.x += Math.cos(pm) * chord; t.z -= Math.sin(pm) * chord; t.psi += dp; t.s += st;
      }
      mark(o, s0);
    };
    return t;
  }

  // ---------- turn a finished centre line into a track object ----------
  function finish(t, cfg) {
    var PX = t.PX, PZ = t.PZ, PH = t.PH, PS = t.PS, PK = t.PK, PB = t.PB, GL = t.GL, GR = t.GR, KB = t.KB, segs = t.segs;
    var N = PX.length, LAP = t.s, closeErr = Math.hypot(t.x - PX[0], t.z - PZ[0]), i;

    // sloped ramp kerbs on the inside of each slow corner. SA[i] = which side is the inside at sample i (-1 left, +1 right, 0 none)
    var SA = new Int8Array(N), corners = [];
    (function () {
      function inside(i) { return KB[i] && Math.abs(PK[i]) > 0.011 ? (PK[i] > 0 ? -1 : 1) : 0; } // only in real corners (radius under 90 m)
      var i = 0;
      while (i < N) {
        var sg = inside(i); if (!sg) { i++; continue; }
        var j = i; while (j < N && inside(j) === sg) j++;
        var a = i + 6, b = j - 6; // stop 3 m short of each end
        if (b > a) { for (var k = a; k < b; k++) SA[k] = sg; corners.push({ s0: PS[a], s1: PS[b - 1], side: sg }); }
        i = j;
      }
    })();

    // kerb and gravel zones for the scenery: every named piece that has kerbs
    var zones = [];
    for (var nm in segs) {
      var g = segs[nm], mid = Math.floor((g.s0 + g.s1) / 2 / LAP * N); mid = clamp(mid, 0, N - 1);
      if (!KB[mid]) continue;
      var gl = 0, gr = 0;
      for (i = 0; i < N; i++) if (PS[i] >= g.s0 && PS[i] <= g.s1) { if (GL[i] > gl) gl = GL[i]; if (GR[i] > gr) gr = GR[i]; }
      zones.push({ name: nm, s0: g.s0, s1: g.s1, gl: gl, gr: gr });
    }

    // suggested speed around the lap (used by the AI drivers)
    // One profile per vehicle: g0 = total sideways grip (both axles), k = extra grip per (m/s)^2 from downforce,
    // vmax = top speed, decel = braking the AI may count on. Where v^2 * curvature = grip(v) + gravity on the banking.
    // kArr (optional): curvature of some other line round the track (the racing line), one value every kStep metres
    function speedProfile(g0, k, vmax, decel, kArr, kStep) {
      var V = new Float32Array(N), i;
      for (i = 0; i < N; i++) {
        var kv = kArr ? kArr[Math.min(kArr.length - 1, Math.floor(PS[i] / kStep))] : PK[i];
        var sb = Math.max(0, (kv >= 0 ? 1 : -1) * Math.sin(PB[i])); // banking only helps when it leans into the corner
        var m = 1 + BANK_GRIP * sb, gb = 9.81 * sb, kap = Math.abs(kv), den = kap - g0 * k * m;
        V[i] = kap < 1e-4 || den <= 0 ? vmax : Math.min(vmax, Math.sqrt((g0 * m + gb) / den));
      }
      for (var pass = 0; pass < 2; pass++) for (i = N - 1; i >= 0; i--) { var nx = V[(i + 1) % N]; V[i] = Math.min(V[i], Math.sqrt(nx * nx + 2 * decel * STEP)); }
      return V;
    }
    var VP = speedProfile(5.9, 0, 33, 5.5); // the Model T Ford

    function rampH(rd) {
      if (rd <= RAMP0 || rd >= RAMP1 + RAMPBACK) return 0;
      return rd < RAMP1 ? (rd - RAMP0) / (RAMP1 - RAMP0) * RAMPH : (RAMP1 + RAMPBACK - rd) / RAMPBACK * RAMPH;
    }
    // surface height across the road. Positive bank (left turns) raises the right side, negative bank (right turns) the left side.
    function height(d, b) {
      if (!b) return 0;
      return b > 0 ? (clamp(d, -HW, HW + 0.5) + HW) * Math.sin(b) : (HW - clamp(d, -HW - 0.5, HW)) * Math.sin(-b);
    }
    function idx(sv) { var i = Math.floor(sv / LAP * N); if (i >= N) i = N - 1; if (i < 0) i = 0; while (i > 0 && PS[i] > sv) i--; while (i < N - 1 && PS[i + 1] <= sv) i++; return i; }

    // centre-line point at distance s: position, right-hand normal (nx,nz), tangent (tx,tz), bank b
    function tp(sv) {
      sv = ((sv % LAP) + LAP) % LAP;
      var i = idx(sv), j = (i + 1) % N, f = (sv - PS[i]) / ((j ? PS[j] : LAP) - PS[i]);
      var ps = PH[i] + wrapPi(PH[j] - PH[i]) * f, c = Math.cos(ps), sn = Math.sin(ps);
      return { x: PX[i] + (PX[j] - PX[i]) * f, z: PZ[i] + (PZ[j] - PZ[i]) * f, nx: sn, nz: c, tx: c, tz: -sn, b: PB[i] + (PB[j] - PB[i]) * f, k: PK[i] };
    }
    function pos(sv, d, h) { var t = tp(sv); return { x: t.x + t.nx * d, y: height(d, t.b) + (h || 0), z: t.z + t.nz * d }; }

    // inverse: track coordinates and surface for a world point. hint = a recent s value near the point (faster).
    function scan(px, pz, i0, n, step) {
      var best = 1e18, bi = 0;
      for (var k = 0; k < n; k += step) { var i = ((i0 + k) % N + N) % N, dx = px - PX[i], dz = pz - PZ[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
      return [bi, best];
    }
    function locate(px, pz, hint) {
      var r = null;
      if (hint != null) { r = scan(px, pz, idx(((hint % LAP) + LAP) % LAP) - 60, 121, 1); if (r[1] > 400) r = null; }
      if (!r) { r = scan(px, pz, 0, N, 4); r = scan(px, pz, r[0] - 5, 11, 1); }
      var i = r[0], c = Math.cos(PH[i]), sn = Math.sin(PH[i]), dx = px - PX[i], dz = pz - PZ[i];
      var d = dx * sn + dz * c, sv = PS[i] + dx * c - dz * sn, b = PB[i];
      var surface = Math.abs(d) <= 8 ? 'road' : ((d > 8 && d < 8 + GR[i]) || (d < -8 && d > -8 - GL[i])) ? 'gravel' : 'grass';
      return { s: ((sv % LAP) + LAP) % LAP, d: d, b: b, nx: sn, nz: c, tx: c, tz: -sn, y: height(d, b), surface: surface, k: PK[i],
        rs: SA[i], rd: d * SA[i], rh: SA[i] ? rampH(d * SA[i]) : 0 }; // inside ramp kerb: side, distance towards the inside, height here
    }

    // ----- walls -----
    // stadium(px, pz, hint) answers "how far into the wall is this point?" in one convention for every track: d = 7.25 means
    // the point is on the wall face, so a car whose half width is w touches it when d > 7.25 - w. nx,nz point out towards the wall.
    var stadium, barrierDist, ovalPoint = null, OVAL_LAP = 0;
    if (cfg.oval) {
      var R = cfg.oval.R, SL = cfg.oval.SL;
      stadium = function (px, pz) {
        var d, nx, nz, r;
        if (px >= -90 && px <= 90) { if (pz >= 0) { d = pz - R; nx = 0; nz = 1; } else { d = -pz - R; nx = 0; nz = -1; } }
        else { var cx = px > 90 ? 90 : -90; r = Math.hypot(px - cx, pz) || 1e-6; d = r - R; nx = (px - cx) / r; nz = pz / r; }
        return { d: d, nx: nx, nz: nz, tx: nz, tz: -nx };
      };
      barrierDist = function () { return 7.25; };
      OVAL_LAP = 2 * SL + 2 * Math.PI * R;
      ovalPoint = function (sv, d) {
        var a, nx, nz, cx, cz, ARC = Math.PI * R;
        if (sv < SL) { cx = -90 + sv; cz = R; nx = 0; nz = 1; }
        else if (sv < SL + ARC) { a = Math.PI / 2 - (sv - SL) / R; nx = Math.cos(a); nz = Math.sin(a); cx = 90 + R * nx; cz = R * nz; }
        else if (sv < 2 * SL + ARC) { cx = 90 - (sv - SL - ARC); cz = -R; nx = 0; nz = -1; }
        else { a = -Math.PI / 2 - (sv - 2 * SL - ARC) / R; nx = Math.cos(a); nz = Math.sin(a); cx = -90 + R * nx; cz = R * nz; }
        return { x: cx + nx * d, z: cz + nz * d };
      };
    } else {
      // barriers run along both sides of the road. Out in the open they stand back past the gravel; where the road is banked,
      // the barrier on the high side moves in to the top edge of the banking so nobody drives off it.
      var BR = new Float32Array(N), BL = new Float32Array(N), B0 = new Float32Array(N), C0 = new Float32Array(N);
      for (i = 0; i < N; i++) { B0[i] = Math.max(14, 8 + GR[i] + 5); C0[i] = Math.max(14, 8 + GL[i] + 5); }
      for (i = 0; i < N; i++) { // smooth over 24 m so the barrier does not jump
        var sr = 0, sl = 0; for (var q = -24; q <= 24; q++) { var ii = (i + q + N) % N; sr += B0[ii]; sl += C0[ii]; }
        BR[i] = sr / 49; BL[i] = sl / 49;
        var bk = PB[i], hi = HW + 0.6, w = 1 - sm(Math.abs(bk) / 0.12);
        if (bk > 0) BR[i] = hi + (BR[i] - hi) * w; else if (bk < 0) BL[i] = hi + (BL[i] - hi) * w;
      }
      barrierDist = function (sv, side) { var k = idx(((sv % LAP) + LAP) % LAP); return side > 0 ? BR[k] : BL[k]; };
      stadium = function (px, pz, hint) {
        var l = locate(px, pz, hint), k = idx(l.s), side = l.d >= 0 ? 1 : -1, B = side > 0 ? BR[k] : BL[k];
        return { d: 7.25 - B + Math.abs(l.d), nx: side * l.nx, nz: side * l.nz, tx: l.tx, tz: l.tz };
      };
    }

    function wrap(ds) { return ((ds + LAP / 2) % LAP + LAP) % LAP - LAP / 2; }
    function vAt(sv) { return VP[idx(((sv % LAP) + LAP) % LAP)]; }
    // a speed lookup function for any vehicle: makeProfile(g0, k, vmax, decel)(s)
    function makeProfile(g0, k, vmax, decel) { var V = speedProfile(g0, k, vmax, decel); return function (sv) { return V[idx(((sv % LAP) + LAP) % LAP)]; }; }

    // ----- the racing line -----
    // Pull a string tight between the road edges: the path settles into the shortest, smoothest line through the corners.
    // lineOffset(s) says how far from the centre line it runs, and the speed profile for it uses its own, gentler, curvature.
    var racing = null;
    function racingLine() {
      if (racing) return racing;
      var step = 2, M = Math.floor(LAP / step), cx = new Float32Array(M), cz = new Float32Array(M), nx = new Float32Array(M), nz = new Float32Array(M), d = new Float32Array(M), lim = 3.6, j, it;
      for (j = 0; j < M; j++) { var t = tp(j * step); cx[j] = t.x; cz[j] = t.z; nx[j] = t.nx; nz[j] = t.nz; }
      for (it = 0; it < 1200; it++) for (j = 0; j < M; j++) {
        var jp = (j + M - 1) % M, jn = (j + 1) % M;
        var px = (cx[jp] + nx[jp] * d[jp] + cx[jn] + nx[jn] * d[jn]) / 2, pz = (cz[jp] + nz[jp] * d[jp] + cz[jn] + nz[jn] * d[jn]) / 2;
        d[j] = clamp((px - cx[j]) * nx[j] + (pz - cz[j]) * nz[j], -lim, lim);
      }
      var tmp = new Float32Array(M); // a little smoothing so the line has no kinks
      for (it = 0; it < 12; it++) { for (j = 0; j < M; j++) tmp[j] = (d[(j + M - 1) % M] + 2 * d[j] + d[(j + 1) % M]) / 4; d.set(tmp); }
      var kl = new Float32Array(M);
      for (j = 0; j < M; j++) {
        var a = (j + M - 1) % M, b = j, c = (j + 1) % M, ax = cx[a] + nx[a] * d[a], az = cz[a] + nz[a] * d[a], bx = cx[b] + nx[b] * d[b], bz = cz[b] + nz[b] * d[b], ccx = cx[c] + nx[c] * d[c], ccz = cz[c] + nz[c] * d[c];
        var ux = bx - ax, uy = -(bz - az), vx = ccx - bx, vy = -(ccz - bz), cr = ux * vy - uy * vx, la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy), lc = Math.hypot(ccx - ax, ccz - az);
        kl[j] = la * lb * lc > 1e-6 ? 2 * cr / (la * lb * lc) : 0;
      }
      for (it = 0; it < 2; it++) { for (j = 0; j < M; j++) { var sum = 0; for (var q = -3; q <= 3; q++) sum += kl[(j + q + M) % M]; tmp[j] = sum / 7; } kl.set(tmp); }
      racing = { d: d, kl: kl, step: step, M: M };
      return racing;
    }
    function lineOffset(sv) {
      var r = racingLine(), f = (((sv % LAP) + LAP) % LAP) / r.step, i = Math.floor(f) % r.M, j = (i + 1) % r.M, w = f - Math.floor(f);
      return r.d[i] + (r.d[j] - r.d[i]) * w;
    }
    function makeLineProfile(g0, k, vmax, decel) {
      var r = racingLine(), V = speedProfile(g0, k, vmax, decel, r.kl, r.step);
      return function (sv) { return V[idx(((sv % LAP) + LAP) % LAP)]; };
    }
    function sample(i) { return { s: PS[i], gl: GL[i], gr: GR[i], kerb: KB[i] }; }
    function outline(every) { var o = []; for (var i = 0; i < N; i += every) o.push([PX[i], PZ[i]]); return o; }
    var bounds = { minx: 1e9, maxx: -1e9, minz: 1e9, maxz: -1e9 };
    for (i = 0; i < N; i++) { if (PX[i] < bounds.minx) bounds.minx = PX[i]; if (PX[i] > bounds.maxx) bounds.maxx = PX[i]; if (PZ[i] < bounds.minz) bounds.minz = PZ[i]; if (PZ[i] > bounds.maxz) bounds.maxz = PZ[i]; }
    var maxBank = 0; for (i = 0; i < N; i++) if (Math.abs(PB[i]) > maxBank) maxBank = Math.abs(PB[i]);

    return {
      id: cfg.id, name: cfg.name, kind: cfg.oval ? 'oval' : 'circuit', HW: HW, BANK_GRIP: BANK_GRIP, LAP: LAP, LINE: cfg.line, START: cfg.start, N: N, segs: segs, corners: corners, zones: zones,
      RAMP0: RAMP0, RAMP1: RAMP1, RAMPH: RAMPH, RAMPBACK: RAMPBACK, closeErr: closeErr, OVAL_LAP: OVAL_LAP, ovalPoint: ovalPoint, bounds: bounds, maxBank: maxBank,
      tp: tp, pos: pos, locate: locate, wrap: wrap, stadium: stadium, barrierDist: barrierDist, vAt: vAt, makeProfile: makeProfile, makeLineProfile: makeLineProfile, lineOffset: lineOffset, racingLine: racingLine, sample: sample, outline: outline, idx: idx,
      raw: { PX: PX, PZ: PZ, PH: PH, PS: PS, PK: PK, PB: PB }
    };
  }

  // ---------- the classic circuit ----------
  function buildClassic() {
    var BANK = 0.46, R = 70, SL = 180, t = newTurtle(0, 70, 0); // 26 degrees of banking
    // the chicane swings 19 m into the infield, so going straight on means a long run through the gravel
    var CH = { name: 'chicane', kerb: 1, gr: 28 }, CR = 22, CA = 55, chLen = 6 + 4 * CR * Math.sin(CA * D2R);
    t.line(90, { name: 'front' });
    t.arc(70, 180, { name: 'banked', bank: BANK });
    t.line(50, { name: 'back1' });
    t.arc(CR, CA, CH); t.arc(CR, -CA, CH); t.line(6, CH); t.arc(CR, -CA, CH); t.arc(CR, CA, CH);
    t.line(SL - 50 - chLen, { name: 'back2' });
    t.arc(22, 180, { name: 'hairpin', kerb: 1, gr: 16 });
    t.line(20, { name: 'infield1' });
    t.arc(35, -90, { name: 'turn6', kerb: 1, gl: 14 });
    t.line(26, { name: 'infield2' });
    t.arc(35, 90, { name: 'turn8', kerb: 1, gr: 14 });
    return finish(t, { id: 'classic', name: 'Classic speedway', line: 55, start: 8, oval: { R: R, SL: SL } });
  }

  // ---------- the real Spa-Francorchamps ----------
  // The centre line is the real circuit, traced from OpenStreetMap (js/spadata.js, (c) OpenStreetMap contributors, ODbL).
  // The banking is added by the game: every corner leans in by an amount that depends on the speed it is taken at.
  // Slow hairpins are nearly flat; fast sweepers get up to 15 degrees. The ground itself is flat (the real Spa has big hills).
  function buildSpa() {
    var BMAX = 15 * D2R, V0 = 17, V1 = 58, AREF = 22; // banking grows from 0 at 17 m/s (61 km/h) to the maximum at 58 m/s (209 km/h)
    var D = TF.SPA_DM, P = [], i, j, k;
    for (i = 0; i < D.length; i += 2) { var q = [D[i] / 10, D[i + 1] / 10], lastp = P[P.length - 1]; if (!lastp || Math.hypot(q[0] - lastp[0], q[1] - lastp[1]) > 0.05) P.push(q); }
    var n = P.length;

    // a smooth curve through the mapped points (centripetal Catmull-Rom), sampled about every 0.4 m
    var dense = [];
    function seg(p0, p1, p2, p3) {
      var t0 = 0, t1 = t0 + Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])), t2 = t1 + Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])), t3 = t2 + Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
      var len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(1, Math.ceil(len / 0.4));
      for (var s = 0; s < m; s++) {
        var u = t1 + (t2 - t1) * s / m, r = [0, 0];
        for (var c = 0; c < 2; c++) {
          var A1 = (t1 - u) / (t1 - t0) * p0[c] + (u - t0) / (t1 - t0) * p1[c], A2 = (t2 - u) / (t2 - t1) * p1[c] + (u - t1) / (t2 - t1) * p2[c], A3 = (t3 - u) / (t3 - t2) * p2[c] + (u - t2) / (t3 - t2) * p3[c];
          var B1 = (t2 - u) / (t2 - t0) * A1 + (u - t0) / (t2 - t0) * A2, B2 = (t3 - u) / (t3 - t1) * A2 + (u - t1) / (t3 - t1) * A3;
          r[c] = (t2 - u) / (t2 - t1) * B1 + (u - t1) / (t2 - t1) * B2;
        }
        dense.push(r);
      }
    }
    for (i = 0; i < n; i++) seg(P[(i + n - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]);

    // resample at even spacing, and start the lap 330 m before La Source (on the pit straight)
    var m = dense.length, acc = [0];
    for (i = 1; i <= m; i++) { var da = dense[i - 1], db = dense[i % m]; acc.push(acc[i - 1] + Math.hypot(db[0] - da[0], db[1] - da[1])); }
    var LAP0 = acc[m], N = Math.round(LAP0 / STEP), step = LAP0 / N, X0 = new Array(N), Z0 = new Array(N);
    j = 0;
    for (i = 0; i < N; i++) {
      var target = i * step; while (j < m - 1 && acc[j + 1] < target) j++;
      var f = (target - acc[j]) / ((acc[j + 1] - acc[j]) || 1), a0 = dense[j], b0 = dense[(j + 1) % m];
      X0[i] = a0[0] + (b0[0] - a0[0]) * f; Z0[i] = a0[1] + (b0[1] - a0[1]) * f;
    }
    var shift = N - Math.round(330 / step), PX = new Array(N), PZ = new Array(N), PH = new Array(N), PS = new Array(N), PK = new Array(N), PB = new Array(N), GL = new Array(N), GR = new Array(N), KB = new Array(N);
    for (i = 0; i < N; i++) { PX[i] = X0[(i + shift) % N]; PZ[i] = Z0[(i + shift) % N]; PS[i] = i * step; GL[i] = 0; GR[i] = 0; KB[i] = 0; }

    // heading and curvature (left positive), smoothed over about 16 m
    for (i = 0; i < N; i++) { var a1 = (i - 2 + N) % N, b1 = (i + 2) % N; PH[i] = Math.atan2(-(PZ[b1] - PZ[a1]), PX[b1] - PX[a1]); }
    var K0 = new Array(N);
    for (i = 0; i < N; i++) K0[i] = wrapPi(PH[(i + 3) % N] - PH[(i - 3 + N) % N]) / (6 * step);
    function blur(arr, w) { // periodic moving average over +-w samples
      var out = new Array(N), sum = 0, cnt = 2 * w + 1;
      for (var q = -w; q <= w; q++) sum += arr[(q + N) % N];
      for (var z = 0; z < N; z++) { out[z] = sum / cnt; sum += arr[(z + w + 1) % N] - arr[(z - w + N) % N]; }
      return out;
    }
    PK = blur(K0, 8);

    // banking from the speed of each corner: v = sqrt(grip / curvature), clipped to what a GT3 can reach
    var raw = new Array(N);
    for (i = 0; i < N; i++) {
      var kap = Math.abs(PK[i]), vc = Math.min(V1, Math.sqrt(AREF / Math.max(kap, 1e-5))), cur = sm((kap - 0.001) / (0.0025 - 0.001)); // straights and gentle bends stay flat
      raw[i] = (PK[i] >= 0 ? 1 : -1) * BMAX * clamp((vc - V0) / (V1 - V0), 0, 1) * cur;
    }
    PB = blur(blur(raw, 50), 50); // eases in and out over about 50 m

    // slow corners (radius under 55 m) get kerbs and a gravel trap on the outside; corners close together share one zone
    var segs = {}, runs = [], inRun = false, a = 0;
    for (i = 0; i <= N; i++) {
      var slow = i < N && Math.abs(PK[i]) > 1 / 55;
      if (slow && !inRun) { a = i; inRun = true; }
      else if (!slow && inRun) { inRun = false; if (i - a >= 10) { if (runs.length && a - runs[runs.length - 1][1] < 80) runs[runs.length - 1][1] = i; else runs.push([a, i]); } }
    }
    runs.forEach(function (r, idx) {
      var s0 = Math.max(0, r[0] - 30), s1 = Math.min(N - 1, r[1] + 30);
      for (var q = s0; q <= s1; q++) { KB[q] = 1; if (Math.abs(PK[q]) > 1 / 90) { if (PK[q] > 0) GR[q] = 14; else GL[q] = 14; } }
      segs['k' + idx] = { s0: PS[s0], s1: PS[s1] };
    });

    var maxB = 0, minR = 1e9, pitCurv = 0;
    for (i = 0; i < N; i++) { if (Math.abs(PB[i]) > maxB) maxB = Math.abs(PB[i]); if (Math.abs(PK[i]) > 1e-4 && 1 / Math.abs(PK[i]) < minR) minR = 1 / Math.abs(PK[i]); if (PS[i] < 330 && Math.abs(PK[i]) > pitCurv) pitCurv = Math.abs(PK[i]); }
    TF.spaDesign = { length: N * step, points: n, maxBankDeg: maxB / D2R, minRadius: minR, slowCorners: runs.length, pitStraightMaxCurv: pitCurv };
    return finish({ PX: PX, PZ: PZ, PH: PH, PS: PS, PK: PK, PB: PB, GL: GL, GR: GR, KB: KB, segs: segs, s: N * step, x: PX[0], z: PZ[0] },
      { id: 'spa', name: 'Spa-Francorchamps', line: 190, start: 100 });
  }

  var builders = { classic: buildClassic, spa: buildSpa }, cache = {};
  TF.tracks = ['classic', 'spa'];
  TF.Track = {};
  TF.setTrack = function (id) {
    if (!builders[id]) id = 'classic';
    var K = cache[id] || (cache[id] = builders[id]());
    Object.assign(TF.Track, K); TF.trackId = id;
    return TF.Track;
  };
  TF.setTrack('classic');
})();
