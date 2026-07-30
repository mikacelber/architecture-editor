'use strict';
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,computeGroupEdges,visibleGroups,groupBlockRect,
 groupPortAnchor,groupEdgeRouteKey,groupEdgePts,laneOf,setGroupEdgeRoute,groupEdgeRouteOf,groupPortRowsFor,
 groupPortRowY,groupsWithUngrouped,ptsClearOf,snapG,_routeCache,openGroupView,closeGroupView,
 latticeRoute:latticeRoute,updateGridLOD,snapView,GRID:GRID,GROUP_PORT_ROW_H:GROUP_PORT_ROW_H,GROUP_PORT_STUB:GROUP_PORT_STUB,LANE_PITCH:LANE_PITCH};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
S.view.k=1; T.updateGridLOD();   // fitView zooms out past the LOD threshold; the minor-grid checks assume k=1
const onGrid=v=>Math.abs(v-Math.round(v/T.GRID)*T.GRID)<0.01;
const obs=()=>T.visibleGroups().map(g=>T.groupBlockRect(g.id));

/* ---- the grid is the port pitch ---- */
check('GRID equals the minimum Y distance between two ports ('+T.GRID+'px = port row pitch)', T.GRID===T.GROUP_PORT_ROW_H);
{
  let minDy=Infinity;
  for (const g of T.visibleGroups()){
    const ys=T.groupPortRowsFor(g.id).map(r=>T.groupPortRowY(T.groupsWithUngrouped().find(x=>x.id===g.id), r.row)).sort((a,b)=>a-b);
    for(let i=1;i<ys.length;i++) minDy=Math.min(minDy, ys[i]-ys[i-1]);
  }
  check('measured min port spacing equals GRID ('+minDy+')', Math.abs(minDy-T.GRID)<0.01);
}

/* ---- blocks: position and dimensions on the grid ---- */
{
  let ok=true, dims=true;
  for (const g of T.visibleGroups()){
    const r=T.groupBlockRect(g.id);
    if (!onGrid(r.x)||!onGrid(r.y)) ok=false;
    if (!onGrid(r.w)||!onGrid(r.h)) dims=false;
  }
  check('every block position is on the grid', ok);
  check('every block width and height is a grid multiple', dims);
}

/* ---- ports on grid lines ---- */
{
  let ok=true;
  for (const e of T.computeGroupEdges()){
    const pa=T.groupPortAnchor(e.source,e.source,e.target,'out');
    const pb=T.groupPortAnchor(e.target,e.source,e.target,'in');
    if (!onGrid(pa.x)||!onGrid(pa.y)||!onGrid(pb.x)||!onGrid(pb.y)) ok=false;
  }
  check('every port (x and y, both ends) sits on a grid line', ok);
}

/* ---- THE point of it all: waypoint at port height → dead straight wire ---- */
{
  let tested=0, straight=0;
  for (const e of T.computeGroupEdges()){
    const pa=T.groupPortAnchor(e.source,e.source,e.target,'out');
    const pb=T.groupPortAnchor(e.target,e.source,e.target,'in');
    if (pa.sign<=0 || pb.sign<=0) continue;
    const wx=T.snapG((pa.x+pb.x)/2);
    // drag the wire to the SOURCE port's own height at mid-corridor. The
    // clearance precheck must ignore the wire's own endpoint blocks (their
    // padded rects always graze the port stub) and start past the stub.
    const others=obs().filter(r=>r.id!==e.source&&r.id!==e.target);
    if (wx<=pa.x+T.GROUP_PORT_STUB) continue;
    if (!T.ptsClearOf([[pa.x+T.GROUP_PORT_STUB,pa.y],[wx,pa.y]], others)) continue;
    T.setGroupEdgeRoute(e.source,e.target,{wx, wy:pa.y});
    const pts=T.groupEdgePts(pa,pb,T.groupEdgeRouteOf(e.source,e.target),obs(),T.laneOf(e.source,e.target)).pts;
    tested++;
    // every point BEFORE the waypoint must sit at the port's height: the wire may
    // of course turn AT the waypoint (that's the user's chosen corner), but any
    // vertical before it would be the compensating jog this grid exists to kill.
    let jog=false;
    for (const [x,y] of pts){
      if (x>=wx-0.01) break;
      if (Math.abs(y-pa.y)>0.01){ jog=true; break; }
    }
    if (!jog) straight++; else {
      const lane=T.laneOf(e.source,e.target);
      const stub=T.GROUP_PORT_STUB+lane*T.LANE_PITCH;
      const start={x:pa.x+pa.sign*stub,y:pa.y}, goal={x:pb.x-pb.sign*stub,y:pb.y};
      const leg1=T.latticeRoute(start,{x:wx,y:pa.y},obs(),lane);
      const leg2=T.latticeRoute({x:wx,y:pa.y},goal,obs(),lane);
      console.log('   JOG '+T.groupEdgeRouteKey(e.source,e.target)+' lane='+lane+' leg1='+(leg1?'ok':'NULL')+' leg2='+(leg2?'ok':'NULL')+' routeStored='+JSON.stringify(T.groupEdgeRouteOf(e.source,e.target)));
      if(leg1) console.log('     leg1 pts='+JSON.stringify(leg1.map(p=>[Math.round(p[0]),Math.round(p[1])])));
    }
    delete S.groupEdgeRoutes[T.groupEdgeRouteKey(e.source,e.target)]; T._routeCache.clear();
  }
  console.log('   straight-line check: '+straight+'/'+tested+' wires run dead straight to a port-height waypoint');
  check('a waypoint at port height yields a straight run (no adjustment jog)', tested>0 && straight===tested);
}

