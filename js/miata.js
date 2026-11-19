// The Miata Cup car: a small open two-seater roadster, built in code (no downloaded model). It faces +x, y is up, -z is the left side.
// About 3.9 m long and 1.73 m wide, with a short nose, a long bonnet, an open cockpit with a roll hoop, and a short tail with a lip.
// The body is "lofted" like the generated LMP1: a rounded cross-section swept along the car and reshaped at every station.
// Same hooks as the other cars (body, wheels, steeringWheel, driver, legs, paint, setFlash).
(function () {
  var TF = window.TF, T = THREE;
  var numTexes = {}, glowTex = null;

  // stations: [x, z0, z1, y0, y1] = the box the cross-section fits in at that x. exp = 2 is an ellipse; higher is boxier.
  function loft(st, exp, seg) {
    var pos = [], idx = [], S = st.length, e = 2 / exp, i, k;
    for (i = 0; i < S; i++) {
      var s = st[i], zc = (s[1] + s[2]) / 2, hw = (s[2] - s[1]) / 2, yc = (s[3] + s[4]) / 2, hh = (s[4] - s[3]) / 2;
      for (k = 0; k < seg; k++) {
        var a = k / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        pos.push(s[0], yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e), zc + hw * Math.sign(c) * Math.pow(Math.abs(c), e));
      }
    }
    for (i = 0; i < S - 1; i++) for (k = 0; k < seg; k++) {
      var a0 = i * seg + k, b0 = i * seg + (k + 1) % seg, c0 = (i + 1) * seg + k, d0 = (i + 1) * seg + (k + 1) % seg;
      idx.push(a0, c0, b0, b0, c0, d0);
    }
    [0, S - 1].forEach(function (end) {
      var cx = pos.length / 3, s = st[end]; pos.push(s[0], (s[3] + s[4]) / 2, (s[1] + s[2]) / 2);
      for (var q = 0; q < seg; q++) { var p0 = end * seg + q, p1 = end * seg + (q + 1) % seg; if (end === 0) idx.push(cx, p1, p0); else idx.push(cx, p0, p1); }
    });
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    var mid = Math.floor(S / 2) * seg, nz = geo.attributes.normal.getZ(mid), zc2 = (st[Math.floor(S / 2)][1] + st[Math.floor(S / 2)][2]) / 2;
    if (nz * (pos[mid * 3 + 2] - zc2 || 1) < 0) { var ix = geo.index.array; for (var f = 0; f < ix.length; f += 3) { var t = ix[f + 1]; ix[f + 1] = ix[f + 2]; ix[f + 2] = t; } geo.computeVertexNormals(); }
    return geo;
  }
  var bodyGeo = null;
  function body() { // shared by every Miata on the track
    if (bodyGeo) return bodyGeo;
    var W = 0.865;
    bodyGeo = loft([
      [1.97, -0.5, 0.5, 0.27, 0.52], [1.9, -0.72, 0.72, 0.21, 0.6], [1.75, -0.82, 0.82, 0.18, 0.67], [1.5, -W, W, 0.17, 0.73],
      [1.15, -W, W, 0.17, 0.76], [0.75, -W, W, 0.17, 0.78], [0.35, -W, W, 0.17, 0.8], [-0.1, -W, W, 0.17, 0.81],
      [-0.6, -W, W, 0.17, 0.82], [-1.0, -W, W, 0.17, 0.84], [-1.35, -W, W, 0.18, 0.85], [-1.62, -0.83, 0.83, 0.2, 0.84],
      [-1.82, -0.74, 0.74, 0.24, 0.8], [-1.95, -0.6, 0.6, 0.3, 0.73]
    ], 3.2, 40);
    return bodyGeo;
  }

  // the reduced 1989 MX-5 body (js/miata_data.js): decoded once, then every Miata shares the same geometry
  function miataGeos(d) {
    if (d.geos) return d.geos;
    function u8(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
    d.geos = {};
    Object.keys(d.parts).forEach(function (k) {
      var q = d.parts[k], p = new Int16Array(u8(q.p).buffer), n = new Int8Array(u8(q.n).buffer), ix = new Uint16Array(u8(q.i).buffer);
      var P = new Float32Array(p.length), N = new Float32Array(n.length), i;
      for (i = 0; i < p.length; i++) P[i] = p[i] / d.s;
      for (i = 0; i < n.length; i++) N[i] = n[i] / 127;
      var G = new T.BufferGeometry(); G.setAttribute('position', new T.BufferAttribute(P, 3)); G.setAttribute('normal', new T.BufferAttribute(N, 3)); G.setIndex(new T.BufferAttribute(ix, 1));
      d.geos[k] = G;
    });
    return d.geos;
  }

  TF.buildMiata = function (color, ghost, number, ai) {
    var std = TF.std, num = String(number == null ? 7 : number);
    var numTex = numTexes[num] || (numTexes[num] = TF.canvasTex(128, 128, function (x) {
      x.fillStyle = '#f3efe4'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
      x.fillStyle = '#16130f'; x.font = 'bold ' + (num.length > 1 ? 70 : 92) + 'px Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, 64, 68);
    }));
    var car = new T.Group(), g = new T.Group(); car.add(g);
    var gm = ghost ? new T.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: .3, depthWrite: false, side: T.DoubleSide }) : null;
    function M(o) { return ghost ? gm : std(o); }
    var paint = M({ color: color, roughness: .3, metalness: .2, envMapIntensity: .5 }),
      trim = M({ color: 0x0b0b0d, roughness: .65 }), carbon = M({ color: 0x15161a, roughness: .55, metalness: .2 }),
      silver = M({ color: 0xc9ccd2, roughness: .3, metalness: .9, envMapIntensity: 1 }), rubber = M({ color: 0x1a1a1c, roughness: .95 }),
      seatM = M({ color: 0x25252a, roughness: .8 }), stripe = M({ color: color === 0xf2f2ee ? 0x1d4fb8 : 0xf2f2ee, roughness: .5 }),
      suit = M({ color: 0x2b3a6b, roughness: .85 }), helmet = M({ color: 0xf2f2f4, roughness: .35 }), visor = M({ color: 0x10141a, roughness: .2, metalness: .6 }),
      glass = ghost ? gm : std({ color: 0x141c26, transparent: true, opacity: .45, roughness: .05, metalness: .4 }),
      lamp = ghost ? gm : std({ color: 0xdfe8ff, emissive: 0xcfe0ff, emissiveIntensity: .35, roughness: .2 }),
      tail = ghost ? gm : std({ color: 0x7a0a0a, emissive: 0xff1010, emissiveIntensity: .5, roughness: .4 });
    var md = !ghost && TF.MIATA ? TF.MIATA : null; // the real body (js/miata_data.js); the ghost stays a simple outline
    var WR = md ? md.cfg.rf : .31, FX = md ? md.cfg.fx : 1.16, RX = md ? md.cfg.rx : -1.15, TRK = md ? md.cfg.track : .8;
    function add(geo, mat, x, y, z, parent) {
      var m = new T.Mesh(geo, mat); m.position.set(x, y, z);
      if (!ghost && mat !== glass) { m.castShadow = !ai; m.receiveShadow = true; }
      (parent || g).add(m); return m;
    }
    function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
    function cyl(r, h, sg) { return new T.CylinderGeometry(r, r, h, sg || 16); }
    function V(x, y, z) { return new T.Vector3(x, y, z); }
    function rod(a, b, r, mat, parent) {
      var d = new T.Vector3().subVectors(b, a), m = add(cyl(r, d.length(), 8), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
    }

    // wheels: dark tyre, silver six-spoke rim. Each has a steer group and a spin group.
    var wheels = [];
    function wheel(x, z, front) {
      var st = new T.Group(); st.position.set(x, WR, z); g.add(st);
      var w = new T.Group(), tw = .23; st.add(w);
      add(cyl(WR, tw, 28).rotateX(Math.PI / 2), rubber, 0, 0, 0, w);
      add(cyl(WR * .68, tw + .01, 20).rotateX(Math.PI / 2), trim, 0, 0, 0, w);
      for (var i = 0; i < 6; i++) { var sp = add(box(.045, WR * .64, tw + .02).translate(0, WR * .36, 0), silver, 0, 0, 0, w); sp.rotation.z = i * Math.PI / 3; }
      add(cyl(.04, tw + .03, 10).rotateX(Math.PI / 2), silver, 0, 0, 0, w);
      wheels.push({ steer: st, spin: w, front: front, x: x, z: z });
    }
    wheel(FX, -TRK, true); wheel(FX, TRK, true); wheel(RX, -TRK, false); wheel(RX, TRK, false);

    var popUp = false, popups = null, hlM = null, numAt = { x: -.15, y: .58, z: .872, bx: 1.25, by: .766 };
    if (md) {
      // the 1989 MX-5 body: every part shares its geometry with every other Miata on the track
      var G = miataGeos(md), cabM = M({ color: 0x2a2b2f, roughness: .85 }), blackM = M({ color: 0x16171a, roughness: .6, metalness: .2 }),
        amberM = std({ color: 0x8a4a00, emissive: 0xff8a10, emissiveIntensity: .35, roughness: .3 }), floorM = M({ color: 0x101114, roughness: .9 });
      hlM = std({ color: 0xdfe8ff, emissive: 0xfff4dc, emissiveIntensity: .2, roughness: .2 }); // the pop-up lamps themselves
      var roleMat = { paint: paint, black: blackM, cab: cabM, glass: glass, light: lamp, amber: amberM, tail: tail, floor: floorM,
        upPaint: paint, upBlack: blackM, upLight: hlM, dnPaint: paint, dnBlack: blackM, dnLight: blackM };
      var up = new T.Group(), dn = new T.Group(); g.add(up); g.add(dn); up.visible = false;
      Object.keys(G).forEach(function (k) {
        var pm = new T.Mesh(G[k], roleMat[k] || blackM);
        if (k !== 'glass') { pm.castShadow = !ai; pm.receiveShadow = true; }
        (/^up/.test(k) ? up : /^dn/.test(k) ? dn : g).add(pm);
      });
      popups = { up: up, dn: dn };
      // where the race numbers go: the outermost point of the doors, and the top of the bonnet
      var P = G.paint.attributes.position.array, side = 0, top = 0;
      for (var pi = 0; pi < P.length; pi += 3) {
        if (P[pi] > -.35 && P[pi] < .05 && P[pi + 1] > .45 && P[pi + 1] < .62) side = Math.max(side, Math.abs(P[pi + 2]));
        if (P[pi] > 1.15 && P[pi] < 1.35 && Math.abs(P[pi + 2]) < .1) top = Math.max(top, P[pi + 1]);
      }
      numAt = { x: -.15, y: .54, z: side + .006, bx: 1.25, by: top + .006 };
    } else {
    // body shell and its details (the simple stand-in, used for the ghost)
    var shell = new T.Mesh(body(), paint); shell.castShadow = !ghost && !ai; shell.receiveShadow = true; g.add(shell);
    add(box(1.15, .05, 1.36), trim, -.32, .82, 0);                         // the open cockpit, seen from above
    add(box(1.1, .3, 1.3), seatM, -.32, .68, 0);                          // cockpit tub
    [-1, 1].forEach(function (s) {
      add(box(.42, .5, .46), seatM, -.55, .85, s * .32).rotation.z = .12;  // bucket seats
      add(box(.12, .05, .3), lamp, 1.78, .63, s * .56).rotation.y = s * .35; // slim headlights
      add(box(.18, .07, .34), trim, 1.76, .61, s * .56).rotation.y = s * .35;
      add(cyl(.055, .04, 14).rotateZ(Math.PI / 2), tail, -1.95, .68, s * .5); // round tail lights
      add(cyl(.045, .04, 14).rotateZ(Math.PI / 2), tail, -1.95, .68, s * .36);
      add(box(3.0, .045, .02), stripe, 0.0, .71, s * .866);               // the Cup stripe along each side, above the wheel arches
      [FX, RX].forEach(function (ax) { add(cyl(WR + .07, .04, 28).rotateX(Math.PI / 2), trim, ax, WR, s * .85); }); // dark wheel-arch openings
      add(box(.18, .1, .04), carbon, .45, .9, s * .88);                   // mirrors
      rod(V(.38, .84, s * .66), V(.47, .9, s * .86), .015, carbon);
      add(box(2.1, .06, .05), carbon, 0, .19, s * .86);                    // side skirt
      rod(V(.42, .82, s * .64), V(.08, 1.14, s * .6), .025, trim);        // windscreen pillars
    });
    var ws = add(box(.02, .38, 1.2), glass, .25, .99, 0); ws.rotation.z = .9; // the windscreen, laid well back
    rod(V(.08, 1.14, -.6), V(.08, 1.14, .6), .022, trim);                 // windscreen top frame
    // roll hoop behind the seats (the Cup car's roll cage) and the short tail lip
    rod(V(-.85, .82, -.55), V(-.85, 1.18, -.5), .035, silver); rod(V(-.85, .82, .55), V(-.85, 1.18, .5), .035, silver); rod(V(-.85, 1.18, -.5), V(-.85, 1.18, .5), .035, silver);
    rod(V(-.85, 1.18, -.3), V(-1.35, .86, -.3), .03, silver); rod(V(-.85, 1.18, .3), V(-1.35, .86, .3), .03, silver);
    add(box(.12, .03, 1.3), carbon, -1.9, .83, 0);                        // tail lip
    add(box(.07, .17, .76), trim, 1.97, .37, 0);                          // the wide grille
    add(box(.22, .04, 1.5), carbon, 1.9, .2, 0);                          // front splitter
    add(box(.2, .1, 1.1), carbon, -1.9, .25, 0);                          // rear diffuser
    add(box(1.6, .04, 1.4), trim, 0, .18, 0);                             // floor
    [-1, 1].forEach(function (s) { add(cyl(.04, .25, 10).rotateZ(Math.PI / 2), silver, -1.92, .28, s * .25); }); // twin exhaust tips
    }

    // the race number on both doors and on the bonnet
    var rdM = ghost ? gm : std({ map: numTex, transparent: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 });
    [-1, 1].forEach(function (s) { var r = new T.Mesh(new T.CircleGeometry(.19, 28), rdM); r.position.set(numAt.x, numAt.y, s * numAt.z); if (s < 0) r.rotation.y = Math.PI; g.add(r); });
    var rb = new T.Mesh(new T.CircleGeometry(.17, 28).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), rdM); rb.position.set(numAt.bx, numAt.by, 0); g.add(rb);

    // no seats and no driver (as asked); the real body has its own steering wheel, so this group stays empty
    var swi = new T.Group(); g.add(swi);
    var dr = new T.Group(); g.add(dr);

    // headlight flash: a glow sprite in front of each lamp
    var glows = [];
    if (!ghost) {
      glowTex = glowTex || TF.canvasTex(64, 64, function (x) { var gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(1, 'rgba(255,250,235,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); });
      [-1, 1].forEach(function (s) {
        var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false, toneMapped: false }));
        sp.position.set(md ? 1.7 : 1.9, md ? .76 : .63, s * (md ? .44 : .56)); sp.scale.set(1.4, 1.4, 1); g.add(sp); glows.push(sp);
      });
    }
    function setFlash(v) {
      if (ghost) return;
      if (md) { hlM.emissiveIntensity = popUp ? 1.6 + v * 6 : .2; for (var j = 0; j < glows.length; j++) glows[j].material.opacity = popUp ? .35 + .65 * v : 0; return; } // the pop-ups only shine when they are up
      lamp.emissiveIntensity = .35 + v * 8; lamp.color.setHex(v > 0 ? 0xffffff : 0xdfe8ff);
      for (var i = 0; i < glows.length; i++) glows[i].material.opacity = v;
    }
    // the pop-up headlights: up (and lit) or down, like the real 1989 car
    function setPopups(on) {
      popUp = !!on; if (!popups) return;
      popups.up.visible = popUp; popups.dn.visible = !popUp; setFlash(0);
    }

    var legs = { L: new T.Group(), R: new T.Group() }; // no kicking, but the game expects these
    wheels.forEach(function (w) { TF.mergeGroup(w.spin); });
    TF.mergeGroup(swi);
    car.userData = { body: g, wheels: wheels, steeringWheel: swi, driver: dr, legs: legs, paint: ghost ? [] : [paint], setFlash: setFlash, setPopups: setPopups, popupsUp: function () { return popUp; }, vehicle: 'miata', openTop: true, eye: md ? [-0.55, 1.05, -0.3] : [-0.6, 1.08, -0.32], hood: [0.9, 1.0, 0] };
    return car;
  };
})();
