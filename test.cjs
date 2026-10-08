'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { minorUnits, validDate, validateInvoice, validateBatch } = require('./invoice-validator.cjs');
const base = { invoice_id: 'INV-1', supplier_id: 'SUP-1', currency: 'EUR',
  invoice_date: '2026-10-05', subtotal: '100.00', tax: '20.00', total: '120.00' };
const codes = input => validateInvoice(input).issues.map(x => x.code);
test('valid extraction remains subject to human review', () => {
  const result = validateInvoice(base);
  assert.equal(result.status, 'ready_for_review');
  assert.equal(result.review_required, true);
  assert.equal(result.normalized.total_minor, '12000');
  assert.equal('approved' in result, false);
});
test('decimal arithmetic is exact for 0.10 + 0.20', () => {
  assert.equal(validateInvoice({ ...base, subtotal: '0.10', tax: '0.20', total: '0.30' }).checks_passed, true);
});
test('one-cent total error is flagged', () => assert.ok(codes({ ...base, total: '120.01' }).includes('total_mismatch')));
test('impossible date is flagged', () => assert.ok(codes({ ...base, invoice_date: '2026-02-30' }).includes('invalid_date')));
test('leap day is accepted in a leap year', () => assert.equal(validDate('2024-02-29'), true));
test('leap day is rejected in a non-leap year', () => assert.equal(validDate('2026-02-29'), false));
test('rolled-over month is rejected', () => assert.equal(validDate('2026-13-01'), false));
test('empty identifier is rejected', () => assert.ok(codes({ ...base, supplier_id: ' ' }).includes('required_string')));
test('numeric JSON amounts are rejected without silent rounding', () => assert.ok(codes({ ...base, total: 120 }).includes('invalid_decimal_string')));
test('unsupported precision is rejected', () => assert.equal(minorUnits('1.001'), null));
test('negative amount is rejected for this invoice-only sample', () => assert.equal(minorUnits('-1.00'), null));
test('scientific notation is rejected', () => assert.equal(minorUnits('1e2'), null));
test('localized decimal needs an explicit mapping', () => assert.equal(minorUnits('1,20'), null));
test('single fractional digit is normalized', () => assert.equal(minorUnits('1.2'), 120n));
test('decimal strings reject trailing line terminators', () => {
  for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    for (const amount of ['1', '1.2', '1.20']) {
      assert.equal(minorUnits(amount + suffix), null, JSON.stringify(amount + suffix));
    }
  }
});
test('calendar date strings reject trailing line terminators', () => {
  for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    assert.equal(validDate('2026-10-05' + suffix), false, JSON.stringify(suffix));
  }
});
test('trailing line breaks produce field-specific correction issues', () => {
  for (const field of ['subtotal', 'tax', 'total', 'invoice_date']) {
    const result = validateInvoice({ ...base, [field]: base[field] + '\n' });
    const expectedCode = field === 'invoice_date' ? 'invalid_date' : 'invalid_decimal_string';
    assert.equal(result.status, 'needs_correction');
    assert.equal(result.checks_passed, false);
    assert.ok(result.issues.some(issue => issue.field === field && issue.code === expectedCode));
  }
});
test('zero tax is valid', () => assert.equal(validateInvoice({ ...base, tax: '0', total: '100.00' }).checks_passed, true));
test('unsupported currency is rejected', () => assert.ok(codes({ ...base, currency: 'JPY' }).includes('unsupported_currency')));
test('malformed records produce a correction result', () => {
  assert.equal(validateInvoice(null).status, 'needs_correction');
  assert.equal(validateInvoice([]).status, 'needs_correction');
});
test('every occurrence of an in-batch duplicate is flagged', () => {
  assert.ok(validateBatch([base, { ...base, currency: 'USD' }]).every(r => r.issues.some(x => x.code === 'duplicate_in_batch')));
});
test('same number at different suppliers is not a duplicate', () => {
  assert.ok(validateBatch([base, { ...base, supplier_id: 'SUP-2' }]).every(r => r.checks_passed));
});
test('empty batch stays empty', () => assert.deepEqual(validateBatch([]), []));
test('non-array batch fails explicitly', () => assert.throws(() => validateBatch(base), TypeError));
test('generated n8n code processes synthetic items and preserves links', () => {
  const workflow = JSON.parse(fs.readFileSync('./workflow.json', 'utf8'));
  const inputNode = workflow.nodes.find(n => n.name === 'Synthetic invoices');
  const validator = workflow.nodes.find(n => n.name === 'Validate before review');
  const input = vm.runInNewContext('(function(){' + inputNode.parameters.jsCode + '})()');
  const output = vm.runInNewContext('(function(){' + validator.parameters.jsCode + '})()', { $input: { all: () => input } });
  assert.equal(output.length, 5);
  assert.equal(output[0].json.validation.status, 'ready_for_review');
  assert.ok(output.slice(1).every(i => i.json.validation.status === 'needs_correction'));
  assert.deepEqual(Array.from(output, item => item.pairedItem.item), [0, 1, 2, 3, 4]);
  assert.ok(output.every(item => item.json.validation.review_required === true));
  assert.equal(workflow.active, false);
});
test('both generated n8n artifacts reject amounts and dates with trailing line breaks', () => {
  const workflow = JSON.parse(fs.readFileSync('./workflow.json', 'utf8'));
  const embeddedCode = workflow.nodes.find(n => n.name === 'Validate before review').parameters.jsCode;
  const standaloneCode = fs.readFileSync('./n8n-code-node.js', 'utf8');
  const fields = ['subtotal', 'tax', 'total', 'invoice_date'];
  const input = fields.map((field, index) => ({ json: {
    ...base, invoice_id: 'INV-' + index, [field]: base[field] + '\n',
  } }));
  for (const code of [embeddedCode, standaloneCode]) {
    const output = vm.runInNewContext('(function(){' + code + '})()', { $input: { all: () => input } });
    assert.equal(output.length, fields.length);
    for (const [index, item] of output.entries()) {
      const validation = item.json.validation;
      const expectedCode = fields[index] === 'invoice_date' ? 'invalid_date' : 'invalid_decimal_string';
      assert.equal(validation.status, 'needs_correction');
      assert.ok(validation.issues.some(issue => issue.field === fields[index] && issue.code === expectedCode));
      assert.equal(validation.review_required, true);
      assert.equal(item.pairedItem.item, index);
    }
  }
});
