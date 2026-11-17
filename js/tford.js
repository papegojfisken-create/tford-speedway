// The Model T runabout, built from simple shapes. Car faces +x, y is up, -z is the driver's (left) side.
(function () {
  var TF = window.TF, T = THREE;
  var numTexes = {};

  // Replace the meshes that sit directly in a group with one mesh per material. Sub-groups are left alone.
  TF.mergeGroup = function (grp) { mergeGroup(grp); };
  function mergeGroup(grp) {
    var by = new Map();
    grp.children.slice().forEach(function (m) {
      if (!m.isMesh) return;
      m.updateMatrix();
      var geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrix);
      var e = by.get(m.material); if (!e) { e = { geos: [], shadow: m.castShadow }; by.set(m.material, e); }
      e.geos.push(geo); grp.remove(m);
    });
    by.forEach(function (e, mat) {
      var n = 0; e.geos.forEach(function (q) { n += q.attributes.position.count; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), o = 0;
      e.geos.forEach(function (q) {
        P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3);
        if (q.attributes.uv) U.set(q.attributes.uv.array, o * 2);
        o += q.attributes.position.count;
      });
      var G = new T.BufferGeometry();
      G.setAttribute('position', new T.BufferAttribute(P, 3)); G.setAttribute('normal', new T.BufferAttribute(N, 3)); G.setAttribute('uv', new T.BufferAttribute(U, 2));
      var mesh = new T.Mesh(G, mat); mesh.castShadow = e.shadow; mesh.receiveShadow = e.shadow; grp.add(mesh);
    });
  }

  TF.buildCar = function (color, ghost, number) {
    var std = TF.std, label = String(number == null ? 7 : number);
    var numTex = numTexes[label] || (numTexes[label] = TF.canvasTex(128, 128, function (x) {
      x.fillStyle = '#f3efe4'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
      x.fillStyle = '#16130f'; x.font = 'bold ' + (label.length > 1 ? 70 : 92) + 'px Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 64, 70);
    }));
    var car = new T.Group(), g = new T.Group(); car.add(g);
    var gm = ghost ? new T.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: .3, depthWrite: false, side: T.DoubleSide }) : null;
    function M(o) { return ghost ? gm : std(o); }
    var paint = M({ color: color, roughness: .4, metalness: .05, envMapIntensity: .14 }),
      paint2 = M({ color: color, roughness: .4, metalness: .05, envMapIntensity: .14, side: T.DoubleSide }),
      black = M({ color: 0x17150f, roughness: .5, metalness: .1 }), brass = M({ color: 0xdcae45, roughness: .22, metalness: 1, envMapIntensity: 1 }),
      wood = M({ color: 0xb07c40, roughness: .65 }), rubber = M({ color: 0xbfb7a6, roughness: .92 }), leather = M({ color: 0x33211a, roughness: .55 }),
      glass = ghost ? gm : std({ color: 0xd5e8f2, transparent: true, opacity: .14, roughness: .05, metalness: .3 });

    function add(geo, mat, x, y, z, parent) {
      var m = new T.Mesh(geo, mat); m.position.set(x, y, z);
      if (!ghost && mat !== glass) { m.castShadow = true; m.receiveShadow = true; }
      (parent || g).add(m); return m;
    }
    function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
    function cyl(r, h, sg) { return new T.CylinderGeometry(r, r, h, sg || 16); }
    function V(x, y, z) { return new T.Vector3(x, y, z); }
    function rod(a, b, r, mat, parent) {
      var d = new T.Vector3().subVectors(b, a), m = add(cyl(r, d.length(), 8), mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m;
    }

    // wheels: wooden spokes, cream tyres. Each has a steer group and a spin group.
    var wheels = [];
    function wheel(x, z, front) {
      var st = new T.Group(); st.position.set(x, .38, z); g.add(st);
      var w = new T.Group(); st.add(w);
      add(new T.TorusGeometry(.335, .046, 10, 32), rubber, 0, 0, 0, w); add(new T.TorusGeometry(.283, .024, 8, 32), wood, 0, 0, 0, w);
      for (var i = 0; i < 12; i++) { var sp = add(cyl(.016, .27, 6).translate(0, .15, 0), wood, 0, 0, 0, w); sp.rotation.z = i * Math.PI / 6; }
      add(cyl(.055, .13, 12), brass, 0, 0, 0, w).rotation.x = Math.PI / 2;
      wheels.push({ steer: st, spin: w, front: front, x: x, z: z });
    }
    wheel(1.27, -.71, true); wheel(1.27, .71, true); wheel(-1.27, -.71, false); wheel(-1.27, .71, false);

    // chassis
    add(box(3.0, .07, .5), black, 0, .5, 0);
    add(cyl(.03, 1.42, 8), black, 1.27, .38, 0).rotation.x = Math.PI / 2; add(cyl(.035, 1.42, 8), black, -1.27, .38, 0).rotation.x = Math.PI / 2;
    add(box(.05, .04, 1.1), black, 1.27, .49, 0); add(new T.SphereGeometry(.12, 12, 10), black, -1.27, .38, 0);
    // hood, radiator, cowl
    var hs = new T.Shape(); hs.moveTo(-.25, 0); hs.lineTo(-.27, .3); hs.lineTo(-.13, .42); hs.lineTo(.13, .42); hs.lineTo(.27, .3); hs.lineTo(.25, 0); hs.lineTo(-.25, 0);
    var hg = new T.ExtrudeGeometry(hs, { depth: .78, bevelEnabled: false }); hg.rotateY(Math.PI / 2); add(hg, paint, .52, .6, 0);
    add(box(.08, .52, .58), brass, 1.33, .84, 0); add(box(.02, .4, .46), black, 1.375, .82, 0); add(cyl(.03, .07, 10), brass, 1.33, 1.13, 0);
    add(box(.06, .54, .84), paint, .5, .86, 0);
    // body tub, seat, rear deck, folded top
    add(box(1.3, .05, .92), black, -.13, .6, 0);
    add(box(1.27, .36, .04), paint, -.14, .8, .46); add(box(1.27, .36, .04), paint, -.14, .8, -.46); add(box(.04, .36, .92), paint, -.77, .8, 0);
    add(box(.46, .14, .84), leather, -.42, .74, 0); add(box(.12, .56, .9), leather, -.71, 1.08, 0).rotation.z = .15;
    add(box(.72, .3, .8), paint, -1.14, .76, 0); add(box(.66, .05, .74), paint, -1.14, .93, 0);
    add(box(.16, .13, .98), M({ color: 0x1d1b18, roughness: .96 }), -.86, 1.06, 0);
    // fenders and running boards
    function fender(x, z, t0, len) { add(new T.CylinderGeometry(.46, .46, .27, 22, 1, true, t0, len), paint2, x, .38, z).rotation.x = Math.PI / 2; }
    [.71, -.71].forEach(function (z) {
      fender(1.27, z, Math.PI - 1.3, 2.75); fender(-1.27, z, Math.PI - 1.45, 2.65);
      add(box(1.66, .03, .27), black, 0, .43, z); add(box(1.66, .14, .02), black, 0, .5, z > 0 ? .58 : -.58);
    });
    // windshield
    [.44, -.44].forEach(function (z) { add(box(.03, .62, .03), brass, .5, 1.43, z); });
    [1.13, 1.4, 1.73].forEach(function (y) { add(box(.03, .03, .9), brass, .5, y, 0); });
    add(box(.01, .58, .86), glass, .5, 1.43, 0);
    // steering column and wheel
    var A = V(.46, .95, -.22), B = V(-.12, 1.27, -.22), dir = new T.Vector3().subVectors(B, A).normalize(); rod(A, B, .016, black);
    var sw = new T.Group(); sw.position.copy(B); sw.quaternion.setFromUnitVectors(V(0, 0, 1), dir); g.add(sw);
    var swi = new T.Group(); sw.add(swi);
    add(new T.TorusGeometry(.2, .016, 8, 28), M({ color: 0x2a1a10, roughness: .5 }), 0, 0, 0, swi);
    add(cyl(.008, .4, 6), brass, 0, 0, 0, swi); add(cyl(.008, .4, 6), brass, 0, 0, 0, swi).rotation.z = Math.PI / 2;
    // lamps, horn, crank
    [.42, -.42].forEach(function (z) {
      add(cyl(.1, .13, 20), brass, 1.28, .8, z).rotation.z = Math.PI / 2;
      add(cyl(.085, .012, 20), M({ color: 0xfff2c0, emissive: 0xffd98a, emissiveIntensity: 1.2 }), 1.35, .8, z).rotation.z = Math.PI / 2;
      add(box(.08, .13, .08), brass, .5, 1.06, z > 0 ? .5 : -.5);
    });
    add(new T.ConeGeometry(.07, .24, 14), brass, .66, .98, -.52).rotation.z = Math.PI / 2; add(new T.SphereGeometry(.05, 10, 8), black, .5, .98, -.56);
    add(cyl(.012, .24, 6), black, 1.44, .5, 0).rotation.z = Math.PI / 2;
    // racing number
    if (!ghost) [.482, -.482].forEach(function (z) {
      var r = new T.Mesh(new T.CircleGeometry(.15, 28), std({ map: numTex, transparent: true, roughness: .6 }));
      r.position.set(-.2, .8, z); if (z < 0) r.rotation.y = Math.PI; g.add(r);
    });
    // driver in a flat cap
    var dr = new T.Group(); g.add(dr);
    var coat = M({ color: 0x5b4632, roughness: .9 }), skin = M({ color: 0xd9a67e, roughness: .7 }), cap = M({ color: 0x3d3a36, roughness: .9 });
    add(box(.26, .5, .42), coat, -.54, 1.08, -.22, dr); add(new T.SphereGeometry(.11, 16, 12), skin, -.5, 1.47, -.22, dr);
    add(cyl(.12, .05, 16), cap, -.51, 1.56, -.22, dr); add(box(.12, .015, .16), cap, -.4, 1.54, -.22, dr);
    rod(V(-.5, 1.27, -.42), V(-.14, 1.3, -.4), .04, coat, dr); rod(V(-.5, 1.27, -.02), V(-.14, 1.3, -.04), .04, coat, dr);

    // kicking legs: hidden until the driver kicks, then one swings out sideways from the hip
    function leg(z) {
      var L = new T.Group(); L.position.set(-.25, 1.02, z); L.visible = false; g.add(L);
      add(box(.16, .66, .16), M({ color: 0x3a3028, roughness: .9 }), 0, -.33, 0, L);
      add(box(.3, .13, .18), black, .06, -.7, 0, L);
      return L;
    }
    var legs = { L: leg(-.5), R: leg(.5) };

    // fewer, bigger pieces draw much faster: fuse the parts of each moving group by material
    wheels.forEach(function (w) { mergeGroup(w.spin); });
    mergeGroup(swi); mergeGroup(dr); mergeGroup(g);

    car.userData = { body: g, wheels: wheels, steeringWheel: swi, driver: dr, legs: legs, paint: ghost ? [] : [paint, paint2] };
    return car;
  };
})();
