// Car physics: a two-axle ("bicycle") model with tyres that slide progressively.
// State lives in the car's own frame: u = forward speed, v = sideways speed (left positive), r = yaw rate (left positive).
(function () {
  var TF = window.TF, K = TF.Track;
  var G = 9.81, A = 1.27, B = 1.27, H = 1 / 240, WALL = 6.35, AIR = 0.5; // AIR: seconds in the air after a launch
  TF.AIR = AIR;

  // Tuning. Speeds in m/s, accelerations in m/s^2.
  var TUNE = TF.TUNE = {
    engine: 9,          // launch acceleration
    engineFade: 41.7,   // speed at which engine pull would reach zero (flat-out limit near 33 m/s; the track allows about 100 km/h)
    topSpeed: 30,       // used to scale steering lock
    brake: 7,
    reverseMax: 6,
    gripFront: 3.0,     // max sideways acceleration from the front axle
    gripRear: 3.25,     // rear has a little more, so the car pushes wide before it spins
    stiffness: 25,      // how quickly the tyres build grip with slip
    grassGrip: 0.45,    // share of road grip left on grass
    gravelGrip: 0.5,    // share of road grip left in a gravel trap
    steerSlow: 0.55,    // steering lock at walking pace (rad)
    steerFast: 0.12,    // steering lock at top speed (rad)
    assist: 0.45,       // automatic counter-steer strength
    draftPull: 0.25,    // extra acceleration in a full slipstream
    draftDrag: 0.4      // share of air drag removed in a full slipstream (top speed rises to about 83 km/h)
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // power: engine strength (1 = the player's car). draft: 0..1, how deep the car sits in another car's slipstream.
  function Physics(boxes) { this.boxes = boxes || []; this.acc = 0; this.power = 1; this.draft = 0; this.place(K.START, 0); }

  // velocity in world coordinates, used for car-to-car contact
  Physics.prototype.worldVel = function () {
    var c = Math.cos(this.psi), s = Math.sin(this.psi);
    return [this.u * c - this.v * s, -this.u * s - this.v * c];
  };
  Physics.prototype.setWorldVel = function (wx, wz) {
    var c = Math.cos(this.psi), s = Math.sin(this.psi);
    this.u = wx * c - wz * s; this.v = -wx * s - wz * c;
  };

  Physics.prototype.place = function (s, d) {
    var t = K.tp(s), p = K.pos(s, d, 0);
    this.x = p.x; this.z = p.z; this.psi = Math.atan2(-t.tz, t.tx);
    this.u = 0; this.v = 0; this.r = 0; this.steer = 0; this.delta = 0;
    this.gear = 1; this.shiftT = 0; this.hit = 0; this.scrape = false; this.draft = 0;
    this.latAcc = 0; this.longAcc = 0; this.slipF = 0; this.slipR = 0; this.surface = 'road'; this.wnx = 0; this.wnz = 1; this.wobble = 0; this.air = 0; this.airSide = 1; this.rampTilt = 0; this._onRamp = false; this.landed = false; this.kickT = 0; this.kickSide = 1;
    this.loc = K.locate(this.x, this.z);
  };

  // inp: { thr: bool, brk: bool, hand: bool, steer: -1..1 (left positive) }
  Physics.prototype.update = function (dt, inp) {
    this.acc += dt; this.hit = 0;
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt);
    var scraped = false, n = 0;
    while (this.acc >= H && n < 24) { this.sub(H, inp); this.acc -= H; n++; if (this._scr) scraped = true; }
    if (n === 24) this.acc = 0;
    this.scrape = scraped;
  };

  Physics.prototype.sub = function (dt, inp) {
    var T = TUNE, sp = Math.abs(this.u);
    this._scr = false;

    // steering input eases in and snaps back a bit faster
    var tgt = inp.steer, rate = (tgt === 0 || tgt * this.steer < 0) ? 4.5 : 2.6;
    this.steer += clamp(tgt - this.steer, -rate * dt, rate * dt);
    var k = Math.min(1, sp / T.topSpeed);
    var lock = T.steerSlow + (T.steerFast - T.steerSlow) * Math.pow(k, 0.7);
    var beta = this.u > 3 ? Math.atan2(this.v, this.u) : 0;
    var delta = clamp(this.steer * lock + T.assist * beta, -0.6, 0.6);
    this.delta = delta;

    var loc = K.locate(this.x, this.z, this.loc ? this.loc.s : null);
    var surf = loc.surface; this.surface = surf;
    var mu = surf === 'road' ? 1 + K.BANK_GRIP * Math.sin(loc.b) : surf === 'gravel' ? T.gravelGrip : T.grassGrip;

    // ramp kerb on the inside of a corner. "inner" is where the inside wheels are, measured towards the inside.
    var inner = loc.rs ? loc.rd + 0.71 : 0, onRamp = loc.rs !== 0 && inner > K.RAMP0 && inner < K.RAMP1;
    this.rampTilt = onRamp ? (inner - K.RAMP0) / (K.RAMP1 - K.RAMP0) : 0;
    // more than 70% of the way up the ramp at speed: the car is launched
    if (this.rampTilt > 0.7 && sp > 7 && this.air <= 0) { this.air = AIR; this.airSide = loc.rs; }
    this._onRamp = onRamp;
    var flying = this.air > 0;
    if (flying) { this.air -= dt; if (this.air <= 0) { this.wobble = Math.max(this.wobble, 1.3); this.u *= 0.9; this.landed = true; } }

    // parked: hold still so the car does not creep down the banking
    if (!inp.thr && !inp.brk && sp < 0.25 && Math.abs(this.v) < 0.25 && Math.abs(this.r) < 0.2) {
      this.u = 0; this.v = 0; this.r = 0; this.latAcc = 0; this.longAcc = 0; this.slipF = 0; this.slipR = 0; this.loc = loc;
      return;
    }

    // tyres
    // riding the ramp unloads the inside wheels (less grip); in the air there is almost none
    mu *= flying ? 0.03 : 1 - 0.3 * this.rampTilt;
    var fMaxF = T.gripFront * mu, fMaxR = T.gripRear * mu * (inp.hand ? 0.4 : 1);
    var cd = Math.cos(delta), sd = Math.sin(delta);
    var vf = this.v + A * this.r, vr = this.v - B * this.r;
    var sf = (vf * cd - this.u * sd) / Math.max(Math.abs(this.u * cd + vf * sd), 2);
    var sr = vr / Math.max(sp, 2);
    var Fyf = -fMaxF * Math.tanh(T.stiffness * sf / fMaxF);
    var Fyr = -fMaxR * Math.tanh(T.stiffness * sr / fMaxR);
    this.slipF = Math.abs(sf); this.slipR = Math.abs(sr);

    // engine, brakes, drag
    if (this.gear === 1 && this.u > 8.5) { this.gear = 2; this.shiftT = 0.35; }
    else if (this.gear === 2 && this.u < 6) { this.gear = 1; this.shiftT = 0.2; }
    if (this.shiftT > 0) this.shiftT -= dt;
    var ax = 0, brake = 0;
    if (inp.thr) { if (this.u < -0.3) brake = T.brake; else ax += T.engine * this.power * Math.max(0, 1 - this.u / T.engineFade) * (this.shiftT > 0 ? 0.15 : 1) + T.draftPull * this.draft; }
    if (inp.brk) { if (this.u > 0.3) brake = T.brake; else ax -= 1.6 * Math.max(0, 1 + this.u / T.reverseMax); }
    if (inp.hand) brake = Math.max(brake, 2.5);
    if (flying) { ax = 0; brake = 0; } // wheels off the ground
    // grass drags a little; gravel drags hard and harder the faster you go, so it works as a trap
    var soft = surf === 'gravel' ? 1.5 + 0.6 * sp : surf === 'grass' ? 0.5 + 0.06 * sp : 0;
    var resist = 0.25 + 0.0015 * this.u * this.u * (1 - T.draftDrag * this.draft) + soft + brake;

    // banking pulls the car down the slope
    var f_x = Math.cos(this.psi), f_z = -Math.sin(this.psi), l_x = -Math.sin(this.psi), l_z = -Math.cos(this.psi);
    var gb = loc.b && Math.abs(loc.d) <= K.HW + 0.5 ? -G * Math.sin(loc.b) : 0;
    var gx = gb * loc.nx, gz = gb * loc.nz;

    var du = ax + this.v * this.r - Fyf * sd + (gx * f_x + gz * f_z);
    var dv = Fyf * cd + Fyr - this.u * this.r + (gx * l_x + gz * l_z);
    var dr = (A * Fyf * cd - B * Fyr) / 1.3;
    if (this.wobble > 0) dr += 4.5 * Math.sin(this.wobble * 13) * Math.min(this.wobble, 1.3); // just been kicked: the car weaves for a moment
    this.u += du * dt; this.v += dv * dt; this.r += dr * dt;
    this.r *= 1 - 0.4 * dt;
    var dec = resist * dt;
    if (Math.abs(this.u) <= dec) this.u = 0; else this.u -= (this.u > 0 ? dec : -dec);
    this.latAcc = Fyf * cd + Fyr;
    this.longAcc = ax - (this.u > 0 ? brake : -brake);

    this.psi = wrapPi(this.psi + this.r * dt);
    f_x = Math.cos(this.psi); f_z = -Math.sin(this.psi); l_x = -Math.sin(this.psi); l_z = -Math.cos(this.psi);
    var wx = this.u * f_x + this.v * l_x, wz = this.u * f_z + this.v * l_z;
    this.x += wx * dt; this.z += wz * dt;

    // stadium wall: scrape along it and lose speed
    var touched = false, w = K.stadium(this.x, this.z);
    if (w.d > WALL) {
      this.x -= w.nx * (w.d - WALL); this.z -= w.nz * (w.d - WALL);
      this.wnx = w.nx; this.wnz = w.nz;
      var vn = wx * w.nx + wz * w.nz;
      if (vn > 0) {
        var keep = 1 - Math.min(0.35, vn * 0.06);
        wx = (wx - vn * w.nx) * keep - w.nx * vn * 0.25;
        wz = (wz - vn * w.nz) * keep - w.nz * vn * 0.25;
        if (vn > this.hit) this.hit = vn;
      }
      wx *= 1 - 2 * dt; wz *= 1 - 2 * dt;
      var sg = (f_x * w.tx + f_z * w.tz) >= 0 ? 1 : -1;
      var want = Math.atan2(-w.tz * sg, w.tx * sg);
      this.psi = wrapPi(this.psi + wrapPi(want - this.psi) * Math.min(1, 6 * dt));
      this.r *= 1 - Math.min(1, 8 * dt);
      this._scr = Math.hypot(wx, wz) > 1.5;
      touched = true;
    }
    // infield buildings
    for (var i = 0; i < this.boxes.length; i++) {
      var b = this.boxes[i];
      if (this.x > b[0] && this.x < b[1] && this.z > b[2] && this.z < b[3]) {
        var p0 = this.x - b[0], p1 = b[1] - this.x, p2 = this.z - b[2], p3 = b[3] - this.z, m = Math.min(p0, p1, p2, p3), imp = 0;
        if (m === p0) { this.x = b[0]; if (wx > 0) { imp = wx; wx *= -0.2; } }
        else if (m === p1) { this.x = b[1]; if (wx < 0) { imp = -wx; wx *= -0.2; } }
        else if (m === p2) { this.z = b[2]; if (wz > 0) { imp = wz; wz *= -0.2; } }
        else { this.z = b[3]; if (wz < 0) { imp = -wz; wz *= -0.2; } }
        if (imp > this.hit) this.hit = imp;
        touched = true;
      }
    }
    if (touched) {
      f_x = Math.cos(this.psi); f_z = -Math.sin(this.psi); l_x = -Math.sin(this.psi); l_z = -Math.cos(this.psi);
      this.u = wx * f_x + wz * f_z; this.v = wx * l_x + wz * l_z;
    }
    this.loc = K.locate(this.x, this.z, loc.s);
  };

  TF.Physics = Physics;
})();
