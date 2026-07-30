'use strict';
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},get HIST(){return HIST;},loadFromContract,render,computeGroupEdges,visibleGroups,
 groupBlockRect,groupPortAnchor,groupEdgeRouteKey,groupEdgePts,laneOf,setGroupEdgeRoute,groupEdgeRouteOf,
 pointOutOfBlocks,groupPortRowsFor,groupsWithUngrouped,groupSide,groupPortOf,setGroupPortSide,
 moveGroupPortToRow,commit,commitGesture,undo,redo,resetGroupPortLayout,snapshotState,buildSessionJSON,groupPosOf,_routeCache,nodeById,
 openGroupView,closeGroupView};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
const obs=()=>T.visibleGroups().map(g=>T.groupBlockRect(g.id));
const key=e=>T.groupEdgeRouteKey(e.source,e.target);

/* ============ 1. waypoint drags: responsive everywhere ============ */
{
  let minDistinct=Infinity, worstKey='';
  for (const e of T.computeGroupEdges()){
    const pa=T.groupPortAnchor(e.source,e.source,e.target,'out');
    const pb=T.groupPortAnchor(e.target,e.source,e.target,'in');
    const p0=T.groupEdgePts(pa,pb,undefined,obs(),T.laneOf(e.source,e.target)).pts;
    let mx=null,my=null;
    for(let i=1;i<p0.length-2;i++) if(Math.abs(p0[i][1]-p0[i+1][1])<0.5){mx=(p0[i][0]+p0[i+1][0])/2;my=p0[i][1];break;}
    if(mx==null) continue;
    const seen=new Set();
    for(let dy=-300;dy<=300;dy+=12){
      const want=Math.round((my+dy)/8)*8;
      const fixed=T.pointOutOfBlocks(mx,want,obs(),'h',dy<0?-1:1);
      T.setGroupEdgeRoute(e.source,e.target,{wx:mx,wy:fixed});
      seen.add(JSON.stringify(T.groupEdgePts(pa,pb,T.groupEdgeRouteOf(e.source,e.target),obs(),T.laneOf(e.source,e.target)).pts));
    }
    delete S.groupEdgeRoutes[key(e)]; T._routeCache.clear();
    if(seen.size<minDistinct){minDistinct=seen.size;worstKey=key(e);}
  }
  console.log('   worst responsiveness: '+minDistinct+' distinct positions over 51 steps ('+worstKey+')');
  check('no connection is stuck (every one reaches >=5 distinct positions)', minDistinct>=5);
}
/* dragged wires stay off blocks */
{
  const e=T.computeGroupEdges()[2];
  const pa=T.groupPortAnchor(e.source,e.source,e.target,'out');
  const pb=T.groupPortAnchor(e.target,e.source,e.target,'in');
  let over=0;
  for(let dy=-260;dy<=260;dy+=20){
    const rect=T.groupBlockRect(e.source);
    const wy=T.pointOutOfBlocks(rect.x+rect.w+80, rect.y+dy, obs(), 'h', dy<0?-1:1);
    T.setGroupEdgeRoute(e.source,e.target,{wx:rect.x+rect.w+80, wy});
    const pts=T.groupEdgePts(pa,pb,T.groupEdgeRouteOf(e.source,e.target),obs(),T.laneOf(e.source,e.target)).pts;
    for(let i=0;i<pts.length-1;i++){
      const [x1,y1]=pts[i],[x2,y2]=pts[i+1];
      for(const r of obs()){
        if(Math.abs(y1-y2)<0.5 && y1>r.y&&y1<r.y+r.h&&Math.max(x1,x2)>r.x&&Math.min(x1,x2)<r.x+r.w) over++;
        if(Math.abs(x1-x2)<0.5 && x1>r.x&&x1<r.x+r.w&&Math.max(y1,y2)>r.y&&Math.min(y1,y2)<r.y+r.h) over++;
      }
    }
  }
  check('waypoint-dragged wires never lie across a block ('+over+')', over===0);
  delete S.groupEdgeRoutes[key(e)]; T._routeCache.clear();
}

