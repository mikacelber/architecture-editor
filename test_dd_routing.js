'use strict';
/* Drill-down ("Open Group") wires obey the SAME connection rules as the
   system-level sheet: lattice routing clear of every member block, orthogonal
   segments with perpendicular entry, routing lanes, waypoint drags with undo,
   and the FROM/TO boundary portals kept intact. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,openGroupView,closeGroupView,diagramEdges,
 groupsWithUngrouped,nodeById,openGroupObstacleRects,nodeEdgeLaneKey,commit,undo,_routeCache,
 nodePortRowsFor,nodePortOf,nodePortRowY,setGroupPortSide,moveNodePortToRow,resetGroupPortLayout,GRID:GRID,
 drillSheet,portalOffsetOf,setPortalOffset,movePortalToRow,PORTAL_MARGIN:PORTAL_MARGIN,LANE_PITCH:LANE_PITCH,PORTAL_GAP:PORTAL_GAP};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();

// The busiest group is the honest test sheet.
const internalOf=g=>{ const m=new Set(g.members); return T.diagramEdges(S.edges).filter(e=>m.has(e.source)&&m.has(e.target)); };
const best = T.groupsWithUngrouped().map(g=>({ id:g.id, n:internalOf(g).length })).sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id))[0];
console.log('   busiest group: '+best.id+' with '+best.n+' internal connections');
check('fixture has a group with internal connections to verify', best.n>0);

T.openGroupView(best.id);
const doc=window.document;

function ptsOfPath(d){
  const n=d.replace(/[ML]/g,' ').trim().split(/\s+/).map(Number);
  const p=[]; for(let i=0;i<n.length;i+=2) p.push([n[i],n[i+1]]); return p;
}
// A wire "lies across a block" only if it overlaps the block's OPEN INTERIOR
// (the stub leaving a port starts exactly on its own block's edge).
function crossesAny(pts,rects){
  for(let i=0;i<pts.length-1;i++){
    const [x1,y1]=pts[i],[x2,y2]=pts[i+1];
    const lo=Math.min(x1,x2),hi=Math.max(x1,x2),loY=Math.min(y1,y2),hiY=Math.max(y1,y2);
    for(const r of rects){
      if (Math.abs(y1-y2)<0.5 && y1>r.y && y1<r.y+r.h && hi>r.x && lo<r.x+r.w) return r.id;
      if (Math.abs(x1-x2)<0.5 && x1>r.x && x1<r.x+r.w && hiY>r.y && loY<r.y+r.h) return r.id;
    }
  }
  return null;
}
const wirePts=()=>[...doc.querySelectorAll('#edgesG .edge')].map(g=>({
  eid:g.dataset.eid, pts:ptsOfPath(g.querySelector('path').getAttribute('d')) }));

/* ---- rule 1: no wire lies across a member block ---- */
{
  let bad=null;
  for (const w of wirePts()){ const hit=crossesAny(w.pts, T.openGroupObstacleRects()); if (hit) bad=w.eid+' over '+hit; }
  check('no in-group wire lies across a member block'+(bad?' ['+bad+']':''), !bad);
}

/* ---- rule 2: orthogonal wires, perpendicular entry, edge-anchored ports ---- */
{
  let ortho=true, horizEntry=true, anchored=true;
  for (const w of wirePts()){
    const pts=w.pts;
    for(let i=0;i<pts.length-1;i++)
      if (Math.abs(pts[i][0]-pts[i+1][0])>=0.5 && Math.abs(pts[i][1]-pts[i+1][1])>=0.5) ortho=false;
    const a=pts[pts.length-2], b=pts[pts.length-1];
    if (Math.abs(a[1]-b[1])>=0.5) horizEntry=false;
    const e=S.edges.find(x=>x.id===w.eid);
    const na=T.nodeById(e.source), nb=T.nodeById(e.target);
    if (Math.abs(pts[0][0]-(na.x+na.w))>=0.5 || Math.abs(b[0]-nb.x)>=0.5) anchored=false;
  }
  check('every wire is orthogonal (H/V segments only)', ortho);
  check('the arrow enters the block horizontally (perpendicular to its edge)', horizEntry);
  check('wires start on the source right edge and end on the target left edge', anchored);
}

/* ---- rule 3: routing lanes assigned like the top level ---- */
check('every in-group connection carries a routing lane',
  internalOf(T.groupsWithUngrouped().find(g=>g.id===best.id)).every(e=>S.groupEdgeLanes[T.nodeEdgeLaneKey(e)]!=null));

/* ---- rule 4: the same drag handles as the top level ---- */
{
  const handles=doc.querySelectorAll('#edgesG .edge .seg-v, #edgesG .edge .seg-h');
  const withAxis=doc.querySelectorAll('#edgesG .edge [data-axis]');
  check('wire segments expose top-level drag handles (seg-v/seg-h with data-axis)', handles.length>0 && withAxis.length>0);
  check('no legacy elbow handles remain (seg-e/seg-f)', doc.querySelectorAll('.seg-e, .seg-f').length===0);
}

