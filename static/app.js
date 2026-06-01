/* ================================================================
   DataPrep AI — app.js
   Complete application logic.
   All original DOM IDs preserved exactly.
   New: panel routing, auth modal, sidebar navigation.
================================================================ */

/* ────────────────────────────────────────────────────────────
   SESSION
──────────────────────────────────────────────────────────── */
let authToken = null, authUsername = null;

function loadSession()   { authToken = sessionStorage.getItem('dp_token'); authUsername = sessionStorage.getItem('dp_username'); }
function saveSession(t,u){ authToken=t; authUsername=u; sessionStorage.setItem('dp_token',t); sessionStorage.setItem('dp_username',u); }
function clearSession()  { authToken=authUsername=null; sessionStorage.removeItem('dp_token'); sessionStorage.removeItem('dp_username'); }

loadSession();
if (authToken) showApp(); else { /* stay on landing */ }

function showApp() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('authModal').classList.remove('visible');
  document.getElementById('appScreen').classList.add('visible');
  const u = authUsername || '?';
  document.getElementById('userLabel').textContent  = u;
  document.getElementById('userAvatar').textContent = u.charAt(0).toUpperCase();
  if (document.getElementById('settingsAvatar'))    document.getElementById('settingsAvatar').textContent = u.charAt(0).toUpperCase();
  if (document.getElementById('settingsUsername'))  document.getElementById('settingsUsername').textContent = u;
  // Show chat FAB when app is visible
  showChatFab();
}

/* ────────────────────────────────────────────────────────────
   AUTH MODAL
──────────────────────────────────────────────────────────── */
function openAuthModal(tab) {
  document.getElementById('authModal').classList.add('visible');
  showAuthTab(tab || 'login');
}
function closeAuthModal() {
  document.getElementById('authModal').classList.remove('visible');
}

function showAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('loginForm').style.display    = tab === 'login'    ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
}

/* ────────────────────────────────────────────────────────────
   AUTH FORMS — original logic, unchanged
──────────────────────────────────────────────────────────── */
document.getElementById('loginPassword').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('regPassword').addEventListener('keydown',   e => { if(e.key==='Enter') doRegister(); });

function updateStrength(pw) {
  let s = 0;
  if(pw.length>=8)s++; if(pw.length>=12)s++;
  if(/[A-Z]/.test(pw))s++; if(/[0-9]/.test(pw))s++; if(/[^A-Za-z0-9]/.test(pw))s++;
  const f = document.getElementById('pwStrengthFill');
  if (!f) return;
  f.style.width  = Math.min(100, s * 20) + '%';
  f.style.background = s <= 1 ? 'var(--danger)' : s <= 3 ? 'var(--warn)' : 'var(--success)';
}

function showAuthError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  el.classList.add('visible');
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');
  errEl.style.display = 'none'; errEl.classList.remove('visible');
  if (!email || !pass) { showAuthError(errEl, 'Please fill in all fields.'); return; }
  btn.disabled = true; btn.textContent = 'Signing in…';
  const fd = new FormData(); fd.append('email', email); fd.append('password', pass);
  try {
    const res  = await fetch('/auth/login', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || 'Login failed.');
    saveSession(json.token, json.username);
    showApp();
  } catch(err) { showAuthError(errEl, err.message); }
  finally { btn.disabled = false; btn.textContent = 'Sign in'; }
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const pass     = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');
  const btn      = document.getElementById('registerBtn');
  errEl.style.display = 'none'; errEl.classList.remove('visible');
  if (!username || !email || !pass) { showAuthError(errEl, 'Please fill in all fields.'); return; }
  btn.disabled = true; btn.textContent = 'Creating account…';
  const fd = new FormData(); fd.append('username', username); fd.append('email', email); fd.append('password', pass);
  try {
    const res  = await fetch('/auth/register', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || 'Registration failed.');
    saveSession(json.token, json.username);
    showApp();
  } catch(err) { showAuthError(errEl, err.message); }
  finally { btn.disabled = false; btn.textContent = 'Create account'; }
}

function doLogout() {
  clearSession();
  resetUpload(); hideResults();
  const _dm = document.getElementById('qualityDashboard'); if(_dm) _dm.style.display='none';
  const rp = document.getElementById('reviewPanel');
  rp.classList.remove('visible'); rp.style.display = 'none';
  document.getElementById('appScreen').classList.remove('visible');
  document.getElementById('landingPage').classList.remove('hidden');
  // reset auth inputs
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').style.display = 'none';
}

/* ────────────────────────────────────────────────────────────
   PANEL ROUTING (NEW — sidebar navigation)
──────────────────────────────────────────────────────────── */
const PANEL_TITLES = {
  dashboard: 'Dashboard',
  clean:     'Data Cleaning',
  advisor:   'Feature Engineering',
  datasets:  'Datasets',
  history:   'History',
  settings:  'Settings',
};

function switchPanel(name) {
  // Hide all panels
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  // Show target panel
  const panelEl = document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1));
  if (panelEl) panelEl.classList.add('active');
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById('nav' + name.charAt(0).toUpperCase() + name.slice(1));
  if (navEl) navEl.classList.add('active');
  // Update topbar title
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = PANEL_TITLES[name] || name;
}

/* ────────────────────────────────────────────────────────────
   LANDING PAGE HELPERS
──────────────────────────────────────────────────────────── */
function toggleFaq(el) {
  el.closest('.faq-item').classList.toggle('open');
}

/* ────────────────────────────────────────────────────────────
   AUTHENTICATED FETCH
──────────────────────────────────────────────────────────── */
async function authFetch(url, options = {}) {
  if (!authToken) { doLogout(); throw new Error('Not authenticated.'); }
  options.headers = { ...(options.headers || {}), 'Authorization': `Bearer ${authToken}` };
  const res = await fetch(url, options);
  if (res.status === 401) { doLogout(); throw new Error('Session expired. Please log in again.'); }
  return res;
}

/* ────────────────────────────────────────────────────────────
   APP STATE
──────────────────────────────────────────────────────────── */
let currentMode = 'auto', selectedFile = null, reviewData = null;
let decisions = {}, activeFileForApply = null;
let lastAutoSummary = null, lastAutoFilename = null;
let lastReviewChanges = null, lastReviewFilename = null;
let currentAutoBlob = null,   currentAutoFilename   = 'cleaned_data.csv';
let currentReviewBlob = null, currentReviewFilename = 'cleaned.csv';

/* ────────────────────────────────────────────────────────────
   MODE SWITCHING
──────────────────────────────────────────────────────────── */
function switchMode(mode) {
  currentMode = mode;
  document.getElementById('modeAuto').classList.toggle('active', mode === 'auto');
  document.getElementById('modeReview').classList.toggle('active', mode === 'review');

  const descEl = document.getElementById('modeDesc');
  if (descEl) {
    descEl.textContent = mode === 'auto'
      ? 'Automatically clean and download your dataset without manual review.'
      : 'Inspect and approve each change individually before anything is applied.';
  }

  document.getElementById('uploadCardTitle').textContent =
    mode === 'review' ? 'Review Mode — Upload CSV or Excel' : 'Auto Clean — Upload CSV or Excel';
  document.getElementById('actionBtn').textContent =
    mode === 'review' ? '🔍 Analyze & Open in Reviewer' : '⚡ Clean My Data';

  resetUpload(); hideResults();
  const _dm = document.getElementById('qualityDashboard'); if(_dm) _dm.style.display='none';
  const rp = document.getElementById('reviewPanel');
  rp.classList.remove('visible'); rp.style.display = 'none';
}

/* ────────────────────────────────────────────────────────────
   FILE HANDLING
──────────────────────────────────────────────────────────── */
const dropzone  = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

document.getElementById('browseBtn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click',  () => fileInput.click());
dropzone.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') fileInput.click(); });
fileInput.addEventListener('change', () => { if(fileInput.files[0]) setFile(fileInput.files[0]); });
dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) setFile(f); else showError('No file detected.');
});
document.getElementById('removeFile').addEventListener('click', resetUpload);

function formatFileSize(bytes) {
  if (bytes < 1024)        return bytes + 'B';
  if (bytes < 1024*1024)   return (bytes/1024).toFixed(1) + 'KB';
  return (bytes/(1024*1024)).toFixed(1) + 'MB';
}

function setFile(f) {
  selectedFile = f;
  document.getElementById('fileName').textContent = f.name;
  const sizeEl = document.getElementById('fileSize');
  if (sizeEl) sizeEl.textContent = formatFileSize(f.size);
  document.getElementById('filePill').style.display = 'flex';
  document.getElementById('filePill').classList.add('show');
  document.getElementById('actionBtn').disabled = false;
  hideResults(); hideError();
  // Run quality dashboard
  const dash = document.getElementById('qualityDashboard');
  if (dash) { dash.style.display = 'none'; dash.style.opacity = '0'; }
  const analyzing = document.getElementById('dqAnalyzing');
  if (analyzing) analyzing.style.display = 'flex';
  runQualityDashboard(f);
}

function resetUpload() {
  selectedFile = null;
  document.getElementById('filePill').style.display  = 'none';
  document.getElementById('filePill').classList.remove('show');
  document.getElementById('fileName').textContent = '';
  fileInput.value = '';
  document.getElementById('actionBtn').disabled = true;
  hideResults(); hideError();
  document.getElementById('feBtn').style.display = 'none';
  const rFE = document.getElementById('reviewFeBtn');
  if (rFE) rFE.style.display = 'none';
  const feP = document.getElementById('fePanel');
  if (feP) {
    const ws = document.getElementById('feWorkspace');
    if (ws) ws.style.display = 'none';
    const cfg = document.getElementById('feConfigBar');
    if (cfg) cfg.style.display = 'none';
  }
  const legacyFeResults = document.getElementById('feResults');
  if (legacyFeResults) legacyFeResults.innerHTML = '';
  // Hide dashboard
  const dash = document.getElementById('qualityDashboard');
  if (dash) { dash.style.display = 'none'; dash.style.opacity = '0'; }
  // Clear chat data context for the old file
  chatState.dataHeaders    = null;
  chatState.dataSampleRows = null;
  chatState.enrichedCols   = null;
  chatState.lastProfiler   = null;
  updateChatContext();
  updateSuggestions();
}

/* ────────────────────────────────────────────────────────────
   ACTION BUTTON
──────────────────────────────────────────────────────────── */
document.getElementById('actionBtn').addEventListener('click', () => {
  if (!selectedFile) return;
  if (currentMode === 'auto') runAutoClean(); else runAnalyze();
});

/* ────────────────────────────────────────────────────────────
   AUTO CLEAN
──────────────────────────────────────────────────────────── */
async function runAutoClean() {
  hideError(); hideResults(); setLoading(true, 'Analyzing &amp; cleaning your data…');
  const fd = new FormData(); fd.append('file', selectedFile);
  try {
    const res  = await authFetch('/clean', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `Server error ${res.status}`);
    renderAutoResults(json);
  } catch(err) { showError('Error: ' + err.message); }
  finally { setLoading(false); }
}

function renderAutoResults(data) {
  const s = data.summary;
  document.getElementById('statRows').textContent  = s.final_rows.toLocaleString();
  document.getElementById('statDupes').textContent = s.duplicates_removed.toLocaleString();
  document.getElementById('statWs').textContent    = s.whitespace_fixed.toLocaleString();

  const nullEntries = Object.entries(s.nulls_filled || {});
  const nb = document.getElementById('nullsTableBody');
  if (!nullEntries.length) {
    nb.innerHTML = '<div style="padding:12px 16px;font-size:.82rem;color:var(--success)">✓ No missing values found — data is complete.</div>';
  } else {
    let h = '<table><thead><tr><th>Column</th><th>Missing Values</th><th>Fill Strategy</th></tr></thead><tbody>';
    for (const [col, info] of nullEntries)
      h += `<tr><td class="mono-val">${esc(col)}</td><td>${info.count}</td><td class="method-val">${esc(info.method)}</td></tr>`;
    nb.innerHTML = h + '</tbody></table>';
  }

  const renamedEntries = Object.entries(s.columns_renamed || {});
  const rw = document.getElementById('renamedWrap');
  if (renamedEntries.length) {
    document.getElementById('renamedList').innerHTML = renamedEntries.map(([o,n]) =>
      `<span class="rename-tag"><span class="old">${esc(o)}</span><span style="color:var(--muted)">&#x2192;</span><span class="new">${esc(n)}</span></span>`
    ).join('');
    rw.style.display = 'block';
  } else { rw.style.display = 'none'; }

  // store blob
  currentAutoBlob     = b64toBlob(data.cleaned_csv, 'text/csv');
  currentAutoFilename = `${(data.filename || 'data').replace(/\.(csv|xlsx|xls)$/i,'')}_cleaned.csv`;

  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderTextSummary('auto', s, null);

  lastAutoSummary  = s;
  lastAutoFilename = data.filename;

  const aiCard = document.getElementById('aiCard');
  aiCard.style.display = 'block';
  runAiSummary('auto', s, null, data.filename);

  document.getElementById('feBtn').style.display = 'flex';
}

/* ────────────────────────────────────────────────────────────
   REVIEW MODE
──────────────────────────────────────────────────────────── */
async function runAnalyze() {
  hideError(); hideResults(); setLoading(true, 'Scanning your data for issues…');
  const rp = document.getElementById('reviewPanel');
  rp.classList.remove('visible'); rp.style.display = 'none';
  const fd = new FormData(); fd.append('file', selectedFile);
  try {
    const res  = await authFetch('/analyze', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `Server error ${res.status}`);
    reviewData = json; activeFileForApply = selectedFile;
    decisions  = {}; json.changes.forEach(c => decisions[c.id] = null);
    openReviewPanel(json);
  } catch(err) { showError('Error: ' + err.message); }
  finally { setLoading(false); }
}

function openReviewPanel(data) {
  document.getElementById('sheetFileName').textContent = data.filename || 'file';
  renderSheet(data); renderChangeList(data.changes); updateProgress();
  const panel = document.getElementById('reviewPanel');
  panel.style.display = 'flex'; panel.classList.add('visible');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('reviewDownloadBtn').style.display = 'none';
  document.getElementById('reviewError').style.display = 'none';
  document.getElementById('reviewAiCard').style.display = 'none';
}

