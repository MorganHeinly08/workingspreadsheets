/* Mirrors scripts/site_tools/pto_accrual.py: calc() and result_html().
   The accrual and cap rule are the paid workbook's (PTO_Accrual_Tracker_Hourly.xlsx):
     Calculations!C822  raw accrual = hours worked x rate
     Calculations!C1026 ROUND(raw/step,0)*step
     Balances!D6        MAX(prev, MIN(prev + accrual, CapHours)) - used
     Balances!D414      ROUND(accrual - applied, 6)
     Employees!U6       IF(CarryoverCap="", T, MIN(T, CarryoverCap))
   Mapping and differences: scripts/site_tools/pto_accrual.FORMULA.md.
   Every number is rounded half-away-from-zero (roundDp) BEFORE it is formatted, exactly as
   the Python does, so a tie like 0.125 can never format differently in the two languages.
   No date comes from the clock; the pay-period end is a form input. */
(function () {
  'use strict';
  var S = window.SD;

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PERIODS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

  function roundDp(x, dp) {
    var p = Math.pow(10, dp);
    var k = Math.floor(Math.abs(x) * p + 0.5 + 1e-9);
    if (k === 0) return 0;
    return (x > 0 ? k : -k) / p;
  }

  function fmt(x, dp) {
    if (dp === undefined) dp = 2;
    return S.num(roundDp(x, dp), dp);
  }

  function trim(x) {
    var s = fmt(x, 2);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function xround(x, step) {
    if (step === null) return x;
    var q = x / step;
    var k = Math.floor(Math.abs(q) + 0.5 + 1e-9);
    if (q < 0) k = -k;
    return k * step;
  }

  function fmtDate(d) {
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getDate() === +m[3] && d.getMonth() === +m[2] - 1 ? d : null;
  }

  function f(id) {
    var s = String(S.raw(id)).trim();
    if (s === '') return null;
    var x = Number(s);
    return isFinite(x) ? x : null;
  }

  /* Calculations!D2: the next pay-period end. */
  function nextPeriodEnd(d, freq) {
    var y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    if (freq === 'weekly') return new Date(y, m, day + 7);
    if (freq === 'biweekly') return new Date(y, m, day + 14);
    if (freq === 'semimonthly') {
      if (day === 15) return new Date(y, m + 1, 0);
      return new Date(y, m + 1, 15);
    }
    return new Date(y, m + 2, 0);
  }

  function remainingPeriods(d, freq) {
    var out = [], cur = d;
    while (out.length < 60) {
      var nxt = nextPeriodEnd(cur, freq);
      if (nxt.getFullYear() > d.getFullYear()) break;
      out.push(nxt);
      cur = nxt;
    }
    return out;
  }

  function err(msg) {
    return '<p class="pill bad" id="r-msg">' + S.esc(msg) + '</p>';
  }

  S.wire(function () {
    var mode = S.raw('mode');
    var freq = S.raw('freq');
    if (!(freq in PERIODS)) freq = 'biweekly';
    var periods = PERIODS[freq];
    var rounding = S.raw('rounding');
    var step = rounding === 'None' ? null : (rounding === '0.25' ? 0.25 : 0.01);

    var figure = f('figure'), weekly = f('weekly'), perDay = f('per_day'), hours = f('hours');
    var ot = f('ot'); if (ot === null) ot = 0;
    var balance = f('balance'); if (balance === null) balance = 0;
    var cap = f('cap'), carry = f('carry');
    var planned = f('planned'); if (planned === null) planned = 0;
    var pend = parseDate(S.raw('period_end'));

    if (figure === null || figure <= 0) {
      return err('Enter your accrual figure: hours of PTO a year, the X in ' +
                 '“1 hour for every X worked”, or a rate per hour worked.');
    }
    if (weekly === null || weekly <= 0) {
      return err('Enter the standard hours in a work week (40 for full time).');
    }
    if (hours === null || hours < 0) {
      return err('Enter the hours this employee worked in the pay period.');
    }
    if (ot < 0 || ot > hours) {
      return err('Overtime hours must be between 0 and the total hours worked.');
    }
    if (perDay === null || perDay <= 0) {
      return err('Enter the hours in one workday (8 is typical) to see days.');
    }
    if (pend === null) return err('Enter the date this pay period ends.');
    if ((cap !== null && cap < 0) || (carry !== null && carry < 0) || planned < 0) {
      return err('The cap, carryover limit and planned PTO can’t be negative.');
    }

    var rate;
    if (mode === 'per_x') rate = 1 / figure;
    else if (mode === 'rate') rate = figure;
    else { mode = 'annual'; rate = figure / (weekly * 52); }
    var annual = mode === 'annual' ? figure : rate * weekly * 52;
    var perPeriodEquiv = xround(annual / periods, step);

    var earnsOt = S.raw('ot_earns') === 'yes';
    var counted = earnsOt ? hours : hours - ot;

    var a = xround(counted * rate, step);
    var capv = cap !== null ? cap : 9000000000.0;

    var rest = remainingPeriods(pend, freq);
    var use = planned / (rest.length + 1);

    function stepPeriod(start) {
      var afterCap = Math.max(start, Math.min(start + a, capv));
      var applied = afterCap - start;
      var lost = roundDp(a - applied, 6);
      var hits = cap !== null && start + a >= capv;
      return [afterCap - use, applied, lost, hits];
    }

    var now = stepPeriod(balance);
    var balAfter = now[0], appliedNow = now[1], lostNow = now[2];
    var capDate = now[3] ? pend : null;
    var lostTotal = lostNow;
    var bal = balAfter;
    for (var i = 0; i < rest.length; i++) {
      var s = stepPeriod(bal);
      bal = s[0];
      lostTotal += s[2];
      if (s[3] && capDate === null) capDate = rest[i];
    }
    var yearEnd = bal;
    var carried = carry === null ? yearEnd : Math.min(yearEnd, carry);
    var forfeited = Math.max(0, yearEnd - carried);
    var lastEnd = rest.length ? rest[rest.length - 1] : pend;

    function days(x) { return fmt(x / perDay, 2); }

    var pill;
    if (cap === null) {
      pill = ['ok', 'No balance cap set, so accrual never pauses'];
    } else if (balance >= cap) {
      pill = ['bad', 'Already at the ' + trim(cap) + '-hour cap, so accrual is paused ' +
                     'this period'];
    } else if (lostNow > 0) {
      pill = ['bad', 'Hits the ' + trim(cap) + '-hour cap this period: ' + fmt(lostNow) +
                     ' h is not earned'];
    } else if (capDate !== null) {
      pill = ['warn', 'Reaches the ' + trim(cap) + '-hour cap on ' + fmtDate(capDate) +
                      ' at this pace'];
    } else {
      pill = ['ok', 'Stays under the ' + trim(cap) + '-hour cap through year end'];
    }

    var countedTxt = (earnsOt || ot === 0)
      ? 'all ' + fmt(hours) + ' hours worked earn PTO'
      : fmt(counted) + ' of the ' + fmt(hours) + ' hours worked earn PTO (overtime excluded)';
    var perX = 'about 1 hour for every ' + fmt(1 / rate, 1) + ' worked';
    var rateP = '<p id="r-rate">Accrual rate: <strong>' + fmt(rate, 5) + '</strong> hours of ' +
                'PTO per hour worked, ' + perX + '. This period ' + countedTxt + '.</p>';

    var carryLab = carry === null ? 'Carries into next year (no carryover limit)'
                 : 'Carries into next year (limit ' + trim(carry) + ' h)';
    var yeLab = 'Projected balance after the last payday of ' + pend.getFullYear() +
                ' (' + fmtDate(lastEnd) + ')';
    var span = function (id, x) { return '<span id="' + id + '">' + fmt(x) + '</span>'; };
    var rows = [
      ['Accrued this pay period, after the cap', span('r-accrued', appliedNow), days(appliedNow)],
      ['Not earned this period because of the cap', span('r-lostnow', lostNow), days(lostNow)],
      ['Same policy as a fixed amount per paycheck (annual ÷ ' + periods + ')',
       span('r-equiv', perPeriodEquiv), days(perPeriodEquiv)],
      ['Yearly total at ' + trim(weekly) + ' hours a week', span('r-annual', annual), days(annual)],
      ['Balance after this pay period', span('r-balafter', balAfter), days(balAfter)],
      [yeLab, span('r-yearend', yearEnd), days(yearEnd)],
      ['Not earned because of the cap, this period to year end',
       span('r-losttotal', lostTotal), days(lostTotal)],
      [carryLab, span('r-carried', carried), days(carried)],
      ['Forfeited at year end, over the carryover limit', span('r-forfeit', forfeited),
       days(forfeited)]
    ];
    var note = '<p class="hint" id="r-note">The projection assumes the same hours in each of the ' +
               rest.length + ' remaining pay periods of ' + pend.getFullYear() +
               ' and spreads the ' + fmt(planned) + ' planned PTO hours evenly across them ' +
               'and this one.' +
               (yearEnd < 0 ? ' Planned use is more than the balance and accrual can cover, ' +
                              'so the projection goes below zero.' : '') + '</p>';

    return S.readout(fmt(appliedNow) + ' h',
                     'PTO accrued this pay period (' + days(appliedNow) + ' days)', pill, null) +
           rateP + S.rowsTable(['', 'Hours', 'Days'], rows) + note;
  });
})();
