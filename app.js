'use strict';
/* ============================================================
   BOOT STATE
   ============================================================
   The editor starts EMPTY: a blank sheet with a single "+" card in the
   middle of the canvas that opens Import. No example system is embedded
   any more — a diagram only ever appears because the user imported one
   (System JSON or a saved session). The former demo lives on in
   fixtures/system.json and can be pasted straight into Import. */

/* ============================================================
   STATE
   ============================================================ */
const S = {
  meta: { id:null, title:'', description:'', key_references:[] },
  nodes: [],   // {id, kind:'ic'|'external', label, x, y, w, h, data}
  edges: [],   // {id, source, target, nets:[{name,type,description}], route?:{x,y}} — route is a manual elbow override
  groups: [],  // {id, title, description, members:[nodeId,...]} — explicit groups only, UNGROUPED is implicit
  groupPos: {}, // {[groupId]: {x,y}} — top-level sheet-symbol layout, keyed so it also covers the implicit UNGROUPED bucket
  groupEdgeRoutes: {}, // {[srcId+'→'+tgtId]: {x,y}} — manual routing for derived (non-persisted) group edges
  groupPortSides: {}, // {[gid+'|'+srcId+'→'+tgtId]: 'left'|'right'} — port dragged to the other edge of its block
  groupEdgeLanes: {}, // {[srcId+'→'+tgtId]: laneIndex} — routing lane frozen at layout time
  groupPortOrder: {}, // {[gid]: ['srcId→tgtId', ...]} — port rows dragged into a manual vertical order
  portalOffsets: {}, // {[gid]: {in:{dx,dy}, out:{dx,dy}}} — each portal COLUMN dragged as a whole (any direction; the design minimum distance to the blocks clamps at render)
  portalOrder: {}, // {[gid]: {[portalKey]: [edgeId,...]}} — a portal's exit slots dragged into a manual vertical order
  portalSeq: {}, // {[gid]: {in:[portalKey,...], out:[portalKey,...]}} — vertical order of the FROM/TO boxes, written by auto-layout (barycentric)
  portalAnchor: {}, // {[gid]: {minY,maxY}} — vertical anchor the FROM/TO columns are centred on, frozen so block drags never tow them
  ungroupedHvFlip: undefined, // LV|HV flip of the implicit UNGROUPED block (real groups keep g.hvFlip on themselves)
  openGroup: null, // null = top-level view; groupId = drilled into that group (phase c)
  view: { tx:60, ty:40, k:1 },
  sel: null,   // {type:'node'|'edge'|'group'|'groupEdge'|'portal', id}
  traceNet: null, // net name being traced end to end (inspector net-card click); ephemeral like sel
  link: null,  // {fromId, x, y} while dragging a connection
  edgeSeq: 0
};

const NODE_W_IC = 176, NODE_H_IC = 64, NODE_W_EXT = 160, NODE_H_EXT = 46;
// Sheet-symbol group blocks grow in Y to list every member's name — width stays fixed.
const GROUP_HEAD_H = 70, GROUP_MEMBER_ROW_H = 14, GROUP_FOOT_PAD = 14;
const GROUP_PAD_X = 14, GROUP_W_MIN = 240, GROUP_SIDE_TAG_W = 26;
// Spacing between group blocks — wide enough for several parallel routing lanes.
const GROUP_COL_GAP = 240, GROUP_ROW_GAP = 96;

/* ------------------------------------------------------------------
   TEXT MEASUREMENT — deterministic, no canvas/DOM measurement, so the
   layout is reproducible in every environment (and in the test suite).
   Advances are expressed in em and chosen as UPPER bounds for the IBM
   Plex faces: a block may end up a few px wider than strictly needed,
   never too narrow to hold its text.
   ------------------------------------------------------------------ */
// 0.62 rather than Plex Mono's exact 0.6: the CSS stack falls back to other
// monospace faces when the webfont doesn't load, and a slightly generous advance
// keeps text inside the block instead of clipping it.
const ADV_MONO = 0.62;
const ADV_WIDE = new Set(['W','M','m','w','@','%','&','—']);
const ADV_NARROW = new Set(['i','l','j','f','t','r','I','.',',',':',';',"'",'`','|','!','[',']','(',')','-',' ','/']);
function textWidth(str, fontSize, mono, letterSpacingEm){
  const s = String(str ?? '');
  let em = 0;
  if (mono) em = s.length * ADV_MONO;
  else for (const ch of s){
    if (ADV_WIDE.has(ch)) em += 0.95;
    else if (ADV_NARROW.has(ch)) em += 0.38;
    else if (ch >= 'A' && ch <= 'Z') em += 0.72;
    else if (ch >= '0' && ch <= '9') em += 0.60;
    else em += 0.57;
  }
  return em*fontSize + (letterSpacingEm||0)*fontSize*Math.max(0, s.length-1);
}

function groupEyebrow(g){ return g && g.id===UNGROUPED_ID ? 'UNASSIGNED' : 'FUNCTIONAL GROUP'; }
function groupMemberLabel(id){ const n = nodeById(id); return n ? n.label : id; }
function portRowLabel(r, titleOf){
  const other = titleOf ? (titleOf.get(r.other) || r.other) : r.other;
  return `${r.dir==='in'?'(IN)':'(OUT)'} ${other}${r.dom==='hv'?' · HV':''}`;
}
// The block is as wide as its widest piece of text needs — nothing is ever
// truncated. Memoised alongside the port index (it depends on the port rows).
function groupBlockWidth(g){
  if (!g) return GROUP_W_MIN;
  const titleOf = new Map(groupsWithUngrouped().map(x=>[x.id, x.title||x.id]));
  let need = GROUP_W_MIN;
  const fit = w => { if (w > need) need = w; };
  // header rows share the right margin with the LV/HV side tag
  fit(GROUP_PAD_X + textWidth(groupEyebrow(g), 9.5, true, 0.1) + GROUP_PAD_X + GROUP_SIDE_TAG_W);
  fit(GROUP_PAD_X + textWidth(g.title, 15, true) + GROUP_PAD_X + GROUP_SIDE_TAG_W);
  fit(GROUP_PAD_X + textWidth(`${g.members.length} block${g.members.length===1?'':'s'}`, 11, false) + GROUP_PAD_X);
  for (const id of g.members){
    const n = nodeById(id);
    fit(GROUP_PAD_X + textWidth(groupMemberLabel(id), 10, !!(n && n.kind==='ic')) + GROUP_PAD_X);
  }
  // On a barrier block the midline is a physical boundary (LV left, HV right),
  // so a port row must fit ENTIRELY inside its own half: no label may reach past
  // the divider into the other domain. Half-width therefore has to hold the
  // longest row, i.e. the block is at least twice the widest row plus a margin
  // to the divider. Ordinary blocks only need the full width to hold the row.
  const barrier = groupSide(g.id)==='barrier';
  const HALF_MARGIN = 8; // clearance between a label's end and the divider
  for (const r of groupPortRowsFor(g.id)){
    const rowNeed = GROUP_PAD_X + 26 + 6 + textWidth(portRowLabel(r, titleOf), 9, true);
    fit(barrier ? 2*(rowNeed + HALF_MARGIN) : rowNeed + GROUP_PAD_X);
  }
  return Math.ceil(need/GRID)*GRID;   // width on the grid: vertical edges (and ports' x) on grid lines
}
// PORT ZONE — the lower part of a group block, under the member list and split
// off from it by a separator rule. Every connection attaches here (one row each)
// instead of on the block's mid-edge, so no wire ever crosses the title or the
// IC names, and each row has room for written info (its net count + neighbour).
// The zone's top therefore depends on how many ICs the group lists, and the
// block's total height on how many connections it has.
const GROUP_PORT_ROW_H = 24, GROUP_PORT_ZONE_PAD = 12;
/* ------------------------------------------------------------------
   THE GRID
   One lattice shared by block dimensions, port coordinates and wire
   waypoints, so a wire dragged to a port's height meets it EXACTLY and
   runs straight — no tiny 90-degree jog to make up a few pixels. Its
   size is, by definition, the minimum Y distance between two ports
   (the port row pitch): ports sit ON grid lines, blocks snap to it,
   and waypoints snap to it, hence everything can meet everything.
   ------------------------------------------------------------------ */
const GRID = GROUP_PORT_ROW_H;
const snapG = v => Math.round(v/GRID)*GRID;
const GROUP_PORT_STUB = GRID;
function groupMemberListBottom(g){ return GROUP_HEAD_H + 8 + (g ? g.members.length : 0)*GROUP_MEMBER_ROW_H; }
function groupSeparatorY(g){ return groupMemberListBottom(g); }
function groupPortZoneTop(g){
  // Aligned so that each row's CENTER (zoneTop + row*GRID + GRID/2) lands on a
  // grid line when the block's own y is on the grid — that's what lets a wire
  // waypoint on the grid meet a port dead-on.
  const raw = groupSeparatorY(g) + GROUP_PORT_ZONE_PAD;
  return Math.ceil((raw - GRID/2)/GRID)*GRID + GRID/2;
}
function groupPortRowY(g, row){ return groupPortZoneTop(g) + row*GROUP_PORT_ROW_H + GROUP_PORT_ROW_H/2; }
// Visible row count of the port zone: barrier blocks stack their two sides in
// parallel columns, so only the taller column counts.
function groupPortRowCount(gid){
  const rows = groupPortRowsFor(gid);
  if (groupSide(gid)!=='barrier') return rows.length;
  const left = rows.filter(r=>r.side==='left').length;
  return Math.max(left, rows.length-left);
}
function groupBlockHeight(g){
  const rows = g ? groupPortRowCount(g.id) : 0;
  const h = groupPortZoneTop(g) + Math.max(rows, 1)*GROUP_PORT_ROW_H + GROUP_FOOT_PAD;
  return Math.ceil(h/GRID)*GRID;   // bottom edge on the grid too
}
const UNGROUPED_ID = 'UNGROUPED';
function isTopLevel(){ return S.openGroup == null; }
const $ = id => document.getElementById(id);
const svg = $('board'), viewport = $('viewport'),
      gridG = $('gridG'), edgesG = $('edgesG'), nodesG = $('nodesG'), linkG = $('linkPreviewG');

/* ============================================================
   TOLERANT JSON PARSING (fences, {output}, arrays)
   ============================================================ */
function tolerantParse(text){
  if (typeof text !== 'string') return text;
  let t = text.trim().replace(/^\uFEFF/, '').replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
  let d = JSON.parse(t);
  if (Array.isArray(d)) d = d[0];
  if (d && typeof d.output === 'string') return tolerantParse(d.output);
  if (d && d.output && typeof d.output === 'object') return d.output;
  if (d && typeof d === 'object'){
    const keys = Object.keys(d);
    if (keys.length === 1 && d[keys[0]] && typeof d[keys[0]] === 'object') return d[keys[0]];
  }
  return d;
}

/* ============================================================
   GRAPH BUILD (deterministic) : input + contract -> nodes/edges
   ============================================================ */
function buildGraph(input, contract, rawGroups){
  const nodes = [], edges = [];
  const byId = new Map();

  for (const ic of (input.ic_components||[])){
    const n = { id: ic.ic_part_number, kind:'ic', label: ic.ic_part_number,
      x:0, y:0, w:NODE_W_IC, h:NODE_H_IC, data: { ...ic } };
    nodes.push(n); byId.set(n.id, n);
  }
  const extByName = new Map();
  function extNode(name, description){
    const key = name.trim();
    if (extByName.has(key)) return extByName.get(key);
    const n = { id:'EXT:'+key, kind:'external', label:key, x:0, y:0,
      w:NODE_W_EXT, h:NODE_H_EXT, data:{ description: description||'' } };
    nodes.push(n); byId.set(n.id, n); extByName.set(key, n);
    return n;
  }
  for (const eb of (contract.external_blocks||[])) extNode(eb.name, eb.description);

  function resolveRef(ref){
    if (byId.has(ref)) return byId.get(ref);
    const core = String(ref).replace(/^external block:\s*/i,'').trim();
    if (extByName.has(core)) return extByName.get(core);
    // case-insensitive external match
    for (const [k,v] of extByName) if (k.toLowerCase()===core.toLowerCase()) return v;
    // unknown reference: auto-create as external (lossless, deterministic)
    return extNode(core, '(auto-created from contract reference)');
  }

  // The per-net insulation-domain flag, as LLM-generated contracts actually
  // write it: boolean `hv`, string "true"/"false", or `domain: "HV"|"LV"`.
  // Returns true/false when stated, null when the contract says nothing.
  function importedNetHv(net){
    if (net.hv != null) return net.hv === true || String(net.hv).toLowerCase() === 'true';
    if (net.domain != null) return /^hv/i.test(String(net.domain).trim());
    return null;
  }

  const edgeMap = new Map();
  for (const net of (contract.global_nets||[])){
    // GND is never DRAWN (see visibleNets / diagramEdges): every block shares a
    // return path, so routing it block-to-block carries no design information
    // and only clutters the sheet. It is deliberately still IMPORTED and kept in
    // the model, because global_contract_override feeds the downstream pipeline
    // and a contract with no ground connectivity would be broken.
    const src = resolveRef(net.source);
    for (const cons of (net.consumers||[])){
      const dst = resolveRef(cons);
      if (!src || !dst || src.id===dst.id) continue;
      const key = src.id+'\u2192'+dst.id;
      if (!edgeMap.has(key)) edgeMap.set(key, { source:src.id, target:dst.id, nets:[] });
      const nets = edgeMap.get(key).nets;
      // A bus never carries the same net twice (a malformed contract can list the
      // same consumer more than once for one net — keep the first occurrence).
      const hv = importedNetHv(net);
      if (!nets.some(x=>x.name===net.name))
        nets.push({ name:net.name, type:net.type||'NA', description:net.description||'',
          ...(hv!=null ? { hv } : {}) });
    }
  }
  // Group members arrive as IC part numbers or "external block: <Name>" refs — resolveRef
  // maps the latter to the "EXT:<Name>" node id (and auto-creates it if not already known,
  // same as it does for net endpoints, so the import stays lossless).
  const groups = [];
  (rawGroups||[]).forEach((g,i)=>{
    const members = [];
    for (const ref of (g.members||[])){
      const n = resolveRef(ref);
      if (n && !members.includes(n.id)) members.push(n.id);
    }
    members.sort();
    groups.push({ id:String(g.id||g.title||('GROUP_'+(i+1))), title:g.title||g.id||'Group',
      description:g.description||'', members });
  });
  groups.sort((a,b)=>a.id.localeCompare(b.id));

  nodes.sort((a,b)=>a.id.localeCompare(b.id));
  const edgeList = [...edgeMap.values()]
    .sort((a,b)=>(a.source+'|'+a.target).localeCompare(b.source+'|'+b.target));
  edgeList.forEach(e=>{ e.nets.sort((a,b)=>a.name.localeCompare(b.name)); e.id='e'+(S.edgeSeq++); edges.push(e); });

  return { nodes, edges, groups };
}

/* ============================================================
   GROUPS (explicit groups + implicit UNGROUPED bucket)
   ============================================================ */
function groupsWithUngrouped(){
  const covered = new Set(S.groups.flatMap(g=>g.members));
  const ungroupedIds = S.nodes.map(n=>n.id).filter(id=>!covered.has(id)).sort();
  const existing = S.groups.find(g=>g.id===UNGROUPED_ID);
  if (existing){
    return S.groups.map(g=>g===existing
      ? { ...g, members:[...new Set([...g.members, ...ungroupedIds])].sort() }
      : g);
  }
  return [...S.groups, { id:UNGROUPED_ID, title:'Ungrouped',
    description:'Blocks not assigned to a functional group.', members:ungroupedIds }];
}

function nodeGroupIndex(){
  const idx = new Map();
  for (const g of groupsWithUngrouped()) for (const m of g.members) idx.set(m, g.id);
  return idx;
}

// Derived (not persisted) group-to-group edges: aggregate every node-level edge
// whose endpoints fall in different groups. Read-only at the top level.
function computeGroupEdges(){
  const idx = nodeGroupIndex();
  const map = new Map();
  for (const e of diagramEdges(S.edges)){
    const gs = idx.get(e.source), gt = idx.get(e.target);
    if (!gs || !gt || gs===gt) continue;
    // A bus never mixes insulation domains: HV-domain nets travel in their
    // OWN group connection (drawn red), so each pair of groups derives up to
    // TWO edges — one per domain (e.dom: '' = LV, 'hv' = HV).
    for (const net of e.nets){
      const dom = isHvNet(net) ? 'hv' : '';
      const key = gs+'→'+gt+(dom ? '#hv' : '');
      if (!map.has(key)) map.set(key, { source:gs, target:gt, dom, nets:[] });
      map.get(key).nets.push(net);
    }
  }
  const list = [...map.values()].sort((a,b)=>
    (a.source+'|'+a.target).localeCompare(b.source+'|'+b.target) || a.dom.localeCompare(b.dom));
  list.forEach((g,i)=>{
    g.nets.sort((a,b)=>a.name.localeCompare(b.name));
    // A bus never lists the same net twice: the same net often links several node
    // pairs between two groups (e.g. one rail feeding many members), which would
    // otherwise show up repeatedly in the inspector and inflate the count badge.
    const seen = new Set();
    g.nets = g.nets.filter(n=> seen.has(n.name) ? false : (seen.add(n.name), true));
    g.id='ge'+i;
  });
  return list;
}

function visibleGroups(){
  return groupsWithUngrouped().filter(g=>g.members.length);
}

// Moving to UNGROUPED_ID just removes the node from every explicit group's
// members — it doesn't need (or get) an S.groups entry of its own.
function moveMemberToGroup(nodeId, fromGroupId, toGroupId){
  if (fromGroupId === toGroupId) return;
  S.groups.forEach(g=>{ g.members = g.members.filter(m=>m!==nodeId); });
  if (toGroupId !== UNGROUPED_ID){
    const g = S.groups.find(x=>x.id===toGroupId);
    if (g){ g.members.push(nodeId); g.members.sort(); }
  }
}

function groupPosOf(id){
  if (!S.groupPos[id]) S.groupPos[id] = { x:40, y:420 };
  return S.groupPos[id];
}

function groupBlockRect(id){
  const p = groupPosOf(id);
  const g = groupsWithUngrouped().find(x=>x.id===id);
  return { id, x:p.x, y:p.y, w:groupBlockWidth(g), h:groupBlockHeight(g) };
}

// Group-level edges are recomputed from scratch every render (computeGroupEdges),
// so their manual routing can't live on the edge object itself — it's keyed by
// the stable source/target group ids instead, same idea as S.groupPos.
// `dom` ('hv' for the HV-domain split of a pair, ''/undefined for LV) is part
// of the identity everywhere: each domain's connection keeps its own route,
// lane and ports.
function groupEdgeRouteKey(src,tgt,dom){ return src+'→'+tgt+(dom==='hv'?'#hv':''); }
function groupEdgeRouteOf(src,tgt,dom){ return S.groupEdgeRoutes[groupEdgeRouteKey(src,tgt,dom)]; }
function setGroupEdgeRoute(src,tgt,route,dom){
  // A route is a single waypoint {wx,wy}; replace rather than merge so a stale
  // coordinate from an older drag can't survive.
  S.groupEdgeRoutes[groupEdgeRouteKey(src,tgt,dom)] = { ...route };
}

/* ------------------------------------------------------------------
   GROUP PORT INDEX — one port row per connection touching a group.
   Row order is deterministic and, deliberately, INDEPENDENT of which
   edge of the block the port currently sits on: inputs first, then
   outputs, each alphabetically by neighbouring group. So dragging a
   port to the opposite side moves it straight across its own row
   instead of reshuffling the block.
   A port's side defaults to left for inputs / right for outputs and is
   overridden by S.groupPortSides. Memoized because groupBlockHeight()
   depends on it and gets called many times per render — invalidated
   from render() and from the layout entry points.
   ------------------------------------------------------------------ */
function groupPortKey(gid, src, tgt, dom){ return gid+'|'+groupEdgeRouteKey(src,tgt,dom); }
// A port's identity inside its own group. Unique because a group edge never has
// the same group at both ends (self-links are dropped in computeGroupEdges)
// and each insulation domain of a pair is its own connection.
function portRowKey(r){ return groupEdgeRouteKey(r.src, r.tgt, r.dom); }
// Drop a port at a given row, pushing whatever was there (and below) down — or up
// if the port came from lower down. Row count is unchanged, so the block keeps
// its height and nothing else in the sheet moves. On a barrier block rows are
// per-SIDE columns, so the move reorders only within the port's own column.
function movePortRowOrder(rows, key, newRow, barrier){
  const keys = rows.map(portRowKey);
  const from = keys.indexOf(key);
  if (from < 0) return null;
  if (barrier){
    const side = rows[from].side;
    const sub = rows.filter(r=>r.side===side).map(portRowKey);
    const sFrom = sub.indexOf(key);
    const sTo = Math.max(0, Math.min(sub.length-1, newRow));
    if (sFrom === sTo) return null;
    sub.splice(sTo, 0, sub.splice(sFrom, 1)[0]);
    return [...sub, ...rows.filter(r=>r.side!==side).map(portRowKey)];
  }
  const to = Math.max(0, Math.min(keys.length-1, newRow));
  if (from === to) return null;
  keys.splice(to, 0, keys.splice(from, 1)[0]);
  return keys;
}
function moveGroupPortToRow(gid, key, newRow){
  const order = movePortRowOrder(groupPortRowsFor(gid), key, newRow, groupSide(gid)==='barrier');
  if (!order) return false;
  S.groupPortOrder[gid] = order;
  invalidateGroupPorts();
  return true;
}
function resetGroupPortLayout(gid){
  delete S.groupPortOrder[gid];
  Object.keys(S.groupPortSides).forEach(k=>{ if (k.startsWith(gid+'|')) delete S.groupPortSides[k]; });
  invalidateGroupPorts();
}
function groupPortSideOf(gid, src, tgt, dir, dom){
  return S.groupPortSides[groupPortKey(gid,src,tgt,dom)] || (dir==='in' ? 'left' : 'right');
}
function setGroupPortSide(gid, src, tgt, side, dom){
  S.groupPortSides[groupPortKey(gid,src,tgt,dom)] = side;
  invalidateGroupPorts();
}
let _groupPortIdx = null, _nodePortIdx = null;
function invalidateGroupPorts(){ _groupPortIdx = null; _nodePortIdx = null; }
function groupPortIndex(){
  if (_groupPortIdx) return _groupPortIdx;
  const titleOf = new Map(groupsWithUngrouped().map(g=>[g.id, g.title||g.id]));
  const idx = new Map(groupsWithUngrouped().map(g=>[g.id, []]));
  for (const e of computeGroupEdges()){
    const hv = e.dom==='hv';   // connections are split per insulation domain
    if (idx.has(e.source)) idx.get(e.source).push({ eid:e.id, src:e.source, tgt:e.target, dom:e.dom, dir:'out', other:e.target, nets:e.nets.length, hv });
    if (idx.has(e.target)) idx.get(e.target).push({ eid:e.id, src:e.source, tgt:e.target, dom:e.dom, dir:'in',  other:e.source, nets:e.nets.length, hv });
  }
  for (const [gid, rows] of idx){
    rows.sort((a,b)=>
      (a.dir===b.dir ? 0 : (a.dir==='in' ? -1 : 1)) ||
      String(titleOf.get(a.other)||a.other).localeCompare(String(titleOf.get(b.other)||b.other)) ||
      a.eid.localeCompare(b.eid));
    // A manual order (from dragging a badge up or down) takes precedence; ports
    // it doesn't mention — new connections, or stale keys left by an edit — fall
    // in after it, still in the natural order above. Stable either way.
    const manual = S.groupPortOrder[gid];
    if (manual && manual.length){
      const rank = new Map(manual.map((k,i)=>[k,i]));
      rows.forEach((r,i)=>{ r._nat = i; });
      rows.sort((a,b)=>
        (rank.has(portRowKey(a))?rank.get(portRowKey(a)):Infinity) -
        (rank.has(portRowKey(b))?rank.get(portRowKey(b)):Infinity)
        || a._nat - b._nat);
      rows.forEach(r=>{ delete r._nat; });
    }
    // On a block that straddles the isolation barrier the halves are physical:
    // HV connections may only attach on the HV half and LV ones on the LV half
    // (right/left by default, swapped when the block's LV|HV flip is on). The
    // side is pinned, not merely defaulted, so a stored override can never
    // place a port in the wrong domain.
    const gside = groupSide(gid);
    const flip = groupHvFlip(gid);
    rows.forEach(r=>{
      r.pinned = gside==='barrier';
      r.side = r.pinned ? ((r.hv !== flip) ? 'right' : 'left') : groupPortSideOf(gid, r.src, r.tgt, r.dir, r.dom);
    });
    // On a barrier block the two halves hold independent COLUMNS of rows: an
    // LV and an HV port can share the same line, because the width rule
    // guarantees each label fits entirely inside its own half. The block then
    // needs only max(left,right) rows — much more compact vertically.
    if (gside==='barrier'){
      let li=0, ri=0;
      rows.forEach(r=>{ r.row = r.side==='left' ? li++ : ri++; });
    } else {
      rows.forEach((r,i)=>{ r.row = i; });
    }
  }
  _groupPortIdx = idx;
  return idx;
}
function groupPortRowsFor(gid){ return groupPortIndex().get(gid) || []; }
function groupPortOf(gid, src, tgt, dir, dom){
  return groupPortRowsFor(gid).find(r=>r.src===src && r.tgt===tgt && r.dir===dir && (r.dom||'')===(dom||''));
}
// Absolute attachment point of one end of a group edge, plus the direction the
// wire leaves/arrives in (+1 rightward, -1 leftward).
function groupPortAnchor(gid, src, tgt, dir, dom){
  const rect = groupBlockRect(gid);
  const g = groupsWithUngrouped().find(x=>x.id===gid);
  const r = groupPortOf(gid, src, tgt, dir, dom);
  if (!r) return { x: rect.x + (dir==='in' ? 0 : rect.w), y: rect.y + rect.h/2, side:(dir==='in'?'left':'right'), sign:1 };
  const left = r.side==='left';
  return {
    x: rect.x + (left ? 0 : rect.w),
    y: rect.y + groupPortRowY(g, r.row),
    side: r.side,
    // Source: +1 when leaving from the right edge. Target: +1 when arriving into
    // the left edge (still travelling rightward).
    sign: dir==='out' ? (left ? -1 : 1) : (left ? 1 : -1)
  };
}

/* ------------------------------------------------------------------
   NODE PORT INDEX — the drill-down blocks follow the SAME norms as the
   group blocks above: one port row per connection touching the node
   (internal or boundary-crossing alike), inputs first then outputs,
   alphabetically by the other block's label; sides default in=left /
   out=right and are overridden per port; rows reorderable by dragging
   the badge. Overrides share the group stores (S.groupPortSides /
   S.groupPortOrder, keyed by node id — node ids and group ids never
   collide in practice, and the keys are opaque). Independent of which
   group is open, so block dimensions can be computed at import time.
   ------------------------------------------------------------------ */
function nodePortIndex(){
  if (_nodePortIdx) return _nodePortIdx;
  const idx = new Map(S.nodes.map(n=>[n.id, []]));
  for (const e of diagramEdges(S.edges)){
    const hv = e.nets.some(isHvNet);   // the connection's EFFECTIVE insulation domain
    if (idx.has(e.source)) idx.get(e.source).push({ eid:e.id, src:e.source, tgt:e.target, dir:'out', other:e.target, nets:e.nets.length, hv });
    if (idx.has(e.target)) idx.get(e.target).push({ eid:e.id, src:e.source, tgt:e.target, dir:'in',  other:e.source, nets:e.nets.length, hv });
  }
  const labelOf = id => { const n=nodeById(id); return n ? n.label : id; };
  for (const [nid, rows] of idx){
    rows.sort((a,b)=>
      (a.dir===b.dir ? 0 : (a.dir==='in' ? -1 : 1)) ||
      labelOf(a.other).localeCompare(labelOf(b.other)) ||
      String(a.eid).localeCompare(String(b.eid)));
    const manual = S.groupPortOrder[nid];
    if (manual && manual.length){
      const rank = new Map(manual.map((k,i)=>[k,i]));
      rows.forEach((r,i)=>{ r._nat = i; });
      rows.sort((a,b)=>
        (rank.has(portRowKey(a))?rank.get(portRowKey(a)):Infinity) -
        (rank.has(portRowKey(b))?rank.get(portRowKey(b)):Infinity)
        || a._nat - b._nat);
      rows.forEach(r=>{ delete r._nat; });
    }
    // A member block that straddles the isolation barrier pins its ports by
    // domain, exactly like a barrier group block: HV connections on the HV
    // half, LV on the LV half (right/left by default, swapped by n.hvFlip).
    const nside = nodeSide(nid);
    const n = nodeById(nid);
    const flip = !!(n && n.hvFlip);
    rows.forEach(r=>{
      r.pinned = nside==='barrier';
      r.side = r.pinned ? ((r.hv !== flip) ? 'right' : 'left') : groupPortSideOf(nid, r.src, r.tgt, r.dir);
    });
    // Barrier members stack their two sides in parallel columns (same rule as
    // the barrier group blocks) — an LV and an HV port share the line.
    if (nside==='barrier'){
      let li=0, ri=0;
      rows.forEach(r=>{ r.row = r.side==='left' ? li++ : ri++; });
    } else {
      rows.forEach((r,i)=>{ r.row = i; });
    }
  }
  _nodePortIdx = idx;
  return idx;
}
function nodePortRowsFor(id){ return nodePortIndex().get(id) || []; }
function nodePortOf(id, src, tgt, dir){
  return nodePortRowsFor(id).find(r=>r.src===src && r.tgt===tgt && r.dir===dir);
}
function moveNodePortToRow(nid, key, newRow){
  const order = movePortRowOrder(nodePortRowsFor(nid), key, newRow, nodeSide(nid)==='barrier');
  if (!order) return false;
  S.groupPortOrder[nid] = order;
  invalidateGroupPorts();
  return true;
}
// Visible row count of a member block's port zone (parallel columns on barrier).
function nodePortRowCount(id){
  const rows = nodePortRowsFor(id);
  if (nodeSide(id)!=='barrier') return rows.length;
  const left = rows.filter(r=>r.side==='left').length;
  return Math.max(left, rows.length-left);
}
// Same geometry as the group blocks: a header, a separator, then the port zone
// with one GRID-pitch row per connection — the block grows to fit, and rows are
// aligned so their centers land on grid lines when the block's y is on the grid.
function nodeHeaderBottom(n){ return n.kind==='ic' ? 50 : 40; }
function nodePortZoneTop(n){
  const raw = nodeHeaderBottom(n) + GROUP_PORT_ZONE_PAD;
  return Math.ceil((raw - GRID/2)/GRID)*GRID + GRID/2;
}
function nodePortRowY(n, row){ return nodePortZoneTop(n) + row*GROUP_PORT_ROW_H + GROUP_PORT_ROW_H/2; }
function nodeBlockHeight(n){
  const rows = nodePortRowCount(n.id);
  const h = nodePortZoneTop(n) + Math.max(rows, 1)*GROUP_PORT_ROW_H + GROUP_FOOT_PAD;
  return Math.ceil(h/GRID)*GRID;
}
function nodePortRowLabel(r){
  const n = nodeById(r.other);
  return `${r.dir==='in'?'(IN)':'(OUT)'} ${n ? n.label : r.other}`;
}
function nodeBlockWidth(n){
  let need = n.kind==='ic' ? NODE_W_IC : NODE_W_EXT;
  const fit = w => { if (w > need) need = w; };
  if (n.kind==='ic'){
    fit(26 + textWidth(n.label, 13.5, true) + GROUP_PAD_X + GROUP_SIDE_TAG_W);
    fit(26 + textWidth((n.data.ic_type||'').slice(0,30), 10, false) + GROUP_PAD_X);
  } else {
    fit(12 + textWidth('EXTERNAL', 10, true, 0.08) + GROUP_PAD_X + GROUP_SIDE_TAG_W);
    // the full label — the block widens instead of cutting the name
    fit(12 + textWidth(n.label, 11.5, false) + GROUP_PAD_X);
  }
  // On a barrier block the midline is a physical boundary: a port row must fit
  // ENTIRELY inside its own half, so the block is at least twice the widest
  // row (same rule as groupBlockWidth).
  const barrier = nodeSide(n.id)==='barrier';
  const HALF_MARGIN = 8;
  for (const r of nodePortRowsFor(n.id)){
    const rowNeed = GROUP_PAD_X + 26 + 6 + textWidth(nodePortRowLabel(r), 9, true);
    fit(barrier ? 2*(rowNeed + HALF_MARGIN) : rowNeed + GROUP_PAD_X);
  }
  return Math.ceil(need/GRID)*GRID;
}
// n.w/n.h are stored on the node (legacy of the flat editor), so they're
// refreshed from the port rows wherever the sheet is about to be measured —
// layout and drill rendering — keeping every consumer (obstacles, bounds,
// fitView, drags) in agreement.
function updateMemberDims(members){
  for (const n of members){ n.w = nodeBlockWidth(n); n.h = nodeBlockHeight(n); }
}
// Absolute attachment point of one end of a node edge — same contract as
// groupPortAnchor: {x, y, side, sign} with sign the direction of travel.
function nodePortAnchor(id, src, tgt, dir){
  const n = nodeById(id);
  const r = nodePortOf(id, src, tgt, dir);
  if (!r) return { x: n.x + (dir==='in' ? 0 : n.w), y: n.y + n.h/2, side:(dir==='in'?'left':'right'), sign:1 };
  const left = r.side==='left';
  return {
    x: n.x + (left ? 0 : n.w),
    y: n.y + nodePortRowY(n, r.row),
    side: r.side,
    sign: dir==='out' ? (left ? -1 : 1) : (left ? 1 : -1)
  };
}

