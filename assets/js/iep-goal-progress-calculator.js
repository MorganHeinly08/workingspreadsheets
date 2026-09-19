/* Mirrors site_content.calc_goal / _goal_result_html.
   Progress formula is the workbook's: MEDIAN(0,(Current-Baseline)/(Target-Baseline),1). */
(function () {
  'use strict';
  var S = window.SD;

  S.wire(function () {
    var base = S.n('baseline'), cur = S.n('current'), tgt = S.n('target');
    var span = tgt - base;
    if (span === 0) {
      return '<p class="pill bad">Baseline and target are the same, so there is no ' +
             'distance to measure.</p>';
    }
    var progress = S.clamp01((cur - base) / span);
    var remaining = tgt - cur;
    var moved = cur - base;

    var rows = [
      ['Distance still to cover', '<span id="r-remaining">' + S.num(remaining, 1) + '</span>'],
      ['Movement so far', '<span id="r-moved">' + S.num(moved, 1) + '</span>']
    ];

    /* Pace, only when movement is actually toward the target. */
    var start = S.parseDate(S.raw('start'));
    var elapsed = start ? S.daysBetween(start, S.today()) : 0;
    if (elapsed > 0 && (moved / span) > 0) {
      rows.push(['Average change per week',
                 '<span id="r-perweek">' + S.num(moved / elapsed * 7, 2) + '</span>']);
      var weeksLeft = moved ? (remaining / (moved / elapsed) / 7) : null;
      if (weeksLeft !== null && weeksLeft >= 0 && weeksLeft < 520) {
        var proj = new Date(S.today().getTime() + weeksLeft * 7 * 86400000);
        rows.push(['At this pace, target reached about',
                   '<span id="r-projected">' + S.iso(proj) + '</span>']);
      }
    }

    /* Review flag — Overdue / Due soon / On track, same three states as the workbook. */
    var pill = null;
    var review = S.parseDate(S.raw('review'));
    if (review) {
      var days = S.daysBetween(S.today(), review);
      var win = S.n('window', 14);
      var flag = days < 0 ? 'Overdue' : (days <= win ? 'Due soon' : 'On track');
      var cls = { 'Overdue': 'bad', 'Due soon': 'warn', 'On track': 'ok' }[flag];
      var when = days < 0 ? ('overdue by ' + (-days) + ' days')
               : days ? ('due in ' + days + ' days') : 'due today';
      pill = [cls, 'Review ' + flag.toLowerCase() + ' — ' + when];
    }

    return S.readout(S.pct(progress), 'of the way from baseline to target', pill, progress) +
           S.rowsTable(['', 'Value'], rows);
  });
})();
