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
 moveNodePortToRow,computeGroupEdges,groupEdgeRouteKey,diagramEdges,resetPortalBase,fitView};`);
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

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
