// The GT3 race car, built from simple shapes like the Model T. It faces +x, y is up, -z is the driver's (left) side.
// It has the same hooks as the Model T (body, wheels, steeringWheel, driver, legs, paint) so the game treats both alike,
// plus setFlash(0..1) for the headlights.
(function () {
  var TF = window.TF, T = THREE;
  var numTexes = {}, glowTex = null;

  // one builder for any vehicle id
  TF.buildVehicle = function (veh, color, ghost, number) {
    return veh === 'lmp1' ? TF.buildLmp1(color, ghost, number) : veh === 'gt3' ? TF.buildGt3(color, ghost, number) : TF.buildCar(color, ghost, number);
  };

  // The white paint is the Porsche one: it also gets the Porsche details (911 front and wing on the GT3, 919 livery on the LMP1)
  TF.PORSCHE = 0xf4f4f2;
  var decals = {};
  TF.porscheDecal = function (kind) {
    if (decals[kind]) return decals[kind];
    if (kind === 'word') { // the PORSCHE wordmark, wide black letters
      return decals[kind] = TF.canvasTex(512, 96, function (x) {
        x.fillStyle = '#111'; x.font = 'bold 74px Arial,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
        var t = 'PORSCHE', w = 0, i; for (i = 0; i < t.length; i++) w += x.measureText(t[i]).width + 22; w -= 22;
        var cx = (512 - w) / 2; for (i = 0; i < t.length; i++) { x.fillText(t[i], cx, 52); cx += x.measureText(t[i]).width + 22; }
      });
    }
    return decals[kind] = TF.canvasTex(128, 128, function (x) { // the crest: gold edge, red and black stripes, a dark horse
      x.beginPath(); x.moveTo(24, 10); x.lineTo(104, 10); x.lineTo(104, 70); x.quadraticCurveTo(104, 112, 64, 122); x.quadraticCurveTo(24, 112, 24, 70); x.closePath();
      x.fillStyle = '#d7a928'; x.fill(); x.save(); x.clip();
      x.fillStyle = '#c8102e'; x.fillRect(32, 18, 32, 50); x.fillRect(64, 70, 32, 40);
      x.fillStyle = '#111'; x.fillRect(64, 18, 32, 50); x.fillRect(32, 70, 32, 40);
      x.fillStyle = '#d7a928'; x.beginPath(); x.ellipse(64, 66, 17, 11, 0, 0, 7); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.ellipse(64, 66, 11, 7, 0, 0, 7); x.fill();
      x.restore(); x.lineWidth = 5; x.strokeStyle = '#d7a928'; x.stroke();
    });
  };

  // the red paint is the Ferrari one: yellow shield, white script wordmark, Italian tricolour, yellow number roundels
  TF.FERRARI = 0xd8141b;
  TF.ferrariDecal = function (kind) {
    var key = 'f' + kind; if (decals[key]) return decals[key];
    if (kind === 'word') return decals[key] = TF.canvasTex(512, 128, function (x) {
      x.fillStyle = '#fff'; x.font = 'italic bold 96px "Brush Script MT","Segoe Script","Snell Roundhand",cursive'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('Ferrari', 256, 70);
    });
    return decals[key] = TF.canvasTex(128, 144, function (x) { // the Scuderia shield
      x.beginPath(); x.moveTo(14, 8); x.lineTo(114, 8); x.lineTo(114, 80); x.quadraticCurveTo(114, 128, 64, 138); x.quadraticCurveTo(14, 128, 14, 80); x.closePath();
      x.fillStyle = '#ffd400'; x.fill(); x.save(); x.clip();
      x.fillStyle = '#009246'; x.fillRect(14, 8, 34, 16); x.fillStyle = '#fff'; x.fillRect(48, 8, 34, 16); x.fillStyle = '#ce2b37'; x.fillRect(82, 8, 34, 16);
      x.fillStyle = '#111'; x.beginPath(); x.ellipse(62, 62, 22, 13, -.2, 0, 7); x.fill();                      // the horse: body, neck, head, legs
      x.beginPath(); x.moveTo(78, 52); x.lineTo(90, 32); x.lineTo(100, 36); x.lineTo(88, 58); x.fill();
      x.lineWidth = 6; x.strokeStyle = '#111'; x.beginPath(); x.moveTo(44, 68); x.lineTo(34, 86); x.moveTo(52, 72); x.lineTo(50, 92); x.moveTo(70, 72); x.lineTo(80, 90); x.moveTo(78, 66); x.lineTo(96, 80); x.stroke();
      x.font = 'bold 24px Arial,sans-serif'; x.textAlign = 'center'; x.fillStyle = '#111'; x.fillText('S    F', 64, 120);
      x.restore(); x.lineWidth = 4; x.strokeStyle = '#111'; x.stroke();
    });
  };

  // the black paint is the Audi one: four rings, singleframe grille, silver and red details
  TF.AUDI = 0x0e0e0f;
  TF.audiDecal = function (kind) {
    var key = 'a' + kind; if (decals[key]) return decals[key];
    if (kind === 'rings') return decals[key] = TF.canvasTex(192, 64, function (x) {
      x.lineWidth = 6; x.strokeStyle = '#dfe3e8'; for (var i = 0; i < 4; i++) { x.beginPath(); x.arc(40 + i * 37, 32, 24, 0, 7); x.stroke(); }
    });
    if (kind === 'grille') return decals[key] = TF.canvasTex(256, 80, function (x) { // the singleframe grille: wide hexagon, silver frame, horizontal slats
      x.beginPath(); x.moveTo(30, 6); x.lineTo(226, 6); x.lineTo(248, 40); x.lineTo(226, 74); x.lineTo(30, 74); x.lineTo(8, 40); x.closePath();
      x.fillStyle = '#08090b'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#c9ccd2'; x.stroke();
      x.lineWidth = 3; x.strokeStyle = '#3a3d44'; for (var j = 1; j < 6; j++) { x.beginPath(); x.moveTo(24, 6 + j * 11.5); x.lineTo(232, 6 + j * 11.5); x.stroke(); }
    });
    return decals[key] = TF.canvasTex(512, 96, function (x) { // AUDI SPORT
      x.fillStyle = '#eef0f3'; x.font = 'bold 66px Arial,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
      var t = 'AUDI SPORT', w = 0, i; for (i = 0; i < t.length; i++) w += x.measureText(t[i]).width + 12; w -= 12;
      var cx = (512 - w) / 2; for (i = 0; i < t.length; i++) { x.fillText(t[i], cx, 50); cx += x.measureText(t[i]).width + 12; }
    });
  };

  // the blue paint is the BMW one: kidney grille, roundel, the three M stripes (light blue, dark blue, red)
  TF.BMW = 0x1c4fd1;
  TF.BMW_STRIPES = [0x81c4ff, 0x16288f, 0xe4002b];
  TF.bmwDecal = function (kind) {
    var key = 'b' + kind; if (decals[key]) return decals[key];
    if (kind === 'roundel') return decals[key] = TF.canvasTex(128, 128, function (x) {
      x.fillStyle = '#111'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
      x.fillStyle = '#f4f4f2'; x.beginPath(); x.arc(64, 64, 46, 0, 7); x.fill();
      x.fillStyle = '#1c69d4'; x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 46, Math.PI, Math.PI * 1.5); x.fill(); x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 46, 0, Math.PI * .5); x.fill();
      x.fillStyle = '#f4f4f2'; x.font = 'bold 15px Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BMW', 64, 14);
    });
    if (kind === 'kidney') return decals[key] = TF.canvasTex(256, 96, function (x) {
      [64, 192].forEach(function (cx) {
        x.beginPath(); x.ellipse(cx, 48, 40, 42, 0, 0, 7); x.fillStyle = '#08090b'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#d9dde2'; x.stroke();
        x.lineWidth = 3; x.strokeStyle = '#3a3d44'; for (var i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(cx + i * 10, 12); x.lineTo(cx + i * 10, 84); x.stroke(); }
      });
    });
    return decals[key] = TF.canvasTex(512, 96, function (x) { // BMW M
      x.fillStyle = '#f4f6fa'; x.font = 'bold 70px Arial,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('BMW   M', 256, 52);
    });
  };

  // the orange paint is the McLaren one: papaya with the black speedmark, wordmark, black intakes and dihedral headlights
  TF.MCLAREN = 0xff6a00;
  TF.mclarenDecal = function (kind) {
    var key = 'm' + kind; if (decals[key]) return decals[key];
    if (kind === 'speed') return decals[key] = TF.canvasTex(256, 96, function (x) { // the speedmark swoosh
      x.fillStyle = '#111'; x.beginPath(); x.moveTo(8, 78); x.quadraticCurveTo(110, 8, 248, 22); x.quadraticCurveTo(120, 34, 36, 88); x.closePath(); x.fill();
    });
    return decals[key] = TF.canvasTex(512, 96, function (x) { // McLaren
      x.fillStyle = '#111'; x.font = 'bold 72px Arial,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
      var t = 'McLaren', w = 0, i; for (i = 0; i < t.length; i++) w += x.measureText(t[i]).width + 8; w -= 8;
      var cx = (512 - w) / 2; for (i = 0; i < t.length; i++) { x.fillText(t[i], cx, 52); cx += x.measureText(t[i]).width + 8; }
    });
  };

  // the green paint is the Aston Martin one: racing green with lime accents, the wide grille, the wings badge
  TF.ASTON = 0x0f6b4a; TF.LIME = 0xb8e600;
  TF.astonDecal = function (kind) {
    var key = 'n' + kind; if (decals[key]) return decals[key];
    if (kind === 'grille') return decals[key] = TF.canvasTex(256, 80, function (x) { // the big open grille: wide trapezoid, chrome frame, horizontal slats
      x.beginPath(); x.moveTo(6, 8); x.lineTo(250, 8); x.lineTo(226, 74); x.lineTo(30, 74); x.closePath();
      x.fillStyle = '#08090b'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#d9dde2'; x.stroke();
      x.lineWidth = 3; x.strokeStyle = '#3a3d44'; for (var j = 1; j < 6; j++) { x.beginPath(); x.moveTo(30, 8 + j * 11); x.lineTo(226, 8 + j * 11); x.stroke(); }
    });
    if (kind === 'wings') return decals[key] = TF.canvasTex(256, 96, function (x) { // the winged badge
      x.fillStyle = '#dfe6d8'; [-1, 1].forEach(function (s) {
        x.beginPath(); x.moveTo(128 + s * 30, 50); x.quadraticCurveTo(128 + s * 90, 22, 128 + s * 124, 28); x.quadraticCurveTo(128 + s * 96, 52, 128 + s * 36, 64); x.closePath(); x.fill();
      });
      x.fillStyle = '#0f6b4a'; x.fillRect(96, 38, 64, 34); x.strokeStyle = '#dfe6d8'; x.lineWidth = 3; x.strokeRect(96, 38, 64, 34);
      x.fillStyle = '#dfe6d8'; x.font = 'bold 13px Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ASTON', 128, 50); x.fillText('MARTIN', 128, 63);
    });
    return decals[key] = TF.canvasTex(512, 96, function (x) { // ASTON MARTIN
      x.fillStyle = '#f2f6ee'; x.font = 'bold 62px Arial,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
      var t = 'ASTON MARTIN', w = 0, i; for (i = 0; i < t.length; i++) w += x.measureText(t[i]).width + 6; w -= 6;
      var cx = (512 - w) / 2; for (i = 0; i < t.length; i++) { x.fillText(t[i], cx, 52); cx += x.measureText(t[i]).width + 6; }
    });
  };

  TF.buildGt3 = function (color, ghost, number) {
    var std = TF.std, ferrari = !ghost && color === TF.FERRARI, num = String(number == null ? 7 : number), label = num + (ferrari ? 'F' : '');
    var numTex = numTexes[label] || (numTexes[label] = TF.canvasTex(128, 128, function (x) {
      x.fillStyle = ferrari ? '#ffd400' : '#f3efe4'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
      x.fillStyle = '#16130f'; x.font = 'bold ' + (num.length > 1 ? 70 : 92) + 'px Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, 64, 68);
    }));
    var car = new T.Group(), g = new T.Group(); car.add(g);
    var gm = ghost ? new T.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: .3, depthWrite: false, side: T.DoubleSide }) : null;
    function M(o) { return ghost ? gm : std(o); }
    var paint = M({ color: color, roughness: .28, metalness: .25, envMapIntensity: .5 }),
      carbon = M({ color: 0x15161a, roughness: .55, metalness: .2 }), trim = M({ color: 0x0b0b0d, roughness: .65 }),
      silver = M({ color: 0xc9ccd2, roughness: .3, metalness: .9, envMapIntensity: 1 }), accent = M({ color: 0xf2b705, roughness: .5 }),
      rubber = M({ color: 0x1a1a1c, roughness: .95 }), seatM = M({ color: 0x25252a, roughness: .8 }),
      suit = M({ color: 0x2b3a6b, roughness: .85 }), helmet = M({ color: 0xf2f2f4, roughness: .35 }), visor = M({ color: 0x10141a, roughness: .2, metalness: .6 }),
      glass = ghost ? gm : std({ color: 0x141c26, transparent: true, opacity: .58, roughness: .05, metalness: .4 }),
      lamp = ghost ? gm : std({ color: 0xdfe8ff, emissive: 0xcfe0ff, emissiveIntensity: .35, roughness: .2 }),
      tail = ghost ? gm : std({ color: 0x7a0a0a, emissive: 0xff1010, emissiveIntensity: .5, roughness: .4 });
    var porsche = !ghost && color === TF.PORSCHE; if (porsche) accent.color.setHex(0xc8102e);
    var audi = !ghost && color === TF.AUDI; if (audi) accent.color.setHex(0xd0021b);
    var bmw = !ghost && color === TF.BMW; if (bmw) accent.color.setHex(0xe4002b);
    var mcl = !ghost && color === TF.MCLAREN; if (mcl) accent.color.setHex(0x15161a);
    var ast = !ghost && color === TF.ASTON; if (ast) accent.color.setHex(TF.LIME);

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
    // a side profile (x, y points) pushed out sideways to the given width, with softly rounded edges
    function prism(pts, width, bevel) {
      var s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.lineTo(pts[0][0], pts[0][1]);
      var depth = width - 2 * bevel;
      var geo = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
      geo.translate(0, 0, -depth / 2); return geo;
    }

    // wheels: dark tyre, dark rim, five silver spokes. Each has a steer group and a spin group.
    var wheels = [];
    function wheel(x, z, front) {
      var st = new T.Group(); st.position.set(x, .34, z); g.add(st);
      var w = new T.Group(), tw = front ? .3 : .34; st.add(w);
      add(cyl(.34, tw, 28).rotateX(Math.PI / 2), rubber, 0, 0, 0, w);
      add(cyl(.235, tw + .01, 20).rotateX(Math.PI / 2), trim, 0, 0, 0, w);
      for (var i = 0; i < 5; i++) { var sp = add(box(.055, .22, tw + .02).translate(0, .125, 0), silver, 0, 0, 0, w); sp.rotation.z = i * Math.PI * 2 / 5; }
      add(cyl(.05, tw + .03, 10).rotateX(Math.PI / 2), silver, 0, 0, 0, w);
      wheels.push({ steer: st, spin: w, front: front, x: x, z: z });
    }
    wheel(1.38, -.86, true); wheel(1.38, .86, true); wheel(-1.32, -.86, false); wheel(-1.32, .86, false);

    // body: nose and hood, tail and rear deck, door panels, floor
    add(prism([[0.6, 0.22], [2.1, 0.22], [2.27, 0.3], [2.3, 0.46], [2.0, 0.66], [1.3, 0.80], [0.62, 0.90], [0.6, 0.90]], 1.68, .09), paint, 0, 0, 0);
    add(prism([[-0.9, 0.22], [-0.9, 0.90], [-1.85, 0.86], [-2.22, 0.74], [-2.27, 0.5], [-2.15, 0.22]], 1.68, .09), paint, 0, 0, 0);
    [-1, 1].forEach(function (s) {
      add(box(1.5, .68, .09), paint, -.15, .56, s * .84);                 // door panel
      add(box(1.5, .05, .012), accent, -.15, .38, s * .89);               // stripe
      add(box(.95, .12, .5), paint, 1.38, .74, s * .9); add(box(.95, .12, .5), paint, -1.32, .74, s * .9); // wide wheel arches
      add(box(2.2, .07, .07), carbon, -.1, .24, s * .93);                // side skirt
      add(box(.5, .02, .3), trim, 1.35, .81, s * .35);                    // hood vent
      if (!porsche && !ferrari && !audi && !bmw && !mcl && !ast) add(box(.14, .11, .40), lamp, 2.22, .5, s * .6);      // headlight
      if (ast) { add(box(.16, .1, .44), trim, 2.2, .52, s * .6); add(box(.1, .03, .38), lamp, 2.27, .55, s * .6); add(box(.1, .02, .38), accent, 2.27, .49, s * .6); } // slim LED headlight with a lime light bar underneath
      if (mcl) { add(box(.16, .1, .46), trim, 2.2, .52, s * .6).rotation.y = s * .12; add(box(.1, .026, .4), lamp, 2.27, .56, s * .6).rotation.y = s * .12; add(box(.2, .03, .5), trim, 2.16, .62, s * .6).rotation.y = s * .12; } // slim dihedral headlight under a black eyebrow
      if (bmw) { add(box(.16, .1, .4), trim, 2.2, .52, s * .62); add(box(.1, .03, .34), lamp, 2.27, .55, s * .62); add(cyl(.035, .1, 14).rotateZ(Math.PI / 2), lamp, 2.27, .49, s * .78); add(cyl(.035, .1, 14).rotateZ(Math.PI / 2), lamp, 2.27, .49, s * .46); } // slim LED with two round light rings
      if (audi) { add(box(.16, .12, .44), trim, 2.2, .5, s * .6); add(box(.1, .022, .38), lamp, 2.27, .55, s * .6); add(box(.1, .022, .3), lamp, 2.27, .5, s * .58); } // angular LED headlight: two light bars
      if (ferrari) { add(box(.16, .12, .44), trim, 2.2, .5, s * .6); add(box(.1, .035, .38), lamp, 2.27, .54, s * .6); } // slim LED headlight in a black surround
      add(box(.04, .1, .45), tail, -2.34, .66, s * .55);                  // tail light
      add(cyl(.045, .3, 10).rotateZ(Math.PI / 2), silver, -2.25, .3, s * .35); // exhaust tip
    });
    add(box(1.5, .05, 1.68), trim, -.15, .25, 0);                         // floor
    add(box(.04, .12, .7), trim, 2.31, .34, 0);                           // front intake
    add(box(.55, .04, 1.9), carbon, 2.15, .19, 0);                        // splitter
    add(box(.45, .05, 1.7), carbon, -2.15, .2, 0);                        // diffuser
    // cabin: tinted glass seen from outside, see-through from inside; paint roof and pillars
    add(prism([[0.62, 0.90], [0.08, 1.28], [-0.80, 1.30], [-1.65, 0.90]], 1.2, .02), glass, 0, 0, 0);
    add(box(.9, .05, 1.25), paint, -.36, 1.315, 0);
    [-1, 1].forEach(function (s) {
      rod(V(.62, .9, s * .6), V(.08, 1.29, s * .6), .035, carbon);
      rod(V(-.8, 1.29, s * .6), V(-1.62, .9, s * .6), .05, paint);
      if (!porsche) rod(V(-2.1, .86, s * .45), V(-2.1, 1.2, s * .45), .03, carbon); // wing upright
      else { rod(V(-1.9, .9, s * .45), V(-2.02, 1.42, s * .45), .035, carbon); rod(V(-2.02, 1.42, s * .45), V(-2.24, 1.4, s * .45), .03, carbon); } // swan-neck mounts hang the wing from above
      add(box(.62, .34, .03), accent, -2.27, 1.16, s * .87);           // wing end plate
    });
    add(box(.34, .045, 1.72), carbon, -2.27, 1.23, 0).rotation.z = -.1;   // rear wing
    add(box(.2, .03, 1.7), carbon, -2.12, 1.36, 0).rotation.z = -.18;     // upper flap
    // inside: dash, seat, driver, steering wheel
    add(box(.4, .14, 1.1), trim, .42, .84, 0);
    var dr = new T.Group(); g.add(dr);
    add(box(.28, .5, .42), suit, -.36, .86, -.4, dr); add(new T.SphereGeometry(.14, 16, 12), helmet, -.2, 1.12, -.4, dr);
    add(box(.09, .07, .2), visor, -.07, 1.14, -.4, dr);
    rod(V(-.35, 1.0, -.57), V(.42, .98, -.46), .04, suit, dr); rod(V(-.35, 1.0, -.23), V(.42, .98, -.26), .04, suit, dr);
    var sw = new T.Group(); sw.position.set(.42, .95, -.36); sw.quaternion.setFromUnitVectors(V(0, 0, 1), V(-.94, .33, 0).normalize()); g.add(sw);
    var swi = new T.Group(); sw.add(swi);
    add(new T.TorusGeometry(.125, .016, 8, 24), trim, 0, 0, 0, swi);
    add(box(.25, .02, .016), trim, 0, 0, 0, swi); add(box(.02, .12, .016), trim, 0, -.06, 0, swi);
    add(box(.025, .045, .02), accent, 0, .125, 0, swi);

    // Porsche 911 GT3 R details: round headlights standing on bulging front fenders, a rear engine deck, wordmarks and the crest
    if (porsche) {
      var fl = function (rx, ry, rz, x, y, z, mat) { var geo = new T.SphereGeometry(1, 20, 12); geo.scale(rx, ry, rz); return add(geo, mat, x, y, z); };
      [-1, 1].forEach(function (s) {
        fl(.5, .13, .3, 1.45, .76, s * .68, paint);                               // fender hump
        add(cyl(.15, .2, 22).rotateZ(Math.PI / 2), paint, 1.98, .72, s * .64);    // fender nacelle
        add(cyl(.16, .06, 22).rotateZ(Math.PI / 2), trim, 2.1, .72, s * .64);     // bezel
        add(cyl(.125, .1, 22).rotateZ(Math.PI / 2), lamp, 2.15, .72, s * .64);   // round headlight
      });
      fl(.75, .1, .66, -1.35, .93, 0, paint);                                     // engine deck behind the roof
      if (!ghost) {
        var wm = std({ map: TF.porscheDecal('word'), transparent: true, roughness: .6 });
        [-1, 1].forEach(function (s) {
          var d = new T.Mesh(new T.PlaneGeometry(.62, .116), wm); d.position.set(.62, .5, s * .897); if (s < 0) d.rotation.y = Math.PI; g.add(d);
        });
        var crest = new T.Mesh(new T.PlaneGeometry(.2, .2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), std({ map: TF.porscheDecal('crest'), transparent: true, roughness: .5 })); crest.position.set(1.85, .79, 0); crest.rotation.z = -.2; g.add(crest);
      }
    }
    // Ferrari 296 GT3 details: tricolour, shields, script wordmark, black front mouth; yellow stripe and wing end plates stay yellow
    if (ferrari) {
      add(box(.05, .13, 1.0), trim, 2.33, .36, 0);                                // wide front mouth
      [-1, 1].forEach(function (s) {
        add(box(.55, .03, .013), M({ color: 0x009246, roughness: .5 }), -1.0, .5, s * .893);  // Italian flag on the rear flank
        add(box(.55, .03, .013), M({ color: 0xf4f4f2, roughness: .5 }), -1.0, .53, s * .893);
        add(box(.55, .03, .013), M({ color: 0xce2b37, roughness: .5 }), -1.0, .56, s * .893);
      });
      var fw = std({ map: TF.ferrariDecal('word'), transparent: true, roughness: .6 }), sh = std({ map: TF.ferrariDecal('shield'), transparent: true, roughness: .5 });
      [-1, 1].forEach(function (s) {
        var d = new T.Mesh(new T.PlaneGeometry(.6, .15), fw); d.position.set(.55, .62, s * .897); if (s < 0) d.rotation.y = Math.PI; g.add(d);
        var q = new T.Mesh(new T.PlaneGeometry(.16, .18), sh); q.position.set(.7, .45, s * .897); if (s < 0) q.rotation.y = Math.PI; g.add(q);
      });
      var hs = new T.Mesh(new T.PlaneGeometry(.26, .29).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), sh); hs.position.set(1.7, .82, 0); hs.rotation.z = -.2; g.add(hs); // shield on the hood
    }
    // Aston Martin Vantage GT3 details: wide grille, wings badge, ASTON MARTIN on the doors, lime stripe and splitter
    if (ast) {
      var ag = new T.Mesh(new T.PlaneGeometry(.86, .26).rotateY(Math.PI / 2), std({ map: TF.astonDecal('grille'), transparent: true, roughness: .5 })); ag.position.set(2.405, .37, 0); g.add(ag);
      add(box(.5, .012, 1.86), accent, 2.15, .217, 0);                             // lime splitter edge
      var aw = std({ map: TF.astonDecal('wings'), transparent: true, roughness: .45 }), an = std({ map: TF.astonDecal('word'), transparent: true, roughness: .6 });
      var hb = new T.Mesh(new T.PlaneGeometry(.3, .11).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), aw); hb.position.set(1.85, .79, 0); hb.rotation.z = -.2; g.add(hb);
      var nb2 = new T.Mesh(new T.PlaneGeometry(.2, .075).rotateY(Math.PI / 2), aw); nb2.position.set(2.41, .5, 0); g.add(nb2);
      [-1, 1].forEach(function (s) {
        var d = new T.Mesh(new T.PlaneGeometry(.62, .116), an); d.position.set(.62, .5, s * .897); if (s < 0) d.rotation.y = Math.PI; g.add(d);
        add(box(.5, .02, .013), accent, -.95, .74, s * .893); // lime line on the rear fender
      });
    }
    // McLaren 720S GT3 details: black intakes behind the doors, black front mouth, speedmark on the hood, McLaren wordmark
    if (mcl) {
      add(box(.06, .14, 1.1), trim, 2.33, .38, 0);                               // wide black mouth
      var sm = std({ map: TF.mclarenDecal('speed'), transparent: true, roughness: .5 }), mw = std({ map: TF.mclarenDecal('word'), transparent: true, roughness: .6 });
      [-1, 1].forEach(function (s) {
        add(box(.42, .3, .03), trim, -.78, .56, s * .9);                           // big side intake
        add(box(.36, .03, .035), silver, -.78, .5, s * .91); add(box(.36, .03, .035), silver, -.78, .6, s * .91);
        var d = new T.Mesh(new T.PlaneGeometry(.62, .116), mw); d.position.set(.62, .5, s * .897); if (s < 0) d.rotation.y = Math.PI; g.add(d);
        var q = new T.Mesh(new T.PlaneGeometry(.3, .11), sm); q.position.set(.2, .78, s * .897); if (s < 0) q.rotation.y = Math.PI; g.add(q);
      });
      var hm = new T.Mesh(new T.PlaneGeometry(.55, .2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), sm); hm.position.set(1.7, .82, 0); hm.rotation.z = -.2; g.add(hm); // the speedmark on the hood
    }
    // BMW M4 GT3 details: twin kidney grille, roundels, the M stripes along the flank, BMW M wordmark
    if (bmw) {
      [-1, 1].forEach(function (s) { TF.BMW_STRIPES.forEach(function (c, i) { add(box(1.9, .03, .013), M({ color: c, roughness: .45 }), -.1, .72 - i * .04, s * .893); }); }); // the M stripes, high on the flank
      var kg = new T.Mesh(new T.PlaneGeometry(.64, .24).rotateY(Math.PI / 2), std({ map: TF.bmwDecal('kidney'), transparent: true, roughness: .5 })); kg.position.set(2.405, .4, 0); g.add(kg);
      var rd = std({ map: TF.bmwDecal('roundel'), transparent: true, roughness: .4 }), bw = std({ map: TF.bmwDecal('word'), transparent: true, roughness: .6 });
      var hr = new T.Mesh(new T.PlaneGeometry(.2, .2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), rd); hr.position.set(1.7, .82, 0); hr.rotation.z = -.2; g.add(hr); // roundel on the hood
      var tr2 = new T.Mesh(new T.PlaneGeometry(.2, .2).rotateY(-Math.PI / 2), rd); tr2.position.set(-2.375, .62, 0); g.add(tr2);
      [-1, 1].forEach(function (s) { var d = new T.Mesh(new T.PlaneGeometry(.62, .116), bw); d.position.set(.62, .5, s * .897); if (s < 0) d.rotation.y = Math.PI; g.add(d); });
    }
    // Audi R8 LMS details: singleframe grille with the four rings, silver sill, wordmark, red wing end plates
    if (audi) {
      [-1, 1].forEach(function (s) { add(box(2.0, .025, .012), silver, -.15, .3, s * .893); }); // silver sill line
      var rg = std({ map: TF.audiDecal('rings'), transparent: true, roughness: .35, metalness: .6 }), wd = std({ map: TF.audiDecal('word'), transparent: true, roughness: .6 });
      var gr = new T.Mesh(new T.PlaneGeometry(.74, .23).rotateY(Math.PI / 2), std({ map: TF.audiDecal('grille'), transparent: true, roughness: .5 })); gr.position.set(2.405, .37, 0); g.add(gr);
      var r0 = new T.Mesh(new T.PlaneGeometry(.2, .067).rotateY(Math.PI / 2), rg); r0.position.set(2.41, .5, 0); g.add(r0);
      [-1, 1].forEach(function (s) {
        var d = new T.Mesh(new T.PlaneGeometry(.62, .116), wd); d.position.set(.62, .5, s * .897); if (s < 0) d.rotation.y = Math.PI; g.add(d);
        var q = new T.Mesh(new T.PlaneGeometry(.22, .073), rg); q.position.set(-.95, .6, s * .897); if (s < 0) q.rotation.y = Math.PI; g.add(q);
      });
      var tr = new T.Mesh(new T.PlaneGeometry(.2, .067).rotateY(-Math.PI / 2), rg); tr.position.set(-2.375, .57, 0); g.add(tr); // rings on the tail
    }
    // number roundels on the doors
    if (!ghost) [-1, 1].forEach(function (s) {
      var r = new T.Mesh(new T.CircleGeometry(.17, 28), std({ map: numTex, transparent: true, roughness: .6 }));
      r.position.set(-.2, .6, s * .897); if (s < 0) r.rotation.y = Math.PI; g.add(r);
    });

    // headlight flash: the lamps go bright white and a glow shows around them
    var glows = [];
    if (!ghost) {
      if (!glowTex) glowTex = TF.canvasTex(128, 128, function (x) {
        var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,244,215,.7)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      });
      [-1, 1].forEach(function (s) {
        var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false, toneMapped: false }));
        sp.position.set(porsche ? 2.3 : 2.42, porsche ? .72 : .5, s * (porsche ? .64 : .6)); sp.scale.set(1.7, 1.7, 1); g.add(sp); glows.push(sp);
      });
    }
    function setFlash(v) {
      if (ghost) return;
      lamp.emissiveIntensity = .35 + v * 8; lamp.color.setHex(v > 0 ? 0xffffff : 0xdfe8ff);
      for (var i = 0; i < glows.length; i++) glows[i].material.opacity = v;
    }

    var legs = { L: new T.Group(), R: new T.Group() }; // no kicking in a GT3, but the game expects these
    wheels.forEach(function (w) { TF.mergeGroup(w.spin); });
    TF.mergeGroup(swi); TF.mergeGroup(dr); TF.mergeGroup(g);
    dr.visible = false; // no driver in the GT3

    car.userData = { body: g, wheels: wheels, steeringWheel: swi, driver: dr, legs: legs, paint: ghost ? [] : [paint], setFlash: setFlash, vehicle: 'gt3' };
    return car;
  };
})();
