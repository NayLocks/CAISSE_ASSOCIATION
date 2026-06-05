/**
 * Façade historique — documents + impression thermique dans `cashReceipt/`.
 */
export {
  RECEIPT_DOCUMENT_ROOT_ID,
  RECEIPT_TICKET_WIDTH_MM,
  RECEIPT_WINDOW_WIDTH_PX,
  TICKET_WIDTH_MM,
  htmlDocumentToPdf,
  listPrinters,
  printUnitTicketsToDevice,
  buildHoldSlipDocument,
  buildSummaryReceiptDocument,
  buildSummaryReceiptPrintHtmlPages,
  buildTicketsDocument,
  printReceiptDocument as printHtmlDocument,
  printReceiptHtmlPages
} from './cashReceipt/index.js'
