// The LMP1 prototype. It faces +x, y is up, -z is the left side.
// Modelled on the Le Mans hybrid prototypes (Audi R18, Toyota TS050, Porsche 919): a low smooth body with a long pointed nose,
// a bubble canopy, covered wheel arches front and rear (the lower half of each tyre shows), sidepods, a tall tail fin carrying a
// two-element rear wing, a flat floor and a diffuser. The body is "lofted": a rounded cross-section swept along the car and
// reshaped at every station, which gives one smooth shell instead of a pile of boxes.
// Same hooks as the other cars (body, wheels, steeringWheel, driver, legs, paint, setFlash) plus setBoost(0..1) for the exhaust flames.
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
    // close both ends with a fan
    [0, S - 1].forEach(function (end) {
      var cx = pos.length / 3, s = st[end]; pos.push(s[0], (s[3] + s[4]) / 2, (s[1] + s[2]) / 2);
      for (var q = 0; q < seg; q++) { var p0 = end * seg + q, p1 = end * seg + (q + 1) % seg; if (end === 0) idx.push(cx, p1, p0); else idx.push(cx, p0, p1); }
    });
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    // make sure the shell faces outwards: the vertex on the +z side of a middle station should have a normal pointing to +z
    var mid = Math.floor(S / 2) * seg, nz = geo.attributes.normal.getZ(mid), zc2 = (st[Math.floor(S / 2)][1] + st[Math.floor(S / 2)][2]) / 2;
    if (nz * (pos[mid * 3 + 2] - zc2 || 1) < 0) { var ix = geo.index.array; for (var f = 0; f < ix.length; f += 3) { var t = ix[f + 1]; ix[f + 1] = ix[f + 2]; ix[f + 2] = t; } geo.computeVertexNormals(); }
    return geo;
  }
  function mirrorStations(st) { return st.map(function (s) { return [s[0], -s[2], -s[1], s[3], s[4]]; }); }

  TF.buildLmp1 = function (color, ghost, number) {
    var std = TF.std, ferrari = !ghost && color === TF.FERRARI, num = String(number == null ? 7 : number), label = num + (ferrari ? 'F' : '');
    var numTex = numTexes[label] || (numTexes[label] = TF.canvasTex(128, 128, function (x) {
      x.fillStyle = ferrari ? '#ffd400' : '#f3efe4'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
      x.fillStyle = '#16130f'; x.font = 'bold ' + (num.length > 1 ? 70 : 92) + 'px Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, 64, 68);
    }));
    var car = new T.Group(), g = new T.Group(); car.add(g);
    var gm = ghost ? new T.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: .3, depthWrite: false, side: T.DoubleSide }) : null;
    function M(o) { return ghost ? gm : std(o); }
    var paint = M({ color: color, roughness: .24, metalness: .3, envMapIntensity: .7 }),
      carbon = M({ color: 0x15161a, roughness: .45, metalness: .3 }), trim = M({ color: 0x0b0b0d, roughness: .65 }),
      silver = M({ color: 0xc9ccd2, roughness: .3, metalness: .9, envMapIntensity: 1 }), accent = M({ color: 0xf2b705, roughness: .5 }),
      white = M({ color: 0xf1f1f3, roughness: .45 }), rubber = M({ color: 0x1a1a1c, roughness: .95 }), seatM = M({ color: 0x25252a, roughness: .8 }),
      suit = M({ color: 0x2b3a6b, roughness: .85 }), helmet = M({ color: 0xf2f2f4, roughness: .35 }), visor = M({ color: 0x10141a, roughness: .2, metalness: .6 }),
      glass = ghost ? gm : std({ color: 0x101820, transparent: true, opacity: .62, roughness: .04, metalness: .5 }),
      led = ghost ? gm : std({ color: 0xdfe8ff, emissive: 0xcfe0ff, emissiveIntensity: 1.1, roughness: .2 }),
      tail = ghost ? gm : std({ color: 0x7a0a0a, emissive: 0xff1010, emissiveIntensity: .7, roughness: .4 });
    var porsche = !ghost && color === TF.PORSCHE; if (porsche) accent.color.setHex(0xc8102e); // 919: white with red and black
    var audi = !ghost && color === TF.AUDI; if (audi) accent.color.setHex(0xd0021b); // R18: black with silver and red
    var bmw = !ghost && color === TF.BMW; if (bmw) accent.color.setHex(0xe4002b);
    var mcl = !ghost && color === TF.MCLAREN; if (mcl) accent.color.setHex(0xf4f4f2); // papaya with black and white
    var ast = !ghost && color === TF.ASTON; if (ast) accent.color.setHex(TF.LIME); // Valkyrie: racing green with lime

    function add(geo, mat, x, y, z, parent) {
      var m = new T.Mesh(geo, mat); m.position.set(x, y, z);
      if (!ghost && mat !== glass) { m.castShadow = true; m.receiveShadow = true; }
      (parent || g).add(m); return m;
    }
    function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
    function cyl(r, h, sg) { return new T.CylinderGeometry(r, r, h, sg || 16); }
    function V(x, y, z) { return new T.Vector3(x, y, z); }
    function E(rx, ry, rz, x, y, z, mat, parent) { var geo = new T.SphereGeometry(1, 22, 14); geo.scale(rx, ry, rz); return add(geo, mat, x, y, z, parent); }
    function rod(a, b, r, mat, parent) {
      var d = new T.Vector3().subVectors(b, a), m = add(cyl(r, d.length(), 8), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
    }
    function prism(pts, width, bevel) {
      var s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.lineTo(pts[0][0], pts[0][1]);
      var depth = width - 2 * bevel;
      var geo = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
      geo.translate(0, 0, -depth / 2); return geo;
    }

    // wheels: wide dark tyres with a dark wheel cover; a yellow tick shows the spin
    var wheels = [];
    function wheel(x, z, front) {
      var r = front ? .34 : .37, tw = front ? .36 : .44, st = new T.Group(); st.position.set(x, r, z); g.add(st);
      var w = new T.Group(); st.add(w);
      add(cyl(r, tw, 28).rotateX(Math.PI / 2), rubber, 0, 0, 0, w);
      add(cyl(r * .72, tw + .02, 24).rotateX(Math.PI / 2), carbon, 0, 0, 0, w);
      add(cyl(r * .45, tw + .04, 24).rotateX(Math.PI / 2), trim, 0, 0, 0, w);
      add(cyl(r * .17, tw + .06, 12).rotateX(Math.PI / 2), accent, 0, 0, 0, w);
      add(box(.06, r * .6, tw + .06).translate(0, r * .35, 0), accent, 0, 0, 0, w);
      wheels.push({ steer: st, spin: w, front: front, x: x, z: z });
    }
    wheel(1.62, -.88, true); wheel(1.62, .88, true); wheel(-1.5, -.9, false); wheel(-1.5, .9, false);

    // central tub with the long pointed nose and the tail
    var tub = [[2.62, -.04, .04, .15, .21], [2.42, -.2, .2, .14, .29], [2.1, -.35, .35, .12, .37], [1.6, -.47, .47, .1, .49], [.9, -.51, .51, .1, .58],
      [.3, -.53, .53, .1, .62], [-.4, -.54, .54, .1, .64], [-1.0, -.52, .52, .1, .72], [-1.7, -.46, .46, .12, .76], [-2.2, -.34, .34, .2, .66], [-2.52, -.2, .2, .3, .52]];
    add(loft(tub, 2.4, 20), paint, 0, 0, 0);
    // front wheel arches and rear wheel fairings, sidepods
    var fArch = [[2.2, .38, .68, .3, .5], [1.98, .42, 1.0, .42, .76], [1.62, .4, 1.1, .5, .86], [1.28, .42, .98, .46, .76], [.98, .5, .72, .4, .6]];
    var rArch = [[-.7, .5, .78, .45, .8], [-1.0, .45, 1.12, .5, .92], [-1.5, .4, 1.22, .5, 1.0], [-2.0, .4, 1.08, .5, .92], [-2.42, .3, .72, .5, .76]];
    var pod = [[1.0, .44, .78, .24, .5], [.5, .44, .82, .22, .56], [-.1, .44, .82, .22, .58], [-.75, .46, .7, .3, .6]];
    [fArch, rArch, pod].forEach(function (st) { add(loft(st, 2.6, 18), paint, 0, 0, 0); add(loft(mirrorStations(st), 2.6, 18), paint, 0, 0, 0); });

    [-1, 1].forEach(function (s) {
      add(box(.5, .14, .05), trim, .35, .44, s * .83);           // sidepod intakes
      add(box(.3, .05, .3), carbon, 2.1, .27, s * .55).rotation.y = s * -.3;   // front canards
      if (bmw) { /* kidney lights are added with the BMW details */ }
      else if (audi) for (var al = 0; al < 3; al++) add(box(.34, .022, .16), led, 2.05, .31 + al * .045, s * .26); // the R18's stacked LED strips
      else if (!porsche) add(box(.32, .05, .14), led, 2.05, .35, s * .24);          // front light strips
      else for (var li = 0; li < 4; li++) add(box(.035, .15 - li * .015, .04), led, 2.14 - li * .01, .4, s * (.43 + li * .065)); // the 919's four vertical LED bars
      add(box(.04, .2, .34), tail, -2.5, .46, s * .12);          // tail lights
      add(cyl(.05, .3, 10).rotateZ(Math.PI / 2), silver, -2.45, .4, s * .2); // exhaust tips
      add(box(1.0, .55, .035), paint, -2.3, 1.0, s * .88);       // rear wing end plates
      if (!porsche) add(box(.4, .3, .036), accent, -2.5, 1.04, s * .88);
      else { add(box(.9, .07, .04), accent, -2.3, .86, s * .88); add(box(.9, .05, .04), carbon, -2.3, .77, s * .88); } // white end plates with a red and a black stripe
      add(box(.5, .32, .03), paint, 2.55, .3, s * .7);           // front wing end plates
    });
    // floor, splitter, diffuser
    add(box(4.5, .05, 1.74), carbon, -.1, .09, 0);
    add(box(.75, .04, 1.6), carbon, 2.55, .08, 0);
    add(box(.55, .05, 1.5), carbon, -2.3, .2, 0).rotation.z = .25;
    add(box(.4, .03, 1.4), carbon, 2.62, .3, 0);                 // front wing plane
    // tail fin and the two-element rear wing
    add(prism([[-0.8, .74], [-2.3, 1.02], [-2.58, 1.08], [-2.58, .56], [-1.6, .62]], .05, .012), paint, 0, 0, 0);
    add(box(.62, .045, 1.76), carbon, -2.4, 1.1, 0).rotation.z = -.12;
    add(box(.4, .04, 1.76), carbon, -2.3, 1.3, 0).rotation.z = -.22;

    // cockpit: bubble canopy (tinted from outside, see-through from inside), roof, air intake above it
    E(.9, .3, .4, -.15, .8, 0, glass);
    E(.6, .08, .34, -.25, 1.07, 0, paint);
    add(box(.34, .12, .3), trim, -.55, 1.12, 0);
    add(box(.34, .02, .3), carbon, -.55, 1.19, 0);
    [-1, 1].forEach(function (s) { rod(V(.58, .66, s * .33), V(.1, 1.0, s * .27), .03, carbon); }); // A pillars
    add(box(.34, .12, .76), trim, .52, .73, 0);                  // dash
    add(box(.1, .5, .46), seatM, -.55, .82, -.12);               // seat back
    var dr = new T.Group(); g.add(dr);
    add(box(.26, .44, .38), suit, -.34, .84, -.12, dr); add(new T.SphereGeometry(.13, 16, 12), helmet, -.22, 1.06, -.12, dr);
    add(box(.09, .07, .2), visor, -.1, 1.07, -.12, dr);
    rod(V(-.3, .92, -.3), V(.46, .8, -.22), .04, suit, dr); rod(V(-.3, .92, .06), V(.46, .8, -.02), .04, suit, dr);
    var sw = new T.Group(); sw.position.set(.46, .8, -.12); g.add(sw);
    // the wheel faces the driver and sits square: its rim's width runs straight across the car, so it reads level when you steer straight
    var swN = V(-.9, .43, 0).normalize(), swX = V(0, 0, 1), swY = new T.Vector3().crossVectors(swN, swX).normalize();
    sw.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(swX, swY, swN)); sw.scale.setScalar(.5); // half the size
    var swi = new T.Group(); sw.add(swi);
    add(box(.3, .17, .02), carbon, 0, 0, 0, swi); add(box(.05, .17, .03), trim, -.17, 0, 0, swi); add(box(.05, .17, .03), trim, .17, 0, 0, swi);
    add(box(.04, .04, .025), accent, 0, .07, 0, swi);

    // Porsche 919 Hybrid livery: black and red bands along the nose and sidepods, black front wing and roof, wordmarks, crest
    if (porsche) {
      [-1, 1].forEach(function (s) {
        add(box(1.7, .08, .02), carbon, .1, .47, s * .812);       // black band on the sidepod
        add(box(1.7, .05, .02), accent, .1, .395, s * .822);      // red band below it
        for (var lv = 0; lv < 4; lv++) add(box(.05, .014, .34), carbon, 1.42 + lv * .11, .875 - lv * .008, s * .78); // louvres on the front fender
        add(box(.5, .12, .02), carbon, 1.7, .62, s * 1.0).rotation.y = s * .05; // black front fender side vent
        add(box(.5, .02, .09), carbon, 1.75, .465, s * .18).rotation.y = s * .25;  // black stripes angling over the nose
        add(box(.5, .02, .05), accent, 1.55, .515, s * .22).rotation.y = s * .25;
      });
      E(.45, .05, .3, -.3, 1.12, 0, carbon);                      // black roof insert
      var wm = std({ map: TF.porscheDecal('word'), transparent: true, roughness: .6 });
      [-1, 1].forEach(function (s) {
        var f = new T.Mesh(new T.PlaneGeometry(.9, .17), wm); f.position.set(-1.65, .79, s * .043); f.rotation.z = -.185 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f); // on the tail fin
      });
      var wing = new T.Mesh(new T.PlaneGeometry(1.2, .23).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), wm); wing.position.set(-2.4, 1.126, 0); wing.rotation.z = -.12; g.add(wing); // across the rear wing
      var crest = new T.Mesh(new T.PlaneGeometry(.16, .16).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), std({ map: TF.porscheDecal('crest'), transparent: true, roughness: .5 })); crest.position.set(2.05, .395, 0); g.add(crest);
    }
    // Aston Martin Valkyrie: racing green with lime stripes, a lime centre stripe over the roof, wings badge, ASTON MARTIN on the fin and wing
    if (ast) {
      var aw = std({ map: TF.astonDecal('wings'), transparent: true, roughness: .45 }), an = std({ map: TF.astonDecal('word'), transparent: true, roughness: .6 });
      add(box(.5, .014, .08), accent, -.25, 1.153, 0);                                // lime stripe over the roof
      add(box(.34, .014, .06), accent, -.55, 1.205, 0);                               // ... and over the air intake
      [-1, 1].forEach(function (s) {
        add(box(1.7, .06, .02), carbon, .1, .47, s * .812);
        add(box(1.7, .035, .02), accent, .1, .405, s * .822);                         // lime band along the sidepod
        add(box(.9, .05, .04), accent, -2.3, .86, s * .88); add(box(.9, .03, .04), carbon, -2.3, .79, s * .88);
        var f = new T.Mesh(new T.PlaneGeometry(.95, .18), an); f.position.set(-1.7, .8, s * .043); f.rotation.z = -.185 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f);
        add(box(.3, .02, .05), accent, 1.9, .5, s * .3).rotation.y = s * .25;          // lime flick on the nose
      });
      var nw = new T.Mesh(new T.PlaneGeometry(.3, .11).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), aw); nw.position.set(1.85, .44, 0); g.add(nw);
      var ww = new T.Mesh(new T.PlaneGeometry(1.2, .23).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), an); ww.position.set(-2.4, 1.126, 0); ww.rotation.z = -.12; g.add(ww);
    }
    // McLaren prototype: papaya orange with a black band and white pinstripe, black wing, the speedmark and McLaren wordmark
    if (mcl) {
      var sm = std({ map: TF.mclarenDecal('speed'), transparent: true, roughness: .5 }), mw = std({ map: TF.mclarenDecal('word'), transparent: true, roughness: .6 });
      [-1, 1].forEach(function (s) {
        add(box(1.7, .08, .02), carbon, .1, .47, s * .812);
        add(box(1.7, .02, .02), accent, .1, .415, s * .82);
        add(box(.9, .06, .04), carbon, -2.3, .86, s * .88);
        add(box(.9, .03, .04), accent, -2.3, .79, s * .88);
        var f = new T.Mesh(new T.PlaneGeometry(.95, .18), mw); f.position.set(-1.7, .8, s * .043); f.rotation.z = -.185 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f);      });
      var nm = new T.Mesh(new T.PlaneGeometry(.4, .15).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), sm); nm.position.set(1.95, .395, 0); g.add(nm);
      var wm2 = new T.Mesh(new T.PlaneGeometry(1.2, .23).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), mw); wm2.position.set(-2.4, 1.126, 0); wm2.rotation.z = -.12; g.add(wm2);
    }
    // BMW M Hybrid V8 details: the three M stripes along the sidepods and rear wing plates, kidney-shaped nose lights, roundel, BMW M on the fin
    if (bmw) {
      var rd = std({ map: TF.bmwDecal('roundel'), transparent: true, roughness: .4 }), bw = std({ map: TF.bmwDecal('word'), transparent: true, roughness: .6 });
      [-1, 1].forEach(function (s) {
        TF.BMW_STRIPES.forEach(function (c, i) {
          var m = M({ color: c, roughness: .45 });
          add(box(1.7, .035, .02), m, .1, .49 - i * .05, s * .812 + s * i * .003);          // along the sidepod
          add(box(.9, .03, .02), m, -2.3, .92 - i * .05, s * .905);                          // across the rear wing plate
        });
        add(box(.1, .13, .05), led, 2.06, .38, s * .17); add(box(.1, .13, .05), led, 2.06, .38, s * .31); // the twin kidney-shaped nose lights
        var f = new T.Mesh(new T.PlaneGeometry(.95, .18), bw); f.position.set(-1.7, .8, s * .043); f.rotation.z = -.185 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f);
      });
      var nb = new T.Mesh(new T.PlaneGeometry(.18, .18).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), rd); nb.position.set(1.85, .435, 0); g.add(nb);
    }
    // Audi R18 details: silver and red bands along the sidepods, four rings on the nose and fin, AUDI SPORT on the fin and the rear wing
    if (audi) {
      var rg = std({ map: TF.audiDecal('rings'), transparent: true, roughness: .35, metalness: .6 }), wd = std({ map: TF.audiDecal('word'), transparent: true, roughness: .6 });
      [-1, 1].forEach(function (s) {
        add(box(1.7, .05, .02), silver, .1, .47, s * .812);
        add(box(1.7, .03, .02), accent, .1, .41, s * .82);
        add(box(.9, .05, .04), accent, -2.3, .86, s * .88); add(box(.9, .03, .04), silver, -2.3, .78, s * .88); // end plate stripes
        var f = new T.Mesh(new T.PlaneGeometry(.95, .18), wd); f.position.set(-1.7, .8, s * .043); f.rotation.z = -.185 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f);
      });
      var nr = new T.Mesh(new T.PlaneGeometry(.3, .1).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), rg); nr.position.set(2.0, .4, 0); g.add(nr);
      var wr = new T.Mesh(new T.PlaneGeometry(1.3, .24).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), wd); wr.position.set(-2.4, 1.126, 0); wr.rotation.z = -.12; g.add(wr);
    }
    // Ferrari 499P details: black sidepod band with a yellow pinstripe, Italian tricolour on the rear wing plates, script wordmark on the fin, shields
    if (ferrari) {
      var fw = std({ map: TF.ferrariDecal('word'), transparent: true, roughness: .6 }), sh = std({ map: TF.ferrariDecal('shield'), transparent: true, roughness: .5 });
      [-1, 1].forEach(function (s) {
        add(box(1.7, .08, .02), carbon, .1, .47, s * .812);
        add(box(1.7, .02, .02), accent, .1, .415, s * .82);
        add(box(.9, .035, .02), M({ color: 0x009246, roughness: .5 }), -2.3, .9, s * .905);
        add(box(.9, .035, .02), M({ color: 0xf4f4f2, roughness: .5 }), -2.3, .935, s * .905);
        add(box(.9, .035, .02), M({ color: 0xce2b37, roughness: .5 }), -2.3, .97, s * .905);
        var f = new T.Mesh(new T.PlaneGeometry(.95, .24), fw); f.position.set(-1.65, .79, s * .043); f.rotation.z = -.185 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f); // on the tail fin
      });
      var ns = new T.Mesh(new T.PlaneGeometry(.2, .22).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), sh); ns.position.set(2.0, .4, 0); g.add(ns); // shield on the nose
    }
    // number roundels on the sides and on the nose
    if (!ghost) {
      [-1, 1].forEach(function (s) {
        var r = new T.Mesh(new T.CircleGeometry(.17, 28), std({ map: numTex, transparent: true, roughness: .6 }));
        r.position.set(.3, .42, s * .545); if (s < 0) r.rotation.y = Math.PI; g.add(r);
      });
      var rt = new T.Mesh(new T.CircleGeometry(.18, 28), std({ map: numTex, transparent: true, roughness: .6 })); rt.rotation.x = -Math.PI / 2; rt.rotation.z = -Math.PI / 2; rt.position.set(1.6, .5, 0); g.add(rt);
    }

    // boost: flames out of the exhausts
    var flames = [];
    if (!ghost) {
      if (!glowTex) glowTex = TF.canvasTex(128, 128, function (x) {
        var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,200,110,.85)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      });
      [-1, 1].forEach(function (s) {
        var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false, toneMapped: false }));
        sp.position.set(-2.8, .42, s * .2); sp.scale.set(1.4, 1.4, 1); g.add(sp); flames.push(sp);
      });
    }
    function setBoost(v) {
      if (ghost) return;
      for (var i = 0; i < flames.length; i++) { flames[i].material.opacity = v; var k = 1.1 + v * 1.1 + Math.random() * .3 * v; flames[i].scale.set(k, k, 1); }
    }

    var legs = { L: new T.Group(), R: new T.Group() };
    wheels.forEach(function (w) { TF.mergeGroup(w.spin); });
    TF.mergeGroup(swi); TF.mergeGroup(dr); TF.mergeGroup(g);

    car.userData = { body: g, wheels: wheels, steeringWheel: swi, driver: dr, legs: legs, paint: ghost ? [] : [paint], setFlash: function () { }, setBoost: setBoost, vehicle: 'lmp1' };
    return car;
  };
})();
