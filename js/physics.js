// Car physics: a two-axle ("bicycle") model with tyres that slide progressively.
// State lives in the car's own frame: u = forward speed, v = sideways speed (left positive), r = yaw rate (left positive).
(function () {
  var TF = window.TF, K = TF.Track;
  var G = 9.81, H = 1 / 240, AIR = 0.5; // AIR: seconds in the air after a launch
  TF.AIR = AIR;

  // Tuning. Speeds in m/s, accelerations in m/s^2. Every vehicle is a full set of these numbers (TF.VEHICLES).
  // This first set is the Model T Ford.
  var TUNE = TF.TUNE = {
    id: 'tford', name: 'Model T Ford', family: 'tford', shiftText: 'kick nearest car',
    boost: false, boostEngine: 1.3, boostFade: 0, boostDrain: 0.2, boostCharge: 0.3, // boost: stored energy; fills while braking, burns while boosting
    engine: 9,          // launch acceleration
    engineFade: 41.7,   // speed at which engine pull would reach zero (flat-out limit near 33 m/s; the track allows about 100 km/h)
    powExp: 1,          // 1 = pull fades steadily with speed; higher = strong pull right up to the speed limit
    topSpeed: 30,       // used to scale steering lock
    drag: 0.0015,       // air drag: drag * speed^2
    downforce: 0,       // extra grip per (m/s)^2
    shiftPower: 0.15,   // share of engine power left while the gearbox shifts
    brake: 7,
    reverseMax: 6,
    gripFront: 3.0,     // max sideways acceleration from the front axle
    gripRear: 3.25,     // rear has a little more, so the car pushes wide before it spins
    stiffness: 25,      // how quickly the tyres build grip with slip
    stiffMu: 0,         // 1 = tyre stiffness grows with available grip (banking, downforce)
    grassGrip: 0.45,    // share of road grip left on grass
    gravelGrip: 0.5,    // share of road grip left in a gravel trap
    steerSlow: 0.55,    // steering lock at walking pace (rad)
    steerFast: 0.12,    // steering lock at top speed (rad)
    steerExp: 0.7,      // how quickly the lock shrinks as speed rises
    assist: 0.45,       // automatic counter-steer strength
    draftPull: 0.25,    // extra acceleration in a full slipstream
    draftDrag: 0.4,     // share of air drag removed in a full slipstream
    draftRange: 1,      // how far behind another car the slipstream reaches (1 = 25 m)
    // the body
    A: 1.27, B: 1.27, inertia: 1.3, wall: 6.35, halfTrack: 0.71, wheelR: 0.38, cOff: 0.85, cRad: 0.8,
    rollK: 0.02, rollMax: 0.09, pitchK: 0.012, pitchMax: 0.05, vibe: 0.003,
    kick: true, flash: false, puffs: true, exhaust: [1.6, 0.3, 0.3], track: 'classic',
    // cameras
    chase: { back: 6.4, up: 2.5, ahead: 3, look: 1.05 }, eye: [-0.6, 1.66, -0.22], eyePitch: -0.1,
    menuCam: { r: 6.1, h: 1.25, look: [-0.1, 1.15, 0] },
    // dashboard, engine sound, and what the AI drivers assume about this car
    speedoMax: 120, pulses: 2,
    rpm: function (gear, sp) { return gear === 1 ? 450 + sp / 8.5 * 1250 : 520 + sp / 29 * 1400; },
    aiG: 5.9, aiVmax: 33, aiDecel: 5.5
  };
  var VEHICLES = TF.VEHICLES = { tford: TUNE };
  // The GT3 race car: about 3.5 times the grip, downforce that grows with speed, and a flat-out speed near 200 km/h.
  VEHICLES.gt3 = Object.assign({}, TUNE, {
    id: 'gt3', name: 'GT3 race car', family: 'gt3', shiftText: 'flash headlights',
    engine: 12, engineFade: 88, powExp: 2.5, topSpeed: 78, drag: 0.0004, downforce: 0.00012, shiftPower: 1, // pull fades gently as speed rises: about 280 km/h flat out on a long straight
    brake: 24, gripFront: 10.5, gripRear: 11.5, stiffness: 95, stiffMu: 1,
    steerSlow: 0.42, steerFast: 0.05, steerExp: 0.5,
    draftPull: 0.5, draftRange: 2.2,
    A: 1.35, B: 1.35, inertia: 1.5, wall: 6.2, halfTrack: 0.86, wheelR: 0.34, cOff: 1.4, cRad: 1.0,
    rollK: 0.004, rollMax: 0.03, pitchK: 0.003, pitchMax: 0.02, vibe: 0.0008,
    kick: false, flash: true, puffs: false, exhaust: [2.3, 0.35, 0.35], track: 'spa',
    chase: { back: 7.8, up: 2.2, ahead: 3.5, look: 0.9 }, eye: [-0.02, 1.15, -0.34], eyePitch: -0.07,
    menuCam: { r: 8.2, h: 1.5, look: [0, 0.65, 0] },
    speedoMax: 320, pulses: 3,
    rpm: function (gear, sp) { if (sp < 12) return 1800 + sp / 12 * 1800; var g = Math.min(6, Math.floor(sp / 12)); return 3000 + Math.min(1, sp / 12 - g) * 4200; },
    aiG: 20.7, aiVmax: 90, aiDecel: 22
  });
  // The LMP1 prototype: a bit stronger brakes, far more grip and downforce, stronger pull, 320 km/h flat out.
  // Hold Shift to boost: 30% more pull and a top speed of 340 km/h while the boost energy lasts. Braking refills it.
  VEHICLES.lmp1 = Object.assign({}, VEHICLES.gt3, {
    id: 'lmp1', name: 'LMP1 prototype', family: 'gt3', shiftText: 'boost (hold)',
    engine: 15, engineFade: 100, powExp: 2.5, topSpeed: 90, drag: 0.00045, downforce: 0.00022,
    boost: true, boostEngine: 1.3, boostFade: 104.1, boostDrain: 0.2, boostCharge: 0.3,
    brake: 30, gripFront: 15, gripRear: 16.5, stiffness: 135,
    steerSlow: 0.4, steerFast: 0.045, steerExp: 0.5,
    draftPull: 0.7, draftRange: 2.8,
    A: 1.5, B: 1.5, inertia: 1.7, wall: 6.1, halfTrack: 0.88, wheelR: 0.36, cOff: 1.5, cRad: 1.0,
    rollK: 0.003, rollMax: 0.02, pitchK: 0.002, pitchMax: 0.015, vibe: 0.0006,
    kick: false, flash: false, puffs: false, exhaust: [2.6, 0.3, 0.5], track: 'spa',
    chase: { back: 8.2, up: 2.0, ahead: 3.6, look: 0.8 }, eye: [0.1, 0.95, -0.1], eyePitch: -0.05,
    menuCam: { r: 8.8, h: 1.3, look: [0, 0.5, 0] },
    speedoMax: 360, pulses: 4,
    rpm: function (gear, sp) { if (sp < 14) return 1800 + sp / 14 * 1800; var g = Math.min(6, Math.floor(sp / 14)); return 3000 + Math.min(1, sp / 14 - g) * 4800; },
    aiG: 29.6, aiVmax: 90, aiDecel: 28
  });

  // The Miata Cup: a small 2-litre roadster for beginners. It is to the GT3 what the GT3 is to the LMP1: less pull, less grip,
  // almost no downforce, about 225 km/h flat out. It is forgiving: the rear grips a little more than the front, the steering is
  // gentle and the automatic counter-steer is strong, so a slide comes on slowly and is easy to catch.
  VEHICLES.miata = Object.assign({}, VEHICLES.gt3, {
    id: 'miata', name: 'Miata Cup', family: 'gt3', shiftText: 'pop-up headlights',
    engine: 10.3, engineFade: 71, powExp: 2.2, topSpeed: 64, drag: 0.0005, downforce: 0.00003, shiftPower: 1,
    brake: 20, gripFront: 9.8, gripRear: 10.8, stiffness: 70, stiffMu: 1,
    steerSlow: 0.48, steerFast: 0.08, steerExp: 0.55, assist: 0.65,
    draftPull: 0.45, draftRange: 2.0,
    A: 1.16, B: 1.15, inertia: 1.15, wall: 6.3, halfTrack: 0.74, wheelR: 0.31, cOff: 1.2, cRad: 0.9,
    rollK: 0.008, rollMax: 0.045, pitchK: 0.006, pitchMax: 0.03, vibe: 0.0012,
    kick: false, flash: true, puffs: false, exhaust: [1.95, 0.25, 0.3], track: 'spa',
    chase: { back: 6.4, up: 2.0, ahead: 3.0, look: 0.95 }, eye: [-0.45, 1.02, -0.3], eyePitch: -0.06,
    menuCam: { r: 6.6, h: 1.2, look: [0, 0.55, 0] },
    speedoMax: 240, pulses: 2,
    rpm: function (gear, sp) { if (sp < 9) return 1500 + sp / 9 * 2500; var g = Math.min(5, Math.floor(sp / 10)); return 3200 + Math.min(1, sp / 10 - g) * 3800; },
    aiG: 17.5, aiVmax: 70, aiDecel: 17 // with the learned Spa map a lone AI Miata laps in 2:17 (the AI GT3 1:57, the AI LMP1 1:37)
  });

  // Drifting mode: the Miata and the GT3, handling exactly like the normal cars (no special drift set-up), on the drift track or
  // the parking lot ('track' is chosen in the game), with no laps, AI, ratings or leaderboards.
  VEHICLES.dmiata = Object.assign({}, VEHICLES.miata, { id: 'dmiata', name: 'Miata', family: 'drift', sound: 'miata', track: 'drift' });
  VEHICLES.dgt3 = Object.assign({}, VEHICLES.gt3, { id: 'dgt3', name: 'GT3', family: 'drift', sound: 'gt3', track: 'drift', shiftText: 'flash headlights' });

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // power: engine strength (1 = the player's car). draft: 0..1, how deep the car sits in another car's slipstream.
  function Physics(boxes) { this.boxes = boxes || []; this.acc = 0; this.power = 1; this.draft = 0; this.vehicle = 'tford'; this.cfg = TUNE; this.place(K.START, 0); }
  Physics.prototype.setVehicle = function (id) { this.vehicle = VEHICLES[id] ? id : 'tford'; this.cfg = VEHICLES[this.vehicle]; };

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
    this.latAcc = 0; this.longAcc = 0; this.slipF = 0; this.slipR = 0; this.surface = 'road'; this.wnx = 0; this.wnz = 1; this.wobble = 0; this.air = 0; this.airSide = 1; this.rampTilt = 0; this._onRamp = false; this.landed = false; this.kickT = 0; this.kickSide = 1; this.boostE = 0.4; this.boosting = false;
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
    var T = this.cfg, A = T.A, B = T.B, WALL = T.wall, sp = Math.abs(this.u);
    this._scr = false;

    // steering input eases in and snaps back a bit faster
    var tgt = inp.steer, rate = (tgt === 0 || tgt * this.steer < 0) ? 4.5 : 2.6;
    this.steer += clamp(tgt - this.steer, -rate * dt, rate * dt);
    var k = Math.min(1, sp / T.topSpeed);
    var lock = T.steerSlow + (T.steerFast - T.steerSlow) * Math.pow(k, T.steerExp);
    var beta = this.u > 3 ? Math.atan2(this.v, this.u) : 0;
    var delta = clamp(this.steer * lock + T.assist * beta, -0.6, 0.6);
    this.delta = delta;

    var loc = K.locate(this.x, this.z, this.loc ? this.loc.s : null);
    var surf = loc.surface; this.surface = surf;
    var mu = surf === 'road' ? 1 + K.BANK_GRIP * Math.abs(Math.sin(loc.b)) : surf === 'gravel' ? T.gravelGrip : T.grassGrip;

    // ramp kerb on the inside of a corner. "inner" is where the inside wheels are, measured towards the inside.
    var inner = loc.rs ? loc.rd + T.halfTrack : 0, onRamp = loc.rs !== 0 && inner > K.RAMP0 && inner < K.RAMP1;
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
    mu *= 1 + T.downforce * this.u * this.u; // downforce presses the car into the road harder the faster it goes
    var S = T.stiffness * (1 + (mu - 1) * T.stiffMu);
    var fMaxF = T.gripFront * mu, fMaxR = T.gripRear * mu * (inp.hand ? 0.4 : 1);
    var cd = Math.cos(delta), sd = Math.sin(delta);
    var vf = this.v + A * this.r, vr = this.v - B * this.r;
    var sf = (vf * cd - this.u * sd) / Math.max(Math.abs(this.u * cd + vf * sd), 2);
    var sr = vr / Math.max(sp, 2);
    var Fyf = -fMaxF * Math.tanh(S * sf / fMaxF);
    var Fyr = -fMaxR * Math.tanh(S * sr / fMaxR);
    this.slipF = Math.abs(sf); this.slipR = Math.abs(sr);

    // engine, brakes, drag
    if (this.gear === 1 && this.u > 8.5) { this.gear = 2; this.shiftT = 0.35; }
    else if (this.gear === 2 && this.u < 6) { this.gear = 1; this.shiftT = 0.2; }
    if (this.shiftT > 0) this.shiftT -= dt;
    // boost (LMP1): hold the boost key to burn stored energy for more pull and a higher top speed; braking refills it
    var boosting = !!(T.boost && inp.boost && inp.thr && this.boostE > 0.005);
    if (T.boost) {
      if (boosting) this.boostE = Math.max(0, this.boostE - T.boostDrain * dt);
      else if (inp.brk && this.u > 3) this.boostE = Math.min(1, this.boostE + T.boostCharge * dt);
    }
    this.boosting = boosting;
    var eng = T.engine * (boosting ? T.boostEngine : 1), fade = boosting && T.boostFade ? T.boostFade : T.engineFade;
    var ax = 0, brake = 0;
    if (inp.thr) { if (this.u < -0.3) brake = T.brake; else ax += eng * this.power * Math.max(0, 1 - Math.pow(Math.max(0, this.u) / fade, T.powExp)) * (this.shiftT > 0 ? T.shiftPower : 1) + T.draftPull * this.draft; }
    if (inp.brk) { if (this.u > 0.3) brake = T.brake; else ax -= 1.6 * Math.max(0, 1 + this.u / T.reverseMax); }
    if (inp.hand) brake = Math.max(brake, 2.5);
    if (flying) { ax = 0; brake = 0; } // wheels off the ground
    // grass drags a little; gravel drags hard and harder the faster you go, so it works as a trap
    var soft = surf === 'gravel' ? 1.5 + 0.6 * sp : surf === 'grass' ? 0.5 + 0.06 * sp : 0;
    var resist = 0.25 + T.drag * this.u * this.u * (1 - T.draftDrag * this.draft) + soft + brake;

    // banking pulls the car down the slope
    var f_x = Math.cos(this.psi), f_z = -Math.sin(this.psi), l_x = -Math.sin(this.psi), l_z = -Math.cos(this.psi);
    var gb = loc.b && Math.abs(loc.d) <= K.HW + 0.5 ? -G * Math.sin(loc.b) : 0;
    var gx = gb * loc.nx, gz = gb * loc.nz;

    var du = ax + this.v * this.r - Fyf * sd + (gx * f_x + gz * f_z);
    var dv = Fyf * cd + Fyr - this.u * this.r + (gx * l_x + gz * l_z);
    var dr = (A * Fyf * cd - B * Fyr) / T.inertia;
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
    var touched = false, w = K.stadium(this.x, this.z, loc.s);
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
