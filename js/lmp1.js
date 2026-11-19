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

  // the reduced Porsche 963 body (js/p963data.js): decoded once, then every car shares the same geometry
  function p963Geos() {
    var d = TF.P963; if (d.geos) return d.geos;
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

  // Liveries for the 963 body, one per paint colour: the paint is striped by the graphics card per pixel, so the edges stay crisp however
  // coarse the body mesh is. Colours are hex (null = no stripe there): f1/f2/f3 = three bands along the flank (low, middle, high),
  // ctrO/ctrI = outer and inner stripe down the nose and roof, plLo/plHi = lower and upper part of the wing end plates, fin = top of the tail fin,
  // fr = front wing end plates and the corners of the nose. Plus the wordmark and the emblem for the nose.
  var K_BLK = 0x0a0a0b, K_RED = 0x800004, K_WHT = 0xf4f4f2, K_PRED = 0xf0001e; // K_PRED: Porsche's bright "Guards" red
  var LIV = {
    porsche: { slant: .12, flankAll: true, f1: K_BLK, f2: K_BLK, f3: K_PRED, ctrO: K_PRED, ctrI: K_BLK, plLo: K_BLK, plHi: K_PRED, fin: K_PRED, fr: K_PRED, word: function () { return TF.porscheDecal('word'); }, ws: [.8, .15], emb: function () { return TF.porscheDecal('crest'); }, es: [.2, .2] },
    ferrari: { nose3: [0x009246, 0xf4f4f2, 0xce2b37], roof3: true, flankAll: true, f1: K_BLK, f2: K_BLK, f3: 0xffd400, fr: 0xffd400, plLo: 0x009246, plHi: 0xce2b37, word: function () { return TF.ferrariDecal('word'); }, ws: [.75, .19], emb: function () { return TF.ferrariDecal('shield'); }, es: [.18, .2] },
    audi: { slant: .06, flankAll: true, ctrO: 0xd0021b, ctrI: 0xc9ccd2, f1: 0xc9ccd2, f2: 0xc9ccd2, f3: 0xd0021b, plLo: 0xc9ccd2, plHi: 0xd0021b, fr: 0xd0021b, word: function () { return TF.audiDecal('word'); }, ws: [.8, .15], emb: function () { return TF.audiDecal('rings'); }, es: [.3, .1] },
    bmw: { nose3: [0x81c4ff, 0x16288f, 0xe4002b], roof3: true, outline: false, flankAll: true, f1: 0x81c4ff, f2: 0x16288f, f3: 0xe4002b, plLo: 0x16288f, plHi: 0x81c4ff, fr: 0xe4002b, word: function () { return TF.bmwDecal('word'); }, ws: [.8, .15], emb: function () { return TF.bmwDecal('roundel'); }, es: [.2, .2] },
    mclaren: { roofFill: K_BLK, flankAll: true, f1: K_BLK, f2: K_BLK, f3: K_WHT, ctrO: K_WHT, ctrI: K_BLK, plLo: K_BLK, plHi: K_WHT, fr: K_BLK, word: function () { return TF.mclarenDecal('word'); }, ws: [.8, .15], emb: function () { return TF.mclarenDecal('speed'); }, es: [.4, .15] },
    aston: { flankAll: true, f1: K_BLK, f2: K_BLK, f3: 0xb8e600, ctrO: 0xb8e600, ctrI: K_BLK, plLo: K_BLK, plHi: 0xb8e600, fr: 0xb8e600, word: function () { return TF.astonDecal('word'); }, ws: [.8, .15], emb: function () { return TF.astonDecal('wings'); }, es: [.3, .11] }
  };
  TF.LIV = LIV; TF.livV3 = function (h) { return v3(h); }; // the GT3 body uses the same colour table
  function v3(h) { return 'vec3(' + [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(function (x) { return (x / 255).toFixed(3); }).join(',') + ')'; }
  function liveryShader(sp) {
    return function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', 'varying vec3 vOP; varying vec3 vON;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      var L = [
        '#include <color_fragment>',
        'vec3 P = vOP; vec3 Nn = normalize(vON); float az = abs(P.z); vec3 lc = diffuseColor.rgb;',
        'float flank = smoothstep(.15, .25, abs(Nn.z)) * bnd(P.x, -2.3, 1.9) * smoothstep(.37, .41, az);',
        'float up = smoothstep(.3, .4, Nn.y);',
        'float nose = up * bnd(P.x, 1.0, 2.5); float roof = up * bnd(P.x, -.9, .95) * smoothstep(.88, .92, P.y);',
        'float plate = bnd(P.x, -3., -1.7) * smoothstep(.83, .87, az); float plow = 1. - smoothstep(.79, .81, P.y);'];
      L.push('float yy = P.y + ' + (sp.slant || 0).toFixed(3) + ' * P.x;'); // slanted stripes: the bands climb towards the tail
      if (sp.f1 != null) L.push('lc = mix(lc, ' + v3(sp.f1) + ', flank * bnd(yy, .3, .37));');
      if (sp.f2 != null) L.push('lc = mix(lc, ' + v3(sp.f2) + ', flank * bnd(yy, .37, .43));');
      if (sp.f3 != null) L.push('lc = mix(lc, ' + v3(sp.f3) + ', flank * bnd(yy, .43, .49));');
      if (sp.ctrO != null) L.push('lc = mix(lc, ' + v3(sp.ctrO) + ', nose * (1. - smoothstep(.125, .135, az))); lc = mix(lc, ' + v3(sp.ctrO) + ', roof * (1. - smoothstep(.11, .12, az)));');
      if (sp.ctrI != null) L.push('lc = mix(lc, ' + v3(sp.ctrI) + ', nose * (1. - smoothstep(.085, .095, az))); lc = mix(lc, ' + v3(sp.ctrI) + ', roof * (1. - smoothstep(.075, .085, az)));');
      if (sp.nose3) L.push('lc = mix(lc, ' + v3(sp.nose3[0]) + ', nose * bnd(P.z, -.12, -.04)); lc = mix(lc, ' + v3(sp.nose3[1]) + ', nose * bnd(P.z, -.04, .04)); lc = mix(lc, ' + v3(sp.nose3[2]) + ', nose * bnd(P.z, .04, .12)); ' + (sp.outline === false ? '' : 'lc = mix(lc, vec3(.02), nose * (bnd(P.z, -.13, -.12) + bnd(P.z, .12, .13)));') + (sp.roof3 ? ' lc = mix(lc, ' + v3(sp.nose3[0]) + ', roof * bnd(P.z, -.12, -.04)); lc = mix(lc, ' + v3(sp.nose3[1]) + ', roof * bnd(P.z, -.04, .04)); lc = mix(lc, ' + v3(sp.nose3[2]) + ', roof * bnd(P.z, .04, .12));' : '')); // three stripes side by side down the nose (and over the roof for BMW)
      if (sp.plLo != null) L.push('lc = mix(lc, ' + v3(sp.plLo) + ', plate * plow);');
      if (sp.plHi != null) L.push('lc = mix(lc, ' + v3(sp.plHi) + ', plate * (1. - plow));');
      if (sp.fin != null) L.push('lc = mix(lc, ' + v3(sp.fin) + ', bnd(P.x, -3., -1.0) * (1. - smoothstep(.055, .065, az)) * smoothstep(.97, .99, P.y));');
      if (sp.fr != null) L.push('lc = mix(lc, ' + v3(sp.fr) + ', smoothstep(2.24, 2.26, P.x) * smoothstep(.77, .79, az));');
      L.push('sm = min(1., dot(abs(lc - diffuseColor.rgb), vec3(1.)) * 4.); diffuseColor.rgb = lc;'); // sm: how much of this pixel is stripe
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying vec3 vOP; varying vec3 vON;\nfloat sm;\nfloat bnd(float v, float a, float b) { float e = .004; return smoothstep(a - e, a + e, v) * (1. - smoothstep(b - e, b + e, v)); }\n#include <common>')
        .replace('#include <color_fragment>', L.join('\n'))
        // stripes are matte and take no self-light, so red stays red instead of washing out to pink
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .6, sm);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= (1. - sm);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (1. - sm);');
    };
  }
  // ---- the detailed prototype liveries (the GT3 bodies keep TF.LIV above) ----
  // Everything is drawn per pixel in the body's own coordinates (x forward, y up, z sideways), in layers:
  // lo = lower body colour under a line that climbs towards the tail; sw = the sweep above it (1 to 3 colours stacked);
  // pin / pin2 = pinstripes under and over the sweep; dots = a halftone dot fade over the rear flank; hash = slanted marks
  // on the sidepod; c = centre stripes nose-roof-fin [inner, outer] with cpin outlines; fin + chev = tail fin colour and its
  // chevrons; fen = twin pinstripes along the front fenders; sill = the thin line along the bottom; pl = wing end plates [low, high];
  // fr = nose corners. flag = the small flag by the cockpit; tag = the colour of the small lettering.
  var LIV1 = {
    porsche: { lo: 0x0b0b0c, sw: [0xf0001e], pin: 0x0b0b0c, pin2: 0xf0001e, dots: 0xf0001e, hash: 0x0b0b0c, c: [0x0b0b0c, 0xf0001e], cpin: 0x0b0b0c, fin: 0x0b0b0c, chev: 0xf0001e, fen: 0xf0001e, sill: 0xf0001e, pl: [0x0b0b0c, 0xf0001e], fr: 0xf0001e, flag: 'de', tag: '#f4f4f2' },
    ferrari: { lo: 0x0b0b0c, sw: [0x009246, 0xf4f4f2, 0xce2b37], pin: 0xffd400, pin2: 0xffd400, dots: 0xffd400, hash: 0xf4f4f2, c: [0xf4f4f2, 0x009246], cpin: 0xffd400, fin: 0x0b0b0c, chev: 0xffd400, fen: 0xffd400, sill: 0xffd400, pl: [0x0b0b0c, 0xffd400], fr: 0xffd400, flag: 'it', tag: '#ffd400' },
    audi: { lo: 0xb9bcc2, sw: [0xd0021b], pin: 0xd0021b, pin2: 0xb9bcc2, dots: 0xd0021b, hash: 0xb9bcc2, c: [0xd0021b, 0xb9bcc2], cpin: 0xd0021b, fin: 0xd0021b, chev: 0xf4f4f2, fen: 0xd0021b, sill: 0xd0021b, pl: [0xb9bcc2, 0xd0021b], fr: 0xd0021b, flag: 'de', tag: '#111112' },
    bmw: { lo: 0x0b0b0c, sw: [0xe4002b, 0x16288f, 0x81c4ff], pin: 0xf4f4f2, pin2: 0x81c4ff, dots: 0x81c4ff, hash: 0xf4f4f2, c: [0xe4002b, 0x81c4ff], cpin: 0xf4f4f2, fin: 0x0b0b0c, chev: 0x81c4ff, fen: 0x81c4ff, sill: 0xe4002b, pl: [0x0b0b0c, 0x81c4ff], fr: 0xe4002b, flag: 'de', tag: '#f4f4f2' },
    mclaren: { lo: 0x1d2026, sw: [0x1d2026, 0xf4f4f2], pin: 0x47c7fc, pin2: 0x47c7fc, dots: 0x1d2026, hash: 0xf4f4f2, c: [0x1d2026, 0xf4f4f2], cpin: 0x47c7fc, fin: 0x1d2026, chev: 0xff8000, fen: 0x47c7fc, sill: 0x47c7fc, pl: [0x1d2026, 0x47c7fc], fr: 0x1d2026, flag: 'gb', tag: '#47c7fc' },
    aston: { lo: 0x0b0b0c, sw: [0xb8e600], pin: 0xb8e600, pin2: 0xf4f4f2, dots: 0xb8e600, hash: 0xb8e600, c: [0xb8e600, 0x0b0b0c], cpin: 0xf4f4f2, fin: 0x0b0b0c, chev: 0xb8e600, fen: 0xb8e600, sill: 0xb8e600, pl: [0x0b0b0c, 0xb8e600], fr: 0xb8e600, flag: 'gb', tag: '#b8e600' }
  };
  function lmpLivery(sp) {
    return function (sh) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', 'varying vec3 vOP; varying vec3 vON;\n#include <common>').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      var M = function (c, w) { return 'lc = mix(lc, ' + v3(c) + ', clamp(' + w + ', 0., 1.));'; };
      var L = ['#include <color_fragment>',
        'vec3 P = vOP; vec3 Nn = normalize(vON); float az = abs(P.z); vec3 lc = diffuseColor.rgb;',
        'float side = smoothstep(.35, .6, abs(Nn.z)); float up = smoothstep(.25, .45, Nn.y);',
        'float flk = side * smoothstep(.3, .36, az) * bnd(P.x, -2.45, 2.45);',                               // the outer body sides
        'float finS = side * (1. - smoothstep(.1, .13, az)) * smoothstep(.62, .66, P.y) * bnd(P.x, -2.5, -.9);', // the tail fin's sides
        'float ll = .3 + .11 * smoothstep(1.6, -2.2, P.x);',                                                    // the low line, climbing to the tail
        'float tt = smoothstep(.6, -2.3, P.x); float s0 = ll + .022; float s1 = s0 + .06 + .2 * tt;',        // the sweep, widening at the rear
        'float lower = flk * (1. - smoothstep(ll - .003, ll + .003, P.y)) + smoothstep(.5, .7, Nn.x) * (1. - smoothstep(.27, .29, P.y)) * step(1.9, P.x);'];
      if (sp.lo != null) L.push(M(sp.lo, 'lower'));
      if (sp.pin != null) L.push(M(sp.pin, 'flk * bnd(P.y, ll + .006, ll + .014)'));
      var n = sp.sw.length;
      sp.sw.forEach(function (c, k) { L.push(M(c, 'flk * bnd(P.y, s0 + (s1 - s0) * ' + (k / n).toFixed(3) + ', s0 + (s1 - s0) * ' + ((k + 1) / n).toFixed(3) + ')')); });
      if (sp.pin2 != null) L.push(M(sp.pin2, 'flk * bnd(P.y, s1 + .012, s1 + .02)'));
      // a bold diagonal slash rising towards the tail just behind the cockpit, with a thin twin
      L.push('float su = P.x + 1.6 * (P.y - .3); float sz = flk * step(s1, P.y) * (1. - smoothstep(.74, .76, P.y)) * bnd(P.x, -1.25, .2);',
        M(sp.sw[n - 1], 'sz * bnd(su, -.38, -.26)'), M(sp.pin2 != null ? sp.pin2 : sp.sw[0], 'sz * bnd(su, -.22, -.195)'));
      if (sp.dots != null) L.push( // halftone dots: bigger towards the tail and towards the sweep, staggered rows
        'vec2 dg = vec2(P.x, P.y) / .045; dg.x += .5 * mod(floor(dg.y), 2.); vec2 dc = fract(dg) - .5;',
        'float dr = .5 * smoothstep(.35, -2.1, P.x) * (1. - clamp((P.y - s1 - .035) / .17, 0., 1.));',
        M(sp.dots, 'flk * bnd(P.y, s1 + .035, s1 + .21) * (1. - smoothstep(dr - .07, dr + .07, length(dc))) * step(.06, dr)'));
      if (sp.hash != null) L.push(M(sp.hash, 'flk * bnd(P.x, .45, 1.05) * bnd(P.y, s1 + .03, s1 + .095) * step(fract((P.x + P.y * .8) / .055), .42)'));
      // centre stripes from the nose over the roof and the engine cover to the top of the fin, outlined by pinstripes
      L.push('float ctr = up * bnd(P.x, -2.45, 2.45);');
      if (sp.c) { L.push(M(sp.c[1], 'ctr * (1. - smoothstep(.115, .122, az))'), M(sp.c[0], 'ctr * (1. - smoothstep(.06, .066, az))')); }
      if (sp.cpin != null) L.push(M(sp.cpin, 'ctr * (bnd(az, .132, .14) + bnd(az, .074, .08))'));
      if (sp.fin != null) L.push(M(sp.fin, 'finS * (1. - smoothstep(-2.17, -2.15, P.x))')); // the fin's trailing edge (the name sits in front of it)
      if (sp.chev != null) L.push(M(sp.chev, 'finS * bnd(P.x, -2.1, -1.1) * bnd(P.y, .7, .84) * step(fract((P.x + abs(P.y - .77) * 1.4) / .1), .45)')); // a row of forward-pointing chevrons under the name
      if (sp.fen != null) L.push(M(sp.fen, 'up * bnd(P.x, 1.0, 2.35) * (bnd(az, .78, .792) + bnd(az, .812, .824))'));
      if (sp.sill != null) L.push(M(sp.sill, 'flk * bnd(P.y, .175, .19)'));
      L.push(M(0x111112, '.6 * flk * (bnd(P.x, .42, .428) + bnd(P.x, -.9, -.892)) * bnd(P.y, ll + .02, .95)')); // door and panel seams
      L.push('float plate = bnd(P.x, -3., -1.7) * smoothstep(.83, .87, az); float plow = 1. - smoothstep(.79, .81, P.y);');
      if (sp.pl) L.push(M(sp.pl[0], 'plate * plow'), M(sp.pl[1], 'plate * (1. - plow)'), M(sp.pin2 != null ? sp.pin2 : sp.pl[1], 'plate * bnd(P.y, .66, .675)'));
      if (sp.fr != null) L.push(M(sp.fr, 'smoothstep(2.24, 2.26, P.x) * smoothstep(.77, .79, az)'));
      L.push('sm = min(1., dot(abs(lc - diffuseColor.rgb), vec3(1.)) * 4.); diffuseColor.rgb = lc;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying vec3 vOP; varying vec3 vON;\nfloat sm;\nfloat bnd(float v, float a, float b) { float e = .004; return smoothstep(a - e, a + e, v) * (1. - smoothstep(b - e, b + e, v)); }\n#include <common>')
        .replace('#include <color_fragment>', L.join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .55, sm);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= (1. - sm);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (1. - sm);');
    };
  }
  // small decals: the flag by the cockpit and a line of lettering on the sidepod
  var smallTex = {};
  function flagTex(f) {
    return smallTex['f' + f] || (smallTex['f' + f] = TF.canvasTex(96, 64, function (x) {
      var cols = f === 'it' ? ['#009246', '#f4f4f2', '#ce2b37'] : f === 'de' ? ['#111', '#dd0000', '#ffce00'] : null;
      if (cols && f === 'it') cols.forEach(function (c, i) { x.fillStyle = c; x.fillRect(i * 32, 0, 32, 64); });
      else if (cols) cols.forEach(function (c, i) { x.fillStyle = c; x.fillRect(0, i * 21.34, 96, 21.34); });
      else { // a simple Union flag
        x.fillStyle = '#012169'; x.fillRect(0, 0, 96, 64); x.strokeStyle = '#fff'; x.lineWidth = 13; x.beginPath(); x.moveTo(0, 0); x.lineTo(96, 64); x.moveTo(96, 0); x.lineTo(0, 64); x.stroke();
        x.strokeStyle = '#c8102e'; x.lineWidth = 5; x.stroke(); x.fillStyle = '#fff'; x.fillRect(38, 0, 20, 64); x.fillRect(0, 22, 96, 20); x.fillStyle = '#c8102e'; x.fillRect(42, 0, 12, 64); x.fillRect(0, 26, 96, 12);
      }
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2; x.strokeRect(1, 1, 94, 62);
    }));
  }
  function tagTex(c, words) {
    var key = 't' + c + words;
    return smallTex[key] || (smallTex[key] = TF.canvasTex(768, 64, function (x) {
      x.fillStyle = c; x.font = 'italic bold 36px Arial,sans-serif'; x.textBaseline = 'middle'; x.fillText(words, 6, 34, 756);
    }));
  }

  TF.LIV1 = LIV1; TF.livFlag = flagTex; TF.livTag = tagTex; // the GT3 bodies use the same designs, fitted to their own shapes

  // the outermost point of the body in a box: where to stick a decal
  function bodyEdge(box, sign) {
    var G = TF.P963.geos.paint, P = G.attributes.position.array, best = null;
    for (var i = 0; i < P.length; i += 3) if (P[i] > box[0] && P[i] < box[1] && P[i + 1] > box[2] && P[i + 1] < box[3] && P[i + 2] * sign > 0) { var a = Math.abs(P[i + 2]); if (best === null || a > best) best = a; }
    return best;
  }

  // the tail fin: its top height and its half thickness at a given x, found from the body itself (only points close to the centre line)
  function finAt(x0) {
    var P = TF.P963.geos.paint.attributes.position.array, top = 0, hw = 0, i;
    for (i = 0; i < P.length; i += 3) if (Math.abs(P[i] - x0) < .15 && Math.abs(P[i + 2]) < .12 && P[i + 1] > top) top = P[i + 1];
    for (i = 0; i < P.length; i += 3) if (Math.abs(P[i] - x0) < .15 && Math.abs(P[i + 2]) < .12 && P[i + 1] > top - .2 && Math.abs(P[i + 2]) > hw) hw = Math.abs(P[i + 2]);
    return { top: top, hw: hw };
  }
  // the highest point of the body near the centre line, for the nose number
  function bodyEdgeTop(xr, zr) {
    var P = TF.P963.geos.paint.attributes.position.array, best = 0.5;
    for (var i = 0; i < P.length; i += 3) if (P[i] > xr[0] && P[i] < xr[1] && Math.abs(P[i + 2]) < zr && P[i + 1] > best) best = P[i + 1];
    return best;
  }

  TF.buildLmp1 = function (color, ghost, number, ai) {
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

    var model = !ghost && !!TF.P963; // the real 963 body (with a livery per paint colour) instead of the generic shell; the ghost stays a simple outline
    if (!model) {
    // central tub with the long pointed nose and the tail
    var tub =[[2.62, -.04, .04, .15, .21], [2.42, -.2, .2, .14, .29], [2.1, -.35, .35, .12, .37], [1.6, -.47, .47, .1, .49], [.9, -.51, .51, .1, .58],
      [.3, -.53, .53, .1, .62], [-.4, -.54, .54, .1, .64], [-1.0, -.52, .52, .1, .72], [-1.7, -.46, .46, .12, .76], [-2.2, -.34, .34, .2, .66], [-2.52, -.2, .2, .3, .52]];
    add(loft(tub, 2.4, 20), paint, 0, 0, 0);
    // front wheel arches and rear wheel fairings, sidepods
    // (the 919 has sharp, tall front fender crests with a low nose valley between them)
    var fArch = porsche ? [[2.3, .36, .62, .28, .48], [2.08, .4, .94, .4, .74], [1.8, .38, 1.08, .45, .9], [1.4, .38, 1.1, .46, .92], [1.05, .42, .98, .44, .84], [.75, .5, .8, .42, .7]]
      : [[2.2, .38, .68, .3, .5], [1.98, .42, 1.0, .42, .76], [1.62, .4, 1.1, .5, .86], [1.28, .42, .98, .46, .76], [.98, .5, .72, .4, .6]];
    var rArch = [[-.7, .5, .78, .45, .8], [-1.0, .45, 1.12, .5, .92], [-1.5, .4, 1.22, .5, 1.0], [-2.0, .4, 1.08, .5, .92], [-2.42, .3, .72, .5, .76]];
    var pod = [[1.0, .44, .78, .24, .5], [.5, .44, .82, .22, .56], [-.1, .44, .82, .22, .58], [-.75, .46, .7, .3, .6]];
    [fArch, rArch, pod].forEach(function (st) { var ex = porsche ? (st === fArch ? 2.9 : st === rArch ? 2.8 : 2.6) : 2.6; /* the 963's bodywork is rounder than the 919's */ add(loft(st, ex, 18), paint, 0, 0, 0); add(loft(mirrorStations(st), ex, 18), paint, 0, 0, 0); });

    [-1, 1].forEach(function (s) {
      add(box(.5, .14, .05), trim, .35, .44, s * .83);           // sidepod intakes
      add(box(.3, .05, .3), carbon, 2.1, .27, s * .55).rotation.y = s * -.3;   // front canards
      if (bmw) { /* kidney lights are added with the BMW details */ }
      else if (audi) for (var al = 0; al < 3; al++) add(box(.34, .022, .16), led, 2.05, .31 + al * .045, s * .26); // the R18's stacked LED strips
      else if (!porsche) add(box(.32, .05, .14), led, 2.05, .35, s * .24);          // front light strips
      else for (var li = 0; li < 4; li++) add(box(.035, .17 - li * .02, .04), led, 2.2 - li * .035, .5 + li * .012, s * (.5 + li * .075)); // the 919's four vertical LED bars in the fender nose
      if (!porsche) add(box(.04, .2, .34), tail, -2.5, .46, s * .12);          // tail lights
      else add(box(.03, .045, .3), tail, -2.56, .6, s * .2);                   // the 919's slim LED tail light
      add(cyl(.05, .3, 10).rotateZ(Math.PI / 2), silver, -2.45, .4, s * .2); // exhaust tips
      if (!porsche) {
        add(box(1.0, .55, .035), paint, -2.3, 1.0, s * .88);     // rear wing end plates
        add(box(.4, .3, .036), accent, -2.5, 1.04, s * .88);
        add(box(.5, .32, .03), paint, 2.55, .3, s * .7);         // front wing end plates
      } else { // 919: tall rear end plates with a red and a black stripe, big front end plates
        add(box(1.15, .74, .035), paint, -2.35, 1.06, s * .93);
        add(box(1.0, .07, .04), accent, -2.35, .86, s * .93); add(box(1.0, .05, .04), carbon, -2.35, .77, s * .93); add(box(.5, .06, .04), accent, -2.55, 1.22, s * .93);
        add(box(.72, .44, .04), paint, 2.55, .33, s * .92);
        add(box(.5, .05, .045), accent, 2.55, .22, s * .92);
      }
    });
    // floor, splitter, diffuser
    add(box(4.5, .05, 1.74), carbon, -.1, .09, 0);
    add(box(.75, .04, 1.6), carbon, 2.55, .08, 0);
    add(box(.55, .05, 1.5), carbon, -2.3, .2, 0).rotation.z = .25;
    if (!porsche) add(box(.4, .03, 1.4), carbon, 2.62, .3, 0);   // front wing plane
    else { add(box(.46, .035, 1.84), carbon, 2.6, .27, 0); add(box(.3, .03, 1.84), carbon, 2.48, .38, 0).rotation.z = .12; } // two-element front wing
    // tail fin and the two-element rear wing (the 919's fin is taller and runs right up to the wing)
    if (!porsche) {
      add(prism([[-0.8, .74], [-2.3, 1.02], [-2.58, 1.08], [-2.58, .56], [-1.6, .62]], .05, .012), paint, 0, 0, 0);
      add(box(.62, .045, 1.76), carbon, -2.4, 1.1, 0).rotation.z = -.12;
      add(box(.4, .04, 1.76), carbon, -2.3, 1.3, 0).rotation.z = -.22;
    } else {
      add(prism([[-0.3, .84], [-0.9, 1.0], [-2.3, 1.2], [-2.6, 1.22], [-2.6, .56], [-1.6, .62]], .05, .012), paint, 0, 0, 0); // the 963's long shark fin
      add(box(.42, .18, .36), trim, -.5, 1.15, 0);                 // big roof air scoop
      add(box(.66, .05, 1.86), carbon, -2.4, 1.14, 0).rotation.z = -.12;
      add(box(.44, .045, 1.86), carbon, -2.32, 1.36, 0).rotation.z = -.22;
    }
    } else { [-1, 1].forEach(function (s) { add(cyl(.05, .3, 10).rotateZ(Math.PI / 2), silver, -2.45, .4, s * .2); }); } // (the 963 body has its own wings and lights; just the exhaust tips are added)

    // cockpit: bubble canopy (tinted from outside, see-through from inside), roof, air intake above it
    if (!model) {
    if (porsche) { E(1.1, .3, .42, .05, .8, 0, glass); E(.72, .07, .34, -.2, 1.07, 0, paint); } // 919: a longer canopy with a big windscreen
    else { E(.9, .3, .4, -.15, .8, 0, glass); E(.6, .08, .34, -.25, 1.07, 0, paint); }
    add(box(.34, .12, .3), trim, -.55, 1.12, 0);
    add(box(.34, .02, .3), carbon, -.55, 1.19, 0);
    [-1, 1].forEach(function (s) { rod(V(.58, .66, s * .33), V(.1, 1.0, s * .27), .03, carbon); }); // A pillars
    }
    if (!model) add(box(.34, .12, .76), trim, .52, .73, 0);      // dash
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
    if (porsche && !model) {
      [-1, 1].forEach(function (s) {
        add(box(1.7, .08, .02), carbon, .1, .47, s * .812);       // black band on the sidepod
        add(box(1.7, .05, .02), accent, .1, .395, s * .822);      // red band below it
        add(box(.5, .012, .34), carbon, 1.5, .925, s * .8);       // one wide black air outlet on the front fender
        for (var lv = 0; lv < 3; lv++) add(box(.04, .016, .34), accent, 1.35 + lv * .15, .93, s * .8); // with red slats
        add(box(.55, .12, .02), carbon, 1.7, .66, s * 1.095).rotation.y = s * .04; // black front fender side vent
        add(box(.5, .02, .09), carbon, 1.75, .465, s * .18).rotation.y = s * .25;  // black stripes angling over the nose
        add(box(.5, .02, .05), accent, 1.55, .515, s * .22).rotation.y = s * .25;
      });
      E(.45, .05, .3, -.3, 1.12, 0, carbon);                      // black roof insert
      var wm = std({ map: TF.porscheDecal('word'), transparent: true, roughness: .6 });
      [-1, 1].forEach(function (s) {
        var f = new T.Mesh(new T.PlaneGeometry(1.0, .19), wm); f.position.set(-1.65, .87, s * .043); f.rotation.z = -.13 * s; if (s < 0) f.rotation.y = Math.PI; g.add(f); // on the tail fin
      });
      var wing = new T.Mesh(new T.PlaneGeometry(1.2, .23).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), wm); wing.position.set(-2.4, 1.17, 0); wing.rotation.z = -.12; g.add(wing); // across the rear wing
      var crest = new T.Mesh(new T.PlaneGeometry(.16, .16).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), std({ map: TF.porscheDecal('crest'), transparent: true, roughness: .5 })); crest.position.set(2.05, .395, 0); g.add(crest);
    }
    // Aston Martin Valkyrie: racing green with lime stripes, a lime centre stripe over the roof, wings badge, ASTON MARTIN on the fin and wing
    if (ast && !model) {
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
    if (mcl && !model) {
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
    if (bmw && !model) {
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
    if (audi && !model) {
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
    if (ferrari && !model) {
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
    function setBoost(v) { } // (the boost used to light a glow behind the car; it now works without the light, as asked)

    var legs = { L: new T.Group(), R: new T.Group() };
    wheels.forEach(function (w) { TF.mergeGroup(w.spin); });
    TF.mergeGroup(swi); TF.mergeGroup(dr); TF.mergeGroup(g);
    dr.visible = false; // no driver in the prototype
    // the 963 body goes in after the merge: its geometry is shared by every Porsche on the track instead of copied
    if (model) {
      // every paint colour wears its own livery on the same body (see LIV): the model's black parts (wings, flaps, splitter, vents) and the underbody take the body paint
      var brand = porsche ? 'porsche' : ferrari ? 'ferrari' : audi ? 'audi' : bmw ? 'bmw' : mcl ? 'mclaren' : ast ? 'aston' : 'porsche', LV = LIV[brand];
      if (paint.emissive) paint.emissive.setHex(brand === 'porsche' ? 0x1a1a1c : 0x000000); // a little self-light so white stays white in shade
      if (brand !== 'porsche') { paint.metalness = .1; paint.envMapIntensity = .4; } // coloured paints: less shine, so they do not look washed out
      if (brand === 'ferrari') { paint.color.setHex(0xd00000); paint.emissive.setHex(0x1e0000); paint.metalness = 0; paint.roughness = .38; paint.envMapIntensity = .22; } // Rosso Corsa: a deep, strong red instead of a pinkish one
      var L1 = LIV1[brand];
      paint.customProgramCacheKey = function () { return 'p963v2' + brand; };
      paint.onBeforeCompile = lmpLivery(L1);
      paint.side = T.DoubleSide; // the shell has small gaps and openings: this fills them with the white of the panel behind instead of showing the dark inside
      var PG = p963Geos(), roleMat = { paint: paint, black: paint, glass: glass, light: led, tail: tail, red: accent, floor: M({ color: 0xdcdcde, roughness: .5 }) };
      Object.keys(PG).forEach(function (k) {
        var pm = new T.Mesh(PG[k], roleMat[k] || carbon);
        if (k !== 'glass') { pm.castShadow = !ai; pm.receiveShadow = true; }
        g.add(pm);
      });
      // the number sits low on the flank just in front of the rear wheel; the wordmark takes the spot by the cockpit; an emblem goes on the nose
      var wmM = std({ map: LV.word(), transparent: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 }), rdM = std({ map: numTex, transparent: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 });
      var fin = finAt(-1.65); // the name goes on both sides of the tail fin, following its sloping top edge
      [-1, 1].forEach(function (s) {
        var e1 = bodyEdge([-1.05, -.75, .35, .55], s);
        if (e1) { var r = new T.Mesh(new T.CircleGeometry(.17, 28), rdM); r.position.set(-.92, .45, s * (e1 + .006)); if (s < 0) r.rotation.y = Math.PI; g.add(r); }
        var e2 = bodyEdge([.45, .75, .55, .7], s); // the flag, just ahead of the cockpit
        if (e2) { var fl = new T.Mesh(new T.PlaneGeometry(.15, .1), std({ map: flagTex(L1.flag), roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 })); fl.position.set(.6, .62, s * (e2 + .006)); if (s < 0) fl.rotation.y = Math.PI; g.add(fl); }
        var e3 = bodyEdge([-.4, .2, .25, .4], s); // a line of small lettering low on the sidepod
        if (e3) { var tg = new T.Mesh(new T.PlaneGeometry(.78, .065), std({ map: tagTex(L1.tag, 'HYBRID · T-FORD RACING · TURBO OIL'), transparent: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 })); tg.position.set(-.1, .27, s * (e3 + .006)); if (s < 0) tg.rotation.y = Math.PI; g.add(tg); }
        if (fin.top > .7) { var w = new T.Mesh(new T.PlaneGeometry(LV.ws[0] * 1.15, LV.ws[1] * 1.15), wmM); w.position.set(-1.65, fin.top - .14, s * (fin.hw + .005)); w.rotation.z = -.14 * s; if (s < 0) w.rotation.y = Math.PI; g.add(w); }
      });
      var emM = std({ map: LV.emb(), transparent: true, roughness: .5, polygonOffset: true, polygonOffsetFactor: -2 });
      var em = new T.Mesh(new T.PlaneGeometry(LV.es[0], LV.es[1]).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), emM); em.position.set(2.0, bodyEdgeTop([1.95, 2.05], 0.12) + .006, 0); g.add(em);
    }

    car.userData = { body: g, wheels: wheels, steeringWheel: swi, driver: dr, legs: legs, paint: ghost ? [] : [paint], setFlash: function () { }, setBoost: setBoost, vehicle: 'lmp1', eye: model ? [0.2, 0.9, 0] : null, hood: model ? [1.25, bodyEdgeTop([1.15, 1.35], .12) + .14, 0] : [1.2, .85, 0] };
    return car;
  };
})();