function renderSheet(data) {
  const { columns, rows, changes } = data;
  const colRenames = {}, cellMap = {}, dupRows = {};
  for (const c of changes) {
    if      (c.type === 'col_rename')     colRenames[c.col] = c;
    else if (c.type === 'duplicate_row')  dupRows[c.row]    = c;
    else                                  cellMap[`${c.row},${c.col}`] = c;
  }
  let html = '<thead><tr><th class="row-num">#</th>';
  for (let ci = 0; ci < columns.length; ci++) {
    const rename = colRenames[ci];
    html += `<th class="${rename ? 'has-change' : ''}" data-col="${ci}" title="${rename ? `→ ${esc(rename.new)}` : ''}">${esc(columns[ci])}${rename ? '<span class="change-badge" style="background:var(--success)"></span>' : ''}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (let ri = 0; ri < rows.length; ri++) {
    const dup = dupRows[ri];
    html += `<tr class="${dup ? 'dup-row' : ''}" id="shrow-${ri}"><td class="row-num">${ri + 1}</td>`;
    for (let ci = 0; ci < columns.length; ci++) {
      const chg   = cellMap[`${ri},${ci}`];
      const val   = rows[ri][ci];
      const cls   = chg ? (chg.type === 'null_fill' ? 'cell-null' : 'cell-ws') : '';
      const badge = chg ? `<span class="change-badge" style="background:${chg.type === 'null_fill' ? 'var(--info)' : 'var(--warn)'}"></span>` : '';
      html += `<td class="${cls}" id="cell-${ri}-${ci}">${esc(val)}${badge}</td>`;
    }
    html += '</tr>';
  }
  document.getElementById('sheetTable').innerHTML = html + '</tbody>';
}

function renderChangeList(changes) {
  document.getElementById('totalCount').textContent = changes.length;
  const list = document.getElementById('changeList');
  if (!changes.length) {
    list.innerHTML = '<div style="padding:16px;text-align:center;font-size:.82rem;color:var(--success)">✓ No issues found in this file.</div>';
    return;
  }
  list.innerHTML = changes.map(c => changeItemHTML(c)).join('');
}

function changeItemHTML(c) {
  const typeLabel = { null_fill: 'Null Fill', whitespace: 'Whitespace', duplicate_row: 'Duplicate Row', col_rename: 'Rename' }[c.type] || c.type;
  let loc = '';
  if      (c.row !== null && c.col !== null) loc = `R${c.row+1} C${c.col+1}`;
  else if (c.row !== null)                   loc = `Row ${c.row+1}`;
  else if (c.col !== null)                   loc = `Col ${c.col+1}`;
  const diff = c.type !== 'duplicate_row'
    ? `<div class="ci-diff"><span class="ci-old">${esc(c.old || '∅')}</span><span class="ci-arrow">→</span><span class="ci-new">${esc(c.new)}</span></div>` : '';
  const d = decisions[c.id];
  return `<div class="change-item ${d||''}" id="ci-${c.id}">
    <div class="ci-top"><span class="ci-type ${c.type}">${typeLabel}</span><span class="ci-loc">${esc(loc)}</span></div>
    <div class="ci-reason">${esc(c.reason)}</div>${diff}
    <div class="ci-btns">
      <button class="ci-btn accept ${d==='accept'?'active':''}" onclick="decide(${c.id},'accept')">✓ Accept</button>
      <button class="ci-btn reject ${d==='reject'?'active':''}" onclick="decide(${c.id},'reject')">✕ Reject</button>
    </div></div>`;
}

function decide(id, verdict) {
  const change = reviewData.changes.find(c => c.id === id);
  if (!change) return;
  decisions[id] = decisions[id] === verdict ? null : verdict;
  const d    = decisions[id];
  const item = document.getElementById(`ci-${id}`);
  if (item) {
    item.className = `change-item ${d || ''}`;
    item.querySelectorAll('.ci-btn').forEach(b => b.classList.remove('active'));
    if (d) item.querySelector(`.ci-btn.${d}`)?.classList.add('active');
  }
  updateCellVisual(change, d);
  updateProgress();
}

function updateCellVisual(c, verdict) {
  if (c.type === 'duplicate_row') {
    const row = document.getElementById(`shrow-${c.row}`);
    if (row) { row.classList.toggle('approved', verdict==='accept'); row.classList.toggle('rejected', verdict==='reject'); }
    return;
  }
  if (c.type === 'col_rename') {
    const th = document.querySelector(`[data-col="${c.col}"]`);
    if (th) th.style.color = verdict==='accept' ? 'var(--accent)' : verdict==='reject' ? 'var(--danger)' : '';
    return;
  }
  const cell = document.getElementById(`cell-${c.row}-${c.col}`);
  if (!cell) return;
  cell.classList.remove('approved','rejected');
  if (verdict === 'accept') cell.classList.add('approved');
  else if (verdict === 'reject') cell.classList.add('rejected');
}

function bulkDecide(verdict) {
  reviewData.changes.forEach(c => {
    decisions[c.id] = verdict;
    updateCellVisual(c, verdict);
    const item = document.getElementById(`ci-${c.id}`);
    if (item) {
      item.className = `change-item ${verdict}`;
      item.querySelectorAll('.ci-btn').forEach(b => b.classList.remove('active'));
      item.querySelector(`.ci-btn.${verdict}`)?.classList.add('active');
    }
  });
  updateProgress();
}

function updateProgress() {
  const total    = reviewData?.changes.length || 0;
  const reviewed = Object.values(decisions).filter(v => v !== null).length;
  const accepted = Object.values(decisions).filter(v => v === 'accept').length;
  document.getElementById('approvedCount').textContent = accepted;
  document.getElementById('totalCount').textContent    = total;
  document.getElementById('progressLabel').textContent = `${reviewed} of ${total} reviewed`;
  document.getElementById('progressFill').style.width  = total ? `${(reviewed/total)*100}%` : '0%';
}

async function applyApproved() {
  const approvedIds = Object.entries(decisions).filter(([,v]) => v==='accept').map(([id]) => parseInt(id));
  if (!approvedIds.length) {
    const e = document.getElementById('reviewError');
    e.textContent = 'No changes approved yet.'; e.style.display = 'block'; e.classList.add('visible'); return;
  }
  document.getElementById('reviewError').style.display = 'none';
  document.getElementById('applyBtn').disabled    = true;
  document.getElementById('applyBtn').textContent = 'Applying…';
  const fd = new FormData();
  fd.append('file', activeFileForApply);
  fd.append('approved_ids', JSON.stringify(approvedIds));
  try {
    const res  = await authFetch('/apply', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `Server error ${res.status}`);
    currentReviewBlob     = b64toBlob(json.cleaned_csv, 'text/csv');
    const safe            = (json.filename || 'data').replace(/\.(csv|xlsx|xls)$/i, '');
    currentReviewFilename = `${safe}_reviewed.csv`;
    const dl = document.getElementById('reviewDownloadBtn');
    dl.style.display = 'flex';
    dl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const approvedChanges = reviewData.changes.filter(c => approvedIds.includes(c.id));
    renderTextSummary('review', null, approvedChanges);

    lastReviewChanges  = approvedChanges;
    lastReviewFilename = json.filename;
    const aiCard       = document.getElementById('reviewAiCard');
    if (approvedChanges.length) {
      aiCard.style.display = 'block';
      aiCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      runAiSummary('review', null, approvedChanges, json.filename);
    }
    document.getElementById('reviewFeBtn').style.display = 'flex';
  } catch(err) {
    const e = document.getElementById('reviewError');
    e.textContent = 'Error: ' + err.message; e.style.display = 'block'; e.classList.add('visible');
  } finally {
    document.getElementById('applyBtn').disabled    = false;
    document.getElementById('applyBtn').textContent = 'Apply Approved Changes';
  }
}

/* ────────────────────────────────────────────────────────────
   AI SUMMARY
──────────────────────────────────────────────────────────── */
async function runAiSummary(mode, summaryData, changesData, filename) {
  const isReview = mode === 'review';
  const thinkEl  = document.getElementById(isReview ? 'reviewAiThinking' : 'aiThinking');
  const textEl   = document.getElementById(isReview ? 'reviewAiText'     : 'aiText');
  const errEl    = document.getElementById(isReview ? 'reviewAiError'    : 'aiError');
  const regenBtn = document.getElementById(isReview ? 'reviewAiRegenBtn' : 'aiRegenBtn');

  thinkEl.style.display = 'flex'; textEl.style.display = 'none'; textEl.textContent = '';
  errEl.style.display = 'none'; regenBtn.style.display = 'none';

  const fd = new FormData();
  fd.append('filename',     filename    || 'file');
  fd.append('summary_json', summaryData ? JSON.stringify(summaryData) : '{}');
  fd.append('changes_json', changesData ? JSON.stringify(changesData) : '[]');

  try {
    const res  = await authFetch('/summarize', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `AI error ${res.status}`);
    thinkEl.style.display = 'none';
    textEl.style.display  = 'block';
    await typewrite(textEl, json.summary_text);
    regenBtn.style.display = 'inline-block';
  } catch(err) {
    thinkEl.style.display = 'none';
    errEl.textContent     = '⚠ ' + err.message;
    errEl.style.display   = 'block';
    regenBtn.style.display = 'inline-block';
  }
}

async function typewrite(el, text) {
  el.innerHTML = '';
  const cursor = document.createElement('span');
  cursor.className = 'ai-cursor';
  el.appendChild(cursor);
  const formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const tmp = document.createElement('div'); tmp.innerHTML = formatted;
  const plain = tmp.textContent;
  let i = 0;
  await new Promise(resolve => {
    const iv = setInterval(() => {
      if (i >= plain.length) { clearInterval(iv); cursor.remove(); el.innerHTML = formatted; resolve(); return; }
      el.insertBefore(document.createTextNode(plain[i]), cursor); i++;
    }, 12);
  });
}

function regenSummary()       { if (lastAutoSummary)   runAiSummary('auto',   lastAutoSummary,  null,              lastAutoFilename); }
function regenReviewSummary() { if (lastReviewChanges) runAiSummary('review', null,             lastReviewChanges, lastReviewFilename); }

/* ────────────────────────────────────────────────────────────
   TEXT SUMMARY
──────────────────────────────────────────────────────────── */
function toggleTextSummary(bodyId, chevId) {
  const body = document.getElementById(bodyId);
  const chev = document.getElementById(chevId);
  const open = body.classList.toggle('open');
  chev.classList.toggle('open', open);
}

function renderTextSummary(mode, summaryData, changesData) {
  const isReview = mode === 'review';
  const cardId   = isReview ? 'reviewTextSummaryCard' : 'textSummaryCard';
  const bodyId   = isReview ? 'reviewTextSummaryBody' : 'textSummaryBody';
  const card     = document.getElementById(cardId);
  const body     = document.getElementById(bodyId);
  const lines    = [];

  if (!isReview && summaryData) {
    const s = summaryData;
    lines.push({ icon:'📁', text:`Your file had <strong>${(s.original_rows||0).toLocaleString()} rows</strong> and was processed through the auto-clean pipeline.` });
    if (s.duplicates_removed > 0) {
      lines.push({ icon:'🗑️', text:`<span class="ts-warn">${s.duplicates_removed.toLocaleString()} duplicate row${s.duplicates_removed!==1?'s':''}</span> were detected and removed, leaving <strong>${(s.final_rows||0).toLocaleString()} rows</strong> in the cleaned file.` });
    } else {
      lines.push({ icon:'✅', text:`<span class="ts-ok">No duplicate rows found</span> — all ${(s.original_rows||0).toLocaleString()} rows are unique.` });
    }
    if (s.whitespace_fixed > 0) {
      lines.push({ icon:'✂️', text:`<span class="ts-warn">${s.whitespace_fixed.toLocaleString()} cell${s.whitespace_fixed!==1?'s':''}</span> had leading or trailing whitespace stripped.` });
    } else {
      lines.push({ icon:'✅', text:`<span class="ts-ok">No whitespace issues found</span> — all text values are already trimmed.` });
    }
    const nullEntries = Object.entries(s.nulls_filled || {});
    if (nullEntries.length) {
      const totalNulls = nullEntries.reduce((acc,[,v]) => acc + v.count, 0);
      lines.push({ icon:'🔧', text:`<span class="ts-info">${totalNulls.toLocaleString()} missing value${totalNulls!==1?'s':''}</span> were filled across <strong>${nullEntries.length} column${nullEntries.length!==1?'s':''}</strong> using column-specific strategies.` });
      for (const [col, info] of nullEntries) {
        lines.push({ icon:'↳', text:`&nbsp;&nbsp;<span class="ts-info">${info.count} null${info.count!==1?'s':''}</span> in <strong>${esc(col)}</strong> — ${esc(info.method)}` });
      }
    } else {
      lines.push({ icon:'✅', text:`<span class="ts-ok">No missing values found</span> — the dataset is complete.` });
    }
    const renamedEntries = Object.entries(s.columns_renamed || {});
    if (renamedEntries.length) {
      lines.push({ icon:'🏷️', text:`<span class="ts-warn">${renamedEntries.length} column header${renamedEntries.length!==1?' were':' was'}</span> renamed to snake_case for consistency: ${renamedEntries.map(([o,n]) => `<strong>${esc(o)}</strong> → <strong>${esc(n)}</strong>`).join(', ')}.` });
    } else {
      lines.push({ icon:'✅', text:`<span class="ts-ok">All column headers</span> are already in proper snake_case format.` });
    }
    const issues = s.duplicates_removed + s.whitespace_fixed + Object.keys(s.nulls_filled||{}).length + Object.keys(s.columns_renamed||{}).length;
    let verdict;
    if      (issues === 0) verdict = 'Your data was already clean — no changes were necessary. The file is in excellent shape.';
    else if (issues <= 3)  verdict = 'Minor data quality issues were resolved. The cleaned file is now consistent and ready for analysis.';
    else                   verdict = 'Several data quality issues were corrected. The cleaned file is significantly more reliable and analysis-ready.';
    lines.push({ verdict });
  }

  if (isReview && changesData) {
    const total = changesData.length;
    if (total === 0) {
      lines.push({ icon:'✅', text:`<span class="ts-ok">No changes were applied</span> — you rejected all proposed modifications.` });
    } else {
      lines.push({ icon:'✅', text:`<span class="ts-ok">${total} change${total!==1?' were':' was'}</span> approved and applied to your dataset.` });
      const byType = {};
      for (const c of changesData) byType[c.type] = (byType[c.type]||0)+1;
      if (byType.duplicate_row) lines.push({ icon:'🗑️', text:`<span class="ts-warn">${byType.duplicate_row} duplicate row${byType.duplicate_row!==1?'s':''}</span> removed.` });
      if (byType.null_fill)     lines.push({ icon:'🔧', text:`<span class="ts-info">${byType.null_fill} missing value${byType.null_fill!==1?'s':''}</span> filled in.` });
      if (byType.whitespace)    lines.push({ icon:'✂️', text:`<span class="ts-warn">${byType.whitespace} whitespace issue${byType.whitespace!==1?'s':''}</span> stripped.` });
      if (byType.col_rename)    lines.push({ icon:'🏷️', text:`<span class="ts-warn">${byType.col_rename} column header${byType.col_rename!==1?'s':''}</span> renamed.` });
      lines.push({ verdict: `${total} selected change${total!==1?' were':' was'} applied successfully.` });
    }
  }

  body.innerHTML = lines.map(l => {
    if (l.verdict) return `<div class="ts-verdict">&#x2714; ${l.verdict}</div>`;
    return `<div class="ts-line"><span class="ts-icon">${l.icon}</span><span class="ts-content">${l.text}</span></div>`;
  }).join('');

  card.style.display = 'block';
}

