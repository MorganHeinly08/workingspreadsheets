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

  /* The tool's slug, from /tools/<slug>/. Used for the calc-run analytics event. */
  function slug() {
    var m = /\/tools\/([^\/]+)\//.exec(location.pathname);
    return m ? m[1] : 'unknown';
  }

  /* calc-run/<slug>: once per browser session per tool, the first time a human-driven
     result shows. Counts that a calculator was USED, never what was typed into it. */
  function countRun() {
    var key = 'sd-calc-run-' + slug();
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    try {
      if (w.goatcounter && w.goatcounter.count) {
        w.goatcounter.count({ path: 'calc-run/' + slug(), title: document.title, event: true });
      }
    } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('sd:calc-run')); } catch (e) {}
  }

  /* Shareable results: every named field is mirrored into the URL hash (#rate=0.5&hours=40),
     and a link that carries a hash restores those inputs on load. The hash never reaches a
     server, so a shared result stays as private as the calculator itself. */
  function fields(form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.name && el.type !== 'submit' && el.type !== 'button';
    });
  }

  function writeHash(form) {
    var parts = [];
    fields(form).forEach(function (el) {
      var v = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      parts.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(v));
    });
    try { history.replaceState(null, '', '#' + parts.join('&')); } catch (e) {}
  }

  function readHash(form) {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h || h.indexOf('=') < 0) return false;
    var map = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) map[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    var hit = false;
    fields(form).forEach(function (el) {
      if (!(el.name in map)) return;
      if (el.type === 'checkbox') el.checked = map[el.name] === '1';
      else el.value = map[el.name];
      hit = true;
    });
    return hit;
  }

  /* Attach the renderer to every field, without running it. See note 1 above.
     The one exception: a shared link (#field=value...) restores its inputs and renders,
     because that visitor asked for a specific result, not the worked example. */
  function wire(render) {
    var form = $('calc'), out = $('out');
    if (!form || !out) return;
    var paint = function () {
      try { out.innerHTML = render(); return true; } catch (err) { return false; }
    };
    var run = function () {
      if (paint()) { writeHash(form); countRun(); }
    };
    form.addEventListener('input', run);
    form.addEventListener('change', run);
    form.addEventListener('submit', function (ev) { ev.preventDefault(); run(); });
    w.__render = paint;   // site_check.py calls this to force one render for comparison
    if (readHash(form)) paint();
  }

  w.SD = { $: $, raw: raw, n: n, num: num, pct: pct, hrs: hrs, clamp01: clamp01, esc: esc,
           parseDate: parseDate, today: today, daysBetween: daysBetween, iso: iso,
           readout: readout, rowsTable: rowsTable, wire: wire };
})(window);
