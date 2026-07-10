/* Navigation interne : défilement doux sans modifier l'URL (pas de #ancre). */
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener('click', function (event) {
    var target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', window.location.pathname);
  });
});

/* Actualités corporate finance à Lyon : flux RSS Google Actualités (gratuit, sans clé). */
(function () {
  var list = document.getElementById('news-list');
  if (!list) return;

  var CACHE_KEY = 'lf-news-v1';
  var CACHE_TTL = 60 * 60 * 1000; /* 1 h */
  var MAX_ITEMS = 5;

  function render(items) {
    list.innerHTML = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'news-item';

      var a = document.createElement('a');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.title;

      var meta = document.createElement('span');
      meta.className = 'news-meta';
      meta.textContent = item.source + (item.date ? ' · ' + item.date : '');

      li.appendChild(a);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function showUnavailable() {
    list.innerHTML =
      '<li class="news-placeholder">Actualités momentanément indisponibles.</li>';
  }

  function save(items) {
    render(items);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: items }));
    } catch (e) { /* stockage plein ou bloqué : sans conséquence */ }
  }

  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL && cached.items.length) {
      render(cached.items);
      return;
    }
  } catch (e) { /* cache illisible : on continue */ }

  /* Fonction serverless du site (même domaine, pas de CORS). */
  fetch('/api/news')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data.items || !data.items.length) throw new Error('empty');
      save(data.items.slice(0, MAX_ITEMS));
    })
    .catch(showUnavailable);
})();
