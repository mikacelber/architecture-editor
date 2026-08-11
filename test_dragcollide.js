'use strict';
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,computeGroupEdges,visibleGroups,groupBlockRect,
  groupPortAnchor,groupEdgeRouteKey,groupEdgeRouteOf,setGroupEdgeRoute,sidedGeometry,groupEdgePts,
  snapPastVertical,snapPastHorizontal,padForRoute,vSegHitsRect,hSegHitsRect,groupPosOf,_routeCache};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();

const obstacles=()=>T.visibleGroups().map(g=>T.groupBlockRect(g.id));
function segs(d){const n=d.replace(/[ML]/g,' ').trim().split(/\s+/).map(Number);const p=[];for(let i=0;i<n.length;i+=2)p.push([n[i],n[i+1]]);const s=[];for(let i=0;i<p.length-1;i++)s.push([p[i],p[i+1]]);return s;}
// A wire "passes behind a block" only if it overlaps the block's OPEN INTERIOR.
// The padded test used by the router would also flag the legitimate stub leaving
// a port, which starts exactly on its own block's edge.
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

/* ---------- pick a block and drag a vertical segment straight through it ---------- */
const victim = T.groupBlockRect('CONTROL_AND_SUPERVISION');
const e0 = T.computeGroupEdges().find(e=>e.source!=='CONTROL_AND_SUPERVISION' && e.target!=='CONTROL_AND_SUPERVISION');
const pa=T.groupPortAnchor(e0.source,e0.source,e0.target,'out');
const pb=T.groupPortAnchor(e0.target,e0.source,e0.target,'in');

// simulate a right-to-left drag of the first vertical jog across the victim block
let lastRaw=null, lastDir=0, inside=0, landedInside=0;
const startX = victim.x + victim.w + 120;
for (let x=startX; x>victim.x-120; x-=8){
  const raw = Math.round(x/8)*8;
  const dir = Math.sign(raw-(lastRaw!=null?lastRaw:raw)) || lastDir || 0;
  if (dir) lastDir=dir;
  lastRaw=raw;
  const cur = T.groupEdgeRouteOf(e0.source,e0.target) || {};
  const g0 = T.sidedGeometry(pa,pb,{...cur,x:raw});
  const snapped = T.snapPastVertical(raw, g0.y1, g0.bendY, obstacles(), dir);
  T.setGroupEdgeRoute(e0.source,e0.target,{x:snapped});
  // is the RAW pointer inside the victim's span (i.e. would a naive drag be behind it)?
  const p=T.padForRoute(victim);
  const rawInside = raw>p.x1 && raw<p.x2 && T.vSegHitsRect(raw,g0.y1,g0.bendY,victim);
  if (rawInside){ inside++; if (T.vSegHitsRect(snapped,g0.y1,g0.bendY,victim)) landedInside++; }
}
console.log('   pointer was inside the block for '+inside+' of the drag steps');
check('the drag actually passed through the block (test is meaningful)', inside>0);
check('the segment NEVER came to rest inside the block', landedInside===0);

// after a right-to-left drag it must have hopped to the LEFT of the block
const routeAfter = T.groupEdgeRouteOf(e0.source,e0.target);
check('after dragging leftwards the segment sits left of the block',
  routeAfter.x <= T.padForRoute(victim).x1);

/* ---------- reverse direction: it should hop back to the right side ---------- */
lastRaw=null; lastDir=0; let hoppedRight=false;
for (let x=victim.x-100; x<victim.x+victim.w+120; x+=8){
  const raw = Math.round(x/8)*8;
  const dir = Math.sign(raw-(lastRaw!=null?lastRaw:raw)) || lastDir || 0;
  if (dir) lastDir=dir;
  lastRaw=raw;
  const cur = T.groupEdgeRouteOf(e0.source,e0.target) || {};
  const g0 = T.sidedGeometry(pa,pb,{...cur,x:raw});
  const snapped = T.snapPastVertical(raw, g0.y1, g0.bendY, obstacles(), dir);
  T.setGroupEdgeRoute(e0.source,e0.target,{x:snapped});
  if (raw>T.padForRoute(victim).x1 && raw<T.padForRoute(victim).x2 && snapped>=T.padForRoute(victim).x2) hoppedRight=true;
}
check('dragging back rightwards hops the segment to the far (right) side', hoppedRight);

