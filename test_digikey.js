'use strict';
/* Part search in the Add IC modal — DigiKey AND Mouser: one query fans out to
   both houses, the results merge into a single stock-sorted list (each row
   tagged with its house), picking a part autofills the identity fields and
   leaves the engineering judgement (function / rationale) to the user. A
   Mouser pick has no datasheet, so DigiKey is asked about that part number
   and only its datasheet is borrowed. The network is mocked — this exercises
   normalization, the OAuth/key plumbing, merging, rendering and the wiring. */
const fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('index.html','utf8').replace('<script src="app.js"></script>',''),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});
const {window}=dom;
window.SVGElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1600,height:1000});
window.Element.prototype.setPointerCapture=()=>{};
window.eval(fs.readFileSync('app.js','utf8')+`
window.__T={get S(){return S;},loadFromContract,render,dkNormalizeProducts,dkSearch,dkRenderResults,
 dkConfig,dkSaveConfig,buildSessionJSON,nodeById,findFreeSpot,openReplaceICModal,renameNodeId,
 nodePortRowsFor,isHvNet,shortDatasheetLabel,icSelected,undo,GRID:GRID,
 msNormalizeParts,msSearch,msConfig,msSaveConfig,mergePartResults,resolveDatasheetFor,
 msParsePrice,searchOptions,saveSearchOptions,msCurrencyNote};`);
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

/* ---- Mouser fixture, shaped like a search/partnumber response ---- */
const MFIX={Errors:[],SearchResults:{NumberOfResult:3,Parts:[
  {MouserPartNumber:'579-MS-MID', ManufacturerPartNumber:'MS-MID', Manufacturer:'Microchip',
   Description:'MCU 32-bit', Availability:'4,000 In Stock',
   PriceBreaks:[{Quantity:100,Price:'$1.10',Currency:'USD'},{Quantity:1,Price:'$2.34',Currency:'USD'}]},
  {ManufacturerPartNumber:'MS-HI', Manufacturer:'onsemi', Description:'Schottky diode',
   AvailabilityInStock:'999999', Availability:'999999 In Stock',
   PriceBreaks:[{Quantity:1,Price:'$0.0821',Currency:'USD'}], DataSheetUrl:'https://m/hi.pdf'},
  {MouserPartNumber:'583-GHOST', Manufacturer:'Ghost Corp', Description:'no MPN',
   Availability:'5 In Stock', PriceBreaks:[]}
]}};
const MCRED=JSON.parse(fs.readFileSync('credential/mouser_credentials.json','utf8'));
// A euro-account answer: Mouser's Search API pegs prices to the key's account,
// so this is what a mouser.es key returns even when USD was asked for.
const EUROFIX={Errors:[],SearchResults:{NumberOfResult:1,Parts:[
  {ManufacturerPartNumber:'EU-PART', Manufacturer:'ST', Description:'Reg',
   Availability:'7 In Stock', PriceBreaks:[{Quantity:1,Price:'0,62 €',Currency:'EUR'}]}]}};