/* ============================================================
   DETERMINISTIC AUTO-LAYOUT — full Sugiyama pipeline:
   1) layer assignment (longest-path, signal edges only)
   2) crossing reduction (barycenter, 8 alternating passes, all edges)
   3) y-coordinate assignment (neighbor-average relaxation, 4 passes, all edges)
   Every step uses a fixed iteration count and alphabetical tie-breaks, so the
   whole pipeline is deterministic: same graph in, same layout out, always.
   ============================================================ */
function isGroundNet(n){ return /^GROUND$/i.test(n.type||''); }
// Nets that are kept in the model but never drawn on the sheet.
function visibleNets(nets){ return (nets||[]).filter(n=>!isGroundNet(n)); }
// The edges the DIAGRAM shows: ground-only connections vanish entirely, and the
// rest expose just their drawable nets (so counts and colours ignore ground).
function diagramEdges(edges){
  const out=[];
  for (const e of (edges||[])){
    const nets = visibleNets(e.nets);
    if (nets.length) out.push({ ...e, nets });
  }
  return out;
}
function isPowerNet(n){ return /POWER|GROUND|HIGH_CURRENT/i.test(n.type||''); }
// An edge participates in layering unless EVERY one of its nets is power/ground/
// high-current — those rails fan out to nearly every block and would otherwise
// flatten the whole hierarchy into two columns. Power-only edges still draw
// normally; they just don't influence what layer a block ends up in.
function isPowerOnlyEdge(e){ return e.nets && e.nets.length>0 && e.nets.every(isPowerNet); }

// Hardware nets routinely form real cycles at the signal level (e.g. a control
// line out and a status line back between the same two blocks). Longest-path
// ranking only makes sense on a DAG — fed a cycle, the pass-cap keeps
// relaxing every node in the cycle upward until it hits the ceiling, so the
// whole strongly-connected component collapses into the last few layers
// instead of spreading out. Standard fix (classic first step of Sugiyama):
// find "back edges" via DFS (edges to a node still on the current recursion
// stack) and exclude just those from ranking — a deterministic depth-first
// walk in alphabetical order, so which edge of a cycle gets called "the
// back edge" is stable across runs.
function findBackEdges(sortedIds, edges){
  const adj = new Map(sortedIds.map(i=>[i,[]]));
  for (const e of edges) adj.get(e.source).push(e.target);
  for (const id of sortedIds) adj.get(id).sort();

  const UNVISITED=0, ON_STACK=1, DONE=2;
  const state = new Map(sortedIds.map(i=>[i,UNVISITED]));
  const back = new Set();
  function dfs(u){
    state.set(u, ON_STACK);
    for (const v of adj.get(u)){
      if (state.get(v)===UNVISITED) dfs(v);
      else if (state.get(v)===ON_STACK) back.add(u+'→'+v);
    }
    state.set(u, DONE);
  }
  for (const id of sortedIds) if (state.get(id)===UNVISITED) dfs(id);
  return back;
}

// Longest-path layering using only "signal" edges (with cycles broken first).
// A node with no signal edges at all (only power/ground links, or no edges
// whatsoever) can't be placed this way, so it falls back to the rounded
// average layer of its neighbors across EVERY edge — or layer 0 if it has no
// neighbors at all.
function computeSignalLayers(sortedIds, edges){
  const signal = edges.filter(e=>!isPowerOnlyEdge(e));
  const hasSignal = new Set();
  for (const e of signal){ hasSignal.add(e.source); hasSignal.add(e.target); }

  const backEdges = findBackEdges(sortedIds, signal);
  const adjSignal = new Map(sortedIds.map(i=>[i,[]]));
  for (const e of signal){
    if (backEdges.has(e.source+'→'+e.target)) continue;
    adjSignal.get(e.source).push(e.target);
  }
  const rank = new Map(sortedIds.map(i=>[i,0]));
  for (let pass=0; pass<sortedIds.length; pass++){
    let changed=false;
    for (const u of sortedIds) for (const v of adjSignal.get(u))
      if (rank.get(v) < rank.get(u)+1 && rank.get(u)+1 < sortedIds.length){ rank.set(v, rank.get(u)+1); changed=true; }
    if (!changed) break;
  }
  const adjAll = new Map(sortedIds.map(i=>[i,[]]));
  for (const e of edges){
    adjAll.get(e.source).push(e.target);
    adjAll.get(e.target).push(e.source);
  }
  for (const id of sortedIds){
    if (hasSignal.has(id)) continue;
    const neigh = adjAll.get(id);
    rank.set(id, neigh.length ? Math.round(neigh.reduce((s,n)=>s+rank.get(n),0)/neigh.length) : 0);
  }
  return rank;
}

// Barycenter crossing reduction: 8 alternating down/up passes. Each pass reorders
// one layer at a time by the average index of its neighbors in the adjacent layer
// that was just fixed (all edges count here — this is purely about untangling the
// drawing, not the hierarchy). A node with no neighbors in the reference layer
// keeps its current slot instead of jumping. Alphabetical tie-break throughout.
function orderLayersByBarycenter(sortedRanks, colsMap, edges){
  const allIds = [].concat(...sortedRanks.map(r=>colsMap.get(r)));
  const neighborsOf = new Map(allIds.map(id=>[id,[]]));
  for (const e of edges){
    if (!neighborsOf.has(e.source) || !neighborsOf.has(e.target)) continue;
    neighborsOf.get(e.source).push(e.target);
    neighborsOf.get(e.target).push(e.source);
  }
  const order = new Map(sortedRanks.map(r=>[r, [...colsMap.get(r)]]));

  function reorder(idx, refIdx){
    const r = sortedRanks[idx], refR = sortedRanks[refIdx];
    const refIndex = new Map(order.get(refR).map((id,i)=>[id,i]));
    const scored = order.get(r).map((id,i)=>{
      const neigh = neighborsOf.get(id).filter(n=>refIndex.has(n));
      const bary = neigh.length ? neigh.reduce((s,n)=>s+refIndex.get(n),0)/neigh.length : i;
      return { id, bary };
    });
    scored.sort((a,b)=> a.bary-b.bary || a.id.localeCompare(b.id));
    order.set(r, scored.map(x=>x.id));
  }

  for (let pass=0; pass<8; pass++){
    if (pass%2===0) for (let i=1;i<sortedRanks.length;i++) reorder(i,i-1);
    else for (let i=sortedRanks.length-2;i>=0;i--) reorder(i,i+1);
  }
  return order;
}

// Closest (least-squares) non-decreasing sequence to `values` — pool-adjacent-
// violators algorithm for 1-D isotonic regression, O(n). Used to fit a column's
// desired Y positions to the minimum-separation constraint without the unfairness
// of a one-directional push (which can cascade one node's overlap into moving
// another node that never needed to).
function poolAdjacentViolators(values){
  const stack = [];
  for (const v of values){
    let block = { sum:v, count:1, avg:v };
    while (stack.length && stack[stack.length-1].avg > block.avg){
      const prev = stack.pop();
      block = { sum:prev.sum+block.sum, count:prev.count+block.count, avg:(prev.sum+block.sum)/(prev.count+block.count) };
    }
    stack.push(block);
  }
  const result = [];
  for (const block of stack) for (let k=0;k<block.count;k++) result.push(block.avg);
  return result;
}

// Nudges every node toward the average Y of its neighbors (any edge, 4 passes) so
// connections end up as horizontal as possible, resolving any resulting overlap
// with the minimum gap. The order within a layer (from the barycenter step) is
// never changed here — only spacing is, via isotonic regression (see below) so
// resolving one node's overlap can't unfairly drag an unrelated node in the same
// column that never needed to move.
function assignYByAverage(sortedRanks, order, edges, heightFn, gap){
  const allIds = [].concat(...sortedRanks.map(r=>order.get(r)));
  const h = new Map(allIds.map(id=>[id, heightFn(id)]));
  const y = new Map();
  for (const r of sortedRanks){
    const col = order.get(r);
    const total = col.reduce((s,id)=>s+h.get(id),0) + gap*Math.max(0,col.length-1);
    let cursor = 420 - total/2;
    for (const id of col){ y.set(id, cursor + h.get(id)/2); cursor += h.get(id)+gap; }
  }

  const neighborsOf = new Map(allIds.map(id=>[id,[]]));
  for (const e of edges){
    if (!neighborsOf.has(e.source) || !neighborsOf.has(e.target)) continue;
    neighborsOf.get(e.source).push(e.target);
    neighborsOf.get(e.target).push(e.source);
  }

  // Move halfway toward the neighbor average each pass rather than snapping to it —
  // an undamped Jacobi update oscillates and can overshoot far past every neighbor
  // for high-degree hubs whose neighbors are themselves moving in the same pass.
  const DAMPING = 0.5;
  const initialCentroid = allIds.reduce((s,id)=>s+y.get(id),0)/allIds.length;
  for (let pass=0; pass<4; pass++){
    const desired = new Map();
    for (const id of allIds){
      const neigh = neighborsOf.get(id);
      const avg = neigh.length ? neigh.reduce((s,n)=>s+y.get(n),0)/neigh.length : y.get(id);
      desired.set(id, y.get(id) + (avg-y.get(id))*DAMPING);
    }
    for (const r of sortedRanks){
      const col = order.get(r);
      if (!col.length) continue;
      // Minimum-separation-preserving fit: de-mean each slot by its cumulative
      // required offset, run isotonic regression (closest non-decreasing sequence,
      // pool-adjacent-violators) on the de-meaned desired values, then add the
      // offsets back. This is the least-displacement solution respecting both the
      // fixed order and the minimum gaps — unlike a one-directional forward push,
      // it never lets one node's collision cascade into shifting an unrelated node
      // that already had room.
      const offsets=[0];
      for (let i=1;i<col.length;i++) offsets.push(offsets[i-1] + h.get(col[i-1])/2+gap+h.get(col[i])/2);
      const z = col.map((id,i)=> desired.get(id)-offsets[i]);
      const zFit = poolAdjacentViolators(z);
      col.forEach((id,i)=> y.set(id, zFit[i]+offsets[i]));
    }
    // Pooling isn't mean-preserving (it can shift a column's average when it stretches
    // to satisfy minimum separation), so without this the whole diagram can drift
    // linearly, pass after pass, in whatever direction the crowding happens to bias it.
    // Re-anchoring the global centroid every pass removes that free-floating degree of
    // freedom while leaving all the RELATIVE repositioning (the actual goal) intact.
    const centroid = allIds.reduce((s,id)=>s+y.get(id),0)/allIds.length;
    const drift = initialCentroid - centroid;
    for (const id of allIds) y.set(id, y.get(id)+drift);
  }

  const pos = new Map();
  for (const id of allIds) pos.set(id, y.get(id) - h.get(id)/2); // center → top-left
  return pos;
}

// heightFn(id) lets each column stack boxes by their real height instead of a
// fixed slot — needed because group blocks grow with their member count.
// widthFn=null keeps the legacy fixed column pitch (used by the in-group layout,
// whose spacing must stay as it was). With a widthFn, columns are placed
// cumulatively from each layer's widest block plus colGap, so variable-width
// blocks never eat into the routing channels between columns.
function layeredLayout(ids, edges, colGap, gap, heightFn, widthFn){
  const sortedIds = [...ids].sort();
  const idSet = new Set(sortedIds);
  const relevant = edges.filter(e=>idSet.has(e.source)&&idSet.has(e.target));

  const rank = computeSignalLayers(sortedIds, relevant);
  const cols = new Map();
  for (const id of sortedIds){
    const r = rank.get(id);
    if (!cols.has(r)) cols.set(r,[]);
    cols.get(r).push(id);
  }
  const sortedRanks = [...cols.keys()].sort((a,b)=>a-b);
  for (const r of sortedRanks) cols.set(r, cols.get(r).sort()); // alphabetical seed order

  const order = orderLayersByBarycenter(sortedRanks, cols, relevant);
  const yOf = assignYByAverage(sortedRanks, order, relevant, heightFn, gap);

  const xOf = new Map();
  let cursor = widthFn ? 2*GRID : 40;   // top level starts on a grid line
  for (const r of sortedRanks){
    xOf.set(r, cursor);
    cursor += widthFn
      ? Math.max(...cols.get(r).map(id=>widthFn(id))) + colGap
      : colGap;
  }

  const pos = new Map();
  for (const r of sortedRanks) for (const id of order.get(r))
    pos.set(id, { x: xOf.get(r), y: yOf.get(id) });
  return pos;
}

function nodeHeight(id){ const n=nodeById(id); return n ? n.h : NODE_H_IC; }

// Lays out one group's members using only that group's internal edges — a local
// diagram scoped to the group, not the whole system (each node belongs to exactly
// one group, so reusing n.x/n.y per node here never conflicts across groups).
function autoLayoutGroupMembers(groupId){
  const g = groupsWithUngrouped().find(x=>x.id===groupId);
  if (!g || !g.members.length) return;
  const memberSet = new Set(g.members);
  const members = S.nodes.filter(n=>memberSet.has(n.id));
  // A layout is a FRESH deterministic arrangement of this group's sheet:
  // manual wire routes, port overrides, portal column offsets/orders and the
  // frozen column anchor are all recomputed below (undo restores them).
  for (const id of g.members){
    delete S.groupPortOrder[id];
    Object.keys(S.groupPortSides).forEach(k=>{ if (k.startsWith(id+'|')) delete S.groupPortSides[k]; });
  }
  for (const e of S.edges)
    if ((memberSet.has(e.source) || memberSet.has(e.target)) && e.route &&
        (e.route.sheet == null || e.route.sheet === groupId)) delete e.route;
  delete S.portalOffsets[groupId];
  delete S.portalOrder[groupId];
  delete S.portalSeq[groupId];
  delete S.portalAnchor[groupId];
  invalidateGroupPorts();
  // Blocks grow with their port zone — measure BEFORE spacing, and hand the
  // real widths to the layout so columns clear each other. Channel gaps are
  // sized like the top level: room for several parallel routing lanes.
  updateMemberDims(members);
  const internalEdges = diagramEdges(S.edges).filter(e=>memberSet.has(e.source) && memberSet.has(e.target));
  const pos = layeredLayout(g.members, internalEdges, GROUP_COL_GAP, GROUP_ROW_GAP, nodeHeight,
    id=>{ const n=nodeById(id); return n ? n.w : NODE_W_IC; });
  // Land every block on the grid so its port rows sit exactly on grid lines.
  for (const id of g.members){ const n=nodeById(id); if (n){ const p=pos.get(id); n.x=snapG(p.x); n.y=snapG(p.y); } }
  optimizeMemberPorts(groupId);
}

function autoLayoutAllGroupMembers(){
  for (const g of groupsWithUngrouped()) autoLayoutGroupMembers(g.id);
}

/* ------------------------------------------------------------------
   PORT AIMING (auto-layout only — it stores the SAME overrides a user
   drag would, never new rules, so everything stays hand-editable):
   · SIDES: a port faces the block it connects to when that block is
     clearly beside it; otherwise the low-priority default applies
     (inputs left, outputs right — also where the FROM/TO columns are).
   · ORDER: each block's rows sort by where their counterparts sit, so
     a wire to a block above leaves near the top and one to a block
     below near the bottom — minimal length, minimal crossings. Two
     rounds: block centres first, then the real port anchors.
   · PORTALS: the FROM/TO boxes order by the barycenter of the member
     ports they feed, and each box's exit slots sort the same way, so
     boundary wires run as straight, parallel and uncrossed as the
     sheet allows. Barrier-pinned ports never change sides.
   ------------------------------------------------------------------ */
function optimizeMemberPorts(gid){
  const g = groupsWithUngrouped().find(x=>x.id===gid);
  if (!g || !g.members.length) return;
  const memberSet = new Set(g.members);
  const all = diagramEdges(S.edges);
  const center = id => { const n=nodeById(id); return n ? { x:n.x+n.w/2, y:n.y+n.h/2 } : null; };
  // sides — only stored when the neighbour clearly pulls the port off its default
  for (const e of all){
    if (!memberSet.has(e.source) || !memberSet.has(e.target)) continue;
    const a = nodeById(e.source), b = nodeById(e.target);
    if (!a || !b) continue;
    if (nodeSide(e.source)!=='barrier' && b.x + b.w/2 < a.x)
      setGroupPortSide(e.source, e.source, e.target, 'left');       // output faces a block on its left
    if (nodeSide(e.target)!=='barrier' && a.x + a.w/2 > b.x + b.w)
      setGroupPortSide(e.target, e.source, e.target, 'right');      // input faces a block on its right
  }
  // row order, round 1: counterpart block centres (boundary rows stay neutral)
  const orderRound = anchorY => {
    for (const nid of g.members){
      if (!nodeById(nid)) continue;
      const rows = nodePortRowsFor(nid);
      if (rows.length < 2) continue;
      const ranked = rows.map((r,i)=>({ r, i, y:anchorY(r, nid) })).sort((p,q)=>p.y-q.y || p.i-q.i);
      S.groupPortOrder[nid] = ranked.map(x=>portRowKey(x.r));
      invalidateGroupPorts();
    }
  };
  const counterpartOf = r => r.dir==='in' ? r.src : r.tgt;
  orderRound((r,nid)=>{
    const other = counterpartOf(r);
    return memberSet.has(other) ? center(other).y : center(nid).y;
  });
  // portals: box order and slot order by the member ports they attach to
  const prevOpen = S.openGroup;
  S.openGroup = gid;   // drillSheet works on the open group — borrow it briefly
  invalidateGroupPorts();
  let sheet = drillSheet();
  const memberEndY = s => (s.kind==='in' ? s.pb : s.pa).y;
  const seq = { in:[], out:[] };
  for (const dir of ['in','out']){
    const scored = sheet.portals.filter(p=>p.dir===dir).map(p=>{
      const specs = sheet.specs.filter(s=>s.portalKey===p.key);
      (S.portalOrder[gid] || (S.portalOrder[gid]={}))[p.key] =
        specs.slice().sort((a,b)=>memberEndY(a)-memberEndY(b)).map(s=>s.e.id);
      const bary = specs.length ? specs.reduce((t,s)=>t+memberEndY(s),0)/specs.length : 0;
      return { key:p.key, bary };
    });
    seq[dir] = scored.sort((a,b)=>a.bary-b.bary || a.key.localeCompare(b.key)).map(x=>x.key);
  }
  S.portalSeq[gid] = seq;
  invalidateGroupPorts();
  sheet = drillSheet();   // slots landed — read the real portal-end anchors
  const portalEndY = new Map(sheet.specs.filter(s=>s.kind!=='internal')
    .map(s=>[s.e.id, (s.kind==='in' ? s.pa : s.pb).y]));
  S.openGroup = prevOpen;
  // row order, round 2: the real anchors (counterpart ports, portal slots)
  orderRound((r,nid)=>{
    const other = counterpartOf(r);
    if (memberSet.has(other))
      return nodePortAnchor(other, r.src, r.tgt, r.dir==='in' ? 'out' : 'in').y;
    return portalEndY.has(r.eid) ? portalEndY.get(r.eid) : center(nid).y;
  });
}

// onlyMissing=true fills in positions only for groups that don't have one yet
// (used when restoring a session, so manually-dragged group positions survive).
function autoLayoutGroups(onlyMissing){
  invalidateGroupPorts(); // heightFn below reads the port index
  const groups = visibleGroups();
  // A full layout (the button / an import) starts the sheet fresh: manual
  // group-edge routes and port overrides are recomputed. Session restores
  // (onlyMissing) keep everything as saved.
  if (!onlyMissing){
    S.groupEdgeRoutes = {};
    for (const g of groups) resetGroupPortLayout(g.id);
  }
  // Generous channels: the gaps between columns and rows are where every wire has
  // to fit, so they're sized for several parallel routing lanes (see LANE_PITCH).
  const pos = layeredLayout(groups.map(g=>g.id), computeGroupEdges(), GROUP_COL_GAP, GROUP_ROW_GAP,
    id=>groupBlockHeight(groups.find(g=>g.id===id)),
    id=>groupBlockWidth(groups.find(g=>g.id===id)));
  for (const [id,p] of pos){
    if (onlyMissing && S.groupPos[id]) continue;
    // Barycenter Ys are fractional — land every block on the grid so its ports
    // (block.y + aligned row offsets) sit exactly on grid lines.
    S.groupPos[id] = { x:snapG(p.x), y:snapG(p.y) };
  }
  if (!onlyMissing) optimizeGroupPortsTop();
}

// The top-level twin of optimizeMemberPorts: group-block ports face their
// neighbour when it is clearly beside them and sort by where it sits — same
// aims, dom-aware keys (each insulation domain is its own connection).
function optimizeGroupPortsTop(){
  const rectOf = id => groupBlockRect(id);
  for (const e of computeGroupEdges()){
    const a = rectOf(e.source), b = rectOf(e.target);
    if (groupSide(e.source)!=='barrier' && b.x + b.w/2 < a.x)
      setGroupPortSide(e.source, e.source, e.target, 'left', e.dom);
    if (groupSide(e.target)!=='barrier' && a.x + a.w/2 > b.x + b.w)
      setGroupPortSide(e.target, e.source, e.target, 'right', e.dom);
  }
  const round = anchorY => {
    for (const g of visibleGroups()){
      const rows = groupPortRowsFor(g.id);
      if (rows.length < 2) continue;
      const ranked = rows.map((r,i)=>({ r, i, y:anchorY(r) })).sort((p,q)=>p.y-q.y || p.i-q.i);
      S.groupPortOrder[g.id] = ranked.map(x=>portRowKey(x.r));
      invalidateGroupPorts();
    }
  };
  round(r=>{ const rc=rectOf(r.other); return rc.y + rc.h/2; });
  round(r=>groupPortAnchor(r.other, r.src, r.tgt, r.dir==='in' ? 'out' : 'in', r.dom).y);
  deconflictGroupRails();
}

// Port aiming can land two wires' long horizontal runs on the SAME grid line
// (rows are quantized, blocks share the lattice) — collinear overlaps that
// routing lanes cannot separate, because a rail's y comes from its port row.
// This pass finds them and nudges one port a row up/down until every rail is
// its own line. Bounded and deterministic.
function deconflictGroupRails(){
  const railsOf = () => {
    const obs = visibleGroups().map(g=>groupBlockRect(g.id));
    const segs = [];
    for (const e of computeGroupEdges()){
      const pa = groupPortAnchor(e.source, e.source, e.target, 'out', e.dom);
      const pb = groupPortAnchor(e.target, e.source, e.target, 'in', e.dom);
      const { pts } = groupEdgePts(pa, pb, undefined, obs, 0);
      for (let i=0;i<pts.length-1;i++){
        const [x1,y1]=pts[i],[x2,y2]=pts[i+1];
        if (Math.abs(y1-y2)<0.5 && Math.abs(x1-x2)>=0.5)
          segs.push({ e, at:y1, a:Math.min(x1,x2), b:Math.max(x1,x2) });
      }
    }
    return segs;
  };
  for (let round=0; round<6; round++){
    const segs = railsOf();
    let clash = null;
    for (let i=0;i<segs.length && !clash;i++) for (let j=i+1;j<segs.length;j++){
      const A=segs[i], B=segs[j];
      if (A.e.id===B.e.id || Math.abs(A.at-B.at)>0.5) continue;
      if (Math.min(A.b,B.b)-Math.max(A.a,B.a) > 8){ clash = B.e; break; }
    }
    if (!clash) return;
    // shift one end of the clashing wire a row within its own block — try the
    // target first, then the source, one step down then up
    const tryShift = (gid, dom) => {
      const r = groupPortOf(gid, clash.source, clash.target, gid===clash.target?'in':'out', dom);
      if (!r) return false;
      const key = groupEdgeRouteKey(clash.source, clash.target, dom);
      return moveGroupPortToRow(gid, key, r.row+1) || moveGroupPortToRow(gid, key, r.row-1);
    };
    if (!tryShift(clash.target, clash.dom) && !tryShift(clash.source, clash.dom)) return;
  }
}

/* ============================================================
   RENDER
   ============================================================ */
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function nodeById(id){ return S.nodes.find(n=>n.id===id); }
function isHvNetType(n){ return /HIGH_VOLTAGE/i.test(n.type||''); }
// EFFECTIVE insulation domain of a net: an explicit per-net flag (set from the
// connection inspector) wins over what the TYPE implies. Needed because nets
// like HV_SENSE_DIV routinely carry type ANALOG_SIGNAL — the type says how the
// signal behaves, the flag says which side of the isolation barrier it lives
// on. Everything domain-related (port pinning, block sides, wire color)
// classifies through THIS function, so flipping a net re-classifies the
// touching blocks automatically (unless they carry an explicit hvSide).
function isHvNet(n){ return n.hv != null ? !!n.hv : isHvNetType(n); }

/* ------------------------------------------------------------------
   SIGNAL CATEGORIES — every wire and arrowhead renders at the same size
   (see the markerUnits="userSpaceOnUse" markers in index.html); nets are
   told apart by color + dash pattern only, never by weight. An edge that
   bundles several nets of different categories (a bus) draws as the
   highest-priority one it carries, so the wire always surfaces its most
   safety-relevant signal.
   ------------------------------------------------------------------ */
const NET_CATEGORY_STYLE = {
  hv:        { color:'var(--sig-hv)',        dash:null,      marker:'arrowHv' },
  power:     { color:'var(--sig-power)',     dash:null,      marker:'arrowPower' },
  switching: { color:'var(--sig-switching)', dash:'9 3 2 3', marker:'arrowSwitching' },
  control:   { color:'var(--sig-control)',   dash:null,      marker:'arrowControl' },
  logic:     { color:'var(--sig-logic)',     dash:'6 3',     marker:'arrowLogic' },
  analog:    { color:'var(--sig-analog)',    dash:null,      marker:'arrowAnalog' },
  other:     { color:'var(--sig-other)',     dash:'2 3',     marker:'arrowOther' },
};
const CATEGORY_PRIORITY = ['hv','power','switching','control','logic','analog','other'];
function netCategory(n){
  if (isHvNet(n)) return 'hv';
  const t = (n.type||'').toUpperCase();
  if (t==='POWER_DISTRIBUTION' || t==='HIGH_CURRENT_PATH') return 'power';
  if (t==='SWITCHING_NODE') return 'switching';
  if (t==='CONTROL_SIGNAL') return 'control';
  if (t==='DIGITAL_LOGIC') return 'logic';
  if (t==='ANALOG_SIGNAL' || t==='SENSING_LINE' || t==='FEEDBACK_PATH' || t==='QUIET_REFERENCE') return 'analog';
  return 'other'; // NOISY_NODE, NO_CONNECT, NA
}
function edgeCategory(e){
  const cats = new Set(e.nets.map(netCategory));
  for (const c of CATEGORY_PRIORITY) if (cats.has(c)) return c;
  return 'other';
}
const EDGE_STROKE_W = 2.2, GROUP_EDGE_STROKE_W = 2.6;

/* ------------------------------------------------------------------
   LV / HV SIDE CLASSIFICATION — a block that only ever touches
   HIGH_VOLTAGE_PATH-typed nets sits on the HV side and renders red; one
   that touches both an HV-typed net and an ordinary one straddles the
   isolation barrier and renders half its normal color, half red. This is
   inferred from the net graph (the contract has no explicit domain field
   to read instead) but is overridable per node via n.hvSide, since no
   heuristic gets every real design right.
   ------------------------------------------------------------------ */
function nodeTouchingNets(nodeId){
  const nets = [];
  for (const e of S.edges) if (e.source===nodeId || e.target===nodeId) nets.push(...e.nets);
  return nets;
}
function inferNodeSide(nodeId){
  const nets = nodeTouchingNets(nodeId);
  if (!nets.length) return 'lv';
  const hv = nets.some(isHvNet), lv = nets.some(n=>!isHvNet(n));
  return hv && lv ? 'barrier' : hv ? 'hv' : 'lv';
}
function nodeSide(nodeId){
  const n = nodeById(nodeId);
  return (n && n.hvSide) || inferNodeSide(nodeId);
}
// A group is 'hv'/'lv' only if every member agrees; any mix (including a
// group that itself contains a barrier member) reads as a barrier group.
function groupSide(groupId){
  const g = groupsWithUngrouped().find(x=>x.id===groupId);
  if (!g || !g.members.length) return 'lv';
  const sides = new Set(g.members.map(nodeSide));
  return sides.size===1 ? [...sides][0] : 'barrier';
}
function safeId(s){ return String(s).replace(/[^A-Za-z0-9_-]/g,'_'); }
// A translucent red wash over whatever fill the block already has — works
// the same for IC/external/group styling without needing a bespoke "HV
// variant" of every block's color. 'barrier' clips the wash to ONE half
// (right by default, left when flipped), so the other half keeps showing
// the block's original color.
function hvOverlayMarkup(side, w, h, rx, clipId, flip){
  if (side==='hv') return `<rect width="${w}" height="${h}" rx="${rx}" fill="var(--sig-hv)" opacity=".24" style="pointer-events:none"/>`;
  if (side==='barrier') return `
      <clipPath id="${clipId}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath>
      <rect clip-path="url(#${clipId})" x="${flip?0:w/2}" y="0" width="${w/2}" height="${h}" fill="var(--sig-hv)" opacity=".3" style="pointer-events:none"/>
      <line x1="${w/2}" y1="2" x2="${w/2}" y2="${h-2}" stroke="var(--sig-hv)" stroke-width="1.3" opacity=".8" style="pointer-events:none"/>`;
  return '';
}
function hvSideTag(side, w, flip){
  if (side==='hv') return `<text x="${w-6}" y="11" text-anchor="end" font-family="var(--mono)" font-size="7.5" font-weight="700" letter-spacing=".04em" fill="var(--sig-hv)" style="pointer-events:none">HV</text>`;
  if (side!=='barrier') return '';
  const hvX = flip ? 6 : w-6, lvX = flip ? w-6 : 6;
  return `<text x="${hvX}" y="11" ${flip?'':'text-anchor="end" '}font-family="var(--mono)" font-size="7.5" font-weight="700" letter-spacing=".04em" fill="var(--sig-hv)" style="pointer-events:none">HV</text>
      <text x="${lvX}" y="11" ${flip?'text-anchor="end" ':''}font-family="var(--mono)" font-size="7.5" font-weight="700" letter-spacing=".04em" fill="var(--ink-soft)" style="pointer-events:none">LV</text>`;
}
// Which half is HV on a barrier block: right by default, left when the user
// flipped it. Stored on the group / node object itself (the implicit UNGROUPED
// bucket keeps its flag in S.ungroupedHvFlip, since its object is derived), so
// a fresh import always starts unflipped (LV left · HV right).
function groupHvFlip(gid){
  if (gid===UNGROUPED_ID) return !!S.ungroupedHvFlip;
  const g = S.groups.find(x=>x.id===gid);
  return !!(g && g.hvFlip);
}
function setGroupHvFlip(gid, on){
  if (gid===UNGROUPED_ID){ S.ungroupedHvFlip = on || undefined; return; }
  const g = S.groups.find(x=>x.id===gid);
  if (g) g.hvFlip = on || undefined;
}

