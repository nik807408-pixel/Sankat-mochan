// ─────────────────────────────────────────────────────────
//  CONFIGURATION — Replace with your Supabase values
//  supabase.com → Project Settings → API
// ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://chaenhnaslkmzutmsumi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoYWVuaG5hc2xrbXp1dG1zdW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMzA2MjcsImV4cCI6MjA5MzYwNjYyN30.X-f-HPQzFMu7DivRZJz9y0Zx2DMjlh3trN66MWAhU1g';
// ─────────────────────────────────────────────────────────

// ── HELPER FUNCTIONS ─────────────────────
function fmt(n) { return Number(n||0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function v(id) { return (document.getElementById(id)?.value || '').trim(); }
function dRow(lbl, val) { return val ? `<div class="detail-row"><span class="detail-lbl">${lbl}</span><span class="detail-val">${val}</span></div>` : ''; }
function emptyState(icon, msg) { return `<div class="empty"><div class="empty-icon">${icon}</div><p style="margin-top:10px;font-size:13px">${msg}</p></div>`; }
function maskAadhaar(n) { return n && n.length >= 4 ? 'XXXX XXXX ' + n.slice(-4) : (n||'—'); }
function maskAccount(n) { return n && n.length >= 4 ? 'XXXX' + n.slice(-4) : (n||'—'); }


function openModal(id) { const el = document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if(el) el.classList.remove('open'); }
function showToast(msg, type = '', duration = 10000) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.className = type ? `show ${type}` : 'show';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.className = ''; t.textContent = ''; }, duration);
}
function showErr(el, msg) { if(el) { el.textContent = msg; el.style.display = 'block'; } }


const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null, currentProfile = null;
let allClients = [], allEmployees = [], allPayments = [], allInvoices = [];
let editingClientId = null, activeClientId = null;
let currentPage = 'dashboard';
let selectedPhotoFile = null, selectedPhotoUrl = null;
let chartInstances = {};

// ── INIT ─────────────────────────────────
window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const { data: { session } } = await db.auth.getSession();
  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      session ? initApp(session.user) : showAuth();
    }, 500);
  }, 2000);
  db.auth.onAuthStateChange((_e, s) => { if (!s) showAuth(); });
});

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
function showLogin() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('signup-form').style.display = 'none';
}
function showSignup() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('signup-form').style.display = 'block';
}

// ── AUTH ─────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  const err = document.getElementById('login-err');
  err.style.display = 'none';
  if (!email || !pass) { showErr(err, 'Please fill all fields / सभी फ़ील्ड भरें'); return; }
  const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) { showErr(err, error.message); return; }
  initApp(data.user);
}

async function handleSignup() {
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pass = document.getElementById('su-pass').value;
  const role = document.getElementById('su-role').value;
  const err = document.getElementById('su-err');
  err.style.display = 'none';
  if (!name || !email || !pass) { showErr(err, 'Please fill all fields / सभी फ़ील्ड भरें'); return; }
  if (pass.length < 6) { showErr(err, 'Password min 6 characters'); return; }
  const { data, error } = await db.auth.signUp({ email, password: pass });
  if (error) { showErr(err, error.message); return; }
  const empId = document.getElementById('su-empid')?.value.trim() || 'EMP-' + String(Math.floor(Math.random()*900)+100);
  await db.from('profiles').insert({ id: data.user.id, name, email, role, employee_id: empId });
  showToast('Account created! Check your email. / खाता बना! ईमेल जांचें', 'success');
  showLogin();
}

async function handleLogout() {
  await db.auth.signOut();
  showAuth();
}


// ── AUTO REFRESH ─────────────────────────
let autoRefreshInterval = null;
let refreshCountdown = 30;

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  // Silent background refresh every 60 seconds - no toast, no countdown
  autoRefreshInterval = setInterval(async () => {
    await loadAll();
    // Silently update data without showing any message or refreshing screen
  }, 60000);
}

async function manualRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  await loadAll();
  showPage(currentPage);
  if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
}

// ── APP INIT ─────────────────────────────
async function initApp(user) {
  currentUser = user;
  const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profile || { name: user.email, role: 'employee', id: user.id };

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  const shortName = currentProfile.name?.split(' ')[0] || 'User';
  document.getElementById('uname').textContent = shortName;
  const rp = document.getElementById('urole');
  rp.textContent = currentProfile.role === 'admin' ? 'Admin' : 'Employee';
  rp.className = 'role-pill ' + (currentProfile.role === 'admin' ? 'role-admin' : 'role-employee');

  if (currentProfile.role !== 'admin') {
    document.getElementById('nav-team').style.display = 'none';
  }

  await loadAll();
  showPage('dashboard');
  startAutoRefresh();
  checkTodayBirthdays();
}

async function loadAll() {
  try {
    await loadClients();
    await loadEmployees();
    await loadPayments();
    await loadInvoices();
  } catch(e) {
    console.error('Load error:', e);
  }
}

// ── DATA LOADING ──────────────────────────
async function loadClients() {
  let q = db.from('clients').select('*').order('created_at', { ascending: false });
  if (currentProfile.role !== 'admin') q = q.eq('assigned_to', currentUser.id);
  const { data } = await q;
  allClients = data || [];
}

async function loadEmployees() {
  const { data } = await db.from('profiles').select('*').order('name');
  allEmployees = data || [];
}

async function loadPayments() {
  const clientIds = allClients.map(c => c.id);
  if (!clientIds.length) { allPayments = []; return; }
  const { data, error } = await db.from('payments')
    .select('*')
    .in('client_id', clientIds)
    .order('created_at', { ascending: false });
  if (error) console.error('Payments error:', error);
  allPayments = data || [];
}

async function loadInvoices() {
  const clientIds = allClients.map(c => c.id);
  if (!clientIds.length) { allInvoices = []; return; }
  const { data } = await db.from('invoices').select('*').in('client_id', clientIds).order('created_at', { ascending: false });
  allInvoices = data || [];
}

// ── PAGES ─────────────────────────────────
function showPage(page) {
  currentPage = page;
  ['dashboard','clients','invoices','team'].forEach(p => {
    const btn = document.getElementById('nav-' + p);
    if (btn) btn.classList.toggle('active', p === page);
  });
  const c = document.getElementById('main-content');
  if (page === 'dashboard') renderDashboard(c);
  else if (page === 'clients') renderClientsPage(c);
  else if (page === 'invoices') renderInvoicesPage(c);
  else if (page === 'team') renderTeamPage(c);
}

