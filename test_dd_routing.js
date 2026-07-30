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
 groupsWithUngrouped,nodeById,openGroupObstacleRects,nodeEdgeLaneKey,commit,undo,_routeCache};`);
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

/* ---- rule 6: FROM/TO boundary portals kept ---- */
{
  const portals=[...doc.querySelectorAll('#edgesG .portal')];
  check('boundary portals still rendered', portals.length>0);
  check('portals keep their FROM/TO labels', portals.every(p=>{
    const t=p.querySelector('text').textContent; return t==='FROM'||t==='TO';
  }));
}

T.closeGroupView();
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
