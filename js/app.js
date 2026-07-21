const __otsData = JSON.parse(document.getElementById('ots-data').textContent);
function initApp(DATA){
/* ---------- NPA column map ---------- */
const C = {
  HELPER:0, PROVISION:1, MULTI:2, SOL_ID:3, SOL_DESC:4, CUST_ID:5, ACCT_NO:6,
  NAME:7, ADDR:8, PHONE:9, AADHAR:10, PAN:11, OPN_DT:12, SCHEME:13, SANCT_DT:14,
  SANCT_LIM:15, OUTBAL:16, UNCHG:17, URI:18, ASSET:19, USER_CLASS_DT:20,
  SYS_SUBCLASS:21, SYS_CLASS_DT:22, NPA_DT:23, SB_ACCT:24, SB_BAL:25, REGION:26
};
const NPA_COLUMN_COUNT = 27;
const PROV_RATES = {SUB_STD:.10, DA1:.20, DA2:.30, DA3:1, LOSS:1};

/* ---------- Build indexes once ---------- */
const npaByAcct = new Map();
const npaByHelper = new Map();
const byCustId = new Map();
DATA.npa.rows.forEach(r=>{
  if(r[C.ACCT_NO]!=='') npaByAcct.set(String(r[C.ACCT_NO]), r);
  if(r[C.HELPER]!=='') npaByHelper.set(String(r[C.HELPER]), r);
  const cid = String(r[C.CUST_ID]);
  if(cid && !byCustId.has(cid)) byCustId.set(cid, r);
});
const oldOtsByAcct = new Map();
DATA.oldots.rows.forEach(r=>{
  if(r[0]!=='' && !oldOtsByAcct.has(String(r[0]))) oldOtsByAcct.set(String(r[0]), {date:r[1], amount:r[2]});
});

/* ---------- Date helpers (NPA dates are raw Excel serials) ---------- */
const XL_EPOCH = new Date(1899,11,30);
function excelSerialToDate(n){ return new Date(XL_EPOCH.getTime() + n*86400000); }
function toDate(v){
  if(v===''||v===null||v===undefined) return null;
  if(typeof v==='number') return excelSerialToDate(v);
  if(typeof v==='string'){
    const m = v.split('-');
    if(m.length===3 && m[2].length===4) return new Date(+m[2], +m[1]-1, +m[0]);
    const n = parseFloat(v);
    if(!isNaN(n)) return excelSerialToDate(n);
  }
  return null;
}
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function sameDate(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function daysBetween(a,b){ return Math.round((a-b)/86400000); }
function fmtDate(d){ if(!d) return '—'; return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear(); }
function fmtINR(n){ if(n===''||n===null||n===undefined||isNaN(n)) return '—'; return '₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2}); }
function fmtCr(n){
  if(n===''||n===null||n===undefined||isNaN(n)) return '—';
  const abs = Math.abs(n);
  if(abs>=1e7) return '₹'+(n/1e7).toFixed(2)+' Cr';
  if(abs>=1e5) return '₹'+(n/1e5).toFixed(2)+' L';
  return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function esc(s){ return (s===null||s===undefined)?'':String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const ASSET_LABELS = {SUB_STD:'Substandard asset', DA1:'Doubtful — up to 1 year', DA2:'Doubtful — 1 to 3 years', DA3:'Doubtful — more than 3 years', LOSS:'Loss asset'};
function assetLabel(code){ return ASSET_LABELS[code] || code; }
function titleCase(s){ return String(s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }

updateReportDateDisplay();

/* ---------- Core formula engine (1:1 with the OTS sheet) ---------- */
function computeUCI(os, npaDateRaw, scheme, rate){
  rate = rate===undefined ? 8.5 : rate;
  if(!os || !npaDateRaw) return '';
  const npaDate = toDate(npaDateRaw);
  if(!npaDate) return '';
  const today = new Date();
  let anchor;
  if(scheme==='CC004'){
    const y = npaDate.getFullYear();
    const sep24=new Date(y,8,24), mar24=new Date(y,2,24);
    anchor = npaDate>sep24?sep24:(npaDate>mar24?mar24:new Date(y-1,8,24));
  } else {
    const eom = endOfMonth(npaDate);
    anchor = sameDate(npaDate,eom) ? new Date(npaDate.getFullYear(),npaDate.getMonth(),29) : endOfMonth(new Date(npaDate.getFullYear(),npaDate.getMonth()-1,1));
  }
  return os*rate/100*(daysBetween(today,anchor)/365);
}
function lookupLoanSlot(custId, slotNo){
  const row = npaByHelper.get(custId+':'+slotNo);
  if(!row) return null;
  return {
    acctNo: row[C.ACCT_NO], scheme: row[C.SCHEME]||'', sanctionDate: row[C.SANCT_DT]||'',
    sanctionLimit: row[C.SANCT_LIM]===''?'':row[C.SANCT_LIM], assetCode: row[C.ASSET]||'',
    npaDate: row[C.NPA_DT]||'', osBalance: row[C.OUTBAL]===''?'':row[C.OUTBAL], uri: row[C.URI]===''?0:row[C.URI],
  };
}
function computeSlot(slot){
  if(!slot) return null;
  const today = new Date();
  const npaDate = toDate(slot.npaDate);
  const daysNpa = npaDate ? daysBetween(today, npaDate) : '';
  const os = typeof slot.osBalance==='number' ? slot.osBalance : '';
  const uri = typeof slot.uri==='number' ? slot.uri : 0;
  const uci = os!=='' ? computeUCI(os, slot.npaDate, slot.scheme, 8.5) : '';
  const uci125 = os!=='' ? computeUCI(os, slot.npaDate, slot.scheme, 12.5) : '';
  const totalDues = (os!=='' && uci!=='') ? os+uci : '';
  const totalContractualDues = (os!=='' && uci125!=='') ? os+uci125 : '';
  const netOutstanding = os!=='' ? os-uri : '';
  let provision = '';
  if(netOutstanding!=='' && PROV_RATES[slot.assetCode]!==undefined) provision = netOutstanding*PROV_RATES[slot.assetCode];
  const totalPL = (os!==''&&provision!=='') ? os-uri-provision : '';
  const eligibleCompromise = totalPL!=='' ? Math.max(0,totalPL) : '';
  const ratio = (eligibleCompromise!=='' && os) ? eligibleCompromise/os : '';
  const notEligible = (daysNpa!=='' && daysNpa<=180);
  return {...slot, daysNpa, os, uri, uci, uci125, totalDues, totalContractualDues, netOutstanding, provision, totalPL, eligibleCompromise, ratio, notEligible};
}

/* ---------- Search ---------- */
const SEARCH_MODES = [
  {id:'acct', label:'Account No.', col:C.ACCT_NO, ph:'e.g. 160835110000679'},
  {id:'cust', label:'Cust ID', col:C.CUST_ID, ph:'e.g. 700962400'},
  {id:'mobile', label:'Mobile No.', col:C.PHONE, ph:'e.g. 9876543210'},
  {id:'aadhar', label:'Aadhar No.', col:C.AADHAR, ph:'e.g. 913206620914'},
  {id:'pan', label:'PAN', col:C.PAN, ph:'e.g. BJAPV4204K'},
  {id:'sb', label:'SB No.', col:C.SB_ACCT, ph:'e.g. 152910100005105'},
];
let searchMode = 'acct';
const pillsEl = document.getElementById('modePills');
const searchInputEl = document.getElementById('searchInput');
SEARCH_MODES.forEach(m=>{
  const b = document.createElement('button');
  b.textContent = m.label; b.dataset.mode = m.id;
  if(m.id===searchMode) b.classList.add('active');
  b.onclick = ()=>{
    searchMode=m.id;
    pillsEl.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    searchInputEl.placeholder = m.ph;
    if(searchInputEl.value.trim()) runSearch(); else renderEmpty();
  };
  pillsEl.appendChild(b);
});

const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
searchInput.addEventListener('input', ()=>{ clearBtn.style.display = searchInput.value ? 'flex' : 'none'; });
searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter') runSearch(); });
function clearSearch(){ searchInput.value=''; clearBtn.style.display='none'; renderEmpty(); }

function runSearch(){
  const q = searchInput.value.trim().toLowerCase();
  if(!q){ renderEmpty(); return; }
  const mode = SEARCH_MODES.find(m=>m.id===searchMode);
  const seen = new Set();
  const matches = [];
  for(const r of DATA.npa.rows){
    const val = r[mode.col];
    if(val==='' || val===null) continue;
    if(String(val).toLowerCase().includes(q)){
      const cid = String(r[C.CUST_ID]);
      const key = mode.id==='acct' ? String(r[C.ACCT_NO]) : cid;
      if(seen.has(key)) continue;
      seen.add(key);
      matches.push(r);
      if(matches.length>=60) break;
    }
  }
  renderResults(matches, mode);
}

function renderEmpty(){
  const mode = SEARCH_MODES.find(m=>m.id===searchMode);
  document.getElementById('mainArea').innerHTML = `
    <div class="empty-state">
      <svg class="logo-big" width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <path d="M3 10.5 12 4l9 6.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4.5 10.5V19a1 1 0 0 0 1 1H8v-5.2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V20h2.5a1 1 0 0 0 1-1v-8.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="2.5" y1="20" x2="21.5" y2="20" stroke-linecap="round"/>
      </svg>
      <h2>OTS Calculator</h2>
      <p>Search by ${esc(mode.label)} to view borrower details</p>
    </div>`;
}

function renderResults(matches, mode){
  const el = document.getElementById('mainArea');
  if(!matches.length){
    el.innerHTML = `<div class="results-hint">0 matches found</div>` +
      `<div class="no-results">` +
      `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>` +
      `<div>No borrower matches that ${esc(mode.label)}.<br>Try a different value or search mode.</div></div>`;
    return;
  }
  el.innerHTML = `<div class="results-hint">${matches.length} match${matches.length>1?'es':''} found</div>` +
    `<div class="results-grid">` +
    matches.map(r=>{
      const asset = r[C.ASSET]||'';
      const npaDate = fmtDate(toDate(r[C.NPA_DT]));
      const os = typeof r[C.OUTBAL]==='number' ? r[C.OUTBAL] : '';
      const uri = typeof r[C.URI]==='number' ? r[C.URI] : 0;
      const netOutstanding = os!=='' ? os-uri : '';
      const provision = (netOutstanding!=='' && PROV_RATES[asset]!==undefined) ? netOutstanding*PROV_RATES[asset] : '';
      const totalPL = (os!==''&&provision!=='') ? os-uri-provision : '';
      const custId = String(r[C.CUST_ID]);
      const linkedCount = [1,2,3,4].filter(n=>lookupLoanSlot(custId,n)).length;
      return `
      <div class="result-card" data-asset="${esc(asset)}" onclick="openDetail('${esc(String(r[C.CUST_ID]))}','${esc(String(r[C.ACCT_NO]))}')">
        <div class="result-top">
          <div>
            <div class="result-name">${esc(r[C.NAME])||'—'}</div>
            <div class="result-acc">A/c · ${esc(r[C.ACCT_NO])}</div>
            <div class="result-scheme">${esc(r[C.SOL_DESC])||''}</div>
          </div>
          ${asset?`<span class="badge-pill ${esc(asset)}" title="${esc(assetLabel(asset))}">${esc(asset)}</span>`:''}
        </div>
        <div class="result-grid">
          <div><div class="k">O/S Balance</div><div class="v">${fmtINR(os)}</div></div>
          <div><div class="k">Net O/S</div><div class="v">${netOutstanding!==''?fmtINR(netOutstanding):'—'}</div></div>
          <div><div class="k">Total P&amp;L</div><div class="v v-pl">${totalPL!==''?fmtINR(totalPL):'—'}</div></div>
          <div><div class="k">NPA Date</div><div class="v">${npaDate}</div></div>
          <div><div class="k">Branch</div><div class="v">${esc(r[C.SOL_DESC])||'—'}</div></div>
        </div>
        <div class="result-bottom">
          <span>Cust ID: ${esc(r[C.CUST_ID])} · 🔗 ${linkedCount} account${linkedCount>1?'s':''} linked</span>
          <span class="chev" aria-hidden="true">›</span>
        </div>
      </div>`;
    }).join('') + `</div>`;
}

/* ---------- Detail view ---------- */
let otsAmounts = {}; // key: acctNo -> value
let frozen = {}; // key: acctNo -> bool

function openDetail(custId, jumpAcct){
  const custRow = byCustId.get(custId);
  if(!custRow) return;
  switchView('search');
  const slots = [1,2,3,4].map(n=>{
    const s = lookupLoanSlot(custId, n);
    return s ? computeSlot(s) : null;
  }).filter(Boolean);
  const prevOts = oldOtsByAcct.get(String(custRow[C.ACCT_NO]));

  const pane = document.getElementById('detailPane');
  document.getElementById('shell').classList.add('detail-active');
  pane.classList.add('open');
  pane.innerHTML = `
    <div class="detail-head">
      <div class="detail-headrow">
        <button class="back-btn" onclick="closeDetail()" aria-label="Back to search results">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="detail-headtext">
          <h2>${esc(custRow[C.NAME])||'—'}</h2>
          <p>${esc(custRow[C.SOL_DESC])||''} · Cust ID ${esc(custRow[C.CUST_ID])}</p>
        </div>
        <button class="share-btn" onclick="window.print()" title="Print / Share" aria-label="Print or share this report">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </button>
      </div>
    </div>
    <div class="detail-inner${slots.length>=1?' has-agg':''}">
      ${slots.length>=1?`<aside id="aggBar" aria-label="Account totals">
        <div class="agg-title">${slots.length>1?`All ${slots.length} Accounts`:'This Account'}</div>
        <div class="agg-stat"><span class="ak">Total OTS Amount</span><span class="av" id="aggTotOts">—</span></div>
        <div class="agg-stat"><span class="ak">Total Net O/S</span><span class="av" id="aggTotNetOs">—</span></div>
        <div class="agg-stat"><span class="ak">Total P&amp;L</span><span class="av" id="aggTotPL">—</span></div>
        <div class="agg-stat"><span class="ak">Total Sacrifice</span><span class="av" id="aggTotSac">—</span></div>
        <div class="agg-stat impact"><span class="ak">Total P&amp;L Impact</span><span class="av" id="aggTotImpact">—</span></div>
      </aside>`:''}
      <div id="detailBody" style="padding-top:14px"></div>
    </div>
  `;
  drawDetailBody(custRow, slots, prevOts);
  pane.scrollTop = 0;
}

function closeDetail(){
  const pane = document.getElementById('detailPane');
  pane.classList.remove('open');
  pane.innerHTML = '';
  document.getElementById('shell').classList.remove('detail-active');
  document.getElementById('railLeft').classList.remove('show');
  document.getElementById('railRight').classList.remove('show');
  document.getElementById('eligibleBanner').classList.remove('show');
}

function drawDetailBody(custRow, slots, prevOts){
  const body = document.getElementById('detailBody');
  const totalOS = slots.reduce((a,s)=>a+((s.os!=='')?s.os:0),0);
  const totalDues = slots.reduce((a,s)=>a+((s.totalDues!=='')?s.totalDues:0),0);
  const totalPL = slots.reduce((a,s)=>a+((s.totalPL!=='')?s.totalPL:0),0);
  const totalNetOS = slots.reduce((a,s)=>a+((s.netOutstanding!=='')?s.netOutstanding:0),0);
  const totalContractualDues = slots.reduce((a,s)=>a+((s.totalContractualDues!=='')?s.totalContractualDues:0),0);

  body.innerHTML = `
    <div class="card borrower-card">
      <div class="bname">${esc(custRow[C.NAME])||'—'}</div>
      <div class="baddr">${esc(custRow[C.ADDR])||'—'}</div>
      <div class="info-grid">
        <div><div class="k">Cust ID</div><div class="v">${esc(custRow[C.CUST_ID])||'—'}</div></div>
        <div><div class="k">Sol ID</div><div class="v">${esc(custRow[C.SOL_ID])||'—'}</div></div>
        <div><div class="k">Mobile</div><div class="v">${esc(custRow[C.PHONE])||'—'}</div></div>
        <div><div class="k">Aadhar</div><div class="v">${esc(custRow[C.AADHAR])||'—'}</div></div>
        <div><div class="k">PAN</div><div class="v">${esc(custRow[C.PAN])||'—'}</div></div>
        <div><div class="k">Branch</div><div class="v">${esc(custRow[C.SOL_DESC])||'—'}</div></div>
        <div><div class="k">SB A/C</div><div class="v">${esc(custRow[C.SB_ACCT])||'—'}</div></div>
        <div><div class="k">SB Balance</div><div class="v">${fmtINR(custRow[C.SB_BAL]===''?0:custRow[C.SB_BAL])}</div></div>
      </div>
      ${prevOts?`<div class="linked-note">⏱ Previous OTS on record: ${esc(prevOts.date)} — ${esc(prevOts.amount)}</div>`:''}
      <div class="linked-note">🔗 ${slots.length} loan account${slots.length>1?'s':''} linked</div>
    </div>

    <div class="loans-col">
    <div class="section-label">Loan Accounts</div>
    <div class="section-sub">All accounts side-by-side · Enter OTS amount below</div>

    ${loanTableHTML(slots)}
  </div>
  `;

  window.__slots = slots;
  window.__totalDues = totalDues;
  window.__totalPL = totalPL;
  window.__totalNetOS = totalNetOS;
  window.__totalContractualDues = totalContractualDues;
  window.__totalOS = totalOS;
  window.__custRow = custRow;
  window.__prevOts = prevOts;

  slots.forEach((s,i)=>recalcLoan(i));
  recalcAggregate();

  const notEligibleAccts = slots.filter(s=>s.notEligible).map(s=>s.acctNo);
  const banner = document.getElementById('eligibleBanner');
  if(notEligibleAccts.length){
    document.getElementById('eligibleBannerText').textContent =
      `Not eligible — A/c ${notEligibleAccts.map(a=>esc(String(a))).join(', ')} NPA not aged 6 months`;
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}

function loanTableHTML(slots){
  const cols = slots.map(s=>`
    <th scope="col">
      <div class="lt-acc">A/c · ${esc(s.acctNo)}</div>
      <div class="lt-scheme">${esc(s.scheme)||''}</div>
      ${s.assetCode?`<span class="badge-pill ${esc(s.assetCode)}" title="${esc(assetLabel(s.assetCode))}">${esc(s.assetCode)}</span>`:''}
    </th>`).join('');
  const group = (label) => `<tr class="lt-group"><td colspan="${slots.length+1}">${label}</td></tr>`;
  const row = (label, fn, cls='') => `<tr class="${cls}"><th scope="row" class="lt-label">${label}</th>${slots.map(s=>`<td>${fn(s)}</td>`).join('')}</tr>`;
  const statRow = (label, idPrefix) => `<tr><th scope="row" class="lt-label">${label}</th>${slots.map((s,i)=>`<td id="${idPrefix}-${i}">—</td>`).join('')}</tr>`;
  const otsRow = () => `<tr class="lt-ots-row"><th scope="row" class="lt-label">Settlement (OTS) Amount</th>${slots.map((s,i)=>`
      <td><div class="lt-ots-cell">
        <button type="button" class="freeze-chip lt-freeze${frozen[s.acctNo]?' frozen':(otsAmounts[s.acctNo]?' ready':'')}" id="freezeBtn-${i}"
          onclick="toggleFreeze(${i},'${esc(String(s.acctNo))}')"
          title="${frozen[s.acctNo]?'Frozen — click to edit':'Freeze this OTS amount'}"
          aria-label="${frozen[s.acctNo]?'Unfreeze OTS amount':'Freeze OTS amount'} for account ${esc(String(s.acctNo))}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        </button>
        <span class="lt-cur">₹</span>
        <input type="number" class="lt-ots-input" id="otsInput-${i}" placeholder="0" value="${otsAmounts[s.acctNo]||''}"
          aria-label="OTS amount for account ${esc(String(s.acctNo))}"
          oninput="onOtsInput(${i},'${esc(String(s.acctNo))}')" ${frozen[s.acctNo]?'disabled':''}>
        <span class="pct-tag" id="pctNetOs-${i}"></span>
      </div></td>`).join('')}</tr>`;
  const eligRow = slots.some(s=>s.notEligible) ? `<tr><th scope="row" class="lt-label"></th>${slots.map(s=>`<td>${s.notEligible?'<span class="eligibility-warn">⚠ Not aged 6mo</span>':''}</td>`).join('')}</tr>` : '';

  return `
  <div class="loan-table-wrap">
  <table class="loan-table">
    <thead><tr><th scope="col" class="lt-label">Particulars</th>${cols}</tr></thead>
    <tbody>
      ${eligRow}
      ${group('Loan Terms')}
      ${row('Sanction Date', s=>fmtDate(toDate(s.sanctionDate)))}
      ${row('Sanction Limit', s=>fmtINR(s.sanctionLimit))}
      ${row('NPA Date', s=>fmtDate(toDate(s.npaDate)))}
      ${row('O/S Balance', s=>fmtINR(s.os), 'lt-strong')}
      ${group('Dues &amp; Provisioning')}
      ${row('UCI @ 8.5%', s=>fmtINR(s.uci))}
      ${row('Total Dues', s=>fmtINR(s.totalDues), 'lt-strong')}
      ${row('Total Contractual Dues', s=>fmtINR(s.totalContractualDues), 'lt-strong lt-divider')}
      ${row('Interest Reversal', s=>fmtINR(s.uri))}
      ${row('Net O/S', s=>fmtINR(s.netOutstanding))}
      ${row('Provision', s=>fmtINR(s.provision))}
      ${row('Total P&amp;L', s=>fmtINR(s.totalPL) + (s.ratio!==''?` <span class="pct-tag">(${(s.ratio*100).toFixed(1)}%)</span>`:''), 'lt-strong lt-divider')}
      ${group('Settlement &amp; Impact')}
      ${otsRow()}
      ${statRow('Total Sacrifice','totalSac')}
      ${statRow('Ledger Sacrifice','ledgerSac')}
      ${statRow('BDWO Amount','bdwo')}
      ${statRow('P&amp;L Impact','impact')}
    </tbody>
  </table>
  </div>`;
}

function onOtsInput(i, acctNo){
  const v = document.getElementById('otsInput-'+i).value;
  otsAmounts[acctNo] = v;
  const btn = document.getElementById('freezeBtn-'+i);
  if(btn && !frozen[acctNo]) btn.classList.toggle('ready', v!=='' && !isNaN(parseFloat(v)));
  recalcLoan(i);
  recalcAggregate();
}

function toggleFreeze(i, acctNo){
  const isFrozen = !!frozen[acctNo];
  const v = otsAmounts[acctNo];
  if(!isFrozen && (v===undefined || v==='' || isNaN(parseFloat(v)))) return;
  frozen[acctNo] = !isFrozen;
  const btn = document.getElementById('freezeBtn-'+i);
  const input = document.getElementById('otsInput-'+i);
  if(!input) return;
  if(navigator.vibrate){ try{ navigator.vibrate(frozen[acctNo]?[10,30,14]:12); }catch(e){} }
  if(frozen[acctNo]){
    if(btn){ btn.classList.remove('ready'); btn.classList.add('frozen'); btn.title='Frozen — click to edit'; }
    input.disabled=true;
  } else {
    if(btn){ btn.classList.remove('frozen'); btn.classList.toggle('ready', v!==undefined && v!=='' && !isNaN(parseFloat(v))); btn.title='Freeze this OTS amount'; }
    input.disabled=false; input.focus();
  }
}

const __reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateNumber(el, from, to, render, dur){
  if(el.__raf) cancelAnimationFrame(el.__raf);
  if(__reduceMotion || from===to){ el.textContent = render(to); return; }
  dur = dur || 440;
  const start = performance.now();
  const step = (now)=>{
    const t = Math.min(1,(now-start)/dur);
    const e = 1-Math.pow(1-t,3);
    el.textContent = render(from + (to-from)*e);
    if(t<1){ el.__raf = requestAnimationFrame(step); } else { el.__raf = 0; }
  };
  el.__raf = requestAnimationFrame(step);
}

function recalcLoan(i){
  const s = window.__slots[i];
  const raw = otsAmounts[s.acctNo];
  const ots = (raw==='' || raw===undefined) ? '' : parseFloat(raw);
  const totalSacEl = document.getElementById('totalSac-'+i);
  const ledgerEl = document.getElementById('ledgerSac-'+i);
  const bdwoEl = document.getElementById('bdwo-'+i);
  const impactEl = document.getElementById('impact-'+i);
  const pctEl = document.getElementById('pctNetOs-'+i);
  if(ots===''||isNaN(ots)){
    [totalSacEl,ledgerEl,bdwoEl,impactEl].forEach(e=>e.textContent='—');
    impactEl.classList.remove('pos','neg');
    impactEl.__val = 0;
    if(pctEl) pctEl.textContent='';
    return;
  }
  const totalSac = s.totalContractualDues!=='' ? s.totalContractualDues-ots : '';
  const ledgerSac = s.os!=='' ? s.os-ots : '';
  const bdwo = (ledgerSac!=='' && s.uri!=='') ? ledgerSac-s.uri : '';
  const impact = s.totalPL!=='' ? ots - s.totalPL : '';
  totalSacEl.textContent = fmtINR(totalSac);
  ledgerEl.textContent = fmtINR(ledgerSac);
  bdwoEl.textContent = fmtINR(bdwo);
  if(pctEl) pctEl.textContent = (s.netOutstanding && s.netOutstanding!=='') ? (ots/s.netOutstanding*100).toFixed(1)+'%' : '—';
  impactEl.classList.remove('pos','neg');
  if(impact!=='' && !isNaN(impact)){
    const prev = (typeof impactEl.__val==='number') ? impactEl.__val : 0;
    impactEl.__val = impact;
    animateNumber(impactEl, prev, impact, (v)=>{
      const sign = v>0.5?'+':(v<-0.5?'−':'');
      return sign + fmtINR(Math.abs(v)).replace('₹','₹ ');
    });
    impactEl.classList.add(impact>0?'pos':(impact<0?'neg':''));
  } else {
    impactEl.textContent = fmtINR(impact);
    impactEl.__val = 0;
  }
  impactEl.classList.remove('flash');
  void impactEl.offsetWidth;
  impactEl.classList.add('flash');
}

function recalcAggregate(){
  const slots = window.__slots;
  let totalOts=0, any=false;
  slots.forEach(s=>{
    const v = otsAmounts[s.acctNo];
    if(v!==undefined && v!=='' && !isNaN(parseFloat(v))){ totalOts+=parseFloat(v); any=true; }
  });
  document.getElementById('aggOts') && (document.getElementById('aggOts').textContent = any?fmtINR(totalOts):'—');
  document.getElementById('aggSac') && (document.getElementById('aggSac').textContent = any?fmtINR(window.__totalContractualDues-totalOts):'—');
  const otsTxt = any?fmtINR(totalOts):'—';
  const railOts = document.getElementById('railOts'); if(railOts) railOts.textContent = otsTxt;
  const railOts2 = document.getElementById('railOts2'); if(railOts2) railOts2.textContent = otsTxt;
  const railDues = document.getElementById('railDues'); if(railDues) railDues.textContent = fmtINR(window.__totalDues);
  const railPLLeft = document.getElementById('railPLLeft');
  if(railPLLeft){
    const impact = any ? (totalOts - window.__totalPL) : '';
    railPLLeft.textContent = impact===''?'—':(impact>0?'+':(impact<0?'−':'')) + fmtINR(Math.abs(impact));
    railPLLeft.classList.remove('pos','neg');
    if(impact!==''){ if(impact>0) railPLLeft.classList.add('pos'); else if(impact<0) railPLLeft.classList.add('neg'); }
  }
  const railSac = document.getElementById('railSac'); if(railSac) railSac.textContent = any?fmtINR(window.__totalContractualDues-totalOts):'—';
  // Live aggregate summary panel (shown for multi-account borrowers)
  const aggBarEl = document.getElementById('aggBar');
  if(aggBarEl){
    const pct = (any && window.__totalContractualDues>0) ? Math.max(0,Math.min(100,(totalOts/window.__totalContractualDues)*100)) : 0;
    aggBarEl.style.setProperty('--pct', pct.toFixed(1));
  }
  const aggOtsEl = document.getElementById('aggTotOts');
  if(aggOtsEl){
    aggOtsEl.textContent = otsTxt;
    const aggNetOsEl = document.getElementById('aggTotNetOs');
    if(aggNetOsEl) aggNetOsEl.textContent = fmtINR(window.__totalNetOS);
    const aggPLEl = document.getElementById('aggTotPL');
    if(aggPLEl) aggPLEl.textContent = fmtINR(window.__totalPL);
    const aggSacEl = document.getElementById('aggTotSac');
    if(aggSacEl) aggSacEl.textContent = any?fmtINR(window.__totalContractualDues-totalOts):'—';
    const aggImpEl = document.getElementById('aggTotImpact');
    if(aggImpEl){
      const impact = any ? (totalOts - window.__totalPL) : '';
      aggImpEl.classList.remove('pos','neg');
      if(impact===''){ aggImpEl.textContent='—'; }
      else {
        aggImpEl.textContent = (impact>0?'+':(impact<0?'−':'')) + fmtINR(Math.abs(impact));
        aggImpEl.classList.add(impact>0?'pos':(impact<0?'neg':''));
      }
    }
  }
  renderPrintView();
}

function renderPrintView(){
  const slots = window.__slots; const custRow = window.__custRow;
  if(!slots || !custRow) return;
  const totalOS = slots.reduce((a,s)=>a+((s.os!=='')?s.os:0),0);
  const totalDues = window.__totalDues;

  function otsFor(s){
    const raw = otsAmounts[s.acctNo];
    const v = (raw===''||raw===undefined) ? NaN : parseFloat(raw);
    return isNaN(v) ? null : v;
  }
  let totalOtsSum = 0, anyOts = false;
  slots.forEach(s=>{ const v = otsFor(s); if(v!==null){ totalOtsSum+=v; anyOts=true; } });

  const rows = [
    ['Sanction Date', s=>fmtDate(toDate(s.sanctionDate))],
    ['Sanction Limit', s=>fmtINR(s.sanctionLimit)],
    ['Asset Code', s=>esc(s.assetCode)||'—'],
    ['NPA Date', s=>fmtDate(toDate(s.npaDate))],
    ['Days in NPA', s=>s.daysNpa!==''?s.daysNpa.toLocaleString('en-IN')+' days':'—'],
    ['O/S Balance', s=>fmtINR(s.os)],
    ['UCI @ 8.5%', s=>fmtINR(s.uci)],
    ['Total Dues', s=>fmtINR(s.totalDues)],
    ['Total Contractual Dues', s=>fmtINR(s.totalContractualDues)],
    ['Interest Reversal', s=>fmtINR(s.uri)],
    ['Net O/S', s=>fmtINR(s.netOutstanding)],
    ['Provision', s=>fmtINR(s.provision)],
    ['Total P&L', s=>fmtINR(s.totalPL) + (s.ratio!==''?` (${(s.ratio*100).toFixed(1)}%)`:'')],
    ['OTS Amount', s=>{const v=otsFor(s); return v===null?'—':fmtINR(v);}],
    ['Total Sacrifice', s=>{const v=otsFor(s); return v===null?'—':fmtINR(s.totalContractualDues-v);}],
    ['Ledger Sacrifice', s=>{const v=otsFor(s); return v===null?'—':fmtINR(s.os-v);}],
    ['BDWO Amount', s=>{const v=otsFor(s); return v===null?'—':fmtINR((s.os-v)-s.uri);}],
    ['Impact on P&L', s=>{const v=otsFor(s); return v===null?'—':fmtINR(v-s.totalPL);}],
  ];
  const tableRows = rows.map(([label,fn])=>`<tr><td class="pv-label">${label}</td>${slots.map(s=>`<td>${fn(s)}</td>`).join('')}</tr>`).join('');

  document.getElementById('printArea').innerHTML = `
    <div class="pv-header">
      <div class="pv-title">UPGB OTS CALCULATOR</div>
      <div class="pv-sub">Uttar Pradesh Gramin Bank</div>
      <div class="pv-meta"><span>Report Date: ${fmtDate(new Date())}</span><span>Branch: ${esc(custRow[C.SOL_DESC])||''}</span></div>
    </div>
    <div class="pv-borrower">
      <div class="pv-name">${esc(custRow[C.NAME])||'—'}</div>
      <div class="pv-addr">${esc(custRow[C.ADDR])||'—'}</div>
      <div class="pv-info-grid">
        <div><span class="k">Cust ID</span><span class="v">${esc(custRow[C.CUST_ID])||'—'}</span></div>
        <div><span class="k">Sol ID</span><span class="v">${esc(custRow[C.SOL_ID])||'—'}</span></div>
        <div><span class="k">Mobile</span><span class="v">${esc(custRow[C.PHONE])||'—'}</span></div>
        <div><span class="k">Aadhar</span><span class="v">${esc(custRow[C.AADHAR])||'—'}</span></div>
        <div><span class="k">PAN</span><span class="v">${esc(custRow[C.PAN])||'—'}</span></div>
        <div><span class="k">Branch</span><span class="v">${esc(custRow[C.SOL_DESC])||'—'}</span></div>
        <div><span class="k">SB A/c</span><span class="v">${esc(custRow[C.SB_ACCT])||'—'}</span></div>
        <div><span class="k">SB Balance</span><span class="v">${fmtINR(custRow[C.SB_BAL]===''?0:custRow[C.SB_BAL])}</span></div>
      </div>
    </div>
    <table class="pv-table">
      <thead><tr><th>Particulars</th>${slots.map(s=>`<th>${esc(s.acctNo)}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="pv-agg">
      <div class="pv-agg-title">A G G R E G A T E&nbsp;&nbsp;T O T A L S</div>
      <div class="pv-agg-row"><span>Total O/S Balance</span><span>${fmtINR(totalOS)}</span></div>
      <div class="pv-agg-row"><span>Total Dues</span><span>${fmtINR(totalDues)}</span></div>
      <div class="pv-agg-row"><span>Total OTS Amount</span><span>${anyOts?fmtINR(totalOtsSum):'—'}</span></div>
      <div class="pv-agg-row"><span>Total Sacrifice</span><span>${anyOts?fmtINR(window.__totalContractualDues-totalOtsSum):'—'}</span></div>
    </div>
    <div class="pv-footer">Designed &amp; Developed by ALOK MITTAL · Uttar Pradesh Gramin Bank</div>
    <div class="pv-schemes">${slots.map(s=>`<span>${esc(s.scheme)||''} · ${esc(custRow[C.SOL_DESC])||''}</span>`).join('')}</div>
  `;
}

function toggleUpdateModal(show){
  document.getElementById('updateModalOverlay').classList.toggle('show', show);
  if(!show){
    document.getElementById('uploadStatus').innerHTML='';
    document.getElementById('uploadSummary').innerHTML='';
    document.getElementById('applyDataBtn').disabled = true;
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadDropLabel').textContent = 'Tap to choose the daily NPA file';
    renderValidationReport(null);
    const asOnRow = document.getElementById('asOnDateRow');
    if(asOnRow) asOnRow.style.display = 'none';
    __pendingData = null;
    __pendingAsOnDate = null;
    __lastValidation = null;
  }
}
function openUpdateModal(){ toggleUpdateModal(true); }

let __pendingData = null;
let __pendingMaster = null;
let __masterFileName = null;
let __pendingAsOnDate = null;
let __lastValidation = null;

function xlsxDateToDMY(d){
  return String(d.getUTCDate()).padStart(2,'0')+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+d.getUTCFullYear();
}
function normalizeCell(v){
  if(v instanceof Date) return xlsxDateToDMY(v);
  if(v===undefined || v===null) return '';
  return v;
}
function findSheet(wb, candidates){
  const names = wb.SheetNames;
  for(const cand of candidates){
    const hit = names.find(n=>n.toLowerCase().replace(/[\s_]/g,'')===cand);
    if(hit) return hit;
  }
  return null;
}

function parseCSV(text){
  const rows = []; let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){ if(text[i+1] === '"'){ field+='"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c === '\r'){ /* skip */ }
      else field += c;
    }
  }
  if(field!=='' || row.length){ row.push(field); rows.push(row); }
  return rows;
}
function normHeader(h){ return String(h||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function looksScientific(s){ return /^[0-9]+(\.[0-9]+)?e\+?\d+$/i.test(String(s).trim()); }
function expandSci(s){ const n = Number(s); if(!isFinite(n)) return String(s).trim(); return BigInt(Math.round(n)).toString(); }

/* ---------- Cleaning rules for mobile / PAN / Aadhar (confirmed against real HO data) ---------- */
function cleanMobile(raw){
  const digits = String(raw==null?'':raw).replace(/\D/g,'');
  let ten = null;
  if(digits.length===10) ten = digits;
  else if(digits.length===12 && digits.slice(0,2)==='91') ten = digits.slice(-10);
  if(ten && /^[6-9]/.test(ten)) return ten;
  return 'N/A';
}
function cleanPan(raw){
  const s = String(raw==null?'':raw).trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s) ? s : 'N/A';
}
function cleanAadhar(raw){
  const digits = String(raw==null?'':raw).replace(/\D/g,'');
  return /^\d{12}$/.test(digits) ? digits : 'N/A';
}

/* ---------- As-on date, parsed from the uploaded filename, Admin confirms/edits it ---------- */
function parseAsOnDateFromFilename(filename){
  const name = String(filename||'');
  let m = name.match(/as[_\s]?on[_\s]?(\d{2})(\d{2})(\d{4})/i);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = name.match(/(\d{2})[.\-](\d{2})[.\-](\d{4})/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}
function dateToInputValue(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

/* ---------- HO daily file mapping (works for both .csv and .xlsx, multi-region aware) ----------
   Maps the daily "e-AB NPA AC WISE" CBS export (one row per loan account) into the
   internal NPA_COLUMN_COUNT-wide layout, grouping each customer's accounts into slots 1..N. */
function detectHoHeader(headerCells){
  const header = headerCells.map(normHeader);
  return header.indexOf('accountno')>=0 && header.indexOf('customerid')>=0 && header.indexOf('category')>=0;
}
function parseHoDate(v){
  if(v instanceof Date) return v;
  if(typeof v==='number') return excelSerialToDate(v);
  if(typeof v==='string' && v.trim()){
    let p = v.trim().split('-');
    if(p.length===3 && p[2].length===4) return new Date(+p[2], +p[1]-1, +p[0]);
    p = v.trim().split('.');
    if(p.length===3 && p[2].length===4) return new Date(+p[2], +p[1]-1, +p[0]);
  }
  return null;
}
function earlierRaw(rawA, rawB){
  const dA = parseHoDate(rawA), dB = parseHoDate(rawB);
  if(dA && dB) return dA<=dB ? normalizeCell(rawA) : normalizeCell(rawB);
  if(dA) return normalizeCell(rawA);
  if(dB) return normalizeCell(rawB);
  return '';
}
function cellStr(row, i){ return i>=0 ? String(row[i]==null?'':row[i]).trim() : ''; }

function mapHoRowsToNpa(headerCells, dataRows){
  const header = headerCells.map(normHeader);
  const idx = (name) => header.indexOf(normHeader(name));
  const iSol=idx('sol'), iRegion=idx('region'), iBranch=idx('branch'), iAcct=idx('accountno'),
    iCust=idx('customerid'), iScheme=idx('schemecode'), iName=idx('accountname'), iBal=idx('balanceamount'),
    iNpaDate=idx('accountnpadate'), iCustNpaDate=idx('custnpadate'), iSba=idx('sbaaccbalance'),
    iCategory=idx('category'), iSanctDt=idx('sanctiondate'), iLimit=idx('limit'),
    iMobile=idx('mobileno'), iInttRev=idx('inttrev');

  const missing = [];
  if(iAcct<0) missing.push('Account No');
  if(iCust<0) missing.push('Customer ID');
  if(iCategory<0) missing.push('Category');
  if(iBal<0) missing.push('Balance Amount');
  if(iBranch<0) missing.push('Branch');
  if(missing.length){
    throw new Error('Missing required column(s): '+missing.join(', ')+'. Check this file matches the HO "e-AB NPA AC WISE" export layout.');
  }

  let sciCount = 0;
  let badBalCount = 0;
  let blankCustCount = 0;
  const slotCounter = new Map();
  const outRows = [];
  const regionsSeen = new Set();
  for(const row of dataRows){
    if(!row || row.length<3) continue;
    const acctRaw = cellStr(row, iAcct);
    if(!acctRaw) continue;
    let acctNo = acctRaw;
    if(looksScientific(acctRaw)){ acctNo = expandSci(acctRaw); sciCount++; }
    const custId = cellStr(row, iCust);
    if(!custId){ blankCustCount++; continue; }
    const slot = (slotCounter.get(custId)||0) + 1;
    slotCounter.set(custId, slot);

    const balRaw = row[iBal];
    if(balRaw==null || balRaw==='' || isNaN(parseFloat(balRaw))) badBalCount++;
    const branchRaw = cellStr(row, iBranch);

    let sbAcct='', sbBal='';
    const sbaRaw = cellStr(row, iSba);
    if(sbaRaw.includes('->')){
      const parts = sbaRaw.split('->');
      sbAcct = parts[0].trim();
      sbBal = parseFloat(parts[1]) || 0;
    }
    const cat = cellStr(row, iCategory);
    const region = cellStr(row, iRegion);
    if(region) regionsSeen.add(region);
    const npaDate = earlierRaw(iNpaDate>=0?row[iNpaDate]:'', iCustNpaDate>=0?row[iCustNpaDate]:'');

    const out = new Array(NPA_COLUMN_COUNT).fill('');
    out[0] = custId+':'+slot; out[2] = slot; out[3] = cellStr(row,iSol); out[4] = branchRaw;
    out[5] = custId; out[6] = acctNo; out[7] = cellStr(row,iName);
    out[9] = cellStr(row,iMobile);
    out[13] = cellStr(row,iScheme); out[14] = normalizeCell(iSanctDt>=0?row[iSanctDt]:'');
    out[15] = parseFloat(row[iLimit])||0; out[16] = parseFloat(row[iBal])||0;
    out[18] = (iInttRev>=0 && row[iInttRev]!=='' && row[iInttRev]!=null) ? (parseFloat(row[iInttRev])||0) : '';
    out[19] = cat; out[20] = npaDate; out[21] = cat; out[22] = npaDate; out[23] = npaDate;
    out[24] = sbAcct; out[25] = sbBal; out[26] = region;
    outRows.push(out);
  }
  return { rows: outRows, sciCount, regions: regionsSeen, badBalCount, blankCustCount };
}

/* ---------- Customer Master parsing + merge (Address / Aadhar / PAN, ~80k rows, refreshed rarely) ---------- */
/* Scans the first few rows for the real header (skips title/instruction rows some
   templates — including ours — put above the actual column headers). */
function findHeaderRowIndex(allRows, mustContainAnyNormalized){
  for(let i=0;i<Math.min(10, allRows.length);i++){
    const normed = (allRows[i]||[]).map(normHeader);
    if(mustContainAnyNormalized.some(w=>normed.includes(w))) return i;
  }
  return 0;
}
function buildCustomerMasterMap(headerCells, dataRows){
  const header = headerCells.map(normHeader);
  const idx = (...names) => { for(const n of names){ const i = header.indexOf(normHeader(n)); if(i>=0) return i; } return -1; };
  const iCust = idx('customeridcif','customerid','cif');
  const iAddr = idx('address');
  const iMobile = idx('mobileno','mobile');
  const iAadhar = idx('aadharno','aadhar');
  const iPan = idx('pan');
  if(iCust<0) throw new Error('Customer Master file needs a "Customer ID" column.');
  const map = new Map();
  for(const row of dataRows){
    const cid = cellStr(row, iCust);
    if(!cid || map.has(cid)) continue;
    map.set(cid, {
      address: cellStr(row, iAddr),
      mobile: cleanMobile(row[iMobile]),
      aadhar: cleanAadhar(row[iAadhar]),
      pan: cleanPan(row[iPan]),
    });
  }
  return map;
}
function carryForwardMapFromCurrentData(){
  const map = new Map();
  DATA.npa.rows.forEach(r=>{
    const cid = String(r[C.CUST_ID]||'');
    if(!cid || map.has(cid)) return;
    map.set(cid, { address:r[C.ADDR]||'', mobile:r[C.PHONE]||'', aadhar:r[C.AADHAR]||'', pan:r[C.PAN]||'' });
  });
  return map;
}
function mergeCustomerDetails(npaRows, masterMap, carryForwardMap){
  npaRows.forEach(r=>{
    const cid = String(r[C.CUST_ID]||'');
    const fresh = masterMap ? masterMap.get(cid) : null;
    const prior = carryForwardMap ? carryForwardMap.get(cid) : null;
    const src = fresh || prior;
    r[C.ADDR] = src ? src.address : '';
    r[C.AADHAR] = src ? src.aadhar : 'N/A';
    r[C.PAN] = src ? src.pan : 'N/A';
    const dailyMobileClean = cleanMobile(r[C.PHONE]);
    r[C.PHONE] = dailyMobileClean!=='N/A' ? dailyMobileClean : ((src && src.mobile && src.mobile!=='N/A') ? src.mobile : 'N/A');
  });
}

/* ---------- Validation engine: run before "Apply Update" is enabled ---------- */
function validateNpaRows(rows){
  const errors = [], warnings = [];
  const acctSeen = new Set();
  let dupCount=0, blankBranch=0, blankCust=0, badBal=0, badNpaDate=0, badSanctDate=0;
  rows.forEach(r=>{
    const acct = String(r[C.ACCT_NO]||'');
    if(acct){ if(acctSeen.has(acct)) dupCount++; else acctSeen.add(acct); }
    if(!r[C.SOL_DESC]) blankBranch++;
    if(!r[C.CUST_ID]) blankCust++;
    if(r[C.OUTBAL]===''||r[C.OUTBAL]==null||isNaN(r[C.OUTBAL])) badBal++;
    if(r[C.NPA_DT] && !toDate(r[C.NPA_DT])) badNpaDate++;
    if(r[C.SANCT_DT] && !toDate(r[C.SANCT_DT])) badSanctDate++;
  });
  if(dupCount>0) errors.push(`${dupCount.toLocaleString('en-IN')} duplicate Account No. found.`);
  if(blankBranch>0) errors.push(`${blankBranch.toLocaleString('en-IN')} row(s) have a blank Branch.`);
  if(blankCust>0) errors.push(`${blankCust.toLocaleString('en-IN')} row(s) have a blank Customer ID.`);
  if(badBal>0) errors.push(`${badBal.toLocaleString('en-IN')} row(s) have a missing/non-numeric Balance Amount.`);
  if(badNpaDate>0) warnings.push(`${badNpaDate.toLocaleString('en-IN')} row(s) have an NPA date that couldn't be read.`);
  if(badSanctDate>0) warnings.push(`${badSanctDate.toLocaleString('en-IN')} row(s) have a Sanction date that couldn't be read.`);
  return { ok: errors.length===0, errors, warnings, totalRows: rows.length };
}
function renderValidationReport(result){
  const el = document.getElementById('validationReport');
  if(!el) return;
  if(!result){ el.innerHTML=''; return; }
  const cls = result.ok ? 'ok' : 'err';
  const title = result.ok ? '✔ Validation passed' : '⚠ Validation failed — fix the file before applying';
  let html = `<div class="validation-report ${cls}"><h4>${title}</h4>`;
  if(result.errors.length){
    html += `<ul>${result.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`;
  } else {
    html += `<div style="font-size:12px">${result.totalRows.toLocaleString('en-IN')} rows checked — no duplicate accounts, blank branch/customer/amount, or unreadable dates.</div>`;
  }
  if(result.warnings.length){
    html += `<div style="margin-top:8px;font-size:11.5px;color:var(--sub)">Warnings (won't block Apply):<ul>${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

function processDailyParsed(parsed, filename, statusEl, summaryEl){
  if(parsed.isHoFormat){
    const {rows, sciCount, regions, badBalCount, blankCustCount} = mapHoRowsToNpa(parsed.header, parsed.rows);
    if(!rows.length) throw new Error('No account rows found in this file.');
    const carryForward = carryForwardMapFromCurrentData();
    mergeCustomerDetails(rows, __pendingMaster, carryForward);
    const validation = validateNpaRows(rows);
    if(blankCustCount>0) validation.errors.unshift(`${blankCustCount.toLocaleString('en-IN')} row(s) had a blank Customer ID and were excluded from the upload entirely.`);
    if(badBalCount>0) validation.errors.unshift(`${badBalCount.toLocaleString('en-IN')} row(s) have a missing/non-numeric Balance Amount.`);
    validation.ok = validation.errors.length===0;
    __lastValidation = validation;
    __pendingData = { npa: {headers: DATA.npa.headers, rows}, oldots: DATA.oldots };
    renderValidationReport(validation);

    const sciPct = rows.length ? sciCount/rows.length : 0;
    if(sciPct > 0.3){
      statusEl.innerHTML = `<div class="upload-status err">⚠ ${sciCount.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} account numbers in this file are stored in scientific notation (e.g. 1.51E+14) — the CBS export truncates them, so Account No. search/display will be unreliable after applying. Customer ID and Mobile No. search still work fine. Ask for the "Account No" column to be exported as plain text/number to fix this at the source.</div>`;
    } else {
      statusEl.innerHTML = `<div class="upload-status ok">✔ Parsed successfully${regions.size>1?` — ${regions.size} regions detected`:''}. Review below, then Apply.</div>` +
        (sciCount ? `<div class="upload-status err" style="margin-top:8px">⚠ ${sciCount.toLocaleString('en-IN')} account number(s) were stored in scientific notation and may be missing trailing digits.</div>` : '');
    }
    summaryEl.innerHTML = `
      <div class="upload-summary">
        <div class="box"><div class="k">Loan accounts found</div><div class="v">${rows.length.toLocaleString('en-IN')}</div></div>
        <div class="box"><div class="k">Regions detected</div><div class="v">${regions.size || 1}</div></div>
      </div>`;
    document.getElementById('applyDataBtn').disabled = !validation.ok;

    const guessed = parseAsOnDateFromFilename(filename);
    const row = document.getElementById('asOnDateRow');
    const input = document.getElementById('asOnDateInput');
    const hint = document.getElementById('asOnDateHint');
    if(row && input){
      row.style.display = 'flex';
      if(guessed){
        input.value = dateToInputValue(guessed);
        hint.textContent = '(read from the filename — adjust if this looks wrong)';
      } else if(!input.value){
        input.value = dateToInputValue(new Date());
        hint.textContent = "(couldn't read a date from the filename — please set it)";
      }
      __pendingAsOnDate = input.value;
    }
  } else {
    const wb = parsed.wb;
    const npaSheetName = findSheet(wb, ['npa']);
    if(!npaSheetName){
      throw new Error('This doesn\'t match the daily HO export layout, and no sheet named "NPA" was found for the legacy format either.');
    }
    const npaWs = wb.Sheets[npaSheetName];
    const npaRaw = XLSX.utils.sheet_to_json(npaWs, {header:1, raw:true, defval:''});
    const npaHeaders = (npaRaw[0]||[]).slice(0,NPA_COLUMN_COUNT).map(h=>String(h||''));
    const npaRows = npaRaw.slice(1)
      .filter(r=>r[6]!=='' && r[6]!==undefined && r[6]!==null)
      .map(r=>{ const row=[]; for(let i=0;i<NPA_COLUMN_COUNT;i++) row.push(normalizeCell(r[i])); return row; });

    let oldOtsRows = [];
    const oldOtsSheetName = findSheet(wb, ['oldots']);
    if(oldOtsSheetName){
      const oldWs = wb.Sheets[oldOtsSheetName];
      const oldRaw = XLSX.utils.sheet_to_json(oldWs, {header:1, raw:true, defval:''});
      oldOtsRows = oldRaw.slice(1)
        .filter(r=>r[0]!=='' && r[0]!==undefined && r[0]!==null)
        .map(r=>[normalizeCell(r[0]), normalizeCell(r[1]), normalizeCell(r[2])]);
    }
    const validation = validateNpaRows(npaRows);
    __lastValidation = validation;
    __pendingData = { npa: {headers: npaHeaders, rows: npaRows}, oldots: {headers:['Account Number','Date','Amount'], rows: oldOtsRows} };
    renderValidationReport(validation);
    statusEl.innerHTML = `<div class="upload-status ok">✔ Parsed successfully (legacy workbook format). Review below, then Apply.</div>`;
    summaryEl.innerHTML = `
      <div class="upload-summary">
        <div class="box"><div class="k">NPA rows found</div><div class="v">${npaRows.length.toLocaleString('en-IN')}</div></div>
        <div class="box"><div class="k">OLD OTS rows found</div><div class="v">${oldOtsRows.length.toLocaleString('en-IN')}</div></div>
      </div>`;
    document.getElementById('applyDataBtn').disabled = !validation.ok;
    const row = document.getElementById('asOnDateRow');
    if(row) row.style.display = 'none';
    __pendingAsOnDate = null;
  }
}

function handleFileUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  document.getElementById('uploadDropLabel').textContent = file.name;
  const statusEl = document.getElementById('uploadStatus');
  const summaryEl = document.getElementById('uploadSummary');
  summaryEl.innerHTML = '';
  renderValidationReport(null);
  document.getElementById('applyDataBtn').disabled = true;
  const isCsv = /\.csv$/i.test(file.name);
  statusEl.innerHTML = `<div class="upload-status info">Reading file…</div>`;
  const reader = new FileReader();
  reader.onerror = function(){ statusEl.innerHTML = `<div class="upload-status err">⚠ Failed to read the file from disk.</div>`; };
  reader.onload = function(e){
    try{
      let parsed;
      if(isCsv){
        const csvRows = parseCSV(String(e.target.result));
        parsed = { header: csvRows[0]||[], rows: csvRows.slice(1), isHoFormat: true };
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array', cellDates:true});
        const firstRaw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''});
        const header = firstRaw[0]||[];
        parsed = { header, rows: firstRaw.slice(1), isHoFormat: detectHoHeader(header), wb };
      }
      processDailyParsed(parsed, file.name, statusEl, summaryEl);
    } catch(err){
      statusEl.innerHTML = `<div class="upload-status err">⚠ Could not read this file: ${esc(err.message||err)}</div>`;
    }
  };
  if(isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

function handleMasterFileUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const labelEl = document.getElementById('masterUploadDropLabel');
  if(labelEl) labelEl.textContent = file.name;
  const statusEl = document.getElementById('masterUploadStatus');
  statusEl.innerHTML = `<div class="upload-status info">Reading Customer Master…</div>`;
  const isCsv = /\.csv$/i.test(file.name);
  const reader = new FileReader();
  reader.onerror = function(){ statusEl.innerHTML = `<div class="upload-status err">⚠ Failed to read the file from disk.</div>`; };
  reader.onload = function(e){
    try{
      const headerHints = ['customeridcif','customerid','cif'];
      let header, rows;
      if(isCsv){
        const csvRows = parseCSV(String(e.target.result));
        const hIdx = findHeaderRowIndex(csvRows, headerHints);
        header = csvRows[hIdx]||[]; rows = csvRows.slice(hIdx+1);
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array', cellDates:true});
        const sheetName = wb.SheetNames.find(n=>!/field\s*reference/i.test(n)) || wb.SheetNames[0];
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, raw:true, defval:''});
        const hIdx = findHeaderRowIndex(raw, headerHints);
        header = raw[hIdx]||[]; rows = raw.slice(hIdx+1);
      }
      __pendingMaster = buildCustomerMasterMap(header, rows);
      __masterFileName = file.name;
      const label = document.getElementById('masterStatusLabel');
      if(label) label.textContent = `${__pendingMaster.size.toLocaleString('en-IN')} customers loaded (${file.name})`;
      statusEl.innerHTML = `<div class="upload-status ok">✔ ${__pendingMaster.size.toLocaleString('en-IN')} customer record(s) parsed.</div>`;
      if(__pendingData){
        const carryForward = carryForwardMapFromCurrentData();
        mergeCustomerDetails(__pendingData.npa.rows, __pendingMaster, carryForward);
        const validation = validateNpaRows(__pendingData.npa.rows);
        __lastValidation = validation;
        renderValidationReport(validation);
        document.getElementById('applyDataBtn').disabled = !validation.ok;
      }
    } catch(err){
      statusEl.innerHTML = `<div class="upload-status err">⚠ Could not read this file: ${esc(err.message||err)}</div>`;
    }
  };
  if(isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

function applyNewData(){
  if(!__pendingData || (__lastValidation && !__lastValidation.ok)) return;
  const applyBtn = document.getElementById('applyDataBtn');
  applyBtn.classList.add('is-loading');
  applyBtn.disabled = true;
  setTimeout(()=>{ applyNewDataNow(); applyBtn.classList.remove('is-loading'); }, 10);
}
function applyNewDataNow(){
  DATA.npa = __pendingData.npa;
  if(__pendingData.oldots) DATA.oldots = __pendingData.oldots;
  if(__pendingAsOnDate) DATA.asOnDate = __pendingAsOnDate;

  npaByAcct.clear(); npaByHelper.clear(); byCustId.clear(); oldOtsByAcct.clear();
  DATA.npa.rows.forEach(r=>{
    if(r[C.ACCT_NO]!=='') npaByAcct.set(String(r[C.ACCT_NO]), r);
    if(r[C.HELPER]!=='') npaByHelper.set(String(r[C.HELPER]), r);
    const cid = String(r[C.CUST_ID]);
    if(cid && !byCustId.has(cid)) byCustId.set(cid, r);
  });
  DATA.oldots.rows.forEach(r=>{
    if(r[0]!=='' && !oldOtsByAcct.has(String(r[0]))) oldOtsByAcct.set(String(r[0]), {date:r[1], amount:r[2]});
  });

  otsAmounts = {}; frozen = {};
  updateReportDateDisplay();
  document.getElementById('uploadStatus').innerHTML = `<div class="upload-status ok">✔ Data updated — ${DATA.npa.rows.length.toLocaleString('en-IN')} NPA rows now active.</div>`;
  document.getElementById('downloadAppBtn').disabled = false;
  document.getElementById('searchHeader').style.display='';
  renderEmpty();
  renderDashboard();
  __pendingData = null;
  __pendingAsOnDate = null;
}

function fmtAsOnDisplay(){
  if(DATA.asOnDate){
    const parts = DATA.asOnDate.split('-');
    if(parts.length===3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return fmtDate(new Date());
}
function updateReportDateDisplay(){
  document.querySelectorAll('.report-date-val').forEach(e=>e.textContent = fmtAsOnDisplay());
}

function csvField(v){
  const s = String(v==null?'':v);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function downloadCsvTemplate(filename, headers, exampleRow){
  const csv = [headers.map(csvField).join(','), exampleRow.map(csvField).join(',')].join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
function downloadDailyTemplate(){
  const headers = ['Sol','Region','Branch','Account No','Customer ID','Intt Rev','Scheme Code','Account Name','Balance Amount','Turnover','Interest Charge Amount','Continuous Excess Date','Review Date','KCC Disbursement Date/Stock Date','Due date','Demand Amount','Adjustment Amount','Reasons','Exempted','Account NPA Date','Cust NPA Date','SBA Acc/Balance','Remarks','Category','Prov Amt','CADU','Sanction Date','Limit','Disb Date','ROI','Mobile No','SMA Status','Sec Val','Sec OS','Unsec OS'];
  const example = ['9316','HATHRAS','MAANT','160720303013711','705760143','','AG203','EXAMPLE BORROWER NAME','38155.85','','','','','','','38155.85','','CBS NPA','','30-11-2012','30-11-2012','124610100004372 -> 0','Marked in CBS','DA3','38155.85','1009','23-11-2010','40000','23-11-2011','9','9999999999','SMA0','80000','38155.85','0'];
  downloadCsvTemplate('UPGB_Daily_NPA_Template.csv', headers, example);
}
function downloadMasterTemplate(){
  const headers = ['Customer ID (CIF)','Customer Name','Address','Mobile No','Aadhar No','PAN'];
  const example = ['705760143','EXAMPLE BORROWER NAME','VILL EXAMPLE, POST EXAMPLE, DISTRICT, UP - 000000','9999999999','123456789012','ABCDE1234F'];
  downloadCsvTemplate('UPGB_Customer_Master_Template.csv', headers, example);
}

function downloadUpdatedApp(){
  const dataEl = document.getElementById('ots-data');
  if(dataEl) dataEl.textContent = JSON.stringify({ npa: DATA.npa, oldots: DATA.oldots, asOnDate: DATA.asOnDate||null });
  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'UPGB_OTS_Intelligence_Platform_updated.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}

/* ---------- Cmd+K quick search palette ---------- */
const cmdkOverlay=document.getElementById('cmdkOverlay'), cmdkInput=document.getElementById('cmdkInput'), cmdkResults=document.getElementById('cmdkResults'), cmdkClose=document.getElementById('cmdkClose');
let cmdkMatches=[], cmdkActive=0;
function openCmdk(){ if(!cmdkOverlay) return; cmdkOverlay.classList.add('show'); cmdkInput.value=''; renderCmdk(''); setTimeout(()=>cmdkInput.focus(),30); }
function closeCmdk(){ if(cmdkOverlay) cmdkOverlay.classList.remove('show'); }
function renderCmdk(q){
  q=String(q||'').trim().toLowerCase();
  const out=[]; const seen=new Set();
  if(q){
    for(const r of DATA.npa.rows){
      const name=String(r[C.NAME]||'').toLowerCase(), acct=String(r[C.ACCT_NO]||'').toLowerCase(),
        cust=String(r[C.CUST_ID]||'').toLowerCase(), ph=String(r[C.PHONE]||'').toLowerCase();
      if(name.includes(q)||acct.includes(q)||cust.includes(q)||ph.includes(q)){
        const cid=String(r[C.CUST_ID]); if(seen.has(cid)) continue; seen.add(cid); out.push(r);
        if(out.length>=12) break;
      }
    }
  }
  cmdkMatches=out; cmdkActive=0;
  if(!q){ cmdkResults.innerHTML='<div class="cmdk-empty">Type a name, account no., customer ID or mobile…</div>'; return; }
  if(!out.length){ cmdkResults.innerHTML='<div class="cmdk-empty">No borrower found for that.</div>'; return; }
  cmdkResults.innerHTML=out.map((r,idx)=>{
    const asset=r[C.ASSET]||''; const initials=(String(r[C.NAME]||'?').trim().charAt(0)||'?').toUpperCase();
    return `<div class="cmdk-item${idx===0?' active':''}" data-idx="${idx}">
      <div class="ci-ic">${esc(initials)}</div>
      <div class="ci-main"><div class="ci-name">${esc(r[C.NAME])||'—'}</div>
        <div class="ci-sub">A/c ${esc(r[C.ACCT_NO])} · ${esc(r[C.SOL_DESC])||''} · Cust ${esc(r[C.CUST_ID])}</div></div>
      ${asset?`<span class="badge-pill ci-badge ${esc(asset)}">${esc(asset)}</span>`:''}
    </div>`;
  }).join('');
  cmdkResults.querySelectorAll('.cmdk-item').forEach(it=>{
    it.addEventListener('click',()=>pickCmdk(+it.dataset.idx));
    it.addEventListener('mousemove',()=>setCmdkActive(+it.dataset.idx));
  });
}
function setCmdkActive(idx){ cmdkActive=idx; cmdkResults.querySelectorAll('.cmdk-item').forEach(it=>it.classList.toggle('active',+it.dataset.idx===idx)); }
function pickCmdk(idx){ const r=cmdkMatches[idx]; if(!r) return; closeCmdk(); openDetail(String(r[C.CUST_ID])); }
function cmdkEnsureVisible(){ const el=cmdkResults.querySelector('.cmdk-item.active'); if(el) el.scrollIntoView({block:'nearest'}); }
if(cmdkOverlay){
  cmdkInput.addEventListener('input',()=>renderCmdk(cmdkInput.value));
  cmdkClose.addEventListener('click',closeCmdk);
  cmdkOverlay.addEventListener('click',(e)=>{ if(e.target===cmdkOverlay) closeCmdk(); });
  cmdkInput.addEventListener('keydown',(e)=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); setCmdkActive(Math.min(cmdkActive+1,cmdkMatches.length-1)); cmdkEnsureVisible(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); setCmdkActive(Math.max(cmdkActive-1,0)); cmdkEnsureVisible(); }
    else if(e.key==='Enter'){ e.preventDefault(); pickCmdk(cmdkActive); }
    else if(e.key==='Escape'){ closeCmdk(); }
  });
}
document.addEventListener('keydown',(e)=>{
  if((e.metaKey||e.ctrlKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); (cmdkOverlay&&cmdkOverlay.classList.contains('show'))?closeCmdk():openCmdk(); }
  else if(e.key==='Escape'){
    if(cmdkOverlay && cmdkOverlay.classList.contains('show')) closeCmdk();
    else if(document.getElementById('detailPane').classList.contains('open')) closeDetail();
  }
});

/* ==================================================================
   Dashboard — Portfolio Intelligence (additive; reads DATA, never
   mutates it; every figure below is derived with the exact same
   PROV_RATES / netOutstanding / totalPL formulas used in the
   per-borrower settlement engine above — nothing recomputed differently) */
const ASSET_ORDER = ['SUB_STD','DA1','DA2','DA3','LOSS'];
const ASSET_SEV_COLOR = { SUB_STD:'var(--sev-1)', DA1:'var(--sev-2)', DA2:'var(--sev-3)', DA3:'var(--sev-4)', LOSS:'var(--sev-5)' };
const SLAB_DEFS = [
  {id:'s1', label:'Upto ₹2 Lakh', max:200000},
  {id:'s2', label:'₹2 Lakh – ₹5 Lakh', max:500000},
  {id:'s3', label:'₹5 Lakh – ₹10 Lakh', max:1000000},
  {id:'s4', label:'₹10 Lakh & above', max:Infinity},
];
const HIGH_VALUE_CUST_THRESHOLD = 1000000; // ₹10 Lakh

function computeDashboardStats(branchFilter, regionFilter){
  const rows = DATA.npa.rows;
  const today = new Date();
  const assetMix = {};
  const branchMap = new Map();
  const regionMap = new Map();
  const allBranches = new Set();
  const allRegions = new Set();
  const branchToRegion = new Map();
  const buckets = [
    {id:'ne', label:'Not yet eligible (≤ 6 months)', count:0, os:0},
    {id:'y1', label:'6 months – 1 year', count:0, os:0},
    {id:'y13', label:'1 – 3 years', count:0, os:0},
    {id:'y3p', label:'3+ years', count:0, os:0},
  ];
  const slabs = SLAB_DEFS.map(sl=>({...sl, count:0, os:0}));
  const schemeMix = { KCC:{count:0,os:0}, NONKCC:{count:0,os:0} };
  const custMap = new Map();
  const acctList = [];
  let totalOS=0, totalNetOS=0, totalProvision=0, totalBookValue=0;
  let eligibleCount=0, notEligibleCount=0, matchedAccounts=0;
  const seen = new Set();
  for(const r of rows){
    const acct = String(r[C.ACCT_NO]);
    const branch = r[C.SOL_DESC] || 'Unassigned';
    const region = r[C.REGION] || '';
    if(branch){ allBranches.add(branch); if(region && !branchToRegion.has(branch)) branchToRegion.set(branch, region); }
    if(region) allRegions.add(region);
    if(acct==='' || seen.has(acct)) continue;
    seen.add(acct);
    if(regionFilter && region!==regionFilter) continue;
    if(branchFilter && branch!==branchFilter) continue;
    matchedAccounts++;
    const asset = r[C.ASSET]||'(unclassified)';
    const os = typeof r[C.OUTBAL]==='number' ? r[C.OUTBAL] : 0;
    const uri = typeof r[C.URI]==='number' ? r[C.URI] : 0;
    const netOs = os-uri;
    const rate = PROV_RATES[asset];
    const provision = rate!==undefined ? netOs*rate : 0;
    const bookValue = Math.max(0, os-uri-provision);

    totalOS+=os; totalNetOS+=netOs; totalProvision+=provision; totalBookValue+=bookValue;

    if(!assetMix[asset]) assetMix[asset]={count:0,os:0};
    assetMix[asset].count++; assetMix[asset].os+=os;

    if(!branchMap.has(branch)) branchMap.set(branch,{count:0,os:0});
    const b=branchMap.get(branch); b.count++; b.os+=os;

    if(region){
      if(!regionMap.has(region)) regionMap.set(region,{count:0,os:0,assetMix:{}});
      const rg=regionMap.get(region); rg.count++; rg.os+=os;
      if(!rg.assetMix[asset]) rg.assetMix[asset]={count:0,os:0};
      rg.assetMix[asset].count++; rg.assetMix[asset].os+=os;
    }

    const scheme = r[C.SCHEME]||'';
    const schemeKey = scheme==='CC004' ? 'KCC' : 'NONKCC';
    schemeMix[schemeKey].count++; schemeMix[schemeKey].os+=os;

    const slab = slabs.find(sl=>os<=sl.max);
    if(slab){ slab.count++; slab.os+=os; }

    const custId = String(r[C.CUST_ID]||'');
    if(custId){
      if(!custMap.has(custId)) custMap.set(custId, {custId, name:r[C.NAME]||'', branch, os:0, count:0});
      const cu = custMap.get(custId); cu.os+=os; cu.count++;
    }

    const npaDate = toDate(r[C.NPA_DT]);
    let bucketId = null;
    if(npaDate){
      const days = daysBetween(today, npaDate);
      if(days<=180){ buckets[0].count++; buckets[0].os+=os; notEligibleCount++; bucketId='ne'; }
      else {
        eligibleCount++;
        if(days<=365){ buckets[1].count++; buckets[1].os+=os; bucketId='y1'; }
        else if(days<=1095){ buckets[2].count++; buckets[2].os+=os; bucketId='y13'; }
        else { buckets[3].count++; buckets[3].os+=os; bucketId='y3p'; }
      }
    }

    acctList.push({ acctNo:acct, custId, name:r[C.NAME]||'', branch, os, asset, scheme:schemeKey, slabId: slab?slab.id:null, bucketId });
  }
  let oldOtsSum=0, oldOtsCount=0;
  DATA.oldots.rows.forEach(r=>{
    if(r[0]==='') return;
    oldOtsCount++;
    const n = parseFloat(String(r[2]||'').replace(/[^0-9.\-]/g,''));
    if(!isNaN(n)) oldOtsSum+=n;
  });

  const custList = [...custMap.values()];
  const highValueCust = custList.filter(c=>c.os>=HIGH_VALUE_CUST_THRESHOLD);
  const highValueOS = highValueCust.reduce((a,c)=>a+c.os,0);
  const highValueCustList = [...highValueCust].sort((a,b)=>b.os-a.os);
  const allAcctSorted = [...acctList].sort((a,b)=>b.os-a.os);

  return {
    totalAccounts:matchedAccounts, totalOS, totalNetOS, totalProvision, totalBookValue,
    eligibleCount, notEligibleCount, assetMix, branchMap, buckets, oldOtsCount, oldOtsSum,
    branchCount: branchMap.size, allBranches: [...allBranches].sort((a,b)=>a.localeCompare(b)),
    allRegions: [...allRegions].sort((a,b)=>a.localeCompare(b)), branchToRegion, regionMap,
    schemeMix, slabs, custCount: custList.length,
    highValueCustCount: highValueCust.length, highValueOS, highValueCustList,
    acctList, allAcctSorted,
  };
}

function fmtINR2(n){ if(n===''||n===null||n===undefined||isNaN(n)) return '—'; return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function populateRegionFilter(regions){
  const sel = document.getElementById('dashRegionFilter');
  const label = document.getElementById('dashRegionLabel');
  if(!sel) return;
  if(regions.length<=1){
    sel.style.display='none';
    if(label) label.style.display='none';
    return;
  }
  sel.style.display='';
  if(label) label.style.display='';
  const current = sel.value;
  sel.innerHTML = `<option value="">All Regions</option>` + regions.map(r=>`<option value="${esc(r)}">${esc(titleCase(r))}</option>`).join('');
  if(regions.includes(current)) sel.value = current;
}
function populateBranchFilter(branches, branchToRegion, regionFilter){
  const sel = document.getElementById('dashBranchFilter');
  if(!sel) return;
  const current = sel.value;
  const filtered = (regionFilter && branchToRegion) ? branches.filter(b=>branchToRegion.get(b)===regionFilter) : branches;
  sel.innerHTML = `<option value="">Regional Office</option>` + filtered.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');
  sel.value = filtered.includes(current) ? current : '';
}
function populateBranchFilterForRegion(){
  if(!currentDashStats) return;
  const regionSel = document.getElementById('dashRegionFilter');
  const regionFilter = regionSel ? regionSel.value : '';
  populateBranchFilter(currentDashStats.allBranches, currentDashStats.branchToRegion, regionFilter);
}
function updateDashTitle(stats, regionFilter){
  const el = document.getElementById('dashTitle');
  if(!el) return;
  if(regionFilter){
    el.textContent = `UPGB ${titleCase(regionFilter)} region NPA Portfolio`;
  } else if(stats.allRegions.length===1){
    el.textContent = `UPGB ${titleCase(stats.allRegions[0])} region NPA Portfolio`;
  } else if(stats.allRegions.length>1){
    el.textContent = `UPGB NPA Portfolio — ${stats.allRegions.length} regions`;
  } else {
    el.textContent = 'UPGB NPA Portfolio';
  }
}

function updateRegionsNavVisibility(regionCount){
  const show = regionCount>1;
  const btn = document.getElementById('regionsNavBtn');
  const btnMobile = document.getElementById('regionsNavBtnMobile');
  if(btn) btn.style.display = show ? '' : 'none';
  if(btnMobile) btnMobile.style.display = show ? '' : 'none';
  if(!show){
    const activeView = document.querySelector('.view.active');
    if(activeView && activeView.dataset.view==='regions') switchView('dashboard');
  }
}

function renderRegionsView(){
  const el = document.getElementById('regionsArea');
  if(!el) return;
  const s = computeDashboardStats(null, null);
  const regionRows = [...s.regionMap.entries()].sort((a,b)=>b[1].os-a[1].os)
    .map(([region,v])=>{
      const highRiskOs = (v.assetMix.DA3?v.assetMix.DA3.os:0) + (v.assetMix.LOSS?v.assetMix.LOSS.os:0);
      const highRiskPct = v.os ? (highRiskOs/v.os*100) : 0;
      return { region, count:v.count, os:v.os, share: s.totalOS?(v.os/s.totalOS*100):0, highRiskPct };
    });
  el.innerHTML = `
    <div class="kpi-grid">
      ${kpiTile('Regions', regionRows.length.toLocaleString('en-IN'), '')}
      ${kpiTile('Total Outstanding', fmtCr(s.totalOS), s.totalAccounts.toLocaleString('en-IN')+' account(s)')}
    </div>
    <div class="section-label">Region Comparison<span class="chart-sub">${regionRows.length} region(s) · sorted by outstanding · tap a row to open that region on the Dashboard</span></div>
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead><tr>
          <th class="tal">Region</th><th>Accounts</th><th>Total O/S</th><th>Share</th><th>High-Risk (DA3+Loss)</th>
        </tr></thead>
        <tbody>${regionRows.map(r=>`
          <tr class="clickable" onclick="drillRegionFromRegionsView('${jsq(r.region)}')">
            <td class="tal">${esc(titleCase(r.region))}</td>
            <td>${r.count.toLocaleString('en-IN')}</td>
            <td>${fmtCr(r.os)}</td>
            <td>${r.share.toFixed(1)}%</td>
            <td>${r.highRiskPct.toFixed(1)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
function drillRegionFromRegionsView(region){
  switchView('dashboard');
  drillRegion(region);
}

function svgDonut(segments, size){
  size = size || 130;
  const strokeW = 18;
  const r = size/2 - strokeW/2 - 2;
  const c = 2*Math.PI*r, cx=size/2, cy=size/2;
  const total = segments.reduce((a,s)=>a+s.value,0) || 1;
  let acc = 0;
  const circles = segments.map(s=>{
    const frac = s.value/total;
    const len = Math.max(0, frac*c - (segments.length>1?1.5:0));
    const dash = `${len.toFixed(2)} ${(c-len).toFixed(2)}`;
    const rotate = (acc/total)*360 - 90;
    acc += s.value;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeW}" stroke-dasharray="${dash}" stroke-linecap="round" transform="rotate(${rotate} ${cx} ${cy})"></circle>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut-svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--track-bg)" stroke-width="${strokeW}"></circle>
    ${circles}
  </svg>`;
}

function donutLegend(segments){
  return segments.map(s=>`<div class="legend-row${s.onclick?' clickable':''}"${s.onclick?` onclick="${s.onclick}"`:''}><span class="legend-dot" style="background:${s.color}"></span>${esc(s.label)}<span class="legend-val">${s.valueLabel}</span></div>`).join('');
}

function acctRows(list, opts){
  opts = opts || {};
  const offset = opts.offset||0;
  if(!list.length) return `<tr><td colspan="5" style="text-align:center;color:var(--ink-mute)">No accounts</td></tr>`;
  return list.map((a,i)=>`<tr class="clickable" onclick="openDetail('${esc(a.custId)}','${esc(a.acctNo)}')">
    <td>${opts.rank?`<span class="dash-rank">${i+1+offset}</span>`:''}${esc(a.acctNo)}</td>
    <td class="tal">${esc(a.name)||'—'}</td>
    <td class="tal">${esc(a.branch)}</td>
    <td>${a.asset?`<span class="badge-pill ${esc(a.asset)}" title="${esc(assetLabel(a.asset))}">${esc(a.asset)}</span>`:'—'}</td>
    <td>${fmtINR2(a.os)}</td>
  </tr>`).join('');
}

const ACCT_LIST_BATCH = 300;
function renderAcctListBatch(list, tbody, shownRef){
  if(shownRef.n>=list.length) return;
  const next = list.slice(shownRef.n, shownRef.n+ACCT_LIST_BATCH);
  tbody.insertAdjacentHTML('beforeend', acctRows(next, {rank:true, offset:shownRef.n}));
  shownRef.n += next.length;
}

/* ---------- Shared column-sort helper (dashboard table + list modal) ---------- */
function applySort(list, sort){
  if(!sort || !sort.key) return list;
  const key = sort.key, dir = sort.dir;
  return [...list].sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') av=av.toLowerCase();
    if(typeof bv==='string') bv=bv.toLowerCase();
    if(av<bv) return dir==='asc'?-1:1;
    if(av>bv) return dir==='asc'?1:-1;
    return 0;
  });
}
function nextSort(current, key){
  if(current && current.key===key) return {key, dir: current.dir==='asc'?'desc':'asc'};
  return {key, dir:(key==='name'||key==='branch'||key==='acctNo')?'asc':'desc'};
}
function updateSortIcons(theadId, sort){
  const thead = document.getElementById(theadId);
  if(!thead) return;
  thead.querySelectorAll('th[data-key]').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    const active = sort && th.dataset.key===sort.key;
    if(active) th.classList.add(sort.dir==='asc'?'sort-asc':'sort-desc');
    th.setAttribute('aria-sort', active ? (sort.dir==='asc'?'ascending':'descending') : 'none');
  });
}
/* Keyboard support for sortable column headers (Enter/Space triggers the same click handler) */
document.addEventListener('keydown', (e)=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const th = e.target.closest && e.target.closest('th.sortable');
  if(!th) return;
  e.preventDefault();
  th.click();
});

/* ---------- Dashboard: "All Accounts" table (sortable, lazy-scrolled) ---------- */
let acctListState = {list:[], sort:{key:'os',dir:'desc'}};
function renderAcctListTable(resetScroll){
  const tbody = document.getElementById('acctListBody');
  if(!tbody) return;
  const sorted = applySort(acctListState.list, acctListState.sort);
  acctListState.sortedList = sorted;
  updateSortIcons('acctListHead', acctListState.sort);
  tbody.innerHTML = '';
  const shownRef = {n:0};
  acctListState.shownRef = shownRef;
  renderAcctListBatch(sorted, tbody, shownRef);
  if(resetScroll){ const wrap = document.getElementById('acctListWrap'); if(wrap) wrap.scrollTop = 0; }
}
function sortAcctListBy(key){
  acctListState.sort = nextSort(acctListState.sort, key);
  renderAcctListTable(true);
}
window.sortAcctListBy = sortAcctListBy;
function initAcctListScroll(list){
  const wrap = document.getElementById('acctListWrap');
  if(!wrap) return;
  acctListState.list = list;
  acctListState.sort = {key:'os',dir:'desc'};
  renderAcctListTable();
  wrap.onscroll = ()=>{
    if(wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) renderAcctListBatch(acctListState.sortedList, document.getElementById('acctListBody'), acctListState.shownRef);
  };
}

function custRows(list){
  if(!list.length) return `<tr><td colspan="4" style="text-align:center;color:var(--ink-mute)">No customers</td></tr>`;
  return list.map(c=>`<tr class="clickable" onclick="openDetail('${esc(c.custId)}')">
    <td class="tal">${esc(c.name)||'—'}<br><span style="color:var(--ink-mute);font-weight:600;font-size:11px">Cust ID ${esc(c.custId)}</span></td>
    <td class="tal">${esc(c.branch)}</td>
    <td>${c.count} A/C</td>
    <td>${fmtINR2(c.os)}</td>
  </tr>`).join('');
}

const ACCT_LIST_HEAD = '<tr>'
  +'<th class="sortable" data-key="acctNo" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'acctNo\')">Account<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="name" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'name\')">Customer<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="branch" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'branch\')">Branch<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="asset" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'asset\')">Asset<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="os" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'os\')">Amount<span class="sort-ic">▾</span></th>'
  +'</tr>';
const CUST_LIST_HEAD = '<tr>'
  +'<th class="tal sortable" data-key="name" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'name\')">Customer<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="branch" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'branch\')">Branch<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="count" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'count\')">Accounts<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="os" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'os\')">Amount<span class="sort-ic">▾</span></th>'
  +'</tr>';

/* ---------- Generic list modal (sortable, lazy-scrolled for account lists) ---------- */
let __listModalScrollHandler = null;
let listModalState = {list:[], type:'acct', sort:{key:'os',dir:'desc'}};
function renderListModalBody(resetScroll){
  const body = document.getElementById('listModalBody');
  const sorted = applySort(listModalState.list, listModalState.sort);
  listModalState.sortedList = sorted;
  updateSortIcons('listModalHead', listModalState.sort);
  if(listModalState.type==='cust'){ body.innerHTML = custRows(sorted); }
  else{
    body.innerHTML = '';
    const shownRef = {n:0};
    listModalState.shownRef = shownRef;
    renderAcctListBatch(sorted, body, shownRef);
  }
  if(resetScroll){ const wrap = body.closest('.list-modal-scroll'); if(wrap) wrap.scrollTop = 0; }
}
function sortListModalBy(key){
  listModalState.sort = nextSort(listModalState.sort, key);
  renderListModalBody(true);
}
window.sortListModalBy = sortListModalBy;
function showListModal(title, sub, headHTML, type, list, defaultSort){
  document.getElementById('listModalTitle').textContent = title;
  document.getElementById('listModalSub').textContent = sub || '';
  document.getElementById('listModalHead').innerHTML = headHTML;
  listModalState = {list, type, sort: defaultSort || {key:'os',dir:'desc'}};
  renderListModalBody();
  document.getElementById('listModalOverlay').classList.add('show');
  const wrap = document.getElementById('listModalBody').closest('.list-modal-scroll');
  if(__listModalScrollHandler) wrap.removeEventListener('scroll', __listModalScrollHandler);
  __listModalScrollHandler = ()=>{
    if(listModalState.type!=='acct') return;
    if(wrap.scrollTop+wrap.clientHeight>wrap.scrollHeight-400) renderAcctListBatch(listModalState.sortedList, document.getElementById('listModalBody'), listModalState.shownRef);
  };
  wrap.addEventListener('scroll', __listModalScrollHandler);
}
function closeListModal(){ document.getElementById('listModalOverlay').classList.remove('show'); }
function showAcctListModal(title, sub, list){ showListModal(title, sub, ACCT_LIST_HEAD, 'acct', list, {key:'os',dir:'desc'}); }
function showCustListModal(title, sub, list){ showListModal(title, sub, CUST_LIST_HEAD, 'cust', list, {key:'os',dir:'desc'}); }
window.showAcctListModal = showAcctListModal;
window.showCustListModal = showCustListModal;

function jsq(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

function barRows(items){
  const max = Math.max(1, ...items.map(i=>i.value));
  return items.map(it=>{
    const pct = Math.max(2, (it.value/max*100));
    return `<div class="bar-row${it.onclick?' clickable':''}"${it.onclick?` onclick="${it.onclick}"`:''}>
      <div class="bar-label" title="${esc(it.label)}">${esc(it.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${it.color||'var(--accent)'};color:${it.color||'var(--accent)'}"></div></div>
      <div class="bar-value">${it.valueLabel}</div>
    </div>`;
  }).join('');
}

function kpiTile(label, value, sub, onclick){
  return `<div class="kpi-tile${onclick?' clickable':''}"${onclick?` onclick="${onclick}"`:''}>
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${value}</div>
    ${sub?`<div class="kpi-sub">${sub}</div>`:''}
  </div>`;
}

let currentDashStats = null;
const BUCKET_LABELS = {ne:'Not yet eligible (≤ 6 months)', y1:'6 months – 1 year', y13:'1 – 3 years', y3p:'3+ years'};
function drillBranch(branch){
  const sel = document.getElementById('dashBranchFilter');
  if(sel){ sel.value = branch; renderDashboard(); }
}
function drillRegion(region){
  const regionSel = document.getElementById('dashRegionFilter');
  const branchSel = document.getElementById('dashBranchFilter');
  if(regionSel) regionSel.value = region;
  if(branchSel) branchSel.value = '';
  populateBranchFilterForRegion();
  renderDashboard();
}
function showAssetList(code){
  if(!currentDashStats) return;
  const list = currentDashStats.acctList.filter(a=>a.asset===code).sort((a,b)=>b.os-a.os);
  showAcctListModal(assetLabel(code)+' — Accounts', list.length.toLocaleString('en-IN')+' account(s)', list);
}
function showBucketList(bucketId){
  if(!currentDashStats) return;
  const list = currentDashStats.acctList.filter(a=>a.bucketId===bucketId).sort((a,b)=>b.os-a.os);
  showAcctListModal('NPA Ageing — '+(BUCKET_LABELS[bucketId]||bucketId), list.length.toLocaleString('en-IN')+' account(s)', list);
}
function showSchemeList(schemeKey){
  if(!currentDashStats) return;
  const list = currentDashStats.acctList.filter(a=>a.scheme===schemeKey).sort((a,b)=>b.os-a.os);
  showAcctListModal((schemeKey==='KCC'?'KCC (CC004)':'Non-KCC')+' — Accounts', list.length.toLocaleString('en-IN')+' account(s)', list);
}
function showSlabList(slabId){
  if(!currentDashStats) return;
  const def = SLAB_DEFS.find(sl=>sl.id===slabId);
  const list = currentDashStats.acctList.filter(a=>a.slabId===slabId).sort((a,b)=>b.os-a.os);
  showAcctListModal('Outstanding Slab — '+(def?def.label:slabId), list.length.toLocaleString('en-IN')+' account(s)', list);
}
function showHighValueCustList(){
  if(!currentDashStats) return;
  showCustListModal('Customers ≥ ₹10 Lakh O/S', currentDashStats.highValueCustList.length.toLocaleString('en-IN')+' customer(s), high → low', currentDashStats.highValueCustList);
}
window.drillBranch = drillBranch;
window.drillRegion = drillRegion;
window.drillRegionFromRegionsView = drillRegionFromRegionsView;
window.showAssetList = showAssetList;
window.showBucketList = showBucketList;
window.showSchemeList = showSchemeList;
window.showSlabList = showSlabList;
window.showHighValueCustList = showHighValueCustList;

function renderDashboard(){
  const el = document.getElementById('dashboardArea');
  if(!el) return;
  const filterSel = document.getElementById('dashBranchFilter');
  const branchFilter = filterSel ? filterSel.value : '';
  const regionSel = document.getElementById('dashRegionFilter');
  const regionFilter = regionSel ? regionSel.value : '';
  const s = computeDashboardStats(branchFilter || null, regionFilter || null);
  currentDashStats = s;
  populateRegionFilter(s.allRegions);
  populateBranchFilter(s.allBranches, s.branchToRegion, regionFilter || null);
  updateDashTitle(s, regionFilter || null);
  updateRegionsNavVisibility(s.allRegions.length);

  const assetItems = ASSET_ORDER.filter(k=>s.assetMix[k]).map(k=>({
    label: assetLabel(k)+' ('+k+')', value:s.assetMix[k].os, color:ASSET_SEV_COLOR[k],
    valueLabel:`${s.assetMix[k].count.toLocaleString('en-IN')} · ${fmtCr(s.assetMix[k].os)}`,
    onclick:`showAssetList('${k}')`
  }));
  Object.keys(s.assetMix).filter(k=>!ASSET_ORDER.includes(k)).forEach(k=>assetItems.push({
    label:k, value:s.assetMix[k].os, color:'var(--ink-mute)',
    valueLabel:`${s.assetMix[k].count.toLocaleString('en-IN')} · ${fmtCr(s.assetMix[k].os)}`,
    onclick:`showAssetList('${jsq(k)}')`
  }));

  const branchTop = [...s.branchMap.entries()].sort((a,b)=>b[1].os-a[1].os).slice(0,10)
    .map(([branch,v])=>({label:branch, value:v.os, color:'var(--accent)',
      valueLabel:`${v.count.toLocaleString('en-IN')} · ${fmtCr(v.os)} · ${(s.totalOS?(v.os/s.totalOS*100):0).toFixed(2)}%`,
      onclick:`drillBranch('${jsq(branch)}')`}));

  const agingItems = s.buckets.map(b=>({label:b.label, value:b.os, color:'var(--accent-2)',
    valueLabel:`${b.count.toLocaleString('en-IN')} · ${fmtCr(b.os)}`,
    onclick:`showBucketList('${b.id}')`}));

  const kccPct = s.totalOS ? (s.schemeMix.KCC.os/s.totalOS*100) : 0;
  const nonKccPct = s.totalOS ? (s.schemeMix.NONKCC.os/s.totalOS*100) : 0;
  const kccSeg = [
    {label:'KCC (CC004)', value:s.schemeMix.KCC.os, color:'var(--green)',
      valueLabel:`${s.schemeMix.KCC.count.toLocaleString('en-IN')} A/C · ${fmtCr(s.schemeMix.KCC.os)} · ${kccPct.toFixed(1)}%`,
      onclick:`showSchemeList('KCC')`},
    {label:'Non-KCC', value:s.schemeMix.NONKCC.os, color:'var(--accent-2)',
      valueLabel:`${s.schemeMix.NONKCC.count.toLocaleString('en-IN')} A/C · ${fmtCr(s.schemeMix.NONKCC.os)} · ${nonKccPct.toFixed(1)}%`,
      onclick:`showSchemeList('NONKCC')`},
  ];
  const slabColors = ['var(--sev-1)','var(--sev-2)','var(--sev-3)','var(--sev-4)'];
  const slabSeg = s.slabs.map((sl,i)=>({label:sl.label, value:sl.os, color:slabColors[i],
    valueLabel:`${sl.count.toLocaleString('en-IN')} A/C · ${fmtCr(sl.os)}`,
    onclick:`showSlabList('${sl.id}')`}));

  el.innerHTML = `
    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-title">Total Outstanding — KCC vs Non-KCC<span class="chart-sub">scheme CC004 = KCC · every other scheme = Non-KCC</span></div>
        <div class="kcc-total-strip">
          <div><div class="lbl">Total A/C Amount</div><div class="val">${fmtCr(s.totalOS)}</div></div>
          <div><div class="lbl">Total Accounts</div><div class="val">${s.totalAccounts.toLocaleString('en-IN')}</div></div>
        </div>
        <div class="donut-flex">
          ${svgDonut(kccSeg)}
          <div class="donut-legend">${donutLegend(kccSeg)}</div>
        </div>
        <div class="split-stat-grid">
          <div class="split-stat kcc clickable" onclick="showSchemeList('KCC')">
            <div class="split-stat-label">KCC (CC004)</div>
            <div class="split-stat-amt">${fmtCr(s.schemeMix.KCC.os)}</div>
            <div class="split-stat-count">${s.schemeMix.KCC.count.toLocaleString('en-IN')} A/C · ${fmtINR2(s.schemeMix.KCC.os)} · ${kccPct.toFixed(1)}% share</div>
          </div>
          <div class="split-stat nonkcc clickable" onclick="showSchemeList('NONKCC')">
            <div class="split-stat-label">Non-KCC</div>
            <div class="split-stat-amt">${fmtCr(s.schemeMix.NONKCC.os)}</div>
            <div class="split-stat-count">${s.schemeMix.NONKCC.count.toLocaleString('en-IN')} A/C · ${fmtINR2(s.schemeMix.NONKCC.os)} · ${nonKccPct.toFixed(1)}% share</div>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Outstanding by Amount Slab<span class="chart-sub">account-wise O/S buckets</span></div>
        <div class="donut-flex">
          ${svgDonut(slabSeg)}
          <div class="donut-legend">${donutLegend(slabSeg)}</div>
        </div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-title">Asset Classification Mix<span class="chart-sub">by outstanding balance · RBI IRAC norms · tap a row for the list</span></div>
        <div class="bar-list">${barRows(assetItems)}</div>
      </div>
      <div class="chart-card">
        <div class="chart-title">NPA Ageing<span class="chart-sub">days since NPA date · tap a row for the list</span></div>
        <div class="bar-list">${barRows(agingItems)}</div>
      </div>
      ${branchFilter ? '' : `
      <div class="chart-card chart-card-wide">
        <div class="chart-title">Top Branches by Exposure<span class="chart-sub">top 10 of ${s.branchCount.toLocaleString('en-IN')} branch(es) · tap to drill into a branch</span></div>
        <div class="bar-list">${barRows(branchTop)}</div>
      </div>`}
    </div>

    <div class="section-label">Customer-Wise Outstanding</div>
    <div class="kpi-grid">
      ${kpiTile('Total Unique Customers', s.custCount.toLocaleString('en-IN'), fmtCr(s.totalOS)+' combined outstanding')}
      ${kpiTile('Customers ≥ ₹10 Lakh O/S', s.highValueCustCount.toLocaleString('en-IN'), fmtCr(s.highValueOS)+(s.custCount?' · '+((s.highValueCustCount/s.custCount)*100).toFixed(1)+'% of customers':'')+' · tap to view list', 'showHighValueCustList()')}
    </div>

    <div class="section-label">All Accounts by Outstanding<span class="chart-sub">${s.totalAccounts.toLocaleString('en-IN')} account(s) · tap a column to sort · scroll for more</span></div>
    <div class="dash-table-wrap acct-list-scroll" id="acctListWrap">
      <table class="dash-table">
        <thead id="acctListHead"><tr>
          <th class="sortable" data-key="acctNo" tabindex="0" role="button" aria-sort="none" onclick="sortAcctListBy('acctNo')">Account<span class="sort-ic">▾</span></th>
          <th class="tal sortable" data-key="name" tabindex="0" role="button" aria-sort="none" onclick="sortAcctListBy('name')">Customer<span class="sort-ic">▾</span></th>
          <th class="tal sortable" data-key="branch" tabindex="0" role="button" aria-sort="none" onclick="sortAcctListBy('branch')">Branch<span class="sort-ic">▾</span></th>
          <th class="sortable" data-key="asset" tabindex="0" role="button" aria-sort="none" onclick="sortAcctListBy('asset')">Asset<span class="sort-ic">▾</span></th>
          <th class="sortable" data-key="os" tabindex="0" role="button" aria-sort="none" onclick="sortAcctListBy('os')">Amount<span class="sort-ic">▾</span></th>
        </tr></thead>
        <tbody id="acctListBody"></tbody>
      </table>
    </div>
  `;
  initAcctListScroll(s.allAcctSorted);
}

/* ---------- Nav / view switching ---------- */
function switchView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  if(view==='dashboard') renderDashboard();
  if(view==='regions') renderRegionsView();
  const mainCol = document.getElementById('mainCol');
  if(mainCol) mainCol.scrollTop = 0;
}
window.switchView = switchView;

/* ---------- Light / dark theme toggle ---------- */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme==='light'?'light':'dark');
  try{ localStorage.setItem('upgb-theme', theme); }catch(e){}
  const label = document.getElementById('themeToggleLabel');
  if(label) label.textContent = theme==='light' ? 'Dark Mode' : 'Light Mode';
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme')==='light' ? 'light' : 'dark';
  applyTheme(current==='light' ? 'dark' : 'light');
}

/* ---------- Wire static chrome (nav, header icons, modals) ---------- */
(function wireChrome(){
  const on = (id, evt, fn) => { const e=document.getElementById(id); if(e) e.addEventListener(evt, fn); };
  applyTheme(document.documentElement.getAttribute('data-theme')==='light' ? 'light' : 'dark');
  on('themeToggleBtn','click',()=>toggleTheme());
  on('themeToggleBtnMobile','click',()=>toggleTheme());
  const openUpdateModalAsAdmin = () => {
    if(window.UPGBAuth) UPGBAuth.requireAdmin(openUpdateModal); else openUpdateModal();
  };
  on('updateDataBtn','click',openUpdateModalAsAdmin);
  on('settingsBtn','click',openUpdateModalAsAdmin);
  on('settingsBtnNav','click',openUpdateModalAsAdmin);
  on('cmdkBtnNav','click',()=>openCmdk());
  on('cmdkBtnNavMobile','click',()=>openCmdk());
  on('listModalCloseX','click',()=>closeListModal());
  document.getElementById('listModalOverlay')?.addEventListener('click',(e)=>{ if(e.target.id==='listModalOverlay') closeListModal(); });
  on('clearBtn','click',()=>clearSearch());
  on('searchGoBtn','click',()=>runSearch());
  on('uploadDrop','click',()=>document.getElementById('fileInput').click());
  on('fileInput','change',(e)=>handleFileUpload(e));
  on('masterUploadDrop','click',()=>document.getElementById('masterFileInput').click());
  on('masterFileInput','change',(e)=>handleMasterFileUpload(e));
  on('downloadDailyTemplateBtn','click',()=>downloadDailyTemplate());
  on('downloadMasterTemplateBtn','click',()=>downloadMasterTemplate());
  on('asOnDateInput','change',(e)=>{ __pendingAsOnDate = e.target.value; });
  on('updateCancelBtn','click',()=>toggleUpdateModal(false));
  on('applyDataBtn','click',()=>applyNewData());
  on('downloadAppBtn','click',()=>downloadUpdatedApp());
  on('eligibleBanner','click',()=>document.getElementById('eligibleBanner').classList.remove('show'));
  on('dashRegionFilter','change',()=>{ populateBranchFilterForRegion(); renderDashboard(); });
  on('dashBranchFilter','change',()=>renderDashboard());
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>{
    b.addEventListener('click',()=>switchView(b.dataset.view));
  });
  document.querySelectorAll('[data-open-data]').forEach(b=>{
    b.addEventListener('click',openUpdateModalAsAdmin);
  });
})();

renderEmpty();
switchView('dashboard');

window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.toggleFreeze = toggleFreeze;
window.onOtsInput = onOtsInput;
}

initApp(__otsData);
