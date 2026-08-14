'use strict';
/* Inspector panel chrome: the Altium-style pin keeps the panel fixed; unpinned
   it folds away (maximizing the canvas) and slides back whenever something is
   selected. A slim chevron handle on the divider midpoint folds/unfolds it by
   hand — pin or no pin — and dragging the panel down to almost nothing folds
   it too. The left-edge grip resizes it within sane bounds. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,nodeById,insp,inspShow,inspHide,inspScheduleHide,inspSetWidth,
 inspFinishResize,INSP_HIDE_MS,INSP_MIN_W,INSP_COLLAPSE_W,INSP_TINY_W,undo};`);
const T=window.__T,S=T.S,doc=window.document;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();

const aside=doc.getElementById('inspector'), pin=doc.getElementById('inspPin'),
      handle=doc.getElementById('inspHandle'), grip=doc.getElementById('inspResize');
const collapsed=()=>aside.classList.contains('collapsed');
const folded=()=>handle.classList.contains('folded');

check('the panel carries a pin button, a divider handle and a resize grip', !!pin && !!handle && !!grip);
check('the pin renders the thumbtack icon', !!pin.querySelector('svg path'));
check('the handle arrow is three near-vertical chevron strokes (no shaft)',
  handle.querySelectorAll('svg polyline').length===3 && !handle.querySelector('svg line, svg path'));
check('the panel starts pinned and visible, handle arrow pointing right', T.insp.pinned && !collapsed() && !folded());
check('the auto-hide countdown is 3 seconds', T.INSP_HIDE_MS===3000);

/* ---- pinned: the countdown never hides it, but the handle does ---- */
S.sel=null; T.render();
T.inspHide();
check('a pinned panel never folds away on the idle countdown', !collapsed());
handle.onclick();
check('the handle folds even a PINNED panel', collapsed() && T.insp.pinned);
check('folded, the handle mirrors its arrow to point left', folded());
handle.onclick();
check('clicking the folded handle brings the panel back (still pinned)', !collapsed() && !folded() && T.insp.pinned);

/* ---- unpin: folds away when idle ---- */
pin.onclick();
check('clicking the pin unpins it (tilted state)', !T.insp.pinned && !pin.classList.contains('pinned'));
check('unpinning arms the auto-hide countdown', T.insp.hideT!=null);
T.inspHide();   // what the countdown fires
check('an unpinned idle panel folds away completely', collapsed() && folded());

/* ---- selecting a block brings it back, deselecting lets it fold again ---- */
S.sel={type:'node',id:S.nodes[0].id}; T.render();
check('selecting a block slides the hidden panel back in', !collapsed() && !folded());
check('the selection buys a fresh idle window', T.insp.hideT!=null);
S.sel=null; T.render();
T.inspHide();
check('after deselecting, the idle countdown folds it away again', collapsed());
handle.onclick();
check('the handle reopens it by hand', !collapsed());
T.inspHide();
check('reopened without pinning, it still auto-hides', collapsed());

/* ---- re-pin: visible and permanent again ---- */
pin.onclick();
check('re-pinning shows the panel and keeps it there', T.insp.pinned && !collapsed());

/* ---- horizontal resize with live content width ---- */
T.inspSetWidth(500);
check('the grip resizes the panel (inline width applied)', aside.style.width==='500px' && T.insp.w===500);
check('the content min-width tracks the panel width (--inspw)', aside.style.getPropertyValue('--inspw')==='500px');
T.inspSetWidth(10);
check('the width clamps at a usable minimum', T.insp.w===T.INSP_MIN_W);
T.inspSetWidth(99999);
check('the width clamps at 70% of the window', T.insp.w===Math.round(window.innerWidth*0.7));

/* ---- dragging the panel to almost nothing folds it (like the handle) ---- */
T.inspSetWidth(60, true);
check('mid-drag the panel may shrink below the usable minimum', T.insp.w===60);
T.inspFinishResize(420);
check('dropping a nearly-invisible panel folds it away', collapsed() && folded());
check('…and it remembers its pre-drag width for reopening', T.insp.w===420);
handle.onclick();
check('the handle brings it back at that width', !collapsed() && aside.style.width==='420px');
T.inspSetWidth(300, true);
T.inspFinishResize(420);
check('dropping at a usable width just resizes, no fold', !collapsed() && T.insp.w===300);

/* ---------- editing an existing net: the "✎" next to the "✕" ---------- */
{
  // pick a net that lives on MORE than one connection, so the rename's
  // everywhere-propagation is actually exercised
  const byName={};
  S.edges.forEach(e=>e.nets.forEach(n=>{ byName[n.name]=(byName[n.name]||0)+1; }));
  const shared=Object.keys(byName).find(k=>byName[k]>1);
  const edge=S.edges.find(e=>e.nets.some(n=>n.name===shared));
  S.sel={type:'edge',id:edge.id}; T.render();
  const body=doc.getElementById('insBody');
  const pen=body.querySelector('[data-editnet]');
  check('every net card carries a pencil next to the red cross',
    !!pen && body.querySelectorAll('[data-editnet]').length===body.querySelectorAll('[data-delnet]').length &&
    pen.textContent==='✎');
  const idx=edge.nets.findIndex(n=>n.name===shared);
  const oldDesc=edge.nets[idx].description;
  body.querySelector(`[data-editnet="${idx}"]`).onclick();
  check('the pencil flips the card into editable text with Save / Discard',
    doc.getElementById('enName') && doc.getElementById('enName').value===shared &&
    !!doc.getElementById('enDesc') && !!doc.getElementById('enSave') && !!doc.getElementById('enCancel'));
  doc.getElementById('enName').value='SHOULD_NOT_STICK';
  doc.getElementById('enCancel').onclick();
  check('Discard puts the card back untouched',
    !doc.getElementById('enName') && edge.nets[idx].name===shared);
  doc.getElementById('insBody').querySelector(`[data-editnet="${idx}"]`).onclick();
  doc.getElementById('enName').value='renamed net 9';   // sloppy input on purpose
  doc.getElementById('enDesc').value='fresh description';
  doc.getElementById('enSave').onclick();
  check('Save normalizes the name like every other net entry',
    edge.nets.some(n=>n.name==='RENAMED_NET_9'));
  const copies=S.edges.reduce((s,e)=>s+e.nets.filter(n=>n.name==='RENAMED_NET_9').length,0);
  check('the rename lands on EVERY connection carrying the net',
    copies===byName[shared] && !S.edges.some(e=>e.nets.some(n=>n.name===shared)));
  check('…and the description follows on every copy',
    S.edges.every(e=>e.nets.every(n=>n.name!=='RENAMED_NET_9' || n.description==='fresh description')));
  check('the card is back in display mode', !doc.getElementById('enName'));
  T.undo();
  check('the whole edit is ONE undoable step',
    S.edges.some(e=>e.nets.some(n=>n.name===shared && n.description===oldDesc)) &&
    !S.edges.some(e=>e.nets.some(n=>n.name==='RENAMED_NET_9')));
  // a rename that collides with a sibling net on the same connection is refused
  const multi=S.edges.find(e=>e.nets.length>1);
  if (multi){
    S.sel={type:'edge',id:multi.id}; T.render();
    doc.getElementById('insBody').querySelector('[data-editnet="0"]').onclick();
    doc.getElementById('enName').value=multi.nets[1].name;
    doc.getElementById('enSave').onclick();
    check('a rename colliding with a sibling net on the same connection is refused',
      multi.nets[0].name!==multi.nets[1].name && !!doc.getElementById('enName'));
  }
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
