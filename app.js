(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const TYPE_LABEL = { image: 'Image', video: 'Video', pdf: 'PDF' };

const state = {
  items: [],
  byPath: new Map(),
  selected: [],      // ordered list of paths
  folder: '',
  type: '',
  q: '',
};

/* ---------- helpers ---------- */
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 2200);
}
const titleOf = it => it.title || it.name.replace(/\.[^.]+$/, '');

/* ---------- load ---------- */
async function load() {
  try {
    const r = await fetch('manifest.json?' + Date.now());
    const data = await r.json();
    state.items = data.items || [];
  } catch (e) {
    state.items = [];
  }
  state.byPath = new Map(state.items.map(i => [i.path, i]));
  buildFolderSelect();
  restoreFromHash();
  render();
}

function buildFolderSelect() {
  const sel = $('#folder');
  const folders = [...new Set(state.items.map(i => i.folder))].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">All folders</option>' +
    folders.map(f => `<option value="${encodeURIComponent(f)}">${f || '(top level)'}</option>`).join('');
  sel.hidden = folders.length <= 1;
}

/* ---------- filtering + grid ---------- */
function shown() {
  const q = state.q.trim().toLowerCase();
  return state.items.filter(i =>
    (state.folder === '' || i.folder === state.folder) &&
    (!state.type || i.type === state.type) &&
    (!q || (titleOf(i) + ' ' + i.name + ' ' + i.folder).toLowerCase().includes(q)));
}

const thumbObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { thumbObserver.unobserve(e.target); e.target._load && e.target._load(); }
      }
    }, { rootMargin: '200px' })
  : null;

function makeThumb(it) {
  const box = document.createElement('div');
  box.className = 'thumb';
  const src = encPath(it.path);
  if (it.type === 'image') {
    const img = new Image();
    img.loading = 'lazy'; img.alt = ''; img.src = src;
    box.appendChild(img);
  } else if (it.type === 'video') {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    v.src = src + '#t=0.5';
    box.appendChild(v);
  } else {
    box.innerHTML = '<span class="ph">PDF</span>';
    const run = async () => {
      if (!window.pdfjsLib) return;
      try {
        const doc = await getPdf(it);
        const page = await doc.getPage(1);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = 400 / vp0.width;
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        box.innerHTML = ''; box.appendChild(c);
      } catch (e) { /* keep placeholder */ }
    };
    box._load = run;
    thumbObserver ? thumbObserver.observe(box) : run();
  }
  return box;
}

function render() {
  const grid = $('#grid');
  grid.innerHTML = '';
  const list = shown();
  $('#empty').hidden = state.items.length > 0;

  let lastFolder = null;
  for (const it of list) {
    if (it.folder !== lastFolder && (state.folder === '' && new Set(state.items.map(i => i.folder)).size > 1)) {
      const h = document.createElement('h3');
      h.className = 'group-title';
      h.textContent = it.folder || 'Top level';
      grid.appendChild(h);
    }
    lastFolder = it.folder;

    const card = document.createElement('div');
    card.className = 'card' + (state.selected.includes(it.path) ? ' sel' : '');
    card.dataset.path = it.path;
    card.appendChild(makeThumb(it));
    card.insertAdjacentHTML('beforeend',
      `<span class="badge">${TYPE_LABEL[it.type]}</span>
       <span class="check">✓</span>
       <button class="play" title="Present this only">▶</button>
       <div class="meta"><div class="t"></div><div class="s">${fmtSize(it.size)}${it.folder ? ' · ' + escapeHtml(it.folder) : ''}</div></div>`);
    $('.t', card).textContent = titleOf(it);
    grid.appendChild(card);
  }
  updateTray();
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

$('#grid').addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  const path = card.dataset.path;
  if (e.target.closest('.play')) { present([path]); return; }
  toggle(path);
  card.classList.toggle('sel', state.selected.includes(path));
  updateTray();
});

function toggle(path) {
  const i = state.selected.indexOf(path);
  i === -1 ? state.selected.push(path) : state.selected.splice(i, 1);
}

/* ---------- filters ---------- */
$('#search').addEventListener('input', e => { state.q = e.target.value; render(); });
$('#folder').addEventListener('change', e => { state.folder = decodeURIComponent(e.target.value); render(); });
$('#types').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.type = b.dataset.type;
  document.querySelectorAll('#types button').forEach(x => x.classList.toggle('on', x === b));
  render();
});

