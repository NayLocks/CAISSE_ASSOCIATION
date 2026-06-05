export { RECEIPT_DOCUMENT_ROOT_ID, RECEIPT_TICKET_WIDTH_MM, RECEIPT_WINDOW_WIDTH_PX } from './constants.js'
/** Compat ancien module `printWindow` */
export { RECEIPT_TICKET_WIDTH_MM as TICKET_WIDTH_MM } from './constants.js'
export {
  buildHoldSlipDocument,
  buildSummaryReceiptDocument,
  buildSummaryReceiptPrintHtmlPages,
  buildTicketsDocument
} from './receiptDocuments.js'
export {
  htmlDocumentToPdf,
  listPrinters,
  printReceiptDocument,
  printReceiptHtmlPages,
  printUnitTicketsToDevice
} from './receiptThermalPrint.js'
