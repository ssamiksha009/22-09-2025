// public/js/history.js

document.addEventListener('DOMContentLoaded', function () {
  loadProjectHistory();

  // Search box
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  // New request
  const newRequestBtn = document.getElementById('newRequestBtn');
  if (newRequestBtn) {
    newRequestBtn.addEventListener('click', () => (window.location.href = '/index.html'));
  }
});

/* ---------- utilities ---------- */
function fmtDate(x) {
  if (!x) return '-';
  const iso = (typeof x === 'string' && x.includes(' ')) ? x.replace(' ', 'T') : x;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(x) : d.toLocaleDateString();
}

function sanitizeClass(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

// Prevent XSS; always coerce to string first.
function escapeHtml(unsafe) {
  const s = unsafe == null ? '' : String(unsafe);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ---------- main fetch/render ---------- */

function loadProjectHistory() {
  const tableBody = document.getElementById('historyTableBody');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const errorMessage = document.getElementById('errorMessage');
  const noDataMessage = document.getElementById('noDataMessage');

  if (!tableBody || !loadingSpinner || !errorMessage || !noDataMessage) {
    console.error('Required elements not found in history.html');
    return;
  }

  // Auth check
  const token = localStorage.getItem('authToken');
  if (!token) {
    errorMessage.textContent = 'Authentication required. Please login.';
    errorMessage.style.display = 'block';
    loadingSpinner.style.display = 'none';
    return;
  }

  loadingSpinner.style.display = 'block';
  errorMessage.style.display = 'none';
  noDataMessage.style.display = 'none';

  const isAll = new URLSearchParams(location.search).get('all') === '1';
  fetch(`/api/project-history${isAll ? '?all=1' : ''}`, { headers: getAuthHeaders() })

    .then(async (response) => {
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Invalid JSON from /api/project-history: ${raw}`);
      }
      if (!response.ok) {
        const msg = (data && (data.message || data.error)) || response.statusText;
        throw new Error(`HTTP ${response.status}: ${msg}`);
      }
      // Normalize shape: sometimes API returns { success, projects: [...] }
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.projects)) return data.projects;
      throw new Error('Unexpected response shape from /api/project-history');
    })
    .then((projects) => {
      loadingSpinner.style.display = 'none';

      if (!projects.length) {
        noDataMessage.style.display = 'block';
        return;
      }

      tableBody.innerHTML = '';

      projects.forEach((p) => {
        const tr = document.createElement('tr');

        // tolerate different id/date field names
        const projId = p.id ?? p.project_id ?? p.projectId;
        const created = p.created_at ?? p.date_created;
        const completed = p.completed_at ?? p.date_completed;

        const status = p.status || '';
        const statusClass = `status-${sanitizeClass(status)}`;

        tr.innerHTML = `
          <td>${escapeHtml(p.project_name)}</td>
          <td>${escapeHtml(p.region)}</td>
          <td>${escapeHtml(p.department)}</td>
          <td>${escapeHtml(p.tyre_size)}</td>
          <td>${escapeHtml(p.protocol)}</td>
          <td>${fmtDate(created)}</td>
          <td class="${statusClass}">${escapeHtml(status)}</td>
          <td>${fmtDate(completed)}</td>
          <td></td>  <!-- Actions cell -->
        `;

        // Actions → View Project
        // Actions → View/Open Project
const actionsTd = tr.lastElementChild;
if (projId == null) {
  actionsTd.textContent = 'No ID';
  actionsTd.style.opacity = '0.7';
} else {
  const stNorm = String(status || '').trim().toLowerCase();

  if (stNorm === 'in progress' || stNorm === 'in-progress' || stNorm === 'inprogress') {
    // Continue working on a live project (scratch tables)
    const btn = document.createElement('button');
    btn.className = 'view-project-btn';
    btn.textContent = 'View Project';
    btn.onclick = () => {
      // Map protocol to the correct page
      const proto = String(p.protocol || '').toLowerCase();
      let page = '/summary.html';
      if (proto.includes('mf') && proto.includes('5.2')) page = '/mf52.html';
      else if (proto.includes('mf') && (proto.includes('6.2') || proto.includes('6pt2') || proto.includes('62'))) page = '/mf.html';
      else if (proto.includes('mf') && proto.includes('5')) page = '/mf52.html';
      else if (proto.includes('ftire') || proto === 'ftire') page = '/ftire.html';
      else if (proto.includes('cdtire') || proto === 'cdtire') page = '/cdtire.html';
      else if (proto.includes('custom') || proto === 'custom') page = '/custom.html';

      // You can include the id if those pages use it; it won't affect archived mode (handled by select.js)
      const target = `${page}?projectId=${encodeURIComponent(projId)}`;
      window.location.href = target;
    };
    actionsTd.appendChild(btn);

  } else if (stNorm === 'completed') {
    // Open the archived snapshot view (select.html handles archived mode)
    const a = document.createElement('a');
    a.className = 'view-project-btn';
    a.textContent = 'Open';
    a.href = `/select.html?projectId=${encodeURIComponent(projId)}`;
    actionsTd.appendChild(a);

  } else {
    // Not Started or other states
    actionsTd.textContent = '-';
    actionsTd.style.opacity = '0.6';
  }
}


        tableBody.appendChild(tr);
      });
    })
    .catch((err) => {
      console.error('Error loading project history:', err);
      loadingSpinner.style.display = 'none';
      errorMessage.textContent = `Failed to load project history: ${err.message}`;
      errorMessage.style.display = 'block';
    });
}

/* ---------- filters ---------- */

function applyFilters() {
  const searchText = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const tableBody = document.getElementById('historyTableBody');
  if (!tableBody) return;

  const rows = Array.from(tableBody.getElementsByTagName('tr'));

  rows.forEach((row) => {
    const cells = row.getElementsByTagName('td');
    if (!cells.length) return;

    const rowText = Array.from(cells)
      .slice(0, 8) // search only the data columns, not the Actions column
      .map((c) => c.textContent.toLowerCase())
      .join(' ');

    const show = !searchText || rowText.includes(searchText);
    row.style.display = show ? '' : 'none';
  });

  updateNoResultsMessage();
}

function updateNoResultsMessage() {
  const tableBody = document.getElementById('historyTableBody');
  const noDataMessage = document.getElementById('noDataMessage');
  if (!tableBody || !noDataMessage) return;

  const visibleRows = Array.from(tableBody.getElementsByTagName('tr')).filter(
    (row) => row.style.display !== 'none'
  ).length;

  if (visibleRows === 0) {
    noDataMessage.textContent = 'No matching projects found';
    noDataMessage.style.display = 'block';
  } else {
    noDataMessage.style.display = 'none';
  }
}
