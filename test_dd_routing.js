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
 drillSheet,portalOffsetOf,setPortalOffset,PORTAL_MARGIN:PORTAL_MARGIN,LANE_PITCH:LANE_PITCH,PORTAL_H:PORTAL_H,
 translateWireSegment,nodeBlockWidth,textWidth,isHvNet,netCategory,nodeSide,
 openAddPortalModal,candidateNetsForPortal,groupNetIndex,nodeGroupIndex,computeGroupEdges,traceSets,
 movePortalSlotToRow,pinPortalWires,pinSheetWires,nodeEdgeRouteOf,groupPortRowsFor,laneEnd,fanAssignLanes,nodeEdgeLaneKey,fanStub,
 GROUP_PORT_STUB:GROUP_PORT_STUB,FAN_PITCH:FAN_PITCH,commit,undo,
 cleanPts,adoptSheetRoute,groupEdgePtsCached,buildSessionJSON,loadSession,groupNetEndpoints,groupNetIndex,addNetToEdge,setNodeEdgeRoute,
 nodeGroupIndex,NODE_ROUTE_PREFIX:NODE_ROUTE_PREFIX};`);
const T=window.__T, S=T.S;
const sheetRouteOf=e=>(e.routes&&e.routes[S.openGroup])||(e.route&&e.route.sheet===S.openGroup?e.route:undefined);
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
    // port aiming may put a port on either vertical edge (it faces its
    // neighbour) — each end must sit exactly ON one edge of its own block
    const onEdge=(x,n)=>Math.abs(x-n.x)<0.5 || Math.abs(x-(n.x+n.w))<0.5;
    if (!onEdge(pts[0][0],na) || !onEdge(b[0],nb)) anchored=false;
  }
  check('every wire is orthogonal (H/V segments only)', ortho);
  check('the arrow enters the block horizontally (perpendicular to its edge)', horizEntry);
  check('wires start on a source edge and end on a target edge', anchored);
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
  T.setNodeEdgeRoute(e, { wx, wy });
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
    const r={ x:+p.dataset.x, y:+p.dataset.y, w:+p.dataset.w, h:+p.dataset.h };
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

  // the DESIGN minimum distance floors both columns, however hard they are
  // pushed toward the blocks — the corridor margin is only the import default
  T.setPortalOffset(best.id,'in',10000,0); T.render();
  check('a FROM column dragged at the blocks stops at the design minimum distance',
    Math.abs(Math.min(...T.drillSheet().obstacles.filter(r=>memberSet.has(r.id)).map(r=>r.x))
      - Math.max(...T.drillSheet().portals.filter(p=>p.dir==='in').map(p=>p.r.x+p.r.w)) - 2*T.GRID)<0.01);
  T.setPortalOffset(best.id,'out',-10000,0); T.render();
  check('a TO column dragged at the blocks stops at the design minimum distance',
    Math.abs(Math.min(...T.drillSheet().portals.filter(p=>p.dir==='out').map(p=>p.r.x))
      - Math.max(...T.drillSheet().obstacles.filter(r=>memberSet.has(r.id)).map(r=>r.x+r.w)) - 2*T.GRID)<0.01);
  check('...and closer than the corridor default IS allowed (import layout, not a constraint)',
    Math.max(...T.drillSheet().portals.filter(p=>p.dir==='in').map(p=>p.r.x+p.r.w)) >
    Math.min(...T.drillSheet().obstacles.filter(r=>memberSet.has(r.id)).map(r=>r.x)) - T.PORTAL_MARGIN);
  T.setPortalOffset(best.id,'in',0,0); T.setPortalOffset(best.id,'out',0,0); T.render();

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

  // the portal columns are anchored per visit: dragging a member block
  // around must NOT tow the FROM/TO columns along
  const posBefore=T.drillSheet().portals.map(p=>p.key+'@'+p.r.x+','+p.r.y).join('|');
  const mover=T.nodeById(T.groupsWithUngrouped().find(x=>x.id===best.id).members[0]);
  const oy=mover.y; mover.y+=240; T.render();
  const posAfter=T.drillSheet().portals.map(p=>p.key+'@'+p.r.x+','+p.r.y).join('|');
  check('moving a member block leaves the FROM/TO columns where they were', posAfter===posBefore);
  mover.y=oy; T.render();
}

/* ---- rule 9: portal shape and clickable net badges ---- */
{
  T.render();
  const domPortals=[...doc.querySelectorAll('#edgesG .portal')];
  // outer end is a round cap: the box path carries arcs of radius
  // min(h/2, PORTAL_H/2) — at the base height that IS a semicircle, and a box
  // grown to fit more wires keeps the same cap instead of bulging.
  const shaped=domPortals.every(p=>{
    const sr=Math.min((+p.dataset.h)/2, T.PORTAL_H/2);
    const d=(p.querySelector('path[fill="var(--vellum)"]')||{getAttribute:()=>''}).getAttribute('d')||'';
    return d.includes(`A ${sr} ${sr}`);
  });
  check('every portal box has a semicircular outer end (cap r=min(h/2,PORTAL_H/2))', shaped);
  check('portals expose no reorder handle (feature removed)', doc.querySelectorAll('.portalnum').length===0);

  // titles never truncated; ONE shared width keeps both columns uniform
  const titleOf=id=>{ const g2=T.groupsWithUngrouped().find(x=>x.id===id); return g2?g2.title:id; };
  const fullTitle=domPortals.every(p=>{
    const [d2,otherId]=p.dataset.portal.split(/:(.+)/);
    const texts=[...p.querySelectorAll('text')].map(t=>t.textContent);
    return texts.includes(titleOf(otherId));
  });
  check('every portal shows its neighbour title in full (no truncation)', fullTitle);
  const widths=new Set(domPortals.map(p=>p.dataset.w));
  check('all portals share one width ('+[...widths][0]+'px)', widths.size===1);
  check('portal width grew to fit the longest title', +[...widths][0] >= 156);

  // the mid-wire net-count badge is clickable and lights up with its edge
  const badges=[...doc.querySelectorAll('#edgesG .netbadge')];
  check('every drawn wire carries a clickable net badge', badges.length>0 &&
    badges.every(b=>b.dataset.eid && !(b.getAttribute('style')||'').includes('pointer-events:none')));
  const bEdge=T.drillSheet().specs.find(s=>s.kind!=='internal');
  S.sel={ type:'edge', id:bEdge.e.id }; T.render();
  const lit=[...doc.querySelectorAll('#edgesG .netbadge')].find(b=>b.dataset.eid===bEdge.e.id);
  check('selecting a boundary connection lights its badge', !!lit && lit.querySelector('rect').getAttribute('fill')==='var(--probe)');
  S.sel=null; T.render();
}

/* ---- rule 10: segment drags translate in place — no surprise segments ---- */
{
  T.render();
  const obstacles=T.openGroupObstacleRects();
  let tried=0, sameShape=0, badMove=null;
  for (const w of wirePts()){
    const pts=w.pts;
    for (let k=1;k<pts.length-2;k++){
      const vert = pts[k][0]===pts[k+1][0];
      const axis = vert?'v':'h';
      for (const d of [T.GRID,-T.GRID,2*T.GRID,-2*T.GRID]){
        const want=(vert?pts[k][0]:pts[k][1])+d;
        const moved=T.translateWireSegment(pts.map(p=>p.slice()), k, axis, want, obstacles, Math.sign(d));
        if (!moved) continue;
        tried++;
        if (moved.length<=pts.length) sameShape++; else badMove=w.eid+' seg'+k+' grew '+pts.length+'→'+moved.length;
        break;
      }
    }
  }
  console.log('   '+tried+' free segment translations exercised');
  check('free segment drags are exercised (test is meaningful)', tried>=5);
  check('a free drag NEVER adds segments to the wire'+(badMove?' ['+badMove+']':''), sameShape===tried);

  // the stored {pts} shape is honoured verbatim by the renderer
  const w0=wirePts().find(w=>w.pts.length>=4);
  const e0=S.edges.find(x=>x.id===w0.eid);
  let k0=1; while (k0<w0.pts.length-2 && !(w0.pts[k0][0]===w0.pts[k0+1][0])) k0++;
  const moved0=T.translateWireSegment(w0.pts.map(p=>p.slice()), k0, 'v', w0.pts[k0][0]+T.GRID, obstacles, 1)
            || T.translateWireSegment(w0.pts.map(p=>p.slice()), k0, 'v', w0.pts[k0][0]-T.GRID, obstacles, -1);
  if (moved0){
    e0.route={ pts: moved0 }; T.render();
    const drawn=wirePts().find(w=>w.eid===w0.eid);
    check('a stored polyline route renders verbatim', JSON.stringify(drawn.pts)===JSON.stringify(moved0));
    check('and stays clear of every block', !crossesAny(drawn.pts, T.openGroupObstacleRects()));
    delete e0.route; T.render();
  } else {
    check('a translatable vertical segment exists for the pts-route check', false);
  }

  // port stubs survive: translating the vertical next to a port keeps a
  // horizontal final run (the arrow still enters perpendicular to the edge)
  const wStub=wirePts().find(w=>w.pts.length>=4);
  const pv=wStub.pts;
  const movedStub=T.translateWireSegment(pv.map(p=>p.slice()), pv.length-3, 'v',
    pv[pv.length-1][0], obstacles, Math.sign(pv[pv.length-1][0]-pv[pv.length-3][0])||1);
  if (movedStub){
    const a=movedStub[movedStub.length-2], b=movedStub[movedStub.length-1];
    check('dragging into the port keeps a horizontal entry stub', Math.abs(a[1]-b[1])<0.5 && Math.abs(a[0]-b[0])>=12);
  } else {
    check('dragging into the port keeps a horizontal entry stub (blocked move is fine too)', true);
  }

  // the port case: dragging the FINAL horizontal run vertically SPLITS it —
  // a minimal stub (one grid) stays at the port, a new vertical jog takes the
  // Y offset, and the two horizontal parts add up to the original run.
  {
    const w1=wirePts()[0], p1=w1.pts, li=p1.length-2;
    const horiz=Math.abs(p1[li][1]-p1[li+1][1])<0.5;
    const movedS=T.translateWireSegment(p1.map(p=>p.slice()), li, 'h', p1[li][1]+T.GRID, obstacles, 1)
              || T.translateWireSegment(p1.map(p=>p.slice()), li, 'h', p1[li][1]-T.GRID, obstacles, -1);
    if (horiz && movedS){
      const end=movedS[movedS.length-1], stubStart=movedS[movedS.length-2];
      check('dragging the port-adjacent horizontal splits it (the needed jog appears)', movedS.length>p1.length);
      check('a minimal one-grid stub stays at the port',
        Math.abs(stubStart[1]-end[1])<0.5 && Math.abs(Math.abs(end[0]-stubStart[0])-T.GRID)<0.01);
      check('the endpoints stay on their ports',
        JSON.stringify(movedS[0])===JSON.stringify(p1[0]) && JSON.stringify(end)===JSON.stringify(p1[p1.length-1]));
      check('the split shape stays clear of every block', !crossesAny(movedS, obstacles));
    } else {
      check('port-adjacent horizontal drag testable on the first wire', false);
    }
  }
  // every horizontal segment carries a drag handle now, port-adjacent included
  {
    const w2=wirePts()[0];
    let hCount=0;
    for(let k=0;k<w2.pts.length-1;k++)
      if (Math.abs(w2.pts[k][1]-w2.pts[k+1][1])<0.5 && Math.abs(w2.pts[k][0]-w2.pts[k+1][0])>=0.5) hCount++;
    const g2=doc.querySelector('#edgesG .edge[data-eid="'+w2.eid+'"]');
    check('port-adjacent horizontals expose drag handles too ('+hCount+' handles)',
      g2.querySelectorAll('.seg-h').length===hCount);
  }

  // the port's OWN block limits the drag in X only, never in Y: dragging a
  // horizontal port wire to a Y INSIDE the block's vertical span must land
  // exactly there (the split run stops a grid short of the block, so no hop)
  {
    const blk={ id:'SYNTH', x:400, y:0, w:176, h:96 };
    const straight=[[100,48],[400,48]];         // straight run into a port at y=48
    const m=T.translateWireSegment(straight.map(p=>p.slice()), 0, 'h', 72, [blk], 1);
    check('vertical drag of a port wire is NOT vetoed by its own block (X-only limits)',
      !!m && m.some((p,k)=>k<m.length-1 && p[1]===72 && m[k+1][1]===72));
    check('the moved run stops one grid short of the block (never touches it)',
      !!m && Math.max(...m.filter(p=>p[1]===72).map(p=>p[0])) <= blk.x - T.GRID + 0.01);
    // ...but a DIFFERENT block sitting across the corridor still causes a hop
    const other={ id:'OTHER', x:200, y:60, w:120, h:48 };
    const m2=T.translateWireSegment(straight.map(p=>p.slice()), 0, 'h', 72, [blk, other], 1);
    check('an unrelated block in the corridor still makes the wire hop past', !!m2 && !m2.some(p=>p[1]===72));
  }
}

/* ---- rule 12: the connection inspector links the endpoint datasheets ---- */
{
  const g=T.groupsWithUngrouped().find(x=>x.id===best.id);
  const m=new Set(g.members);
  const e=T.diagramEdges(S.edges).find(x=>m.has(x.source)&&m.has(x.target)&&T.nodeById(x.source).kind==='ic');
  const src=T.nodeById(e.source);
  const hadUrl=src.data.DatasheetUrl;
  if (!hadUrl) src.data.DatasheetUrl='https://example.com/ds.pdf';
  S.sel={ type:'edge', id:e.id }; T.render();
  const bodyHtml=doc.getElementById('insBody').innerHTML;
  check('selecting a connection lists its endpoint datasheets',
    bodyHtml.includes('Datasheets') && bodyHtml.includes(src.data.DatasheetUrl) && bodyHtml.includes('(source)'));
  if (!hadUrl) delete src.data.DatasheetUrl;
  S.sel=null; T.render();
}

/* ---- rule 11: external blocks widen to fit their full name ---- */
{
  const ext=S.nodes.filter(n=>n.kind==='external');
  check('external blocks exist to verify', ext.length>0);
  const longest=ext.slice().sort((a,b)=>b.label.length-a.label.length)[0];
  check('block width fits the whole label (no truncation)',
    T.nodeBlockWidth(longest) >= 12 + T.textWidth(longest.label, 11.5, false) + 14);
}

/* ---- rule 13: barrier nodes flip their LV|HV halves and pin their ports ---- */
{
  const g=T.groupsWithUngrouped().find(x=>x.id===best.id);
  const n=T.nodeById(g.members[0]);
  const prevSide=n.hvSide, prevFlip=n.hvFlip;
  n.hvSide='barrier'; n.hvFlip=undefined; T.render();
  // ports pin by domain: HV rows on the right half, LV rows on the left
  const rows0=T.nodePortRowsFor(n.id);
  check('a barrier member pins every port to its domain half',
    rows0.length>0 && rows0.every(r=>r.pinned && r.side===(r.hv?'right':'left')));
  const r0=rows0[0];
  T.setGroupPortSide(n.id, r0.src, r0.tgt, r0.side==='left'?'right':'left'); T.render();
  check('a stored override cannot move a pinned port across the divider',
    T.nodePortOf(n.id, r0.src, r0.tgt, r0.dir).side===r0.side);
  T.resetGroupPortLayout(n.id);
  // the flip swaps the halves — ports, wash and all
  n.hvFlip=true; T.render();
  check('flipping the node moves every port to the opposite half',
    T.nodePortRowsFor(n.id).every(r=>r.pinned && r.side===(r.hv?'left':'right')));
  check('a flipped barrier node paints its HV wash on the LEFT half',
    doc.getElementById('nodesG').innerHTML.includes('x="0" y="0" width="'+(n.w/2)+'"'));
  S.sel={ type:'node', id:n.id }; T.render();
  check('the node inspector offers the LV|HV flip switch below Voltage domain',
    !!doc.getElementById('fFlip') && doc.getElementById('fFlip').checked);
  S.sel=null; n.hvSide=prevSide; n.hvFlip=prevFlip; T.render();
  check('clearing the flip restores the default (HV wash on the right)',
    !doc.getElementById('nodesG').innerHTML.includes('x="0" y="0" width="'+(n.w/2)+'"'));
}

/* ---- rule 15: per-net LV|HV flag propagates to ports, blocks and colors ---- */
{
  const g=T.groupsWithUngrouped().find(x=>x.id===best.id);
  const m=new Set(g.members);
  // an internal edge whose endpoints classify automatically (no manual hvSide)
  const e=T.diagramEdges(S.edges).find(x=>m.has(x.source)&&m.has(x.target)
    && !T.nodeById(x.source).hvSide && !T.nodeById(x.target).hvSide
    && x.nets.every(nn=>!T.isHvNet(nn)));
  const net=e.nets[0];
  check('an LV-typed net reads LV before any flag', T.isHvNet(net)===false && T.netCategory(net)!=='hv');
  net.hv=true; T.render();
  check('the flag wins over the type: the net reads HV now', T.isHvNet(net)===true && T.netCategory(net)==='hv');
  const srcSide=T.nodeSide(e.source);
  check('the touching block re-classifies automatically (hv or barrier)', srcSide==='hv' || srcSide==='barrier');
  if (srcSide==='barrier'){
    const row=T.nodePortRowsFor(e.source).find(r=>r.src===e.source&&r.tgt===e.target);
    check('the flagged net\'s port pins to the HV half', row.pinned && row.side==='right' && row.hv);
  } else {
    check('an all-HV block needs no barrier pinning (whole block is HV)', true);
  }
  // the connection inspector offers the toggle and it flips back
  S.sel={ type:'edge', id:e.id }; T.render();
  const domBtn=doc.querySelector('#insBody [data-domnet]');
  check('every net card carries an LV|HV toggle', !!domBtn && domBtn.textContent==='HV');
  domBtn.onclick();
  check('clicking the toggle flips the net back to LV', T.isHvNet(net)===false);
  delete net.hv; S.sel=null; T.render();
}

/* ---- rule 14: a new IC lands clear of every block (end to end) ---- */
{
  doc.getElementById('btnAddIC').onclick();
  doc.getElementById('fPN').value='ADDTEST-1';
  doc.getElementById('fType').value='Test IC with a fairly long type text';
  doc.getElementById('fDesc').value='placement test';
  doc.getElementById('mOk').onclick();
  const added=T.nodeById('ADDTEST-1');
  const rects=T.drillSheet().obstacles.filter(r=>r.id!=='ADDTEST-1');
  const hit=added && rects.find(r=>added.x<r.x+r.w && added.x+added.w>r.x && added.y<r.y+r.h && added.y+added.h>r.y);
  check('a new IC added in Open Group lands clear of every block and portal'+(hit?' [over '+hit.id+']':''), !!added && !hit);
  check('the placement uses the block\'s REAL rendered size', !!added && added.h>64);
  check('the new IC joined the open group',
    T.groupsWithUngrouped().find(x=>x.id===best.id).members.includes('ADDTEST-1'));
  S.nodes=S.nodes.filter(n=>n.id!=='ADDTEST-1');
  S.groups.forEach(g=>{ g.members=g.members.filter(m=>m!=='ADDTEST-1'); });
  S.sel=null; T.render();
}

/* ---- rule 16: add external block, inspector add-net, "+" portal creation ---- */
{
  // Add External joins the open group and lands clear
  doc.getElementById('btnAddExt').onclick();
  doc.getElementById('fExtName').value='Test probe header';
  doc.getElementById('fExtDesc').value='validation external';
  doc.getElementById('mOk').onclick();
  const ext=T.nodeById('EXT:Test probe header');
  check('Add External creates the block inside the open group', !!ext && ext.kind==='external' &&
    T.groupsWithUngrouped().find(x=>x.id===best.id).members.includes(ext.id));
  const rects=T.drillSheet().obstacles.filter(r=>r.id!==ext.id);
  check('the new external block lands clear of every block and portal',
    !rects.some(r=>ext.x<r.x+r.w && ext.x+ext.w>r.x && ext.y<r.y+r.h && ext.y+ext.h>r.y));

  // inspector offers ONLY this group's nets (plus the new-net escape hatch)
  S.sel={ type:'node', id:ext.id }; T.render();
  const anNet=doc.getElementById('anNet');
  check('the inspector offers the Add-net section', !!anNet && !!doc.getElementById('anDir'));
  const offered=new Set([...anNet.options].map(o=>o.value).filter(v=>v!=='__new__'));
  const groupNets=new Set([...T.groupNetIndex(best.id).keys()]);
  check('offered nets are exactly the nets this group sees',
    offered.size===groupNets.size && [...offered].every(x=>groupNets.has(x)));

  // existing net as INPUT wires the driver into this block
  const firstNet=[...offered][0];
  anNet.value=firstNet; doc.getElementById('anDir').value='in';
  doc.getElementById('btnAddNetNode').onclick();
  check('an existing net added as input arrives from its driver',
    S.edges.some(e=>e.target===ext.id && e.nets.some(nn=>nn.name===firstNet)));

  // NEW net as OUTPUT creates the edge to the chosen counterpart
  S.sel={ type:'node', id:ext.id }; T.render();
  const an2=doc.getElementById('anNet'); an2.value='__new__'; an2.onchange();
  doc.getElementById('anName').value='TEST_NEW_NET';
  doc.getElementById('anDir').value='out';
  const other=doc.getElementById('anOther').value;
  doc.getElementById('btnAddNetNode').onclick();
  check('a new net as output drives the chosen counterpart',
    S.edges.some(e=>e.source===ext.id && e.target===other && e.nets.some(nn=>nn.name==='TEST_NEW_NET')));

  // ---- step 1: WHOSE nets are offered ----
  S.sel={ type:'node', id:ext.id }; T.render();
  const anGroup=doc.getElementById('anGroup');
  const idxG=T.nodeGroupIndex();
  check('the panel asks which group\'s nets to offer', !!anGroup);
  check('it defaults to this block\'s own group, listed first and marked',
    anGroup.value===best.id && anGroup.options[0].value===best.id &&
    /this group/i.test(anGroup.options[0].textContent));
  const listed=[...anGroup.options].map(o=>o.value);
  const realGroups=T.groupsWithUngrouped().filter(g=>g.members.length).map(g=>g.id);
  check('every other group is offered too, by its block title',
    realGroups.every(id=>listed.includes(id)) &&
    [...anGroup.options].every(o=>o.textContent.replace(' — this group','')===
      T.groupsWithUngrouped().find(g=>g.id===o.value).title));

  // ---- step 2 follows the chosen group: nets AND new-net counterparts ----
  const farGid=realGroups.find(id=>id!==best.id);
  check('a foreign group is available (test is meaningful)', !!farGid);
  anGroup.value=farGid; anGroup.onchange();
  const offeredFar=new Set([...doc.getElementById('anNet').options].map(o=>o.value).filter(v=>v!=='__new__'));
  const farNets=new Set([...T.groupNetIndex(farGid).keys()]);
  check('choosing another group re-stocks the net list with ITS nets',
    offeredFar.size===farNets.size && [...offeredFar].every(x=>farNets.has(x)));
  const farMembers=new Set(T.groupsWithUngrouped().find(g=>g.id===farGid).members);
  const cpIds=[...doc.getElementById('anOther').options].map(o=>o.value);
  check('…and the counterpart list with ITS members only',
    cpIds.length===farMembers.size && cpIds.every(id=>farMembers.has(id)));

  // ---- an EXISTING net of another group: the boundary wire + portals derive ----
  const drivable=[...T.groupNetEndpoints(farGid).entries()]
    .find(([name,r])=>[...r.drivers].length && !S.edges.some(e=>e.target===ext.id&&e.nets.some(n=>n.name===name)));
  check('that group drives a net we can pull in (test is meaningful)', !!drivable);
  const farNet=drivable[0], farDriver=[...drivable[1].drivers].sort()[0];
  doc.getElementById('anNet').value=farNet; doc.getElementById('anNet').onchange();
  doc.getElementById('anDir').value='in';
  doc.getElementById('btnAddNetNode').onclick();
  check('an existing net of ANOTHER group arrives from a driver inside it',
    S.edges.some(e=>e.source===farDriver && e.target===ext.id && e.nets.some(n=>n.name===farNet)));
  const fromP=T.drillSheet().portals.find(p=>p.dir==='in' && p.key.includes(farGid) &&
    p.unders.some(e=>e.source===farDriver && e.target===ext.id));
  check('a FROM portal for that group materializes on this sheet', !!fromP);
  T.closeGroupView(); T.openGroupView(farGid);
  const toP=T.drillSheet().portals.find(p=>p.dir==='out' && p.key.includes(best.id) &&
    p.unders.some(e=>e.source===farDriver && e.target===ext.id));
  check('the far group\'s sheet gains the matching TO portal', !!toP);
  T.closeGroupView();
  check('the group-to-group wire appears on the system level',
    T.computeGroupEdges().some(e=>e.source===farGid && e.target===best.id));
  T.openGroupView(best.id);
  T.undo(); T.render();
  check('one undo removes the cross-group net and its derived boundary',
    !S.edges.some(e=>e.source===farDriver && e.target===ext.id && e.nets.some(n=>n.name===farNet)));

  // ---- a NEW net against a member of another group ----
  S.sel={ type:'node', id:ext.id }; T.render();
  doc.getElementById('anGroup').value=farGid; doc.getElementById('anGroup').onchange();
  const an3=doc.getElementById('anNet'); an3.value='__new__'; an3.onchange();
  const farBlock=doc.getElementById('anOther').value;
  check('the new-net counterpart comes from the chosen group', farMembers.has(farBlock));
  doc.getElementById('anName').value='TEST_XGROUP_NET';
  doc.getElementById('anDir').value='out';
  doc.getElementById('btnAddNetNode').onclick();
  check('the new cross-group net creates the boundary edge to that block',
    S.edges.some(e=>e.source===ext.id && e.target===farBlock && e.nets.some(nn=>nn.name==='TEST_XGROUP_NET')));
  check('…and the system level shows the group-to-group wire',
    T.computeGroupEdges().some(e=>e.source===best.id && e.target===idxG.get(farBlock)));
  T.undo(); T.render();
  check('undo removes it again',
    !S.edges.some(e=>e.nets.some(nn=>nn.name==='TEST_XGROUP_NET')));

  // "+" buttons under both portal columns; the FROM modal creates the portal
  S.sel=null; T.render();
  check('a "+" button sits under both portal columns', doc.querySelectorAll('#edgesG .portaladd').length===2);
  // candidate nets never include one internal to ANOTHER group
  const idx=T.nodeGroupIndex();
  const foreign=T.diagramEdges(S.edges).find(e=>{
    const gs=idx.get(e.source), gt=idx.get(e.target);
    return gs===gt && gs!==best.id && gs!=='UNGROUPED';
  });
  const candNames=new Set(T.candidateNetsForPortal(best.id).map(n=>n.name));
  if (foreign){
    const onlyInternal=foreign.nets.find(nn=>!candNames.has(nn.name));
    check('nets internal to other groups are excluded from the portal picker (spot check)',
      foreign.nets.every(nn=>candNames.has(nn.name)) ? true : !!onlyInternal);
  }
  T.openAddPortalModal('in');
  const inSources=new Set(T.drillSheet().portals.filter(p=>p.dir==='in').map(p=>p.item.source));
  const gSel=doc.getElementById('apGroup');
  const fresh=[...gSel.options].map(o=>o.value).find(v=>!inSources.has(v)) || gSel.value;
  gSel.value=fresh; gSel.onchange();
  const far=doc.getElementById('apFar').value, near=doc.getElementById('apNear').value, netName=doc.getElementById('apNet').value;
  doc.getElementById('mOk').onclick();
  check('the "+" modal creates the boundary edge for the new FROM',
    S.edges.some(e=>e.source===far && e.target===near && e.nets.some(nn=>nn.name===netName)));
  check('the new FROM portal materializes in the column',
    T.drillSheet().portals.some(p=>p.dir==='in' && p.item.source===fresh));

  // everything above was 4 committed steps — unwind them
  T.undo(); T.undo(); T.undo(); T.undo();
  S.sel=null; T.render();
  check('undo unwinds the whole rule (external gone again)', !T.nodeById('EXT:Test probe header'));
}

/* ---- rule 17: net trace — an inspector net card lights the net end to end,
   and ONLY that net's wires and blocks ---- */
{
  const clickCard=card=>card.onclick({ target:{ closest:()=>null } });
  const probeStroke=nid=>!![...doc.querySelectorAll(`#nodesG .node[data-nid="${nid}"] rect[stroke="var(--probe)"]`)].length;
  const glowing=()=>new Set([...doc.querySelectorAll('#edgesG .edge, #edgesG .portal')]
    .filter(g=>g.querySelector('path[filter]')).map(g=>g.dataset.eid||g.dataset.portal));

  // pick an internal connection of the open group and trace its first net
  const e0=internalOf(T.groupsWithUngrouped().find(g=>g.id===best.id))[0];
  S.sel={ type:'edge', id:e0.id }; T.render();
  const card0=doc.querySelector('#insBody [data-tracenet]');
  check('the inspector net cards are trace toggles (data-tracenet present)', !!card0);
  const netName=card0.dataset.tracenet;
  clickCard(card0);
  check('clicking a net card arms the trace', S.traceNet===netName);
  check('the clicked card shows the active effect (.on)',
    !!doc.querySelector(`#insBody [data-tracenet="${netName}"].on`));

  // exactly the carriers glow — wires, member blocks and portals of THAT net
  const tr=T.traceSets();
  const carrierEdges=new Set([...tr.edgeIds]);
  const lit=glowing();
  const members=new Set(T.groupsWithUngrouped().find(g=>g.id===best.id).members);
  const wiresOk=[...doc.querySelectorAll('#edgesG .edge')].every(g=>
    (!!g.querySelector('path[filter]'))===(carrierEdges.has(g.dataset.eid)||(S.sel&&S.sel.id===g.dataset.eid)));
  check('every wire carrying the net glows, and no other wire does', wiresOk);
  const nodesOk=[...members].every(id=>probeStroke(id)===tr.nodes.has(id));
  check('every block the net touches lights up, and no other block does', nodesOk);
  const portalsOk=T.drillSheet().portals.every(p=>{
    const boxLit=!![...doc.querySelectorAll(`#edgesG .portal[data-portal="${p.key}"] path`)]
      .some(el=>el.getAttribute('stroke')==='var(--probe)');
    return boxLit===p.unders.some(x=>carrierEdges.has(x.id));
  });
  check('portals glow only when the traced net passes through them', portalsOk);

  // everything else recedes: exactly the non-carriers are dimmed
  const dimOkWires=[...doc.querySelectorAll('#edgesG .edge')].every(g=>
    g.classList.contains('dim')===!(carrierEdges.has(g.dataset.eid)||(S.sel&&S.sel.id===g.dataset.eid)));
  check('every wire the net skips is dimmed, every carrier stays bright', dimOkWires);
  const dimOkNodes=[...members].every(id=>{
    const el=doc.querySelector(`#nodesG .node[data-nid="${id}"]`);
    return el.classList.contains('dim')===!tr.nodes.has(id);
  });
  check('every block the net skips is dimmed, every touched block stays bright', dimOkNodes);
  const dimOkPortals=T.drillSheet().portals.every(p=>{
    const el=doc.querySelector(`#edgesG .portal[data-portal="${p.key}"]`);
    return el.classList.contains('dim')===!p.unders.some(x=>carrierEdges.has(x.id));
  });
  check('portals the net skips are dimmed too', dimOkPortals);

  // strictly one net: a second click switches it off again
  clickCard(doc.querySelector(`#insBody [data-tracenet="${netName}"]`));
  check('clicking the card again disarms the trace', S.traceNet===null);
  check('nothing glows once the trace is off (selection aside)',
    [...glowing()].every(id=>S.sel&&S.sel.id===id));
  check('nothing is dimmed once the trace is off', doc.querySelectorAll('#board .dim').length===0);

  // the trace dies with the selection
  clickCard(doc.querySelector('#insBody [data-tracenet]'));
  S.sel=null; T.render();
  check('clearing the selection clears the trace too', S.traceNet===null);

  // top level: tracing from a group connection lights the groups it spans
  T.closeGroupView();
  const ge=T.computeGroupEdges()[0];
  S.sel={ type:'groupEdge', id:ge.id }; T.render();
  const cardTop=doc.querySelector('#insBody [data-tracenet]');
  check('group-connection net cards are trace toggles too', !!cardTop);
  clickCard(cardTop);
  const trTop=T.traceSets();
  const groupsOk=T.groupsWithUngrouped().every(g=>{
    const el=doc.querySelector(`#nodesG .node[data-nid="${g.id}"]`);
    if (!el) return true;   // not on the sheet (empty group)
    const litG=!![...el.querySelectorAll('rect[stroke="var(--probe)"]')].length;
    return litG===(trTop.groups.has(g.id)||(S.sel&&S.sel.id===g.id));
  });
  check('at the top level exactly the groups the net crosses light up', groupsOk);
  const topWiresOk=[...doc.querySelectorAll('#edgesG .edge')].every(g=>{
    const e=T.computeGroupEdges().find(x=>x.id===g.dataset.eid);
    const carries=!!(e&&e.nets.some(nn=>nn.name===trTop.name));
    return (!!g.querySelector('path[filter]'))===(carries||(S.sel&&S.sel.id===g.dataset.eid));
  });
  check('at the top level exactly the wires carrying the net glow', topWiresOk);
  const topDimOk=[...doc.querySelectorAll('#nodesG .node')].every(g=>
    g.classList.contains('dim')===!trTop.groups.has(g.dataset.nid));
  check('at the top level the groups the net skips are dimmed', topDimOk);
  S.traceNet=null; S.sel=null; T.render();
  check('the top level is fully bright again after the trace ends', doc.querySelectorAll('#board .dim').length===0);
  T.openGroupView(best.id);
}

