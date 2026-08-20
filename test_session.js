'use strict';
/* Save session → Import session must be LOSSLESS: after a round trip the
   document has to render pixel-identically — every block position, every
   FROM/TO column, every manually routed wire, every port layout and the
   framing itself. The test edits a document in every way the editor allows,
   exports it, loads a DIFFERENT document over the top (so nothing can survive
   by accident), then imports the saved session and diffs the rendered SVG. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,loadSession,buildSessionJSON,render,openGroupView,closeGroupView,
 drillSheet,groupsWithUngrouped,nodeById,setPortalOffset,movePortalSlotToRow,setGroupEdgeRoute,setGroupPortSide,
 moveNodePortToRow,computeGroupEdges,groupEdgeRouteKey,diagramEdges,resetPortalBase,fitView,
 icSelected,buildPipelineJSON};`);
const T=window.__T,S=T.S,doc=window.document;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;

// Full rendered geometry of whatever is on screen right now.
const snap=()=>({
  wires:[...doc.querySelectorAll('#edgesG path')].map(p=>p.getAttribute('d')).join(';'),
  nodes:[...doc.querySelectorAll('#nodesG .node')].map(n=>n.dataset.nid+'@'+n.getAttribute('transform')).join('|'),
  portals:[...doc.querySelectorAll('#edgesG .portal')].map(p=>
    p.dataset.portal+'@'+p.dataset.x+','+p.dataset.y+','+p.dataset.w+','+p.dataset.h).join('|'),
  slots:[...doc.querySelectorAll('#edgesG .slothandle circle')].map(c=>c.getAttribute('cx')+','+c.getAttribute('cy')).join('|'),
  ports:[...doc.querySelectorAll('#nodesG .portnum rect')].map(r=>r.getAttribute('x')+','+r.getAttribute('y')).join('|'),
});

T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
const groups=T.groupsWithUngrouped().filter(g=>g.members.length)
  .map(g=>({id:g.id,n:g.members.length})).sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id));
const gA=groups[0].id, gB=groups[1].id;
check('fixture has two non-empty groups to exercise', !!gA && !!gB);

/* ---- edit the document in every persistent way ---- */
{
  // top level: group positions and a hand-routed group connection
  const ge=T.computeGroupEdges()[0];
  T.setGroupEdgeRoute(ge.source,ge.target,{pts:[[10,20],[10,140],[260,140],[260,300]]});
  S.groupPos[gA]={x:744,y:312}; S.groupPos[gB]={x:1416,y:96};
  T.setGroupPortSide(ge.source,ge.source,ge.target,'left');

  // group A: member drags (including one that changes the vertical extreme),
  // dragged portal columns, a reordered portal slot and a hand-routed wire
  T.openGroupView(gA);
  const mem=T.groupsWithUngrouped().find(g=>g.id===gA).members;
  T.nodeById(mem[0]).x-=168; T.nodeById(mem[0]).y-=600;
  if (mem[1]) { T.nodeById(mem[1]).x+=96; T.nodeById(mem[1]).y+=240; }
  T.setPortalOffset(gA,'in',-144,96);
  T.setPortalOffset(gA,'out',192,-48);
  const rp=T.drillSheet().portals.find(p=>p.unders.length>=2);
  if (rp) T.movePortalSlotToRow(rp.key,rp.unders[1].id,0);
  // NB: drillSheet specs carry copies of the edges (diagramEdges spreads them),
  // so a manual route has to be written onto the real edge, as the drag does.
  const ie=T.drillSheet().specs.find(s=>s.kind==='internal');
  if (ie) S.edges.find(x=>x.id===ie.e.id).route=
    {pts:[[ie.pa.x,ie.pa.y],[ie.pa.x,ie.pa.y+72],[ie.pb.x,ie.pa.y+72],[ie.pb.x,ie.pb.y]]};
  // a reordered port row on a member block
  const withRows=mem.map(id=>T.nodeById(id)).find(n=>T.drillSheet().specs.some(s=>s.e.source===n.id||s.e.target===n.id));
  if (withRows) T.moveNodePortToRow(withRows.id, T.groupEdgeRouteKey(
    T.drillSheet().specs.find(s=>s.e.source===withRows.id||s.e.target===withRows.id).e.source,
    T.drillSheet().specs.find(s=>s.e.source===withRows.id||s.e.target===withRows.id).e.target), 0);
  // an LV|HV flip, and a per-net domain flag
  const grpA=S.groups.find(x=>x.id===gA); if (grpA) grpA.hvFlip=true;
  const anyNet=S.edges[0].nets[0]; anyNet.hv=!anyNet.hv;
  T.render();
}