/* ---- rule 5: a manual waypoint reroutes, stays clear, and undoes ---- */
{
  const w0=wirePts()[0];
  const e=S.edges.find(x=>x.id===w0.eid);
  const before=JSON.stringify(w0.pts);
  const rects=T.openGroupObstacleRects();
  const wx=Math.min(...rects.map(r=>r.x))-150, wy=Math.min(...rects.map(r=>r.y))-150;
  T.commit();
  e.route={ wx, wy };
  T.render();
  const after=wirePts().find(x=>x.eid===w0.eid);
  check('a manual waypoint visibly reroutes the wire', JSON.stringify(after.pts)!==before);
  check('the manual route passes through the waypoint', after.pts.some(p=>Math.abs(p[0]-wx)<0.5||Math.abs(p[1]-wy)<0.5));
  check('the manual route is still clear of every member block', !crossesAny(after.pts, T.openGroupObstacleRects()));
  T.undo();
  const restored=wirePts().find(x=>x.eid===w0.eid);
  check('undo restores the automatic route', JSON.stringify(restored.pts)===before);
}

/* ---- rule 6: FROM/TO boundary portals kept, wires attached to real blocks ---- */
{
  const portals=[...doc.querySelectorAll('#edgesG .portal')];
  check('boundary portals still rendered', portals.length>0);
  check('portals keep their FROM/TO labels', portals.every(p=>
    [...p.querySelectorAll('text')].some(t=>t.textContent==='FROM'||t.textContent==='TO')));

  const g=T.groupsWithUngrouped().find(x=>x.id===best.id);
  const memberSet=new Set(g.members);
  const memberRects=T.openGroupObstacleRects().filter(r=>memberSet.has(r.id));
  const onLeftEdge =(pt,r)=>Math.abs(pt[0]-r.x)<0.5       && pt[1]>r.y && pt[1]<r.y+r.h;
  const onRightEdge=(pt,r)=>Math.abs(pt[0]-(r.x+r.w))<0.5 && pt[1]>r.y && pt[1]<r.y+r.h;
  let wireCount=0, attached=true, clear=true;
  for (const p of portals){
    const dir=p.dataset.portal.split(':')[0];
    const box=p.querySelector('rect[fill="var(--vellum)"]');
    const r={ x:+box.getAttribute('x'), y:+box.getAttribute('y'), w:+box.getAttribute('width'), h:+box.getAttribute('height') };
    for (const hit of p.querySelectorAll('path[stroke="transparent"]:not(.seg-v):not(.seg-h)')){
      const pts=ptsOfPath(hit.getAttribute('d'));
      wireCount++;
      const a=pts[0], b=pts[pts.length-1];
      // FROM: leaves the portal's right edge, arrow lands on a member's left edge.
      // TO: leaves a member's right edge, arrow lands on the portal's left edge.
      if (dir==='in'){ if (!onRightEdge(a,r) || !memberRects.some(m=>onLeftEdge(b,m))) attached=false; }
      else           { if (!memberRects.some(m=>onRightEdge(a,m)) || !onLeftEdge(b,r)) attached=false; }
      if (crossesAny(pts, T.openGroupObstacleRects())) clear=false;
    }
  }
  console.log('   '+wireCount+' boundary wires drawn across '+portals.length+' portals');
  check('every portal draws real wires (no floating stub)', wireCount>0);
  check('every boundary wire connects the portal edge to a specific member block', attached);
  check('boundary wires never lie across a block or another portal', clear);
}

/* ---- rule 7: member blocks use the top-level port system ---- */
{
  const g=T.groupsWithUngrouped().find(x=>x.id===best.id);
  const withRows=g.members.map(id=>T.nodeById(id)).filter(n=>T.nodePortRowsFor(n.id).length>=2);
  check('a member block with 2+ ports exists (test is meaningful)', withRows.length>0);
  let pitchOk=true, insideOk=true, heightOk=true;
  for (const n of withRows){
    const ys=T.nodePortRowsFor(n.id).map(r=>T.nodePortRowY(n,r.row)).sort((a,b)=>a-b);
    for(let i=1;i<ys.length;i++) if (Math.abs(ys[i]-ys[i-1]-T.GRID)>0.01) pitchOk=false;
    for(const y of ys) if (y<0 || y>n.h) insideOk=false;
    if (n.h<64) heightOk=false;
  }
  check('port rows spaced at the GRID pitch like the top level (no collapsed arrows)', pitchOk);
  check('every port row sits inside its (grown) block', insideOk && heightOk);
  check('port badges rendered on member blocks', doc.querySelectorAll('#nodesG .portnum').length>0);

  const n0=withRows[0];
  const r0=T.nodePortRowsFor(n0.id)[0], before=r0.side;
  T.setGroupPortSide(n0.id, r0.src, r0.tgt, before==='left'?'right':'left'); T.render();
  check('a node port flips to the opposite edge like a group port',
    T.nodePortOf(n0.id, r0.src, r0.tgt, r0.dir).side!==before);
  const rows=T.nodePortRowsFor(n0.id), last=rows[rows.length-1];
  check('node port rows reorder by badge drag semantics',
    T.moveNodePortToRow(n0.id, last.src+'→'+last.tgt, 0)===true &&
    (T.render(), T.nodePortRowsFor(n0.id)[0].src===last.src && T.nodePortRowsFor(n0.id)[0].tgt===last.tgt));
  T.resetGroupPortLayout(n0.id); T.render();
  check('reset restores the default port layout', T.nodePortRowsFor(n0.id)[0].side===before);

  // after all that shuffling, the sheet still obeys rule 1
  let bad=null;
  for (const w of wirePts()){ const hit=crossesAny(w.pts, T.openGroupObstacleRects()); if (hit) bad=w.eid+' over '+hit; }
  check('wires still clear of every block after port edits'+(bad?' ['+bad+']':''), !bad);
}