/* ---- waypoints land on the grid (snapG is what the drag handler applies) ---- */
check('snapG lands arbitrary drags on the grid', onGrid(T.snapG(517)) && onGrid(T.snapG(-73)));

/* ---- the visual grid ---- */
{
  const doc=window.document;
  const gh=doc.getElementById('gridG').innerHTML;
  check('grid rendered at top level', gh.includes('gridPat'));
  // ONE grid: the legacy always-on background patterns are gone for good
  check('legacy background grid removed (#gridSm)', doc.querySelectorAll('#gridSm').length===0 && !doc.documentElement.outerHTML.includes('url(#gridLg)'));
  check('#bg is a plain surface, not a grid', doc.getElementById('bg').getAttribute('fill')==='var(--paper)');
  // screen space + infinite: full-viewport rect, no bounding square around the diagram
  const vp=doc.getElementById('viewport');
  check('gridG sits OUTSIDE the viewport (screen space)', vp.querySelector('#gridG')===null && !!doc.getElementById('gridG'));
  check('gridG is drawn under the diagram (before #viewport)', doc.getElementById('gridG').nextElementSibling===vp || doc.getElementById('gridG').compareDocumentPosition(vp) & 4);
  check('grid covers the whole board (no square edge at far zoom-out)', /width="100%" height="100%"/.test(gh));
  // world alignment: the pattern origin follows the view translation
  S.view.tx=137; S.view.ty=-42; T.updateGridLOD();
  const pat=doc.getElementById('gridPat');
  check('pattern origin follows the pan (patternTransform)', (pat.getAttribute('patternTransform')||'').includes('translate(137,-42)'));
  S.view.tx=0; S.view.ty=0;
  // zooming rescales the tile so the SAME world lattice stays under the lines
  S.view.k=1; T.updateGridLOD(); const c1=+pat.getAttribute('width');
  S.view.k=0.5; T.updateGridLOD(); const c2=+doc.getElementById('gridPat').getAttribute('width');
  check('tile size tracks the zoom (cell = pitch x k)', Math.abs(c1-24)<0.01 && Math.abs(c2-12)<0.01);
  S.view.k=1; T.updateGridLOD();
  T.openGroupView("CONTROL_AND_SUPERVISION");
  check('grid stays visible in the drill-down (same adaptive lattice)', doc.getElementById('gridG').innerHTML.includes('gridPat'));
  check('drill-down drags snap to the visible pitch (no 8px leftovers)', !/\/8\)\*8/.test(fs.readFileSync('app.js','utf8')));
  T.closeGroupView();
}

/* ---- adaptive single-pitch grid (Ansys-style) ---- */
{
  T.render(); T.render();
  const doc=window.document;
  const cellW=()=>{ const p=doc.querySelector('#gridPat'); return p? +p.getAttribute('width') : null; };
  const setK=k=>{ S.view.k=k; T.updateGridLOD(); };

  setK(1);
  check('exactly one pattern def at k=1', doc.querySelectorAll('pattern').length===1);
  check('exactly one grid rect drawn', doc.querySelectorAll('#gridG rect').length===1);

  // pitch subdivides as you zoom in, clamped to [GRID/4, GRID]; cell = pitch*k
  setK(0.3);  check('zoomed far out: coarsest pitch GRID (cell '+cellW()+')', Math.abs(cellW()-24*0.3)<0.01);
  setK(1.0);  check('k=1: still the coarse pitch (24)', Math.abs(cellW()-24)<0.01);
  setK(1.3);  check('zooming in: subdivides to 12', Math.abs(cellW()-12*1.3)<0.01);
  setK(2.4);  check('max zoom: finest pitch 6 (comfort floor)', Math.abs(cellW()-6*2.4)<0.01);
  check('still exactly one pattern at the finest level', doc.querySelectorAll('pattern').length===1);

  // snapping follows the visible pitch: more zoom → finer adjustments
  setK(2.4);  check('snap step at max zoom is 6', T.snapView(7)===6 && T.snapView(10)===12);
  setK(1.3);  check('snap step at mid zoom is 12', T.snapView(7)===12 && T.snapView(17)===12);
  setK(0.5);  check('snap step zoomed out is 24', T.snapView(13)===24);

  // every pitch divides GRID, so ports stay reachable dead-on at every level
  let portsDivisible=true;
  for (const e of T.computeGroupEdges()){
    const pa=T.groupPortAnchor(e.source,e.source,e.target,'out');
    const pb=T.groupPortAnchor(e.target,e.source,e.target,'in');
    if (Math.abs(pa.y % (T.GRID/4))>0.01 || Math.abs(pb.y % (T.GRID/4))>0.01) portsDivisible=false;
  }
  check('ports sit on every subdivision level (reachable at any pitch)', portsDivisible);
  setK(1);
}
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
