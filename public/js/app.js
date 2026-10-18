// Mobilné menu (výsuvný drawer).
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var backdrop = document.querySelector('.nav-backdrop');
  var body = document.body;
  if (!toggle) return;

  function open() {
    body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    if (backdrop) backdrop.hidden = false;
  }
  function close() {
    body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (backdrop) backdrop.hidden = true;
  }

  toggle.addEventListener('click', function () {
    if (body.classList.contains('nav-open')) close();
    else open();
  });
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  // po kliknutí na položku menu drawer zavri
  document.querySelectorAll('.sidebar .nav-item').forEach(function (a) {
    a.addEventListener('click', close);
  });
})();

// Profilové menu v hornej lište (Nastavenia, Zmena hesla, Odhlásiť).
(function () {
  var profile = document.getElementById('profile');
  if (!profile) return;
  var btn = profile.querySelector('.profile-btn');
  var menu = profile.querySelector('.profile-menu');
  function open() { profile.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); if (menu) menu.hidden = false; }
  function close() { profile.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); if (menu) menu.hidden = true; }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (profile.classList.contains('open')) close(); else open();
  });
  document.addEventListener('click', function (e) { if (!profile.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();

// Rozbaľovacie skupiny v ľavom menu (klik na nadpis skupiny). Stav sa pamätá.
(function () {
  var KEY = 'tbau_nav_open';
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  document.querySelectorAll('.sidebar .nav-grp[data-grp]').forEach(function (grp) {
    var label = grp.getAttribute('data-grp');
    if (stored && Object.prototype.hasOwnProperty.call(stored, label)) {
      grp.classList.toggle('open', !!stored[label]);
    }
    var btn = grp.querySelector('.nav-group');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isOpen = grp.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      try {
        var s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
        s[label] = isOpen;
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch (e) {}
    });
  });
  // skupinu s aktívnou položkou nechaj vždy otvorenú (aby bolo vidno, kde som)
  document.querySelectorAll('.sidebar .nav-grp').forEach(function (grp) {
    if (grp.querySelector('.nav-item.active')) {
      grp.classList.add('open');
      var b = grp.querySelector('.nav-group');
      if (b) b.setAttribute('aria-expanded', 'true');
    }
  });
})();

// Pole "Druh robotníka" sa zobrazí len pri pozícii Robotník.
(function () {
  document.querySelectorAll('select[data-position]').forEach(function (sel) {
    function sync() {
      var form = sel.closest('form');
      if (!form) return;
      var tf = form.querySelector('[data-trade]');
      if (tf) tf.hidden = sel.value !== 'robotnik';
    }
    sel.addEventListener('change', sync);
    sync();
  });
})();
