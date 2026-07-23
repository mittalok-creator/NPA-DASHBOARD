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
/* Branch-wise total advance, uploaded separately from the daily NPA file
   (see handleBranchAdvUpload) -- lets the Dashboard show NPA % (NPA
   outstanding / total advance) per branch. Persisted through Publish like
   lockedOts, but not reset/carried-forward on a daily NPA update since it
   changes on its own, much slower schedule. */
DATA.branchAdvances = DATA.branchAdvances || {};

/* ---------- Date helpers (NPA dates are raw Excel serials) ---------- */
const XL_EPOCH = new Date(1899,11,30);
function excelSerialToDate(n){ return new Date(XL_EPOCH.getTime() + n*86400000); }
function toDate(v){
  if(v===''||v===null||v===undefined) return null;
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
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
/* Date part always goes through fmtDate() (DD-MM-YYYY, never locale-
   dependent) -- only the time-of-day portion uses toLocaleTimeString,
   since that carries no date-format ambiguity. */
function fmtDateTime(d){ if(!d) return ''; return fmtDate(d)+', '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
function fmtINR(n){ if(n===''||n===null||n===undefined||isNaN(n)) return '—'; return '₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2}); }
function fmtCr(n){
  if(n===''||n===null||n===undefined||isNaN(n)) return '—';
  const abs = Math.abs(n);
  if(abs>=1e7) return '₹'+(n/1e7).toFixed(2)+' Cr';
  if(abs>=1e5) return '₹'+(n/1e5).toFixed(2)+' L';
  return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function esc(s){ return (s===null||s===undefined)?'':String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
/* Illustrative severity bands for NPA % (NPA outstanding / total advance),
   not a claim of official RBI benchmark thresholds -- just enough to spot
   a high-NPA branch/region at a glance. */
function npaPctSeverity(pct){
  if(pct>=10) return {color:'var(--red)', soft:'var(--red-soft)'};
  if(pct>=5) return {color:'var(--amber)', soft:'var(--amber-soft)'};
  return {color:'var(--green)', soft:'var(--green-soft)'};
}
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
let __lastSearchMatches = null, __lastSearchMode = null;
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
  __lastSearchMatches = matches; __lastSearchMode = mode;
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
      const acctNoStr = String(r[C.ACCT_NO]);
      const isLocked = !!frozen[acctNoStr];
      const lockedAmt = otsAmounts[acctNoStr];
      return `
      <div class="result-card" data-asset="${esc(asset)}" onclick="openDetail('${esc(String(r[C.CUST_ID]))}','${esc(String(r[C.ACCT_NO]))}')">
        <div class="result-top">
          <div>
            <div class="result-name">${esc(r[C.NAME])||'—'}</div>
            <div class="result-acc">A/c · ${esc(r[C.ACCT_NO])}</div>
            <div class="result-scheme">${esc(r[C.SOL_DESC])||''}</div>
          </div>
          <div class="result-badges">
            ${asset?`<span class="badge-pill ${esc(asset)}" title="${esc(assetLabel(asset))}">${esc(asset)}</span>`:''}
            ${isLocked?`<span class="badge-pill locked" title="OTS ${lockedAmt?fmtINR(parseFloat(lockedAmt)):''} locked and already communicated to the borrower">🔒 Already Told${lockedAmt?' · '+fmtINR(parseFloat(lockedAmt)):''}</span>`:''}
          </div>
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
/* Locked OTS amounts are also persisted on DATA.lockedOts and, as of the
   "sync to everyone immediately" change, ALSO written straight to
   data/locked-ots.json via the lock-ots relay endpoint the moment anyone
   locks/unlocks one -- no GitHub sign-in or Admin Publish needed for this
   specific action, since field staff using this app on their own phones
   don't have repo access. (data/latest.json's own lockedOts field still
   gets refreshed on every Admin Publish, as a durable snapshot -- but
   data/locked-ots.json is the live, always-current source every viewer
   merges in on load and on a periodic background check.) otsAmounts/frozen
   below stay per-session scratch state for amounts still being worked out
   and not yet locked. */
DATA.lockedOts = DATA.lockedOts || {};
Object.keys(DATA.lockedOts).forEach(acct => { otsAmounts[acct] = DATA.lockedOts[acct]; frozen[acct] = true; });

const LOCK_OTS_RELAY_URL = 'https://npa-dashboard.vercel.app/api/lock-ots';
function syncLockToServer(acctNo, locked, amount, btn){
  if(btn){ btn.classList.remove('sync-err'); btn.classList.add('syncing'); }
  fetch(LOCK_OTS_RELAY_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ acctNo, locked, amount })
  }).then(r => { if(!r.ok) throw new Error('sync_failed_'+r.status); })
    .then(() => { if(btn) btn.classList.remove('syncing'); })
    .catch(() => {
      if(btn){
        btn.classList.remove('syncing'); btn.classList.add('sync-err');
        btn.title = 'Locked on this device, but could not sync to other devices -- check your internet connection.';
      }
    });
}

/* Merges in any lock/unlock made from another device since this page was
   loaded. Only ever adds/removes entries actually present in the live file
   -- never touches an in-progress unfrozen draft for an account nobody
   else has locked, so it can't stomp on something the user is mid-typing. */
function refreshLocksFromServer(){
  fetchJson('data/locked-ots.json?t=' + Date.now()).then(liveLocks => {
    if(!liveLocks || typeof liveLocks !== 'object') return;
    let changed = false;
    Object.keys(liveLocks).forEach(acct => {
      if(frozen[acct]!==true || String(otsAmounts[acct])!==String(liveLocks[acct])){
        frozen[acct] = true; otsAmounts[acct] = liveLocks[acct]; DATA.lockedOts[acct] = liveLocks[acct];
        changed = true;
      }
    });
    Object.keys(DATA.lockedOts).forEach(acct => {
      if(!(acct in liveLocks)){ delete DATA.lockedOts[acct]; delete frozen[acct]; changed = true; }
    });
    if(!changed) return;
    if(window.__slots){
      window.__slots.forEach((s,i) => {
        const btn = document.getElementById('freezeBtn-'+i);
        const input = document.getElementById('otsInput-'+i);
        if(!btn || !input) return;
        const isFrozen = !!frozen[s.acctNo];
        btn.classList.toggle('frozen', isFrozen);
        btn.title = isFrozen ? 'Frozen — click to edit' : 'Freeze this OTS amount';
        input.disabled = isFrozen;
        if(isFrozen) input.value = otsAmounts[s.acctNo]||'';
        recalcLoan(i);
      });
      recalcAggregate();
    }
    if(__lastSearchMatches && document.querySelector('.view.active')?.dataset.view==='search') renderResults(__lastSearchMatches, __lastSearchMode);
    if(document.querySelector('.view.active')?.dataset.view==='dashboard') renderDashboard();
  }).catch(()=>{});
}

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
  if(frozen[acctNo]) DATA.lockedOts[acctNo] = v; else delete DATA.lockedOts[acctNo];
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
  syncLockToServer(acctNo, frozen[acctNo], frozen[acctNo]?v:undefined, btn);
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
  closePublishReview();
  if(show) loadVersionHistory();
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
  return { rows: outRows, sciCount, badBalCount, blankCustCount };
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
/* Matches the real HO "Daily Follow-up Sheet" layout: a header row with
   plain "Sol ID"/"Branch Name" columns, but the Advance column's own header
   cell just says generic "AMT" -- its real label ("Advances <as-on-date>")
   lives in a merged cell 1-3 rows above, since the date changes every time
   this file is refreshed. Falls back to a plain "Total Advance" column
   directly in the header row for a manually-filled template. Matches
   branches by Sol ID (a stable numeric code), not branch name, since the
   same branch can appear under different name spellings/abbreviations
   across different HO reports (e.g. "MURSAN GATE" vs "M.G.Hathras") --
   Sol ID is the one thing guaranteed to match the NPA data's own Sol ID
   column. Figures are entered in the same unit UPGB already reports them
   in, Lakhs, and converted to plain rupees here to match the NPA data's
   units. NPA March/June are optional (older, simpler advance-only files
   still work) -- matched by prefix ("npamarch"/"npajune") since the
   header's own year suffix moves forward every year (MARCH 26 -> 27 -> ...). */
function buildBranchAdvanceMap(allRows, hIdx){
  const header = (allRows[hIdx]||[]).map(normHeader);
  const idx = (...names) => { for(const n of names){ const i = header.indexOf(normHeader(n)); if(i>=0) return i; } return -1; };
  const idxPrefix = (name) => header.findIndex(h=>h.startsWith(normHeader(name)));
  const iSol = idx('solid','sol');
  if(iSol<0) throw new Error('Could not find a "Sol ID" column -- branches are matched by Sol ID, not name, since branch names vary between reports.');
  const iBranchName = idx('branchname','branch');
  let iAdv = idx('totaladvance','advance','advancelakhs','totaladvancelakhs');
  if(iAdv<0){
    for(let r=Math.max(0,hIdx-3); r<hIdx && iAdv<0; r++){
      const row = allRows[r]||[];
      for(let c=0;c<row.length;c++){
        if(/^advances?\b/i.test(String(row[c]||'').trim())){ iAdv = c; break; }
      }
    }
  }
  if(iAdv<0) throw new Error('Could not find an "Advances" column (checked the header row and the few rows above it).');
  const iNpaMar = idxPrefix('npamarch');
  const iNpaJun = idxPrefix('npajune');
  const toRupees = (v) => {
    const lakhs = parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''));
    return isNaN(lakhs) ? null : lakhs*100000;
  };
  const map = {};
  for(const row of allRows.slice(hIdx+1)){
    const sol = cellStr(row, iSol);
    if(!sol) continue;
    const adv = toRupees(row[iAdv]);
    if(adv===null || adv<=0) continue;
    map[sol] = {
      adv,
      branchName: iBranchName>=0 ? cellStr(row, iBranchName) : '',
      npaMar26: iNpaMar>=0 ? toRupees(row[iNpaMar]) : null,
      npaJun26: iNpaJun>=0 ? toRupees(row[iNpaJun]) : null,
    };
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
    const {rows, sciCount, badBalCount, blankCustCount} = mapHoRowsToNpa(parsed.header, parsed.rows);
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
      statusEl.innerHTML = `<div class="upload-status ok">✔ Parsed successfully. Review below, then Apply.</div>` +
        (sciCount ? `<div class="upload-status err" style="margin-top:8px">⚠ ${sciCount.toLocaleString('en-IN')} account number(s) were stored in scientific notation and may be missing trailing digits.</div>` : '');
    }
    summaryEl.innerHTML = `
      <div class="upload-summary">
        <div class="box"><div class="k">Loan accounts found</div><div class="v">${rows.length.toLocaleString('en-IN')}</div></div>
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

/* Total advance is a much slower-moving figure than daily NPA data, so this
   upload applies immediately (no separate Apply step) rather than staging
   alongside the NPA file -- there's no risk of it corrupting account data,
   only of a bad NPA% showing until the next Publish. Uploading always fully
   replaces the previous figures (a stale branch just silently loses its %
   until re-uploaded, rather than guessing which branches carry forward). */
function handleBranchAdvUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const labelEl = document.getElementById('branchAdvUploadDropLabel');
  if(labelEl) labelEl.textContent = file.name;
  const statusEl = document.getElementById('branchAdvUploadStatus');
  statusEl.innerHTML = `<div class="upload-status info">Reading Branch Advance file…</div>`;
  const isCsv = /\.csv$/i.test(file.name);
  const reader = new FileReader();
  reader.onerror = function(){ statusEl.innerHTML = `<div class="upload-status err">⚠ Failed to read the file from disk.</div>`; };
  reader.onload = function(e){
    try{
      const headerHints = ['solid','sol'];
      let allRows, hIdx;
      if(isCsv){
        allRows = parseCSV(String(e.target.result));
        hIdx = findHeaderRowIndex(allRows, headerHints);
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array', cellDates:true});
        const sheetName = wb.SheetNames.find(n=>/daily\s*follow[\s-]*up/i.test(n))
          || wb.SheetNames.find(n=>!/field\s*reference|npa\s*list|holiday|gap/i.test(n))
          || wb.SheetNames[0];
        allRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, raw:true, defval:''});
        hIdx = findHeaderRowIndex(allRows, headerHints);
      }
      const map = buildBranchAdvanceMap(allRows, hIdx);
      const count = Object.keys(map).length;
      if(!count) throw new Error('No valid Sol ID/Advance rows found.');
      DATA.branchAdvances = map;
      const label = document.getElementById('branchAdvStatusLabel');
      if(label) label.textContent = `${count.toLocaleString('en-IN')} branch(es) loaded (${file.name})`;
      statusEl.innerHTML = `<div class="upload-status ok">✔ ${count.toLocaleString('en-IN')} branch advance figure(s) parsed. NPA % is now shown on the Dashboard.</div>`;
      const publishBtn = document.getElementById('publishBtn');
      if(publishBtn) publishBtn.disabled = false;
      if(document.querySelector('.view.active')?.dataset.view==='dashboard') renderDashboard();
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
  const newRows = __pendingData.npa.rows;
  /* A daily upload is the full current state of the book -- any account no
     longer present has regularized/closed and should disappear, so the
     new file always fully replaces the old data rather than merging. */
  const newAcctSet = new Set(newRows.map(r=>String(r[C.ACCT_NO]||'')));
  const oldAcctSet = new Set((DATA.npa.rows||[]).map(r=>String(r[C.ACCT_NO]||'')));
  const staleRemovedCount = (DATA.npa.rows||[]).filter(r=>!newAcctSet.has(String(r[C.ACCT_NO]||''))).length;
  const newAddedCount = newRows.filter(r=>!oldAcctSet.has(String(r[C.ACCT_NO]||''))).length;

  DATA.npa = { headers: __pendingData.npa.headers, rows: newRows };
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

  // Locked OTS amounts carry forward across a data update -- only drop the
  // ones whose account no longer exists (regularized/closed), same rule as
  // the NPA rows themselves.
  Object.keys(DATA.lockedOts).forEach(acct => { if(!newAcctSet.has(acct)) delete DATA.lockedOts[acct]; });
  otsAmounts = {}; frozen = {};
  Object.keys(DATA.lockedOts).forEach(acct => { otsAmounts[acct] = DATA.lockedOts[acct]; frozen[acct] = true; });
  updateReportDateDisplay();
  const staleMsg = staleRemovedCount>0 ? ` (${staleRemovedCount.toLocaleString('en-IN')} account(s) from the previous data no longer appear — regularized/closed accounts removed.)` : '';
  const addedMsg = newAddedCount>0 ? ` (${newAddedCount.toLocaleString('en-IN')} new account(s) added.)` : '';
  document.getElementById('uploadStatus').innerHTML = `<div class="upload-status ok">✔ Data updated — ${DATA.npa.rows.length.toLocaleString('en-IN')} NPA rows now active.${staleMsg}${addedMsg}</div>`;
  document.getElementById('downloadAppBtn').disabled = false;
  const publishBtn = document.getElementById('publishBtn');
  if(publishBtn) publishBtn.disabled = false;
  __lastApplyMeta = {
    staleRemovedCount,
    newAddedCount,
    newRowCount: newRows.length,
  };
  document.getElementById('searchHeader').style.display='';
  renderEmpty();
  renderDashboard();
  __pendingData = null;
  __pendingAsOnDate = null;
}
let __lastApplyMeta = null;

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
function downloadBranchAdvTemplate(){
  const headers = ['Sol ID','Branch Name','Advance (₹ Lakhs)','NPA MARCH 26 (₹ Lakhs)','NPA JUNE 26(₹ Lakhs)'];
  const example = ['9282','M.G.Hathras','1877.53','71.53','75.45'];
  downloadCsvTemplate('UPGB_Branch_Advance_Template.csv', headers, example);
}

function downloadUpdatedApp(){
  const json = JSON.stringify({ npa: DATA.npa, oldots: DATA.oldots, asOnDate: DATA.asOnDate||null });
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = (DATA.asOnDate||'').replace(/[^0-9]/g,'') || 'backup';
  a.href = url;
  a.download = `UPGB_NPA_data_backup_${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}

/* ---------- Publish to live site (commits data/latest.json straight to
   this repo via GitHub's Git Data API, using the Admin's own already-repo-
   scoped OAuth token -- see js/publish.js). Only the final ref-update step
   changes what's live; anything that fails before that leaves production
   untouched. ---------- */
let __pendingPublish = null; // { type: 'publish'|'rollback', dataObj, meta, versionId } staged for confirmPublish()
let __lastHistoryList = []; // last-loaded version history, so rollback review can show metadata without a separate fetch

function computeCurrentDataSummary(){
  return { rowCount: DATA.npa.rows.length, asOnDate: DATA.asOnDate||null };
}
function openPublishReview(){
  const summary = computeCurrentDataSummary();
  const meta = __lastApplyMeta || {};
  const user = (window.UPGBAuth && window.UPGBAuth.getCurrentUser()) || {};
  const staleLine = meta.staleRemovedCount>0
    ? `<div class="pr-warn">${meta.staleRemovedCount.toLocaleString('en-IN')} account(s) removed as regularized/closed.</div>`
    : '';
  const addedLine = meta.newAddedCount>0
    ? `<div class="pr-good">${meta.newAddedCount.toLocaleString('en-IN')} new account(s) added.</div>`
    : '';
  const bankLine = __pendingBankData
    ? `<div class="pr-good">Bank-wide dashboard data will also update — ${__pendingBankData.regions.length} regions, as on ${esc((__pendingBankData.asOnDate||'').split('-').reverse().join('-'))}.</div>`
    : '';
  document.getElementById('publishReviewSummary').innerHTML = `
    <div>Data as on: <b>${esc(fmtAsOnDisplay())}</b></div>
    <div>Total accounts live after publish: <b>${summary.rowCount.toLocaleString('en-IN')}</b></div>
    ${addedLine}
    ${staleLine}
    ${bankLine}
    <div style="margin-top:8px;color:var(--sub)">Publishing as <b>${esc(user.login||'unknown')}</b>. Goes live on npadashboard.alokmittal.net within about a minute.</div>
  `;
  __pendingPublish = {
    type: 'publish',
    dataObj: { npa: DATA.npa, oldots: DATA.oldots, asOnDate: DATA.asOnDate||null, lockedOts: DATA.lockedOts||{}, branchAdvances: DATA.branchAdvances||{} },
    meta: {
      asOnDate: summary.asOnDate,
      rowCount: summary.rowCount,
      commitMessage: `Publish NPA data: ${summary.rowCount.toLocaleString('en-IN')} accounts, as on ${summary.asOnDate||'unknown'}`,
      publishedBy: user.login || null,
      isRollback: false,
    },
  };
  document.getElementById('publishConfirmBtn').textContent = 'Confirm & Publish';
  document.getElementById('publishReviewPanel').style.display = 'block';
  document.getElementById('publishStatus').innerHTML = '';
}
function closePublishReview(){
  const panel = document.getElementById('publishReviewPanel');
  if(panel) panel.style.display = 'none';
  __pendingPublish = null;
}
/* Snapshots each published bank-wide dataset to its own small history file,
   mirroring the main NPA data's history/index.json pattern -- lets a future
   sparkline/trend feature look back over daily uploads once enough of them
   have accumulated. Best-effort: a failure here must never block the main
   NPA-data publish, so callers should swallow errors from this. */
async function buildBankHistoryFiles(bankData, user){
  let index = [];
  try{ index = await fetchJson('data/bank-history/index.json?t=' + Date.now()); } catch(e){ index = []; }
  if(!Array.isArray(index)) index = [];
  const safeDate = (bankData.asOnDate||'unknown').replace(/[^0-9-]/g,'');
  const historyFileName = `bank-history/${safeDate}-${Date.now()}.json`;
  index.unshift({
    date: bankData.asOnDate||null,
    file: historyFileName,
    regionsCount: bankData.regions.length,
    publishedAt: new Date().toISOString(),
    publishedBy: user.login||null,
  });
  if(index.length>120) index = index.slice(0,120);
  return [
    { path:`data/${historyFileName}`, content: bankData },
    { path:'data/bank-history/index.json', content: index },
  ];
}
async function confirmPublish(){
  if(!__pendingPublish || !window.UPGBPublish) return;
  const confirmBtn = document.getElementById('publishConfirmBtn');
  const cancelBtn = document.getElementById('publishCancelBtn');
  const statusEl = document.getElementById('publishStatus');
  confirmBtn.disabled = true; cancelBtn.disabled = true;
  confirmBtn.classList.add('is-loading');
  const onProgress = (msg) => { statusEl.innerHTML = `<div class="upload-status ok">⏳ ${esc(msg)}</div>`; };
  try{
    let extraFiles;
    if(__pendingPublish.type!=='rollback' && __pendingBankData){
      extraFiles = [{ path:'data/bank-npa.json', content: __pendingBankData }];
      try{
        const user = (window.UPGBAuth && window.UPGBAuth.getCurrentUser()) || {};
        extraFiles = extraFiles.concat(await buildBankHistoryFiles(__pendingBankData, user));
      } catch(e){ /* history snapshot is best-effort -- the main bank-npa.json publish still proceeds */ }
    }
    if(__pendingPublish.type!=='rollback' && __pendingPnpaData){
      extraFiles = (extraFiles||[]).concat([{ path:'data/pnpa.json', content: __pendingPnpaData }]);
    }
    if(__pendingPublish.type!=='rollback' && __pendingKccOverdueData){
      extraFiles = (extraFiles||[]).concat([{ path:'data/kcc-overdue.json', content: __pendingKccOverdueData }]);
    }
    const result = __pendingPublish.type === 'rollback'
      ? await window.UPGBPublish.rollbackToVersion(__pendingPublish.versionId, onProgress)
      : await window.UPGBPublish.publishData(__pendingPublish.dataObj, __pendingPublish.meta, onProgress, extraFiles);
    statusEl.innerHTML = `<div class="upload-status ok">✔ Published — live at npadashboard.alokmittal.net within ~30-60s (commit ${esc(result.commitSha.slice(0,7))}).</div>`;
    document.getElementById('publishBtn').disabled = true;
    __pendingBankData = null;
    __pendingPnpaData = null;
    __pendingKccOverdueData = null;
    closePublishReview();
    loadVersionHistory();
  } catch(err){
    statusEl.innerHTML = `<div class="upload-status err">⚠ Publish failed: ${esc(err.message||err)}. Nothing changed on the live site — safe to retry.</div>`;
  } finally {
    confirmBtn.disabled = false; cancelBtn.disabled = false;
    confirmBtn.classList.remove('is-loading');
  }
}
async function loadVersionHistory(){
  const listEl = document.getElementById('versionHistoryList');
  const countEl = document.getElementById('versionHistoryCount');
  if(!listEl || !window.UPGBPublish) return;
  listEl.innerHTML = '<div style="padding:8px 0;color:var(--sub);font-size:11.5px">Loading…</div>';
  try{
    const history = await window.UPGBPublish.getHistoryIndex();
    __lastHistoryList = history;
    if(countEl) countEl.textContent = history.length ? `(${history.length})` : '';
    if(!history.length){ listEl.innerHTML = '<div style="padding:8px 0;color:var(--sub);font-size:11.5px">No published versions yet.</div>'; return; }
    listEl.innerHTML = history.map((v,i)=>`
      <div class="version-row${i===0?' current':''}">
        <div>
          <span class="vr-meta">${esc(v.date||'Unknown date')} — ${(v.rowCount||0).toLocaleString('en-IN')} accounts</span>
          <span class="vr-sub">${v.isRollback?'rollback · ':''}published ${v.publishedAt?fmtDateTime(new Date(v.publishedAt)):''}${v.publishedBy?' by '+esc(v.publishedBy):''}</span>
        </div>
        ${i===0?'':`<button type="button" onclick="openRollbackReview('${esc(v.file)}')">Rollback to this</button>`}
      </div>
    `).join('');
  } catch(err){
    listEl.innerHTML = `<div style="padding:8px 0;color:var(--red);font-size:11.5px">Could not load version history: ${esc(err.message||err)}</div>`;
  }
}
function openRollbackReview(fileName){
  const version = __lastHistoryList.find(v=>v.file===fileName);
  if(!version) return;
  document.getElementById('publishReviewSummary').innerHTML = `
    <div class="pr-warn">You are about to roll back the LIVE site to an older version.</div>
    <div>Version date: <b>${esc(version.date||'unknown')}</b></div>
    <div>Accounts in this version: <b>${(version.rowCount||0).toLocaleString('en-IN')}</b></div>
    <div style="margin-top:8px;color:var(--sub)">This publishes the old version again as the new current version — nothing in your current session's applied data is used.</div>
  `;
  __pendingPublish = { type: 'rollback', versionId: fileName };
  document.getElementById('publishConfirmBtn').textContent = 'Confirm Rollback';
  document.getElementById('publishReviewPanel').style.display = 'block';
  document.getElementById('publishStatus').innerHTML = '';
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

function computeDashboardStats(branchFilter){
  const rows = DATA.npa.rows;
  const today = new Date();
  const assetMix = {};
  const branchMap = new Map();
  const allBranches = new Set();
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
    if(branch) allBranches.add(branch);
    if(acct==='' || seen.has(acct)) continue;
    seen.add(acct);
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

    if(!branchMap.has(branch)) branchMap.set(branch,{count:0,os:0,solId:String(r[C.SOL_ID]||'')});
    const b=branchMap.get(branch); b.count++; b.os+=os;

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
    schemeMix, slabs, custCount: custList.length,
    highValueCustCount: highValueCust.length, highValueOS, highValueCustList,
    acctList, allAcctSorted,
  };
}

function fmtINR2(n){ if(n===''||n===null||n===undefined||isNaN(n)) return '—'; return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function populateBranchFilter(branches){
  const sel = document.getElementById('dashBranchFilter');
  if(!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Regional Office</option>` + branches.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');
  sel.value = branches.includes(current) ? current : '';
}
function updateDashTitle(){
  const el = document.getElementById('dashTitle');
  if(!el) return;
  const first = DATA.npa.rows.find(r=>r[C.REGION]);
  el.textContent = first ? `UPGB ${titleCase(String(first[C.REGION]))} region NPA Portfolio` : 'UPGB NPA Portfolio';
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

function donutCard(segments, size, centerValue, centerLabel){
  return `<div class="donut-wrap">
    ${svgDonut(segments, size)}
    <div class="donut-center"><div class="donut-center-value">${esc(centerValue)}</div><div class="donut-center-label">${esc(centerLabel)}</div></div>
  </div>`;
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
  else if(listModalState.type==='pnpa'){ body.innerHTML = pnpaAcctRows(sorted); }
  else if(listModalState.type==='kccov'){ body.innerHTML = kccovAcctRows(sorted); }
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
  const anyBadge = items.some(i=>i.badge);
  return items.map(it=>{
    const pct = Math.max(2, (it.value/max*100));
    return `<div class="bar-row${anyBadge?' has-npa':''}${it.onclick?' clickable':''}"${it.onclick?` onclick="${it.onclick}"`:''}>
      <div class="bar-label" title="${esc(it.label)}">${esc(it.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${it.color||'var(--accent)'};color:${it.color||'var(--accent)'}"></div></div>
      <div class="bar-value">${it.valueLabel}</div>
      ${anyBadge?`<div class="bar-npa-badge" style="color:${it.badge?(it.badgeColor||'var(--ink)'):'var(--ink-mute)'}">${it.badge?esc(it.badge)+'<span class=\"bar-npa-tag\">NPA</span>':'—'}</div>`:''}
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

/* Lucide-style icons (rounded, 2px stroke, 24x24 viewBox) for the hero KPI
   row and insight strip -- hand-drawn to match the icon convention already
   used throughout the app (stroke="currentColor" so each card tints its own
   icon via CSS). */
const ICON_BANKNOTE = '<rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>';
const ICON_USERS = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
const ICON_ALERT_TRIANGLE = '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const ICON_TICKET = '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>';
const ICON_ALERT_CIRCLE = '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
const ICON_LANDMARK = '<path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>';
const ICON_MAP = '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>';
const ICON_STAR = '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
const ICON_TARGET = '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>';
function svgIcon(pathData){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pathData}</svg>`; }

function heroKpiCard(opts){
  return `<div class="hero-kpi-card${opts.onclick?' clickable':''}"${opts.onclick?` onclick="${opts.onclick}"`:''} style="--hero-tint:${opts.tint};--hero-color:${opts.color}">
    ${opts.badge||''}
    ${opts.corner||''}
    <div class="hero-kpi-icon">${svgIcon(opts.icon)}</div>
    <div class="hero-kpi-label">${esc(opts.label)}</div>
    <div class="hero-kpi-value" id="${opts.id}">${opts.fallback||'—'}</div>
    <div class="hero-kpi-sub">${opts.sub}</div>
  </div>`;
}

let currentDashStats = null;
const BUCKET_LABELS = {ne:'Not yet eligible (≤ 6 months)', y1:'6 months – 1 year', y13:'1 – 3 years', y3p:'3+ years'};

/* Filter changes (region/branch) call this instead of renderDashboard()
   directly, so the swap reads as a soft cross-fade — dim briefly, replace
   the numbers/charts while still dimmed, then ease back in — instead of
   the whole panel abruptly flashing blank. */
function renderDashboardSmooth(){
  const el = document.getElementById('dashboardArea');
  if(!el){ renderDashboard(); return; }
  el.classList.add('dash-updating');
  el.classList.add('no-card-anim');
  setTimeout(()=>{
    renderDashboard();
    requestAnimationFrame(()=>{ el.classList.remove('dash-updating'); });
  }, 90);
}

function drillBranch(branch){
  const sel = document.getElementById('dashBranchFilter');
  if(sel){ sel.value = branch; renderDashboardSmooth(); }
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
window.openRollbackReview = openRollbackReview;
window.showAssetList = showAssetList;
window.showBucketList = showBucketList;
window.showSchemeList = showSchemeList;
window.showSlabList = showSlabList;
window.showHighValueCustList = showHighValueCustList;

/* Shown in the top-right corner of the "Total Outstanding" hero card,
   below the NPA% badge -- mirrors the same March/June + gap treatment
   built for the Bank Dashboard's hero cards, using the per-branch NPA
   March/June figures from the Branch Advance upload. Only aggregates
   over branches that actually have a Mar/Jun figure (and only compares
   against THOSE branches' current O/S), same safeguard as the advance
   aggregation just above -- so a partial upload never produces a
   misleading gap by comparing against branches with no baseline. */
function dashboardCornerStats(s){
  let marOS=0, marBase=0, marN=0, junOS=0, junBase=0, junN=0;
  s.branchMap.forEach((v)=>{
    const rec = DATA.branchAdvances[v.solId];
    if(rec && rec.npaMar26!=null){ marOS+=v.os; marBase+=rec.npaMar26; marN++; }
    if(rec && rec.npaJun26!=null){ junOS+=v.os; junBase+=rec.npaJun26; junN++; }
  });
  if(!marN && !junN) return '';
  const gapLine = (v) => { const improved = v<=0; return `<span style="color:${improved?'var(--green)':'var(--red)'}">${improved?'▼':'▲'} ${fmtCr(Math.abs(v))}</span>`; };
  let html = '<div class="hero-kpi-corner-stats">';
  if(marN) html += `<div class="hero-kpi-corner-group"><div class="hero-kpi-corner-row"><span>Mar</span><b>${fmtCr(marBase)}</b></div><div class="hero-kpi-corner-gap">${gapLine(marOS-marBase)}</div></div>`;
  if(junN) html += `<div class="hero-kpi-corner-group"><div class="hero-kpi-corner-row"><span>Jun</span><b>${fmtCr(junBase)}</b></div><div class="hero-kpi-corner-gap">${gapLine(junOS-junBase)}</div></div>`;
  html += '</div>';
  return html;
}

function renderDashboard(){
  const el = document.getElementById('dashboardArea');
  if(!el) return;
  const filterSel = document.getElementById('dashBranchFilter');
  const branchFilter = filterSel ? filterSel.value : '';
  const s = computeDashboardStats(branchFilter || null);
  currentDashStats = s;
  populateBranchFilter(s.allBranches);
  updateDashTitle();

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
    .map(([branch,v])=>{
      const rec = DATA.branchAdvances[v.solId];
      const npaPct = rec && rec.adv>0 ? (v.os/rec.adv*100) : null;
      return {label:branch, value:v.os, color:'var(--accent)',
        valueLabel:`${v.count.toLocaleString('en-IN')} · ${fmtCr(v.os)} · ${(s.totalOS?(v.os/s.totalOS*100):0).toFixed(2)}%`,
        badge: npaPct!==null ? npaPct.toFixed(1)+'%' : null,
        badgeColor: npaPct!==null ? npaPctSeverity(npaPct).color : null,
        onclick:`drillBranch('${jsq(branch)}')`};
    });

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

  const highRiskOS = (s.assetMix.DA3?s.assetMix.DA3.os:0) + (s.assetMix.LOSS?s.assetMix.LOSS.os:0);
  const highRiskPct = s.totalOS ? (highRiskOS/s.totalOS*100) : 0;
  const avgTicket = s.totalAccounts ? s.totalOS/s.totalAccounts : 0;

  /* NPA % (NPA outstanding ÷ total advance) for whatever's currently in
     view -- the whole book when "Regional Office" is selected, or just that
     branch when one is picked from the filter, since s.branchMap already
     reflects that filter. Only aggregates over branches with an uploaded
     advance figure, so a partially-uploaded advance file never silently
     understates the ratio by dividing by a smaller, incomplete total. */
  let advOsSum=0, advSum=0, advBranchCount=0;
  s.branchMap.forEach((v)=>{
    const rec = DATA.branchAdvances[v.solId];
    if(rec && rec.adv>0){ advOsSum+=v.os; advSum+=rec.adv; advBranchCount++; }
  });
  const aggNpaPct = advSum>0 ? (advOsSum/advSum*100) : null;
  const heroCorner = dashboardCornerStats(s);
  let heroNpaBadge = '';
  if(aggNpaPct!==null){
    const sev = npaPctSeverity(aggNpaPct);
    heroNpaBadge = `<div class="hero-kpi-badge" style="background:${sev.soft};color:${sev.color}">${aggNpaPct.toFixed(1)}% NPA</div>`;
  }

  /* "What should happen next" -- the single largest concentration of aged,
     actionable exposure (excludes the "not yet eligible" bucket, since that
     one isn't actionable yet), computed fresh from real data every render
     rather than a fixed/fabricated callout. */
  const actionableBuckets = s.buckets.filter(b=>b.id!=='ne' && b.os>0);
  const topBucket = actionableBuckets.length ? actionableBuckets.reduce((max,b)=>b.os>max.os?b:max) : null;

  el.innerHTML = `
    <div class="hero-kpi-row">
      ${heroKpiCard({id:'heroTotalOs', label:'Total Outstanding', fallback:fmtCr(s.totalOS), sub:s.totalAccounts.toLocaleString('en-IN')+' accounts', icon:ICON_BANKNOTE, tint:'var(--accent-soft)', color:'var(--accent)', badge:heroNpaBadge, corner:heroCorner})}
      ${heroKpiCard({id:'heroTotalAccts', label:'Total Accounts', fallback:s.totalAccounts.toLocaleString('en-IN'), sub:s.custCount.toLocaleString('en-IN')+' unique customers', icon:ICON_USERS, tint:'var(--gauge-track)', color:'var(--accent-2)'})}
      ${heroKpiCard({id:'heroHighRisk', label:'High-Risk Exposure', fallback:fmtCr(highRiskOS), sub:'DA3 + Loss · '+highRiskPct.toFixed(1)+'% of book', icon:ICON_ALERT_TRIANGLE, tint:'var(--red-soft)', color:'var(--red)', onclick:(s.assetMix.LOSS||s.assetMix.DA3)?`showAssetList('${s.assetMix.LOSS?'LOSS':'DA3'}')`:''})}
      ${heroKpiCard({id:'heroAvgTicket', label:'Average Ticket Size', fallback:fmtINR2(avgTicket), sub:'per account, this book', icon:ICON_TICKET, tint:'var(--amber-soft)', color:'var(--amber)'})}
    </div>

    ${topBucket ? `
    <div class="insight-strip clickable" onclick="showBucketList('${topBucket.id}')">
      <div class="insight-icon">${svgIcon(ICON_ALERT_CIRCLE)}</div>
      <div class="insight-body">
        <div class="insight-title">Recovery focus: ${esc(BUCKET_LABELS[topBucket.id]||topBucket.label)}</div>
        <div class="insight-text">${fmtCr(topBucket.os)} across ${topBucket.count.toLocaleString('en-IN')} account(s) — the largest concentration of aged exposure in this book.</div>
      </div>
      <div class="insight-cta">View list →</div>
    </div>` : ''}

    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-title">Total Outstanding — KCC vs Non-KCC<span class="chart-sub">scheme CC004 = KCC · every other scheme = Non-KCC</span></div>
        <div class="kcc-total-strip">
          <div><div class="lbl">Total A/C Amount</div><div class="val">${fmtCr(s.totalOS)}</div></div>
          <div><div class="lbl">Total Accounts</div><div class="val">${s.totalAccounts.toLocaleString('en-IN')}</div></div>
        </div>
        <div class="donut-flex">
          ${donutCard(kccSeg, undefined, fmtCr(s.totalOS), 'Total O/S')}
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
          ${donutCard(slabSeg, undefined, fmtCr(s.totalOS), 'Total O/S')}
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

  const heroOs = document.getElementById('heroTotalOs');
  if(heroOs) animateNumber(heroOs, 0, s.totalOS, fmtCr, 900);
  const heroAccts = document.getElementById('heroTotalAccts');
  if(heroAccts) animateNumber(heroAccts, 0, s.totalAccounts, n=>Math.round(n).toLocaleString('en-IN'), 900);
  const heroRisk = document.getElementById('heroHighRisk');
  if(heroRisk) animateNumber(heroRisk, 0, highRiskOS, fmtCr, 900);
  const heroTicket = document.getElementById('heroAvgTicket');
  if(heroTicket) animateNumber(heroTicket, 0, avgTicket, fmtINR2, 900);
}

/* ---------- Bank-wide NPA Dashboard (all 65 regions, from Alok's daily
   whole-bank MIS PDF -- separate dataset from the Hathras-only account-
   level book above). Figures here are already in ₹ Crore, as printed in
   the source PDF -- fmtCr() above assumes plain rupees, so this view uses
   its own formatter instead. ---------- */
let BANK_DATA = null;
function fmtBankCr(n){ if(n===null||n===undefined||isNaN(n)) return '—'; return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})+' Cr'; }
function fmtBankPct(n){ return (n===null||n===undefined||isNaN(n)) ? '—' : n.toFixed(2)+'%'; }
let bankRegionFilter = '';
let bankMarchFilter = '';
let bankTargetFilter = '';
function bankTabInfo(o){
  const ahead = o.gapFromTarget<=0;
  return { color: ahead?'var(--green)':'var(--red)', text: `${ahead?'✓ Ahead of target by':'⚠ Behind target by'} ${fmtBankCr(Math.abs(o.gapFromTarget))}` };
}
/* Shown in the otherwise-empty top-right corner of each hero card, below
   the NPA% badge -- March and June are fixed baseline columns the source
   PDF itself reports (npaMar26/npaJun26), so showing both directly here
   is more scannable than the tab-toggle this replaced (had to click to
   see one comparison at a time). */
/* Gap line under each of Mar/Jun: negative = NPA has since reduced (good,
   green ▼); positive = increased (bad, red ▲) -- same sign convention as
   netReductionOverMar26 everywhere else in this tab. March's gap reuses
   the report's own netReductionOverMar26 field rather than re-deriving it
   (avoids rounding drift); June has no equivalent field in the source
   PDF, so it's computed directly (current − npaJun26). */
function bankCornerGapLine(v){
  const improved = v<=0;
  return `<span style="color:${improved?'var(--green)':'var(--red)'}">${improved?'▼':'▲'} ${fmtBankCr(Math.abs(v))}</span>`;
}
function bankCornerStats(o){
  const junGap = o.remainingNpaAsOnDate - o.npaJun26;
  return `<div class="hero-kpi-corner-stats">
    <div class="hero-kpi-corner-group">
      <div class="hero-kpi-corner-row"><span>Mar</span><b>${fmtBankCr(o.npaMar26)}</b></div>
      <div class="hero-kpi-corner-gap">${bankCornerGapLine(o.netReductionOverMar26)}</div>
    </div>
    <div class="hero-kpi-corner-group">
      <div class="hero-kpi-corner-row"><span>Jun</span><b>${fmtBankCr(o.npaJun26)}</b></div>
      <div class="hero-kpi-corner-gap">${bankCornerGapLine(junGap)}</div>
    </div>
  </div>`;
}
let __pendingBankData = null;

/* Parses Alok's daily whole-bank "Dashboard of NPA" PDF client-side, via
   pdf.js (js/vendor/pdf.min.js) -- no server involved. The PDF has no
   underlying table structure, only positioned text, so rows are
   reconstructed by clustering text items with close y-coordinates
   (tolerance tuned against the real report; regular data rows land
   consistently within ~1-2pt of each other, comfortably under the ~9pt gap
   between separate rows) then reading left-to-right by x. Region rows are
   "S.No, Region, 18 numbers" (20 items); "Sub Total CO <name>" rows close
   out a circle; "Total UPGB" is the bank grand total. This exact approach
   was validated against a real file before shipping: extracted figures
   matched the source PDF exactly, including cross-checking sums. */
const BANK_PDF_FIELD_NAMES = ['branches','totalAdv','npaMar26','pctWithAdvMar26','npaJun26','slippage',
  'addition','acSlippedUpgradedClosed','inttReversal','npaReductionOn','reductionDuringMonth',
  'netReductionDuringMonth','pctNetReductionOverPrevMonth','pctRemainingNpaWithAdv','remainingNpaAsOnDate',
  'netReductionOverMar26','targetCurrentMonth','gapFromTarget'];
function bankPdfToNum(s){ const c = String(s).replace(/%/g,'').replace(/,/g,'').trim(); const n = parseFloat(c); return isNaN(n)?null:n; }
function bankPdfFields(nums){ const o={}; BANK_PDF_FIELD_NAMES.forEach((name,i)=>{ o[name]=bankPdfToNum(nums[i]); }); return o; }
function bankPdfClusterRows(items, tol){
  const sorted = [...items].sort((a,b)=>b.y-a.y || a.x-b.x);
  const rows = []; let current=null, refY=null;
  for(const it of sorted){
    if(current && Math.abs(it.y-refY)<=tol) current.push(it);
    else { current=[it]; refY=it.y; rows.push(current); }
  }
  return rows.map(r=>r.sort((a,b)=>a.x-b.x));
}
async function parseBankPdf(arrayBuffer){
  if(!window.pdfjsLib) throw new Error('PDF reader did not load — check your connection and reload the page, then try again.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
  const doc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let regions = [], currentCoRegions = [], circles = [], grandTotal = null, asOnDateRaw = null;
  for(let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map(it=>({x:it.transform[4], y:it.transform[5], str:(it.str||'').trim()})).filter(it=>it.str!=='');
    const rows = bankPdfClusterRows(items, 3.5);
    for(const row of rows){
      const strs = row.map(it=>it.str);
      if(!asOnDateRaw){
        const m = strs.join(' ').match(/Dashboard of NPA as on ([\d.]+)/);
        if(m) asOnDateRaw = m[1];
      }
      if(/^\d+$/.test(strs[0]) && strs.length===20){
        currentCoRegions.push({ sno: parseInt(strs[0],10), region: strs[1], ...bankPdfFields(strs.slice(2)) });
      } else if(/^Sub Total/.test(strs[0]) && strs.length===19){
        const coName = strs[0].replace(/^Sub Total\s+/,'');
        circles.push({ name: coName, ...bankPdfFields(strs.slice(1)) });
        regions.push(...currentCoRegions.map(r=>({ ...r, co: coName })));
        currentCoRegions = [];
      } else if(/^Total UPGB/.test(strs[0]) && strs.length===19){
        grandTotal = bankPdfFields(strs.slice(1));
      }
    }
  }
  if(!grandTotal || regions.length<50){
    throw new Error('Could not recognize this PDF\'s layout — expected the "Dashboard of NPA" bank-wide report with region rows and a "Total UPGB" grand total.');
  }
  let asOnDate = null;
  if(asOnDateRaw){
    const parts = asOnDateRaw.split('.');
    if(parts.length===3) asOnDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return { asOnDate, ourRegion:'HATHRAS', ourCircle:'CO Moradabad', bankTotal:grandTotal, circles, regions };
}
function handleBankPdfUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('bankPdfUploadStatus');
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const parsed = await parseBankPdf(reader.result);
      __pendingBankData = parsed;
      BANK_DATA = parsed;
      const label = document.getElementById('bankPdfStatusLabel');
      if(label) label.textContent = `${parsed.regions.length} regions loaded (${file.name})`;
      statusEl.innerHTML = `<div class="upload-status ok">✔ Parsed ${parsed.regions.length} regions across ${parsed.circles.length} circles, as on ${esc(parsed.asOnDate||'unknown date')}. Goes live the next time you hit Publish.</div>`;
      const publishBtn = document.getElementById('publishBtn');
      if(publishBtn) publishBtn.disabled = false;
      if(document.querySelector('.view.active')?.dataset.view==='bank') renderBankDashboardBody();
    } catch(err){
      statusEl.innerHTML = `<div class="upload-status err">⚠ Could not read this file: ${esc(err.message||err)}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderBankDashboard(){
  const el = document.getElementById('bankDashboardArea');
  if(!el) return;
  if(BANK_DATA){ renderBankDashboardBody(); return; }
  el.innerHTML = `<div class="empty-state"><div class="data-loading-spinner" aria-hidden="true" style="position:static;border-color:rgba(58,123,255,.25);border-top-color:var(--accent)"></div><p style="margin-top:14px">Loading bank-wide NPA data…</p></div>`;
  fetchJson('data/bank-npa.json?t=' + Date.now())
    .then(d => { BANK_DATA = d; renderBankDashboardBody(); })
    .catch(() => {
      el.innerHTML = `<div class="empty-state"><h2>Could not load bank-wide data</h2><p>Check your internet connection, then tap Refresh.</p></div>`;
    });
}
function refreshBankDashboard(){ BANK_DATA = null; renderBankDashboard(); }

function bankRegionRank(regions, region){
  const sorted = [...regions].sort((a,b)=>a.pctRemainingNpaWithAdv-b.pctRemainingNpaWithAdv);
  return sorted.findIndex(r=>r.region===region.region)+1;
}

function renderBankDashboardBody(){
  const el = document.getElementById('bankDashboardArea');
  const d = BANK_DATA;
  const bank = d.bankTotal;
  const circle = d.circles.find(c=>c.name===d.ourCircle);
  const region = d.regions.find(r=>r.region===d.ourRegion);
  if(!bank || !circle || !region){ el.innerHTML = `<div class="empty-state"><h2>Bank data looks incomplete</h2></div>`; return; }

  document.querySelectorAll('.bank-report-date-val').forEach(e=>{
    const parts = (d.asOnDate||'').split('-');
    e.textContent = parts.length===3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : (d.asOnDate||'—');
  });

  const bankSev = npaPctSeverity(bank.pctRemainingNpaWithAdv);
  const circleSev = npaPctSeverity(circle.pctRemainingNpaWithAdv);
  const regionSev = npaPctSeverity(region.pctRemainingNpaWithAdv);
  const rank = bankRegionRank(d.regions, region);

  const heroRow = `<div class="hero-kpi-row bank-hero-row">
    ${heroKpiCard({
      id:'bankHeroTotal', icon:ICON_LANDMARK, label:'Whole Bank — UPGB',
      tint:'var(--accent-soft)', color:'var(--accent)',
      fallback: fmtBankCr(bank.remainingNpaAsOnDate),
      sub: `${bank.branches.toLocaleString('en-IN')} branches · 65 regions<span class="hero-kpi-sub2">Total Advance: ${fmtBankCr(bank.totalAdv)}</span><span class="hero-kpi-sub2" style="color:${bankTabInfo(bank).color}">${bankTabInfo(bank).text}</span>`,
      badge: `<div class="hero-kpi-badge" style="background:${bankSev.soft};color:${bankSev.color}">${fmtBankPct(bank.pctRemainingNpaWithAdv)} NPA</div>`,
      corner: bankCornerStats(bank)
    })}
    ${heroKpiCard({
      id:'bankHeroCircle', icon:ICON_MAP, label:'CO Moradabad — Our Circle',
      tint:'var(--accent-soft)', color:'var(--accent)',
      fallback: fmtBankCr(circle.remainingNpaAsOnDate),
      sub: `${circle.branches.toLocaleString('en-IN')} branches · 19 regions<span class="hero-kpi-sub2">Total Advance: ${fmtBankCr(circle.totalAdv)}</span><span class="hero-kpi-sub2" style="color:${bankTabInfo(circle).color}">${bankTabInfo(circle).text}</span>`,
      badge: `<div class="hero-kpi-badge" style="background:${circleSev.soft};color:${circleSev.color}">${fmtBankPct(circle.pctRemainingNpaWithAdv)} NPA</div>`,
      corner: bankCornerStats(circle)
    })}
    ${heroKpiCard({
      id:'bankHeroRegion', icon:ICON_STAR, label:'Hathras — Our Region',
      tint:'rgba(212,165,68,.16)', color:'var(--seal-d)',
      fallback: fmtBankCr(region.remainingNpaAsOnDate),
      sub: `${region.branches} branches · rank #${rank} of 65<span class="hero-kpi-sub2">Total Advance: ${fmtBankCr(region.totalAdv)}</span><span class="hero-kpi-sub2" style="color:${bankTabInfo(region).color}">${bankTabInfo(region).text}</span>`,
      badge: `<div class="hero-kpi-badge" style="background:${regionSev.soft};color:${regionSev.color}">${fmtBankPct(region.pctRemainingNpaWithAdv)} NPA</div>`,
      corner: bankCornerStats(region)
    })}
  </div>`;

  const vsCircle = circle.pctRemainingNpaWithAdv - region.pctRemainingNpaWithAdv;
  const vsBank = bank.pctRemainingNpaWithAdv - region.pctRemainingNpaWithAdv;
  const dir = (v) => v>=0 ? 'better' : 'worse';
  const insight = `<div class="insight-strip">
    <div class="insight-icon">${svgIcon(ICON_STAR)}</div>
    <div class="insight-body">
      <div class="insight-title">Hathras vs the rest of the bank</div>
      <div class="insight-text">Hathras's NPA ratio (${fmtBankPct(region.pctRemainingNpaWithAdv)}) is ${Math.abs(vsCircle).toFixed(2)} points ${dir(vsCircle)} than CO Moradabad's average and ${Math.abs(vsBank).toFixed(2)} points ${dir(vsBank)} than the whole Bank's average — ranked #${rank} of 65 regions.</div>
    </div>
  </div>`;

  const circleCards = d.circles.map(c => {
    const sev = npaPctSeverity(c.pctRemainingNpaWithAdv);
    const isOurs = c.name === d.ourCircle;
    const tab = bankTabInfo(c);
    return `<div class="circle-card${isOurs?' is-ours':''}">
      ${isOurs?'<div class="circle-card-tag">OUR CIRCLE</div>':''}
      <div class="circle-card-name">${esc(c.name)}</div>
      <div class="circle-card-npa" style="color:${sev.color}">${fmtBankPct(c.pctRemainingNpaWithAdv)}</div>
      <div class="circle-card-sub">${fmtBankCr(c.remainingNpaAsOnDate)} NPA · ${c.branches.toLocaleString('en-IN')} branches</div>
      <div class="circle-card-sub" style="color:${tab.color}">${tab.text}</div>
    </div>`;
  }).join('');

  /* Categorical fill for the 3 circles (identity, not severity) -- distinct
     from the green/amber/red status ramp used everywhere else on this tab.
     #0EA5C4 is a deliberately deepened cyan (not --accent-2's bright dark-
     theme value, which is tuned for text and reads too pale as a solid fill)
     -- validated via the dataviz skill's palette checker against both
     theme surfaces before shipping. */
  const CIRCLE_FILL_COLORS = { 'CO Gorakhpur':'var(--accent)', 'CO Lucknow':'#0EA5C4', 'CO Moradabad':'var(--seal-d)' };
  const circleSeg = d.circles.map(c => ({
    value: c.remainingNpaAsOnDate,
    color: CIRCLE_FILL_COLORS[c.name] || 'var(--ink-mute)',
    label: c.name.replace('CO ',''),
    valueLabel: `${fmtBankCr(c.remainingNpaAsOnDate)} · ${(c.remainingNpaAsOnDate/bank.remainingNpaAsOnDate*100).toFixed(1)}%`,
  }));
  const circleDonutCard = `<div class="chart-card">
    <div class="section-label">NPA Share by Circle<span class="chart-sub">of the whole bank's ${fmtBankCr(bank.remainingNpaAsOnDate)} NPA book</span></div>
    <div class="donut-flex">
      ${donutCard(circleSeg, undefined, fmtBankCr(bank.remainingNpaAsOnDate), 'Total NPA')}
      <div class="donut-legend">${donutLegend(circleSeg)}</div>
    </div>
  </div>`;

  // Hathras's own asset-classification mix comes from the separate account-
  // level dataset (the Hathras-only Dashboard's own data), not the bank-wide
  // PDF -- that level of detail isn't available for other regions/circles.
  const hathrasStats = computeDashboardStats('');
  const assetSeg = ASSET_ORDER.filter(k=>hathrasStats.assetMix[k]).map(k=>({
    value: hathrasStats.assetMix[k].os,
    color: ASSET_SEV_COLOR[k],
    label: assetLabel(k)+' ('+k+')',
    valueLabel: `${hathrasStats.assetMix[k].count.toLocaleString('en-IN')} · ${fmtCr(hathrasStats.assetMix[k].os)}`,
  }));
  const assetDonutCard = `<div class="chart-card">
    <div class="section-label">Hathras — Asset Classification Mix<span class="chart-sub">by outstanding balance · RBI IRAC norms (only available at Hathras's own account-level detail)</span></div>
    <div class="donut-flex">
      ${donutCard(assetSeg, undefined, fmtCr(hathrasStats.totalOS), 'Total O/S')}
      <div class="donut-legend">${donutLegend(assetSeg)}</div>
    </div>
  </div>`;

  const top10Worst = [...d.regions].sort((a,b)=>b.pctRemainingNpaWithAdv-a.pctRemainingNpaWithAdv).slice(0,10);
  const worstBarItems = top10Worst.map(r => ({
    label: r.region + (r.region===d.ourRegion?' ★':''),
    value: r.pctRemainingNpaWithAdv,
    color: npaPctSeverity(r.pctRemainingNpaWithAdv).color,
    valueLabel: fmtBankPct(r.pctRemainingNpaWithAdv),
  }));
  const worstBarCard = `<div class="chart-card chart-card-wide">
    <div class="section-label">Top 10 Worst NPA % Regions<span class="chart-sub">out of all 65 · ★ marks Hathras if it appears here</span></div>
    <div class="bar-list">${barRows(worstBarItems)}</div>
  </div>`;

  const filterOptions = ['<option value="">All circles (65 regions)</option>']
    .concat(d.circles.map(c=>`<option value="${esc(c.name)}"${bankRegionFilter===c.name?' selected':''}>${esc(c.name)} only</option>`)).join('');
  const marchFilterOptions = `
    <option value="">Since March: All</option>
    <option value="above"${bankMarchFilter==='above'?' selected':''}>Increased since March</option>
    <option value="below"${bankMarchFilter==='below'?' selected':''}>Reduced since March</option>`;
  const targetFilterOptions = `
    <option value="">vs Target: All</option>
    <option value="above"${bankTargetFilter==='above'?' selected':''}>Behind Target</option>
    <option value="below"${bankTargetFilter==='below'?' selected':''}>Ahead of Target</option>`;

  let filteredRegions = bankRegionFilter ? d.regions.filter(r=>r.co===bankRegionFilter) : d.regions.slice();
  if(bankMarchFilter==='above') filteredRegions = filteredRegions.filter(r=>r.netReductionOverMar26>0);
  else if(bankMarchFilter==='below') filteredRegions = filteredRegions.filter(r=>r.netReductionOverMar26<=0);
  if(bankTargetFilter==='above') filteredRegions = filteredRegions.filter(r=>r.gapFromTarget>0);
  else if(bankTargetFilter==='below') filteredRegions = filteredRegions.filter(r=>r.gapFromTarget<=0);
  filteredRegions = filteredRegions.sort((a,b)=>b.pctRemainingNpaWithAdv-a.pctRemainingNpaWithAdv);

  const regionTableRows = filteredRegions.map(r => {
    const sev = npaPctSeverity(r.pctRemainingNpaWithAdv);
    const isOurs = r.region === d.ourRegion;
    const isOurCircle = r.co === d.ourCircle;
    return `<tr class="${isOurs?'is-ours':(isOurCircle?'is-our-circle':'')}">
      <td>${bankRegionRank(d.regions, r)}</td>
      <td class="tal">${esc(r.region)}${isOurs?' <span class="badge-pill locked" style="margin-left:6px">★ Ours</span>':''}</td>
      <td class="tal">${esc(r.co.replace('CO ',''))}</td>
      <td>${r.branches}</td>
      <td>${fmtBankCr(r.totalAdv)}</td>
      <td>${fmtBankCr(r.remainingNpaAsOnDate)}</td>
      <td><span class="bank-npa-pill" style="background:${sev.soft};color:${sev.color}">${fmtBankPct(r.pctRemainingNpaWithAdv)}</span></td>
      <td>${fmtBankCr(r.npaMar26)}</td>
      <td style="color:${r.netReductionOverMar26<=0?'var(--green)':'var(--red)'}">${fmtBankCr(r.netReductionOverMar26)}</td>
      <td style="color:${r.netReductionDuringMonth<=0?'var(--green)':'var(--red)'}">${fmtBankCr(r.netReductionDuringMonth)}</td>
      <td style="color:${r.gapFromTarget<=0?'var(--green)':'var(--red)'}">${fmtBankCr(r.gapFromTarget)}</td>
    </tr>`;
  }).join('');

  const regionTable = `<div class="chart-card">
    <div class="list-modal-head">
      <div>
        <div class="section-label">All Regions — Ranked by NPA %<span class="chart-sub">worst first · Hathras highlighted · ${filteredRegions.length} of ${d.regions.length} regions shown</span></div>
      </div>
    </div>
    <div class="bank-filter-row">
      <select id="bankRegionFilterSelect" class="dash-select">${filterOptions}</select>
      <select id="bankMarchFilterSelect" class="dash-select">${marchFilterOptions}</select>
      <select id="bankTargetFilterSelect" class="dash-select">${targetFilterOptions}</select>
    </div>
    <div class="dash-table-wrap acct-list-scroll">
      <table class="dash-table">
        <thead><tr>
          <th class="tal">Rank</th><th class="tal">Region</th><th class="tal">Circle</th>
          <th>Br.</th><th>Total Adv.</th><th>NPA (now)</th><th>NPA %</th><th>NPA Mar-26</th><th>Since Mar-26</th><th>Net Reduction</th><th>Gap from Target</th>
        </tr></thead>
        <tbody>${regionTableRows}</tbody>
      </table>
    </div>
  </div>`;

  el.innerHTML = heroRow + insight +
    `<div class="section-label" style="margin-top:26px">Circles<span class="chart-sub">CO Moradabad is our circle</span></div>
     <div class="circle-card-row">${circleCards}</div>` +
    `<div class="chart-grid" style="margin-top:6px">${circleDonutCard}${assetDonutCard}${worstBarCard}</div>` +
    regionTable;

  const filterSel = document.getElementById('bankRegionFilterSelect');
  if(filterSel) filterSel.onchange = () => { bankRegionFilter = filterSel.value; renderBankDashboardBody(); };
  const marchFilterSel = document.getElementById('bankMarchFilterSelect');
  if(marchFilterSel) marchFilterSel.onchange = () => { bankMarchFilter = marchFilterSel.value; renderBankDashboardBody(); };
  const targetFilterSel = document.getElementById('bankTargetFilterSelect');
  if(targetFilterSel) targetFilterSel.onchange = () => { bankTargetFilter = targetFilterSel.value; renderBankDashboardBody(); };
}

/* ---------- Daily PNPA (Potential NPA) -- whole-bank, branch-wise, bucketed by scheme ----------
   A separate dataset from DATA.npa: the source file is the whole-bank HO
   "Daily PNPA" export (all 65 regions), but this tab only ever keeps
   Hathras's own rows (Alok's ask -- this is a Hathras-scoped app, the
   other 64 regions' potential-NPA accounts aren't his to work), and drops
   zero-balance accounts (an SMA flag with a ₹0 outstanding isn't
   actionable). Rows are stored as compact arrays (see PC below) instead
   of the full 35-column HO layout -- only the fields this tab actually
   uses are kept. */
const PC = {REGION:0, BRANCH:1, SCHEME:2, ACCT:3, NAME:4, OS:5, CADU:6, LIMIT:7, REVIEW:8, REASON:9};
/* "Limit Review" is its own bucket, pulled out ahead of the scheme-based
   split -- an account flagged Limit Review is routed there regardless of
   scheme code, so KCC/KCC-AH/Other only ever show accounts NOT already
   called out for a limit review (no double-counting across buckets). */
const PNPA_BUCKETS = [
  {key:'kcc', label:'KCC', sub:'Scheme code CC004 · reason "KCC-Disbrsmnt-36" only'},
  {key:'kccah', label:'KCC — Animal Husbandry', sub:'Scheme code CC043, excluding Limit Review'},
  {key:'limitreview', label:'Limit Review', sub:'Flagged "Limit Review", any scheme'},
  {key:'other', label:'Other Schemes', sub:'All remaining scheme codes, excluding Limit Review'},
];
function pnpaBucketOfRow(row){
  if(String(row[PC.REASON]||'').includes('Limit Review')) return 'limitreview';
  const scheme = row[PC.SCHEME], reason = String(row[PC.REASON]||'');
  if(scheme==='CC004') return reason.includes('KCC-Disbrsmnt-36') ? 'kcc' : 'other';
  return scheme==='CC043' ? 'kccah' : 'other';
}
/* The source file's own "Remarks" column is almost always just "-" (no real
   content) -- the actual why-is-this-flagged info lives in "Reasons"
   instead (e.g. "LAANPA,LimReview"), so that's what gets shown and searched
   as this tab's reason/remark field. "LimReview" is spelled out as "Limit
   Review" since Alok specifically calls that one out; the other codes are
   shown as-is rather than guessed-translated. */
function formatPnpaReasons(raw){
  return String(raw||'').split(',').map(s=>s.trim()).filter(Boolean)
    .map(s=>s==='LimReview'?'Limit Review':s).join(', ');
}
function parsePnpaRows(headerCells, dataRows){
  const header = headerCells.map(normHeader);
  const idx = (name) => header.indexOf(normHeader(name));
  const iRegion=idx('region'), iBranch=idx('branch'), iAcct=idx('accountno'), iScheme=idx('schemecode'),
    iName=idx('accountname'), iBal=idx('balanceamount'), iCadu=idx('cadu'), iLimit=idx('limit'),
    iReview=idx('reviewdate'), iReasons=idx('reasons');
  const missing = [];
  if(iAcct<0) missing.push('Account No');
  if(iBranch<0) missing.push('Branch');
  if(iScheme<0) missing.push('Scheme Code');
  if(iBal<0) missing.push('Balance Amount');
  if(iCadu<0) missing.push('CADU');
  if(iRegion<0) missing.push('Region');
  if(missing.length) throw new Error('Missing required column(s): '+missing.join(', ')+'. Check this file matches the "Daily PNPA" export layout.');
  const rows = [];
  for(const row of dataRows){
    if(!row || row.length<3) continue;
    const region = cellStr(row, iRegion);
    if(region.toUpperCase()!=='HATHRAS') continue;
    const acctRaw = cellStr(row, iAcct);
    if(!acctRaw) continue;
    const bal = parseFloat(row[iBal])||0;
    if(bal===0) continue;
    let acctNo = acctRaw;
    if(looksScientific(acctRaw)) acctNo = expandSci(acctRaw);
    const reviewDt = toDate(iReview>=0?row[iReview]:'');
    rows.push([
      region, cellStr(row, iBranch), cellStr(row, iScheme), acctNo, cellStr(row, iName),
      bal, parseFloat(row[iCadu])||0,
      iLimit>=0 ? (parseFloat(row[iLimit])||0) : 0,
      reviewDt ? fmtDate(reviewDt) : '',
      iReasons>=0 ? formatPnpaReasons(cellStr(row, iReasons)) : '',
    ]);
  }
  return rows;
}
let PNPA_DATA = null;
let __pendingPnpaData = null;
let pnpaBucketTab = 'kcc';
let pnpaBranchFilter = '';
function setPnpaBucketTab(tab){ pnpaBucketTab = tab; renderPnpaDashboardBody(); }
window.setPnpaBucketTab = setPnpaBucketTab;

function handlePnpaUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const labelEl = document.getElementById('pnpaUploadDropLabel');
  if(labelEl) labelEl.textContent = file.name;
  const statusEl = document.getElementById('pnpaUploadStatus');
  statusEl.innerHTML = `<div class="upload-status info">Reading Daily PNPA file…</div>`;
  const isCsv = /\.csv$/i.test(file.name);
  const reader = new FileReader();
  reader.onerror = function(){ statusEl.innerHTML = `<div class="upload-status err">⚠ Failed to read the file from disk.</div>`; };
  reader.onload = function(e){
    try{
      let header, dataRows;
      if(isCsv){
        const allRows = parseCSV(String(e.target.result));
        header = allRows[0]||[]; dataRows = allRows.slice(1);
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array', cellDates:true});
        const sheetName = wb.SheetNames.find(n=>/pnpa/i.test(n)) || wb.SheetNames[0];
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, raw:true, defval:''});
        header = raw[0]||[]; dataRows = raw.slice(1);
      }
      const rows = parsePnpaRows(header, dataRows);
      if(!rows.length) throw new Error('No account rows found in this file.');
      const guessed = parseAsOnDateFromFilename(file.name);
      const asOnDate = guessed ? dateToInputValue(guessed) : dateToInputValue(new Date());
      __pendingPnpaData = { asOnDate, rows };
      PNPA_DATA = __pendingPnpaData;
      const label = document.getElementById('pnpaStatusLabel');
      if(label) label.textContent = `${rows.length.toLocaleString('en-IN')} accounts loaded (${file.name})`;
      statusEl.innerHTML = `<div class="upload-status ok">✔ Parsed ${rows.length.toLocaleString('en-IN')} accounts, as on ${esc(asOnDate)}. Goes live the next time you hit Publish.</div>`;
      const publishBtn = document.getElementById('publishBtn');
      if(publishBtn) publishBtn.disabled = false;
      if(document.querySelector('.view.active')?.dataset.view==='pnpa') renderPnpaDashboardBody();
    } catch(err){
      statusEl.innerHTML = `<div class="upload-status err">⚠ Could not read this file: ${esc(err.message||err)}</div>`;
    }
  };
  if(isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

function renderPnpaDashboard(){
  const el = document.getElementById('pnpaDashboardArea');
  if(!el) return;
  if(PNPA_DATA){ renderPnpaDashboardBody(); return; }
  el.innerHTML = `<div class="empty-state"><div class="data-loading-spinner" aria-hidden="true" style="position:static;border-color:rgba(58,123,255,.25);border-top-color:var(--accent)"></div><p style="margin-top:14px">Loading Daily PNPA data…</p></div>`;
  fetchJson('data/pnpa.json?t=' + Date.now())
    .then(d => { PNPA_DATA = d; renderPnpaDashboardBody(); })
    .catch(() => {
      el.innerHTML = `<div class="empty-state"><h2>Could not load Daily PNPA data</h2><p>Check your internet connection, then tap Refresh.</p></div>`;
    });
}
function refreshPnpaDashboard(){ PNPA_DATA = null; renderPnpaDashboard(); }

function pnpaBranchAgg(rows, bucket){
  const map = new Map();
  for(const r of rows){
    if(pnpaBucketOfRow(r)!==bucket) continue;
    const key = r[PC.BRANCH];
    let e = map.get(key);
    if(!e){ e = {branch:r[PC.BRANCH], count:0, os:0}; map.set(key,e); }
    e.count++; e.os += r[PC.OS];
  }
  return [...map.values()].sort((a,b)=>b.os-a.os);
}

function renderPnpaDashboardBody(){
  const el = document.getElementById('pnpaDashboardArea');
  const d = PNPA_DATA;
  if(!el) return;
  if(!d || !d.rows){ el.innerHTML = `<div class="empty-state"><h2>No Daily PNPA data yet</h2><p>Upload the Daily PNPA file from Update Data to populate this tab.</p></div>`; return; }

  document.querySelectorAll('.pnpa-report-date-val').forEach(e=>{
    const parts = (d.asOnDate||'').split('-');
    e.textContent = parts.length===3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : (d.asOnDate||'—');
  });

  const allBranches = [...new Set(d.rows.map(r=>r[PC.BRANCH]))].sort((a,b)=>a.localeCompare(b));
  const branchFilterOptions = `<option value="">Regional Office</option>` +
    allBranches.map(b=>`<option value="${esc(b)}"${pnpaBranchFilter===b?' selected':''}>${esc(b)}</option>`).join('');
  const toolbar = `<div class="dash-toolbar">
    <span class="dash-toolbar-label">Branch</span>
    <select id="pnpaBranchFilterSelect" class="dash-select">${branchFilterOptions}</select>
  </div>`;

  // Hero blocks total whichever rows are currently in scope -- Regional
  // Office (all Hathras) by default, or just the selected branch's own
  // rows once one is picked, so the KCC/KCC-AH/Limit Review/Other numbers
  // always match what the Branch filter above them is set to.
  const scopedRows = pnpaBranchFilter ? d.rows.filter(r=>r[PC.BRANCH]===pnpaBranchFilter) : d.rows;
  const bucketTotals = {};
  PNPA_BUCKETS.forEach(b=>{ bucketTotals[b.key]={count:0,os:0,branches:new Set()}; });
  for(const r of scopedRows){
    const bk = pnpaBucketOfRow(r);
    bucketTotals[bk].count++; bucketTotals[bk].os += r[PC.OS]; bucketTotals[bk].branches.add(r[PC.BRANCH]);
  }
  const bucketIcon = {kcc:ICON_TARGET, kccah:ICON_STAR, limitreview:ICON_ALERT_CIRCLE, other:ICON_LANDMARK};

  const heroRow = `<div class="hero-kpi-row bank-hero-row">${PNPA_BUCKETS.map(b=>{
    const t = bucketTotals[b.key], isActive = pnpaBucketTab===b.key;
    return heroKpiCard({
      id:'pnpaHero_'+b.key, icon: bucketIcon[b.key],
      tint: isActive?'var(--accent-soft)':'rgba(120,120,140,.12)', color: isActive?'var(--accent)':'var(--ink-mute)',
      onclick:`setPnpaBucketTab('${b.key}')`,
      label: b.label,
      fallback: fmtCr(t.os),
      sub: pnpaBranchFilter
        ? `${t.count.toLocaleString('en-IN')} accounts in ${esc(pnpaBranchFilter)}`
        : `${t.count.toLocaleString('en-IN')} accounts · ${t.branches.size.toLocaleString('en-IN')} branches`,
      badge: isActive ? `<div class="hero-kpi-badge" style="background:var(--accent-soft);color:var(--accent)">Viewing</div>` : '',
    });
  }).join('')}</div>`;

  el.innerHTML = toolbar + heroRow +
    `<div class="chart-card" style="margin-top:20px">
      <div class="section-label" id="pnpaTableLabel"></div>
      <div id="pnpaBranchTableCard"></div>
    </div>`;

  const filterSel = document.getElementById('pnpaBranchFilterSelect');
  if(filterSel) filterSel.onchange = () => { pnpaBranchFilter = filterSel.value; renderPnpaDashboardBody(); };
  renderPnpaBranchTable();
}

function renderPnpaBranchTable(){
  const d = PNPA_DATA;
  const wrap = document.getElementById('pnpaBranchTableCard');
  const labelEl = document.getElementById('pnpaTableLabel');
  if(!wrap || !d) return;
  const activeBucket = PNPA_BUCKETS.find(b=>b.key===pnpaBucketTab);
  let branchAgg = pnpaBranchAgg(d.rows, pnpaBucketTab);
  if(pnpaBranchFilter) branchAgg = branchAgg.filter(r=>r.branch===pnpaBranchFilter);
  const scopeLabel = pnpaBranchFilter ? esc(pnpaBranchFilter) : 'Regional Office (all branches)';
  if(labelEl) labelEl.innerHTML = `${esc(activeBucket.label)} — Branch-wise Summary, highest O/S first<span class="chart-sub">${esc(activeBucket.sub)} · ${scopeLabel} · ${branchAgg.length.toLocaleString('en-IN')} branch(es) shown · tap a branch to see the account list</span>`;
  const rowsHtml = branchAgg.map((r,i)=>{
    return `<tr class="clickable" onclick="pnpaShowBranchAccounts('${pnpaBucketTab}','${esc(r.branch)}')">
      <td><span class="dash-rank">${i+1}</span></td>
      <td class="tal">${esc(r.branch)}</td>
      <td>${r.count.toLocaleString('en-IN')}</td>
      <td>${fmtCr(r.os)}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div class="dash-table-wrap acct-list-scroll">
    <table class="dash-table">
      <thead><tr><th class="tal">Rank</th><th class="tal">Branch</th><th>Accounts</th><th>Total O/S</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="4" style="text-align:center;color:var(--ink-mute)">No branches match</td></tr>`}</tbody>
    </table>
  </div>`;
}

const PNPA_ACCT_LIST_HEAD = '<tr>'
  +'<th class="sortable" data-key="acctNo" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'acctNo\')">Account<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="name" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'name\')">Customer<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="os" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'os\')">O/S<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="cadu" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'cadu\')">CADU<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="limit" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'limit\')">Limit<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="reviewDate" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'reviewDate\')">Review Date<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="reason" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'reason\')">Reason<span class="sort-ic">▾</span></th>'
  +'</tr>';
function pnpaAcctRows(list){
  if(!list.length) return `<tr><td colspan="7" style="text-align:center;color:var(--ink-mute)">No accounts</td></tr>`;
  return list.map(a=>`<tr>
    <td>${esc(a.acctNo)}</td>
    <td class="tal">${esc(a.name)||'—'}</td>
    <td>${fmtINR2(a.os)}</td>
    <td>${fmtINR2(a.cadu)}</td>
    <td>${fmtINR2(a.limit)}</td>
    <td class="tal">${esc(a.reviewDate)||'—'}</td>
    <td class="tal">${esc(a.reason)||'—'}</td>
  </tr>`).join('');
}
function showPnpaListModal(title, sub, list){ showListModal(title, sub, PNPA_ACCT_LIST_HEAD, 'pnpa', list, {key:'os',dir:'desc'}); }
window.showPnpaListModal = showPnpaListModal;
function pnpaShowBranchAccounts(bucket, branch){
  const rows = PNPA_DATA.rows.filter(r=>pnpaBucketOfRow(r)===bucket && r[PC.BRANCH]===branch);
  const list = rows.map(r=>({ acctNo:r[PC.ACCT], name:r[PC.NAME], os:r[PC.OS], cadu:r[PC.CADU], limit:r[PC.LIMIT], reviewDate:r[PC.REVIEW], reason:r[PC.REASON] }));
  const bLabel = (PNPA_BUCKETS.find(b=>b.key===bucket)||{}).label || bucket;
  showPnpaListModal(`${branch} — ${bLabel}`, `Hathras · ${list.length.toLocaleString('en-IN')} account(s)`, list);
}
window.pnpaShowBranchAccounts = pnpaShowBranchAccounts;

/* ---------- KCC Overdue -- Hathras-only, restricted to 3 schemes, rich filters ----------
   Unlike PNPA, the source "KCC Overdue" file is already Hathras-scoped (confirmed
   against a real file: all rows were Region=HATHRAS), so no whole-bank filtering is
   needed -- but the parser still defensively drops any stray non-Hathras row in
   case a future export widens scope. Only rows matching one of the 3 known scheme
   codes are kept; there is no "Other" catch-all bucket here (unlike PNPA). */
const KC = {BRANCH:0, SCHEME:1, ACCT:2, NAME:3, OS:4, CADU:5, LIMIT:6, REVIEW:7, CUSTNPADATE:8, FY:9, CATEGORY:10, SMA:11, REASON:12};
const KCC_OVERDUE_SCHEMES = [
  {key:'kcc', code:'CC004', label:'KCC'},
  {key:'kccah', code:'CC043', label:'KCC — Animal Husbandry'},
  {key:'od023', code:'OD023', label:'OD-023 (Tatkal)'},
];
function kccOverdueBucketOf(scheme){
  const m = KCC_OVERDUE_SCHEMES.find(s=>s.code===scheme);
  return m ? m.key : null;
}
/* The source file's F.Y. column stores its value with literal double-quote
   characters around it (e.g. the cell's actual text is ["MAR-27"], not just
   MAR-27) -- almost certainly the HO export's own guard against Excel trying
   to auto-parse "MAR-27" as a date. Stripped for display/filtering. */
function stripQuoteChars(s){ return String(s||'').replace(/^"+|"+$/g,'').trim(); }
function parseKccOverdueRows(headerCells, dataRows){
  const header = headerCells.map(normHeader);
  const idx = (name) => header.indexOf(normHeader(name));
  const idxPrefix = (name) => header.findIndex(h=>h.startsWith(normHeader(name)));
  const iRegion=idx('region'), iBranch=idx('branch'), iAcct=idx('accountno'), iScheme=idx('schemecode'),
    iName=idx('accountname'), iBal=idxPrefix('balanceamount'), iCadu=idx('cadu'), iLimit=idx('limit'),
    iReview=idx('reviewdate'), iCustNpa=idx('custnpadate'), iFy=idx('fy'), iCategory=idx('category'),
    iSma=idx('smastatus'), iReason=idx('reasons');
  const missing = [];
  if(iAcct<0) missing.push('Account No');
  if(iBranch<0) missing.push('Branch');
  if(iScheme<0) missing.push('Scheme Code');
  if(iBal<0) missing.push('Balance Amount');
  if(iCustNpa<0) missing.push('Cust NPA Date');
  if(missing.length) throw new Error('Missing required column(s): '+missing.join(', ')+'. Check this file matches the "KCC Overdue" export layout.');
  const rows = [];
  for(const row of dataRows){
    if(!row || row.length<3) continue;
    if(iRegion>=0){ const region = cellStr(row, iRegion); if(region && region.toUpperCase()!=='HATHRAS') continue; }
    const scheme = cellStr(row, iScheme);
    if(!kccOverdueBucketOf(scheme)) continue;
    const acctRaw = cellStr(row, iAcct);
    if(!acctRaw) continue;
    let acctNo = acctRaw;
    if(looksScientific(acctRaw)) acctNo = expandSci(acctRaw);
    const reviewDt = toDate(iReview>=0?row[iReview]:'');
    const custNpaDt = toDate(row[iCustNpa]);
    rows.push([
      cellStr(row, iBranch), scheme, acctNo, cellStr(row, iName),
      parseFloat(row[iBal])||0, iCadu>=0?(parseFloat(row[iCadu])||0):0,
      iLimit>=0?(parseFloat(row[iLimit])||0):0,
      reviewDt ? fmtDate(reviewDt) : '',
      custNpaDt ? fmtDate(custNpaDt) : '',
      iFy>=0 ? stripQuoteChars(cellStr(row, iFy)) : '',
      iCategory>=0 ? cellStr(row, iCategory) : '',
      iSma>=0 ? cellStr(row, iSma) : '',
      iReason>=0 ? cellStr(row, iReason) : '',
    ]);
  }
  return rows;
}
let KCC_OVERDUE_DATA = null;
let __pendingKccOverdueData = null;
let kccovSchemeTab = 'kcc';
let kccovBranchFilter = '';
let kccovFyFilter = '';
let kccovDateMode = 'month';
let kccovMonthFilter = '';
let kccovDateFrom = '';
let kccovDateTo = '';
function setKccovSchemeTab(tab){ kccovSchemeTab = tab; renderKccOverdueBody(); }
window.setKccovSchemeTab = setKccovSchemeTab;
function setKccovDateMode(mode){ kccovDateMode = mode; renderKccOverdueBody(); }
window.setKccovDateMode = setKccovDateMode;

function handleKccOverdueUpload(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const labelEl = document.getElementById('kccOverdueUploadDropLabel');
  if(labelEl) labelEl.textContent = file.name;
  const statusEl = document.getElementById('kccOverdueUploadStatus');
  statusEl.innerHTML = `<div class="upload-status info">Reading KCC Overdue file…</div>`;
  const isCsv = /\.csv$/i.test(file.name);
  const reader = new FileReader();
  reader.onerror = function(){ statusEl.innerHTML = `<div class="upload-status err">⚠ Failed to read the file from disk.</div>`; };
  reader.onload = function(e){
    try{
      let header, dataRows;
      if(isCsv){
        const allRows = parseCSV(String(e.target.result));
        header = allRows[0]||[]; dataRows = allRows.slice(1);
      } else {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array', cellDates:true});
        const sheetName = wb.SheetNames.find(n=>/kcc|overdue/i.test(n)) || wb.SheetNames[0];
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, raw:true, defval:''});
        header = raw[0]||[]; dataRows = raw.slice(1);
      }
      const rows = parseKccOverdueRows(header, dataRows);
      if(!rows.length) throw new Error('No account rows found in this file.');
      const guessed = parseAsOnDateFromFilename(file.name);
      const asOnDate = guessed ? dateToInputValue(guessed) : dateToInputValue(new Date());
      __pendingKccOverdueData = { asOnDate, rows };
      KCC_OVERDUE_DATA = __pendingKccOverdueData;
      const label = document.getElementById('kccovStatusLabel');
      if(label) label.textContent = `${rows.length.toLocaleString('en-IN')} accounts loaded (${file.name})`;
      statusEl.innerHTML = `<div class="upload-status ok">✔ Parsed ${rows.length.toLocaleString('en-IN')} accounts, as on ${esc(asOnDate)}. Goes live the next time you hit Publish.</div>`;
      const publishBtn = document.getElementById('publishBtn');
      if(publishBtn) publishBtn.disabled = false;
      if(document.querySelector('.view.active')?.dataset.view==='kccov') renderKccOverdueBody();
    } catch(err){
      statusEl.innerHTML = `<div class="upload-status err">⚠ Could not read this file: ${esc(err.message||err)}</div>`;
    }
  };
  if(isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}

function renderKccOverdue(){
  const el = document.getElementById('kccOverdueArea');
  if(!el) return;
  if(KCC_OVERDUE_DATA){ renderKccOverdueBody(); return; }
  el.innerHTML = `<div class="empty-state"><div class="data-loading-spinner" aria-hidden="true" style="position:static;border-color:rgba(58,123,255,.25);border-top-color:var(--accent)"></div><p style="margin-top:14px">Loading KCC Overdue data…</p></div>`;
  fetchJson('data/kcc-overdue.json?t=' + Date.now())
    .then(d => { KCC_OVERDUE_DATA = d; renderKccOverdueBody(); })
    .catch(() => {
      el.innerHTML = `<div class="empty-state"><h2>Could not load KCC Overdue data</h2><p>Check your internet connection, then tap Refresh.</p></div>`;
    });
}
function refreshKccOverdue(){ KCC_OVERDUE_DATA = null; renderKccOverdue(); }

function kccovFilteredRows(d){
  let rows = d.rows;
  if(kccovBranchFilter) rows = rows.filter(r=>r[KC.BRANCH]===kccovBranchFilter);
  if(kccovFyFilter) rows = rows.filter(r=>r[KC.FY]===kccovFyFilter);
  if(kccovDateMode==='month' && kccovMonthFilter){
    const [y,m] = kccovMonthFilter.split('-').map(Number);
    rows = rows.filter(r=>{ const dt = toDate(r[KC.CUSTNPADATE]); return dt && dt.getFullYear()===y && (dt.getMonth()+1)===m; });
  } else if(kccovDateMode==='range' && (kccovDateFrom || kccovDateTo)){
    const from = kccovDateFrom ? new Date(kccovDateFrom+'T00:00:00') : null;
    const to = kccovDateTo ? new Date(kccovDateTo+'T23:59:59') : null;
    rows = rows.filter(r=>{
      const dt = toDate(r[KC.CUSTNPADATE]);
      if(!dt) return false;
      if(from && dt < from) return false;
      if(to && dt > to) return false;
      return true;
    });
  }
  return rows;
}
function kccovBranchAgg(rows, bucket){
  const map = new Map();
  for(const r of rows){
    if(kccOverdueBucketOf(r[KC.SCHEME])!==bucket) continue;
    const key = r[KC.BRANCH];
    let e = map.get(key);
    if(!e){ e = {branch:r[KC.BRANCH], count:0, os:0}; map.set(key,e); }
    e.count++; e.os += r[KC.OS];
  }
  return [...map.values()].sort((a,b)=>b.os-a.os);
}

function renderKccOverdueBody(){
  const el = document.getElementById('kccOverdueArea');
  const d = KCC_OVERDUE_DATA;
  if(!el) return;
  if(!d || !d.rows){ el.innerHTML = `<div class="empty-state"><h2>No KCC Overdue data yet</h2><p>Upload the KCC Overdue file from Update Data to populate this tab.</p></div>`; return; }

  document.querySelectorAll('.kccov-report-date-val').forEach(e=>{
    const parts = (d.asOnDate||'').split('-');
    e.textContent = parts.length===3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : (d.asOnDate||'—');
  });

  const allBranches = [...new Set(d.rows.map(r=>r[KC.BRANCH]))].sort((a,b)=>a.localeCompare(b));
  const allFy = [...new Set(d.rows.map(r=>r[KC.FY]).filter(Boolean))].sort();
  const branchFilterOptions = `<option value="">Regional Office</option>` +
    allBranches.map(b=>`<option value="${esc(b)}"${kccovBranchFilter===b?' selected':''}>${esc(b)}</option>`).join('');
  const fyFilterOptions = `<option value="">All F.Y.</option>` +
    allFy.map(f=>`<option value="${esc(f)}"${kccovFyFilter===f?' selected':''}>${esc(f)}</option>`).join('');

  const dateModeRow = `<div class="bank-tab-row" style="margin-bottom:10px">
    <button type="button" class="bank-tab-btn${kccovDateMode==='month'?' active':''}" onclick="setKccovDateMode('month')">Cust NPA Date — By Month</button>
    <button type="button" class="bank-tab-btn${kccovDateMode==='range'?' active':''}" onclick="setKccovDateMode('range')">By Date Range</button>
  </div>`;
  const dateInputsRow = kccovDateMode==='month'
    ? `<input type="month" id="kccovMonthInput" class="dash-select" value="${esc(kccovMonthFilter)}" style="max-width:200px">`
    : `<input type="date" id="kccovDateFromInput" class="dash-select" value="${esc(kccovDateFrom)}" style="max-width:170px">
       <span style="color:var(--ink-mute);font-size:12px;align-self:center">to</span>
       <input type="date" id="kccovDateToInput" class="dash-select" value="${esc(kccovDateTo)}" style="max-width:170px">`;

  const toolbar = `<div class="dash-toolbar">
      <span class="dash-toolbar-label">Branch</span>
      <select id="kccovBranchFilterSelect" class="dash-select">${branchFilterOptions}</select>
    </div>
    <div class="bank-filter-row">
      <select id="kccovFyFilterSelect" class="dash-select">${fyFilterOptions}</select>
    </div>
    ${dateModeRow}
    <div class="bank-filter-row">${dateInputsRow}</div>`;

  const filteredRows = kccovFilteredRows(d);
  const bucketTotals = {};
  KCC_OVERDUE_SCHEMES.forEach(s=>{ bucketTotals[s.key]={count:0,os:0,branches:new Set()}; });
  for(const r of filteredRows){
    const bk = kccOverdueBucketOf(r[KC.SCHEME]);
    bucketTotals[bk].count++; bucketTotals[bk].os += r[KC.OS]; bucketTotals[bk].branches.add(r[KC.BRANCH]);
  }
  const bucketIcon = {kcc:ICON_TARGET, kccah:ICON_STAR, od023:ICON_ALERT_TRIANGLE};
  const heroRow = `<div class="hero-kpi-row bank-hero-row">${KCC_OVERDUE_SCHEMES.map(s=>{
    const t = bucketTotals[s.key], isActive = kccovSchemeTab===s.key;
    return heroKpiCard({
      id:'kccovHero_'+s.key, icon: bucketIcon[s.key],
      tint: isActive?'var(--accent-soft)':'rgba(120,120,140,.12)', color: isActive?'var(--accent)':'var(--ink-mute)',
      onclick:`setKccovSchemeTab('${s.key}')`,
      label: s.label,
      fallback: fmtCr(t.os),
      sub: `${t.count.toLocaleString('en-IN')} accounts · ${t.branches.size.toLocaleString('en-IN')} branches`,
      badge: isActive ? `<div class="hero-kpi-badge" style="background:var(--accent-soft);color:var(--accent)">Viewing</div>` : '',
    });
  }).join('')}</div>`;

  el.innerHTML = toolbar + heroRow +
    `<div class="chart-card" style="margin-top:20px">
      <div class="section-label" id="kccovTableLabel"></div>
      <div id="kccovBranchTableCard"></div>
    </div>`;

  const branchSel = document.getElementById('kccovBranchFilterSelect');
  if(branchSel) branchSel.onchange = () => { kccovBranchFilter = branchSel.value; renderKccOverdueBody(); };
  const fySel = document.getElementById('kccovFyFilterSelect');
  if(fySel) fySel.onchange = () => { kccovFyFilter = fySel.value; renderKccOverdueBody(); };
  const monthInput = document.getElementById('kccovMonthInput');
  if(monthInput) monthInput.onchange = () => { kccovMonthFilter = monthInput.value; renderKccOverdueBody(); };
  const fromInput = document.getElementById('kccovDateFromInput');
  if(fromInput) fromInput.onchange = () => { kccovDateFrom = fromInput.value; renderKccOverdueBody(); };
  const toInput = document.getElementById('kccovDateToInput');
  if(toInput) toInput.onchange = () => { kccovDateTo = toInput.value; renderKccOverdueBody(); };

  renderKccOverdueBranchTable(filteredRows);
}

function renderKccOverdueBranchTable(filteredRows){
  const wrap = document.getElementById('kccovBranchTableCard');
  const labelEl = document.getElementById('kccovTableLabel');
  if(!wrap) return;
  const activeScheme = KCC_OVERDUE_SCHEMES.find(s=>s.key===kccovSchemeTab);
  const branchAgg = kccovBranchAgg(filteredRows, kccovSchemeTab);
  const scopeLabel = kccovBranchFilter ? esc(kccovBranchFilter) : 'Regional Office (all branches)';
  if(labelEl) labelEl.innerHTML = `${esc(activeScheme.label)} — Branch-wise Summary, highest O/S first<span class="chart-sub">Scheme ${esc(activeScheme.code)} · ${scopeLabel} · ${branchAgg.length.toLocaleString('en-IN')} branch(es) shown · tap a branch to see the account list</span>`;
  const rowsHtml = branchAgg.map((r,i)=>`<tr class="clickable" onclick="kccovShowBranchAccounts('${kccovSchemeTab}','${esc(r.branch)}')">
    <td><span class="dash-rank">${i+1}</span></td>
    <td class="tal">${esc(r.branch)}</td>
    <td>${r.count.toLocaleString('en-IN')}</td>
    <td>${fmtCr(r.os)}</td>
  </tr>`).join('');
  wrap.innerHTML = `<div class="dash-table-wrap acct-list-scroll">
    <table class="dash-table">
      <thead><tr><th class="tal">Rank</th><th class="tal">Branch</th><th>Accounts</th><th>Total O/S</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="4" style="text-align:center;color:var(--ink-mute)">No branches match</td></tr>`}</tbody>
    </table>
  </div>`;
}

const KCCOV_ACCT_LIST_HEAD = '<tr>'
  +'<th class="sortable" data-key="acctNo" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'acctNo\')">Account<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="name" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'name\')">Customer<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="os" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'os\')">O/S<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="cadu" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'cadu\')">CADU<span class="sort-ic">▾</span></th>'
  +'<th class="sortable" data-key="limit" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'limit\')">Limit<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="custNpaDate" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'custNpaDate\')">Cust NPA Date<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="fy" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'fy\')">F.Y.<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="category" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'category\')">Category<span class="sort-ic">▾</span></th>'
  +'<th class="tal sortable" data-key="sma" tabindex="0" role="button" aria-sort="none" onclick="sortListModalBy(\'sma\')">SMA<span class="sort-ic">▾</span></th>'
  +'</tr>';
function kccovAcctRows(list){
  if(!list.length) return `<tr><td colspan="9" style="text-align:center;color:var(--ink-mute)">No accounts</td></tr>`;
  return list.map(a=>`<tr>
    <td>${esc(a.acctNo)}</td>
    <td class="tal">${esc(a.name)||'—'}</td>
    <td>${fmtINR2(a.os)}</td>
    <td>${fmtINR2(a.cadu)}</td>
    <td>${fmtINR2(a.limit)}</td>
    <td class="tal">${esc(a.custNpaDate)||'—'}</td>
    <td class="tal">${esc(a.fy)||'—'}</td>
    <td class="tal">${esc(a.category)||'—'}</td>
    <td class="tal">${esc(a.sma)||'—'}</td>
  </tr>`).join('');
}
function showKccovListModal(title, sub, list){ showListModal(title, sub, KCCOV_ACCT_LIST_HEAD, 'kccov', list, {key:'os',dir:'desc'}); }
window.showKccovListModal = showKccovListModal;
function kccovShowBranchAccounts(bucket, branch){
  const filteredRows = kccovFilteredRows(KCC_OVERDUE_DATA);
  const rows = filteredRows.filter(r=>kccOverdueBucketOf(r[KC.SCHEME])===bucket && r[KC.BRANCH]===branch);
  const list = rows.map(r=>({ acctNo:r[KC.ACCT], name:r[KC.NAME], os:r[KC.OS], cadu:r[KC.CADU], limit:r[KC.LIMIT], custNpaDate:r[KC.CUSTNPADATE], fy:r[KC.FY], category:r[KC.CATEGORY], sma:r[KC.SMA] }));
  const sLabel = (KCC_OVERDUE_SCHEMES.find(s=>s.key===bucket)||{}).label || bucket;
  showKccovListModal(`${branch} — ${sLabel}`, `Hathras · ${list.length.toLocaleString('en-IN')} account(s)`, list);
}
window.kccovShowBranchAccounts = kccovShowBranchAccounts;

/* ---------- Nav / view switching ---------- */
function switchView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  if(view==='dashboard') renderDashboard();
  if(view==='bank') renderBankDashboard();
  if(view==='pnpa') renderPnpaDashboard();
  if(view==='kccov') renderKccOverdue();
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
  on('branchAdvUploadDrop','click',()=>document.getElementById('branchAdvFileInput').click());
  on('branchAdvFileInput','change',(e)=>handleBranchAdvUpload(e));
  on('bankPdfUploadDrop','click',()=>document.getElementById('bankPdfFileInput').click());
  on('bankPdfFileInput','change',(e)=>handleBankPdfUpload(e));
  on('pnpaUploadDrop','click',()=>document.getElementById('pnpaFileInput').click());
  on('pnpaFileInput','change',(e)=>handlePnpaUpload(e));
  on('kccOverdueUploadDrop','click',()=>document.getElementById('kccOverdueFileInput').click());
  on('kccOverdueFileInput','change',(e)=>handleKccOverdueUpload(e));
  on('downloadDailyTemplateBtn','click',()=>downloadDailyTemplate());
  on('downloadMasterTemplateBtn','click',()=>downloadMasterTemplate());
  on('downloadBranchAdvTemplateBtn','click',()=>downloadBranchAdvTemplate());
  on('asOnDateInput','change',(e)=>{ __pendingAsOnDate = e.target.value; });
  on('updateCancelBtn','click',()=>toggleUpdateModal(false));
  on('applyDataBtn','click',()=>applyNewData());
  on('downloadAppBtn','click',()=>downloadUpdatedApp());
  on('publishBtn','click',()=>openPublishReview());
  on('publishCancelBtn','click',()=>closePublishReview());
  on('publishConfirmBtn','click',()=>confirmPublish());
  on('eligibleBanner','click',()=>document.getElementById('eligibleBanner').classList.remove('show'));
  on('dashBranchFilter','change',()=>renderDashboardSmooth());
  on('refreshDataBtn','click',(e)=>{
    // A full reload (not just re-fetching data/latest.json) also picks up
    // any newly published app-shell code, and the service worker's
    // network-first fetch (sw.js) means this always gets whatever is
    // actually live, never a stale cached copy, as long as there's a
    // connection.
    e.currentTarget.classList.add('is-spinning');
    location.reload();
  });
  on('bankRefreshBtn','click',(e)=>{
    e.currentTarget.classList.add('is-spinning');
    refreshBankDashboard();
    setTimeout(()=>e.currentTarget.classList.remove('is-spinning'), 700);
  });
  on('pnpaRefreshBtn','click',(e)=>{
    e.currentTarget.classList.add('is-spinning');
    refreshPnpaDashboard();
    setTimeout(()=>e.currentTarget.classList.remove('is-spinning'), 700);
  });
  on('kccovRefreshBtn','click',(e)=>{
    e.currentTarget.classList.add('is-spinning');
    refreshKccOverdue();
    setTimeout(()=>e.currentTarget.classList.remove('is-spinning'), 700);
  });
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>{
    b.addEventListener('click',()=>switchView(b.dataset.view));
  });
  document.querySelectorAll('[data-open-data]').forEach(b=>{
    b.addEventListener('click',openUpdateModalAsAdmin);
  });
})();

renderEmpty();
switchView('dashboard');

// Pick up OTS locks/unlocks made from other devices without needing a full
// page reload -- skips the check while the tab is backgrounded.
setInterval(() => { if(document.visibilityState==='visible') refreshLocksFromServer(); }, 45000);

window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.toggleFreeze = toggleFreeze;
window.onOtsInput = onOtsInput;
}

/* Data lives in data/latest.json, committed straight to this repo by
   js/publish.js -- no separate backend/database. The timestamp query param
   bypasses HTTP/CDN caching -- this is live banking data and must never be
   served stale while a real connection is available (same reasoning as the
   service worker's network-first fetch). */
function fetchJson(url){
  return fetch(url).then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
}
function loadNpaData(isRetry){
  fetchJson('data/latest.json?t=' + Date.now())
    .then(data => {
      // data/locked-ots.json is the live, always-current source for locked
      // OTS amounts (see syncLockToServer/refreshLocksFromServer) -- it can
      // be ahead of whatever was baked into data/latest.json at the last
      // Admin Publish, so it wins on merge. A failure here (e.g. the file
      // briefly missing) shouldn't block the whole app from loading --
      // fall back to data/latest.json's own lockedOts in that case.
      return fetchJson('data/locked-ots.json?t=' + Date.now())
        .catch(() => ({}))
        .then(liveLocks => {
          data.lockedOts = Object.assign({}, data.lockedOts||{}, liveLocks||{});
          const overlay = document.getElementById('dataLoadingOverlay');
          if(overlay) overlay.classList.add('hidden');
          initApp(data);
        });
    })
    .catch(err => {
      // A single blip (phone switching towers/wifi) shouldn't scare a non-technical
      // user with an error screen -- retry once automatically before giving up.
      if(!isRetry){ setTimeout(() => loadNpaData(true), 2000); return; }
      const overlay = document.getElementById('dataLoadingOverlay');
      if(overlay){
        overlay.classList.remove('hidden');
        overlay.innerHTML = '<div class="data-loading-text err">Could not load NPA data. Check your internet connection.</div>'
          + '<button type="button" class="data-loading-retry-btn" id="dataLoadingRetryBtn">Retry</button>';
        const btn = document.getElementById('dataLoadingRetryBtn');
        if(btn) btn.onclick = () => {
          overlay.innerHTML = '<div class="data-loading-spinner" aria-hidden="true"></div><div class="data-loading-text">Loading NPA data…</div>';
          loadNpaData(false);
        };
      }
      console.error('Failed to load NPA data', err);
    });
}
loadNpaData(false);
