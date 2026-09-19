/* Mirrors site_content.calc_statement / _stmt_result_html. */
(function () {
  'use strict';
  var S = window.SD;

  var SUBJ = { they: 'they', he: 'he', she: 'she' };
  var POSS = { they: 'their', he: 'his', she: 'her' };

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function build() {
    var base = S.n('baseline'), cur = S.n('current'), tgt = S.n('target');
    var span = tgt - base;
    var progress = span ? S.clamp01((cur - base) / span) : 0;

    var pron = S.raw('pronoun');
    var subj = SUBJ[pron] || 'they';
    var poss = POSS[pron] || 'their';
    var verb = subj === 'they' ? 'have' : 'has';
    var direction = span > 0 ? 'increased' : 'reduced';
    var unit = S.raw('unit');

    var judgment = progress >= 1
      ? 'has met the criterion and needs a stability check across sessions'
      : progress >= 0.6 ? 'is making progress sufficient to meet the goal'
      : progress >= 0.25 ? 'is making progress toward the goal'
      : 'has made limited progress toward the goal';

    var statement =
      cap(S.raw('name')) + ' ' + verb + ' ' + direction + ' from a baseline of ' +
      S.num(base, 0) + unit + ' to ' + S.num(cur, 0) + unit + ' ' + S.raw('condition') +
      ', measured across ' + S.raw('sessions') + ' sessions during ' + S.raw('period') +
      '. This represents ' + S.pct(progress) + ' of the distance from ' + poss +
      ' baseline toward the target of ' + S.num(tgt, 0) + unit +
      '. Based on this data, ' + subj + ' ' + judgment + '.';

    return { progress: progress, statement: statement };
  }

  function copyWire() {
    var btn = S.$('copybtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var el = S.$('r-statement');
      if (!el) return;
      var done = function () {
        var was = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = was; }, 1400);
      };
      /* Clipboard API is unavailable on file:// and on insecure origins; the range
         fallback keeps the button honest there rather than failing silently. */
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(el.textContent).then(done, function () {});
        return;
      }
      var r = document.createRange();
      r.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      try { document.execCommand('copy'); done(); } catch (e) { /* leave selected */ }
    });
  }

  S.wire(function () {
    var r = build();
    var html =
      S.readout(S.pct(r.progress), 'of the way from baseline to target', null, r.progress) +
      '<p style="color:var(--muted);font-size:.9rem;margin-bottom:6px">' +
      'Draft statement — read it, change it, make it yours:</p>' +
      '<div class="answer" style="border-left-color:var(--navy)"><p id="r-statement">' +
      S.esc(r.statement) + '</p></div>' +
      '<p style="font-size:.9rem"><button type="button" class="btn" id="copybtn" ' +
      'style="border:0;cursor:pointer;font:inherit;font-weight:600">Copy statement</button></p>';
    setTimeout(copyWire, 0);   // the button is replaced on every render
    return html;
  });

  copyWire();   // and once for the server-rendered button
})();
