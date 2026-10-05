'use strict';
const fs = require('node:fs');
const path = require('node:path');
const base = { supplier_id: 'SYNTHETIC-SUPPLIER', currency: 'EUR',
  invoice_date: '2026-10-05', subtotal: '100.00', tax: '20.00', total: '120.00' };
const records = [
  { ...base, invoice_id: 'DEMO-001' },
  { ...base, invoice_id: 'DEMO-002', total: '121.00' },
  { ...base, invoice_id: 'DEMO-003', invoice_date: '2026-02-30' },
  { ...base, invoice_id: 'DEMO-004' },
  { ...base, invoice_id: 'DEMO-004' },
];
const source = fs.readFileSync(path.join(__dirname, 'invoice-validator.cjs'), 'utf8')
  .replace(/^module\.exports = .*$/m, '');
const code = source + '\nconst items = $input.all();\n' +
  'const results = validateBatch(items.map(item => item.json));\n' +
  'return items.map((item, index) => ({json: {invoice: item.json, validation: results[index]}, pairedItem: {item: index}}));\n';
fs.writeFileSync(path.join(__dirname, 'n8n-code-node.js'), code);
const workflow = {
  name: 'Synthetic invoice validation before human review',
  nodes: [
    { id: 'manual-start', name: 'Manual start', type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1, position: [0, 0], parameters: {} },
    { id: 'synthetic-input', name: 'Synthetic invoices', type: 'n8n-nodes-base.code',
      typeVersion: 2, position: [240, 0], parameters: { mode: 'runOnceForAllItems',
        jsCode: 'return ' + JSON.stringify(records) + '.map(json => ({json}));' } },
    { id: 'validate-invoices', name: 'Validate before review', type: 'n8n-nodes-base.code',
      typeVersion: 2, position: [480, 0], parameters: { mode: 'runOnceForAllItems', jsCode: code } },
  ],
  connections: {
    'Manual start': { main: [[{ node: 'Synthetic invoices', type: 'main', index: 0 }]] },
    'Synthetic invoices': { main: [[{ node: 'Validate before review', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' }, active: false,
};
fs.writeFileSync(path.join(__dirname, 'workflow.json'), JSON.stringify(workflow, null, 2) + '\n');