/* ---------- tray / ordering ---------- */
function updateTray() {
  const n = state.selected.length;
  $('#tray').hidden = n === 0;
  $('#count').textContent = n + ' selected';
  if (n === 0) $('#orderList').hidden = true;
  if (!$('#orderList').hidden) renderOrder();
}

function renderOrder() {
  const ol = $('#orderList');
  ol.innerHTML = '';
  state.selected.forEach((p, idx) => {
    const it = state.byPath.get(p);
    if (!it) return;
    const li = document.createElement('li');
    li.draggable = true; li.dataset.idx = idx;
    li.innerHTML = `<span class="n">${idx + 1}</span><span class="nm"></span>
      <button data-a="up" title="Move up">↑</button>
      <button data-a="down" title="Move down">↓</button>
      <button data-a="rm" title="Remove">✕</button>`;
    $('.nm', li).textContent = titleOf(it) + '  (' + TYPE_LABEL[it.type] + ')';
    ol.appendChild(li);
  });
}

$('#order').addEventListener('click', () => {
  const ol = $('#orderList');
  ol.hidden = !ol.hidden;
  $('#order').textContent = ol.hidden ? 'Order ▴' : 'Order ▾';
  if (!ol.hidden) renderOrder();
});

$('#orderList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const idx = +b.closest('li').dataset.idx;
  const s = state.selected;
  if (b.dataset.a === 'up' && idx > 0) [s[idx - 1], s[idx]] = [s[idx], s[idx - 1]];
  if (b.dataset.a === 'down' && idx < s.length - 1) [s[idx + 1], s[idx]] = [s[idx], s[idx + 1]];
  if (b.dataset.a === 'rm') s.splice(idx, 1);
  render();
});

let dragIdx = null;
$('#orderList').addEventListener('dragstart', e => {
  const li = e.target.closest('li'); if (!li) return;
  dragIdx = +li.dataset.idx; li.classList.add('drag');
  e.dataTransfer.effectAllowed = 'move';
});
$('#orderList').addEventListener('dragover', e => e.preventDefault());
$('#orderList').addEventListener('drop', e => {
  e.preventDefault();
  const li = e.target.closest('li');
  if (!li || dragIdx === null) return;
  const to = +li.dataset.idx;
  const [m] = state.selected.splice(dragIdx, 1);
  state.selected.splice(to, 0, m);
  dragIdx = null; render();
});
$('#orderList').addEventListener('dragend', () => { dragIdx = null; renderOrder(); });

$('#selAll').addEventListener('click', () => {
  for (const it of shown()) if (!state.selected.includes(it.path)) state.selected.push(it.path);
  render();
});
$('#clear').addEventListener('click', () => { state.selected = []; render(); });
$('#go').addEventListener('click', () => present(state.selected));

/* ---------- share link ---------- */
function deckLink(autoplay) {
  const base = location.href.split('#')[0];
  return base + '#deck=' + state.selected.map(encodeURIComponent).join(',') + (autoplay ? '&present=1' : '');
}
$('#copyLink').addEventListener('click', async () => {
  const link = deckLink(true);
  try { await navigator.clipboard.writeText(link); toast('Link copied. It opens this selection and starts presenting.'); }
  catch (e) { prompt('Copy this link:', link); }
});
function restoreFromHash() {
  const m = location.hash.match(/deck=([^&]*)/);
  if (!m) return;
  const paths = m[1].split(',').map(decodeURIComponent).filter(p => state.byPath.has(p));
  if (!paths.length) return;
  state.selected = paths;
  if (/present=1/.test(location.hash)) setTimeout(() => present(paths), 50);
}

/* ---------- PDF ---------- */
const pdfCache = new Map();
function getPdf(it) {
  if (!window.pdfjsLib) return Promise.reject(new Error('pdf.js not loaded'));
  if (!pdfCache.has(it.path)) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfCache.set(it.path, pdfjsLib.getDocument(encPath(it.path)).promise);
  }
  return pdfCache.get(it.path);
}

/* ---------- presenter ---------- */
const P = { slides: [], i: 0, timer: null, token: 0, idleTimer: null };
const stage = $('#stage');

async function present(paths) {
  const items = paths.map(p => state.byPath.get(p)).filter(Boolean);
  if (!items.length) return;
  toast('Loading…');
  const slides = [];
  for (const it of items) {
    if (it.type === 'pdf') {
      try {
        const doc = await getPdf(it);
        for (let n = 1; n <= doc.numPages; n++) slides.push({ it, doc, page: n, pages: doc.numPages });
      } catch (e) { slides.push({ it, error: 'Could not open PDF' }); }
    } else slides.push({ it });
  }
  P.slides = slides; P.i = 0;
  $('#present').hidden = false;
  document.body.classList.add('presenting');
  try { await $('#present').requestFullscreen(); } catch (e) { /* ok */ }
  bumpControls();
  show(0);
}

