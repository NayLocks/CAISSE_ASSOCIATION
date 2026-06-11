import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventItem } from '@shared/catalog'
import type { EventClosureStats } from '@renderer/utils/eventClosureStats'

function euros(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

export function buildEventClosurePdfBase64(
  ev: EventItem,
  stats: EventClosureStats,
  meta: { associationName: string; closedAtIso?: string }
): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const closedLabel = meta.closedAtIso
    ? new Date(meta.closedAtIso).toLocaleString('fr-FR')
    : new Date().toLocaleString('fr-FR')

  doc.setFontSize(16)
  doc.text('Rapport de clôture d’événement', 14, 18)
  doc.setFontSize(11)
  doc.text(`Association : ${meta.associationName}`, 14, 28)
  doc.text(`Événement : ${ev.name}`, 14, 35)
  if (ev.date) doc.text(`Date : ${ev.date}`, 14, 42)
  doc.text(`Clôture / export : ${closedLabel}`, 14, 49)
  if (ev.notes?.trim()) {
    doc.setFontSize(9)
    doc.text(`Notes : ${ev.notes.trim().slice(0, 120)}`, 14, 56)
  }

  const y0 = ev.notes?.trim() ? 64 : 58
  doc.setFontSize(10)
  const summary = [
    ['Chiffre d’affaires net', euros(stats.revenueCents)],
    ['Ventes', String(stats.saleCount)],
    ['Remboursements', String(stats.refundCount)],
    ['Fond de caisse initial', euros(stats.floatCents)],
    ['Variation espèces (ventes)', euros(stats.cashDeltaCents)],
    ['Encaissements carte (net)', euros(stats.cardCents)],
    ...(stats.cardCashExchangeCardCents !== 0
      ? [
          [
            'Échanges carte / espèces — crédit carte',
            euros(stats.cardCashExchangeCardCents)
          ],
          [
            'Échanges carte / espèces — débit espèces',
            euros(-stats.cardCashExchangeCashOutCents)
          ],
          [
            'Note échanges',
            'Crédit carte et débit espèces de même montant : hors CA, compensation dans les stats.'
          ]
        ]
      : []),
    ['Espèces théoriques en caisse', euros(stats.theoreticalCashCents)]
  ]

  autoTable(doc, {
    startY: y0,
    head: [['Synthèse', 'Montant / quantité']],
    body: summary,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
    margin: { left: 14, right: 14 }
  })

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } }
  let y = (docExt.lastAutoTable?.finalY ?? y0) + 8

  if (stats.topProducts.length > 0) {
    doc.setFontSize(11)
    doc.text('Articles les plus vendus', 14, y)
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['Article', 'Qté nette', 'CA (€)']],
      body: stats.topProducts.map((p) => [
        `${p.emoji} ${p.name}`,
        String(p.qtyNet),
        euros(p.revenueCents)
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
      margin: { left: 14, right: 14 }
    })
  }

  const out = doc.output('arraybuffer') as ArrayBuffer
  return arrayBufferToBase64(out)
}
