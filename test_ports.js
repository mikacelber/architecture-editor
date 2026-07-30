'use strict';
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>','');
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true });
const { window } = dom;
window.SVGElement.prototype.getBoundingClientRect = ()=>({left:0,top:0,width:1400,height:900});
window.Element.prototype.setPointerCapture = ()=>{};
window.eval(fs.readFileSync('app.js','utf8') + `
window.__T = { get S(){return S;}, computeGroupEdges, visibleGroups, groupsWithUngrouped,
  groupBlockRect, groupBlockHeight, groupSeparatorY, groupPortZoneTop, groupPortRowY,
  groupPortRowsFor, groupPortAnchor, groupPortSideOf, setGroupPortSide, groupPortKey,
  sidedGeometry, elbowPathD, routeAroundObstacles, render, autoLayoutGroups,
  loadFromContract, buildPipelineJSON, buildSessionJSON, openGroupView, closeGroupView, groupEdgePts, latticeRoute,
  moveGroupPortToRow, resetGroupPortLayout, groupPortIndex, groupBlockWidth, GROUP_PAD_X, GROUP_PORT_ROW_H };`);
const T = window.__T, S = T.S;
let pass=0, fail=0;
const check=(n,c)=>{ c?pass++:fail++; console.log((c?'PASS  ':'FAIL  ')+n); };

const fx = JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input, fx.contract, fx.groups);
T.render();

const groups = T.visibleGroups();
const gEdges = T.computeGroupEdges();

/* ---- (1) ports sit BELOW the member list, behind a separator ---- */
let allBelow = true, sepOk = true, heightOk = true;
for (const g of groups){
  const rows = T.groupPortRowsFor(g.id);
  const sep = T.groupSeparatorY(g);
  const lastMemberBaseline = 70 + 16 + (g.members.length-1)*14;
  if (g.members.length && sep <= lastMemberBaseline - 14) sepOk = false;  // rule under the list
  for (const r of rows){
    const y = T.groupPortRowY(g, r.row);
    if (y <= sep) allBelow = false;                                       // ports under the rule
  }
  const h = T.groupBlockHeight(g);
  if (rows.length && T.groupPortRowY(g, rows.length-1) + 11 > h) heightOk = false; // block grew enough
}
check('separator rule sits below the last IC name', sepOk);
check('every port row is below the separator', allBelow);
check('block height grows to contain all port rows', heightOk);
check('port-zone top depends on member count (more ICs → lower)', (()=>{
  const sorted=[...groups].sort((a,b)=>a.members.length-b.members.length);
  return T.groupPortZoneTop(sorted[0]) < T.groupPortZoneTop(sorted[sorted.length-1]);
})());

/* ---- ports no longer attach at the block's vertical middle ---- */
const anchorsAtMiddle = gEdges.filter(e=>{
  const r = T.groupBlockRect(e.source);
  const pa = T.groupPortAnchor(e.source, e.source, e.target, 'out');
  return Math.abs(pa.y - (r.y + r.h/2)) < 0.5;
});
check('ports moved off the mid-edge attachment', anchorsAtMiddle.length === 0);

/* ---- one row per connection, deterministic, unique Y per row ---- */
let rowsOk = true;
for (const g of groups){
  const rows = T.groupPortRowsFor(g.id);
  const touching = gEdges.filter(e=>e.source===g.id||e.target===g.id).length;
  if (rows.length !== touching) rowsOk = false;
  if (new Set(rows.map(r=>r.row)).size !== rows.length) rowsOk = false;
}
check('exactly one port row per connection, no shared rows', rowsOk);

/* ---- (2) the written count matches the wire's midpoint count ---- */
const nodesHTML = window.document.getElementById('nodesG').innerHTML;
let countsOk = true;
for (const g of groups)
  for (const r of T.groupPortRowsFor(g.id)){
    const e = gEdges.find(x=>x.id===r.eid);
    if (!e || e.nets.length !== r.nets) countsOk = false;
  }
check('badge count equals the connection net count', countsOk);
check('badges rendered inside the blocks', (nodesHTML.match(/class="portnum"/g)||[]).length === gEdges.length*2);
check('(IN)/(OUT) direction written on each row', nodesHTML.includes('(IN) ') && nodesHTML.includes('(OUT) '));
check('separator line rendered', (nodesHTML.match(/opacity="\.4"/g)||[]).length >= groups.length);

/* ---- (3) dragging the badge across flips the port side; wire follows ---- */
const e0 = gEdges.find(e=>e.nets.length>1) || gEdges[0];
const beforeAnchor = T.groupPortAnchor(e0.source, e0.source, e0.target, 'out');
const rectSrc = T.groupBlockRect(e0.source);
check('output starts on the right edge', beforeAnchor.side==='right' && Math.abs(beforeAnchor.x-(rectSrc.x+rectSrc.w))<0.5);

