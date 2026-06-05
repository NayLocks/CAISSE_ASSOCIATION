import type { TicketUnitPayload } from '../../shared/ticket.js'
import type { UnitTicketEscposBuildOptions } from './buildUnitTicketEscpos.js'
import { buildUnitTicketEscposBuffer } from './buildUnitTicketEscpos.js'
import { sendRawBytesToWindowsPrinter } from './rawPrintWindows.js'

/** Courte pause entre deux jobs RAW (USB). */
const BETWEEN_RAW_UNIT_MS = 25

export async function printUnitTicketsEscpos(
  tickets: TicketUnitPayload[],
  deviceName: string | null,
  docOptions?: UnitTicketEscposBuildOptions
): Promise<{ ok: boolean; error?: string }> {
  if (tickets.length === 0) return { ok: true }
  const dn = deviceName?.trim()
  if (!dn) return { ok: false, error: 'Aucune imprimante sélectionnée.' }
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: "Le mode ESC/POS brut n'est disponible que sous Windows (spouleur RAW)."
    }
  }
  for (let i = 0; i < tickets.length; i++) {
    const buf = buildUnitTicketEscposBuffer(tickets[i], docOptions)
    const r = await sendRawBytesToWindowsPrinter(dn, buf)
    if (!r.ok) return { ok: false, error: r.error }
    if (i < tickets.length - 1 && BETWEEN_RAW_UNIT_MS > 0) {
      await new Promise<void>((res) => setTimeout(res, BETWEEN_RAW_UNIT_MS))
    }
  }
  return { ok: true }
}
