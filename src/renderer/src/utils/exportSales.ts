import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import type { SaleRecord } from '@shared/sales'
import {
  isSaleCardCashExchange,
  saleCardCashExchangeComptaLabel,
  saleOperationTypeLabel
} from '@shared/saleExchangeLabels'
import { formatOrderDisplay } from '@renderer/utils/order'

function paymentShort(s: SaleRecord): string {
  const p = s.payment
  const pref = s.kind === 'refund' ? 'Remb. ' : ''
  let base: string
  if (p.mode === 'card') base = `${pref}Carte`
  else if (p.mode === 'cash') {
    base =
      p.changeCents > 0
        ? `${pref}Esp. · ${s.kind === 'refund' ? 'repris' : 'rendu'} ${(p.changeCents / 100).toFixed(2)} €`
        : `${pref}Espèces`
  } else base = `${pref}Mixte · carte ${(p.cardCents / 100).toFixed(2)} €`
  if (isSaleCardCashExchange(s)) {
    return `${base} · ${saleCardCashExchangeComptaLabel(s)}`
  }
  return base
}

function linesSummary(s: SaleRecord): string {
  return s.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')
}

function signedTotalEuros(s: SaleRecord): string {
  const sign = s.kind === 'refund' ? '-' : ''
  return `${sign}${(s.totalCents / 100).toFixed(2).replace('.', ',')}`
}

function exportTotals(sales: SaleRecord[]): {
  totalNetCents: number
  exchangeCardCents: number
  exchangeCashOutCents: number
} {
  let totalNetCents = 0
  let exchangeCardCents = 0
  for (const s of sales) {
    const sign = s.kind === 'refund' ? -1 : 1
    if (isSaleCardCashExchange(s)) {
      exchangeCardCents += sign * s.payment.cardCents
    } else {
      totalNetCents += sign * s.totalCents
    }
  }
  return { totalNetCents, exchangeCardCents, exchangeCashOutCents: exchangeCardCents }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

function eurosFromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`
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

  const totals = exportTotals(sales)

  autoTable(doc, {
    startY: 40,
    head: [['Date / heure', 'N°', 'Type', 'Paiement', 'Total (€)', 'Détail (aperçu)']],
    body: sales.map((s) => {
      const sum = linesSummary(s)
      return [
        new Date(s.at).toLocaleString('fr-FR'),
        s.orderNumber != null && s.orderNumber > 0 ? formatOrderDisplay(s.orderNumber) : '—',
        saleOperationTypeLabel(s),
        paymentShort(s),
        signedTotalEuros(s),
        sum.slice(0, 100) + (sum.length > 100 ? '…' : '')
      ]
    }),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [45, 48, 56], fontSize: 8 },
    margin: { left: 14, right: 14 }
  })

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } }
  let y = (docExt.lastAutoTable?.finalY ?? 50) + 8
  doc.setFontSize(10)
  doc.text(
    `Total net ventes (hors échanges carte / espèces) : ${eurosFromCents(totals.totalNetCents)}`,
    14,
    y
  )
  y += 6
  if (totals.exchangeCardCents !== 0) {
    doc.setFontSize(9)
    doc.text(
      `Échanges carte / espèces — crédit carte ${eurosFromCents(totals.exchangeCardCents)} · débit espèces ${eurosFromCents(-totals.exchangeCashOutCents)} (compensation, hors CA)`,
      14,
      y
    )
  }

  const out = doc.output('arraybuffer') as ArrayBuffer
  return arrayBufferToBase64(out)
}

export function buildSalesXlsxBase64(
  sales: SaleRecord[],
  meta: { eventName: string; associationName: string }
): string {
  const wb = XLSX.utils.book_new()
  const totals = exportTotals(sales)

  const info = [
    ['Export ventes'],
    ['Événement', meta.eventName],
    ['Association', meta.associationName],
    ['Date export', new Date().toLocaleString('fr-FR')],
    ['Total net (hors échanges)', totals.totalNetCents / 100],
    ...(totals.exchangeCardCents !== 0
      ? [
          ['Échanges — crédit carte (€)', totals.exchangeCardCents / 100],
          ['Échanges — débit espèces (€)', -totals.exchangeCashOutCents / 100],
          [
            'Note échanges',
            'Crédit carte et débit espèces de même montant : hors chiffre d’affaires, compensation dans les stats.'
          ]
        ]
      : [])
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Infos')

  const summaryRows = sales.map((s) => {
    const sign = s.kind === 'refund' ? -1 : 1
    const row: Record<string, string | number> = {
      'Date / heure': new Date(s.at).toLocaleString('fr-FR'),
      'N° commande':
        s.orderNumber != null && s.orderNumber > 0 ? formatOrderDisplay(s.orderNumber) : '',
      Type: saleOperationTypeLabel(s),
      Événement: s.eventName,
      Paiement: paymentShort(s),
      'Total (€)': sign * (s.totalCents / 100),
      'Détail lignes': linesSummary(s)
    }
    if (isSaleCardCashExchange(s)) {
      row['Crédit carte (€)'] = (sign * s.payment.cardCents) / 100
      row['Débit espèces (€)'] = (-sign * s.payment.cardCents) / 100
      row['Hors CA'] = 'Oui (compensation stats)'
    }
    return row
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ventes')

  const lineRows: Record<string, string | number>[] = []
  for (const s of sales) {
    for (const l of s.lines) {
      lineRows.push({
        'Date vente': new Date(s.at).toLocaleString('fr-FR'),
        'N° commande':
          s.orderNumber != null && s.orderNumber > 0 ? formatOrderDisplay(s.orderNumber) : '',
        Type: saleOperationTypeLabel(s),
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
