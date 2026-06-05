/**
 * Impression thermique ESC/POS (flux brut Windows), optionnelle.
 * Les tickets HTML Chromium restent dans `cashReceipt/`.
 */
export { buildUnitTicketEscposBuffer } from './buildUnitTicketEscpos.js'
export type { UnitTicketEscposBuildOptions } from './buildUnitTicketEscpos.js'
export { printUnitTicketsEscpos } from './printUnitTicketsEscpos.js'
export { sendRawBytesToWindowsPrinter } from './rawPrintWindows.js'
export { ESCPOS_DEFAULT_LINE_CHARS } from './escposText.js'
