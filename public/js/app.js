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