// Path for the 5-segment schematic elbow produced by sidedGeometry below: out
// from the source port, vertical jog at bendX, horizontal plateau at bendY,
// second vertical jog at entryX, and a FINAL HORIZONTAL RUN into the target
// port — so the arrow always enters the block perpendicular to its edge.
function elbowPathD(g){
  return `M ${g.x1} ${g.y1} L ${g.bendX} ${g.y1} L ${g.bendX} ${g.bendY} L ${g.entryX} ${g.bendY} L ${g.entryX} ${g.y2} L ${g.x2} ${g.y2}`;
}

/* ------------------------------------------------------------------
   OBSTACLE-AVOIDING ROUTING — a wire must never pass in front of a block:
   at a glance there's no way to tell whether it terminates there or just
   runs behind it, which is exactly the ambiguity this is meant to prevent.
   This nudges the plateau (bendY) and both vertical jogs (bendX, entryX) of
   the 5-segment elbow off of every OTHER currently-visible block, by a fixed
   clearance. It runs on every render — including live drags — so a manual
   reroute that lands on a block is nudged clear automatically instead of
   being allowed to overlap; the two short stubs at y1/y2 are left alone,
   since they sit inside the column gap and are clear in practice.
   ------------------------------------------------------------------ */
const ROUTE_CLEARANCE = GRID/2;   // padded corridors sit half-grid off the block edges
function padForRoute(r){ return { x1:r.x-ROUTE_CLEARANCE, y1:r.y-ROUTE_CLEARANCE, x2:r.x+r.w+ROUTE_CLEARANCE, y2:r.y+r.h+ROUTE_CLEARANCE }; }
function hSegHitsRect(y, xa, xb, r){
  const lo=Math.min(xa,xb), hi=Math.max(xa,xb), p=padForRoute(r);
  return y>p.y1 && y<p.y2 && hi>p.x1 && lo<p.x2;
}
function vSegHitsRect(x, ya, yb, r){
  const lo=Math.min(ya,yb), hi=Math.max(ya,yb), p=padForRoute(r);
  return x>p.x1 && x<p.x2 && hi>p.y1 && lo<p.y2;
}
// Nudges `preferred` to the nearer edge of whatever obstacle it clips, then
// re-checks (a crowded diagram can stack more than one obstacle in the same
// corridor) — bails out if it starts bouncing between two obstacles rather
// than looping forever.
function clearHorizontal(preferred, xa, xb, obstacles){
  let y = preferred; const seen = new Set();
  for (let i=0;i<12;i++){
    const hit = obstacles.find(r=>hSegHitsRect(y, xa, xb, r));
    if (!hit) return y;
    const p = padForRoute(hit);
    const cand = Math.abs(p.y1-preferred) <= Math.abs(p.y2-preferred) ? p.y1 : p.y2;
    const key = Math.round(cand);
    if (seen.has(key)) return cand;
    seen.add(key); y = cand;
  }
  return y;
}
function clearVertical(preferred, ya, yb, obstacles){
  let x = preferred; const seen = new Set();
  for (let i=0;i<12;i++){
    const hit = obstacles.find(r=>vSegHitsRect(x, ya, yb, r));
    if (!hit) return x;
    const p = padForRoute(hit);
    const cand = Math.abs(p.x1-preferred) <= Math.abs(p.x2-preferred) ? p.x1 : p.x2;
    const key = Math.round(cand);
    if (seen.has(key)) return cand;
    seen.add(key); x = cand;
  }
  return x;
}
// dirIn=+1 → the wire enters the target travelling rightward (left edge), so the
// entry jog must stay left of it; dirIn=-1 → mirrored (enters the right edge).
function clampEntryX(entryX, x2, dirIn){
  return (dirIn==null||dirIn>0) ? Math.min(entryX, x2-12) : Math.max(entryX, x2+12);
}
function routeAroundObstacles(geo, obstacles, dirIn){
  if (!obstacles.length) return geo;
  const { x1,y1,x2,y2 } = geo;
  let { bendX, bendY, entryX } = geo;
  for (let pass=0; pass<4; pass++){
    const nBendY = clearHorizontal(bendY, bendX, entryX, obstacles);
    const nBendX = clearVertical(bendX, y1, nBendY, obstacles);
    const nEntryX = clearVertical(entryX, nBendY, y2, obstacles);
    if (nBendY===bendY && nBendX===bendX && nEntryX===entryX){ bendY=nBendY; bendX=nBendX; entryX=nEntryX; break; }
    bendX=nBendX; bendY=nBendY; entryX=nEntryX;
  }
  entryX = clampEntryX(entryX, x2, dirIn);
  return { x1,y1,x2,y2,bendX,bendY,entryX, dirIn };
}

// The 5-segment elbow (see elbowPathD), with each end free to leave/enter from
// EITHER edge of its block — which is what makes a port draggable to the other
// side. p1/p2 are {x,y,sign} anchors from groupPortAnchor.
function sidedGeometry(p1, p2, route){
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const out1 = x1 + p1.sign*GROUP_PORT_STUB;   // just outside the source edge
  const in1  = x2 - p2.sign*GROUP_PORT_STUB;   // approach point outside the target edge
  let bendX = (route && route.x!=null) ? route.x : (out1+in1)/2;
  if (route==null || route.x==null) bendX = p1.sign>0 ? Math.max(bendX, out1) : Math.min(bendX, out1);
  const bendY = (route && route.y!=null) ? route.y : y2;
  let entryX = (route && route.x2!=null) ? route.x2
             : (Math.abs(bendY-y2)<0.5 ? bendX : in1);
  entryX = clampEntryX(entryX, x2, p2.sign);
  return { x1, y1, x2, y2, bendX, bendY, entryX, dirIn:p2.sign };
}
/* ------------------------------------------------------------------
   LATTICE ROUTER (top-level group edges only)
   The nudge heuristic above can only push a segment to the nearest free
   side, which in a crowded sheet still leaves wires lying across blocks.
   This instead searches the orthogonal lattice formed by the inflated
   obstacle boundaries with Dijkstra + a turn penalty, so a route that
   clears EVERY block is found when one exists — and one always does,
   since the corridor above/below all blocks is part of the lattice.
   Deterministic: fixed lattice order, ties broken on the state key.
   ------------------------------------------------------------------ */
const TURN_COST = 55;
class MinHeap{
  constructor(){ this.a=[]; }
  get size(){ return this.a.length; }
  push(v){ const a=this.a; a.push(v); let i=a.length-1;
    while(i>0){ const p=(i-1)>>1; if (this.lt(a[i],a[p])){ [a[i],a[p]]=[a[p],a[i]]; i=p; } else break; } }
  pop(){ const a=this.a, top=a[0], last=a.pop();
    if (a.length){ a[0]=last; let i=0;
      for(;;){ const l=2*i+1, r=l+1; let m=i;
        if (l<a.length && this.lt(a[l],a[m])) m=l;
        if (r<a.length && this.lt(a[r],a[m])) m=r;
        if (m===i) break; [a[i],a[m]]=[a[m],a[i]]; i=m; } }
    return top; }
  lt(x,y){ return x.g<y.g || (x.g===y.g && x.k<y.k); } // integer tie-break keeps it deterministic
}
/* ------------------------------------------------------------------
   ROUTING LANES
   Wires are routed on the lattice of obstacle boundaries, so without
   help every wire squeezing through the same gap picks the SAME line
   and they end up drawn on top of each other. A lane shifts the whole
   candidate set further away from the blocks (left/top boundaries move
   left/up, right/bottom move right/down) by lane*LANE_PITCH, which
   keeps every line obstacle-free by construction and guarantees that
   two wires on different lanes never share a corridor.
   Lanes are assigned once, when the sheet is laid out (import /
   Auto-layout), and then FROZEN per connection — so later edits still
   only disturb the wires actually constrained by them.
   ------------------------------------------------------------------ */
// LANE_PITCH must NOT divide (or be divided by) GRID: with every block snapped
// to the grid, block-edge distances are all multiples of GRID, so lane offsets
// that are multiples of GRID make different lanes generate the SAME candidate
// lines and the separation collapses. 14 gives lanes 0..6 seven distinct
// residues mod 24. Lane verticals therefore run off-grid — deliberately: only
// PORTS and WAYPOINTS need to be on the grid for straight runs to meet them,
// and both are (start/goal rows are part of every lattice).
// One routing lane per GRID cell: parallel nets keep exactly the same
// distance as two ports of a block, horizontally and vertically alike. The
// corridors (portalMargin, lanesFrom) scale with this, so the sheet simply
// grows where the wider spacing needs the room.
const LANE_PITCH = 14, LANE_MAX = 6;
// STRUCTURED nets — fan ladders, portal slots, port rows — keep one full
// GRID between parallel wires (the block-port pitch), horizontally and
// vertically; the free router's internal detour machinery stays on the fine
// LANE_PITCH, where a coarser pitch would funnel every detour onto the same
// few grid lines.
const FAN_PITCH = GRID;
function laneOf(src, tgt, dom){ return S.groupEdgeLanes[groupEdgeRouteKey(src,tgt,dom)] || 0; }

/* ------------------------------------------------------------------
   EXIT-FAN NESTING — deterministic lane assignment. Wires that leave a
   block (or portal) side horizontally and then turn vertically form a
   FAN: to never cross each other they must turn in NESTED order —
   turning UP, the topmost port turns first (closest to the block) and
   each next one a LANE_PITCH further out; turning DOWN, the bottom
   port turns first. Same rule mirrored at the ARRIVING end. This
   dominates net length: fan wires keep a constant offset between
   them instead of crossing.
   Ends sharing the same edge X (aligned columns, a whole portal
   column) fan TOGETHER, so the nesting holds across stacked blocks
   too. Straight runs and same-direction pairs cost nothing extra.
   ------------------------------------------------------------------ */
function fanAssignLanes(items){
  // items: [{ key, pa, pb, cap }] → Map key → {a,b} per-end lanes
  const lanes = new Map(items.map(it=>[it.key, { a:0, b:0 }]));
  const groups = new Map();
  const addEnd = (it, end) => {
    const p = end==='a' ? it.pa : it.pb, o = end==='a' ? it.pb : it.pa;
    if (Math.abs(o.y - p.y) < 0.5) return;            // straight — no bend at this end
    const vd = o.y < p.y ? -1 : 1;                    // -1: the wire heads UP from here
    const gk = `${Math.round(p.x)}|${p.sign}`;        // one pool per edge X and exit direction
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push({ it, end, vd, y:p.y, lo:Math.min(p.y,o.y), hi:Math.max(p.y,o.y) });
  };
  for (const it of items){ addEnd(it, 'a'); addEnd(it, 'b'); }
  for (const ends of groups.values()){
    // Nesting priority first (up-turners top-first, then down-turners
    // bottom-first), then GREEDY interval colouring: an end takes the
    // smallest lane whose already-placed verticals don't overlap its own
    // span. Non-overlapping wires share lanes (no length wasted); the ones
    // that would cross get exactly one LANE_PITCH of offset each — nested,
    // never crossed. Up- and down-turners share the pool so their verticals
    // never end up collinear either.
    ends.sort((p,q)=>(p.vd - q.vd) || (p.vd < 0 ? p.y - q.y : q.y - p.y)
      || String(p.it.key).localeCompare(String(q.it.key)));
    const placed = [];
    for (const m of ends){
      let r = 0;
      while (placed.some(x=>x.rank===r && x.lo < m.hi && x.hi > m.lo)) r++;
      const cap = m.it.cap != null ? m.it.cap : LANE_MAX;
      r = Math.min(r, cap);
      placed.push({ rank:r, lo:m.lo, hi:m.hi });
      lanes.get(m.it.key)[m.end] = r;
    }
  }
  return lanes;
}
function latticeRoute(start, goal, obstacles, lane){
  const pads = obstacles.map(padForRoute);
  const d = (lane||0)*LANE_PITCH;
  const xs = [...new Set([start.x, goal.x, ...pads.flatMap(p=>[p.x1-d, p.x2+d])])].sort((a,b)=>a-b);
  const ys = [...new Set([start.y, goal.y, ...pads.flatMap(p=>[p.y1-d, p.y2+d])])].sort((a,b)=>a-b);
  const si=xs.indexOf(start.x), sj=ys.indexOf(start.y), gi=xs.indexOf(goal.x), gj=ys.indexOf(goal.y);
  if (si<0||sj<0||gi<0||gj<0) return null;
  // Flat arrays + inlined tests: this runs on the order of 10^4 times per edge,
  // so the closure-per-obstacle version of the same check dominated the render.
  const n = pads.length;
  const px1=new Float64Array(n), py1=new Float64Array(n), px2=new Float64Array(n), py2=new Float64Array(n);
  for (let k=0;k<n;k++){ const p=pads[k]; px1[k]=p.x1; py1[k]=p.y1; px2[k]=p.x2; py2[k]=p.y2; }
  const hFree = (y,xa,xb)=>{
    const lo = xa<xb?xa:xb, hi = xa<xb?xb:xa;
    for (let k=0;k<n;k++) if (y>py1[k] && y<py2[k] && hi>px1[k] && lo<px2[k]) return false;
    return true;
  };
  const vFree = (x,ya,yb)=>{
    const lo = ya<yb?ya:yb, hi = ya<yb?yb:ya;
    for (let k=0;k<n;k++) if (x>px1[k] && x<px2[k] && hi>py1[k] && lo<py2[k]) return false;
    return true;
  };
  // State = (cell, incoming direction), encoded as an integer so dist/prev can be
  // typed arrays: string keys in a Map dominated the cost at ~10^4 states/edge.
  const XN=xs.length, YN=ys.length, CN=XN*YN, SN=4*CN;
  const DX=[1,-1,0,0], DY=[0,0,1,-1];
  const dist=new Float64Array(SN).fill(Infinity), prev=new Int32Array(SN).fill(-1);
  const heap=new MinHeap();
  const sCell=sj*XN+si, gCell=gj*XN+gi;
  for (let d=0;d<4;d++){ const k=d*CN+sCell; dist[k]=0; heap.push({ g:0, k }); }
  let goalK=-1;
  while (heap.size){
    const cur=heap.pop(), k=cur.k;
    if (cur.g>dist[k]) continue;
    const cell=k%CN, d0=(k-cell)/CN, i=cell%XN, j=(cell-i)/XN;
    if (cell===gCell){ goalK=k; break; }
    for (let d=0;d<4;d++){
      const ni=i+DX[d], nj=j+DY[d];
      if (ni<0||nj<0||ni>=XN||nj>=YN) continue;
      const x1=xs[i], y1=ys[j], x2=xs[ni], y2=ys[nj];
      if (DY[d]===0 ? !hFree(y1,x1,x2) : !vFree(x1,y1,y2)) continue;
      const step = DY[d]===0 ? Math.abs(x2-x1) : Math.abs(y2-y1);
      const g = cur.g + step + (d!==d0?TURN_COST:0);
      const nk = d*CN + nj*XN + ni;
      if (g < dist[nk]){ dist[nk]=g; prev[nk]=k; heap.push({ g, k:nk }); }
    }
  }
  if (goalK<0) return null;
  const pts=[];
  for (let k=goalK; k>=0; k=prev[k]){
    const cell=k%CN, i=cell%XN, j=(cell-i)/XN;
    const x=xs[i], y=ys[j];
    if (!pts.length || pts[0][0]!==x || pts[0][1]!==y) pts.unshift([x,y]);
  }
  return pts;
}
function simplifyPts(pts){
  const out=[pts[0]];
  for (let i=1;i<pts.length-1;i++){
    const a=out[out.length-1], b=pts[i], c=pts[i+1];
    if ((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1])) continue;
    out.push(b);
  }
  if (pts.length>1) out.push(pts[pts.length-1]);
  return out;
}
// Stitching two lattice halves at a shared point can leave an out-and-back
// spur at the junction (…A→B→A…): simplifyPts alone misses it because the
// collapse creates duplicate points that shield the next collinear triple.
// Iterating dedupe+simplify to a fixed point removes every such spur — a wire
// must never draw a segment and immediately retrace it (the "antenna").
function cleanPts(pts){
  let p = pts, n;
  do {
    n = p.length;
    p = p.filter((q,i)=> i===0 || Math.abs(q[0]-p[i-1][0])>0.01 || Math.abs(q[1]-p[i-1][1])>0.01);
    if (p.length>1) p = simplifyPts(p);
  } while (p.length < n);
  return p;
}
function ptsPathD(pts){ return 'M '+pts.map(p=>p[0]+' '+p[1]).join(' L '); }
function ptsBadgePos(pts){
  let best=-1,bx=0,by=0;
  for (let i=0;i<pts.length-1;i++){
    const len=Math.abs(pts[i+1][0]-pts[i][0])+Math.abs(pts[i+1][1]-pts[i][1]);
    if (len>best){ best=len; bx=(pts[i][0]+pts[i+1][0])/2; by=(pts[i][1]+pts[i+1][1])/2; }
  }
  return { x:bx, y:by };
}
// Full point list for a group edge: a manual route keeps the draggable 5-segment
// elbow (the user's explicit choice wins); otherwise the lattice route, which
// treats EVERY block as an obstacle — including the edge's own endpoints, so a
// port dragged to the far side is routed around its own block automatically.
function ptsClearOf(pts, obstacles){
  for (let i=0;i<pts.length-1;i++){
    const [x1,y1]=pts[i], [x2,y2]=pts[i+1];
    if (y1===y2){ if (obstacles.some(r=>hSegHitsRect(y1,x1,x2,r))) return false; }
    else if (x1===x2){ if (obstacles.some(r=>vSegHitsRect(x1,y1,y2,r))) return false; }
  }
  return true;
}
// A wire lies "behind" a block only when it overlaps the block's OPEN INTERIOR.
// (The padded test used to steer the router would also flag the legitimate stub
// leaving a port, which starts exactly on its own block's edge.)
function ptsInsideAnyBlock(pts, obstacles){
  for (let i=0;i<pts.length-1;i++){
    const [x1,y1]=pts[i], [x2,y2]=pts[i+1];
    const lo=Math.min(x1,x2), hi=Math.max(x1,x2), loY=Math.min(y1,y2), hiY=Math.max(y1,y2);
    for (const r of obstacles){
      if (Math.abs(y1-y2)<0.5 && y1>r.y && y1<r.y+r.h && hi>r.x && lo<r.x+r.w) return true;
      if (Math.abs(x1-x2)<0.5 && x1>r.x && x1<r.x+r.w && hiY>r.y && loY<r.y+r.h) return true;
    }
  }
  return false;
}
// Re-glue: a polyline whose PORTS moved (a dragged FROM/TO column, a dragged
// block, a reordered portal slot) follows them by STRETCHING — the
// port-adjacent segment slides on its own axis and its perpendicular
// neighbour absorbs the difference, exactly like a segment drag. The rest of
// the shape — all the routing work done before — is untouched. Returns null
// when stretching can't do it legally (shape would cross a block, the stub
// would leave the port backwards, a straight wire needs a new bend): those
// are real constraint breaks, and the caller re-routes as before.
function reglueEnd(pts, target, atStart){
  const p = pts.map(q=>q.slice());
  if (p.length < 2) return null;
  const i0 = atStart ? 0 : p.length-1;
  const i1 = atStart ? 1 : p.length-2;
  const horiz = Math.abs(p[i0][1]-p[i1][1]) < 0.01;
  if (p.length === 2){
    // straight port-to-port run: it can only stretch along its own axis
    if (horiz){ if (Math.abs(target.y-p[i0][1])>0.01) return null; }
    else      { if (Math.abs(target.x-p[i0][0])>0.01) return null; }
    p[i0] = [target.x, target.y];
    return p;
  }
  if (horiz) p[i1] = [p[i1][0], target.y];   // stub slides in Y, next vertical stretches
  else       p[i1] = [target.x, p[i1][1]];   // (vertical stub: the mirror case)
  p[i0] = [target.x, target.y];
  return p;
}
function reglueRoute(pts, pa, pb, obstacles){
  const moved = (q,a)=>Math.abs(q[0]-a.x)>0.01 || Math.abs(q[1]-a.y)>0.01;
  let p = pts;
  if (moved(p[0], pa)){ p = reglueEnd(p, pa, true); if (!p) return null; }
  if (moved(p[p.length-1], pb)){ p = reglueEnd(p, pb, false); if (!p) return null; }
  p = simplifyPts(p);
  if (p.length < 2) return null;
  // the stubs must still LEAVE/ENTER their ports in the direction of travel
  const dxA = p[1][0]-p[0][0];
  if (Math.abs(dxA)>0.01 && Math.abs(p[1][1]-p[0][1])<0.01 && dxA*pa.sign < 0) return null;
  const n = p.length, dxB = p[n-1][0]-p[n-2][0];
  if (Math.abs(dxB)>0.01 && Math.abs(p[n-1][1]-p[n-2][1])<0.01 && dxB*pb.sign < 0) return null;
  if (ptsInsideAnyBlock(p, obstacles)) return null;
  return p;
}
// A lane may be a plain number (both ends share it — the historical form) or
// {a,b} with an independent lane per END: `a` sizes the stub at pa, `b` at
// pb. Per-end lanes are what the exit-fan nesting rule needs — each wire of
// a fan turns at its own distance (see fanAssignLanes).
function laneEnd(lane, end){
  if (lane && typeof lane==='object') return (end==='a' ? lane.a : lane.b) || 0;
  return lane || 0;
}
function laneSig(lane){ return laneEnd(lane,'a')+':'+laneEnd(lane,'b'); }
// Ladder PHASE of one exit: wires of the SAME fan sit exactly one GRID apart
// (the block-port pitch), but every exit's whole ladder is shifted by a small
// deterministic offset (0/6/12/18px, hashed from the exit position). On a
// grid-quantized sheet, unphased GRID ladders from different blocks land on
// the same few columns and pile up collinear; the phases keep each exit's
// bus on its own lines while preserving the constant in-bus spacing.
function fanPhase(p){
  const h = Math.abs((Math.round(p.x)*31 + (p.sign>0 ? 17 : 5)) % 4);
  return h * (GRID/4);
}
// Distance from the port to the wire's k-th turn line at that end.
function fanStub(p, k){ return GROUP_PORT_STUB + fanPhase(p) + k*FAN_PITCH; }
function groupEdgePts(pa, pb, route, obstacles, lane){
  const geo = sidedGeometry(pa, pb, null);
  const ptsOf = g => simplifyPts([[g.x1,g.y1],[g.bendX,g.y1],[g.bendX,g.bendY],
    [g.entryX,g.bendY],[g.entryX,g.y2],[g.x2,g.y2]]);
  const anchorsAt = l => {
    return { start: { x: pa.x + pa.sign*fanStub(pa, laneEnd(l,'a')), y: pa.y },
             goal:  { x: pb.x - pb.sign*fanStub(pb, laneEnd(l,'b')), y: pb.y } };
  };
  // A lane offset can push the stub endpoints inside a NEIGHBOURING block
  // (backward edges in tight sheets), which makes the lattice unreachable.
  // Stepping the lanes down until a route exists keeps the wire legal — far
  // better than falling back to an elbow that lies across a block.
  const tryLanes = fn => {
    let a = laneEnd(lane,'a'), b = laneEnd(lane,'b');
    for (;;){
      const l = { a, b };
      const r = fn(l, anchorsAt(l));
      if (r) return r;
      if (a===0 && b===0) return null;
      a = Math.max(0, a-1); b = Math.max(0, b-1);
    }
  };

  // A segment-translated wire stores its FULL polyline (route.pts): it is
  // honoured verbatim while its endpoints still meet the ports and no block has
  // landed on it. When either stops being true (a port dragged elsewhere, a
  // block dropped on the shape) it degrades to a waypoint at its longest
  // segment, so the router finds a legal shape again instead of drawing a lie.
  if (route && route.pts && route.pts.length>=2){
    const mp = route.pts;
    const endsOk =
      Math.abs(mp[0][0]-pa.x)<0.01 && Math.abs(mp[0][1]-pa.y)<0.01 &&
      Math.abs(mp[mp.length-1][0]-pb.x)<0.01 && Math.abs(mp[mp.length-1][1]-pb.y)<0.01;
    if (endsOk && !ptsInsideAnyBlock(mp, obstacles)) return { pts: mp, geo, manual:true };
    if (!endsOk){
      // The ports moved out from under the stored shape (dragged FROM/TO
      // column, dragged block, reordered slot): stretch it after them and
      // keep every hand-placed bend. Only a real constraint break re-routes.
      const glued = reglueRoute(mp, pa, pb, obstacles);
      if (glued) return { pts: glued, geo, manual:true };
    }
    const at = ptsBadgePos(mp);
    route = { wx: at.x, wy: at.y };
  }
  // FAN-DISCIPLINED shape first: the wire executes its 90° turn at ITS OWN
  // lane distance from the exit — the nesting order made real geometry. With
  // every wire of a fan turning right where its lane says, fans nest with a
  // LANE_PITCH offset and never cross; a free-form router would put the
  // vertical anywhere between the blocks and mix the disciplines. Only a
  // shape that would cross a block falls through to the lattice.
  if (!route && Math.abs(pa.y-pb.y)>=0.5){
    const bxA = pa.x + pa.sign*fanStub(pa, laneEnd(lane,'a'));
    const bxB = pb.x - pb.sign*fanStub(pb, laneEnd(lane,'b'));
    for (const bx of [bxA, bxB]){
      if ((bx - pa.x)*pa.sign < GROUP_PORT_STUB-0.5) continue;   // must still LEAVE the port
      if ((pb.x - bx)*pb.sign < GROUP_PORT_STUB-0.5) continue;   // and ENTER the far one head-on
      const z = [[pa.x,pa.y],[bx,pa.y],[bx,pb.y],[pb.x,pb.y]];
      if (ptsClearOf(z, obstacles)) return { pts: simplifyPts(z), geo, manual:false };
    }
  }
  // A waypoint route ({wx,wy}) reroutes the wire THROUGH that point: the router
  // finds a legal path in and out of it. Used when a stored shape has to be
  // abandoned (above) — a point has far more legal positions than a shape.
  if (route && route.wx!=null && route.wy!=null){
    const wp = { x: route.wx, y: route.wy };
    const manual = tryLanes((l,{start,goal})=>{
      const ln = Math.max(laneEnd(l,'a'), laneEnd(l,'b'));   // lattice wants a number
      const inPart  = latticeRoute(start, wp, obstacles, ln);
      const outPart = latticeRoute(wp, goal, obstacles, ln);
      return (inPart && outPart)
        ? { pts: cleanPts([[pa.x,pa.y], ...inPart, ...outPart.slice(1), [pb.x,pb.y]]), geo, manual:true }
        : null;
    });
    if (manual) return manual;
    // waypoint unreachable (fully enclosed) — fall through to the auto route
  }
  const plain = ptsOf(geo);
  if (ptsClearOf(plain, obstacles)) return { pts: plain, geo, manual:false };
  const auto = tryLanes((l,{start,goal})=>{
    const mid = latticeRoute(start, goal, obstacles, Math.max(laneEnd(l,'a'), laneEnd(l,'b')));
    return mid ? { pts: cleanPts([[pa.x,pa.y], ...mid, [pb.x,pb.y]]), geo, manual:false } : null;
  });
  return auto || { pts: plain, geo, manual:false };
}
// Drag handles over an auto-routed polyline: first vertical → route.x, last
// vertical → route.x2, horizontal runs → route.y. Grabbing any of them converts
// the wire to a manual elbow seeded by that drag.
// Handles carry the segment's own midpoint, so a drag can keep the coordinate it
// isn't changing (a vertical segment moves in X and keeps its Y, and vice versa).
function polyHandleMarkup(pts, eid, extraAttrs, w){
  const segs=[];
  for (let i=0;i<pts.length-1;i++)
    segs.push({ x1:pts[i][0], y1:pts[i][1], x2:pts[i+1][0], y2:pts[i+1][1], vert:pts[i][0]===pts[i+1][0] });
  let html='';
  segs.forEach((s,i)=>{
    if (s.x1===s.x2 && s.y1===s.y2) return;
    // Port-adjacent horizontals are draggable too: pulling one vertically
    // SPLITS it — a minimal stub stays pinned to the port and a new vertical
    // jog absorbs the offset (see translateWireSegment).
    const mx=(s.x1+s.x2)/2, my=(s.y1+s.y2)/2;
    html += `
      <path class="${s.vert?'seg-v':'seg-h'}" data-eid="${esc(eid)}" data-axis="${s.vert?'v':'h'}" data-mx="${mx}" data-my="${my}"${extraAttrs} d="M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}" fill="none" stroke="transparent" stroke-width="${w}" style="cursor:${s.vert?'ew-resize':'ns-resize'}"/>`;
  });
  return html;
}

