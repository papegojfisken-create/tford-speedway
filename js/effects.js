// Skid marks, exhaust puffs, tyre smoke and wall sparks.
(function () {
  var TF = window.TF, T = THREE;
  var MAXSEG = 6000, NP = 110;

  function Effects(scene) {
    // skid marks: one ring buffer of flat quads, oldest marks get overwritten
    this.pos = new Float32Array(MAXSEG * 18);
    this.geo = new T.BufferGeometry();
    this.attr = new T.BufferAttribute(this.pos, 3); this.attr.setUsage(T.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr); this.geo.setDrawRange(0, 0);
    var mesh = new T.Mesh(this.geo, new T.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: .42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: T.DoubleSide }));
    mesh.frustumCulled = false; scene.add(mesh);
    this.head = 0; this.count = 0; this.last = [null, null, null, null]; this.lo = Infinity; this.hi = 0;

    // particles: a small pool of sprites
    var soft = TF.canvasTex(64, 64, function (x) {
      var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    this.parts = [];
    for (var i = 0; i < NP; i++) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: soft, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s);
      this.parts.push({ s: s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, op: 1, grav: 0 });
    }
    this.next = 0;
  }

  // i = wheel index, (x,y,z) contact point, (dx,dz) travel direction, on = is the tyre sliding
  Effects.prototype.mark = function (i, x, y, z, dx, dz, on) {
    if (!on) { this.last[i] = null; return; }
    var n = Math.hypot(dx, dz) || 1, px = -dz / n * 0.065, pz = dx / n * 0.065;
    var e = { ax: x + px, az: z + pz, bx: x - px, bz: z - pz, y: y + 0.02, x: x, z: z }, l = this.last[i];
    if (!l) { this.last[i] = e; return; }
    var d2 = (x - l.x) * (x - l.x) + (z - l.z) * (z - l.z);
    if (d2 < 0.06) return;
    if (d2 < 9) {
      var p = this.pos, o = this.head * 18;
      p[o] = l.ax; p[o + 1] = l.y; p[o + 2] = l.az; p[o + 3] = l.bx; p[o + 4] = l.y; p[o + 5] = l.bz; p[o + 6] = e.ax; p[o + 7] = e.y; p[o + 8] = e.az;
      p[o + 9] = l.bx; p[o + 10] = l.y; p[o + 11] = l.bz; p[o + 12] = e.bx; p[o + 13] = e.y; p[o + 14] = e.bz; p[o + 15] = e.ax; p[o + 16] = e.y; p[o + 17] = e.az;
      this.head = (this.head + 1) % MAXSEG; if (this.count < MAXSEG) this.count++;
      this.geo.setDrawRange(0, this.count * 6);
      if (o < this.lo) this.lo = o; if (o + 18 > this.hi) this.hi = o + 18;
    }
    this.last[i] = e;
  };

  Effects.prototype.spawn = function (kind, x, y, z, vx, vy, vz) {
    var p = this.parts[this.next]; this.next = (this.next + 1) % NP;
    var m = p.s.material;
    if (kind === 'exhaust') { m.color.setHex(0xb9c2dc); m.blending = T.NormalBlending; p.max = 0.9; p.size = 0.22; p.grow = 1.1; p.op = 0.3; p.grav = 0.5; }
    else if (kind === 'dust') { m.color.setHex(0xc9b48a); m.blending = T.NormalBlending; p.max = 1.1; p.size = 0.5; p.grow = 2.2; p.op = 0.4; p.grav = 0.4; }
    else if (kind === 'smoke') { m.color.setHex(0xe6e2da); m.blending = T.NormalBlending; p.max = 1.3; p.size = 0.45; p.grow = 1.8; p.op = 0.28; p.grav = 0.7; }
    else { m.color.setHex(0xffc060); m.blending = T.AdditiveBlending; p.max = 0.35 + Math.random() * 0.25; p.size = 0.09; p.grow = 0; p.op = 1; p.grav = -9; }
    p.life = p.max; p.vx = vx; p.vy = vy; p.vz = vz;
    p.s.position.set(x, y, z); p.s.scale.setScalar(p.size); p.s.visible = true;
  };

  Effects.prototype.update = function (dt) {
    // send only the new skid-mark segments to the graphics card, not the whole buffer
    if (this.hi > this.lo) { this.attr.updateRange.offset = this.lo; this.attr.updateRange.count = this.hi - this.lo; this.attr.needsUpdate = true; this.lo = Infinity; this.hi = 0; }
    for (var i = 0; i < NP; i++) {
      var p = this.parts[i]; if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.vy += p.grav * dt;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      if (p.s.position.y < 0.03) { p.s.position.y = 0.03; p.vy *= -0.3; }
      var k = p.life / p.max;
      p.s.scale.setScalar(p.size + p.grow * (1 - k));
      p.s.material.opacity = p.op * k;
    }
  };

  TF.Effects = Effects;
})();
