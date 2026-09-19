/* Mirrors site_content.calc_ceu / _ceu_result_html.
   remaining = max(0, required - earned); progress = clamp(earned/required, 0, 1). */
(function () {
  'use strict';
  var S = window.SD;
  var CYCLE_DAYS = 730;   // see the note in site_content.calc_ceu

  S.wire(function () {
    var required = S.n('required'), earned = S.n('earned');
    var remaining = Math.max(0, required - earned);
    var progress = required ? S.clamp01(earned / required) : 0;

    var renewal = S.parseDate(S.raw('renewal'));
    var days = renewal ? S.daysBetween(S.today(), renewal) : 0;
    var months = Math.max(days, 0) / 30.44;
    var weeks = Math.max(days, 0) / 7;
    var catRemaining = Math.max(0, S.n('cat_required') - S.n('cat_earned'));

    var elapsedFrac = S.clamp01((CYCLE_DAYS - Math.max(days, 0)) / CYCLE_DAYS);
    var status;
    if (remaining === 0 && catRemaining === 0) status = 'Met';
    else if (days < 0) status = 'Overdue';
    else if (progress + 1e-9 >= elapsedFrac * 0.9) status = 'On track';
    else status = 'Behind';

    var cls = { 'Met': 'ok', 'On track': 'ok', 'Behind': 'warn', 'Overdue': 'bad' }[status];
    var when = days < 0 ? ((-days) + ' days overdue') : (days + ' days to renewal');

    var rows = [['Hours still required',
                 '<span id="r-remaining">' + S.num(remaining, 1) + '</span>']];
    if (months >= 1) {
      rows.push(['Pace needed, per month',
                 '<span id="r-permonth">' + S.num(remaining / months, 1) + '</span>']);
    }
    if (weeks >= 1) {
      rows.push(['Pace needed, per week',
                 '<span id="r-perweek">' + S.num(remaining / weeks, 2) + '</span>']);
    }
    if (catRemaining > 0) {
      rows.push([S.esc(S.raw('cat_name')) + ' hours still required',
                 '<span id="r-cat">' + S.num(catRemaining, 1) + '</span>']);
    }

    return S.readout(S.pct(progress), 'of your required hours earned',
                     [cls, status + ' — ' + when], progress) +
           S.rowsTable(['', 'Value'], rows);
  });
})();
