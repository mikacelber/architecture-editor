'use strict';
/* DigiKey part search in the Add IC modal: results sorted by stock (highest
   first), prices shown, picking a part autofills the identity fields and
   leaves the engineering judgement (function / rationale) to the user.
   The network is mocked — this exercises normalization, the OAuth flow
   plumbing, rendering and the autofill wiring. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,dkNormalizeProducts,dkSearch,dkRenderResults,
 dkConfig,dkSaveConfig,buildSessionJSON,nodeById,findFreeSpot,openReplaceICModal,renameNodeId,
 nodePortRowsFor,isHvNet,shortDatasheetLabel,icSelected,undo,GRID:GRID};`);
const T=window.__T, S=T.S;
let pass=0,fail=0; const check=(n,c)=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n);};
const fx=JSON.parse(fs.readFileSync('system.json','utf8'))[0].editor_fixture;
T.loadFromContract(fx.input,fx.contract,fx.groups); T.render();
const doc=window.document;

/* ---- fixture shaped like a DigiKey v4 keyword response ---- */
const FIX={Products:[
  {ManufacturerProductNumber:'LOW-STOCK', Manufacturer:{Name:'Acme'},
   Description:{ProductDescription:'Comparator'}, QuantityAvailable:12, UnitPrice:0.45,
   DatasheetUrl:'https://x/low.pdf'},
  {ManufacturerProductNumber:'HI-STOCK', Manufacturer:{Name:'Texas Instruments'},
   Description:{ProductDescription:'LDO 300mA'}, QuantityAvailable:250000,
   ProductVariations:[{StandardPricing:[{BreakQuantity:100,UnitPrice:0.21},{BreakQuantity:1,UnitPrice:0.5321}]}],
   DatasheetUrl:'https://x/hi.pdf'},
  {ManufacturerPartNumber:'MID-STOCK', Manufacturer:{Value:'Analog Devices'},
   ProductDescription:'Op-amp', QuantityAvailable:900, UnitPrice:1.23, DatasheetUrl:''},
  {Manufacturer:{Name:'NoPN Corp'}, QuantityAvailable:99999}
]};

/* ---- normalization: sorting, prices, liberal field shapes ---- */
{
  const list=T.dkNormalizeProducts(FIX);
  check('parts without a part number are dropped', list.length===3);
  check('results sorted by stock quantity, highest first',
    list.map(r=>r.pn).join(',')==='HI-STOCK,MID-STOCK,LOW-STOCK');
  check('price comes from the qty-1 break when UnitPrice is absent', list[0].price===0.5321);
  check('alternate v4 field shapes are read (ManufacturerPartNumber / Manufacturer.Value)',
    list[1].pn==='MID-STOCK' && list[1].man==='Analog Devices' && list[1].desc==='Op-amp');
}

