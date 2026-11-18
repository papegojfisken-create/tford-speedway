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

    // race-car engine (GT3 and prototype): firing-rate sawtooth + octave + low growl, pushed through a soft clipper for the rasp,
    // with a rising low-pass, intake/exhaust noise, a straight-cut gear whine and pops when the driver lifts at high revs
    this.nbuf = buf;
    var gt = this.gtGain = gain(0, master), shaper = c.createWaveShaper(), cv = new Float32Array(512);
    for (var ci = 0; ci < 512; ci++) cv[ci] = Math.tanh((ci / 256 - 1) * 2.8);
    shaper.curve = cv; shaper.oversample = '2x';
    this.gtLP = filter('lowpass', 1500, 1.4, gt); shaper.connect(this.gtLP);
    var pre = gain(0.5, shaper);
    this.gA = c.createOscillator(); this.gA.type = 'sawtooth'; this.gB = c.createOscillator(); this.gB.type = 'sawtooth'; this.gC = c.createOscillator(); this.gC.type = 'square';
    this.gA.connect(gain(0.55, pre)); this.gB.connect(gain(0.3, pre)); this.gC.connect(this.gCg = gain(0.22, pre));
    this.gA.start(); this.gB.start(); this.gC.start();
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
      var rr = cup ? o.rpm * 0.95 : o.rpm; f = rr / 60 * this.pulses;
      this.engGain.gain.setTargetAtTime(0, t, 0.05);
      this.gA.frequency.setTargetAtTime(f, t, 0.03); this.gB.frequency.setTargetAtTime(f * 2.008, t, 0.03); this.gC.frequency.setTargetAtTime(f / 2, t, 0.03);
      this.gCg.gain.setTargetAtTime(cup ? 0.17 : 0.22, t, 0.1);
      this.gtLP.frequency.setTargetAtTime(900 + rr * (cup ? 0.65 : 0.55) + thr * 1300, t, 0.06);
      this.gtGain.gain.setTargetAtTime(0.2 + thr * 0.2, t, 0.05);
      this.gtNoiseG.gain.setTargetAtTime(cup ? 0.08 + thr * 0.22 : 0.06 + thr * 0.14, t, 0.05); this.gtBP.frequency.setTargetAtTime(700 + rr * 0.3, t, 0.08);
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
    this.turboGain.gain.setTargetAtTime(o.boost ? 0.05 : 0, t, 0.1); this.turbo.frequency.setTargetAtTime(1100 + o.speed * 12, t, 0.15);
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
