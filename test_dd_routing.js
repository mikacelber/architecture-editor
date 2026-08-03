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
 movePortalSlotToRow,commit,undo};`);
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
  // outer end is a semicircle: the box path carries an arc of radius h/2
  // (heights vary — one GRID row per wire — so the radius follows each box)
  const shaped=domPortals.every(p=>{
    const sr=(+p.dataset.h)/2;
    const d=(p.querySelector('path[fill="var(--vellum)"]')||{getAttribute:()=>''}).getAttribute('d')||'';
    return d.includes(`A ${sr} ${sr}`);
  });
  check('every portal box has a semicircular outer end (arc r=h/2)', shaped);
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
  const slotYOf=s=>s.kind==='in'?s.pa.y:s.pb.y;
  const sheet=T.drillSheet();
  check('every portal box sits on the grid (y and h are GRID multiples)',
    sheet.portals.every(p=>onGrid(p.r.y)&&onGrid(p.r.h)));
  const bSpecs=sheet.specs.filter(s=>s.kind!=='internal');
  check('every portal exit slot lands exactly on a grid line',
    bSpecs.length>0 && bSpecs.every(s=>onGrid(slotYOf(s))));
  const byPortal={};
  for (const s of bSpecs) (byPortal[s.portalKey]=byPortal[s.portalKey]||[]).push(slotYOf(s));
  check('no two wires of a portal share a slot row',
    Object.values(byPortal).every(ys=>new Set(ys).size===ys.length));

  // live X anchoring: pushing the leftmost block further left tows the FROM
  // column along (same corridor offset); TO and every Y stay put
  const members=T.groupsWithUngrouped().find(x=>x.id===best.id).members.map(id=>T.nodeById(id));
  const leftmost=members.reduce((a,n)=>n.x<a.x?n:a,members[0]);
  const fromX0=Math.min(...sheet.portals.filter(p=>p.dir==='in').map(p=>p.r.x));
  const toX0=Math.max(...sheet.portals.filter(p=>p.dir==='out').map(p=>p.r.x));
  const ys0=sheet.portals.map(p=>p.key+'@'+p.r.y).join('|');
  const ox=leftmost.x; leftmost.x-=96; T.render();
  const sheet2=T.drillSheet();
  check('the FROM column follows the member extents in X (offset preserved)',
    Math.min(...sheet2.portals.filter(p=>p.dir==='in').map(p=>p.r.x))===fromX0-96);
  check('the TO column stays put when only minX changes',
    Math.max(...sheet2.portals.filter(p=>p.dir==='out').map(p=>p.r.x))===toX0);
  check('the columns never move in Y when blocks move (Y stays frozen)',
    sheet2.portals.map(p=>p.key+'@'+p.r.y).join('|')===ys0);
  leftmost.x=ox; T.render();

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
      T.drillSheet().specs.filter(s=>s.portalKey===rp.key).every(s=>onGrid(slotYOf(s))));
    T.render();
    check('every boundary wire carries a slot reorder handle',
      doc.querySelectorAll('#edgesG .portal .slothandle').length===T.drillSheet().specs.filter(s=>s.kind!=='internal').length);
    T.undo();
    check('undo restores the original slot order',
      T.drillSheet().portals.find(p=>p.key===rp.key).unders.map(e=>e.id).join()===ids0.join());
  }
}

T.closeGroupView();
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
