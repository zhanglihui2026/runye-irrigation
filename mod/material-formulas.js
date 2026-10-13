(function (root) {
  'use strict';

  function parseNum(ss) {
    if (ss == null) return NaN;
    var t = String(ss).replace(/[¥\s,]/g, '').replace(/元|套|m\/亩|m/g, '').trim();
    var m = t.match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function colLetter(i) {
    var s = '';
    i = i + 1;
    while (i > 0) {
      var mm = (i - 1) % 26;
      s = String.fromCharCode(65 + mm) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function colLetterIndex(letter) {
    var n = 0;
    for (var i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
    return n - 1;
  }

  function cellRefs(expr) {
    var refs = [], re = /([A-Z]+\d+)/g, m;
    while ((m = re.exec(expr))) refs.push(m[1]);
    return refs;
  }

  function evalExpr(expr, vals) {
    expr = expr.replace(/SUM\(\s*([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\s*\)/gi, function (mm, a, b) {
      var ac = a.match(/^([A-Z]+)(\d+)$/), bc = b.match(/^([A-Z]+)(\d+)$/);
      if (!ac || !bc) return '0';
      var c1 = colLetterIndex(ac[1]), c2 = colLetterIndex(bc[1]), r1 = +ac[2], r2 = +bc[2], sum = 0;
      for (var c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        for (var r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
          var v = vals[colLetter(c) + r];
          if (typeof v === 'number' && !isNaN(v)) sum += v;
        }
      }
      return '(' + sum + ')';
    });
    expr = expr.replace(/([A-Z]+\d+)/g, function (mm, ref) {
      var v = vals[ref];
      return (typeof v === 'number' && !isNaN(v)) ? String(v) : '0';
    });
    if (!/^[-+*/().\s\d]+$/.test(expr)) return { err: 'syntax' };
    try {
      var rr = Function('"use strict";return (' + expr + ');')();
      return { val: rr };
    } catch (e) {
      return { err: e.message };
    }
  }

  function fmtNum(n) {
    if (!isFinite(n)) return '#ERR!';
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    var st = n.toFixed(3);
    while (st.indexOf('.') >= 0 && st.charAt(st.length - 1) === '0') st = st.slice(0, -1);
    if (st.charAt(st.length - 1) === '.') st = st.slice(0, -1);
    return st;
  }

  var api = {
    parseNum: parseNum,
    colLetter: colLetter,
    colLetterIndex: colLetterIndex,
    cellRefs: cellRefs,
    evalExpr: evalExpr,
    fmtNum: fmtNum
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RyMatFormula = api;
})(typeof window !== 'undefined' ? window : null);
