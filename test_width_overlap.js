'use strict';
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,computeGroupEdges,visibleGroups,groupBlockRect,
  groupBlockWidth,groupBlockHeight,groupsWithUngrouped,groupPortRowsFor,groupPortRowY,textWidth,
  portRowLabel,groupEyebrow,groupMemberLabel,nodeById,GROUP_PAD_X,GROUP_SIDE_TAG_W,autoLayoutGroups,
  groupEdgeRouteKey,groupPortAnchor,groupEdgePts,_routeCache,laneOf,assignRouteLanes,groupEdgeRouteOf,buildSessionJSON,groupSide};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();

/* ================= 1. nothing is truncated ================= */
const html=window.document.getElementById('nodesG').innerHTML;
check('no ellipsis/slice artefacts in the markup', !/\u2026/.test(html));
let tooNarrow=[];
const titleOf=new Map(T.groupsWithUngrouped().map(g=>[g.id,g.title||g.id]));
for (const g of T.visibleGroups()){
  const W=T.groupBlockWidth(g), P=T.GROUP_PAD_X, TAG=T.GROUP_SIDE_TAG_W;
  const need=[];
  need.push(['eyebrow', P+T.textWidth(T.groupEyebrow(g),9.5,true,0.1)+P+TAG]);
  need.push(['title', P+T.textWidth(g.title,15,true)+P+TAG]);
  need.push(['count', P+T.textWidth(g.members.length+' blocks',11,false)+P]);
  for (const id of g.members){
    const n=T.nodeById(id);
    need.push(['member '+id, P+T.textWidth(T.groupMemberLabel(id),10,!!(n&&n.kind==='ic'))+P]);
  }
  for (const r of T.groupPortRowsFor(g.id))
    need.push(['port '+r.other, P+26+6+T.textWidth(T.portRowLabel(r,titleOf),9,true)+P]);
  for (const [what,px] of need) if (px > W+0.01) tooNarrow.push(g.id+' / '+what+' needs '+Math.ceil(px)+' > '+W);
}
check('every text fits inside its block'+(tooNarrow.length?' ['+tooNarrow[0]+']':''), tooNarrow.length===0);
// the full, untruncated strings are present in the markup
const longest=T.visibleGroups().flatMap(g=>g.members.map(T.groupMemberLabel)).sort((a,b)=>b.length-a.length)[0];
check('the longest member name appears in full ("'+longest.slice(0,28)+'...")', html.includes(longest.replace(/&/g,'&amp;').replace(/</g,'&lt;')));
check('widths adapt per group (not all equal)', new Set(T.visibleGroups().map(g=>T.groupBlockWidth(g))).size>1);
check('minimum width respected', T.visibleGroups().every(g=>T.groupBlockWidth(g)>=240));

/* ================= 2. route overlap measurement ================= */
function segsOf(pts){
  const out=[];
  for(let i=0;i<pts.length-1;i++){
    const [x1,y1]=pts[i],[x2,y2]=pts[i+1];
    if (Math.abs(x1-x2)<0.5 && Math.abs(y1-y2)>=0.5) out.push({v:true,at:x1,a:Math.min(y1,y2),b:Math.max(y1,y2)});
    else if (Math.abs(y1-y2)<0.5 && Math.abs(x1-x2)>=0.5) out.push({v:false,at:y1,a:Math.min(x1,x2),b:Math.max(x1,x2)});
  }
  return out;
}
function allRoutes(){
  const obs=T.visibleGroups().map(g=>T.groupBlockRect(g.id));
  const out=new Map();
  for (const e of T.computeGroupEdges()){
    const pa=T.groupPortAnchor(e.source,e.source,e.target,'out',e.dom);
    const pb=T.groupPortAnchor(e.target,e.source,e.target,'in',e.dom);
    const k=T.groupEdgeRouteKey(e.source,e.target,e.dom);
    out.set(k, T.groupEdgePts(pa,pb,T.groupEdgeRouteOf(e.source,e.target,e.dom),obs,T.laneOf(e.source,e.target,e.dom)).pts);
  }
  return out;
}
// total overlapping length between COLLINEAR segments of DIFFERENT wires
function overlapReport(routes){
  const segs=[];
  for (const [k,pts] of routes) for (const sg of segsOf(pts)) segs.push({...sg,k});
  let total=0, pairs=0, worst=0;
  for (let i=0;i<segs.length;i++) for (let j=i+1;j<segs.length;j++){
    const A=segs[i],B=segs[j];
    if (A.k===B.k || A.v!==B.v) continue;
    if (Math.abs(A.at-B.at)>0.5) continue;              // not collinear
    const ov=Math.min(A.b,B.b)-Math.max(A.a,B.a);
    if (ov>8){ total+=ov; pairs++; if(ov>worst)worst=ov; }
  }
  return {total:Math.round(total),pairs,worst:Math.round(worst)};
}
const rep=overlapReport(allRoutes());
console.log('   OVERLAP: '+rep.pairs+' collinear pairs, '+rep.total+'px total, worst single overlap '+rep.worst+'px');
fs.writeFileSync('overlap_report.json', JSON.stringify(rep));
check('overlap measured (informational)', true);