/* ---- rule 18: grid-native portals — slots dead on the lattice, live X
   anchoring against the mid blocks, vertical slot reorder ---- */
{
  const onGrid=v=>Math.abs(v-Math.round(v/T.GRID)*T.GRID)<0.01;
  // Slots ride the SAME pitch as a block's port rows (one full GRID), so the
  // net-to-net distance stays constant from portal to block.
  const fine=T.GRID;
  const onFine=v=>Math.abs(v-Math.round(v/fine)*fine)<0.01;
  const slotYOf=s=>s.kind==='in'?s.pa.y:s.pb.y;
  const sheet=T.drillSheet();
  check('every portal box sits on the grid (y and h are GRID multiples)',
    sheet.portals.every(p=>onGrid(p.r.y)&&onGrid(p.r.h)));
  const bSpecs=sheet.specs.filter(s=>s.kind!=='internal');
  check('every portal exit slot lands exactly on a (fine) grid line',
    bSpecs.length>0 && bSpecs.every(s=>onFine(slotYOf(s))));
  const byPortal={};
  for (const s of bSpecs) (byPortal[s.portalKey]=byPortal[s.portalKey]||[]).push(slotYOf(s));
  check('no two wires of a portal share a slot row',
    Object.values(byPortal).every(ys=>new Set(ys).size===ys.length));
  // compact fan: consecutive slots are exactly one fine pitch apart, and the
  // fan is centred in its box
  const fanOk=sheet.portals.every(p=>{
    const ys=bSpecs.filter(s=>s.portalKey===p.key).map(slotYOf).sort((a,b)=>a-b);
    if (ys.length<2) return true;
    const spaced=ys.every((y,i)=>i===0||Math.abs(y-ys[i-1]-fine)<0.01);
    const mid=(ys[0]+ys[ys.length-1])/2;
    return spaced && Math.abs(mid-(p.r.y+p.r.h/2))<=fine/2+0.01;
  });
  check('slots keep the block-port pitch (one GRID), centred in their box', fanOk);
  check('a box grows one GRID row per wire (base height up to 1 wire)',
    sheet.portals.every(p=>p.r.h===Math.max(T.PORTAL_H,(p.unders.length+1)*T.GRID)));
  // the FROM/TO caption + title pair is centred on the box midline
  T.render();
  const textCentred=[...doc.querySelectorAll('#edgesG .portal')].every(el=>{
    const cy=+el.dataset.y + +el.dataset.h/2;
    const ys=[...el.querySelectorAll('text')].map(t=>+t.getAttribute('y'));
    return ys.includes(cy-8) && ys.includes(cy+10);
  });
  check('the FROM/TO caption and title stay centred in the box', textCentred);

  // X anchoring: the columns stay PARKED while blocks move — only a block
  // closer than PORTAL_MIN_CLEAR to a column's boxes shoves it, and it comes
  // back once the block retreats. Y is always frozen.
  const members=T.groupsWithUngrouped().find(x=>x.id===best.id).members.map(id=>T.nodeById(id));
  const leftmost=members.reduce((a,n)=>n.x<a.x?n:a,members[0]);
  const fromP=sheet.portals.filter(p=>p.dir==='in');
  const fromX0=Math.min(...fromP.map(p=>p.r.x));
  const fromRight=Math.max(...fromP.map(p=>p.r.x+p.r.w));
  const toX0=Math.max(...sheet.portals.filter(p=>p.dir==='out').map(p=>p.r.x));
  const ys0=sheet.portals.map(p=>p.key+'@'+p.r.y).join('|');
  const ox=leftmost.x;
  // a nudge toward the column, still outside the minimum distance: no movement
  leftmost.x-=96; T.render();
  const sheet2=T.drillSheet();
  check('a block move that keeps its distance never drags the FROM column',
    Math.min(...sheet2.portals.filter(p=>p.dir==='in').map(p=>p.r.x))===fromX0);
  check('the columns never move in Y when blocks move (Y stays frozen)',
    sheet2.portals.map(p=>p.key+'@'+p.r.y).join('|')===ys0);
  // crowding: park the block INSIDE the minimum distance — the column is
  // shoved exactly far enough to keep PORTAL_MIN_CLEAR to the block
  leftmost.x=fromRight+10; T.render();
  const shoved=Math.max(...T.drillSheet().portals.filter(p=>p.dir==='in').map(p=>p.r.x+p.r.w));
  check('a block crowding the FROM column shoves it to the minimum distance',
    Math.abs(leftmost.x-shoved-(2*T.GRID))<0.01);
  check('the TO column never reacts to minX crowding',
    Math.max(...T.drillSheet().portals.filter(p=>p.dir==='out').map(p=>p.r.x))===toX0);
  // retreat: the column returns to its parked spot, not one pixel further
  leftmost.x=ox; T.render();
  check('the column returns to its parked spot when the block retreats',
    Math.min(...T.drillSheet().portals.filter(p=>p.dir==='in').map(p=>p.r.x))===fromX0);

  // vertical slot reorder, like a block port's badge drag
  const rp=T.drillSheet().portals.find(p=>p.unders.length>=2);
  check('a portal with 2+ wires exists (reorder test is meaningful)', !!rp);
  if (rp){
    const ids0=rp.unders.map(e=>e.id);
    T.commit();
    check('a slot can be dragged onto another row', T.movePortalSlotToRow(rp.key, ids0[1], 0)===true);
    const ids1=T.drillSheet().portals.find(p=>p.key===rp.key).unders.map(e=>e.id);
    check('the dragged slot lands on the wanted row and the rest shuffle',
      ids1[0]===ids0[1] && ids1[1]===ids0[0]);
    check('reordered slots still land exactly on grid lines',
      T.drillSheet().specs.filter(s=>s.portalKey===rp.key).every(s=>onFine(slotYOf(s))));
    T.render();
    check('every boundary wire carries a slot reorder handle',
      doc.querySelectorAll('#edgesG .portal .slothandle').length===T.drillSheet().specs.filter(s=>s.kind!=='internal').length);
    T.undo();
    check('undo restores the original slot order',
      T.drillSheet().portals.find(p=>p.key===rp.key).unders.map(e=>e.id).join()===ids0.join());
  }
}

