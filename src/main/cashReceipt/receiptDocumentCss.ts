import { RECEIPT_DOCUMENT_ROOT_ID, RECEIPT_TICKET_WIDTH_MM } from './constants.js'

export interface ReceiptDocumentCssOptions {
  /** 5–100 : largeur du logo (% de la largeur du ticket). */
  logoWidthPercent?: number
}

/** Styles identiques à l’ancien module (tailles, graisses, logo, tableaux légaux). */
export function receiptDocumentStyles(
  widthMm = RECEIPT_TICKET_WIDTH_MM,
  cssOpts?: ReceiptDocumentCssOptions
): string {
  const w = `${widthMm}mm`
  const root = `#${RECEIPT_DOCUMENT_ROOT_ID}`
  const logoPct =
    typeof cssOpts?.logoWidthPercent === 'number' && Number.isFinite(cssOpts.logoWidthPercent)
      ? Math.max(5, Math.min(100, Math.round(cssOpts.logoWidthPercent)))
      : 100
  return `
  * { box-sizing: border-box; }
  @page {
    size: ${w} auto;
    margin: 0;
  }
  html {
    width: ${w};
    max-width: ${w};
    margin: 0;
    padding: 0;
    height: auto;
    min-height: 0;
  }
  ${root} {
    display: flow-root;
    width: 100%;
    max-width: ${w};
    margin: 0 auto;
    padding: 0;
    min-height: 0;
    height: fit-content;
  }
  body {
    margin: 0 auto;
    padding: 0;
    width: ${w};
    max-width: ${w};
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 11pt;
    font-weight: 500;
    color: #111;
    line-height: 1.35;
    overflow-x: hidden;
    height: auto;
    min-height: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ticket {
    width: 100%;
    max-width: ${w};
    margin: 0 auto 1mm;
    /* Marge de sécurité : zone imprimable souvent < largeur du rouleau (70 mm). */
    padding: 0 4mm;
    border: none;
    page-break-after: always;
    page-break-inside: avoid;
    overflow-wrap: anywhere;
    word-wrap: break-word;
  }
  .receipt-full {
    page-break-after: auto;
    /* Récap long : ne pas forcer tout le ticket en un seul bloc (évite échecs spouleur / pilote). */
    page-break-inside: auto;
  }
  .recap-continuation-hdr {
    font-size: 9pt;
    font-weight: 700;
    text-align: center;
    margin: 1mm 0 2mm;
    line-height: 1.3;
  }
  .recap-continue-note {
    font-size: 8pt;
    font-weight: 600;
    text-align: center;
    color: #333;
    margin: 2.5mm 0 1mm;
  }
  .ticket:last-of-type { page-break-after: auto; }
  .ticket-unit .product-row {
    margin: 2mm 0 2mm;
  }
  .ticket-unit .qtyline {
    font-size: 12pt;
    font-weight: 600;
    text-align: center;
    margin: 0;
  }
  .ticket-unit .unit-motif {
    font-size: 14pt;
    font-weight: 700;
    text-align: center;
    color: #111;
    margin: 2mm 0;
    padding: 2mm 3mm;
    line-height: 1.25;
  }
  .ticket-unit .unit-motif__label,
  .ticket-unit .unit-motif__comment {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .ticket-unit .unit-motif__comment {
    margin-top: 1mm;
  }
  .ticket-unit .hold-slip-kind {
    font-size: 13pt;
    font-weight: 700;
    text-align: center;
    margin: 1mm 0 3mm;
    letter-spacing: 0.02em;
    color: #111;
  }
  .ticket-unit .foot-unit {
    padding-top: 0;
  }
  .ticket-unit .foot-asso {
    font-size: 11pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 1mm;
    color: #111;
  }
  .ticket-unit .foot-dateline {
    display: block;
    font-weight: 500;
    color: #111;
    text-align: center;
    line-height: 1.3;
  }
  .ticket-unit .foot-dateline__date {
    font-size: 7pt;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .ticket-unit .foot-dateline__time {
    font-size: 7pt;
    margin-top: 0.5mm;
  }
  .ticket-unit .validity-notice-wrap {
    width: 100%;
    margin: 0;
    padding: 0;
    text-align: center;
  }
  .ticket-unit .validity-notice-wrap .validity-notice {
    margin-bottom: 0;
    max-width: 40ch;
  }
  .ticket-unit .validity-notice-wrap + .rule {
    margin-top: 0;
  }
  .validity-notice {
    font-size: 10pt;
    font-weight: 700;
    text-align: center;
    color: #000;
    margin: 1mm 0;
    padding: 2mm 2mm;
    line-height: 1.35;
    border: 1px solid #000;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    display: block;
    margin-left: auto;
    margin-right: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .orderno {
    font-weight: 600;
    font-size: 8pt;
    text-align: center;
    margin-bottom: 1.5mm;
    letter-spacing: 0.02em;
  }
  .orderno.big {
    font-size: 9pt;
    font-weight: 600;
  }
  .logo {
    display: block;
    width: ${logoPct}%;
    max-width: 100%;
    height: auto;
    max-height: 40mm;
    margin: 0 auto 2mm;
    object-fit: contain;
  }
  .doc-type {
    font-size: 9pt;
    font-weight: 700;
    text-align: center;
    margin-bottom: 2mm;
    letter-spacing: 0.04em;
  }
  .legal-block {
    font-size: 7.5pt;
    font-weight: 500;
    text-align: center;
    margin-bottom: 3mm;
    margin-top: 2mm;
    padding: 2mm 1mm;
    line-height: 1.35;
  }
  .legal-block-footer {
    margin-top: 0;
    margin-bottom: 0;
  }
  .legal-emitter {
    font-size: 10pt;
    font-weight: 700;
    margin-bottom: 1.5mm;
  }
  .legal-line, .legal-id {
    font-size: 7.5pt;
    margin: 0.5mm 0;
  }
  .legal-note-line {
    font-size: 7pt;
    font-weight: 500;
    text-align: center;
    margin: 0.8mm 0;
    padding: 0 1mm;
  }
  .asso {
    font-weight: 600;
    font-size: 10pt;
    text-align: center;
    margin-bottom: 2mm;
  }
  .event {
    font-size: 11pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 2mm;
  }
  .dt {
    font-size: 7.5pt;
    font-weight: 500;
    color: #111;
    text-align: center;
    margin-bottom: 3mm;
  }
  .emoji {
    font-size: 28pt;
    text-align: center;
    line-height: 1.2;
    margin: 0 0 0.35rem;
  }
  .qtyline {
    font-size: 13pt;
    font-weight: 600;
    text-align: center;
    margin: 0 auto 3mm;
  }
  .price {
    font-size: 11pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 3mm;
  }
  .rule {
    border-top: 1px solid #000;
    margin: 2mm 0 1mm;
  }
  .refund-banner {
    font-size: 11pt;
    font-weight: 700;
    text-align: center;
    color: #b91c1c;
    margin-bottom: 3mm;
    letter-spacing: 0.08em;
  }
  .refund-origin-line {
    font-size: 9pt;
    font-weight: 500;
    text-align: center;
    margin-bottom: 3mm;
    color: #111;
  }
  .foot {
    font-size: 8pt;
    font-weight: 500;
    color: #111;
    text-align: center;
  }
  table.lines {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 8.5pt;
    font-weight: 500;
  }
  table.lines th,
  table.lines td {
    padding: 2px 0.8mm;
    text-align: left;
    vertical-align: top;
  }
  /* Largeurs fixes (incluent le padding, box-sizing border-box) : Article = reste. */
  table.lines th:nth-child(2) { width: 7mm; }
  table.lines th:nth-child(3) { width: 12.5mm; }
  table.lines th:nth-child(4) { width: 14mm; }
  table.lines td:first-child {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  table.lines th + th,
  table.lines td + td {
    border-left: 0.3mm dotted #333;
  }
  table.lines .r {
    text-align: right;
    white-space: nowrap;
  }
  table.lines thead {
    border-bottom: 1px solid #000;
  }
  table.lines tr.line-remise-row td {
    font-size: 7.5pt;
    font-weight: 500;
    color: #333;
    padding: 0 0 3px 0;
    line-height: 1.35;
    border-left: none;
  }
  .subtotal-note {
    font-size: 8pt;
    font-weight: 500;
    color: #333;
    text-align: center;
    margin: 2mm 0 0;
    line-height: 1.35;
  }
  .recap-cart-block {
    font-size: 8pt;
    font-weight: 500;
    color: #222;
    text-align: center;
    margin: 2mm 0 0;
    line-height: 1.45;
    padding: 1.5mm 1mm;
    border: 0.3mm solid #333;
  }
  .recap-cart-line + .recap-cart-line {
    margin-top: 1mm;
  }
  .total {
    font-size: 14pt;
    font-weight: 700;
    text-align: center;
    margin: 3mm 0;
  }
  .payline {
    font-size: 9pt;
    font-weight: 500;
    text-align: center;
    margin: 1mm 0;
  }`
}
