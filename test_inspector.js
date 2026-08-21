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

/* ---- a live selection keeps the panel up, as if pinned ---- */
S.sel={type:'node',id:S.nodes[0].id}; T.render();
check('selecting a block slides the hidden panel back in', !collapsed() && !folded());
check('while something is selected there is NO idle countdown (acts pinned)', T.insp.hideT==null);
T.inspHide();   // a stray countdown tick
check('even a stray hide tick cannot fold the panel while the selection lives', !collapsed());
T.render();
check('re-rendering the same selection keeps it visible — no hide/show flicker', !collapsed() && T.insp.hideT==null);
S.sel=null; T.render();
check('deselecting re-arms the idle countdown', T.insp.hideT!=null);
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
  check('the edit card offers the net TYPE, preselected to the current one',
    !!doc.getElementById('enType') && doc.getElementById('enType').value===edge.nets[idx].type);
  doc.getElementById('enName').value='SHOULD_NOT_STICK';
  doc.getElementById('enCancel').onclick();
  check('Discard puts the card back untouched',
    !doc.getElementById('enName') && edge.nets[idx].name===shared);
  doc.getElementById('insBody').querySelector(`[data-editnet="${idx}"]`).onclick();
  doc.getElementById('enName').value='renamed net 9';   // sloppy input on purpose
  doc.getElementById('enDesc').value='fresh description';
  doc.getElementById('enType').value='ANALOG_SIGNAL';
  doc.getElementById('enSave').onclick();
  check('Save normalizes the name like every other net entry',
    edge.nets.some(n=>n.name==='RENAMED_NET_9'));
  const copies=S.edges.reduce((s,e)=>s+e.nets.filter(n=>n.name==='RENAMED_NET_9').length,0);
  check('the rename lands on EVERY connection carrying the net',
    copies===byName[shared] && !S.edges.some(e=>e.nets.some(n=>n.name===shared)));
  check('…and the description follows on every copy',
    S.edges.every(e=>e.nets.every(n=>n.name!=='RENAMED_NET_9' || n.description==='fresh description')));
  check('…and the new TYPE lands on every copy too',
    S.edges.every(e=>e.nets.every(n=>n.name!=='RENAMED_NET_9' || n.type==='ANALOG_SIGNAL')));
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

/* ---------- Edit External…: name, description, optional PN + datasheet ---------- */
{
  const ext = S.nodes.find(n=>n.kind==='external' && S.edges.some(e=>e.source===n.id||e.target===n.id));
  const oldId = ext.id, wires = S.edges.filter(e=>e.source===oldId||e.target===oldId).length;
  S.sel={type:'node',id:oldId}; T.render();
  const btn=doc.getElementById('btnEditExt');
  check('the external inspector leads with "Edit External…" like the IC one',
    !!btn && !doc.getElementById('btnSelectIC'));
  check('with no hand-entered identity there are no PN/datasheet rows',
    !/Part number/.test(doc.getElementById('insBody').innerHTML));
  btn.onclick();
  check('the modal opens prefilled, with optional PN and datasheet fields',
    doc.getElementById('xName').value===ext.label &&
    !!doc.getElementById('xPN') && !!doc.getElementById('xUrl') &&
    /no distributor search/.test(doc.getElementById('modalBody').innerHTML));
  doc.getElementById('xName').value='Custom HV connector';
  doc.getElementById('xDesc').value='hand-picked part';
  doc.getElementById('xPN').value='MOLEX-1234-5678';
  doc.getElementById('xUrl').value='https://x/molex.pdf';
  doc.getElementById('mOk').onclick();
  const renamed=T.nodeById('EXT:Custom HV connector');
  check('Save renames the block and keeps every connection',
    !!renamed && !T.nodeById(oldId) && renamed.label==='Custom HV connector' &&
    S.edges.filter(e=>e.source===renamed.id||e.target===renamed.id).length===wires);
  check('the hand-entered PN and datasheet land on the block',
    renamed.data.part_number==='MOLEX-1234-5678' && renamed.data.DatasheetUrl==='https://x/molex.pdf');
  T.render();
  const b=doc.getElementById('insBody').innerHTML;
  check('…and the inspector shows them: PN row and shortened datasheet link',
    /MOLEX-1234-5678/.test(b) && /x\/molex\.pdf/.test(b));
  // a collision with another external is refused
  const other=S.nodes.find(n=>n.kind==='external' && n.id!==renamed.id);
  doc.getElementById('btnEditExt').onclick();
  doc.getElementById('xName').value=other.label;
  doc.getElementById('mOk').onclick();
  check('renaming onto another external\'s name is refused',
    !!T.nodeById(renamed.id) && T.nodeById(renamed.id).label==='Custom HV connector');
  doc.getElementById('modalClose').onclick();
  // clearing the optional fields removes them
  S.sel={type:'node',id:renamed.id}; T.render();
  doc.getElementById('btnEditExt').onclick();
  doc.getElementById('xPN').value=''; doc.getElementById('xUrl').value='';
  doc.getElementById('mOk').onclick();
  check('emptying the optional fields removes them cleanly',
    !('part_number' in renamed.data) && !('DatasheetUrl' in renamed.data));
  T.undo(); T.undo();
  check('each edit is one undoable step — the original name is two undos back',
    !!T.nodeById(oldId));
}