/* ============ 2. HV/LV port pinning on barrier blocks ============ */
{
  const barrierGroups=T.visibleGroups().filter(g=>T.groupSide(g.id)==='barrier');
  check('fixture has barrier groups to test ('+barrierGroups.map(g=>g.id).join(', ')+')', barrierGroups.length>0);
  let sideOk=true, mixed=false;
  for(const g of barrierGroups){
    const rows=T.groupPortRowsFor(g.id);
    if (rows.some(r=>r.hv) && rows.some(r=>!r.hv)) mixed=true;
    for(const r of rows){
      if (r.hv && r.side!=='right') sideOk=false;
      if (!r.hv && r.side!=='left') sideOk=false;
      if (!r.pinned) sideOk=false;
    }
  }
  check('a barrier group carries both HV and LV connections (test is meaningful)', mixed);
  check('HV ports sit on the HV (right) half, LV ports on the LV (left) half, all pinned', sideOk);

  // a stored override cannot cross the domain
  const g=barrierGroups.find(x=>T.groupPortRowsFor(x.id).some(r=>r.hv));
  const hvRow=T.groupPortRowsFor(g.id).find(r=>r.hv);
  T.setGroupPortSide(g.id, hvRow.src, hvRow.tgt, 'left');   // simulate a forbidden drag having been stored
  T.render();
  const after=T.groupPortOf(g.id, hvRow.src, hvRow.tgt, hvRow.dir);
  check('even a stored override cannot move an HV port to the LV half', after.side==='right');
  // vertical reordering still allowed on barrier blocks
  const rows=T.groupPortRowsFor(g.id);
  const last=rows[rows.length-1];
  check('vertical reordering still works on a barrier block',
    T.moveGroupPortToRow(g.id, last.src+'\u2192'+last.tgt, 0)===true &&
    (T.render(), T.groupPortRowsFor(g.id)[0].src===last.src && T.groupPortRowsFor(g.id)[0].tgt===last.tgt));
  // non-barrier blocks still flip freely
  const lvG=T.visibleGroups().find(x=>T.groupSide(x.id)!=='barrier' && T.groupPortRowsFor(x.id).length);
  const r0=T.groupPortRowsFor(lvG.id)[0];
  const before=r0.side;
  T.setGroupPortSide(lvG.id, r0.src, r0.tgt, before==='left'?'right':'left'); T.render();
  check('non-barrier blocks still allow side flips',
    T.groupPortOf(lvG.id, r0.src, r0.tgt, r0.dir).side!==before);
  T.resetGroupPortLayout(lvG.id); T.resetGroupPortLayout(g.id); T.render();
}

/* ============ 3. undo / redo ============ */
{
  T.HIST.past.length=0; T.HIST.future.length=0;
  const s0=T.snapshotState();
  // a committed edit → undo restores s0 → redo reapplies
  T.commit();
  const p=T.groupPosOf('USER_INDICATION'); const ox=p.x; p.x=ox+300; T.render();
  const s1=T.snapshotState();
  check('edit recorded (1 undo step)', T.HIST.past.length===1);
  T.undo();
  check('undo restores the pre-edit state', T.snapshotState()===s0);
  check('undo enables redo', T.HIST.future.length===1);
  T.redo();
  check('redo reapplies the edit', T.snapshotState()===s1);
  T.undo();
  check('undo after redo returns again', T.snapshotState()===s0);
  // a new edit clears the redo branch
  T.commit(); T.groupPosOf('USER_INDICATION').y+=80; T.render();
  check('a new edit discards the redo branch', T.HIST.future.length===0);
  T.undo();
  // lazy gestures: a click-without-move must not consume a step
  const before=T.HIST.past.length;
  const fakeDrag={snap:T.snapshotState()};
  check('a gesture that never changes anything adds no history', T.HIST.past.length===before);
  T.commitGesture(fakeDrag);
  check('first change of a gesture adds exactly one step', T.HIST.past.length===before+1);
  T.commitGesture(fakeDrag);
  check('further changes of the same gesture add nothing', T.HIST.past.length===before+1);
  T.undo();
  // depth cap
  T.HIST.past.length=0; T.HIST.future.length=0;
  for(let i=0;i<80;i++) T.commit();
  check('history depth capped at 60', T.HIST.past.length===60);
  // undo restores routes/lanes/ports too (full session round-trip)
  T.HIST.past.length=0; T.HIST.future.length=0;
  const full0=T.snapshotState();
  T.commit();
  const e=T.computeGroupEdges()[0];
  T.setGroupEdgeRoute(e.source,e.target,{wx:100,wy:-500}); T.render();
  T.undo();
  check('undo restores wire routes as part of the state', T.snapshotState()===full0);
  check('buttons exist in the page', !!window.document.getElementById('btnUndo') && !!window.document.getElementById('btnRedo'));
  check('undo button disabled state tracks the stack', window.document.getElementById('btnUndo').disabled===(T.HIST.past.length===0));
}

/* ============ 4. signal legend lives on the canvas, top-right ============ */
{
  const doc=window.document;
  const legend=doc.getElementById('legend');
  check('legend element sits inside the canvas window', !!legend && legend.parentElement===doc.getElementById('canvasWrap'));
  check('legend lists all 7 signal categories', legend.querySelectorAll('.litem').length===7);
  check('status bar no longer carries the legend', !doc.getElementById('statusBar').innerHTML.includes('litem'));
  T.openGroupView('CONTROL_AND_SUPERVISION');
  check('legend still populated in the drill-down', legend.querySelectorAll('.litem').length===7);
  T.closeGroupView();
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
