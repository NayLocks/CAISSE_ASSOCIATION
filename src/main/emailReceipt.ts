import nodemailer from 'nodemailer'
import { extname } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { SaleRecord } from '../shared/sales.js'
import type { AppPersistedData } from '../shared/catalog.js'
import { receiptLegalInfoFromAssociation, clampReceiptLogoWidthPercent } from '../shared/catalog.js'
import { formatOrderDigits, formatOrderLabel } from '../shared/orderDigits.js'
import { buildSummaryReceiptDocument, htmlDocumentToPdf } from './printWindow.js'
import { logoFullPath } from './stateStore.js'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pour attribut <code>src</code> (data URL) */
function escAttrUrl(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function formatOrderNo(n: number): string {
  return formatOrderLabel(n)
}

function safeAttachmentBaseName(sale: SaleRecord): string {
  const n =
    sale.orderNumber != null && sale.orderNumber > 0 ? formatOrderDigits(sale.orderNumber) : 'archive'
  const raw = `ticket-caisse-${n}`
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ticket-caisse'
}

/** Corps HTML court : logo réduit ; le ticket détaillé est en pièce jointe PDF. */
function buildReceiptEmailBodyHtml(sale: SaleRecord, logoDataUrl: string | null): string {
  const ev = sale.eventName.trim() || 'Événement'
  const asso = sale.associationName.trim() || 'Association'
  const ord =
    sale.orderNumber != null && sale.orderNumber > 0
      ? formatOrderNo(sale.orderNumber)
      : 'Sans numéro de commande'
  const dt = new Date(sale.at)
  const dateStr = dt.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const totalLabel = sale.kind === 'refund' ? 'Total remboursé' : 'Total'
  const logo =
    logoDataUrl != null && logoDataUrl.length > 0
      ? `<img src="${escAttrUrl(logoDataUrl)}" alt="" width="56" height="56" style="max-width:56px;max-height:56px;width:56px;height:56px;object-fit:contain;border-radius:8px;display:block;" />`
      : ''
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:16px;font-family:Segoe UI,system-ui,sans-serif;font-size:15px;color:#111;line-height:1.5;background:#fafafa;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:20px 22px;border-radius:12px;border:1px solid #e5e7eb;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
      <tr>
        <td style="width:64px;vertical-align:middle;">${logo}</td>
        <td style="vertical-align:middle;padding-left:12px;">
          <div style="font-weight:700;font-size:16px;">${escHtml(asso)}</div>
          <div style="color:#555;font-size:14px;margin-top:4px;">${escHtml(ev)}</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 12px;">Bonjour,</p>
    <p style="margin:0 0 14px;">Veuillez trouver en pièce jointe le ticket de caisse au format PDF.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#333;margin:0;">
      <tr><td style="padding:3px 0;color:#666;">Événement</td><td style="padding:3px 0 3px 10px;"><strong>${escHtml(ev)}</strong></td></tr>
      <tr><td style="padding:3px 0;color:#666;">Référence</td><td style="padding:3px 0 3px 10px;"><strong>${escHtml(ord)}</strong></td></tr>
      <tr><td style="padding:3px 0;color:#666;">${escHtml(totalLabel)}</td><td style="padding:3px 0 3px 10px;"><strong>${escHtml(formatMoney(sale.totalCents))}</strong></td></tr>
      <tr><td style="padding:3px 0;color:#666;">Date</td><td style="padding:3px 0 3px 10px;">${escHtml(dateStr)}</td></tr>
    </table>
  </div>
</body>
</html>`
}

function buildReceiptEmailBodyText(sale: SaleRecord): string {
  const ev = sale.eventName.trim() || 'Événement'
  const asso = sale.associationName.trim() || 'Association'
  const ord =
    sale.orderNumber != null && sale.orderNumber > 0
      ? formatOrderNo(sale.orderNumber)
      : 'Sans numéro de commande'
  const dt = new Date(sale.at)
  const dateStr = dt.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const totalLabel = sale.kind === 'refund' ? 'Total remboursé' : 'Total'
  return [
    `Bonjour,`,
    ``,
    `${asso}`,
    `Événement : ${ev}`,
    ``,
    `Veuillez trouver en pièce jointe le ticket de caisse au format PDF.`,
    ``,
    `Récapitulatif :`,
    `- Référence : ${ord}`,
    `- ${totalLabel} : ${formatMoney(sale.totalCents)}`,
    `- Date : ${dateStr}`
  ].join('\n')
}

function logoMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function readLogoDataUrl(fileName: string | null): string | null {
  if (!fileName) return null
  const full = logoFullPath(fileName)
  if (!existsSync(full)) return null
  const buf = readFileSync(full)
  const mime = logoMime(extname(fileName))
  if (mime === 'image/svg+xml') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString('utf-8'))}`
  }
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** SMTP prêt pour l’envoi automatique du ticket récap (PDF). */
export function isEmailReceiptSmtpReady(data: AppPersistedData): boolean {
  const c = data.emailReceipt
  if (!c.enabled) return false
  if (!c.host.trim() || !c.fromAddress.trim()) return false
  return true
}

function createSmtpTransporter(c: AppPersistedData['emailReceipt']) {
  return nodemailer.createTransport({
    host: c.host.trim(),
    port: c.port,
    secure: c.secure,
    auth:
      c.user.trim() && c.password
        ? {
            user: c.user.trim(),
            pass: c.password
          }
        : undefined
  })
}

/** Vérifie la connexion au serveur ou envoie un message minimal de test. */
export async function testSmtpSettings(
  data: AppPersistedData,
  mode: 'verify' | 'send',
  testTo?: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const c = data.emailReceipt
  if (!c.enabled) {
    return { ok: false, error: 'Activez d’abord l’envoi SMTP.' }
  }
  if (!c.host.trim()) {
    return { ok: false, error: 'Indiquez le serveur SMTP.' }
  }
  const from = c.fromAddress.trim()
  if (!from || !from.includes('@')) {
    return { ok: false, error: 'Indiquez une adresse expéditrice valide (ex. tresorier@asso.fr ou Nom <tresorier@asso.fr>).' }
  }

  const transporter = createSmtpTransporter(c)

  if (mode === 'verify') {
    try {
      await transporter.verify()
      return { ok: true, message: 'Connexion SMTP acceptée par le serveur.' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg || 'Échec de la vérification SMTP.' }
    }
  }

  const dest = (testTo ?? '').trim() || from
  if (!dest.includes('@')) {
    return { ok: false, error: 'Adresse de destination invalide pour le test.' }
  }

  try {
    await transporter.sendMail({
      from,
      to: dest,
      subject: 'Test — Caisse Association Buvette',
      text: 'Ceci est un message de test. Si vous le recevez, l’envoi SMTP est correctement configuré.',
      html: '<p>Ceci est un <strong>message de test</strong>. Si vous le recevez, l’envoi SMTP est correctement configuré.</p>'
    })
    return {
      ok: true,
      message:
        dest === from
          ? `E-mail de test envoyé à l’expéditeur (${dest}).`
          : `E-mail de test envoyé à ${dest}.`
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'Envoi du message test impossible.' }
  }
}

export async function sendSummaryReceiptEmail(
  data: AppPersistedData,
  sale: SaleRecord,
  to: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isEmailReceiptSmtpReady(data)) {
    return { ok: false, error: 'E-mail non configuré (menu E-mail tickets).' }
  }
  const dest = to.trim()
  if (!dest || !dest.includes('@')) {
    return { ok: false, error: 'Adresse e-mail invalide.' }
  }
  const c = data.emailReceipt
  const legal = receiptLegalInfoFromAssociation(data.association)
  const logoDataUrl = readLogoDataUrl(data.association.logoFile)
  const ticketHtml = buildSummaryReceiptDocument(sale, logoDataUrl, legal, {
    logoWidthPercent: clampReceiptLogoWidthPercent(data.association.receiptLogoWidthPercent)
  })
  const pdfResult = await htmlDocumentToPdf(ticketHtml)
  if (!pdfResult.ok) {
    return { ok: false, error: pdfResult.error || 'Génération du PDF impossible.' }
  }
  const bodyHtml = buildReceiptEmailBodyHtml(sale, logoDataUrl)
  const bodyText = buildReceiptEmailBodyText(sale)
  const transporter = createSmtpTransporter(c)

  const ordSubject =
    sale.orderNumber != null && sale.orderNumber > 0
      ? formatOrderLabel(sale.orderNumber)
      : 'Ticket caisse'
  const evShort = sale.eventName.trim() || 'Événement'
  const assoShort = sale.associationName.trim() || 'Caisse'
  const subject = `${ordSubject} — ${evShort} — ${assoShort}`

  const attachName = `${safeAttachmentBaseName(sale)}.pdf`

  try {
    await transporter.sendMail({
      from: c.fromAddress.trim(),
      to: dest,
      subject,
      text: bodyText,
      html: bodyHtml,
      attachments: [
        {
          filename: attachName,
          content: pdfResult.pdf,
          contentType: 'application/pdf',
          contentDisposition: 'attachment'
        }
      ]
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'Envoi impossible.' }
  }
}
