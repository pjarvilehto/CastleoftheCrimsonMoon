// labs/boot.js — the labs' versioned boot (0.188), the game's own in
// miniature (index.html, 0.082): read build.json uncached, install an
// import map that loads every game module under ?v=<build>, then load the
// lab's script the same way. Without it a browser kept a lab's old script
// and the game's old modules for ~10 minutes after a deploy (0.186: the
// Art Lab came up empty and silent). Also a catch-all: an error while the
// lab loads or runs is written onto the page, never only to the console.
//   <script src="labs/boot.js" data-lab="labs/art/lab.js" data-extra="labs/cards/cardFx.js"></script>
(function () {
  var me = document.currentScript;
  var lab = me.getAttribute('data-lab');
  var extra = (me.getAttribute('data-extra') || '').split(/\s+/).filter(Boolean);
  function say(msg) {
    var p = document.getElementById('lab-error') || document.body.appendChild(document.createElement('p'));
    p.id = 'lab-error';
    p.style.cssText = 'position:fixed;left:16px;top:72px;z-index:99;max-width:70ch;color:#e0a0a0;background:rgba(10,7,5,0.9);border:1px solid #a01818;border-radius:4px;padding:8px 12px;font:15px/1.4 "Alegreya Sans",sans-serif;';
    p.textContent = 'The lab hit an error: ' + msg + ' — reload (Shift + reload gets the newest files), or open the console.';
  }
  addEventListener('error', function (e) { say(e.message || String(e.error || e)); });
  addEventListener('unhandledrejection', function (e) { say((e.reason && e.reason.message) || String(e.reason)); });
  function boot(version, modules) {
    var q = version ? '?v=' + encodeURIComponent(version) : '';
    if (q) {
      var map = { imports: {} };
      (modules || []).concat([lab], extra).forEach(function (m) {
        map.imports[new URL(m, document.baseURI).href] = new URL(m + q, document.baseURI).href;
      });
      var im = document.createElement('script');
      im.type = 'importmap';
      im.textContent = JSON.stringify(map);
      document.head.appendChild(im);
    }
    var s = document.createElement('script');
    s.type = 'module';
    s.src = new URL(lab + q, document.baseURI).href;
    document.body.appendChild(s);
  }
  fetch(new URL('assets/data/build.json?t=' + Date.now(), document.baseURI).href, { cache: 'no-store' }) // (0.00197: past the CDN's copy too)
    .then(function (r) { return r.json(); })
    .then(function (b) { window.__castleBuild = b; boot(b.version, b.modules); }) // (the game's data loader takes this copy, 0.00197)
    .catch(function () { boot('', null); });
})();
