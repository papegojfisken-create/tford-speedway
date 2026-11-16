// The speedway: sky, sunset light, track surface, wall, fence, grandstands, towers, trees.
(function () {
  var TF = window.TF, T = THREE, K = TF.Track;

  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  TF.std = function (o) { if (o.envMapIntensity == null) o.envMapIntensity = 0.12; return new T.MeshStandardMaterial(o); };
  TF.canvasTex = function (w, h, draw, rx, ry) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = TF.anisotropy || 1;
    if (rx) t.repeat.set(rx, ry || 1);
    return t;
  };

  TF.buildWorld = function (renderer) {
    var std = TF.std, canvasTex = TF.canvasTex, LAP = K.LAP, HW = K.HW;
    TF.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var scene = new T.Scene(); scene.fog = new T.Fog(0xe9b68d, 160, 1500);
    var sunDir = new T.Vector3(0.75, 0.17, -0.63).normalize();

    // sky and sun
    var skyTex = canvasTex(4, 512, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#24406f'); g.addColorStop(.26, '#5d78a8'); g.addColorStop(.4, '#e3a987'); g.addColorStop(.47, '#ffc98a');
      g.addColorStop(.5, '#ffe0ac'); g.addColorStop(.52, '#b98a6a'); g.addColorStop(1, '#6b5646');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    skyTex.wrapS = skyTex.wrapT = T.ClampToEdgeWrapping;
    var sky = new T.Mesh(new T.SphereGeometry(2500, 32, 24), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false }));
    scene.add(sky);
    try {
      var pm = new T.PMREMGenerator(renderer), es = new T.Scene(); es.add(sky.clone());
      var sb = new T.Mesh(new T.SphereGeometry(190, 16, 12), new T.MeshBasicMaterial({ color: 0xfff0c8 }));
      sb.position.copy(sunDir).multiplyScalar(2200); es.add(sb);
      scene.environment = pm.fromScene(es, 0.03, 1, 6000).texture;
    } catch (e) { /* reflections are optional */ }
    var glow = canvasTex(128, 128, function (x) {
      var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.12, 'rgba(255,238,190,.95)'); g.addColorStop(.35, 'rgba(255,190,110,.35)'); g.addColorStop(1, 'rgba(255,160,80,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
    [420, 1500].forEach(function (sc, i) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: i ? 0.45 : 1, fog: false, toneMapped: false }));
      sp.position.copy(sunDir).multiplyScalar(2300); sp.scale.set(sc, sc, 1); scene.add(sp);
    });
    scene.add(new T.HemisphereLight(0x9fb4e0, 0x5a4a3a, 0.45));
    var sun = new T.DirectionalLight(0xffc084, 2.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    var sc = sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 520; sc.updateProjectionMatrix();
    scene.add(sun); scene.add(sun.target);
    function followSun(x, y, z) {
      x = Math.round(x / 2) * 2; z = Math.round(z / 2) * 2;
      sun.target.position.set(x, y, z); sun.position.set(x + sunDir.x * 230, y + sunDir.y * 230, z + sunDir.z * 230); sun.target.updateMatrixWorld();
    }

    // ground and track surfaces
    function V(p) { return new T.Vector3(p.x, p.y, p.z); }
    function strip(s0, s1, n, fa, fb, vs) {
      var p = [], uv = [], ix = [];
      for (var i = 0; i <= n; i++) {
        var s = s0 + (s1 - s0) * i / n, a = fa(s), b = fb(s);
        p.push(a.x, a.y, a.z, b.x, b.y, b.z); uv.push(0, s * vs, 1, s * vs);
        if (i < n) { var q = 2 * i; ix.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(ix); g.computeVertexNormals(); return g;
    }
    // d0 and d1 are sideways offsets; each may be a number or a function of s
    // h is the height of the d0 edge; h1 (optional) the height of the d1 edge, for sloped strips
    function band(d0, d1, h, mat, s0, s1, n, vs, h1) {
      var f0 = typeof d0 === 'function' ? d0 : function () { return d0; }, f1 = typeof d1 === 'function' ? d1 : function () { return d1; };
      if (s0 == null) { s0 = 0; s1 = LAP; }
      if (h1 == null) h1 = h;
      var m = new T.Mesh(strip(s0, s1, n || Math.max(2, Math.round((s1 - s0) / 1.5)),
        function (s) { return K.pos(s, f0(s), h); }, function (s) { return K.pos(s, f1(s), h1); }, vs || 1 / 14), mat);
      m.receiveShadow = true; scene.add(m); return m;
    }
    // distance from the centre line, going right, to the stadium wall
    function wallDist(s) {
      var t = K.tp(s);
      for (var d = 0; d < 60; d += 0.25) if (K.stadium(t.x + t.nx * d, t.z + t.nz * d).d > 7.2) return d;
      return 60;
    }
    function paintMat(o) { o.polygonOffset = true; o.polygonOffsetFactor = -2; o.polygonOffsetUnits = -2; o.roughness = 0.8; return std(o); }

    var ground = new T.Mesh(new T.PlaneGeometry(6000, 6000), std({ color: 0x55683a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground);
    var asphalt = canvasTex(512, 512, function (x, w, h) {
      x.fillStyle = '#48484b'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < 14000; i++) { x.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.07)'; x.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(.18, 'rgba(0,0,0,0)'); g.addColorStop(.42, 'rgba(0,0,0,.3)'); g.addColorStop(.62, 'rgba(0,0,0,.3)'); g.addColorStop(.88, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    band(-HW, HW, 0, std({ map: asphalt, roughness: .92 }));
    band(-6.85, -6.6, 0.015, paintMat({ color: 0xf1ecdf }));
    band(6.6, 6.85, 0.015, paintMat({ color: 0xf1ecdf }));

    // gravel traps and red-and-white kerbs at the slow corners
    var gravelTex = canvasTex(256, 256, function (x, w, h) {
      x.fillStyle = '#b7a583'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < 9000; i++) { x.fillStyle = rnd() < .5 ? 'rgba(70,55,35,.35)' : 'rgba(255,245,220,.3)'; x.fillRect(rnd() * w, rnd() * h, 2, 2); }
    }, 3, 1);
    var gravelM = std({ map: gravelTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    var kerbTex = canvasTex(8, 64, function (x) { x.fillStyle = '#e9e4d8'; x.fillRect(0, 0, 8, 64); x.fillStyle = '#c23a2a'; x.fillRect(0, 0, 8, 32); });
    var kerbM = paintMat({ map: kerbTex });
    function rightEdge(lim) { return function (s) { return Math.max(HW, Math.min(lim, wallDist(s) - 0.1)); }; }
    ['chicane', 'hairpin', 'turn6', 'turn8'].forEach(function (name) {
      var g = K.segs[name], mid = K.sample(K.idx((g.s0 + g.s1) / 2));
      band(HW, rightEdge(8), 0.012, kerbM, g.s0, g.s1, null, 1 / 3);
      band(-8, -HW, 0.012, kerbM, g.s0, g.s1, null, 1 / 3);
      if (mid.gr) band(rightEdge(8), rightEdge(8 + mid.gr), 0.005, gravelM, g.s0, g.s1, null, 1 / 6);
      if (mid.gl) band(-8 - mid.gl, -8, 0.005, gravelM, g.s0, g.s1, null, 1 / 6);
    });
    var chk = canvasTex(140, 20, function (x) { x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 140, 20); x.fillStyle = '#151515'; for (var i = 0; i < 14; i++) x.fillRect(i * 10, (i % 2) * 10, 10, 10); });
    chk.magFilter = T.NearestFilter;
    band(-HW, HW, 0.018, paintMat({ map: chk }), K.LINE - 0.9, K.LINE + 0.9, 2, 1 / 1.8);

    // sloped ramp kerbs on the inside of the slow corners: they rise away from the track and drop off at the back
    var rampM = std({ map: kerbTex, roughness: .8, side: T.DoubleSide }), rampBackM = std({ color: 0xe9e4d8, roughness: .8, side: T.DoubleSide });
    var SE = [K.RAMP0, K.RAMP1, K.RAMP1 + K.RAMPBACK], SH = [0.02, K.RAMPH, 0];
    K.corners.forEach(function (c) {
      for (var k = 0; k < 2; k++) {
        var mat = k ? rampBackM : rampM;
        var m = c.side > 0 ? band(SE[k], SE[k + 1], SH[k], mat, c.s0, c.s1, null, 1 / 3, SH[k + 1])
          : band(-SE[k + 1], -SE[k], SH[k + 1], mat, c.s0, c.s1, null, 1 / 3, SH[k]);
        m.castShadow = true;
      }
    });

    // wall and catch fence
    var wallTex = canvasTex(64, 128, function (x, w, h) { x.fillStyle = '#ddd7c9'; x.fillRect(0, 0, w, h); x.fillStyle = '#c4552b'; x.fillRect(w * .8, 0, w * .2, h); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, w, 2); });
    // the wall and fence follow the stadium oval, sitting on whatever ground height the track has there
    function oval(off, h) { return function (s) { var p = K.ovalPoint(s, off); return { x: p.x, y: K.locate(p.x, p.z).y + h, z: p.z }; }; }
    var wall = new T.Mesh(strip(0, K.OVAL_LAP, 400, oval(7.25, -0.3), oval(7.25, 1.15), 1 / 6), std({ map: wallTex, roughness: .85, side: T.DoubleSide }));
    wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    var fenceTex = canvasTex(64, 64, function (x) {
      x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(215,215,220,.85)'; x.lineWidth = 2;
      for (var i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
      x.lineWidth = 7; x.beginPath(); x.moveTo(0, 3); x.lineTo(64, 3); x.stroke();
    }, 5, 1);
    scene.add(new T.Mesh(strip(0, K.OVAL_LAP, 400, oval(7.35, 1.15), oval(7.35, 4.8), 1 / 3.5),
      new T.MeshBasicMaterial({ map: fenceTex, transparent: true, opacity: .5, side: T.DoubleSide, depthWrite: false })));

    // grandstands
    function boxAt(w, h, d, mat, x, y, z, shadow) {
      var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
      m.castShadow = shadow !== false; m.receiveShadow = true; scene.add(m); return m;
    }
    var crowd = canvasTex(512, 16, function (x, w, h) {
      x.fillStyle = '#5b5750'; x.fillRect(0, 0, w, h);
      var cs = ['#d94f3a', '#e8e2d2', '#2d5fa3', '#e5b53b', '#3f7d4f', '#1e1e22', '#c98f6a', '#f2f2f2'];
      for (var i = 0; i < 900; i++) { x.fillStyle = cs[(rnd() * cs.length) | 0]; x.fillRect(rnd() * w, 4 + rnd() * 9, 2.4, 4); }
    }, 18, 1);
    var concrete = std({ color: 0x9c968b, roughness: .9 }), roofM = std({ color: 0xcfc9bd, roughness: .6, metalness: .2 });
    function stand(sign, len, rows) {
      var cm = std({ map: crowd, roughness: .9 });
      // the back-straight stand sits between the low sun and the track, so it casts no shadow: the track stays sunlit
      var sh = sign > 0;
      for (var i = 0; i < rows; i++) { var h = 1.6 + i * 0.95; boxAt(len, h, 1.75, cm, 0, h / 2, sign * (80 + i * 1.75), sh); }
      var back = 80 + rows * 1.75 + 1, top = 1.6 + rows * 0.95 + 6;
      boxAt(len, top, 2, concrete, 0, top / 2, sign * back, sh);
      var rf = boxAt(len + 6, 0.5, rows * 1.75 + 6, roofM, 0, top + 0.4, sign * (back - rows * 0.9 - 1), sh); rf.rotation.x = sign * 0.07;
      boxAt(len * 0.22, 3.2, 4, std({ color: 0x30404f, roughness: .2, metalness: .6, emissive: 0x4a3a22, emissiveIntensity: .6 }), 0, top + 2.4, sign * (back - 1), sh);
    }
    stand(1, 236, 12); stand(-1, 150, 7);

    // floodlight towers
    var poleM = std({ color: 0x6f7378, roughness: .6, metalness: .5 }), lampM = std({ color: 0xfff3d0, emissive: 0xffe2a6, emissiveIntensity: 1.4 });
    [[-70, 112], [70, 112], [178, 78], [178, -78], [-178, 78], [-178, -78], [-55, -100], [55, -100]].forEach(function (p) {
      var c = new T.Mesh(new T.CylinderGeometry(.3, .5, 36, 8), poleM); c.position.set(p[0], 18, p[1]); scene.add(c);
      var l = boxAt(7, 3.2, .7, lampM, p[0], 37, p[1], false); l.lookAt(0, 5, 0);
    });

    // infield: scoring pylon, pit building, pit road
    var pyl = canvasTex(64, 512, function (x, w, h) {
      x.fillStyle = '#101012'; x.fillRect(0, 0, w, h); x.font = 'bold 40px monospace'; x.textAlign = 'center';
      ['7', '45', '47', '4'].forEach(function (t, i) { x.fillStyle = i ? '#ffb43a' : '#fff3d0'; x.fillText(t, w / 2, 70 + i * 118); });
    });
    pyl.wrapS = pyl.wrapT = T.ClampToEdgeWrapping;
    boxAt(2.4, 17, 2.4, std({ map: pyl, emissiveMap: pyl, emissive: 0xffffff, emissiveIntensity: .7, roughness: .5 }), 45, 8.5, -15);
    boxAt(64, 4, 9, std({ color: 0xe4dfd3, roughness: .8 }), 20, 2, 28); boxAt(66, .4, 10.5, std({ color: 0x3a3f46, roughness: .6 }), 20, 4.2, 28);
    var pit = new T.Mesh(new T.PlaneGeometry(100, 9), std({ color: 0x626163, roughness: .95 }));
    pit.rotation.x = -Math.PI / 2; pit.position.set(32, -0.03, 44); pit.receiveShadow = true; scene.add(pit);

    // trees and hills on the horizon
    var trees = new T.InstancedMesh(new T.ConeGeometry(4.5, 13, 7), std({ color: 0x2c4326, roughness: 1 }), 320), dm = new T.Object3D();
    for (var i = 0; i < 320; i++) {
      var an = rnd() * Math.PI * 2, k = rnd(), s = .7 + rnd() * 1.1;
      dm.position.set(Math.cos(an) * (270 + k * 260), 6.5 * s, Math.sin(an) * (200 + k * 240)); dm.scale.set(s, s, s); dm.rotation.y = rnd() * 3; dm.updateMatrix(); trees.setMatrixAt(i, dm.matrix);
    }
    scene.add(trees);
    var hillM = std({ color: 0x4e5a4a, roughness: 1 });
    for (i = 0; i < 9; i++) {
      var ha = i / 9 * Math.PI * 2 + .3, hr = 1000 + rnd() * 300, hm = new T.Mesh(new T.SphereGeometry(260 + rnd() * 160, 16, 10), hillM);
      hm.scale.y = .22 + rnd() * .12; hm.position.set(Math.cos(ha) * hr, -10, Math.sin(ha) * hr); scene.add(hm);
    }

    // solid infield objects as [minX, maxX, minZ, maxZ], grown by the car's half width
    var colliders = [[-13 - 1, 53 + 1, 22.75 - 1, 33.25 + 1], [43.8 - 1, 46.2 + 1, -16.2 - 1, -13.8 + 1]];
    return { scene: scene, followSun: followSun, colliders: colliders };
  };
})();
