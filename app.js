// ─────────────────────────────────────────────────────────
//  CONFIGURATION — Replace with your Supabase values
//  supabase.com → Project Settings → API
// ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://oswbpddfbofoyddxdfej.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zd2JwZGRmYm9mb3lkZHhkZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzA0NDUsImV4cCI6MjA5NTEwNjQ0NX0.Gem36jnT-m4I13k078tYxyxPfv_FLChfxgrMK4Kzk7o';
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
      initDemoApp();
    }, 500);
  }, 2000);
  // demo mode
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

// ── DEMO MODE — no login required ────────
async function initDemoApp() {
  currentUser = { id: null, email: 'demo@dhanraksha.com' };
  currentProfile = { id: null, name: 'Demo Admin', role: 'admin' };

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  document.getElementById('uname').textContent = 'Demo';
  const rp = document.getElementById('urole');
  rp.textContent = 'Admin';
  rp.className = 'role-pill role-admin';

  await loadAll();
  showPage('dashboard');
  startAutoRefresh();
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
    <!-- Welcome Header -->
    <div style="background:linear-gradient(135deg,#1a2e4a,#2d4a7a);border-radius:16px;padding:16px;margin-bottom:16px;color:white">
      <div style="font-size:20px;font-weight:800">नमस्ते, ${currentProfile.name?.split(' ')[0]} 👋</div>
      <div style="font-size:11px;opacity:.7;margin-top:2px">आपका वित्त सारांश — Your Finance Overview</div>
      <div style="font-size:11px;opacity:.7;margin-top:2px">${new Date().toLocaleDateString('hi-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
    </div>

    <!-- Stats Grid Minimal Clean -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #f59e0b">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">👥</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">कुल ग्राहक</div>
        </div>
        <div style="font-size:24px;font-weight:800;color:#f59e0b">${allClients.filter(c=>c.status!=='closed').length}</div>
        <div style="font-size:10px;color:var(--muted)">Active / ${allClients.length} Total</div>
      </div>

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #10b981">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">💰</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">कुल लोन</div>
        </div>
        <div style="font-size:20px;font-weight:800;color:#10b981">₹${fmt(totalBal)}</div>
        <div style="font-size:10px;color:var(--muted)">Total Balance</div>
      </div>

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #3b82f6">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">✅</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">कुल प्राप्त</div>
        </div>
        <div style="font-size:20px;font-weight:800;color:#3b82f6">₹${fmt(totalPaid)}</div>
        <div style="font-size:10px;color:var(--muted)">Total Received</div>
      </div>

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #8b5cf6">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">💹</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">कुल ब्याज</div>
        </div>
        <div style="font-size:20px;font-weight:800;color:#8b5cf6">₹${fmt(allClients.reduce((s,c)=>s+(parseFloat(c.interest_amount)||0),0))}</div>
        <div style="font-size:10px;color:var(--muted)">Total Interest</div>
      </div>

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #f43f5e">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">📊</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">बाकी</div>
        </div>
        <div style="font-size:20px;font-weight:800;color:#f43f5e">₹${fmt(Math.max(0,totalBal+allClients.reduce((s,c)=>s+(parseFloat(c.interest_amount)||0),0)-totalPaid))}</div>
        <div style="font-size:10px;color:var(--muted)">Outstanding</div>
      </div>

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #0891b2">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">🏷️</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">कुल LPF</div>
        </div>
        <div style="font-size:20px;font-weight:800;color:#0891b2">₹${fmt(allClients.filter(c=>c.status!=='closed').reduce((s,c)=>s+(parseFloat(c.lpf)||500),0))}</div>
        <div style="font-size:10px;color:var(--muted)">Total LPF</div>
      </div>

      <div style="background:white;border-radius:14px;padding:14px;box-shadow:0 2px 10px rgba(15,37,71,.08);border-left:4px solid #d97706;grid-column:1/-1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-size:22px">📋</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase">कुल LPC</div>
        </div>
        <div style="font-size:22px;font-weight:800;color:#d97706">₹${fmt(allClients.filter(c=>c.status!=='closed').reduce((s,c)=>s+(parseFloat(c.lpc)||Math.ceil((parseFloat(c.balance)||0)/10000)*500),0))}</div>
        <div style="font-size:10px;color:var(--muted)">Total LPC</div>
      </div>

    </div>

    <!-- Chart -->
    <div class="chart-card">
      <div class="chart-title">📊 Client Balance Overview <span class="hindi">/ ग्राहक बैलेंस</span></div>
      <canvas id="balanceChart" height="180"></canvas>
    </div>

    <!-- Payment History - Collapsible -->
    <div class="chart-card" style="padding:0;overflow:hidden">
      <div onclick="togglePaymentHistory()" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;background:var(--navy);color:white;border-radius:12px" id="ph-header">
        <div style="font-weight:700;font-size:14px">💰 Payment History / भुगतान इतिहास</div>
        <div style="display:flex;gap:8px;align-items:center">
          <button onclick="event.stopPropagation();exportPaymentsExcel()" style="background:rgba(255,255,255,.2);color:white;border:none;border-radius:6px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer">📥 Excel</button>
          <span id="ph-toggle-icon" style="font-size:16px">▼</span>
        </div>
      </div>
      <div id="ph-body" style="display:none;padding:12px">
        <div style="margin-bottom:10px;display:flex;gap:6px;align-items:center">
          <input type="text" id="ph-client-search" placeholder="🔍 Client name search करें..." 
            oninput="filterPaymentHistory(this.value)"
            style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;color:var(--navy)">
          <button id="mic-btn-ph-client-search" onclick="voiceSearch('ph-client-search', filterPaymentHistory)" style="padding:6px 10px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;font-size:14px;cursor:pointer">🎤</button>
        </div>
        ${!allPayments || allPayments.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">No payments yet</div>' :
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
          <tbody id="ph-table-body">
            ${(() => {
              const clientOutstanding = {};
              allClients.forEach(cl => { clientOutstanding[cl.id] = (parseFloat(cl.balance)||0) + (parseFloat(cl.interest_amount)||0); });
              const filtered = allPayments;
              return filtered.slice(0,50).map((p,i) => {
                const client = allClients.find(c => c.id === p.client_id);
                if (p.type === 'credit' && !(p.description||'').includes('Reversal') && !(p.description||'').includes('DELETED') && client) {
                  clientOutstanding[p.client_id] = Math.max(0, (clientOutstanding[p.client_id]||0) - (parseFloat(p.amount)||0));
                } else if (p.type === 'debit' && (p.description||'').includes('Reversal') && client) {
                  clientOutstanding[p.client_id] = Math.min((parseFloat(client.balance)||0)+(parseFloat(client.interest_amount)||0), (clientOutstanding[p.client_id]||0) + (parseFloat(p.amount)||0));
                }
                const outstanding = clientOutstanding[p.client_id] || 0;
                return `<tr data-client="${client?.name||''}" data-phone="${client?.phone||''}" style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
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
        ${allPayments.length > 50 ? `<div style="text-align:center;padding:8px;font-size:11px;color:var(--muted)">Showing 50 of ${allPayments.length} payments</div>` : ''}
      </div>`}
      </div>
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
      <button class="tab" onclick="filterByStatus('closed',this)" style="color:#dc2626">🔒 Closed (${allClients.filter(x=>x.status==='closed').length})</button>
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
  const statusMap = { active:'status-active', inactive:'status-inactive', vip:'status-vip', closed:'status-inactive' };
  const statusLabel = { active:'Active', inactive:'Inactive', vip:'⭐ VIP', closed:'🔒 Closed' };
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
  aadhaarBackPhotoFile = null;
  // Reset aadhaar previews
  const aFront = document.getElementById('aadhaar-front-img');
  const aBack = document.getElementById('aadhaar-back-img');
  if (aFront) { aFront.style.display = 'none'; aFront.src = ''; }
  if (aBack) { aBack.style.display = 'none'; aBack.src = ''; }
  const aFrontTxt = document.getElementById('aadhaar-front-text');
  const aBackTxt = document.getElementById('aadhaar-back-text');
  if (aFrontTxt) aFrontTxt.style.display = 'block';
  if (aBackTxt) aBackTxt.style.display = 'block';
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
  // Add mic to notes field
  setTimeout(() => {
    const notesEl = document.getElementById('f-notes');
    if (notesEl && !document.getElementById('mic-btn-f-notes')) {
      const micBtn = document.createElement('button');
      micBtn.id = 'mic-btn-f-notes';
      micBtn.type = 'button';
      micBtn.textContent = '🎤 Note बोलें';
      micBtn.style.cssText = 'margin-top:4px;padding:6px 12px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;font-size:12px;cursor:pointer;width:100%';
      micBtn.onclick = () => voiceNote('f-notes');
      notesEl.parentNode.insertBefore(micBtn, notesEl.nextSibling);
    }
  }, 300);
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
  if (document.getElementById('f-loan-weeks')) document.getElementById('f-loan-weeks').value = c.loan_weeks || '12';
  if (document.getElementById('f-loan-purpose')) document.getElementById('f-loan-purpose').value = c.loan_purpose || '';
  if (document.getElementById('f-lpf')) document.getElementById('f-lpf').value = c.lpf || 500;
  if (document.getElementById('f-lpc')) document.getElementById('f-lpc').value = c.lpc || Math.ceil((parseFloat(c.balance)||0) / 10000) * 500;

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

// Direct SMS OTP function
function sendOTPviaSMS() {
  const phone = v('f-phone');
  const name = v('f-name');
  if (!phone) { showToast('Phone number डालें!', 'error'); return; }
  if (!name) { showToast('Name डालें!', 'error'); return; }

  // Generate OTP
  generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
  otpClientPhone = phone;
  otpVerified = false;
  sessionStorage.setItem('client_otp', generatedOTP);
  sessionStorage.setItem('otp_time', Date.now().toString());

  // Format phone
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const indiaPhone = cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone;

  // SMS message
  const msg = 'Dhan Raksha Finance OTP: ' + generatedOTP + ' (10 min valid). किसी को share न करें।';

  // Open SMS app directly
  window.open('sms:+' + indiaPhone + '?body=' + encodeURIComponent(msg), '_blank');

  // Show OTP on screen too
  const otpSec = document.getElementById('otp-section');
  if (otpSec) otpSec.style.display = 'block';
  
  const btn = document.getElementById('otp-send-btn');
  if (btn) {
    btn.textContent = '✅ OTP Sent! Resend करें';
    btn.style.background = '#22c55e';
  }

  showToast('SMS app खुला! OTP: ' + generatedOTP, 'success');
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
    `धन रक्षा Finance में आपका OTP है:

` +
    `*${generatedOTP}*

` +
    `यह OTP 10 मिनट के लिए valid है।
` +
    `किसी को share न करें।

` +
    `धन रक्षा Finance 🚩`
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
  showToast(`Compressing ${origSize}KB...`, '');

  try {
    const compressed = await compressImage(input.files[0], 50);
    const newSize = Math.round(compressed.size / 1024);

    const reader = new FileReader();
    reader.onload = e => {
      // Handle different preview IDs
      if (type === 'aadhaar-front' || type === 'aadhaar') {
        const img = document.getElementById('aadhaar-front-img') || document.getElementById('aadhaar-preview-img');
        const txt = document.getElementById('aadhaar-front-text') || document.getElementById('aadhaar-preview-text');
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
        if (txt) txt.style.display = 'none';
        aadhaarPhotoFile = compressed;
      } else if (type === 'aadhaar-back') {
        const img = document.getElementById('aadhaar-back-img') || document.getElementById('aadhaar-back-preview-img');
        const txt = document.getElementById('aadhaar-back-text') || document.getElementById('aadhaar-back-preview-text');
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
        if (txt) txt.style.display = 'none';
        aadhaarBackPhotoFile = compressed;
      } else if (type === 'pan') {
        const img = document.getElementById('pan-preview-img');
        const txt = document.getElementById('pan-preview-text');
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
        if (txt) txt.style.display = 'none';
        panPhotoFile = compressed;
      }
      showToast(`✅ ${origSize}KB → ${newSize}KB`, 'success');
    };
    reader.readAsDataURL(compressed);
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
    name, assigned_to: assignTo || null, owner_id: currentUser.id || null,
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
    lpf: parseFloat(v('f-lpf')) || 500,
    lpc: parseFloat(v('f-lpc')) || 0,
    finance_company: v('f-bank'),
    kyc_approved: document.getElementById('f-kyc-approved')?.value === 'true',
    center_name: v('f-center-name'),
    center_code: v('f-center-code'),
    center_leader: v('f-center-leader'),
    meeting_day: document.getElementById('f-meeting-day')?.value || '',
    loan_cycle: document.getElementById('f-loan-cycle')?.value || '1st',
    loan_weeks: parseInt(document.getElementById('f-loan-weeks')?.value || '12'),
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
  try {
    // Pehle loan_history delete karo
    await db.from('loan_history').delete().eq('client_id', editingClientId);
    // Phir payments delete karo
    await db.from('payments').delete().eq('client_id', editingClientId);
    // Ab client delete karo
    const { error } = await db.from('clients').delete().eq('id', editingClientId);
    if (error) throw error;
    closeModal('client-modal');
    showToast('✅ Deleted / हटाया गया', 'success');
    await loadAll();
    showPage(currentPage);
  } catch(err) {
    console.error('Delete error:', err);
    showToast('Delete failed: ' + err.message, 'error');
  }
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
        <span class="status-badge ${{active:'status-active',inactive:'status-inactive',vip:'status-vip',closed:'status-inactive'}[c.status]||'status-active'}">${{active:'Active',inactive:'Inactive',vip:'⭐ VIP',closed:'🔒 Closed'}[c.status]||'Active'}</span>
      </div>
    </div>

    ${c.status === 'closed' ? `
    <!-- CLOSED ACCOUNT SECTION -->
    <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:16px;margin:12px 0;text-align:center">
      <div style="font-size:20px;margin-bottom:4px">🎉</div>
      <div style="font-size:15px;font-weight:800;color:#16a34a">Loan Complete!</div>
      <div style="font-size:12px;color:#166534;margin-bottom:12px">सभी किस्त जमा हो गई — Account Closed</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;text-align:left">
        <div style="background:white;border-radius:8px;padding:8px">
          <div style="font-size:10px;color:var(--muted)">Loan Amount</div>
          <div style="font-weight:700;color:var(--navy)">₹${fmt(parseFloat(c.balance)||0)}</div>
        </div>
        <div style="background:white;border-radius:8px;padding:8px">
          <div style="font-size:10px;color:var(--muted)">Interest</div>
          <div style="font-weight:700;color:var(--navy)">₹${fmt(parseFloat(c.interest_amount)||0)}</div>
        </div>
        <div style="background:white;border-radius:8px;padding:8px">
          <div style="font-size:10px;color:var(--muted)">Loan Cycle</div>
          <div style="font-weight:700;color:var(--navy)">${c.loan_cycle||'1st'}</div>
        </div>
        <div style="background:white;border-radius:8px;padding:8px">
          <div style="font-size:10px;color:var(--muted)">Tenure</div>
          <div style="font-weight:700;color:var(--navy)">${c.loan_weeks||12} Weeks</div>
        </div>
      </div>
      <button onclick="openRenewModal('${c.id}')" style="width:100%;padding:12px;background:linear-gradient(135deg,#e65c00,#f9d423);color:white;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:8px">
        🔄 नया Loan / Renew Loan
      </button>
      <button onclick="showClientPassbook('${c.id}')" style="width:100%;padding:10px;background:var(--navy);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
        📒 Past Loan History देखें
      </button>
    </div>
    ` : ''}    <div class="big-balance">
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
      ${payments.length ? payments.slice(0,5).map(p => {
        const isDeleted = (p.description||'').includes('🗑️ DELETED');
        return `
        <div class="payment-item" style="${isDeleted ? 'opacity:0.5;background:#fef2f2;border-radius:8px;' : ''}">
          <div class="pay-icon ${p.type==='credit'?'pay-in':'pay-out'}">${isDeleted ? '🗑️' : p.type==='credit'?'✅':'❌'}</div>
          <div class="pay-info">
            <div class="pay-desc" style="${isDeleted ? 'text-decoration:line-through;color:var(--muted)' : ''}">${p.description||'Cash'} <span style="font-size:10px;color:var(--muted);font-weight:400">(pay mode)</span></div>
            <div class="pay-date">${p.date||''}</div>
          </div>
          <div class="pay-amount" style="color:${isDeleted ? 'var(--muted)' : p.type==='credit'?'var(--success)':'var(--danger)'};${isDeleted?'text-decoration:line-through':''}">
            ${p.type==='credit'?'+':'-'}₹${fmt(parseFloat(p.amount)||0)}
          </div>
          ${currentProfile?.role === 'admin' && !isDeleted ? `
          <button onclick="deletePayment('${p.id}')" 
            style="margin-left:6px;padding:4px 8px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;color:#dc2626;white-space:nowrap"
            title="Delete this payment">🗑️ Delete</button>` : ''}
        </div>`;
      }).join('') : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:10px">No payments yet</div>'}
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

  // Add mic buttons dynamically
  setTimeout(() => {
    // Mic for amount
    const amtEl = document.getElementById('pay-amt');
    if (amtEl && !document.getElementById('mic-btn-pay-amt')) {
      const micBtn = document.createElement('button');
      micBtn.id = 'mic-btn-pay-amt';
      micBtn.type = 'button';
      micBtn.textContent = '🎤';
      micBtn.title = 'Voice amount';
      micBtn.style.cssText = 'margin-left:6px;padding:6px 10px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;font-size:14px;cursor:pointer;';
      micBtn.onclick = () => voiceAmount('pay-amt');
      amtEl.parentNode.insertBefore(micBtn, amtEl.nextSibling);
    }
    // Mic for description/notes
    const descEl = document.getElementById('pay-desc');
    if (descEl && !document.getElementById('mic-btn-pay-desc')) {
      const micBtn2 = document.createElement('button');
      micBtn2.id = 'mic-btn-pay-desc';
      micBtn2.type = 'button';
      micBtn2.textContent = '🎤';
      micBtn2.title = 'Voice note';
      micBtn2.style.cssText = 'margin-left:6px;padding:6px 10px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;font-size:14px;cursor:pointer;';
      micBtn2.onclick = () => voiceNote('pay-desc');
      descEl.parentNode.insertBefore(micBtn2, descEl.nextSibling);
    }
  }, 200);
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

  // Auto-close check — outstanding ₹0 hone pe
  const cl = allClients.find(c => c.id === activeClientId);
  if (cl) {
    const totalLoanInterest = (parseFloat(cl.balance)||0) + (parseFloat(cl.interest_amount)||0);
    const totalPaid = allPayments
      .filter(p => p.client_id === activeClientId && p.type === 'credit' && !(p.description||'').includes('Reversal') && !(p.description||'').includes('DELETED'))
      .reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const debitRev = allPayments
      .filter(p => p.client_id === activeClientId && p.type === 'debit' && (p.description||'').includes('Reversal'))
      .reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
    const outstanding = Math.max(0, totalLoanInterest - totalPaid + debitRev);

    if (outstanding <= 0 && cl.status !== 'closed') {
      const confirmClose = confirm(`🎉 Loan पूरा हो गया!\n\n${cl.name} का account CLOSE करें?`);
      if (confirmClose) {
        await db.from('clients').update({ status: 'closed' }).eq('id', activeClientId);
        await loadAll();
        showToast(`✅ ${cl.name} का account close हो गया!`, 'success');
      }
    }
  }

  openDetail(activeClientId);
}

// ── MORE PAGE ────────────────────────────
let moreTab = null;

function renderInvoicesPage(c) {
  c.innerHTML = `
  <div class="no-print" style="margin-bottom:16px">
    <div style="font-size:18px;font-weight:700;color:var(--navy)">☰ More / अधिक</div>
    <div style="font-size:12px;color:var(--muted)">सभी सुविधाएं</div>
  </div>

  ${moreTab ? `
  <div class="no-print" style="margin-bottom:12px">
    <button onclick="moreTab=null;showPage('invoices')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--muted)">← वापस / Back</button>
  </div>
  <div id="more-content">
    ${moreTab==='emi' ? renderEMITab() : moreTab==='passbook' ? renderPassbookTab() : moreTab==='cashbook' ? renderCashBookTab() : moreTab==='collreg' ? renderCollectionRegTab() : moreTab==='clients' ? renderClientsTab() : renderMeetingTab()}
  </div>
  ` : `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px">

    <div onclick="moreTab='emi';showPage('invoices')" style="background:linear-gradient(135deg,#1a2e4a,#2d4a7a);border-radius:16px;padding:20px;cursor:pointer;color:white;text-align:center;box-shadow:0 4px 12px rgba(26,46,74,.3)">
      <div style="font-size:32px;margin-bottom:8px">📅</div>
      <div style="font-size:14px;font-weight:700">EMI Tracker</div>
      <div style="font-size:10px;opacity:.7;margin-top:2px">किस्त ट्रैकर</div>
    </div>

    <div onclick="moreTab='passbook';showPage('invoices')" style="background:linear-gradient(135deg,#065f46,#047857);border-radius:16px;padding:20px;cursor:pointer;color:white;text-align:center;box-shadow:0 4px 12px rgba(6,95,70,.3)">
      <div style="font-size:32px;margin-bottom:8px">📒</div>
      <div style="font-size:14px;font-weight:700">Passbook</div>
      <div style="font-size:10px;opacity:.7;margin-top:2px">पासबुक</div>
    </div>

    <div onclick="moreTab='meeting';showPage('invoices')" style="background:linear-gradient(135deg,#7c2d12,#c2410c);border-radius:16px;padding:20px;cursor:pointer;color:white;text-align:center;box-shadow:0 4px 12px rgba(124,45,18,.3)">
      <div style="font-size:32px;margin-bottom:8px">🏘️</div>
      <div style="font-size:14px;font-weight:700">Meeting Day</div>
      <div style="font-size:10px;opacity:.7;margin-top:2px">मीटिंग दिन</div>
    </div>

    <div onclick="moreTab='clients';showPage('invoices')" style="background:linear-gradient(135deg,#4c1d95,#6d28d9);border-radius:16px;padding:20px;cursor:pointer;color:white;text-align:center;box-shadow:0 4px 12px rgba(76,29,149,.3)">
      <div style="font-size:32px;margin-bottom:8px">👤</div>
      <div style="font-size:14px;font-weight:700">ग्राहक</div>
      <div style="font-size:10px;opacity:.7;margin-top:2px">Clients</div>
    </div>

    <div onclick="moreTab='cashbook';showPage('invoices')" style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);border-radius:16px;padding:20px;cursor:pointer;color:white;text-align:center;box-shadow:0 4px 12px rgba(29,78,216,.3)">
      <div style="font-size:32px;margin-bottom:8px">🧾</div>
      <div style="font-size:14px;font-weight:700">Cash Book</div>
      <div style="font-size:10px;opacity:.7;margin-top:2px">नकद बही</div>
    </div>

    <div onclick="moreTab='collreg';showPage('invoices')" style="background:linear-gradient(135deg,#854d0e,#ca8a04);border-radius:16px;padding:20px;cursor:pointer;color:white;text-align:center;box-shadow:0 4px 12px rgba(133,77,14,.3)">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      <div style="font-size:14px;font-weight:700">Collection Reg</div>
      <div style="font-size:10px;opacity:.7;margin-top:2px">संग्रह रजिस्टर</div>
    </div>

  </div>
  `}
  `;
}

function switchMoreTab(tab, btn) {
  moreTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const c = document.getElementById('more-content');
  if (c) c.innerHTML = tab==='emi' ? renderEMITab() : tab==='passbook' ? renderPassbookTab() : tab==='cashbook' ? renderCashBookTab() : tab==='collreg' ? renderCollectionRegTab() : tab==='clients' ? renderClientsTab() : renderMeetingTab();
}

function renderClientsTab() {
  return `
    <div>
      <input class="search-bar" id="search-inp" placeholder="🔍 नाम, फोन खोजें…" oninput="filterClients()"/>
      <div class="tabs" style="margin-bottom:10px">
        <button class="tab active" onclick="filterByStatus('all',this)">सभी (${allClients.length})</button>
        <button class="tab" onclick="filterByStatus('active',this)">Active (${allClients.filter(x=>x.status==='active').length})</button>
        <button class="tab" onclick="filterByStatus('closed',this)" style="color:#dc2626">🔒 Closed (${allClients.filter(x=>x.status==='closed').length})</button>
        <button class="tab" onclick="filterByStatus('inactive',this)">Inactive (${allClients.filter(x=>x.status==='inactive').length})</button>
      </div>
      <div style="margin-bottom:10px;text-align:right">
        <button onclick="openAddClient()" style="background:var(--navy);color:white;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">+ ग्राहक जोड़ें</button>
      </div>
      <div id="client-list">${allClients.map(clientCard).join('') || emptyState('👤','No clients yet / अभी कोई ग्राहक नहीं')}</div>
    </div>`;
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
    let nextAmt = loanAmt > 0 ? Math.round((loanAmt + interest) / (parseInt(cl.loan_weeks) || 12)) : 0;
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

    <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
      <input class="search-bar" id="emi-search" placeholder="🔍 ग्राहक खोजें..." oninput="filterEMIList()" style="flex:1;margin:0"/>
      <button id="mic-btn-emi-search" onclick="voiceSearch('emi-search', filterEMIList)" style="padding:6px 10px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;font-size:14px;cursor:pointer">🎤</button>
    </div>

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
  const clients = allClients;
  if (clients.length === 0) return emptyState('📒','No clients yet');
  
  let html = `
  <div style="margin-bottom:12px;display:flex;gap:6px;align-items:center">
    <input class="search-bar" id="passbook-search-more" placeholder="🔍 Client naam ya phone खोजें..." 
      oninput="filterPassbookMore(this.value)"
      style="flex:1;border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--navy);outline:none">
    <button id="mic-btn-passbook-search-more" onclick="voiceSearch('passbook-search-more', filterPassbookMore)" style="padding:8px 12px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;font-size:16px;cursor:pointer">🎤</button>
  </div>
  <div id="passbook-client-list-more">`;
  
  clients.forEach(cl => {
    const payments = allPayments.filter(p => p.client_id === cl.id && p.type === 'credit');
    const loan = parseFloat(cl.balance)||0;
    const interest = parseFloat(cl.interest_amount)||0;
    const totalPaid = payments.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
    const outstanding = Math.max(0, (loan+interest) - totalPaid);
    const initials = cl.name?.charAt(0).toUpperCase() || '?';
    const photoHtml = cl.photo_url ? '<img src="'+cl.photo_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : initials;
    const isClosed = cl.status === 'closed';
    
    html += `<div data-cid="${cl.id}" data-name="${cl.name.toLowerCase()}" data-phone="${cl.phone||''}" 
      onclick="passbookOpen(this)" 
      style="background:white;border-radius:12px;padding:12px;margin-bottom:10px;box-shadow:0 2px 8px rgba(15,37,71,.07);display:flex;align-items:center;gap:12px;cursor:pointer;${isClosed?'opacity:0.6':''}">
      <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--navy),var(--navy2));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--gold);flex-shrink:0;overflow:hidden">${photoHtml}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--navy)">${cl.name} ${isClosed?'🔒':''}</div>
        <div style="font-size:11px;color:var(--muted)">${cl.customer_id||''} · ${cl.center_name||''}</div>
        <div style="font-size:11px;color:var(--muted)">${payments.length} payments</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:${isClosed?'var(--success)':'var(--danger)'};font-size:13px">₹${fmt(outstanding)}</div>
        <div style="font-size:10px;color:var(--muted)">${isClosed?'Closed':'outstanding'}</div>
      </div>
    </div>`;
  });
  
  html += '</div>';
  return html;
}


// ── HINDI TRANSLITERATION FOR SEARCH ────────────────────────────────────
function hindiToLatin(str) {
  if (!str) return '';
  const cons = {'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'n','च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'n','ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'sh','स':'s','ह':'h'};
  const vowels = {'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऋ':'ri'};
  const matras = {'ा':'a','ि':'i','ी':'ee','ु':'u','ू':'oo','े':'e','ै':'ai','ो':'o','ौ':'au','ं':'n','ँ':'n','ः':'h','्':''};
  
  let result = '';
  const chars = [...str];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i+1] || '';
    if (cons[c]) {
      result += cons[c];
      if (!matras[next] && next !== '्') result += 'a'; // inherent 'a'
    } else if (matras[c]) {
      result += matras[c];
    } else if (vowels[c]) {
      result += vowels[c];
    } else if (c === ' ') {
      result += ' ';
    }
    // skip halant - already handled above
  }
  return result.toLowerCase().replace(/aa/g,'a').replace(/ee/g,'i');
}

function nameMatchesSearch(name, query) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const nameLower = name.toLowerCase();
  // Direct Hindi match
  if (nameLower.includes(q)) return true;
  // Transliterated match
  const transliterated = hindiToLatin(name);
  if (transliterated.includes(q)) return true;
  // Also try removing spaces
  if (transliterated.replace(/\s/g,'').includes(q.replace(/\s/g,''))) return true;
  return false;
}

// ── HINDI TRANSLITERATION ────────────────────────────────────────────────
function hindiToRoman(text) {
  if (!text) return '';
  const map = {'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ए':'e','ऐ':'ai','ओ':'o','औ':'au',
    'क':'k','ख':'kh','ग':'g','घ':'gh','च':'ch','छ':'chh','ज':'j','झ':'jh',
    'ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n',
    'प':'p','फ':'f','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v',
    'श':'sh','ष':'sh','स':'s','ह':'h','क्ष':'ksh','त्र':'tr','ज्ञ':'gya',
    'ा':'a','ि':'i','ी':'ee','ु':'u','ू':'oo','े':'e','ै':'ai','ो':'o','ौ':'au',
    'ं':'n','ः':'h','्':'','ँ':'n','़':'','ृ':'ri'};
  let result = text;
  Object.entries(map).sort((a,b) => b[0].length - a[0].length).forEach(([h,r]) => {
    result = result.split(h).join(r);
  });
  return result.toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

function filterPassbookMore(q) {
  const query = (q||'').toLowerCase().trim();
  const rows = document.querySelectorAll('#passbook-client-list-more [data-cid]');
  rows.forEach(row => {
    const name = (row.dataset.name||'').toLowerCase();
    const phone = (row.dataset.phone||'');
    const nameRoman = hindiToRoman(row.dataset.name||'');
    const show = !query || name.includes(query) || phone.includes(query) || nameRoman.includes(query);
    row.style.display = show ? '' : 'none';
  });
}


function togglePaymentHistory() {
  const body = document.getElementById('ph-body');
  const icon = document.getElementById('ph-toggle-icon');
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (icon) icon.textContent = '▲';
  } else {
    body.style.display = 'none';
    if (icon) icon.textContent = '▼';
  }
}


function filterPaymentHistory(searchQ) {
  const q = (searchQ || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#ph-table-body tr');
  rows.forEach(row => {
    const clientHindi = (row.dataset.client || '').toLowerCase();
    const clientRoman = hindiToRoman(row.dataset.client || '');
    const phone = (row.dataset.phone || '');
    const show = !q || clientHindi.includes(q) || clientRoman.includes(q) || phone.includes(q);
    row.style.display = show ? '' : 'none';
  });
}


function openRenewModal(clientId) {
  const cl = allClients.find(c => c.id === clientId);
  if (!cl) return;

  // Auto next cycle
  const cycleMap = {'1st':'2nd','2nd':'3rd','3rd':'4th','4th':'5th','5th':'6th','6th':'7th','7th':'8th','8th':'9th','9th':'10th'};
  const nextCycle = cycleMap[cl.loan_cycle] || (parseInt(cl.loan_cycle)||1) + 1 + 'th';
  const today = new Date().toISOString().slice(0,10);

  const modal = document.createElement('div');
  modal.id = 'renew-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  modal.innerHTML = `
    <div style="background:white;border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--navy)">🔄 Loan Renewal</div>
          <div style="font-size:12px;color:var(--muted)">${cl.name} — ${cl.loan_cycle} → <strong>${nextCycle}</strong></div>
        </div>
        <button onclick="document.getElementById('renew-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>

      <div style="background:#fff8e1;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#856404">
        ℹ️ KYC, Photo, Center — sab same rahega. Sirf loan details update honge.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted)">Loan Amount ₹</label>
          <input id="rn-balance" type="number" placeholder="0" value="${cl.balance||''}" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px;margin-top:3px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted)">Interest ₹</label>
          <input id="rn-interest" type="number" placeholder="0" value="${cl.interest_amount||''}" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px;margin-top:3px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted)">Loan Weeks</label>
          <select id="rn-weeks" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px;margin-top:3px">
            <option value="12" ${(cl.loan_weeks||12)==12?'selected':''}>12 Weeks</option>
            <option value="16" ${cl.loan_weeks==16?'selected':''}>16 Weeks</option>
            <option value="24" ${cl.loan_weeks==24?'selected':''}>24 Weeks</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted)">Loan Cycle</label>
          <input id="rn-cycle" type="text" value="${nextCycle}" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px;margin-top:3px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted)">Loan Date</label>
          <input id="rn-loan-date" type="date" value="${today}" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px;margin-top:3px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted)">First EMI Date</label>
          <input id="rn-emi-date" type="date" value="${today}" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:13px;margin-top:3px">
        </div>
      </div>

      <button onclick="submitRenewal('${clientId}')" style="width:100%;padding:13px;background:linear-gradient(135deg,#e65c00,#f9d423);color:white;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer">
        🔄 Renew Loan / लोन नवीनीकरण करें
      </button>
    </div>`;
  document.body.appendChild(modal);
}

async function submitRenewal(clientId) {
  const balance  = parseFloat(document.getElementById('rn-balance')?.value) || 0;
  const interest = parseFloat(document.getElementById('rn-interest')?.value) || 0;
  const weeks    = parseInt(document.getElementById('rn-weeks')?.value) || 12;
  const cycle    = document.getElementById('rn-cycle')?.value || '2nd';
  const loanDateRaw = document.getElementById('rn-loan-date')?.value || '';
  const emiDateRaw  = document.getElementById('rn-emi-date')?.value || '';
  // Ensure YYYY-MM-DD format
  const loanDate = loanDateRaw ? new Date(loanDateRaw).toISOString().slice(0,10) : null;
  const emiDate  = emiDateRaw  ? new Date(emiDateRaw).toISOString().slice(0,10)  : null;

  if (!balance) { showToast('Loan amount daalo!', 'error'); return; }

  const weeklyEMI = Math.round((balance + interest) / weeks);

  try {
    // Pehle purana loan history mein save karo
    const oldClient = allClients.find(c => c.id === clientId);
    if (oldClient) {
      // Count real payments for this cycle
      const cyclePaymentCount = allPayments.filter(p => 
        p.client_id === clientId && 
        p.type === 'credit' && 
        !(p.description||'').includes('DELETED')
      ).length;
      
      await db.from('loan_history').insert({
        client_id: clientId,
        loan_cycle: oldClient.loan_cycle || '1st',
        balance: parseFloat(oldClient.balance) || 0,
        interest_amount: parseFloat(oldClient.interest_amount) || 0,
        loan_weeks: parseInt(oldClient.loan_weeks) || 12,
        loan_date: oldClient.loan_date || null,
        first_emi_date: oldClient.first_emi_date || null,
        closed_date: new Date().toISOString().slice(0,10),
        closed_at: new Date().toISOString(),
        payment_count: cyclePaymentCount
      });
    }

    const { error } = await db.from('clients').update({
      balance,
      interest_amount: interest,
      loan_weeks: weeks,
      loan_cycle: cycle,
      loan_date: loanDate,
      first_emi_date: emiDate,
      emi_amount: weeklyEMI,
      kyc_status: 'approved'
    }).eq('id', clientId);

    if (error) throw error;

    // Mark client as active after renewal
    await db.from('clients').update({ status: 'active' }).eq('id', clientId);

    document.getElementById('renew-modal')?.remove();
    showToast(`✅ Loan Renewed! ${cycle} cycle — ₹${fmt(weeklyEMI)}/week`, 'success');
    await loadAll();

    // Navigate to passbook directly
    showPage('invoices');
    setTimeout(() => {
      moreTab = 'passbook';
      const c = document.getElementById('more-content');
      if (c) c.innerHTML = renderPassbookTab();
      setTimeout(() => showClientPassbook(clientId), 200);
    }, 400);

  } catch(err) {
    console.error('Renewal error:', err);
    showToast('Renewal failed! Try again', 'error');
  }
}


function renderCashBookTab() {
  const today = new Date().toISOString().slice(0,10);
  // Auto-fill opening balance from allPayments
  const totalCredit = allPayments.filter(p=>p.type==='credit').reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const totalDebit  = allPayments.filter(p=>p.type==='debit').reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

  return `
  <div id="cashbook-wrap">
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--navy)">🧾 Cash Book</div>
        <div style="font-size:11px;color:var(--muted)">रोज़ाना नकद बही</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="loadCashBook()" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer">📂 Load</button>
        <button onclick="saveCashBook()" style="background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer">💾 Save</button>
        <button onclick="printCashBook()" style="background:var(--navy);color:white;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Print</button>
      </div>
    </div>

    <!-- Header -->
    <div id="cashbook-print-area" style="background:white;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,37,71,.08)">
      <div style="text-align:center;font-size:16px;font-weight:800;color:var(--navy);border-bottom:2px solid var(--navy);padding-bottom:6px;margin-bottom:10px">
        धन रक्षा Finance — Cash Book / नकद बही
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;font-size:12px">
        <div style="flex:1">
          <label style="font-weight:700;color:var(--muted)">Day / दिन</label>
          <input id="cb-day" type="text" placeholder="e.g. Monday" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;margin-top:2px">
        </div>
        <div style="flex:1">
          <label style="font-weight:700;color:var(--muted)">Date / तारीख</label>
          <input id="cb-date" type="date" value="${today}" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;margin-top:2px">
        </div>
      </div>

      <!-- Receipt + Payment table -->
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px">
        <thead>
          <tr style="background:var(--navy);color:white">
            <th style="padding:7px;border:1px solid #ccc;text-align:left">Receipts / आय</th>
            <th style="padding:7px;border:1px solid #ccc;text-align:right">Amount ₹</th>
            <th style="padding:7px;border:1px solid #ccc;text-align:left">Payments / व्यय</th>
            <th style="padding:7px;border:1px solid #ccc;text-align:right">Amount ₹</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:6px;border:1px solid #ddd">Opening / शेष</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-opening" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
            <td style="padding:6px;border:1px solid #ddd">Disbursement / वितरण</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-disb" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd">Collection / संग्रह</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-coll" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
            <td style="padding:6px;border:1px solid #ddd">Bank Deposit / बैंक</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-bank" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd">LPF</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-lpf" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
            <td style="padding:6px;border:1px solid #ddd">Expense 1 / व्यय</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-exp1" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd">LPC</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-lpc" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
            <td style="padding:6px;border:1px solid #ddd">Expense 2 / व्यय</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-exp2" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd">Prepayment / अग्रिम</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-prepay" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
            <td style="padding:6px;border:1px solid #ddd">Expense 3 / व्यय</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-exp3" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
          </tr>
          <tr>
            <td style="padding:6px;border:1px solid #ddd">Over Due / बकाया</td>
            <td style="border:1px solid #ddd;padding:4px"><input id="cb-od" type="number" placeholder="0" oninput="calcCashBook()" style="width:100%;border:none;font-size:12px;text-align:right;outline:none"></td>
            <td style="padding:6px;border:1px solid #ddd;color:var(--muted)"></td>
            <td style="border:1px solid #ddd"></td>
          </tr>
          <tr style="background:#f0f4f8;font-weight:700">
            <td style="padding:7px;border:1px solid #ccc">Total / कुल</td>
            <td id="cb-total-receipt" style="padding:7px;border:1px solid #ccc;text-align:right;color:var(--success)">₹0.00</td>
            <td style="padding:7px;border:1px solid #ccc">Total / कुल</td>
            <td id="cb-total-payment" style="padding:7px;border:1px solid #ccc;text-align:right;color:var(--danger)">₹0.00</td>
          </tr>
          <tr style="background:#e8f5e9;font-weight:800">
            <td colspan="2" style="padding:7px;border:1px solid #ccc;text-align:center;color:var(--navy)">Closing Balance / समापन शेष</td>
            <td colspan="2" id="cb-closing" style="padding:7px;border:1px solid #ccc;text-align:center;font-size:14px;color:var(--navy)">₹0.00</td>
          </tr>
        </tbody>
      </table>

      <!-- Currency Denomination -->
      <div style="font-weight:700;font-size:12px;color:var(--navy);margin-bottom:6px">💵 Currency Denomination / नोट गणना</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px">
        <thead>
          <tr style="background:#f0f4f8">
            <th style="padding:5px;border:1px solid #ddd">Note</th>
            <th style="padding:5px;border:1px solid #ddd">Count / संख्या</th>
            <th style="padding:5px;border:1px solid #ddd">Amount ₹</th>
          </tr>
        </thead>
        <tbody>
          ${[2000,500,200,100,50,20,10].map(d=>`
          <tr>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;font-weight:700">₹${d}</td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" id="denom-${d}" placeholder="0" oninput="calcDenom()" min="0" style="width:100%;border:none;font-size:11px;text-align:center;outline:none"></td>
            <td id="denom-amt-${d}" style="padding:5px;border:1px solid #ddd;text-align:right;color:var(--muted)">₹0</td>
          </tr>`).join('')}
          <tr>
            <td style="padding:5px;border:1px solid #ddd;text-align:center;font-weight:700">Coin / सिक्का</td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" id="denom-coin" placeholder="0" oninput="calcDenom()" min="0" style="width:100%;border:none;font-size:11px;text-align:center;outline:none"></td>
            <td id="denom-amt-coin" style="padding:5px;border:1px solid #ddd;text-align:right;color:var(--muted)">₹0</td>
          </tr>
          <tr style="background:#f0f4f8;font-weight:700">
            <td colspan="2" style="padding:6px;border:1px solid #ccc;text-align:center">Denomination Total / कुल</td>
            <td id="denom-total" style="padding:6px;border:1px solid #ccc;text-align:right;color:var(--navy)">₹0</td>
          </tr>
        </tbody>
      </table>

      <!-- Signatures -->
      <div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="text-align:center;font-size:11px;color:var(--muted)">
          <div style="height:30px;border-bottom:1px solid #999;width:100px;margin:0 auto 4px"></div>
          B.M. Signature
        </div>
        <div style="text-align:center;font-size:11px;color:var(--muted)">
          <div style="height:30px;border-bottom:1px solid #999;width:100px;margin:0 auto 4px"></div>
          Cashier Signature
        </div>
      </div>
    </div>
  </div>`;
}

function autoGenCenterCode(name) {
  const codeEl = document.getElementById('f-center-code');
  if (!codeEl || codeEl.dataset.manual === 'true') return;
  // Take first 3 letters of each word, uppercase, join with hyphen, add number
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) { codeEl.value = ''; return; }
  const abbr = words.map(w => w.slice(0,3).toUpperCase()).join('-');
  // Count existing centers with same name prefix for unique number
  const existing = allClients.filter(c => (c.center_name||'').toLowerCase() === name.trim().toLowerCase());
  const num = String(existing.length > 0 ? existing[0].center_code?.split('-').pop() || '001' : '001');
  codeEl.value = abbr + '-' + num.padStart(3,'0');
}

// If user manually edits center code, stop auto-overwriting
document.addEventListener('input', e => {
  if (e.target.id === 'f-center-code') e.target.dataset.manual = 'true';
  if (e.target.id === 'f-center-name') e.target.nextElementSibling?.querySelector('#f-center-code') && (document.getElementById('f-center-code').dataset.manual = 'false');
});

function calcCashBook() {
  const gv = id => parseFloat(document.getElementById(id)?.value||0)||0;
  const totalReceipt = gv('cb-opening') + gv('cb-coll') + gv('cb-lpf') + gv('cb-lpc') + gv('cb-prepay') + gv('cb-od');
  const totalPayment = gv('cb-disb') + gv('cb-bank') + gv('cb-exp1') + gv('cb-exp2') + gv('cb-exp3');
  const closing = totalReceipt - totalPayment;
  const el = id => document.getElementById(id);
  if(el('cb-total-receipt')) el('cb-total-receipt').textContent = '₹'+fmt(totalReceipt);
  if(el('cb-total-payment')) el('cb-total-payment').textContent = '₹'+fmt(totalPayment);
  if(el('cb-closing')) {
    el('cb-closing').textContent = '₹'+fmt(closing);
    el('cb-closing').style.color = closing >= 0 ? 'var(--success)' : 'var(--danger)';
  }
}

function calcDenom() {
  const denoms = [2000,500,200,100,50,20,10];
  let total = 0;
  denoms.forEach(d => {
    const cnt = parseInt(document.getElementById('denom-'+d)?.value||0)||0;
    const amt = cnt * d;
    total += amt;
    const el = document.getElementById('denom-amt-'+d);
    if(el) el.textContent = '₹'+amt.toLocaleString('en-IN');
  });
  const coin = parseFloat(document.getElementById('denom-coin')?.value||0)||0;
  total += coin;
  const elCoin = document.getElementById('denom-amt-coin');
  if(elCoin) elCoin.textContent = '₹'+coin.toLocaleString('en-IN');
  const elTotal = document.getElementById('denom-total');
  if(elTotal) elTotal.textContent = '₹'+total.toLocaleString('en-IN');
}

// ── QUICK PAY FROM MEETING DAY ────────────────────────────────────────────
async function quickPay(clientId, defaultEmi) {
  const cl = allClients.find(c => c.id === clientId);
  if (!cl) return;

  const amount = prompt(`💳 ${cl.name}\nInstallment Amount (₹):`, defaultEmi);
  if (!amount || isNaN(parseFloat(amount))) return;

  const today = new Date().toISOString().slice(0,10);

  try {
    const { data, error } = await db.from('payments').insert({
      client_id: clientId,
      amount: parseFloat(amount),
      type: 'credit',
      description: 'Cash / नकद',
      date: today,
      created_by: currentUser?.id || null
    }).select().single();

    if (error) throw error;

    allPayments.unshift(data);
    showToast(`✅ ₹${fmt(parseFloat(amount))} — ${cl.name}`, 'success');

    // Auto-close check
    const totalLoanInterest = (parseFloat(cl.balance)||0) + (parseFloat(cl.interest_amount)||0);
    const totalPaid = allPayments
      .filter(p => p.client_id === clientId && p.type === 'credit' && !(p.description||'').includes('DELETED'))
      .reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
    const outstanding = Math.max(0, totalLoanInterest - totalPaid);

    if (outstanding <= 0 && cl.status !== 'closed') {
      const confirmClose = confirm(`🎉 ${cl.name} ka loan pura ho gaya!\nAccount CLOSE karein?`);
      if (confirmClose) {
        await db.from('clients').update({ status: 'closed' }).eq('id', clientId);
        await loadAll();
      }
    } else {
      await loadAll();
    }

    // Refresh meeting tab
    switchMoreTab('meeting', document.querySelector('[onclick*="meeting"]'));

  } catch(err) {
    showToast('Payment failed: ' + err.message, 'error');
  }
}


function autoCalcLPFLPC() {
  const balance = parseFloat(document.getElementById('f-balance')?.value) || 0;
  const lpf = 500; // Fixed
  const lpc = Math.ceil(balance / 10000) * 500; // ₹500 per ₹10,000

  const lpfEl = document.getElementById('f-lpf');
  const lpcEl = document.getElementById('f-lpc');
  if (lpfEl) lpfEl.value = lpf;
  if (lpcEl) lpcEl.value = lpc;
}

// ── VOICE / MIC SUPPORT ──────────────────────────────────────────────────
function startVoice(targetId, onResult, lang = 'hi-IN') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Browser mic support nahi hai! Chrome use karein.', 'error');
    return;
  }

  const btn = document.getElementById('mic-btn-' + targetId);
  if (btn) { btn.textContent = '🔴'; btn.style.animation = 'pulse 1s infinite'; }

  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript.trim();
    if (btn) { btn.textContent = '🎤'; btn.style.animation = ''; }
    if (onResult) onResult(transcript);
  };

  recognition.onerror = (e) => {
    if (btn) { btn.textContent = '🎤'; btn.style.animation = ''; }
    showToast('Mic error: ' + e.error, 'error');
  };

  recognition.onend = () => {
    if (btn) { btn.textContent = '🎤'; btn.style.animation = ''; }
  };

  recognition.start();
  showToast('🎤 Bol rahe hain... sunna shuru!', 'success');
}

function voiceAmount(targetId) {
  startVoice(targetId, (text) => {
    // Extract number from Hindi/English speech
    let num = text.replace(/[^\d]/g, '');
    // Hindi words to numbers
    const words = { 'सौ': 100, 'पांच सौ': 500, 'हजार': 1000, 'एक हजार': 1000,
      'दो हजार': 2000, 'पांच हजार': 5000, 'दस हजार': 10000 };
    Object.entries(words).forEach(([w, v]) => {
      if (text.includes(w)) num = v;
    });
    const el = document.getElementById(targetId);
    if (el && num) { el.value = num; el.dispatchEvent(new Event('input')); }
    showToast(`💰 Amount: ₹${num}`, 'success');
  });
}

function voiceSearch(targetId, filterFn) {
  startVoice(targetId, (text) => {
    const el = document.getElementById(targetId);
    if (el) { el.value = text; el.dispatchEvent(new Event('input')); }
    if (filterFn) filterFn(text);
    showToast(`🔍 Searching: "${text}"`, 'success');
  });
}

function voiceNote(targetId) {
  startVoice(targetId, (text) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.value = (el.value ? el.value + ' ' : '') + text;
      el.dispatchEvent(new Event('input'));
    }
    showToast(`📝 Note added: "${text}"`, 'success');
  });
}


async function saveCashBook() {
  const date = document.getElementById('cb-date')?.value;
  if (!date) { showToast('Date daalo pehle!', 'error'); return; }

  const gv = id => parseFloat(document.getElementById(id)?.value||0)||0;
  const gi = id => parseInt(document.getElementById(id)?.value||0)||0;

  const data = {
    entry_date: date,
    day_name: document.getElementById('cb-day')?.value || '',
    opening: gv('cb-opening'), collection: gv('cb-coll'),
    lpf: gv('cb-lpf'), lpc: gv('cb-lpc'),
    prepayment: gv('cb-prepay'), overdue: gv('cb-od'),
    disbursement: gv('cb-disb'), bank_deposit: gv('cb-bank'),
    expense1: gv('cb-exp1'), expense2: gv('cb-exp2'), expense3: gv('cb-exp3'),
    denom_2000: gi('denom-2000'), denom_500: gi('denom-500'),
    denom_200: gi('denom-200'), denom_100: gi('denom-100'),
    denom_50: gi('denom-50'), denom_20: gi('denom-20'),
    denom_10: gi('denom-10'), denom_coin: gv('denom-coin'),
    created_by: currentUser?.id || null
  };

  try {
    const { error } = await db.from('cash_book').upsert(data, { onConflict: 'entry_date' });
    if (error) throw error;
    showToast('✅ Cash Book saved! / सेव हो गई', 'success');
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function loadCashBook() {
  const date = document.getElementById('cb-date')?.value;
  if (!date) { showToast('Date select karo!', 'error'); return; }

  try {
    const { data, error } = await db.from('cash_book').select('*').eq('entry_date', date).single();
    if (error || !data) { showToast('Is date ka koi record nahi!', 'error'); return; }

    const sv = (id, val) => { 
      const el = document.getElementById(id); 
      if(el) { el.value = val||0; el.dispatchEvent(new Event('input')); }
    };
    sv('cb-day', data.day_name); sv('cb-opening', data.opening);
    sv('cb-coll', data.collection); sv('cb-lpf', data.lpf);
    sv('cb-lpc', data.lpc); sv('cb-prepay', data.prepayment);
    sv('cb-od', data.overdue); sv('cb-disb', data.disbursement);
    sv('cb-bank', data.bank_deposit); sv('cb-exp1', data.expense1);
    sv('cb-exp2', data.expense2); sv('cb-exp3', data.expense3);
    sv('denom-2000', data.denom_2000); sv('denom-500', data.denom_500);
    sv('denom-200', data.denom_200); sv('denom-100', data.denom_100);
    sv('denom-50', data.denom_50); sv('denom-20', data.denom_20);
    sv('denom-10', data.denom_10); sv('denom-coin', data.denom_coin);
    calcCashBook(); 
    if (typeof calcDenom === 'function') calcDenom();
    showToast('✅ Cash Book loaded!', 'success');
  } catch(err) {
    showToast('Load failed: ' + err.message, 'error');
  }
}

// ── COLLECTION REGISTER SAVE/LOAD ─────────────────────────────────────────
async function saveCollReg() {
  const date = document.getElementById('cr-date')?.value;
  if (!date) { showToast('Date daalo!', 'error'); return; }

  // Get all rows data
  const rows = document.querySelectorAll('#cr-tbody tr[data-center]');
  const entries = [];

  rows.forEach(row => {
    const centerName = row.dataset.center || '';
    const due = parseFloat(row.querySelector('[data-col="due"]')?.value||0)||0;
    const pre = parseFloat(row.querySelector('[data-col="pre"]')?.value||0)||0;
    const od = parseFloat(row.querySelector('[data-col="od"]')?.value||0)||0;
    const lpf = parseFloat(row.querySelector('[data-col="lpf"]')?.value||0)||0;
    const lpc = parseFloat(row.querySelector('[data-col="lpc"]')?.value||0)||0;
    const remark = row.querySelector('input[placeholder]')?.value || '';
    if (centerName) entries.push({
      entry_date: date, center_name: centerName,
      due_collection: due, pre_collection: pre,
      od_collection: od, lpf, lpc,
      total_collection: due+pre+od+lpf+lpc,
      remark, created_by: currentUser?.id || null
    });
  });

  if (!entries.length) { showToast('Koi data nahi!', 'error'); return; }

  try {
    await db.from('collection_register').delete().eq('entry_date', date);
    const { error } = await db.from('collection_register').insert(entries);
    if (error) throw error;
    showToast(`✅ ${entries.length} centers saved!`, 'success');
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function loadCollReg() {
  const date = document.getElementById('cr-date')?.value;
  if (!date) { showToast('Date select karo!', 'error'); return; }

  try {
    const { data, error } = await db.from('collection_register').select('*').eq('entry_date', date);
    if (error || !data?.length) { showToast('Is date ka koi record nahi!', 'error'); return; }

    data.forEach(row => {
      const tr = document.querySelector(`#cr-tbody tr[data-center="${row.center_name}"]`);
      if (!tr) return;
      const sv = (col, val) => { const el = tr.querySelector(`[data-col="${col}"]`); if(el) el.value = val||0; };
      sv('due', row.due_collection); sv('pre', row.pre_collection);
      sv('od', row.od_collection); sv('lpf', row.lpf); sv('lpc', row.lpc);
      const ri = tr.querySelector('input[placeholder="रिमार्क"]');
      if (ri) ri.value = row.remark || '';
    });
    showToast('✅ Collection Register loaded!', 'success');
  } catch(err) {
    showToast('Load failed: ' + err.message, 'error');
  }
}

