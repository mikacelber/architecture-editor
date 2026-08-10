'use strict';
/* Export → PDF drawing: one page per sheet (System first, then every group),
   each framed like an Altium schematic sheet — zoned double border, title
   block bottom-right (client / design house / date / initials / project
   title / sheet title / Sheet n of N / size), net-type table bottom-left
   with the on-screen swatches, white pages whatever the editor theme, and
   the diagram centred+maximized above the bottom band. All title-block data
   comes from Project Options on the System panel and rides the session.
   jsPDF itself is vendored for the browser; here it is MOCKED — these checks
   cover the orchestration, the furniture geometry and the data plumbing. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),{runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.SVGElement.prototype.getBBox=function(){ return {x:0,y:0,width:1200,height:800}; };
window.Element.prototype.setPointerCapture=()=>{};
const appSrc=fs.readFileSync('app.js','utf8');
window.eval(appSrc+`
window.__T={get S(){return S;},loadSession,loadFromContract,render,buildSessionJSON,projectOf,
 openProjectOptionsModal,pdfSheetList,sheetNetCounts,exportPdfDrawing,groupsWithUngrouped,
 openGroupView,closeGroupView,undo,commit,PDF_FRAME,PDF_TB,PDF_LEGEND,LEGEND_LABELS,
 NET_CATEGORY_STYLE,CATEGORY_PRIORITY,isGroundNet,netCategory,computeGroupEdges,drillSheet,_routeCache};`);
const T=window.__T,S=T.S,doc=window.document;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();

/* ---------- vendored engine + wiring ---------- */
check('the PDF engine is vendored and loaded before app.js',
  fs.existsSync('lib/jspdf.umd.min.js') && fs.existsSync('lib/svg2pdf.umd.min.js') &&
  /lib\/jspdf\.umd\.min\.js[\s\S]*lib\/svg2pdf\.umd\.min\.js[\s\S]*app\.js/.test(fs.readFileSync('index.html','utf8')));

/* ---------- Project Options: defaults, modal, persistence ---------- */
{
  const p=T.projectOf();
  check('defaults: A3, horizontal, today as dd/mm/yyyy',
    p.pageSize==='A3' && p.orientation==='landscape' && /^\d{2}\/\d{2}\/\d{4}$/.test(p.date));
  S.sel=null; T.render();
  const btn=doc.getElementById('btnProjOpts');
  check('the System panel offers a Project Options button', !!btn);
  btn.onclick();
  check('the modal opens with every title-block field',
    doc.getElementById('modalTitle').textContent==='Project Options' &&
    ['poTitle','poClient','poDesigner','poDate','poInitials'].every(id=>doc.getElementById(id)));
  const fset=doc.querySelector('#modalBody fieldset.subpane');
  check('a "PDF Export Options" sub-window holds size and orientation',
    !!fset && /PDF Export Options/i.test(fset.querySelector('legend').textContent) &&
    !!doc.getElementById('poSize') && !!doc.getElementById('poOrient'));
  check('…defaulting to A3 horizontal',
    doc.getElementById('poSize').value==='A3' && doc.getElementById('poOrient').value==='landscape');
  doc.getElementById('poClient').value='ACME Robotics';
  doc.getElementById('poDesigner').value='NX Design';
  doc.getElementById('poDate').value='10/08/2026';
  doc.getElementById('poInitials').value='M.C.';
  doc.getElementById('poSize').value='A4';
  doc.getElementById('poOrient').value='portrait';
  doc.getElementById('mOk').onclick();
  check('Save stores the options', S.project.client==='ACME Robotics' && S.project.initials==='M.C.' &&
    S.project.pageSize==='A4' && S.project.orientation==='portrait');
  const sess=T.buildSessionJSON();
  check('project options ride the session export', sess.project.client==='ACME Robotics');
  T.undo();
  check('saving them is one undoable edit', !(S.project&&S.project.client));
  T.loadSession(JSON.parse(JSON.stringify(sess)));
  check('…and they come back on session import', S.project.designer==='NX Design');
  S.project={ client:'ACME Robotics', designer:'NX Design', date:'10/08/2026', initials:'M.C.',
              pageSize:'A3', orientation:'landscape' };
}