/* ────────────────────────────────────────────────────────────
   DATA PREVIEW MODAL
──────────────────────────────────────────────────────────── */
function openPreview(mode) {
  const blob     = mode === 'auto' ? currentAutoBlob   : currentReviewBlob;
  const filename = mode === 'auto' ? currentAutoFilename : currentReviewFilename;
  if (!blob) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text    = e.target.result;
    const lines   = text.trim().split('\n');
    const MAX_PREVIEW = 200;
    const headers = parseCSVLine(lines[0]);
    const dataLines   = lines.slice(1);
    const previewLines = dataLines.slice(0, MAX_PREVIEW);
    const truncated   = dataLines.length > MAX_PREVIEW;

    let html = '<thead><tr><th>#</th>';
    for (const h of headers) html += `<th>${esc(h)}</th>`;
    html += '</tr></thead><tbody>';
    previewLines.forEach((line, i) => {
      const cells = parseCSVLine(line);
      html += `<tr><td>${i+1}</td>`;
      for (let ci = 0; ci < headers.length; ci++) {
        const val = cells[ci] ?? '';
        html += `<td class="${val===''?'empty-cell':''}">${val===''?'<em>empty</em>':esc(val)}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody>';

    document.getElementById('previewTable').innerHTML = html;
    document.getElementById('previewMeta').textContent = filename;
    document.getElementById('previewRowCount').textContent =
      `${dataLines.length.toLocaleString()} row${dataLines.length!==1?'s':''} · ${headers.length} column${headers.length!==1?'s':''}`;

    const truncNote = document.getElementById('previewTruncateNote');
    truncNote.classList.toggle('visible', truncated);

    const dlBtn = document.getElementById('previewDownloadBtn');
    const url   = URL.createObjectURL(blob);
    dlBtn.href = url; dlBtn.download = filename;

    document.getElementById('previewOverlay').classList.add('visible');
  };
  reader.readAsText(blob);
}

function closePreview() { document.getElementById('previewOverlay').classList.remove('visible'); }

document.getElementById('previewOverlay').addEventListener('click', function(e) {
  if (e.target === this) closePreview();
});

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if      (ch === '"')          { if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
    else if (ch === ',' && !inQ)  { result.push(cur); cur = ''; }
    else                          { cur += ch; }
  }
  result.push(cur);
  return result;
}

/* ────────────────────────────────────────────────────────────
   FEATURE ENGINEERING ADVISOR

/* ================================================================
   FEATURE ENGINEERING ADVISOR — Plain-English Redesign
   Translates algorithm names to user-friendly actions.
   Grouped by outcome, not by technique.
================================================================ */

let feSource       = null;
let feSelections   = {};
let feResultsData  = null;
let feActiveCat    = 'all';
let feLoadingTimer = null;

/* ── Plain-English translation layer ────────────────────────── */

const FE_TRANSLATIONS = {
  // Encoding
  'OneHotEncoder':           { action: 'Convert Categories to Numbers',      group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'OrdinalEncoder':          { action: 'Rank Categories by Order',           group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'TargetEncoder':           { action: 'Convert Categories to Numbers',      group: 'prepare_categories', icon: '🔢', safeLevel: 'caution' },
  'FrequencyEncoder':        { action: 'Convert Categories by Frequency',    group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'LabelEncoder':            { action: 'Assign Numbers to Categories',       group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'WoEEncoder':              { action: 'Convert Categories Using Patterns',  group: 'prepare_categories', icon: '🔢', safeLevel: 'caution' },
  'BinaryEncoder':           { action: 'Compress Categories into Bits',      group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'HashingEncoder':          { action: 'Encode High-Cardinality Categories', group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'one_hot_encoding':        { action: 'Convert Categories to Numbers',      group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'ordinal_encoding':        { action: 'Rank Categories by Order',           group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  'target_encoding':         { action: 'Convert Categories to Numbers',      group: 'prepare_categories', icon: '🔢', safeLevel: 'caution' },
  'frequency_encoding':      { action: 'Convert Categories by Frequency',    group: 'prepare_categories', icon: '🔢', safeLevel: 'safe' },
  // Scaling / Normalization
  'StandardScaler':          { action: 'Normalize Numeric Values',           group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'MinMaxScaler':            { action: 'Scale Numbers to 0–1 Range',         group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'RobustScaler':            { action: 'Normalize While Ignoring Outliers',  group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'MaxAbsScaler':            { action: 'Scale Numbers to –1 to 1 Range',     group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'Normalizer':              { action: 'Equalize Row Magnitudes',            group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'standardization':         { action: 'Normalize Numeric Values',           group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'normalization':           { action: 'Scale Numbers to 0–1 Range',         group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  'robust_scaling':          { action: 'Normalize While Ignoring Outliers',  group: 'improve_numeric',    icon: '📏', safeLevel: 'safe' },
  // Transformation
  'LogTransformer':          { action: 'Fix Skewed Data Distribution',       group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'log_transformation':      { action: 'Fix Skewed Data Distribution',       group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'SqrtTransformer':         { action: 'Smooth Out Extreme Values',          group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'sqrt_transformation':     { action: 'Smooth Out Extreme Values',          group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'PowerTransformer':        { action: 'Make Data More Normal-Looking',      group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'power_transformation':    { action: 'Make Data More Normal-Looking',      group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'BoxCoxTransformer':       { action: 'Reduce Skew for Better Predictions', group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'YeoJohnsonTransformer':   { action: 'Reduce Skew for Better Predictions', group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'QuantileTransformer':     { action: 'Equalize Data Distribution',         group: 'improve_numeric',    icon: '📐', safeLevel: 'safe' },
  'cyclical_encoding':       { action: 'Encode Time-Based Patterns',         group: 'create_features',    icon: '🔄', safeLevel: 'safe' },
  'CyclicalFeatures':        { action: 'Encode Time-Based Patterns',         group: 'create_features',    icon: '🔄', safeLevel: 'safe' },
  // Feature Creation
  'MathFeatures':            { action: 'Create Combined Numeric Features',   group: 'create_features',    icon: '✨', safeLevel: 'safe' },
  'math_features':           { action: 'Create Combined Numeric Features',   group: 'create_features',    icon: '✨', safeLevel: 'safe' },
  'RelativeFeatures':        { action: 'Create Ratio Features',              group: 'create_features',    icon: '✨', safeLevel: 'safe' },
  'relative_features':       { action: 'Create Ratio Features',              group: 'create_features',    icon: '✨', safeLevel: 'safe' },
  'GeoDistanceFeatures':     { action: 'Calculate Distances Between Locations', group: 'create_features', icon: '🗺️', safeLevel: 'safe' },
  'geo_distance_features':   { action: 'Calculate Distances Between Locations', group: 'create_features', icon: '🗺️', safeLevel: 'safe' },
  'DecisionTreeFeatures':    { action: 'Discover Hidden Patterns Automatically', group: 'create_features',icon: '✨', safeLevel: 'caution' },
  'decision_tree_features':  { action: 'Discover Hidden Patterns Automatically', group: 'create_features',icon: '✨', safeLevel: 'caution' },
  'PolynomialFeatures':      { action: 'Create Non-Linear Relationships',    group: 'create_features',    icon: '✨', safeLevel: 'caution' },
  'polynomial_features':     { action: 'Create Non-Linear Relationships',    group: 'create_features',    icon: '✨', safeLevel: 'caution' },
  'interaction_features':    { action: 'Combine Columns to Find Interactions', group: 'create_features',  icon: '✨', safeLevel: 'caution' },
  // Selection
  'VarianceThreshold':       { action: 'Remove Low-Information Columns',     group: 'select_features',    icon: '🗑️', safeLevel: 'safe' },
  'variance_threshold':      { action: 'Remove Low-Information Columns',     group: 'select_features',    icon: '🗑️', safeLevel: 'safe' },
  'SelectKBest':             { action: 'Keep Only the Most Useful Columns',  group: 'select_features',    icon: '🎯', safeLevel: 'caution' },
  'SelectPercentile':        { action: 'Keep Top Performing Columns',        group: 'select_features',    icon: '🎯', safeLevel: 'caution' },
  'RFECV':                   { action: 'Remove Redundant Columns',           group: 'select_features',    icon: '🗑️', safeLevel: 'caution' },
  'drop_correlated':         { action: 'Remove Duplicate-Information Columns', group: 'select_features',  icon: '🗑️', safeLevel: 'caution' },
  'correlation_filter':      { action: 'Remove Highly Correlated Columns',   group: 'select_features',    icon: '🗑️', safeLevel: 'caution' },
  // Dimensionality Reduction
  'PCA':                     { action: 'Reduce Dataset Complexity',          group: 'reduce_complexity',  icon: '🗜️', safeLevel: 'advanced' },
  'pca':                     { action: 'Reduce Dataset Complexity',          group: 'reduce_complexity',  icon: '🗜️', safeLevel: 'advanced' },
  'TruncatedSVD':            { action: 'Compress Dataset to Core Patterns',  group: 'reduce_complexity',  icon: '🗜️', safeLevel: 'advanced' },
  'UMAP':                    { action: 'Simplify High-Dimensional Data',     group: 'reduce_complexity',  icon: '🗜️', safeLevel: 'advanced' },
};

const FE_GROUPS = {
  all:               { label: 'All Recommendations', icon: '✦' },
  prepare_categories:{ label: 'Prepare Categories',  icon: '🔢', desc: 'Turn text labels into numbers your model can read' },
  improve_numeric:   { label: 'Improve Numeric Data', icon: '📏', desc: 'Normalize and transform number columns for better model performance' },
  create_features:   { label: 'Create New Features',  icon: '✨', desc: 'Generate new columns that help models find patterns' },
  select_features:   { label: 'Select Important Features', icon: '🎯', desc: 'Remove columns that add noise or redundancy' },
  reduce_complexity: { label: 'Reduce Complexity',    icon: '🗜️', desc: 'Simplify your dataset while keeping key information' },
};

// Plain-English "why" reasons based on column stats
function buildWhyReasons(col, rec) {
  const stats  = col.column_stats || {};
  const dtype  = stats.dtype || 'unknown';
  const cat    = (rec.category || '').toLowerCase();
  const op     = (rec.operation || '').toLowerCase();
  const reasons = [];

  if (dtype === 'categorical') {
    reasons.push('Column contains text or category values');
    if (stats.cardinality) {
      if (stats.cardinality > 50)  reasons.push(`Very high variety detected (${stats.cardinality.toLocaleString()} unique values)`);
      else if (stats.cardinality > 10) reasons.push(`Medium variety detected (${stats.cardinality} unique values)`);
      else                          reasons.push(`Low variety detected (${stats.cardinality} unique values)`);
    }
    if (cat.includes('encod') || op.includes('encod')) reasons.push('Machine learning models require numeric input');
  }
  if (dtype === 'numeric') {
    if (Math.abs(stats.skewness || 0) > 1) reasons.push(`Data is skewed (score: ${stats.skewness}) — most values cluster to one side`);
    if (stats.has_outliers) reasons.push('Extreme values detected that may distort model training');
    if (cat.includes('scal') || op.includes('scal') || op.includes('standard') || op.includes('normal'))
      reasons.push('Different columns have very different number ranges');
    if (stats.missing_pct > 0) reasons.push(`${stats.missing_pct}% of values were missing`);
  }
  if (dtype === 'datetime' || stats.is_cyclical) {
    reasons.push('Column contains time or date information');
    reasons.push('Time patterns (morning/evening, weekday/weekend) can improve predictions');
  }
  if (dtype === 'geo') {
    reasons.push('Column appears to contain geographic coordinates');
    reasons.push('Distance calculations can reveal location-based patterns');
  }
  if (stats.paired_cols && stats.paired_cols.length) {
    reasons.push(`Related column${stats.paired_cols.length > 1 ? 's' : ''} detected: ${stats.paired_cols.slice(0,2).join(', ')}`);
  }
  if (op.includes('variance') || op.includes('drop') || op.includes('remove')) {
    reasons.push('Column has very little variation in its values');
    reasons.push('Low-variation columns rarely help models learn');
  }
  if (op.includes('pca') || op.includes('svd') || op.includes('umap')) {
    reasons.push('Dataset has many columns which may slow training');
    reasons.push('Complexity reduction can improve speed and generalization');
  }

  if (!reasons.length) reasons.push('Recommended based on your column\'s data type and distribution');
  return reasons;
}

// Build plain-English benefit list for a recommendation
function buildBenefits(rec) {
  const op  = (rec.operation || '').toLowerCase();
  const cat = (rec.category  || '').toLowerCase();
  const benefits = [];

  if (cat.includes('encod') || op.includes('encod')) {
    benefits.push({ icon: '✓', text: 'Makes column readable by machine learning models' });
    benefits.push({ icon: '✓', text: 'Can improve prediction accuracy' });
  }
  if (cat.includes('scal') || op.includes('standard') || op.includes('normal') || op.includes('scal')) {
    benefits.push({ icon: '✓', text: 'Prevents large numbers from dominating the model' });
    benefits.push({ icon: '✓', text: 'Speeds up model training' });
    benefits.push({ icon: '✓', text: 'Works better with most ML algorithms' });
  }
  if (op.includes('log') || op.includes('sqrt') || op.includes('power') || op.includes('transform')) {
    benefits.push({ icon: '✓', text: 'Reduces the effect of extreme values' });
    benefits.push({ icon: '✓', text: 'Makes patterns easier for models to detect' });
  }
  if (op.includes('math') || op.includes('relativ') || op.includes('ratio') || op.includes('interact')) {
    benefits.push({ icon: '✓', text: 'Creates new signals the model can learn from' });
    benefits.push({ icon: '✓', text: 'Can significantly improve accuracy' });
  }
  if (op.includes('cycl') || op.includes('datetime') || op.includes('date')) {
    benefits.push({ icon: '✓', text: 'Captures repeating time patterns' });
    benefits.push({ icon: '✓', text: 'Better than raw timestamps for most models' });
  }
  if (op.includes('geo') || op.includes('distance')) {
    benefits.push({ icon: '✓', text: 'Adds geographic context to predictions' });
  }
  if (op.includes('variance') || op.includes('drop') || op.includes('remove') || op.includes('select')) {
    benefits.push({ icon: '✓', text: 'Removes noise that confuses models' });
    benefits.push({ icon: '✓', text: 'Faster training, lower memory use' });
    benefits.push({ icon: '✓', text: 'Can improve generalization to new data' });
  }
  if (op.includes('pca') || op.includes('svd') || op.includes('umap')) {
    benefits.push({ icon: '✓', text: 'Significantly reduces training time' });
    benefits.push({ icon: '✓', text: 'Removes redundant information' });
  }

  if (!benefits.length) {
    benefits.push({ icon: '✓', text: 'Improves data quality for machine learning' });
    benefits.push({ icon: '✓', text: 'Recommended based on your column\'s characteristics' });
  }
  return benefits;
}

// Map operation to user-friendly action string
function getPlainAction(operation, category) {
  if (!operation) return 'Improve this column';
  // Try exact match first
  if (FE_TRANSLATIONS[operation]) return FE_TRANSLATIONS[operation].action;
  // Try lowercase
  const lower = operation.toLowerCase().replace(/[_\s]/g, '_');
  for (const [k, v] of Object.entries(FE_TRANSLATIONS)) {
    if (k.toLowerCase().replace(/[_\s]/g, '_') === lower) return v.action;
  }
  // Fuzzy match
  const op = operation.toLowerCase();
  if (op.includes('target_encod') || op.includes('targetencod')) return 'Convert Categories to Numbers';
  if (op.includes('frequency_encod') || op.includes('frequencyencod')) return 'Convert Categories by Frequency';
  if (op.includes('onehot') || op.includes('one_hot') || op.includes('dummy')) return 'Convert Categories to Numbers';
  if (op.includes('ordinal')) return 'Rank Categories by Order';
  if (op.includes('label_encod') || op.includes('labelencod')) return 'Assign Numbers to Categories';
  if (op.includes('standard') || op.includes('zscore') || op.includes('z_score')) return 'Normalize Numeric Values';
  if (op.includes('minmax') || op.includes('min_max')) return 'Scale Numbers to 0–1 Range';
  if (op.includes('robust')) return 'Normalize While Ignoring Outliers';
  if (op.includes('log_') || op.includes('_log')) return 'Fix Skewed Data Distribution';
  if (op.includes('sqrt')) return 'Smooth Out Extreme Values';
  if (op.includes('power') || op.includes('boxcox') || op.includes('yeojohnson')) return 'Make Data More Normal-Looking';
  if (op.includes('pca') || op.includes('svd') || op.includes('umap')) return 'Reduce Dataset Complexity';
  if (op.includes('variance') || op.includes('drop_') || op.includes('remove_')) return 'Remove Low-Information Columns';
  if (op.includes('select') || op.includes('kbest')) return 'Keep Only the Most Useful Columns';
  if (op.includes('cycl') || op.includes('datetime')) return 'Encode Time-Based Patterns';
  if (op.includes('geo') || op.includes('distance')) return 'Calculate Distances Between Locations';
  if (op.includes('math') || op.includes('relativ') || op.includes('ratio')) return 'Create Combined Numeric Features';
  if (op.includes('polynomial') || op.includes('interact')) return 'Create Non-Linear Relationships';
  if (op.includes('encod')) return 'Convert Categories to Numbers';
  if (op.includes('scal') || op.includes('norm')) return 'Normalize Numeric Values';
  return operation; // fallback to raw name
}

function getGroupForRec(rec) {
  const op  = rec.operation || '';
  if (FE_TRANSLATIONS[op]) return FE_TRANSLATIONS[op].group;
  const cat = (rec.category || '').toLowerCase();
  if (cat.includes('encod'))     return 'prepare_categories';
  if (cat.includes('scal') || cat.includes('norm')) return 'improve_numeric';
  if (cat.includes('transform'))  return 'improve_numeric';
  if (cat.includes('creation') || cat.includes('creat')) return 'create_features';
  if (cat.includes('select'))    return 'select_features';
  if (cat.includes('dimension') || cat.includes('reduc')) return 'reduce_complexity';
  const o = op.toLowerCase();
  if (o.includes('encod'))      return 'prepare_categories';
  if (o.includes('scal') || o.includes('standard') || o.includes('normal')) return 'improve_numeric';
  if (o.includes('log') || o.includes('sqrt') || o.includes('power') || o.includes('transform')) return 'improve_numeric';
  if (o.includes('pca') || o.includes('svd') || o.includes('umap')) return 'reduce_complexity';
  if (o.includes('variance') || o.includes('drop') || o.includes('select') || o.includes('remove')) return 'select_features';
  if (o.includes('math') || o.includes('relativ') || o.includes('cycl') || o.includes('geo') || o.includes('poly') || o.includes('interact')) return 'create_features';
  return 'improve_numeric';
}

function getSafeLevel(rec) {
  const op = rec.operation || '';
  if (FE_TRANSLATIONS[op]) return FE_TRANSLATIONS[op].safeLevel;
  const o = (op).toLowerCase();
  if (o.includes('pca') || o.includes('svd') || o.includes('umap')) return 'advanced';
  if (o.includes('target') || o.includes('drop') || o.includes('remove') || o.includes('select')) return 'caution';
  if (o.includes('polynomial') || o.includes('interact') || o.includes('decision_tree')) return 'caution';
  return 'safe';
}

function getIconForGroup(group) {
  return (FE_GROUPS[group] || FE_GROUPS.all).icon;
}

// Impact stars renderer
function renderStars(n, max = 5) {
  return Array.from({length: max}, (_, i) =>
    `<span class="star ${i < n ? 'filled' : ''}">${i < n ? '★' : '☆'}</span>`
  ).join('');
}

function getRiskLevel(rec) {
  const op = (rec.operation || '').toLowerCase();
  if (op.includes('target') || op.includes('pca') || op.includes('drop') || op.includes('remove')) return { level: 'high', label: 'Higher Risk', stars: 4 };
  if (op.includes('onehot') || op.includes('polynomial') || op.includes('interact') || op.includes('decision_tree')) return { level: 'medium', label: 'Some Risk', stars: 2 };
  return { level: 'low', label: 'Low Risk', stars: 1 };
}

function getAccuracyImpact(rec) {
  const p = rec.priority || 'low';
  return p === 'high' ? 5 : p === 'medium' ? 3 : 2;
}

function getComplexityImpact(rec) {
  const op = (rec.operation || '').toLowerCase();
  if (op.includes('pca') || op.includes('polynomial') || op.includes('interact') || op.includes('decision_tree')) return 4;
  if (op.includes('target') || op.includes('geo') || op.includes('math')) return 3;
  return 2;
}

/* ── Main render entry point ─────────────────────────────── */

function openFEPanel(source) {
  feSource = source;
  document.getElementById('feSourceLabel').textContent =
    source === 'auto' ? 'Auto-cleaned file' : 'Review-mode cleaned file';
  document.getElementById('feError').style.display     = 'none';
  document.getElementById('feLoading').style.display   = 'none';
  document.getElementById('feWorkspace').style.display = 'none';
  document.getElementById('feConfigBar').style.display = 'flex';

  const savedKey = sessionStorage.getItem('dp_groq_key') || '';
  const keyInput = document.getElementById('groqKeyInput');
  if (keyInput && savedKey) keyInput.value = savedKey;

  switchPanel('advisor');
  const panel = document.getElementById('fePanel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveGroqKey() {
  const val = document.getElementById('groqKeyInput')?.value?.trim() || '';
  if (val) sessionStorage.setItem('dp_groq_key', val);
  else     sessionStorage.removeItem('dp_groq_key');
}

async function runFEAdvisor() {
  const task    = document.getElementById('feTask').value;
  const errEl   = document.getElementById('feError');
  const loadEl  = document.getElementById('feLoading');
  const runBtn  = document.getElementById('feRunBtn');
  const userKey = document.getElementById('groqKeyInput')?.value?.trim() || sessionStorage.getItem('dp_groq_key') || '';
  const blob     = feSource === 'auto' ? currentAutoBlob   : currentReviewBlob;
  const filename = feSource === 'auto' ? currentAutoFilename : currentReviewFilename;

  if (!blob) {
    errEl.textContent = 'No cleaned file available. Please clean a dataset first.';
    errEl.style.display = 'block'; errEl.classList.add('visible'); return;
  }

  errEl.style.display = 'none';
  document.getElementById('feWorkspace').style.display = 'none';
  document.getElementById('feConfigBar').style.display = 'none';
  loadEl.style.display = 'flex';
  runBtn.disabled = true;

  const steps = ['fstep1','fstep2','fstep3','fstep4'];
  steps.forEach(s => { const el=document.getElementById(s); if(el){el.classList.remove('done','active');} });
  document.getElementById('fstep1').classList.add('active');
  let stepIdx = 0;
  feLoadingTimer = setInterval(() => {
    if (stepIdx < steps.length) {
      document.getElementById(steps[stepIdx]).classList.remove('active');
      document.getElementById(steps[stepIdx]).classList.add('done');
      stepIdx++;
      if (stepIdx < steps.length) document.getElementById(steps[stepIdx]).classList.add('active');
    }
  }, 2000);

  try {
    const file = new File([blob], filename, { type: 'text/csv' });
    const fd = new FormData();
    fd.append('file', file);
    if (task)    fd.append('task', task);
    if (userKey) fd.append('user_api_key', userKey);

    const res  = await authFetch('/recommend', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `Server error ${res.status}`);

    clearInterval(feLoadingTimer);
    steps.forEach(s => { const el=document.getElementById(s); if(el){el.classList.add('done');el.classList.remove('active');} });
    await new Promise(r => setTimeout(r, 300));
    loadEl.style.display = 'none';
    renderFEWorkspace(json);
  } catch(e) {
    clearInterval(feLoadingTimer);
    loadEl.style.display = 'none';
    document.getElementById('feConfigBar').style.display = 'flex';
    errEl.textContent = String(e.message);
    errEl.style.display = 'block'; errEl.classList.add('visible');
  } finally {
    runBtn.disabled = false;
  }
}

function renderFEWorkspace(data) {
  feSelections  = {};
  feResultsData = data;
  feActiveCat   = 'all';

  const allCards = buildAllCards();
  const totalRecs = allCards.length;
  const safeCount = allCards.filter(c => getSafeLevel(c.rec) === 'safe').length;

  // Update header tag
  const modeLabel = data.mode === 'ai' ? '✦ AI-powered' : '⚡ Smart analysis';
  const modeColor = data.mode === 'ai' ? 'var(--accent)' : 'var(--success)';
  document.getElementById('feDatasetTag').innerHTML =
    `${data.filename || 'dataset'} · ${data.columns_analysed || 0} columns analysed &nbsp;` +
    `<span style="color:${modeColor};font-size:.6rem;border:1px solid ${modeColor};border-radius:3px;padding:1px 6px;">${modeLabel}</span>`;

  // Count by outcome group
  const groupCounts = { all: totalRecs };
  allCards.forEach(({ rec }) => {
    const g = getGroupForRec(rec);
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  });

  // Update tab counts (map new groups back to original tab IDs)
  const tabMap = {
    'ftab-all':             groupCounts.all || 0,
    'ftab-encoding':        groupCounts.prepare_categories || 0,
    'ftab-scaling':         groupCounts.improve_numeric || 0,
    'ftab-feature_creation':groupCounts.create_features || 0,
    'ftab-transformation':  0,
    'ftab-selection':       (groupCounts.select_features || 0) + (groupCounts.reduce_complexity || 0),
  };
  Object.entries(tabMap).forEach(([id, n]) => {
    const el = document.getElementById(id); if (el) el.textContent = n;
  });

  // Render summary banner
  renderFESummaryBanner(data, totalRecs, safeCount);

  // Render cards
  renderFEResultsArea(data, allCards, 'all', '');
  updateFEPipeline();
  updateFESelCountNew();

  document.getElementById('feWorkspace').style.display    = 'flex';
  document.getElementById('feWorkspace').style.flexDirection = 'column';
  document.querySelectorAll('.fe-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.fe-tab[data-cat="all"]')?.classList.add('active');
  document.getElementById('feWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFESummaryBanner(data, total, safeCount) {
  // Insert summary banner before the results area if not already there
  const workspace = document.getElementById('feWorkspace');
  let banner = document.getElementById('feSummaryBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'feSummaryBanner';
    // Insert after fe-tab-bar
    const tabBar = document.getElementById('feTabs');
    if (tabBar && tabBar.nextSibling) {
      tabBar.parentNode.insertBefore(banner, tabBar.nextSibling);
    }
  }
  banner.innerHTML = `
    <div class="fe-summary-banner">
      <div class="fe-summary-intro">
        <div class="fe-summary-ai-icon">🤖</div>
        <div class="fe-summary-text">
          <div class="fe-summary-headline">Your data is ready for improvement</div>
          <div class="fe-summary-sub">Found <strong>${total}</strong> recommendation${total !== 1 ? 's' : ''} · <strong>${safeCount}</strong> safe to apply immediately</div>
        </div>
      </div>
      <div class="fe-bulk-actions">
        <button class="fe-bulk-btn fe-bulk-all"  onclick="feSelectAll()">
          <span>✦</span> Apply All Recommended
        </button>
        <button class="fe-bulk-btn fe-bulk-safe" onclick="feSelectSafeOnly()">
          <span>🛡</span> Apply Safe Only
        </button>
        <button class="fe-bulk-btn fe-bulk-none" onclick="feSelectNone()">
          <span>✕</span> Clear Selection
        </button>
      </div>
    </div>`;
}

function renderFEResultsArea(data, allCards, filterCat, searchQ) {
  const area = document.getElementById('feResultsArea');
  const q    = (searchQ || '').toLowerCase();

  if (!allCards.length) {
    area.innerHTML = `<div class="fe-no-results">
      <div style="font-size:2rem;margin-bottom:12px">🔍</div>
      <div style="font-weight:700;margin-bottom:6px">No recommendations yet</div>
      <div style="font-size:.85rem">Make sure the knowledge base is set up — run <code>python ingest.py</code> first.</div>
    </div>`;
    return;
  }

  // Map filter tabs to groups
  const groupFilter = {
    'all':              null,
    'encoding':         'prepare_categories',
    'scaling':          'improve_numeric',
    'feature_creation': 'create_features',
    'transformation':   null, // merged into improve_numeric
    'selection':        ['select_features', 'reduce_complexity'],
  }[filterCat] || null;

  const filtered = allCards.filter(item => {
    const group = getGroupForRec(item.rec);
    let matchCat = true;
    if (groupFilter) {
      matchCat = Array.isArray(groupFilter) ? groupFilter.includes(group) : group === groupFilter;
    }
    const matchQ = !q ||
      (item.rec.operation||'').toLowerCase().includes(q) ||
      getPlainAction(item.rec.operation, item.rec.category).toLowerCase().includes(q) ||
      (item.rec.explanation||'').toLowerCase().includes(q) ||
      (item.col.column_name||'').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  if (!filtered.length) {
    area.innerHTML = '<div class="fe-no-results">No suggestions match your filter. Try a different category or search term.</div>';
    return;
  }

  // Group by outcome category, then by column
  const byGroup = {};
  filtered.forEach(item => {
    const group = getGroupForRec(item.rec);
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group].push(item);
  });

  // Order groups
  const groupOrder = ['prepare_categories', 'improve_numeric', 'create_features', 'select_features', 'reduce_complexity'];

  let html = '';
  for (const groupKey of groupOrder) {
    const items = byGroup[groupKey];
    if (!items || !items.length) continue;
    const groupInfo = FE_GROUPS[groupKey];
    html += `
      <div class="fe-group-section">
        <div class="fe-group-header">
          <span class="fe-group-icon">${groupInfo.icon}</span>
          <div>
            <div class="fe-group-title">${groupInfo.label}</div>
            <div class="fe-group-desc">${groupInfo.desc}</div>
          </div>
          <span class="fe-group-count">${items.length}</span>
        </div>
        <div class="fe-group-cards">
          ${items.map(item => renderPlainRecCard(item)).join('')}
        </div>
      </div>`;
  }

  area.innerHTML = html || '<div class="fe-no-results">No suggestions match your filter.</div>';
}

function renderPlainRecCard({ col, ci, rec, ri, key }) {
  const isSelected = !!feSelections[key];
  const plainAction = getPlainAction(rec.operation, rec.category);
  const group       = getGroupForRec(rec);
  const groupIcon   = getIconForGroup(group);
  const safeLevel   = getSafeLevel(rec);
  const conf        = { high: 90, medium: 62, low: 38 }[rec.priority || 'low'] || 38;
  const risk        = getRiskLevel(rec);
  const accuracyStars = getAccuracyImpact(rec);
  const complexityStars = getComplexityImpact(rec);
  const benefits    = buildBenefits(rec);
  const whyReasons  = buildWhyReasons(col, rec);

  const safeLabelMap = {
    safe:     { label: 'Recommended', cls: 'safe',     icon: '✦' },
    caution:  { label: 'Review First', cls: 'caution',  icon: '⚠' },
    advanced: { label: 'Advanced',     cls: 'advanced', icon: '🔬' },
  };
  const safeInfo = safeLabelMap[safeLevel] || safeLabelMap.safe;

  // Plain-English column type
  const stats = col.column_stats || {};
  const dtypeHuman = {
    numeric:     'Number column',
    categorical: 'Text/Category column',
    datetime:    'Date/Time column',
    geo:         'Location column',
    other:       'Column',
  }[stats.dtype || 'other'] || 'Column';

  const colSummary = stats.cardinality
    ? `${dtypeHuman} · ${stats.cardinality.toLocaleString()} unique values`
    : dtypeHuman;

  return `
  <div class="fe-rec-card ${isSelected ? 'selected' : ''} safe-${safeLevel}" id="recv2-${key}" onclick="toggleFERecV2('${key}',${ci},${ri})">

    <!-- Card top: badge + action headline -->
    <div class="fe-rec-top">
      <div class="fe-rec-badge-row">
        <span class="fe-rec-safe-badge ${safeInfo.cls}">${safeInfo.icon} ${safeInfo.label}</span>
        <span class="fe-rec-col-tag">${esc(col.column_name)}</span>
        <span class="fe-rec-col-type">${esc(colSummary)}</span>
      </div>
      <div class="fe-rec-header-row">
        <div class="fe-rec-checkbox ${isSelected ? 'checked' : ''}">${isSelected ? '✓' : ''}</div>
        <div class="fe-rec-action">${groupIcon} ${plainAction}</div>
      </div>
    </div>

    <!-- Why recommended -->
    <div class="fe-rec-body">
      <div class="fe-rec-section">
        <div class="fe-rec-section-label">Why this is recommended:</div>
        <div class="fe-rec-explanation">${esc(rec.explanation || 'This transformation is recommended based on your column\'s characteristics.')}</div>
      </div>

      <!-- Benefit pills -->
      <div class="fe-rec-benefits">
        ${benefits.slice(0,3).map(b => `<div class="fe-rec-benefit">${b.icon} ${esc(b.text)}</div>`).join('')}
      </div>

      <!-- Impact indicators -->
      <div class="fe-rec-impact-row">
        <div class="fe-rec-impact-item">
          <div class="fe-rec-impact-label">Accuracy</div>
          <div class="fe-rec-stars">${renderStars(accuracyStars)}</div>
        </div>
        <div class="fe-rec-impact-item">
          <div class="fe-rec-impact-label">Complexity</div>
          <div class="fe-rec-stars">${renderStars(complexityStars)}</div>
        </div>
        <div class="fe-rec-impact-item">
          <div class="fe-rec-impact-label">Risk</div>
          <div class="fe-rec-stars risk-stars">${renderStars(risk.stars)}</div>
        </div>
        <div class="fe-rec-confidence">
          <div class="fe-rec-conf-bar-outer">
            <div class="fe-rec-conf-bar-fill" style="width:${conf}%"></div>
          </div>
          <div class="fe-rec-conf-label">Confidence: ${conf}%</div>
        </div>
      </div>

      <!-- Why am I seeing this? (expandable) -->
      <div class="fe-rec-why-section">
        <button class="fe-rec-why-toggle" onclick="event.stopPropagation();toggleWhySection('why-${key}')">
          <span class="fe-why-arrow">▶</span> Why am I seeing this?
        </button>
        <div class="fe-rec-why-list" id="why-${key}" style="display:none">
          ${whyReasons.map(r => `<div class="fe-why-item">• ${esc(r)}</div>`).join('')}
        </div>
      </div>

      <!-- Learn more (advanced details — expandable) -->
      <div class="fe-rec-learn-section">
        <button class="fe-rec-learn-toggle" onclick="event.stopPropagation();toggleLearnMore('learn-${key}')">
          <span class="fe-learn-arrow">▶</span> View technical details
        </button>
        <div class="fe-rec-learn-body" id="learn-${key}" style="display:none">
          <div class="fe-learn-grid">
            <div class="fe-learn-row"><span class="fe-learn-key">Technique</span><span class="fe-learn-val fe-learn-mono">${esc(rec.operation || '—')}</span></div>
            ${rec.sklearn_class ? `<div class="fe-learn-row"><span class="fe-learn-key">Library class</span><span class="fe-learn-val fe-learn-mono">${esc(rec.sklearn_class)}</span></div>` : ''}
            <div class="fe-learn-row"><span class="fe-learn-key">Risk level</span><span class="fe-learn-val risk-${risk.level}">${risk.label}</span></div>
            <div class="fe-learn-row"><span class="fe-learn-key">Confidence</span><span class="fe-learn-val">${conf}%</span></div>
            ${rec.when_to_apply ? `<div class="fe-learn-row"><span class="fe-learn-key">When to use</span><span class="fe-learn-val">${esc(rec.when_to_apply)}</span></div>` : ''}
            ${rec.expected_benefit ? `<div class="fe-learn-row"><span class="fe-learn-key">Expected benefit</span><span class="fe-learn-val">${esc(rec.expected_benefit)}</span></div>` : ''}
            ${rec.source_reference ? `<div class="fe-learn-row"><span class="fe-learn-key">Source</span><span class="fe-learn-val">${esc(rec.source_reference)}</span></div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Card footer: actions -->
    <div class="fe-rec-footer">
      <button class="fe-rec-apply-btn ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation();toggleFERecV2('${key}',${ci},${ri})">
        ${isSelected ? '✓ Added to pipeline' : '+ Add to pipeline'}
      </button>
    </div>

  </div>`;
}

function toggleWhySection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const btn = el.previousElementSibling;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.querySelector('.fe-why-arrow').textContent = isOpen ? '▶' : '▼';
}

function toggleLearnMore(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const btn = el.previousElementSibling;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.querySelector('.fe-learn-arrow').textContent = isOpen ? '▶' : '▼';
}

function toggleFERecV2(key, colIdx, recIdx) {
  const col = feResultsData.columns[colIdx];
  const rec = (col.recommendations || [])[recIdx];
  if (!rec) return;
  if (feSelections[key]) {
    delete feSelections[key];
  } else {
    feSelections[key] = {
      column_name:   col.column_name,
      operation:     rec.operation     || '',
      sklearn_class: rec.sklearn_class || '',
      paired_cols:   col.column_stats?.paired_cols || [],
    };
  }
  // Re-render the single card
  const cardEl = document.getElementById('recv2-' + key);
  if (cardEl) {
    const newHtml = renderPlainRecCard({ col, ci: colIdx, rec, ri: recIdx, key });
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    cardEl.replaceWith(tmp.firstElementChild);
  }
  updateFESelCountNew();
  updateFEPipeline();
}

function toggleFERec(key, colIdx, recIdx) { toggleFERecV2(key, colIdx, recIdx); }

function switchFETab(cat) {
  feActiveCat = cat;
  document.querySelectorAll('.fe-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  const q = document.getElementById('feSearchInput')?.value || '';
  renderFEResultsArea(feResultsData, buildAllCards(), cat, q);
}

function filterFERecs() {
  const q = document.getElementById('feSearchInput').value;
  renderFEResultsArea(feResultsData, buildAllCards(), feActiveCat, q);
}

function buildAllCards() {
  const cards = [];
  (feResultsData?.columns || []).forEach((col, ci) => {
    (col.recommendations || []).forEach((rec, ri) => {
      cards.push({ col, ci, rec, ri, key: `${ci}-${ri}` });
    });
  });
  return cards;
}

function feSelectAll() {
  feSelections = {};
  buildAllCards().forEach(({ col, rec, key }) => {
    feSelections[key] = {
      column_name:   col.column_name,
      operation:     rec.operation     || '',
      sklearn_class: rec.sklearn_class || '',
      paired_cols:   col.column_stats?.paired_cols || [],
    };
  });
  renderFEResultsArea(feResultsData, buildAllCards(), feActiveCat, document.getElementById('feSearchInput')?.value || '');
  updateFESelCountNew(); updateFEPipeline();
}

function feSelectSafeOnly() {
  feSelections = {};
  buildAllCards().forEach(({ col, rec, key }) => {
    if (getSafeLevel(rec) === 'safe') {
      feSelections[key] = {
        column_name:   col.column_name,
        operation:     rec.operation     || '',
        sklearn_class: rec.sklearn_class || '',
        paired_cols:   col.column_stats?.paired_cols || [],
      };
    }
  });
  renderFEResultsArea(feResultsData, buildAllCards(), feActiveCat, document.getElementById('feSearchInput')?.value || '');
  updateFESelCountNew(); updateFEPipeline();
}

function feSelectNone() {
  feSelections = {};
  renderFEResultsArea(feResultsData, buildAllCards(), feActiveCat, document.getElementById('feSearchInput')?.value || '');
  updateFESelCountNew(); updateFEPipeline();
}

// Keep legacy compat
function feSelectHighOnly() {
  feSelections = {};
  buildAllCards().forEach(({ col, rec, key }) => {
    if ((rec.priority || '') === 'high') {
      feSelections[key] = {
        column_name:   col.column_name,
        operation:     rec.operation     || '',
        sklearn_class: rec.sklearn_class || '',
        paired_cols:   col.column_stats?.paired_cols || [],
      };
    }
  });
  renderFEResultsArea(feResultsData, buildAllCards(), feActiveCat, '');
  updateFESelCountNew(); updateFEPipeline();
}

function updateFESelCountNew() {
  const n   = Object.keys(feSelections).length;
  const el  = document.getElementById('feSelCountNew');
  if (el) el.textContent = n;
  const btn = document.getElementById('feApplyBtnNew');
  if (btn) btn.disabled = n === 0;

  const cats = {};
  Object.values(feSelections).forEach(s => {
    const card = buildAllCards().find(c => c.col.column_name === s.column_name && c.rec.operation === s.operation);
    const g    = card ? getGroupForRec(card.rec) : 'other';
    const label = FE_GROUPS[g]?.label || g;
    cats[label] = (cats[label] || 0) + 1;
  });
  const statsEl = document.getElementById('feCatSelStats');
  if (statsEl) {
    if (!Object.keys(cats).length) { statsEl.innerHTML = ''; return; }
    statsEl.innerHTML = Object.entries(cats).map(([c, n]) =>
      `<span style="font-size:.68rem;color:var(--muted)">${n} <span style="color:var(--text)">${c}</span></span>`
    ).join('<span style="color:var(--border)"> · </span>');
  }
}

function updateFESelCount() { updateFESelCountNew(); }

function updateFEPipeline() {
  const ops = document.getElementById('fePipelineOps');
  if (!ops) return;
  const vals = Object.entries(feSelections);
  if (!vals.length) {
    ops.innerHTML = '<span class="fe-pipeline-empty">No operations selected yet — add recommendations above</span>';
    return;
  }
  ops.innerHTML = vals.map(([key, sel]) =>
    `<span class="fe-pipeline-chip">
      ${getPlainAction(sel.operation, '')} · <em>${esc(sel.column_name)}</em>
      <button class="rm-chip" onclick="event.stopPropagation();removePipelineOp('${key}')">&#x2715;</button>
    </span>`
  ).join('');
}

function removePipelineOp(key) {
  delete feSelections[key];
  const el = document.getElementById('recv2-' + key);
  if (el) el.classList.remove('selected');
  updateFESelCountNew(); updateFEPipeline();
  // Refresh card display
  if (feResultsData) {
    renderFEResultsArea(feResultsData, buildAllCards(), feActiveCat, document.getElementById('feSearchInput')?.value || '');
  }
}

async function applyFESelections() {
  const ops = Object.values(feSelections);
  if (!ops.length) return;
  const blob     = feSource === 'auto' ? currentAutoBlob     : currentReviewBlob;
  const filename = feSource === 'auto' ? currentAutoFilename : currentReviewFilename;
  if (!blob) { alert('No cleaned file available.'); return; }

  const applyBtn = document.getElementById('feApplyBtnNew');
  applyBtn.disabled    = true;
  applyBtn.textContent = '⏳ Applying…';

  try {
    const file = new File([blob], filename, { type: 'text/csv' });
    const fd   = new FormData();
    fd.append('file', file);
    fd.append('selections', JSON.stringify(ops));
    const res  = await authFetch('/apply_features', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `Server error ${res.status}`);
    showFEApplyModal(json);
  } catch(e) {
    alert('Apply failed: ' + e.message);
  } finally {
    applyBtn.disabled = false;
    applyBtn.innerHTML = '⚙ Apply &amp; Download';
    updateFESelCountNew();
  }
}

function showFEApplyModal(data) {
  const body = document.getElementById('feApplyModalBody');
  const dl   = document.getElementById('feApplyDownloadBtn');
  const csvBlob = b64toBlob(data.transformed_csv, 'text/csv');
  const url  = URL.createObjectURL(csvBlob);
  const safe = (data.filename || 'data').replace(/\.(csv|xlsx|xls)$/i, '');
  dl.href = url; dl.download = safe + '_fe_transformed.csv';

  let html = `<div class="fe-stat-row">
    <div class="fe-stat-box"><div class="fe-stat-num">${data.applied?.length||0}</div><div class="fe-stat-lbl">Applied</div></div>
    <div class="fe-stat-box"><div class="fe-stat-num" style="color:var(--warn)">${data.skipped?.length||0}</div><div class="fe-stat-lbl">Skipped</div></div>
    <div class="fe-stat-box"><div class="fe-stat-num" style="color:var(--danger)">${data.errors?.length||0}</div><div class="fe-stat-lbl">Errors</div></div>
    <div class="fe-stat-box"><div class="fe-stat-num" style="color:var(--info)">${data.original_cols||0} &#x2192; ${data.final_cols||0}</div><div class="fe-stat-lbl">Columns</div></div>
  </div>`;
  if (data.applied?.length) {
    html += `<div class="fe-result-section"><div class="fe-result-section-title">✅ Applied (${data.applied.length})</div>
      ${data.applied.map(a=>`<div class="fe-result-item applied"><strong>${esc(getPlainAction(a.column,''))}</strong> on <em>${esc(a.column)}</em> — ${esc(a.message)}</div>`).join('')}</div>`;
  }
  if (data.skipped?.length) {
    html += `<div class="fe-result-section"><div class="fe-result-section-title">⚠ Skipped (${data.skipped.length})</div>
      ${data.skipped.map(s=>`<div class="fe-result-item skipped"><strong>${esc(s.column)}</strong> — ${esc(s.reason)}</div>`).join('')}</div>`;
  }
  if (data.errors?.length) {
    html += `<div class="fe-result-section"><div class="fe-result-section-title">✕ Errors (${data.errors.length})</div>
      ${data.errors.map(e=>`<div class="fe-result-item errored"><strong>${esc(e.column)}</strong> — ${esc(e.error)}</div>`).join('')}</div>`;
  }
  body.innerHTML = html;
  document.getElementById('feApplyOverlay').classList.add('visible');
}

function closeFEApplyModal() { document.getElementById('feApplyOverlay').classList.remove('visible'); }
document.getElementById('feApplyOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeFEApplyModal();
});

function toggleColCard(i) {
  const body = document.getElementById('colBody' + i);
  const chev = document.getElementById('colChev' + i);
  if (body && chev) { const open = body.classList.toggle('open'); chev.classList.toggle('open', open); }
}
function toggleColCard(i) {
  const body = document.getElementById('colBody' + i);
  const chev = document.getElementById('colChev' + i);
  if (body && chev) { const open = body.classList.toggle('open'); chev.classList.toggle('open', open); }
}

/* ────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */
function setLoading(on, label) {
  document.getElementById('actionBtn').disabled = on;
  document.getElementById('spinner').classList.toggle('visible', on);
  if (label) document.getElementById('spinnerLabel').innerHTML = label;
}
function showError(msg) {
  const b = document.getElementById('errorBanner');
  b.textContent = msg; b.style.display = 'block'; b.classList.add('visible');
}
function hideError() {
  const b = document.getElementById('errorBanner');
  b.style.display = 'none'; b.classList.remove('visible');
}
function hideResults() { document.getElementById('results').style.display = 'none'; }
function esc(str)      { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function b64toBlob(b64, type) {
  const bytes = atob(b64); const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

/* ================================================================
   DATA QUALITY DASHBOARD — Client-Side Profiler
   Runs entirely in the browser after file upload.
   No extra API endpoint needed.
================================================================ */

/* ── CSV/XLSX parser ──────────────────────────────────────── */
function parseUploadedFile(file) {
  return new Promise((resolve, reject) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = e => {
        try { resolve(parseCSVToRows(e.target.result)); }
        catch(err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    } else {
      // Excel: read as ArrayBuffer, parse with basic heuristic
      const reader = new FileReader();
      reader.onload = e => {
        // We can't parse xlsx without a library in pure JS.
        // Return a signal so the caller knows to skip dashboard.
        resolve(null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    }
  });
}

function parseCSVToRows(text) {
  const raw = text.trim().split('\n');
  if (!raw.length) return { headers: [], rows: [] };
  const headers = parseCSVLine(raw[0]);
  const rows = [];
  for (let i = 1; i < Math.min(raw.length, 5001); i++) {
    if (raw[i].trim()) rows.push(parseCSVLine(raw[i]));
  }
  return { headers, rows, totalLines: raw.length - 1 };
}

/* ── Enrich column stats with sample values + top values ─── */
function enrichColStatsForChat(colStats, headers, rows) {
  return colStats.map((col, ci) => {
    const vals    = rows.map(r => r[ci] ?? '').filter(v => v !== '' && v !== null);
    const samples = vals.slice(0, 5);

    // Top 5 most frequent values with counts
    const freq = {};
    vals.slice(0, 2000).forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const topValues = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([val, count]) => ({ val, count }));

    // Numeric stats
    let min, max, mean, median;
    if (col.dtype === 'numeric') {
      const nums = vals.map(v => Number(String(v).replace(/,/g,''))).filter(n => !isNaN(n));
      if (nums.length) {
        min    = Math.min(...nums);
        max    = Math.max(...nums);
        mean   = Math.round((nums.reduce((a,b) => a+b, 0) / nums.length) * 100) / 100;
        const sorted = [...nums].sort((a,b) => a-b);
        median = sorted[Math.floor(sorted.length / 2)];
      }
    }

    return { ...col, samples, topValues, min, max, mean, median };
  });
}

/* ── Core profiling logic ─────────────────────────────────── */
function profileDataset(headers, rows, totalLines) {
  const nRows = totalLines || rows.length;
  const nCols = headers.length;
  const sample = rows; // up to 5000

  // Per-column analysis
  const colStats = headers.map((h, ci) => {
    const vals = sample.map(r => r[ci] ?? '');

    // Missing
    const missing = vals.filter(v => v === '' || v === null || v === undefined ||
      v.toLowerCase() === 'null' || v.toLowerCase() === 'na' ||
      v.toLowerCase() === 'n/a' || v.toLowerCase() === 'nan' ||
      v.toLowerCase() === 'none' || v === '#n/a').length;

    // Type detection
    const nonEmpty = vals.filter(v => v !== '' && v !== null && v !== undefined);
    let numericCount = 0, dateCount = 0;
    const unique = new Set();
    let whitespaceCount = 0;

    nonEmpty.forEach(v => {
      unique.add(v);
      if (!isNaN(Number(v.replace(/,/g, '')))) numericCount++;
      if (/^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/.test(v) ||
          /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v)) dateCount++;
      if (v !== v.trim()) whitespaceCount++;
    });

    const isNumeric  = nonEmpty.length > 0 && numericCount / nonEmpty.length > 0.85;
    const isDate     = !isNumeric && nonEmpty.length > 0 && dateCount / nonEmpty.length > 0.6;
    const dtype      = isNumeric ? 'numeric' : isDate ? 'datetime' : 'categorical';
    const cardinality = unique.size;
    const isConstant  = cardinality <= 1 && nonEmpty.length > 0;
    const isHighCard  = dtype === 'categorical' && cardinality > nRows * 0.9 && nRows > 50;

    // Outlier detection for numeric
    let hasOutliers = false;
    if (isNumeric && nonEmpty.length >= 10) {
      const nums = nonEmpty.map(v => Number(v.replace(/,/g, ''))).filter(n => !isNaN(n)).sort((a,b) => a-b);
      const q1 = nums[Math.floor(nums.length * 0.25)];
      const q3 = nums[Math.floor(nums.length * 0.75)];
      const iqr = q3 - q1;
      if (iqr > 0) hasOutliers = nums.some(n => n < q1 - 1.5*iqr || n > q3 + 1.5*iqr);
    }

    // Formatting issues: mixed types in a mostly-numeric or mostly-categorical column
    const mixedTypes = nonEmpty.length > 5 &&
      numericCount > 0 && numericCount < nonEmpty.length * 0.85 &&
      numericCount > nonEmpty.length * 0.1;

    return {
      name: h, dtype, missing, missingPct: nRows > 0 ? missing / nRows : 0,
      cardinality, isConstant, isHighCard, hasOutliers, whitespaceCount,
      mixedTypes, nonEmptyCount: nonEmpty.length,
    };
  });

  // Dataset-level metrics
  const totalMissingCells = colStats.reduce((a, c) => a + c.missing, 0);
  const missingPct = (nRows * nCols) > 0 ? totalMissingCells / (nRows * nCols) : 0;

  // Duplicate detection (sample-based key hash)
  const seen = new Set();
  let dupCount = 0;
  sample.forEach(r => {
    const key = r.join('|||');
    if (seen.has(key)) dupCount++;
    else seen.add(key);
  });
  // Scale to full dataset if we sampled
  const dupPct = sample.length > 0 ? dupCount / sample.length : 0;
  const estimatedDupes = Math.round(dupPct * nRows);

  const formatCols  = colStats.filter(c => c.whitespaceCount > 2 || c.mixedTypes);
  const outlierCols = colStats.filter(c => c.hasOutliers);
  const constantCols= colStats.filter(c => c.isConstant);
  const numericCols = colStats.filter(c => c.dtype === 'numeric');
  const catCols     = colStats.filter(c => c.dtype === 'categorical');
  const missingCols = colStats.filter(c => c.missing > 0);
  const highCardCols= colStats.filter(c => c.isHighCard);
  const mixedCols   = colStats.filter(c => c.mixedTypes);

  const formatPct   = nCols > 0 ? formatCols.length / nCols : 0;
  const outlierPct  = nCols > 0 ? outlierCols.length / nCols : 0;
  const constantPct = nCols > 0 ? constantCols.length / nCols : 0;

  // ── Health Score calculation ──────────────────────────────
  let score = 100;
  // Missing values: up to -30
  score -= Math.min(30, missingPct * 120);
  // Duplicates: up to -15
  score -= Math.min(15, dupPct * 60);
  // Formatting: up to -15
  score -= Math.min(15, formatPct * 40);
  // Outliers: up to -10
  score -= Math.min(10, outlierPct * 25);
  // Constant columns: up to -8
  score -= Math.min(8, constantPct * 30);
  // High cardinality: up to -5
  score -= Math.min(5, highCardCols.length * 1.5);
  // Mixed types: up to -7
  score -= Math.min(7, mixedCols.length * 2);
  score = Math.max(0, Math.round(score));

  // Expected score after cleaning (optimistic)
  let expectedScore = score;
  expectedScore += Math.min(25, missingPct * 100);
  expectedScore += Math.min(12, dupPct * 50);
  expectedScore += Math.min(10, formatPct * 30);
  expectedScore = Math.min(98, Math.round(expectedScore));

  return {
    nRows, nCols, totalMissingCells,
    missingPct, dupPct, estimatedDupes,
    formatPct, outlierPct, constantPct,
    missingCols, formatCols, outlierCols, constantCols,
    numericCols, catCols, mixedCols, highCardCols,
    colStats, score, expectedScore,
  };
}

/* ── Score labels / colors ────────────────────────────────── */
function getScoreInfo(score) {
  if (score >= 90) return { label: 'Excellent', sub: 'Your data is in great shape', color: 'var(--success)', cls: 'excellent' };
  if (score >= 70) return { label: 'Good',      sub: 'Minor issues detected',        color: 'var(--info)',    cls: 'good' };
  if (score >= 50) return { label: 'Fair',       sub: 'Cleaning recommended',         color: 'var(--warn)',    cls: 'fair' };
  return             { label: 'Poor',      sub: 'Significant cleaning needed',  color: 'var(--danger)',  cls: 'poor' };
}

function getCategoryBadge(pct, thresholds = [0.02, 0.10, 0.25]) {
  if (pct <= thresholds[0]) return { label: 'Excellent', cls: 'badge-excellent' };
  if (pct <= thresholds[1]) return { label: 'Good',      cls: 'badge-good' };
  if (pct <= thresholds[2]) return { label: 'Fair',      cls: 'badge-fair' };
  return                     { label: 'Poor',      cls: 'badge-poor' };
}

function getBarColor(pct, thresholds = [0.05, 0.15, 0.30]) {
  if (pct <= thresholds[0]) return 'var(--success)';
  if (pct <= thresholds[1]) return 'var(--warn)';
  return 'var(--danger)';
}

/* ── Build human-readable issues list ────────────────────── */
function buildIssues(p) {
  const issues = [];
  if (p.missingCols.length)
    issues.push({ sev: p.missingPct > 0.15 ? 'high' : 'med',
      text: `${p.missingCols.length} column${p.missingCols.length > 1 ? 's' : ''} contain missing values (${Math.round(p.missingPct * 100)}% of cells overall)` });
  if (p.estimatedDupes > 0)
    issues.push({ sev: p.dupPct > 0.05 ? 'high' : 'med',
      text: `~${p.estimatedDupes.toLocaleString()} duplicate row${p.estimatedDupes > 1 ? 's' : ''} detected (${Math.round(p.dupPct * 100)}% of dataset)` });
  if (p.formatCols.length)
    issues.push({ sev: p.formatPct > 0.2 ? 'high' : 'med',
      text: `${p.formatCols.length} column${p.formatCols.length > 1 ? 's' : ''} have inconsistent formatting or whitespace` });
  if (p.outlierCols.length)
    issues.push({ sev: 'low',
      text: `${p.outlierCols.length} numeric column${p.outlierCols.length > 1 ? 's' : ''} contain potential outliers` });
  if (p.constantCols.length)
    issues.push({ sev: 'low',
      text: `${p.constantCols.length} column${p.constantCols.length > 1 ? 's' : ''} have only one unique value and add no information` });
  if (p.mixedCols.length)
    issues.push({ sev: 'med',
      text: `${p.mixedCols.length} column${p.mixedCols.length > 1 ? 's' : ''} contain mixed data types (numbers mixed with text)` });
  if (p.highCardCols.length)
    issues.push({ sev: 'low',
      text: `${p.highCardCols.length} text column${p.highCardCols.length > 1 ? 's' : ''} have nearly unique values per row (possible ID columns)` });
  if (!issues.length)
    issues.push({ sev: 'ok', text: 'No significant issues detected — your data looks clean!' });
  return issues;
}

/* ── Plain-English AI summary ─────────────────────────────── */
function buildAiSummary(p) {
  const si = getScoreInfo(p.score);
  let s = `Your dataset is in <strong>${si.label.toLowerCase()}</strong> condition`;
  if (p.nRows > 0) s += ` with ${p.nRows.toLocaleString()} rows and ${p.nCols} columns`;
  s += '. ';

  const problems = [];
  if (p.missingPct > 0.02)
    problems.push(`missing values in ${p.missingCols.length} column${p.missingCols.length > 1 ? 's' : ''}`);
  if (p.dupPct > 0.01)
    problems.push(`${p.estimatedDupes.toLocaleString()} duplicate row${p.estimatedDupes > 1 ? 's' : ''}`);
  if (p.formatPct > 0.05)
    problems.push('formatting inconsistencies');
  if (p.outlierCols.length)
    problems.push('extreme values in numeric columns');

  if (problems.length) {
    s += `The main issues are ${problems.slice(0, -1).join(', ')}${problems.length > 1 ? ' and ' : ''}${problems[problems.length - 1]}. `;
  }

  if (p.score < 50)
    s += 'Cleaning is <strong>strongly recommended</strong> before using this data for analysis or machine learning.';
  else if (p.score < 75)
    s += 'Cleaning will <strong>significantly improve</strong> data quality and model performance.';
  else if (p.score < 90)
    s += 'A quick clean will make this data <strong>fully ready</strong> for machine learning.';
  else
    s += 'This dataset is <strong>already in good shape</strong> — cleaning will apply final polish.';

  return s;
}

/* ── Animate a number counting up ────────────────────────── */
function animateNumber(el, target, duration = 700, suffix = '') {
  const start = performance.now();
  const from  = 0;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (target - from) * ease) + suffix;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = target + suffix;
  }
  requestAnimationFrame(tick);
}

/* ── Animate ring ─────────────────────────────────────────── */
function animateRing(score, color) {
  const track = document.getElementById('dqRingTrack');
  if (!track) return;
  const circumference = 314;
  track.style.stroke = color;
  const targetOffset = circumference - (score / 100) * circumference;
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min(1, (ts - start) / 900);
    const ease = 1 - Math.pow(1 - p, 3);
    const offset = circumference - ease * (circumference - targetOffset);
    track.style.strokeDashoffset = offset;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Animate progress bar ─────────────────────────────────── */
function animateBar(el, pct, color, delay = 0) {
  setTimeout(() => {
    el.style.transition = 'width 0.8s cubic-bezier(0.4,0,0.2,1)';
    el.style.background = color;
    el.style.width = Math.min(100, Math.round(pct * 100)) + '%';
  }, delay);
}

/* ── Main render function ─────────────────────────────────── */
function renderQualityDashboard(profile, filename) {
  const dash  = document.getElementById('qualityDashboard');
  const si    = getScoreInfo(profile.score);

  // Show dashboard
  dash.style.display = 'block';
  dash.style.opacity = '0';
  dash.style.transform = 'translateY(12px)';
  requestAnimationFrame(() => {
    dash.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    dash.style.opacity = '1';
    dash.style.transform = 'translateY(0)';
  });

  // Header
  document.getElementById('dqFilename').textContent = filename;
  document.getElementById('dqAnalyzing').style.display = 'none';

  // ── 1. Score ring ──────────────────────────────────────────
  const scoreNumEl = document.getElementById('dqScoreNum');
  animateNumber(scoreNumEl, profile.score, 800);
  animateRing(profile.score, si.color);
  document.getElementById('dqScoreLabel').textContent = si.label;
  document.getElementById('dqScoreLabel').style.color = si.color;
  document.getElementById('dqScoreSub').textContent   = si.sub;

  // ── 2. Snapshot ───────────────────────────────────────────
  document.getElementById('snapRows').textContent    = profile.nRows.toLocaleString();
  document.getElementById('snapCols').textContent    = profile.nCols;
  document.getElementById('snapMissing').textContent = profile.totalMissingCells.toLocaleString();
  document.getElementById('snapDupes').textContent   = profile.estimatedDupes.toLocaleString();
  document.getElementById('snapNumeric').textContent = profile.numericCols.length;
  document.getElementById('snapCatCols').textContent = profile.catCols.length;

  // ── 3. Categories ─────────────────────────────────────────
  const cats = [
    { name: 'Missing Values', pct: profile.missingPct,  thresh: [0.01, 0.10, 0.25] },
    { name: 'Duplicates',     pct: profile.dupPct,      thresh: [0.01, 0.05, 0.15] },
    { name: 'Formatting',     pct: profile.formatPct,   thresh: [0.05, 0.20, 0.40] },
    { name: 'Outliers',       pct: profile.outlierPct,  thresh: [0.05, 0.20, 0.50] },
    { name: 'Data Types',     pct: profile.mixedCols.length / Math.max(1, profile.nCols), thresh: [0.02, 0.10, 0.30] },
  ];
  document.getElementById('dqCatList').innerHTML = cats.map(cat => {
    const b = getCategoryBadge(cat.pct, cat.thresh);
    return `<div class="dq-cat-row">
      <div class="dq-cat-name">${cat.name}</div>
      <div class="dq-cat-badge ${b.cls}">${b.label}</div>
    </div>`;
  }).join('');

  // ── 4. Breakdown bars ──────────────────────────────────────
  const bars = [
    { fillId: 'barMissing',  pctId: 'pctMissing',  pct: profile.missingPct,  thresh: [0.05, 0.15, 0.30] },
    { fillId: 'barDupes',    pctId: 'pctDupes',    pct: profile.dupPct,      thresh: [0.01, 0.05, 0.15] },
    { fillId: 'barFormat',   pctId: 'pctFormat',   pct: profile.formatPct,   thresh: [0.05, 0.20, 0.40] },
    { fillId: 'barOutliers', pctId: 'pctOutliers', pct: profile.outlierPct,  thresh: [0.10, 0.25, 0.50] },
    { fillId: 'barConstant', pctId: 'pctConstant', pct: profile.constantPct, thresh: [0.02, 0.10, 0.30] },
  ];
  bars.forEach((b, i) => {
    const pctEl = document.getElementById(b.pctId);
    const fillEl = document.getElementById(b.fillId);
    if (pctEl) pctEl.textContent = Math.round(b.pct * 100) + '%';
    if (fillEl) animateBar(fillEl, b.pct, getBarColor(b.pct, b.thresh), 100 + i * 80);
  });

  // ── 5. Issues list ────────────────────────────────────────
  const issues = buildIssues(profile);
  const sevIcon = { high: '🔴', med: '🟡', low: '🔵', ok: '🟢' };
  document.getElementById('dqIssuesList').innerHTML = issues.map(iss =>
    `<div class="dq-issue-item sev-${iss.sev}">
      <span class="dq-issue-icon">${sevIcon[iss.sev] || '⚠'}</span>
      <span class="dq-issue-text">${esc(iss.text)}</span>
    </div>`
  ).join('');

  // ── 6. AI summary ─────────────────────────────────────────
  document.getElementById('dqAiSummary').innerHTML = buildAiSummary(profile);

  // ── 7. Improvement preview ────────────────────────────────
  const improveWrap = document.getElementById('dqImproveWrap');
  document.getElementById('dqImproveFrom').textContent = profile.score + '/100';
  document.getElementById('dqImproveTo').textContent   = profile.expectedScore + '/100';
  setTimeout(() => {
    improveWrap.style.transition = 'opacity 0.6s ease';
    improveWrap.style.opacity = '1';
    const fromBar  = document.getElementById('dqImproveBarFrom');
    const gainBar  = document.getElementById('dqImproveBarGain');
    if (fromBar) {
      fromBar.style.transition = 'width 0.9s cubic-bezier(0.4,0,0.2,1)';
      fromBar.style.width = profile.score + '%';
    }
    if (gainBar) {
      gainBar.style.transition = 'width 0.9s cubic-bezier(0.4,0,0.2,1) 0.2s';
      gainBar.style.width = (profile.expectedScore - profile.score) + '%';
    }
  }, 400);

  // ── 8. CTA strip ─────────────────────────────────────────
  const ctaStrip = document.getElementById('dqCtaStrip');
  const ctaIcon  = document.getElementById('dqCtaIcon');
  const ctaTitle = document.getElementById('dqCtaTitle');
  const ctaSub   = document.getElementById('dqCtaSub');
  if (profile.score >= 90) {
    ctaIcon.textContent  = '✅';
    ctaTitle.textContent = 'Your data looks great!';
    ctaSub.textContent   = 'A final clean will apply any remaining polish.';
  } else if (profile.score >= 70) {
    ctaIcon.textContent  = '🔵';
    ctaTitle.textContent = 'A few issues to fix';
    ctaSub.textContent   = 'Cleaning will make this dataset ready for machine learning.';
  } else {
    ctaIcon.textContent  = '⚠';
    ctaTitle.textContent = 'Cleaning recommended';
    ctaSub.textContent   = 'Several issues were found. Run the cleaner to fix them automatically.';
  }
  setTimeout(() => {
    ctaStrip.style.transition = 'opacity 0.5s ease';
    ctaStrip.style.opacity = '1';
  }, 600);
  // Notify chat assistant with fresh profile
  if (typeof notifyChatAfterProfile === 'function') notifyChatAfterProfile(profile);
}

/* dashboard hooks inlined into setFile/resetUpload above */

async function runQualityDashboard(f) {
  // Show skeleton immediately
  const dash = document.getElementById('qualityDashboard');
  if (dash) dash.style.display = 'block';

  try {
    const parsed = await parseUploadedFile(f);
    if (!parsed) {
      // Excel file — skip dashboard (we can't parse xlsx client-side without lib)
      dash.style.display = 'none';
      return;
    }
    const { headers, rows, totalLines } = parsed;
    if (!headers.length) { dash.style.display = 'none'; return; }
    const profile = profileDataset(headers, rows, totalLines);
    // Store enriched column stats + sample rows for chat context
    chatState.dataHeaders    = headers;
    chatState.dataSampleRows = rows.slice(0, 20);  // first 20 rows for chat
    chatState.enrichedCols   = enrichColStatsForChat(profile.colStats, headers, rows);
    renderQualityDashboard(profile, f.name);
  } catch(e) {
    console.warn('Quality dashboard error:', e);
    if (dash) dash.style.display = 'none';
  }
}



/* ================================================================
   AI CHAT ASSISTANT — Context-aware dataset Q&A
   Uses Anthropic API via the /v1/messages endpoint.
   All answers are grounded in actual dataset context.
================================================================ */

/* ── Chat state ─────────────────────────────────────────────── */
const chatState = {
  open:     false,
  history:  [],      // [{role, content}]
  typing:   false,
  lastProfiler: null, // last quality dashboard profile
};

/* ── Show FAB once app is visible ───────────────────────────── */
function showChatFab() {
  const fab = document.getElementById('chatFab');
  if (fab) fab.style.display = 'flex';
}

// showChatFab is called directly inside showApp below
if (authToken) showChatFab(); // already logged in on page load

/* ── Context builder — gathers ALL available app state ─────── */
function buildChatContext() {
  const ctx = {
    hasDataset:    !!selectedFile,
    filename:      selectedFile?.name || null,
    fileSize:      selectedFile ? formatFileSize(selectedFile.size) : null,
  };

  // Quality dashboard profile (from client-side profiler)
  if (chatState.lastProfiler) {
    const p = chatState.lastProfiler;
    ctx.qualityScore    = p.score;
    ctx.expectedScore   = p.expectedScore;
    ctx.totalRows       = p.nRows;
    ctx.totalCols       = p.nCols;
    ctx.missingCells    = p.totalMissingCells;
    ctx.missingPct      = Math.round(p.missingPct * 100);
    ctx.duplicateRows   = p.estimatedDupes;
    ctx.duplicatePct    = Math.round(p.dupPct * 100);
    ctx.numericCols     = p.numericCols.map(c => c.name);
    ctx.categoricalCols = p.catCols.map(c => c.name);
    ctx.missingCols     = p.missingCols.map(c => ({ name: c.name, missingPct: Math.round(c.missingPct * 100) }));
    ctx.outlierCols     = p.outlierCols.map(c => c.name);
    ctx.constantCols    = p.constantCols.map(c => c.name);
    ctx.colStats        = p.colStats.map(c => ({
      name:         c.name,
      dtype:        c.dtype,
      cardinality:  c.cardinality,
      missingPct:   Math.round(c.missingPct * 100),
      hasOutliers:  c.hasOutliers,
      isConstant:   c.isConstant,
      isHighCard:   c.isHighCard,
    }));
  }

  // Cleaning results
  if (lastAutoSummary) {
    ctx.cleaningSummary = {
      originalRows:      lastAutoSummary.original_rows,
      finalRows:         lastAutoSummary.final_rows,
      duplicatesRemoved: lastAutoSummary.duplicates_removed,
      whitespaceFixed:   lastAutoSummary.whitespace_fixed,
      nullsFilled:       lastAutoSummary.nulls_filled || {},
      columnsRenamed:    lastAutoSummary.columns_renamed || {},
    };
  }

  // Review mode changes
  if (lastReviewChanges && lastReviewChanges.length) {
    const byType = {};
    lastReviewChanges.forEach(c => { byType[c.type] = (byType[c.type]||0)+1; });
    ctx.reviewChanges = { total: lastReviewChanges.length, byType };
  }

  // Feature engineering recommendations
  if (feResultsData) {
    ctx.feMode    = feResultsData.mode;
    ctx.feTask    = feResultsData.task;
    ctx.feColumns = feResultsData.columns?.map(col => ({
      column:          col.column_name,
      dtype:           col.column_stats?.dtype,
      cardinality:     col.column_stats?.cardinality,
      skewness:        col.column_stats?.skewness,
      hasOutliers:     col.column_stats?.has_outliers,
      missingPct:      col.column_stats?.missing_pct,
      recommendations: col.recommendations?.map(r => ({
        operation:    r.operation,
        plainAction:  getPlainAction(r.operation, r.category),
        category:     r.category,
        priority:     r.priority,
        explanation:  r.explanation,
        safeLevel:    getSafeLevel(r),
      })),
    }));
  }

  // Selected FE operations
  if (Object.keys(feSelections).length) {
    ctx.selectedOperations = Object.values(feSelections).map(s => ({
      column:    s.column_name,
      operation: s.operation,
      plain:     getPlainAction(s.operation, ''),
    }));
  }

  // Actual data: headers + sample rows + enriched per-column stats
  if (chatState.dataHeaders?.length) {
    ctx.dataHeaders    = chatState.dataHeaders;
    ctx.dataSampleRows = chatState.dataSampleRows || [];
    ctx.enrichedCols   = chatState.enrichedCols   || [];
  }

  return ctx;
}

/* ── System prompt builder ──────────────────────────────────── */
function buildSystemPrompt(ctx) {
  let sys = `You are a friendly, expert data analyst helping a user prepare their dataset for machine learning. 
You speak in plain, beginner-friendly language. Never use unexplained jargon. 
Keep answers concise (2-4 sentences usually), practical, and encouraging.
Always ground your answer in the actual dataset context provided.
Use bullet points only when listing 3+ items. Be specific with numbers when available.
Format column names like \`this\` using backtick notation.

CURRENT DATASET CONTEXT:
`;

  if (!ctx.hasDataset) {
    sys += 'No dataset has been uploaded yet. Encourage the user to upload a CSV or Excel file.\n';
    return sys;
  }

  sys += `File: ${ctx.filename} (${ctx.fileSize || 'unknown size'})\n`;

  if (ctx.qualityScore !== undefined) {
    sys += `\nDATA QUALITY:
- Health Score: ${ctx.qualityScore}/100
- Expected after cleaning: ${ctx.expectedScore}/100
- Total rows: ${ctx.totalRows?.toLocaleString()}, columns: ${ctx.totalCols}
- Missing cells: ${ctx.missingCells?.toLocaleString()} (${ctx.missingPct}% of all data)
- Duplicate rows: ${ctx.duplicateRows?.toLocaleString()} (${ctx.duplicatePct}%)
- Numeric columns: ${ctx.numericCols?.join(', ') || 'none'}
- Text/category columns: ${ctx.categoricalCols?.join(', ') || 'none'}
`;
    if (ctx.missingCols?.length) {
      sys += `- Columns with missing values: ${ctx.missingCols.map(c=>`\`${c.name}\` (${c.missingPct}% missing)`).join(', ')}\n`;
    }
    if (ctx.outlierCols?.length) {
      sys += `- Columns with outliers: ${ctx.outlierCols.map(c=>`\`${c}\``).join(', ')}\n`;
    }
    if (ctx.constantCols?.length) {
      sys += `- Constant/useless columns: ${ctx.constantCols.map(c=>`\`${c}\``).join(', ')}\n`;
    }
    if (ctx.colStats?.length) {
      sys += `\nDETAILED COLUMN STATS:\n`;
      ctx.colStats.slice(0, 20).forEach(c => {
        sys += `- \`${c.name}\`: ${c.dtype}, cardinality=${c.cardinality}${c.missingPct > 0 ? `, ${c.missingPct}% missing` : ''}${c.hasOutliers ? ', has outliers' : ''}${c.isConstant ? ', CONSTANT (no value)' : ''}${c.isHighCard ? ', HIGH CARDINALITY' : ''}\n`;
      });
    }
  }

  if (ctx.cleaningSummary) {
    const s = ctx.cleaningSummary;
    sys += `\nCLEANING RESULTS:
- Rows: ${s.originalRows} → ${s.finalRows} (removed ${s.duplicatesRemoved} duplicates)
- Whitespace fixes: ${s.whitespaceFixed} cells
- Missing values filled: ${Object.keys(s.nullsFilled).length} columns
`;
    Object.entries(s.nullsFilled).forEach(([col, info]) => {
      sys += `  · \`${col}\`: ${info.count} nulls filled using ${info.method}\n`;
    });
    if (Object.keys(s.columnsRenamed).length) {
      sys += `- Columns renamed: ${Object.entries(s.columnsRenamed).map(([o,n])=>`\`${o}\`→\`${n}\``).join(', ')}\n`;
    }
  }

  if (ctx.feColumns?.length) {
    sys += `\nFEATURE ENGINEERING RECOMMENDATIONS (${ctx.feColumns.length} columns analysed):\n`;
    ctx.feColumns.slice(0, 15).forEach(col => {
      sys += `- \`${col.column}\` (${col.dtype}${col.cardinality ? `, ${col.cardinality} unique values` : ''}${col.hasOutliers ? ', has outliers' : ''}${col.skewness ? `, skew=${col.skewness}` : ''}):\n`;
      col.recommendations?.slice(0, 3).forEach(r => {
        sys += `  · [${r.priority} priority, ${r.safeLevel} risk] ${r.plainAction} (${r.operation}): ${r.explanation}\n`;
      });
    });
  }

  if (ctx.selectedOperations?.length) {
    sys += `\nUSER'S SELECTED OPERATIONS (pipeline):\n`;
    ctx.selectedOperations.forEach(op => {
      sys += `- \`${op.column}\`: ${op.plain} (${op.operation})\n`;
    });
  }

  // ── Actual data: sample rows ────────────────────────────────
  if (ctx.dataHeaders?.length && ctx.dataSampleRows?.length) {
    sys += `\nACTUAL DATA SAMPLE (first ${Math.min(ctx.dataSampleRows.length, 10)} rows):\n`;
    sys += ctx.dataHeaders.join(' | ') + '\n';
    sys += ctx.dataHeaders.map(() => '---').join(' | ') + '\n';
    ctx.dataSampleRows.slice(0, 10).forEach((row, i) => {
      const cells = ctx.dataHeaders.map((_, ci) => String(row[ci] ?? '').slice(0, 30));
      sys += cells.join(' | ') + '\n';
    });
  }

  // ── Per-column value distribution ──────────────────────────
  if (ctx.enrichedCols?.length) {
    sys += `\nPER-COLUMN VALUE DETAILS:\n`;
    ctx.enrichedCols.forEach(col => {
      sys += `\n\`${col.name}\` (${col.dtype}`;
      if (col.cardinality !== undefined) sys += `, ${col.cardinality} unique values`;
      if (col.missingPct > 0)           sys += `, ${col.missingPct}% missing`;
      if (col.hasOutliers)              sys += ', has outliers';
      if (col.isConstant)               sys += ', CONSTANT';
      sys += '):\n';

      // Numeric stats
      if (col.dtype === 'numeric' && col.min !== undefined) {
        sys += `  Stats: min=${col.min}, max=${col.max}, mean=${col.mean}, median=${col.median}\n`;
      }

      // Top values
      if (col.topValues?.length) {
        const topStr = col.topValues
          .map(t => `"${String(t.val).slice(0,25)}" (${t.count}x)`)
          .join(', ');
        sys += `  Top values: ${topStr}\n`;
      }

      // Sample values
      if (col.samples?.length) {
        const sampleStr = col.samples.map(v => `"${String(v).slice(0,20)}"`).join(', ');
        sys += `  Samples: ${sampleStr}\n`;
      }
    });
  }

  return sys;
}

