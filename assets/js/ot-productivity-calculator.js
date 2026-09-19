/* Mirrors site_content.calc_productivity / _prod_result_html.
   productivity = billable hours / (hours worked - leave hours), the workbook's formula. */
(function () {
  'use strict';
  var S = window.SD;

  S.wire(function () {
    var available = S.n('worked') - S.n('leave');
    if (available <= 0) {
      return '<p class="pill bad">Available hours come out at zero — check hours worked ' +
             'and leave.</p>';
    }
    var mph = S.n('mph', 60) || 60;
    var billableH = S.n('billable_min') / mph;
    var target = S.n('target') / 100;
    var p = billableH / available;
    var vsTarget = p - target;
    var neededH = target * available;
    var gapMin = (neededH - billableH) * mph;

    var over = vsTarget >= 0;
    var cls = over ? 'ok' : (vsTarget > -0.05 ? 'warn' : 'bad');
    var label = S.pct(Math.abs(vsTarget), 1) + (over ? ' above' : ' below') + ' target';

    var rows = [
      ['Available hours (worked − leave)', '<span id="r-avail">' + S.num(available) + '</span>'],
      ['Billable hours', '<span id="r-bill">' + S.num(billableH) + '</span>'],
      ['Billable minutes needed to hit ' + S.pct(target),
       '<span id="r-needed">' + S.num(neededH * mph, 0) + '</span>']
    ];
    if (gapMin > 0) {
      rows.push(['Shortfall', '<span id="r-gap">' + S.num(gapMin, 0) + '</span> min']);
      rows.push(['…which is, per working day',
                 '<span id="r-perday">' + S.num(gapMin / 20, 0) + '</span> min']);
    } else {
      rows.push(['Margin above target', '<span id="r-gap">' + S.num(-gapMin, 0) + '</span> min']);
    }

    return S.readout(S.pct(p, 1), 'productivity for the month', [cls, label], p) +
           S.rowsTable(['', 'Value'], rows);
  });
})();
