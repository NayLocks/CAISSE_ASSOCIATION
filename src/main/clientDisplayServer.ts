import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import type { AddressInfo } from 'net'
import type { ClientDisplayState } from '../shared/clientDisplay'
import { defaultClientDisplayState } from '../shared/clientDisplay'

/** Données panier / paiement poussées par la caisse (hors modes fermé / déconnecté) */
let liveState: ClientDisplayState = defaultClientDisplayState()
/** Session déverrouillée (PIN saisi, pas sur écran verrouillage) */
let sessionOpen = false
/** Affichage distant autorisé depuis la caisse (sinon « Écran déconnecté ») */
let remoteEnabled = true

let httpServer: Server | null = null
let boundPort = 0
const sseClients = new Set<ServerResponse>()

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function getEffectiveState(): ClientDisplayState {
  if (!sessionOpen) {
    return {
      mode: 'closed',
      associationName: liveState.associationName,
      associationNumero: liveState.associationNumero,
      eventName: null,
      refundMode: false,
      phase: 'welcome',
      lines: [],
      totalCents: 0,
      logoDataUrl: liveState.logoDataUrl ?? null,
      clientUiTheme: liveState.clientUiTheme ?? 'light'
    }
  }
  if (!remoteEnabled) {
    return {
      mode: 'disconnected',
      associationName: liveState.associationName,
      associationNumero: liveState.associationNumero,
      eventName: null,
      refundMode: false,
      phase: 'welcome',
      lines: [],
      totalCents: 0,
      logoDataUrl: liveState.logoDataUrl ?? null,
      clientUiTheme: liveState.clientUiTheme ?? 'light'
    }
  }
  return { ...liveState, mode: 'live' }
}

function broadcast(): void {
  const payload = JSON.stringify(getEffectiveState())
  const chunk = `data: ${payload}\n\n`
  for (const res of sseClients) {
    try {
      res.write(chunk)
    } catch {
      sseClients.delete(res)
    }
  }
}

export function setClientDisplayState(next: ClientDisplayState): void {
  const { mode: _m, ...rest } = next
  liveState = { ...rest, mode: undefined }
  broadcast()
}

/** Met à jour uniquement le thème poussé par la caisse (ex. depuis Apparence sans être sur la caisse). */
export function patchClientDisplayTheme(theme: 'dark' | 'light'): void {
  liveState = { ...liveState, clientUiTheme: theme }
  broadcast()
}

export function setClientDisplaySessionOpen(open: boolean): void {
  sessionOpen = open
  broadcast()
}

export function setClientDisplayRemoteEnabled(enabled: boolean): void {
  remoteEnabled = enabled
  broadcast()
}

export function getClientDisplayFlags(): {
  remoteEnabled: boolean
  sessionOpen: boolean
} {
  return { remoteEnabled, sessionOpen }
}

export function getClientDisplayState(): ClientDisplayState {
  return getEffectiveState()
}

function listLanUrls(port: number): string[] {
  const out: string[] = []
  const ifs = networkInterfaces()
  for (const addrs of Object.values(ifs)) {
    if (!addrs) continue
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        out.push(`http://${a.address}:${port}`)
      }
    }
  }
  return [...new Set(out)].sort()
}

