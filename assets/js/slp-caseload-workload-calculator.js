/* Mirrors site_content.calc_workload / _workload_result_html.
   workload used = (direct + indirect + compliance + other) / (contracted hours * 60). */
(function () {
  'use strict';
  var S = window.SD;

  var BUCKETS = [
    ['direct', 'Direct service'],
    ['indirect', 'Indirect, student-specific'],
    ['compliance', 'Evaluation and compliance'],
    ['other', 'Other assigned duties']
  ];

  S.wire(function () {
    var contractedMin = S.n('contracted') * 60;
    var students = S.n('students');
    var total = 0, mins = {};
    BUCKETS.forEach(function (b) { mins[b[0]] = S.n(b[0]); total += mins[b[0]]; });

    var used = contractedMin ? total / contractedMin : 0;
    var balance = contractedMin - total;
    var verdict = used > 1.02 ? 'Over contracted time'
                : (used >= 0.95 ? 'At capacity' : 'Within contracted time');
    var cls = { 'Over contracted time': 'bad', 'At capacity': 'warn',
                'Within contracted time': 'ok' }[verdict];
    var balTxt = balance < 0 ? (S.hrs(-balance) + ' h/week over')
                             : (S.hrs(balance) + ' h/week spare');

    var rows = BUCKETS.map(function (b) {
      var share = total ? mins[b[0]] / total : 0;
      return [b[1],
              '<span id="r-' + b[0] + '">' + S.hrs(mins[b[0]]) + '</span>',
              '<span id="r-' + b[0] + '-pc">' + S.pct(share) + '</span>'];
    });
    rows.push(['<strong>Total workload</strong>',
               '<strong><span id="r-total">' + S.hrs(total) + '</span></strong>',
               '<strong><span id="r-used">' + S.pct(used) + '</span></strong>']);

    var dps = students ? mins.direct / students : 0;
    var tps = students ? total / students : 0;

    return S.readout(S.pct(used), 'of contracted time already committed',
                     [cls, verdict + ' — ' + balTxt], Math.min(1, used)) +
           S.rowsTable(['Workload bucket', 'Hours / week', 'Share'], rows) +
           '<p style="margin-top:14px">That leaves <strong><span id="r-dps">' +
           S.num(dps, 1) + '</span> minutes of direct service per student per week</strong> ' +
           'across ' + S.esc(S.raw('students')) + ' students, and <span id="r-tps">' +
           S.num(tps, 1) + '</span> minutes of total workload time per student.</p>';
  });
})();