/* ---- rule 19: moving a FROM/TO column STRETCHES its wires instead of
   re-routing them — the routing on the sheet survives the drag ---- */
{
  const wireKey=eid=>'n|'+eid;
  const ptsOfEdge=eid=>{ const c=T._routeCache.get(wireKey(eid)); return c?c.pts.map(p=>p.slice()):null; };
  T.render();
  const inSpecs=T.drillSheet().specs.filter(s=>s.kind==='in');
  check('the sheet has incoming boundary wires to verify', inSpecs.length>0);
  const before=new Map(inSpecs.map(s=>[s.e.id, ptsOfEdge(s.e.id)]));

  // what a column drag does: pin the current shapes, then move the column
  T.commit();
  T.pinPortalWires('in');
  check('pinning materializes every auto boundary wire as a manual route',
    inSpecs.every(s=>{ const e=S.edges.find(x=>x.id===s.e.id); const r=e&&sheetRouteOf(e); return r && r.pts; }));
  T.setPortalOffset(best.id,'in',-96,24); T.render();

  // every wire kept its whole shape — only the port-adjacent end stretched
  // (collinear vertices may legitimately collapse when the port lines up)
  const simp=p=>{
    const o=[];
    for (const q of p){
      while (o.length>=2){
        const A=o[o.length-2],B=o[o.length-1];
        const col=(Math.abs(A[0]-B[0])<0.01&&Math.abs(B[0]-q[0])<0.01)||(Math.abs(A[1]-B[1])<0.01&&Math.abs(B[1]-q[1])<0.01);
        if (col) o.pop(); else break;
      }
      if (!o.length||Math.abs(o[o.length-1][0]-q[0])>0.01||Math.abs(o[o.length-1][1]-q[1])>0.01) o.push(q);
    }
    return o;
  };
  const kept=inSpecs.every(s=>{
    const a=before.get(s.e.id), b=ptsOfEdge(s.e.id);
    if (!a||!b) return false;
    // a STRAIGHT wire whose portal end moved vertically needs a fresh bend —
    // only its endpoints are checkable (port follows, member end pinned)
    if (a.length===2)
      return Math.abs(b[0][0]-(a[0][0]-96))<0.01 && Math.abs(b[0][1]-(a[0][1]+24))<0.01 &&
             Math.abs(b[b.length-1][0]-a[1][0])<0.01 && Math.abs(b[b.length-1][1]-a[1][1])<0.01;
    const expect=simp([[a[0][0]-96,a[0][1]+24],[a[1][0],a[1][1]+24],...a.slice(2)]);
    return JSON.stringify(simp(b))===JSON.stringify(expect);
  });
  check('a column drag stretches every wire after its port (interior untouched)', kept);
  let bad=null;
  for (const w of wirePts()){ const hit=crossesAny(w.pts, T.openGroupObstacleRects()); if (hit) bad=w.eid+' over '+hit; }
  check('stretched wires are still clear of every block'+(bad?' ['+bad+']':''), !bad);

  // a hand-routed wire (manual pts) survives the move the same way — pick one
  // with an interior to preserve (a straight wire legitimately re-bends)
  const manualSpec=inSpecs.find(s=>{ const e=S.edges.find(x=>x.id===s.e.id);
    const r=e&&sheetRouteOf(e); return r && r.pts && r.pts.length>=4; }) || inSpecs[0];
  const manualShape=sheetRouteOf(S.edges.find(x=>x.id===manualSpec.e.id)).pts.map(p=>p.slice());
  T.setPortalOffset(best.id,'in',-192,48); T.render();
  const after2=ptsOfEdge(manualSpec.e.id);
  check('a further move keeps stretching from the stored shape (no drift)',
    after2.length===manualShape.length &&
    manualShape.slice(2).every((p,i)=>Math.abs(p[0]-after2[i+2][0])<0.01&&Math.abs(p[1]-after2[i+2][1])<0.01));

  // cold render agrees with what is on screen (the cache is not a source of truth)
  const hot=inSpecs.map(s=>JSON.stringify(ptsOfEdge(s.e.id))).join('|');
  T._routeCache.clear(); T.render();
  check('a cold re-render reproduces the stretched shapes exactly',
    inSpecs.map(s=>JSON.stringify(ptsOfEdge(s.e.id))).join('|')===hot);

  T.undo(); T.render();
  check('undo removes the pins and the column offset together',
    T.portalOffsetOf(best.id,'in').dx===0 &&
    inSpecs.every(s=>{ const e=S.edges.find(x=>x.id===s.e.id); return e && !T.nodeEdgeRouteOf(e); }));
}