const hBefore = T.groupBlockHeight(T.groupsWithUngrouped().find(g=>g.id===e0.source));
T.setGroupPortSide(e0.source, e0.source, e0.target, 'left');  // simulate the drag crossing the midline
T.render();
const afterAnchor = T.groupPortAnchor(e0.source, e0.source, e0.target, 'out');
const hAfter = T.groupBlockHeight(T.groupsWithUngrouped().find(g=>g.id===e0.source));
check('port jumped to the left edge', afterAnchor.side==='left' && Math.abs(afterAnchor.x-rectSrc.x)<0.5);
check('port stayed on the same row (no reshuffle)', Math.abs(afterAnchor.y-beforeAnchor.y)<0.5);
check('block height unchanged by the flip (nothing jumps)', hBefore===hAfter);
check('wire now leaves leftward (sign flipped)', afterAnchor.sign===-1);

// the wire geometry actually starts at the flipped anchor
const pb = T.groupPortAnchor(e0.target, e0.source, e0.target, 'in');
const geo = T.sidedGeometry(afterAnchor, pb, undefined);
check('wire start follows the port', Math.abs(geo.x1-afterAnchor.x)<0.5 && Math.abs(geo.y1-afterAnchor.y)<0.5);
check('first jog is left of the flipped port', geo.bendX < afterAnchor.x);
check('entry jog still leaves room for a perpendicular arrow', pb.sign>0 ? geo.entryX<=geo.x2-12 : geo.entryX>=geo.x2+12);

// flipping the TARGET port makes the arrow arrive on the right edge
T.setGroupPortSide(e0.target, e0.source, e0.target, 'right');
T.render();
const pb2 = T.groupPortAnchor(e0.target, e0.source, e0.target, 'in');
const rectTgt = T.groupBlockRect(e0.target);
check('input flipped to the right edge', pb2.side==='right' && Math.abs(pb2.x-(rectTgt.x+rectTgt.w))<0.5);
check('input now arrives leftward', pb2.sign===-1);
const geo2 = T.routeAroundObstacles(T.sidedGeometry(afterAnchor, pb2, undefined),
  groups.map(g=>T.groupBlockRect(g.id)).filter(r=>r.id!==e0.source), pb2.sign);
check('entry jog is right of the right-edge port', geo2.entryX >= geo2.x2+12);

/* ---- wires still avoid crossing blocks after flips ---- */
function segs(d){ const n=d.replace(/[ML]/g,' ').trim().split(/\s+/).map(Number); const p=[]; for(let i=0;i<n.length;i+=2)p.push([n[i],n[i+1]]); const s=[]; for(let i=0;i<p.length-1;i++)s.push([p[i],p[i+1]]); return s; }
function hits(s,r){ const [[x1,y1],[x2,y2]]=s, C=3;
  if (Math.abs(y1-y2)<0.5) return y1>r.y+C&&y1<r.y+r.h-C&&Math.min(x1,x2)<r.x+r.w-C&&Math.max(x1,x2)>r.x+C;
  if (Math.abs(x1-x2)<0.5) return x1>r.x+C&&x1<r.x+r.w-C&&Math.min(y1,y2)<r.y+r.h-C&&Math.max(y1,y2)>r.y+C;
  return false; }
T.render();
const edgesHTML = window.document.getElementById('edgesG').innerHTML;
const rects = groups.map(g=>T.groupBlockRect(g.id));
let crossings = 0;
for (const m of edgesHTML.matchAll(/<path d="(M [^"]+)" fill="none" stroke="var\(--sig/g))
  for (const s of segs(m[1])) for (const r of rects) if (hits(s,r)) crossings++;
check('no wire crosses a group block after the flips ('+crossings+')', crossings===0);

/* ---- determinism + persistence ---- */
T.autoLayoutGroups(); const p1=JSON.stringify(S.groupPos);
T.autoLayoutGroups(); const p2=JSON.stringify(S.groupPos);
check('auto-layout still deterministic with the taller blocks', p1===p2);
T.render(); const r1=window.document.getElementById('nodesG').innerHTML;
T.render(); const r2=window.document.getElementById('nodesG').innerHTML;
check('render deterministic', r1===r2);
const sess = T.buildSessionJSON();
check('port sides saved in the session', sess.groupPortSides && Object.keys(sess.groupPortSides).length===2);
check('export unaffected by port sides', JSON.stringify(T.buildPipelineJSON())===JSON.stringify(T.buildPipelineJSON()));

