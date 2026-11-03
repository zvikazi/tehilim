(function () {
  'use strict';
  var C = window.TehilimCore;
  var data = window.__PSALMS__;
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'he');

  if (!data || !data.length) {
    $('app').innerHTML = '<p class="notice">נתוני התהילים לא נטענו.</p>';
    return;
  }
  var TOTAL = data.length;

  /* ---------- storage (per device, may be unavailable) ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('tehilim.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('tehilim.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var DEFAULTS = { rate: 0.9, pauseMult: 1, strip: true, scale: 1 };
  var settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  var read = new Set(store.get('read', []));
  var lastCh = Math.min(TOTAL, Math.max(1, store.get('last', 1)));

  /* ---------- state ---------- */
  var ch = lastCh, vi = 0, endCh = ch;
  var playing = false, finished = false, inSpeech = false;
  var runId = 0, timer = null, utter = null, voice = null, wake = null;

  /* ---------- home ---------- */
  function buildGrid() {
    var g = $('grid'); g.textContent = '';
    for (var n = 1; n <= TOTAL; n++) {
      var b = document.createElement('button');
      b.className = 'cell'; b.dataset.n = n; b.type = 'button';
      b.setAttribute('aria-label', 'פרק ' + C.hebNum(n));
      var h = document.createElement('span'); h.className = 'h'; h.textContent = C.hebNum(n);
      var a = document.createElement('span'); a.className = 'n'; a.textContent = n;
      b.appendChild(h); b.appendChild(a);
      g.appendChild(b);
    }
    refreshGrid();
  }
  function refreshGrid() {
    var cells = $('grid').children;
    for (var i = 0; i < cells.length; i++) {
      var n = i + 1;
      cells[i].classList.toggle('read', read.has(n));
      cells[i].classList.toggle('last', n === lastCh);
    }
    $('progress').textContent = 'נקראו ' + read.size + ' מתוך ' + TOTAL;
    $('resumeLabel').textContent = (lastCh === 1 && read.size === 0) ? 'התחל מפרק א' : 'המשך מפרק ' + C.hebNum(lastCh);
    $('resumeGo').textContent = C.hebNum(lastCh);
  }
  $('grid').addEventListener('click', function (e) {
    var b = e.target.closest('.cell'); if (b) openChapter(+b.dataset.n);
  });
  $('resume').addEventListener('click', function () { openChapter(lastCh); });

  /* ---------- reader ---------- */
  function verses() { return data[ch - 1]; }

  function renderVerses() {
    var box = $('verses'); box.textContent = '';
    verses().forEach(function (v, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'verse'; b.dataset.i = i;
      var vn = document.createElement('span'); vn.className = 'vn'; vn.textContent = C.hebNum(i + 1);
      b.appendChild(vn); b.appendChild(document.createTextNode(v));
      box.appendChild(b);
    });
    $('chTitle').textContent = 'תהילים ' + C.hebNum(ch);
    updateMark();
    buildRange();
  }
  $('verses').addEventListener('click', function (e) {
    var b = e.target.closest('.verse'); if (b) jump(+b.dataset.i);
  });

  function buildRange() {
    var s = $('endSel'); s.textContent = '';
    for (var n = ch; n <= TOTAL; n++) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n === ch ? 'פרק זה בלבד' : 'עד פרק ' + C.hebNum(n);
      s.appendChild(o);
    }
    if (endCh < ch) endCh = ch;
    s.value = endCh;
  }
  $('endSel').addEventListener('change', function () { endCh = +this.value; });

  function setCurrent(i, scroll) {
    vi = i;
    var els = $('verses').children;
    for (var k = 0; k < els.length; k++) els[k].classList.toggle('cur', k === i);
    $('where').textContent = 'פסוק ' + (i + 1) + ' מתוך ' + els.length;
    if (scroll !== false && els[i]) els[i].scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }

  function updateMark() {
    var m = $('mark'), on = read.has(ch);
    m.setAttribute('aria-pressed', on ? 'true' : 'false');
    m.textContent = on ? 'נקרא ✓' : 'סמן כנקרא';
  }
  $('mark').addEventListener('click', function () {
    if (read.has(ch)) read.delete(ch); else read.add(ch);
    persistRead(); updateMark();
  });
  function persistRead() { store.set('read', Array.from(read)); refreshGrid(); }
  function markRead(n) { if (!read.has(n)) { read.add(n); persistRead(); } if (n === ch) updateMark(); }

  function showHome() {
    stop(); $('reader').hidden = true; $('home').hidden = false; window.scrollTo(0, 0);
  }
  function openChapter(n) {
    stop();
    ch = n; lastCh = n; store.set('last', n);
    endCh = n; finished = false;
    $('home').hidden = true; $('reader').hidden = false;
    renderVerses(); setCurrent(0, false); window.scrollTo(0, 0);
    setStatus('מוכן'); refreshGrid();
  }
  $('back').addEventListener('click', showHome);

  /* ---------- speech ---------- */
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    var vs = speechSynthesis.getVoices() || [];
    var he = vs.filter(function (v) { return /^he|^iw/i.test(v.lang); });
    voice = he.length ? he[0] : null;
    $('noVoice').hidden = !!voice || !vs.length;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', pickVoice);
  } else {
    $('noSpeech').hidden = false;
  }

  function setStatus(t) { $('status').textContent = t; }
  function resetBar() { var f = $('barFill'); f.style.transition = 'none'; f.style.width = '0'; }
  function runBar(ms) {
    var f = $('barFill'); resetBar(); void f.offsetWidth;
    f.style.transition = 'width ' + ms + 'ms linear'; f.style.width = '100%';
  }
  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

  function speakCurrent() {
    clearTimer(); resetBar();
    var my = ++runId;
    var text = C.speechText(verses()[vi], settings.strip);
    if (!('speechSynthesis' in window)) return;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'he-IL';
    if (voice) u.voice = voice;
    u.rate = settings.rate;
    u.onend = function () { if (my === runId) { inSpeech = false; afterVerse(text); } };
    u.onerror = function (e) {
      if (my !== runId) return;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      inSpeech = false; afterVerse(text);
    };
    utter = u; inSpeech = true;
    setStatus('קורא');
    speechSynthesis.speak(u);
  }

  function afterVerse(text) {
    if (!playing) return;
    var last = vi >= verses().length - 1;
    if (last) markRead(ch);
    var ms = C.pauseMs(C.countWords(text), settings.pauseMult) + (last ? 1500 : 0);
    setStatus(ms ? 'הפסקה' : 'קורא');
    if (ms) runBar(ms);
    var my = runId;
    timer = setTimeout(function () {
      timer = null;
      if (!playing || my !== runId) return;
      if (!last) { setCurrent(vi + 1); speakCurrent(); return; }
      if (ch < endCh) { advanceChapter(); return; }
      playing = false; finished = true; releaseWake(); syncPlay();
      resetBar(); setStatus('הסתיים');
    }, ms);
  }

  function advanceChapter() {
    ch += 1; lastCh = ch; store.set('last', ch);
    renderVerses(); setCurrent(0); refreshGrid();
    speakCurrent();
  }

  function play() {
    if (finished) { finished = false; setCurrent(0); }
    playing = true; syncPlay(); requestWake();
    speakCurrent();
  }
  function pause() {
    playing = false; runId++; clearTimer(); inSpeech = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    resetBar(); syncPlay(); releaseWake(); setStatus('מושהה');
  }
  function stop() {
    playing = false; runId++; clearTimer(); inSpeech = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    resetBar(); syncPlay(); releaseWake();
  }
  function syncPlay() {
    var b = $('play');
    b.textContent = playing ? '❚❚' : '▶';
    b.setAttribute('aria-label', playing ? 'השהה' : 'נגן');
  }
  function jump(i) {
    finished = false; setCurrent(i);
    if (playing) speakCurrent(); else setStatus('מוכן');
  }

  $('play').addEventListener('click', function () { playing ? pause() : play(); });
  $('next').addEventListener('click', function () {
    if (vi < verses().length - 1) jump(vi + 1);
    else if (ch < TOTAL) { var was = playing; if (was) pause(); openChapter(ch + 1); if (was) play(); }
  });
  $('prev').addEventListener('click', function () {
    if (vi > 0) jump(vi - 1);
    else if (ch > 1) { var was = playing; if (was) pause(); openChapter(ch - 1); if (was) play(); }
  });

  /* keep the screen on while reading; recover if the OS interrupted speech */
  function requestWake() {
    try { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }, function () {}); } catch (e) {}
  }
  function releaseWake() { try { if (wake) { wake.release(); wake = null; } } catch (e) {} }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !playing) return;
    requestWake();
    if (inSpeech || !timer) speakCurrent();
  });

  /* ---------- settings ---------- */
  function applySettings() {
    document.documentElement.style.setProperty('--ts', settings.scale);
    $('rate').value = settings.rate; $('rateV').textContent = settings.rate.toFixed(2) + '×';
    $('pm').value = settings.pauseMult;
    $('pmV').textContent = settings.pauseMult > 0 ? settings.pauseMult.toFixed(2) + '×' : 'ללא הפסקה';
    $('strip').checked = settings.strip;
    $('scale').value = settings.scale; $('scaleV').textContent = Math.round(settings.scale * 100) + '%';
    var ex = C.pauseMs(6, settings.pauseMult);
    $('pmHint').textContent = 'לפסוק של 6 מילים: ' + (ex / 1000).toFixed(1) + ' שניות';
  }
  function save() { store.set('settings', settings); applySettings(); }
  $('rate').addEventListener('input', function () { settings.rate = +this.value; save(); });
  $('pm').addEventListener('input', function () { settings.pauseMult = +this.value; save(); });
  $('strip').addEventListener('change', function () { settings.strip = this.checked; save(); });
  $('scale').addEventListener('input', function () { settings.scale = +this.value; save(); });
  $('openSet').addEventListener('click', function () { $('sheet').hidden = false; });
  $('closeSet').addEventListener('click', function () { $('sheet').hidden = true; });
  $('sheet').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });

  var armed = false, armTimer = null;
  $('reset').addEventListener('click', function () {
    var b = this;
    if (!armed) {
      armed = true; b.classList.add('armed'); b.textContent = 'לחץ שוב לאישור';
      armTimer = setTimeout(disarm, 4000); return;
    }
    read.clear(); persistRead(); updateMark(); disarm();
  });
  function disarm() { armed = false; clearTimeout(armTimer); var b = $('reset'); b.classList.remove('armed'); b.textContent = 'אפס את כל הסימונים'; }

  /* ---------- boot ---------- */
  applySettings();
  buildGrid();
  syncPlay();
})();