// Push a single point out of any block it landed in, continuing in the direction
// of travel (so dragging a wire into a block makes it hop to the far side). A
// POINT has far more legal positions than a full-width segment, which is why the
// waypoint model below keeps dragging responsive everywhere on the sheet.
// Segment-translation drag: the grabbed run moves along its own axis and its
// perpendicular neighbours stretch/shrink to absorb the change — NO new
// segments appear while there is free room (the router is not involved).
// The one case where geometry NEEDS an extra bend: dragging a PORT-ADJACENT
// horizontal vertically. The port pins its end's Y, so the segment SPLITS —
// a minimal stub (GROUP_PORT_STUB) stays at the port and a new vertical jog
// absorbs the Y offset; the two horizontal parts still add up to the original
// run. A block in the way makes the segment hop past it (snapPast*), and if a
// stretched neighbour would land on a block the hop continues — the wire
// never comes to rest across a block. Returns the new polyline, or null when
// no legal position exists in the drag direction.
function translateWireSegment(pts, i, axis, want, obstacles, dir){
  const first = pts[0], last = pts[pts.length-1];
  const atStart = i===0, atEnd = i+1===pts.length-1;
  const s = Math.sign(pts[i+1][0]-pts[i][0]) || Math.sign(pts[i+1][1]-pts[i][1]) || 1;
  // For a port-adjacent horizontal the collision span EXCLUDES the stub that
  // stays behind at the port: the moved run stops one grid short of the block,
  // so the port's own block can never be hit — its footprint limits the drag
  // in X only, never in Y. Other blocks along the span still cause hops.
  const spanA = axis==='v' ? pts[i][1] : (atStart ? first[0] + s*GROUP_PORT_STUB : pts[i][0]);
  const spanB = axis==='v' ? pts[i+1][1] : (atEnd ? last[0] - s*GROUP_PORT_STUB : pts[i+1][0]);
  let v = axis==='v' ? snapPastVertical(want, spanA, spanB, obstacles, dir)
                     : snapPastHorizontal(want, spanA, spanB, obstacles, dir);
  // The port stubs at both ends must survive (≥12px, same direction), so the
  // arrow keeps entering the block perpendicular to its edge.
  if (axis==='v'){
    if (i===1) v = pts[1][0] >= first[0] ? Math.max(v, first[0]+12) : Math.min(v, first[0]-12);
    if (i+1===pts.length-2) v = pts[pts.length-2][0] >= last[0] ? Math.max(v, last[0]+12) : Math.min(v, last[0]-12);
  }
  const shapeFor = nv => {
    if (axis==='v'){
      const out = pts.map(p=>p.slice());
      out[i][0]=nv; out[i+1][0]=nv;
      return simplifyPts(out);
    }
    // horizontal drag — split at whichever end is pinned to a port
    const res = [];
    for (let k=0;k<=i;k++) res.push(pts[k].slice());
    if (atStart){
      res.push([first[0]+s*GROUP_PORT_STUB, first[1]]);
      res.push([first[0]+s*GROUP_PORT_STUB, nv]);
    } else res[res.length-1][1]=nv;
    if (atEnd){
      res.push([last[0]-s*GROUP_PORT_STUB, nv]);
      res.push([last[0]-s*GROUP_PORT_STUB, last[1]]);
      res.push(last.slice());
    } else {
      const q = pts[i+1].slice(); q[1]=nv; res.push(q);
      for (let k=i+2;k<pts.length;k++) res.push(pts[k].slice());
    }
    return simplifyPts(res);
  };
  for (let hop=0; hop<12; hop++){
    const simp = shapeFor(v);
    if (!ptsInsideAnyBlock(simp, obstacles)) return simp;
    const next = axis==='v' ? snapPastVertical(v + (dir||1)*GRID, spanA, spanB, obstacles, dir||1)
                            : snapPastHorizontal(v + (dir||1)*GRID, spanA, spanB, obstacles, dir||1);
    if (next===v) return null;
    v = next;
  }
  return null;
}

function pointOutOfBlocks(x, y, obstacles, axis, dir){
  let v = axis==='v' ? x : y;
  for (let i=0;i<12;i++){
    const px = axis==='v' ? v : x, py = axis==='v' ? y : v;
    const hit = obstacles.find(r=>{ const p=padForRoute(r); return px>p.x1 && px<p.x2 && py>p.y1 && py<p.y2; });
    if (!hit) return v;
    const p = padForRoute(hit);
    const lo = axis==='v' ? p.x1 : p.y1, hi = axis==='v' ? p.x2 : p.y2;
    v = dir<0 ? lo : dir>0 ? hi : (Math.abs(lo-v)<=Math.abs(hi-v) ? lo : hi);
  }
  return v;
}

/* ------------------------------------------------------------------
   INCREMENTAL ROUTE CACHE
   Moving one block must not disturb wires it doesn't constrain. A route
   depends on its two port anchors, its manual override, and — crucially —
   only on the obstacles that lie within the corridor the wire actually
   occupies. So the cache signature lists exactly those, which means:
     · a block moving far away  → not in the signature → wire untouched
     · a block moving INTO the corridor → signature changes → re-routed
     · a block leaving the corridor → signature changes → re-routed (the
       detour it forced may no longer be needed)
   Keyed by src→tgt (stable across renders, unlike the derived edge id).
   The router is deterministic, so a cache hit and a recomputation always
   agree — the cache only decides whether we pay for the search.
   ------------------------------------------------------------------ */
const _routeCache = new Map();
function routeBBox(pts){
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for (const [x,y] of pts){ if(x<x1)x1=x; if(x>x2)x2=x; if(y<y1)y1=y; if(y>y2)y2=y; }
  const m = ROUTE_CLEARANCE+1;
  return { x1:x1-m, y1:y1-m, x2:x2+m, y2:y2+m };
}
// Freshness signature of a cached route: EVERY obstacle, not just the ones
// near the chosen path. The router picks its shape looking at the whole
// sheet — an obstacle that forced a detour sits between the ports but outside
// the detour's own bbox, and it must still invalidate the entry when it
// moves away, or a cold render (undo, session reload) would legitimately
// pick the short way and disagree with the screen. The cache is a pure memo:
// same inputs, same route — never a source of truth.
function corridorObstacleSig(bbox, obstacles){
  const parts=[];
  for (const r of obstacles) parts.push(r.id+':'+r.x+','+r.y+','+r.w+','+r.h);
  return parts.sort().join('|');
}
function groupEdgePtsCached(key, pa, pb, route, obstacles, lane){
  const anchorSig = `${pa.x},${pa.y},${pa.sign};${pb.x},${pb.y},${pb.sign};${route?JSON.stringify(route):''};L${laneSig(lane)}`;
  const hit = _routeCache.get(key);
  if (hit && hit.anchorSig===anchorSig && hit.obsSig===corridorObstacleSig(hit.bbox, obstacles)) return hit;
  const res = groupEdgePts(pa, pb, route, obstacles, lane);
  const bbox = routeBBox(res.pts);
  const entry = { ...res, anchorSig, bbox, obsSig: corridorObstacleSig(bbox, obstacles) };
  _routeCache.set(key, entry);
  return entry;
}

// Directional collision snap, used while a wire segment is being dragged: if the
// wanted coordinate would leave the segment lying across a block, it is pushed
// PAST that block in the direction of travel — so pulling a wire into a block
// makes it hop to the far side instead of resting behind it. dir=0 (no motion
// yet) falls back to the nearer edge. Loop-capped like the nudge helpers, since
// a crowded corridor can stack several blocks.
function snapPastVertical(want, ya, yb, obstacles, dir){
  let x = want;
  for (let i=0;i<12;i++){
    const hit = obstacles.find(r=>vSegHitsRect(x, ya, yb, r));
    if (!hit) return x;
    const p = padForRoute(hit);
    x = dir<0 ? p.x1 : dir>0 ? p.x2 : (Math.abs(p.x1-want)<=Math.abs(p.x2-want) ? p.x1 : p.x2);
  }
  return x;
}
function snapPastHorizontal(want, xa, xb, obstacles, dir){
  let y = want;
  for (let i=0;i<12;i++){
    const hit = obstacles.find(r=>hSegHitsRect(y, xa, xb, r));
    if (!hit) return y;
    const p = padForRoute(hit);
    y = dir<0 ? p.y1 : dir>0 ? p.y2 : (Math.abs(p.y1-want)<=Math.abs(p.y2-want) ? p.y1 : p.y2);
  }
  return y;
}

// Straight runs of a drawn wire, as {vertical?, position, from, to} — the unit
// two wires can end up sharing.
function routeSegments(pts){
  const out=[];
  for (let i=0;i<pts.length-1;i++){
    const [x1,y1]=pts[i], [x2,y2]=pts[i+1];
    if (Math.abs(x1-x2)<0.5 && Math.abs(y1-y2)>=0.5) out.push({ v:true,  at:x1, a:Math.min(y1,y2), b:Math.max(y1,y2) });
    else if (Math.abs(y1-y2)<0.5 && Math.abs(x1-x2)>=0.5) out.push({ v:false, at:y1, a:Math.min(x1,x2), b:Math.max(x1,x2) });
  }
  return out;
}
const OVERLAP_MIN = 8; // shorter shared stretches than this read as a crossing, not a bundle
function overlapLength(pts, placed){
  let total=0;
  for (const s of routeSegments(pts)) for (const p of placed){
    if (s.v!==p.v || Math.abs(s.at-p.at)>0.5) continue;
    const ov = Math.min(s.b,p.b) - Math.max(s.a,p.a);
    if (ov > OVERLAP_MIN) total += ov;
  }
  return total;
}
// Assign each connection the lowest lane that doesn't lie on top of the wires
// already placed. Deterministic: connections are processed in key order and the
// first lane with zero overlap wins (otherwise the least-overlapping one).
// Wires may still CROSS each other — that's fine and unavoidable; what this
// removes is wires running along the same line so you can't tell them apart.
function assignRouteLanes(){
  S.groupEdgeLanes = {};
  invalidateGroupPorts();
  const obstacles = visibleGroups().map(g=>groupBlockRect(g.id));
  const edges = computeGroupEdges().slice()
    .sort((a,b)=>groupEdgeRouteKey(a.source,a.target,a.dom).localeCompare(groupEdgeRouteKey(b.source,b.target,b.dom)));
  const items = edges.map(e=>({ key: groupEdgeRouteKey(e.source,e.target,e.dom),
    pa: groupPortAnchor(e.source, e.source, e.target, 'out', e.dom),
    pb: groupPortAnchor(e.target, e.source, e.target, 'in', e.dom),
    manual: groupEdgeRouteOf(e.source,e.target,e.dom) }));
  assignLanesNested(items, obstacles);
}

/* ============================================================
   UNDO / REDO
   The session serialiser already captures everything a user edit can
   touch, so history is a stack of those snapshots. commit() is called
   BEFORE a change, so undo returns to the state just before it; a drag
   commits once at pointerdown rather than on every pointermove, so one
   gesture is one undo step. 60 steps is far past what anyone reaches
   for in a session and costs a few MB at most for a sheet this size.
   ============================================================ */
const HISTORY_MAX = 60;
const HIST = { past: [], future: [] };
function snapshotState(){ return JSON.stringify(buildSessionJSON()); }
function commit(snapshot){
  HIST.past.push(snapshot != null ? snapshot : snapshotState());
  if (HIST.past.length > HISTORY_MAX) HIST.past.shift();
  HIST.future.length = 0;          // a new edit discards the redo branch
  updateHistoryButtons();
}
// Drags snapshot at pointerdown but only enter the history once the gesture
// actually changes something — a plain click (select) must not eat an undo step.
function commitGesture(d){
  if (!d || d.committed) return;
  d.committed = true;
  commit(d.snap);
}
function restoreState(json){
  const s = JSON.parse(json);
  S.meta = s.meta || S.meta;
  S.nodes = s.nodes || [];
  S.edges = s.edges || [];
  S.groups = s.groups || [];
  S.groupPos = s.groupPos || {};
  S.groupEdgeRoutes = s.groupEdgeRoutes || {};
  S.groupPortSides = s.groupPortSides || {};
  S.groupPortOrder = s.groupPortOrder || {};
  S.groupEdgeLanes = s.groupEdgeLanes || {};
  S.portalOffsets = s.portalOffsets || {};
  S.portalOrder = s.portalOrder || {};
  S.portalSeq = s.portalSeq || {};
  S.portalAnchor = s.portalAnchor || {};
  S.ungroupedHvFlip = s.ungroupedHvFlip || undefined;
  S.openGroup = s.openGroup ?? null;
  S.edgeSeq = Math.max(0, ...S.edges.map(e=>+String(e.id).replace(/^e/,'')||0)) + 1;
  S.sel = null; S.link = null; S.traceNet = null;
  invalidateGroupPorts(); _routeCache.clear();
  render();
}
function undo(){
  if (!HIST.past.length) return;
  HIST.future.push(snapshotState());
  restoreState(HIST.past.pop());
  updateHistoryButtons();
}
function redo(){
  if (!HIST.future.length) return;
  HIST.past.push(snapshotState());
  restoreState(HIST.future.pop());
  updateHistoryButtons();
}
function updateHistoryButtons(){
  const u = $('btnUndo'), r = $('btnRedo');
  if (u){ u.disabled = !HIST.past.length; u.title = `Undo (Ctrl+Z)${HIST.past.length?' — '+HIST.past.length+' step'+(HIST.past.length>1?'s':''):''}`; }
  if (r){ r.disabled = !HIST.future.length; r.title = `Redo (Ctrl+Y)${HIST.future.length?' — '+HIST.future.length+' step'+(HIST.future.length>1?'s':''):''}`; }
}

function memberObstacleRects(members){ return members.map(n=>({ id:n.id, x:n.x, y:n.y, w:n.w, h:n.h })); }
// The full obstacle set of the open group's sheet — member blocks AND portal
// boxes — so waypoint drags can't park a wire across either.
function openGroupObstacleRects(){ return drillSheet().obstacles; }

let lastPorts = null; // {linkY} of the most recently rendered view (used by renderLink)

/* ------------------------------------------------------------------
   NET TRACE — while a connection is selected, clicking one of its nets
   in the inspector lights every wire and block where THAT net
   intervenes, end to end in the current view (portals included, since
   the net continues through them). Strictly that one net: nothing it
   does not touch ever lights up.
   ------------------------------------------------------------------ */
// The trace only lives while the selected connection still carries the net.
function validateTrace(){
  if (!S.traceNet) return;
  let nets = null;
  if (S.sel && S.sel.type==='edge'){
    const e = S.edges.find(x=>x.id===S.sel.id); nets = e && e.nets;
  } else if (S.sel && S.sel.type==='groupEdge'){
    const e = computeGroupEdges().find(x=>x.id===S.sel.id); nets = e && e.nets;
  } else if (S.sel && S.sel.type==='portal'){
    const it = portalItemOfKey(S.sel.id);
    nets = it && it.nets;
  }
  if (!nets || !nets.some(n=>n.name===S.traceNet)) S.traceNet = null;
}
// Everything the traced net touches: drawable edges carrying it, the nodes at
// their ends, and the groups those nodes live in (for the top-level view).
function traceSets(){
  if (!S.traceNet) return null;
  const name = S.traceNet;
  const edgeIds = new Set(), nodes = new Set();
  for (const e of diagramEdges(S.edges)){
    if (!e.nets.some(n=>n.name===name)) continue;
    edgeIds.add(e.id);
    nodes.add(e.source); nodes.add(e.target);
  }
  const idx = nodeGroupIndex();
  const groups = new Set([...nodes].map(id=>idx.get(id)).filter(Boolean));
  return { name, edgeIds, nodes, groups };
}
// Inspector net cards double as trace toggles — clicks on their inner buttons
// (delete, LV|HV chip) keep doing their own job.
function wireTraceCards(container){
  container.querySelectorAll('[data-tracenet]').forEach(card=>card.onclick=ev=>{
    if (ev.target.closest('button')) return;
    const name = card.dataset.tracenet;
    S.traceNet = S.traceNet===name ? null : name;
    render();
  });
}

function render(){
  // Block heights depend on the port index, so drop the memo before drawing:
  // render() runs after every state change, which keeps the cache honest.
  invalidateGroupPorts();
  validateTrace();
  viewport.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);

  if (isTopLevel()) renderTopLevel(); else renderDrillDown();

  renderLink();
  renderBreadcrumb();
  renderInspector();
  renderStatus();
  renderEmptyState();
  updateHistoryButtons();
  updateViewTools();
  $('projTitle').textContent = S.meta.title || 'Untitled system';
}
// The blank sheet's "+" card: visible exactly while there is nothing to draw
// (fresh page, or every block deleted). It sits over the canvas, so it also
// hides the zoom/fit controls' reason to exist — those stay, harmless.
function renderEmptyState(){
  const el = $('emptyState');
  if (el) el.hidden = S.nodes.length > 0;
}

// Boundary-crossing edges for the currently open group, keyed by the neighboring
// group so multiple node-level edges to/from the same group collapse into one
// portal stub. Reuses computeGroupEdges() — same aggregation as the top level.
function openGroupPortals(){
  if (isTopLevel()) return { incoming:[], outgoing:[] };
  const incoming = computeGroupEdges().filter(e=>e.target===S.openGroup)
    .sort((a,b)=>a.source.localeCompare(b.source) || a.dom.localeCompare(b.dom));
  const outgoing = computeGroupEdges().filter(e=>e.source===S.openGroup)
    .sort((a,b)=>a.target.localeCompare(b.target) || a.dom.localeCompare(b.dom));
  return { incoming, outgoing };
}
// A portal's key names its direction, neighbour AND insulation domain
// ('in:GID' / 'in:GID#hv') — the LV and HV halves of a boundary are separate
// portals. This resolves a key back to its group edge.
function portalKeyOf(dir, item){ return dir+':'+(dir==='in'?item.source:item.target)+(item.dom==='hv'?'#hv':''); }
function portalItemOfKey(key){
  const [dir, rest] = key.split(/:(.+)/);
  const hv = rest.endsWith('#hv');
  const otherId = hv ? rest.slice(0, -3) : rest;
  const { incoming, outgoing } = openGroupPortals();
  return (dir==='in'?incoming:outgoing).find(x=>
    (dir==='in'?x.source:x.target)===otherId && (x.dom==='hv')===hv);
}

// PORTAL_MARGIN is the BASE routing corridor between a portal column and the
// member blocks. The real corridor scales with how many boundary wires have to
// live in it — one LANE_PITCH per wire (see portalMargin) — and grows further
// when the user drags the column outward (portalOffsetOf).
// Grid-native boxes: y and height are GRID multiples, and every exit slot
// lands EXACTLY on the FINE lattice (GRID/2 — one of the zoom subdivision
// pitches), so a wire running on the grid meets its slot dead-on, no
// last-minute jog to absorb a fractional offset. The half-GRID slot pitch
// keeps the compact fan the boxes always had.
const PORTAL_W = 156, PORTAL_H = 2*GRID, PORTAL_VGAP = GRID, PORTAL_MARGIN = 130;
// Portal exit slots use the SAME pitch as a block's port rows (one GRID), so
// the net-to-net distance stays constant from a portal all the way into a
// block — the boxes grow one row per wire to hold it.
const PORTAL_SLOT = GRID;
// The REAL minimum block-to-column distance: a parked column only moves when
// a block gets closer than this to its boxes (the corridor margin above is a
// routing-room default, not a hard keep-out).
const PORTAL_MIN_CLEAR = 2*GRID;
// Slot j's Y for a portal: the fan is centred in the box and snapped so every
// slot is an exact multiple of PORTAL_SLOT (box y is a GRID multiple).
function portalSlotY(p, j){
  const k = p.unders.length;
  const s0 = p.r.y + Math.round((p.r.h/2 - (k-1)*PORTAL_SLOT/2)/PORTAL_SLOT)*PORTAL_SLOT;
  return s0 + j*PORTAL_SLOT;
}
// Every boundary wire on a side may need its own vertical line in the corridor.
function portalMargin(wireCount){ return PORTAL_MARGIN + wireCount*FAN_PITCH; }
// Manual column displacement, both axes free. The stored offset is a WISH:
// the render-time clamp in drillSheet (colXFor) floors the column at the
// design minimum distance to the blocks (PORTAL_MIN_CLEAR), whichever side
// it is approached from. The routing-corridor margin only sets the default
// import-time position — the user may park a column well inside it.
function portalOffsetOf(gid, dir){ return (S.portalOffsets[gid]||{})[dir] || { dx:0, dy:0 }; }
function setPortalOffset(gid, dir, dx, dy){
  const o = S.portalOffsets[gid] || (S.portalOffsets[gid] = {});
  o[dir] = { dx, dy };
}
// First movement of a FROM/TO column drag: pin the column's auto-routed
// boundary wires to their CURRENT shapes (as persisted manual routes). From
// then on the move just STRETCHES them after the ports (reglueRoute) instead
// of re-routing — all the routing on the sheet survives the drag, exactly
// like block drags on hand-routed wires. Undo removes the pins again, and a
// per-connection "Reset routing" or re-route only happens when the stretched
// shape would actually break a constraint.
function pinPortalWires(dir){
  const { specs, obstacles } = drillSheet();
  for (const s of specs){
    if (s.kind !== dir) continue;
    const e = S.edges.find(x=>x.id===s.e.id);
    if (!e || nodeEdgeRouteOf(e)) continue;   // hand-routed wires are already pinned
    const r = groupEdgePtsCached(NODE_ROUTE_PREFIX+s.e.id, s.pa, s.pb,
      undefined, obstacles, S.groupEdgeLanes[nodeEdgeLaneKey(s.e)] || 0);
    e.route = { pts: r.pts.map(p=>p.slice()), sheet: S.openGroup };
  }
}
// Move a whole FROM/TO box one step up or down within its column (the
// inspector's Move up / Move down buttons) — stored in the same S.portalSeq
// order the auto-layout writes, so the user can override its choice freely.
function movePortalBoxStep(key, delta){
  const dir = key.split(':')[0];
  const col = drillSheet().portals.filter(p=>p.dir===dir);
  const keys = col.map(p=>p.key);
  const i = keys.indexOf(key), j = i+delta;
  if (i<0 || j<0 || j>=keys.length) return false;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  (S.portalSeq[S.openGroup] || (S.portalSeq[S.openGroup]={}))[dir] = keys;
  return true;
}
// Vertical reorder of one portal's exit slots — the portal twin of
// moveNodePortToRow: drag a slot's ring up/down and the other slots shuffle.
function movePortalSlotToRow(key, eid, newRow){
  const p = drillSheet().portals.find(x=>x.key===key);
  if (!p) return false;
  const ids = p.unders.map(e=>e.id);
  const from = ids.indexOf(eid);
  if (from < 0) return false;
  const to = Math.max(0, Math.min(ids.length-1, newRow));
  if (from === to) return false;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  (S.portalOrder[S.openGroup] || (S.portalOrder[S.openGroup] = {}))[key] = ids;
  return true;
}
// `w` widens the box beyond the base PORTAL_W when a neighbour's title needs
// the room (drillSheet passes ONE shared width for every portal of the open
// group, so the two columns stay visually uniform and no title is truncated).
function portalRect(i, count, dir, memberBounds, margin, off, w){
  const W = w != null ? w : PORTAL_W;
  const m = margin != null ? margin : PORTAL_MARGIN;
  const o = off || { dx:0, dy:0 };
  const pitch = PORTAL_H + PORTAL_VGAP;
  const y = snapG((memberBounds.minY+memberBounds.maxY)/2 - ((count-1)*pitch)/2 + i*pitch - PORTAL_H/2 + o.dy);
  const x = (dir==='in' ? memberBounds.minX - m - W : memberBounds.maxX + m) + o.dx;
  return { x, y, w:W, h:PORTAL_H };
}
// Shared portal width for one sheet: room for the longest neighbour title at
// 12px mono — text inset (14) + gap + count badge zone on the flat end (38),
// never below the base width, rounded up onto the grid.
function portalWidthFor(labels){
  let need = PORTAL_W;
  for (const l of labels) need = Math.max(need, 14 + textWidth(l, 12, true) + 38);
  return Math.ceil(need/GRID)*GRID;
}

function memberBounds(members){
  return {
    minX: Math.min(...members.map(n=>n.x)), maxX: Math.max(...members.map(n=>n.x+n.w)),
    minY: Math.min(...members.map(n=>n.y)), maxY: Math.max(...members.map(n=>n.y+n.h))
  };
}

// Drill-down: only the open group's member nodes and their internal edges, plus
// left/right portal stubs for edges that cross the group boundary (read-only —
// open the OTHER group to edit those). The wires between member blocks obey the
// SAME rules as the system level: port anchors with stubs, the lattice router
// with every member block as an obstacle, routing lanes so no two wires share a
// corridor, waypoint drags, and the incremental route cache.
const NODE_ROUTE_PREFIX = 'n|';
function nodeEdgeLaneKey(e){ return 'n:'+e.source+'→'+e.target; }
// A manual node-edge route is either a full polyline {pts} (segment drags) or
// a single waypoint {wx,wy}, the same forms the top level stores (kept on the
// edge itself so history/serialisation carry it for free); legacy {x,y,x2}
// elbow patches from older sessions simply mean "auto".
// A drill route is SHEET geometry: a boundary connection is drawn in BOTH
// ends' drill sheets, but a shape authored in one is meaningless in the other
// (the portal end sits somewhere else entirely). Routes carry the sheet they
// were authored in (route.sheet) and are honoured only there; an untagged
// route from an older session is adopted by the one sheet whose anchors it
// still matches exactly (adoptSheetRoute, from drillSheet) and treated as
// "auto" everywhere else — re-routing cleanly beats gluing a foreign shape
// into dangling spurs.
function nodeEdgeRouteOf(e){
  const r = e.route;
  if (!r || r.sheet !== S.openGroup) return undefined;
  if (r.pts && r.pts.length>=2) return r;
  return (r.wx!=null && r.wy!=null) ? r : undefined;
}
// Legacy migration: tag an untagged stored route with the open sheet iff its
// endpoints coincide with the wire's CURRENT anchors here — proof it was
// authored on this sheet and nothing moved since. An INTERNAL wire only ever
// exists on its own group's sheet, so its route is adopted unconditionally
// (waypoints included — reglue/degrade handle any drift as before).
function adoptSheetRoute(e, pa, pb, internal){
  const r = e.route;
  if (!r || r.sheet != null) return;
  if (internal){ r.sheet = S.openGroup; return; }
  if (!r.pts || r.pts.length<2) return;
  const m = r.pts, q = m[m.length-1];
  if (Math.abs(m[0][0]-pa.x)<0.75 && Math.abs(m[0][1]-pa.y)<0.75 &&
      Math.abs(q[0]-pb.x)<0.75 && Math.abs(q[1]-pb.y)<0.75) r.sheet = S.openGroup;
}
// Fallback lane cap for boundary wires when a spec carries no computed
// per-side cap (drillSheet derives the real one from its corridor width).
const BOUNDARY_LANE_MAX = 3;
// Everything the drill-down needs to draw and route one group's sheet, built in
// ONE place so rendering and lane assignment can't disagree: member blocks,
// FROM/TO portal boxes, per-connection port slots (internal and boundary
// connections share the same slot system on the member edges), the obstacle set
// (members AND portal boxes), and one wire spec per drawn connection.
// Boundary wires run portal ↔ member block, so every arrow is attached to the
// exact block it feeds: the portal box aggregates the neighbouring group, the
// wires say WHAT connects to WHAT.
// The portal columns are anchored to the member bounds FROZEN the first time
// the group is drawn: dragging blocks around never tows the columns along.
// The one exception is real crowding — a block within PORTAL_MIN_CLEAR of a
// column shoves it out of the way, and it comes back once the space frees up
// (see colXFor in drillSheet).
// The frozen anchor is real state (S.portalAnchor), so it survives undo,
// Save session and a browser reload — the columns come back exactly where
// they were left. In-group Auto-layout re-anchors them.
function resetPortalBase(){ if (S.openGroup) delete S.portalAnchor[S.openGroup]; }
function drillSheet(){
  const g = groupsWithUngrouped().find(x=>x.id===S.openGroup);
  const memberSet = new Set(g ? g.members : []);
  const members = S.nodes.filter(n=>memberSet.has(n.id));
  // Block dimensions follow the port rows (a connection added since the last
  // measure grows the block) — refresh before anything is placed or routed.
  updateMemberDims(members);
  const liveB = members.length ? memberBounds(members) : { minX:0,maxX:0,minY:0,maxY:0 };
  // Freeze the whole anchor on first sight of this group. The columns PARK
  // against the frozen extents; only a real crowding (below) moves them.
  const anchor = (S.openGroup && S.portalAnchor[S.openGroup])
    || (S.openGroup ? (S.portalAnchor[S.openGroup] = { ...liveB }) : liveB);
  if (anchor.minX == null){ anchor.minX = liveB.minX; anchor.maxX = liveB.maxX; }  // sessions saved when only Y was frozen
  const bounds = { minX:anchor.minX, maxX:anchor.maxX, minY:anchor.minY, maxY:anchor.maxY };
  // A column's X: parked at its corridor offset from the FROZEN anchor plus
  // whatever the user dragged it (off.dx, either direction) — but NEVER
  // closer than PORTAL_MIN_CLEAR to the blocks. That one clamp makes the
  // design minimum symmetric: drag the column against the blocks and it
  // stops there; push a block against the column and it is shoved away,
  // returning to its spot as the space frees up. The corridor margin is the
  // IMPORT-TIME default only, not a constraint — the user may park a column
  // well inside it, down to the design minimum.
  const colXFor = (dir, margin, off, w) => dir==='in'
    ? Math.min(anchor.minX - margin + off.dx, liveB.minX - PORTAL_MIN_CLEAR) - w
    : Math.max(anchor.maxX + margin + off.dx, liveB.maxX + PORTAL_MIN_CLEAR);
  const all = diagramEdges(S.edges);
  const internal = all.filter(e=>memberSet.has(e.source) && memberSet.has(e.target));
  // Auto-layout stores a per-column box order (barycentric, top to bottom);
  // boxes it doesn't know keep the alphabetical derivation order after it.
  const seq = S.portalSeq[S.openGroup] || {};
  const applySeq = (list, dir) => {
    const o = seq[dir];
    if (!o || !o.length) return list;
    const rank = new Map(o.map((k,i)=>[k,i]));
    return list.slice().sort((a,b)=>
      (rank.has(portalKeyOf(dir,a))?rank.get(portalKeyOf(dir,a)):1e9) -
      (rank.has(portalKeyOf(dir,b))?rank.get(portalKeyOf(dir,b)):1e9));
  };
  const raw = openGroupPortals();
  const incoming = applySeq(raw.incoming, 'in'), outgoing = applySeq(raw.outgoing, 'out');
  const idx = nodeGroupIndex();
  // Corridor width per side scales with the number of boundary wires that have
  // to route through it, then grows further if the column was dragged outward.
  const inCount  = all.filter(e=>memberSet.has(e.target) && !memberSet.has(e.source)).length;
  const outCount = all.filter(e=>memberSet.has(e.source) && !memberSet.has(e.target)).length;
  const inMargin = portalMargin(inCount), outMargin = portalMargin(outCount);
  const inOff = portalOffsetOf(S.openGroup,'in'), outOff = portalOffsetOf(S.openGroup,'out');
  // ONE width for every portal on this sheet — sized so the longest neighbour
  // title fits untruncated, and both columns stay uniform.
  const titleOf = id => { const gg = groupsWithUngrouped().find(x=>x.id===id); return gg ? gg.title : id; };
  const portalW = portalWidthFor([
    ...incoming.map(x=>titleOf(x.source)), ...outgoing.map(x=>titleOf(x.target))]);
  const inX = colXFor('in', inMargin, inOff, portalW);
  const outX = colXFor('out', outMargin, outOff, portalW);
  // How many routing lanes fit in each corridor (stub + lane offset must land
  // inside it) — measured from the column's REAL position, so dragging it
  // outward buys extra lanes and parking it near the blocks sheds them.
  const lanesFrom = gap =>
    Math.max(0, Math.min(LANE_MAX, Math.floor((gap - GROUP_PORT_STUB - ROUTE_CLEARANCE - GRID*0.75)/FAN_PITCH)));
  const inMaxLane = lanesFrom(liveB.minX - (inX + portalW)), outMaxLane = lanesFrom(outX - liveB.maxX);
  // A portal's wires, in slot order: alphabetical by default, but a manual
  // order (slot-handle drag, S.portalOrder) wins; edges it doesn't know append.
  // The LV and HV portals of one boundary split the wires between them: a
  // node edge rides the HV portal when ANY of its nets is HV-domain (the
  // conservative choice for the rare mixed edge).
  const edgeHv = e => e.nets.some(isHvNet);
  const undersFor = (dir, item) => {
    const wantHv = item.dom==='hv';
    const base = dir==='in'
      ? all.filter(e=>memberSet.has(e.target) && idx.get(e.source)===item.source && edgeHv(e)===wantHv)
          .sort((a,b)=>(a.target+'|'+a.id).localeCompare(b.target+'|'+b.id))
      : all.filter(e=>memberSet.has(e.source) && idx.get(e.target)===item.target && edgeHv(e)===wantHv)
          .sort((a,b)=>(a.source+'|'+a.id).localeCompare(b.source+'|'+b.id));
    const ord = (S.portalOrder[S.openGroup]||{})[portalKeyOf(dir, item)];
    if (!ord) return base;
    const pos = new Map(ord.map((id,i)=>[id,i]));
    return base.slice().sort((a,b)=>(pos.has(a.id)?pos.get(a.id):1e9)-(pos.has(b.id)?pos.get(b.id):1e9));
  };
  // Boxes stack cumulatively: one GRID row per wire (min PORTAL_H), a GRID
  // gap between boxes, the whole column centred on the (frozen) member
  // midline and snapped onto the lattice — every slot on a grid line, at the
  // block-port pitch.
  const heightFor = k => Math.max(PORTAL_H, (k+1)*GRID);
  const buildColumn = (list, dir, x, off, maxLane) => {
    const col = list.map(item => ({ item, dir, maxLane,
      key: portalKeyOf(dir, item),
      unders: undersFor(dir, item) }));
    const total = col.reduce((a,p)=>a+heightFor(p.unders.length),0) + Math.max(0,col.length-1)*PORTAL_VGAP;
    let y = snapG((bounds.minY+bounds.maxY)/2 - total/2 + off.dy);
    for (const p of col){ p.r = { x, y, w:portalW, h:heightFor(p.unders.length) }; y += p.r.h + PORTAL_VGAP; }
    return col;
  };
  const portals = [
    ...buildColumn(incoming, 'in', inX, inOff, inMaxLane),
    ...buildColumn(outgoing, 'out', outX, outOff, outMaxLane)
  ];
  const obstacles = [ ...memberObstacleRects(members),
    ...portals.map(p=>({ id:'portal:'+p.key, x:p.r.x, y:p.r.y, w:p.r.w, h:p.r.h })) ];
  const specs = [];
  // Every wire end on a member block attaches at that connection's own port row
  // (nodePortAnchor) — dedicated, GRID-spaced, side-switchable — exactly the
  // top-level norm. Only the portal ends use the portal's fanned exit slots.
  for (const e of internal){
    if (!nodeById(e.source) || !nodeById(e.target)) continue;
    const spec = { e, kind:'internal',
      pa: nodePortAnchor(e.source, e.source, e.target, 'out'),
      pb: nodePortAnchor(e.target, e.source, e.target, 'in') };
    adoptSheetRoute(e, spec.pa, spec.pb, true);
    specs.push(spec);
  }
  for (const p of portals) p.unders.forEach((e,j)=>{
    // Each wire gets its own exit slot on the portal edge — half-GRID pitch,
    // dead on the fine lattice, so two wires never leave the portal on the
    // same line and none needs a jog to reach an off-grid slot.
    const slotY = portalSlotY(p, j);
    let spec;
    if (p.dir==='in'){
      if (!nodeById(e.target)) return;
      spec = { e, kind:'in', portalKey:p.key, maxLane:p.maxLane,
        pa:{ x:p.r.x+p.r.w, y:slotY, sign:1 },
        pb: nodePortAnchor(e.target, e.source, e.target, 'in') };
    } else {
      if (!nodeById(e.source)) return;
      spec = { e, kind:'out', portalKey:p.key, maxLane:p.maxLane,
        pa: nodePortAnchor(e.source, e.source, e.target, 'out'),
        pb:{ x:p.r.x, y:slotY, sign:1 } };
    }
    adoptSheetRoute(e, spec.pa, spec.pb, false);
    specs.push(spec);
  });
  // "+" slot under each portal column (or at the column's natural spot when
  // it is empty) — clicking it creates a new FROM/TO boundary connection.
  const addSlotFor = dir => {
    const col = portals.filter(p=>p.dir===dir);
    if (col.length){
      const last = col.reduce((a,p)=>p.r.y>a.r.y?p:a, col[0]);
      return { cx: last.r.x + last.r.w/2, cy: last.r.y + last.r.h + 26 };
    }
    const r = portalRect(0, 1, dir, bounds, dir==='in'?inMargin:outMargin, dir==='in'?inOff:outOff, portalW);
    return { cx: r.x + r.w/2, cy: r.y + r.h/2 };
  };
  const portalAdd = { in: addSlotFor('in'), out: addSlotFor('out') };
  return { g, members, bounds, live: liveB, inMargin, outMargin, portals, obstacles, specs, portalAdd };
}
// Same corridor-separation rule as assignRouteLanes, for every wire drawn in the
// open group — internal AND boundary. Lanes live in S.groupEdgeLanes under
// 'n:'-prefixed keys, assigned lazily on first paint of the group (and
// re-assigned by the in-group Auto-layout).
function assignNodeEdgeLanes(){
  const { specs, obstacles } = drillSheet();
  const ordered = specs.slice().sort((a,b)=>String(a.e.id).localeCompare(String(b.e.id)));
  const items = ordered.map(s=>({ key: nodeEdgeLaneKey(s.e), pa: s.pa, pb: s.pb,
    cap: s.kind==='internal' ? LANE_MAX : (s.maxLane ?? BOUNDARY_LANE_MAX),
    manual: nodeEdgeRouteOf(s.e) }));
  assignLanesNested(items, obstacles);
}