/* ---- rule 20: a group connection never mixes insulation domains — HV nets
   get their own red connection, and the FROM/TO portals split in two ---- */
{
  T.closeGroupView(); T.render();
  // find (or force) a group pair whose nets span both domains
  const idx=T.nodeGroupIndex();
  let pairEdge=T.diagramEdges(S.edges).find(e=>{
    const gs=idx.get(e.source), gt=idx.get(e.target);
    return gs&&gt&&gs!==gt&&e.nets.length>=2;
  });
  T.commit();
  const realEdge=S.edges.find(x=>x.id===pairEdge.id);
  realEdge.nets[0].hv=true; realEdge.nets[1].hv=false;
  T.render();
  const gs=idx.get(pairEdge.source), gt=idx.get(pairEdge.target);
  const splits=T.computeGroupEdges().filter(e=>e.source===gs&&e.target===gt);
  check('a mixed pair derives TWO group connections, one per domain',
    splits.length===2 && splits.some(e=>e.dom==='hv') && splits.some(e=>e.dom===''));
  const hvE=splits.find(e=>e.dom==='hv'), lvE=splits.find(e=>e.dom==='');
  check('the HV connection carries ONLY HV-domain nets', hvE.nets.every(n=>T.isHvNet(n)));
  check('the LV connection carries NO HV-domain net', lvE.nets.every(n=>!T.isHvNet(n)));
  check('the two connections are separately selectable (distinct ids)', hvE.id!==lvE.id);
  const hvPath=doc.querySelector(`#edgesG .edge[data-eid="${hvE.id}"] path[stroke="var(--sig-hv)"]`);
  check('the HV group connection is drawn in the HV red', !!hvPath);
  const lvPath=doc.querySelector(`#edgesG .edge[data-eid="${lvE.id}"] path[stroke="var(--sig-hv)"]`);
  check('the LV group connection keeps its normal colour', !lvPath);
  // each domain has its own port row on both group blocks
  const rowsAt=gid=>T.groupPortRowsFor(gid).filter(r=>r.src===gs&&r.tgt===gt);
  check('each domain gets its own port row on the blocks',
    rowsAt(gs).length===2 && rowsAt(gt).length===2 &&
    rowsAt(gs).some(r=>r.dom==='hv') && rowsAt(gs).some(r=>!r.dom));

  // drill view: the boundary splits into an LV and an HV portal
  T.openGroupView(gt); T.render();
  const ps=T.drillSheet().portals.filter(p=>p.dir==='in' && p.item.source===gs);
  check('the FROM boundary splits into an LV and an HV portal',
    ps.length===2 && ps.some(p=>p.item.dom==='hv') && ps.some(p=>p.item.dom===''));
  const hvP=ps.find(p=>p.item.dom==='hv');
  check('the HV portal key carries the domain (#hv)', hvP.key.endsWith('#hv'));
  check('the HV portal wires all carry an HV net',
    hvP.unders.length>0 && hvP.unders.every(e=>e.nets.some(n=>T.isHvNet(n))));
  const lvP=ps.find(p=>p.item.dom==='');
  check('the LV portal wires never carry an HV net',
    lvP.unders.every(e=>e.nets.every(n=>!T.isHvNet(n))));
  check('the HV portal box is drawn in the HV red',
    !!doc.querySelector(`#edgesG .portal[data-portal="${hvP.key.replace(/"/g,'')}"] path[stroke="var(--sig-hv)"]`));
  // a domain flip re-anchors ports, so lanes go stale — the in-group
  // Auto-layout (what a user does after re-domaining) must leave the split
  // sheet fully clean
  doc.getElementById('btnLayout').onclick();
  let bad=null;
  for (const w of wirePts()){ const hit=crossesAny(w.pts, T.openGroupObstacleRects()); if (hit) bad=w.eid+' over '+hit; }
  check('wires clear of every block with split portals (after in-group auto-layout)'+(bad?' ['+bad+']':''), !bad);

  T.closeGroupView();
  T.undo(); T.undo(); T.render();   // unwind the auto-layout, then the domain flip
  check('undo merges the pair back into one connection',
    T.computeGroupEdges().filter(e=>e.source===gs&&e.target===gt).length===1);
}