/* ── API call via /chat backend proxy (Groq) ─────────────── */
async function callClaudeAPI(messages, systemPrompt) {
  const fd = new FormData();
  fd.append('messages_json', JSON.stringify(messages));
  fd.append('system_prompt', systemPrompt || '');

  // Include user-supplied Groq key if stored
  const userKey = sessionStorage.getItem('dp_groq_key') || '';
  if (userKey) fd.append('user_api_key', userKey);

  const response = await authFetch('/chat', { method: 'POST', body: fd });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.detail || `Server error ${response.status}`;
    // Surface rate-limit and auth errors clearly
    if (response.status === 429) throw new Error('Rate limit reached — please wait a moment and try again.');
    if (response.status === 401) throw new Error('Groq API key invalid. Check your key in Settings.');
    throw new Error(msg);
  }

  const data = await response.json();

  // If no key configured, data.mode === 'fallback' — still show the reply
  return data.reply || '';
}

/* ── UI helpers ─────────────────────────────────────────────── */
function toggleChat() {
  chatState.open = !chatState.open;
  const drawer   = document.getElementById('chatDrawer');
  const backdrop = document.getElementById('chatBackdrop');
  const fab      = document.getElementById('chatFab');
  drawer.classList.toggle('open', chatState.open);
  backdrop.classList.toggle('visible', chatState.open);
  if (chatState.open) {
    document.getElementById('chatBadge').style.display = 'none';
    updateChatContext();
    updateSuggestions();
    setTimeout(() => document.getElementById('chatInput').focus(), 300);
  }
}