// Proper H×V intersections between a candidate polyline and the segments
// already placed — the lane search treats every crossing as far worse than
// any amount of extra wire length (its cost only breaks ties beneath it).
function countCrossings(pts, placed){
  let n = 0;
  for (const s of routeSegments(pts)) for (const p of placed){
    if (s.v === p.v) continue;
    const [v,h] = s.v ? [s,p] : [p,s];
    if (v.at > h.a+0.5 && v.at < h.b-0.5 && h.at > v.a+0.5 && h.at < v.b-0.5) n++;
  }
  return n;
}
// The lane assigner both levels share. The exit-fan nesting lanes are the
// FIRST candidate — the rule dominates net length, so fan wires keep their
// constant offsets and never cross. A wire only leaves its fan lanes when
// they are physically untenable: the route would lie across a block, would
// CROSS more already-placed wires than another lane, or would run collinear
// over one. Priorities, strictly ordered: clear of blocks ≫ fewest crossings
// ≫ no collinear overlap ≫ (implicitly, via candidate order) shortest wire.
function assignLanesNested(items, obstacles){
  const fan = fanAssignLanes(items);
  const placed = [];
  for (const it of items){
    const base = fan.get(it.key);
    const cap = it.cap != null ? it.cap : LANE_MAX;
    const cands = [ { a:base.a, b:base.b } ];
    if (!it.manual){   // hand-routed wires don't use the lattice — one pass for the score books
      for (let k=1; k<=cap; k++) cands.push({ a:Math.min(base.a+k,cap), b:Math.min(base.b+k,cap) });
      for (let l=0; l<=cap; l++) cands.push({ a:l, b:l });
    }
    let best = cands[0], bestScore = Infinity, bestPts = null;
    for (const c of cands){
      const r = groupEdgePts(it.pa, it.pb, it.manual, obstacles, c);
      // Strict priorities: clear of blocks ≫ no collinear overlap (wires on
      // top of each other are unreadable) ≫ fewest crossings ≫ shortest
      // wire (implicit in the candidate order — the fan lanes come first).
      const ov = overlapLength(r.pts, placed);
      const score = (ptsInsideAnyBlock(r.pts, obstacles) ? 1e9 : 0)
        + (ov > 0 ? 1e6 + ov : 0)
        + countCrossings(r.pts, placed) * 100;
      if (score < bestScore){ best = c; bestScore = score; bestPts = r.pts; }
      if (score === 0) break;
    }
    S.groupEdgeLanes[it.key] = best;
    if (bestPts) placed.push(...routeSegments(bestPts));
  }
  _routeCache.clear();
}
function renderDrillDown(){
  const g = groupsWithUngrouped().find(x=>x.id===S.openGroup);
  const memberSet = new Set(g ? g.members : []);
  const sheet = drillSheet();
  const { members, portals, obstacles, specs } = sheet;
  renderGrid(true);   // same adaptive lattice as the top level — in-group drags snap to it too (snapView)
  lastPorts = null;   // no crosshair link port in the drill-down (removed by design)
  // Undo (or an old session) can leave wires without a lane — reassign, once.
  if (specs.some(s=>S.groupEdgeLanes[nodeEdgeLaneKey(s.e)]==null)) assignNodeEdgeLanes();
  // Forget routes for connections that no longer exist (deletions, regrouping).
  const live = new Set(specs.map(s=>NODE_ROUTE_PREFIX+s.e.id));
  for (const k of _routeCache.keys()) if (k.startsWith(NODE_ROUTE_PREFIX) && !live.has(k)) _routeCache.delete(k);
  const wireOf = s => groupEdgePtsCached(NODE_ROUTE_PREFIX+s.e.id, s.pa, s.pb,
    nodeEdgeRouteOf(s.e), obstacles, S.groupEdgeLanes[nodeEdgeLaneKey(s.e)] || 0);
  const trace = traceSets();

  const edgeMarkup = specs.filter(s=>s.kind==='internal').map(s=>{
    const e = s.e;
    const cat = edgeCategory(e), style = NET_CATEGORY_STYLE[cat];
    const selected = S.sel && S.sel.type==='edge' && S.sel.id===e.id;
    const traced = trace && trace.edgeIds.has(e.id);
    const { pts } = wireOf(s);
    const mid = ptsBadgePos(pts);
    const w = selected ? EDGE_STROKE_W+1.6 : traced ? EDGE_STROKE_W+1.2 : EDGE_STROKE_W;
    const d = ptsPathD(pts);
    return `<g class="edge${trace&&!traced&&!selected?' dim':''}" data-eid="${esc(e.id)}">
      <path d="${d}" fill="none" stroke="transparent" stroke-width="14" style="cursor:pointer"/>
      <path d="${d}" fill="none" stroke="${style.color}" stroke-width="${w}"
        stroke-dasharray="${selected?'none':(style.dash||'none')}"
        ${(selected||traced)?'filter="drop-shadow(0 0 3px var(--probe))"':''}
        marker-end="url(#${style.marker})" style="pointer-events:none"/>
      <circle cx="${s.pa.x}" cy="${s.pa.y}" r="4" fill="${style.color}" style="pointer-events:none"/>
      ${polyHandleMarkup(pts, e.id, '', 12)}
      <g class="netbadge" data-eid="${esc(e.id)}" style="cursor:pointer">
        <rect x="${mid.x-13}" y="${mid.y-9}" width="26" height="16" rx="8"
          fill="${selected?'var(--probe)':'var(--paper)'}" stroke="${style.color}" stroke-width="1.2"/>
        <text x="${mid.x}" y="${mid.y+3.5}" text-anchor="middle"
          font-family="var(--mono)" font-size="9.5" fill="var(--ink)">${e.nets.length}</text>
      </g>
    </g>`;
  }).join('');

  // Boundary wires are drawn inside their portal's <g>, so clicking a wire
  // selects the portal — still read-only as a connection (open the OTHER group
  // to edit its nets), but its segments drag like any other wire and its port
  // on the member block moves like any other port. Each wire keeps its own
  // category color, dash and net-count badge, and its arrow lands ON the member
  // block it feeds.
  const portalMarkup = portals.map(p=>{
    const selected = S.sel && S.sel.type==='portal' && S.sel.id===p.key;
    const tracedBox = trace && p.unders.some(e=>trace.edgeIds.has(e.id));
    const boxDim = trace && !tracedBox && !selected;
    const wires = specs.filter(s=>s.portalKey===p.key).map(s=>{
      const style = NET_CATEGORY_STYLE[edgeCategory(s.e)];
      // The badge selects its OWN underlying connection (nets in the
      // inspector), so a wire in a bundle is inspectable on its own.
      const selEdge = S.sel && S.sel.type==='edge' && S.sel.id===s.e.id;
      const traced = trace && trace.edgeIds.has(s.e.id);
      const { pts } = wireOf(s);
      const mid = ptsBadgePos(pts);
      const d = ptsPathD(pts);
      const w = (selected || selEdge || traced) ? EDGE_STROKE_W+1.2 : EDGE_STROKE_W;
      // A lit portal can still carry OTHER nets — those wires recede on their
      // own (the whole box only dims when nothing under it carries the net).
      const wireDim = trace && !traced && !selEdge && !boxDim;
      // The slot's ring on the portal edge doubles as its reorder handle:
      // drag it up/down to shuffle this wire among the portal's slots.
      const sp = s.kind==='in' ? s.pa : s.pb;
      return `${wireDim?'<g class="dim">':''}
      <path d="${d}" fill="none" stroke="transparent" stroke-width="12"/>
      <path d="${d}" fill="none" stroke="${style.color}" stroke-width="${w}"
        stroke-dasharray="${selEdge?'none':(style.dash||'none')}"
        ${(selEdge||traced)?'filter="drop-shadow(0 0 3px var(--probe))"':''}
        marker-end="url(#${style.marker})" style="pointer-events:none"/>
      <circle cx="${s.pa.x}" cy="${s.pa.y}" r="3.6" fill="${style.color}" style="pointer-events:none"/>
      ${polyHandleMarkup(pts, s.e.id, '', 12)}
      <g class="slothandle" data-portal="${esc(p.key)}" data-eid="${esc(s.e.id)}" style="cursor:ns-resize">
        <circle cx="${sp.x}" cy="${sp.y}" r="10" fill="transparent"/>
        <circle cx="${sp.x}" cy="${sp.y}" r="5" fill="var(--paper)" stroke="${style.color}" stroke-width="1.6" style="pointer-events:none"/>
        <title>Drag up/down to reorder this wire on the portal</title>
      </g>
      <g class="netbadge" data-eid="${esc(s.e.id)}" style="cursor:pointer">
        <rect x="${mid.x-13}" y="${mid.y-9}" width="26" height="16" rx="8"
          fill="${selEdge?'var(--probe)':'var(--paper)'}" stroke="${style.color}" stroke-width="1.2"/>
        <text x="${mid.x}" y="${mid.y+3.5}" text-anchor="middle"
          font-family="var(--mono)" font-size="9.5" fill="var(--ink)">${s.e.nets.length}</text>
      </g>${wireDim?'</g>':''}`;
    }).join('');
    return portalMarkupFor(p, selected, wires, tracedBox, boxDim);
  }).join('');

  // The "+" buttons under the FROM and TO columns — create a new boundary
  // connection (openAddPortalModal picks the far group, the blocks and a net).
  const addBtnMarkup = ['in','out'].map(dir=>{
    const s = sheet.portalAdd[dir];
    return `<g class="portaladd${trace?' dim':''}" data-dir="${dir}" style="cursor:pointer">
      <circle cx="${s.cx}" cy="${s.cy}" r="12" fill="var(--vellum)" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="${s.cx}" y="${s.cy+4.5}" text-anchor="middle" font-family="var(--mono)" font-size="15" font-weight="600" fill="var(--ink-soft)" style="pointer-events:none">+</text>
      <title>${dir==='in'?'Add a FROM connection (incoming)':'Add a TO connection (outgoing)'}</title>
    </g>`;
  }).join('');

  edgesG.innerHTML = edgeMarkup + portalMarkup + addBtnMarkup;

  // Per-edge category for the port-row tick/badge colors, over ALL drawn wires.
  const catOf = new Map(specs.map(s=>[s.e.id, edgeCategory(s.e)]));
  nodesG.innerHTML = members.map(n=>{
    const selected = S.sel && S.sel.type==='node' && S.sel.id===n.id;
    const tracedN = trace && trace.nodes.has(n.id);
    const side = nodeSide(n.id);
    const sepY = nodeHeaderBottom(n);
    // Port zone — top-level norm: one row per connection, a lead-in tick from
    // the block edge, the draggable net-count badge (drag sideways to switch
    // edge, up/down to reorder) and the direction + other block in writing.
    const portRows = nodePortRowsFor(n.id).map(r=>{
      const color = NET_CATEGORY_STYLE[catOf.get(r.eid) || 'other'].color;
      const y = nodePortRowY(n, r.row);
      const left = r.side==='left', bw = 26, bh = 16;
      const bx = left ? GROUP_PAD_X : n.w-GROUP_PAD_X-bw;
      const lx = left ? bx+bw+6 : bx-6;
      const selEdge = S.sel && (S.sel.type==='edge' || S.sel.type==='portal') && (S.sel.id===r.eid ||
        (S.sel.type==='portal' && specs.some(s=>s.e.id===r.eid && s.portalKey===S.sel.id)));
      const labelColor = n.kind==='ic' ? '#B9BEC4' : 'var(--ink-soft)';
      return `
      <line x1="${left?0:n.w}" y1="${y}" x2="${left?bx:bx+bw}" y2="${y}" stroke="${color}" stroke-width="1.4" opacity=".5"/>
      <text x="${lx}" y="${y+3.5}" text-anchor="${left?'start':'end'}" font-family="var(--mono)" font-size="9" fill="${labelColor}">${esc(nodePortRowLabel(r))}</text>
      <g class="portnum" data-gid="${esc(n.id)}" data-eid="${esc(r.eid)}" data-src="${esc(r.src)}" data-tgt="${esc(r.tgt)}" data-dir="${esc(r.dir)}" style="cursor:move">
        <rect x="${bx}" y="${y-bh/2}" width="${bw}" height="${bh}" rx="8"
          fill="${selEdge?'var(--probe)':'var(--paper)'}" stroke="${color}" stroke-width="1.4"/>
        <text x="${bx+bw/2}" y="${y+4}" text-anchor="middle" font-family="var(--mono)" font-size="10" font-weight="600" fill="var(--ink)">${r.nets}</text>
      </g>`;
    }).join('');
    const dimN = trace && !tracedN && !selected ? ' dim' : '';
    if (n.kind==='ic'){
      return `<g class="node${dimN}" data-nid="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="cursor:move">
        <rect x="-3" y="4" width="${n.w+6}" height="${n.h}" rx="5" fill="#00000018"/>
        <rect width="${n.w}" height="${n.h}" rx="5" fill="var(--epoxy)"
          stroke="${(selected||tracedN)?'var(--probe)':(side==='lv'?'var(--epoxy-edge)':'var(--sig-hv)')}" stroke-width="${(selected||tracedN)?2.5:1.4}"/>
        ${hvOverlayMarkup(side, n.w, n.h, 5, 'hvclip-'+safeId(n.id), n.hvFlip)}
        <circle cx="13" cy="13" r="3.6" fill="var(--silk)"/>
        <text x="26" y="26" font-family="var(--mono)" font-size="13.5" font-weight="600" fill="var(--silk)">${esc(n.label)}</text>
        <text x="26" y="44" font-family="var(--sans)" font-size="10" fill="#B9BEC4">${esc((n.data.ic_type||'').slice(0,30))}</text>
        ${hvSideTag(side, n.w, n.hvFlip)}
        <line x1="10" y1="${sepY}" x2="${n.w-10}" y2="${sepY}" stroke="var(--silk)" stroke-width="1" opacity=".25"/>
        ${portRows}
      </g>`;
    }
    return `<g class="node${dimN}" data-nid="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="cursor:move">
      <rect width="${n.w}" height="${n.h}" rx="4" fill="var(--paper)"
        stroke="${(selected||tracedN)?'var(--probe)':(side==='lv'?'var(--ink-soft)':'var(--sig-hv)')}" stroke-width="${(selected||tracedN)?2.5:1.4}" stroke-dasharray="${selected?'none':'5 4'}"/>
      ${hvOverlayMarkup(side, n.w, n.h, 4, 'hvclip-'+safeId(n.id), n.hvFlip)}
      <text x="12" y="20" font-family="var(--mono)" font-size="10" letter-spacing=".08em" fill="var(--ink-soft)">EXTERNAL</text>
      <text x="12" y="36" font-family="var(--sans)" font-size="11.5" font-weight="500" fill="var(--ink)">${esc(n.label)}</text>
      ${hvSideTag(side, n.w, n.hvFlip)}
      <line x1="10" y1="${sepY}" x2="${n.w-10}" y2="${sepY}" stroke="var(--ink)" stroke-width="1" opacity=".25"/>
      ${portRows}
    </g>`;
  }).join('');
}

// The portal box (FROM/TO + neighbour title + total net count). The old
// floating stub is gone: `wires` are the REAL routed connections to the member
// blocks, drawn under the box so they visibly leave/enter its edge.
function portalMarkupFor(p, selected, wires, traced, dim){
  const { r, dir, item } = p;
  const otherId = dir==='in' ? item.source : item.target;
  const other = groupsWithUngrouped().find(g=>g.id===otherId);
  const label = other ? other.title : otherId;
  const style = NET_CATEGORY_STYLE[edgeCategory(item)];
  // Off-sheet-connector silhouette: the OUTER end (left of a FROM, right of a
  // TO) is a semicircle, the block-facing end stays flat — the shape itself
  // says which way the signal flows. Dragging the box moves the whole column,
  // any direction — floored at the design minimum distance to the blocks.
  // The cap radius is capped at PORTAL_H/2 so a box grown to fit more wires
  // keeps the same silhouette instead of bulging into a giant lens: at the
  // base height the two arcs meet and it IS a semicircle, taller boxes just
  // grow a straight run between them.
  const hvDom = item.dom==='hv';   // the HV half of a boundary wears the HV red
  const cr = 6, sr = Math.min(r.h/2, PORTAL_H/2);   // flat-corner radius, cap radius
  const boxD = dir==='in'
    ? `M ${r.x+sr} ${r.y} L ${r.x+r.w-cr} ${r.y} A ${cr} ${cr} 0 0 1 ${r.x+r.w} ${r.y+cr}
       L ${r.x+r.w} ${r.y+r.h-cr} A ${cr} ${cr} 0 0 1 ${r.x+r.w-cr} ${r.y+r.h}
       L ${r.x+sr} ${r.y+r.h} A ${sr} ${sr} 0 0 1 ${r.x} ${r.y+r.h-sr}
       L ${r.x} ${r.y+sr} A ${sr} ${sr} 0 0 1 ${r.x+sr} ${r.y} Z`
    : `M ${r.x} ${r.y+cr} A ${cr} ${cr} 0 0 1 ${r.x+cr} ${r.y} L ${r.x+r.w-sr} ${r.y}
       A ${sr} ${sr} 0 0 1 ${r.x+r.w} ${r.y+sr} L ${r.x+r.w} ${r.y+r.h-sr}
       A ${sr} ${sr} 0 0 1 ${r.x+r.w-sr} ${r.y+r.h} L ${r.x+cr} ${r.y+r.h}
       A ${cr} ${cr} 0 0 1 ${r.x} ${r.y+r.h-cr} Z`;
  // The count badge hugs the flat (block-facing) end, clear of the round cap;
  // the FROM/TO caption and the neighbour title are centred as a pair on the
  // box midline, so they stay centred however tall the box grows.
  const bcx = dir==='in' ? r.x+r.w-16 : r.x+16;
  const tx = dir==='in' ? r.x+14 : r.x+30;
  const cy = r.y + r.h/2;
  return `<g class="portal${dim?' dim':''}" data-portal="${esc(p.key)}" data-x="${r.x}" data-y="${r.y}" data-w="${r.w}" data-h="${r.h}" style="cursor:move">
    ${wires}
    <path d="${boxD}" fill="var(--vellum)"
      stroke="${(selected||traced)?'var(--probe)':(hvDom?'var(--sig-hv)':'var(--ink-soft)')}" stroke-width="${(selected||traced)?2.5:1.5}" stroke-dasharray="4 3"/>
    <text x="${tx}" y="${cy-8}" font-family="var(--mono)" font-size="9" letter-spacing=".08em" fill="${hvDom?'var(--sig-hv)':'var(--ink-soft)'}">${dir==='in'?'FROM':'TO'}${hvDom?' · HV':''}</text>
    <text x="${tx}" y="${cy+10}" font-family="var(--mono)" font-size="12" font-weight="600" fill="var(--ink)">${esc(label)}</text>
    <circle cx="${bcx}" cy="${cy}" r="9" fill="var(--paper)" stroke="${style.color}" stroke-width="1.2"/>
    <text x="${bcx}" y="${cy+3.5}" text-anchor="middle" font-family="var(--mono)" font-size="9.5" fill="var(--ink)">${item.nets.length}</text>
  </g>`;
}

// Sheet-symbol style: vellum fill, ink border, mono title, member count.
// Inter-group edges are derived by code from S.edges (see computeGroupEdges) —
// read-only at this level, so group blocks carry no .port (no manual linking here).
// The grid lives INSIDE the zoomed viewport, so it scales and pans with the
// content for free; the pattern tiles from the world origin — exactly the
// lattice that blocks, ports and waypoints snap to.
/* ------------------------------------------------------------------
   ADAPTIVE GRID (Ansys-style)
   Exactly ONE uniform lattice is visible at any moment — never two
   pitches overlaid, never unequally spaced lines. Zoomed right out you
   see the coarsest grid; zooming in, cells SUBDIVIDE by 2 so the
   on-screen cell size stays in a comfortable band, and the SNAP STEP
   follows the visible pitch — more zoom, finer adjustments.
   The pitch is clamped to [GRID_PITCH_MIN, GRID] in world units:
     · max = GRID (the minimum distance between two ports of a block),
       so a cell never exceeds the port pitch and zooming out beyond
       that range just scales the same grid;
     · min = GRID/4 = 6px, the finest step that is still comfortable
       to place things with; zooming in further just magnifies it.
   Subdivision by 2 keeps every level's lines a subset of no one —
   each pitch divides GRID, so ports (on the GRID lattice) remain
   reachable dead-on at every level.
   ------------------------------------------------------------------ */
const GRID_PITCH_MIN = GRID/4;              // 6px — comfort floor, my call
const GRID_PITCH_LEVELS = [GRID/4, GRID/2, GRID];   // 6, 12, 24
const GRID_CELL_MIN_PX = 14;                // a cell never renders smaller than this (except at the clamped max)
function gridPitch(){
  for (const p of GRID_PITCH_LEVELS) if (p*S.view.k >= GRID_CELL_MIN_PX) return p;
  return GRID;                              // clamped at the coarsest level
}
// Interactive snap: follows the VISIBLE pitch, so what you see is what you snap to.
const snapView = v => { const p=gridPitch(); return Math.round(v/p)*p; };
// The grid is drawn in SCREEN space over the whole board — it has no edges (no
// "square around the diagram" at far zoom-out) and there is exactly ONE of it.
// World alignment comes from the pattern itself: tile size = pitch*k screen px
// and patternTransform = the view translation, so the lines sit precisely on
// the world lattice the blocks/ports/waypoints snap to, at every pan and zoom.
let gridVisible = false, gridShownPitch = null;
function renderGrid(on){
  gridVisible = !!on;
  gridShownPitch = null;
  updateGridLOD();
}
function updateGridLOD(){
  if (!gridVisible){ gridShownPitch = null; gridG.innerHTML=''; return; }
  const p = gridPitch();
  if (p !== gridShownPitch || !gridG.firstElementChild){
    gridShownPitch = p;
    gridG.innerHTML = `
    <defs>
      <pattern id="gridPat" patternUnits="userSpaceOnUse">
        <path fill="none" stroke="var(--grid)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" fill="url(#gridPat)" style="pointer-events:none"/>`;
  }
  // Cheap per-frame update (pan and zoom): resize the tile and shift its origin.
  const cell = p * S.view.k;
  const pat = gridG.querySelector('#gridPat');
  pat.setAttribute('width', cell);
  pat.setAttribute('height', cell);
  pat.setAttribute('patternTransform', `translate(${S.view.tx},${S.view.ty})`);
  pat.querySelector('path').setAttribute('d', `M ${cell} 0 L 0 0 0 ${cell}`);
}

