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
 inspFinishResize,INSP_HIDE_MS,INSP_MIN_W,INSP_COLLAPSE_W,INSP_TINY_W};`);
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

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