/* ---- Mouser normalization + the two-house merge (pure) ---- */
{
  const list=T.msNormalizeParts(MFIX);
  check('Mouser parts without a manufacturer part number are dropped', list.length===2);
  check('Mouser results sorted by stock, highest first — same rule as DigiKey',
    list.map(r=>r.pn).join(',')==='MS-HI,MS-MID');
  check('prose stock ("4,000 In Stock") is parsed to a number', list[1].stock===4000 && list[0].stock===999999);
  check('price comes from the qty-1 break, currency sign stripped',
    list[1].price===2.34 && list[0].price===0.0821);
  check('Mouser rows share the DigiKey row shape (pn/man/desc/stock/price/datasheet)',
    list[0].man==='onsemi' && list[0].desc==='Schottky diode' && list[0].datasheet==='https://m/hi.pdf' &&
    list[1].datasheet==='');
  let threw=null; try{ T.msNormalizeParts({Errors:[{Message:'Invalid apiKey'}]}); }catch(e){ threw=e; }
  check('a Mouser error payload surfaces as an error, named Mouser',
    !!threw && /Mouser: Invalid apiKey/.test(String(threw)));

  const merged=T.mergePartResults(T.dkNormalizeProducts(FIX), list);
  check('merged list interleaves the two houses by stock, highest first',
    merged.map(r=>r.pn).join(',')==='MS-HI,HI-STOCK,MS-MID,MID-STOCK,LOW-STOCK');
  check('every merged row is tagged with its house',
    merged.map(r=>r.src).join(',')==='Mouser,DigiKey,Mouser,DigiKey,DigiKey');
  check('the repo carries a Mouser key per currency — USD and EUR accounts',
    MCRED.api_key_eur==='7b7a3d60-7a68-4328-9f8c-9a16b02e7f3c' &&
    MCRED.api_key_usd==='2ddd6605-e151-4132-9d5b-865bcde6c393');

  // The keys ship with the app — one per currency, nothing to paste.
  ['mouser_api_key','mouser_api_key_usd','mouser_api_key_eur'].forEach(k=>window.localStorage.removeItem(k));
  check('with nothing stored, the keys default to the account keys (one per currency)',
    T.msConfig().eur===MCRED.api_key_eur && T.msConfig().usd===(MCRED.api_key_usd||''));
  {
    const src=fs.readFileSync('app.js','utf8');
    check('the built-in defaults match credential/mouser_credentials.json — they cannot drift',
      src.includes("MS_DEFAULT_KEY_EUR = '"+MCRED.api_key_eur+"'") &&
      src.includes("MS_DEFAULT_KEY_USD = '"+(MCRED.api_key_usd||'')+"'"));
  }
  T.msSaveConfig('','');
  check('emptying the fields on purpose is honoured — the defaults do not creep back',
    T.msConfig().usd==='' && T.msConfig().eur==='');
  T.msSaveConfig('other-usd','other-eur');
  check('keys typed into the settings override the built-in ones',
    T.msConfig().usd==='other-usd' && T.msConfig().eur==='other-eur');
  window.localStorage.removeItem('mouser_api_key_usd');
  window.localStorage.removeItem('mouser_api_key_eur');
  window.localStorage.setItem('mouser_api_key','legacy-eur-key');
  check('a legacy single stored key is read as the EUR key it always was',
    T.msConfig().eur==='legacy-eur-key' && T.msConfig().usd===(MCRED.api_key_usd||''));
  ['mouser_api_key','mouser_api_key_usd','mouser_api_key_eur'].forEach(k=>window.localStorage.removeItem(k));
}

/* ---- a Mouser pick without a datasheet borrows DigiKey's ---- */
(async()=>{
  const ds=T.resolveDatasheetFor;
  check('a row that already has a datasheet keeps it — no lookup fired',
    await ds({pn:'A',datasheet:'https://own.pdf'}, async()=>{throw new Error('must not be called');})==='https://own.pdf');
  check('a missing datasheet is borrowed from the exact part-number match',
    await ds({pn:'X',datasheet:''}, async()=>[{pn:'OTHER',datasheet:'https://o.pdf'},{pn:'X',datasheet:'https://exact.pdf'}])==='https://exact.pdf');
  check('no exact match — the closest hit\'s datasheet serves',
    await ds({pn:'X',datasheet:''}, async()=>[{pn:'X-TR',datasheet:'https://xtr.pdf'},{pn:'Y',datasheet:'https://y.pdf'}])==='https://xtr.pdf');
  check('a failed lookup degrades to no datasheet, never an error',
    await ds({pn:'X',datasheet:''}, async()=>{throw new Error('offline');})==='');
})().catch(e=>{ console.error(e); process.exit(1); });

