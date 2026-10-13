'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const formula = require('../mod/material-formulas.js');

test('material formula helpers preserve number parsing and display formatting', () => {
  assert.equal(formula.parseNum('¥ 1,234.50 元/m'), 1234.5);
  assert.ok(Number.isNaN(formula.parseNum('无数字')));
  assert.equal(formula.fmtNum(12), '12');
  assert.equal(formula.fmtNum(1.25), '1.25');
  assert.equal(formula.fmtNum(Infinity), '#ERR!');
});

test('material formula helpers map spreadsheet columns and find references', () => {
  assert.equal(formula.colLetter(0), 'A');
  assert.equal(formula.colLetter(25), 'Z');
  assert.equal(formula.colLetter(26), 'AA');
  assert.equal(formula.colLetterIndex('AA'), 26);
  assert.deepEqual(formula.cellRefs('=SUM(A1:B2)+C3'), ['A1', 'B2', 'C3']);
});

test('material formula evaluation supports arithmetic, ranges and syntax rejection', () => {
  const values = { A1: 2, A2: 3, B1: 4, B2: 5, C1: 7 };
  assert.deepEqual(formula.evalExpr('A1+B1*2', values), { val: 10 });
  assert.deepEqual(formula.evalExpr('SUM(A1:B2)+C1', values), { val: 21 });
  assert.deepEqual(formula.evalExpr('A1+MISSING()', values), { err: 'syntax' });
});
