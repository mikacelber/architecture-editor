'use strict';
/* Inspector panel chrome: the Altium-style pin keeps the panel fixed; unpinned
   it folds away (maximizing the canvas) and slides back whenever something is
   selected; the left-edge grip resizes it within sane bounds. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,nodeById,insp,inspShow,inspHide,inspScheduleHide,inspSetWidth,
 INSP_HIDE_MS,INSP_MIN_W};`);
const T=window.__T,S=T.S,doc=window.document;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();

const aside=doc.getElementById('inspector'), pin=doc.getElementById('inspPin'),
      tab=doc.getElementById('inspTab'), grip=doc.getElementById('inspResize');
const collapsed=()=>aside.classList.contains('collapsed');

check('the panel carries a pin button, a drawer tab and a resize grip', !!pin && !!tab && !!grip);
check('the pin renders the thumbtack icon', !!pin.querySelector('svg path'));
check('the panel starts pinned and visible', T.insp.pinned && pin.classList.contains('pinned') && !collapsed());

/* ---- pinned: the panel never hides ---- */
S.sel=null; T.render();
T.inspHide();
check('a pinned panel never folds away', !collapsed());

/* ---- unpin: folds away when idle, drawer tab appears ---- */
pin.onclick();
check('clicking the pin unpins it (tilted state)', !T.insp.pinned && !pin.classList.contains('pinned'));
check('unpinning arms the auto-hide countdown', T.insp.hideT!=null);
T.inspHide();   // what the countdown fires
check('an unpinned idle panel folds away completely', collapsed());
check('the drawer tab appears at the canvas edge while hidden', tab.classList.contains('show'));

/* ---- selecting a block brings it back, deselecting lets it fold again ---- */
S.sel={type:'node',id:S.nodes[0].id}; T.render();
check('selecting a block slides the hidden panel back in', !collapsed() && !tab.classList.contains('show'));
check('the selection buys a fresh idle window', T.insp.hideT!=null);
S.sel=null; T.render();
T.inspHide();
check('after deselecting, the idle countdown folds it away again', collapsed());

/* ---- the drawer tab reopens it by hand ---- */
tab.onclick();
check('clicking the drawer tab reopens the panel', !collapsed());
T.inspHide();
check('reopened without pinning, it still auto-hides', collapsed());

/* ---- re-pin: visible and permanent again ---- */
pin.onclick();
check('re-pinning shows the panel and disarms the countdown',
  T.insp.pinned && pin.classList.contains('pinned') && !collapsed() && T.insp.hideT==null || T.insp.pinned && !collapsed());

/* ---- horizontal resize with live content width ---- */
T.inspSetWidth(500);
check('the grip resizes the panel (inline width applied)', aside.style.width==='500px' && T.insp.w===500);
check('the content min-width tracks the panel width (--inspw)', aside.style.getPropertyValue('--inspw')==='500px');
T.inspSetWidth(10);
check('the width clamps at a usable minimum', T.insp.w===T.INSP_MIN_W);
T.inspSetWidth(99999);
check('the width clamps at 70% of the window', T.insp.w===Math.round(window.innerWidth*0.7));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
