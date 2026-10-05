'use strict';

// Decimal strings for EUR, USD and GBP. This code never approves or pays invoices.
const CURRENCIES = new Set(['EUR', 'USD', 'GBP']);
function minorUnits(value) {
  if (typeof value !== 'string' || value.length > 24 ||
      !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function validDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}
function textId(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
function validateInvoice(record) {
  const issues = [];
  const normalized = {};
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { status: 'needs_correction', checks_passed: false, review_required: true,
      issues: [{ field: '$', code: 'invalid_record' }], normalized };
  }
  for (const field of ['invoice_id', 'supplier_id']) {
    normalized[field] = textId(record[field]);
    if (!normalized[field]) issues.push({ field, code: 'required_string' });
  }
  normalized.currency = record.currency;
  if (!CURRENCIES.has(record.currency)) issues.push({ field: 'currency', code: 'unsupported_currency' });
  normalized.invoice_date = record.invoice_date;
  if (!validDate(record.invoice_date)) issues.push({ field: 'invoice_date', code: 'invalid_date' });
  const amounts = {};
  for (const field of ['subtotal', 'tax', 'total']) {
    amounts[field] = minorUnits(record[field]);
    if (amounts[field] === null) issues.push({ field, code: 'invalid_decimal_string' });
    else normalized[field + '_minor'] = amounts[field].toString();
  }
  if (Object.values(amounts).every(value => value !== null) &&
      amounts.subtotal + amounts.tax !== amounts.total) {
    issues.push({ field: 'total', code: 'total_mismatch' });
  }
  return { status: issues.length ? 'needs_correction' : 'ready_for_review',
    checks_passed: issues.length === 0, review_required: true, issues, normalized };
}
function validateBatch(records) {
  if (!Array.isArray(records)) throw new TypeError('Expected an array of invoice records');
  const results = records.map(validateInvoice);
  const counts = new Map();
  const keys = results.map(result => {
    const n = result.normalized;
    if (!n.invoice_id || !n.supplier_id) return null;
    return JSON.stringify([n.supplier_id, n.invoice_id]);
  });
  for (const key of keys) if (key !== null) counts.set(key, (counts.get(key) || 0) + 1);
  for (let i = 0; i < results.length; i++) {
    if (keys[i] !== null && counts.get(keys[i]) > 1) {
      results[i].issues.push({ field: 'invoice_id', code: 'duplicate_in_batch' });
      results[i].status = 'needs_correction';
      results[i].checks_passed = false;
    }
  }
  return results;
}



const items = $input.all();
const results = validateBatch(items.map(item => item.json));
return items.map((item, index) => ({json: {invoice: item.json, validation: results[index]}, pairedItem: {item: index}}));