function printCashBook() {
  const day = document.getElementById('cb-day')?.value || '';
  const date = document.getElementById('cb-date')?.value || '';
  const area = document.getElementById('cashbook-print-area');
  if(!area) return;
  const html = `<!DOCTYPE html><html><head><title>Cash Book - ${date}</title>
  <style>body{font-family:Arial,sans-serif;margin:10mm}table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #999;padding:6px;font-size:12px}th{background:#1a2e4a;color:white}
  input{border:none;width:100%;text-align:right;font-size:12px}
  @media print{@page{margin:10mm}}</style></head><body>
  <h2 style="text-align:center;margin-bottom:4px">धन रक्षा Finance — Cash Book</h2>
  <p style="text-align:center;font-size:12px;margin-top:0">Day: <b>${day}</b> &nbsp; Date: <b>${date}</b></p>
  ${area.innerHTML}</body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── COLLECTION REGISTER ────────────────────────────────────────────────────
function renderCollectionRegTab() {
  // Build center-wise data from allClients + allPayments
  const centerMap = {};
  allClients.forEach(c => {
    const key = c.center_name || 'Unknown';
    if(!centerMap[key]) centerMap[key] = { name: key, clients: 0, due: 0, pre: 0, od: 0, lpf: 0, lpc: 0 };
    const weeks = parseInt(c.loan_weeks) || 12;
    const loan  = parseFloat(c.balance) || 0;
    const intr  = parseFloat(c.interest_amount) || 0;
    centerMap[key].due += Math.round((loan + intr) / weeks);   // Weekly EMI due
    centerMap[key].clients++;
  });

  // Fill Pre / OD / LPF / LPC from today's payments by description keyword
  const today = new Date().toISOString().slice(0,10);
  allPayments.filter(p => p.type === 'credit').forEach(p => {
    const cl = allClients.find(c => c.id === p.client_id);
    if(!cl) return;
    const key = cl.center_name || 'Unknown';
    if(!centerMap[key]) return;
    const amt = parseFloat(p.amount) || 0;
    const desc = (p.description || '').toLowerCase();
    if(desc.includes('lpf'))                          centerMap[key].lpf += amt;
    else if(desc.includes('lpc'))                     centerMap[key].lpc += amt;
    else if(desc.includes('overdue')||desc.includes('od')||desc.includes('over due')) centerMap[key].od += amt;
    else if(desc.includes('pre')||desc.includes('advance')||desc.includes('prepay'))  centerMap[key].pre += amt;
  });
  const centers = Object.values(centerMap);

  return `
  <div id="collreg-wrap">
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--navy)">📋 Collection Register</div>
        <div style="font-size:11px;color:var(--muted)">Center-wise Collection / केंद्रवार संग्रह</div>
      </div>
      <div style="display:flex;gap:6px">
        <input type="date" id="cr-date" value="${today}" style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:11px">
        <button onclick="loadCollReg()" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer">📂 Load</button>
        <button onclick="saveCollReg()" style="background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer">💾 Save</button>
        <button onclick="printCollReg()" style="background:var(--navy);color:white;border:none;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Print</button>
      </div>
    </div>

    <div id="collreg-print-area" style="background:white;border-radius:12px;padding:14px;box-shadow:0 2px 8px rgba(15,37,71,.08);overflow-x:auto">
      <div style="text-align:center;font-size:15px;font-weight:800;color:var(--navy);border-bottom:2px solid var(--navy);padding-bottom:6px;margin-bottom:4px">
        Collection Register / संग्रह रजिस्टर
      </div>
      <div style="text-align:right;font-size:11px;color:var(--muted);margin-bottom:8px">
        Date / तारीख: <span id="cr-date-display">${today}</span>
      </div>

      <table id="cr-table" style="width:100%;border-collapse:collapse;font-size:11px;min-width:620px">
        <thead>
          <tr style="background:var(--navy);color:white">
            <th style="padding:7px;border:1px solid #555;text-align:left;white-space:nowrap">Centre Name<br>केंद्र का नाम</th>
            <th style="padding:7px;border:1px solid #555;text-align:right;white-space:nowrap">Due Collection<br>देय संग्रह</th>
            <th style="padding:7px;border:1px solid #555;text-align:right;white-space:nowrap">Pre Collection<br>अग्रिम</th>
            <th style="padding:7px;border:1px solid #555;text-align:right;white-space:nowrap">Over Due<br>बकाया</th>
            <th style="padding:7px;border:1px solid #555;text-align:right;white-space:nowrap">LPF</th>
            <th style="padding:7px;border:1px solid #555;text-align:right;white-space:nowrap">LPC</th>
            <th style="padding:7px;border:1px solid #555;text-align:right;white-space:nowrap">Total<br>कुल</th>
            <th style="padding:7px;border:1px solid #555;text-align:center;white-space:nowrap">Cashier<br>Sign</th>
            <th style="padding:7px;border:1px solid #555;text-align:center;white-space:nowrap">CM<br>Sign</th>
            <th style="padding:7px;border:1px solid #555;text-align:center;white-space:nowrap">BM<br>Sign</th>
            <th style="padding:7px;border:1px solid #555;text-align:center;white-space:nowrap">Remark</th>
          </tr>
        </thead>
        <tbody id="cr-tbody">
          ${centers.length ? centers.map((ct,i)=>`
          <tr data-center="${ct.name}" style="${i%2===0?'background:#fafafa':'background:white'}">
            <td style="padding:6px;border:1px solid #ddd;font-weight:600">${ct.name}<br><span style="font-size:9px;color:var(--muted)">${ct.clients} clients</span></td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${i}" data-col="due" value="${ct.due||''}" oninput="calcCR(${i})" style="width:70px;border:none;font-size:11px;text-align:right;outline:none"></td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${i}" data-col="pre" value="${ct.pre||''}" oninput="calcCR(${i})" style="width:70px;border:none;font-size:11px;text-align:right;outline:none"></td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${i}" data-col="od" value="${ct.od||''}" oninput="calcCR(${i})" style="width:60px;border:none;font-size:11px;text-align:right;outline:none"></td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${i}" data-col="lpf" value="${ct.lpf||''}" oninput="calcCR(${i})" style="width:60px;border:none;font-size:11px;text-align:right;outline:none"></td>
            <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${i}" data-col="lpc" value="${ct.lpc||''}" oninput="calcCR(${i})" style="width:60px;border:none;font-size:11px;text-align:right;outline:none"></td>
            <td id="cr-total-${i}" style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:700;color:var(--success)">${((ct.due||0)+(ct.pre||0)+(ct.od||0)+(ct.lpf||0)+(ct.lpc||0)).toLocaleString('en-IN')}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;color:var(--muted);font-size:13px">—</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;color:var(--muted);font-size:13px">—</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;color:var(--muted);font-size:13px">—</td>
            <td style="border:1px solid #ddd;padding:3px"><input type="text" placeholder="रिमार्क" style="width:80px;border:none;font-size:10px;outline:none"></td>
          </tr>`).join('') :
          `<tr><td colspan="11" style="padding:16px;text-align:center;color:var(--muted);border:1px solid #ddd">No centers found. Add clients with center names first.</td></tr>`
          }
          <!-- Add blank row button -->
          <tr id="cr-add-row">
            <td colspan="11" style="padding:6px;border:1px solid #ddd;text-align:center">
              <button onclick="addCRRow()" style="background:none;border:1px dashed var(--border);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;color:var(--muted)">+ Add Row / पंक्ति जोड़ें</button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background:#e8f5e9;font-weight:800">
            <td style="padding:7px;border:1px solid #ccc;font-size:12px">Grand Total / कुल योग</td>
            <td id="cr-gt-due" style="padding:7px;border:1px solid #ccc;text-align:right">${centers.reduce((s,c)=>s+(c.due||0),0).toLocaleString('en-IN')}</td>
            <td id="cr-gt-pre" style="padding:7px;border:1px solid #ccc;text-align:right">${centers.reduce((s,c)=>s+(c.pre||0),0).toLocaleString('en-IN')}</td>
            <td id="cr-gt-od" style="padding:7px;border:1px solid #ccc;text-align:right">${centers.reduce((s,c)=>s+(c.od||0),0).toLocaleString('en-IN')}</td>
            <td id="cr-gt-lpf" style="padding:7px;border:1px solid #ccc;text-align:right">${centers.reduce((s,c)=>s+(c.lpf||0),0).toLocaleString('en-IN')}</td>
            <td id="cr-gt-lpc" style="padding:7px;border:1px solid #ccc;text-align:right">${centers.reduce((s,c)=>s+(c.lpc||0),0).toLocaleString('en-IN')}</td>
            <td id="cr-gt-total" style="padding:7px;border:1px solid #ccc;text-align:right;color:var(--navy)">${centers.reduce((s,c)=>s+(c.due||0)+(c.pre||0)+(c.od||0)+(c.lpf||0)+(c.lpc||0),0).toLocaleString('en-IN')}</td>
            <td colspan="4" style="border:1px solid #ccc"></td>
          </tr>
        </tfoot>
      </table>

      <!-- Signatures -->
      <div style="display:flex;justify-content:space-around;margin-top:16px;padding-top:10px;border-top:1px solid var(--border)">
        ${['B.M. Signature','Cashier Signature','CM Signature'].map(s=>`
        <div style="text-align:center;font-size:11px;color:var(--muted)">
          <div style="height:28px;border-bottom:1px solid #999;width:90px;margin:0 auto 4px"></div>
          ${s}
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

let crRowCount = 0;
function addCRRow() {
  crRowCount++;
  const tbody = document.getElementById('cr-tbody');
  const addRow = document.getElementById('cr-add-row');
  const idx = 'extra-'+crRowCount;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="border:1px solid #ddd;padding:3px"><input type="text" placeholder="Centre Name" style="width:100%;border:none;font-size:11px;outline:none"></td>
    <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${idx}" data-col="due" placeholder="0" oninput="calcCR('${idx}')" style="width:70px;border:none;font-size:11px;text-align:right;outline:none"></td>
    <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${idx}" data-col="pre" placeholder="0" oninput="calcCR('${idx}')" style="width:70px;border:none;font-size:11px;text-align:right;outline:none"></td>
    <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${idx}" data-col="od" placeholder="0" oninput="calcCR('${idx}')" style="width:60px;border:none;font-size:11px;text-align:right;outline:none"></td>
    <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${idx}" data-col="lpf" placeholder="0" oninput="calcCR('${idx}')" style="width:60px;border:none;font-size:11px;text-align:right;outline:none"></td>
    <td style="border:1px solid #ddd;padding:3px"><input type="number" data-row="${idx}" data-col="lpc" placeholder="0" oninput="calcCR('${idx}')" style="width:60px;border:none;font-size:11px;text-align:right;outline:none"></td>
    <td id="cr-total-${idx}" style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:700;color:var(--success)">0</td>
    <td style="padding:6px;border:1px solid #ddd;text-align:center;color:var(--muted)">—</td>
    <td style="padding:6px;border:1px solid #ddd;text-align:center;color:var(--muted)">—</td>
    <td style="padding:6px;border:1px solid #ddd;text-align:center;color:var(--muted)">—</td>
    <td style="border:1px solid #ddd;padding:3px"><input type="text" placeholder="रिमार्क" style="width:80px;border:none;font-size:10px;outline:none"></td>`;
  tbody.insertBefore(tr, addRow);
}

function calcCR(rowIdx) {
  const inputs = document.querySelectorAll(`[data-row="${rowIdx}"]`);
  let total = 0;
  inputs.forEach(inp => { total += parseFloat(inp.value||0)||0; });
  const el = document.getElementById('cr-total-'+rowIdx);
  if(el) el.textContent = total.toLocaleString('en-IN');
  // Update grand totals
  const cols = ['due','pre','od','lpf','lpc'];
  cols.forEach(col => {
    const allInputs = document.querySelectorAll(`[data-col="${col}"]`);
    let sum = 0;
    allInputs.forEach(inp => { sum += parseFloat(inp.value||0)||0; });
    const gt = document.getElementById('cr-gt-'+col);
    if(gt) gt.textContent = sum.toLocaleString('en-IN');
  });
  // Grand total of totals
  const totCells = document.querySelectorAll('[id^="cr-total-"]');
  let grandTotal = 0;
  totCells.forEach(cell => { grandTotal += parseFloat(cell.textContent.replace(/,/g,''))||0; });
  const gtTotal = document.getElementById('cr-gt-total');
  if(gtTotal) gtTotal.textContent = grandTotal.toLocaleString('en-IN');
}

function printCollReg() {
  const date = document.getElementById('cr-date')?.value || '';
  const el = document.getElementById('cr-date-display');
  if(el) el.textContent = date;
  const area = document.getElementById('collreg-print-area');
  if(!area) return;
  const html = `<!DOCTYPE html><html><head><title>Collection Register - ${date}</title>
  <style>body{font-family:Arial,sans-serif;margin:8mm;font-size:11px}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;font-size:10px}
  th{background:#1a2e4a;color:white}input{border:none;font-size:10px;width:100%}
  button{display:none}@media print{@page{size:landscape;margin:8mm}}</style>
  </head><body>${area.innerHTML}</body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

function renderMeetingTab() {
  const days = ['Monday / सोमवार','Tuesday / मंगलवार','Wednesday / बुधवार','Thursday / गुरुवार','Friday / शुक्रवार','Saturday / शनिवार','Sunday / रविवार'];
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const dayName = today.toLocaleDateString('en-US', {weekday:'long'});

  // Selected day — default aaj ka
  const selectedDay = window._meetingSelectedDay || dayName;

  // Group clients by meeting day
  const byDay = {};
  days.forEach(d => { byDay[d] = []; });

  allClients.forEach(cl => {
    const mDay = (cl.finance_company || cl.meeting_day || '').trim();
    if (!mDay) return;
    if (byDay[mDay] !== undefined) { byDay[mDay].push(cl); return; }
    const mLow = mDay.split('/')[0].trim().toLowerCase();
    const matched = days.find(d => d.split('/')[0].trim().toLowerCase() === mLow);
    if (matched) byDay[matched].push(cl);
  });

  // Day selector buttons
  let daySelector = `<div style="margin-bottom:12px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:600">📅 Meeting Day Select करें:</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">`;

  days.forEach(d => {
    const short = d.split('/')[0].trim();
    const isSelected = selectedDay === short;
    const isToday = dayName === short;
    const count = byDay[d]?.length || 0;
    daySelector += `<button onclick="window._meetingSelectedDay='${short}';switchMoreTab('meeting')" 
      style="padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;
      background:${isSelected?'var(--navy)':isToday?'#dcfce7':'#f3f4f6'};
      color:${isSelected?'white':isToday?'#166534':'var(--muted)'};
      border:${isSelected?'none':isToday?'1px solid #86efac':'1px solid var(--border)'};
      white-space:nowrap">
      ${isToday?'⭐ ':''}${short} (${count})
    </button>`;
  });

  daySelector += `<button onclick="window._meetingSelectedDay=null;switchMoreTab('meeting')" 
    style="padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;
    background:#fef3c7;color:#92400e;border:1px solid #fcd34d;white-space:nowrap">
    📋 All Days
  </button>`;
  daySelector += `</div></div>`;

  let html = daySelector;

  // Filter days based on selection
  const daysToShow = window._meetingSelectedDay 
    ? days.filter(d => d.split('/')[0].trim() === selectedDay)
    : days.filter(d => d.split('/')[0].trim() === dayName); // default: aaj ka din

  if (!daysToShow.some(d => byDay[d]?.length > 0)) {
    html += `<div style="text-align:center;padding:30px;color:var(--muted)">
      <div style="font-size:30px">📋</div>
      <div style="font-size:14px;font-weight:700;margin-top:8px">${selectedDay} ko koi meeting nahi!</div>
      <div style="font-size:12px;margin-top:4px">Doosra din select karein</div>
    </div>`;
    return `<div style="padding:8px">${html}</div>`;
  }

  daysToShow.forEach(day => {
    const clients = byDay[day];
    if (!clients.length) return;

    const dayShort = day.split('/')[0].trim();
    const isToday = dayName === dayShort;

    // Group by center
    const centerMap = {};
    clients.forEach(cl => {
      const key = cl.center_name || 'Unknown Center';
      if (!centerMap[key]) centerMap[key] = [];
      centerMap[key].push(cl);
    });

    Object.entries(centerMap).forEach(([centerName, centerClients]) => {
      const totalLoan = centerClients.reduce((s,cl) => s+(parseFloat(cl.balance)||0), 0);
      const totalOutstanding = centerClients.reduce((s,cl) => {
        const paid = allPayments.filter(p=>p.client_id===cl.id&&p.type==='credit'&&!(p.description||'').includes('Reversal')).reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
        const reverted = allPayments.filter(p=>p.client_id===cl.id&&p.type==='debit'&&(p.description||'').includes('Reversal')).reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
        return s + Math.max(0,(parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0)-paid+reverted);
      }, 0);
      const totalEMI = centerClients.reduce((s,cl) => s+Math.round(((parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0))/(parseInt(cl.loan_weeks)||12)), 0);
      const totalPDue = centerClients.reduce((s,cl) => s+Math.round((parseFloat(cl.balance)||0)/(parseInt(cl.loan_weeks)||12)), 0);
      const totalIDue = centerClients.reduce((s,cl) => s+Math.round((parseFloat(cl.interest_amount)||0)/(parseInt(cl.loan_weeks)||12)), 0);

    html += '<div style="margin-bottom:20px;border:1px solid #ccc;border-radius:8px;overflow:hidden;background:white">';
    
    // Company Header
    html += '<div style="text-align:center;padding:10px;border-bottom:2px solid #000">';
    html += '<div style="font-size:16px;font-weight:700;text-transform:uppercase">धन रक्षा Finance</div>';
    html += '<div style="font-size:11px;color:#666">शाखा कार्यालय: बलिया</div>';
    html += '</div>';

    // Center Info - Row 1
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<tr>';
    html += '<td style="border:1px solid #ccc;padding:5px;width:33%"><strong>'+centerName+' / '+(centerClients[0]?.center_code||'')+'</strong></td>';
    html += '<td style="border:1px solid #ccc;padding:5px;width:34%;text-align:center"><strong>'+day+'</strong>'+(isToday?' ⭐ TODAY':'')+'</td>';
    html += '<td style="border:1px solid #ccc;padding:5px;width:33%">'+day.split('/')[0].trim().toUpperCase()+'</td>';
    html += '</tr>';
    
    // Row 2
    html += '<tr>';
    html += '<td style="border:1px solid #ccc;padding:5px">CDS Date: <strong>'+todayStr+'</strong></td>';
    html += '<td style="border:1px solid #ccc;padding:5px;text-align:center">Day: <strong>'+dayShort+'</strong></td>';
    html += '<td style="border:1px solid #ccc;padding:5px">Time: <strong>9:00 AM</strong></td>';
    html += '</tr>';
    
    // Row 3
    html += '<tr>';
    html += '<td style="border:1px solid #ccc;padding:5px">L.C.: <strong>'+(centerClients[0]?.loan_cycle||'—')+'</strong></td>';
    html += '<td style="border:1px solid #ccc;padding:5px;text-align:center">Members: <strong>'+centerClients.length+'</strong></td>';
    html += '<td style="border:1px solid #ccc;padding:5px">T.Outstanding: <strong style="color:red">₹'+fmt(totalOutstanding)+'</strong></td>';
    html += '</tr>';
    
    // Row 4
    html += '<tr>';
    html += '<td style="border:1px solid #ccc;padding:5px">Center ID: <strong>'+(centerClients[0]?.center_code||'—')+'</strong></td>';
    html += '<td style="border:1px solid #ccc;padding:5px">Receipt No: </td>';
    html += '<td style="border:1px solid #ccc;padding:5px">Staff: <strong>'+currentProfile?.name+'</strong></td>';
    html += '</tr>';
    
    // NPA + Remarks
    html += '<tr>';
    html += '<td style="border:1px solid #ccc;padding:5px">NPA: <strong>0</strong></td>';
    html += '<td colspan="2" style="border:1px solid #ccc;padding:5px">Remarks: </td>';
    html += '</tr>';
    html += '</table>';

    // CENTER CDS Title
    html += '<div style="text-align:center;font-weight:700;font-size:13px;padding:6px;background:#f5f5f5;border-top:1px solid #ccc;border-bottom:1px solid #ccc">CENTER CDS</div>';

    // Main Table
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:10px;min-width:800px">';
    html += '<thead><tr style="background:#1a2e4a;color:white">';
    html += '<th style="padding:5px 4px;border:1px solid #444">LOAN NO.</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">CLIENT NAME</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">LOAN AMT</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">DB DATE</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">INS.NO</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">OS (P/I)</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">NPA</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">P.DUE</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">INT.DUE</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">CRM</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">COLTD</th>';
    html += '<th style="padding:5px 4px;border:1px solid #444">SIGN.</th>';
    html += '</tr></thead><tbody>';

    centerClients.forEach((cl, i) => {
      const loanStartDate = cl.loan_date || cl.first_emi_date || null;
      const payments = allPayments.filter(p => {
        if (p.client_id !== cl.id || p.type !== 'credit') return false;
        if ((p.description||'').includes('DELETED')) return false;
        if (loanStartDate && p.date && p.date < loanStartDate) return false;
        return true;
      });
      const totalPaid = payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
      const loanAmt = parseFloat(cl.balance)||0;
      const intAmt = parseFloat(cl.interest_amount)||0;
      const outstandingP = Math.max(0, loanAmt - payments.length * Math.round(loanAmt/(parseInt(cl.loan_weeks)||12)));
      const outstandingI = Math.max(0, intAmt - payments.length * Math.round(intAmt/(parseInt(cl.loan_weeks)||12)));
      const _weeks = parseInt(cl.loan_weeks)||12;
      const emi = Math.round((loanAmt + intAmt) / _weeks);
      const pDue = Math.round(loanAmt / _weeks);
      const iDue = emi - pDue;
      const instNo = payments.length;
      const dbDate = cl.loan_date || cl.first_emi_date || '—';
      const bg = i%2===0 ? 'white' : '#f9f9f9';

      html += '<tr style="background:'+bg+'">';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;font-size:10px">'+(cl.loan_id||cl.customer_id||'—')+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;font-weight:600">'+cl.name+'<br><span style="font-size:9px;color:#666">W/O '+(cl.husband_wife_name||cl.guarantor_name||'—')+' / '+(cl.phone||'—')+'</span></td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:right">'+fmt(loanAmt)+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:center;font-size:9px">'+dbDate+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:center">'+instNo+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:right;color:red">'+fmt(outstandingP)+'/'+fmt(outstandingI)+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:center">0</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:right">'+fmt(pDue)+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:right">'+fmt(iDue)+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;min-width:50px"></td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:right;font-weight:700;color:green">'+fmt(emi)+'</td>';
      html += '<td style="padding:5px 4px;border:1px solid #ddd;text-align:center">'
        + (outstandingP > 0 ? '<button onclick="quickPay(\''+cl.id+'\','+emi+')" style="background:#22c55e;color:white;border:none;border-radius:6px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">💳 Pay</button>' : '<span style="color:green;font-size:11px">✅ Done</span>')
        + '</td>';
      html += '</tr>';
    });

    // Total Row
    html += '<tr style="background:#f0f4f8;font-weight:700;border-top:2px solid #1a2e4a">';
    html += '<td colspan="2" style="padding:6px 4px;border:1px solid #ddd">Total</td>';
    html += '<td style="padding:6px 4px;border:1px solid #ddd;text-align:right">'+fmt(totalLoan)+'</td>';
    html += '<td colspan="2" style="border:1px solid #ddd"></td>';
    html += '<td style="padding:6px 4px;border:1px solid #ddd;text-align:right;color:red">'+fmt(totalOutstanding)+'</td>';
    html += '<td style="padding:6px 4px;border:1px solid #ddd;text-align:center">0</td>';
    html += '<td style="padding:6px 4px;border:1px solid #ddd;text-align:right">'+fmt(totalPDue)+'</td>';
    html += '<td style="padding:6px 4px;border:1px solid #ddd;text-align:right">'+fmt(totalIDue)+'</td>';
    html += '<td style="border:1px solid #ddd"></td>';
    html += '<td style="padding:6px 4px;border:1px solid #ddd;text-align:right;color:green">'+fmt(totalEMI)+'</td>';
    html += '<td style="border:1px solid #ddd"></td>';
    html += '</tr>';
    html += '</tbody></table></div>';

    // Denomination
    html += '<div style="padding:8px;border-top:1px solid #ccc">';
    html += '<div style="font-weight:700;font-size:11px;margin-bottom:6px"><em>Denomination:</em></div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:10px">';
    html += '<tr>';
    ['2000 X .','500 X .','200 X .','100 X .','50 X .','20 X .','10 X .','Coins .','Total'].forEach(d => {
      html += '<td style="border:1px solid #ccc;padding:5px;text-align:center">'+d+'</td>';
    });
    html += '</tr><tr>';
    for(let j=0;j<8;j++) html += '<td style="border:1px solid #ccc;padding:10px"></td>';
    html += '<td style="border:1px solid #ccc;padding:5px;text-align:right;font-weight:700;color:green">₹'+fmt(totalEMI)+'</td>';
    html += '</tr></table></div>';

    // Signatures
    html += '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px">';
    html += '<tr>';
    html += '<td style="border-top:1px solid #000;padding:5px;text-align:center;width:33%">Signature of FO</td>';
    html += '<td style="border-top:1px solid #000;padding:5px;text-align:center;width:34%">Signature of Group Leader</td>';
    html += '<td style="border-top:1px solid #000;padding:5px;text-align:center;width:33%">Signature of Branch Manager</td>';
    html += '</tr></table>';
    
    // Print button
    html += '<div style="text-align:center;padding:10px">';
    html += '<button onclick="printMeetingSheet()" style="background:#1a2e4a;color:white;border:none;border-radius:8px;padding:8px 20px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Print CDS</button>';
    html += '</div>';
    
    html += '</div>'; // end card
    }); // end centerMap forEach
  }); // end days forEach

  if (!html) return emptyState('🏘️','No meeting scheduled<br>Client में Meeting Day set करें');
  return html;
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
  today.setHours(0,0,0,0);

  const overdueClients = allClients.filter(c => {
    if (c.status === 'closed' || c.status === 'inactive') return false;
    const loanAmt = parseFloat(c.balance) || 0;
    const intAmt = parseFloat(c.interest_amount) || 0;
    if (!loanAmt) return false;

    const totalWeeks = parseInt(c.loan_weeks) || 12;
    const weeklyEMI = Math.round((loanAmt + intAmt) / totalWeeks);

    // First EMI date se kitne weeks ho gaye
    const firstEMI = new Date(c.first_emi_date || c.loan_date || c.created_at);
    firstEMI.setHours(0,0,0,0);
    if (firstEMI > today) return false; // loan abhi shuru nahi hua

    const weeksElapsed = Math.floor((today - firstEMI) / (7 * 24 * 60 * 60 * 1000));
    const expectedInstallments = Math.min(weeksElapsed, totalWeeks);
    if (expectedInstallments <= 0) return false;

    // Real payments (reversal exclude)
    const realPaid = allPayments
      .filter(p => p.client_id === c.id && p.type === 'credit' && !(p.description||'').includes('Reversal') && !(p.description||'').includes('DELETED'))
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const debitReversals = allPayments
      .filter(p => p.client_id === c.id && p.type === 'debit' && (p.description||'').includes('Reversal'))
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const netPaid = Math.max(0, realPaid - debitReversals);

    const expectedAmt = expectedInstallments * weeklyEMI;
    return netPaid < expectedAmt; // missed at least one EMI
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
      <h1>🚩 Dhan Raksha Finance — Client Report</h1>
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

  const payments = allPayments.filter(p => p.client_id === clientId && !(p.description||'').includes('DELETED') && (p.type === 'credit' || (p.type === 'debit' && (p.description||'').includes('Reversal'))));
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
    `Dhan Raksha Finance`
  );

  const phone = c.phone.replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${phone}?text=${message}`;
  window.open(waUrl, '_blank');
}

function sendBirthdayWish(clientId) {
  const c = allClients.find(x => x.id === clientId);
  if (!c || !c.phone) { showToast('No phone number', 'error'); return; }
  const message = encodeURIComponent(`🎂 जन्मदिन मुबारक हो ${c.name} जी! 🎉\nआपको और आपके परिवार को ढेर सारी शुभकामनाएं!\n\nDhan Raksha Finance 🙏`);
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
          <div class="client-card passbook-client" data-id="${cl.id}" data-name="${cl.name.toLowerCase()}" onclick="showClientPassbook('${cl.id}')" ontouchstart="this._touchY=event.touches[0].clientY" ontouchend="if(Math.abs(event.changedTouches[0].clientY-this._touchY)<10){event.preventDefault();showClientPassbook('${cl.id}')}" style="margin-bottom:10px;cursor:pointer">
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

function passbookOpen(el) {
  const id = el.getAttribute('data-cid') || el.closest('[data-cid]')?.getAttribute('data-cid');
  if (id) showClientPassbook(id);
}


function showClientPassbook(clientId, showFullHistory = false) {
  const cl = allClients.find(x => x.id === clientId);
  if (!cl) return;

  // Load loan history for this client
  db.from('loan_history').select('*').eq('client_id', clientId).order('created_at', {ascending: true}).then(({ data: history }) => {
    const historyList = history || [];

    // Only show payments from current loan cycle
    // Use most recent loan_history closed_at for precise timestamp filtering
    const lastHistory = historyList.length > 0 ? historyList[historyList.length - 1] : null;
    const cycleStartTimestamp = lastHistory?.closed_at || null;
    const loanStartDate = cl.loan_date || cl.first_emi_date || null;

    let payments = allPayments.filter(p => {
      if (p.client_id !== clientId) return false;
      if ((p.description||'').includes('DELETED')) return false;
      if (!(p.type === 'credit' || (p.type === 'debit' && (p.description||'').includes('Reversal')))) return false;
      if (!showFullHistory) {
        // Use exact timestamp if available
        if (cycleStartTimestamp && p.created_at) {
          return p.created_at >= cycleStartTimestamp;
        }
        // Fallback to date
        if (loanStartDate && p.date && p.date < loanStartDate) return false;
      }
      return true;
    }).sort((a,b) => new Date(a.date) - new Date(b.date));

    // Fallback: show all if no payments in current cycle and no history
    if (payments.length === 0 && historyList.length === 0) {
      payments = allPayments.filter(p => {
        if (p.client_id !== clientId) return false;
        if ((p.description||'').includes('DELETED')) return false;
        if (!(p.type === 'credit' || (p.type === 'debit' && (p.description||'').includes('Reversal')))) return false;
        return true;
      }).sort((a,b) => new Date(a.date) - new Date(b.date));
    }

    const c = document.getElementById('main-content');
    if (!c) return;

    // History tabs
    const historyTabs = historyList.length > 0 ? `
    <div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:4px">
      ${historyList.map((h,i) => `
        <button onclick="showLoanHistoryPassbook('${clientId}', ${i})" 
          style="white-space:nowrap;padding:5px 10px;background:#f3f4f6;border:1px solid var(--border);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;color:var(--muted)">
          📋 ${h.loan_cycle||'Past'}
        </button>`).join('')}
      <button onclick="showClientPassbook('${clientId}', false)" 
        style="white-space:nowrap;padding:5px 10px;background:var(--navy);border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;color:white">
        📒 Current (${cl.loan_cycle||'Latest'})
      </button>
    </div>` : '';

    c.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <button onclick="showPassbook()" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
      <div style="font-size:16px;font-weight:700;color:var(--navy)">📒 ${cl.name}</div>
      <button onclick="printPassbook('${clientId}')" style="margin-left:auto;background:var(--navy);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Print</button>
    </div>

    ${historyTabs}`;

    // Variables for passbook calculation
    const loan = parseFloat(cl.balance) || 0;
    const interest = parseFloat(cl.interest_amount) || 0;
    const totalWeeks = parseInt(cl.loan_weeks) || 12;
    const weeklyEMI = Math.round((loan + interest) / totalWeeks);
    const weeklyPrincipal = Math.round(loan / totalWeeks);
    const weeklyInterest = weeklyEMI - weeklyPrincipal;
    const totalDuePerWeek = cl.emi_amount || weeklyEMI;

    c.innerHTML += `
    <!-- Client Info Card -->
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
        <div><span style="opacity:.6">Interest:</span> <strong style="color:#FFD700">₹${fmt(interest)}</strong></div>
        <div><span style="opacity:.6">LPF:</span> <strong style="color:#FFD700">₹${fmt(parseFloat(cl.lpf)||500)}</strong></div>
        <div><span style="opacity:.6">LPC:</span> <strong style="color:#FFD700">₹${fmt(parseFloat(cl.lpc)||Math.ceil(loan/10000)*500)}</strong></div>
        <div><span style="opacity:.6">Weekly EMI:</span> <strong style="color:#FFD700">₹${fmt(weeklyEMI)}</strong></div>
        <div><span style="opacity:.6">Loan Cycle:</span> <strong>${cl.loan_cycle||'1st'}</strong></div>
        <div><span style="opacity:.6">Tenure:</span> <strong>${totalWeeks} Weeks</strong></div>
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
            
            // Fixed weeks (12/16/24) - Principal and Interest split
            const totalLoanPlusInterest = loan + interest;
            const weeklyEMI = Math.round(totalLoanPlusInterest / totalWeeks);
            const weeklyPrincipal = Math.round(loan / totalWeeks);
            const weeklyInterest = weeklyEMI - weeklyPrincipal;

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
              const isReversal = (p.description||'').includes('Reversal');
              const amount = parseFloat(p.amount) || 0;

              if (isReversal) {
                // Reversal row — debit reversal: outstanding badhta hai
                if (p.type === 'debit') runningOutstanding = Math.min(totalLoanPlusInterest, runningOutstanding + amount);
                rows.push(`
                <tr style="background:#fff5f5;border-bottom:1px solid var(--border)">
                  <td style="padding:6px 8px;text-align:center;color:var(--muted);border-right:1px solid var(--border)">${p.date||'—'}</td>
                  <td style="padding:6px 8px;text-align:center;font-weight:700;color:var(--danger);border-right:1px solid var(--border)">↩️</td>
                  <td colspan="3" style="padding:6px 8px;text-align:center;color:var(--danger);font-weight:600;border-right:1px solid var(--border)">↩️ Reversal Entry</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--danger);font-weight:700;border-right:1px solid var(--border)">—</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--danger);font-weight:700;border-right:1px solid var(--border)">₹${fmt(runningOutstanding)}</td>
                  <td style="padding:6px 8px;text-align:center;border-right:1px solid var(--border)">❌</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px;font-size:10px;color:var(--muted)">${p.description||''}</td>
                </tr>`);
              } else {
                // Normal credit payment
                weekNum++;
                runningOutstanding = Math.max(0, runningOutstanding - amount);
                rows.push(`
                <tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
                  <td style="padding:6px 8px;text-align:center;color:var(--muted);border-right:1px solid var(--border)">${p.date||'—'}</td>
                  <td style="padding:6px 8px;text-align:center;font-weight:700;border-right:1px solid var(--border)">${weekNum}</td>
                  <td style="padding:6px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(weeklyPrincipal)}</td>
                  <td style="padding:6px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(weeklyInterest)}</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:600;border-right:1px solid var(--border)">₹${fmt(totalDuePerWeek)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--success);font-weight:700;border-right:1px solid var(--border)">₹${fmt(amount)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--danger);font-weight:700;border-right:1px solid var(--border)">₹${fmt(runningOutstanding)}</td>
                  <td style="padding:6px 8px;text-align:center;border-right:1px solid var(--border)">✅</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px">${p.description||''}</td>
                </tr>`);
              }
            });

            // Show remaining empty rows — only if outstanding > 0
            if (runningOutstanding > 0) {
            let outCounter = runningOutstanding;
            for (let i = weekNum + 1; i <= totalWeeks; i++) {
              outCounter = Math.max(0, outCounter - weeklyEMI);
              const outVal = outCounter;
              rows.push(`
                <tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
                  <td style="padding:6px 8px;text-align:center;font-weight:700;color:var(--muted);border-right:1px solid var(--border)">${i}</td>
                  <td style="padding:6px 8px;text-align:center;color:var(--muted);border-right:1px solid var(--border);font-size:11px">${getWeekDate(i)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--muted);border-right:1px solid var(--border)">₹${fmt(weeklyPrincipal)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--muted);border-right:1px solid var(--border)">₹${fmt(weeklyInterest)}</td>
                  <td style="padding:6px 8px;text-align:right;color:var(--muted);border-right:1px solid var(--border)">₹${fmt(weeklyEMI)}</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px;text-align:right;color:var(--danger);font-weight:700;border-right:1px solid var(--border)">₹${fmt(outVal)}</td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px;border-right:1px solid var(--border)"></td>
                  <td style="padding:6px 8px"></td>
                </tr>`);
            } // end empty rows loop
            } // end if outstanding > 0
            return rows.join('');
          })()}
        </tbody>
        <tfoot>
          <tr style="background:#f0f4f8;font-weight:700;border-top:2px solid var(--navy)">
            <td colspan="5" style="padding:8px 10px;color:var(--navy)">कुल / Total</td>
            <td style="padding:8px 10px;text-align:right;color:var(--success)">₹${fmt(Math.max(0,
              payments.filter(p=>p.type==='credit'&&!(p.description||'').includes('Reversal')).reduce((s,p)=>s+(parseFloat(p.amount)||0),0) -
              payments.filter(p=>p.type==='debit'&&(p.description||'').includes('Reversal')).reduce((s,p)=>s+(parseFloat(p.amount)||0),0)
            ))}</td>
            <td style="padding:8px 10px;text-align:right;color:var(--danger)">₹${fmt(Math.max(0,
              (loan+interest) - Math.max(0,
                payments.filter(p=>p.type==='credit'&&!(p.description||'').includes('Reversal')).reduce((s,p)=>s+(parseFloat(p.amount)||0),0) -
                payments.filter(p=>p.type==='debit'&&(p.description||'').includes('Reversal')).reduce((s,p)=>s+(parseFloat(p.amount)||0),0)
              )
            ))}</td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Add Payment Button -->
    <button onclick="activeClientId='${clientId}';openPayModal()" style="width:100%;padding:12px;background:var(--navy);color:white;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px">+ किस्त जोड़ें / Add Payment</button>

    <!-- Renew Loan Button -->
    <button onclick="openRenewModal('${clientId}')" style="width:100%;padding:12px;background:linear-gradient(135deg,#e65c00,#f9d423);color:white;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-top:8px">🔄 Loan Renew करें / Renew Loan</button>

    <!-- टिप्पणी -->
    <div style="background:white;border-radius:12px;padding:14px;margin-top:12px;border:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">टिप्पणी / Notes:</div>
      <div style="font-size:13px;color:var(--navy)">${cl.notes||'—'}</div>
    </div>
  `;
  }); // end db.from('loan_history').then()
}

