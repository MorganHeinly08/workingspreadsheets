/* Mirrors scripts/site_tools/parenting_time.py: calc(), result_html(), strip_html(), _fx().
   Output markup must be byte-identical to the Python for the same inputs (site_check.py).
   Share formula is the workbook's: A / (A + B)  (Summary!F5, 'Custody Calendar'!AL19).
   Never reads the current date. Never calculates child support. */
(function () {
  'use strict';
  var S = window.SD;

  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var PATTERNS = {
    'alt-weeks': 'AAAAAAABBBBBBB',
    '2-2-3': 'AABBAAABBAABBB',
    '2-2-5-5': 'AABBAAAAABBBBB',
    '3-4-4-3': 'AAABBBBAAAABBB',
    'eow-3': 'AAAABBBAAAAAAA',
    'eow-2': 'AAAABBAAAAAAAA',
    'eow-2-mid': 'AABABBAAABAAAA',
    'eow-3-mid': 'AABABBBAABAAAA'
  };

  /* Same rounding as parenting_time._fx: scale, floor, remainder >= 0.5 rounds up. */
  function fx(x, dp) {
    if (dp === undefined) dp = 1;
    var k = Math.pow(10, dp);
    var y = x * k;
    var r = Math.floor(y);
    if (y - r >= 0.5) r += 1;
    var neg = r < 0;
    var s = String(Math.abs(r));
    var ip, fp = '';
    if (dp) {
      while (s.length < dp + 1) s = '0' + s;
      ip = s.slice(0, s.length - dp);
      fp = s.slice(s.length - dp);
    } else {
      ip = s;
    }
    ip = String(parseInt(ip, 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + ip + (dp ? '.' + fp : '');
  }

  function pct(x) { return fx(x * 100, 1) + '%'; }

  function signed(n) {
    n = Math.trunc(n);
    return n > 0 ? '+' + n : (n < 0 ? '−' + (-n) : '0');
  }

  function cycleOf() {
    var c = PATTERNS[S.raw('pattern')];
    if (c) return c;
    var s = '';
    for (var i = 1; i <= 14; i++) s += S.raw('c' + i) === 'B' ? 'B' : 'A';
    return s;
  }

  function calc() {
    var cyc = cycleOf();
    var year = S.raw('year') === '366' ? 366 : 365;
    var weeks = S.n('summer', 0);
    var to = S.raw('summer_to') === 'A' ? 'A' : 'B';
    var hab = S.n('hol_ab', 0), hba = S.n('hol_ba', 0);

    if (weeks < 0 || weeks > 52 || weeks !== Math.floor(weeks)) {
      return { error: 'Summer weeks must be a whole number from 0 to 52.' };
    }
    if (hab < 0 || hba < 0 || hab !== Math.floor(hab) || hba !== Math.floor(hba)) {
      return { error: 'Holiday nights must be whole numbers, 0 or more.' };
    }
    var a = 0;
    for (var i = 0; i < 14; i++) if (cyc.charAt(i) === 'A') a++;
    var b = 14 - a;
    var summerNights = 7 * weeks;
    var rest = year - summerNights;
    var baseA = a / 14 * rest;
    var baseB = b / 14 * rest;
    if (hab > baseA + 1e-9) {
      return { error: 'That moves more holiday nights away from Parent A than Parent A ' +
                      'has outside the summer weeks.' };
    }
    if (hba > baseB + 1e-9) {
      return { error: 'That moves more holiday nights away from Parent B than Parent B ' +
                      'has outside the summer weeks.' };
    }
    var sumA = to === 'A' ? summerNights : 0;
    var sumB = to === 'B' ? summerNights : 0;
    var netA = hba - hab, netB = hab - hba;
    var nightsA = baseA + sumA + netA;
    var nightsB = baseB + sumB + netB;
    var total = nightsA + nightsB;
    return {
      cycle: cyc, year: year, a14: a, b14: b, summerNights: summerNights, rest: rest,
      baseA: baseA, baseB: baseB, sumA: sumA, sumB: sumB, netA: netA, netB: netB,
      nightsA: nightsA, nightsB: nightsB,
      shareA: total ? nightsA / total : 0, shareB: total ? nightsB / total : 0
    };
  }

  var CELL = 'padding:6px 0;border-radius:5px;font-weight:700;';
  var CELL_A = CELL + 'background:var(--brand-soft);color:var(--ink);border:1px solid var(--line)';
  var CELL_B = CELL + 'background:var(--teal);color:var(--bg);border:1px solid var(--teal)';

  function strip(cyc) {
    var h = '<p class="hint" style="color:var(--muted);font-size:.84rem;margin:16px 0 6px">' +
            'First four weeks of the base pattern. Each box is the night that starts that ' +
            'evening; summer and holiday changes are not drawn.</p>' +
            '<div id="r-strip" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));' +
            'gap:4px;max-width:420px;text-align:center;font-size:.85rem">';
    DAYS.forEach(function (d) {
      h += '<span style="color:var(--muted);font-size:.78rem">' + d + '</span>';
    });
    for (var i = 0; i < 28; i++) {
      var p = cyc.charAt(i % 14);
      h += '<span style="' + (p === 'A' ? CELL_A : CELL_B) + '">' + p + '</span>';
    }
    return h + '</div>';
  }

  S.wire(function () {
    var r = calc();
    if (r.error) return '<p class="pill bad">' + S.esc(r.error) + '</p>';
    var rows = [
      ['Regular pattern (' + r.rest + ' nights)',
       '<span id="r-base-a">' + fx(r.baseA) + '</span>',
       '<span id="r-base-b">' + fx(r.baseB) + '</span>'],
      ['Summer (' + r.summerNights + ' nights)',
       '<span id="r-sum-a">' + fx(r.sumA) + '</span>',
       '<span id="r-sum-b">' + fx(r.sumB) + '</span>'],
      ['Holidays moved',
       '<span id="r-hol-a">' + signed(r.netA) + '</span>',
       '<span id="r-hol-b">' + signed(r.netB) + '</span>'],
      ['<strong>Overnights per year</strong>',
       '<strong id="r-nights-a">' + fx(r.nightsA) + '</strong>',
       '<strong id="r-nights-b">' + fx(r.nightsB) + '</strong>'],
      ['Share of overnights',
       '<span id="r-share-a">' + pct(r.shareA) + '</span>',
       '<span id="r-share-b">' + pct(r.shareB) + '</span>'],
      ['Nights per 14, base pattern',
       '<span id="r-14-a">' + r.a14 + '</span>',
       '<span id="r-14-b">' + r.b14 + '</span>']
    ];
    return S.readout(pct(r.shareA) + ' / ' + pct(r.shareB),
                     'Parent A / Parent B share of overnights in a ' + r.year + '-night year') +
           S.rowsTable(['', 'Parent A', 'Parent B'], rows) +
           strip(r.cycle);
  });

  /* Exposed for the node unit check in scripts/site_tools/test_parenting_time.py. */
  window.__ptc = { fx: fx, pct: pct, calc: calc };
})();