// Geometry is world-space, so these snapshots are independent of the framing.
const beforeA=snap();
T.closeGroupView(); T.render();
const beforeTop=snap();
T.openGroupView(gB); T.render();
const beforeB=snap();
T.openGroupView(gA);               // save while inside group A, as the user does
// ...with a deliberately odd framing, nothing near what fitView would choose
S.view={tx:-317,ty:661,k:0.734}; T.render();
const viewBefore=JSON.stringify(S.view), openBefore=S.openGroup;

/* ---- export, then load a DIFFERENT document over the top ---- */
const saved=JSON.parse(JSON.stringify(T.buildSessionJSON()));
check('the saved session carries the portal columns, their order and anchor',
  !!saved.portalOffsets && !!saved.portalOrder && !!saved.portalAnchor);
check('the saved session carries the framing and the open group',
  !!saved.view && saved.view.k===0.734 && saved.openGroup===gA);
check('the saved session carries manual wire routes (one per sheet)',
  Object.keys(saved.groupEdgeRoutes).length>0 &&
  saved.edges.some(e=>e.routes&&Object.values(e.routes).some(r=>r.pts)));

T.loadFromContract(fx.input,fx.contract,fx.groups);
T.openGroupView(gB);
T.groupsWithUngrouped().find(g=>g.id===gB).members.forEach(id=>{
  const n=T.nodeById(id); n.x+=2400; n.y+=1800; });
T.setPortalOffset(gB,'in',-600,-300);
T.render();

/* ---- import and diff ---- */
T.loadSession(JSON.parse(JSON.stringify(saved)));
check('the session reopens on the group it was saved in', S.openGroup===openBefore);
check('the framing is restored exactly (no fit-to-view override)', JSON.stringify(S.view)===viewBefore);
const afterA=snap();
for (const k of Object.keys(beforeA)) check('group A renders identically after the round trip — '+k, beforeA[k]===afterA[k]);
T.closeGroupView(); T.render();
const afterTop=snap();
for (const k of Object.keys(beforeTop)) check('the system view renders identically after the round trip — '+k, beforeTop[k]===afterTop[k]);
T.openGroupView(gB); T.render();
const afterB=snap();
for (const k of Object.keys(beforeB)) check('group B renders identically after the round trip — '+k, beforeB[k]===afterB[k]);

/* ---- an older session (no view, no portal anchor) still loads sanely ---- */
{
  const legacy=JSON.parse(JSON.stringify(saved));
  delete legacy.view; delete legacy.portalAnchor; delete legacy.portalOrder;
  T.loadSession(legacy);
  check('a session without a saved framing still loads (fit-to-view fallback)', S.view.k>0);
  check('a session without a portal anchor re-anchors instead of crashing',
    T.drillSheet().portals.every(p=>Number.isFinite(p.r.y)));
}

/* ---- re-entering a group must not shuffle its columns ---- */
{
  T.loadSession(JSON.parse(JSON.stringify(saved)));
  const y0=T.drillSheet().portals.map(p=>p.key+'@'+p.r.y).join('|');
  T.closeGroupView(); T.openGroupView(gA); T.render();
  check('re-opening a group leaves the FROM/TO columns exactly where they were',
    T.drillSheet().portals.map(p=>p.key+'@'+p.r.y).join('|')===y0);
  // ...but in-group Auto-layout is still allowed to re-anchor them
  const mv=T.nodeById(T.groupsWithUngrouped().find(g=>g.id===gA).members[0]);
  mv.y-=480; T.render();
  const yMoved=T.drillSheet().portals.map(p=>p.key+'@'+p.r.y).join('|');
  check('a block drag alone never tows the columns', yMoved===y0);
  T.resetPortalBase(); T.render();
  check('Auto-layout re-anchors the columns to the current blocks',
    T.drillSheet().portals.map(p=>p.key+'@'+p.r.y).join('|')!==y0);
}