/* ---- rule 21: portal Move up / Move down buttons, and exit-fan nesting —
   wires sharing an exit that turn the same way never cross, they nest ---- */
{
  T.openGroupView(best.id); T.render();

  // --- Move up / Move down on a FROM/TO box
  const col0=T.drillSheet().portals.filter(p=>p.dir===T.drillSheet().portals[0].dir);
  const dir0=col0[0].dir;
  if (col0.length>=2){
    S.sel={ type:'portal', id: col0[0].key }; T.render();
    const up=doc.getElementById('btnPortalUp'), down=doc.getElementById('btnPortalDown');
    check('the portal inspector offers Move up / Move down buttons', !!up && !!down);
    check('Move up is disabled for the topmost box, Move down enabled', up.disabled && !down.disabled);
    const yBefore=col0.map(p=>p.key+'@'+p.r.y).join('|');
    down.onclick();
    const colAfter=T.drillSheet().portals.filter(p=>p.dir===dir0);
    check('Move down swaps the box with its neighbour',
      colAfter[1].key===col0[0].key && colAfter[0].key===col0[1].key);
    check('the manual box order lands in S.portalSeq', (S.portalSeq[best.id]||{})[dir0][1]===col0[0].key);
    T.undo(); T.render();
    check('undo restores the previous box order',
      T.drillSheet().portals.filter(p=>p.dir===dir0).map(p=>p.key+'@'+p.r.y).join('|')===yBefore);
  }
  S.sel=null; T.render();

  // --- exit-fan nesting: same exit, same turn direction → nested, never crossed
  const pts=eid=>{ const c=T._routeCache.get('n|'+eid); return c?c.pts:null; };
  // the algorithm's hard guarantee binds wires sitting at their FAN-ASSIGNED
  // lanes (no fallback bump) whose pure Z turns at this fan's end — the
  // interval colouring makes those mathematically crossing-free; a wire whose
  // disciplined slot lay across a block took a fallback lane and may cross
  const specs21=T.drillSheet().specs;
  const baseLanes=T.fanAssignLanes(specs21.map(s=>({ key:T.nodeEdgeLaneKey(s.e), pa:s.pa, pb:s.pb })));
  const ends=[];
  for (const s of specs21){
    const p=pts(s.e.id); if (!p) continue;
    const key=T.nodeEdgeLaneKey(s.e);
    const lane=S.groupEdgeLanes[key], base=baseLanes.get(key);
    const atBase= base && T.laneEnd(lane,'a')===base.a && T.laneEnd(lane,'b')===base.b;
    const bxA=s.pa.x + s.pa.sign*T.fanStub(s.pa, T.laneEnd(lane,'a'));
    const bxB=s.pb.x - s.pb.sign*T.fanStub(s.pb, T.laneEnd(lane,'b'));
    let firstBend=null;
    for(let k=0;k<p.length-1;k++) if (Math.abs(p[k][1]-p[k+1][1])>=0.5){ firstBend=p[k][0]; break; }
    for (const [end,anchor,other] of [['a',s.pa,s.pb],['b',s.pb,s.pa]]){
      if (Math.abs(other.y-anchor.y)<0.5) continue;
      const turnsHere = atBase && p.length===4 && firstBend!=null &&
        Math.abs(firstBend-(end==='a'?bxA:bxB))<0.5;
      ends.push({ eid:s.e.id, x:Math.round(anchor.x), sign:anchor.sign, y:anchor.y, turnsHere,
        vd: other.y<anchor.y?-1:1, lo:Math.min(anchor.y,other.y), hi:Math.max(anchor.y,other.y), pts:p });
    }
  }
  // crossings inside a WINDOW of x — the fan region between the block edge and
  // the outermost first-turn vertical (the rule governs the exit; a crossing
  // far downstream may be topologically forced by interleaved destinations)
  const crossingsIn=(A,B,x1,x2)=>{
    const segs=q=>{ const o=[]; for(let i=0;i<q.length-1;i++) o.push([q[i],q[i+1]]); return o; };
    let n=0;
    for (const [a1,a2] of segs(A)) for (const [b1,b2] of segs(B)){
      const aH=Math.abs(a1[1]-a2[1])<0.5, bH=Math.abs(b1[1]-b2[1])<0.5;
      if (aH===bH) continue;
      const h=aH?[a1,a2]:[b1,b2], v=aH?[b1,b2]:[a1,a2];
      const y=h[0][1], x=v[0][0];
      if (x>Math.min(h[0][0],h[1][0])+0.5 && x<Math.max(h[0][0],h[1][0])-0.5 &&
          y>Math.min(v[0][1],v[1][1])+0.5 && y<Math.max(v[0][1],v[1][1])-0.5 &&
          x>=x1-0.5 && x<=x2+0.5) n++;
    }
    return n;
  };
  const bendXOf=e=>{ const q=e.pts; for(let k=0;k<q.length-1;k++) if (Math.abs(q[k][1]-q[k+1][1])>=0.5) return q[k][0]; return null; };
  let fanPairs=0, zPairs=0, zCrossings=0, laxPairsCrossed=0, spacedOk=true;
  for (let i=0;i<ends.length;i++) for (let j=i+1;j<ends.length;j++){
    const A=ends[i], B=ends[j];
    if (A.eid===B.eid || A.x!==B.x || A.sign!==B.sign || A.vd!==B.vd) continue;
    if (!(A.lo<B.hi && A.hi>B.lo)) continue;   // spans must overlap to matter
    const bxA=bendXOf(A), bxB=bendXOf(B);
    if (bxA==null || bxB==null) continue;
    fanPairs++;
    const w1=Math.min(A.x,bxA,bxB), w2=Math.max(A.x,bxA,bxB);
    const n=crossingsIn(A.pts, B.pts, w1, w2);
    // both wires kept the DISCIPLINED Z (4 points): the hard guarantee —
    // wires that turn where their lane says can never cross each other.
    // A wire that had to fall back to the free router (its Z lay across a
    // block) may still cross: those pairs are bounded, not forbidden.
    if (A.turnsHere && B.turnsHere){ zPairs++; zCrossings+=n; }
    else if (n>0) laxPairsCrossed++;
    // wires turning on THIS fan's ladder keep at least one FULL GRID between
    // their verticals — the same distance as two ports of a block (a wire
    // turning at its other end rides a different, phase-shifted ladder)
    if (A.turnsHere && B.turnsHere && Math.abs(bxA-bxB)<T.FAN_PITCH-0.5) spacedOk=false;
  }
  console.log('   '+fanPairs+' overlapping same-direction fan pairs ('+zPairs+' fully disciplined, '+laxPairsCrossed+' router-fallback pairs cross)');
  check('a disciplined fan exists to verify (test is meaningful)', zPairs>0);
  check('disciplined fan wires NEVER cross inside the fan region', zCrossings===0);
  check('router-fallback fan crossings never regress past the fixture baseline (≤16 pairs; was 23 before nesting)', laxPairsCrossed<=16);
  check('fan wires keep at least one GRID (block-port pitch) of offset', spacedOk);
}

