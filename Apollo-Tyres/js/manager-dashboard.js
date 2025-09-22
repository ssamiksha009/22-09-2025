document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        document.getElementById('errorMessage').textContent = 'Not authenticated';
        return;
    }

    // Fetch users and projects for KPIs and table
    fetch('/api/manager/users', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(res => {
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('authToken');
                    window.location.href = '/login.html';
                    throw new Error('Authentication failed');
                }
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            console.log('Received users data:', data);
            if (!data.success) {
                throw new Error(data.message || 'Failed to load data');
            }
            // KPIs
            document.getElementById('totalEngineers').textContent = data.users.length;

            // Calculate total projects
            let totalProjects = data.users.reduce((sum, user) => {
                console.log(`User ${user.email} has ${user.project_count} projects`);
                return sum + (parseInt(user.project_count) || 0);
            }, 0);

            document.getElementById('totalProjects').textContent = totalProjects;
            // Active Engineers (last 7 days)
            const now = new Date();
            let activeCount = data.users.filter(user => user.last_login && (now - new Date(user.last_login)) < 7 * 24 * 60 * 60 * 1000).length;
            document.getElementById('activeEngineers').textContent = activeCount;

            // Render table
            renderUsersTable(data.users);

            // Search/filter
            document.getElementById('searchInput').addEventListener('input', function () {
                filterAndRender(data.users);
            });
            document.getElementById('activityFilter').addEventListener('change', function () {
                filterAndRender(data.users);
            });
        })
        .catch(error => {
            console.error('Error:', error);
            document.getElementById('errorMessage').textContent = error.message;
        });

    // Fetch notifications
    fetch('/api/manager/notifications', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.notifications && data.notifications.length > 0) {
                const area = document.getElementById('notificationsArea');
                area.style.display = '';
                area.innerHTML = data.notifications.map(n => `<div>${n}</div>`).join('');
            }
        });

    // Fetch recent activity
    fetch('/api/manager/recent-activity', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.activities) {
                const ul = document.getElementById('recentActivityList');
                ul.innerHTML = '';
                data.activities.forEach(act => {
                    const li = document.createElement('li');
                    li.textContent = act;
                    ul.appendChild(li);
                });
            }
        });

    // Add engineer form handler
    const addForm = document.getElementById('addEngineerForm');
    if (addForm) {
        addForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = document.getElementById('newEngineerEmail').value.trim();
            const password = document.getElementById('newEngineerPassword').value;
            const errorDiv = document.getElementById('addUserError');
            errorDiv.textContent = '';

            const token = localStorage.getItem('authToken');
            if (!token) {
                errorDiv.textContent = 'Not authenticated.';
                return;
            }

            const base = window.location.origin;
            try {
                const res = await fetch(`${window.location.origin}/api/manager/add-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ email, password })
                });
            console.log('add-user status:', res.status, 'content-type:', res.headers.get('content-type'));

                

                let data;
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    data = await res.json();
                } else {
                    throw new Error('Server returned non-JSON response');
                }

                if (res.ok && data.success) {
                    addForm.reset();
                    errorDiv.style.color = 'green';                    
                    errorDiv.textContent = 'Engineer added successfully!';
                    loadEngineers();
                } else {
                    errorDiv.style.color = 'red';
                    errorDiv.textContent = data.message || 'Error adding engineer.';
                }
            } catch (err) {
                errorDiv.textContent = err.message || 'Error adding user.';
            }
        });
    }

    // Function to load engineers
    async function loadEngineers() {
        const token = localStorage.getItem('authToken');
        const errorDiv = document.getElementById('errorMessage');
        if (!token) {
            errorDiv.textContent = 'Not authenticated.';
            return;
        }
        try {
            const res = await fetch('/api/manager/users', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.users)) {
                // Use the shared renderer so Actions column (View Projects) is present
                renderUsersTable(data.users);
                errorDiv.textContent = '';
            } else {
                errorDiv.textContent = data.message || 'Failed to load users.';
            }
        } catch (err) {
            console.error('loadEngineers error', err);
            errorDiv.textContent = 'Error loading users.';
        }
    }

    // Filtering function
    function filterAndRender(users) {
        const search = document.getElementById('searchInput').value.toLowerCase();
        const activity = document.getElementById('activityFilter').value;
        const now = new Date();
        let filtered = users.filter(user => user.email.toLowerCase().includes(search));
        if (activity === 'active') {
            filtered = filtered.filter(user => user.last_login && (now - new Date(user.last_login)) < 7 * 24 * 60 * 60 * 1000);
        } else if (activity === 'inactive') {
            filtered = filtered.filter(user => !user.last_login || (now - new Date(user.last_login)) >= 7 * 24 * 60 * 60 * 1000);
        }
        renderUsersTable(filtered);
    }

    // add this helper near the top (or at end) of the file
    async function showUserProjects(email) {
      const token = localStorage.getItem('authToken');
      if (!token) { alert('Not authenticated'); return; }

      // Inject modal + inputs CSS once
      if (!document.getElementById('md-user-projects-styles')) {
        const css = document.createElement('style');
        css.id = 'md-user-projects-styles';
        css.textContent = `
  /* toolbar/modal styles (existing, trimmed for context) */
  .md-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:12000; animation: fadeIn .16s ease; }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  .md-dialog { width: min(980px, 96%); max-height: 84vh; background: #fff; border-radius:12px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); overflow:hidden; display:flex; flex-direction:column; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; transform-origin:center; animation: popIn .18s cubic-bezier(.2,.9,.34,1); }
  @keyframes popIn { from { transform: translateY(8px) scale(.98); opacity:0 } to { transform: translateY(0) scale(1); opacity:1 } }
  .md-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #f0eef6; background:linear-gradient(90deg, rgba(88,44,124,0.03), rgba(217,111,58,0.02)); }
  .md-title { font-weight:700; color:#35184f; font-size:1.05rem; }
  .md-close { background:#f7f7f9; border:0; padding:8px 10px; border-radius:8px; cursor:pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }

  .md-body { padding:12px 16px; overflow:auto; }

  /* ===== One-line, balanced table ===== */
  .md-table {
    width:100%; border-collapse:collapse; margin-bottom:8px;
    table-layout: fixed; /* critical for fixed widths + ellipsis */
  }
  .md-table thead th {
    text-align:left; padding:12px 12px; background:#6b3a9b; color:#fff; font-weight:700; position:sticky; top:0;
  }
  .md-table tbody td {
    padding:14px 12px; border-bottom:1px solid #f4f2f9; vertical-align:middle; color:#222;
  }
  /* keep one line per cell, with ellipsis */
.md-table thead th,
.md-table tbody td{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

  /* Column widths (sum = 100%) */
/* Optional: nudge column proportions to balance the row */
.md-table thead th:nth-child(1), .md-table tbody td:nth-child(1){ width:22%; } /* Project */
.md-table thead th:nth-child(2), .md-table tbody td:nth-child(2){ width:14%; } /* Protocol */
.md-table thead th:nth-child(3), .md-table tbody td:nth-child(3){ width:29%; } /* Created */
.md-table thead th:nth-child(4), .md-table tbody td:nth-child(4){ width:12%; } /* Status */
.md-table thead th:nth-child(5), .md-table tbody td:nth-child(5){ width:23%; } /* Actions */
  * Action buttons */
.md-actions{ justify-content: flex-end; }
.md-btn{
  border-radius:8px;
  font-weight:700;
  font-size:12.5px;
  padding:7px 12px;           /* slimmer than before */
  line-height:1;
}

/* “View Inputs” (secondary) */
.md-btn.inputs{
  background:#0f6b72;         /* deep teal */
  border:0;
  color:#fff;
}
.md-btn.inputs:hover{ background:#0c5960; }

/* “Open” (primary) */
.md-btn.primary{
  background:#c8652b;         /* refined orange */
  border:0;
  color:#fff;
}
.md-btn.primary:hover{ background:#af5725; }

/* Keep both buttons on one line */
.md-table thead th:nth-child(5),
.md-table tbody td:nth-child(5){
  min-width: 180px;           /* adjust if you ever add another button */
}

  .md-empty { padding:20px; text-align:center; color:#666; }
  .md-noaction { color:#888; font-weight:600; }

  /* Status pills */
.md-status{
  font-weight:600;
  font-size:12.5px;
  padding:4px 10px;           /* a bit slimmer */
  border-radius:999px;
  border:1px solid transparent;
}
.md-status.completed  { background:#eaf6ef; color:#0e6f4b; border-color:#cde8d8; }  /* green */
.md-status.inprogress { background:#fff3cf; color:#7a5a00; border-color:#efdfad; }  /* amber */
.md-status.notstarted { background:#fde7e7; color:#b42318; border-color:#f3c2bf; }  /* red */


  /* Inputs panel (unchanged) */
  .inputs-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:13000; animation: fadeIn .12s ease; }
  .inputs-panel { width: min(720px, 96%); max-height: 78vh; background:#fff; border-radius:12px; box-shadow: 0 30px 80px rgba(0,0,0,0.45); overflow:auto; padding:0; transform-origin:center; animation: slideUp .18s cubic-bezier(.2,.9,.34,1); border: 1px solid rgba(88,44,124,0.06); }
  @keyframes slideUp { from { transform: translateY(10px) scale(.99); opacity:0 } to { transform: translateY(0) scale(1); opacity:1 } }
  .inputs-header { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid #f3f3f5; background:linear-gradient(90deg, rgba(88,44,124,0.02), rgba(217,111,58,0.01)); }
  .inputs-title { font-weight:800; color:#35184f; font-size:1rem; }
  .inputs-close { background:#fff0; border:0; padding:8px; cursor:pointer; font-weight:700; color:#333; }
  .inputs-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px; padding:18px; align-items:start; }
  .inputs-row { display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:10px; background: linear-gradient(180deg,#ffffff,#fbfbfe); border:1px solid rgba(98,57,142,0.06); box-shadow: 0 6px 20px rgba(75,41,148,0.04); }
  .inputs-label { font-weight:800; color:#5b2b86; font-size:0.95rem; letter-spacing:0.2px; }
  .inputs-value { color:#1f2430; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace; background:#fff; padding:8px 10px; border-radius:8px; border:1px solid #efeaf6; box-shadow: inset 0 1px 0 #fff; min-height:36px; }
  .inputs-empty { padding:20px; text-align:center; color:#666; font-weight:600; }

  @media (max-width:720px) {
    .md-table thead th, .md-table tbody td { font-size:13px; padding:10px 8px; }
    /* give Actions extra room on small screens */
    .md-table thead th:nth-child(1), .md-table tbody td:nth-child(1){ width:28%; }
    .md-table thead th:nth-child(3), .md-table tbody td:nth-child(3){ width:24%; }
    .md-table thead th:nth-child(5), .md-table tbody td:nth-child(5){ min-width: 180px; }
  }
    @media (max-width: 760px){
  .md-table thead th:nth-child(4),
  .md-table tbody td:nth-child(4){ padding-right: 16px; }
  .md-table thead th:nth-child(5),
  .md-table tbody td:nth-child(5){ padding-left: 16px; min-width: 180px; }
}


`;

        document.head.appendChild(css);
      }

      try {
        const res = await fetch(`/api/manager/user-projects?email=${encodeURIComponent(email)}`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Failed to load projects');
        }

        const projects = data.projects || [];

        // Build modal (Actions column contains Open and View Inputs where appropriate)
        const backdrop = document.createElement('div');
        backdrop.className = 'md-backdrop';
        backdrop.tabIndex = -1;
        backdrop.innerHTML = `
          <div class="md-dialog" role="dialog" aria-modal="true" aria-label="Projects for ${escapeHtml(email)}">
            <div class="md-header">
              <div class="md-title">Projects for ${escapeHtml(email)}</div>
              <div>
                <button class="md-close" type="button">Close</button>
              </div>
            </div>
            <div class="md-body">
              ${projects.length ? `
                <table class="md-table" aria-live="polite">
  <colgroup>
    <col style="width:22%">
    <col style="width:14%">
    <col style="width:30%">
    <col style="width:12%">
    <col style="width:22%">
  </colgroup>
  <thead>
    <tr>
      <th>Project</th>
      <th>Protocol</th>
      <th>Created</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
                    ${projects.map(p => {
                      const isCompleted = (String(p.status || '').toLowerCase() === 'completed');
                      // Always include View Inputs (if inputs exist) and Open (for completed)
                      const hasInputs = p.inputs && (Object.keys(p.inputs || {}).length > 0 || String(p.inputs).trim().length > 0);
                      return `
                        <tr data-id="${escapeHtml(p.id)}">
                          <td>${escapeHtml(p.project_name || p.id || 'Untitled')}</td>
                          <td>${escapeHtml(p.protocol || '')}</td>
                          <td>${p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                          <td>
  <span class="md-status ${
    (String(p.status || '').toLowerCase().includes('completed')) ? 'completed' :
    (String(p.status || '').toLowerCase().includes('progress')) ? 'inprogress' :
    (String(p.status || '').toLowerCase().includes('not')) ? 'notstarted' : ''
  }">
    ${escapeHtml(p.status || '—')}
  </span>
</td>

                          <td>
                            <div class="md-actions">
                              ${hasInputs ? `<button class="md-btn inputs" data-id="${escapeHtml(p.id)}">View Inputs</button>` : `<span class="md-noaction">No inputs</span>`}
                              ${isCompleted ? `<button class="md-btn primary" data-id-open="${escapeHtml(p.id)}">Open</button>` : ``}
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>` : `<div class="md-empty">No projects found for this user.</div>`}
            </div>
          </div>
        `;
        document.body.appendChild(backdrop);

        // Accessibility: focus the close button
        const closeBtn = backdrop.querySelector('.md-close');
        closeBtn.focus();

        // Close handlers
        const removeModal = () => { backdrop.remove(); };
        closeBtn.addEventListener('click', removeModal);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) removeModal(); });
        document.addEventListener('keydown', function escHandler(e) { if (e.key === 'Escape') { removeModal(); document.removeEventListener('keydown', escHandler); } });

        // Wire Open action only for completed projects
        backdrop.querySelectorAll('[data-id-open]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id-open');
            window.location.href = `/select.html?projectId=${encodeURIComponent(id)}`;
          });
        });

        // Wire View Inputs — fetch inputs and show animated inputs panel
        backdrop.querySelectorAll('.md-btn.inputs').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            try {
              const r = await fetch(`/api/projects/${encodeURIComponent(id)}`);
              const j = await r.json();
              if (!r.ok || !j.success || !j.project) throw new Error(j.message || 'Project not found');
              let inputs = j.project.inputs || {};
              if (typeof inputs === 'string' && inputs.trim()) {
                try { inputs = JSON.parse(inputs); } catch (_) { /* keep string as fallback */ }
              }
              openInputsPanel(j.project.project_name || id, inputs);
            } catch (err) {
              alert('Failed to load inputs: ' + (err.message || err));
            }
          });
        });

      } catch (err) {
        alert('Failed to load projects: ' + (err.message || err));
      }
    }

    // Human-friendly input labels (used by the manager "View Inputs" panel)
const INPUT_LABELS = {
  // loads
  l1: 'Load 1 (kg)', l2: 'Load 2 (kg)', l3: 'Load 3 (kg)', l4: 'Load 4 (kg)', l5: 'Load 5 (kg)',
  load1_kg: 'Load 1 (kg)', load2_kg: 'Load 2 (kg)', load3_kg: 'Load 3 (kg)', load4_kg: 'Load 4 (kg)', load5_kg: 'Load 5 (kg)',

  // pressures
  p1: 'Pressure 1 (PSI)', p2: 'Pressure 2 (PSI)', p3: 'Pressure 3 (PSI)',
  pressure1: 'Pressure 1 (PSI)', pressure2: 'Pressure 2 (PSI)', pressure3: 'Pressure 3 (PSI)',

  // angles & slips
  ia: 'Inclination Angle (deg)', IA: 'Inclination Angle (deg)',
  sa: 'Slip Angle (deg)', SA: 'Slip Angle (deg)',
  sr: 'Slip Ratio (%)', SR: 'Slip Ratio (%)',

  // velocity
  vel: 'Test Velocity (km/h)', speed_kmph: 'Test Velocity (km/h)',

  // geometry
  rimWidth: 'Rim Width (mm)', width: 'Rim Width (mm)',
  rimDiameter: 'Rim Diameter (in)', diameter: 'Rim Diameter (mm)',
  nominalWidth: 'Nominal Width (mm)', nomwidth: 'Nominal Width (mm)',
  outerDiameter: 'Outer Diameter (mm)', Outer_diameter: 'Outer Diameter (mm)',
  aspectRatio: 'Aspect Ratio (%)', aspratio: 'Aspect Ratio (%)'
};

// Fallback pretty label generator for keys not present in INPUT_LABELS
function prettyLabel(key) {
  if (!key) return '';
  if (INPUT_LABELS[key]) return INPUT_LABELS[key];
  // convert snake_case / camelCase / short codes into spaced Title Case
  const withSpaces = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return withSpaces
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// /* Inputs panel: displays name + labeled values with animation */
function openInputsPanel(projectName, inputs) {
  let obj = inputs || {};
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (_) { obj = { raw: inputs }; }
  }

  // prefer ordered display if available
  const orderedKeys = Object.keys(obj);
  // Build rows using human labels
  const rowsHtml = orderedKeys.length ? orderedKeys.map((k) => {
    const v = obj[k];
    const label = prettyLabel(k);
    const valueStr = (v == null) ? '' : (typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));
    return `
      <div class="inputs-row">
        <div class="inputs-label">${escapeHtml(label)}</div>
        <div class="inputs-value">${escapeHtml(valueStr)}</div>
      </div>
    `;
  }).join('') : `<div class="inputs-empty">No inputs available for this project.</div>`;

  const pb = document.createElement('div');
  pb.className = 'inputs-backdrop';
  pb.innerHTML = `
    <div class="inputs-panel" role="dialog" aria-modal="true" aria-label="Inputs for ${escapeHtml(projectName)}">
      <div class="inputs-header">
        <div class="inputs-title">Inputs · ${escapeHtml(projectName)}</div>
        <div><button class="inputs-close">Close</button></div>
      </div>
      <div class="inputs-grid">
        ${rowsHtml}
      </div>
    </div>
  `;
  document.body.appendChild(pb);

  const close = () => { pb.remove(); };
  pb.querySelector('.inputs-close').addEventListener('click', close);
  pb.addEventListener('click', (e) => { if (e.target === pb) close(); });
  document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
}

// update renderUsersTable to include action button
function renderUsersTable(users) {
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${new Date(user.created_at).toLocaleString()}</td>
                <td>${user.last_login ? new Date(user.last_login).toLocaleString() : '-'}</td>
                <td>${user.project_count !== undefined ? user.project_count : '-'}</td>
                <td><button class="view-projects-btn" data-email="${escapeHtml(user.email)}" style="padding:6px 10px;border-radius:8px;background:#582C7C;color:#fff;border:0;cursor:pointer">View Projects</button></td>
            `;
            tbody.appendChild(tr);
        });

        // wire view-projects buttons
        document.querySelectorAll('.view-projects-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const email = btn.getAttribute('data-email');
            showUserProjects(email);
          });
        });
    }

    // Small helper to safely escape text used in HTML (prevents XSS / breaks)
function escapeHtml(unsafe) {
  const s = unsafe == null ? '' : String(unsafe);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial load
loadEngineers();
});