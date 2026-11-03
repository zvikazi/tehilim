/* Pure helpers: Hebrew numerals, text cleanup for speech, pause length. */
(function (root) {
  'use strict';

  var ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  var TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  var HUND = ['', 'ק', 'ר', 'ש', 'ת'];

  function hebNum(n) {
    var s = '';
    while (n >= 400) { s += 'ת'; n -= 400; }
    if (n >= 100) { s += HUND[Math.floor(n / 100)]; n = n % 100; }
    if (n === 15) return s + 'טו';
    if (n === 16) return s + 'טז';
    return s + TENS[Math.floor(n / 10)] + ONES[n % 10];
  }

  var TETRA = /י[ְ-ׇ]*ה[ְ-ׇ]*ו[ְ-ׇ]*ה[ְ-ׇ]*/g;

  /* Text handed to the speech engine. */
  function speechText(verse, stripNikkud) {
    var t = String(verse);
    t = t.replace(/<[^>]*>/g, '');
    t = t.replace(/[֑-֯]/g, '');
    t = t.replace(TETRA, stripNikkud ? 'אדוני' : 'אֲדֹנָי');
    t = t.replace(/(^|\s)ה['׳](?=\s|$|[,.;:׃])/g, '$1אדוני');
    t = t.replace(/[־׀]/g, ' ').replace(/׃/g, '');
    if (stripNikkud) t = t.replace(/[ְ-ׇֽֿׁׂׅׄ]/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  function countWords(text) {
    var m = String(text).replace(/[־]/g, ' ').match(/[א-ת][^\s]*/g);
    return m ? m.length : 0;
  }

  /* Pause after a verse: grows with the number of words, scaled by a user multiplier. */
  var BASE_SEC = 1.2, PER_WORD_SEC = 0.35, MIN_MS = 500, MAX_MS = 15000;
  function pauseMs(words, mult) {
    if (!(mult > 0)) return 0;
    var ms = (BASE_SEC + words * PER_WORD_SEC) * 1000 * mult;
    return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, ms)));
  }

  root.TehilimCore = { hebNum: hebNum, speechText: speechText, countWords: countWords, pauseMs: pauseMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TehilimCore;
})(typeof window !== 'undefined' ? window : globalThis);