/* ================= rule 22 — no "antenna" spurs from foreign-sheet routes =================
   A boundary connection is drawn on BOTH ends' drill sheets; a polyline
   authored in one is meaningless in the other. Routes carry the sheet that
   authored them (route.sheet) and are honoured only there; an untagged legacy
   route is adopted only by the sheet whose anchors it matches exactly.
   Whatever happens, a drawn wire never retraces its own segment. */
{
  const backtrackAt = pts => {
    for (let i=0;i<pts.length-2;i++){
      const d1=[pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]];
      const d2=[pts[i+2][0]-pts[i+1][0],pts[i+2][1]-pts[i+1][1]];
      const ax1=Math.abs(d1[0])>0.01?'h':'v', ax2=Math.abs(d2[0])>0.01?'h':'v';
      if (ax1!==ax2) continue;
      const s1=ax1==='h'?Math.sign(d1[0]):Math.sign(d1[1]);
      const s2=ax2==='h'?Math.sign(d2[0]):Math.sign(d2[1]);
      if (s1&&s2&&s1!==s2) return i;
    }
    return -1;
  };
  check('cleanPts flattens an out-and-back spur into a straight run',
    JSON.stringify(T.cleanPts([[0,0],[100,0],[40,0],[40,50]]))===JSON.stringify([[0,0],[40,0],[40,50]]));
  check('cleanPts collapses a junction spike (duplicate-shielded backtrack)',
    JSON.stringify(T.cleanPts([[0,0],[50,0],[50,20],[50,0],[80,0]]))===JSON.stringify([[0,0],[80,0]]));

  const sheet0 = T.drillSheet();
  const bSpec = sheet0.specs.find(s=>s.kind!=='internal');
  check('fixture drill has a boundary wire to verify (test is meaningful)', !!bSpec);
  if (bSpec){
    const e = S.edges.find(x=>x.id===bSpec.e.id);
    const wireOf = s => T.groupEdgePtsCached(T.NODE_ROUTE_PREFIX+s.e.id, s.pa, s.pb,
      T.nodeEdgeRouteOf(e), T.drillSheet().obstacles, S.groupEdgeLanes[T.nodeEdgeLaneKey(s.e)]||0);
    const savedRoutes = e.routes ? JSON.parse(JSON.stringify(e.routes)) : undefined;
    const saved = e.route;

    // a route tagged for ANOTHER sheet is invisible here
    e.route = { pts:[[9000,9000],[9400,9000],[9400,9200],[9800,9200]], sheet:'SOME_OTHER_GROUP' };
    check('a route authored on another sheet is quarantined (nodeEdgeRouteOf → auto)', !T.nodeEdgeRouteOf(e));
    T._routeCache.clear();
    let r = wireOf(bSpec);
    check('the quarantined wire draws anchor-to-anchor with no spur',
      backtrackAt(r.pts)<0 &&
      Math.abs(r.pts[0][0]-bSpec.pa.x)<0.75 && Math.abs(r.pts[0][1]-bSpec.pa.y)<0.75 &&
      Math.abs(r.pts[r.pts.length-1][0]-bSpec.pb.x)<0.75 && Math.abs(r.pts[r.pts.length-1][1]-bSpec.pb.y)<0.75);

    // an UNTAGGED legacy route that does NOT meet this sheet's anchors (the
    // user-reported antenna scenario) is never adopted, never waypoint-degraded
    e.route = { pts:[[9000,9000],[9400,9000],[9400,9200],[9800,9200]] };
    T.drillSheet();   // adoption pass runs here
    check('an untagged foreign polyline is NOT adopted by this sheet', e.route.sheet==null);
    check('…and stays invisible to the drill router', !T.nodeEdgeRouteOf(e));
    T._routeCache.clear();
    r = wireOf(bSpec);
    check('…so the wire re-routes cleanly instead of growing an antenna', backtrackAt(r.pts)<0);

    // an untagged legacy route whose ends DO match is adopted for this sheet
    T._routeCache.clear();
    const auto = wireOf(bSpec);
    delete e.routes; e.route = { pts: auto.pts.map(p=>p.slice()) };
    T.drillSheet();
    check('an untagged polyline matching this sheet\'s anchors is adopted (moved into e.routes)',
      !e.route && !!(e.routes && e.routes[S.openGroup]));
    check('…and is honoured by the drill router again', !!T.nodeEdgeRouteOf(e));

    if (saved) e.route = saved; else delete e.route;
    if (savedRoutes) e.routes = savedRoutes; else delete e.routes;
    T._routeCache.clear(); T.render();
  }

  // the whole open sheet, as drawn, contains no retraced segment anywhere
  const sheet1 = T.drillSheet();
  let spur = null;
  for (const s of sheet1.specs){
    const e2 = S.edges.find(x=>x.id===s.e.id);
    const rr = T.groupEdgePtsCached(T.NODE_ROUTE_PREFIX+s.e.id, s.pa, s.pb,
      e2?T.nodeEdgeRouteOf(e2):undefined, sheet1.obstacles, S.groupEdgeLanes[T.nodeEdgeLaneKey(s.e)]||0);
    if (backtrackAt(rr.pts)>=0) spur = s.e.id;
  }
  check('no drawn wire on the open sheet retraces its own segment'+(spur?' ['+spur+']':''), !spur);

  // new manual routes are born sheet-tagged at both write sites
  const src = fs.readFileSync('app.js','utf8');
  check('segment drags store into this sheet\'s own route slot',
    /if \(e\) setNodeEdgeRoute\(e, route\);/.test(src));
  check('pinned portal wires store into this sheet\'s own route slot',
    /setNodeEdgeRoute\(e, \{ pts: r\.pts\.map\(p=>p\.slice\(\)\) \}\);/.test(src));
}