// ── DASHBOARD ─────────────────────────────
function renderDashboard(c) {
  try {
  const totalBal = allClients.reduce((s, x) => s + (parseFloat(x.balance) || 0), 0);
  const totalPaid = allPayments.filter(p => p.type === 'credit').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const pendingInv = allInvoices.filter(i => i.status === 'pending').length;
  const vipClients = allClients.filter(x => x.status === 'vip').length;

  c.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--navy)">नमस्ते, ${currentProfile.name?.split(' ')[0]} 👋</div>
      <div style="font-size:12px;color:var(--muted)">Your finance overview / आपका वित्त सारांश</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label"><span class="hindi-label">कुल ग्राहक</span>Total Clients</div>
        <div class="stat-val gold">${allClients.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label"><span class="hindi-label">कुल बैलेंस</span>Total Balance</div>
        <div class="stat-val green">₹${fmt(totalBal)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label"><span class="hindi-label">कुल प्राप्त</span>Total Received</div>
        <div class="stat-val" style="color:var(--navy2)">₹${fmt(totalPaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label"><span class="hindi-label">कुल ब्याज</span>Total Interest</div>
        <div class="stat-val purple">₹${fmt(allClients.reduce((s,c)=>s+(parseFloat(c.interest_amount)||0),0))}</div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">📊 Client Balance Overview <span class="hindi">/ ग्राहक बैलेंस</span></div>
      <canvas id="balanceChart" height="180"></canvas>
    </div>

    <div class="chart-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="chart-title" style="margin:0">💰 Payment History / भुगतान इतिहास</div>
        <button onclick="exportPaymentsExcel()" style="background:var(--success);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">📥 Export Excel</button>
      </div>
      ${!allPayments || allPayments.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">No payments yet / कोई भुगतान नहीं<br><span style="font-size:11px">Client पर click करके payment add करें</span></div>' :
      `<div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:var(--navy);color:white">
              <th style="padding:8px 10px;text-align:left;white-space:nowrap">Date</th>
              <th style="padding:8px 10px;text-align:left;white-space:nowrap">Client</th>
              <th style="padding:8px 10px;text-align:left;white-space:nowrap">Pay Mode</th>
              <th style="padding:8px 10px;text-align:right;white-space:nowrap">Amount</th>
              <th style="padding:8px 10px;text-align:right;white-space:nowrap">Outstanding</th>
              <th style="padding:8px 10px;text-align:center;white-space:nowrap">✓</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              // Calculate running outstanding per client
              const clientOutstanding = {};
              allClients.forEach(cl => { clientOutstanding[cl.id] = parseFloat(cl.balance)||0; });
              return allPayments.slice(0,10).map((p,i) => {
                const client = allClients.find(c => c.id === p.client_id);
                if (p.type === 'credit' && client) {
                  clientOutstanding[p.client_id] = Math.max(0, (clientOutstanding[p.client_id]||0) - (parseFloat(p.amount)||0));
                }
                const outstanding = clientOutstanding[p.client_id] || 0;
                return `<tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
                  <td style="padding:7px 10px;white-space:nowrap;color:var(--muted);font-size:11px">${p.date||'—'}</td>
                  <td style="padding:7px 10px;font-weight:600;color:var(--navy);font-size:12px">${client?.name||'?'}</td>
                  <td style="padding:7px 10px;color:var(--muted);font-size:11px">${p.description||'Cash'}</td>
                  <td style="padding:7px 10px;text-align:right;font-weight:700;color:${p.type==='credit'?'var(--success)':'var(--danger)'};font-size:12px">
                    ${p.type==='credit'?'+':'-'}₹${fmt(parseFloat(p.amount)||0)}
                  </td>
                  <td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--danger);font-size:12px">₹${fmt(outstanding)}</td>
                  <td style="padding:7px 10px;text-align:center">${p.type==='credit'?'✅':'❌'}</td>
                </tr>`;
              }).join('');
            })()}
          </tbody>
        </table>
        ${allPayments.length > 10 ? `<div style="text-align:center;padding:8px;font-size:11px;color:var(--muted)">Showing 10 of ${allPayments.length} payments</div>` : ''}
      </div>`}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <button onclick="showDailyCollectionReport()" style="padding:13px;background:white;border:1.5px solid var(--border);border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--navy);box-shadow:0 2px 8px rgba(15,37,71,.07)">📋 Daily Collection<br><span style="font-size:10px;color:var(--muted);font-weight:400">आज का संग्रह</span></button>
      <button onclick="showNPAReport()" style="padding:13px;background:white;border:1.5px solid #fecaca;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--danger);box-shadow:0 2px 8px rgba(15,37,71,.07)">⚠️ NPA / Overdue<br><span style="font-size:10px;color:var(--muted);font-weight:400">बकाया ग्राहक</span></button>
    </div>

    <div style="margin-bottom:14px">
      <div class="section-hdr">
        <div class="section-title">Recent Clients <span class="hindi">हाल के ग्राहक</span></div>
        <button class="btn-add" onclick="showPage('clients')">सभी देखें →</button>
      </div>
      ${allClients.slice(0,3).map(clientCard).join('') || '<div class="empty"><div class="empty-icon">👤</div><p>No clients yet</p></div>'}
    </div>
  `;
  renderCharts();
  } catch(err) {
    console.error('Dashboard error:', err);
    c.innerHTML = '<div style="padding:20px;color:red">Error: ' + err.message + '</div>';
  }
}

function renderCharts() {
  // Balance chart
  const top5 = [...allClients].sort((a,b) => (parseFloat(b.balance)||0) - (parseFloat(a.balance)||0)).slice(0,5);
  const bc = document.getElementById('balanceChart');
  if (bc) {
    if (chartInstances.balance) chartInstances.balance.destroy();
    chartInstances.balance = new Chart(bc, {
      type: 'bar',
      data: {
        labels: top5.map(c => c.name?.split(' ')[0] || 'N/A'),
        datasets: [{ label: 'Balance (₹)', data: top5.map(c => parseFloat(c.balance)||0),
          backgroundColor: ['#0f2547','#1a3a6b','#c8aa5a','#22c55e','#7c3aed'],
          borderRadius: 8 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // Payment chart (last 6 months)
  const months = [];
  const credits = [], debits = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0,7);
    months.push(d.toLocaleString('default', { month: 'short' }));
    credits.push(allPayments.filter(p => p.type==='credit' && p.date?.startsWith(key)).reduce((s,p)=>s+(parseFloat(p.amount)||0),0));
    debits.push(allPayments.filter(p => p.type==='debit' && p.date?.startsWith(key)).reduce((s,p)=>s+(parseFloat(p.amount)||0),0));
  }
  const pc = document.getElementById('payChart');
  if (pc) {
    if (chartInstances.pay) chartInstances.pay.destroy();
    chartInstances.pay = new Chart(pc, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          { label: 'Received / प्राप्त', data: credits, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', tension: 0.4, fill: true },
          { label: 'Paid / भुगतान', data: debits, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.1)', tension: 0.4, fill: true }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

// ── CLIENTS PAGE ──────────────────────────
function renderClientsPage(c) {
  c.innerHTML = `
    <div class="section-hdr">
      <div class="section-title">
        ${currentProfile.role==='admin' ? 'All Clients' : 'My Clients'}
        <span class="hindi">${currentProfile.role==='admin' ? 'सभी ग्राहक' : 'मेरे ग्राहक'}</span>
      </div>
      <button class="btn-add" onclick="openAddClient()">+ जोड़ें</button>
    </div>
    <input class="search-bar" id="search-inp" placeholder="🔍 नाम, ईमेल, शहर खोजें…" oninput="filterClients()"/>
    <div class="tabs">
      <button class="tab active" onclick="filterByStatus('all',this)">सभी (${allClients.length})</button>
      <button class="tab" onclick="filterByStatus('active',this)">Active (${allClients.filter(x=>x.status==='active').length})</button>
      <button class="tab" onclick="filterByStatus('vip',this)">VIP (${allClients.filter(x=>x.status==='vip').length})</button>
      <button class="tab" onclick="filterByStatus('inactive',this)">Inactive (${allClients.filter(x=>x.status==='inactive').length})</button>
    </div>
    <div id="client-list">${allClients.map(clientCard).join('') || emptyState('👤','No clients yet / अभी कोई ग्राहक नहीं')}</div>
  `;
}

let statusFilter = 'all';
function filterByStatus(s, btn) {
  statusFilter = s;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  filterClients();
}
function filterClients() {
  const q = (document.getElementById('search-inp')?.value || '').toLowerCase();
  const filtered = allClients.filter(c => {
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });
  const list = document.getElementById('client-list');
  if (list) list.innerHTML = filtered.map(clientCard).join('') || emptyState('🔍','No results / कोई परिणाम नहीं');
}

function clientCard(c) {
  const bal = parseFloat(c.balance) || 0;
  const balClass = bal > 0 ? 'bal-pos' : bal < 0 ? 'bal-neg' : 'bal-zero';
  const statusMap = { active:'status-active', inactive:'status-inactive', vip:'status-vip' };
  const statusLabel = { active:'Active', inactive:'Inactive', vip:'⭐ VIP' };
  const photoHtml = c.photo_url
    ? `<img src="${c.photo_url}" class="avatar-img" onerror="this.style.display='none'"/>`
    : '';
  return `
    <div class="client-card" onclick="openDetail('${c.id}')">
      <div class="client-avatar">${c.name?.charAt(0).toUpperCase()||'?'}${photoHtml}</div>
      <div class="client-info">
        <div class="client-name">${c.name}</div>
        <div class="client-meta">${[c.phone, c.city].filter(Boolean).join(' · ')||'No contact'}</div>
        <div style="font-size:10px;color:var(--gold);font-weight:700">${c.customer_id||''} ${c.loan_id?'| '+c.loan_id:''}</div>
        ${c.center_name ? `<div style="font-size:10px;color:var(--muted)">🏘️ ${c.center_name} ${c.meeting_day?'| '+c.meeting_day:''}</div>` : ''}
      </div>
      <div class="client-right">
        <div class="client-balance ${balClass}">₹${fmt(Math.abs(bal))}</div>
        <span class="status-badge ${statusMap[c.status]||'status-active'}">${statusLabel[c.status]||'Active'}</span>
      </div>
    </div>`;
}

// ── CLIENT FORM ───────────────────────────
function openAddClient() {
  editingClientId = null; selectedPhotoFile = null; selectedPhotoUrl = null;
  document.getElementById('cm-title').innerHTML = 'Add Client <span class="hindi">/ ग्राहक जोड़ें</span>';
  document.getElementById('cm-del').style.display = 'none';
  document.getElementById('cm-err').style.display = 'none';
  const fields = ['name','father','mother','dob','email','phone','phone2','address','city','state','pin','country','aadhaar','pan','balance','bank','account','notes'];
  fields.forEach(f => { const el = document.getElementById('f-'+f); if(el) el.value = f==='country'?'India':''; });
  document.getElementById('f-type').value = 'individual';
  document.getElementById('f-status').value = 'active';
  document.getElementById('photo-initial').textContent = '?';
  // Reset OTP
  otpVerified = false; generatedOTP = null;
  const otpBtn = document.getElementById('otp-send-btn');
  if (otpBtn) { otpBtn.textContent = '📲 Send OTP on WhatsApp / SMS / Call'; otpBtn.style.background = 'var(--navy)'; }
  const otpSec = document.getElementById('otp-section');
  if (otpSec) otpSec.style.display = 'none';
  const otpDisp = document.getElementById('otp-screen-display');
  if (otpDisp) otpDisp.style.display = 'none';
  const img = document.querySelector('#photo-preview-wrap img');
  if (img) img.remove();
  if (currentProfile.role === 'admin') {
    document.getElementById('assign-section').style.display = 'block';
    document.getElementById('kyc-approve-section').style.display = 'block';
    populateAssign();
  }
  openModal('client-modal');
}

function openEditClient(c) {
  editingClientId = c.id;
  document.getElementById('cm-title').innerHTML = 'Edit Client <span class="hindi">/ संपादित करें</span>';
  document.getElementById('cm-del').style.display = 'block';
  document.getElementById('cm-err').style.display = 'none';
  const map = { name:'name', father:'father_name', mother:'mother_name', dob:'dob', email:'email', phone:'phone', phone2:'phone2', address:'address', city:'city', state:'state', pin:'pin_code', country:'country', aadhaar:'aadhaar_no', pan:'pan_no', balance:'balance', interest:'interest_amount', bank:'finance_company', account:'customer_id', notes:'notes', 'center-name':'center_name', 'center-code':'center_code', 'center-leader':'center_leader', 'loan-id':'loan_id' };
  Object.entries(map).forEach(([fid, key]) => {
    const el = document.getElementById('f-'+fid);
    if (el) el.value = c[key] || '';
  });
  document.getElementById('f-type').value = c.client_type || 'individual';
  document.getElementById('f-status').value = c.status || 'active';
  if (document.getElementById('f-marital')) document.getElementById('f-marital').value = c.marital_status || 'unmarried';
  if (document.getElementById('f-meeting-day')) document.getElementById('f-meeting-day').value = c.meeting_day || '';
  if (document.getElementById('f-loan-cycle')) document.getElementById('f-loan-cycle').value = c.loan_cycle || '1st';
  if (document.getElementById('f-loan-purpose')) document.getElementById('f-loan-purpose').value = c.loan_purpose || '';

  // Photo
  const wrap = document.getElementById('photo-preview-wrap');
  document.getElementById('photo-initial').textContent = c.name?.charAt(0).toUpperCase() || '?';
  const oldImg = wrap.querySelector('img');
  if (oldImg) oldImg.remove();
  if (c.photo_url) {
    const img = document.createElement('img');
    img.src = c.photo_url; img.className = 'avatar-img';
    wrap.appendChild(img);
  }

  if (currentProfile.role === 'admin') {
    document.getElementById('assign-section').style.display = 'block';
    populateAssign(c.assigned_to);
  }
  closeModal('detail-modal');
  openModal('client-modal');
}




// ── BACKGROUND PHOTO UPLOAD ───────────────
async function uploadPhotosInBackground(clientId) {
  const updates = {};
  try {
    if (selectedPhotoFile) {
      const path = `${currentUser.id}/profile_${Date.now()}.jpg`;
      const { data: up, error: e1 } = await db.storage.from('client-photos').upload(path, selectedPhotoFile, { upsert: true, contentType: 'image/jpeg' });
      if (up) {
        const { data: pu } = db.storage.from('client-photos').getPublicUrl(path);
        updates.photo_url = pu.publicUrl;
      }
      if (e1) console.error('Profile photo error:', e1.message);
    }
    if (aadhaarPhotoFile) {
      const path = `${currentUser.id}/aadhaar_${Date.now()}.jpg`;
      const { data: up, error: e2 } = await db.storage.from('client-photos').upload(path, aadhaarPhotoFile, { upsert: true, contentType: 'image/jpeg' });
      if (up) {
        const { data: pu } = db.storage.from('client-photos').getPublicUrl(path);
        updates.aadhaar_photo = pu.publicUrl;
      }
      if (e2) console.error('Aadhaar photo error:', e2.message);
    }
    if (panPhotoFile) {
      const path = `${currentUser.id}/pan_${Date.now()}.jpg`;
      const { data: up, error: e3 } = await db.storage.from('client-photos').upload(path, panPhotoFile, { upsert: true, contentType: 'image/jpeg' });
      if (up) {
        const { data: pu } = db.storage.from('client-photos').getPublicUrl(path);
        updates.pan_photo = pu.publicUrl;
      }
      if (e3) console.error('PAN photo error:', e3.message);
    }
    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await db.from('clients').update(updates).eq('id', clientId);
      if (updateErr) console.error('DB update error:', updateErr.message);
    }
  } catch (e) {
    console.error('Photo upload failed:', e);
  }
}


// ── WHATSAPP OTP FOR CLIENT ───────────────
let generatedOTP = null;
let otpClientPhone = null;
let otpVerified = false;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendClientOTP() {
  const phone = v('f-phone');
  const name = v('f-name');
  if (!phone) { showToast('Phone number required / फोन नंबर डालें!', 'error'); return; }
  if (!name) { showToast('Name required / नाम डालें!', 'error'); return; }

  generatedOTP = generateOTP();
  otpClientPhone = phone;
  otpVerified = false;

  const message = encodeURIComponent(
    `🙏 नमस्ते ${name} जी!

` +
    `संकट मोचन Finance में आपका OTP है:

` +
    `*${generatedOTP}*

` +
    `यह OTP 10 मिनट के लिए valid है।
` +
    `किसी को share न करें।

` +
    `संकट मोचन Finance 🚩`
  );

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${cleanPhone}?text=${message}`;
  window.open(waUrl, '_blank');

  // Show OTP input
  document.getElementById('otp-section').style.display = 'block';
  document.getElementById('otp-send-btn').textContent = '✅ OTP Sent! Resend';
  document.getElementById('otp-send-btn').style.background = '#22c55e';
  showToast('WhatsApp OTP sent! / OTP भेजा गया!', 'success');

  // Store OTP temporarily (in real app use backend)
  sessionStorage.setItem('client_otp', generatedOTP);
  sessionStorage.setItem('otp_time', Date.now().toString());
}

function verifyClientOTP() {
  const entered = document.getElementById('f-otp').value.trim();
  const stored = sessionStorage.getItem('client_otp');
  const otpTime = parseInt(sessionStorage.getItem('otp_time') || '0');
  const elapsed = (Date.now() - otpTime) / 1000 / 60; // minutes

  if (elapsed > 10) {
    showToast('OTP expired! / OTP expire हो गया! Resend करें', 'error');
    otpVerified = false;
    return;
  }

  if (entered === stored) {
    otpVerified = true;
    document.getElementById('otp-verified-badge').style.display = 'flex';
    document.getElementById('f-otp').style.borderColor = '#22c55e';
    showToast('OTP Verified! ✅ / OTP सही है!', 'success');
    sessionStorage.removeItem('client_otp');
  } else {
    otpVerified = false;
    document.getElementById('f-otp').style.borderColor = '#ef4444';
    showToast('Wrong OTP! / गलत OTP!', 'error');
  }
}

// ── FILE TO BASE64 ───────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── IMAGE COMPRESSION ────────────────────
function compressImage(file, maxKB = 50) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width || 400;
          let height = img.height || 400;

          // Aggressive resize for mobile
          let maxDim = 400;
          if (file.size > 1024 * 1024) maxDim = 300;
          if (file.size > 3 * 1024 * 1024) maxDim = 200;

          if (width > height) {
            if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
          } else {
            if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
          }

          canvas.width = Math.max(width, 1);
          canvas.height = Math.max(height, 1);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Compress until small enough
          let quality = 0.7;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          let tries = 0;
          while (dataUrl.length > maxKB * 1024 * 1.4 && quality > 0.1 && tries < 15) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            tries++;
          }

          // base64 to Blob (mobile safe)
          const byteStr = atob(dataUrl.split(',')[1]);
          const ab = new ArrayBuffer(byteStr.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
          const blob = new Blob([ab], { type: 'image/jpeg' });
          const outFile = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
          
          console.log(`${Math.round(file.size/1024)}KB → ${Math.round(outFile.size/1024)}KB`);
          resolve(outFile);
        } catch(err) {
          console.error('Compress error:', err);
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// Handle Aadhaar/PAN photo upload
let aadhaarPhotoFile = null, panPhotoFile = null;

async function handleDocPhoto(input, type) {
  if (!input.files[0]) return;
  const origSize = Math.round(input.files[0].size / 1024);
  showToast(`Compressing ${type} ${origSize}KB...`, '');

  try {
    const compressed = await compressImage(input.files[0], 50);
    const newSize = Math.round(compressed.size / 1024);

    const reader = new FileReader();
    reader.onload = e => {
      const previewImg = document.getElementById(type + '-preview-img');
      const previewText = document.getElementById(type + '-preview-text');
      if (previewImg) { previewImg.src = e.target.result; previewImg.style.display = 'block'; }
      if (previewText) previewText.style.display = 'none';
      showToast(`${type.toUpperCase()} ready! ${origSize}KB → ${newSize}KB ✅`, 'success');
    };
    reader.readAsDataURL(compressed);

    if (type === 'aadhaar') aadhaarPhotoFile = compressed;
    else panPhotoFile = compressed;
  } catch(e) {
    showToast('Photo error! Try again', 'error');
  }
}

async function handlePhotoSelect(input) {
  if (!input.files[0]) return;
  const origSize = Math.round(input.files[0].size / 1024);
  showToast(`Compressing ${origSize}KB photo...`, '');

  try {
    selectedPhotoFile = await compressImage(input.files[0], 50);
    const newSize = Math.round(selectedPhotoFile.size / 1024);

    const reader = new FileReader();
    reader.onload = e => {
      selectedPhotoUrl = e.target.result;
      const initial = document.getElementById('photo-initial');
      if (initial) initial.style.display = 'none';
      const wrap = document.getElementById('photo-preview-wrap');
      let img = wrap.querySelector('img');
      if (!img) { img = document.createElement('img'); img.className = 'avatar-img'; wrap.appendChild(img); }
      img.src = selectedPhotoUrl;

      // Show size info
      const sizeInfo = document.getElementById('photo-size-info');
      if (sizeInfo) sizeInfo.textContent = `${origSize}KB → ${newSize}KB ✅`;

      showToast(`Photo ready! ${origSize}KB → ${newSize}KB ✅`, 'success');
    };
    reader.readAsDataURL(selectedPhotoFile);
  } catch(e) {
    showToast('Photo error! Try again', 'error');
  }
}

async function saveClient() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { showErr(document.getElementById('cm-err'), 'Name required / नाम आवश्यक है'); return; }

  // Check OTP verification
  if (!editingClientId && !otpVerified) {
    showErr(document.getElementById('cm-err'), '⚠️ OTP verify करें पहले! Phone पर OTP भेजें');
    document.getElementById('otp-section')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const btn = document.querySelector('#client-modal .btn-primary');
  btn.disabled = true; btn.textContent = '📸 Uploading...';

  let photoUrl = null;
  // Upload profile photo first
  if (selectedPhotoFile) {
    btn.textContent = '📸 Profile photo...';
    try {
      const compressed = await compressImage(selectedPhotoFile, 50);
      const path = currentUser.id + '/profile_' + Date.now() + '.jpg';
      const { data: up, error: upErr } = await db.storage.from('client-photos').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (up) {
        const { data: pu } = db.storage.from('client-photos').getPublicUrl(path);
        photoUrl = pu.publicUrl;
      } else if (upErr) console.error('Profile upload error:', upErr);
    } catch(e) { console.error('Profile compress error:', e); }
  }

  // Upload Aadhaar photo
  if (aadhaarPhotoFile) {
    btn.textContent = '📸 Aadhaar photo...';
    try {
      const compressed = await compressImage(aadhaarPhotoFile, 50);
      const path = currentUser.id + '/aadhaar_' + Date.now() + '.jpg';
      const { data: up } = await db.storage.from('client-photos').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (up) { const { data: pu } = db.storage.from('client-photos').getPublicUrl(path); payload.aadhaar_photo = pu.publicUrl; }
    } catch(e) { console.error('Aadhaar upload error:', e); }
  }

  // Upload PAN photo
  if (panPhotoFile) {
    btn.textContent = '📸 PAN photo...';
    try {
      const compressed = await compressImage(panPhotoFile, 50);
      const path = currentUser.id + '/pan_' + Date.now() + '.jpg';
      const { data: up } = await db.storage.from('client-photos').upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (up) { const { data: pu } = db.storage.from('client-photos').getPublicUrl(path); payload.pan_photo = pu.publicUrl; }
    } catch(e) { console.error('PAN upload error:', e); }
  }

  const assignTo = currentProfile.role === 'admin'
    ? document.getElementById('f-assign').value
    : currentUser.id;

  // Auto generate unique Customer ID and Loan ID
  const year = new Date().getFullYear();
  const uniqueNum = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  const custId = editingClientId ? null : 'CUS-' + year + '-' + uniqueNum;
  const loanId = v('f-loan-id') || (editingClientId ? null : 'LOAN-' + year + '-' + uniqueNum);

  const payload = {
    name, assigned_to: assignTo, owner_id: currentUser.id,
    father_name: v('f-father'), mother_name: v('f-mother'),
    dob: v('f-dob') || null,
    client_type: document.getElementById('f-type').value,
    status: document.getElementById('f-status').value,
    email: v('f-email'), phone: v('f-phone'), phone2: v('f-phone2'),
    address: v('f-address'), city: v('f-city'), state: v('f-state'),
    pin_code: v('f-pin'), country: v('f-country'),
    aadhaar_no: v('f-aadhaar'), pan_no: v('f-pan').toUpperCase(),
    balance: parseFloat(v('f-balance')) || 0,
    bank_name: v('f-bank'),
    notes: v('f-notes'),
    loan_id: loanId,
    husband_wife_name: v('f-spouse'),
    marital_status: document.getElementById('f-marital')?.value || 'unmarried',
    address2: v('f-address2'),
    interest_amount: parseFloat(v('f-interest')) || 0,
    finance_company: v('f-bank'),
    kyc_approved: document.getElementById('f-kyc-approved')?.value === 'true',
    center_name: v('f-center-name'),
    center_code: v('f-center-code'),
    center_leader: v('f-center-leader'),
    meeting_day: document.getElementById('f-meeting-day')?.value || '',
    loan_cycle: document.getElementById('f-loan-cycle')?.value || '1st',
    loan_purpose: document.getElementById('f-loan-purpose')?.value || '',
    age: parseInt(v('f-age')) || null,
    member_no: v('f-member-no'),
    guarantor_name: v('f-guarantor'),
    membership_date: v('f-membership-date') || null,
    loan_date: v('f-loan-date') || null,
    first_emi_date: v('f-first-emi-date') || null,
    card_issue_date: v('f-card-date') || null,
  };
  if (custId) payload.customer_id = custId;
  if (photoUrl) payload.photo_url = photoUrl;
  console.log('Final payload photo_url:', photoUrl);
  console.log('Saving client with', Object.keys(payload).filter(k => payload[k]).length, 'fields');

  let error;
  if (editingClientId) {
    ({ error } = await db.from('clients').update(payload).eq('id', editingClientId));
  } else {
    ({ error } = await db.from('clients').insert(payload));
  }

  btn.textContent = '💾 Saving data...';
  btn.disabled = false;
  if (error) {
    btn.textContent = 'Save / सहेजें';
    btn.disabled = false;
    showErr(document.getElementById('cm-err'), error.message);
    return;
  }

  // Get saved client ID
  let savedClientId = editingClientId;
  if (!editingClientId) {
    const { data: latest } = await db.from('clients').select('id')
      .eq('owner_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1).single();
    savedClientId = latest?.id;
  }

  // Upload photos NOW before closing
  if (savedClientId && (selectedPhotoFile || aadhaarPhotoFile || panPhotoFile)) {
    btn.disabled = true;
    btn.textContent = '📸 Uploading photos...';
    await uploadPhotosInBackground(savedClientId);
    btn.disabled = false;
    btn.textContent = 'Save / सहेजें';
  }

  closeModal('client-modal');
  showToast(editingClientId ? '✅ Updated!' : '✅ Client added!', 'success');

  selectedPhotoFile = null;
  otpVerified = false;
  generatedOTP = null;
  aadhaarPhotoFile = null;
  panPhotoFile = null;
  await loadAll();
  showPage(currentPage);
}

async function deleteClient() {
  if (!confirm('Delete this client? / इस ग्राहक को हटाएं?')) return;
  await db.from('clients').delete().eq('id', editingClientId);
  closeModal('client-modal');
  showToast('Deleted / हटाया गया');
  await loadAll();
  showPage(currentPage);
}

// ── DETAIL ────────────────────────────────
async function openDetail(id) {
  activeClientId = id;
  const c = allClients.find(x => x.id === id);
  if (!c) return;

  // Fresh load payments for this client
  const { data: freshPayments } = await db.from('payments').select('*').eq('client_id', id).order('created_at', { ascending: false });
  const payments = freshPayments || allPayments.filter(p => p.client_id === id);
  const bal = parseFloat(c.balance) || 0;
  const emp = allEmployees.find(e => e.id === c.assigned_to);

  const photoHtml = c.photo_url
    ? `<img src="${c.photo_url}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:50%"/>`
    : '';

  document.getElementById('detail-content').innerHTML = `
    <div class="modal-handle"></div>
    <div class="detail-header">
      <div class="detail-avatar-lg">${c.name?.charAt(0).toUpperCase()||'?'}${photoHtml}</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy)">${c.name}</div>
        <div style="font-size:11px;color:var(--muted)">${emp ? 'Assigned: '+emp.name : ''}</div>
        <span class="status-badge ${{active:'status-active',inactive:'status-inactive',vip:'status-vip'}[c.status]||'status-active'}">${{active:'Active',inactive:'Inactive',vip:'⭐ VIP'}[c.status]||'Active'}</span>
      </div>
    </div>

    <div class="big-balance">
      <div class="label">Balance / बैलेंस</div>
      <div class="amount" style="color:${bal>=0?'var(--success)':'var(--danger)'}">₹${fmt(bal)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">👤 Personal / व्यक्तिगत</div>
      ${dRow('Father / पिता',c.father_name)}
      ${dRow('Mother / माता',c.mother_name)}
      ${dRow('DOB / जन्म तिथि',c.dob)}
      ${dRow('Type / प्रकार',c.client_type)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📞 Contact / संपर्क</div>
      ${dRow('Email',c.email)}
      ${dRow('Phone / फोन',c.phone)}
      ${dRow('Alt Phone',c.phone2)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🏠 Address / पता</div>
      ${dRow('Address',c.address)}
      ${dRow('City / शहर',c.city)}
      ${dRow('State / राज्य',c.state)}
      ${dRow('PIN',c.pin_code)}
      ${dRow('Country / देश',c.country)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🔢 IDs</div>
      ${dRow('Customer ID / ग्राहक ID', c.customer_id)}
      ${dRow('Loan ID / लोन ID', c.loan_id)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">💑 Family / परिवार</div>
      ${dRow('Marital Status / वैवाहिक', c.marital_status)}
      ${dRow('Husband/Wife / पति-पत्नी', c.husband_wife_name)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">🪪 KYC</div>
      ${dRow('Aadhaar / आधार',c.aadhaar_no ? maskAadhaar(c.aadhaar_no) : '—')}
      ${dRow('PAN',c.pan_no)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🏦 Finance / वित्त</div>
      ${dRow('Loan Amount / लोन राशि', c.balance ? '₹'+fmt(parseFloat(c.balance)||0) : '—')}
      ${dRow('Interest Amount / ब्याज', c.interest_amount ? '₹'+fmt(parseFloat(c.interest_amount)||0) : '—')}
      ${dRow('Meeting Day / मीटिंग दिन', c.finance_company || c.bank_name)}
      ${dRow('Customer ID', c.customer_id || c.account_no)}
      ${dRow('Loan Cycle / वां लोन', c.loan_cycle)}
      ${dRow('Loan Purpose / उद्देश्य', c.loan_purpose)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🏘️ Center / सेंटर</div>
      ${dRow('Center Name / सेंटर नाम', c.center_name)}
      ${dRow('Center Code / कोड', c.center_code)}
      ${dRow('Center Leader / लीडर', c.center_leader)}
      ${dRow('Meeting Day / मीटिंग', c.meeting_day)}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">💰 Payments / भुगतान (${payments.length})</div>
      ${payments.length ? payments.slice(0,5).map(p => `
        <div class="payment-item">
          <div class="pay-icon ${p.type==='credit'?'pay-in':'pay-out'}">${p.type==='credit'?'✅':'❌'}</div>
          <div class="pay-info">
            <div class="pay-desc">${p.description||'Cash'} <span style="font-size:10px;color:var(--muted);font-weight:400">(pay mode)</span></div>
            <div class="pay-date">${p.date||''}</div>
          </div>
          <div class="pay-amount" style="color:${p.type==='credit'?'var(--success)':'var(--danger)'}">
            ${p.type==='credit'?'+':'-'}₹${fmt(parseFloat(p.amount)||0)}
          </div>
        </div>`).join('') : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:10px">No payments yet</div>'}
      <button class="pay-add-btn" onclick="openPayModal()">+ Add Payment / भुगतान जोड़ें</button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🪪 KYC Documents</div>
      ${dRow('Aadhaar / आधार', c.aadhaar_no ? maskAadhaar(c.aadhaar_no) : '—')}
      ${dRow('PAN', c.pan_no)}
      ${dRow('KYC Status', c.kyc_approved ? '✅ Approved' : '⏳ Pending')}
      ${c.aadhaar_photo ? `<div style="margin-top:8px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">Aadhaar Photo:</div><img src="${c.aadhaar_photo}" style="width:100%;border-radius:8px;max-height:120px;object-fit:cover"/></div>` : ''}
      ${c.pan_photo ? `<div style="margin-top:8px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">PAN Photo:</div><img src="${c.pan_photo}" style="width:100%;border-radius:8px;max-height:120px;object-fit:cover"/></div>` : ''}
    </div>
    ${c.notes ? `<div class="detail-section"><div class="detail-section-title">📝 Notes / टिप्पणी</div><div style="font-size:13px;color:var(--muted);line-height:1.6">${c.notes}</div></div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button onclick="showEMICalculator()" style="padding:10px;background:#f0f4f8;border:1px solid var(--border);border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;color:var(--navy)">📐 EMI Calc</button>
      <button onclick="sendWhatsAppReminder('${c.id}')" style="padding:10px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;color:#166534">📱 WhatsApp</button>
      <button onclick="captureGPSLocation('${c.id}')" style="padding:10px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;color:#854d0e">📍 GPS</button>
      <button onclick="downloadClientPDF('${c.id}')" style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;color:var(--danger)">🖨️ PDF</button>
      ${c.dob ? `<button onclick="sendBirthdayWish('${c.id}')" style="padding:10px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;color:var(--purple)">🎂 Birthday Wish</button>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal('detail-modal')">Close / बंद</button>
      <button class="btn-primary" style="flex:2" onclick="openEditClient(allClients.find(x=>x.id==='${c.id}'))">Edit / संपादित</button>
    </div>
  `;
  openModal('detail-modal');
}

// ── PAYMENTS ──────────────────────────────
function openPayModal() {
  document.getElementById('pay-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('pay-desc').value = '';
  document.getElementById('pay-amt').value = '';
  document.getElementById('pay-type').value = 'credit';
  openModal('pay-modal');
}

async function savePayment() {
  const amt = parseFloat(document.getElementById('pay-amt').value);
  const desc = document.getElementById('pay-desc').value.trim();
  if (!amt || !desc) { showToast('Fill all fields / सभी फ़ील्ड भरें', 'error'); return; }

  const { error } = await db.from('payments').insert({
    client_id: activeClientId,
    amount: amt,
    type: document.getElementById('pay-type').value,
    description: desc,
    date: document.getElementById('pay-date').value,
    created_by: currentUser.id
  });
  if (error) { showToast(error.message, 'error'); return; }
  closeModal('pay-modal');
  showToast('Payment added! / भुगतान जोड़ा!', 'success');
  await loadAll();
  openDetail(activeClientId);
}

// ── MORE PAGE ────────────────────────────
let moreTab = 'emi';

function renderInvoicesPage(c) {
  c.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--navy)">☰ More / अधिक</div>
      <div style="font-size:12px;color:var(--muted)">EMI, Passbook & Meeting Day</div>
    </div>

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px">
      <button class="tab ${moreTab==='emi'?'active':''}" onclick="switchMoreTab('emi',this)" style="flex:1">📅 EMI Tracker</button>
      <button class="tab ${moreTab==='passbook'?'active':''}" onclick="switchMoreTab('passbook',this)" style="flex:1">📒 Passbook</button>
      <button class="tab ${moreTab==='meeting'?'active':''}" onclick="switchMoreTab('meeting',this)" style="flex:1">🏘️ Meeting</button>
    </div>

    <div id="more-content">
      ${moreTab==='emi' ? renderEMITab() : moreTab==='passbook' ? renderPassbookTab() : renderMeetingTab()}
    </div>
  `;
}

function switchMoreTab(tab, btn) {
  moreTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const c = document.getElementById('more-content');
  if (c) c.innerHTML = tab==='emi' ? renderEMITab() : tab==='passbook' ? renderPassbookTab() : renderMeetingTab();
}

// ── EMI TAB ───────────────────────────────
function renderEMICard(cl) {
  const payments = allPayments.filter(p => p.client_id === cl.id && p.type === 'credit');
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount)||0), 0);
  const loanAmt = parseFloat(cl.balance) || 0;
  const interest = parseFloat(cl.interest_amount) || 0;
  const totalDue = loanAmt + interest;
  const pending = Math.max(0, totalDue - totalPaid);
  const paidPct = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 0;
  const installCount = payments.length;

  let status = 'pending', statusLabel = '⏳ Pending', statusColor = '#f59e0b', bgColor = '#fffbeb';
  if (paidPct >= 100) { status = 'complete'; statusLabel = '✅ Complete'; statusColor = '#22c55e'; bgColor = '#f0fdf4'; }
  else if (paidPct > 0) { status = 'partial'; statusLabel = '🔄 Partial'; statusColor = '#3b82f6'; bgColor = '#eff6ff'; }

  // Next EMI due date
  let nextDueHtml = '';
  if (paidPct < 100) {
    const lastPay = payments[0];
    let nextDue = '';
    let nextAmt = loanAmt > 0 ? Math.round((loanAmt + interest) / 12) : 0;
    if (lastPay && lastPay.date) {
      const last = new Date(lastPay.date);
      last.setMonth(last.getMonth() + 1);
      nextDue = last.toISOString().slice(0,10);
    } else {
      const now = new Date();
      now.setMonth(now.getMonth() + 1);
      nextDue = now.toISOString().slice(0,10);
    }
    const isOverdue = nextDue && new Date(nextDue) < new Date();
    nextDueHtml = `<div style="background:${isOverdue?'#fef2f2':'#fffbeb'};border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:${isOverdue?'var(--danger)':'#854d0e'}">${isOverdue?'⚠️ OVERDUE':'📅 Next EMI'}</div>
        <div style="font-size:13px;font-weight:700;color:var(--navy)">${nextDue} — ₹${fmt(nextAmt)}</div>
      </div>
      ${isOverdue ? '<span style="font-size:10px;font-weight:700;color:var(--danger);background:#fecaca;padding:3px 8px;border-radius:8px">OVERDUE</span>' : ''}
    </div>`;
  }

  return `
    <div class="client-card" style="flex-direction:column;align-items:stretch;cursor:default;margin-bottom:12px" data-status="${status}" data-name="${cl.name.toLowerCase()}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="client-avatar" style="width:44px;height:44px;font-size:16px;flex-shrink:0">${cl.name?.charAt(0).toUpperCase()}
          ${cl.photo_url ? `<img src="${cl.photo_url}" class="avatar-img"/>` : ''}
        </div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px;color:var(--navy)">${cl.name}</div>
          <div style="font-size:11px;color:var(--muted)">${cl.customer_id||''} ${cl.phone?'· '+cl.phone:''}</div>
        </div>
        <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;background:${bgColor};color:${statusColor}">${statusLabel}</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:#f8fafc;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Loan</div>
          <div style="font-size:13px;font-weight:700;color:var(--navy)">₹${fmt(loanAmt)}</div>
        </div>
        <div style="background:#dcfce7;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Paid</div>
          <div style="font-size:13px;font-weight:700;color:var(--success)">₹${fmt(totalPaid)}</div>
        </div>
        <div style="background:#fef2f2;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Balance</div>
          <div style="font-size:13px;font-weight:700;color:var(--danger)">₹${fmt(pending)}</div>
        </div>
      </div>

      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px">
          <span>${installCount} installments paid</span>
          <span style="font-weight:700;color:${statusColor}">${paidPct}%</span>
        </div>
        <div style="background:#e2e8f0;border-radius:10px;height:8px;overflow:hidden">
          <div style="background:${paidPct>=100?'#22c55e':paidPct>0?'#3b82f6':'#f59e0b'};width:${paidPct}%;height:100%;border-radius:10px"></div>
        </div>
      </div>

      ${nextDueHtml}

      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;color:var(--muted)">
          ${payments.length > 0 ? `Last: ₹${fmt(parseFloat(payments[0].amount)||0)} on ${payments[0].date||''}` : 'No payment yet'}
        </div>
        <button onclick="activeClientId='${cl.id}';openPayModal()" style="background:var(--navy);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">+ किस्त</button>
      </div>

      ${payments.length > 0 ? `
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Payment History</div>
        ${payments.slice(0,3).map((p,i) => `
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
            <span style="color:var(--muted)">${i+1}. ${p.date||'—'} — ${p.description||'Cash'}</span>
            <span style="font-weight:700;color:var(--success)">+₹${fmt(parseFloat(p.amount)||0)}</span>
          </div>`).join('')}
        ${payments.length > 3 ? `<div style="text-align:center;font-size:11px;color:var(--muted);padding:4px">+${payments.length-3} more</div>` : ''}
      </div>` : ''}
    </div>`;
}

function renderEMITab() {
  const clientsWithLoans = allClients.filter(cl => parseFloat(cl.balance) > 0);
  const totalLoan = clientsWithLoans.reduce((s, cl) => s + (parseFloat(cl.balance)||0), 0);
  const totalPaid = allPayments.filter(p => p.type==='credit').reduce((s, p) => s + (parseFloat(p.amount)||0), 0);
  const totalPending = Math.max(0, totalLoan - totalPaid);

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--navy);border-radius:14px;padding:14px;color:white">
        <div style="font-size:9px;opacity:.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">कुल लोन</div>
        <div style="font-size:18px;font-weight:700;font-family:'Playfair Display',serif">₹${fmt(totalLoan)}</div>
      </div>
      <div style="background:#dcfce7;border-radius:14px;padding:14px">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">कुल भुगतान</div>
        <div style="font-size:18px;font-weight:700;color:var(--success);font-family:'Playfair Display',serif">₹${fmt(totalPaid)}</div>
      </div>
      <div style="background:#fef2f2;border-radius:14px;padding:14px">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">बाकी</div>
        <div style="font-size:18px;font-weight:700;color:var(--danger);font-family:'Playfair Display',serif">₹${fmt(totalPending)}</div>
      </div>
      <div style="background:#fef9c3;border-radius:14px;padding:14px">
        <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Active Loans</div>
        <div style="font-size:18px;font-weight:700;color:var(--warning);font-family:'Playfair Display',serif">${clientsWithLoans.length}</div>
      </div>
    </div>

    <input class="search-bar" id="emi-search" placeholder="🔍 ग्राहक खोजें..." oninput="filterEMIList()"/>

    <div class="tabs" style="margin-bottom:12px">
      <button class="tab active" onclick="filterEMITab('all',this)">सभी</button>
      <button class="tab" onclick="filterEMITab('pending',this)">Pending ⏳</button>
      <button class="tab" onclick="filterEMITab('partial',this)">Partial 🔄</button>
      <button class="tab" onclick="filterEMITab('complete',this)">Complete ✅</button>
    </div>

    <div id="emi-list">
      ${clientsWithLoans.length === 0
        ? emptyState('📅','No loans yet / कोई लोन नहीं')
        : clientsWithLoans.map(cl => renderEMICard(cl)).join('')}
    </div>
    <button onclick="exportPaymentsExcel()" style="width:100%;padding:12px;background:var(--success);color:white;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px">📥 Export Excel</button>
  `;
}

// ── PASSBOOK TAB ──────────────────────────
function renderPassbookTab() {
  const clientsWithLoans = allClients.filter(cl => parseFloat(cl.balance) > 0);

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px">📒 Client Passbook / पासबुक</div>
      <select id="passbook-client" onchange="showPassbook(this.value)" style="width:100%;padding:11px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;font-family:Lato,sans-serif;background:white;outline:none">
        <option value="">-- Client चुनें --</option>
        ${allClients.map(c => `<option value="${c.id}">${c.name} ${c.customer_id?'('+c.customer_id+')':''}</option>`).join('')}
      </select>
    </div>
    <div id="passbook-content">${emptyState('📒','Client चुनें passbook देखने के लिए')}</div>
  `;
}

async function showPassbook(clientId) {
  if (!clientId) return;
  const c = allClients.find(x => x.id === clientId);
  if (!c) return;

  const { data: payments } = await db.from('payments').select('*').eq('client_id', clientId).order('date', { ascending: true });
  const pays = payments || [];

  const loanAmt = parseFloat(c.balance) || 0;
  const interest = parseFloat(c.interest_amount) || 0;
  const totalDue = loanAmt + interest;
  let runningBalance = totalDue;
  let totalPaid = 0;

  const rows = pays.map((p, i) => {
    const amt = parseFloat(p.amount) || 0;
    if (p.type === 'credit') { runningBalance -= amt; totalPaid += amt; }
    else runningBalance += amt;
    return `
      <tr style="background:${i%2===0?'white':'#f8fafc'}">
        <td style="padding:8px;font-size:11px;color:var(--muted)">${i+1}</td>
        <td style="padding:8px;font-size:11px">${p.date||'—'}</td>
        <td style="padding:8px;font-size:11px">${p.description||'Cash'}</td>
        <td style="padding:8px;font-size:12px;font-weight:700;color:${p.type==='credit'?'var(--success)':'var(--danger)'};text-align:right">
          ${p.type==='credit'?'+':'-'}₹${fmt(amt)}
        </td>
        <td style="padding:8px;font-size:12px;font-weight:700;color:var(--danger);text-align:right">₹${fmt(Math.max(0,runningBalance))}</td>
      </tr>`;
  }).join('');

  document.getElementById('passbook-content').innerHTML = `
    <!-- Passbook Header -->
    <div style="background:var(--navy);border-radius:14px;padding:16px;margin-bottom:12px;color:white">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;font-family:serif;color:var(--gold)">${c.name?.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:16px;font-weight:700">${c.name}</div>
          <div style="font-size:11px;opacity:.7">${c.customer_id||''} ${c.loan_id?'| '+c.loan_id:''}</div>
          <div style="font-size:11px;opacity:.7">${c.center_name||''} ${c.meeting_day?'| '+c.meeting_day:''}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;opacity:.6;margin-bottom:2px">Loan</div>
          <div style="font-size:13px;font-weight:700">₹${fmt(loanAmt)}</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;opacity:.6;margin-bottom:2px">Paid</div>
          <div style="font-size:13px;font-weight:700;color:#86efac">₹${fmt(totalPaid)}</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;opacity:.6;margin-bottom:2px">Balance</div>
          <div style="font-size:13px;font-weight:700;color:#fca5a5">₹${fmt(Math.max(0,runningBalance))}</div>
        </div>
      </div>
    </div>

    <!-- Transaction Table -->
    ${pays.length === 0 ? emptyState('📒','No transactions yet') : `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:12px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--navy);color:white">
            <th style="padding:8px;text-align:left">#</th>
            <th style="padding:8px;text-align:left">Date</th>
            <th style="padding:8px;text-align:left">Mode</th>
            <th style="padding:8px;text-align:right">Amount</th>
            <th style="padding:8px;text-align:right">Balance</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`}

    <div style="display:flex;gap:8px;margin-top:12px">
      <button onclick="downloadClientPDF('${clientId}')" style="flex:1;padding:11px;background:var(--navy);color:white;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Print Passbook</button>
      <button onclick="activeClientId='${clientId}';openPayModal()" style="flex:1;padding:11px;background:var(--success);color:white;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">+ किस्त जोड़ें</button>
    </div>
  `;
}

// ── MEETING DAY TAB ───────────────────────
function renderMeetingTab() {
  const days = ['Monday / सोमवार','Tuesday / मंगलवार','Wednesday / बुधवार','Thursday / गुरुवार','Friday / शुक्रवार','Saturday / शनिवार','Sunday / रविवार'];

  return `
    <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:14px">🏘️ Meeting Day Schedule / मीटिंग अनुसूची</div>

    ${days.map(day => {
      const clients = allClients.filter(c => c.meeting_day === day);
      if (!clients.length) return '';
      return `
        <div style="background:white;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 2px 8px rgba(15,37,71,.07)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-weight:700;color:var(--navy);font-size:14px">📅 ${day}</div>
            <span style="background:var(--navy);color:white;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">${clients.length} clients</span>
          </div>
          ${clients.map(c => {
            const pays = allPayments.filter(p => p.client_id === c.id && p.type==='credit');
            const paid = pays.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
            const pending = Math.max(0,(parseFloat(c.balance)||0) - paid);
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border)" onclick="openDetail('${c.id}')">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--navy2),var(--navy));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--gold);flex-shrink:0">${c.name?.charAt(0).toUpperCase()}</div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:700;color:var(--navy)">${c.name}</div>
                  <div style="font-size:10px;color:var(--muted)">${c.center_name||''} ${c.center_leader?'| Leader: '+c.center_leader:''}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:12px;font-weight:700;color:var(--danger)">₹${fmt(pending)}</div>
                  <div style="font-size:10px;color:var(--muted)">pending</div>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('') || emptyState('🏘️','No meeting scheduled<br>Client में Meeting Day set करें')}
  `;
}

function exportPaymentsExcel() {
  if (!allPayments.length) { showToast('No payments to export', 'error'); return; }
  
  let csv = 'Date,Client Name,Customer ID,Pay Mode,Amount,Type,Outstanding\n';
  let clientBal = {};
  allClients.forEach(cl => { clientBal[cl.id] = parseFloat(cl.balance)||0; });
  allPayments.forEach(p => {
    const client = allClients.find(c => c.id === p.client_id);
    if (p.type === 'credit') clientBal[p.client_id] = Math.max(0,(clientBal[p.client_id]||0)-(parseFloat(p.amount)||0));
    csv += `"${p.date||''}","${client?.name||'Unknown'}","${client?.customer_id||''}","${p.description||'Cash'}","${p.amount||0}","${p.type==='credit'?'Received':'Paid'}","${clientBal[p.client_id]||0}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payment_history_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel exported! / Excel डाउनलोड हुआ! 📥', 'success');
}

function exportClientsExcel() {
  if (!allClients.length) { showToast('No clients to export', 'error'); return; }
  
  let csv = 'Customer ID,Name,Father,Mother,Phone,Email,City,Aadhaar,PAN,Loan Amount,Interest,Status\n';
  allClients.forEach(c => {
    csv += `"${c.customer_id||''}","${c.name||''}","${c.father_name||''}","${c.mother_name||''}","${c.phone||''}","${c.email||''}","${c.city||''}","${c.aadhaar_no||''}","${c.pan_no||''}","${c.balance||0}","${c.interest_amount||0}","${c.status||''}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clients_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Clients exported! 📥', 'success');
}

// ── EMI CALCULATOR ────────────────────────
function calcEMI(principal, ratePerMonth, months) {
  if (!ratePerMonth) return principal / months;
  const r = ratePerMonth / 100;
  return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
}

function generateRepaymentSchedule(principal, ratePerPeriod, periods, startDate, isWeekly = false) {
  const emi = calcEMI(principal, ratePerPeriod, periods);
  let balance = principal;
  const schedule = [];
  const start = new Date(startDate || Date.now());
  for (let i = 1; i <= periods; i++) {
    const interest = balance * (ratePerPeriod / 100);
    const principalPaid = emi - interest;
    balance -= principalPaid;
    const dueDate = new Date(start);
    if (isWeekly) dueDate.setDate(dueDate.getDate() + (i * 7));
    else dueDate.setMonth(dueDate.getMonth() + i);
    schedule.push({
      installment: i,
      dueDate: dueDate.toISOString().slice(0, 10),
      emi: Math.round(emi),
      principal: Math.round(principalPaid),
      interest: Math.round(interest),
      balance: Math.max(0, Math.round(balance))
    });
  }
  return schedule;
}

function showEMICalculator() {
  const c = allClients.find(x => x.id === activeClientId);
  const modal = document.getElementById('detail-content');
  const existingEMI = document.getElementById('emi-section');
  if (existingEMI) { existingEMI.remove(); return; }

  const emiDiv = document.createElement('div');
  emiDiv.id = 'emi-section';
  emiDiv.style.cssText = 'background:#f8fafc;border-radius:12px;padding:16px;margin:12px 0';
  emiDiv.innerHTML = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--gold);margin-bottom:12px">📐 EMI Calculator / EMI कैलकुलेटर</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Loan Amount (₹)</div>
        <input id="emi-principal" type="number" value="${c?.balance||0}" style="width:100%;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none"/>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">EMI Type / प्रकार</div>
        <select id="emi-type" style="width:100%;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none;background:white">
          <option value="monthly">Monthly / मासिक</option>
          <option value="weekly">Weekly / साप्ताहिक</option>
        </select>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Interest Rate (%)</div>
        <input id="emi-rate" type="number" value="2" step="0.1" style="width:100%;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none"/>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Tenure (months/weeks)</div>
        <input id="emi-months" type="number" value="12" style="width:100%;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none"/>
      </div>
      <div style="grid-column:span 2">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Start Date / शुरू तारीख</div>
        <input id="emi-start" type="date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none"/>
      </div>
    </div>
    <button onclick="calculateAndShowEMI()" style="width:100%;padding:11px;background:var(--navy);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:10px">Calculate EMI / कैलकुलेट करें 📐</button>
    <div id="emi-result"></div>
  `;
  modal.insertBefore(emiDiv, modal.querySelector('.modal-actions'));
}

function calculateAndShowEMI() {
  const principal = parseFloat(document.getElementById('emi-principal').value) || 0;
  const rate = parseFloat(document.getElementById('emi-rate').value) || 0;
  const periods = parseInt(document.getElementById('emi-months').value) || 12;
  const startDate = document.getElementById('emi-start').value;
  const emiType = document.getElementById('emi-type')?.value || 'monthly';
  const isWeekly = emiType === 'weekly';
  
  // For weekly: convert monthly rate to weekly
  const periodRate = isWeekly ? rate / 4.33 : rate;
  const periodLabel = isWeekly ? 'Week' : 'Month';
  
  const emi = Math.round(calcEMI(principal, periodRate, periods));
  const totalPayable = emi * periods;
  const totalInterest = totalPayable - principal;
  const months = isWeekly ? Math.ceil(periods / 4.33) : periods;
  const schedule = generateRepaymentSchedule(principal, periodRate, periods, startDate, isWeekly);

  document.getElementById('emi-result').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--navy);color:white;border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;opacity:.7;margin-bottom:3px">${isWeekly?'Weekly':'Monthly'} EMI</div>
        <div style="font-size:16px;font-weight:700">₹${fmt(emi)}</div>
      </div>
      <div style="background:#dcfce7;border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Total Payable</div>
        <div style="font-size:16px;font-weight:700;color:var(--success)">₹${fmt(totalPayable)}</div>
      </div>
      <div style="background:#fef9c3;border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Total Interest</div>
        <div style="font-size:16px;font-weight:700;color:var(--warning)">₹${fmt(totalInterest)}</div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:8px">📅 Repayment Schedule / भुगतान अनुसूची</div>
    <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:var(--navy);color:white">
            <th style="padding:6px 8px;text-align:left">${isWeekly?'Week':'Month'}</th>
            <th style="padding:6px 8px;text-align:left">Due Date</th>
            <th style="padding:6px 8px;text-align:right">${isWeekly?'Weekly':'Monthly'} EMI</th>
            <th style="padding:6px 8px;text-align:right">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${schedule.map((s, i) => `
            <tr style="background:${i%2===0?'white':'#f8fafc'}">
              <td style="padding:6px 8px">${s.installment}</td>
              <td style="padding:6px 8px">${s.dueDate}</td>
              <td style="padding:6px 8px;text-align:right;font-weight:600">₹${fmt(s.emi)}</td>
              <td style="padding:6px 8px;text-align:right;color:var(--danger)">₹${fmt(s.balance)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── GPS LOCATION ──────────────────────────
async function captureGPSLocation(clientId) {
  if (!navigator.geolocation) { showToast('GPS not supported / GPS सपोर्ट नहीं', 'error'); return; }
  showToast('Getting location... / लोकेशन ले रहे हैं...', '');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const locationData = {
        lat: latitude,
        lng: longitude,
        accuracy: Math.round(accuracy),
        timestamp: new Date().toISOString(),
        captured_by: currentUser.id
      };
      await db.from('clients').update({
        gps_lat: latitude,
        gps_lng: longitude,
        gps_captured_at: new Date().toISOString()
      }).eq('id', clientId);
      showToast(`📍 Location saved! ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
      const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      const link = document.getElementById('gps-link-' + clientId);
      if (link) { link.href = mapsUrl; link.style.display = 'inline-block'; }
    },
    (err) => { showToast('GPS error: ' + err.message, 'error'); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ── DAILY COLLECTION REPORT ───────────────
async function showDailyCollectionReport() {
  const today = new Date().toISOString().slice(0, 10);
  const todayPayments = allPayments.filter(p => p.date === today && p.type === 'credit');
  const totalToday = todayPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  // Group by employee
  const byEmployee = {};
  for (const p of todayPayments) {
    const client = allClients.find(c => c.id === p.client_id);
    const emp = allEmployees.find(e => e.id === client?.assigned_to);
    const empName = emp?.name || 'Unknown';
    if (!byEmployee[empName]) byEmployee[empName] = { total: 0, count: 0, payments: [] };
    byEmployee[empName].total += parseFloat(p.amount) || 0;
    byEmployee[empName].count++;
    byEmployee[empName].payments.push({ ...p, clientName: client?.name || 'Unknown' });
  }

  const c = document.getElementById('main-content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="showPage('${currentPage}')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy)">📋 Daily Collection</div>
        <div style="font-size:12px;color:var(--muted)">${today}</div>
      </div>
    </div>

    <div style="background:var(--navy);border-radius:14px;padding:16px;margin-bottom:16px;text-align:center">
      <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px">आज का कुल संग्रह / Today's Total Collection</div>
      <div style="font-size:36px;font-weight:700;color:var(--gold);font-family:'Playfair Display',serif">₹${fmt(totalToday)}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.6)">${todayPayments.length} payments collected</div>
    </div>

    ${Object.keys(byEmployee).length === 0 ? `<div class="empty"><div class="empty-icon">📋</div><p>No collections today / आज कोई संग्रह नहीं</p></div>` :
    Object.entries(byEmployee).map(([empName, data]) => `
      <div style="background:white;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:0 2px 8px rgba(15,37,71,.07)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:700;color:var(--navy)">👤 ${empName}</div>
          <div style="font-weight:700;color:var(--success);font-family:'Playfair Display',serif">₹${fmt(data.total)}</div>
        </div>
        ${data.payments.map(p => `
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid var(--border);font-size:13px">
            <span style="color:var(--muted)">${p.clientName}</span>
            <span style="font-weight:600;color:var(--success)">+₹${fmt(parseFloat(p.amount))}</span>
          </div>`).join('')}
      </div>`).join('')}

    <button onclick="printReport()" style="width:100%;padding:12px;background:var(--navy);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;margin-top:8px">🖨️ Print Report / रिपोर्ट प्रिंट करें</button>
  `;
}

// ── NPA / OVERDUE TRACKING ─────────────────
function showNPAReport() {
  const today = new Date();
  const overdueClients = allClients.filter(c => {
    const payments = allPayments.filter(p => p.client_id === c.id && p.type === 'credit');
    const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const loanAmt = parseFloat(c.balance) || 0;
    const daysSinceCreated = Math.floor((today - new Date(c.created_at)) / (1000 * 60 * 60 * 24));
    return loanAmt > totalPaid && daysSinceCreated > 30;
  });

  const c = document.getElementById('main-content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="showPage('dashboard')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy)">⚠️ NPA / Overdue Report</div>
        <div style="font-size:12px;color:var(--muted)">बकाया ग्राहक</div>
      </div>
    </div>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:14px;margin-bottom:16px;text-align:center">
      <div style="font-size:11px;color:var(--danger);text-transform:uppercase;letter-spacing:1px">Total Overdue Clients / कुल बकाया</div>
      <div style="font-size:36px;font-weight:700;color:var(--danger);font-family:'Playfair Display',serif">${overdueClients.length}</div>
    </div>

    ${overdueClients.length === 0 ? `<div class="empty"><div class="empty-icon">✅</div><p>No overdue clients! / कोई बकाया नहीं!</p></div>` :
    overdueClients.map(client => {
      const payments = allPayments.filter(p => p.client_id === client.id && p.type === 'credit');
      const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const pending = (parseFloat(client.balance) || 0) - totalPaid;
      const emp = allEmployees.find(e => e.id === client.assigned_to);
      return `
        <div style="background:white;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(15,37,71,.07);border-left:4px solid var(--danger)">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <div style="font-weight:700;color:var(--navy)">${client.name}</div>
            <div style="font-weight:700;color:var(--danger)">₹${fmt(pending)} pending</div>
          </div>
          <div style="font-size:12px;color:var(--muted)">📞 ${client.phone || 'No phone'} | 👤 ${emp?.name || 'Unassigned'}</div>
          <div style="font-size:12px;color:var(--muted)">Loan: ₹${fmt(parseFloat(client.balance)||0)} | Paid: ₹${fmt(totalPaid)}</div>
          <button onclick="openDetail('${client.id}')" style="margin-top:8px;background:var(--danger);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">View / देखें →</button>
        </div>`;
    }).join('')}
    <button onclick="printReport()" style="width:100%;padding:12px;background:var(--navy);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;margin-top:8px">🖨️ Print NPA Report</button>
  `;
}

// ── PDF / PRINT REPORT ────────────────────
function printReport() {
  window.print();
}

async function downloadClientPDF(clientId) {
  const c = allClients.find(x => x.id === clientId);
  if (!c) return;
  const payments = allPayments.filter(p => p.client_id === clientId);
  const totalPaid = payments.filter(p => p.type === 'credit').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const emp = allEmployees.find(e => e.id === c.assigned_to);

  const printContent = `
    <html><head><title>Client Report - ${c.name}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;color:#0f2547}
      h1{color:#0f2547;border-bottom:3px solid #c8aa5a;padding-bottom:8px}
      .section{margin:16px 0;padding:12px;background:#f8fafc;border-radius:8px}
      .section h3{color:#c8aa5a;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
      .row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
      .label{color:#64748b}.value{font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
      th{background:#0f2547;color:white;padding:7px 10px;text-align:left}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0}
      tr:nth-child(even){background:#f8fafc}
      @media print{button{display:none}}
    </style></head>
    <body>
      <h1>🚩 Sankat Mochan Finance — Client Report</h1>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px">Generated: ${new Date().toLocaleString('hi-IN')}</div>

      <div class="section">
        <h3>Personal Details / व्यक्तिगत जानकारी</h3>
        <div class="row"><span class="label">Name / नाम</span><span class="value">${c.name}</span></div>
        <div class="row"><span class="label">Customer ID</span><span class="value">${c.customer_id || '—'}</span></div>
        <div class="row"><span class="label">Father / पिता</span><span class="value">${c.father_name || '—'}</span></div>
        <div class="row"><span class="label">Mother / माता</span><span class="value">${c.mother_name || '—'}</span></div>
        <div class="row"><span class="label">Spouse / पति-पत्नी</span><span class="value">${c.husband_wife_name || '—'}</span></div>
        <div class="row"><span class="label">DOB / जन्म तिथि</span><span class="value">${c.dob || '—'}</span></div>
        <div class="row"><span class="label">Phone / फोन</span><span class="value">${c.phone || '—'}</span></div>
        <div class="row"><span class="label">Address 1</span><span class="value">${c.address || '—'}</span></div>
        <div class="row"><span class="label">Address 2</span><span class="value">${c.address2 || '—'}</span></div>
      </div>

      <div class="section">
        <h3>KYC Documents</h3>
        <div class="row"><span class="label">Aadhaar No.</span><span class="value">${c.aadhaar_no ? maskAadhaar(c.aadhaar_no) : '—'}</span></div>
        <div class="row"><span class="label">PAN No.</span><span class="value">${c.pan_no || '—'}</span></div>
        <div class="row"><span class="label">KYC Status</span><span class="value">${c.kyc_approved ? '✅ Approved' : '⏳ Pending'}</span></div>
      </div>

      <div class="section">
        <h3>Loan Details / लोन जानकारी</h3>
        <div class="row"><span class="label">Loan ID</span><span class="value">${c.loan_id || '—'}</span></div>
        <div class="row"><span class="label">Loan Amount / लोन राशि</span><span class="value">₹${fmt(parseFloat(c.balance)||0)}</span></div>
        <div class="row"><span class="label">Interest / ब्याज</span><span class="value">₹${fmt(parseFloat(c.interest_amount)||0)}</span></div>
        <div class="row"><span class="label">Total Paid / कुल भुगतान</span><span class="value">₹${fmt(totalPaid)}</span></div>
        <div class="row"><span class="label">Pending / बाकी</span><span class="value">₹${fmt((parseFloat(c.balance)||0) - totalPaid)}</span></div>
        <div class="row"><span class="label">Meeting Day / मीटिंग दिन</span><span class="value">${c.finance_company || c.bank_name || '—'}</span></div>
        <div class="row"><span class="label">Loan Cycle / वां लोन</span><span class="value">${c.loan_cycle || '—'}</span></div>
        <div class="row"><span class="label">Loan Purpose / उद्देश्य</span><span class="value">${c.loan_purpose || '—'}</span></div>
        <div class="row"><span class="label">Assigned To</span><span class="value">${emp?.name || '—'}</span></div>
      </div>
      <div class="section">
        <h3>Center Details / सेंटर जानकारी</h3>
        <div class="row"><span class="label">Center Name / सेंटर नाम</span><span class="value">${c.center_name || '—'}</span></div>
        <div class="row"><span class="label">Center Code / कोड</span><span class="value">${c.center_code || '—'}</span></div>
        <div class="row"><span class="label">Center Leader / लीडर</span><span class="value">${c.center_leader || '—'}</span></div>
        <div class="row"><span class="label">Meeting Day / मीटिंग दिन</span><span class="value">${c.meeting_day || '—'}</span></div>
      </div>

      <div class="section">
        <h3>Payment History / भुगतान इतिहास</h3>
        ${payments.length ? `
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th></tr></thead>
          <tbody>
            ${payments.map(p => `<tr>
              <td>${p.date || ''}</td>
              <td>${p.description || ''}</td>
              <td>${p.type === 'credit' ? '✅ Received' : '❌ Paid'}</td>
              <td>₹${fmt(parseFloat(p.amount)||0)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<p style="color:#64748b;font-size:13px">No payments yet</p>'}
      </div>

      <button onclick="window.print()" style="background:#0f2547;color:white;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;margin-top:16px">🖨️ Print</button>
    </body></html>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(printContent);
  printWindow.document.close();
}

// ── WHATSAPP REMINDER ─────────────────────
function sendWhatsAppReminder(clientId) {
  const c = allClients.find(x => x.id === clientId);
  if (!c || !c.phone) { showToast('No phone number / फोन नंबर नहीं है', 'error'); return; }

  const payments = allPayments.filter(p => p.client_id === clientId && p.type === 'credit');
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const pending = (parseFloat(c.balance) || 0) - totalPaid;

  const message = encodeURIComponent(
    `नमस्ते ${c.name} जी 🙏\n\n` +
    `आपके लोन की जानकारी:\n` +
    `• Customer ID: ${c.customer_id || 'N/A'}\n` +
    `• Loan ID: ${c.loan_id || 'N/A'}\n` +
    `• कुल लोन: ₹${fmt(parseFloat(c.balance)||0)}\n` +
    `• कुल भुगतान: ₹${fmt(totalPaid)}\n` +
    `• बकाया राशि: ₹${fmt(pending)}\n\n` +
    `कृपया समय पर भुगतान करें। धन्यवाद! 🙏\n\n` +
    `Sankat Mochan Finance`
  );

  const phone = c.phone.replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${phone}?text=${message}`;
  window.open(waUrl, '_blank');
}

function sendBirthdayWish(clientId) {
  const c = allClients.find(x => x.id === clientId);
  if (!c || !c.phone) { showToast('No phone number', 'error'); return; }
  const message = encodeURIComponent(`🎂 जन्मदिन मुबारक हो ${c.name} जी! 🎉\nआपको और आपके परिवार को ढेर सारी शुभकामनाएं!\n\nSankat Mochan Finance 🙏`);
  const phone = c.phone.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
}

// ── CHECK BIRTHDAYS TODAY ─────────────────
function checkTodayBirthdays() {
  const today = new Date().toISOString().slice(5, 10); // MM-DD
  const birthdayClients = allClients.filter(c => c.dob && c.dob.slice(5) === today);
  if (birthdayClients.length > 0) {
    showToast(`🎂 ${birthdayClients.length} client(s) birthday today! / जन्मदिन!`, 'success', 10000);
  }
}


// ── TEAM PAGE ─────────────────────────────
let approvingEmployeeId = null;

function renderTeamPage(c) {
  if (currentProfile.role !== 'admin') {
    c.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><p style="margin-top:10px">Admin only / सिर्फ Admin</p></div>';
    return;
  }
  const pending = allEmployees.filter(e => !e.is_approved && e.id !== currentUser.id);

  c.innerHTML = `
    <div class="section-hdr">
      <div class="section-title">Team / टीम <span style="font-size:12px;color:var(--muted);font-weight:400">(${allEmployees.length} members)</span></div>
    </div>

    ${pending.length > 0 ? `
    <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px">⏳ Approval Pending (${pending.length})</div>
      ${pending.map(e => `
        <div style="background:white;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:white;flex-shrink:0">${e.name?.charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px;color:var(--navy)">${e.name}</div>
            <div style="font-size:11px;color:var(--muted)">${e.email}</div>
          </div>
          <button onclick="openApproveModal('${e.id}','${e.name}','${e.email}')"
            style="background:#22c55e;color:white;border:none;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">
            ✅ Approve
          </button>
        </div>`).join('')}
    </div>` : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#166534;font-weight:600">✅ All approved!</div>`}

    ${allEmployees.length === 0 ?
      '<div class="empty"><div class="empty-icon">👥</div><p style="margin-top:10px;font-size:13px">No members yet</p></div>' :
      allEmployees.map(e => `
        <div style="background:white;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(15,37,71,.07);display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#e8c96a);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:var(--navy);flex-shrink:0">${e.name?.charAt(0).toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px;color:var(--navy)">${e.name} ${e.id===currentUser.id?'(You)':''}</div>
            <div style="font-size:11px;color:var(--muted)">${e.email}</div>
            ${e.employee_id ? `<div style="font-size:10px;color:var(--gold);font-weight:700">${e.employee_id}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="role-pill ${e.role==='admin'?'role-admin':'role-employee'}">${e.role}</span>
            ${e.id === currentUser.id
              ? '<span style="font-size:10px;color:var(--gold);font-weight:700">👑 You</span>'
              : e.is_approved
                ? '<span style="font-size:10px;color:var(--success);font-weight:700">✅ Approved</span>'
                : `<button onclick="openApproveModal('${e.id}','${e.name}','${e.email}')" style="background:#22c55e;color:white;border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer">✅ Approve</button>`
            }
          </div>
        </div>`).join('')}
  `;
}

function openApproveModal(id, name, email) {
  approvingEmployeeId = id;
  const info = document.getElementById('approve-emp-info');
  if (info) info.innerHTML = `<strong>${name}</strong><br><span style="color:var(--muted)">${email}</span>`;
  document.getElementById('approve-password').value = '';
  document.getElementById('approve-admin-pass').value = '';
  openModal('approve-modal');
}

async function approveEmployee() {
  const newPass = document.getElementById('approve-password').value.trim();
  const adminPass = document.getElementById('approve-admin-pass').value;
  if (!newPass) { showToast('Enter employee password', 'error'); return; }
  if (!adminPass) { showToast('Enter your admin password', 'error'); return; }

  const { error: authErr } = await db.auth.signInWithPassword({
    email: currentProfile.email, password: adminPass
  });
  if (authErr) { showToast('Wrong admin password! / गलत पासवर्ड!', 'error'); return; }

  await db.from('profiles').update({
    is_approved: true, approved_by: currentUser.id, login_password: newPass
  }).eq('id', approvingEmployeeId);

  closeModal('approve-modal');
  showToast('Employee approved! ✅', 'success');
  await loadEmployees();
  showPage('team');
}



// ── MISSING FUNCTIONS FIX ─────────────────

function populateAssign(selectedId) {
  const sel = document.getElementById('f-assign');
  if (!sel) return;
  sel.innerHTML = allEmployees.map(e =>
    `<option value="${e.id}" ${e.id===selectedId?'selected':''}>${e.name} (${e.role})</option>`
  ).join('');
  if (!selectedId) sel.value = currentUser.id;
}

let emiStatusFilter = 'all';

function filterEMITab(status, btn) {
  emiStatusFilter = status;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  filterEMIList();
}

function filterEMIList() {
  const search = (document.getElementById('emi-search')?.value || '').toLowerCase();
  const cards = document.querySelectorAll('#emi-list .client-card');
  cards.forEach(card => {
    const name = card.dataset.name || '';
    const status = card.dataset.status || '';
    const matchSearch = !search || name.includes(search);
    const matchStatus = emiStatusFilter === 'all' || status === emiStatusFilter;
    card.style.display = matchSearch && matchStatus ? 'flex' : 'none';
  });
}


// ── EMI TRACKER ───────────────────────────
function showEMITracker() {
  showPage('invoices');
  setTimeout(() => {
    const c = document.getElementById('main-content');
    const clientsWithLoans = allClients.filter(cl => parseFloat(cl.balance) > 0);
    const totalLoan = clientsWithLoans.reduce((s, cl) => s + (parseFloat(cl.balance)||0), 0);
    const totalPaid = allPayments.filter(p => p.type==='credit').reduce((s, p) => s + (parseFloat(p.amount)||0), 0);
    const totalPending = Math.max(0, totalLoan - totalPaid);

    c.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button onclick="showPage('invoices')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--navy)">📅 EMI Tracker</div>
          <div style="font-size:12px;color:var(--muted)">किस्त की स्थिति</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--navy);border-radius:14px;padding:14px;color:white">
          <div style="font-size:9px;opacity:.7;text-transform:uppercase;margin-bottom:4px">Total Loan</div>
          <div style="font-size:18px;font-weight:700">₹${fmt(totalLoan)}</div>
        </div>
        <div style="background:#dcfce7;border-radius:14px;padding:14px">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Paid</div>
          <div style="font-size:18px;font-weight:700;color:var(--success)">₹${fmt(totalPaid)}</div>
        </div>
        <div style="background:#fef2f2;border-radius:14px;padding:14px">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Pending</div>
          <div style="font-size:18px;font-weight:700;color:var(--danger)">₹${fmt(totalPending)}</div>
        </div>
        <div style="background:#fef9c3;border-radius:14px;padding:14px">
          <div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Active</div>
          <div style="font-size:18px;font-weight:700;color:var(--warning)">${clientsWithLoans.length}</div>
        </div>
      </div>
      <input class="search-bar" id="emi-search" placeholder="🔍 ग्राहक खोजें..." oninput="filterEMIList()"/>
      <div class="tabs">
        <button class="tab active" onclick="filterEMITab('all',this)">सभी (${clientsWithLoans.length})</button>
        <button class="tab" onclick="filterEMITab('pending',this)">Pending ⏳</button>
        <button class="tab" onclick="filterEMITab('partial',this)">Partial 🔄</button>
        <button class="tab" onclick="filterEMITab('complete',this)">Complete ✅</button>
      </div>
      <div id="emi-list">
        ${clientsWithLoans.length === 0 ? emptyState('📅','No loans yet') : clientsWithLoans.map(cl => renderEMICard(cl)).join('')}
      </div>
      <button onclick="exportPaymentsExcel()" style="width:100%;padding:12px;background:var(--success);color:white;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px">📥 Export Excel</button>
    `;
  }, 100);
}

// ── PASSBOOK ──────────────────────────────
function showPassbook() {
  const c = document.getElementById('main-content');

  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="showPage('invoices')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy)">📒 Passbook</div>
        <div style="font-size:12px;color:var(--muted)">Client चुनें / Select Client</div>
      </div>
      <button onclick="exportPaymentsExcel()" style="margin-left:auto;background:var(--success);color:white;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer">📥 Excel</button>
    </div>

    <input class="search-bar" id="passbook-search" placeholder="🔍 Client खोजें..." oninput="filterPassbookClients()"/>

    <div id="passbook-client-list">
      ${allClients.length === 0 ? emptyState('📒','No clients yet') :
        allClients.map(cl => {
          const payments = allPayments.filter(p => p.client_id === cl.id && p.type === 'credit');
          const totalPaid = payments.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
          const loan = parseFloat(cl.balance)||0;
          const outstanding = Math.max(0, loan - totalPaid);
          return `
          <div class="client-card passbook-client" data-id="${cl.id}" data-name="${cl.name.toLowerCase()}" onclick="showClientPassbook('${cl.id}')" style="margin-bottom:10px">
            <div class="client-avatar">${cl.name?.charAt(0).toUpperCase()}${cl.photo_url?`<img src="${cl.photo_url}" class="avatar-img"/>`:''}
            </div>
            <div class="client-info">
              <div class="client-name">${cl.name}</div>
              <div class="client-meta">${cl.customer_id||''} · ${cl.center_name||''} · ${cl.meeting_day||''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;font-weight:700;color:var(--danger)">₹${fmt(outstanding)}</div>
              <div style="font-size:10px;color:var(--muted)">${payments.length} payments</div>
            </div>
          </div>`;
        }).join('')}
    </div>
  `;
}

function filterPassbookClients() {
  const q = (document.getElementById('passbook-search')?.value || '').toLowerCase();
  document.querySelectorAll('.passbook-client').forEach(el => {
    el.style.display = !q || el.dataset.name.includes(q) ? 'flex' : 'none';
  });
}

function showClientPassbook(clientId) {
  const cl = allClients.find(x => x.id === clientId);
  if (!cl) return;

  const payments = allPayments.filter(p => p.client_id === clientId && p.type === 'credit')
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  const loan = parseFloat(cl.balance) || 0;
  const interest = parseFloat(cl.interest_amount) || 0;
  const weeklyEMI = Math.round((loan + interest) / 12);
  const weeklyPrincipal = Math.round(loan / 12);
  const weeklyInterest = Math.round(interest / 12);
  const totalDuePerWeek = cl.emi_amount || weeklyEMI;

  const c = document.getElementById('main-content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <button onclick="showPassbook()" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
      <div style="font-size:16px;font-weight:700;color:var(--navy)">📒 ${cl.name}</div>
      <button onclick="printPassbook('${clientId}')" style="margin-left:auto;background:var(--navy);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Print</button>
    </div>

    <!-- Client Info Card -->
    <div style="background:var(--navy);border-radius:14px;padding:14px;margin-bottom:14px;color:white">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div><span style="opacity:.6">शाखा कार्यालय:</span> <strong>बलिया</strong></div>
        <div><span style="opacity:.6">केंद्र शाखा:</span> <strong>${cl.center_name||'—'}</strong></div>
        <div><span style="opacity:.6">केंद्र ID:</span> <strong>${cl.center_code||'—'}</strong></div>
        <div><span style="opacity:.6">सदस्य:</span> <strong>${cl.name}</strong></div>
        <div><span style="opacity:.6">W/O:</span> <strong>${cl.husband_wife_name||cl.guarantor_name||'—'}</strong></div>
        <div><span style="opacity:.6">Mobile:</span> <strong>${cl.phone||'—'}</strong></div>
        <div><span style="opacity:.6">Loan No.:</span> <strong>${cl.loan_id||cl.customer_id||'—'}</strong></div>
        <div><span style="opacity:.6">DB Date:</span> <strong>${cl.loan_date||cl.first_emi_date||'—'}</strong></div>
        <div><span style="opacity:.6">Loan Amt:</span> <strong style="color:#FFD700">₹${fmt(loan)}</strong></div>
        <div><span style="opacity:.6">Weekly EMI:</span> <strong style="color:#FFD700">₹${fmt(weeklyEMI)}</strong></div>
        <div><span style="opacity:.6">Loan Cycle:</span> <strong>${cl.loan_cycle||'1st'}</strong></div>
        <div><span style="opacity:.6">Meeting Day:</span> <strong>${cl.finance_company||cl.meeting_day||cl.bank_name||'—'}</strong></div>
      </div>
    </div>

    <!-- Passbook Table - Exact format like image -->
    <div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:600px">
        <thead>
          <tr style="background:var(--navy);color:white">
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">तारीख<br>Date</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">सप्ताह<br>Week</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">मूलधन<br>Principal</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">ब्याज<br>Interest</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">कुल देय<br>Total Due</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">प्राप्त<br>Received</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">बकाया<br>Outstanding</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">उपस्थिति<br>Att.</th>
            <th style="padding:8px 6px;text-align:center;border-right:1px solid rgba(255,255,255,.2)">हस्ताक्षर<br>Signature</th>
            <th style="padding:8px 6px;text-align:center">टिप्पणी<br>Remark</th>
          </tr>
        </thead>
        <tbody>
          ${(() => {
            let outstanding = loan + interest;
            let weekNum = 0;
            const rows = [];
            
            // Fixed 12 weeks - Principal and Interest split
            const totalLoanPlusInterest = loan + interest;
            const weeklyEMI = Math.round(totalLoanPlusInterest / 12);
            const weeklyPrincipal = Math.round(loan / 12);
            const weeklyInterest = Math.round(interest / 12);

            // Auto calculate weekly dates from first EMI date
            const startDate = cl.first_emi_date || cl.loan_date || new Date().toISOString().slice(0,10);
            function getWeekDate(wNum) {
              const d = new Date(startDate);
              d.setDate(d.getDate() + (wNum - 1) * 7);
              return d.toISOString().slice(0,10);
            }

            // Outstanding starts from total loan + interest
            let runningOutstanding = totalLoanPlusInterest;
            
            payments.forEach((p, i) => {
              weekNum++;
              const received = parseFloat(p.amount) || weeklyEMI;
              // Outstanding reduces by EMI each week
              runningOutstanding = Math.max(0, runningOutstanding - weeklyEMI);
              outstanding = runningOutstanding;
              
              rows.push(`
                <tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
                  <td style="padding:6px 8px;text-align:center;color:var(--muted);border-right:1px solid var(--border)">${p.date||'—'}</td>
                  <td style="padding:6px 8px;text-align:center;font-weight:700;border-right:1px solid var(--border)">${weekNum}</td>
                  <td style="padding:6px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(principalPart)}</td>
                  <td style="padding:6px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(interestPart)}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:600;border-right:1px solid var(--border)">₹${fmt(totalDuePerWeek)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--success);font-weight:700;border-right:1px solid var(--border)">₹${fmt(received)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--danger);font-weight:700;border-right:1px solid var(--border)">₹${fmt(runningOutstanding)}</td>
                  <td style="padding:6px 8px;text-align:center;border-right:1px solid var(--border)">✅</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px">${p.description||''}</td>
                </tr>`);
            });

            // Show remaining empty rows
            const totalWeeks = 12;
            for (let i = weekNum + 1; i <= 12; i++) {
              rows.push(`
                <tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
                  <td style="padding:6px 8px;text-align:center;font-weight:700;color:var(--muted);border-right:1px solid var(--border)">${i}</td>
                  <td style="padding:6px 8px;text-align:center;color:var(--muted);border-right:1px solid var(--border);font-size:11px">${getWeekDate(i)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--muted);border-right:1px solid var(--border)">₹${fmt(weeklyPrincipal)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--muted);border-right:1px solid var(--border)">₹${fmt(weeklyInterest)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--muted);border-right:1px solid var(--border)">₹${fmt(weeklyEMI)}</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px;text-align:right;color:var(--danger);border-right:1px solid var(--border)">₹${fmt(Math.max(0,outstanding))}</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px"></td>
                </tr>`);
            }
            return rows.join('');
          })()}
        </tbody>
        <tfoot>
          <tr style="background:#f0f4f8;font-weight:700;border-top:2px solid var(--navy)">
            <td colspan="5" style="padding:8px 10px;color:var(--navy)">कुल / Total</td>
            <td style="padding:8px 10px;text-align:right;color:var(--success)">₹${fmt(payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0))}</td>
            <td style="padding:8px 10px;text-align:right;color:var(--danger)">₹${fmt(Math.max(0,(loan+interest)-payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0)))}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Add Payment Button -->
    <button onclick="activeClientId='${clientId}';openPayModal()" style="width:100%;padding:12px;background:var(--navy);color:white;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px">+ किस्त जोड़ें / Add Payment</button>

    <!-- टिप्पणी -->
    <div style="background:white;border-radius:12px;padding:14px;margin-top:12px;border:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">टिप्पणी / Notes:</div>
      <div style="font-size:13px;color:var(--navy)">${cl.notes||'—'}</div>
    </div>
  `;
}

function printPassbook(clientId) {
  window.print();
}

function printMeetingSheet() {
  window.print();
}


function filterPassbook() {
  const q = (document.getElementById('passbook-search')?.value || '').toLowerCase();
  document.querySelectorAll('.passbook-entry').forEach(el => {
    const search = el.dataset.search || '';
    el.style.display = !q || search.includes(q) ? 'block' : 'none';
  });
}

// ── MEETING DAY ───────────────────────────
function showMeetingDay() {
  const c = document.getElementById('main-content');
  const days = ['Monday / सोमवार','Tuesday / मंगलवार','Wednesday / बुधवार','Thursday / गुरुवार','Friday / शुक्रवार','Saturday / शनिवार','Sunday / रविवार'];

  // Group clients by meeting day - check ALL possible fields
  const byDay = {};
  days.forEach(d => { byDay[d] = []; });
  byDay['Not Set / अनिर्धारित'] = [];

  allClients.forEach(cl => {
    // Check finance_company (where meeting day is stored) OR meeting_day
    const mDay = (cl.finance_company || cl.meeting_day || cl.bank_name || '').trim();
    if (!mDay) { byDay['Not Set / अनिर्धारित'].push(cl); return; }
    
    // Try exact match first
    if (byDay[mDay] !== undefined) { byDay[mDay].push(cl); return; }
    
    // Try partial match (Monday matches "Monday / सोमवार")
    const mDayLower = mDay.split('/')[0].trim().toLowerCase();
    const matched = days.find(d => d.split('/')[0].trim().toLowerCase() === mDayLower);
    
    if (matched) { byDay[matched].push(cl); }
    else {
      // Add as new day group
      if (!byDay[mDay]) byDay[mDay] = [];
      byDay[mDay].push(cl);
    }
  });

  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const dayName = today.toLocaleDateString('en-US', {weekday:'long'});

  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="showPage('invoices')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--navy)">🗓️ Center Day Sheet</div>
        <div style="font-size:12px;color:var(--muted)">CDS — ${todayStr}</div>
      </div>
      <button onclick="printMeetingSheet()" style="margin-left:auto;background:var(--navy);color:white;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Print CDS</button>
    </div>

    ${Object.entries(byDay).map(([day, clients]) => {
      if (!clients.length) return '';
      const dayShort = day.split('/')[0].trim();
      const isToday = new Date().toLocaleDateString('en-US', {weekday:'long'}) === dayShort;

      // Calculate totals for CDS
      const totalLoan = clients.reduce((s,cl) => s+(parseFloat(cl.balance)||0), 0);
      const totalOutstanding = clients.reduce((s,cl) => {
        const paid = allPayments.filter(p=>p.client_id===cl.id&&p.type==='credit').reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
        return s + Math.max(0,(parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0)-paid);
      }, 0);
      const totalEMI = clients.reduce((s,cl) => s+Math.round(((parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0))/12), 0);

      return `
        <div style="margin-bottom:20px" id="cds-${day.replace(/\s/g,'-')}">
          <!-- CDS Header -->
          <div style="background:white;border-radius:14px;padding:14px;margin-bottom:2px;box-shadow:0 2px 8px rgba(15,37,71,.07);${isToday?'border:2px solid var(--gold)':'border:1px solid var(--border)'}">

            <!-- Company Header -->
            <div style="text-align:center;border-bottom:2px solid var(--navy);padding-bottom:8px;margin-bottom:10px">
              <div style="font-size:15px;font-weight:700;color:var(--navy)">संकट मोचन Finance</div>
              <div style="font-size:11px;color:var(--muted)">Center Day Sheet (CDS)</div>
            </div>

            <!-- Center Info Grid -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:10px;background:#f8fafc;padding:10px;border-radius:8px">
              <div><strong>Center:</strong> ${clients[0]?.center_name||'—'}</div>
              <div><strong>CDS Date:</strong> ${todayStr}</div>
              <div><strong>L.C.:</strong> ${clients[0]?.loan_cycle||'—'}</div>
              <div><strong>Day:</strong> ${dayShort} ${isToday?'⭐ TODAY':''}</div>
              <div><strong>Center ID:</strong> ${clients[0]?.center_code||'—'}</div>
              <div><strong>Members:</strong> ${clients.length}</div>
              <div><strong>Time:</strong> 9:00 AM</div>
              <div><strong>T.Outstanding:</strong> <span style="color:var(--danger);font-weight:700">₹${fmt(totalOutstanding)}</span></div>
              <div><strong>Staff:</strong> ${currentProfile?.name||'Admin'}</div>
              <div><strong>NPA:</strong> 0</div>
            </div>

            <!-- CDS Table -->
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:10px;min-width:700px">
                <thead>
                  <tr style="background:var(--navy);color:white">
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">Loan No.</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">Client Name</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">Loan Amt</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">DB Date</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">INS.NO</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">OS (P/I)</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">NPA</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">P.DUE</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">INT.DUE</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">CRM</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">COLTD</th>
                    <th style="padding:6px 4px;border:1px solid rgba(255,255,255,.2)">SIGN.</th>
                  </tr>
                </thead>
                <tbody>
                  ${clients.map((cl, i) => {
                    const payments = allPayments.filter(p=>p.client_id===cl.id&&p.type==='credit');
                    const totalPaid = payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
                    const loanAmt = parseFloat(cl.balance)||0;
                    const intAmt = parseFloat(cl.interest_amount)||0;
                    const totalDue = loanAmt + intAmt;
                    const outstanding = Math.max(0, totalDue - totalPaid);
                    const outstandingP = Math.max(0, loanAmt - payments.filter(p=>p.client_id===cl.id).length * Math.round(loanAmt/12));
                    const outstandingI = Math.max(0, intAmt - payments.filter(p=>p.client_id===cl.id).length * Math.round(intAmt/12));
                    const weeklyEMI = Math.round(totalDue/12);
                    const weeklyP = Math.round(loanAmt/12);
                    const weeklyI = Math.round(intAmt/12);
                    const instNo = payments.length;

                    return `<tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
                      <td style="padding:5px 4px;border:1px solid var(--border);font-size:10px">${cl.loan_id||cl.customer_id||'—'}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);font-weight:600">
                        ${cl.name}<br>
                        <span style="font-size:9px;color:var(--muted)">W/O ${cl.husband_wife_name||cl.guarantor_name||'—'} / ${cl.phone||'—'}</span>
                      </td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:right">₹${fmt(loanAmt)}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:center;font-size:9px">${cl.loan_date||cl.first_emi_date||'—'}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:center">${instNo}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:right;color:var(--danger)">${fmt(outstandingP)}/${fmt(outstandingI)}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:center">0</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:right">${fmt(weeklyP)}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:right">${fmt(weeklyI)}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border)"></td>
                      <td style="padding:5px 4px;border:1px solid var(--border);text-align:right;font-weight:700;color:var(--success)">${fmt(weeklyEMI)}</td>
                      <td style="padding:5px 4px;border:1px solid var(--border);min-width:60px"></td>
                    </tr>`;
                  }).join('')}
                  <!-- Total Row -->
                  <tr style="background:#f0f4f8;font-weight:700;border-top:2px solid var(--navy)">
                    <td colspan="2" style="padding:6px 4px;border:1px solid var(--border)">Total</td>
                    <td style="padding:6px 4px;border:1px solid var(--border);text-align:right">₹${fmt(totalLoan)}</td>
                    <td colspan="2" style="border:1px solid var(--border)"></td>
                    <td style="padding:6px 4px;border:1px solid var(--border);text-align:right;color:var(--danger)">₹${fmt(totalOutstanding)}</td>
                    <td style="padding:6px 4px;border:1px solid var(--border);text-align:center">0</td>
                    <td colspan="3" style="border:1px solid var(--border)"></td>
                    <td style="padding:6px 4px;border:1px solid var(--border);text-align:right;color:var(--success)">₹${fmt(totalEMI)}</td>
                    <td style="border:1px solid var(--border)"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Denomination -->
            <div style="margin-top:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
              <div style="background:#f8fafc;padding:6px 10px;font-size:11px;font-weight:700;color:var(--navy)">Denomination:</div>
              <div style="display:grid;grid-template-columns:repeat(8,1fr);font-size:10px">
                <div style="padding:6px;border:1px solid var(--border);text-align:center">2000×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">500×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">200×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">100×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">50×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">20×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">10×</div>
                <div style="padding:6px;border:1px solid var(--border);text-align:center">Total</div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border)"></div>
                <div style="padding:10px;border:1px solid var(--border);font-weight:700;color:var(--success)">₹${fmt(totalEMI)}</div>
              </div>
            </div>

            <!-- Signatures -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px;font-size:11px">
              <div style="text-align:center;border-top:1px solid var(--navy);padding-top:6px">Signature of FO</div>
              <div style="text-align:center;border-top:1px solid var(--navy);padding-top:6px">Signature of Group Leader</div>
              <div style="text-align:center;border-top:1px solid var(--navy);padding-top:6px">Signature of Branch Manager</div>
            </div>
          </div>
        </div>`;
    }).join('')}
  `;
}
