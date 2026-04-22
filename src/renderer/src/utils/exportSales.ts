import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { SaleRecord } from '@shared/sales'
import { formatOrderDisplay } from '@renderer/utils/order'

function paymentShort(s: SaleRecord): string {
  const p = s.payment
  const pref = s.kind === 'refund' ? 'Remb. ' : ''
  if (p.mode === 'card') return `${pref}Carte`
  if (p.mode === 'cash') {
    return p.changeCents > 0
      ? `${pref}Esp. · ${s.kind === 'refund' ? 'repris' : 'rendu'} ${(p.changeCents / 100).toFixed(2)} €`
      : `${pref}Espèces`
  }
  return `${pref}Mixte · carte ${(p.cardCents / 100).toFixed(2)} €`
}

function linesSummary(s: SaleRecord): string {
  return s.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

/** Nom de fichier sans caractères interdits Windows */
export function safeEventFileName(name: string): string {
  const s = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return s.slice(0, 80) || 'evenement'
}

export function buildSalesPdfBase64(
  sales: SaleRecord[],
  meta: { eventName: string; associationName: string }
): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(14)
  doc.text(`Ventes — ${meta.eventName}`, 14, 16)
  doc.setFontSize(10)
  doc.text(`Association : ${meta.associationName}`, 14, 23)
  doc.text(`Export : ${new Date().toLocaleString('fr-FR')}`, 14, 29)
  doc.text(`Nombre d’opérations : ${sales.length}`, 14, 35)

  const totalNetCents = sales.reduce(
    (a, s) => a + (s.kind === 'refund' ? -s.totalCents : s.totalCents),
    0
  )

  autoTable(doc, {
    startY: 40,
    head: [['Date / heure', 'N°', 'Type', 'Paiement', 'Total (€)', 'Détail (aperçu)']],
    body: sales.map((s) => {
      const sum = linesSummary(s)
      const sign = s.kind === 'refund' ? '-' : ''
      return [
        new Date(s.at).toLocaleString('fr-FR'),
        s.orderNumber != null && s.orderNumber > 0 ? formatOrderDisplay(s.orderNumber) : '—',
        s.kind === 'refund' ? 'Remboursement' : 'Vente',
        paymentShort(s),
        `${sign}${(s.totalCents / 100).toFixed(2).replace('.', ',')}`,
        sum.slice(0, 100) + (sum.length > 100 ? '…' : '')
      ]
    }),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [45, 48, 56], fontSize: 8 },
    margin: { left: 14, right: 14 }
  })

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } }
  const y = docExt.lastAutoTable?.finalY ?? 50
  doc.setFontSize(11)
  doc.text(
    `Total net (${sales.length} opération${sales.length === 1 ? '' : 's'}) : ${(totalNetCents / 100).toFixed(2).replace('.', ',')} €`,
    14,
    y + 10
  )

  const out = doc.output('arraybuffer') as ArrayBuffer
  return arrayBufferToBase64(out)
}

export function buildSalesXlsxBase64(
  sales: SaleRecord[],
  meta: { eventName: string; associationName: string }
): string {
  const wb = XLSX.utils.book_new()

  const info = [
    ['Export ventes'],
    ['Événement', meta.eventName],
    ['Association', meta.associationName],
    ['Date export', new Date().toLocaleString('fr-FR')]
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Infos')

  const summaryRows = sales.map((s) => ({
    'Date / heure': new Date(s.at).toLocaleString('fr-FR'),
    'N° commande':
      s.orderNumber != null && s.orderNumber > 0 ? formatOrderDisplay(s.orderNumber) : '',
    Type: s.kind === 'refund' ? 'Remboursement' : 'Vente',
    Événement: s.eventName,
    Paiement: paymentShort(s),
    'Total (€)': (s.kind === 'refund' ? -1 : 1) * (s.totalCents / 100),
    'Détail lignes': linesSummary(s)
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ventes')

  const lineRows: Record<string, string | number>[] = []
  for (const s of sales) {
    for (const l of s.lines) {
      lineRows.push({
        'Date vente': new Date(s.at).toLocaleString('fr-FR'),
        'N° commande':
          s.orderNumber != null && s.orderNumber > 0 ? formatOrderDisplay(s.orderNumber) : '',
        Article: l.name,
        Qté: l.qty,
        'PU barème (€)': (l.listUnitCents ?? l.unitCents) / 100,
        'Remise %': l.discountPercent ?? '',
        'Motif remise': l.discountReason ?? '',
        'PU net (€)': l.unitCents / 100,
        'Ligne (€)': l.lineTotalCents / 100
      })
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRows), 'Lignes')

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
}