/* ---------- same for the horizontal plateau dragged vertically ---------- */
delete S.groupEdgeRoutes[T.groupEdgeRouteKey(e0.source,e0.target)];
T.render();
lastRaw=null; lastDir=0; let hInside=0, hLanded=0;
for (let y=victim.y-120; y<victim.y+victim.h+120; y+=8){
  const raw = Math.round(y/8)*8;
  const dir = Math.sign(raw-(lastRaw!=null?lastRaw:raw)) || lastDir || 0;
  if (dir) lastDir=dir;
  lastRaw=raw;
  const cur = T.groupEdgeRouteOf(e0.source,e0.target) || {};
  const g0 = T.sidedGeometry(pa,pb,{...cur,y:raw});
  const snapped = T.snapPastHorizontal(raw, g0.bendX, g0.entryX, obstacles(), dir);
  T.setGroupEdgeRoute(e0.source,e0.target,{y:snapped});
  if (T.hSegHitsRect(raw,g0.bendX,g0.entryX,victim)){ hInside++; if (T.hSegHitsRect(snapped,g0.bendX,g0.entryX,victim)) hLanded++; }
}
console.log('   plateau pointer was inside a block for '+hInside+' steps');
check('the plateau never comes to rest across a block', hLanded===0);

/* ---------- the DRAWN wire is clear of every block at all times ---------- */
let drawnCross=null;
for (const e of T.computeGroupEdges()){
  const A=T.groupPortAnchor(e.source,e.source,e.target,'out');
  const B=T.groupPortAnchor(e.target,e.source,e.target,'in');
  const r=T.groupEdgePts(A,B,T.groupEdgeRouteOf(e.source,e.target),obstacles());
  const bad=crossesAny(r.pts,obstacles());
  if (bad) drawnCross=T.groupEdgeRouteKey(e.source,e.target)+' over '+bad;
}
check('no drawn wire crosses a block after the manual drags'+(drawnCross?' ['+drawnCross+']':''), !drawnCross);

/* ---------- a block moved ONTO an existing manual route is corrected on draw ---------- */
const key=T.groupEdgeRouteKey(e0.source,e0.target);
T.setGroupEdgeRoute(e0.source,e0.target,{ y: victim.y - 400, x: victim.x - 400 });
T.render();
const mv=T.groupPosOf('USER_INDICATION'); const ox=mv.x, oy=mv.y;
// park a block right on the manual plateau
mv.x = victim.x - 500; mv.y = victim.y - 460;
T.render();
const A2=T.groupPortAnchor(e0.source,e0.source,e0.target,'out');
const B2=T.groupPortAnchor(e0.target,e0.source,e0.target,'in');
const res=T.groupEdgePts(A2,B2,T.groupEdgeRouteOf(e0.source,e0.target),obstacles());
check('a block dropped onto a manual route is routed around when drawn', !crossesAny(res.pts,obstacles()));
mv.x=ox; mv.y=oy; delete S.groupEdgeRoutes[key]; T._routeCache.clear(); T.render();

/* ---------- both levels share one segment-translation drag pipeline ---------- */
{
  const src = fs.readFileSync('app.js','utf8');
  check('drill-down segment drags share the top-level route store write',
    /if \(drag\.topLevel\) setGroupEdgeRoute\(drag\.src, drag\.tgt, route, drag\.dom\);/.test(src) &&
    /if \(e\) setNodeEdgeRoute\(e, route\);/.test(src));
  check('the drag translates the grabbed segment in place',
    /translateWireSegment\(drag\.pts, drag\.segIdx, drag\.axis, raw, obstacles, dir\)/.test(src));
  check('the raw elbow patch \\{x,y,x2\\} is gone from the drag handler',
    !/drag\.mode==='routeE'/.test(src));
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