/* ---------- moving a net's leg to another block via the edit card ---------- */
{
  const solo = S.edges.find(e=>e.nets.length===1);
  const soloId = solo.id, src = solo.source, oldTgt = solo.target, netName = solo.nets[0].name;
  const newTgt = S.nodes.find(n=>n.id!==src && n.id!==oldTgt &&
    !S.edges.some(e=>e.source===src && e.target===n.id && e.nets.some(x=>x.name===netName))).id;
  S.sel={type:'edge',id:soloId}; T.render();
  doc.querySelector('#insBody [data-editnet]').onclick();
  check('the edit card offers the two endpoint blocks as selectors',
    !!doc.getElementById('enFrom') && !!doc.getElementById('enTo') &&
    doc.getElementById('enFrom').value===src && doc.getElementById('enTo').value===oldTgt);
  {
    const groupTitleOf = id => (S.groups.find(g=>g.members.includes(id)) || { title:'Ungrouped' }).title;
    const firstOg = sel => doc.getElementById(sel).querySelector('optgroup');
    check('the block lists are ordered by functional group (one optgroup each)',
      doc.getElementById('enFrom').querySelectorAll('optgroup').length>1 &&
      doc.getElementById('enTo').querySelectorAll('optgroup').length>1);
    check('…and the current block\'s group always leads its own list',
      firstOg('enFrom').label===groupTitleOf(src) &&
      firstOg('enTo').label===groupTitleOf(oldTgt) &&
      !!firstOg('enFrom').querySelector(`option[value="${src}"]`) &&
      !!firstOg('enTo').querySelector(`option[value="${oldTgt}"]`));
  }
  check('there is no separate "Delete connection" button any more — the "✕" is the way',
    !doc.getElementById('btnDelEdge'));
  doc.getElementById('enTo').value=newTgt;
  doc.getElementById('enSave').onclick();
  const dst=S.edges.find(e=>e.source===src && e.target===newTgt && e.nets.some(x=>x.name===netName));
  check('changing the block MOVES the leg: the new pair now carries the net', !!dst);
  check('…the old block lost the connection entirely (it only carried this net)',
    !S.edges.some(e=>e.id===soloId));
  check('…with no empty-connection leftovers, hence no warning',
    !S.edges.some(e=>e.nets.length===0) &&
    !/without nets/.test(doc.getElementById('statusBar').textContent));
  check('…and the selection follows the net to its new wire',
    S.sel && S.sel.type==='edge' && S.sel.id===dst.id);
  T.undo();
  check('one undo puts the leg back where it was',
    S.edges.some(e=>e.id===soloId && e.nets.some(x=>x.name===netName)) &&
    !S.edges.some(e=>e.source===src && e.target===newTgt && e.nets.some(x=>x.name===netName)));
  // same endpoints → a plain rename/description edit, no move
  S.sel={type:'edge',id:soloId}; T.render();
  doc.querySelector('#insBody [data-editnet]').onclick();
  doc.getElementById('enSave').onclick();
  check('saving with the endpoints untouched moves nothing',
    S.edges.some(e=>e.id===soloId));
  T.undo();
}

