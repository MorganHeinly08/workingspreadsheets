/* Shared helpers for every calculator on the site.
 *
 * Contract with the Python build (scripts/site_content.py):
 *
 *   1. The result block is ALREADY CORRECT when this file loads. It was rendered server-side
 *      for the default inputs, which is what makes the page complete for a crawler that does
 *      not run JavaScript. So wire() deliberately does NOT render on load — it only re-renders
 *      when a human changes a field. Rendering on load would be invisible to a user and would
 *      destroy the only evidence that the two implementations agree.
 *
 *   2. Formatting must match Python's format spec exactly, because scripts/site_check.py
 *      compares the server-rendered text against the post-input DOM text and fails the build
 *      on any difference. num() mirrors f"{x:,.Nf}" and pct() mirrors f"{x*100:.Nf}%".
 */
(function (w) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function raw(id) { var el = $(id); return el ? el.value : ''; }

  function n(id, fallback) {
    var v = parseFloat(raw(id));
    return isFinite(v) ? v : (fallback === undefined ? 0 : fallback);
  }

  function num(x, dp) {
    if (dp === undefined) dp = 1;
    if (!isFinite(x)) x = 0;
    return x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function pct(x, dp) {
    if (dp === undefined) dp = 0;
    if (!isFinite(x)) x = 0;
    return (x * 100).toFixed(dp) + '%';
  }

  function hrs(minutes) { return num(minutes / 60, 1); }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c];
    });
  }

  /* Local midnight, so a date difference never slips a day across a timezone offset. */
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function today() {
    var t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  function iso(dt) {
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  /* Markup builders that mirror site_lib.readout() and site_lib.rows_table(). */
  function readout(value, label, pill, bar) {
    var h = '<div class="readout"><span class="big" id="r-main">' + esc(value) +
            '</span><span class="lab">' + label + '</span>';
    if (pill) h += '<span class="pill ' + pill[0] + '" id="r-pill">' + esc(pill[1]) + '</span>';
    h += '</div>';
    if (bar !== null && bar !== undefined) {
      h += '<div class="bar"><i id="r-bar" style="width:' +
           (clamp01(bar) * 100).toFixed(1) + '%"></i></div>';
    }
    return h;
  }

  function rowsTable(headers, rows) {
    var h = '<div class="scroll"><table class="rows" id="r-rows"><thead><tr>';
    headers.forEach(function (x) { h += '<th>' + esc(x) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>';
      r.forEach(function (c, i) {
        h += i ? '<td class="num">' + c + '</td>' : '<td>' + c + '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  /* Attach the renderer to every field, without running it. See note 1 above. */
  function wire(render) {
    var form = $('calc'), out = $('out');
    if (!form || !out) return;
    var run = function () {
      try { out.innerHTML = render(); } catch (err) { /* leave the server-rendered answer */ }
    };
    form.addEventListener('input', run);
    form.addEventListener('change', run);
    form.addEventListener('submit', function (ev) { ev.preventDefault(); run(); });
    w.__render = run;   // site_check.py calls this to force one render for comparison
  }

  w.SD = { $: $, raw: raw, n: n, num: num, pct: pct, hrs: hrs, clamp01: clamp01, esc: esc,
           parseDate: parseDate, today: today, daysBetween: daysBetween, iso: iso,
           readout: readout, rowsTable: rowsTable, wire: wire };
})(window);
