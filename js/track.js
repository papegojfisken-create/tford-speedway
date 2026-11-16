// Track maths. No rendering here, only geometry.
// The circuit runs inside the old oval stadium: front straight, banked turn, back straight with a chicane,
// a hairpin, then an infield section back to the front straight.
// s = distance along the centre line, d = sideways offset (negative = left of travel, positive = right).
(function () {
  var TF = window.TF = window.TF || {};
  var HW = 7, STEP = 0.5, BANK = 0.46, // 26 degrees: steep enough to take the big turn at 100 km/h
    BANK_GRIP = 1.2,                    // banking presses the car into the road, which adds grip
    R = 70, SL = 180, D2R = Math.PI / 180;

  function sm(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ---------- build the centre line with a "turtle": straight lines and arcs ----------
  // per sample: position, heading, distance, curvature (left positive), bank, gravel width left/right, kerb flag
  var PX = [], PZ = [], PH = [], PS = [], PK = [], PB = [], GL = [], GR = [], KB = [], segs = {};
  var x = 0, z = 70, psi = 0, s = 0;
  function put(k, b, o) { PX.push(x); PZ.push(z); PH.push(psi); PS.push(s); PK.push(k); PB.push(b); GL.push(o.gl || 0); GR.push(o.gr || 0); KB.push(o.kerb ? 1 : 0); }
  function mark(o, s0) { if (o.name) { if (!segs[o.name]) segs[o.name] = { s0: s0, s1: s }; else segs[o.name].s1 = s; } }
  function line(len, o) {
    o = o || {}; var n = Math.round(len / STEP), st = len / n, s0 = s;
    for (var i = 0; i < n; i++) { put(0, 0, o); x += Math.cos(psi) * st; z -= Math.sin(psi) * st; s += st; }
    mark(o, s0);
  }
  function arc(r, deg, o) { // deg > 0 turns left
    o = o || {}; var ang = deg * D2R, len = Math.abs(ang) * r, n = Math.round(len / STEP), st = len / n, dp = ang / n, s0 = s;
    var chord = 2 * r * Math.sin(Math.abs(dp) / 2);
    for (var i = 0; i < n; i++) {
      var u = i / n; put((deg > 0 ? 1 : -1) / r, o.bank ? o.bank * sm(Math.min(u, 1 - u) / 0.13) : 0, o);
      var pm = psi + dp / 2; x += Math.cos(pm) * chord; z -= Math.sin(pm) * chord; psi += dp; s += st;
    }
    mark(o, s0);
  }
  // the chicane swings 19 m into the infield, so going straight on means a long run through the gravel
  var CH = { name: 'chicane', kerb: 1, gr: 28 }, CR = 22, CA = 55, chLen = 6 + 4 * CR * Math.sin(CA * D2R);
  line(90, { name: 'front' });
  arc(70, 180, { name: 'banked', bank: BANK });
  line(50, { name: 'back1' });
  arc(CR, CA, CH); arc(CR, -CA, CH); line(6, CH); arc(CR, -CA, CH); arc(CR, CA, CH);
  line(SL - 50 - chLen, { name: 'back2' });
  arc(22, 180, { name: 'hairpin', kerb: 1, gr: 16 });
  line(20, { name: 'infield1' });
  arc(35, -90, { name: 'turn6', kerb: 1, gl: 14 });
  line(26, { name: 'infield2' });
  arc(35, 90, { name: 'turn8', kerb: 1, gr: 14 });
  var N = PX.length, LAP = s, closeErr = Math.hypot(x - PX[0], z - PZ[0]);

  // ---------- sloped ramp kerbs on the inside of each slow corner ----------
  // SA[i] = which side is the inside at sample i (-1 left, +1 right, 0 none)
  var SA = new Int8Array(N), corners = [];
  (function () {
    function inside(i) { return KB[i] && PK[i] !== 0 ? (PK[i] > 0 ? -1 : 1) : 0; }
    var i = 0;
    while (i < N) {
      var sg = inside(i); if (!sg) { i++; continue; }
      var j = i; while (j < N && inside(j) === sg) j++;
      var a = i + 6, b = j - 6; // stop 3 m short of each end
      if (b > a) { for (var k = a; k < b; k++) SA[k] = sg; corners.push({ s0: PS[a], s1: PS[b - 1], side: sg }); }
      i = j;
    }
  })();

  // ---------- suggested speed around the lap (used by the AI drivers) ----------
  var VP = new Float32Array(N), VMAX = 33;
  (function () {
    for (var i = 0; i < N; i++) VP[i] = Math.min(VMAX, Math.sqrt((5.9 * (1 + BANK_GRIP * Math.sin(PB[i])) + 9.81 * Math.sin(PB[i])) / Math.max(Math.abs(PK[i]), 1e-4)));
    for (var pass = 0; pass < 2; pass++) for (i = N - 1; i >= 0; i--) { var nx = VP[(i + 1) % N]; VP[i] = Math.min(VP[i], Math.sqrt(nx * nx + 2 * 5.5 * STEP)); }
  })();

  // inside ramp kerbs: start at the road edge and rise away from the track, then drop off sharply at the back
  var RAMP0 = 7, RAMP1 = 8.6, RAMPH = 0.35, RAMPBACK = 0.15;
  function rampH(rd) {
    if (rd <= RAMP0 || rd >= RAMP1 + RAMPBACK) return 0;
    return rd < RAMP1 ? (rd - RAMP0) / (RAMP1 - RAMP0) * RAMPH : (RAMP1 + RAMPBACK - rd) / RAMPBACK * RAMPH;
  }
  function height(d, b) { return b ? (clamp(d, -HW, HW + 0.5) + HW) * Math.sin(b) : 0; }
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

  // the stadium wall follows the old oval. d = offset from the oval centre line (wall face at d = 7.25).
  function stadium(px, pz) {
    var d, nx, nz, r;
    if (px >= -90 && px <= 90) { if (pz >= 0) { d = pz - R; nx = 0; nz = 1; } else { d = -pz - R; nx = 0; nz = -1; } }
    else { var cx = px > 90 ? 90 : -90; r = Math.hypot(px - cx, pz) || 1e-6; d = r - R; nx = (px - cx) / r; nz = pz / r; }
    return { d: d, nx: nx, nz: nz, tx: nz, tz: -nx };
  }
  var OVAL_LAP = 2 * SL + 2 * Math.PI * R;
  function ovalPoint(sv, d) {
    var a, nx, nz, cx, cz, ARC = Math.PI * R;
    if (sv < SL) { cx = -90 + sv; cz = R; nx = 0; nz = 1; }
    else if (sv < SL + ARC) { a = Math.PI / 2 - (sv - SL) / R; nx = Math.cos(a); nz = Math.sin(a); cx = 90 + R * nx; cz = R * nz; }
    else if (sv < 2 * SL + ARC) { cx = 90 - (sv - SL - ARC); cz = -R; nx = 0; nz = -1; }
    else { a = -Math.PI / 2 - (sv - 2 * SL - ARC) / R; nx = Math.cos(a); nz = Math.sin(a); cx = -90 + R * nx; cz = R * nz; }
    return { x: cx + nx * d, z: cz + nz * d };
  }

  function wrap(ds) { return ((ds + LAP / 2) % LAP + LAP) % LAP - LAP / 2; }
  function vAt(sv) { return VP[idx(((sv % LAP) + LAP) % LAP)]; }
  function sample(i) { return { s: PS[i], gl: GL[i], gr: GR[i], kerb: KB[i] }; }
  function outline(every) { var o = []; for (var i = 0; i < N; i += every) o.push([PX[i], PZ[i]]); return o; }

  TF.Track = {
    HW: HW, BANK_GRIP: BANK_GRIP, LAP: LAP, LINE: 55, START: 8, N: N, segs: segs, corners: corners, RAMP0: RAMP0, RAMP1: RAMP1, RAMPH: RAMPH, RAMPBACK: RAMPBACK, closeErr: closeErr, OVAL_LAP: OVAL_LAP,
    tp: tp, pos: pos, locate: locate, wrap: wrap, stadium: stadium, ovalPoint: ovalPoint, vAt: vAt, sample: sample, outline: outline, idx: idx
  };
})();
