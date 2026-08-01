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
 nodePortRowsFor,GRID:GRID};`);
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

    /* ---- Replace IC: identity swaps, engineering judgement carries over ---- */
    {
      const old=S.nodes.find(n=>n.kind==='ic' && S.edges.some(e=>e.source===n.id||e.target===n.id));
      const oldId=old.id, oldDesc=old.data.description;
      const touching=S.edges.filter(e=>e.source===oldId||e.target===oldId).length;
      const rowsBefore=T.nodePortRowsFor(oldId).length;
      const grp=S.groups.find(g=>g.members.includes(oldId));
      // the inspector offers Replace ABOVE Delete
      S.sel={ type:'node', id:oldId }; T.render();
      const bodyHtml=doc.getElementById('insBody').innerHTML;
      check('the IC inspector offers "Replace IC…" above the delete button',
        bodyHtml.indexOf('btnReplaceIC')>=0 && bodyHtml.indexOf('btnReplaceIC')<bodyHtml.indexOf('btnDelNode'));
      T.openReplaceICModal(old);
      check('the replace form carries over function and rationale (editable)',
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

    console.log('\n'+pass+' passed, '+fail+' failed');
    process.exit(fail?1:0);
  })().catch(e=>{ console.error(e); process.exit(1); });
}
