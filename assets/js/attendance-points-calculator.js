/* Mirrors scripts/site_tools/attendance_points.py (calc / result_html) line for line.
   Rules come from the Employee Attendance Point Tracker workbook:
     expires on = EDATE(date, window)            Occurrence Log!G6
     active     = date <= as-of AND expires > as-of   Occurrence Log!H6
     points     = MAX(0, SUM(active) - credit)   Calculations!C6
     step       = highest threshold reached      Calculations!J6
   No date comes from the clock: the as-of date is an input. */
(function () {
  'use strict';
  var S = window.SD;
  var N_ROWS = 8;
  var TYPES = [
    ['tardy', 'Tardy (<15 min)'], ['tardy15', 'Tardy (15+ min)'], ['early', 'Early out'],
    ['absence', 'Absence — called in'], ['ncns', 'Absence — no call no show'],
    ['lwn', 'Left without notice'], ['punch', 'Missed punch'], ['break', 'Late from break']
  ];
  var TYPE_LABEL = {};
  TYPES.forEach(function (t) { TYPE_LABEL[t[0]] = t[1]; });
  var STAGES = ['In good standing', 'Verbal warning', 'Written warning',
                'Final written warning', 'Termination review'];
  var STAGE_KEYS = ['th_verbal', 'th_written', 'th_final', 'th_term'];
  var STAGE_CLASS = ['ok', 'warn', 'warn', 'bad', 'bad'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Dates are plain day numbers (days since 1970-01-01, UTC) so nothing slips across a
     timezone or DST change. Python uses date.toordinal(); only differences and order matter. */
  function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function ymd(n) {
    var dt = new Date(n * 86400000);
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return dayNum(y, mo, d);
  }

  function edate(n, months) {
    var p = ymd(n);
    var t = p[1] - 1 + months;
    var y = p[0] + Math.floor(t / 12), m = t - Math.floor(t / 12) * 12 + 1;
    return dayNum(y, m, Math.min(p[2], daysInMonth(y, m)));
  }

  function fmtDate(n) { var p = ymd(n); return MON[p[1] - 1] + ' ' + p[2] + ', ' + p[0]; }

  function pts(x) { return S.num(x, 2).replace(/\.?0+$/, ''); }

  function f(id, fallback) {
    var v = parseFloat(S.raw(id));
    return isFinite(v) ? v : (fallback === undefined ? 0 : fallback);
  }

  function stageIndex(points, th) {
    for (var i = 4; i > 0; i--) { if (points >= th[i - 1]) return i; }
    return 0;
  }

  function table(headers, rows, tid) {
    var h = '<div class="scroll"><table class="rows" id="' + tid + '"><thead><tr>';
    headers.forEach(function (x) { h += '<th>' + S.esc(x) + '</th>'; });
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

  function sum(list) { return list.reduce(function (a, o) { return a + o.points; }, 0); }

  function calc() {
    var asof = parseDate(S.raw('asof'));
    if (asof === null) return { error: 'Enter an as-of date to count points on.' };
    var win = Math.trunc(f('window', 12));
    if (!(win >= 1 && win <= 120)) return { error: 'Use a rolling window between 1 and 120 months.' };
    var th = STAGE_KEYS.map(function (k) { return f(k); });
    if (!(0 < th[0] && th[0] < th[1] && th[1] < th[2] && th[2] < th[3])) {
      return { error: 'Each warning step needs more points than the one before it ' +
                      '(for example 4, 6, 8 and 10).' };
    }
    var creditOn = S.raw('credit') === 'yes';
    var creditDays = Math.trunc(f('credit_days', 90));

    var occ = [], skipped = 0;
    for (var i = 1; i <= N_ROWS; i++) {
      var dRaw = S.raw('d' + i), d = parseDate(dRaw), t = S.raw('t' + i) || '';
      if (d === null || !TYPE_LABEL.hasOwnProperty(t)) {
        if (String(dRaw || '').trim() || t) skipped++;
        continue;
      }
      var exp = edate(d, win);
      var status = d > asof ? 'Not yet counted' : (exp > asof ? 'Active' : 'Expired');
      occ.push({ row: i, date: d, type: t, points: f('pt_' + t), expires: exp, status: status });
    }
    if (!occ.length) return { error: 'Add at least one occurrence: a date and a type in the same row.' };

    var active = occ.filter(function (o) { return o.status === 'Active'; });
    var last = null;
    occ.forEach(function (o) {
      if (o.status !== 'Not yet counted' && (last === null || o.date > last)) last = o.date;
    });

    function creditAt(t, nActive) {
      return (creditOn && nActive > 0 && last !== null && (t - last) >= creditDays) ? 1 : 0;
    }
    function totalAt(t) {
      var live = active.filter(function (o) { return o.expires > t; });
      return Math.max(0, sum(live) - creditAt(t, live.length));
    }

    var raw = sum(active);
    var credit = creditAt(asof, active.length);
    var points = Math.max(0, raw - credit);
    var idx = stageIndex(points, th);
    var r = { asof: asof, th: th, occ: occ, skipped: skipped, points: points, credit: credit,
              creditOn: creditOn, idx: idx, stage: STAGES[idx],
              toNext: idx < 4 ? th[idx] - points : null,
              nextStage: idx < 4 ? STAGES[idx + 1] : null,
              nextExp: null, nextExpPts: 0, allClear: null, drop: null, dropTo: null };

    if (active.length) {
      r.nextExp = Math.min.apply(null, active.map(function (o) { return o.expires; }));
      r.nextExpPts = sum(active.filter(function (o) { return o.expires === r.nextExp; }));
      r.allClear = Math.max.apply(null, active.map(function (o) { return o.expires; }));
    }
    r.exp30 = sum(active.filter(function (o) { return o.expires <= asof + 30; }));
    r.creditDate = (creditOn && last !== null) ? last + creditDays : null;

    if (idx > 0) {
      var cands = {};
      active.forEach(function (o) { cands[o.expires] = true; });
      if (r.creditDate !== null && r.creditDate > asof) cands[r.creditDate] = true;
      var list = Object.keys(cands).map(Number).sort(function (a, b) { return a - b; });
      for (var j = 0; j < list.length; j++) {
        if (totalAt(list[j]) < th[idx - 1]) { r.drop = list[j]; r.dropTo = totalAt(list[j]); break; }
      }
    }
    return r;
  }

  S.wire(function () {
    var r = calc();
    if (r.error) return '<p class="pill warn" id="r-msg">' + S.esc(r.error) + '</p>';
    var idx = r.idx;
    var head = S.readout(pts(r.points), 'active points as of ' + fmtDate(r.asof),
                         [STAGE_CLASS[idx], r.stage], r.points / r.th[3]);

    var starts = idx === 0 ? '0' : pts(r.th[idx - 1]);
    var rows = [['Current step',
                 '<span id="r-stage">' + S.esc(r.stage) + ' (from ' + starts + ' points)</span>']];
    if (r.toNext !== null) {
      rows.push(['Points to the next step',
                 '<span id="r-next">' + pts(r.toNext) + ' more reaches ' +
                 S.esc(r.nextStage) + '</span>']);
    } else {
      rows.push(['Points to the next step', '<span id="r-next">None: this is the last step</span>']);
    }
    if (r.nextExp !== null) {
      rows.push(['Next points to expire',
                 '<span id="r-exp">' + pts(r.nextExpPts) + ' on ' + fmtDate(r.nextExp) + '</span>']);
    } else {
      rows.push(['Next points to expire', '<span id="r-exp">None active</span>']);
    }
    rows.push(['Points expiring in the next 30 days', '<span id="r-exp30">' + pts(r.exp30) + '</span>']);
    if (idx > 0) {
      var drop = r.drop !== null ? (fmtDate(r.drop) + ' (down to ' + pts(r.dropTo) + ')')
                                 : 'Not within the active entries';
      rows.push(['Drops below this step on', '<span id="r-drop">' + drop + '</span>']);
    }
    if (r.allClear !== null) {
      rows.push(['Every active point gone by', '<span id="r-clear">' + fmtDate(r.allClear) + '</span>']);
    }
    if (r.creditOn) {
      var c;
      if (r.credit) c = '1 point taken off';
      else if (r.points > 0 && r.creditDate !== null) c = 'Not yet: earned ' + fmtDate(r.creditDate) + ' with no new entries';
      else c = 'Nothing to take off';
      rows.push(['Good-attendance credit', '<span id="r-credit">' + c + '</span>']);
    }

    var sorted = r.occ.slice().sort(function (a, b) { return (a.date - b.date) || (a.row - b.row); });
    var occRows = sorted.map(function (o) {
      return [fmtDate(o.date), S.esc(TYPE_LABEL[o.type]), pts(o.points),
              fmtDate(o.expires), o.status];
    });
    var out = head + table(['', 'Value'], rows, 'r-rows') +
              table(['Date', 'Type', 'Points', 'Expires on', 'Status'], occRows, 'r-occ');
    if (r.skipped) {
      var s = r.skipped === 1 ? '1 row was' : (r.skipped + ' rows were');
      out += '<p class="hint" id="r-skip">' + s + ' skipped: each row needs both a date and a type.</p>';
    }
    return out;
  });
})();