function renderTopLevel(){
  const groups = visibleGroups();
  const gEdges = computeGroupEdges();
  const trace = traceSets();
  // Ports live in each block's port zone (below the member list), one row per
  // connection, on whichever edge the row is currently assigned to.
  lastPorts = null;
  const obstacleRects = groups.map(g=>groupBlockRect(g.id));
  renderGrid(true);
  // An HV-domain connection is ALWAYS drawn in the HV red, whatever signal
  // types it carries — the split guarantees it holds nothing but HV nets.
  const catOfEdge = e => e.dom==='hv' ? 'hv' : edgeCategory(e);
  const catOf = new Map(gEdges.map(e=>[e.id, catOfEdge(e)]));
  // Forget routes for connections that no longer exist (regrouping, deletions).
  // 'n|'-prefixed entries belong to the drill-down views and are pruned there.
  const live = new Set(gEdges.map(e=>groupEdgeRouteKey(e.source,e.target,e.dom)));
  for (const k of _routeCache.keys()) if (!k.startsWith(NODE_ROUTE_PREFIX) && !live.has(k)) _routeCache.delete(k);
  const titleOf = new Map(groupsWithUngrouped().map(g=>[g.id, g.title||g.id]));

  edgesG.innerHTML = gEdges.map(e=>{
    const cat = catOfEdge(e), style = NET_CATEGORY_STYLE[cat];
    const selected = S.sel && S.sel.type==='groupEdge' && S.sel.id===e.id;
    const traced = trace && e.nets.some(nn=>nn.name===trace.name);
    const pa = groupPortAnchor(e.source, e.source, e.target, 'out', e.dom);
    const pb = groupPortAnchor(e.target, e.source, e.target, 'in', e.dom);
    const route = groupEdgeRouteOf(e.source,e.target,e.dom);
    const { pts, geo, manual } = groupEdgePtsCached(groupEdgeRouteKey(e.source,e.target,e.dom), pa, pb, route, obstacleRects, laneOf(e.source,e.target,e.dom));
    const mid = ptsBadgePos(pts);
    const w = selected ? GROUP_EDGE_STROKE_W+1.6 : traced ? GROUP_EDGE_STROKE_W+1.2 : GROUP_EDGE_STROKE_W;
    const segAttrs = ` data-src="${esc(e.source)}" data-tgt="${esc(e.target)}" data-dom="${esc(e.dom||'')}"`;
    const d = ptsPathD(pts);
    return `<g class="edge${trace&&!traced&&!selected?' dim':''}" data-eid="${esc(e.id)}">
      <path d="${d}" fill="none" stroke="transparent" stroke-width="16" style="cursor:pointer"/>
      <path d="${d}" fill="none" stroke="${style.color}" stroke-width="${w}"
        stroke-dasharray="${selected?'none':(style.dash||'none')}"
        ${(selected||traced)?'filter="drop-shadow(0 0 3px var(--probe))"':''}
        marker-end="url(#${style.marker})" style="pointer-events:none"/>
      <circle cx="${pa.x}" cy="${pa.y}" r="4.5" fill="${style.color}" style="pointer-events:none"/>
      ${polyHandleMarkup(pts, e.id, segAttrs, 14)}
      <g class="netbadge" data-eid="${esc(e.id)}" style="cursor:pointer">
        <rect x="${mid.x-15}" y="${mid.y-10}" width="30" height="18" rx="9"
          fill="${selected?'var(--probe)':'var(--paper)'}" stroke="${style.color}" stroke-width="1.4"/>
        <text x="${mid.x}" y="${mid.y+4}" text-anchor="middle"
          font-family="var(--mono)" font-size="10.5" font-weight="600" fill="var(--ink)">${e.nets.length}</text>
      </g>
    </g>`;
  }).join('');

  nodesG.innerHTML = groups.map(g=>{
    const pos = groupPosOf(g.id);
    const h = groupBlockHeight(g), W = groupBlockWidth(g);
    const selected = S.sel && S.sel.type==='group' && S.sel.id===g.id;
    const tracedG = trace && trace.groups.has(g.id);
    const eyebrow = g.id===UNGROUPED_ID ? 'UNASSIGNED' : 'FUNCTIONAL GROUP';
    const memberLines = g.members.map((id,i)=>{
      const n = nodeById(id);
      const label = n ? n.label : id;
      const font = n && n.kind==='ic' ? 'var(--mono)' : 'var(--sans)';
      const style = n && n.kind==='ic' ? '' : ' font-style="italic"';
      return `<text x="${GROUP_PAD_X}" y="${GROUP_HEAD_H+16+i*GROUP_MEMBER_ROW_H}" font-family="${font}" font-size="10"${style} fill="var(--ink-soft)">${esc(label)}</text>`;
    }).join('');
    const side = groupSide(g.id);
    const sepY = groupSeparatorY(g);
    // One row per connection: a lead-in tick from the block edge, the draggable
    // net-count badge (same number as the one on the wire's midpoint) and the
    // direction + neighbouring group in writing.
    const portRows = groupPortRowsFor(g.id).map(r=>{
      const color = NET_CATEGORY_STYLE[catOf.get(r.eid) || 'other'].color;
      const y = groupPortRowY(g, r.row);
      const left = r.side==='left', bw = 26, bh = 16;
      const bx = left ? GROUP_PAD_X : W-GROUP_PAD_X-bw;
      const lx = left ? bx+bw+6 : bx-6;
      const selEdge = S.sel && S.sel.type==='groupEdge' && S.sel.id===r.eid;
      const label = portRowLabel(r, titleOf);
      return `
      <line x1="${left?0:W}" y1="${y}" x2="${left?bx:bx+bw}" y2="${y}" stroke="${color}" stroke-width="1.4" opacity=".5"/>
      <text x="${lx}" y="${y+3.5}" text-anchor="${left?'start':'end'}" font-family="var(--mono)" font-size="9" fill="var(--ink-soft)">${esc(label)}</text>
      <g class="portnum" data-gid="${esc(g.id)}" data-src="${esc(r.src)}" data-tgt="${esc(r.tgt)}" data-dir="${esc(r.dir)}" data-dom="${esc(r.dom||'')}" style="cursor:move">
        <rect x="${bx}" y="${y-bh/2}" width="${bw}" height="${bh}" rx="8"
          fill="${selEdge?'var(--probe)':'var(--paper)'}" stroke="${color}" stroke-width="1.4"/>
        <text x="${bx+bw/2}" y="${y+4}" text-anchor="middle" font-family="var(--mono)" font-size="10" font-weight="600" fill="var(--ink)">${r.nets}</text>
      </g>`;
    }).join('');
    return `<g class="node${trace&&!tracedG&&!selected?' dim':''}" data-nid="${esc(g.id)}" transform="translate(${pos.x},${pos.y})" style="cursor:move">
      <rect x="-4" y="6" width="${W+8}" height="${h}" rx="6" fill="#00000018"/>
      <rect width="${W}" height="${h}" rx="6" fill="var(--vellum)"
        stroke="${(selected||tracedG)?'var(--probe)':(side==='lv'?'var(--ink)':'var(--sig-hv)')}" stroke-width="${(selected||tracedG)?3:2}"/>
      ${hvOverlayMarkup(side, W, h, 6, 'hvclip-'+safeId(g.id), groupHvFlip(g.id))}
      <line x1="${GROUP_PAD_X}" y1="30" x2="${W-GROUP_PAD_X}" y2="30" stroke="var(--ink)" stroke-width="1" opacity=".18"/>
      <text x="${GROUP_PAD_X}" y="20" font-family="var(--mono)" font-size="9.5" letter-spacing=".1em" fill="var(--ink-soft)">${eyebrow}</text>
      <text x="${GROUP_PAD_X}" y="54" font-family="var(--mono)" font-size="15" font-weight="600" fill="var(--ink)">${esc(g.title)}</text>
      <text x="${GROUP_PAD_X}" y="${GROUP_HEAD_H}" font-family="var(--sans)" font-size="11" font-weight="600" fill="var(--ink-soft)">${g.members.length} block${g.members.length===1?'':'s'}</text>
      ${hvSideTag(side, W, groupHvFlip(g.id))}
      ${memberLines}
      <line x1="10" y1="${sepY}" x2="${W-10}" y2="${sepY}" stroke="var(--ink)" stroke-width="1.2" opacity=".4"/>
      ${portRows}
    </g>`;
  }).join('');
}

function renderLink(){
  if (!S.link){ linkG.innerHTML=''; return; }
  const a = nodeById(S.link.fromId);
  const y = (lastPorts && lastPorts.linkY.get(a.id) != null) ? lastPorts.linkY.get(a.id) : a.y + a.h/2;
  linkG.innerHTML = `<path d="M ${a.x+a.w} ${y} L ${S.link.x} ${S.link.y}"
    fill="none" stroke="var(--probe-deep)" stroke-width="2" stroke-dasharray="6 5"/>`;
}

function renderBreadcrumb(){
  const el = $('breadcrumb');
  if (isTopLevel()){ el.innerHTML = `<span class="crumb-current">System</span>`; return; }
  const g = groupsWithUngrouped().find(x=>x.id===S.openGroup);
  el.innerHTML = `<button class="crumb-link" id="crumbSystem">System</button><span class="crumb-sep">/</span><span class="crumb-current">${esc(g?g.title:S.openGroup)}</span>`;
  $('crumbSystem').onclick = closeGroupView;
}

function openGroupView(groupId){
  const g = groupsWithUngrouped().find(x=>x.id===groupId);
  if (!g || !g.members.length) return;
  S.openGroup = groupId;
  // No re-anchoring here: the FROM/TO columns keep the position they were
  // left in (S.portalAnchor), so re-entering a group never shuffles them.
  S.sel = null;
  render();
  fitView();
}

function closeGroupView(){
  S.openGroup = null;
  S.sel = null;
  render();
  fitView();
}

/* ============================================================
   INSPECTOR
   ============================================================ */
// GROUND is intentionally absent — GND is never drawn in this diagram (see buildGraph),
// so it isn't offered as a choice when adding a net by hand either.
const NET_TYPES = ['POWER_DISTRIBUTION','DIGITAL_LOGIC','ANALOG_SIGNAL','CONTROL_SIGNAL','FEEDBACK_PATH','SENSING_LINE','SWITCHING_NODE','HIGH_VOLTAGE_PATH','HIGH_CURRENT_PATH','QUIET_REFERENCE','NOISY_NODE','NO_CONNECT','NA'];

function allGroupsOptions(currentId){
  return groupsWithUngrouped()
    .map(g=>`<option value="${esc(g.id)}" ${g.id===currentId?'selected':''}>${esc(g.title)}</option>`)
    .join('');
}

function renderInspector(){
  inspOnRender();   // unpinned panel: show while something is selected, then fold away
  const eye=$('insEyebrow'), title=$('insTitle'), body=$('insBody');
  if (!S.sel){
    eye.textContent='System';
    title.textContent=S.meta.title||'Untitled system';
    const groups = visibleGroups();
    const ungrouped = groups.find(g=>g.id===UNGROUPED_ID);
    const descTruncated = (S.meta.description||'').length > 420;
    body.innerHTML = `
      <p>${esc((S.meta.description||'').slice(0,420))}${descTruncated?'… ':''}${descTruncated?'<button class="linklike" id="btnFullDesc">Read full description</button>':''}</p>
      <div class="kv"><label>Blocks</label><div class="val">${S.nodes.filter(n=>n.kind==='ic').length} ICs · ${S.nodes.filter(n=>n.kind==='external').length} external</div></div>
      <div class="kv"><label>Connections</label><div class="val">${S.edges.length} edges · ${S.edges.reduce((s,e)=>s+e.nets.length,0)} nets</div></div>
      <div class="kv"><label>Groups</label><div class="val">${groups.length} shown${ungrouped&&ungrouped.members.length?` · ${ungrouped.members.length} ungrouped`:''}</div></div>
      <p style="margin-top:14px">${isTopLevel()
        ? 'System-level view — each block is a functional group, derived automatically from the underlying connections. Select a group or a connection to inspect it, or double-click a group to open it. Drag a group to reposition it.'
        : 'Select a block or a connection to inspect it. Press <b>Delete</b> to remove the selection. Click "System" above to return to the top level.'}</p>`;
    if (descTruncated) $('btnFullDesc').onclick = () => {
      openModal(S.meta.title||'System description',
        `<p style="white-space:pre-wrap;line-height:1.6">${esc(S.meta.description)}</p>`,
        `<button class="primary" id="mCancel">Close</button>`);
      $('mCancel').onclick = closeModal;
    };
    return;
  }
  if (S.sel.type==='group'){
    const g = visibleGroups().find(x=>x.id===S.sel.id);
    if (!g){ S.sel=null; renderInspector(); return; }
    const isUngrouped = g.id===UNGROUPED_ID;
    const customPorts = !!S.groupPortOrder[g.id] || Object.keys(S.groupPortSides).some(k=>k.startsWith(g.id+'|'));
    eye.textContent = isUngrouped ? 'Ungrouped blocks' : 'Functional group';
    title.textContent = g.title;
    const memberRows = g.members.map(id=>{
      const n = nodeById(id);
      return `<div class="row" style="align-items:center;margin-bottom:6px">
        <div style="font-family:var(--mono);font-size:12px;word-break:break-word">${esc(n?n.label:id)}</div>
        <select data-move-member="${esc(id)}">${allGroupsOptions(g.id)}</select>
      </div>`;
    }).join('') || '<p style="color:var(--ink-soft)">No members.</p>';
    body.innerHTML = `
      ${isUngrouped
        ? `<p>${esc(g.description||'')}</p>`
        : `<div class="kv"><label>Title</label><input type="text" id="gTitle" value="${esc(g.title)}"></div>
           <div class="kv"><label>Description</label><textarea id="gDesc">${esc(g.description)}</textarea></div>`}
      ${groupSide(g.id)==='barrier'?`
      <div class="kv"><label>LV | HV halves</label>
        <label class="switch"><input type="checkbox" id="gFlip" ${groupHvFlip(g.id)?'checked':''}><span class="knob"></span>
          <span class="swlabel">${groupHvFlip(g.id)?'HV left · LV right':'LV left · HV right'}</span></label>
      </div>`:''}
      <div class="kv"><label>Members (${g.members.length}) — move to group</label></div>
      ${memberRows}
      <div class="btnrow">
        <button id="btnOpenGroup">Open group</button>
        ${customPorts?'<button id="btnResetPorts">Reset port layout</button>':''}
        ${isUngrouped?'':'<button class="danger" id="btnDelGroup">Delete group</button>'}
      </div>
      <p class="hint">${groupPortRowsFor(g.id).length} port${groupPortRowsFor(g.id).length===1?'':'s'} in this block's port zone. Drag a port's net-count badge sideways to switch which edge it attaches to, or up/down to reorder it.</p>
      ${isUngrouped?'':'<p style="margin-top:10px;color:var(--ink-soft);font-size:11.5px">Deleting a group moves its members to Ungrouped — blocks are never deleted.</p>'}`;
    $('btnOpenGroup').onclick=()=>openGroupView(g.id);
    const gf=$('gFlip'); if (gf) gf.onchange=()=>{
      commit(); setGroupHvFlip(g.id, gf.checked); render();
    };
    const rp=$('btnResetPorts'); if (rp) rp.onclick=()=>{ commit(); resetGroupPortLayout(g.id); render(); };
    if (!isUngrouped){
      $('gTitle').onchange=()=>{
        const grp=S.groups.find(x=>x.id===g.id);
        if (grp){ grp.title=$('gTitle').value.trim()||grp.title; render(); }
      };
      $('gDesc').onchange=()=>{
        const grp=S.groups.find(x=>x.id===g.id);
        if (grp){ grp.description=$('gDesc').value.trim(); render(); }
      };
      $('btnDelGroup').onclick=()=>{
        commit();
        S.groups=S.groups.filter(x=>x.id!==g.id);
        delete S.groupPos[g.id];
        Object.keys(S.groupEdgeRoutes).forEach(k=>{ if (k.startsWith(g.id+'→')||k.split('#')[0].endsWith('→'+g.id)) delete S.groupEdgeRoutes[k]; });
        Object.keys(S.groupPortSides).forEach(k=>{ if (k.startsWith(g.id+'|')||k.includes('|'+g.id+'→')||k.split('#')[0].endsWith('→'+g.id)) delete S.groupPortSides[k]; });
        delete S.groupPortOrder[g.id];
        delete S.portalOffsets[g.id];
        delete S.portalOrder[g.id];
        delete S.portalSeq[g.id];
        delete S.portalAnchor[g.id];
        Object.keys(S.groupEdgeLanes).forEach(k=>{ if (k.startsWith(g.id+'→')||k.split('#')[0].endsWith('→'+g.id)) delete S.groupEdgeLanes[k]; });
        S.sel=null; render(); fitView();
      };
    }
    body.querySelectorAll('[data-move-member]').forEach(sel=>{
      sel.onchange=()=>{ commit(); moveMemberToGroup(sel.dataset.moveMember, g.id, sel.value); render(); };
    });
    return;
  }
  if (S.sel.type==='groupEdge'){
    const e = computeGroupEdges().find(x=>x.id===S.sel.id);
    if (!e){ S.sel=null; renderInspector(); return; }
    const gs = visibleGroups().find(g=>g.id===e.source), gt = visibleGroups().find(g=>g.id===e.target);
    const hasRoute = !!groupEdgeRouteOf(e.source,e.target,e.dom);
    const hasSides = !!(S.groupPortSides[groupPortKey(e.source,e.source,e.target,e.dom)] || S.groupPortSides[groupPortKey(e.target,e.source,e.target,e.dom)]);
    eye.textContent = e.dom==='hv' ? 'Group connection · HV domain (read-only)' : 'Group connection (read-only)';
    title.textContent = `${gs?gs.title:e.source} → ${gt?gt.title:e.target}${e.dom==='hv'?' · HV':''}`;
    body.innerHTML = `
      <p style="color:var(--ink-soft)">Derived from ${e.nets.length} underlying net${e.nets.length===1?'':'s'} between member blocks. Open a group to edit its individual connections. Drag the vertical segments sideways or the horizontal segments up/down to reroute — including the last segment where the wire enters the block.</p>
      ${e.nets.map(n=>`
        <div class="netcard traceable cat-${netCategory(n)}${S.traceNet===n.name?' on':''}" data-tracenet="${esc(n.name)}" title="Click to trace this net end to end">
          <div class="nettop"><span class="netname">${esc(n.name)}</span><span class="nettype">${esc(n.type)}</span></div>
          ${n.description?`<div class="netdesc">${esc(n.description)}</div>`:''}
        </div>`).join('')}
      <p class="hint">Each end attaches in its block's port zone, under the member list. Drag a port's net-count badge sideways to move that input/output to the opposite edge of its block, or up/down to reorder it against the group's other ports — the wire and its routing follow.</p>
      ${(hasRoute||hasSides)?'<div class="btnrow"><button id="btnResetRoute">Reset routing &amp; ports</button></div>':''}`;
    const rb=$('btnResetRoute'); if (rb) rb.onclick=()=>{
      delete S.groupEdgeRoutes[groupEdgeRouteKey(e.source,e.target,e.dom)];
      delete S.groupPortSides[groupPortKey(e.source, e.source, e.target, e.dom)];
      delete S.groupPortSides[groupPortKey(e.target, e.source, e.target, e.dom)];
      render();
    };
    wireTraceCards(body);
    return;
  }
  if (S.sel.type==='portal'){
    const dir = S.sel.id.split(':')[0];
    const e = portalItemOfKey(S.sel.id);
    if (!e){ S.sel=null; renderInspector(); return; }
    const otherId = dir==='in' ? e.source : e.target;
    const other = groupsWithUngrouped().find(g=>g.id===otherId);
    const here = groupsWithUngrouped().find(g=>g.id===S.openGroup);
    eye.textContent = e.dom==='hv' ? 'Portal · HV domain (read-only)' : 'Portal (read-only)';
    title.textContent = (dir==='in'
      ? `${other?other.title:otherId} → ${here?here.title:S.openGroup}`
      : `${here?here.title:S.openGroup} → ${other?other.title:otherId}`) + (e.dom==='hv'?' · HV':'');
    body.innerHTML = `
      <p style="color:var(--ink-soft)">This connection leaves the open group. Derived from ${e.nets.length} underlying net${e.nets.length===1?'':'s'}. Open "${esc(other?other.title:otherId)}" to edit it from that side.</p>
      ${e.nets.map(n=>`
        <div class="netcard traceable cat-${netCategory(n)}${S.traceNet===n.name?' on':''}" data-tracenet="${esc(n.name)}" title="Click to trace this net end to end">
          <div class="nettop"><span class="netname">${esc(n.name)}</span><span class="nettype">${esc(n.type)}</span></div>
          ${n.description?`<div class="netdesc">${esc(n.description)}</div>`:''}
        </div>`).join('')}
      <div class="btnrow">
        <button id="btnPortalUp">▲ Move up</button>
        <button id="btnPortalDown">▼ Move down</button>
      </div>
      <p class="hint">Move this ${dir==='in'?'FROM':'TO'} box up or down within its column to order the portals as you like.</p>
      ${other&&other.members.length?`<div class="btnrow"><button id="btnOpenOther">Open "${esc(other.title)}"</button></div>`:''}`;
    const col = drillSheet().portals.filter(p=>p.dir===dir).map(p=>p.key);
    const pos = col.indexOf(S.sel.id);
    $('btnPortalUp').disabled = pos<=0;
    $('btnPortalDown').disabled = pos<0 || pos>=col.length-1;
    const stepBox = delta => { const snap=snapshotState(); if (movePortalBoxStep(S.sel.id, delta)){ commit(snap); render(); } };
    $('btnPortalUp').onclick = ()=>stepBox(-1);
    $('btnPortalDown').onclick = ()=>stepBox(1);
    const btn = $('btnOpenOther'); if (btn) btn.onclick=()=>openGroupView(otherId);
    wireTraceCards(body);
    return;
  }
  if (S.sel.type==='node'){
    const n = nodeById(S.sel.id);
    if (!n){ S.sel=null; renderInspector(); return; }
    eye.textContent = n.kind==='ic' ? 'Integrated circuit' : 'External block';
    title.textContent = n.label;
    const sideRow = `
      <div class="kv"><label>Voltage domain</label>
        <select id="fSide">
          <option value="" ${!n.hvSide?'selected':''}>Auto (${inferNodeSide(n.id)})</option>
          <option value="lv" ${n.hvSide==='lv'?'selected':''}>Low voltage</option>
          <option value="barrier" ${n.hvSide==='barrier'?'selected':''}>Isolation barrier (half/half)</option>
          <option value="hv" ${n.hvSide==='hv'?'selected':''}>High voltage</option>
        </select>
      </div>
      ${nodeSide(n.id)==='barrier'?`
      <div class="kv"><label>LV | HV halves</label>
        <label class="switch"><input type="checkbox" id="fFlip" ${n.hvFlip?'checked':''}><span class="knob"></span>
          <span class="swlabel">${n.hvFlip?'HV left · LV right':'LV left · HV right'}</span></label>
      </div>`:''}`;
    const customPorts = !!S.groupPortOrder[n.id] || Object.keys(S.groupPortSides).some(k=>k.startsWith(n.id+'|'));
    const portHint = `<p class="hint">${nodePortRowsFor(n.id).length} port${nodePortRowsFor(n.id).length===1?'':'s'} in this block's port zone. Drag a port's net-count badge sideways to switch which edge it attaches to, or up/down to reorder it.</p>`;
    // "Add net" — the block joins a net as input or output. Offered nets are the
    // ones this block's GROUP already sees (internal wires + boundary
    // crossings); nets internal to other groups are irrelevant noise here.
    const gid = nodeGroupIndex().get(n.id);
    const gNetNames = gid ? [...groupNetIndex(gid).keys()].sort((a,b)=>a.localeCompare(b)) : [];
    const gMembers = (groupsWithUngrouped().find(x=>x.id===gid)||{members:[]}).members.filter(id=>id!==n.id);
    const memberLabel = id => { const x=nodeById(id); return x?x.label:id; };
    const addNetSection = `
      <div class="addnet">
        <div class="kv"><label>Add net to this block — nets in this group</label>
          <select id="anNet">
            ${gNetNames.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')}
            <option value="__new__">➕ New net…</option>
          </select></div>
        <div class="kv"><label>Direction at this block</label>
          <select id="anDir"><option value="in">Input (arrives here)</option><option value="out">Output (driven here)</option></select></div>
        <div id="anNewPane" style="display:none">
          <div class="kv"><label>Net name</label><input type="text" id="anName" placeholder="MY_NEW_NET"></div>
          <div class="kv"><label>Type</label><select id="anType">${NET_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
          <div class="kv"><label>Description</label><textarea id="anDesc" placeholder="One line: purpose, polarity if applicable"></textarea></div>
          <div class="kv"><label>Counterpart block (same group)</label>
            <select id="anOther">${gMembers.map(id=>`<option value="${esc(id)}">${esc(memberLabel(id))}</option>`).join('')}</select></div>
        </div>
        <button id="btnAddNetNode">Add net</button>
      </div>`;
    if (n.kind==='ic'){
      body.innerHTML = `
        <div class="kv"><label>Type</label><div class="val">${esc(n.data.ic_type||'')}</div></div>
        <div class="kv"><label>Manufacturer</label><div class="val">${esc(n.data.manufacturer||'—')}</div></div>
        <div class="kv"><label>Function</label><div class="val">${esc(n.data.description||'')}</div></div>
        <div class="kv"><label>Selection rationale</label><div class="val">${esc(n.data.selection_rationale||'')}</div></div>
        <div class="kv"><label>Datasheet</label><div class="val">${n.data.DatasheetUrl?`<a href="${esc(n.data.DatasheetUrl)}" target="_blank" rel="noopener">${esc(n.data.DatasheetUrl)}</a>`:'—'}</div></div>
        ${sideRow}
        ${portHint}
        ${addNetSection}
        <div class="btnrow"><button id="btnReplaceIC">Replace IC…</button>${customPorts?'<button id="btnResetNodePorts">Reset port layout</button>':''}</div>
        <div class="btnrow"><button class="danger" id="btnDelNode">Delete IC and its connections</button></div>`;
    } else {
      body.innerHTML = `
        <div class="kv"><label>Description</label><div class="val">${esc(n.data.description||'')}</div></div>
        ${sideRow}
        ${portHint}
        ${addNetSection}
        <div class="btnrow">${customPorts?'<button id="btnResetNodePorts">Reset port layout</button>':''}<button class="danger" id="btnDelNode">Delete block and its connections</button></div>`;
    }
    $('fSide').onchange=()=>{ n.hvSide = $('fSide').value || undefined; render(); };
    const ff=$('fFlip'); if (ff) ff.onchange=()=>{ commit(); n.hvFlip = ff.checked || undefined; render(); };
    const rep=$('btnReplaceIC'); if (rep) rep.onclick=()=>openReplaceICModal(n);
    const rp=$('btnResetNodePorts'); if (rp) rp.onclick=()=>{ commit(); resetGroupPortLayout(n.id); render(); };
    const del=$('btnDelNode'); if (del) del.onclick=()=>deleteNode(n.id);
    const anNet=$('anNet');
    if (anNet){
      const syncPane=()=>{ $('anNewPane').style.display = anNet.value==='__new__' ? 'block' : 'none'; };
      anNet.onchange=syncPane; syncPane();
      const hasNet=(s,t,name)=>{ const e=S.edges.find(x=>x.source===s&&x.target===t); return !!(e&&e.nets.some(x=>x.name===name)); };
      $('btnAddNetNode').onclick=()=>{
        const dir=$('anDir').value;
        if (anNet.value==='__new__'){
          const name=$('anName').value.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
          if (!name){ toast('Net name required'); return; }
          const other=$('anOther').value;
          if (!other){ toast('Pick the counterpart block'); return; }
          if (hasNet(dir==='in'?other:n.id, dir==='in'?n.id:other, name)){ toast('That connection already carries '+name); return; }
          const net={ name, type:$('anType').value, description:$('anDesc').value.trim() };
          commit();
          if (dir==='in') addNetToEdge(other, n.id, net); else addNetToEdge(n.id, other, net);
          render();
          return;
        }
        const info=groupNetIndex(gid).get(anNet.value);
        if (!info) return;
        if (dir==='in'){
          // the net arrives here from its existing driver (which may sit in
          // another group — the wire then shows through a FROM portal)
          if (info.driver===n.id){ toast('This block already drives '+info.net.name+' — pick Output or another net'); return; }
          if (hasNet(info.driver, n.id, info.net.name)){ toast('Already connected as input'); return; }
          commit(); addNetToEdge(info.driver, n.id, info.net); render();
        } else {
          // this block becomes a driver feeding the net's in-group consumers
          const gset=new Set((groupsWithUngrouped().find(x=>x.id===gid)||{members:[]}).members);
          const targets=[...info.consumers].filter(id=>id!==n.id && gset.has(id) && !hasNet(n.id, id, info.net.name));
          if (!targets.length){ toast('No in-group consumer to feed — add it as Input or create a new net'); return; }
          commit(); targets.forEach(t=>addNetToEdge(n.id, t, info.net)); render();
        }
      };
    }
    return;
  }
  // edge
  const e = S.edges.find(x=>x.id===S.sel.id);
  if (!e){ S.sel=null; renderInspector(); return; }
  eye.textContent='Connection';
  title.textContent = `${nodeById(e.source)?.label||'?'} → ${nodeById(e.target)?.label||'?'}`;
  // Ground nets are held in the model for the export but never drawn, so they're
  // summarised here instead of listed. Delete buttons carry the ORIGINAL index.
  const shown = e.nets.map((n,i)=>({n,i})).filter(x=>!isGroundNet(x.n));
  const gndCount = e.nets.length - shown.length;
  // Datasheets of the connection's endpoint ICs — the driver (source) first —
  // so what the connection actually does is one click away.
  const dsLinks = [{id:e.source, role:'source'}, {id:e.target, role:'target'}].map(x=>{
    const n = nodeById(x.id);
    return (n && n.kind==='ic' && n.data && n.data.DatasheetUrl)
      ? { label:n.label, url:n.data.DatasheetUrl, role:x.role } : null;
  }).filter(Boolean);
  body.innerHTML = `
    ${e.nets.length?'':'<p style="color:var(--warn)">This connection has no nets yet — add at least one, or it will be dropped on export.</p>'}
    ${shown.map(({n,i})=>`
      <div class="netcard traceable cat-${netCategory(n)}${S.traceNet===n.name?' on':''}" data-tracenet="${esc(n.name)}" title="Click to trace this net end to end">
        <div class="nettop">
          <span class="netname">${esc(n.name)}</span>
          <span class="nettype">${esc(n.type)}</span>
          <button class="netdom ${isHvNet(n)?'hv':'lv'}" data-domnet="${i}"
            title="Insulation domain of this net — click to flip. Blocks re-classify automatically (unless their Voltage domain is set by hand).">${isHvNet(n)?'HV':'LV'}</button>
          <button class="x" data-delnet="${i}" title="Remove net">✕</button>
        </div>
        ${n.description?`<div class="netdesc">${esc(n.description)}</div>`:''}
      </div>`).join('')}
    ${gndCount?`<p class="hint">${gndCount} ground net${gndCount>1?'s':''} on this connection — kept in the export, never drawn.</p>`:''}
    ${dsLinks.length?`<div class="kv" style="margin-top:12px"><label>Datasheets</label><div class="val">${dsLinks.map(d=>
      `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)}</a> <span style="color:var(--ink-soft)">(${d.role})</span>`).join('<br>')}</div></div>`:''}
    <div class="addnet">
      <div class="kv"><label>Net name</label><input type="text" id="newNetName" placeholder="MY_NEW_NET"></div>
      <div class="row">
        <div class="kv"><label>Type</label><select id="newNetType">${NET_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      </div>
      <div class="kv"><label>Description</label><textarea id="newNetDesc" placeholder="One line: purpose, polarity/tie point if applicable"></textarea></div>
      <button id="btnAddNet">Add net</button>
    </div>
    <p class="hint">Drag the vertical segments sideways or the horizontal segments up/down to reroute — including the last segment where the wire enters the block. The arrow always enters the block perpendicular to its edge.</p>
    <div class="btnrow">
      ${e.route?'<button id="btnResetRoute">Reset routing</button>':''}
      <button class="danger" id="btnDelEdge">Delete connection</button>
    </div>`;
  body.querySelectorAll('[data-delnet]').forEach(b=>b.onclick=()=>{ commit(); e.nets.splice(+b.dataset.delnet,1); render(); });
  body.querySelectorAll('[data-domnet]').forEach(b=>b.onclick=()=>{
    commit();
    const net = e.nets[+b.dataset.domnet];
    net.hv = !isHvNet(net);   // explicit flag — wins over what the type implies
    render();
  });
  $('btnAddNet').onclick=()=>{
    commit();
    const name = $('newNetName').value.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
    if (!name){ toast('Net name required'); return; }
    if (e.nets.some(n=>n.name===name)){ toast('This connection already carries a net with that name'); return; }
    e.nets.push({ name, type:$('newNetType').value, description:$('newNetDesc').value.trim() });
    e.nets.sort((a,b)=>a.name.localeCompare(b.name));
    render();
  };
  const rb=$('btnResetRoute'); if (rb) rb.onclick=()=>{ delete e.route; render(); };
  $('btnDelEdge').onclick=()=>{ commit(); S.edges=S.edges.filter(x=>x.id!==e.id); S.sel=null; render(); };
  wireTraceCards(body);
}

function deleteNode(id){
  commit();
  S.nodes = S.nodes.filter(n=>n.id!==id);
  S.edges = S.edges.filter(e=>e.source!==id && e.target!==id);
  S.groups.forEach(g=>{ g.members = g.members.filter(m=>m!==id); });
  delete S.groupPortOrder[id];
  Object.keys(S.groupPortSides).forEach(k=>{ if (k.startsWith(id+'|')) delete S.groupPortSides[k]; });
  S.sel=null; render();
}

/* ============================================================
   STATUS BAR (live validation)
   ============================================================ */
function renderStatus(){
  // Counted on the drawable graph so the figures match what's on screen —
  // ground-only connections are invisible and mustn't mask an isolated block.
  const drawn = diagramEdges(S.edges);
  const isolated = S.nodes.filter(n => !drawn.some(e=>e.source===n.id||e.target===n.id));
  const emptyEdges = S.edges.filter(e=>e.nets.length===0);
  const ungrouped = groupsWithUngrouped().find(g=>g.id===UNGROUPED_ID);
  const bits = [];
  bits.push(`<span class="chip"><span class="dot" style="background:var(--copper)"></span>${S.nodes.length} blocks · ${drawn.length} connections</span>`);
  // On an empty sheet there is nothing to vouch for — "all blocks connected"
  // would be a claim about nothing.
  if (S.nodes.length) bits.push(isolated.length
    ? `<span class="chip warn"><span class="dot"></span>${isolated.length} unconnected block${isolated.length>1?'s':''}: ${esc(isolated.slice(0,3).map(n=>n.label).join(', '))}${isolated.length>3?'…':''}</span>`
    : `<span class="chip ok"><span class="dot"></span>all blocks connected</span>`);
  if (emptyEdges.length) bits.push(`<span class="chip warn"><span class="dot"></span>${emptyEdges.length} connection${emptyEdges.length>1?'s':''} without nets</span>`);
  if (ungrouped && ungrouped.members.length) bits.push(`<span class="chip warn"><span class="dot"></span>${ungrouped.members.length} ungrouped block${ungrouped.members.length>1?'s':''}</span>`);
  $('statusBar').innerHTML = bits.join('');
  renderLegend();
}