/* ---- rule 8: portal columns — corridor scales, drags clamp, order shuffles ---- */
{
  const sheet=T.drillSheet();
  const memberSet=new Set(T.groupsWithUngrouped().find(x=>x.id===best.id).members);
  const memberRects=sheet.obstacles.filter(r=>memberSet.has(r.id));
  const minX=Math.min(...memberRects.map(r=>r.x)), maxX=Math.max(...memberRects.map(r=>r.x+r.w));
  const inPortals=sheet.portals.filter(p=>p.dir==='in'), outPortals=sheet.portals.filter(p=>p.dir==='out');
  const inWires=sheet.specs.filter(s=>s.kind==='in').length, outWires=sheet.specs.filter(s=>s.kind==='out').length;
  console.log('   corridor: '+inWires+' in-wires / '+outWires+' out-wires');
  check('FROM corridor width scales with the number of inputs',
    inPortals.every(p=>minX-(p.r.x+p.r.w) >= T.PORTAL_MARGIN + inWires*T.LANE_PITCH - 0.01));
  check('TO corridor width scales with the number of outputs',
    outPortals.every(p=>p.r.x-maxX >= T.PORTAL_MARGIN + outWires*T.LANE_PITCH - 0.01));

  // clamps: FROM only widens leftward, TO only rightward
  T.setPortalOffset(best.id,'in',100,0);
  check('a FROM column can never be pushed toward the blocks (dx clamped to 0)', T.portalOffsetOf(best.id,'in').dx===0);
  T.setPortalOffset(best.id,'out',-100,0);
  check('a TO column can never be pushed toward the blocks (dx clamped to 0)', T.portalOffsetOf(best.id,'out').dx===0);

  // the whole column moves together, and only that column
  const before=T.drillSheet().portals.map(p=>({key:p.key,x:p.r.x,y:p.r.y}));
  T.commit();
  T.setPortalOffset(best.id,'in',-96,48); T.render();
  const after=T.drillSheet().portals.map(p=>({key:p.key,x:p.r.x,y:p.r.y}));
  const moved=before.filter(b=>b.key.startsWith('in:')).every(b=>{
    const a=after.find(x=>x.key===b.key); return Math.abs(a.x-(b.x-96))<0.01 && Math.abs(a.y-(b.y+48))<0.01; });
  const others=before.filter(b=>b.key.startsWith('out:')).every(b=>{
    const a=after.find(x=>x.key===b.key); return a.x===b.x && a.y===b.y; });
  check('dragging the FROM column moves every FROM portal together', moved);
  check('the TO column stays put while FROM moves', others);
  let bad=null;
  for (const w of wirePts()){ const hit=crossesAny(w.pts, T.openGroupObstacleRects()); if (hit) bad=w.eid+' over '+hit; }
  check('wires still clear of every block with the column dragged out'+(bad?' ['+bad+']':''), !bad);
  T.undo();
  check('undo restores the column position', T.portalOffsetOf(best.id,'in').dx===0 && T.portalOffsetOf(best.id,'in').dy===0);

  // reorder within a column — the others shuffle to make room
  const col = (inPortals.length>=2?inPortals:outPortals);
  if (col.length>=2){
    const dir=col[0].dir;
    const ids=col.map(p=>dir==='in'?p.item.source:p.item.target);
    T.commit();
    check('a portal drops at the top and the rest shuffle down',
      T.movePortalToRow(best.id, dir, ids[ids.length-1], 0, ids)===true &&
      (T.render(), (x=>x[0]===ids[ids.length-1] && x[1]===ids[0])(
        T.drillSheet().portals.filter(p=>p.dir===dir).map(p=>dir==='in'?p.item.source:p.item.target))));
    T.undo();
    const restored=T.drillSheet().portals.filter(p=>p.dir===dir).map(p=>dir==='in'?p.item.source:p.item.target);
    check('undo restores the portal order', JSON.stringify(restored)===JSON.stringify(ids));
  } else {
    check('portal columns with 2+ portals exist to reorder (fixture too small?)', false);
  }
}

T.closeGroupView();
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