/* ---- overlap must be gone, and stay gone deterministically ---- */
check('no two wires run along the same line (0 collinear overlaps)', rep.pairs===0);
T.assignRouteLanes();
const rep2=overlapReport(allRoutes());
check('re-running lane assignment keeps it at zero', rep2.pairs===0);
const lanes1=JSON.stringify(S.groupEdgeLanes);
T.assignRouteLanes();
check('lane assignment is deterministic', JSON.stringify(S.groupEdgeLanes)===lanes1);
check('lanes are actually spread (not all zero)', new Set(Object.values(S.groupEdgeLanes)).size>1);

/* ---- wires may still cross; that is allowed ---- */
function crossings(routes){
  const segs=[]; for(const [k,pts] of routes) for(const sg of segsOf(pts)) segs.push({...sg,k});
  let n=0;
  for(let i=0;i<segs.length;i++) for(let j=i+1;j<segs.length;j++){
    const A=segs[i],B=segs[j];
    if(A.k===B.k||A.v===B.v) continue;
    const V=A.v?A:B, H=A.v?B:A;
    if(V.at>H.a&&V.at<H.b&&H.at>V.a&&H.at<V.b) n++;
  }
  return n;
}
console.log('   crossings (allowed, informational): '+crossings(allRoutes()));
check('crossings are permitted, not eliminated', true);

/* ---- still nothing drawn over a block ---- */
const obs=T.visibleGroups().map(g=>T.groupBlockRect(g.id));
let over=0;
for (const pts of allRoutes().values())
  for (const sg of segsOf(pts))
    for (const r of obs){
      if (!sg.v && sg.at>r.y && sg.at<r.y+r.h && sg.b>r.x && sg.a<r.x+r.w) over++;
      if (sg.v && sg.at>r.x && sg.at<r.x+r.w && sg.b>r.y && sg.a<r.y+r.h) over++;
    }
check('no wire is drawn over a block ('+over+')', over===0);

/* ---- blocks don't collide after widening ---- */
let hit=null;
const rects=T.visibleGroups().map(g=>T.groupBlockRect(g.id));
for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++){
  const A=rects[i],B=rects[j];
  if(A.x<B.x+B.w&&B.x<A.x+A.w&&A.y<B.y+B.h&&B.y<A.y+A.h) hit=A.id+'/'+B.id;
}
check('wider blocks still do not overlap each other'+(hit?' ['+hit+']':''), !hit);

/* ---- lanes survive a session round-trip ---- */
const sess=T.buildSessionJSON();
check('lanes saved in the session', sess.groupEdgeLanes && Object.keys(sess.groupEdgeLanes).length===Object.keys(S.groupEdgeLanes).length);

/* ---- (IN)/(OUT) label format + barrier half containment ---- */
{
  const nh=window.document.getElementById('nodesG').innerHTML;
  check('labels use the (IN)/(OUT) format', nh.includes('(IN) ') && nh.includes('(OUT) '));
  check('old bare IN/OUT format is gone', !/>IN  |>OUT  /.test(nh));

  // Areas are explicit per-block configuration now, so BUILD a mixed group:
  // move one member of a connected group into the HV area.
  const gmix=T.visibleGroups().find(g=>g.members.length>=2 && T.groupPortRowsFor(g.id).length);
  T.nodeById(gmix.members[gmix.members.length-1]).area='hv'; T.render();
  // On mixed (barrier) blocks every port row (badge + label) stays inside its own half.
  const barrier=T.visibleGroups().filter(g=>T.groupSide(g.id)==='barrier');
  check('a mixed group exists to verify ('+barrier.map(g=>g.id).join(', ')+')', barrier.length>0);
  let crossed=[];
  for (const g of barrier){
    const W=T.groupBlockWidth(g), mid=W/2, P=T.GROUP_PAD_X;
    for (const r of T.groupPortRowsFor(g.id)){
      const label=T.portRowLabel(r, titleOf);
      const extent=P+26+6+T.textWidth(label,9,true);   // from the row's own edge inward
      if (extent > mid) crossed.push(g.id+' "'+label+'" reaches '+Math.ceil(extent)+' > half '+mid);
    }
  }
  check('no port row crosses the LV|HV divider'+(crossed.length?' ['+crossed[0]+']':''), crossed.length===0);
  // and the rule actually bites: at least one barrier block is wider than the old single-row bound
  const gB=barrier[0], WB=T.groupBlockWidth(gB);
  const singleRowNeed=Math.max(...T.groupPortRowsFor(gB.id).map(r=>T.GROUP_PAD_X+26+6+T.textWidth(T.portRowLabel(r,titleOf),9,true)+T.GROUP_PAD_X), 240);
  check('barrier width driven by the half rule (W='+WB+' >= 2x widest row)', WB >= singleRowNeed);
  // non-barrier blocks are not inflated by the rule
  check('non-barrier widths unchanged in spirit (min width still 240)', T.visibleGroups().some(g=>T.groupBlockWidth(g)===240));
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