/* ---------- an imported block takes its NAME from its part card ---------- */
{
  T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
  const ic = S.nodes.find(n=>n.kind==='ic' && S.edges.some(e=>e.source===n.id||e.target===n.id));
  const oldId = ic.id, wires = S.edges.filter(e=>e.source===oldId||e.target===oldId).length;
  const grp = S.groups.find(g=>g.members.includes(oldId));
  // a session saved before the block was renamed to its pick: card says one
  // part, the block still carries the old proposal's name
  ic.data.dk = { pn:'CARD-PART-1', man:'TI', desc:'the physical part', stock:10,
                 price:1.5, currency:'USD', src:'DigiKey', datasheet:'https://x/card.pdf' };
  ic.data.DatasheetUrl = 'https://x/OLD-PROPOSAL.pdf';   // describes the wrong chip now
  const stale = T.buildSessionJSON();
  check('the stale session really does disagree with itself',
    stale.nodes.find(n=>n.id===oldId).data.dk.pn==='CARD-PART-1');

  T.loadSession(JSON.parse(JSON.stringify(stale)));
  check('importing renames the block to the part on its card',
    !!T.nodeById('CARD-PART-1') && !T.nodeById(oldId) &&
    T.nodeById('CARD-PART-1').label==='CARD-PART-1');
  check('…and the export field follows, so the next JSON is already right',
    T.nodeById('CARD-PART-1').data.ic_part_number==='CARD-PART-1' &&
    T.buildPipelineJSON().ic_components.some(c=>c.ic_part_number==='CARD-PART-1'));
  check('…the card\'s datasheet replaces the old proposal\'s, which described another chip',
    T.nodeById('CARD-PART-1').data.DatasheetUrl==='https://x/card.pdf');
  {  // a card without a link leaves the block's own datasheet alone
    T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
    const b = S.nodes.find(n=>n.kind==='ic');
    b.data.DatasheetUrl = 'https://x/keep-me.pdf';
    b.data.dk = { pn:'NO-DS-PART', man:'TI', desc:'x', stock:1, price:1, currency:'USD', src:'Mouser', datasheet:'' };
    T.loadSession(JSON.parse(JSON.stringify(T.buildSessionJSON())));
    check('a card with no datasheet leaves the block\'s link untouched',
      T.nodeById('NO-DS-PART').data.DatasheetUrl==='https://x/keep-me.pdf');
    T.loadSession(JSON.parse(JSON.stringify(stale)));   // back to the main scenario
  }
  check('every connection follows the rename',
    S.edges.filter(e=>e.source==='CARD-PART-1'||e.target==='CARD-PART-1').length===wires &&
    !S.edges.some(e=>e.source===oldId||e.target===oldId));
  check('group membership follows too',
    S.groups.find(g=>g.id===grp.id).members.includes('CARD-PART-1'));
  check('the block still counts as selected — the card is untouched',
    T.icSelected(T.nodeById('CARD-PART-1')));

  // two cards naming the same part stay distinct blocks
  const another = S.nodes.find(n=>n.kind==='ic' && n.id!=='CARD-PART-1');
  another.data.dk = { ...T.nodeById('CARD-PART-1').data.dk };
  T.loadSession(JSON.parse(JSON.stringify(T.buildSessionJSON())));
  check('two blocks whose cards name the same part get unique ids',
    new Set(S.nodes.map(n=>n.id)).size===S.nodes.length &&
    S.nodes.some(n=>n.id==='CARD-PART-1_2'));

  // a block already named after its card is left exactly as it is
  const before = T.buildSessionJSON();
  T.loadSession(JSON.parse(JSON.stringify(before)));
  check('re-importing an already-reconciled session changes nothing',
    JSON.stringify(T.buildSessionJSON().nodes.map(n=>n.id))===JSON.stringify(before.nodes.map(n=>n.id)));
}