// ── LOAN HISTORY PASSBOOK ─────────────────────────────────────────────────
async function showLoanHistoryPassbook(clientId, historyIndex) {
  const cl = allClients.find(x => x.id === clientId);
  if (!cl) return;

  const { data: history } = await db.from('loan_history').select('*').eq('client_id', clientId).order('created_at', {ascending: true});
  const historyList = history || [];
  const h = historyList[historyIndex];
  if (!h) return;

  // Get ALL real payments for this client in chronological order
  const allClientPayments = allPayments.filter(p => {
    if (p.client_id !== clientId) return false;
    if ((p.description||'').includes('DELETED')) return false;
    if (!(p.type === 'credit' || (p.type === 'debit' && (p.description||'').includes('Reversal')))) return false;
    return true;
  }).sort((a,b) => new Date(a.created_at||a.date) - new Date(b.created_at||b.date));

  // Calculate cumulative payment counts from history
  let startCount = 0;
  for (let i = 0; i < historyIndex; i++) {
    startCount += parseInt(historyList[i].payment_count) || 0;
  }
  const endCount = startCount + (parseInt(h.payment_count) || 0);
  
  // Slice payments for this cycle
  const payments = endCount > startCount 
    ? allClientPayments.slice(startCount, endCount)
    : allClientPayments.slice(startCount, startCount + (parseInt(h.loan_weeks)||12));

  const loan = parseFloat(h.balance) || 0;
  const interest = parseFloat(h.interest_amount) || 0;
  const totalWeeks = parseInt(h.loan_weeks) || 12;
  const weeklyEMI = Math.round((loan + interest) / totalWeeks);
  const weeklyPrincipal = Math.round(loan / totalWeeks);
  const weeklyInterest = weeklyEMI - weeklyPrincipal;
  const totalPaid = payments.filter(p=>p.type==='credit'&&!(p.description||'').includes('Reversal')).reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

  const c = document.getElementById('main-content');
  if (!c) return;

  // History tabs
  const historyTabs = `
  <div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:4px">
    ${historyList.map((ht,i) => `
      <button onclick="showLoanHistoryPassbook('${clientId}', ${i})" 
        style="white-space:nowrap;padding:5px 10px;background:${i===historyIndex?'#7c3aed':'#f3f4f6'};border:${i===historyIndex?'none':'1px solid var(--border)'};border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;color:${i===historyIndex?'white':'var(--muted)'}">
        📋 ${ht.loan_cycle||'Past'}
      </button>`).join('')}
    <button onclick="showClientPassbook('${clientId}', false)" 
      style="white-space:nowrap;padding:5px 10px;background:#f3f4f6;border:1px solid var(--border);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;color:var(--navy)">
      📒 Current (${cl.loan_cycle||'Latest'})
    </button>
  </div>`;

  c.innerHTML = `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <button onclick="showClientPassbook('${clientId}')" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--muted)">← Back</button>
    <div style="font-size:16px;font-weight:700;color:var(--navy)">📋 ${cl.name} — ${h.loan_cycle||'Past'}</div>
  </div>

  ${historyTabs}

  <!-- Header -->
  <div style="background:var(--navy);border-radius:14px;padding:14px;margin-bottom:14px;color:white">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
      <div><span style="opacity:.6">Loan Amt:</span> <strong style="color:#FFD700">₹${fmt(loan)}</strong></div>
      <div><span style="opacity:.6">Interest:</span> <strong style="color:#FFD700">₹${fmt(interest)}</strong></div>
      <div><span style="opacity:.6">Weekly EMI:</span> <strong style="color:#FFD700">₹${fmt(weeklyEMI)}</strong></div>
      <div><span style="opacity:.6">Loan Cycle:</span> <strong>${h.loan_cycle||'—'}</strong></div>
      <div><span style="opacity:.6">Tenure:</span> <strong>${totalWeeks} Weeks</strong></div>
      <div><span style="opacity:.6">Status:</span> <strong style="color:#4ade80">✅ Closed</strong></div>
    </div>
  </div>

  <!-- Table -->
  <div style="overflow-x:auto;background:white;border-radius:12px;box-shadow:0 2px 8px rgba(15,37,71,.08)">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px">
      <thead>
        <tr style="background:var(--navy);color:white">
          <th style="padding:8px;border-right:1px solid #ffffff30">सप्ताह<br>Week</th>
          <th style="padding:8px;border-right:1px solid #ffffff30">तारीख<br>Date</th>
          <th style="padding:8px;border-right:1px solid #ffffff30">मूलधन<br>Principal</th>
          <th style="padding:8px;border-right:1px solid #ffffff30">ब्याज<br>Interest</th>
          <th style="padding:8px;border-right:1px solid #ffffff30">कुल देय<br>Total Due</th>
          <th style="padding:8px;border-right:1px solid #ffffff30;color:#4ade80">प्राप्त<br>Received</th>
          <th style="padding:8px;color:#f87171">बकाया<br>Outstanding</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map((p,i) => {
          const amt = parseFloat(p.amount)||0;
          return `<tr style="background:${i%2===0?'white':'#f8fafc'};border-bottom:1px solid var(--border)">
            <td style="padding:7px 8px;text-align:center;font-weight:700;border-right:1px solid var(--border)">${i+1}</td>
            <td style="padding:7px 8px;text-align:center;border-right:1px solid var(--border);font-size:11px">${p.date||'—'}</td>
            <td style="padding:7px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(weeklyPrincipal)}</td>
            <td style="padding:7px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(weeklyInterest)}</td>
            <td style="padding:7px 8px;text-align:right;border-right:1px solid var(--border)">₹${fmt(weeklyEMI)}</td>
            <td style="padding:7px 8px;text-align:right;border-right:1px solid var(--border);color:var(--success);font-weight:700">₹${fmt(amt)}</td>
            <td style="padding:7px 8px;text-align:right;color:var(--danger);font-weight:700">₹${fmt(Math.max(0,(loan+interest)-payments.slice(0,i+1).filter(x=>x.type==='credit').reduce((s,x)=>s+(parseFloat(x.amount)||0),0)))}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f0f4f8;font-weight:700;border-top:2px solid var(--navy)">
          <td colspan="5" style="padding:8px 10px;color:var(--navy)">कुल / Total</td>
          <td style="padding:8px 10px;text-align:right;color:var(--success)">₹${fmt(totalPaid)}</td>
          <td style="padding:8px 10px;text-align:right;color:var(--success)">₹0.00 ✅</td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

function printPassbook(clientId) {
  // Add print class to body
  document.body.classList.add('printing-passbook');
  
  // Hide nav and header for print
  const nav = document.querySelector('.bottom-nav') || document.getElementById('nav-bar');
  const header = document.querySelector('.top-bar') || document.querySelector('header');
  
  if (nav) nav.style.display = 'none';
  if (header) header.style.display = 'none';
  
  window.print();
  
  // Restore after print
  setTimeout(() => {
    if (nav) nav.style.display = '';
    if (header) header.style.display = '';
    document.body.classList.remove('printing-passbook');
  }, 1000);
}

function printMeetingSheet() {
  const days = ['Monday / सोमवार','Tuesday / मंगलवार','Wednesday / बुधवार','Thursday / गुरुवार','Friday / शुक्रवार','Saturday / शनिवार','Sunday / रविवार'];
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);

  // Group clients by meeting day
  const byDay = {};
  days.forEach(d => { byDay[d] = []; });
  allClients.forEach(cl => {
    const mDay = (cl.finance_company || cl.meeting_day || '').trim();
    if (!mDay) return;
    if (byDay[mDay] !== undefined) { byDay[mDay].push(cl); return; }
    const mLow = mDay.split('/')[0].trim().toLowerCase();
    const matched = days.find(d => d.split('/')[0].trim().toLowerCase() === mLow);
    if (matched) byDay[matched].push(cl);
  });

  let pagesHtml = '';

  days.forEach(day => {
    const clients = byDay[day];
    if (!clients.length) return;

    const dayShort = day.split('/')[0].trim();

    // Group by center
    const centerMap = {};
    clients.forEach(cl => {
      const key = cl.center_name || 'Unknown Center';
      if (!centerMap[key]) centerMap[key] = [];
      centerMap[key].push(cl);
    });

    Object.entries(centerMap).forEach(([centerName, centerClients]) => {
    const totalLoan = centerClients.reduce((s,cl) => s+(parseFloat(cl.balance)||0), 0);
    const totalOutstanding = centerClients.reduce((s,cl) => {
      const paid = allPayments.filter(p=>p.client_id===cl.id&&p.type==='credit'&&!(p.description||'').includes('Reversal')).reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
      const rev = allPayments.filter(p=>p.client_id===cl.id&&p.type==='debit'&&(p.description||'').includes('Reversal')).reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
      return s + Math.max(0,(parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0)-paid+rev);
    }, 0);
    const totalEMI = centerClients.reduce((s,cl) => s+Math.round(((parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0))/(parseInt(cl.loan_weeks)||12)), 0);
    const totalPDue = centerClients.reduce((s,cl) => s+Math.round((parseFloat(cl.balance)||0)/(parseInt(cl.loan_weeks)||12)), 0);
    const totalIDue = centerClients.reduce((s,cl) => s+Math.round((parseFloat(cl.interest_amount)||0)/(parseInt(cl.loan_weeks)||12)), 0);

    let rows = '';
    centerClients.forEach((cl, i) => {
      const loanStartDate = cl.loan_date || cl.first_emi_date || null;
      const payments = allPayments.filter(p => {
        if (p.client_id !== cl.id || p.type !== 'credit') return false;
        if ((p.description||'').includes('DELETED')) return false;
        if (loanStartDate && p.date && p.date < loanStartDate) return false;
        return true;
      });
      const loanAmt = parseFloat(cl.balance)||0;
      const intAmt = parseFloat(cl.interest_amount)||0;
      const outP = Math.max(0, loanAmt - payments.length * Math.round(loanAmt/(parseInt(cl.loan_weeks)||12)));
      const outI = Math.max(0, intAmt - payments.length * Math.round(intAmt/(parseInt(cl.loan_weeks)||12)));
      const _weeks = parseInt(cl.loan_weeks)||12;
      const emi = Math.round((loanAmt + intAmt) / _weeks);
      const pDue = Math.round(loanAmt / _weeks);
      const iDue = emi - pDue;
      const bg = i%2===0 ? '#fff' : '#f9f9f9';
      rows += `<tr style="background:${bg}">
        <td>${cl.loan_id||cl.customer_id||'-'}</td>
        <td style="text-align:left">${cl.name}<br><span style="font-size:7px;color:#666">W/O ${cl.husband_wife_name||cl.guarantor_name||'-'} / ${cl.phone||'-'}</span></td>
        <td>${fmt(loanAmt)}</td>
        <td>${cl.loan_date||cl.first_emi_date||'-'}</td>
        <td>${payments.length}</td>
        <td style="color:red">${fmt(outP)}/${fmt(outI)}</td>
        <td>0</td>
        <td>${fmt(pDue)}</td>
        <td>${fmt(iDue)}</td>
        <td></td>
        <td style="color:green;font-weight:bold">${fmt(emi)}</td>
        <td style="min-width:50px"></td>
      </tr>`;
    });

    pagesHtml += `
    <div class="page">
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px">
        <div style="font-size:16px;font-weight:bold">धन रक्षा FINANCE</div>
        <div style="font-size:10px">शाखा कार्यालय: बलिया</div>
      </div>
      <table class="info-table">
        <tr>
          <td style="width:33%">${centerClients[0]?.center_name||''} / ${centerClients[0]?.center_code||''}</td>
          <td style="width:34%;text-align:center"><b>${day}</b></td>
          <td style="width:33%">${dayShort.toUpperCase()}</td>
        </tr>
        <tr>
          <td>CDS Date: <b>${todayStr}</b></td>
          <td style="text-align:center">Day: <b>${dayShort}</b></td>
          <td>Time: <b>9:00 AM</b></td>
        </tr>
        <tr>
          <td>L.C.: <b>${centerClients[0]?.loan_cycle||'-'}</b></td>
          <td style="text-align:center">Members: <b>${clients.length}</b></td>
          <td>T.Outstanding: <b style="color:red">₹${fmt(totalOutstanding)}</b></td>
        </tr>
        <tr>
          <td>Center ID: <b>${centerClients[0]?.center_code||'-'}</b></td>
          <td>Receipt No:</td>
          <td>Staff: <b>${currentProfile?.name||'Admin'}</b></td>
        </tr>
        <tr>
          <td>NPA: <b>0</b></td>
          <td colspan="2">Remarks:</td>
        </tr>
      </table>

      <div style="text-align:center;font-weight:bold;font-size:12px;padding:4px;background:#f0f0f0;border:1px solid #000;margin:4px 0">CENTER CDS</div>

      <table class="cds-table">
        <thead>
          <tr>
            <th>LOAN NO.</th>
            <th>CLIENT NAME</th>
            <th>LOAN AMT</th>
            <th>DB DATE</th>
            <th>INS.NO</th>
            <th>OS (P/I)</th>
            <th>NPA</th>
            <th>P.DUE</th>
            <th>INT.DUE</th>
            <th>CRM</th>
            <th>COLTD</th>
            <th>SIGN.</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="font-weight:bold;background:#f0f4f8;border-top:2px solid #000">
            <td colspan="2">Total</td>
            <td>${fmt(totalLoan)}</td>
            <td colspan="2"></td>
            <td style="color:red">${fmt(totalOutstanding)}</td>
            <td>0</td>
            <td>${fmt(totalPDue)}</td>
            <td>${fmt(totalIDue)}</td>
            <td></td>
            <td style="color:green;font-weight:bold">${fmt(totalEMI)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:8px">
        <div style="font-weight:bold;font-size:10px;font-style:italic">Denomination:</div>
        <table class="denom-table">
          <tr>
            <td>2000 X.</td><td>500 X.</td><td>200 X.</td><td>100 X.</td>
            <td>50 X.</td><td>20 X.</td><td>10 X.</td><td>Coins.</td><td>Total</td>
          </tr>
          <tr>
            <td style="height:20px"></td><td></td><td></td><td></td>
            <td></td><td></td><td></td><td></td>
            <td style="font-weight:bold;color:green">₹${fmt(totalEMI)}</td>
          </tr>
        </table>
      </div>

      <table style="width:100%;margin-top:12px;border:none">
        <tr>
          <td style="text-align:center;border-top:1px solid #000;padding-top:4px;width:33%;border-right:none">Signature of FO</td>
          <td style="text-align:center;border-top:1px solid #000;padding-top:4px;width:34%;border-right:none">Signature of Group Leader</td>
          <td style="text-align:center;border-top:1px solid #000;padding-top:4px;width:33%">Signature of Branch Manager</td>
        </tr>
      </table>
    </div>`;
    }); // end centerMap forEach
  }); // end days forEach

  if (!pagesHtml) { showToast('कोई meeting scheduled नहीं!', 'error'); return; }

  const printWin = window.open('', '_blank');
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>CDS - Dhan Raksha Finance</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 9px; color: #000; }
  .page { 
    width: 277mm; 
    padding: 5mm; 
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-child { page-break-after: auto; }
  .info-table { width:100%; border-collapse:collapse; margin-bottom:4px; }
  .info-table td { border:1px solid #000; padding:3px 5px; font-size:9px; }
  .cds-table { width:100%; border-collapse:collapse; margin-bottom:6px; }
  .cds-table th { 
    background:#1a2e4a; color:white; 
    padding:3px 4px; border:1px solid #444; 
    font-size:8px; white-space:nowrap;
  }
  .cds-table td { 
    border:1px solid #ccc; padding:3px 4px; 
    font-size:8px; text-align:right;
  }
  .cds-table td:nth-child(2) { text-align:left; }
  .cds-table td:nth-child(1) { text-align:left; }
  .denom-table { width:100%; border-collapse:collapse; }
  .denom-table td { border:1px solid #ccc; padding:3px; font-size:8px; text-align:center; }
  @page { size: A4 landscape; margin: 5mm; }
  @media print {
    .page { page-break-after: always; }
  }
</style>
</head>
<body>
${pagesHtml}
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`);
  printWin.document.close();
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
      const totalLoan = centerClients.reduce((s,cl) => s+(parseFloat(cl.balance)||0), 0);
      const totalOutstanding = centerClients.reduce((s,cl) => {
        const paid = allPayments.filter(p=>p.client_id===cl.id&&p.type==='credit').reduce((a,p)=>a+(parseFloat(p.amount)||0),0);
        return s + Math.max(0,(parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0)-paid);
      }, 0);
      const totalEMI = centerClients.reduce((s,cl) => s+Math.round(((parseFloat(cl.balance)||0)+(parseFloat(cl.interest_amount)||0))/(parseInt(cl.loan_weeks)||12)), 0);

      return `
        <div style="margin-bottom:20px" id="cds-${day.replace(/\s/g,'-')}">
          <!-- CDS Header -->
          <div style="background:white;border-radius:14px;padding:14px;margin-bottom:2px;box-shadow:0 2px 8px rgba(15,37,71,.07);${isToday?'border:2px solid var(--gold)':'border:1px solid var(--border)'}">

            <!-- Company Header -->
            <div style="text-align:center;border-bottom:2px solid var(--navy);padding-bottom:8px;margin-bottom:10px">
              <div style="font-size:15px;font-weight:700;color:var(--navy)">धन रक्षा Finance</div>
              <div style="font-size:11px;color:var(--muted)">Center Day Sheet (CDS)</div>
            </div>

            <!-- Center Info Grid -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:10px;background:#f8fafc;padding:10px;border-radius:8px">
              <div><strong>Center:</strong> ${centerClients[0]?.center_name||'—'}</div>
              <div><strong>CDS Date:</strong> ${todayStr}</div>
              <div><strong>L.C.:</strong> ${centerClients[0]?.loan_cycle||'—'}</div>
              <div><strong>Day:</strong> ${dayShort} ${isToday?'⭐ TODAY':''}</div>
              <div><strong>Center ID:</strong> ${centerClients[0]?.center_code||'—'}</div>
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
                  ${centerClients.map((cl, i) => {
                    const loanStartDate = cl.loan_date || cl.first_emi_date || null;
                    const payments = allPayments.filter(p => {
                      if (p.client_id !== cl.id || p.type !== 'credit') return false;
                      if ((p.description||'').includes('DELETED')) return false;
                      if (loanStartDate && p.date && p.date < loanStartDate) return false;
                      return true;
                    });
                    const totalPaid = payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
                    const loanAmt = parseFloat(cl.balance)||0;
                    const intAmt = parseFloat(cl.interest_amount)||0;
                    const totalDue = loanAmt + intAmt;
                    const outstanding = Math.max(0, totalDue - totalPaid);
                    const outstandingP = Math.max(0, loanAmt - payments.length * Math.round(loanAmt/(parseInt(cl.loan_weeks)||12)));
                    const outstandingI = Math.max(0, intAmt - payments.length * Math.round(intAmt/(parseInt(cl.loan_weeks)||12)));
                    const weeklyEMI = Math.round(totalDue/(parseInt(cl.loan_weeks)||12));
                    const weeklyP = Math.round(loanAmt/(parseInt(cl.loan_weeks)||12));
                    const weeklyI = Math.round(intAmt/(parseInt(cl.loan_weeks)||12));
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
// ── REVERSE PAYMENT (Admin only) ──────────
async function deletePayment(paymentId) {
  if (currentProfile?.role !== 'admin') {
    showToast('Admin only! / सिर्फ Admin', 'error');
    return;
  }

  const confirmed = confirm('क्या आप इस payment को delete करना चाहते हैं?\n(Payment history में दिखेगी लेकिन balance में count नहीं होगी)');
  if (!confirmed) return;

  try {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p) return;

    const { error } = await db.from('payments').update({
      description: '🗑️ DELETED: ' + (p.description || 'Payment')
    }).eq('id', paymentId);

    if (error) throw error;

    // Update locally
    const idx = allPayments.findIndex(x => x.id === paymentId);
    if (idx !== -1) allPayments[idx].description = '🗑️ DELETED: ' + (p.description || 'Payment');

    showToast('🗑️ Payment deleted! History में दिखेगी।', 'success');
    await loadPayments(); // Reload from Supabase
    if (activeClientId) openDetail(activeClientId);

  } catch(err) {
    console.error('Delete error:', err);
    showToast('Delete failed! Try again', 'error');
  }
}
