'use strict';
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,computeGroupEdges,visibleGroups,groupBlockRect,
  groupPosOf,groupEdgeRouteKey,setGroupEdgeRoute,setGroupPortSide,moveGroupPortToRow,groupPortRowsFor,
  groupsWithUngrouped,autoLayoutGroups,_routeCache};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups);

// snapshot: the drawn path of every connection, keyed by src->tgt
function paths(){
  T.render();
  const html=window.document.getElementById('edgesG').innerHTML;
  const out=new Map();
  for (const m of html.matchAll(/<g class="edge" data-eid="[^"]*">\s*<path d="(M [^"]+)"/g)) out.set(out.size,m[1]);
  // key by src/tgt via the seg handles' data attributes when present; fall back to index order
  const byKey=new Map(); let i=0;
  for (const e of T.computeGroupEdges()) byKey.set(T.groupEdgeRouteKey(e.source,e.target), out.get(i++));
  return byKey;
}
const before=paths();

/* ---------- move one group block; only constrained wires may change ---------- */
const MOVED='USER_INDICATION';
const p=T.groupPosOf(MOVED); const ox=p.x, oy=p.y;
p.x=ox+240; p.y=oy+120;               // simulate a drag
const after=paths();

const touching=new Set(), distant=new Set();
for (const e of T.computeGroupEdges()){
  const k=T.groupEdgeRouteKey(e.source,e.target);
  (e.source===MOVED||e.target===MOVED?touching:distant).add(k);
}
const movedDistant=[...distant].filter(k=>before.get(k)!==after.get(k));
const movedTouching=[...touching].filter(k=>before.get(k)!==after.get(k));
console.log('   connections: '+touching.size+' touch the moved block, '+distant.size+' do not');
console.log('   of the distant ones, '+movedDistant.length+' changed: '+(movedDistant.join(', ')||'none'));
check('wires attached to the moved block DO re-route', movedTouching.length===touching.size);
check('wires not constrained by the move stay byte-identical', movedDistant.length===0);

/* ---------- moving the block back reproduces the original exactly ---------- */
p.x=ox; p.y=oy;
const restored=paths();
let same=true; for (const [k,v] of before) if (restored.get(k)!==v) same=false;
check('dragging back restores every path exactly (no drift)', same);

/* ---------- a block moved INTO a corridor must disturb that wire ---------- */
// park a block right on top of an existing wire's corridor
const victimKey=[...distant][0];
const target=T.computeGroupEdges().find(e=>T.groupEdgeRouteKey(e.source,e.target)===victimKey);
const vRect=T.groupBlockRect(target.source);
const q=T.groupPosOf(MOVED);
q.x=vRect.x+vRect.w+40; q.y=vRect.y;   // drop it in the gap the wire runs through
const invaded=paths();
check('a block dropped into a wire corridor forces that wire to re-route',
  invaded.get(victimKey)!==before.get(victimKey));
q.x=ox; q.y=oy;

/* ---------- dragging a CONNECTION only affects that connection ---------- */
T.render();
const b2=paths();
const someEdge=T.computeGroupEdges()[5];
const ek=T.groupEdgeRouteKey(someEdge.source,someEdge.target);
// waypoint model: drop the wire at a point above the source block
const sr=T.groupBlockRect(someEdge.source);
T.setGroupEdgeRoute(someEdge.source,someEdge.target,{ wx: sr.x+sr.w+120, wy: sr.y-200 });
const a2=paths();
const others=[...b2.keys()].filter(k=>k!==ek && b2.get(k)!==a2.get(k));
check('rerouting one connection changes only that connection'+(others.length?' ['+others[0]+']':''), others.length===0);
check('the rerouted connection did change', b2.get(ek)!==a2.get(ek));
delete S.groupEdgeRoutes[ek];

/* ---------- reordering ports only affects that block's own wires ---------- */
T.render(); const b3=paths();
const RG='CONTROL_AND_SUPERVISION';
const rows=T.groupPortRowsFor(RG);
T.moveGroupPortToRow(RG, rows[rows.length-1].src+'\u2192'+rows[rows.length-1].tgt, 0);
const a3=paths();
const ownKeys=new Set(T.computeGroupEdges().filter(e=>e.source===RG||e.target===RG).map(e=>T.groupEdgeRouteKey(e.source,e.target)));
const strangers=[...b3.keys()].filter(k=>!ownKeys.has(k) && b3.get(k)!==a3.get(k));
check('reordering ports leaves unrelated wires untouched'+(strangers.length?' ['+strangers[0]+']':''), strangers.length===0);
delete S.groupPortOrder[RG];

/* ---------- still no crossings, still deterministic ---------- */
function segs(d){const n=d.replace(/[ML]/g,' ').trim().split(/\s+/).map(Number);const p=[];for(let i=0;i<n.length;i+=2)p.push([n[i],n[i+1]]);const s=[];for(let i=0;i<p.length-1;i++)s.push([p[i],p[i+1]]);return s;}
function hits(s,r){const[[x1,y1],[x2,y2]]=s,C=3;
 if(Math.abs(y1-y2)<0.5)return y1>r.y+C&&y1<r.y+r.h-C&&Math.min(x1,x2)<r.x+r.w-C&&Math.max(x1,x2)>r.x+C;
 if(Math.abs(x1-x2)<0.5)return x1>r.x+C&&x1<r.x+r.w-C&&Math.min(y1,y2)<r.y+r.h-C&&Math.max(y1,y2)>r.y+C;
 return false;}
T.render();
const rects=T.visibleGroups().map(g=>T.groupBlockRect(g.id));
let cross=0;
for (const d of paths().values()) for (const sg of segs(d)) for (const r of rects) if (hits(sg,r)) cross++;
check('no wire crosses a block after all this dragging ('+cross+')', cross===0);

// a cold render (empty cache) must equal the cached one
const cachedHTML=window.document.getElementById('edgesG').innerHTML;
T._routeCache.clear(); T.render();
check('cold render equals cached render (cache is not a source of truth)',
  window.document.getElementById('edgesG').innerHTML===cachedHTML);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