/* ---------- an external's hand-entered PN/datasheet ride both exports ---------- */
{
  T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
  const ext=S.nodes.find(n=>n.kind==='external');
  ext.data.part_number='ACME-77'; ext.data.DatasheetUrl='https://x/acme77.pdf';
  const pipe=T.buildPipelineJSON();
  const exported=JSON.parse(pipe.global_contract_override).external_blocks.find(b=>b.name===ext.label);
  check('the pipeline contract carries the external\'s PN and datasheet',
    exported.part_number==='ACME-77' && exported.DatasheetUrl==='https://x/acme77.pdf');
  T.loadFromContract(pipe, JSON.parse(pipe.global_contract_override), pipe.groups); T.render();
  const back=S.nodes.find(n=>n.kind==='external' && n.label===exported.name);
  check('…and importing that contract restores them on the block',
    back.data.part_number==='ACME-77' && back.data.DatasheetUrl==='https://x/acme77.pdf');
}

/* ---------- duplicated part numbers survive the pipeline round trip ---------- */
{
  T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
  const src=S.nodes.find(n=>n.kind==='ic');
  const twin={ ...JSON.parse(JSON.stringify(src)), id:src.id+'_2', label:src.id+'_2', x:src.x+400 };
  S.nodes.push(twin);
  const peer=S.nodes.find(n=>n.id!==twin.id && n.id!==src.id);
  S.edges.push({ id:'e'+(S.edgeSeq++), source:twin.id, target:peer.id,
    nets:[{ name:'TWIN_NET', type:'DIGITAL_LOGIC', description:'' }] });
  const pipe=T.buildPipelineJSON();
  const dup=pipe.ic_components.filter(c=>c.ic_part_number===src.data.ic_part_number);
  check('the BOM lists one line per block, both under the SAME real part number',
    dup.length===2 && dup.some(c=>c.instance_id===src.id+'_2') && dup.some(c=>!c.instance_id));
  T.loadFromContract(pipe, JSON.parse(pipe.global_contract_override), pipe.groups); T.render();
  check('re-importing keeps both instances and their wiring',
    !!T.nodeById(src.id) && !!T.nodeById(src.id+'_2') &&
    S.edges.some(e=>e.source===src.id+'_2' && e.nets.some(x=>x.name==='TWIN_NET')));
  check('a legacy input with a bare duplicated part number still yields two blocks',
    (()=>{ const inp=JSON.parse(JSON.stringify(fx.input));
      inp.ic_components.push({ ...inp.ic_components[0] });
      T.loadFromContract(inp, fx.contract, fx.groups);
      const pn=inp.ic_components[0].ic_part_number;
      return !!T.nodeById(pn) && !!T.nodeById(pn+'_2'); })());
}

/* ---------- reference designators: assigned once, ride the session ---------- */
{
  T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
  check('every block gets an Altium-style designator on import',
    S.nodes.filter(n=>n.kind==='ic').every(n=>/^U\d+$/.test(n.ref)) &&
    S.nodes.filter(n=>n.kind==='external').every(n=>/^EXT\d+$/.test(n.ref)));
  check('designators are unique across the sheet',
    new Set(S.nodes.map(n=>n.ref)).size===S.nodes.length);
  const ic=S.nodes.find(n=>n.kind==='ic'); const ref0=ic.ref, icId=ic.id;
  T.loadSession(JSON.parse(JSON.stringify(T.buildSessionJSON())));
  check('designators ride the session unchanged', T.nodeById(icId).ref===ref0);
  const legacy=JSON.parse(JSON.stringify(T.buildSessionJSON()));
  legacy.nodes.forEach(n=>{ delete n.ref; });
  T.loadSession(legacy);
  check('a legacy session without designators receives them on import',
    S.nodes.every(n=>!!n.ref) && new Set(S.nodes.map(n=>n.ref)).size===S.nodes.length);
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
