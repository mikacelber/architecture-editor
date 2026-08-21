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
 openGroupView,closeGroupView,nodeArea,edgeDomOf,domMarker,areaName,areasOf,isHvNet,defaultAreas,areaCustom,
 applyAreaColors,loadSession,drillSheet,portRowLabel,groupsWithUngrouped,groupBaseArea,groupOtherArea};`);
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

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
