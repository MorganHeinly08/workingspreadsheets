/* Mirrors scripts/site_tools/overtime.py (calc_overtime / result_html) line for line.
   The math is the Timesheet & Overtime workbook's (SD-TOT-001): Time Entries L/M/N/O/P per
   day, then Regular = sum(L) - sum(P), Overtime = sum(M) + sum(P), Double time = sum(N),
   Gross = Reg*rate + OT*rate*OTmult + DT*rate*DTmult. See overtime.FORMULA.md. */
(function () {
  'use strict';
  var S = window.SD;

  var DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
              ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

  /* Blank -> null; otherwise a finite number (null if unparseable). Mirrors _val(). */
  function val(id) {
    var s = String(S.raw(id) || '').trim();
    if (!s) return null;
    var f = Number(s);
    return isFinite(f) ? f : null;
  }
  function or(id, fallback) { var f = val(id); return f === null ? fallback : f; }

  /* Round half away from zero to cents, then format: identical to Python r2(). */
  function r2(x) {
    var s = x < 0 ? -1 : 1;
    var r = s * Math.floor(Math.abs(x) * 100 + 0.5) / 100;
    return r === 0 ? 0 : r;
  }
  function h2(x) { return S.num(r2(x), 2); }
  function money(x) { return '$' + h2(x); }
  function trim(x) {
    var s = S.num(r2(x), 2);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function err(msg) { return '<p class="pill bad">' + S.esc(msg) + '</p>'; }

  /* site_lib.rows_table with a custom id (common.js's rowsTable is fixed to r-rows). */
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

  S.wire(function () {
    var rate = val('rate');
    var rule = S.raw('rule');
    if (rule !== 'weekly' && rule !== 'daily' && rule !== 'none') rule = 'weekly';
    var weekly = or('weekly', 40), daily = or('daily', 8), dtt = or('dt', 12);
    var otm = or('ot_mult', 1.5), dtm = or('dt_mult', 2);
    var total = val('total');
    var days = DAYS.map(function (d) { return or(d[0], 0); });

    if (rate !== null && rate < 0) return err("The hourly rate can't be negative.");
    if (Math.min.apply(null, days) < 0 || (total !== null && total < 0)) {
      return err("Hours can't be negative.");
    }
    if (Math.max.apply(null, days) > 24) {
      return err("One day can't hold more than 24 hours. Check the daily boxes.");
    }
    if (weekly < 0 || daily < 0 || dtt < 0) return err("Thresholds can't be negative.");
    if (otm < 0 || dtm < 0) return err("Multipliers can't be negative.");
    if (rule === 'daily' && dtt < daily) {
      return err('The double-time threshold has to be at least the daily ' +
                 'overtime threshold (for example 12 and 8).');
    }
    if (rule === 'daily' && total !== null) {
      return err('Daily overtime needs the hours for each day. Clear the weekly ' +
                 'total, or switch the rule to Weekly.');
    }

    var entries = total !== null ? [['Week', total]]
                : DAYS.map(function (d, i) { return [d[1], days[i]]; });

    var rows = [];
    var cum = 0, sL = 0, sM = 0, sN = 0, sP = 0;
    entries.forEach(function (en) {
      var h = en[1], l, m, n;
      if (rule === 'daily') {
        l = Math.min(h, daily);                          // Time Entries L
        m = Math.min(Math.max(h - daily, 0), dtt - daily);  // Time Entries M
        n = Math.max(h - dtt, 0);                        // Time Entries N
      } else { l = h; m = 0; n = 0; }
      cum += l;                                          // Time Entries O
      var p = rule === 'none' ? 0 : Math.max(0, Math.min(l, cum - weekly));  // Time Entries P
      sL += l; sM += m; sN += n; sP += p;
      rows.push({ day: en[0], h: h, reg: l - p, ot: m + p, dt: n });
    });

    var reg = sL - sP, ot = sM + sP, dt = sN;
    var hours = reg + ot + dt;
    if (hours <= 0) return err('Enter hours for at least one day, or a weekly total.');

    var paid = !!rate;
    var regPay, otPay, dtPay, gross;
    if (paid) {
      regPay = reg * rate;
      otPay = ot * rate * otm;
      dtPay = dt * rate * dtm;
      gross = reg * rate + ot * rate * otm + dt * rate * dtm;
    }
    var isDaily = rule === 'daily';

    var pill;
    if (rule === 'none') {
      pill = ['ok', 'Rule set to None: every hour is paid at the regular rate'];
    } else if (ot + dt > 0) {
      var txt = h2(ot) + ' overtime hours';
      if (isDaily) txt += ' · ' + h2(dt) + ' double-time';
      pill = ['warn', txt];
    } else {
      pill = ['ok', 'No overtime this week'];
    }

    var head = paid
      ? S.readout(money(gross), 'gross pay for the week, before taxes and deductions', pill, null)
      : S.readout('—', 'gross pay: enter an hourly rate to see it', pill, null);

    var dash = '—';
    var sum = [
      ['Regular', '<span id="r-reg">' + h2(reg) + '</span>',
       paid ? money(rate) : dash,
       '<span id="r-regpay">' + (paid ? money(regPay) : dash) + '</span>'],
      ['Overtime (' + trim(otm) + '×)', '<span id="r-ot">' + h2(ot) + '</span>',
       paid ? money(rate * otm) : dash,
       '<span id="r-otpay">' + (paid ? money(otPay) : dash) + '</span>']
    ];
    if (isDaily) {
      sum.push(['Double time (' + trim(dtm) + '×)', '<span id="r-dt">' + h2(dt) + '</span>',
                paid ? money(rate * dtm) : dash,
                '<span id="r-dtpay">' + (paid ? money(dtPay) : dash) + '</span>']);
    }
    sum.push(['Total', '<span id="r-hours">' + h2(hours) + '</span>', '',
              '<span id="r-gross">' + (paid ? money(gross) : dash) + '</span>']);
    var html = head + S.rowsTable(['', 'Hours', 'Rate', 'Pay'], sum);

    if (total === null) {
      var heads = ['Day', 'Hours', 'Regular', 'Overtime'].concat(isDaily ? ['Double time'] : []);
      var drows = [];
      rows.forEach(function (d) {
        if (d.h <= 0) return;
        var row = [d.day, h2(d.h), h2(d.reg), h2(d.ot)];
        if (isDaily) row.push(h2(d.dt));
        drows.push(row);
      });
      html += table(heads, drows, 'r-days');
    }

    var note;
    if (rule === 'weekly') {
      note = 'Weekly rule: hours over ' + trim(weekly) + ' in the work week are overtime ' +
             'at ' + trim(otm) + '× the hourly rate.';
    } else if (isDaily) {
      note = 'Daily + weekly rule: hours over ' + trim(daily) + ' in a day are overtime, ' +
             'hours over ' + trim(dtt) + ' in a day are double time at ' + trim(dtm) + '×, ' +
             'then regular hours over ' + trim(weekly) + ' in the week are overtime too.';
    } else {
      note = 'No overtime rule: every hour is paid at the regular rate.';
    }
    return html + '<p class="hint" id="r-rule">' + S.esc(note) + '</p>';
  });
})();
