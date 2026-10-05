# Invoice validation before human review

A small, dependency-free, AI-assisted demonstration for an n8n document-processing pipeline. All examples are synthetic.

It checks required invoice/supplier IDs, real calendar dates, supported currencies, decimal amount strings, subtotal plus tax, and duplicate supplier/invoice IDs within the current batch. Both occurrences of a duplicate are flagged. Every result still requires human review. This code never approves documents, sends payments, or calls external services.

## Run local verification

Requires Node.js 22 or newer. No installation, account, API key, or network access is needed.

~~~sh
node build-workflow.cjs
node --test test.cjs
~~~

The 22 tests exercise the generated n8n Code-node JavaScript with synthetic n8n input/output objects. They do not constitute an import or deployment test in a running n8n instance.

## Use in n8n

Import workflow.json into a separate test workspace. It contains a manual trigger, synthetic inputs, and a validation Code node. It starts inactive. Alternatively copy n8n-code-node.js into a JavaScript Code node in **Run Once for All Items** mode.

Each input item's JSON must contain:

~~~json
{
  "invoice_id": "INV-1",
  "supplier_id": "SUP-1",
  "invoice_date": "2026-10-05",
  "currency": "EUR",
  "subtotal": "100.00",
  "tax": "20.00",
  "total": "120.00"
}
~~~

Output contains the original invoice, a validation result, and an n8n paired-item link. ready_for_review means only that these deterministic checks passed. needs_correction contains field-specific issue codes.

## Scope and limitations

- Supports EUR, USD and GBP only, using two minor digits.
- Amounts must be nonnegative decimal strings with at most two fractional digits. Numeric JSON amounts, localized separators, credit notes and other currency precisions need explicit field/rule mapping.
- Supplier IDs must be canonical; matching is case-sensitive after trimming.
- Duplicate detection covers the current batch, not previous executions. Persistent detection needs an agreed database integration.
- Discounts, line-item reconciliation, OCR/LLM extraction, approvals, ERP writes, and production deployment are outside this sample.
- Results are validation hints for a human reviewer, not fraud detection or accounting advice.

## License

MIT. See LICENSE.