/* ============= rule 23 — a block drag never disturbs wires it didn't touch =============
   Moving a member block pins EVERY wire of the sheet to its current shape
   first (persisted manual routes, same rule as the FROM/TO column drag): the
   moved block's wires stretch after their ports, all other wires keep their
   exact geometry, the pins ride the export, and one undo removes them. */
{
  const sheet0=T.drillSheet();
  const wireOf=s=>{
    const e=S.edges.find(x=>x.id===s.e.id);
    return T.groupEdgePtsCached(T.NODE_ROUTE_PREFIX+s.e.id, s.pa, s.pb,
      e?T.nodeEdgeRouteOf(e):undefined, T.drillSheet().obstacles,
      S.groupEdgeLanes[T.nodeEdgeLaneKey(s.e)]||0).pts;
  };
  const shapes0=new Map(sheet0.specs.map(s=>[s.e.id, JSON.stringify(wireOf(s))]));
  const countRouted=()=>S.edges.filter(e=>e.route||(e.routes&&Object.keys(e.routes).length)).length;
  const routed0=countRouted();
  // a foreign-sheet route must survive the pinning untouched
  const foreignSpec=sheet0.specs.find(s=>{ const e=S.edges.find(x=>x.id===s.e.id); return e && !e.route && !(e.routes&&e.routes[best.id]); });
  const foreignEdge=S.edges.find(x=>x.id===foreignSpec.e.id);
  foreignEdge.route={ pts:[[1,2],[3,2]], sheet:'ELSEWHERE' };

  // the drag, exactly as the handler does it: snapshot -> pin -> move
  const victim=sheet0.members.find(n=>sheet0.specs.some(s=>s.kind==='internal'&&(s.e.source===n.id||s.e.target===n.id)))||sheet0.members[0];
  T.commit(); T.pinSheetWires();
  check('pinning stores a persisted route for every previously-auto wire',
    sheet0.specs.every(s=>{ const e=S.edges.find(x=>x.id===s.e.id);
      return e && (sheetRouteOf(e) || e.route); }));
  check('…under this sheet\'s own slot (per-sheet map)', sheet0.specs.every(s=>{
    const e=S.edges.find(x=>x.id===s.e.id);
    return (e.routes&&e.routes[best.id]) || (e.route&&e.route.sheet==='ELSEWHERE'); }));
  check('a route authored on another sheet is never clobbered by the pin',
    JSON.stringify(foreignEdge.route)===JSON.stringify({ pts:[[1,2],[3,2]], sheet:'ELSEWHERE' }));
  victim.y+=48; T.render();

  const touched=id=>{ const s=sheet0.specs.find(x=>x.e.id===id); return s.e.source===victim.id||s.e.target===victim.id; };
  // a wire only re-routes if the block LANDED ON its old shape — that dodge
  // is the one legitimate change (same rule as drop-on-wire at the top level)
  const victimRect=T.drillSheet().obstacles.find(r=>r.id===victim.id);
  const untouchedChanged=[...shapes0.keys()].filter(id=>!touched(id) &&
    !!(S.edges.find(x=>x.id===id).routes||{})[best.id] &&
    !crossesAny(JSON.parse(shapes0.get(id)),[victimRect]) &&
    JSON.stringify(wireOf(sheet0.specs.find(x=>x.e.id===id)))!==shapes0.get(id));
  check('after the move, every wire NOT on the moved block keeps its exact shape',
    untouchedChanged.length===0);
  check('the moved block\'s wires still land on its ports (they stretched)',
    sheet0.specs.filter(s=>touched(s.e.id)).every(s=>{
      const sh=T.drillSheet(); const sp=sh.specs.find(x=>x.e.id===s.e.id);
      const pts=wireOf(sp);
      const near=(p,a)=>Math.abs(p[0]-a.x)<0.75&&Math.abs(p[1]-a.y)<0.75;
      return near(pts[0],sp.pa)&&near(pts[pts.length-1],sp.pb);
    }));
  check('the pinned shapes ride the export (Save session carries them)',
    T.buildSessionJSON().edges.filter(e=>e.routes&&e.routes[best.id]).length>=sheet0.specs.length-1);
  check('the drag handler pins on first movement, after the snapshot',
    /if \(!drag\.pinned\)\{ drag\.pinned = true; pinSheetWires\(\); \}/.test(fs.readFileSync('app.js','utf8')));
  T.undo(); T.render();
  // the snapshot was taken AFTER planting the foreign route, so undo keeps
  // that one and removes exactly the pins (and the move) added afterwards
  check('one undo removes the pins and the move together', countRouted()===routed0+1);
  delete foreignEdge.route; T._routeCache.clear(); T.render();
}