function updateChatContext() {
  const ctx   = buildChatContext();
  const label = document.getElementById('chatContextLabel');
  const bar   = document.getElementById('chatContextBar');
  const chips = document.getElementById('chatCtxChips');

  const activeCtx = [];
  if (ctx.hasDataset)               activeCtx.push({ label: `📄 ${ctx.filename}`, cls: 'active' });
  if (ctx.qualityScore !== undefined)activeCtx.push({ label: `Score: ${ctx.qualityScore}/100`, cls: '' });
  if (ctx.cleaningSummary)           activeCtx.push({ label: '✓ Cleaned', cls: '' });
  if (ctx.feColumns?.length)         activeCtx.push({ label: `${ctx.feColumns.length} cols analysed`, cls: '' });
  if (ctx.selectedOperations?.length)activeCtx.push({ label: `${ctx.selectedOperations.length} in pipeline`, cls: '' });

  if (activeCtx.length) {
    label.textContent = ctx.filename ? `Analysing ${ctx.filename}` : 'Dataset loaded';
    chips.innerHTML   = activeCtx.map(c => `<span class="chat-ctx-chip ${c.cls}">${c.label}</span>`).join('');
    bar.style.display = 'block';
  } else {
    label.textContent = 'Upload a dataset to get started';
    bar.style.display = 'none';
  }
}

