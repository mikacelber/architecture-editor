'use strict';
/* Project Options → General: language (English/Español) for the whole editor
   and the light/dark theme — the old header theme button is gone. Plus the
   empty sheet's second card: start a blank diagram from scratch, no import. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
const appSrc=fs.readFileSync('app.js','utf8');
window.eval(appSrc+`
window.__T={get S(){return S;},loadFromContract,render,uiLang,saveUiLang,uiTheme,saveUiTheme,
 applyStaticLang,openProjectOptionsModal,startBlankDiagram,nodeById,icSelected};`);
const T=window.__T,S=T.S,doc=window.document;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};

/* ---------- the header theme button is gone — theme lives in General ---------- */
check('the header no longer carries a theme button',
  !doc.getElementById('btnTheme') && !/id="btnTheme"/.test(fs.readFileSync('index.html','utf8')));
check('index.html seeds the theme from localStorage before first paint',
  /localStorage\.getItem\('ui_theme'\)/.test(fs.readFileSync('index.html','utf8')));
check('the editor boots in English on dark, nothing stored',
  T.uiLang()==='en' && T.uiTheme()==='dark' && doc.documentElement.dataset.theme==='dark');

/* ---------- General is the first sub-window of Project Options ---------- */
T.render();
doc.getElementById('btnProjOpts') || (S.sel=null, T.render());
doc.getElementById('btnProjOpts').onclick();
check('Project Options opens on the General sub-window',
  doc.getElementById('poPaneGeneral').style.display!=='none' &&
  doc.getElementById('poTabGeneral').classList.contains('on'));
check('General offers the language (English/Español) and the theme (dark/light)',
  [...doc.getElementById('poLang').options].map(o=>o.value).join(',')==='en,es' &&
  [...doc.getElementById('poTheme').options].map(o=>o.value).join(',')==='dark,light');

/* ---------- switching to Spanish translates the whole chrome ---------- */
doc.getElementById('poLang').value='es';
doc.getElementById('poTheme').value='light';
doc.getElementById('mOk').onclick();
check('the choice persists in this browser',
  window.localStorage.getItem('ui_lang')==='es' && window.localStorage.getItem('ui_theme')==='light');
check('the theme flips to light immediately', doc.documentElement.dataset.theme==='light');
check('the header buttons speak Spanish',
  doc.getElementById('btnImport').textContent==='Importar' &&
  doc.getElementById('btnExport').textContent==='Exportar' &&
  doc.getElementById('btnAddIC').textContent==='Añadir CI' &&
  doc.getElementById('btnAutoIC').textContent==='Selección auto de CI');
check('the empty-sheet card speaks Spanish',
  doc.querySelector('#emptyState .es-title').textContent==='Ningún sistema cargado' &&
  /Pulsa/.test(doc.querySelector('#emptyState .es-hint').innerHTML) &&
  /Empezar de cero/.test(doc.querySelector('#emptyState [data-k="new"]').textContent));
check('the view tools name themselves in Spanish',
  doc.getElementById('btnZoomIn').title==='Acercar' && doc.getElementById('btnZoomFit').title==='Ajustar el diagrama a la vista');
S.sel=null; T.render();
check('the System panel speaks Spanish',
  doc.getElementById('insEyebrow').textContent==='Sistema' &&
  /Bloques/.test(doc.getElementById('insBody').innerHTML) &&
  /Coste de CIs \(total\)/.test(doc.getElementById('insBody').innerHTML) &&
  /Opciones de proyecto/.test(doc.getElementById('insBody').innerHTML));
check('the breadcrumb speaks Spanish', /Sistema/.test(doc.getElementById('breadcrumb').innerHTML));

/* ---------- a loaded system: status bar + inspector in Spanish ---------- */
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
check('the status bar counts in Spanish',
  /bloques/.test(doc.getElementById('statusBar').innerHTML) &&
  /todos los bloques conectados/.test(doc.getElementById('statusBar').innerHTML) &&
  /sin componente seleccionado/.test(doc.getElementById('statusBar').innerHTML));
check('the legend speaks Spanish', /Potencia/.test(doc.getElementById('legend').innerHTML) &&
  /Conmutación/.test(doc.getElementById('legend').innerHTML));
{
  const ic=S.nodes.find(n=>n.kind==='ic');
  S.sel={type:'node',id:ic.id}; T.render();
  const b=doc.getElementById('insBody').innerHTML;
  check('the IC inspector speaks Spanish (Select IC, warning, labels)',
    doc.getElementById('btnSelectIC').textContent==='Seleccionar CI…' &&
    /Componente aún sin seleccionar/.test(b) && /Fabricante/.test(b) && /Añadir red/.test(b));
  S.sel=null; T.render();
}

/* ---------- back to English: everything restores ---------- */
doc.getElementById('btnProjOpts').onclick();
doc.getElementById('poLang').value='en';
doc.getElementById('poTheme').value='dark';
doc.getElementById('mOk').onclick();
check('English and dark come back the same way',
  doc.getElementById('btnImport').textContent==='Import' &&
  doc.documentElement.dataset.theme==='dark' &&
  doc.getElementById('insEyebrow').textContent==='System');

/* ---------- start from scratch: a blank diagram, no import needed ---------- */
{
  // wipe the loaded system to get the empty card back
  S.nodes.length=0; S.edges.length=0; S.groups.length=0; T.render();
  const empty=doc.getElementById('emptyState'), blank=doc.getElementById('emptyBlank');
  check('the empty card offers BOTH import and start-from-scratch',
    !empty.hidden && !!doc.getElementById('emptyAdd') && !!blank);
  check('the scratch button explains itself', /empty diagram|add ICs by hand/i.test(blank.title));
  blank.onclick();
  check('starting from scratch dismisses the card with zero blocks on the sheet',
    empty.hidden && S.nodes.length===0);
  // the user can now build by hand — Add IC works on the blank sheet
  doc.getElementById('btnAddIC').onclick();
  doc.getElementById('fPN').value='LM317';
  doc.getElementById('fType').value='Adjustable regulator';
  doc.getElementById('fDesc').value='bench supply';
  doc.getElementById('mOk').onclick();
  check('Add IC drops the first block straight onto the blank sheet',
    !!T.nodeById('LM317') && empty.hidden);
  check('the source wires the scratch card to startBlankDiagram',
    /\$\('emptyBlank'\)\.onclick=startBlankDiagram;/.test(appSrc));
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