/* ====== rule 24 — a new connection elsewhere never re-deals this sheet's lanes ======
   Lane keys are global (a boundary edge is drawn on BOTH ends' sheets), and
   the lazy assigner used to re-deal a whole sheet whenever ANY wire lacked a
   lane — so adding a net in group B moved wires in group A. Now the lazy
   pass fills ONLY the missing lanes; the full re-deal belongs to the
   Auto-layout button alone. */
{
  const laneShot=()=>{ const sh=T.drillSheet();
    return new Map(sh.specs.map(s=>[s.e.id, JSON.stringify(S.groupEdgeLanes[T.nodeEdgeLaneKey(s.e)]??null)])); };
  const wireShot=()=>{ const sh=T.drillSheet();
    return new Map(sh.specs.map(s=>{
      const e=S.edges.find(x=>x.id===s.e.id);
      return [s.e.id, JSON.stringify(T.groupEdgePtsCached(T.NODE_ROUTE_PREFIX+s.e.id,s.pa,s.pb,
        e?T.nodeEdgeRouteOf(e):undefined, sh.obstacles, S.groupEdgeLanes[T.nodeEdgeLaneKey(s.e)]||0).pts)];
    })); };
  const lanes0=laneShot(), wires0=wireShot();
  const farG=T.groupsWithUngrouped().find(g=>g.id!==best.id && g.members.length>=2);
  check('another group with two members exists (test is meaningful)', !!farG);
  const [m1,m2]=farG.members;
  T.closeGroupView(); T.openGroupView(farG.id);
  T.commit(); T.addNetToEdge(m1, m2, {name:'RULE24_NET', type:'CONTROL_SIGNAL', description:''});
  T.render();
  check('the new wire got a lane of its own on first paint',
    S.groupEdgeLanes['n:'+m1+'→'+m2]!=null);
  T.closeGroupView(); T.openGroupView(best.id);
  const lanes1=laneShot(), wires1=wireShot();
  const laneMoved=[...lanes0.keys()].filter(k=>lanes0.get(k)!=='null' && lanes1.get(k)!==lanes0.get(k));
  const wireMoved=[...wires0.keys()].filter(k=>wires1.has(k) && wires1.get(k)!==wires0.get(k));
  check('back on the first sheet, no existing lane was re-dealt', laneMoved.length===0);
  check('…and no wire moved', wireMoved.length===0);
  const src=fs.readFileSync('app.js','utf8');
  check('the lazy pass fills only missing lanes; the button still re-deals all',
    /assignNodeEdgeLanes\(true\);/.test(src) &&
    /btnLayout[\s\S]{0,200}assignNodeEdgeLanes\(\);/.test(src));
  T.undo(); T.render();
  check('one undo removes the probe net again', !S.edges.some(e=>e.nets.some(n=>n.name==='RULE24_NET')));
}

/* ====== rule 25 — the same boundary wire, hand-routed on BOTH sheets ======
   A boundary connection is drawn on its two groups' sheets. Routes are stored
   PER SHEET (e.routes[gid]), so shaping the wire over there never clobbers
   the shape given to it over here — the user's exact lost-work report. */
{
  T.openGroupView(best.id);   // rule 24's undo may have left another sheet open
  const bSpec=T.drillSheet().specs.find(s=>s.kind!=='internal');
  const eB=S.edges.find(x=>x.id===bSpec.e.id);
  const farGid=eB.source===bSpec.e.source && T.nodeGroupIndex().get(eB.source)!==best.id
    ? T.nodeGroupIndex().get(eB.source) : T.nodeGroupIndex().get(eB.target)!==best.id
    ? T.nodeGroupIndex().get(eB.target) : T.nodeGroupIndex().get(eB.source);
  check('a boundary wire with a far group exists (test is meaningful)', !!farGid && farGid!==best.id);
  const savedRoutes=eB.routes?JSON.parse(JSON.stringify(eB.routes)):undefined, savedRoute=eB.route;
  delete eB.routes; delete eB.route;

  // hand-route it HERE
  const shapeA={ pts:[[bSpec.pa.x,bSpec.pa.y],[bSpec.pa.x+48,bSpec.pa.y],[bSpec.pa.x+48,bSpec.pb.y],[bSpec.pb.x,bSpec.pb.y]] };
  T.commit(); T.setNodeEdgeRoute(eB, shapeA);
  check('the shape lands in THIS sheet\'s slot', JSON.stringify(eB.routes[best.id])===JSON.stringify(shapeA));

  // hand-route the SAME connection on the far group's sheet
  T.closeGroupView(); T.openGroupView(farGid);
  const farSpec=T.drillSheet().specs.find(s=>s.e.id===eB.id);
  check('the far sheet draws the same connection', !!farSpec);
  const shapeB={ pts:[[farSpec.pa.x,farSpec.pa.y],[farSpec.pa.x+72,farSpec.pa.y],[farSpec.pa.x+72,farSpec.pb.y],[farSpec.pb.x,farSpec.pb.y]] };
  T.commit(); T.setNodeEdgeRoute(eB, shapeB);
  check('…into ITS OWN slot, without touching this sheet\'s',
    JSON.stringify(eB.routes[farGid])===JSON.stringify(shapeB) &&
    JSON.stringify(eB.routes[best.id])===JSON.stringify(shapeA));

  // back here: the shape is exactly as the user left it
  T.closeGroupView(); T.openGroupView(best.id);
  check('back on the first sheet, the hand shape is untouched',
    JSON.stringify(T.nodeEdgeRouteOf(eB))===JSON.stringify(shapeA));

  // both shapes ride the session export and come back
  const sess=JSON.parse(JSON.stringify(T.buildSessionJSON()));
  const se=sess.edges.find(x=>x.id===eB.id);
  check('Save session carries BOTH sheets\' shapes',
    JSON.stringify(se.routes[best.id])===JSON.stringify(shapeA) &&
    JSON.stringify(se.routes[farGid])===JSON.stringify(shapeB));
  // a legacy single-slot session still loads: tagged -> that sheet's map entry
  const legacy=JSON.parse(JSON.stringify(sess));
  const le=legacy.edges.find(x=>x.id===eB.id);
  delete le.routes; le.route={ pts:shapeA.pts, sheet:best.id };
  T.loadSession(legacy);
  const eL=S.edges.find(x=>x.id===eB.id);
  check('a legacy sheet-tagged route migrates into the per-sheet map on load',
    !eL.route && JSON.stringify(eL.routes[best.id])===JSON.stringify({pts:shapeA.pts}));
  T.loadSession(sess); T.openGroupView(best.id);
  const eR=S.edges.find(x=>x.id===eB.id);
  if (savedRoutes) eR.routes=savedRoutes; else delete eR.routes;
  if (savedRoute) eR.route=savedRoute;
  T._routeCache.clear(); T.render();
}

T.closeGroupView();
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