/* ---------- deleting the last net takes the connection with it ---------- */
{
  // the real-world shape: a net whose consumers each hang off their OWN
  // connection, so that connection exists solely to carry it
  const solo = S.edges.find(e=>e.nets.length===1);
  const soloId = solo.id, soloNet = solo.nets[0].name;
  S.sel={type:'edge',id:soloId}; T.render();
  doc.querySelector('#insBody [data-delnet]').onclick();
  check('removing the only net of a connection removes the connection too',
    !S.edges.some(e=>e.id===soloId));
  check('…so it never lingers as a "carries no nets" warning',
    !S.edges.some(e=>e.nets.length===0));
  check('…and the selection lets go of the deleted connection', !S.sel);
  T.undo();
  check('one undo brings back both the net and its connection',
    S.edges.some(e=>e.id===soloId && e.nets.some(n=>n.name===soloNet)));
  // a connection with several nets keeps living after one is dropped
  const multi = S.edges.find(e=>e.nets.length>1);
  if (multi){
    const before = multi.nets.length;
    S.sel={type:'edge',id:multi.id}; T.render();
    doc.querySelector('#insBody [data-delnet]').onclick();
    check('a connection carrying other nets survives losing one',
      S.edges.some(e=>e.id===multi.id) && multi.nets.length===before-1);
    T.undo();
  }
}

/* ---------- clickable warnings → Issues panel → jump + spotlight ---------- */
{
  // manufacture an issue: strip the nets from a same-group connection (the
  // fixture's ICs are unselected proposals already, so that chip exists too)
  const inSame = e => S.groups.some(g=>g.members.includes(e.source)&&g.members.includes(e.target));
  const victim = S.edges.find(e=>e.nets.length>0 && inSame(e));
  victim.nets.length=0;
  S.sel=null; S.openGroup=null; T.render();
  const chips=[...doc.querySelectorAll('#statusBar [data-issues]')];
  check('warning chips on the status bar are clickable buttons',
    chips.length>=2 && chips.every(b=>b.tagName==='BUTTON'));
  chips[0].onclick();
  check('clicking a chip opens the Issues panel listing every problem in detail',
    doc.getElementById('insEyebrow').textContent==='Issues' &&
    doc.querySelectorAll('#insBody .issue').length>0 &&
    /Connections without nets/.test(doc.getElementById('insBody').innerHTML) &&
    /ICs without a selected part/.test(doc.getElementById('insBody').innerHTML));
  const item=doc.querySelector(`#insBody [data-iss-edge="${victim.id}"]`);
  check('the empty connection is listed with both endpoints named',
    !!item && item.textContent.includes(T.nodeById(victim.source).label));
  item.onclick();
  check('clicking the entry jumps to the exact sheet and selects the culprit',
    S.openGroup!==null && S.sel && S.sel.type==='edge' && S.sel.id===victim.id);
  // a netless connection has no wire on the sheet (that IS the problem) — the
  // spotlight lights its two endpoint blocks instead, everything else dims
  check('…and spotlights it: the endpoint blocks stay lit while the rest dims',
    S.spotlight && S.spotlight.id===victim.id &&
    (()=>{ const g=[...doc.querySelectorAll('#nodesG g[data-nid]')];
      const src=g.find(x=>x.dataset.nid===victim.source), tgt=g.find(x=>x.dataset.nid===victim.target);
      return src && tgt && !src.classList.contains('dim') && !tgt.classList.contains('dim'); })() &&
    doc.querySelectorAll('#nodesG g.dim').length>0);
  // a block entry: an unpicked IC
  S.sel={type:'issues'}; T.render();
  const nodeItem=doc.querySelector('#insBody [data-iss-node]');
  const nid=nodeItem.dataset.issNode;
  nodeItem.onclick();
  const nodeG=[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid===nid);
  check('a block entry opens its sheet, selects and spotlights the block',
    S.sel.type==='node' && S.sel.id===nid && S.spotlight && S.spotlight.id===nid &&
    !!nodeG && !nodeG.classList.contains('dim') &&
    doc.querySelectorAll('#nodesG g.dim').length>0);
  doc.getElementById('board').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));
  check('the next canvas click lifts the spotlight', !S.spotlight);
  // leftovers from before the auto-cleanup existed: swept in one click
  S.sel={type:'issues'}; T.render();
  const sweep=doc.getElementById('btnDropEmpty');
  check('the panel offers a one-click sweep of the empty connections',
    !!sweep && /1 empty connection/.test(sweep.textContent));
  sweep.onclick();
  check('…which drops them all and clears that warning',
    !S.edges.some(e=>e.nets.length===0) &&
    (S.sel=null, T.render(), !/without nets/.test(doc.getElementById('statusBar').textContent)));
  T.undo();
  check('the System panel offers the same list when issues exist',
    (S.sel=null, S.openGroup=null, T.render(), !!doc.getElementById('btnIssues')));
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