// The legend floats over the canvas (top-right, see #legend in styles.css) so
// the color key sits next to the wires it explains, in every view level.
const LEGEND_LABELS = { hv:'HV', power:'Power', control:'Control', logic:'Logic', analog:'Analog/sense', switching:'Switching', other:'Other' };
function renderLegend(){
  $('legend').innerHTML = CATEGORY_PRIORITY.map(cat=>{
    const style = NET_CATEGORY_STYLE[cat];
    const dash = style.dash ? `border-top-style:dashed;` : '';
    return `<span class="litem"><span class="lswatch" style="border-top-color:${style.color};${dash}"></span>${LEGEND_LABELS[cat]}</span>`;
  }).join('');
}

/* ============================================================
   POINTER INTERACTIONS (pan / zoom / drag / link / select)
   ============================================================ */
function toWorld(clientX, clientY){
  const r = svg.getBoundingClientRect();
  return { x:(clientX-r.left-S.view.tx)/S.view.k, y:(clientY-r.top-S.view.ty)/S.view.k };
}

let drag = null, linkSnap = null; // {mode:'pan'|'node'|'link', ...}

// Position accessor for whatever is currently draggable — flat-view nodes
// or, at the top level, group sheet-symbol blocks (backed by S.groupPos).
function blockXY(id){
  if (isTopLevel()){ const p=groupPosOf(id); return { x:p.x, y:p.y }; }
  const n = nodeById(id); return n ? { x:n.x, y:n.y } : { x:0, y:0 };
}

svg.addEventListener('pointerdown', ev=>{
  const segEl = ev.target.closest('.seg-v, .seg-h');
  const numEl = ev.target.closest('.portnum');
  const badgeEl = ev.target.closest('.netbadge');
  const addEl = ev.target.closest('.portaladd');
  const port = ev.target.closest('.port');
  const slotEl = ev.target.closest('.slothandle');
  const portalEl = ev.target.closest('.portal');
  const nodeEl = ev.target.closest('.node');
  const edgeEl = ev.target.closest('.edge');
  svg.setPointerCapture(ev.pointerId);

  // The mid-wire net-count badge selects ITS connection — checked before the
  // portal (a boundary wire's badge lives inside the portal's <g>) so the
  // badge always lights up and shows the nets in the inspector.
  if (badgeEl){
    S.sel = { type: isTopLevel() ? 'groupEdge' : 'edge', id: badgeEl.dataset.eid };
    render();
    return;
  }
  if (addEl){
    openAddPortalModal(addEl.dataset.dir);
    return;
  }

  if (segEl){
    const cls = segEl.classList;
    // seg-v (vertical run) drags sideways, seg-h (horizontal run) drags up/down.
    // The wire's CURRENT shape and which of its segments was grabbed are
    // captured here, so the drag can TRANSLATE that segment in place.
    const mode = cls.contains('seg-v') ? 'routeV' : 'routeH';
    const topLevel = isTopLevel();
    const mx = segEl.dataset.mx!=null ? +segEl.dataset.mx : null;
    const my = segEl.dataset.my!=null ? +segEl.dataset.my : null;
    const axis = segEl.dataset.axis || (cls.contains('seg-h') ? 'h' : 'v');
    const key = topLevel ? groupEdgeRouteKey(segEl.dataset.src, segEl.dataset.tgt, segEl.dataset.dom)
                         : NODE_ROUTE_PREFIX + segEl.dataset.eid;
    const cached = _routeCache.get(key);
    let pts = cached ? cached.pts.map(p=>p.slice()) : null, segIdx = -1;
    if (pts && mx!=null && my!=null){
      for (let k=0;k<pts.length-1;k++){
        if ((axis==='v') !== (pts[k][0]===pts[k+1][0])) continue;
        if (Math.abs((pts[k][0]+pts[k+1][0])/2-mx)<0.5 && Math.abs((pts[k][1]+pts[k+1][1])/2-my)<0.5){ segIdx=k; break; }
      }
    }
    S.sel = { type: topLevel?'groupEdge':'edge', id: segEl.dataset.eid };
    drag = { mode, eid: segEl.dataset.eid, axis, mx, my, snap:snapshotState(),
      topLevel, src: segEl.dataset.src, tgt: segEl.dataset.tgt, dom: segEl.dataset.dom||'',
      pts: segIdx>=0 ? pts : null, segIdx };
    render();
    return;
  }
  // Must be tested before .node: the badge lives inside the block's <g class="node">,
  // and dragging it moves the PORT, not the block. Same gesture at both view
  // levels — only the port index it acts on differs (group rows vs node rows).
  if (numEl){
    const d = numEl.dataset;
    if (isTopLevel()){
      S.sel = { type:'groupEdge', id:d.eid || (computeGroupEdges().find(x=>x.source===d.src && x.target===d.tgt && (x.dom||'')===(d.dom||''))||{}).id };
      drag = { mode:'portside', gid:d.gid, src:d.src, tgt:d.tgt, dom:d.dom||'', dir:d.dir, snap:snapshotState() };
    } else {
      S.sel = { type:'edge', id:d.eid };
      drag = { mode:'nodeportside', nid:d.gid, src:d.src, tgt:d.tgt, dir:d.dir, snap:snapshotState() };
    }
    render();
    return;
  }
  if (port){
    const w = toWorld(ev.clientX, ev.clientY);
    S.link = { fromId: port.dataset.port, x:w.x, y:w.y };
    linkSnap = snapshotState();
    drag = { mode:'link' };
    svg.classList.add('linking');
    renderLink();
    return;
  }
  // Must be tested before .portal: the ring lives inside the portal's <g>,
  // and dragging it reorders the SLOT, not the column. A plain click selects
  // the wire's own connection, like its net badge.
  if (slotEl){
    S.sel = { type:'edge', id: slotEl.dataset.eid };
    drag = { mode:'portalslot', key: slotEl.dataset.portal, eid: slotEl.dataset.eid, snap:snapshotState() };
    render();
    return;
  }
  if (portalEl){
    // A drag moves the WHOLE column (floored at the design minimum distance
    // to the blocks); a plain click selects — resolved at pointerup.
    const dir = portalEl.dataset.portal.split(':')[0];
    const w = toWorld(ev.clientX, ev.clientY);
    const off = portalOffsetOf(S.openGroup, dir);
    drag = { mode:'portalcol', dir, portalId:portalEl.dataset.portal,
      dx:w.x-off.dx, dy:w.y-off.dy, moved:false, snap:snapshotState() };
    return;
  }
  if (nodeEl){
    const id = nodeEl.dataset.nid;
    const pos = blockXY(id);
    const w = toWorld(ev.clientX, ev.clientY);
    drag = { mode:'node', id, dx:w.x-pos.x, dy:w.y-pos.y, moved:false, snap:snapshotState() };
    return;
  }
  if (edgeEl){
    S.sel = { type: isTopLevel()?'groupEdge':'edge', id: edgeEl.dataset.eid };
    render();
    return;
  }
  drag = { mode:'pan', sx:ev.clientX, sy:ev.clientY, tx:S.view.tx, ty:S.view.ty, moved:false };
  svg.classList.add('panning');
});

svg.addEventListener('dblclick', ev=>{
  if (!isTopLevel()) return;
  if (ev.target.closest('.portnum')) return; // badge is a port handle, not the block
  const nodeEl = ev.target.closest('.node');
  if (!nodeEl) return;
  openGroupView(nodeEl.dataset.nid);
});

svg.addEventListener('pointermove', ev=>{
  if (!drag) return;
  if (drag.mode==='pan'){
    const dx=ev.clientX-drag.sx, dy=ev.clientY-drag.sy;
    if (Math.abs(dx)+Math.abs(dy)>3) drag.moved=true;
    S.view.tx=drag.tx+dx; S.view.ty=drag.ty+dy;
    viewport.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);
    updateGridLOD();   // the pan path skips render(), keep the screen-space grid aligned
    return;
  }
  const w = toWorld(ev.clientX, ev.clientY);
  if (drag.mode==='node'){
    if (isTopLevel()){
      const p=groupPosOf(drag.id);
      p.x=snapView(w.x-drag.dx); p.y=snapView(w.y-drag.dy);
    } else {
      const n=nodeById(drag.id);
      n.x=snapView(w.x-drag.dx); n.y=snapView(w.y-drag.dy);
    }
    commitGesture(drag);
    drag.moved=true;
    render();
    return;
  }
  if (drag.mode==='portside'){
    // Two axes at once: X picks the edge of the block the port attaches to,
    // Y picks its row. Both apply live, so the other ports visibly shift as you
    // drag and the wire follows its port. Row count never changes → no jumps.
    const rect = groupBlockRect(drag.gid);
    const g = groupsWithUngrouped().find(x=>x.id===drag.gid);
    let changed = false;
    const row = groupPortOf(drag.gid, drag.src, drag.tgt, drag.dir, drag.dom);
    const wantedSide = w.x > rect.x + rect.w/2 ? 'right' : 'left';
    if (row && row.pinned){
      // Isolation barrier: an HV port can't be dragged onto the LV half, nor the
      // other way round. Vertical reordering below is still allowed.
      if (wantedSide !== row.side && !drag.warned){
        drag.warned = true;
        toast(`${row.hv?'HV':'LV'} connections stay on the ${row.hv?'HV':'LV'} side of this block`);
      }
    } else if (groupPortSideOf(drag.gid, drag.src, drag.tgt, drag.dir, drag.dom) !== wantedSide){
      setGroupPortSide(drag.gid, drag.src, drag.tgt, wantedSide, drag.dom);
      changed = true;
    }
    const zoneTop = rect.y + groupPortZoneTop(g);
    const wantedRow = Math.floor((w.y - zoneTop) / GROUP_PORT_ROW_H);
    if (moveGroupPortToRow(drag.gid, groupEdgeRouteKey(drag.src, drag.tgt, drag.dom), wantedRow)) changed = true;
    if (changed){ commitGesture(drag); render(); }
    return;
  }
  if (drag.mode==='nodeportside'){
    // The drill-down twin of 'portside': X picks the edge of the member block
    // the port attaches to, Y picks its row. Same live feel, same stores —
    // including the barrier rule: a pinned port never crosses the LV|HV
    // divider, only its row can change.
    const n = nodeById(drag.nid);
    if (!n) return;
    let changed = false;
    const row = nodePortOf(drag.nid, drag.src, drag.tgt, drag.dir);
    const wantedSide = w.x > n.x + n.w/2 ? 'right' : 'left';
    if (row && row.pinned){
      if (wantedSide !== row.side && !drag.warned){
        drag.warned = true;
        toast(`${row.hv?'HV':'LV'} connections stay on the ${row.hv?'HV':'LV'} side of this block`);
      }
    } else if (groupPortSideOf(drag.nid, drag.src, drag.tgt, drag.dir) !== wantedSide){
      setGroupPortSide(drag.nid, drag.src, drag.tgt, wantedSide);
      changed = true;
    }
    const zoneTop = n.y + nodePortZoneTop(n);
    const wantedRow = Math.floor((w.y - zoneTop) / GROUP_PORT_ROW_H);
    if (moveNodePortToRow(drag.nid, groupEdgeRouteKey(drag.src, drag.tgt), wantedRow)) changed = true;
    if (changed){ commitGesture(drag); render(); }
    return;
  }
  if (drag.mode==='portalslot'){
    // Quantize the pointer onto the half-GRID slot fan and shuffle live,
    // exactly like a block port's badge drag.
    const p = drillSheet().portals.find(x=>x.key===drag.key);
    if (!p) return;
    const wantedRow = Math.round((w.y - portalSlotY(p, 0))/PORTAL_SLOT);
    if (movePortalSlotToRow(drag.key, drag.eid, wantedRow)){ commitGesture(drag); render(); }
    return;
  }
  if (drag.mode==='portalcol'){
    // The whole FROM (or TO) column follows the pointer, both directions and
    // dy free — snapped to the visible grid pitch. Toward the blocks the
    // STORED offset stops at the design minimum distance (the same floor
    // colXFor renders), so a released column stays parked where it shows and
    // never chases the blocks when they later move away.
    const nxRaw = snapView(w.x - drag.dx), ny = snapView(w.y - drag.dy);
    const off = portalOffsetOf(S.openGroup, drag.dir);
    const sh = drillSheet();
    const nx = drag.dir==='in'
      ? Math.min(nxRaw, sh.live.minX - PORTAL_MIN_CLEAR - (sh.bounds.minX - sh.inMargin))
      : Math.max(nxRaw, sh.live.maxX + PORTAL_MIN_CLEAR - (sh.bounds.maxX + sh.outMargin));
    if (nx !== off.dx || ny !== off.dy){
      commitGesture(drag);   // snapshot first — undo also removes the pins below
      if (!drag.pinned){ drag.pinned = true; pinPortalWires(drag.dir); }
      drag.moved = true;
      setPortalOffset(S.openGroup, drag.dir, nx, ny);
      render();
    }
    return;
  }
  if (drag.mode==='routeV' || drag.mode==='routeH'){
    // Vertical segments only move in X; horizontal segments only move in Y,
    // snapped to the visible grid pitch at both view levels. The grabbed
    // segment is TRANSLATED in place — its perpendicular neighbours absorb the
    // change, so no new segments appear while there is free room. Only where
    // the shape is stored differs (S.groupEdgeRoutes vs. the edge's .route).
    const raw = drag.axis==='h' ? snapView(w.y) : snapView(w.x);
    // Direction is taken from the POINTER (not from the snapped result), so once
    // the wire has hopped past a block, continuing the same way keeps going and
    // reversing hops it back over.
    const dir = Math.sign(raw - (drag.lastRaw!=null ? drag.lastRaw : raw)) || drag.lastDir || 0;
    if (dir) drag.lastDir = dir;
    drag.lastRaw = raw;
    const obstacles = drag.topLevel ? visibleGroups().map(g=>groupBlockRect(g.id)) : openGroupObstacleRects();
    let route;
    if (drag.pts){
      const moved = translateWireSegment(drag.pts, drag.segIdx, drag.axis, raw, obstacles, dir);
      if (!moved) return;   // nowhere legal in this direction — the wire stays
      route = { pts: moved };
    } else {
      // no captured shape (stale cache) — waypoint fallback: reroute through
      // the dragged point, keeping the segment's other coordinate.
      const wx = drag.axis==='v' ? raw : (drag.mx!=null ? snapView(drag.mx) : snapView(w.x));
      const wy = drag.axis==='v' ? (drag.my!=null ? snapView(drag.my) : snapView(w.y)) : raw;
      const fixed = pointOutOfBlocks(wx, wy, obstacles, drag.axis, dir);
      route = drag.axis==='v' ? { wx: fixed, wy } : { wx, wy: fixed };
    }
    commitGesture(drag);
    if (drag.topLevel) setGroupEdgeRoute(drag.src, drag.tgt, route, drag.dom);
    else { const e=S.edges.find(x=>x.id===drag.eid); if (e) e.route = { ...route, sheet: S.openGroup }; }
    render();
    return;
  }
  if (drag.mode==='link'){
    S.link.x=w.x; S.link.y=w.y;
    renderLink();
  }
});

svg.addEventListener('pointerup', ev=>{
  if (!drag) return;
  if (drag.mode==='pan'){
    if (!drag.moved){ S.sel=null; render(); }
    svg.classList.remove('panning');
  }
  if (drag.mode==='node' && !drag.moved){
    S.sel={type: isTopLevel()?'group':'node', id:drag.id}; render();
  }
  if (drag.mode==='portalcol' && !drag.moved){
    S.sel={type:'portal', id:drag.portalId}; render();
  }
  if (drag.mode==='link'){
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const nodeEl = el && el.closest ? el.closest('.node') : null;
    const toId = nodeEl ? nodeEl.dataset.nid : null;
    const fromId = S.link.fromId;
    S.link=null; svg.classList.remove('linking'); renderLink();
    if (toId && toId!==fromId){
      let e = S.edges.find(x=>x.source===fromId && x.target===toId);
      if (!e){
        if (linkSnap!=null) commit(linkSnap);
        e = { id:'e'+(S.edgeSeq++), source:fromId, target:toId, nets:[] };
        S.edges.push(e);
      }
      S.sel={type:'edge', id:e.id};
    }
    render();
  }
  drag=null; linkSnap=null;
});

// Zoom, in ONE place: the wheel and the on-canvas +/− buttons scale about a
// screen point (the pointer / the sheet's centre) between the same limits, so
// the two never disagree about how far the view can go.
const ZOOM_MIN = .25, ZOOM_MAX = 2.4, ZOOM_STEP = 1.2;
function zoomAbout(factor, sx, sy){
  const k0 = S.view.k, k1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k0*factor));
  if (k1 === k0) return;
  S.view.tx = sx-(sx-S.view.tx)*(k1/k0);
  S.view.ty = sy-(sy-S.view.ty)*(k1/k0);
  S.view.k = k1;
  viewport.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);
  updateGridLOD();   // this path skips render(), so re-pick the grid detail here
  updateViewTools();
}
// A button zoom keeps the CENTRE of the sheet fixed — the wheel already
// handles "zoom where I'm pointing".
function zoomStep(dir){
  const r = svg.getBoundingClientRect();
  zoomAbout(dir>0 ? ZOOM_STEP : 1/ZOOM_STEP, r.width/2, r.height/2);
}
// Grey out a zoom button once its direction has nothing left to give.
function updateViewTools(){
  const zi = $('btnZoomIn'), zo = $('btnZoomOut');
  if (zi) zi.disabled = S.view.k >= ZOOM_MAX-1e-6;
  if (zo) zo.disabled = S.view.k <= ZOOM_MIN+1e-6;
}
svg.addEventListener('wheel', ev=>{
  ev.preventDefault();
  const r = svg.getBoundingClientRect();
  zoomAbout(ev.deltaY<0 ? 1.12 : 0.89, ev.clientX-r.left, ev.clientY-r.top);
},{passive:false});
$('btnZoomIn').onclick  = ()=>zoomStep(+1);
$('btnZoomOut').onclick = ()=>zoomStep(-1);
$('btnZoomFit').onclick = fitView;

document.addEventListener('keydown', ev=>{
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((ev.ctrlKey||ev.metaKey) && !typing){
    const k = ev.key.toLowerCase();
    if (k==='z' && !ev.shiftKey){ ev.preventDefault(); undo(); return; }
    if (k==='y' || (k==='z' && ev.shiftKey)){ ev.preventDefault(); redo(); return; }
  }
  if ((ev.key==='Delete'||ev.key==='Backspace') && S.sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){
    // Group / group-edge deletion is read-only at the top level for now (phase d).
    if (S.sel.type==='node'){ ev.preventDefault(); deleteNode(S.sel.id); }
    else if (S.sel.type==='edge'){ ev.preventDefault(); commit(); S.edges=S.edges.filter(x=>x.id!==S.sel.id); S.sel=null; render(); }
  }
});

function currentBlocksForBounds(){
  if (isTopLevel()) return visibleGroups().map(g=>groupBlockRect(g.id));
  // drillSheet is the single source of portal geometry (margins, offsets,
  // manual order), so fitView always frames what is actually drawn.
  const { members, portals } = drillSheet();
  if (!members.length) return members;
  return [...members, ...portals.map(p=>p.r)];
}

function fitView(){
  const blocks = currentBlocksForBounds();
  if (!blocks.length) return;
  const minX=Math.min(...blocks.map(n=>n.x)), maxX=Math.max(...blocks.map(n=>n.x+n.w));
  const minY=Math.min(...blocks.map(n=>n.y)), maxY=Math.max(...blocks.map(n=>n.y+n.h));
  const r=svg.getBoundingClientRect(), pad=60;
  const k=Math.min(1.4, Math.min((r.width-2*pad)/(maxX-minX), (r.height-2*pad)/(maxY-minY)));
  S.view.k=Math.max(.25,k);
  S.view.tx=(r.width-(maxX-minX)*S.view.k)/2 - minX*S.view.k;
  S.view.ty=(r.height-(maxY-minY)*S.view.k)/2 - minY*S.view.k;
  render();
}

/* ============================================================
   MODALS: Add IC / Import / Export
   ============================================================ */
function openModal(title, bodyHTML, footHTML){
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=bodyHTML;
  $('modalFoot').innerHTML=footHTML;
  $('modalOverlay').classList.add('open');
}
function closeModal(){ $('modalOverlay').classList.remove('open'); }
$('modalClose').onclick=closeModal;
$('modalOverlay').addEventListener('pointerdown',ev=>{ if(ev.target===$('modalOverlay')) closeModal(); });

/* ============================================================
   DIGIKEY PART SEARCH (Add IC)
   Client-credentials OAuth against the DigiKey Product Search v4
   API, straight from the browser. Credentials come from the user
   (free at developer.digikey.com) and live in localStorage only —
   they are never part of the session/export JSON. DigiKey does not
   always allow cross-origin browser calls, so an optional CORS
   proxy prefix can be configured alongside the credentials.
   ============================================================ */
const DK_BASE = 'https://api.digikey.com';
function dkConfig(){
  try {
    return { id: localStorage.getItem('dk_client_id')||'',
             secret: localStorage.getItem('dk_client_secret')||'',
             proxy: localStorage.getItem('dk_proxy')||'' };
  } catch(e){ return { id:'', secret:'', proxy:'' }; }
}
function dkSaveConfig(id, secret, proxy){
  try {
    localStorage.setItem('dk_client_id', id);
    localStorage.setItem('dk_client_secret', secret);
    localStorage.setItem('dk_proxy', proxy);
  } catch(e){ /* storage unavailable — config just won't persist */ }
  _dkToken = null;
}
// Optional repo-side credential file (credential/digikey_credentials.json)
// so the keys can be picked up with one click instead of pasting.
async function dkLoadCredentialFile(){
  const res = await fetch('credential/digikey_credentials.json', { cache:'no-store' });
  if (!res.ok) throw new Error('credential/digikey_credentials.json not found (HTTP '+res.status+')');
  const j = await res.json();
  if (!j.client_id || !j.client_secret) throw new Error('digikey_credentials.json is missing client_id / client_secret');
  return { id:String(j.client_id), secret:String(j.client_secret), proxy:String(j.cors_proxy||'') };
}
function dkUrl(path){
  const { proxy } = dkConfig();
  return proxy ? proxy + encodeURIComponent(DK_BASE+path) : DK_BASE+path;
}
let _dkToken = null;   // { token, exp } — cached until shortly before expiry
async function dkToken(){
  const { id, secret } = dkConfig();
  if (!id || !secret) throw new Error('No DigiKey credentials — open "DigiKey API settings" below');
  if (_dkToken && Date.now() < _dkToken.exp - 60000) return _dkToken.token;
  const res = await fetch(dkUrl('/v1/oauth2/token'), { method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:`client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials` });
  if (!res.ok) throw new Error('DigiKey auth failed (HTTP '+res.status+')');
  const j = await res.json();
  _dkToken = { token: j.access_token, exp: Date.now() + (j.expires_in||600)*1000 };
  return _dkToken.token;
}
// Pure: v4 response → rows for the picker, HIGHEST STOCK FIRST. Liberal in the
// field shapes it accepts — DigiKey has shipped several near-identical ones.
function dkNormalizeProducts(json){
  return ((json && json.Products) || []).map(p=>{
    const pn = p.ManufacturerProductNumber || p.ManufacturerPartNumber || '';
    const man = (p.Manufacturer && (p.Manufacturer.Name || p.Manufacturer.Value)) || '';
    const desc = (p.Description && (p.Description.ProductDescription || p.Description.Value))
      || p.ProductDescription || '';
    const stock = +(p.QuantityAvailable ?? 0);
    let price = p.UnitPrice;
    if (price == null){
      const breaks = (p.ProductVariations||[]).flatMap(v=>v.StandardPricing||[]);
      if (breaks.length) price = breaks.slice().sort((a,b)=>a.BreakQuantity-b.BreakQuantity)[0].UnitPrice;
    }
    return { pn, man, desc, stock, price: price!=null ? +price : null, datasheet: p.DatasheetUrl || '' };
  }).filter(x=>x.pn)
    .sort((a,b)=> b.stock - a.stock || a.pn.localeCompare(b.pn));
}
async function dkSearch(keyword){
  const token = await dkToken();
  const res = await fetch(dkUrl('/products/v4/search/keyword'), { method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token,
      'X-DIGIKEY-Client-Id': dkConfig().id,
      'X-DIGIKEY-Locale-Site':'US', 'X-DIGIKEY-Locale-Currency':'USD' },
    body: JSON.stringify({ Keywords: keyword, Limit: 25, Offset: 0 }) });
  if (!res.ok) throw new Error('DigiKey search failed (HTTP '+res.status+')');
  return dkNormalizeProducts(await res.json());
}
const dkFmtStock = s => s.toLocaleString('en-US');
const dkFmtPrice = p => p==null ? '—' : '$'+(+p).toFixed(p<1?4:2);
// Rows into #dkResults; clicking one autofills the identity fields (part
// number, type, manufacturer, datasheet) and leaves "Function in this system"
// and "Selection rationale" — the engineering judgement — to the user.
function dkRenderResults(list){
  const box = $('dkResults');
  if (!list.length){ box.innerHTML = '<p class="hint">No parts found.</p>'; return; }
  box.innerHTML = list.map((r,i)=>`
    <button type="button" class="dkrow" data-i="${i}">
      <span class="dkpn">${esc(r.pn)}</span><span class="dkman">${esc(r.man)}</span>
      <span class="dkdesc">${esc(r.desc)}</span>
      <span class="dkstock">${dkFmtStock(r.stock)} in stock</span><span class="dkprice">${dkFmtPrice(r.price)}</span>
    </button>`).join('');
  box.querySelectorAll('.dkrow').forEach(btn=>btn.onclick=()=>{
    const r = list[+btn.dataset.i];
    $('fPN').value = r.pn;
    $('fType').value = r.desc;
    $('fMan').value = r.man.toUpperCase();
    $('fUrl').value = r.datasheet;
    box.querySelectorAll('.dkrow').forEach(b=>b.classList.toggle('on', b===btn));
    $('fDesc').focus();
  });
}

// The IC identity form (DigiKey search + fields) shared by "Add IC" and
// "Replace IC" — one markup builder and one handler-wiring, so both modals
// always look and behave the same.
function icFormMarkup(v){
  const cfg = dkConfig();
  return `
    <div class="dksearch">
      <div class="kv"><label>Search DigiKey by part number</label>
        <div class="row"><input type="text" id="dkQuery" placeholder="TPS7A21" autocomplete="off" value="${esc(v.query||'')}">
        <button id="dkGo" style="flex:0 0 auto">Search</button></div>
      </div>
      <div id="dkStatus" class="hint" style="margin:4px 0"></div>
      <div id="dkResults" class="dkresults"></div>
      <p class="hint" style="margin-bottom:4px">Results are sorted by stock quantity, highest first. Picking a part fills in its
        identity below — the function in this system and the selection rationale stay yours to write.
        <button class="linklike" id="dkCfgToggle">DigiKey API settings</button></p>
      <div id="dkCfgPane" style="display:${cfg.id?'none':'block'}">
        <div class="row">
          <div class="kv"><label>Client ID</label><input type="text" id="dkId" value="${esc(cfg.id)}" autocomplete="off"></div>
          <div class="kv"><label>Client Secret</label><input type="text" id="dkSecret" value="${esc(cfg.secret)}" autocomplete="off"></div>
        </div>
        <div class="kv"><label>CORS proxy prefix (optional)</label><input type="text" id="dkProxy" value="${esc(cfg.proxy)}" placeholder="https://corsproxy.io/?url="></div>
        <p class="hint">Free credentials at developer.digikey.com (a "Product Information v4" app, client-credentials flow).
          They are stored only in this browser (localStorage), never in the session or the export.
          If your browser blocks the request (CORS), route it through a proxy prefix — the full DigiKey URL is appended to it.</p>
        <div class="btnrow" style="margin-top:0">
          <button id="dkSave">Save settings</button>
          <button id="dkLoadFile" title="Read credential/digikey_credentials.json from the app folder">Load from credential/digikey_credentials.json</button>
        </div>
      </div>
    </div>
    <div class="kv"><label>Part number *</label><input type="text" id="fPN" placeholder="TPS7A21" value="${esc(v.pn||'')}"></div>
    <div class="kv"><label>IC type *</label><input type="text" id="fType" placeholder="Low-noise LDO regulator" value="${esc(v.type||'')}"></div>
    <div class="kv"><label>Manufacturer</label><input type="text" id="fMan" placeholder="TEXAS INSTRUMENTS" value="${esc(v.man||'')}"></div>
    <div class="kv"><label>Function in this system *</label><textarea id="fDesc">${esc(v.desc||'')}</textarea></div>
    <div class="kv"><label>Selection rationale</label><textarea id="fRat">${esc(v.rat||'')}</textarea></div>
    <div class="kv"><label>Datasheet URL</label><input type="text" id="fUrl" placeholder="https://www.ti.com/lit/ds/symlink/....pdf" value="${esc(v.url||'')}"></div>`;
}
function wireIcFormHandlers(){
  $('mCancel').onclick=closeModal;
  $('dkCfgToggle').onclick=()=>{ const p=$('dkCfgPane'); p.style.display = p.style.display==='none' ? 'block' : 'none'; };
  $('dkSave').onclick=()=>{
    dkSaveConfig($('dkId').value.trim(), $('dkSecret').value.trim(), $('dkProxy').value.trim());
    $('dkCfgPane').style.display='none';
    toast('DigiKey settings saved to this browser');
  };
  $('dkLoadFile').onclick=async()=>{
    try {
      const c = await dkLoadCredentialFile();
      $('dkId').value=c.id; $('dkSecret').value=c.secret;
      if (c.proxy) $('dkProxy').value=c.proxy;
      dkSaveConfig(c.id, c.secret, $('dkProxy').value.trim());
      toast('DigiKey credentials loaded from file');
    } catch(err){ $('dkStatus').textContent=String(err.message||err); }
  };
  const runSearch = async ()=>{
    const q = $('dkQuery').value.trim();
    if (!q){ $('dkStatus').textContent='Type a part number to search.'; return; }
    $('dkStatus').textContent='Searching DigiKey…';
    $('dkResults').innerHTML='';
    try {
      const list = await dkSearch(q);
      $('dkStatus').textContent = list.length ? list.length+' part'+(list.length===1?'':'s')+' — highest stock first' : '';
      dkRenderResults(list);
    } catch(err){
      $('dkStatus').textContent = String(err.message||err);
    }
  };
  $('dkGo').onclick=runSearch;
  $('dkQuery').addEventListener('keydown', ev=>{ if (ev.key==='Enter'){ ev.preventDefault(); runSearch(); } });
}