function updateSuggestions() {
  const ctx   = buildChatContext();
  const chips = document.getElementById('chatChips');
  let questions = [];

  if (!ctx.hasDataset) {
    questions = [
      'What file formats do you support?',
      'What is data cleaning?',
      'What is feature engineering?',
      'How do I improve model accuracy?',
    ];
  } else if (!ctx.cleaningSummary && !ctx.feColumns) {
    questions = [
      'What does the health score mean?',
      'Which column has the most issues?',
      'What should I clean first?',
      'Is my dataset ready for machine learning?',
      'What do the dashboard numbers mean?',
      'How bad are the duplicates?',
    ];
    // Add data-content questions if we have actual values
    if (ctx.enrichedCols?.length) {
      const numCol = ctx.enrichedCols.find(c => c.dtype === 'numeric' && c.min !== undefined);
      const catCol = ctx.enrichedCols.find(c => c.dtype === 'categorical' && c.topValues?.length);
      if (numCol) questions.push(`What is the range of values in \`${numCol.name}\`?`);
      if (catCol) questions.push(`What are the most common values in \`${catCol.name}\`?`);
      questions.push('Show me a sample of my data');
      questions.push('Which column has the most variety?');
    }
    if (ctx.missingCols?.length)
      questions.unshift(`Why is \`${ctx.missingCols[0].name}\` showing missing values?`);
  } else if (ctx.feColumns?.length) {
    questions = [
      'Which recommendation should I apply first?',
      'What is the safest recommendation?',
      'Which columns are most important for ML?',
      'What happens if I skip feature engineering?',
      'What ML model should I use?',
      'How can I improve prediction accuracy?',
      'Which recommendations are optional?',
      'Is my dataset ready for machine learning?',
    ];
    const firstCol = ctx.feColumns[0];
    if (firstCol?.recommendations?.[0]) {
      questions.unshift(`Why should I ${firstCol.recommendations[0].plainAction.toLowerCase()} \`${firstCol.column}\`?`);
    }
  } else if (ctx.cleaningSummary) {
    questions = [
      'What was fixed during cleaning?',
      'Is my data ready for feature engineering?',
      'What is the next step?',
      'How much better is my dataset now?',
      'Which columns still need work?',
    ];
  }

  chips.innerHTML = questions.slice(0, 8).map(q =>
    `<button class="chat-chip" onclick="sendSuggestedQuestion(this)">${esc(q)}</button>`
  ).join('');
}

