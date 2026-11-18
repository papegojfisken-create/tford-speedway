// Loads the 3D library, then the game files in order.
// Looks for a local copy of three.js first (js/lib/three.min.js) so the game can run offline; otherwise uses the CDN.
(function () {
  function load(src, ok, fail) {
    var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail || function () { fatal('Could not load ' + src); };
    document.head.appendChild(s);
  }
  function fatal(msg) { var f = document.getElementById('fatal'); f.textContent = msg; f.hidden = false; }
  window.TF = window.TF || {}; window.TF.fatal = fatal;

  var files = ['js/spadata.js', 'js/track.js', 'js/physics.js', 'js/world.js', 'js/tford.js', 'js/gt3.js', 'js/p963data.js', 'js/p911data.js', 'js/gt3_ferrari.js', 'js/gt3_bmw.js', 'js/gt3_audi.js', 'js/gt3_mclaren.js', 'js/gt3_aston.js', 'js/lmp1.js', 'js/effects.js', 'js/audio.js', 'js/net.js', 'js/account.js', 'js/game.js'];
  function next() { if (files.length) load(files.shift(), next); }

  load('js/lib/three.min.js', next, function () {
    load('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', next, function () {
      fatal('T-Ford Speedway needs the three.js 3D library. Connect to the internet and reload, or put three.min.js (version r128) in the js/lib folder.');
    });
  });
})();
