// All sound is generated live with the Web Audio API. There are no audio files.
(function () {
  var TF = window.TF;

  function Sound() { this.ctx = null; this.muted = false; this.pulses = 2; this.profile = 'tford'; }

  // 'tford': slow four-cylinder putt-putt and the "ahooga" horn. 'gt3': a faster, higher engine note and a plain two-tone horn.
  Sound.prototype.setProfile = function (p) { this.profile = p === 'lmp1' ? 'gt3' : p; this.pulses = p === 'lmp1' ? 4 : p === 'gt3' ? 3 : 2; };

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
    this.osc1.frequency.setTargetAtTime(f, t, 0.06); this.osc2.frequency.setTargetAtTime(f / 2, t, 0.06);
    this.engLP.frequency.setTargetAtTime(220 + o.rpm * 0.35 + o.thr * 260, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.16 + o.thr * 0.16, t, 0.08);
    this.sqGain.gain.setTargetAtTime(Math.min(0.22, o.slide * 0.22), t, 0.05);
    this.sqF.frequency.setTargetAtTime(1500 + o.slide * 400, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.2, o.speed * o.speed / 400 * 0.16), t, 0.2);
    this.scrGain.gain.setTargetAtTime(o.scrape ? Math.min(0.3, 0.08 + o.speed * 0.012) : 0, t, 0.04);
    this.turboGain.gain.setTargetAtTime(o.boost ? 0.05 : 0, t, 0.1); this.turbo.frequency.setTargetAtTime(1100 + o.speed * 12, t, 0.15);
  };

  Sound.prototype.silence = function () {
    if (!this.ctx) return; var t = this.ctx.currentTime;
    [this.engGain, this.sqGain, this.windGain, this.scrGain, this.turboGain].forEach(function (g) { g.gain.setTargetAtTime(0, t, 0.05); });
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