function sendSuggestedQuestion(btn) {
  const q = btn.textContent;
  document.getElementById('chatInput').value = q;
  sendChatMessage();
}

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(120, el.scrollHeight) + 'px';
  document.getElementById('chatSendBtn').disabled = el.value.trim().length === 0;
}

function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!document.getElementById('chatSendBtn').disabled) sendChatMessage();
  }
}

function scrollToBottom() {
  const msgs = document.getElementById('chatMessages');
  msgs.scrollTop = msgs.scrollHeight;
}

function addMessage(role, text) {
  // Remove welcome state on first message
  const welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const msgs   = document.getElementById('chatMessages');
  const isUser = role === 'user';
  const time   = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const initials = authUsername ? authUsername.charAt(0).toUpperCase() : 'U';

  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-msg-avatar';
  avatar.textContent = isUser ? initials : '✦';

  const inner = document.createElement('div');
  inner.style.display = 'flex'; inner.style.flexDirection = 'column';
  inner.style.alignItems = isUser ? 'flex-end' : 'flex-start';
  inner.style.maxWidth = '82%';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = formatChatText(text);

  const timeEl = document.createElement('div');
  timeEl.className = 'chat-msg-time';
  timeEl.textContent = time;

  inner.appendChild(bubble);
  inner.appendChild(timeEl);
  wrap.appendChild(avatar);
  wrap.appendChild(inner);
  msgs.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function formatChatText(text) {
  // Convert markdown-lite to HTML
  let t = esc(text);
  // Bold **text**
  t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Inline code `text`
  t = t.replace(/`([^`]+)`/g, '<span class="chat-highlight">$1</span>');
  // Bullet lines starting with -
  t = t.replace(/^- (.+)$/gm, '<li>$1</li>');
  t = t.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Line breaks
  t = t.replace(/\n/g, '<br>');
  // Impact pills pattern: [Impact: High] [Risk: Low]
  t = t.replace(/\[Impact:\s*(High|Medium|Low)\]/gi, (_, v) =>
    `<span class="chat-impact-pill high">↑ Impact: ${v}</span>`);
  t = t.replace(/\[Risk:\s*(High|Medium|Low)\]/gi, (_, v) =>
    `<span class="chat-impact-pill ${v.toLowerCase() === 'high' ? 'caution' : v.toLowerCase() === 'medium' ? 'medium' : 'low'}">⚡ Risk: ${v}</span>`);
  return t;
}

function showTyping() {
  const welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();
  const msgs = document.getElementById('chatMessages');
  const el   = document.createElement('div');
  el.id = 'chatTyping'; el.className = 'chat-msg ai';
  el.innerHTML = `
    <div class="chat-msg-avatar" style="background:linear-gradient(135deg,var(--accent),var(--purple));color:#fff">✦</div>
    <div class="chat-typing">
      <div class="chat-typing-dots"><span></span><span></span><span></span></div>
      <span class="chat-typing-label">Thinking…</span>
    </div>`;
  msgs.appendChild(el);
  scrollToBottom();
}

function hideTyping() {
  document.getElementById('chatTyping')?.remove();
}

/* ── Main send function ─────────────────────────────────────── */
async function sendChatMessage() {
  const input  = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const text   = input.value.trim();
  if (!text || chatState.typing) return;

  // Add user message
  addMessage('user', text);
  chatState.history.push({ role: 'user', content: text });

  // Clear input
  input.value = ''; input.style.height = 'auto';
  sendBtn.disabled = true;
  chatState.typing = true;

  // Show typing
  showTyping();

  // Build context-aware prompt
  const ctx          = buildChatContext();
  const systemPrompt = buildSystemPrompt(ctx);

  // Keep last 10 turns (5 back-and-forth)
  const messages = chatState.history.slice(-10);

  try {
    const reply = await callClaudeAPI(messages, systemPrompt);
    hideTyping();
    addMessage('ai', reply);
    chatState.history.push({ role: 'assistant', content: reply });
    // Refresh suggestions after each reply
    updateSuggestions();
  } catch(err) {
    hideTyping();
    let errMsg;
    const m = err.message || '';
    if (m.includes('Rate limit') || m.includes('429'))
      errMsg = '⏱ Groq rate limit reached — please wait a few seconds and try again.';
    else if (m.includes('API key') || m.includes('401'))
      errMsg = '🔑 Groq API key issue. Add **GROQ_API_KEY** to your `.env` file and restart the server. Get a free key at [console.groq.com](https://console.groq.com).';
    else if (m.includes('GROQ_API_KEY') || m.includes('fallback'))
      errMsg = '💡 No Groq API key is configured. Add **GROQ_API_KEY** to your `.env` file to enable AI chat. You can get a free key at console.groq.com.';
    else if (m.includes('504') || m.includes('timed out'))
      errMsg = '⏳ The request timed out — Groq may be busy. Please try again.';
    else
      errMsg = `⚠ ${m || "Something went wrong. Please try again."}`;
    addMessage('ai', errMsg);
    chatState.history.push({ role: 'assistant', content: errMsg });
  } finally {
    chatState.typing = false;
    sendBtn.disabled = input.value.trim().length === 0;
  }
}

function clearChat() {
  chatState.history = [];
  const msgs = document.getElementById('chatMessages');
  msgs.innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">🤖</div>
      <div class="chat-welcome-title">Chat cleared!</div>
      <div class="chat-welcome-text">Ask me anything about your dataset — I\'m ready to help.</div>
    </div>`;
  updateSuggestions();
}

/* ── Store profiler results for context ──────────────────────── */
/* ── Chat hooks for quality dashboard ─────────────────────── */
function notifyChatAfterProfile(profile) {
  chatState.lastProfiler = { ...profile };
  const badge = document.getElementById('chatBadge');
  if (badge && !chatState.open) {
    badge.style.display = 'flex';
    const fab = document.getElementById('chatFab');
    if (fab) { fab.classList.add('pulse'); setTimeout(() => fab.classList.remove('pulse'), 6000); }
  }
  updateChatContext();
  updateSuggestions();
}

/* ── "Why?" quick-ask from rec cards ─────────────────────────── */
function askAboutRec(columnName, operation, explanation) {
  if (!chatState.open) toggleChat();
  const q = `Why should I "${getPlainAction(operation, '')}" for the \`${columnName}\` column?`;
  setTimeout(() => {
    document.getElementById('chatInput').value = q;
    document.getElementById('chatSendBtn').disabled = false;
    sendChatMessage();
  }, 400);
}

/* ── Keyboard shortcut: Cmd/Ctrl+K ──────────────────────────── */
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k' && authToken) {
    e.preventDefault();
    toggleChat();
  }
});