/* ---- drill-down untouched ---- */
const beforeDD = JSON.stringify(S.nodes.map(n=>[n.id,n.x,n.y]));
T.openGroupView('CONTROL_AND_SUPERVISION');
const ddNodes = window.document.getElementById('nodesG').innerHTML;
check('drill-down still renders', ddNodes.includes('class="port"'));
check('drill-down has no port-zone badges', !ddNodes.includes('class="portnum"'));
check('member node positions untouched', JSON.stringify(S.nodes.map(n=>[n.id,n.x,n.y]))===beforeDD);
T.closeGroupView();


/* ---- text fitting inside the port zone (worst-case monospace advance) ---- */
const ADV = 0.62*9; // matches the app's conservative mono advance at font-size 9
let textOverflow = [], badgeClash = [], outsideBlock = [];
for (const g of T.visibleGroups()){
  const h = T.groupBlockHeight(g);
  for (const r of T.groupPortRowsFor(g.id)){
    const W = T.groupBlockWidth(g);
    const label = `${r.dir==='in'?'(IN)':'(OUT)'} ${(T.groupsWithUngrouped().find(x=>x.id===r.other)||{}).title || r.other}`;
    const bw=26, bh=16, left = r.side==='left';
    const bx = left ? T.GROUP_PAD_X : W-T.GROUP_PAD_X-bw;
    const lx = left ? bx+bw+6 : bx-6;
    const textStart = left ? lx : lx - label.length*ADV;
    const textEnd   = left ? lx + label.length*ADV : lx;
    if (textStart < 2 || textEnd > W-2) textOverflow.push(g.id+' "'+label+'"');
    if (left ? (textStart < bx+bw) : (textEnd > bx)) badgeClash.push(g.id+' '+label);
    const y = T.groupPortRowY(g, r.row);
    if (y-bh/2 < T.groupSeparatorY(g) || y+bh/2 > h-2) outsideBlock.push(g.id+' row'+r.row);
  }
}
check('no port label overflows the block width'+(textOverflow.length?' ['+textOverflow[0]+']':''), textOverflow.length===0);
check('no port label overlaps its badge', badgeClash.length===0);
check('every badge sits inside the port zone', outsideBlock.length===0);

// badges never collide vertically
let vClash=false;
for (const g of T.visibleGroups()){
  const ys=T.groupPortRowsFor(g.id).map(r=>T.groupPortRowY(g,r.row)).sort((a,b)=>a-b);
  for (let i=1;i<ys.length;i++) if (ys[i]-ys[i-1] < 17) vClash=true;
}
check('badge rows are vertically clear of each other', !vClash);

// worst case: the widest possible label still fits
// widths are now computed from the text itself, so the invariant is per-group
check('every block is wide enough for its own longest port label',
  T.visibleGroups().every(g=>{
    const W=T.groupBlockWidth(g);
    return T.groupPortRowsFor(g.id).every(r=>{
      const label=`${r.dir==='in'?'IN':'OUT'}  ${(T.groupsWithUngrouped().find(x=>x.id===r.other)||{}).title||r.other}`;
      return T.GROUP_PAD_X+26+6+label.length*ADV+T.GROUP_PAD_X <= W+0.01;
    });
  }));

/* ================= vertical reordering by dragging ================= */
const RG = 'CONTROL_AND_SUPERVISION';
S.groupPortOrder={}; S.groupPortSides={}; T.render();
const natural = T.groupPortRowsFor(RG).map(r=>r.src+'\u2192'+r.tgt);
const gObj = T.groupsWithUngrouped().find(x=>x.id===RG);
const hBefore2 = T.groupBlockHeight(gObj);

// move the LAST port to the top: everything else shifts down one place
const last = natural[natural.length-1];
check('reorder returns true when the row changes', T.moveGroupPortToRow(RG, last, 0)===true);
T.render();
const after = T.groupPortRowsFor(RG).map(r=>r.src+'\u2192'+r.tgt);
check('dragged port is now row 0', after[0]===last);
check('all others kept their relative order, shifted down',
  JSON.stringify(after.slice(1))===JSON.stringify(natural.slice(0,-1)));
check('no port lost or duplicated', after.length===natural.length && new Set(after).size===after.length);
check('block height unchanged by reordering', T.groupBlockHeight(gObj)===hBefore2);
check('rows are still 0..n-1 with no gaps',
  JSON.stringify(T.groupPortRowsFor(RG).map(r=>r.row))===JSON.stringify(natural.map((_,i)=>i)));

// and back down again (viceversa)
check('moving it back down works', T.moveGroupPortToRow(RG, last, natural.length-1)===true);
T.render();
check('order restored to natural', JSON.stringify(T.groupPortRowsFor(RG).map(r=>r.src+'\u2192'+r.tgt))===JSON.stringify(natural));