/* ---------- sheet list + per-sheet net table ---------- */
{
  const sheets=T.pdfSheetList();
  const groups=T.groupsWithUngrouped().filter(g=>g.members.length);
  check('the drawing set is System first, then every group with members',
    sheets[0].gid===null && sheets[0].title==='System' &&
    sheets.length===1+groups.length && groups.every((g,i)=>sheets[i+1].gid===g.id));
  S.openGroup=null; T.render();
  const top=T.sheetNetCounts();
  const wanted={};
  for (const e of T.computeGroupEdges()) for (const n of e.nets)
    if (!T.isGroundNet(n)) wanted[T.netCategory(n)]=(wanted[T.netCategory(n)]||0)+1;
  check('top-level rows match the drawn group connections, ground excluded',
    top.length===Object.keys(wanted).length && top.every(r=>wanted[r.cat]===r.count));
  check('rows carry the on-screen legend labels', top.every(r=>r.label===T.LEGEND_LABELS[r.cat]));
  check('rows follow the legend priority order',
    top.every((r,i)=>!i || T.CATEGORY_PRIORITY.indexOf(r.cat)>T.CATEGORY_PRIORITY.indexOf(top[i-1].cat)));
  const g0=T.groupsWithUngrouped().find(g=>g.members.length);
  S.openGroup=g0.id; T._routeCache.clear(); T.render();
  const drill=T.sheetNetCounts();
  check('a drill sheet counts its own wires (internal + boundary)',
    drill.length>0 && drill.every(r=>r.count>0));
  S.openGroup=null; T._routeCache.clear(); T.render();
}

/* ---------- exportPdfDrawing against a mock engine ---------- */
{
  const calls={ pages:1, svgs:[], texts:[], dashes:0, saved:null, rects:0, themes:[] };
  class MockDoc {
    constructor(opts){ this.opts=opts; this.internal={ pageSize:{
      getWidth:()=>opts.orientation==='landscape'?420:297,
      getHeight:()=>opts.orientation==='landscape'?297:420 } }; }
    addPage(){ calls.pages++; } save(name){ calls.saved=name; }
    setDrawColor(){} setLineWidth(){} setFont(){} setFontSize(){} setTextColor(){} setFillColor(){}
    rect(){ calls.rects++; } line(){}
    setLineDashPattern(d){ if (d&&d.length) calls.dashes++; }
    getTextWidth(t){ return String(t).length*1.6; }
    text(t){ calls.texts.push(String(t)); }
    svg(el,opts){ calls.themes.push(window.document.documentElement.dataset.theme);
      calls.svgs.push({vb:el.getAttribute('viewBox'), ...opts}); return Promise.resolve(); }
  }
  MockDoc.API={ svg:()=>{} };
  window.jspdf={ jsPDF:MockDoc };
  doc.documentElement.dataset.theme='dark';
  const sheets=T.pdfSheetList();
  (async()=>{
    await T.exportPdfDrawing();
    check('one PDF page per sheet, system first', calls.pages===sheets.length);
    check('every page embeds its sheet as vector SVG, inside the frame',
      calls.svgs.length===sheets.length && calls.svgs.every(s=>s.x>=T.PDF_FRAME.inner && s.width>0));
    check('the diagram never invades the bottom band',
      calls.svgs.every(s=>s.y+s.height<=297-T.PDF_FRAME.inner-T.PDF_TB.h+0.001));
    check('pages are rendered under the LIGHT theme (white paper)…',
      calls.themes.length>0 && calls.themes.every(t=>t==='light'));
    check('…and the editor theme comes back afterwards', doc.documentElement.dataset.theme==='dark');
    check('the editor view/openGroup are restored after the export', S.openGroup===null);
    check('the title block prints every Project Options field',
      ['ACME Robotics','NX Design','10/08/2026','M.C.','A3'].every(v=>calls.texts.includes(v)));
    check('every page numbers itself "n of N"',
      sheets.every((x,i)=>calls.texts.includes(`${i+1} of ${sheets.length}`)));
    check('sheet titles appear, System included',
      sheets.every(x=>calls.texts.some(t=>t.startsWith(x.title.slice(0,10)))));
    check('the net table draws its header and dashed swatches',
      calls.texts.filter(t=>t==='NET TYPE').length===sheets.length && calls.dashes>0);
    check('the file is named after the system', /_drawings\.pdf$/.test(calls.saved));

    /* ---------- Export modal: the PDF tab ---------- */
    doc.getElementById('btnExport').onclick();
    check('Export offers a "PDF drawing" tab', !!doc.getElementById('tabF'));
    doc.getElementById('tabF').onclick();
    check('the PDF tab explains the drawing set and hides Copy',
      doc.getElementById('paneF').style.display!=='none' &&
      doc.getElementById('mCopy').style.display==='none' &&
      doc.getElementById('mDl').textContent==='Generate PDF');
    doc.getElementById('tabS').onclick();
    check('switching back restores Copy/Download',
      doc.getElementById('mCopy').style.display==='' && doc.getElementById('mDl').textContent==='Download');

    console.log('\n'+pass+' passed, '+fail+' failed');
    process.exit(fail?1:0);
  })().catch(e=>{ console.error(e); process.exit(1); });
}