/* ---- OAuth + search plumbing over a mocked network ---- */
{
  let calls=[];
  const CREDFILE=JSON.parse(fs.readFileSync('credential/digikey_credentials.json','utf8'));
  window.fetch=async (url,opts)=>{
    calls.push(url);
    if (String(url).includes('digikey_credentials.json'))
      return { ok:true, json:async()=>CREDFILE };
    if (String(url).includes('/oauth2/token'))
      return { ok:true, json:async()=>({ access_token:'TOK', expires_in:600 }) };
    return { ok:true, json:async()=>FIX };
  };
  T.dkSaveConfig('my-id','my-secret','');
  check('credentials round-trip through config storage',
    T.dkConfig().id==='my-id' && T.dkConfig().secret==='my-secret');
  (async()=>{
    const list=await T.dkSearch('ldo');
    check('search returns the normalized, stock-sorted list', list[0].pn==='HI-STOCK');
    check('first search authenticates then queries (2 calls)', calls.length===2);
    await T.dkSearch('ldo again');
    check('the OAuth token is cached across searches (3 calls total, not 4)', calls.length===3);
    check('credentials never leak into the session JSON',
      !JSON.stringify(T.buildSessionJSON()).includes('my-secret'));

    /* ---- modal: render + click-to-autofill ---- */
    doc.getElementById('btnAddIC').onclick();
    check('Add IC modal shows the DigiKey search box', !!doc.getElementById('dkQuery') && !!doc.getElementById('dkGo'));
    T.dkRenderResults(T.dkNormalizeProducts(FIX));
    const rows=[...doc.querySelectorAll('.dkrow')];
    check('one row per part, in stock order', rows.length===3 &&
      rows[0].querySelector('.dkpn').textContent==='HI-STOCK');
    check('rows show stock and price', rows[0].querySelector('.dkstock').textContent==='250,000 in stock' &&
      rows[0].querySelector('.dkprice').textContent==='$0.5321');
    rows[0].onclick();
    check('picking a part autofills PN / type / manufacturer / datasheet',
      doc.getElementById('fPN').value==='HI-STOCK' &&
      doc.getElementById('fType').value==='LDO 300mA' &&
      doc.getElementById('fMan').value==='TEXAS INSTRUMENTS' &&
      doc.getElementById('fUrl').value==='https://x/hi.pdf');
    check('function and rationale stay for the user to write',
      doc.getElementById('fDesc').value==='' && doc.getElementById('fRat').value==='');
    check('the picked row is highlighted', rows[0].classList.contains('on'));

    /* ---- datasheet links are printed short, never rewritten ---- */
    {
      const lbl=T.shortDatasheetLabel;
      const TI='https://www.ti.com/general/docs/suppproductinfo.tsp?distId=10&gotoUrl=https%3A%2F%2Fwww.ti.com%2Flit%2Fgpn%2Fbq29712';
      const DK='//mm.digikey.com/Volume0/opasdata/d220001/medias/docus/5099/TPS7A20.pdf';
      check('the printed label is host + document, middle shown as /.../',
        lbl(DK)==='mm.digikey.com/.../TPS7A20.pdf' &&
        lbl('https://www.ti.com/lit/ds/symlink/tps7a20.pdf')==='ti.com/.../tps7a20.pdf');
      check('a redirector is abbreviated, NOT resolved — its own path is what shows',
        lbl(TI)==='ti.com/.../suppproductinfo.tsp');
      check('a single-segment path needs no elision',
        lbl('https://vendor.example/ds.pdf')==='vendor.example/ds.pdf');
      check('even an absurd link stays short enough for the panel',
        lbl('https://www.example.com/a/b/c/d/'+'x'.repeat(120)+'.pdf').length<=46);
      check('text that is not a URL is printed exactly as typed',
        lbl('  see the printed binder  ')==='see the printed binder' && lbl('')==='');

      // NOTHING rewrites the URL itself — not the DigiKey pick, not the form
      const raw={Products:[{ManufacturerProductNumber:'KEEP-ME', Manufacturer:{Name:'TI'},
        Description:{ProductDescription:'LDO'}, QuantityAvailable:5, UnitPrice:1, DatasheetUrl:TI}]};
      check('dkNormalizeProducts hands the form the vendor URL untouched',
        T.dkNormalizeProducts(raw)[0].datasheet===TI);
      const src=fs.readFileSync('app.js','utf8');
      check('no URL-rewriting helper survives in app.js', !/cleanDatasheetUrl/.test(src));
      check('both IC save paths store the field verbatim',
        (src.match(/DatasheetUrl:\$\('fUrl'\)\.value\.trim\(\)/g)||[]).length===2);
      check('the inspector links to the original URL and only shortens the TEXT',
        /href="\$\{esc\(n\.data\.DatasheetUrl\)\}"/.test(src) &&
        /title="\$\{esc\(n\.data\.DatasheetUrl\)\}"/.test(src) &&
        /shortDatasheetLabel\(n\.data\.DatasheetUrl\)/.test(src));
    }

    /* ---- repo-side credential file, selectable from the settings pane ---- */
    check('settings pane offers "Load from credential/digikey_credentials.json"', !!doc.getElementById('dkLoadFile'));
    await doc.getElementById('dkLoadFile').onclick();
    check('loading the file fills and saves the credentials',
      T.dkConfig().id===CREDFILE.client_id && T.dkConfig().secret===CREDFILE.client_secret);
    check('the credential file carries both keys', !!CREDFILE.client_id && !!CREDFILE.client_secret);

    /* ---- a new IC never lands on top of an existing block ---- */
    {
      const blk={ id:'B', x:0, y:0, w:176, h:64 };
      const free=T.findFreeSpot(400, 400, 176, 64, [blk]);
      check('an empty center is used as-is (snapped to the grid)',
        free.x%T.GRID===0 && free.y%T.GRID===0 && Math.abs(free.x-(400-88))<T.GRID);
      const dodged=T.findFreeSpot(88, 32, 176, 64, [blk]);   // center ON the block
      const overlaps=(x,y)=>x<blk.x+blk.w && x+176>blk.x && y<blk.y+blk.h && y+64>blk.y;
      check('an occupied center pushes the new IC to the nearest clear spot', !overlaps(dodged.x, dodged.y));
      check('the dodged spot still sits on the grid', dodged.x%T.GRID===0 && dodged.y%T.GRID===0);
    }

    /* ---- Select IC: warnings until picked, identity swaps, judgement carries ---- */
    {
      const old=S.nodes.find(n=>n.kind==='ic' && S.edges.some(e=>e.source===n.id||e.target===n.id));
      const oldId=old.id, oldDesc=old.data.description;
      const touching=S.edges.filter(e=>e.source===oldId||e.target===oldId).length;
      const rowsBefore=T.nodePortRowsFor(oldId).length;
      const grp=S.groups.find(g=>g.members.includes(oldId));

      // imported ICs are unselected proposals: everything warns
      check('an imported IC counts as NOT selected', !T.icSelected(old));
      check('the status bar counts the unselected ICs',
        /IC[s]? without a selected part/.test(doc.getElementById('statusBar').innerHTML));
      S.openGroup=grp.id; T.render();
      const icNode=[...doc.querySelectorAll(`#nodesG g[data-nid]`)].find(x=>x.dataset.nid===oldId);
      check('the unselected IC block wears the amber warning outline and tag',
        icNode.innerHTML.includes('var(--warn)') && icNode.innerHTML.includes('Part not selected'));
      S.openGroup=null; T.render();
      const grpNode=[...doc.querySelectorAll(`#nodesG g[data-nid]`)].find(x=>x.dataset.nid===grp.id);
      check('its group block warns at the top level too',
        grpNode.innerHTML.includes('var(--warn)') && /need[s]? the DigiKey part selected/.test(grpNode.innerHTML));

      // the inspector leads with Select IC (right under the name), Replace is gone
      S.sel={ type:'node', id:oldId }; T.render();
      const bodyHtml=doc.getElementById('insBody').innerHTML;
      check('the inspector leads with "Select IC…" and the pending warning',
        bodyHtml.indexOf('btnSelectIC')>=0 &&
        bodyHtml.indexOf('btnSelectIC')<bodyHtml.indexOf('Type') &&
        /Part not selected yet/.test(bodyHtml));
      check('the redundant "Replace IC…" button is gone', !bodyHtml.includes('btnReplaceIC'));

      // Select IC opens the DigiKey picker; PICKING a result makes it selected
      doc.getElementById('btnSelectIC').onclick();
      check('Select IC opens the picker prefilled with the part',
        doc.getElementById('modalTitle').textContent.startsWith('Select IC') &&
        doc.getElementById('fPN').value===(old.data.ic_part_number||oldId));
      T.dkRenderResults(T.dkNormalizeProducts(FIX));
      doc.querySelector('.dkrow').onclick();          // pick HI-STOCK from the results
      doc.getElementById('fDesc').value=oldDesc;
      doc.getElementById('mOk').onclick();
      const picked=T.nodeById('HI-STOCK');
      check('picking a result selects the part (dk data stored, price included)',
        !!picked && T.icSelected(picked) && picked.data.dk.pn==='HI-STOCK' && picked.data.dk.price===0.5321);
      S.sel={ type:'node', id:'HI-STOCK' }; T.render();
      const body2=doc.getElementById('insBody').innerHTML;
      check('the chosen part shows under Select IC like a search result',
        body2.includes('dkchosen') && body2.includes('HI-STOCK') && body2.includes('$0.5321') &&
        !/Part not selected yet/.test(body2));
      // the "✕" clears the pick and the warnings come straight back
      doc.getElementById('btnClearIC').onclick();
      check('clearing the part un-selects the IC again', !T.icSelected(T.nodeById('HI-STOCK')));
      S.sel={ type:'node', id:'HI-STOCK' }; T.render();
      check('…and the panel shows the amber button and note again',
        /<button id="btnSelectIC" class="warn"/.test(doc.getElementById('insBody').innerHTML) &&
        /Part not selected yet/.test(doc.getElementById('insBody').innerHTML));
      // restore the pick by hand (undo is covered by the history suite; a
      // restoreState here would swap the node/group objects this test holds)
      T.nodeById('HI-STOCK').data.dk = { pn:'HI-STOCK', man:'Texas Instruments',
        desc:'LDO 300mA', stock:250000, price:0.5321, datasheet:'https://x/hi.pdf' };
      S.openGroup=grp.id; T.render();
      const icNode2=doc.querySelector('#nodesG g[data-nid="HI-STOCK"]');
      check('…and its block warning is gone', !icNode2.innerHTML.includes('Part not selected'));
      S.openGroup=null; T.render();
      check('the selection rides the session export',
        T.buildSessionJSON().nodes.find(n=>n.id==='HI-STOCK').data.dk.pn==='HI-STOCK');
      // put the block back for the identity-swap checks below
      T.openReplaceICModal(T.nodeById('HI-STOCK'));
      doc.getElementById('fPN').value=oldId;
      doc.getElementById('fType').value=old.data.ic_type||'x';
      doc.getElementById('fDesc').value=oldDesc||'x';
      doc.getElementById('mOk').onclick();
      const back=T.nodeById(oldId);
      check('hand-typing a different part number drops the selection again',
        !!back && !T.icSelected(back));

      T.openReplaceICModal(back);
      check('the select form carries over function and rationale (editable)',
        doc.getElementById('fDesc').value===oldDesc &&
        doc.getElementById('fPN').value===(old.data.ic_part_number||oldId));
      doc.getElementById('fPN').value='NEWPART-123';
      doc.getElementById('fType').value='Newer LDO, pin-compatible';
      doc.getElementById('fMan').value='TEXAS INSTRUMENTS';
      doc.getElementById('fUrl').value='https://x/new.pdf';
      doc.getElementById('mOk').onclick();
      const rep=T.nodeById('NEWPART-123');
      check('the node identity switches to the new part', !!rep && rep.label==='NEWPART-123' &&
        rep.data.ic_type==='Newer LDO, pin-compatible' && rep.data.DatasheetUrl==='https://x/new.pdf' && !T.nodeById(oldId));
      check('function and rationale survive the swap', rep.data.description===oldDesc);
      check('every connection follows the new part',
        S.edges.filter(e=>e.source==='NEWPART-123'||e.target==='NEWPART-123').length===touching &&
        !S.edges.some(e=>e.source===oldId||e.target===oldId));
      check('group membership follows the new part', grp.members.includes('NEWPART-123') && !grp.members.includes(oldId));
      check('the port index resolves the new id', T.nodePortRowsFor('NEWPART-123').length===rowsBefore && rowsBefore>0);
    }

    /* ---- importer tolerates LLM-style hv flags (strings / domain alias) ---- */
    {
      T.loadFromContract(
        { id:'t', title:'t', description:'', ic_components:[
          { ic_part_number:'ICA', ic_type:'a', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' },
          { ic_part_number:'ICB', ic_type:'b', description:'', manufacturer:'', DatasheetUrl:'', selection_rationale:'' }] },
        { global_nets:[
          { name:'N1', type:'ANALOG_SIGNAL', source:'ICA', consumers:['ICB'], description:'', hv:'true' },
          { name:'N2', type:'ANALOG_SIGNAL', source:'ICA', consumers:['ICB'], description:'', domain:'HV' },
          { name:'N3', type:'ANALOG_SIGNAL', source:'ICA', consumers:['ICB'], description:'', hv:false }],
          external_blocks:[] },
        []);
      const nets=S.edges.find(e=>e.source==='ICA'&&e.target==='ICB').nets;
      const by=n=>nets.find(x=>x.name===n);
      check('importer reads hv:"true" strings and domain:"HV" aliases (and hv:false)',
        T.isHvNet(by('N1')) && T.isHvNet(by('N2')) && !T.isHvNet(by('N3')) && by('N3').hv===false);
    }

    console.log('\n'+pass+' passed, '+fail+' failed');
    process.exit(fail?1:0);
  })().catch(e=>{ console.error(e); process.exit(1); });
}