function closePresenter() {
  clearTimeout(P.timer);
  P.token++;
  stage.innerHTML = '';
  $('#present').hidden = true;
  document.body.classList.remove('presenting', 'idle');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function next() {
  if (P.i < P.slides.length - 1) show(P.i + 1);
  else if ($('#ploop').checked) show(0);
}
function prev() {
  if (P.i > 0) show(P.i - 1);
  else if ($('#ploop').checked) show(P.slides.length - 1);
}

async function show(i) {
  clearTimeout(P.timer);
  P.i = i;
  const token = ++P.token;
  const s = P.slides[i];
  stage.innerHTML = '';
  $('#pcount').textContent = (i + 1) + ' / ' + P.slides.length;
  $('#ptitle').textContent = titleOf(s.it) + (s.pages > 1 ? ` — page ${s.page}/${s.pages}` : '');

  const auto = +$('#pauto').value;
  const schedule = () => {
    if (auto > 0 && token === P.token) P.timer = setTimeout(next, auto * 1000);
  };

  if (s.error) {
    stage.innerHTML = '<div class="msg"></div>'; $('.msg', stage).textContent = s.error + ': ' + s.it.name;
    schedule(); return;
  }

  const src = encPath(s.it.path);
  if (s.it.type === 'image') {
    const img = new Image(); img.alt = titleOf(s.it); img.src = src;
    stage.appendChild(img);
    preloadNext();
    schedule();
  } else if (s.it.type === 'video') {
    const v = document.createElement('video');
    v.src = src; v.controls = true; v.autoplay = true; v.playsInline = true;
    v.addEventListener('ended', () => { if (auto > 0 && token === P.token) next(); });
    stage.appendChild(v);
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  } else {
    const canvas = document.createElement('canvas');
    stage.appendChild(canvas);
    try {
      const page = await s.doc.getPage(s.page);
      if (token !== P.token) return;
      const vp0 = page.getViewport({ scale: 1 });
      const fit = Math.min(stage.clientWidth / vp0.width, stage.clientHeight / vp0.height);
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: fit * dpr });
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = vp.width / dpr + 'px';
      canvas.style.height = vp.height / dpr + 'px';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } catch (e) { /* ignore */ }
    schedule();
  }
}

function preloadNext() {
  const n = P.slides[P.i + 1];
  if (n && n.it.type === 'image') { const im = new Image(); im.src = encPath(n.it.path); }
}

$('#pnext').addEventListener('click', e => { e.stopPropagation(); next(); });
$('#pprev').addEventListener('click', e => { e.stopPropagation(); prev(); });
$('#pclose').addEventListener('click', e => { e.stopPropagation(); closePresenter(); });
$('#pfs').addEventListener('click', e => {
  e.stopPropagation();
  if (document.fullscreenElement) document.exitFullscreen(); else $('#present').requestFullscreen().catch(() => {});
});
$('#pauto').addEventListener('change', () => show(P.i));
$('#pbar').addEventListener('click', e => e.stopPropagation());
$('#stage').addEventListener('click', e => {
  if (e.target.tagName === 'VIDEO') return;
  (e.clientX < window.innerWidth / 3) ? prev() : next();
});

document.addEventListener('keydown', e => {
  if ($('#present').hidden) return;
  if (e.target.tagName === 'SELECT') return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); next(); }
  else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); prev(); }
  else if (k === 'Home') show(0);
  else if (k === 'End') show(P.slides.length - 1);
  else if (k === 'Escape') closePresenter();
  else if (k === 'f' || k === 'F') { document.fullscreenElement ? document.exitFullscreen() : $('#present').requestFullscreen().catch(() => {}); }
  bumpControls();
});

function bumpControls() {
  $('#pbar').classList.remove('idle');
  document.body.classList.remove('idle');
  clearTimeout(P.idleTimer);
  P.idleTimer = setTimeout(() => {
    $('#pbar').classList.add('idle');
    document.body.classList.add('idle');
  }, 2500);
}
$('#present').addEventListener('mousemove', bumpControls);

window.addEventListener('resize', () => { if (!$('#present').hidden && P.slides[P.i] && P.slides[P.i].it.type === 'pdf') show(P.i); });

load();
})();