/* ---- OAuth + search plumbing over a mocked network ---- */
{
  let calls=[]; const reqs=[];
  let MOUSER_PAYLOAD=MFIX;   // swapped to EUROFIX to simulate a euro-pegged key
  const CREDFILE=JSON.parse(fs.readFileSync('credential/digikey_credentials.json','utf8'));
  window.fetch=async (url,opts)=>{
    calls.push(url); reqs.push({ url:String(url), opts });
    if (String(url).includes('digikey_credentials.json'))
      return { ok:true, json:async()=>CREDFILE };
    if (String(url).includes('mouser_credentials.json'))
      return { ok:true, json:async()=>MCRED };
    if (String(url).includes('/oauth2/token'))
      return { ok:true, json:async()=>({ access_token:'TOK', expires_in:600 }) };
    if (String(url).includes('api.mouser.com'))
      return { ok:true, json:async()=>String(url).includes('apiKey=bad-')
        ? { Errors:[{ Message:'Invalid unique identifier.' }] }
        : MOUSER_PAYLOAD };
    // DigiKey keyword search asked about the Mouser-only part: answer with an
    // exact match so the datasheet-borrowing path has something to borrow.
    if (opts && opts.body && String(opts.body).includes('MS-MID'))
      return { ok:true, json:async()=>({ Products:[{ ManufacturerProductNumber:'MS-MID',
        Manufacturer:{Name:'Microchip'}, Description:{ProductDescription:'MCU 32-bit'},
        QuantityAvailable:4000, UnitPrice:2.34, DatasheetUrl:'https://x/ms-mid-from-dk.pdf' }] }) };
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
    check('Add IC modal shows the part search box', !!doc.getElementById('dkQuery') && !!doc.getElementById('dkGo'));
    check('the IC form carries no inline credential fields — settings live in ONE place',
      !doc.getElementById('dkCfgPane') && !doc.getElementById('msKeyUsd') && !doc.getElementById('dkSave'));
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

    /* ---- "Part search API settings" → Project Options › PN search options ---- */
    doc.getElementById('dkCfgOpen').onclick();
    check('the IC form\'s settings link opens Project Options straight at "PN search options"',
      doc.getElementById('modalTitle').textContent==='Project Options' &&
      doc.getElementById('poPaneSearch').style.display!=='none' &&
      doc.getElementById('poPaneParams').style.display==='none');
    check('both distributors are ON by default and the currency is USD',
      doc.getElementById('psUseDk').checked && doc.getElementById('psUseMs').checked &&
      doc.getElementById('psCur').value==='USD');
    check('the pane opens with one Mouser key field per currency, EUR pre-filled',
      doc.getElementById('msKeyEur').value===MCRED.api_key_eur &&
      doc.getElementById('msKeyUsd').value===(MCRED.api_key_usd||''));
    check('…and offers loading the credential/ files', !!doc.getElementById('dkLoadFile'));
    await doc.getElementById('dkLoadFile').onclick();
    check('loading the files fills and saves the DigiKey credentials',
      T.dkConfig().id===CREDFILE.client_id && T.dkConfig().secret===CREDFILE.client_secret);
    check('…and the Mouser keys in the same click', T.msConfig().eur===MCRED.api_key_eur);
    check('the credential file carries both keys', !!CREDFILE.client_id && !!CREDFILE.client_secret);
    doc.getElementById('modalClose').onclick();
    doc.getElementById('btnAddIC').onclick();   // back to the IC form for the blocks below

    /* ---- currency: the euro-format bug is dead, both houses are asked ---- */
    {
      const pp=T.msParsePrice;
      check('the euro-price bug is dead: "0,62 €" parses to 0.62, not 62',
        pp('0,62 €')===0.62 && pp('2,34 €')===2.34);
      check('US and European thousand/decimal formats both parse',
        pp('$1,234.56')===1234.56 && pp('1.234,56 €')===1234.56 &&
        pp('$0.0821')===0.0821 && pp('1,234')===1234);
      check('an unparseable price is null, never NaN', pp('')===null && pp('call us')===null);

      const eu=T.msNormalizeParts(EUROFIX,'EUR');
      check('a euro response normalizes to 0.62 EUR', eu[0].price===0.62 && eu[0].currency==='EUR');
      T.dkRenderResults(eu);
      check('…and renders with the € symbol', doc.querySelector('.dkrow .dkprice').textContent==='€0.6200');

      T.saveSearchOptions({digikey:true,mouser:true,currency:'EUR'});
      await T.msSearch('ldo');
      check('EUR selected → the EUR account key signs the Mouser search (the key IS the currency)',
        reqs[reqs.length-1].url.includes('apiKey='+MCRED.api_key_eur) &&
        !reqs[reqs.length-1].url.includes('currencyCode'));
      await T.dkSearch('ldo');
      check('DigiKey is asked for euros via its locale currency header',
        reqs[reqs.length-1].opts.headers['X-DIGIKEY-Locale-Currency']==='EUR');
      T.saveSearchOptions({digikey:true,mouser:true,currency:'USD'});
      await T.msSearch('ldo');
      check('USD selected → the www.mouser.com account key signs it, no leftover currency params',
        reqs[reqs.length-1].url.includes('apiKey='+MCRED.api_key_usd) &&
        !reqs[reqs.length-1].url.includes('countryCode'));

      // Mouser has NO search currency parameter — a euro-pegged key answers in
      // EUR whatever was asked. The mismatch is called out, never papered over.
      check('a currency mismatch produces an honest note naming the fix',
        /Mouser answered in EUR/.test(T.msCurrencyNote(eu,'USD')) &&
        /www\.mouser\.com/.test(T.msCurrencyNote(eu,'USD')));
      check('…and matching answers produce no note',
        T.msCurrencyNote(eu,'EUR')==='' && T.msCurrencyNote([],'USD')==='' &&
        T.msCurrencyNote(T.msNormalizeParts(MFIX),'USD')==='');
    }

    /* ---- Mouser search plumbing (mocked network) ---- */
    {
      T.msSaveConfig('','');
      let threw=null; try{ await T.msSearch('ldo'); }catch(e){ threw=e; }
      check('Mouser search without any key refuses and points at the settings pane',
        /Mouser API key/.test(String(threw)) && /Part search API settings/.test(String(threw)));
      T.msSaveConfig('test-key-123','');
      check('the Mouser keys round-trip through config storage',
        T.msConfig().usd==='test-key-123' && T.msConfig().eur==='');
      const list=await T.msSearch('ldo');
      const r=reqs[reqs.length-1];
      check('the search hits api.mouser.com/api/v1/search/partnumber with the key in the query',
        r.url.includes('api.mouser.com/api/v1/search/partnumber') && r.url.includes('apiKey=test-key-123'));
      check('…as a SearchByPartRequest POST carrying the typed part number',
        r.opts.method==='POST' && /SearchByPartRequest/.test(r.opts.body) && /"mouserPartNumber":"ldo"/.test(r.opts.body));
      check('Mouser search returns the normalized, stock-sorted list', list[0].pn==='MS-HI');

      /* the Currency choice picks WHICH key is used — with a fallback */
      T.msSaveConfig('usd-key','eur-key');
      T.saveSearchOptions({digikey:true,mouser:true,currency:'USD'});
      await T.msSearch('x');
      check('USD selected → the www.mouser.com key is used',
        reqs[reqs.length-1].url.includes('apiKey=usd-key'));
      T.saveSearchOptions({digikey:true,mouser:true,currency:'EUR'});
      await T.msSearch('x');
      check('EUR selected → the European key is used',
        reqs[reqs.length-1].url.includes('apiKey=eur-key'));
      T.msSaveConfig('','eur-key');
      T.saveSearchOptions({digikey:true,mouser:true,currency:'USD'});
      await T.msSearch('x');
      check('USD selected but no USD key → the EUR key answers instead of nothing',
        reqs[reqs.length-1].url.includes('apiKey=eur-key'));

      /* a key Mouser REJECTS ("Invalid unique identifier") also falls through */
      T.msSaveConfig('bad-usd-key','eur-key');
      const viaFallback=await T.msSearch('x');
      check('a rejected USD key falls back to the EUR key and still answers',
        viaFallback[0].pn==='MS-HI' && reqs[reqs.length-1].url.includes('apiKey=eur-key'));
      T.msSaveConfig('bad-usd-key','');
      let rej=null; try{ await T.msSearch('x'); }catch(e){ rej=e; }
      check('with every key rejected, the error says WHAT to check',
        /Invalid unique identifier/.test(String(rej)) &&
        /SEARCH API key/.test(String(rej)) && /Part search API settings/.test(String(rej)));
      T.saveSearchOptions({digikey:true,mouser:true,currency:'USD'});
      T.msSaveConfig('test-key-123','test-key-123');
    }

    /* ---- ONE search, BOTH houses: the modal's own Search button ---- */
    {
      doc.getElementById('dkQuery').value='ldo';
      await doc.getElementById('dkGo').onclick();
      const st=doc.getElementById('dkStatus').textContent;
      check('one search reports the merged two-house count', /5 parts — highest stock first/.test(st));
      const rows2=[...doc.querySelectorAll('.dkrow')];
      check('merged rows render in global stock order, houses interleaved',
        rows2.map(b=>b.querySelector('.dkpn').textContent).join(',')==='MS-HI,HI-STOCK,MS-MID,MID-STOCK,LOW-STOCK');
      check('each card carries the small house field — DigiKey or Mouser',
        rows2.map(b=>b.querySelector('.dksrc').textContent).join(',')==='Mouser,DigiKey,Mouser,DigiKey,DigiKey');
      // pick the Mouser row that has NO datasheet: DigiKey is asked about that
      // part number and ONLY its datasheet is borrowed
      const msRow=rows2.find(b=>b.querySelector('.dkpn').textContent==='MS-MID');
      msRow.onclick();
      check('picking the Mouser part autofills its identity',
        doc.getElementById('fPN').value==='MS-MID' && doc.getElementById('fMan').value==='MICROCHIP');
      check('…with no datasheet yet (Mouser carries none)', doc.getElementById('fUrl').value==='');
      await new Promise(res=>setTimeout(res,20));
      check('the datasheet arrives from DigiKey for that exact part number',
        doc.getElementById('fUrl').value==='https://x/ms-mid-from-dk.pdf');

      /* ---- the distributor toggles steer which houses a search asks ---- */
      T.saveSearchOptions({digikey:false,mouser:true,currency:'USD'});
      await doc.getElementById('dkGo').onclick();
      const rowsMs=[...doc.querySelectorAll('.dkrow')];
      check('DigiKey OFF: only Mouser rows come back',
        rowsMs.length===2 && rowsMs.every(b=>b.querySelector('.dksrc').textContent==='Mouser'));
      T.saveSearchOptions({digikey:true,mouser:false,currency:'USD'});
      await doc.getElementById('dkGo').onclick();
      const rowsDk=[...doc.querySelectorAll('.dkrow')];
      check('Mouser OFF: only DigiKey rows come back',
        rowsDk.length===3 && rowsDk.every(b=>b.querySelector('.dksrc').textContent==='DigiKey'));
      T.saveSearchOptions({digikey:false,mouser:false,currency:'USD'});
      await doc.getElementById('dkGo').onclick();
      check('both OFF: the search refuses and points at the settings',
        /turned off/i.test(doc.getElementById('dkStatus').textContent) &&
        /Part search API settings/.test(doc.getElementById('dkStatus').textContent));

      /* ---- a euro-pegged key asked for USD: honest note, true symbols ---- */
      MOUSER_PAYLOAD=EUROFIX;
      T.saveSearchOptions({digikey:false,mouser:true,currency:'USD'});
      await doc.getElementById('dkGo').onclick();
      check('the search status calls out the Mouser currency mismatch',
        /Mouser answered in EUR/.test(doc.getElementById('dkStatus').textContent) &&
        /www\.mouser\.com/.test(doc.getElementById('dkStatus').textContent));
      check('…while the rows keep wearing the TRUE currency, never mislabeled',
        doc.querySelector('.dkrow .dkprice').textContent==='€0.6200');
      MOUSER_PAYLOAD=MFIX;
      T.saveSearchOptions({digikey:true,mouser:true,currency:'USD'});
    }

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
        grpNode.innerHTML.includes('var(--warn)') && /need[s]? a part selected/.test(grpNode.innerHTML));

      // the inspector leads with Select IC (right under the name), Replace is gone
      S.sel={ type:'node', id:oldId }; T.render();
      const bodyHtml=doc.getElementById('insBody').innerHTML;
      check('the inspector leads with "Select IC…" and the pending warning',
        bodyHtml.indexOf('btnSelectIC')>=0 &&
        bodyHtml.indexOf('btnSelectIC')<bodyHtml.indexOf('Type') &&
        /Part not selected yet/.test(bodyHtml));
      check('the redundant "Replace IC…" button is gone', !bodyHtml.includes('btnReplaceIC'));
      {
        const css=fs.readFileSync('styles.css','utf8');
        check('while pending, the button itself is amber like the block warning',
          /<button id="btnSelectIC" class="warn"/.test(bodyHtml) &&
          /button\.warn\{border-color:var\(--warn\);color:var\(--warn\)\}/.test(css));
        // the panel's generic paragraph rule must not out-rank the warning
        check('the pending note is amber too, not panel grey',
          /#inspector \.body p\.icwarn[^{]*\{color:var\(--warn\)/.test(css));
      }

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
      check('once picked, the button drops the amber', !/id="btnSelectIC" class="warn"/.test(body2));
      check('the chosen card carries a "✕" to drop the part', body2.includes('btnClearIC'));
      check('the chosen card names its house — a DigiKey pick (or a legacy one) says DigiKey',
        body2.includes('class="dksrc">DigiKey<'));
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

    /* ---- a Mouser pick rides the block: house badge, datasheet, session ---- */
    {
      T.openReplaceICModal(T.nodeById('NEWPART-123'));
      T.dkRenderResults(T.mergePartResults(T.dkNormalizeProducts(FIX), T.msNormalizeParts(MFIX)));
      const row=[...doc.querySelectorAll('.dkrow')].find(b=>b.querySelector('.dkpn').textContent==='MS-HI');
      row.onclick();
      doc.getElementById('fDesc').value='output rectifier';
      doc.getElementById('mOk').onclick();
      const picked=T.nodeById('MS-HI');
      check('picking a Mouser result selects the part, house recorded',
        !!picked && T.icSelected(picked) && picked.data.dk.src==='Mouser' && picked.data.dk.price===0.0821);
      check('a Mouser datasheet (when it has one) fills the block\'s field',
        picked.data.DatasheetUrl==='https://m/hi.pdf' && picked.data.dk.datasheet==='https://m/hi.pdf');
      S.sel={ type:'node', id:'MS-HI' }; T.render();
      const b3=doc.getElementById('insBody').innerHTML;
      check('the chosen card wears the Mouser badge', b3.includes('class="dksrc">Mouser<'));
      check('the house rides the session export',
        T.buildSessionJSON().nodes.find(x=>x.id==='MS-HI').data.dk.src==='Mouser');
    }

    /* ---- every message is provider-neutral now, the DK API untouched ---- */
    {
      const src=fs.readFileSync('app.js','utf8');
      check('the search UI names both houses and the settings pane is provider-neutral',
        /Search DigiKey \+ Mouser by part number/.test(src) && /Part search API settings/.test(src));
      check('no warning claims DigiKey is the only house any more',
        !/Part not selected on DigiKey/.test(src) && !/the DigiKey part selected/.test(src) &&
        !/needs its DigiKey selection/.test(src));
      check('the pending note offers both houses', /on DigiKey or Mouser\./.test(src));
      check('the DigiKey API plumbing is untouched — OAuth + v4 keyword search intact',
        /const DK_BASE = 'https:\/\/api\.digikey\.com'/.test(src) &&
        src.includes('/products/v4/search/keyword') && src.includes('grant_type=client_credentials'));
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
