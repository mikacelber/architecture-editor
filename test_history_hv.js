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
 openGroupView,closeGroupView,nodeArea,nodeAreas,nodeIsMixed,edgeDomOf,domMarker,areaName,areasOf,isHvNet,defaultAreas,
 areaCustom,applyAreaColors,loadSession,drillSheet,portRowLabel,groupsWithUngrouped,groupBaseArea,groupOtherArea,
 nodePortRowsFor,nodePortOf,edgeCrossesAreas,collectIssues,spotDimEdge,spotDimNode,gotoNodeIssue,
 nodeBlockWidth,nodePortRowLabel,textWidth,GROUP_PAD_X:GROUP_PAD_X,WARN_DASH:WARN_DASH,gotoEdgeIssue,domMemberArea,undo};`);
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

/* ============ 2. area port pinning on mixed groups ============ */
{
  // Areas are explicit per-block configuration now: put the fixture's HV-side
  // blocks into the HV area, exactly as a user would from each block's card.
  const hvIds = S.nodes.filter(n=>/^EXT:HV flyback transformer$/.test(n.id) ||
    T.groupsWithUngrouped().find(g=>g.id==='HV_OUTPUT_STAGE').members.includes(n.id)).map(n=>n.id);
  hvIds.forEach(id=>{ T.nodeById(id).area='hv'; });
  T.render();
  check('assigned areas read back', T.nodeArea('EXT:HV flyback transformer')==='hv' && T.nodeArea('MSPM0G3507')==='lv');
  const barrierGroups=T.visibleGroups().filter(g=>T.groupSide(g.id)==='barrier');
  check('a group mixing areas reads as a mixed (barrier) group ('+barrierGroups.map(g=>g.id).join(', ')+')',
    barrierGroups.some(g=>g.id==='ISOLATION_BARRIER'));
  check('a uniform-HV group reads as an HV group', T.groupSide('HV_OUTPUT_STAGE')==='hv');
  check('mixed groups know their halves: base LV, other HV',
    T.groupBaseArea('ISOLATION_BARRIER')==='lv' && T.groupOtherArea('ISOLATION_BARRIER')==='hv');
  let sideOk=true, mixed=false;
  for(const g of barrierGroups){
    const rows=T.groupPortRowsFor(g.id);
    if (rows.some(r=>r.xhalf) && rows.some(r=>!r.xhalf)) mixed=true;
    for(const r of rows){
      if (r.xhalf && r.side!=='right') sideOk=false;
      if (!r.xhalf && r.side!=='left') sideOk=false;
      if (!r.pinned) sideOk=false;
    }
  }
  check('a mixed group carries connections of both its areas (test is meaningful)', mixed);
  check('other-area ports sit on the right half, base-area ports on the left, all pinned', sideOk);

  // a stored override cannot cross into the other area's half
  const g=barrierGroups.find(x=>T.groupPortRowsFor(x.id).some(r=>r.xhalf));
  const hvRow=T.groupPortRowsFor(g.id).find(r=>r.xhalf);
  T.setGroupPortSide(g.id, hvRow.src, hvRow.tgt, 'left', hvRow.dom);   // simulate a forbidden drag having been stored
  T.render();
  const after=T.groupPortOf(g.id, hvRow.src, hvRow.tgt, hvRow.dir, hvRow.dom);
  check('even a stored override cannot move a port onto the wrong half', after.side==='right');
  // vertical reordering still allowed on mixed blocks \u2014 within the port's
  // own column (rows are per-side). Search every mixed group for a column
  // with 2+ ports; a 1-port column correctly has nothing to reorder.
  let reorderTarget=null;
  for (const bg of barrierGroups){
    const rs=T.groupPortRowsFor(bg.id);
    for (const side of ['left','right']){
      const col=rs.filter(r=>r.side===side);
      if (col.length>=2){ reorderTarget={ gid:bg.id, col }; break; }
    }
    if (reorderTarget) break;
  }
  if (reorderTarget){
    const mv=reorderTarget.col[reorderTarget.col.length-1];
    check('vertical reordering still works on a mixed block (within its column)',
      T.moveGroupPortToRow(reorderTarget.gid, T.groupEdgeRouteKey(mv.src, mv.tgt, mv.dom), 0)===true &&
      (T.render(), (x=>!!x && x.src===mv.src && x.tgt===mv.tgt)(
        T.groupPortRowsFor(reorderTarget.gid).find(r=>r.side===mv.side && r.row===0))));
    T.resetGroupPortLayout(reorderTarget.gid); T.render();
  } else {
    const rows1=T.groupPortRowsFor(g.id);
    const solo=rows1[rows1.length-1];
    check('a 1-port column correctly has nothing to reorder',
      T.moveGroupPortToRow(g.id, T.groupEdgeRouteKey(solo.src, solo.tgt, solo.dom), 0)===false);
  }
  // uniform-area blocks still flip freely (whatever their area)
  const lvG=T.visibleGroups().find(x=>T.groupSide(x.id)!=='barrier' && T.groupPortRowsFor(x.id).length);
  const r0=T.groupPortRowsFor(lvG.id)[0];
  const before=r0.side;
  T.setGroupPortSide(lvG.id, r0.src, r0.tgt, before==='left'?'right':'left', r0.dom); T.render();
  check('uniform-area blocks still allow side flips',
    T.groupPortOf(lvG.id, r0.src, r0.tgt, r0.dir, r0.dom).side!==before);
  T.resetGroupPortLayout(lvG.id); T.resetGroupPortLayout(g.id); T.render();

  // compactness: the two halves are parallel COLUMNS \u2014 rows numbered 0..n-1
  // independently per side, so ports of both areas share the same line
  const rowsC=T.groupPortRowsFor(g.id);
  const lC=rowsC.filter(r=>r.side==='left'), rC=rowsC.filter(r=>r.side!=='left');
  const seq=a=>a.map(r=>r.row).sort((x,y)=>x-y).every((v,i)=>v===i);
  check('mixed halves number their rows independently (parallel columns)', seq(lC)&&seq(rC));
  check('a base-area and an other-area port share the first line (compact in Y)',
    lC.some(r=>r.row===0) && rC.some(r=>r.row===0));

  // a crossing connection is labeled with BOTH area names, generically
  check('cross-area port labels carry the area names',
    rowsC.some(r=>/ · (LV → HV|HV → LV)$/.test(T.portRowLabel(r, new Map()))));

  // the halves flip swaps the sides: other-area ports move LEFT, still pinned
  const grp=S.groups.find(x=>x.id===g.id);
  grp.hvFlip=true; T.render();
  check('flipping a mixed block moves other-area ports to the left half (still pinned)',
    T.groupPortRowsFor(g.id).every(r=>r.pinned && r.side===(r.xhalf?'left':'right')));
  const W=T.groupBlockRect(g.id).w;
  check('the flipped wash paints the LEFT half',
    window.document.getElementById('nodesG').innerHTML.includes('x="0" y="0" width="'+(W/2)+'"'));
  S.sel={type:'group', id:g.id}; T.render();
  check('the mixed group inspector offers a GENERIC halves switch', !!window.document.getElementById('gFlip') &&
    !window.document.getElementById('insBody').innerHTML.includes('LV | HV'));
  S.sel=null;
  delete grp.hvFlip; T.render();
  check('unflipped default restored: other-area ports back on the right half',
    T.groupPortRowsFor(g.id).every(r=>r.side===(r.xhalf?'right':'left')));
  // both half tags show the AREA NAMES on the block itself
  check('the mixed block wears both area names as its half tags',
    (h=>/>HV</.test(h) && />LV</.test(h))([...window.document.querySelectorAll('#nodesG g[data-nid]')]
      .find(x=>x.dataset.nid===g.id).innerHTML));
  // reset for the sections below
  hvIds.forEach(id=>{ delete T.nodeById(id).area; });
  T.render();
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

/* ============ AREAS are explicit per block; net LEVELS are independent ============ */
{
  const doc=window.document;
  // Two groups: A (LV side) and B (the HV side once assigned) with a crossing
  // in between — BARRIER drives HVA over an HV-level net.
  T.loadFromContract(
    { id:'iso', title:'iso', description:'', ic_components:[
      { ic_part_number:'LVSRC', ic_type:'a', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'BARRIER', ic_type:'b', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'HVA', ic_type:'c', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'HVB', ic_type:'d', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' }] },
    { global_nets:[
      { name:'DRIVE', type:'CONTROL_SIGNAL', source:'LVSRC', consumers:['BARRIER'], description:'' },
      { name:'HV_OUT', type:'HIGH_VOLTAGE_PATH', source:'BARRIER', consumers:['HVA'], description:'' },
      { name:'HV_LOCAL_CTL', type:'CONTROL_SIGNAL', source:'HVA', consumers:['HVB'], description:'' }],
      external_blocks:[] },
    [ { id:'A', title:'A', description:'', members:['LVSRC','BARRIER'] },
      { id:'B', title:'B', description:'', members:['HVA','HVB'] } ]);
  check('with nothing assigned every block sits in the default LV area',
    ['LVSRC','BARRIER','HVA','HVB'].every(id=>T.nodeArea(id)==='lv'));
  check('…even though an HV-LEVEL net runs between them (levels are independent)',
    T.isHvNet(S.edges.find(e=>e.source==='BARRIER'&&e.target==='HVA').nets[0]));
  // the user assigns the HV side explicitly, block by block
  T.nodeById('HVA').area='hv'; T.nodeById('HVB').area='hv'; T.render();
  check('assigned blocks read back their area', T.nodeArea('HVA')==='hv' && T.nodeArea('HVB')==='hv');
  check('a crossing edge carries both areas as its dom',
    T.edgeDomOf(S.edges.find(e=>e.source==='BARRIER'&&e.target==='HVA'))==='lv>hv');
  check('a same-area edge inside the HV area carries that area',
    T.edgeDomOf(S.edges.find(e=>e.source==='HVA'&&e.target==='HVB'))==='hv');
  check('LV-side edges keep the plain dom (old sessions still match)',
    T.edgeDomOf(S.edges.find(e=>e.source==='LVSRC'&&e.target==='BARRIER'))==='');
  // the block visuals: wash + AREA NAME tag (no LV/HV level tags on blocks)
  T.openGroupView('B');
  const elA=[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid==='HVA');
  check('an HV-area block wears the area wash and its AREA NAME as the tag',
    elA.innerHTML.includes('var(--area-hv)') && />HV</.test(elA.innerHTML));
  // THE BUG: re-levelling a net that rides a FROM/TO on the HV side must not
  // orphan it — portals split by DOM (areas), never by net level.
  const inPortal=()=>T.drillSheet().portals.find(p=>p.dir==='in');
  const p0=inPortal();
  check('the crossing arrives through one FROM portal', !!p0 && p0.unders.length===1);
  check('…whose label names both areas', T.domMarker(p0.item.dom)===' · LV → HV');
  const hvNet=S.edges.find(e=>e.source==='BARRIER'&&e.target==='HVA').nets[0];
  hvNet.hv=false; T.render();
  check('lowering the net to LV keeps the wire in the same FROM portal (nothing goes gray or vanishes)',
    inPortal().unders.length===1 && T.drillSheet().specs.some(s=>s.e.source==='BARRIER'&&s.e.target==='HVA'));
  check('…and moves no block between areas', T.nodeArea('HVA')==='hv' && T.nodeArea('BARRIER')==='lv');
  check('…and the group still derives exactly one connection for the crossing',
    T.computeGroupEdges().filter(e=>e.source==='A'&&e.target==='B').length===1);
  hvNet.hv=true; T.render();
  check('raising it back is just as quiet', inPortal().unders.length===1);
  T.closeGroupView();
  // group blocks speak their members' area
  check('group B, uniform HV, reads as an HV group; A stays LV',
    T.groupSide('B')==='hv' && T.groupSide('A')==='lv');
}

/* ============ Isolation Barriers settings: create / rename / recolor / delete ============ */
{
  const doc=window.document;
  check('the project starts with the two default areas, LV and HV',
    S.areas.map(a=>a.id).join(',')==='lv,hv' && S.areas.every(a=>a.color===''));
  S.sel=null; T.render();
  const btn=doc.getElementById('btnIsoBar');
  check('an "Isolation Barriers" button sits next to Project Options', !!btn &&
    !!doc.getElementById('btnProjOpts') && btn.textContent==='Isolation Barriers');
  btn.onclick();
  check('the popup lists every area with an editable name and color',
    doc.getElementById('modalTitle').textContent==='Isolation Barriers' &&
    doc.querySelectorAll('[data-area-color]').length===2 &&
    doc.querySelectorAll('[data-area-name]').length===2);
  check('the default LV area offers no delete button; the others do',
    doc.querySelectorAll('[data-area-del]').length===1);
  // rename HV and recolor it, then add a brand-new area — one Save
  const nameInp=doc.querySelector('[data-area-name="1"]');
  nameInp.value='HIGH SIDE'; nameInp.oninput();
  const hvInput=doc.querySelector('[data-area-color="1"]');
  hvInput.value='#123456'; hvInput.oninput();
  doc.getElementById('isoAdd').onclick();
  check('adding an area appends an editable row', doc.querySelectorAll('[data-area-name]').length===3);
  const newName=doc.querySelector('[data-area-name="2"]');
  newName.value='BATTERY'; newName.oninput();
  doc.getElementById('mOk').onclick();
  check('the save lands: renamed HV, new BATTERY area, custom color on the CSS variable',
    S.areas.length===3 && S.areas[1].name==='HIGH SIDE' && S.areas[2].name==='BATTERY' &&
    S.areas[1].color==='#123456' &&
    doc.documentElement.style.getPropertyValue('--area-hv')==='#123456');
  check('areaName follows the rename everywhere', T.areaName('hv')==='HIGH SIDE');
  // a block assigned to the new area wears its name and its palette color
  T.nodeById('HVB').area=S.areas[2].id; T.render(); T.openGroupView('B');
  const el=[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid==='HVB');
  check('a block in the new area wears its NAME as the corner tag',
    />BATTERY</.test(el.innerHTML) && el.innerHTML.includes('var(--area-'+S.areas[2].id+')'));
  check('the new area got a default palette color as a CSS variable',
    !!doc.documentElement.style.getPropertyValue('--area-'+S.areas[2].id));
  check('a renamed area names the block tag too',
    (h=>/>HIGH SIDE</.test(h))([...doc.querySelectorAll('#nodesG g[data-nid]')]
      .find(x=>x.dataset.nid==='HVA').innerHTML));
  T.closeGroupView();
  // everything rides the session
  T.loadSession(JSON.parse(JSON.stringify(T.buildSessionJSON())));
  check('areas (names, colors) and block assignments come back on import',
    S.areas.length===3 && S.areas[1].name==='HIGH SIDE' && S.areas[1].color==='#123456' &&
    T.nodeArea('HVB')===S.areas[2].id &&
    doc.documentElement.style.getPropertyValue('--area-hv')==='#123456');
  // deleting an area sends its blocks back to the default area
  S.sel=null; T.render();
  doc.getElementById('btnIsoBar').onclick();
  const del=doc.querySelector('[data-area-del="2"]');
  check('the added area can be deleted', !!del);
  del.onclick();
  doc.getElementById('mOk').onclick();
  check('deleting the area reassigns its blocks to the default LV area',
    S.areas.length===2 && T.nodeArea('HVB')==='lv');
  T.undo();
  check('the deletion is one undoable step', S.areas.length===3 && T.nodeArea('HVB')===S.areas[2].id);
  T.undo();
  check('…and the create/rename/recolor save is another', S.areas.length===2 && S.areas[1].name==='HV' &&
    S.areas[1].color==='');
}

/* ============ Mixed blocks: an IC/external can straddle TWO areas ============ */
{
  const doc=window.document;
  // BARRIER is the physical crossing (think flyback transformer): give it a
  // second area through the real block card
  S.sel={type:'node', id:'BARRIER'}; T.render();
  check('a single-area block card offers a small "+" to make it mixed',
    !!doc.getElementById('fSide2Add') && !doc.getElementById('fSide2') && !doc.getElementById('fFlip'));
  doc.getElementById('fSide2Add').onclick();
  check('the "+" adds the first other area as the second one',
    T.nodeAreas('BARRIER').join(',')==='lv,hv' && T.nodeIsMixed('BARRIER'));
  const s1=doc.getElementById('fSide'), s2=doc.getElementById('fSide2');
  check('the second select never offers the primary area — nor the other way round',
    !!s2 && ![...s2.options].some(o=>o.value==='lv') && ![...s1.options].some(o=>o.value==='hv'));
  S.sel=null; T.render();
  check('a mixed member mixes its group block too', T.groupSide('A')==='barrier');
  // doms follow the halves: the secondary-side connection lives WHOLLY in HV
  check('the crossing edge now lives wholly in the HV area (transformer secondary)',
    T.edgeDomOf(S.edges.find(e=>e.source==='BARRIER'&&e.target==='HVA'))==='hv');
  check('the primary drive stays in the LV area',
    T.edgeDomOf(S.edges.find(e=>e.source==='LVSRC'&&e.target==='BARRIER'))==='');
  // ports on a mixed block move freely, like on any other block — the AREAS
  // are electrical configuration, not port geometry
  T.openGroupView('A');
  const rows=T.nodePortRowsFor('BARRIER');
  check('ports of a mixed block flip freely (never pinned)',
    rows.length===2 && rows.every(r=>!r.pinned));
  const hvRow=rows.find(r=>r.tgt==='HVA');
  T.setGroupPortSide('BARRIER', hvRow.src, hvRow.tgt, hvRow.side==='left'?'right':'left'); T.render();
  check('a side override moves a mixed block\'s port like any other',
    T.nodePortOf('BARRIER', hvRow.src, hvRow.tgt, hvRow.dir).side!==hvRow.side);
  T.resetGroupPortLayout('BARRIER'); T.render();
  const el=[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid==='BARRIER');
  check('the mixed block renders halves wearing both area names',
    />HV</.test(el.innerHTML) && />LV</.test(el.innerHTML));
  S.sel={type:'node', id:'BARRIER'}; T.render();
  const ff=doc.getElementById('fFlip');
  check('the block card offers the generic Area halves switch',
    !!ff && !doc.getElementById('insBody').innerHTML.includes('LV | HV'));
  ff.checked=true; ff.onchange();
  check('flipping swaps the halves visually (wash moves to the left half)',
    (h=>h.includes('x="0" y="0" width="'+(T.nodeById('BARRIER').w/2)+'"'))(
      [...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid==='BARRIER').innerHTML));
  const ff2=doc.getElementById('fFlip');
  ff2.checked=false; ff2.onchange();
  // the small "x" returns the block to a single area
  doc.getElementById('fSide2Del').onclick();
  check('removing the second area returns the block to a single area (crossing dom again)',
    !T.nodeIsMixed('BARRIER') &&
    T.edgeDomOf(S.edges.find(e=>e.source==='BARRIER'&&e.target==='HVA'))==='lv>hv');
  S.sel=null; T.closeGroupView();
  // a pre-#83 session with a barrier override imports as a mixed block
  const sess=JSON.parse(JSON.stringify(T.buildSessionJSON()));
  sess.nodes.find(n=>n.id==='BARRIER').hvSide='barrier';
  delete sess.nodes.find(n=>n.id==='BARRIER').area2;
  T.loadSession(sess);
  check('legacy hvSide:barrier sessions migrate to a mixed LV+HV block',
    T.nodeAreas('BARRIER').join(',')==='lv,hv');
}

/* ============ Cross-area nets are ERRORS: yellow, warning, spotlight ============ */
{
  const doc=window.document;
  T.loadFromContract(
    { id:'iso2', title:'iso2', description:'', ic_components:[
      { ic_part_number:'LVSRC', ic_type:'a', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'BARRIER', ic_type:'b', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'HVA', ic_type:'c', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'HVB', ic_type:'d', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' }] },
    { global_nets:[
      { name:'DRIVE', type:'CONTROL_SIGNAL', source:'LVSRC', consumers:['BARRIER'], description:'' },
      { name:'HV_OUT', type:'HIGH_VOLTAGE_PATH', source:'BARRIER', consumers:['HVA'], description:'' },
      { name:'HV_LOCAL_CTL', type:'CONTROL_SIGNAL', source:'HVA', consumers:['HVB'], description:'' }],
      external_blocks:[] },
    [ { id:'A', title:'A', description:'', members:['LVSRC','BARRIER'] },
      { id:'B', title:'B', description:'', members:['HVA','HVB'] } ]);
  T.nodeById('HVA').area='hv'; T.nodeById('HVB').area='hv'; T.render();
  const xe=S.edges.find(e=>e.source==='BARRIER'&&e.target==='HVA');
  check('a net from an LV block straight into an HV block is a crossing ERROR', T.edgeCrossesAreas(xe));
  check('collectIssues lists it under crossings', T.collectIssues().crossings.some(e=>e.id===xe.id));
  check('the status bar warns about nets between different isolation areas',
    doc.getElementById('statusBar').innerHTML.includes('between different isolation areas'));
  T.openGroupView('B');
  check('the crossing wire and its FROM box highlight in warning yellow',
    [...doc.querySelectorAll('#edgesG .portal')].some(p=>p.innerHTML.includes('var(--warn)')));
  check('…and carry the explanation (a mixed block is needed)',
    doc.getElementById('edgesG').innerHTML.includes('cannot connect two different isolation areas'));
  T.closeGroupView();
  const ge=T.computeGroupEdges().find(e=>(e.dom||'').includes('>'));
  check('the top-level bus derives with the crossing dom', !!ge);
  check('the top-level bus draws in warning yellow',
    (el=>!!el && el.innerHTML.includes('var(--warn)'))(doc.querySelector('#edgesG .edge[data-eid="'+ge.id+'"]')));
  check('both groups wear the warning triangle naming the cross-area problem',
    ['A','B'].every(gid=>{
      const el=[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid===gid);
      return el.innerHTML.includes('fill="var(--warn)"') && el.innerHTML.includes('isolation areas');
    }));
  S.sel={type:'edge', id:xe.id}; T.render();
  check('the connection card explains the error', doc.getElementById('insBody').innerHTML.includes('isolation areas'));
  S.sel={type:'issues'}; T.render();
  const entry=doc.querySelector('[data-iss-edge="'+xe.id+'"]');
  check('the Issues panel lists the crossing with the fix (a MIXED block first)',
    !!entry && /mixed block/i.test(entry.textContent));
  entry.onclick();
  check('clicking it spotlights the net AND both end blocks (the problem involves all three)',
    !T.spotDimEdge(xe.id) && !T.spotDimNode('BARRIER') && !T.spotDimNode('HVA') && T.spotDimNode('LVSRC'));
  // a BLOCK issue lights only the block — nets stay dim
  T.gotoNodeIssue('HVB');
  check('a block issue spotlights only the block — every net dims',
    !T.spotDimNode('HVB') && T.spotDimNode('HVA') && S.edges.every(e=>T.spotDimEdge(e.id)));
  check('boundary FROM/TO boxes recede too under a block spotlight',
    [...doc.querySelectorAll('#edgesG .portal')].every(p=>(p.getAttribute('class')||'').includes('dim')));
  S.spotlight=null; S.sel=null; T.closeGroupView(); T.render();
  // the FIX the warning prescribes: a mixed block clears the error
  T.nodeById('BARRIER').area2='hv'; T.render();
  check('making the block mixed resolves the crossing (the prescribed fix works)',
    !T.edgeCrossesAreas(xe) && T.collectIssues().crossings.length===0);
}

/* ============ Port side ON A MIXED BLOCK assigns the net's area ============ */
{
  const doc=window.document;
  // state from the previous section: BARRIER is mixed (lv+hv), HVA/HVB hv.
  // Move HVB back to LV so group B is itself mixed.
  delete T.nodeById('HVB').area; T.render();
  // 1. dragging a port across the divider re-assigns the net's area
  const de=S.edges.find(e=>e.source==='LVSRC'&&e.target==='BARRIER');
  check('an input lands on the primary (LV) half by default — same-area, legal',
    T.edgeDomOf(de)==='' && !T.edgeCrossesAreas(de));
  T.setGroupPortSide('BARRIER', de.source, de.target, 'right'); T.render();
  check('moving the port to the HV half re-assigns the net to the HV area — and errors, its far end is LV',
    T.edgeDomOf(de)==='lv>hv' && T.edgeCrossesAreas(de));
  check('…and the crossing shows up in the issues at once',
    T.collectIssues().crossings.some(e=>e.id===de.id));
  T.setGroupPortSide('BARRIER', de.source, de.target, 'left'); T.render();
  check('moving it back to the LV half clears the error', !T.edgeCrossesAreas(de));
  // 2. signals of DIFFERENT areas to the same neighbour: one TO/FROM per area,
  //    each box colored by the area its nets connect in
  S.edges.push({ id:'eaux', source:'BARRIER', target:'HVB', nets:[{name:'AUX_CTL', type:'CONTROL_SIGNAL', description:''}] });
  T.setGroupPortSide('BARRIER', 'BARRIER', 'HVB', 'left'); T.render();
  const doms=T.computeGroupEdges().filter(e=>e.source==='A'&&e.target==='B').map(e=>e.dom).sort();
  check('signals of different areas to the same neighbour derive one connection per area',
    doms.join('|')==='|hv');
  T.openGroupView('A');
  check('the drill shows one TO box per area', T.drillSheet().portals.filter(p=>p.dir==='out').length===2);
  const hvBox=[...doc.querySelectorAll('#edgesG .portal')].find(el=>el.dataset.portal==='out:B#hv');
  const lvBox=[...doc.querySelectorAll('#edgesG .portal')].find(el=>el.dataset.portal==='out:B');
  check('the HV-side TO box wears the HV area color; the LV-side one stays plain',
    !!hvBox && hvBox.innerHTML.includes('var(--area-hv)') &&
    !!lvBox && !lvBox.innerHTML.includes('var(--area-hv)') && !lvBox.innerHTML.includes('var(--warn)'));
  T.closeGroupView();
  // 3. mixed GROUP blocks pin their ports per area — and they cannot cross
  check('group B (HVA hv + HVB lv) reads as a mixed group', T.groupSide('B')==='barrier');
  const rowsB=T.groupPortRowsFor('B');
  check('group ports sit on the half of their own area, pinned',
    rowsB.length>=2 && rowsB.every(r=>r.pinned) &&
    rowsB.find(r=>r.dom==='hv').side==='right' && rowsB.find(r=>!r.dom).side==='left');
  const hvR=rowsB.find(r=>r.dom==='hv');
  T.setGroupPortSide('B', hvR.src, hvR.tgt, 'left', hvR.dom); T.render();
  check('a stored override cannot move a group port across areas',
    T.groupPortOf('B', hvR.src, hvR.tgt, hvR.dir, hvR.dom).side==='right');
  // 4. the halves flip mirrors the mixed block but keeps every net's area
  S.sel={type:'node', id:'BARRIER'}; T.render();
  const domsBefore=[T.edgeDomOf(de), T.edgeDomOf(S.edges.find(e=>e.id==='eaux'))].join('|');
  const ff=doc.getElementById('fFlip');
  ff.checked=true; ff.onchange();
  check('flipping the halves mirrors the ports but keeps every net\'s area',
    [T.edgeDomOf(S.edges.find(e=>e.source==='LVSRC'&&e.target==='BARRIER')),
     T.edgeDomOf(S.edges.find(e=>e.id==='eaux'))].join('|')===domsBefore);
  S.sel=null; T.render();
}

/* ============ mixed member block width: no port name crosses the divider ============ */
{
  // BARRIER is mixed from the section above and carries ports on both halves
  T.render();
  const n=T.nodeById('BARRIER');
  const W=T.nodeBlockWidth(n), mid=W/2, P=T.GROUP_PAD_X;
  const rows=T.nodePortRowsFor('BARRIER');
  check('the mixed block still has ports on both halves to make the test meaningful',
    rows.some(r=>r.side==='left') && rows.some(r=>r.side==='right'));
  const needs=rows.map(r=>P + 26 + 6 + T.textWidth(T.nodePortRowLabel(r), 9, true));
  check('no port row (badge + name) reaches past the area divider',
    needs.every(x=>x <= mid));
  check('the width rule bites: the block is at least twice its widest row',
    W >= 2*Math.max(...needs));
}

/* ============ a net in error SHOUTS: yellow, thick, dotted, both ends ============ */
{
  const doc=window.document;
  // build a clean crossing: LVSRC (lv) → XF (lv) with XF's port on its HV half
  T.loadFromContract(
    { id:'w', title:'w', description:'', ic_components:[
      { ic_part_number:'LVSRC', ic_type:'a', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'XF', ic_type:'b', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
      { ic_part_number:'HVLOAD', ic_type:'c', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' }] },
    { global_nets:[
      { name:'DRIVE', type:'CONTROL_SIGNAL', source:'LVSRC', consumers:['XF'], description:'' },
      { name:'SEC', type:'HIGH_VOLTAGE_PATH', source:'XF', consumers:['HVLOAD'], description:'' }],
      external_blocks:[] },
    [ { id:'G1', title:'G1', description:'', members:['LVSRC','XF'] },
      { id:'G2', title:'G2', description:'', members:['HVLOAD'] } ]);
  T.nodeById('HVLOAD').area='hv'; T.nodeById('XF').area2='hv';
  T.setGroupPortSide('XF','LVSRC','XF','right');     // the LV drive parked on the HV half → error
  T.render();
  const de=S.edges.find(e=>e.source==='LVSRC'&&e.target==='XF');
  check('the fixture has a net in error', T.edgeCrossesAreas(de));
  T.openGroupView('G1');
  const wire=doc.querySelector('#edgesG .edge[data-eid="'+de.id+'"] path[stroke="var(--warn)"]');
  check('the wire draws in the warning yellow', !!wire);
  check('…finely dotted', wire.getAttribute('stroke-dasharray')===T.WARN_DASH);
  const plain=[...doc.querySelectorAll('#edgesG path[stroke]')]
    .find(p=>/^var\(--sig-/.test(p.getAttribute('stroke')||''));
  check('…and thicker than an ordinary wire',
    parseFloat(wire.getAttribute('stroke-width')) > parseFloat(plain.getAttribute('stroke-width')));
  check('…with the warning arrowhead', wire.getAttribute('marker-end')==='url(#arrowWarn)');
  const both=['LVSRC','XF'].map(id=>[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid===id));
  check('the blocks at BOTH ends outline in the warning yellow',
    both.every(el=>el.querySelector('rect[stroke="var(--warn)"]')));
  check('a block that is NOT an end of it is never blamed for the crossing',
    (()=>{ T.closeGroupView(); T.openGroupView('G2');
      const el=[...doc.querySelectorAll('#nodesG g[data-nid]')].find(x=>x.dataset.nid==='HVLOAD');
      // (it does wear amber — its part is unpicked — but its warning never
      // mentions the isolation areas, and both real ends' warnings do)
      return !/isolation areas/.test(el.innerHTML) &&
        both.every(e2=>/isolation areas/.test(e2.innerHTML)); })());
  T.closeGroupView(); T.openGroupView('G1');
  check('the ports of the net in error go yellow too',
    [...doc.querySelectorAll('#nodesG .portnum')].some(p=>p.dataset.eid===de.id &&
      p.querySelector('rect[stroke="var(--warn)"]')));
  T.closeGroupView(); T.render();
  // and at the top level, on the bus between the two groups
  const ge=T.computeGroupEdges().find(e=>(e.dom||'').includes('>'));
  if (ge){
    const bus=doc.querySelector('#edgesG .edge[data-eid="'+ge.id+'"] path[stroke="var(--warn)"]');
    check('the top-level bus is yellow, dotted and thick too',
      !!bus && bus.getAttribute('stroke-dasharray')===T.WARN_DASH &&
      bus.getAttribute('marker-end')==='url(#arrowWarn)');
  } else check('the top-level bus is yellow, dotted and thick too (no cross-group bus here)', true);
  // the Issues list stays open while you walk it
  S.sel={type:'issues'}; T.render();
  T.gotoEdgeIssue(de.id);
  check('walking the Issues list never swaps the panel away',
    S.sel.type==='issues' && doc.querySelectorAll('#insBody .issue').length>0);
  check('…and marks the entry you are looking at',
    (x=>!!x && x.classList.contains('on'))(doc.querySelector('#insBody [data-iss-edge="'+de.id+'"]')));
  S.spotlight=null; S.sel=null; T.render();
}

/* ============ one net, one level: the LV/HV flip lands on every copy ============ */
{
  const doc=window.document;
  // one net feeding two consumers -> two edges, two copies of the same net
  T.loadFromContract(
    { id:'lvl', title:'lvl', description:'', ic_components:['A','B','C'].map(p=>(
      { ic_part_number:p, ic_type:'t', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' })) },
    { global_nets:[ { name:'RAIL', type:'POWER_DISTRIBUTION', source:'A', consumers:['B','C'], description:'' } ],
      external_blocks:[] }, []);
  const copies=()=>S.edges.filter(e=>e.nets.some(n=>n.name==='RAIL')).map(e=>e.nets.find(n=>n.name==='RAIL'));
  check('the net rides two connections', copies().length===2);
  S.sel={type:'edge', id:S.edges.find(e=>e.nets.some(n=>n.name==='RAIL')).id}; T.render();
  doc.querySelector('#insBody [data-domnet]').onclick();
  check('flipping the LV/HV badge on ONE card raises the level of EVERY copy',
    copies().every(n=>T.isHvNet(n)));
  S.sel={type:'edge', id:S.edges.filter(e=>e.nets.some(n=>n.name==='RAIL'))[1].id}; T.render();
  doc.querySelector('#insBody [data-domnet]').onclick();
  check('…and flipping it back from the OTHER connection lowers every copy',
    copies().every(n=>!T.isHvNet(n)));
  T.undo();
  check('each flip is one undoable step', copies().every(n=>T.isHvNet(n)));
  S.sel=null; T.render();
}

/* ============ demo-flow regression: group ports mirror their FROM/TOs' areas ============ */
{
  // the user's exact flow on the shipped demo: make the flyback transformer
  // mixed and park its secondary on the HV half
  const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
  T.loadFromContract(fx.input,fx.contract,fx.groups);
  const xf=T.nodeById('EXT:HV flyback transformer');
  xf.area2='hv';
  const sec=S.edges.find(e=>e.source===xf.id && /multiplier/i.test(e.target));
  T.setGroupPortSide(xf.id, sec.source, sec.target, 'right'); T.render();
  const gid='ISOLATION_BARRIER';
  check('the transformer mixes its group', T.groupSide(gid)==='barrier');
  const rows=T.groupPortRowsFor(gid);
  check('EVERY port of the group is pinned to the half of its own dom — none floats',
    rows.length>0 && rows.every(r=>r.pinned &&
      r.side===((T.domMemberArea(r.dom,r.dir)!==T.groupBaseArea(gid))?'right':'left')));
  const hvRow=rows.find(r=>(r.dom||'').includes('>')||T.domMemberArea(r.dom,r.dir)==='hv');
  check('the HV-side connection sits on the HV half', !!hvRow && hvRow.side==='right');
  T.setGroupPortSide(gid, hvRow.src, hvRow.tgt, 'left', hvRow.dom); T.render();
  check('a stored override cannot move a group port to the other area',
    T.groupPortOf(gid, hvRow.src, hvRow.tgt, hvRow.dir, hvRow.dom).side==='right');
  // the drill FROM/TO boxes and the group rows tell the same story, one to one
  T.openGroupView(gid);
  const pk=T.drillSheet().portals.map(p=>p.key).sort();
  T.closeGroupView(); T.render();
  const rk=rows.map(r=>(r.dir==='in'?'in:':'out:')+r.other+(r.dom?'#'+r.dom:'')).sort();
  check('group ports and drill FROM/TO boxes correspond one to one',
    JSON.stringify(pk)===JSON.stringify(rk));
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