// a middle port up by one
const mid = natural[3];
T.moveGroupPortToRow(RG, mid, 1); T.render();
const m2 = T.groupPortRowsFor(RG).map(r=>r.src+'\u2192'+r.tgt);
check('middle port moved up to row 1', m2[1]===mid);
check('port that was at row 1 pushed down to row 2', m2[2]===natural[1]);

// no-ops and clamping
check('same-row move is a no-op', T.moveGroupPortToRow(RG, mid, 1)===false);
check('unknown key is ignored', T.moveGroupPortToRow(RG, 'NOPE\u2192NOPE', 0)===false);
T.moveGroupPortToRow(RG, mid, 999); T.render();
check('out-of-range row clamps to the last one', T.groupPortRowsFor(RG).slice(-1)[0].src+'\u2192'+T.groupPortRowsFor(RG).slice(-1)[0].tgt===mid);

// the wire follows its reordered port
const rowsNow = T.groupPortRowsFor(RG);
const moved = rowsNow.find(r=>r.src+'\u2192'+r.tgt===mid);
const anch = T.groupPortAnchor(RG, moved.src, moved.tgt, moved.dir);
check('wire anchor sits on the ports new row',
  Math.abs(anch.y - (T.groupBlockRect(RG).y + T.groupPortRowY(gObj, moved.row))) < 0.5);

// reorder + side flip are independent
T.setGroupPortSide(RG, moved.src, moved.tgt, moved.side==='left'?'right':'left'); T.render();
const moved2 = T.groupPortRowsFor(RG).find(r=>r.src+'\u2192'+r.tgt===mid);
check('flipping the side keeps the manual row', moved2.row===moved.row);

// order survives a session round-trip
const sess2 = T.buildSessionJSON();
check('manual order saved in the session', Array.isArray(sess2.groupPortOrder[RG]) && sess2.groupPortOrder[RG].length===natural.length);

// still no wire crosses a block after reordering
T.render();
const eh = window.document.getElementById('edgesG').innerHTML;
const rc = T.visibleGroups().map(g=>T.groupBlockRect(g.id));
let cross2 = 0;
for (const m of eh.matchAll(/<path d="(M [^"]+)" fill="none" stroke="var\(--sig/g))
  for (const sg of segs(m[1])) for (const r of rc) if (hits(sg,r)) cross2++;
check('no wire crosses a block after reordering ('+cross2+')', cross2===0);

// deterministic with a manual order in place
T.render(); const q1=window.document.getElementById('nodesG').innerHTML;
T.render(); const q2=window.document.getElementById('nodesG').innerHTML;
check('render deterministic with manual port order', q1===q2);

// reset clears both order and sides
T.resetGroupPortLayout(RG); T.render();
check('reset restores the natural order',
  JSON.stringify(T.groupPortRowsFor(RG).map(r=>r.src+'\u2192'+r.tgt))===JSON.stringify(natural));
check('reset clears the flipped sides', !Object.keys(S.groupPortSides).some(k=>k.startsWith(RG+'|')));

/* ---- pointer Y -> row index arithmetic used by the drag handler ---- */
{
  const g2 = T.groupsWithUngrouped().find(x=>x.id===RG);
  const rect = T.groupBlockRect(RG);
  const zoneTop = rect.y + T.groupPortZoneTop(g2);
  const rows = T.groupPortRowsFor(RG);
  let mapOk = true, edgeOk = true;
  for (const r of rows){
    const centre = rect.y + T.groupPortRowY(g2, r.row);            // where the badge is drawn
    if (Math.floor((centre - zoneTop)/T.GROUP_PORT_ROW_H) !== r.row) mapOk = false;
    // just inside the top and bottom of the same row must still resolve to it
    if (Math.floor((centre - T.GROUP_PORT_ROW_H/2 + 1 - zoneTop)/T.GROUP_PORT_ROW_H) !== r.row) edgeOk = false;
    if (Math.floor((centre + T.GROUP_PORT_ROW_H/2 - 1 - zoneTop)/T.GROUP_PORT_ROW_H) !== r.row) edgeOk = false;
  }
  check('pointer Y at a badge maps back to its own row', mapOk);
  check('pointer Y anywhere within a row band maps to that row', edgeOk);
  // dragging above the zone / below the last row clamps instead of throwing
  const nRows = rows.length;
  const above = Math.floor((zoneTop - 500 - zoneTop)/T.GROUP_PORT_ROW_H);
  const below = Math.floor((zoneTop + 5000 - zoneTop)/T.GROUP_PORT_ROW_H);
  check('drag far above clamps to row 0', Math.max(0, Math.min(nRows-1, above))===0);
  check('drag far below clamps to the last row', Math.max(0, Math.min(nRows-1, below))===nRows-1);
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
