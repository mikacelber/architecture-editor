'use strict';
/* Boot state and on-canvas view controls.

   The editor starts EMPTY — no example system is embedded any more. A blank
   sheet offers exactly one action: a "+" card in the middle of the canvas
   that opens the very same Import dialog as the header button. Once a system
   is loaded the card steps aside, and it comes back if the sheet is emptied.

   Bottom-right of the canvas sit three icon-only buttons — zoom out, zoom in
   and fit — each naming itself on hover. Button zoom scales about the centre
   of the sheet, shares the wheel's limits, and greys out at them. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
const appSrc=fs.readFileSync('app.js','utf8');
window.eval(appSrc+`
window.__T={get S(){return S;},loadFromContract,render,fitView,zoomAbout,zoomStep,updateViewTools,
 openImportModal,closeModal,currentBlocksForBounds,
 ZOOM_MIN:ZOOM_MIN,ZOOM_MAX:ZOOM_MAX,ZOOM_STEP:ZOOM_STEP};`);
const T=window.__T,S=T.S,doc=window.document;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};

const empty=doc.getElementById('emptyState'), plus=doc.getElementById('emptyAdd'),
      tools=doc.getElementById('viewTools'), overlay=doc.getElementById('modalOverlay');

/* ---------- the sheet boots empty ---------- */
check('app.js embeds no example system any more', !/const PRELOADED\s*=\s*\{/.test(appSrc));
check('boot loads nothing — the sheet starts with zero blocks', S.nodes.length===0 && S.edges.length===0);
check('the empty-sheet card is visible on a fresh page', !!empty && !empty.hidden);
check('the card is a "+" button — a plus glyph, no words',
  !!plus && plus.querySelectorAll('svg line').length===2 && plus.textContent.trim()==='');
check('the card explains itself in the tooltip', /import/i.test(plus.getAttribute('title')||''));
check('the status bar makes no claim about blocks that do not exist',
  !/all blocks connected/.test(doc.getElementById('statusBar').innerHTML));

/* ---------- the "+" opens Import, same dialog as the header button ---------- */
check('the Import dialog starts closed', !overlay.classList.contains('open'));
plus.onclick();
check('clicking "+" opens the Import dialog', overlay.classList.contains('open') &&
  doc.getElementById('modalTitle').textContent==='Import');
check('…with both import paths (system JSON and saved session)',
  !!doc.getElementById('tabA') && !!doc.getElementById('tabB') &&
  !!doc.getElementById('impSys') && !!doc.getElementById('impSess'));
check('the header Import button raises the same dialog function',
  /\$\('btnImport'\)\.onclick=openImportModal;/.test(appSrc) &&
  /\$\('emptyAdd'\)\.onclick=openImportModal;/.test(appSrc));
T.closeModal();

/* ---------- it steps aside once a system is loaded, and returns ---------- */
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
check('loading a system hides the empty-sheet card', S.nodes.length>0 && empty.hidden);
const savedNodes=S.nodes.slice(), savedEdges=S.edges.slice();
S.nodes.length=0; S.edges.length=0; T.render();
check('emptying the sheet brings the card back', !empty.hidden);
S.nodes.push(...savedNodes); S.edges.push(...savedEdges); T.render();
check('restoring the blocks hides it again', empty.hidden);

/* ---------- view controls: bottom-right, icons only, self-naming ---------- */
check('the canvas carries a view-control cluster', !!tools);
const btns=[...tools.querySelectorAll('button')];
check('it holds exactly three buttons: zoom out, zoom in, fit',
  btns.length===3 && btns.map(b=>b.id).join(',')==='btnZoomOut,btnZoomIn,btnZoomFit');
check('every button is icon-only (no words)', btns.every(b=>b.textContent.trim()==='' && !!b.querySelector('svg')));
check('every button names its function on hover',
  btns.every(b=>/\S/.test(b.getAttribute('title')||'')) &&
  /zoom out/i.test(btns[0].title) && /zoom in/i.test(btns[1].title) && /fit/i.test(btns[2].title));
check('the zoom icons are magnifiers — a lens with a handle',
  btns.slice(0,2).every(b=>b.querySelectorAll('svg circle').length===1 && b.querySelectorAll('svg line').length>=2));
check('zoom out carries one bar, zoom in carries two (the +)',
  btns[0].querySelectorAll('svg line').length===2 && btns[1].querySelectorAll('svg line').length===3);
check('the fit icon is four corner brackets around an inner rectangle',
  btns[2].querySelectorAll('svg polyline').length===4 && btns[2].querySelectorAll('svg rect').length===1);
check('fit lives on the canvas only — the header no longer duplicates it',
  !doc.getElementById('btnFit') && !/id="btnFit"/.test(fs.readFileSync('index.html','utf8')));
{
  const css=fs.readFileSync('styles.css','utf8');
  const rule=(css.match(/#viewTools\{[^}]*\}/)||[''])[0];
  check('the cluster is pinned to the bottom-right of the canvas',
    /position:absolute/.test(rule) && /right:\s*\d/.test(rule) && /bottom:\s*\d/.test(rule));
}

/* ---------- zoom behaviour ---------- */
S.view={tx:0,ty:0,k:1};
T.updateViewTools();
const k0=S.view.k;
btns[1].onclick();
check('zoom in scales the view up by one step', Math.abs(S.view.k-k0*T.ZOOM_STEP)<1e-9);
btns[0].onclick();
check('zoom out returns to where it started', Math.abs(S.view.k-k0)<1e-9);
{
  // the world point under the sheet's centre must not drift while zooming
  const cx=800, cy=500;                            // stubbed svg is 1600x1000
  const worldAt=()=>({x:(cx-S.view.tx)/S.view.k, y:(cy-S.view.ty)/S.view.k});
  const before=worldAt();
  btns[1].onclick(); btns[1].onclick();
  const after=worldAt();
  check('button zoom keeps the centre of the sheet fixed',
    Math.abs(before.x-after.x)<1e-6 && Math.abs(before.y-after.y)<1e-6);
}
for (let i=0;i<40;i++) btns[1].onclick();
check('zoom in never passes the wheel\'s upper limit', S.view.k===T.ZOOM_MAX);
check('…and the button greys out there', btns[1].disabled && !btns[0].disabled);
for (let i=0;i<60;i++) btns[0].onclick();
check('zoom out never passes the lower limit', S.view.k===T.ZOOM_MIN);
check('…and that button greys out instead', btns[0].disabled && !btns[1].disabled);
check('the wheel and the buttons share one zoom implementation',
  /svg\.addEventListener\('wheel'[\s\S]{0,240}zoomAbout\(/.test(appSrc));

/* ---------- fit ---------- */
S.view={tx:-9999,ty:-9999,k:T.ZOOM_MIN};
btns[2].onclick();
{
  const blocks=T.currentBlocksForBounds();   // what fitView actually frames
  const minX=Math.min(...blocks.map(n=>n.x)), maxX=Math.max(...blocks.map(n=>n.x+n.w));
  const cx=(minX+maxX)/2, screenX=cx*S.view.k+S.view.tx;
  check('fit reframes the diagram (view no longer parked off-sheet)', S.view.tx>-9999 && S.view.k>T.ZOOM_MIN);
  check('fit centres the diagram horizontally in the sheet', Math.abs(screenX-800)<2);
}
check('fit re-enables the zoom buttons it can serve', !btns[1].disabled);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