export function getClientDisplayInfo(): { port: number; urls: string[] } {
  if (!httpServer || boundPort <= 0) return { port: 0, urls: [] }
  const urls = [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`, ...listLanUrls(boundPort)]
  return { port: boundPort, urls: [...new Set(urls)] }
}

function buildHtml(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Affichage client</title>
<script>document.documentElement.setAttribute('data-theme','light')</script>
<style>
  :root {
    --bg: #0a0c10;
    --surface: #12161c;
    --text: #e8edf5;
    --muted: #8b96a8;
    --accent: #f4b942;
    --ok: #4ade80;
    --pay: #60a5fa;
  }
  * { box-sizing: border-box; }
  html {
    height: 100%;
    -webkit-text-size-adjust: 100%;
  }
  body {
    margin: 0;
    min-height: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    max-height: 100dvh;
    background: var(--bg);
    color: var(--text);
    font-family: system-ui, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    max-width: 100vw;
    overflow: hidden;
    padding:
      max(clamp(8px, 2vmin, 28px), env(safe-area-inset-top, 0px))
      max(clamp(10px, 3vw, 28px), env(safe-area-inset-right, 0px))
      max(clamp(8px, 2vmin, 28px), env(safe-area-inset-bottom, 0px))
      max(clamp(10px, 3vw, 28px), env(safe-area-inset-left, 0px));
  }
  .wrap {
    width: 100%;
    max-width: min(960px, 100%);
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .card {
    background: linear-gradient(165deg, rgba(244,185,66,0.06), transparent 40%), var(--surface);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: clamp(12px, 2.5vmin, 20px);
    padding: clamp(12px, 3.5vmin, 36px);
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #body > .lines {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr;
    grid-auto-rows: min-content;
    align-content: start;
    align-items: start;
  }
  #body > .lines.lines--cols {
    grid-template-columns: 1fr 1fr;
    column-gap: clamp(0.4rem, 1.5vw, 0.85rem);
  }
  .head.head--compact {
    margin-bottom: clamp(0.35rem, 1vmin, 0.75rem);
  }
  .head.head--compact .logo {
    max-height: clamp(56px, 14vw, 160px);
    margin-bottom: clamp(0.25rem, 1vmin, 0.5rem);
  }
  .head.head--compact .asso {
    font-size: clamp(0.95rem, 2.8vw, 1.35rem);
  }
  .lines.lines--dense .line {
    padding: 0.45rem 0;
    font-size: clamp(0.88rem, 2.2vw, 1.12rem);
  }
  .lines.lines--dense .emoji {
    font-size: clamp(1.15rem, 3.2vw, 1.55rem);
    width: 2.1rem;
  }
  .lines.lines--tiny .line {
    padding: 0.32rem 0;
    font-size: clamp(0.78rem, 1.85vw, 0.98rem);
  }
  .lines.lines--tiny .emoji {
    font-size: clamp(0.95rem, 2.6vw, 1.2rem);
    width: 1.75rem;
  }
  .lines.lines--tiny .sub {
    font-size: 0.78em;
  }
  .lines.lines--micro .line {
    padding: 0.22rem 0;
    font-size: clamp(0.68rem, 1.55vw, 0.85rem);
  }
  .lines.lines--micro .emoji {
    font-size: clamp(0.82rem, 2.1vw, 1rem);
    width: 1.45rem;
  }
  #body > .total-bar { flex-shrink: 0; }
  #body > .welcome-msg {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    margin: 0;
    padding: 1rem 0;
  }
  .head {
    flex-shrink: 0;
    text-align: center;
    margin-bottom: clamp(0.75rem, 2vmin, 1.25rem);
  }
  .logo {
    max-height: clamp(120px, 28vw, 280px);
    max-width: min(100%, 420px);
    width: auto;
    height: auto;
    object-fit: contain;
    margin-bottom: clamp(0.5rem, 2vmin, 1rem);
    display: block;
    margin-inline: auto;
  }
  .asso { font-size: clamp(1.1rem, 3.5vw, 1.75rem); font-weight: 800; letter-spacing: 0.02em; }
  .asso-num { font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem; }
  .welcome-msg { color: var(--muted); font-size: clamp(1rem, min(2.8vw, 3.2vmin), 1.35rem); line-height: 1.5; }
  .client-msg-full {
    text-align: center;
    padding: clamp(1.5rem, 6vmin, 4rem) clamp(0.75rem, 3vw, 1rem);
    flex: 1 1 auto;
    min-height: min(48dvh, 420px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .client-msg-full h2 { font-size: clamp(1.4rem, 4.5vw, 2.35rem); font-weight: 800; margin: 0; line-height: 1.35; color: var(--text); }
  .client-msg-full .sub { color: var(--muted); margin-top: 1rem; font-size: clamp(0.95rem, 2.5vw, 1.15rem); max-width: 26rem; line-height: 1.45; }
  .lines { margin-top: 1rem; }
  .line {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-size: clamp(1rem, 2.8vw, 1.35rem);
  }
  .line:last-child { border-bottom: none; }
  .emoji { font-size: clamp(1.5rem, 4vw, 2rem); flex-shrink: 0; width: 2.5rem; text-align: center; }
  .meta { flex: 1; min-width: 0; }
  .name { font-weight: 700; }
  .sub { font-size: 0.82em; color: var(--muted); }
  .sub.sub--note { font-size: 0.76em; margin-top: 0.12rem; line-height: 1.25; color: rgba(255,255,255,0.55); }
  .cart-recap-block {
    margin: 0.75rem 0 0;
    padding: 0.55rem 0.65rem;
    border: 2px solid rgba(255,255,255,0.16);
    border-radius: 10px;
    font-size: clamp(0.72rem, 2.1vw, 0.9rem);
    line-height: 1.38;
  }
  .cart-recap-line { text-align: center; color: rgba(255,255,255,0.72); }
  .cart-recap-line + .cart-recap-line { margin-top: 0.35rem; }
  .line-total { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total-bar {
    margin-top: 1.5rem; padding-top: 1rem;
    border-top: 2px solid rgba(244,185,66,0.35);
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 1rem;
  }
  .total-label { font-size: clamp(1rem, 2.5vw, 1.2rem); color: var(--muted); }
  .total-amt { font-size: clamp(1.75rem, 5vw, 2.75rem); font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; background: rgba(248,113,113,0.15); color: #fecaca; font-size: 0.75rem; font-weight: 700; margin-left: 0.35rem; vertical-align: middle; }
  .overlay {
    position: absolute; inset: 0; border-radius: inherit;
    display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start;
    text-align: center;
    padding: clamp(8px, 2.5vmin, 20px);
    background: rgba(6,8,12,0.92);
    backdrop-filter: blur(8px);
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .overlay-pay-wrap {
    width: 100%;
    max-width: min(26rem, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    padding: 0 min(4px, 1vw);
  }
  .overlay.pay { border: 2px solid rgba(96,165,250,0.4); }
  .overlay.thanks {
    border: 2px solid rgba(74,222,128,0.35);
    align-items: center;
    justify-content: center;
  }
  .overlay h2 { margin: 0 0 0.5rem; font-size: clamp(1.35rem, 4.2vw, 2rem); line-height: 1.2; }
  .overlay .big { font-size: clamp(2rem, 7vw, 3.5rem); font-weight: 800; color: var(--ok); margin: 0.5rem 0; }
  .overlay .order { font-family: ui-monospace, monospace; font-size: clamp(1rem, 3vw, 1.35rem); color: var(--accent); margin-top: 0.75rem; }
  .pay-client-sub { color: #94a3b8; font-size: clamp(0.95rem, 2.8vw, 1.15rem); margin: 0.5rem 0 1rem; line-height: 1.45; }
  .pay-client-total { font-size: clamp(1.5rem, 5vw, 2.25rem); font-weight: 800; color: var(--accent); text-align: center; margin-top: 0.5rem; font-variant-numeric: tabular-nums; }
  .pay-client-total.muted { color: #64748b; }
  .pay-client-rows { width: 100%; max-width: 28rem; margin: 0.5rem auto 0; text-align: left; }
  .pay-client-row { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 0.5rem 0; font-size: clamp(0.95rem, 2.6vw, 1.12rem); border-bottom: 1px solid rgba(255,255,255,0.07); }
  .pay-client-row:last-child { border-bottom: none; }
  .pay-client-row strong { font-variant-numeric: tabular-nums; }
  .pay-client-row.highlight strong { font-size: clamp(1.15rem, 3.8vw, 1.65rem); }
  .pay-client-row.accent strong { color: #4ade80; }
  .pay-client-row.warn strong { color: #fbbf24; }
  .pay-client-row.muted { color: #94a3b8; font-size: 0.92em; }
  .pay-card-due {
    margin-top: 0.6rem;
    padding: clamp(0.85rem, 3.2vmin, 1.4rem) clamp(0.6rem, 2.2vw, 1.1rem);
    border-radius: clamp(12px, 3vmin, 20px);
    background: rgba(251, 191, 36, 0.11);
    border: 2px solid rgba(251, 191, 36, 0.5);
    width: 100%;
    max-width: min(26rem, 100%);
    box-sizing: border-box;
  }
  .pay-card-due-label {
    font-size: clamp(1.05rem, 3.2vw, 1.4rem);
    font-weight: 800;
    color: #fde68a;
    margin-bottom: 0.4rem;
    letter-spacing: 0.02em;
  }
  .pay-card-due-amt {
    font-size: clamp(2.5rem, min(13vw, 15vmin), 4.25rem);
    font-weight: 900;
    color: #fbbf24;
    font-variant-numeric: tabular-nums;
    line-height: 1.08;
    letter-spacing: -0.03em;
    text-shadow: 0 2px 24px rgba(251, 191, 36, 0.25);
  }
  .total-bar--card-due {
    margin-top: 1.75rem;
    padding-top: 1.15rem;
    border-top-width: 3px;
    align-items: center;
  }
  .total-bar--card-due .total-label {
    font-size: clamp(1.05rem, 2.9vw, 1.35rem);
    font-weight: 700;
    max-width: 42%;
    line-height: 1.25;
  }
  .total-bar--card-due .total-amt {
    font-size: clamp(2.35rem, min(11vw, 13vmin), 4rem);
    font-weight: 900;
    letter-spacing: -0.03em;
  }
  .pay-choose-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(8px, 2vmin, 12px);
    width: 100%;
    max-width: 100%;
    margin: 0.75rem 0 0;
    box-sizing: border-box;
  }
  @media (max-width: 380px) {
    .pay-choose-grid { grid-template-columns: 1fr; }
  }
  .pay-choose-opt {
    min-width: 0;
    min-height: clamp(104px, 22vmin, 168px);
    border: 2px solid rgba(255,255,255,0.12);
    border-radius: clamp(10px, 2vmin, 14px);
    background: rgba(255,255,255,0.05);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(8px, 2vmin, 12px) clamp(6px, 1.5vmin, 10px);
    box-sizing: border-box;
  }
  .pay-choose-opt.cash { border-color: rgba(74,222,128,0.45); background: rgba(74,222,128,0.08); }
  .pay-choose-opt.card { border-color: rgba(96,165,250,0.5); background: rgba(96,165,250,0.09); }
  .pay-tile-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
  }
  .pay-tile-ico {
    font-size: clamp(1.75rem, min(9vw, 12vmin), 3.25rem);
    line-height: 1;
    display: block;
  }
  .pay-tile-text {
    font-weight: 800;
    font-size: clamp(0.85rem, min(2.8vw, 3.5vmin), 1.2rem);
    letter-spacing: 0.02em;
  }
  .pay-step-ico {
    font-size: clamp(1.75rem, min(7vw, 10vmin), 2.75rem);
    line-height: 1;
    margin-bottom: 0.25rem;
    display: block;
  }
  .conn {
    position: fixed;
    bottom: max(8px, env(safe-area-inset-bottom, 0px));
    right: max(10px, env(safe-area-inset-right, 0px));
    font-size: clamp(10px, 2.5vmin, 11px);
    color: #555;
    z-index: 10;
  }
  .conn.ok { color: #3f6; }
  .conn.err { color: #f66; }
  html[data-theme="light"] {
    --bg: #eef1f7;
    --surface: #ffffff;
    --text: #0f172a;
    --muted: #64748b;
    --accent: #b45309;
    --ok: #15803d;
    --pay: #2563eb;
  }
  html[data-theme="light"] .card {
    border-color: rgba(15, 23, 42, 0.1);
    background: linear-gradient(165deg, rgba(244, 185, 66, 0.1), transparent 40%), var(--surface);
  }
  html[data-theme="light"] .line {
    border-bottom-color: rgba(15, 23, 42, 0.08);
  }
  html[data-theme="light"] .sub.sub--note {
    color: #64748b;
  }
  html[data-theme="light"] .overlay {
    background: rgba(255, 255, 255, 0.94);
  }
  html[data-theme="light"] .pill {
    background: rgba(220, 38, 38, 0.12);
    color: #b91c1c;
  }
  html[data-theme="light"] .pay-client-sub {
    color: var(--muted);
  }
  html[data-theme="light"] .pay-client-total.muted {
    color: var(--muted);
  }
  html[data-theme="light"] .pay-client-row {
    border-bottom-color: rgba(15, 23, 42, 0.08);
  }
  html[data-theme="light"] .pay-choose-opt {
    border-color: rgba(15, 23, 42, 0.12);
    background: rgba(15, 23, 42, 0.04);
  }
  html[data-theme="light"] .pay-choose-opt.cash {
    border-color: rgba(22, 163, 74, 0.45);
    background: rgba(22, 163, 74, 0.1);
  }
  html[data-theme="light"] .pay-choose-opt.card {
    border-color: rgba(37, 99, 235, 0.45);
    background: rgba(37, 99, 235, 0.08);
  }
  html[data-theme="light"] .total-bar {
    border-top-color: rgba(180, 83, 9, 0.35);
  }
  html[data-theme="light"] .pay-card-due {
    background: rgba(180, 83, 9, 0.1);
    border-color: rgba(180, 83, 9, 0.45);
  }
  html[data-theme="light"] .pay-card-due-label {
    color: #92400e;
  }
  html[data-theme="light"] .pay-card-due-amt {
    color: var(--accent);
    text-shadow: none;
  }
  html[data-theme="light"] .conn {
    color: #64748b;
  }
  html[data-theme="light"] .cart-recap-block {
    border-color: rgba(15, 23, 42, 0.14);
    background: rgba(15, 23, 42, 0.035);
  }
  html[data-theme="light"] .cart-recap-line {
    color: var(--muted);
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card" id="card">
      <div class="head" id="head">
        <img class="logo" id="logo" alt="" hidden />
        <div class="asso" id="asso"></div>
        <div class="asso-num" id="assoNum"></div>
      </div>
      <div id="body"></div>
    </div>
  </div>
  <div class="conn" id="conn">Connexion…</div>
<script>
(function () {
  function applyDocTheme(s) {
    var t = s && s.clientUiTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  }

  var card = document.getElementById('card');
  var head = document.getElementById('head');
  var logoEl = document.getElementById('logo');
  var assoEl = document.getElementById('asso');
  var assoNumEl = document.getElementById('assoNum');
  var bodyEl = document.getElementById('body');
  var connEl = document.getElementById('conn');

  function fmtMoney(cents) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  }

  function esc(t) {
    if (t == null || t === '') return '';
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildCartRecapHtml(s) {
    var c = s.cartDiscountSummary;
    if (!c) return '';
    var pctPart =
      typeof c.percent === 'number' && c.percent > 0 ? ' (' + c.percent + ' %)' : '';
    return (
      '<div class="cart-recap-block">' +
      '<div class="cart-recap-line">Sous-total (lignes) : ' +
      fmtMoney(c.linesSubtotalCents) +
      '</div>' +
      '<div class="cart-recap-line">Montant remise globale' +
      esc(pctPart) +
      ' : ' +
      fmtMoney(c.discountAmountCents) +
      '</div>' +
      (c.reason ? '<div class="cart-recap-line">' + esc(c.reason) + '</div>' : '') +
      '</div>'
    );
  }

  function buildPaymentOverlayInner(s) {
    var pd = s.paymentDetail;
    var rf = s.refundMode;
    if (!pd || pd.kind === 'choose') {
      var titleChoose = rf ? 'Remboursement' : 'Paiement';
      var subChoose = rf
        ? 'Indiquez le mode utilisé sur la caisse.'
        : 'Choisissez le mode de règlement sur la caisse.';
      return (
        '<div class="overlay-pay-wrap">' +
        buildCartRecapHtml(s) +
        '<h2>' + titleChoose + '</h2>' +
        '<p class="pay-client-sub">' + esc(subChoose) + '</p>' +
        '<div class="pay-choose-grid">' +
        '<div class="pay-choose-opt cash">' +
        '<div class="pay-tile-inner">' +
        '<span class="pay-tile-ico" aria-hidden="true">💶</span>' +
        '<span class="pay-tile-text">Espèces</span>' +
        '</div></div>' +
        '<div class="pay-choose-opt card">' +
        '<div class="pay-tile-inner">' +
        '<span class="pay-tile-ico" aria-hidden="true">💳</span>' +
        '<span class="pay-tile-text">Carte</span>' +
        '</div></div>' +
        '</div>' +
        '<div class="pay-client-total">' + fmtMoney(s.totalCents) + '</div>' +
        '</div>'
      );
    }
    if (pd.kind === 'cash') {
      var encLabel = rf ? 'Remboursé (espèces)' : 'Encaissé (billets et pièces)';
      var totalLabel = rf ? 'Total à rembourser' : 'Total à payer';
      var html =
        '<div class="overlay-pay-wrap">' +
        buildCartRecapHtml(s) +
        '<span class="pay-step-ico" aria-hidden="true">💶</span>' +
        '<h2 style="margin-top:0">' +
        (rf ? 'Remboursement en espèces' : 'Paiement en espèces') +
        '</h2>' +
        '<div class="pay-client-rows">' +
        '<div class="pay-client-row"><span>' + totalLabel + '</span><strong>' + fmtMoney(pd.totalCents) + '</strong></div>' +
        '<div class="pay-client-row highlight"><span>' + encLabel + '</span><strong>' + fmtMoney(pd.cashGivenCents) + '</strong></div>';
      if (pd.changeCents > 0 && pd.canValidateCash) {
        var renduLabel = rf ? 'Reprise monnaie' : 'Rendu monnaie';
        html += '<div class="pay-client-row accent"><span>' + renduLabel + '</span><strong>' + fmtMoney(pd.changeCents) + '</strong></div>';
      }
      if (pd.canMixed) {
        html += '<div class="pay-client-row warn"><span>' + (rf ? 'Reste à rembourser (carte)' : 'Reste à payer (carte)') + '</span><strong>' + fmtMoney(pd.shortCents) + '</strong></div>';
      }
      if (!pd.canValidateCash && !pd.canMixed && pd.cashGivenCents > 0 && pd.shortCents > 0) {
        html += '<div class="pay-client-row muted"><span>' + (rf ? 'Reste à rembourser' : 'Manque') + '</span><strong>' + fmtMoney(pd.shortCents) + '</strong></div>';
      }
      html += '</div></div>';
      return html;
    }
    if (pd.kind === 'card') {
      var sub = 'Paiement par carte bancaire en cours.';
      if (pd.sumupActive) {
        if (pd.sumupPhase === 'creating') sub = 'Préparation du paiement sécurisé (SumUp)…';
        else if (pd.sumupPhase === 'waiting') {
          sub = pd.terminalAuto
            ? 'Présentez ou approchez votre carte sur le terminal.'
            : 'Finalisez le paiement (page SumUp ou navigateur).';
        } else if (pd.sumupPhase === 'error') {
          sub = 'Problème de connexion au paiement. Le personnel valide à la caisse.';
        } else {
          sub = 'Paiement par carte en cours.';
        }
      }
      var charge =
        typeof pd.cardChargeCents === 'number' && pd.cardChargeCents >= 0 ? pd.cardChargeCents : pd.totalCents;
      var mixed = pd.totalCents > 0 && charge !== pd.totalCents;
      var cardDueLbl = rf ? 'Reste à rembourser (carte)' : 'Reste à payer (carte)';
      var amtBlock = mixed
        ? '<div class="pay-client-rows">' +
          '<div class="pay-client-row muted"><span>Total commande</span><strong>' +
          fmtMoney(pd.totalCents) +
          '</strong></div></div>' +
          '<div class="pay-card-due" role="status">' +
          '<div class="pay-card-due-label">' +
          esc(cardDueLbl) +
          '</div>' +
          '<div class="pay-card-due-amt">' +
          fmtMoney(charge) +
          '</div></div>'
        : '<div class="pay-client-total muted">' + fmtMoney(charge) + '</div>';
      return (
        '<div class="overlay-pay-wrap">' +
        buildCartRecapHtml(s) +
        '<span class="pay-step-ico" aria-hidden="true">💳</span>' +
        '<h2 style="margin-top:0">Paiement par carte</h2>' +
        '<p class="pay-client-sub">' + esc(sub) + '</p>' +
        amtBlock +
        '</div>'
      );
    }
    return '<h2>Paiement en cours</h2><p class="pay-client-sub">Merci de patienter.</p>';
  }

  function render(s) {
    applyDocTheme(s);
    var mode = s.mode || 'live';
    if (mode === 'closed' || mode === 'disconnected') {
      head.style.display = 'none';
      head.className = 'head';
      bodyEl.innerHTML =
        mode === 'closed'
          ? '<div class="client-msg-full"><h2>Nous sommes fermés pour le moment</h2></div>'
          : '<div class="client-msg-full"><h2>Écran déconnecté</h2><p class="sub">Affichage distant coupé depuis la caisse.</p></div>';
      document.querySelectorAll('.dyn-overlay').forEach(function (n) {
        n.remove();
      });
      return;
    }
    head.style.display = '';

    assoEl.textContent = s.associationName || 'Caisse';
    if (s.associationNumero) {
      assoNumEl.textContent = 'N° ' + s.associationNumero;
      assoNumEl.style.display = '';
    } else {
      assoNumEl.textContent = '';
      assoNumEl.style.display = 'none';
    }
    if (s.logoDataUrl) {
      logoEl.src = s.logoDataUrl;
      logoEl.hidden = false;
    } else {
      logoEl.removeAttribute('src');
      logoEl.hidden = true;
    }
    var refund = s.refundMode ? '<span class="pill">Remboursement</span>' : '';
    bodyEl.innerHTML = '';

    document.querySelectorAll('.dyn-overlay').forEach(function (n) { n.remove(); });

    if (s.phase === 'welcome' && (!s.lines || !s.lines.length)) {
      head.className = 'head';
      bodyEl.innerHTML = '<p class="welcome-msg">En attente de commande.</p>';
      return;
    }

    if (s.phase === 'thanks') {
      head.className = 'head';
      var ov = document.createElement('div');
      ov.className = 'overlay thanks dyn-overlay';
      ov.innerHTML =
        '<h2>' + esc(s.thanksTitle || 'Merci !') + '</h2>' +
        (s.thanksDetail ? '<div class="big">' + esc(s.thanksDetail) + '</div>' : '') +
        (s.orderNumberLabel ? '<div class="order">' + esc(s.orderNumberLabel) + '</div>' : '');
      card.appendChild(ov);
      return;
    }

    if (s.phase === 'payment') {
      var ovp = document.createElement('div');
      ovp.className = 'overlay pay dyn-overlay';
      ovp.innerHTML = buildPaymentOverlayInner(s);
      card.appendChild(ovp);
    }

    if (s.lines && s.lines.length) {
      var n = s.lines.length;
      var twoCol = n >= 9;
      var dense = n >= 6;
      var tiny = n >= 14;
      var micro = n >= 22;
      head.className = 'head' + (n >= 8 ? ' head--compact' : '');
      var lines = document.createElement('div');
      lines.className =
        'lines' +
        (twoCol ? ' lines--cols' : '') +
        (dense ? ' lines--dense' : '') +
        (tiny ? ' lines--tiny' : '') +
        (micro ? ' lines--micro' : '');
      s.lines.forEach(function (l) {
        var row = document.createElement('div');
        row.className = 'line';
        var detailLines = l.lineDetailLines && l.lineDetailLines.length ? l.lineDetailLines : null;
        var subNotes = '';
        if (detailLines) {
          for (var di = 0; di < detailLines.length; di++) {
            subNotes += '<div class="sub sub--note">' + esc(detailLines[di]) + '</div>';
          }
        } else if (l.lineNote) {
          subNotes = '<div class="sub sub--note">' + esc(l.lineNote) + '</div>';
        }
        row.innerHTML =
          '<span class="emoji">' + esc(l.emoji || '') + '</span>' +
          '<div class="meta">' +
            '<div class="name">' + esc(l.name || '') + ' ' + refund + '</div>' +
            '<div class="sub">' + fmtMoney(l.unitCents) + ' × ' + l.qty + '</div>' +
            subNotes +
          '</div>' +
          '<div class="line-total">' + fmtMoney(l.lineTotalCents) + '</div>';
        lines.appendChild(row);
      });
      bodyEl.appendChild(lines);
      var bar = document.createElement('div');
      var barAmt = s.totalCents;
      var barLabel = s.refundMode ? 'Total à rembourser' : 'Total';
      var cardDueBar = false;
      /**
       * Paiement mixte : pendant l’étape carte, sumUp/caisse envoient le montant carte dans
       * paymentDetail.cardChargeCents ; le bandeau du bas affichait encore totalCents (panier complet).
       */
      if (s.phase === 'payment' && s.paymentDetail && s.paymentDetail.kind === 'card') {
        var pdcard = s.paymentDetail;
        var chargeBar =
          typeof pdcard.cardChargeCents === 'number' && pdcard.cardChargeCents >= 0
            ? pdcard.cardChargeCents
            : pdcard.totalCents;
        if (s.totalCents > 0 && chargeBar !== s.totalCents) {
          barAmt = chargeBar;
          barLabel = s.refundMode ? 'Reste à rembourser (carte)' : 'Reste à payer (carte)';
          cardDueBar = true;
        }
      }
      if (s.cartDiscountSummary) {
        var cds = s.cartDiscountSummary;
        var pctBar =
          typeof cds.percent === 'number' && cds.percent > 0 ? ' (' + cds.percent + ' %)' : '';
        var cartBox = document.createElement('div');
        cartBox.className = 'cart-recap-block';
        cartBox.innerHTML =
          '<div class="cart-recap-line">Sous-total (lignes) : ' +
          fmtMoney(cds.linesSubtotalCents) +
          '</div>' +
          '<div class="cart-recap-line">Montant remise globale' +
          esc(pctBar) +
          ' : ' +
          fmtMoney(cds.discountAmountCents) +
          '</div>' +
          (cds.reason ? '<div class="cart-recap-line">' + esc(cds.reason) + '</div>' : '');
        bodyEl.appendChild(cartBox);
      }
      bar.className = 'total-bar' + (cardDueBar ? ' total-bar--card-due' : '');
      bar.innerHTML =
        '<span class="total-label">' + esc(barLabel) + '</span>' +
        '<span class="total-amt">' + fmtMoney(barAmt) + '</span>';
      bodyEl.appendChild(bar);
    } else if (s.phase !== 'thanks') {
      head.className = 'head';
      bodyEl.innerHTML = '<p class="welcome-msg">En attente de commande.</p>';
    }
  }

  function apply(s) {
    try {
      render(s);
      connEl.textContent = 'Temps réel';
      connEl.className = 'conn ok';
    } catch (e) {
      connEl.textContent = 'Erreur affichage';
      connEl.className = 'conn err';
    }
  }

  fetch('/api/state')
    .then(function (r) { return r.json(); })
    .then(apply)
    .catch(function () {
      connEl.textContent = 'Hors ligne';
      connEl.className = 'conn err';
    });

  if (typeof EventSource !== 'undefined') {
    var es = new EventSource('/api/stream');
    es.onmessage = function (ev) {
      try {
        apply(JSON.parse(ev.data));
      } catch (e) {}
    };
    es.onerror = function () {
      connEl.textContent = 'Reconnexion…';
      connEl.className = 'conn err';
    };
  } else {
    setInterval(function () {
      fetch('/api/state')
        .then(function (r) { return r.json(); })
        .then(apply)
        .catch(function () {});
    }, 1500);
  }
})();
</script>
</body>
</html>`
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  const raw = req.url?.split('?')[0] ?? '/'

  if (raw === '/' || raw === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS })
    res.end(buildHtml())
    return
  }

  if (raw === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify(getEffectiveState()))
    return
  }

  if (raw === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...CORS
    })
    res.write(`data: ${JSON.stringify(getEffectiveState())}\n\n`)
    sseClients.add(res)
    req.on('close', () => {
      sseClients.delete(res)
    })
    return
  }

  res.writeHead(404, CORS)
  res.end()
}

function tryListen(s: Server, port: number): void {
  const onErr = (e: NodeJS.ErrnoException) => {
    s.removeListener('error', onErr)
    if (e.code === 'EADDRINUSE' && port < 3860) {
      tryListen(s, port + 1)
    } else {
      console.error('[client-display]', e.message)
    }
  }
  s.once('error', onErr)
  s.listen(port, '0.0.0.0', () => {
    s.removeListener('error', onErr)
    const addr = s.address() as AddressInfo
    boundPort = addr.port
    console.log(`[client-display] http://127.0.0.1:${boundPort}/`)
  })
}

export function startClientDisplayServer(): void {
  if (httpServer) return
  const s = createServer(handleRequest)
  httpServer = s
  tryListen(s, 3847)
}