// First free spot for a w×h block near (cx,cy): expanding ring search over the
// grid, so a new IC never lands on top of an existing block — it appears in
// the nearest clear space instead, easy to spot.
function findFreeSpot(cx, cy, w, h, obstacles){
  const clear = (x,y) => !obstacles.some(r =>
    x < r.x+r.w+GRID && x+w+GRID > r.x && y < r.y+r.h+GRID && y+h+GRID > r.y);
  const x0 = snapG(cx - w/2), y0 = snapG(cy - h/2);
  if (clear(x0, y0)) return { x:x0, y:y0 };
  const STEP = 2*GRID;
  for (let ring=1; ring<60; ring++){
    for (let j=-ring; j<=ring; j++) for (let i=-ring; i<=ring; i++){
      if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;   // perimeter only
      const x = x0 + i*STEP, y = y0 + j*STEP;
      if (clear(x, y)) return { x, y };
    }
  }
  return { x:x0, y:y0 };
}
// The sheet the new IC will land on: the open group's members (and portals) in
// the drill-down, or the UNGROUPED bucket's members at the top level.
function newIcObstacles(){
  if (!isTopLevel()) return openGroupObstacleRects();
  const g = groupsWithUngrouped().find(x=>x.id===UNGROUPED_ID);
  const memberSet = new Set(g ? g.members : []);
  return memberObstacleRects(S.nodes.filter(n=>memberSet.has(n.id)));
}

$('btnAddIC').onclick=()=>{
  const openGroup = !isTopLevel() && S.openGroup!==UNGROUPED_ID
    ? S.groups.find(g=>g.id===S.openGroup) : null;
  openModal('Add IC block', icFormMarkup({}) + `
    <p class="hint">The new block appears in the nearest clear spot to the center of the view. ${openGroup
      ? `It will join the open group "${esc(openGroup.title)}".`
      : 'It will be ungrouped — open a group first if it belongs in one.'}</p>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">Add IC</button>`);
  wireIcFormHandlers();
  $('mOk').onclick=()=>{
    const pn=$('fPN').value.trim();
    if (!pn || !$('fType').value.trim() || !$('fDesc').value.trim()){ toast('Part number, type and function are required'); return; }
    if (nodeById(pn)){ toast('A block with this part number already exists'); return; }
    const node = { id:pn, kind:'ic', label:pn, x:0, y:0, w:NODE_W_IC, h:NODE_H_IC,
      data:{ ic_part_number:pn, ic_type:$('fType').value.trim(), manufacturer:$('fMan').value.trim(),
             description:$('fDesc').value.trim(), selection_rationale:$('fRat').value.trim(),
             DatasheetUrl:$('fUrl').value.trim() } };
    // Measure the block as it will ACTUALLY render (header texts + the empty
    // port zone make it larger than the nominal constants) — searching with
    // the nominal size used to let the grown block overlap its neighbours.
    node.w = nodeBlockWidth(node);
    node.h = nodeBlockHeight(node);
    const obstacles = newIcObstacles();
    // Anchor on the sheet the block will appear on: the visible view center in
    // the drill-down, or the UNGROUPED members' midpoint at the top level
    // (the top-level view shows groups — its center means nothing there).
    let cx, cy;
    if (isTopLevel() && obstacles.length){
      cx = (Math.min(...obstacles.map(o=>o.x)) + Math.max(...obstacles.map(o=>o.x+o.w)))/2;
      cy = (Math.min(...obstacles.map(o=>o.y)) + Math.max(...obstacles.map(o=>o.y+o.h)))/2;
    } else {
      const r=svg.getBoundingClientRect();
      const c=toWorld(r.left+r.width/2, r.top+r.height/2);
      cx=c.x; cy=c.y;
    }
    const spot=findFreeSpot(cx, cy, node.w, node.h, obstacles);
    node.x=spot.x; node.y=spot.y;
    S.nodes.push(node);
    if (openGroup){ openGroup.members.push(pn); openGroup.members.sort(); }
    closeModal(); S.sel={type:'node',id:pn}; render();
  };
};

$('btnAddExt').onclick=()=>{
  const openGroup = !isTopLevel() && S.openGroup!==UNGROUPED_ID
    ? S.groups.find(g=>g.id===S.openGroup) : null;
  openModal('Add external block', `
    <div class="kv"><label>Name *</label><input type="text" id="fExtName" placeholder="HV output connector"></div>
    <div class="kv"><label>Description</label><textarea id="fExtDesc" placeholder="One line: what this element is and its role"></textarea></div>
    <p class="hint">External blocks are connectors, batteries, transformers, passive networks — system elements without a designator.
      The new block appears in the nearest clear spot. ${openGroup
      ? `It will join the open group "${esc(openGroup.title)}".`
      : 'It will be ungrouped — open a group first if it belongs in one.'}</p>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">Add external block</button>`);
  $('mCancel').onclick=closeModal;
  $('mOk').onclick=()=>{
    const name=$('fExtName').value.trim();
    if (!name){ toast('A name is required'); return; }
    if (nodeById('EXT:'+name) || S.nodes.some(n=>n.kind==='external' && n.label.toLowerCase()===name.toLowerCase())){
      toast('An external block with this name already exists'); return;
    }
    const node = { id:'EXT:'+name, kind:'external', label:name, x:0, y:0, w:NODE_W_EXT, h:NODE_H_EXT,
      data:{ description:$('fExtDesc').value.trim() } };
    node.w = nodeBlockWidth(node);
    node.h = nodeBlockHeight(node);
    const obstacles = newIcObstacles();
    let cx, cy;
    if (isTopLevel() && obstacles.length){
      cx = (Math.min(...obstacles.map(o=>o.x)) + Math.max(...obstacles.map(o=>o.x+o.w)))/2;
      cy = (Math.min(...obstacles.map(o=>o.y)) + Math.max(...obstacles.map(o=>o.y+o.h)))/2;
    } else {
      const r=svg.getBoundingClientRect();
      const c=toWorld(r.left+r.width/2, r.top+r.height/2);
      cx=c.x; cy=c.y;
    }
    const spot=findFreeSpot(cx, cy, node.w, node.h, obstacles);
    node.x=spot.x; node.y=spot.y;
    commit();
    S.nodes.push(node);
    if (openGroup){ openGroup.members.push(node.id); openGroup.members.sort(); }
    closeModal(); S.sel={type:'node',id:node.id}; render();
  };
};

/* ------------------------------------------------------------------
   ADD NET FROM A BLOCK — the inspector lets an IC/external block join a
   net as an input or output. Offered nets are the ones the block's own
   GROUP already sees (its internal wires plus its boundary crossings) —
   nets internal to other groups are irrelevant noise here — plus a
   "new net" escape hatch that also picks the counterpart block.
   ------------------------------------------------------------------ */
// name → {net, driver, consumers:Set} over every edge touching the group.
function groupNetIndex(gid){
  const g = groupsWithUngrouped().find(x=>x.id===gid);
  const m = new Set(g ? g.members : []);
  const map = new Map();
  for (const e of S.edges){
    if (!m.has(e.source) && !m.has(e.target)) continue;
    for (const n of e.nets){
      if (!map.has(n.name)) map.set(n.name, { net:n, driver:e.source, consumers:new Set() });
      map.get(n.name).consumers.add(e.target);
    }
  }
  return map;
}
// Append a net to the src→tgt edge, creating the edge if needed.
// Returns false (with a toast) when that edge already carries the name.
function addNetToEdge(srcId, tgtId, net){
  let e = S.edges.find(x=>x.source===srcId && x.target===tgtId);
  if (!e){ e = { id:'e'+(S.edgeSeq++), source:srcId, target:tgtId, nets:[] }; S.edges.push(e); }
  if (e.nets.some(x=>x.name===net.name)){ toast('That connection already carries '+net.name); return false; }
  e.nets.push({ name:net.name, type:net.type||'NA', description:net.description||'',
    ...(net.hv!=null ? { hv:!!net.hv } : {}) });
  e.nets.sort((a,b)=>a.name.localeCompare(b.name));
  return true;
}

/* ------------------------------------------------------------------
   NEW FROM/TO PORTAL — the "+" under each portal column. Creates a real
   boundary edge (far block → near block or vice versa); the portal then
   materializes by derivation like every other one. Offered nets: the
   system-level ones (on group-crossing edges) plus this group's own —
   never a net internal to ANOTHER group, that would be irrelevant noise.
   ------------------------------------------------------------------ */
function candidateNetsForPortal(gid){
  const idx = nodeGroupIndex();
  const map = new Map();
  for (const e of S.edges){
    const gs = idx.get(e.source), gt = idx.get(e.target);
    if (gs===gt && gs!==gid) continue;   // internal to another group — excluded
    for (const n of e.nets) if (!map.has(n.name)) map.set(n.name, n);
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function openAddPortalModal(dir){
  const here = groupsWithUngrouped().find(g=>g.id===S.openGroup);
  const others = groupsWithUngrouped().filter(g=>g.id!==S.openGroup && g.members.length);
  if (!here || !others.length){ toast('No other group to connect to'); return; }
  const nets = candidateNetsForPortal(S.openGroup);
  const memberLabel = id => { const x=nodeById(id); return x?x.label:id; };
  const memberOpts = ids => ids.map(id=>`<option value="${esc(id)}">${esc(memberLabel(id))}</option>`).join('');
  openModal(dir==='in' ? 'New FROM connection' : 'New TO connection', `
    <div class="kv"><label>${dir==='in'?'From group':'To group'}</label>
      <select id="apGroup">${others.map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select></div>
    <div class="kv"><label>${dir==='in'?'Driving block (in that group)':'Receiving block (in that group)'}</label>
      <select id="apFar">${memberOpts(others[0].members)}</select></div>
    <div class="kv"><label>${dir==='in'?'Receiving block (in this group)':'Driving block (in this group)'}</label>
      <select id="apNear">${memberOpts(here.members)}</select></div>
    <div class="kv"><label>Net</label>
      <select id="apNet">${nets.map(n=>`<option value="${esc(n.name)}">${esc(n.name)} — ${esc(n.type)}</option>`).join('')}</select></div>
    <p class="hint">${dir==='in'
      ? 'Creates an incoming boundary connection: the FROM portal appears on the left, wired into the receiving block.'
      : 'Creates an outgoing boundary connection: the TO portal appears on the right, fed by the driving block.'}
      Offered nets are the system-level ones plus this group's own — nets internal to other groups are excluded.</p>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">${dir==='in'?'Add FROM':'Add TO'}</button>`);
  $('mCancel').onclick=closeModal;
  $('apGroup').onchange=()=>{
    const g=others.find(x=>x.id===$('apGroup').value);
    $('apFar').innerHTML=memberOpts(g?g.members:[]);
  };
  $('mOk').onclick=()=>{
    const far=$('apFar').value, near=$('apNear').value;
    const net=nets.find(n=>n.name===$('apNet').value);
    if (!far || !near || !net){ toast('Pick both blocks and a net'); return; }
    const src = dir==='in' ? far : near, tgt = dir==='in' ? near : far;
    const existing = S.edges.find(e=>e.source===src && e.target===tgt);
    if (existing && existing.nets.some(x=>x.name===net.name)){ toast('That connection already carries '+net.name); return; }
    commit();
    addNetToEdge(src, tgt, net);
    closeModal(); render();
  };
}

// Renaming a node's id (a replacement changes the part number) has to follow
// every store that keys by node id or by src→tgt node pairs: edges, group
// membership, port orders (the keys INSIDE every order too), port sides and
// per-wire routing lanes. Group-level stores key by group ids — untouched.
function renameNodeId(oldId, newId){
  const n = nodeById(oldId);
  if (!n || oldId===newId) return;
  const renKey = k => k.split('→').map(p=>p===oldId?newId:p).join('→');
  n.id = newId;
  S.edges.forEach(e=>{
    if (e.source===oldId) e.source=newId;
    if (e.target===oldId) e.target=newId;
  });
  S.groups.forEach(g=>{
    if (g.members.includes(oldId)){ g.members = g.members.map(m=>m===oldId?newId:m).sort(); }
  });
  for (const gid of Object.keys(S.groupPortOrder)){
    const mapped = S.groupPortOrder[gid].map(renKey);
    delete S.groupPortOrder[gid];
    S.groupPortOrder[gid===oldId?newId:gid] = mapped;
  }
  for (const k of Object.keys(S.groupPortSides)){
    const m = k.split(/\|(.+)/);
    const nk = (m[0]===oldId?newId:m[0])+'|'+renKey(m[1]);
    if (nk!==k){ S.groupPortSides[nk]=S.groupPortSides[k]; delete S.groupPortSides[k]; }
  }
  for (const k of Object.keys(S.groupEdgeLanes)){
    if (!k.startsWith('n:')) continue;
    const nk = 'n:'+renKey(k.slice(2));
    if (nk!==k){ S.groupEdgeLanes[nk]=S.groupEdgeLanes[k]; delete S.groupEdgeLanes[k]; }
  }
  invalidateGroupPorts();
  _routeCache.clear();
}

// Replace an IC with a newer/different part: same form as Add IC (DigiKey
// search included), but the function and selection rationale carry over from
// the old part (still editable) — only the identity really changes. Every
// connection, port layout and route survives the swap.
function openReplaceICModal(n){
  openModal('Replace '+n.label, icFormMarkup({
    query: n.data.ic_part_number || n.id,
    pn: n.data.ic_part_number || n.id,
    type: n.data.ic_type || '',
    man: n.data.manufacturer || '',
    desc: n.data.description || '',
    rat: n.data.selection_rationale || '',
    url: n.data.DatasheetUrl || ''
  }) + `
    <p class="hint">Replacing keeps every connection, port layout and route of "${esc(n.label)}".
      The function and selection rationale above were carried over from the old part — edit them if the new part changes the story.</p>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">Replace IC</button>`);
  wireIcFormHandlers();
  $('mOk').onclick=()=>{
    const pn=$('fPN').value.trim();
    if (!pn || !$('fType').value.trim() || !$('fDesc').value.trim()){ toast('Part number, type and function are required'); return; }
    if (pn!==n.id && nodeById(pn)){ toast('A block with this part number already exists'); return; }
    commit();
    renameNodeId(n.id, pn);
    n.label = pn;
    n.data = { ...n.data, ic_part_number:pn, ic_type:$('fType').value.trim(), manufacturer:$('fMan').value.trim(),
               description:$('fDesc').value.trim(), selection_rationale:$('fRat').value.trim(),
               DatasheetUrl:$('fUrl').value.trim() };
    closeModal(); S.sel={type:'node',id:pn}; render();
    toast('Replaced — connections and routing kept');
  };
}

// Named so the empty-sheet "+" card can raise the very same dialog as the
// header button — one import path, no duplicated modal.
function openImportModal(){
  openModal('Import', `
    <div class="tabs"><button class="on" id="tabA">System JSON</button><button id="tabB">Saved session</button></div>
    <div id="paneA">
      <p class="hint">Paste the combined system JSON from your n8n pipeline: <span style="font-family:var(--mono)">{"input":…, "contract":…, "groups":…}</span>. Markdown fences and <span style="font-family:var(--mono)">{"output": "..."}</span> wrappers are handled automatically. A bare legacy input JSON (just <span style="font-family:var(--mono)">ic_components</span>, no contract) is also accepted.</p>
      <div class="kv"><label>System JSON (input + contract + groups)</label><textarea id="impSys"></textarea></div>
    </div>
    <div id="paneB" style="display:none">
      <p class="hint">Paste a session JSON previously saved from Export → Save session (keeps positions and edits).</p>
      <div class="kv"><label>Session JSON</label><textarea id="impSess"></textarea></div>
    </div>
  `, `<button id="mCancel">Cancel</button><button class="primary" id="mOk">Import</button>`);
  let mode='A';
  $('tabA').onclick=()=>{ mode='A'; $('tabA').classList.add('on'); $('tabB').classList.remove('on'); $('paneA').style.display=''; $('paneB').style.display='none'; };
  $('tabB').onclick=()=>{ mode='B'; $('tabB').classList.add('on'); $('tabA').classList.remove('on'); $('paneB').style.display=''; $('paneA').style.display='none'; };
  $('mCancel').onclick=closeModal;
  $('mOk').onclick=()=>{
    try{
      if (mode==='A'){
        const raw = tolerantParse($('impSys').value);
        if (!raw || typeof raw!=='object') throw new Error('Not valid JSON');
        let inp, con, groups;
        if (raw.ic_components){
          // legacy: bare architect INPUT pasted alone, no contract
          inp = raw; con = { global_nets:[], external_blocks:[] }; groups = [];
        } else if (raw.input && raw.input.ic_components){
          inp = raw.input; con = raw.contract || { global_nets:[], external_blocks:[] }; groups = raw.groups || [];
        } else {
          throw new Error('Expected {input, contract, groups} (or a legacy input JSON with ic_components)');
        }
        loadFromContract(inp, con, groups);
      } else {
        loadSession(tolerantParse($('impSess').value));
      }
      closeModal(); toast('Imported');
    }catch(err){ toast('Import failed: '+err.message); }
  };
}
$('btnImport').onclick=openImportModal;
$('emptyAdd').onclick=openImportModal;   // the blank sheet's "+" card

$('btnExport').onclick=()=>{
  const pipeline = buildPipelineJSON();
  const session = buildSessionJSON();
  const emptyEdges = S.edges.filter(e=>e.nets.length===0).length;
  openModal('Export', `
    ${emptyEdges?`<p class="hint" style="color:var(--warn)">Note: ${emptyEdges} connection(s) without nets will be omitted from the contract.</p>`:''}
    <div class="tabs"><button class="on" id="tabP">Pipeline input</button><button id="tabS">Save session</button></div>
    <div id="paneP">
      <p class="hint">Feed this JSON to <b>Prepare Blocks</b> (it carries <span style="font-family:var(--mono)">global_contract_override</span>, so the Architect agent is skipped).</p>
      <pre class="out" id="outP"></pre>
    </div>
    <div id="paneS" style="display:none">
      <p class="hint">Keeps node positions and all edits — re-import later via Import → Saved session.</p>
      <pre class="out" id="outS"></pre>
    </div>
  `, `<button id="mCopy">Copy</button><button class="primary" id="mDl">Download</button>`);
  const pTxt=JSON.stringify([pipeline],null,2), sTxt=JSON.stringify(session,null,2);
  $('outP').textContent=pTxt; $('outS').textContent=sTxt;
  let mode='P';
  $('tabP').onclick=()=>{ mode='P'; $('tabP').classList.add('on'); $('tabS').classList.remove('on'); $('paneP').style.display=''; $('paneS').style.display='none'; };
  $('tabS').onclick=()=>{ mode='S'; $('tabS').classList.add('on'); $('tabP').classList.remove('on'); $('paneS').style.display=''; $('paneP').style.display='none'; };
  $('mCopy').onclick=()=>{ navigator.clipboard.writeText(mode==='P'?pTxt:sTxt).then(()=>toast('Copied')); };
  $('mDl').onclick=()=>{
    const blob=new Blob([mode==='P'?pTxt:sTxt],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download= mode==='P' ? 'pipeline_input.json' : 'architecture_session.json';
    a.click(); URL.revokeObjectURL(a.href);
  };
};

/* ============================================================
   EXPORT BUILDERS (deterministic: everything sorted)
   ============================================================ */
function buildPipelineJSON(){
  const ic_components = S.nodes.filter(n=>n.kind==='ic')
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map(n=>({ ic_type:n.data.ic_type||'', description:n.data.description||'',
      manufacturer:n.data.manufacturer||'', ic_part_number:n.data.ic_part_number||n.id,
      DatasheetUrl:n.data.DatasheetUrl||'', selection_rationale:n.data.selection_rationale||'' }));

  const refOf = n => n.kind==='external' ? 'external block: '+n.label : n.id;
  const netMap = new Map();
  const sortedEdges=[...S.edges].sort((a,b)=>(a.source+'|'+a.target).localeCompare(b.source+'|'+b.target));
  for (const e of sortedEdges){
    const src=nodeById(e.source), dst=nodeById(e.target);
    if (!src||!dst) continue;
    for (const net of e.nets){
      if (!netMap.has(net.name))
        netMap.set(net.name, { name:net.name, type:net.type||'NA', source:refOf(src), consumers:[], description:net.description||'',
          ...(net.hv!=null ? { hv:net.hv } : {}) });
      const rec=netMap.get(net.name);
      const c=refOf(dst);
      if (!rec.consumers.includes(c)) rec.consumers.push(c);
      if (!rec.description && net.description) rec.description=net.description;
    }
  }
  const global_nets=[...netMap.values()].sort((a,b)=>a.name.localeCompare(b.name));
  global_nets.forEach(n=>n.consumers.sort());
  const external_blocks = S.nodes.filter(n=>n.kind==='external')
    .sort((a,b)=>a.label.localeCompare(b.label))
    .map(n=>({ name:n.label, description:n.data.description||'' }));

  const groups = [...S.groups].sort((a,b)=>a.id.localeCompare(b.id)).map(g=>({
    id:g.id, title:g.title, description:g.description,
    members:g.members.map(id=>{ const n=nodeById(id); return n?refOf(n):null; })
      .filter(Boolean).sort() }));

  return { id:S.meta.id, title:S.meta.title, description:S.meta.description,
    key_references:S.meta.key_references, ic_components,
    global_contract_override: JSON.stringify({ global_nets, external_blocks }, null, 2),
    groups };
}

function buildSessionJSON(){
  return { meta:S.meta,
    nodes:S.nodes.map(n=>({ ...n })),
    edges:S.edges.map(e=>({ ...e, nets:e.nets.map(x=>({ ...x })), route:e.route?{...e.route}:undefined })),
    groups:S.groups.map(g=>({ ...g, members:[...g.members] })),
    groupPos:{ ...S.groupPos },
    groupEdgeRoutes:{ ...S.groupEdgeRoutes },
    groupPortSides:{ ...S.groupPortSides },
    groupEdgeLanes:{ ...S.groupEdgeLanes },
    groupPortOrder:Object.fromEntries(Object.entries(S.groupPortOrder).map(([k,v])=>[k,[...v]])),
    portalOffsets:JSON.parse(JSON.stringify(S.portalOffsets)),
    portalOrder:JSON.parse(JSON.stringify(S.portalOrder)),
    portalSeq:JSON.parse(JSON.stringify(S.portalSeq)),
    portalAnchor:JSON.parse(JSON.stringify(S.portalAnchor)),
    ungroupedHvFlip:S.ungroupedHvFlip,
    openGroup:S.openGroup,
    // Pan/zoom rides along so a re-imported session opens on the exact same
    // framing. Deliberately NOT read back by restoreState: undoing an edit
    // must not yank the canvas around.
    view:{ ...S.view } };
}

/* ============================================================
   LOAD / BOOT
   ============================================================ */
// Restore a document saved with Export → Save session. The rule is total
// fidelity: every field buildSessionJSON writes is read back here, so blocks,
// portal columns, manual wire routes, port layouts and the framing all come
// back exactly as they were left. Anything missing (older sessions) falls back
// to the same defaults a fresh import would use.
function loadSession(s){
  if (!s || !s.nodes || !s.edges) throw new Error('Not a session JSON (nodes/edges missing)');
  S.meta = s.meta || S.meta;
  S.nodes = s.nodes; S.edges = s.edges; S.groups = s.groups || [];
  S.groupPos = s.groupPos || {}; S.groupEdgeRoutes = s.groupEdgeRoutes || {};
  S.groupPortSides = s.groupPortSides || {}; S.groupPortOrder = s.groupPortOrder || {};
  S.groupEdgeLanes = s.groupEdgeLanes || {};
  S.portalOffsets = s.portalOffsets || {}; S.portalOrder = s.portalOrder || {};
  S.portalSeq = s.portalSeq || {};
  S.portalAnchor = s.portalAnchor || {};
  S.ungroupedHvFlip = s.ungroupedHvFlip || undefined;
  S.openGroup = s.openGroup || null;
  S.edgeSeq = Math.max(0, ...S.edges.map(e=>+String(e.id).replace(/^e/,'')||0)) + 1;
  // Nothing of the outgoing document may leak into the restored one.
  S.sel = null; S.traceNet = null; S.link = null;
  invalidateGroupPorts(); _routeCache.clear();
  autoLayoutGroups(true); // fill in positions only for groups the session didn't have (preserves dragged layout)
  if (!Object.keys(S.groupEdgeLanes).length) assignRouteLanes();
  // A session that carries its framing reopens EXACTLY as it was saved; older
  // ones (no view) still get the fit-to-content default.
  const framed = !!(s.view && s.view.k);
  if (framed) S.view = { tx:+s.view.tx||0, ty:+s.view.ty||0, k:+s.view.k };
  render();
  if (!framed) fitView();
}

function loadFromContract(input, contract, groups){
  S.meta = { id:input.id||null, title:input.title||'', description:input.description||'', key_references:input.key_references||[] };
  S.edgeSeq=0;
  const g = buildGraph(input, contract||{}, groups||[]);
  S.nodes=g.nodes; S.edges=g.edges; S.groups=g.groups;
  S.groupPos={}; S.groupEdgeRoutes={}; S.groupPortSides={}; S.groupPortOrder={}; S.groupEdgeLanes={}; S.portalOffsets={}; S.portalOrder={}; S.portalSeq={}; S.portalAnchor={}; S.ungroupedHvFlip=undefined; S.openGroup=null; S.sel=null;
  autoLayoutAllGroupMembers();
  autoLayoutGroups();
  assignRouteLanes();   // spread the wires apart before the first paint
  HIST.past.length = 0; HIST.future.length = 0;   // a fresh import starts fresh
  render(); fitView();
}

function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200);
}

// Auto-layout acts on the view the user is IN: the system sheet at the top
// level, only the open group's sheet inside a group (autoLayoutGroupMembers
// re-anchors that group's portals and aims its ports itself).
$('btnLayout').onclick=()=>{ commit(); if (isTopLevel()){ autoLayoutGroups(); assignRouteLanes(); } else { autoLayoutGroupMembers(S.openGroup); assignNodeEdgeLanes(); } render(); fitView(); };
$('btnUndo').onclick=undo;
$('btnRedo').onclick=redo;
window.addEventListener('resize', ()=>render());

/* ------------------------------------------------------------------
   INSPECTOR PANEL CHROME — Altium-style pin, auto-hide, resizable width.
   Pinned (default): the panel is always there, exactly as before.
   Unpinned: it folds away after a short idle so the diagram gets the
   whole width, and slides back whenever something is selected (or via
   the drawer tab at the canvas edge). It never hides under the pointer
   or while a field inside it has focus. Session-only, like the theme.
   ------------------------------------------------------------------ */
const INSP_HIDE_MS = 3000, INSP_MIN_W = 260;
// Dragging the panel narrower than this at drop folds it away — the drag
// itself becomes the collapse gesture; INSP_TINY_W lets it visibly shrink
// to almost nothing on the way there.
const INSP_COLLAPSE_W = 120, INSP_TINY_W = 40;
const inspEl = $('inspector'), inspPinBtn = $('inspPin'), inspHandle = $('inspHandle'), inspGrip = $('inspResize');
const insp = { pinned:true, hidden:false, w:340, hideT:null };
function inspSetWidth(w, tiny){
  insp.w = Math.max(tiny ? INSP_TINY_W : INSP_MIN_W, Math.min(Math.round(w), Math.round(window.innerWidth*0.7)));
  inspEl.style.width = insp.w+'px';
  inspEl.style.setProperty('--inspw', insp.w+'px');
}
// insp.hidden is the single source of truth; this projects it onto the DOM —
// the panel's collapsed class and the handle's side/arrow direction.
function inspApply(){
  const was = inspEl.classList.contains('collapsed');
  inspEl.classList.toggle('collapsed', insp.hidden);
  inspHandle.classList.toggle('folded', insp.hidden);
  inspHandle.title = insp.hidden ? 'Show the inspector panel' : 'Hide the inspector panel';
  if (was !== insp.hidden) setTimeout(render, 240);   // board changed size — redraw once the fold ends
}
function inspShow(){ insp.hidden = false; inspApply(); }
// The auto-hide path (idle countdown) — never yanks the panel away mid-use.
// The handle bypasses it: an explicit click hides even a pinned panel.
function inspHide(){
  if (insp.pinned) return;
  if (inspEl.matches(':hover') || inspEl.contains(document.activeElement)){ inspScheduleHide(); return; }
  insp.hidden = true; inspApply();
}
function inspScheduleHide(){
  clearTimeout(insp.hideT);
  if (!insp.pinned) insp.hideT = setTimeout(inspHide, INSP_HIDE_MS);
}
// Called from renderInspector on every render: a live selection brings the
// panel back and buys it a fresh idle window; with nothing selected the
// countdown just keeps running. A pinned panel manually folded via the
// handle stays folded until the handle (or the pin) is clicked again.
function inspOnRender(){
  if (insp.pinned) return;
  if (S.sel) inspShow();
  inspScheduleHide();
}
inspPinBtn.onclick = () => {
  inspPinBtn.blur();   // the focus guard is for form fields, not for the pin itself
  insp.pinned = !insp.pinned;
  inspPinBtn.classList.toggle('pinned', insp.pinned);
  inspPinBtn.title = insp.pinned
    ? 'Unpin — the panel hides itself to maximize the diagram'
    : 'Pin — keep the panel always visible';
  if (insp.pinned){ clearTimeout(insp.hideT); inspShow(); }
  else inspScheduleHide();
};
inspHandle.onclick = () => {
  inspHandle.blur();
  if (insp.hidden){ inspShow(); inspScheduleHide(); }
  else { clearTimeout(insp.hideT); insp.hidden = true; inspApply(); }
};
inspEl.addEventListener('pointerenter', ()=>clearTimeout(insp.hideT));
inspEl.addEventListener('pointerleave', inspScheduleHide);
// Drop end of a resize gesture: a panel dragged down to almost nothing folds
// away (same as clicking the handle), reopening later at its pre-drag width.
function inspFinishResize(startW){
  if (insp.w < INSP_COLLAPSE_W){
    inspSetWidth(Math.max(startW, INSP_MIN_W));
    clearTimeout(insp.hideT);
    insp.hidden = true; inspApply();
  } else {
    inspSetWidth(insp.w);   // re-clamp to the usable minimum
  }
  render();
}
// Left-edge grip: drag to trade canvas for panel. Width applies live (the
// content re-wraps to it); the diagram re-renders once at drop.
inspGrip.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  inspGrip.setPointerCapture(ev.pointerId);
  inspGrip.classList.add('active');
  inspEl.classList.add('resizing');
  const startW = insp.w;
  const move = e => inspSetWidth(window.innerWidth - e.clientX, true);
  const up = () => {
    inspGrip.classList.remove('active');
    inspEl.classList.remove('resizing');
    inspGrip.removeEventListener('pointermove', move);
    inspGrip.removeEventListener('pointerup', up);
    inspFinishResize(startW);
  };
  inspGrip.addEventListener('pointermove', move);
  inspGrip.addEventListener('pointerup', up);
});
inspSetWidth(insp.w);

// Theme is session-only (no localStorage) — index.html seeds the initial value from
// prefers-color-scheme before first paint; this button just flips it at runtime.
function updateThemeButton(){
  const isDark = document.documentElement.dataset.theme==='dark';
  $('btnTheme').textContent = isDark ? 'Light' : 'Dark';
  $('btnTheme').title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
}
$('btnTheme').onclick=()=>{
  document.documentElement.dataset.theme = document.documentElement.dataset.theme==='dark' ? 'light' : 'dark';
  updateThemeButton();
};
updateThemeButton();

// Nothing is loaded at boot — render() paints the empty sheet and raises the
// "+" card, whose click opens Import (see renderEmptyState).
render();
