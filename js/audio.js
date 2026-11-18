// All sound is generated live with the Web Audio API. There are no audio files.
(function () {
  var TF = window.TF;

  function Sound() { this.ctx = null; this.muted = false; this.pulses = 2; this.profile = 'tford'; }

  // 'tford': slow four-cylinder putt-putt and the "ahooga" horn. 'gt3': a faster, higher engine note and a plain two-tone horn.
  Sound.prototype.setProfile = function (p) { this.kind = p; this.profile = p === 'lmp1' ? 'gt3' : p; this.pulses = p === 'lmp1' ? 4 : p === 'gt3' ? 3 : 2; };

  // Browsers only allow sound after a key press or click, so this is called from the first input.
  Sound.prototype.start = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    var c = this.ctx = new AC();
    var master = this.master = c.createGain(); master.gain.value = this.muted ? 0 : 0.8; master.connect(c.destination);

    var len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    function noise() { var n = c.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; }
    function gain(v, to) { var g = c.createGain(); g.gain.value = v; g.connect(to); return g; }
    function filter(type, f, q, to) { var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(to); return b; }

    // engine: slow sawtooth pulses give the "putt-putt"; a noise layer pulsed at the same rate adds exhaust chuff
    this.engGain = gain(0, master);
    this.engLP = filter('lowpass', 300, 1, this.engGain);
    this.osc1 = c.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 15;
    this.osc2 = c.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 7.5;
    this.osc1.connect(gain(0.5, this.engLP)); this.osc2.connect(gain(0.18, this.engLP));
    var chuff = gain(0.0, gain(0.5, this.engGain));
    noise().connect(filter('bandpass', 220, 0.8, chuff));
    this.osc1.connect(gain(0.6, chuff.gain));
    this.osc1.start(); this.osc2.start();

    // race-car engine (GT3 and prototype), built like a real one: every cylinder firing is a pressure pulse (a sharp push, a pull-back
    // and a puff of noise), with small random differences from firing to firing. The pulses for a few dozen engine turns are worked
    // out once into a loop, which plays faster or slower with the revs. After that come the parts that do NOT change with the revs, as
    // in a real exhaust: pipe resonances, a soft clipper for the rasp and a low-pass that opens with the throttle.
    // GT3: flat-six, 3 even firings per turn with a slight left/right bank difference. LMP1: V8, 4 firings per turn with the uneven
    // per-bank pulses that give a V8 its burble.
    this.nbuf = buf;
    var gt = this.gtGain = gain(0, master), shaper = c.createWaveShaper(), cv = new Float32Array(1024);
    for (var ci = 0; ci < 1024; ci++) cv[ci] = Math.tanh((ci / 512 - 1) * 2.2);
    shaper.curve = cv; shaper.oversample = '4x';
    this.gtLP = filter('lowpass', 1500, 0.9, gt);
    var r3 = filter('peaking', 2300, 2.5, this.gtLP); r3.gain.value = 3;
    var r2 = filter('peaking', 520, 1.6, r3); r2.gain.value = 5;
    var r1 = filter('peaking', 135, 1.1, r2); r1.gain.value = 6;
    shaper.connect(r1);
    this.gtPre = gain(0.9, shaper);
    var hp = filter('highpass', 35, 0.7, this.gtPre);
    var self = this;
    function engineLoop(kind) {
      var R0 = 3000, cyc = 120 / R0, nC = 30, sr = c.sampleRate, n = Math.floor(cyc * nC * sr), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      var cyl = kind === 'lmp1' ? 8 : 6, amp = kind === 'lmp1' ? [1, .78, .93, .7, .97, .82, .9, .74] : [1, .9, 1, .9, 1, .9];
      var seed = kind === 'lmp1' ? 99 : 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      var L = Math.floor(.014 * sr);
      for (var q = 0; q < nC; q++) {
        var ca = 1 + (rnd() - .5) * .14;
        for (var k = 0; k < cyl; k++) {
          var t0 = (q + k / cyl + (rnd() - .5) * .006) * cyc, a = ca * amp[k] * (1 + (rnd() - .5) * .2), i0 = Math.floor(t0 * sr);
          var tk1 = .0009 + rnd() * .0003, tk2 = .0032 + rnd() * .0008;
          for (var i = 0; i < L; i++) {
            var tt = i / sr, nz = Math.random() * 2 - 1;
            d[(i0 + i) % n] += a * (Math.exp(-tt / tk1) - .55 * Math.exp(-tt / tk2) + .35 * nz * Math.exp(-tt / .0011));
          }
        }
      }
      var pk = 0; for (var j = 0; j < n; j++) pk = Math.max(pk, Math.abs(d[j]));
      for (j = 0; j < n; j++) d[j] /= pk;
      var src = c.createBufferSource(); src.buffer = b; src.loop = true; src.start();
      var g2 = gain(0, hp); src.connect(g2);
      return { src: src, g: g2 };
    }
    this.eng = { gt3: engineLoop('gt3'), lmp1: engineLoop('lmp1') };
    this.gtNoiseG = gain(0, gt); this.gtBP = filter('bandpass', 1200, 0.9, this.gtNoiseG); noise().connect(this.gtBP);
    this.whineG = gain(0, master); this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whine.connect(this.whineG); this.whine.start();
    this.lastThr = 0;

    // tyres, wind, wall scrape
    this.sqGain = gain(0, master); noise().connect(filter('bandpass', 1150, 14, this.sqGain));
    this.sqF = filter('bandpass', 1650, 18, gain(0.6, this.sqGain)); noise().connect(this.sqF);
    this.windGain = gain(0, master); noise().connect(filter('lowpass', 500, 0.5, this.windGain));
    this.scrGain = gain(0, master); noise().connect(filter('bandpass', 2400, 1.2, this.scrGain));
    // boost: a rising turbo whine
    this.turboGain = gain(0, master); this.turbo = c.createOscillator(); this.turbo.type = 'sine'; this.turbo.frequency.value = 1200; this.turbo.connect(this.turboGain); this.turbo.start();
  };

  // o: { rpm, thr (0..1), slide (0..1), speed (m/s), scrape (bool) }
  Sound.prototype.update = function (o) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime, f = o.rpm / 60 * this.pulses;
    if (this.profile !== 'tford') {
      var thr = o.thr, cup = this.kind === 'gt3'; // the GT3 is a Porsche 992 GT3 Cup style flat-six: free-revving, screaming to about 8,500 rpm
      var rr = cup ? o.rpm * 0.95 : o.rpm;
      this.engGain.gain.setTargetAtTime(0, t, 0.05);
      var on = this.eng[cup ? 'gt3' : 'lmp1'], off = this.eng[cup ? 'lmp1' : 'gt3'];
      on.src.playbackRate.setTargetAtTime(Math.max(.2, rr / 3000), t, 0.03); on.g.gain.setTargetAtTime(1, t, 0.05); off.g.gain.setTargetAtTime(0, t, 0.05);
      this.gtPre.gain.setTargetAtTime(0.55 + thr * 0.75, t, 0.05); // on the throttle the pulses are harder: more rasp from the clipper
      this.gtLP.frequency.setTargetAtTime(700 + rr * (cup ? 0.55 : 0.45) + thr * 1600, t, 0.06);
      this.gtGain.gain.setTargetAtTime(0.16 + thr * 0.14, t, 0.05);
      this.gtNoiseG.gain.setTargetAtTime(cup ? 0.03 + thr * 0.1 : 0.02 + thr * 0.06, t, 0.05); this.gtBP.frequency.setTargetAtTime(700 + rr * 0.3, t, 0.08);
      this.whine.frequency.setTargetAtTime(250 + o.speed * 20, t, 0.1); this.whineG.gain.setTargetAtTime(Math.min(0.03, o.speed * 0.0004) * (thr ? 0.6 : 1), t, 0.1);
      if (this.lastThr > 0.5 && thr < 0.5 && o.rpm > 4000 && Math.random() < (cup ? 0.3 : 0.85)) this.pops(cup ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3));
      this.lastThr = thr;
    } else {
      this.gtGain.gain.setTargetAtTime(0, t, 0.05); this.whineG.gain.setTargetAtTime(0, t, 0.05); this.lastThr = 0;
    this.osc1.frequency.setTargetAtTime(f, t, 0.06); this.osc2.frequency.setTargetAtTime(f / 2, t, 0.06);
    this.engLP.frequency.setTargetAtTime(220 + o.rpm * 0.35 + o.thr * 260, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.16 + o.thr * 0.16, t, 0.08);
    }
    this.sqGain.gain.setTargetAtTime(Math.min(0.22, o.slide * 0.22), t, 0.05);
    this.sqF.frequency.setTargetAtTime(1500 + o.slide * 400, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.2, o.speed * o.speed / 400 * 0.16), t, 0.2);
    this.scrGain.gain.setTargetAtTime(o.scrape ? Math.min(0.3, 0.08 + o.speed * 0.012) : 0, t, 0.04);
    this.turboGain.gain.setTargetAtTime(o.boost ? 0.05 : this.kind === 'lmp1' ? 0.008 * o.thr * Math.min(1, o.rpm / 6000) : 0, t, 0.1); // the prototype's turbos whistle softly under load this.turbo.frequency.setTargetAtTime(1100 + o.speed * 12, t, 0.15);
  };

  Sound.prototype.silence = function () {
    if (!this.ctx) return; var t = this.ctx.currentTime;
    [this.engGain, this.gtGain, this.whineG, this.sqGain, this.windGain, this.scrGain, this.turboGain].forEach(function (g) { g.gain.setTargetAtTime(0, t, 0.05); });
  };

  // the crackle from the exhaust when the driver lifts off at high revs: a few short bangs
  Sound.prototype.pops = function (n) {
    if (!this.ctx) return; var c = this.ctx, t0 = c.currentTime;
    for (var k = 0; k < n; k++) {
      var t = t0 + 0.03 + k * (0.05 + Math.random() * 0.09);
      var src = c.createBufferSource(); src.buffer = this.nbuf; var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 350 + Math.random() * 900; bp.Q.value = 1.1;
      var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.09);
      var o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.06);
      og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.1);
    }
  };
  Sound.prototype.thump = function (v) {
    if (!this.ctx) return; var c = this.ctx, t = c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(Math.min(0.7, 0.15 + v * 0.08), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
  };

  // "ah-OO-gah"
  // a short clean beep (the start lights)
  Sound.prototype.beep = function (freq, len) {
    if (!this.ctx) return; var c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + len + 0.05);
  };
  Sound.prototype.horn = function () {
    if (!this.ctx) return; var c = this.ctx, t = c.currentTime;
    if (this.hornUntil && t < this.hornUntil) return; this.hornUntil = t + 1.0;
    if (this.profile === 'gt3') { // a short two-tone beep
      var h1 = c.createOscillator(), h2 = c.createOscillator(), hg = c.createGain();
      h1.type = 'square'; h2.type = 'square'; h1.frequency.value = 415; h2.frequency.value = 523;
      hg.gain.setValueAtTime(0.0001, t); hg.gain.linearRampToValueAtTime(0.14, t + 0.02); hg.gain.setValueAtTime(0.14, t + 0.4); hg.gain.linearRampToValueAtTime(0.0001, t + 0.47);
      h1.connect(hg); h2.connect(hg); hg.connect(this.master); h1.start(t); h2.start(t); h1.stop(t + 0.5); h2.stop(t + 0.5);
      this.hornUntil = t + 0.5; return;
    }
    var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
    [o, o2].forEach(function (x, i) {
      var m = i ? 1.005 : 1;
      x.frequency.setValueAtTime(190 * m, t); x.frequency.linearRampToValueAtTime(430 * m, t + 0.22);
      x.frequency.setValueAtTime(430 * m, t + 0.55); x.frequency.linearRampToValueAtTime(280 * m, t + 0.85);
      x.connect(bp); x.start(t); x.stop(t + 1);
    });
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g.gain.setValueAtTime(0.35, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + 0.95);
    bp.connect(g); g.connect(this.master);
  };

  Sound.prototype.setMuted = function (m) {
    this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  };

  TF.Sound = Sound;
})();
