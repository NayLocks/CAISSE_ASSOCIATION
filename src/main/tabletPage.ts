/**
 * Page tablette : même disposition que la caisse (panier à droite) et flux de paiement complet.
 * Contenu servi par remoteCaisseServer (HTML + CSS + JS inline).
 */
import { loadPersistedData } from './stateStore.js'

export function buildTabletHtml(): string {
  const persist = loadPersistedData()
  const promptForTabletToken =
    !persist.remoteCaisseEnabled || persist.remoteCaisseTokenRequired !== false

  const css = `
:root{--bg-deep:#07090d;--bg:#0c1018;--surface:#141a24;--surface-hover:#1a2230;--border:rgba(255,255,255,.06);--text:#e8edf5;--muted:#8b96a8;--accent:#f4b942;--accent-dim:rgba(244,185,66,.15);--accent-glow:rgba(244,185,66,.35);--danger:#f87171;--radius:14px;--radius-sm:10px;--font:system-ui,sans-serif;--mono:ui-monospace,monospace}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font-family:var(--font)}
.tablet-app{min-height:100dvh;display:flex;flex-direction:column}
.tablet-top{padding:.5rem .75rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;font-size:.8rem;background:rgba(7,9,13,.5)}
.tablet-top select{max-width:min(100%,220px);padding:.35rem .5rem;border-radius:8px;background:var(--surface);color:var(--text);border:1px solid var(--border)}
.login-panel{max-width:420px;margin:2rem auto;padding:1.5rem;background:var(--surface);border-radius:var(--radius);border:1px solid var(--border)}
.login-panel input{width:100%;padding:.65rem;margin:.5rem 0;border-radius:8px;border:1px solid var(--border);background:#0a0f18;color:var(--text)}
.main{display:grid;grid-template-columns:1fr min(380px,42vw);gap:0;flex:1;min-height:0}
.panel-left{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--border)}
.tabs{display:flex;gap:.5rem;padding:.85rem 1rem;flex-wrap:wrap;background:rgba(7,9,13,.4)}
.tab{border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:.9rem;font-weight:600;padding:.55rem 1rem;border-radius:999px;cursor:pointer}
.tab.active{background:var(--accent-dim);border-color:rgba(244,185,66,.45);color:var(--accent)}
.grid-wrap{flex:1;overflow:auto;padding:.75rem 1rem 1.25rem}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.65rem}
.product-card{position:relative;border:1px solid var(--border);background:var(--surface);border-radius:var(--radius);padding:.85rem .65rem;cursor:pointer;text-align:center;color:inherit}
.product-card:disabled{opacity:.45;cursor:not-allowed}
.product-card .stock-badge{position:absolute;top:.35rem;right:.35rem;min-width:1.5rem;padding:.12rem .35rem;border-radius:6px;font-size:.72rem;font-weight:700;background:rgba(34,197,94,.2);border:1px solid rgba(34,197,94,.45)}
.product-card .emoji{font-size:2rem;margin-bottom:.35rem}
.pcard-imgwrap{width:100%;max-height:92px;display:flex;align-items:center;justify-content:center;margin-bottom:.35rem;overflow:hidden;border-radius:10px;background:rgba(0,0,0,.22)}
.pcard-img{max-width:100%;max-height:92px;object-fit:contain}
.product-card .name{font-size:.88rem;font-weight:600;margin-bottom:.35rem}
.product-card .price{font-family:var(--mono);font-size:.95rem;font-weight:600;color:var(--accent)}
.panel-cart{display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,rgba(10,13,18,.9),var(--bg-deep))}
.panel-cart-refund{border-left:3px solid rgba(248,113,113,.45);box-shadow:inset 0 3px 0 rgba(248,113,113,.22)}
.cart-head{padding:1rem 1.1rem .5rem;border-bottom:1px solid var(--border)}
.cart-head h2{margin:0;font-size:1.05rem}
.cart-head-top{display:flex;align-items:center;justify-content:space-between;gap:.55rem;margin-bottom:.45rem}
.btn-cart-clear{font-size:.78rem;padding:.45rem .6rem;white-space:nowrap}
.cart-options-strip{display:flex;flex-direction:column;gap:.5rem;margin:.15rem 0 .55rem}
.cart-option-card{display:flex;align-items:center;gap:.55rem;width:100%;margin:0;padding:.55rem .65rem;text-align:left;cursor:pointer;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:inherit;font:inherit;transition:border-color .15s,background .15s}
.cart-option-card.is-disabled,.cart-option-card:has(input:disabled){opacity:.45;cursor:not-allowed}
.cart-option-card:hover{border-color:rgba(148,163,184,.38);background:rgba(255,255,255,.07)}
.cart-option-card:has(input:disabled):hover{background:rgba(255,255,255,.04);border-color:var(--border)}
.cart-option-card:focus-within{outline:2px solid var(--accent);outline-offset:2px}
.cart-option-card input[type=checkbox]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.cart-option-card__icon{flex-shrink:0;width:2rem;height:2rem;display:grid;place-items:center;border-radius:8px;font-size:1rem;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.22)}
.cart-option-card__body{flex:1;min-width:0;display:flex;flex-direction:column;gap:.1rem}
.cart-option-card__title{font-size:.82rem;font-weight:700;color:var(--text)}
.cart-option-card__hint{font-size:.68rem;font-weight:500;color:var(--muted);line-height:1.32}
.cart-option-refund:has(#rfChk:checked){border-color:rgba(248,113,113,.55);background:linear-gradient(135deg,rgba(185,28,28,.14),rgba(127,29,29,.08));box-shadow:0 0 0 1px rgba(248,113,113,.12)}
.cart-option-refund:has(#rfChk:checked) .cart-option-card__icon{background:rgba(248,113,113,.2);border-color:rgba(248,113,113,.35)}
.cart-option-display:has(#remoteDisp:checked){border-color:rgba(56,189,248,.48);background:linear-gradient(135deg,rgba(14,165,233,.12),rgba(8,145,178,.06))}
.cart-option-display:has(#remoteDisp:checked) .cart-option-card__icon{background:rgba(56,189,248,.18);border-color:rgba(56,189,248,.34)}
.cart-switch{position:relative;flex-shrink:0;width:2.65rem;height:1.45rem}
.cart-switch__track{position:absolute;inset:0;border-radius:999px;background:rgba(100,116,139,.42)}
.cart-option-refund:has(#rfChk:checked) .cart-switch__track{background:rgba(239,68,68,.52)}
.cart-switch__thumb{position:absolute;top:3px;left:3px;width:1.15rem;height:1.15rem;border-radius:50%;background:#f8fafc;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .18s ease}
.cart-option-refund:has(#rfChk:checked) .cart-switch__thumb{transform:translateX(1.18rem)}
.cart-display-badge{flex-shrink:0;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:.25rem .45rem;border-radius:6px;background:rgba(100,116,139,.26);color:var(--muted);border:1px solid rgba(148,163,184,.25)}
.cart-option-display:has(#remoteDisp:checked) .cart-display-badge{background:rgba(16,185,129,.22);color:#6ee7b7;border-color:rgba(52,211,153,.42)}
.cart-meta-row{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;font-size:.78rem;color:var(--muted);margin-bottom:.1rem;line-height:1.35}
.cart-lines{flex:1;overflow:auto;padding:.65rem .85rem}
.empty-cart{text-align:center;padding:2rem;color:var(--muted)}
.line{display:grid;grid-template-columns:1fr auto;gap:.35rem .75rem;padding:.65rem .55rem;margin-bottom:.35rem;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border)}
.line-controls{display:flex;align-items:center;gap:.35rem;justify-self:end}
.qbtn{width:34px;height:34px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:1.1rem;cursor:pointer}
.qbtn.danger:hover{background:rgba(248,113,113,.15);color:var(--danger)}
.qty{font-family:var(--mono);font-weight:600;min-width:1.5rem;text-align:center}
.line-total{grid-column:1/-1;font-size:.85rem;color:var(--muted);text-align:right;font-family:var(--mono)}
.line-price-row{grid-column:1/-1;display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.15rem}
.btn-tiny{font-size:.72rem;padding:.28rem .5rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer}
.btn-tiny-ghost{background:transparent;color:var(--accent)}
.btn-remise-tiny{display:inline-flex;align-items:center;gap:.32rem;padding:.3rem .58rem!important;border-radius:999px!important;font-weight:600!important;font-size:.72rem!important;color:var(--text)!important;border:1px solid var(--border)!important;background:linear-gradient(180deg,var(--surface),rgba(12,16,24,.95))!important;cursor:pointer}
.btn-remise-tiny--active{border-color:rgba(244,185,66,.52)!important;background:var(--accent-dim)!important;color:var(--accent)!important}
.brt-i{display:grid;place-items:center;width:1.22rem;height:1.22rem;border-radius:7px;background:rgba(244,185,66,.16);color:var(--accent);font-size:.65rem;font-weight:800;font-family:var(--mono)}
.btn-remise-tiny--active .brt-i{background:rgba(244,185,66,.3)}
.brt-b{margin-left:.06rem;padding:.06rem .34rem;border-radius:999px;background:rgba(244,185,66,.22);font-family:var(--mono);font-size:.62rem;font-weight:700;color:#fde68a}
.btn-remise-tiny--active .brt-b{color:#fde68a}
.btn-benevole-tablet{width:100%;margin-top:.45rem;display:inline-flex;align-items:center;justify-content:center;gap:.42rem;padding:.52rem .85rem!important;border-radius:10px!important;font-weight:600!important;font-size:.86rem!important;border:1px solid rgba(52,211,153,.45)!important;background:linear-gradient(165deg,rgba(52,211,153,.24),rgba(16,185,129,.08))!important;color:#a7f3d0!important;cursor:pointer}
.btn-benevole-tablet:active{transform:scale(.99)}
.override-pill{font-size:.68rem;color:var(--accent);font-weight:600}
.cart-footer{padding:1rem 1.1rem;border-top:1px solid var(--border);background:rgba(7,9,13,.65)}
.total-row{display:flex;justify-content:space-between;margin-bottom:.85rem}
.total-row .amount{font-family:var(--mono);font-size:1.75rem;font-weight:700;color:var(--accent)}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}
.actions .btn-primary{grid-column:1/-1}
.actions.cart-pay-actions .btn-primary{grid-column:auto}
.actions.actions-single{grid-template-columns:1fr}
.btn{font-size:.95rem;font-weight:600;padding:.85rem 1rem;border-radius:var(--radius-sm);border:none;cursor:pointer}
.btn-primary{background:linear-gradient(135deg,var(--accent),#d97706);color:#1a1204}
.btn-secondary{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn-refund{background:linear-gradient(180deg,rgba(185,28,28,.55),rgba(127,29,29,.75));color:#fecaca}
.btn:disabled{opacity:.45;cursor:not-allowed}
.banner-warn,.banner-event-closed{margin:.5rem 1rem;padding:.65rem .85rem;border-radius:10px;font-size:.85rem}
.banner-warn{background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.35)}
.banner-event-closed{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:grid;place-items:center;z-index:100;padding:1rem}
.modal{width:min(420px,100%);background:var(--surface);border:1px solid var(--border);border-radius:calc(var(--radius) + 4px);padding:1.5rem;max-height:90dvh;overflow:auto}
.modal-pay{width:min(460px,100%)}
.modal h3{margin:0 0 .5rem}
.modal .sub{color:var(--muted);font-size:.9rem;margin:0 0 1rem}
.pay-total-line{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1rem}
.pay-mode-btns{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin:1rem 0}
.btn-pay-lg{padding:1.25rem;font-size:1.05rem}
.btn-block-pay{width:100%;margin-top:.5rem}
.denom-section{margin:.75rem 0}
.denom-title{font-size:.75rem;color:var(--muted);display:block;margin-bottom:.35rem}
.denom-grid{display:flex;flex-wrap:wrap;gap:.35rem}
.denom-chip{padding:.45rem .55rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-size:.85rem}
.pay-summary{margin:1rem 0;padding:.75rem;border-radius:10px;background:rgba(0,0,0,.2);border:1px solid var(--border)}
.pay-row{display:flex;justify-content:space-between;padding:.35rem 0;font-size:.9rem}
.pay-row.highlight{color:#4ade80}
.pay-row.warn{color:#fbbf24}
.sales-pick{max-height:160px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin:.5rem 0}
.sales-pick button{display:block;width:100%;text-align:left;padding:.5rem .65rem;border:none;border-bottom:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;font-size:.8rem}
.sales-pick button:hover{background:var(--surface-hover)}
.hidden{display:none!important}
.tablet-nav{display:flex;gap:.35rem;align-items:center;margin-right:.35rem}
.tablet-nav-btn{font-size:.78rem;padding:.42rem .85rem;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;font-weight:600}
.tablet-nav-btn.active{background:var(--accent-dim);border-color:rgba(244,185,66,.45);color:var(--accent)}
.hist-page{flex:1;display:flex;flex-direction:column;min-height:0;padding:.75rem 1rem 1.25rem;overflow:hidden}
.hist-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.65rem;gap:.5rem;flex-wrap:wrap}
.hist-title{margin:0;font-size:1.05rem;font-weight:700}
.hist-toolbar{display:flex;gap:.5rem}
.hist-table-wrap{flex:1;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-sm);background:rgba(7,9,13,.4)}
.hist-table{width:100%;border-collapse:collapse;font-size:.78rem}
.hist-table th,.hist-table td{padding:.5rem .55rem;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}
.hist-table th{color:var(--muted);font-weight:600;font-size:.72rem;position:sticky;top:0;background:var(--surface);z-index:1}
.hist-table tr.hist-click{cursor:pointer}
.hist-table tr.hist-click:active{background:var(--surface-hover)}
.hist-badge{display:inline-block;padding:.12rem .4rem;border-radius:6px;font-size:.68rem;font-weight:700}
.hist-badge-sale{background:rgba(34,197,94,.15);color:#86efac}
.hist-badge-ref{background:rgba(248,113,113,.18);color:#fecaca}
.hist-amt{font-weight:700}
.hist-prev{font-size:.68rem;margin-top:.2rem;line-height:1.25;max-height:2.6em;overflow:hidden}
.td-dt{white-space:nowrap;font-size:.72rem}
.hist-empty{text-align:center;color:var(--muted);padding:1.5rem!important}
.hist-detail-modal{max-width:min(480px,100%)}
.hist-d-lines{list-style:none;margin:0;padding:0;font-size:.85rem}
.hist-d-line{padding:.35rem 0;border-bottom:1px solid var(--border);display:flex;gap:.5rem}
.hist-lh{margin:.75rem 0 .35rem;font-size:.85rem}
.hist-pay-block{font-size:.82rem;margin:.5rem 0;line-height:1.4}
.hist-k{color:var(--muted);display:block;font-size:.72rem;margin-bottom:.15rem}
.hist-tot{display:flex;justify-content:space-between;margin:.75rem 0;padding-top:.65rem;border-top:1px solid var(--border);font-size:1rem;font-weight:700}
.hist-pr-btns{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0}
.hist-pr-btns-row{flex-wrap:nowrap;gap:.45rem}
.hist-pr-btns-row .btn{flex:1 1 0;min-width:0;font-size:.76rem;padding:.5rem .35rem;line-height:1.2}
.hist-email-modal{margin-top:.65rem;padding-top:.65rem;border-top:1px solid var(--border)}
.hist-email-lbl{display:block;font-size:.72rem;color:var(--muted);margin-bottom:.28rem;font-weight:600}
.hist-email-inp{width:100%;padding:.5rem;border-radius:8px;border:1px solid var(--border);box-sizing:border-box;margin-bottom:.45rem;background:var(--bg);color:var(--text);font-size:.88rem}
.hist-email-send{width:100%;margin-top:.15rem!important}
.hist-email-hint{font-size:.7rem;color:var(--muted);margin:.4rem 0 0;line-height:1.35}
.hist-email-msg{font-size:.78rem;font-weight:600;color:#86efac;margin-top:.4rem}
`

  const js = `
(function(){
var TABLET_PROMPT_FOR_TOKEN=${promptForTabletToken ? 'true' : 'false'};
var DENOMS=[{c:1,l:'1 c'},{c:2,l:'2 c'},{c:5,l:'5 c'},{c:10,l:'10 c'},{c:20,l:'20 c'},{c:50,l:'50 c'},{c:100,l:'1 €'},{c:200,l:'2 €'},{c:500,l:'5 €'},{c:1000,l:'10 €'},{c:2000,l:'20 €'},{c:5000,l:'50 €'},{c:10000,l:'100 €'},{c:20000,l:'200 €'}];
var STORAGE='caisseRemoteToken';
var B=null, M={quantities:{},refundMode:false,refundMaxByProduct:null,refundSourceMeta:null,priceOverrides:{},lineDiscountPct:{},lineDiscountReason:{},cartDiscountPct:0,cartDiscountReason:''};
var payOpen=false,payStep='choose',cashGiven=0,cashDetailExpanded=false,sumPoll=null,sumPhase='idle',sumErr='',checkoutId='',clientTxId='',flowOnline=false,sumupNextUrl='';
var tabletMain='caisse';
var histList=[];
var histLoading=false;
var cardTargetCents=null;
var cat='all',floatDraft='0',showFloat=false;

function el(id){return document.getElementById(id);}
function fmt(c){return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(c/100);}
function mirrorBaseCents(id,p){
  return M.priceOverrides[id]!=null?M.priceOverrides[id]:p.priceCents;
}
function mirrorDiscPct(id){
  var map=M.lineDiscountPct||{};
  var v=map[id];
  if(v==null||!isFinite(v)) return 0;
  return Math.min(100,Math.max(0,Math.round(v)));
}
function mirrorFinalUnit(id,p){
  var b=mirrorBaseCents(id,p), pct=mirrorDiscPct(id);
  return Math.max(0,Math.round(b*(1-pct/100)));
}
function auth(){var t=localStorage.getItem(STORAGE)||'';return{'Authorization':'Bearer '+t,'Content-Type':'application/json'};}
function productImgSrc(pid){
  var t=localStorage.getItem(STORAGE)||'';
  return '/api/remote/product-image?productId='+encodeURIComponent(pid)+'&token='+encodeURIComponent(t);
}
function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function makeUuid(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'){
    try{ return crypto.randomUUID(); }catch(e){}
  }
  if(typeof crypto!=='undefined'&&crypto.getRandomValues){
    var b=new Uint8Array(16); crypto.getRandomValues(b);
    b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
    var hex=[],i; for(i=0;i<16;i++) hex.push(('0'+b[i].toString(16)).slice(-2));
    var h=hex.join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
    var r=Math.random()*16|0,v=c==='x'?r:(r&3|8);
    return v.toString(16);
  });
}
function api(path,opts){opts=opts||{};return fetch(path,Object.assign({headers:auth()},opts)).then(function(r){
  return r.text().then(function(t){
    var j={}; try{ j=t?JSON.parse(t):{}; }catch(e){ throw new Error(t||r.status); }
    if(!r.ok) throw new Error(j.error||t||String(r.status));
    return j;
  });
});}

function defaultM(){return{quantities:{},refundMode:false,refundMaxByProduct:null,refundSourceMeta:null,priceOverrides:{},lineDiscountPct:{},lineDiscountReason:{},cartDiscountPct:0,cartDiscountReason:''};}

function syncMirror(cb){
  return api('/api/remote/mirror',{method:'POST',body:JSON.stringify(M)}).then(function(){if(cb)cb();});
}

function refresh(){
  return api('/api/remote/bootstrap').then(function(b){
    B=b;
    if(b.mirror){
      M=b.mirror;
      if(!M.lineDiscountPct) M.lineDiscountPct={};
      if(!M.lineDiscountReason) M.lineDiscountReason={};
      if(M.cartDiscountPct==null||!isFinite(M.cartDiscountPct)) M.cartDiscountPct=0;
      M.cartDiscountPct=Math.min(100,Math.max(0,Math.round(M.cartDiscountPct)));
      if(typeof M.cartDiscountReason!=='string') M.cartDiscountReason='';
    }
    if(tabletMain==='history'){ fetchHistory(); return; }
    render();
  });
}

function formatOrderDigits(n){
  if(!isFinite(n)||n<0) return '0';
  var s=String(Math.floor(n));
  return s.length>=3?s:s.padStart(3,'0');
}
function formatOrderNo(n){ return n>0?('Commande ' + formatOrderDigits(n)):'—'; }

function fetchHistory(){
  histLoading=true;
  render();
  api('/api/remote/sales?limit=120').then(function(r){
    histList=r.sales||[];
    histLoading=false;
    render();
  }).catch(function(e){
    histLoading=false;
    alert(e.message);
    render();
  });
}

function showHistDetailModal(s,pt){
  var o=document.createElement('div');
  o.className='overlay';
  var isRef=s.kind==='refund';
  var ord=s.orderNumber>0?s.orderNumber:0;
  var lines=(s.lines||[]).map(function(l){
    return '<li class="hist-d-line"><span class="hist-emoji">'+esc(l.emoji||'')+'</span><span>'+l.qty+' × '+esc(l.name)+' — '+fmt(l.unitCents)+' / u. — <strong>'+fmt(l.lineTotalCents)+'</strong></span></li>';
  }).join('');
  o.innerHTML='<div class="modal hist-detail-modal" onclick="event.stopPropagation()"><h3>'+(isRef?'Détail remboursement':'Détail vente')+'</h3>'+
    '<p class="sub mono">'+esc(formatOrderNo(ord))+' · '+esc(new Date(s.at).toLocaleString('fr-FR'))+'</p>'+
    '<p class="sub">'+esc(s.eventName||'')+' · '+esc(s.associationName||'')+'</p>'+
    '<div class="hist-pay-block"><span class="hist-k">Paiement</span>'+esc(pt)+'</div>'+
    '<h4 class="hist-lh">Lignes</h4><ul class="hist-d-lines">'+lines+'</ul>'+
    '<div class="hist-tot"><span>'+(isRef?'Total remboursé':'Total')+'</span><strong>'+(isRef?'−':'')+fmt(s.totalCents)+'</strong></div>'+
    '<div class="hist-pr-btns hist-pr-btns-row">'+
    (isRef?'':'<button type="button" class="btn btn-secondary" id="hprU">Tickets 1 par 1</button>')+
    '<button type="button" class="btn btn-secondary" id="hprS">Ticket de caisse (récap.)</button></div>'+
    '<div class="hist-email-modal">'+
    (B&&B.smtpReceiptConfigured?
      '<label class="hist-email-lbl" for="histEmailIn">E-mail client (ticket récap. PDF)</label>'+
      '<input type="email" id="histEmailIn" class="hist-email-inp" placeholder="ex. client@domaine.fr" autocomplete="email" />'+
      '<button type="button" class="btn btn-secondary hist-email-send" id="histEmailSend">Envoyer le ticket par e-mail</button>'+
      '<p class="hist-email-hint">Pièce jointe : ticket récapitulatif en PDF (identique à la caisse).</p>'
      :
      '<p class="hist-email-hint">Pour envoyer depuis la tablette, configurez le SMTP sur la caisse (menu E-mail tickets).</p>')+
    '<p class="hist-email-msg" id="histEmailMsg" style="display:none"></p></div>'+
    '<button type="button" class="btn btn-primary btn-block-pay" id="hprX">Fermer</button></div>';
  o.onclick=function(){ try{ document.body.removeChild(o); }catch(e){} };
  document.body.appendChild(o);
  function pr(k){
    if(!ord){ alert('Pas de numéro de commande pour cette vente.'); return; }
    api('/api/remote/print/receipt',{method:'POST',body:JSON.stringify({orderNumber:ord,kind:k})}).then(function(){
      alert(k==='summary'?'Ticket récapitulatif envoyé à l’imprimante.':'Tickets unitaires envoyés à l’imprimante.');
    }).catch(function(e){ alert(e.message); });
  }
  var u=el('hprU'); if(u) u.onclick=function(e){ e.stopPropagation(); pr('units'); };
  el('hprS').onclick=function(e){ e.stopPropagation(); pr('summary'); };
  el('hprX').onclick=function(e){ e.stopPropagation(); try{ document.body.removeChild(o); }catch(x){} };
  var msgEl=el('histEmailMsg');
  if(B&&B.smtpReceiptConfigured&&el('histEmailSend')){
    el('histEmailSend').onclick=function(e){
      e.stopPropagation();
      var to=(el('histEmailIn').value||'').trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){ alert('Adresse e-mail invalide.'); return; }
      if(!s.id){ alert('Identifiant de vente manquant.'); return; }
      api('/api/remote/email/receipt',{method:'POST',body:JSON.stringify({saleId:s.id,to:to})}).then(function(){
        if(msgEl){ msgEl.style.display='block'; msgEl.textContent='E-mail envoyé.'; }
      }).catch(function(err){ alert(err.message); });
    };
  }
}

function openHistoryDetail(saleId){
  api('/api/remote/sale?id='+encodeURIComponent(saleId)).then(function(r){
    showHistDetailModal(r.sale,r.paymentDetailText||'');
  }).catch(function(e){ alert(e.message); });
}

function wireTabletNav(){
  if(el('navCaisse')) el('navCaisse').onclick=function(){ tabletMain='caisse'; render(); };
  if(el('navHist')) el('navHist').onclick=function(){ tabletMain='history'; fetchHistory(); };
}

function linesFromMirror(){
  var ps=B.products||[], st=B.stock||{}, out=[];
  for(var id in M.quantities){
    var q=M.quantities[id]; if(q<=0) continue;
    var p=ps.find(function(x){return x.id===id;}); if(!p) continue;
    var unit=mirrorFinalUnit(id,p);
    out.push({p:p,q:q,unit:unit});
  }
  out.sort(function(a,b){return a.p.name.localeCompare(b.p.name,'fr');});
  return out;
}

function subtotalCents(){
  var t=0, L=linesFromMirror();
  for(var i=0;i<L.length;i++) t+=L[i].unit*L[i].q;
  return t;
}
function mirrorCartDiscPct(){
  var v=M.cartDiscountPct;
  if(v==null||!isFinite(v)) return 0;
  return Math.min(100,Math.max(0,Math.round(v)));
}
function totalCents(){
  var st=subtotalCents(), p=mirrorCartDiscPct();
  return Math.max(0,Math.round(st*(1-p/100)));
}

function cartLineCount(){
  var n=0;
  for(var id in M.quantities){ if((M.quantities[id]||0)>0) n++; }
  return n;
}

function pushClientDisplayPayment(){
  if(!B) return;
  if(!payOpen){
    api('/api/remote/client-display/payment',{method:'POST',body:JSON.stringify({open:false,paymentDetail:null})}).catch(function(){});
    return;
  }
  var tot=totalCents(), rf=M.refundMode;
  var det=null;
  if(payStep==='choose'){
    det={kind:'choose',totalCents:tot,refundMode:rf};
  } else if(payStep==='cash'){
    var chg=Math.max(0,cashGiven-tot), sh=Math.max(0,tot-cashGiven);
    var canC=cashGiven>=tot, canM=cashGiven>0&&cashGiven<tot;
    det={kind:'cash',totalCents:tot,refundMode:rf,cashGivenCents:cashGiven,changeCents:chg,shortCents:sh,canValidateCash:canC,canMixed:canM};
  } else if(payStep==='card'){
    var cc=cardTargetCents!=null?cardTargetCents:tot;
    det={kind:'card',totalCents:tot,cardChargeCents:cc,refundMode:rf,sumupPhase:sumPhase,sumupActive:!!(B.sumupConfigured&&!rf),terminalAuto:!!(B.sumupTerminalAuto&&!rf)};
  }
  if(det) api('/api/remote/client-display/payment',{method:'POST',body:JSON.stringify({open:true,paymentDetail:det})}).catch(function(){});
}

function stockAvail(p){
  if(!p.trackStock) return 1e9;
  var st=B.stock||{};
  return st[p.id]!=null?st[p.id]:0;
}

function setQty(id,qty){
  var p=(B.products||[]).find(function(x){return x.id===id;}); if(!p) return;
  var cap=M.refundMaxByProduct&&M.refundMaxByProduct[id]!=null?M.refundMaxByProduct[id]:null;
  var maxS=stockAvail(p);
  var next=Math.max(0,Math.floor(qty));
  if(M.refundMode&&cap!=null) next=Math.min(next,cap);
  if(!M.refundMode&&p.trackStock) next=Math.min(next,maxS);
  if(next<=0){
    delete M.quantities[id];
    delete M.priceOverrides[id];
    if(M.lineDiscountPct) delete M.lineDiscountPct[id];
    if(M.lineDiscountReason) delete M.lineDiscountReason[id];
  } else { M.quantities[id]=next; }
  syncMirror(render);
}

function addProduct(p){
  if(!B.canSell) return;
  var cur=M.quantities[p.id]||0;
  var cap=M.refundMaxByProduct&&M.refundMaxByProduct[p.id]!=null?M.refundMaxByProduct[p.id]:null;
  if(M.refundMode&&cap!=null&&cur+1>cap) return;
  if(!M.refundMode&&p.trackStock&&cur+1>stockAvail(p)) return;
  M.quantities[p.id]=cur+1;
  syncMirror(render);
}

function toggleRefund(){
  if(B&&B.eventClosed) return;
  if(!M.refundMode){
    var hasItems=Object.keys(M.quantities||{}).some(function(k){ return (M.quantities[k]||0)>0; });
    if(hasItems){
      M.refundMode=true;
      M.refundMaxByProduct=null;
      M.refundSourceMeta=null;
      syncMirror(render);
      return;
    }
  }
  M.refundMode=!M.refundMode;
  M.quantities={}; M.priceOverrides={}; M.lineDiscountPct={}; M.lineDiscountReason={}; M.cartDiscountPct=0; M.cartDiscountReason=''; M.refundMaxByProduct=null; M.refundSourceMeta=null;
  syncMirror(render);
}

function discountMotifPresetsTablet(){
  var fb=[{id:'_fb',label:'Bénévole',commentRequired:true,commentLabel:'Prénom du bénévole'}];
  if(!B||!Array.isArray(B.discountMotifs)||!B.discountMotifs.length) return fb;
  return B.discountMotifs;
}

function openTabletMotifPicker(inputId){
  var mp=discountMotifPresetsTablet();
  var pick=document.createElement('div');
  pick.className='overlay';
  pick.style.zIndex='200';
  var rows=mp.map(function(pr){
    return '<button type="button" class="btn btn-secondary tablet-motif-pick" style="display:block;width:100%;margin:.35rem 0">'+esc(pr.label)+'</button>';
  }).join('');
  pick.innerHTML='<div class="modal" onclick="event.stopPropagation()" style="max-height:92vh;overflow:auto;padding:1.1rem 1.25rem">'+
    '<h3 style="margin:0 0 .35rem">Motifs enregistrés</h3>'+
    '<p class="sub" style="margin:0 0 .65rem;font-size:.82rem;color:var(--muted)">Choisissez un motif.</p>'+rows+
    '<button type="button" class="btn btn-ghost" id="tabletMotifPickClose" style="width:100%;margin-top:.65rem">Fermer</button></div>';
  document.body.appendChild(pick);
  function rm(){ try{document.body.removeChild(pick);}catch(e){} }
  pick.onclick=function(ev){ if(ev.target===pick) rm(); };
  el('tabletMotifPickClose').onclick=function(e){ e.stopPropagation(); rm(); };
  var picks=pick.querySelectorAll('.tablet-motif-pick');
  for(var i=0;i<picks.length;i++){
    (function(pr){
      picks[i].onclick=function(e){ e.stopPropagation();
        var inp=el(inputId); if(!inp) return;
        if(pr.commentRequired){
          var s=prompt(String(pr.commentLabel||'Commentaire')+' (obligatoire) :','');
          if(s===null) return;
          var pv=String(s).trim();
          if(!pv){ alert('Ce champ est obligatoire.'); return; }
          var lbl=String(pr.label||'').trim();
          var m=lbl?(lbl+' — '+pv):pv;
          if(m.length>200) m=m.slice(0,200);
          inp.value=m;
        } else {
          inp.value=String(pr.label||'').trim().slice(0,200);
        }
        rm();
      };
    })(mp[i]);
  }
}

function openRemiseMenu(pid){
  var p=(B.products||[]).find(function(x){return x.id===pid;}); if(!p) return;
  if(!M.lineDiscountPct) M.lineDiscountPct={};
  if(!M.lineDiscountReason) M.lineDiscountReason={};
  var curPct=mirrorDiscPct(pid);
  var curMot=M.lineDiscountReason[pid]||'';
  var o=document.createElement('div');
  o.className='overlay';
  o.innerHTML='<div class="modal" onclick="event.stopPropagation()"><h3>Remise</h3><p class="sub">'+esc(p.emoji+' '+p.name)+'</p>'+
    '<label style="display:block;margin:.35rem 0 .2rem;font-size:.78rem;color:var(--muted)">Remise (%)</label>'+
    '<input type="text" id="rimPct" class="mono" style="width:100%;padding:.5rem;box-sizing:border-box" placeholder="0–100"/>'+
    '<p style="margin:.55rem 0 .25rem;font-size:.78rem;color:var(--muted)">Propositions :</p>'+
    '<div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.55rem">'+
    '<button type="button" class="btn btn-secondary" id="rim50">50 %</button>'+
    '<button type="button" class="btn btn-secondary" id="rim100">100 %</button></div>'+
    '<label style="display:block;margin:.35rem 0 .2rem;font-size:.78rem;color:var(--muted)">Motif (facultatif)</label>'+
    '<input type="text" id="rimMot" style="width:100%;padding:.5rem;box-sizing:border-box" maxlength="200"/>'+
    '<p style="margin:.55rem 0 .25rem;font-size:.78rem;color:var(--muted)">Souhaitez-vous utiliser un motif enregistré ?</p>'+
    '<div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.55rem">'+
    '<button type="button" class="btn btn-secondary" id="rimMotNo">Non</button>'+
    '<button type="button" class="btn btn-primary" id="rimMotYes">Oui, choisir</button></div>'+
    '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.75rem;justify-content:flex-end">'+
    '<button type="button" class="btn btn-ghost" id="rimBack">Retour</button>'+
    '<button type="button" class="btn btn-secondary" id="rimZero">Aucune remise</button>'+
    '<button type="button" class="btn btn-primary" id="rimApply">Appliquer la saisie</button></div></div>';
  o.onclick=function(){ try{document.body.removeChild(o);}catch(e){} };
  document.body.appendChild(o);
  el('rimPct').value=curPct>0?String(curPct):'';
  el('rimMot').value=curMot;
  el('rimMotNo').onclick=function(e){ e.stopPropagation(); };
  el('rimMotYes').onclick=function(e){ e.stopPropagation(); openTabletMotifPicker('rimMot'); };
  function closeM(){ try{document.body.removeChild(o);}catch(e){} }
  el('rimBack').onclick=function(e){ e.stopPropagation(); closeM(); };
  function commitDisc(pct){
    if(pct<=0){ delete M.lineDiscountPct[pid]; } else { M.lineDiscountPct[pid]=Math.min(100,Math.round(pct)); }
    var m=(el('rimMot').value||'').trim();
    if(!m){ delete M.lineDiscountReason[pid]; } else { M.lineDiscountReason[pid]=m.slice(0,200); }
    closeM();
    syncMirror(render);
  }
  el('rim50').onclick=function(e){ e.stopPropagation(); el('rimPct').value='50'; };
  el('rim100').onclick=function(e){ e.stopPropagation(); el('rimPct').value='100'; };
  el('rimZero').onclick=function(e){ e.stopPropagation(); delete M.lineDiscountPct[pid]; delete M.lineDiscountReason[pid]; closeM(); syncMirror(render); };
  el('rimApply').onclick=function(e){ e.stopPropagation();
    var t=(el('rimPct').value||'').replace(/\\s/g,'').replace(',','.').trim();
    if(t===''){ commitDisc(0); return; }
    var v=parseFloat(t);
    if(!isFinite(v)||v<0){ alert('Pourcentage invalide.'); return; }
    commitDisc(Math.min(100,Math.round(v)));
  };
}

function openRemiseCartMenu(){
  var curPct=mirrorCartDiscPct();
  var curMot=String(M.cartDiscountReason||'');
  var o=document.createElement('div');
  o.className='overlay';
  o.innerHTML='<div class="modal" onclick="event.stopPropagation()"><h3>Remise sur le total</h3><p class="sub">S’applique au sous-total du panier (après remises par ligne).</p>'+
    '<label style="display:block;margin:.35rem 0 .2rem;font-size:.78rem;color:var(--muted)">Remise (%)</label>'+
    '<input type="text" id="rimPctTot" class="mono" style="width:100%;padding:.5rem;box-sizing:border-box" placeholder="0–100"/>'+
    '<p style="margin:.55rem 0 .25rem;font-size:.78rem;color:var(--muted)">Propositions :</p>'+
    '<div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.55rem">'+
    '<button type="button" class="btn btn-secondary" id="rim50Tot">50 %</button>'+
    '<button type="button" class="btn btn-secondary" id="rim100Tot">100 %</button></div>'+
    '<label style="display:block;margin:.35rem 0 .2rem;font-size:.78rem;color:var(--muted)">Motif (facultatif)</label>'+
    '<input type="text" id="rimMotTot" style="width:100%;padding:.5rem;box-sizing:border-box" maxlength="200"/>'+
    '<p style="margin:.55rem 0 .25rem;font-size:.78rem;color:var(--muted)">Souhaitez-vous utiliser un motif enregistré ?</p>'+
    '<div style="display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.55rem">'+
    '<button type="button" class="btn btn-secondary" id="rimMotNoTot">Non</button>'+
    '<button type="button" class="btn btn-primary" id="rimMotYesTot">Oui, choisir</button></div>'+
    '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.75rem;justify-content:flex-end">'+
    '<button type="button" class="btn btn-ghost" id="rimBackTot">Retour</button>'+
    '<button type="button" class="btn btn-secondary" id="rimZeroTot">Aucune remise</button>'+
    '<button type="button" class="btn btn-primary" id="rimApplyTot">Appliquer la saisie</button></div></div>';
  o.onclick=function(){ try{document.body.removeChild(o);}catch(e){} };
  document.body.appendChild(o);
  el('rimPctTot').value=curPct>0?String(curPct):'';
  el('rimMotTot').value=curMot;
  el('rimMotNoTot').onclick=function(e){ e.stopPropagation(); };
  el('rimMotYesTot').onclick=function(e){ e.stopPropagation(); openTabletMotifPicker('rimMotTot'); };
  function closeM(){ try{document.body.removeChild(o);}catch(e){} }
  el('rimBackTot').onclick=function(e){ e.stopPropagation(); closeM(); };
  function commitCart(pct){
    if(pct<=0){ M.cartDiscountPct=0; M.cartDiscountReason=''; }
    else { M.cartDiscountPct=Math.min(100,Math.round(pct)); var m=(el('rimMotTot').value||'').trim(); if(!m){ M.cartDiscountReason=''; } else { M.cartDiscountReason=m.slice(0,200); } }
    closeM();
    syncMirror(render);
  }
  el('rim50Tot').onclick=function(e){ e.stopPropagation(); el('rimPctTot').value='50'; };
  el('rim100Tot').onclick=function(e){ e.stopPropagation(); el('rimPctTot').value='100'; };
  el('rimZeroTot').onclick=function(e){ e.stopPropagation(); M.cartDiscountPct=0; M.cartDiscountReason=''; closeM(); syncMirror(render); };
  el('rimApplyTot').onclick=function(e){ e.stopPropagation();
    var t=(el('rimPctTot').value||'').replace(/\\s/g,'').replace(',','.').trim();
    if(t===''){ commitCart(0); return; }
    var v=parseFloat(t);
    if(!isFinite(v)||v<0){ alert('Pourcentage invalide.'); return; }
    commitCart(Math.min(100,Math.round(v)));
  };
}

function render(){
  if(!B){ el('app').innerHTML=''; return; }
  var nav='<nav class="tablet-nav">'+
    '<button type="button" class="tablet-nav-btn '+(tabletMain==='caisse'?'active':'')+'" id="navCaisse">Caisse</button>'+
    '<button type="button" class="tablet-nav-btn '+(tabletMain==='history'?'active':'')+'" id="navHist">Historique</button>'+
    '</nav>';

  if(tabletMain==='history'){
    var rowsHtml;
    if(histLoading){
      rowsHtml='<tr><td colspan="5" class="hist-empty">Chargement…</td></tr>';
    }else if(!histList.length){
      rowsHtml='<tr><td colspan="5" class="hist-empty">Aucune vente pour cet événement.</td></tr>';
    }else{
      rowsHtml=histList.map(function(s){
        var ord=s.orderNumber>0?('Commande ' + formatOrderDigits(s.orderNumber)):'—';
        var dt=new Date(s.at).toLocaleString('fr-FR');
        var typ=s.kind==='refund'?'<span class="hist-badge hist-badge-ref">Remb.</span>':'<span class="hist-badge hist-badge-sale">Vente</span>';
        var amt=s.kind==='refund'?('−'+fmt(s.totalCents)):fmt(s.totalCents);
        return '<tr class="hist-click" data-hist-id="'+esc(s.id)+'">'+
          '<td class="mono">'+esc(ord)+'</td>'+
          '<td class="td-dt mono">'+esc(dt)+'</td>'+
          '<td>'+typ+'</td>'+
          '<td class="mono hist-amt">'+amt+'</td>'+
          '<td><span class="hist-pay">'+esc(s.paymentShort)+'</span><div class="hist-prev muted">'+esc(s.linesPreview)+'</div></td>'+
          '</tr>';
      }).join('');
    }
    el('app').innerHTML=
      '<div class="tablet-app">'+
      '<div class="tablet-top">'+
      nav+
      '<label>Événement <select id="evSel"></select></label>'+
      '</div>'+
      (B.eventClosed?'<div class="banner-event-closed">Événement clôturé</div>':'')+
      (!B.selectedEventId?'<div class="banner-warn">Choisissez un événement ci-dessus.</div>':'')+
      '<div class="hist-page">'+
      '<div class="hist-head">'+
      '<h2 class="hist-title">Historique des ventes</h2>'+
      '<div class="hist-toolbar">'+
      '<button type="button" class="btn btn-secondary hist-refresh" id="histRefresh">Actualiser</button>'+
      '</div></div>'+
      '<div class="hist-table-wrap">'+
      '<table class="hist-table">'+
      '<thead><tr><th>N°</th><th>Date</th><th>Type</th><th>Total</th><th>Paiement</th></tr></thead>'+
      '<tbody>'+rowsHtml+'</tbody></table>'+
      '</div></div></div>';
    var evSelh=el('evSel');
    (B.events||[]).forEach(function(e){
      var o=document.createElement('option');
      o.value=e.id; o.textContent=e.name+(e.closed?' (clôturé)':''); if(e.id===B.selectedEventId) o.selected=true;
      evSelh.appendChild(o);
    });
    evSelh.onchange=function(){
      api('/api/remote/select-event',{method:'POST',body:JSON.stringify({eventId:evSelh.value||null})}).then(refresh);
    };
    el('histRefresh').onclick=function(){ fetchHistory(); };
    wireTabletNav();
    el('app').querySelectorAll('[data-hist-id]').forEach(function(tr){
      tr.onclick=function(){ openHistoryDetail(tr.getAttribute('data-hist-id')); };
    });
    renderPayOverlay();
    return;
  }

  var ev=B.eventName||'—';
  var needFloat=B.sessionRequired;
  showFloat=needFloat;
  var refundCls=M.refundMode?' panel-cart-refund':'';
  var L=linesFromMirror(), tot=totalCents();
  var grid=(B.products||[]).filter(function(p){return cat==='all'||p.category===cat;}).map(function(p){
    var av=stockAvail(p);
    var dis=!B.canSell||(!M.refundMode&&p.trackStock&&av<=0);
    var vis=p.hasImage
      ?'<div class="pcard-imgwrap"><img class="pcard-img" src="'+productImgSrc(p.id)+'" alt="" loading="lazy"/></div>'
      :'<div class="emoji">'+(p.emoji||'🛒')+'</div>';
    return '<button type="button" class="product-card" '+(dis?'disabled':'')+' data-pid="'+p.id+'">'+
      '<span class="stock-badge">'+(p.trackStock?av:'—')+'</span>'+
      vis+'<div class="name">'+esc(p.name)+'</div><div class="price">'+fmt(p.priceCents)+'</div></button>';
  }).join('');

  var linesHtml=L.length?L.map(function(x){
    var cap=M.refundMaxByProduct&&M.refundMaxByProduct[x.p.id]!=null;
    var atCap=M.refundMode&&cap&&x.q>=M.refundMaxByProduct[x.p.id];
    var dpc=mirrorDiscPct(x.p.id);
    var ov=(M.priceOverrides[x.p.id]!=null?'<span class="override-pill">prix modifié</span> ':'')+
      (dpc>0?'<span class="override-pill">remise '+dpc+' %</span> ':'');
    return '<div class="line"><div><div style="font-weight:600">'+esc(x.p.emoji)+' '+esc(x.p.name)+'</div>'+
      '<div style="font-size:.8rem;color:var(--muted)">'+ov+fmt(x.unit)+' net / u. × '+x.q+'</div></div>'+
      '<div class="line-controls">'+
      '<button type="button" class="qbtn" data-qty="'+x.p.id+'" data-d="-1">−</button><span class="qty">'+x.q+'</span>'+
      '<button type="button" class="qbtn" data-qty="'+x.p.id+'" data-d="1" '+(atCap||(!M.refundMode&&x.p.trackStock&&x.q>=stockAvail(x.p))?'disabled':'')+'>+</button>'+
      '<button type="button" class="qbtn danger" data-qty="'+x.p.id+'" data-clr="1">×</button></div>'+
      '<div class="line-total">Sous-total '+fmt(x.unit*x.q)+'</div>'+
      '<div class="line-price-row">'+
      '<button type="button" class="btn-tiny" data-prix="'+x.p.id+'">Prix unitaire</button>'+
      (M.priceOverrides[x.p.id]!=null?'<button type="button" class="btn-tiny btn-tiny-ghost" data-prix0="'+x.p.id+'">Prix catalogue</button>':'')+
      '<button type="button" class="btn-tiny btn-remise-tiny'+(dpc>0?' btn-remise-tiny--active':'')+'" data-remise-menu="'+x.p.id+'"><span class="brt-i">%</span><span>Remise</span>'+(dpc>0?'<span class="brt-b">'+dpc+' %</span>':'')+'</button>'+
      '</div></div>';
  }).join(''):'<div class="empty-cart">'+(M.refundMode?'Ajoutez les articles remboursés':'Ajoutez des articles')+'</div>';

  var tabs='<button type="button" class="tab'+(cat==='all'?' active':'')+'" data-cat="all">✦ Tout</button>';
  (B.categories||[]).forEach(function(c){
    tabs+='<button type="button" class="tab'+(cat===c.id?' active':'')+'" data-cat="'+esc(c.id)+'">'+(c.short||'')+' '+esc(c.label)+'</button>';
  });

  var cdp=mirrorCartDiscPct(), st=subtotalCents();
  var cartRemiseBlock=!M.refundMode?(
    '<div style="margin-bottom:.45rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.45rem">'+
    (cdp>0?'<div style="font-size:.78rem;color:var(--muted);flex:1;min-width:0">Sous-total '+fmt(st)+' · remise '+cdp+' %'+(M.cartDiscountReason&&String(M.cartDiscountReason).trim()?' — '+esc(String(M.cartDiscountReason).trim()):'')+'</div>':'<div></div>')+
    '<button type="button" class="btn-tiny btn-remise-tiny'+(cdp>0?' btn-remise-tiny--active':'')+'" id="btnRemiseTot" '+(L.length===0||!B.canSell?'disabled':'')+'><span class="brt-i">%</span><span>Remise totale</span>'+(cdp>0?'<span class="brt-b">'+cdp+' %</span>':'')+'</button></div>'
  ):'';

  el('app').innerHTML=
    '<div class="tablet-app">'+
    '<div class="tablet-top">'+
    nav+
    '<label>Événement <select id="evSel"></select></label>'+
    (B.sessionFloatCents!=null?'<span style="color:var(--accent);font-weight:600">Fond '+fmt(B.sessionFloatCents)+'</span>':'')+
    '<button type="button" class="btn btn-secondary" id="btnSalesRf" style="font-size:.75rem">Charger vente (remb.)</button>'+
    '</div>'+
    (B.eventClosed?'<div class="banner-event-closed">Événement clôturé</div>':'')+
    (!B.selectedEventId?'<div class="banner-warn">Choisissez un événement ci-dessus.</div>':'')+
    (needFloat?'<div class="banner-warn"><button type="button" class="btn btn-primary" id="btnOpenFloat" style="margin-top:.35rem">Démarrer la session (fond de caisse)</button></div>':'')+
    '<div class="main">'+
    '<div class="panel-left">'+
    '<div class="tabs" role="tablist">'+tabs+'</div>'+
    '<div class="grid-wrap"><div class="product-grid" id="pgrid">'+grid+'</div></div></div>'+
    '<aside class="panel-cart'+refundCls+'">'+
    '<div class="cart-head">'+
    '<div class="cart-head-top"><h2>'+(M.refundMode?'Remboursement':'Panier')+'</h2>'+
    '<button type="button" class="btn btn-secondary btn-cart-clear" id="btnClear" '+(L.length===0?'disabled':'')+'>Vider le panier</button></div>'+
    '<div class="cart-options-strip">'+
    '<label class="cart-option-card cart-option-refund'+(B.eventClosed?' is-disabled':'')+'">'+
    '<input type="checkbox" id="rfChk" '+(M.refundMode?'checked':'')+' '+(B.eventClosed?'disabled':'')+'/>'+
    '<span class="cart-option-card__icon">↩</span><span class="cart-option-card__body"><span class="cart-option-card__title">Remboursement</span><span class="cart-option-card__hint">Retour ou annulation (même flux que la vente)</span></span>'+
    '<span class="cart-switch" aria-hidden="true"><span class="cart-switch__track"></span><span class="cart-switch__thumb"></span></span>'+
    '</label>'+
    '<label class="cart-option-card cart-option-display">'+
    '<input type="checkbox" id="remoteDisp" '+(B.clientDisplayRemoteEnabled?'checked':'')+'/>'+
    '<span class="cart-option-card__icon">🖥</span><span class="cart-option-card__body"><span class="cart-option-card__title">Affichage client</span><span class="cart-option-card__hint">Panier visible sur 2ᵉ écran ou navigateur (URL sur la caisse)</span></span>'+
    '<span class="cart-display-badge">'+(B.clientDisplayRemoteEnabled?'Actif':'Masqué')+'</span></label></div>'+
    '<div class="cart-meta-row"><span>'+esc(ev)+'</span><span>'+L.length+' ligne'+(L.length>1?'s':'')+'</span></div></div>'+
    '<div class="cart-lines">'+linesHtml+'</div>'+
    '<div class="cart-footer">'+
    cartRemiseBlock+
    '<div class="total-row"><span style="color:var(--muted)">'+(M.refundMode?'Total à rembourser':'Total')+'</span><span class="amount">'+fmt(tot)+'</span></div>'+
    '<div class="actions'+(M.refundMode?' actions-single':' cart-pay-actions')+'">'+
    (M.refundMode?
      '<button type="button" class="btn btn-primary btn-refund" id="btnPayRf" '+(L.length===0||!B.canSell?'disabled':'')+'>Rembourser</button>':
      '<button type="button" class="btn btn-primary" id="btnPayCash" '+(L.length===0||!B.canSell?'disabled':'')+'>Espèces</button>'+
      '<button type="button" class="btn btn-primary" id="btnPayCard" '+(L.length===0||!B.canSell?'disabled':'')+'>Carte</button>')+
    '</div></div></aside></div></div>';

  var evSel=el('evSel');
  (B.events||[]).forEach(function(e){
    var o=document.createElement('option');
    o.value=e.id; o.textContent=e.name+(e.closed?' (clôturé)':''); if(e.id===B.selectedEventId) o.selected=true;
    evSel.appendChild(o);
  });
  evSel.onchange=function(){
    api('/api/remote/select-event',{method:'POST',body:JSON.stringify({eventId:evSel.value||null})}).then(refresh);
  };
  el('pgrid').querySelectorAll('.product-card[data-pid]').forEach(function(btn){
    btn.onclick=function(){
      var id=btn.getAttribute('data-pid');
      var p=(B.products||[]).find(function(x){return x.id===id;});
      if(p) addProduct(p);
    };
  });
  el('app').querySelectorAll('.tab[data-cat]').forEach(function(t){
    t.onclick=function(){ cat=t.getAttribute('data-cat')||'all'; render(); };
  });
  el('app').querySelectorAll('[data-qty]').forEach(function(btn){
    btn.onclick=function(){
      var id=btn.getAttribute('data-qty');
      if(btn.getAttribute('data-clr')){ setQty(id,0); return;}
      var d=parseInt(btn.getAttribute('data-d')||'0',10);
      var cur=M.quantities[id]||0;
      setQty(id,cur+d);
    };
  });
  if(el('rfChk')) el('rfChk').onchange=function(){ toggleRefund(); };
  if(el('remoteDisp')) el('remoteDisp').onchange=function(){
    api('/api/remote/client-display-remote',{method:'POST',body:JSON.stringify({enabled:el('remoteDisp').checked})}).then(refresh).catch(function(e){ alert(e.message); });
  };
  el('app').querySelectorAll('[data-prix]').forEach(function(b){
    b.onclick=function(e){ e.stopPropagation();
      var id=b.getAttribute('data-prix');
      var p=(B.products||[]).find(function(x){return x.id===id;}); if(!p) return;
      var cur=mirrorBaseCents(id,p);
      var def=(Math.round(cur)/100).toFixed(2).replace('.',',');
      var s=prompt('Prix unitaire TTC (€). Vide = annuler.',def);
      if(s===null) return;
      var t=String(s).replace(/\s/g,'').replace(',','.');
      if(t==='') return;
      var n=Math.round(parseFloat(t)*100);
      if(!isFinite(n)||n<0){ alert('Montant invalide'); return; }
      M.priceOverrides[id]=n;
      syncMirror(render);
    };
  });
  el('app').querySelectorAll('[data-prix0]').forEach(function(b){
    b.onclick=function(e){ e.stopPropagation();
      var id=b.getAttribute('data-prix0');
      delete M.priceOverrides[id];
      syncMirror(render);
    };
  });
  el('app').querySelectorAll('[data-remise-menu]').forEach(function(b){
    b.onclick=function(e){ e.stopPropagation();
      openRemiseMenu(b.getAttribute('data-remise-menu'));
    };
  });
  if(el('btnClear')) el('btnClear').onclick=function(){ M=defaultM(); syncMirror(render); };
  if(el('btnRemiseTot')) el('btnRemiseTot').onclick=function(e){ e.stopPropagation(); if(L.length===0||!B.canSell) return; openRemiseCartMenu(); };
  if(el('btnPayRf')) el('btnPayRf').onclick=function(){ openPayFrom('choose'); };
  if(el('btnPayCash')) el('btnPayCash').onclick=function(){ openPayFrom('cash'); };
  if(el('btnPayCard')) el('btnPayCard').onclick=function(){ openPayFrom('card'); };
  if(el('btnSalesRf')) el('btnSalesRf').onclick=pickRefundSale;
  if(el('btnOpenFloat')) el('btnOpenFloat').onclick=openFloatModal;
  wireTabletNav();
  renderPayOverlay();
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function openFloatModal(){
  var o=document.createElement('div');
  o.className='overlay';
  o.innerHTML='<div class="modal" onclick="event.stopPropagation()"><h3>Fond de caisse</h3><p class="sub">Montant d’espèces en début de session (0 € possible).</p>'+
    '<input type="text" id="floatIn" class="mono" style="width:100%;padding:.5rem" placeholder="0" value="'+floatDraft+'"/>'+
    '<button type="button" class="btn btn-primary btn-block-pay" id="floatOk">Démarrer</button></div>';
  o.onclick=function(){ document.body.removeChild(o); };
  document.body.appendChild(o);
  el('floatOk').onclick=function(){
    var v=(el('floatIn').value||'').replace(/\\s/g,'').replace(',','.');
    var n=Math.round(parseFloat(v)*100);
    if(!isFinite(n)||n<0){ alert('Montant invalide'); return; }
    api('/api/remote/session/start',{method:'POST',body:JSON.stringify({floatCents:n})}).then(function(){
      document.body.removeChild(o); refresh();
    }).catch(function(e){ alert(e.message); });
  };
}

function pickRefundSale(){
  api('/api/remote/sales?limit=40&salesOnly=1').then(function(r){
    var sales=r.sales||[];
    var o=document.createElement('div');
    o.className='overlay';
    var h='<div class="modal" onclick="event.stopPropagation()"><h3>Vente à rembourser</h3><p class="sub">Choisissez une vente récente.</p><div class="sales-pick">';
    sales.forEach(function(s){
      h+='<button type="button" data-sid="'+s.id+'">'+(s.orderNumber>0?('Commande ' + formatOrderDigits(s.orderNumber)):'?')+' — '+fmt(s.totalCents)+' — '+esc(s.at)+'</button>';
    });
    h+='</div><button type="button" class="btn btn-secondary btn-block-pay" id="rfClose">Fermer</button></div>';
    o.innerHTML=h;
    o.onclick=function(){ document.body.removeChild(o); };
    document.body.appendChild(o);
    o.querySelectorAll('[data-sid]').forEach(function(b){
      b.onclick=function(){
        var id=b.getAttribute('data-sid');
        api('/api/remote/refund/load-sale',{method:'POST',body:JSON.stringify({saleId:id})}).then(function(){
          document.body.removeChild(o); refresh();
        }).catch(function(e){ alert(e.message); });
      };
    });
    el('rfClose').onclick=function(){ document.body.removeChild(o); };
  });
}

function stopSumPoll(){ if(sumPoll){ clearInterval(sumPoll); sumPoll=null; } }

function resetSumupSessionVars(){ checkoutId=''; clientTxId=''; flowOnline=false; sumupNextUrl=''; sumPhase='idle'; sumErr=''; }

/** Comme la caisse : annule le terminal Solo ou le checkout en ligne SumUp. */
function cancelActiveSumupAnd(done){
  var effSum=B&&B.sumupConfigured&&!M.refundMode;
  stopSumPoll();
  if(!effSum||payStep!=='card'){
    resetSumupSessionVars();
    if(done) done();
    return;
  }
  var pl={};
  if(checkoutId&&String(checkoutId).trim()) pl.onlineCheckoutId=checkoutId;
  api('/api/remote/sumup/cancel',{method:'POST',body:JSON.stringify(pl)}).finally(function(){
    resetSumupSessionVars();
    if(done) done();
  });
}

function openPayFrom(entry){
  if(cartLineCount()===0||!B.canSell) return;
  payOpen=true;
  payStep=M.refundMode?'choose':entry;
  cashGiven=0; cashDetailExpanded=M.refundMode||!(B&&B.cashPaymentUi==='express'); cardTargetCents=null; sumPhase='idle'; sumErr=''; checkoutId=''; clientTxId=''; flowOnline=false; sumupNextUrl='';
  stopSumPoll();
  var effSum=B&&B.sumupConfigured&&!M.refundMode;
  var term=B&&B.sumupTerminalAuto;
  if(payStep==='card'&&effSum&&term){ startSumup(); }
  renderPayOverlay();
}
function openPay(){ openPayFrom('choose'); }

function closePay(){
  payOpen=false; cardTargetCents=null;
  cancelActiveSumupAnd(function(){ pushClientDisplayPayment(); renderPayOverlay(); });
}

function renderPayOverlay(){
  var ex=el('payOv');
  if(ex) ex.remove();
  if(!payOpen) return;
  var tot=totalCents();
  var rf=M.refundMode;
  var sumCfg=B.sumupConfigured;
  var term=B.sumupTerminalAuto;
  var effSum=sumCfg&&!rf;
  var h='<div class="overlay" id="payOv"><div class="modal modal-pay" onclick="event.stopPropagation()">'+
    '<h3>'+(rf?'Remboursement':'Encaissement')+'</h3><div class="pay-total-line"><span>Total</span><strong>'+fmt(tot)+'</strong></div>';

  if(payStep==='choose'){
    h+='<p class="sub">'+(rf?'Mode de remboursement':'Choix du mode de règlement')+'</p><div class="pay-mode-btns">'+
      '<button type="button" class="btn btn-primary btn-pay-lg" id="pCash">Espèces</button>'+
      '<button type="button" class="btn btn-primary btn-pay-lg" id="pCard" '+(rf&&!effSum?'':'')+'>'+(effSum||!rf?'Carte':'Carte')+'</button></div>'+
      '<button type="button" class="btn btn-secondary btn-block-pay" id="pCancel">Annuler</button>';
  } else if(payStep==='cash'){
    var chg=Math.max(0,cashGiven-tot);
    var sh=Math.max(0,tot-cashGiven);
    var canC=cashGiven>=tot;
    var canM=cashGiven>0&&cashGiven<tot;
    var showDenom=rf||cashDetailExpanded||!(B&&B.cashPaymentUi==='express');
    h+='<p class="sub">'+(rf?'Remboursement espèces : vignettes ou montant exact.':((B&&B.cashPaymentUi==='express')?'Montant exact en priorité ; ouvrez le compteur si complément carte.':'Saisie des espèces reçues'))+'</p>';
    if(tot>=0){
      h+='<button type="button" class="btn btn-primary btn-block-pay" id="cashExact">'+
        (rf?'Rembourser '+fmt(tot)+' (espèces, exact)':(tot>0?'Encaisser '+fmt(tot)+' (montant exact)':'Valider la vente à 0,00 € (espèces)'))+
        '</button>';
    }
    if(!showDenom){
      h+='<button type="button" class="btn btn-secondary btn-block-pay" id="cashShowDenom">Compter avec pièces et billets…</button>';
    } else {
      if(B&&B.cashPaymentUi==='express'&&!rf){
        h+='<button type="button" class="btn btn-secondary btn-block-pay" id="cashHideDenom">Masquer pièces / billets</button>';
      }
      h+='<div class="denom-section"><span class="denom-title">Pièces</span><div class="denom-grid">';
      DENOMS.filter(function(d){return d.c<=200;}).forEach(function(d){
        h+='<button type="button" class="denom-chip" data-c="'+d.c+'">'+d.l+'</button>';
      });
      h+='</div></div><div class="denom-section"><span class="denom-title">Billets</span><div class="denom-grid denom-notes">';
      DENOMS.filter(function(d){return d.c>=500;}).forEach(function(d){
        h+='<button type="button" class="denom-chip" data-c="'+d.c+'">'+d.l+'</button>';
      });
      h+='</div></div>';
    }
    h+='<div class="pay-summary">';
    h+='<div class="pay-row"><span>'+(rf?'Montant (espèces)':'Reçu en espèces')+'</span><strong>'+fmt(cashGiven)+'</strong></div>';
    if(canC) h+='<div class="pay-row highlight"><span>À rendre</span><strong>'+fmt(chg)+'</strong></div>';
    if(canM) h+='<div class="pay-row warn"><span>Reste à payer</span><strong>'+fmt(sh)+'</strong></div>';
    h+='</div>';
    if(canC) h+='<button type="button" class="btn btn-primary btn-block-pay" id="valCash">Valider (espèces)</button>';
    if(canM) h+='<button type="button" class="btn btn-primary btn-block-pay" id="valMix">'+(effSum?'Espèces + reste SumUp':'Espèces + reste carte')+' ('+fmt(sh)+')</button>';
    h+='<div style="display:flex;gap:.5rem;margin-top:.5rem"><button type="button" class="btn btn-secondary" id="clrCash">Réinitialiser</button><button type="button" class="btn btn-secondary" id="bkCash">Retour</button></div>';
  } else if(payStep==='card'){
    if(cardTargetCents!=null){
      h+='<div class="pay-summary" style="margin-bottom:.75rem">';
      h+='<div class="pay-row"><span>Déjà reçu en espèces</span><strong>'+fmt(cashGiven)+'</strong></div>';
      h+='<div class="pay-row warn"><span>Reste sur SumUp</span><strong>'+fmt(cardTargetCents)+'</strong></div></div>';
    }
    h+='<p class="sub">'+(effSum?(term?(cardTargetCents!=null?'Envoi du reste au terminal Solo…':'Paiement sur le terminal SumUp Solo…'):(cardTargetCents!=null?'SumUp en ligne — uniquement le reste à payer':'SumUp en ligne — montant total')):'Saisie manuelle carte')+'</p>';
    if(sumErr) h+='<p style="color:#f87171">'+esc(sumErr)+'</p>';
    if(effSum&&term){
      h+='<p class="sub">'+(sumPhase==='creating'?'Envoi au terminal…':sumPhase==='waiting'?'En attente du terminal Solo…':sumPhase==='error'?'Erreur SumUp':'')+'</p>';
      if(sumPhase==='error') h+='<button type="button" class="btn btn-primary btn-block-pay" id="retrySum">Réessayer l’envoi</button>';
    }
    if(effSum&&!term){
      h+='<button type="button" class="btn btn-primary btn-block-pay" id="goSum" '+(sumPhase==='waiting'?'disabled':'')+'>Payer avec SumUp</button>';
      if(sumPhase==='waiting'&&sumupNextUrl){
        h+='<a href="'+escAttr(sumupNextUrl)+'" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block-pay" style="text-decoration:none;display:block;text-align:center;margin-top:.65rem">Ouvrir la page de paiement SumUp</a>';
        h+='<p class="sub" style="margin-top:.35rem">Si rien ne s’ouvre automatiquement, touchez le bouton ci-dessus (les navigateurs bloquent souvent les fenêtres depuis la tablette).</p>';
      } else if(sumPhase==='waiting'&&!sumupNextUrl&&flowOnline){
        h+='<p class="sub" style="margin-top:.35rem;color:var(--muted)">En attente SumUp… Si aucune page ne s’affiche, vérifiez SumUp sur la caisse ou réessayez.</p>';
      }
    }
    h+='<button type="button" class="btn btn-secondary btn-block-pay" id="manCard">'+(rf?'Confirmer remboursement carte':(cardTargetCents!=null?'Enregistrer sans SumUp (espèces + reste)':'Encaissement carte manuel'))+'</button>';
    h+='<button type="button" class="btn btn-secondary btn-block-pay" id="bkCard">'+(effSum&&!rf?'Retour / Annuler la carte':'Retour')+'</button>';
  }
  h+='</div></div>';
  document.body.insertAdjacentHTML('beforeend',h);
  var ov=el('payOv');
  ov.onclick=closePay;
  if(el('pCancel')) el('pCancel').onclick=closePay;
  if(el('pCash')) el('pCash').onclick=function(){ cashGiven=0; cashDetailExpanded=M.refundMode||!(B&&B.cashPaymentUi==='express'); payStep='cash'; renderPayOverlay(); };
  if(el('pCard')) el('pCard').onclick=function(){
    cardTargetCents=null;
    payStep='card'; sumPhase='idle'; sumErr='';
    if(effSum&&term){ startSumup(); }
    renderPayOverlay();
  };
  if(el('cashExact')) el('cashExact').onclick=function(){ finalize({mode:'cash',cashCents:tot,cardCents:0,changeCents:0}); };
  if(el('bkCash')) el('bkCash').onclick=function(){ payStep='choose'; renderPayOverlay(); };
  if(el('clrCash')) el('clrCash').onclick=function(){ cashGiven=0; renderPayOverlay(); };
  if(el('cashShowDenom')) el('cashShowDenom').onclick=function(){ cashDetailExpanded=true; renderPayOverlay(); };
  if(el('cashHideDenom')) el('cashHideDenom').onclick=function(){ cashDetailExpanded=false; cashGiven=0; renderPayOverlay(); };
  ov.querySelectorAll('.denom-chip[data-c]').forEach(function(b){
    b.onclick=function(){ cashGiven+=parseInt(b.getAttribute('data-c'),10); renderPayOverlay(); };
  });
  if(el('valCash')) el('valCash').onclick=function(){ finalize({mode:'cash',cashCents:cashGiven,cardCents:0,changeCents:Math.max(0,cashGiven-tot)}); };
  if(el('valMix')) el('valMix').onclick=function(){
    var sh=Math.max(0,tot-cashGiven);
    if(effSum){
      cardTargetCents=sh;
      payStep='card'; sumPhase='idle'; sumErr='';
      if(term){ startSumup(); }
      else { renderPayOverlay(); }
    } else {
      finalize({mode:'mixed',cashCents:cashGiven,cardCents:sh,changeCents:0});
    }
  };
  if(el('bkCard')) el('bkCard').onclick=function(){
    cancelActiveSumupAnd(function(){
      if(cardTargetCents!=null){ cardTargetCents=null; payStep='cash'; }
      else { payStep='choose'; }
      renderPayOverlay();
    });
  };
  if(el('manCard')) el('manCard').onclick=function(){
    if(cardTargetCents!=null){ finalize({mode:'mixed',cashCents:cashGiven,cardCents:cardTargetCents,changeCents:0}); }
    else { finalize({mode:'card',cashCents:0,cardCents:tot,changeCents:0}); }
  };
  if(el('goSum')) el('goSum').onclick=function(){ startSumupOnline(); };
  if(el('retrySum')) el('retrySum').onclick=function(){ startSumup(); };
  if(payOpen) pushClientDisplayPayment();
}

function startSumup(){
  var cartTot=totalCents();
  var tot=cardTargetCents!=null?cardTargetCents:cartTot;
  if(tot<=0){
    sumPhase='idle'; sumErr='';
    if(cardTargetCents!=null){ finalize({mode:'mixed',cashCents:cashGiven,cardCents:Math.max(0,cardTargetCents),changeCents:0}); }
    else { finalize({mode:'card',cashCents:0,cardCents:0,changeCents:0}); }
    return;
  }
  sumPhase='creating'; sumErr=''; sumupNextUrl=''; renderPayOverlay();
  api('/api/remote/sumup/create-checkout',{method:'POST',body:JSON.stringify({amountCents:tot,checkoutReference:makeUuid(),description:'Caisse tablette'})}).then(function(r){
    if(r.flow==='reader'){
      clientTxId=r.clientTransactionId; sumPhase='waiting';
      renderPayOverlay();
      sumPoll=setInterval(function(){
        api('/api/remote/sumup/transaction-status?clientTransactionId='+encodeURIComponent(clientTxId)).then(function(s){
          if(s.poll==='paid'){
            stopSumPoll();
            if(cardTargetCents!=null){ finalize({mode:'mixed',cashCents:cashGiven,cardCents:cardTargetCents,changeCents:0}); }
            else { finalize({mode:'card',cashCents:0,cardCents:tot,changeCents:0}); }
          }
          if(s.poll==='failed'||s.poll==='error'){ sumErr=s.detail||s.message||'Erreur'; sumPhase='error'; stopSumPoll(); renderPayOverlay(); }
        }).catch(function(e){ sumErr=e.message; sumPhase='error'; stopSumPoll(); renderPayOverlay(); });
      },2500);
      return;
    }
    checkoutId=r.checkoutId; flowOnline=true;
    sumupNextUrl=(r.nextUrl&&String(r.nextUrl).trim())||'';
    if(sumupNextUrl){ try{ window.open(sumupNextUrl,'_blank'); }catch(e){} }
    sumPhase='waiting'; renderPayOverlay();
    sumPoll=setInterval(function(){
      api('/api/remote/sumup/checkout-status?checkoutId='+encodeURIComponent(checkoutId)).then(function(s){
        if(s.error){
          sumErr=String(s.error); sumPhase='error'; stopSumPoll(); renderPayOverlay(); return;
        }
        var st=String(s.status||'').toUpperCase();
        if(st==='FAILED'||st==='EXPIRED'||(st==='ERROR'&&!s.paid)){
          sumErr='Paiement SumUp : '+st; sumPhase='error'; stopSumPoll(); renderPayOverlay(); return;
        }
        if(s.paid){
          stopSumPoll();
          if(cardTargetCents!=null){ finalize({mode:'mixed',cashCents:cashGiven,cardCents:cardTargetCents,changeCents:0}); }
          else { finalize({mode:'card',cashCents:0,cardCents:tot,changeCents:0}); }
        }
      }).catch(function(e){ sumErr=e.message||'Erreur réseau (statut SumUp)'; sumPhase='error'; stopSumPoll(); renderPayOverlay(); });
    },2500);
  }).catch(function(e){ sumErr=e.message; sumPhase='error'; renderPayOverlay(); });
}

function startSumupOnline(){ startSumup(); }

function finalize(pay){
  var wasRf=M.refundMode;
  api('/api/remote/sale/finalize',{method:'POST',body:JSON.stringify({payment:pay})}).then(function(r){
    closePay();
    alert((wasRf?'Remboursement enregistré':'Vente enregistrée')+' — Commande ' + formatOrderDigits(r.orderNumber));
    refresh();
  }).catch(function(e){ alert(e.message); });
}

function showShell(){ el('login').classList.add('hidden'); el('shell').classList.remove('hidden'); }
(function layoutLoginGate(){
  if(!TABLET_PROMPT_FOR_TOKEN){
    var lh=el('loginHelp'); if(lh) lh.innerHTML='Aucune saisie de jeton&nbsp;: cet accès est autorisé pour n’importe quel navigateur du <strong>même réseau</strong>. À utiliser seulement sur un réseau de confiance.';
    var rw=el('tokRow'); if(rw) rw.classList.add('hidden');
    var bf=el('btnForget'); if(bf) bf.classList.add('hidden');
    var bc=el('btnConnect'); if(bc) bc.textContent='Ouvrir la caisse';
  } else {
    var lh2=el('loginHelp'); if(lh2) lh2.innerHTML='Saisissez le jeton affiché sur la caisse (menu <strong>Accès distant</strong>). Il est aussi transmis en fin d’URL si vous avez utilisé «&nbsp;copier&nbsp;».';
  }
})();
if(localStorage.getItem(STORAGE)&&el('tok')) el('tok').value=localStorage.getItem(STORAGE)||'';
refresh().then(showShell).catch(function(){});
el('btnConnect').onclick=function(){
  if(!TABLET_PROMPT_FOR_TOKEN){
    refresh().then(showShell).catch(function(e){alert(e.message);});
    return;
  }
  var t=(el('tok').value||'').trim();
  if(!t){alert('Saisissez le jeton affiché dans la caisse (menu Accès distant).');return;}
  localStorage.setItem(STORAGE,t);
  refresh().then(showShell).catch(function(e){alert(e.message);});
};
el('btnForget').onclick=function(){ localStorage.removeItem(STORAGE); if(el('tok')) el('tok').value='';};
})();`

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>Caisse tablette</title>
<style>${css}</style>
</head>
<body>
<div id="login" class="login-panel">
  <h2 style="margin-top:0">Caisse tablette</h2>
  <p id="loginHelp" class="sub" style="color:var(--muted);font-size:.85rem"></p>
  <div id="tokRow"><input type="password" id="tok" placeholder="Jeton d’accès" autocomplete="off"/></div>
  <button type="button" class="btn btn-primary btn-block-pay" id="btnConnect">Se connecter</button>
  <button type="button" class="btn btn-secondary btn-block-pay" id="btnForget">Effacer le jeton enregistré</button>
</div>
<div id="shell" class="hidden tablet-app"><div id="app"></div></div>
<script>${js}</script>
</body>
</html>`
}
