// ===== GitHub Config =====
const CONFIG = {
  owner: 'shoebkhan4',
  repo: 'NewShop-Expense',
  filePath: 'expenses.json',
  documentsDir: 'documents',
  branch: 'main',
  apiBase: 'https://api.github.com'
};

// Token loaded from localStorage (user enters via Settings)
let GITHUB_TOKEN = localStorage.getItem('shop_khata_token') || '';

function getFileUrl() {
  return `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.filePath}`;
}

// ===== Category Config =====
const CATEGORIES = {
  'Materials':     { emoji: '🧱', color: '#f59e0b', bg: 'cat-materials' },
  'Equipment':     { emoji: '🔧', color: '#3b82f6', bg: 'cat-equipment' },
  'Machines':      { emoji: '⚙️', color: '#6366f1', bg: 'cat-machines' },
  'Utility':       { emoji: '💡', color: '#10b981', bg: 'cat-utility' },
  'Labor':         { emoji: '👷', color: '#ec4899', bg: 'cat-labor' },
  'Bills':         { emoji: '📄', color: '#8b5cf6', bg: 'cat-bills' },
  'Franchise Fee': { emoji: '🏪', color: '#f97316', bg: 'cat-franchise' },
  'Permits':       { emoji: '📋', color: '#14b8a6', bg: 'cat-permits' },
  'Transport':     { emoji: '🚛', color: '#0ea5e9', bg: 'cat-transport' },
  'Food':          { emoji: '🍕', color: '#e11d48', bg: 'cat-food' },
  'Other':         { emoji: '📦', color: '#64748b', bg: 'cat-other' }
};

// ===== State =====
let expenses = [];
let fileSha = null;
let hasPendingChanges = false;
let selectedCategory = '';
let editSelectedCategory = '';
let editTargetId = null;
let activeFilter = '';
let uploadedDoc = null;
let editUploadedDoc = null;
let editTempDocs = [];
let galleryFilter = 'all';
let galleryDocuments = [];
let currentViewerDoc = null;
let currentViewerData = null;

// In-memory cache of resolved document base64 data (docId -> data URL).
// Kept out of localStorage so heavy attachment bytes never bloat the
// persisted cache or push us over browser storage quotas.
const docCache = new Map();

// ===== Init =====
// Auto-reload when a new service worker takes over so users always run fresh code
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

document.addEventListener('DOMContentLoaded', init);

function init() {
  document.getElementById('date').value = today();
  setGreeting();
  loadCache();
  setupNavigation();
  setupForm();
  setupFilters();
  setupSettings();
  setupDocumentUploads();
  setupGalleryFilters();
  renderDashboard();
  renderHistory();

  // Hide splash
  setTimeout(() => {
    document.getElementById('splash').classList.add('fade-out');
    document.getElementById('app').classList.remove('hidden');
  }, 1500);

  // Check if token exists
  if (!GITHUB_TOKEN) {
    setTimeout(() => {
      document.getElementById('settings-modal').classList.remove('hidden');
    }, 2000);
  } else {
    syncFromGitHub();
  }

  // Re-sync whenever the user returns to this tab so they see other users' updates
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && GITHUB_TOKEN) {
      syncFromGitHub();
    }
  });
}

// ===== Navigation =====
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('sync-btn').addEventListener('click', () => {
    const btn = document.getElementById('sync-btn');
    btn.classList.add('syncing');
    syncFromGitHub().finally(() => {
      setTimeout(() => btn.classList.remove('syncing'), 500);
    });
  });
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tab}`);
  });
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'history') renderHistory();
  if (tab === 'documents') renderDocumentsGallery();
}

// ===== Settings =====
function setupSettings() {
  // Open settings from header gear icon or if no token
  document.getElementById('settings-btn').addEventListener('click', () => {
    openSettings();
  });

  document.getElementById('save-token-btn').addEventListener('click', () => {
    const token = document.getElementById('token-input').value.trim();
    if (!token) {
      showToast('Please enter a token', 'error');
      return;
    }
    GITHUB_TOKEN = token;
    localStorage.setItem('shop_khata_token', token);
    document.getElementById('settings-modal').classList.add('hidden');
    showToast('Token saved! Syncing...', 'success');
    syncFromGitHub();
  });

  document.getElementById('skip-token-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
  });

  document.querySelector('#settings-modal .modal-backdrop').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
  });
}

function openSettings() {
  document.getElementById('token-input').value = GITHUB_TOKEN;
  document.getElementById('settings-modal').classList.remove('hidden');
}

// ===== Form Setup =====
function setupForm() {
  document.querySelectorAll('#category-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedCategory = chip.dataset.value;
      document.getElementById('selected-category').value = selectedCategory;
      updateMandatoryLabels();
    });
  });

  document.querySelectorAll('#edit-category-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#edit-category-chips .chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      editSelectedCategory = chip.dataset.value;
      document.getElementById('edit-selected-category').value = editSelectedCategory;
      updateMandatoryLabels();
    });
  });

  document.getElementById('expense-form').addEventListener('submit', handleAddExpense);
  document.getElementById('edit-expense-form').addEventListener('submit', handleEditExpense);
  document.querySelector('#edit-modal .modal-backdrop').addEventListener('click', closeEditModal);
}

async function handleAddExpense(e) {
  e.preventDefault();

  const amountVal = document.getElementById('amount').value.trim();
  if (!amountVal) {
    showToast('Please fill all required fields', 'error');
    return;
  }
  if (!/^\d+$/.test(amountVal)) {
    showToast('Decimal entry is not allowed. Please enter a whole number.', 'error');
    return;
  }
  const amount = parseInt(amountVal, 10);
  const category = selectedCategory;
  const description = document.getElementById('description').value.trim();
  const date = document.getElementById('date').value;
  const paidBy = normalizePaidBy(document.getElementById('paid-by').value);

  if (isNaN(amount) || amount <= 0 || !category || !description || !date) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  // Validate mandatory document upload for Equipment or Machines
  if ((category === 'Machines' || category === 'Equipment') && !uploadedDoc) {
    showToast('Document upload is mandatory for Equipment and Machines!', 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loading').classList.remove('hidden');

  let expenseDocs = [];
  if (uploadedDoc) {
    const docType = document.querySelector('input[name="expense-doc-type"]:checked').value;
    expenseDocs.push({
      id: genId('doc'),
      base64: uploadedDoc.base64,
      filename: uploadedDoc.filename,
      mimeType: uploadedDoc.mimeType,
      type: docType
    });
  }

  const expense = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    amount, category, description, date,
    paidBy: paidBy || '',
    createdAt: new Date().toISOString(),
    documents: expenseDocs
  };

  expenses.unshift(expense);
  saveCache();
  renderDashboard();

  if (GITHUB_TOKEN) {
    try {
      await migrateDocumentsInPlace(expense.documents);
      saveCache();
      await syncToGitHub();
      hasPendingChanges = false;
      saveCache();
      showToast('Expense added & synced!', 'success');
    } catch (err) {
      hasPendingChanges = true;
      saveCache();
      showToast('Saved locally, will sync later', 'error');
    }
  } else {
    showToast('Saved locally (add token in Settings to sync)', 'success');
  }

  document.getElementById('expense-form').reset();
  document.getElementById('date').value = today();
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  selectedCategory = '';

  // Reset upload states
  uploadedDoc = null;
  document.getElementById('expense-document').value = '';
  document.getElementById('file-info-display').classList.add('hidden');
  document.getElementById('doc-type-selection').classList.add('hidden');
  document.getElementById('upload-trigger-btn').innerHTML = '<span class="upload-icon">📁</span> Select File';
  updateMandatoryLabels();

  btn.disabled = false;
  btn.querySelector('.btn-text').classList.remove('hidden');
  btn.querySelector('.btn-loading').classList.add('hidden');
}

// ===== Filters =====
function setupFilters() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderHistory();
    });
  });

  document.getElementById('filter-month').addEventListener('change', () => {
    document.getElementById('clear-month').classList.remove('hidden');
    renderHistory();
  });

  document.getElementById('clear-month').addEventListener('click', () => {
    document.getElementById('filter-month').value = '';
    document.getElementById('clear-month').classList.add('hidden');
    renderHistory();
  });
}

// ===== Render Dashboard =====
function renderDashboard() {
  const now = new Date();
  const todayStr = today();

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('total-amount').textContent = formatCurrency(total);

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthly = monthExpenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('monthly-amount').textContent = formatCurrency(monthly);
  document.getElementById('total-entries').textContent = expenses.length;

  const todayTotal = expenses.filter(e => e.date === todayStr).reduce((s, e) => s + e.amount, 0);
  document.getElementById('today-amount').textContent = formatCurrency(todayTotal);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekTotal = expenses.filter(e => new Date(e.date) >= weekStart).reduce((s, e) => s + e.amount, 0);
  document.getElementById('week-amount').textContent = formatCurrency(weekTotal);

  renderCategoryBreakdown();
  renderRecent();
}

function renderCategoryBreakdown() {
  const container = document.getElementById('category-breakdown');
  const categoryTotals = {};
  expenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="recent-empty">No expenses yet</div>';
    return;
  }

  container.innerHTML = sorted.map(([cat, amount]) => {
    const info = CATEGORIES[cat] || CATEGORIES['Other'];
    return `
      <div class="category-card">
        <div class="category-emoji">${info.emoji}</div>
        <div class="category-name">${cat}</div>
        <div class="category-amount">${formatCurrency(amount)}</div>
      </div>
    `;
  }).join('');
}

function renderRecent() {
  const container = document.getElementById('recent-list');
  const recent = expenses.slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = '<div class="recent-empty">Add your first expense to get started</div>';
    return;
  }

  container.innerHTML = recent.map((e, i) => {
    const info = CATEGORIES[e.category] || CATEGORIES['Other'];
    const hasDoc = e.documents && e.documents.length > 0;
    const docBadge = hasDoc ? `<span class="attachment-badge" title="Has document(s)">📎</span>` : '';
    return `
      <div class="recent-item" style="animation-delay: ${i * 0.05}s" data-id="${e.id}" tabindex="0" role="button">
        <div class="recent-icon ${info.bg}">${info.emoji}</div>
        <div class="recent-info">
          <div class="recent-desc">${escapeHtml(e.description)}${docBadge}</div>
          <div class="recent-meta">${e.category} · ${formatDate(e.date)}${e.paidBy ? ' · ' + escapeHtml(e.paidBy) : ''}</div>
        </div>
        <div class="recent-amount">-${formatCurrency(e.amount)}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', () => openEditModal(item.dataset.id));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openEditModal(item.dataset.id);
      }
    });
  });
}

// ===== Render History =====
function renderHistory() {
  const container = document.getElementById('expense-list');
  const emptyState = document.getElementById('empty-state');

  let filtered = [...expenses];

  if (activeFilter) {
    filtered = filtered.filter(e => e.category === activeFilter);
  }

  const monthVal = document.getElementById('filter-month').value;
  if (monthVal) {
    const [y, m] = monthVal.split('-').map(Number);
    filtered = filtered.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() + 1 === m && d.getFullYear() === y;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const grouped = {};
  filtered.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  let html = '';
  sortedDates.forEach(date => {
    const dayTotal = grouped[date].reduce((s, e) => s + e.amount, 0);
    html += `<div class="expense-day-header">${formatDateFull(date)} · ${formatCurrency(dayTotal)}</div>`;

    grouped[date].forEach((e, i) => {
      const info = CATEGORIES[e.category] || CATEGORIES['Other'];
      const hasDoc = e.documents && e.documents.length > 0;
      const docBadge = hasDoc ? `<span class="attachment-badge" title="Has document(s)">📎</span>` : '';
      html += `
        <div class="expense-item" style="animation-delay: ${i * 0.04}s" data-id="${e.id}" tabindex="0" role="button">
          <div class="expense-icon ${info.bg}">${info.emoji}</div>
          <div class="expense-details">
            <div class="expense-desc">${escapeHtml(e.description)}${docBadge}</div>
            <div class="expense-category">${e.category}${e.paidBy ? ' · Paid by ' + escapeHtml(e.paidBy) : ''}</div>
          </div>
          <div class="expense-amount">-${formatCurrency(e.amount)}</div>
        </div>
      `;
    });
  });

  container.innerHTML = html;

  container.querySelectorAll('.expense-item').forEach(item => {
    item.addEventListener('click', () => openEditModal(item.dataset.id));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openEditModal(item.dataset.id);
      }
    });
  });
}

// ===== Edit Expense Modal =====
function openEditModal(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  editTargetId = id;
  editSelectedCategory = expense.category;

  document.getElementById('edit-amount').value = expense.amount;
  document.getElementById('edit-description').value = expense.description;
  document.getElementById('edit-date').value = expense.date;
  document.getElementById('edit-paid-by').value = expense.paidBy || '';
  document.getElementById('edit-selected-category').value = expense.category;

  // Set the category chip
  document.querySelectorAll('#edit-category-chips .chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.value === expense.category);
  });

  // Render revisions
  const listContainer = document.getElementById('edit-revisions-list');
  const revisions = expense.revisions || [];
  if (revisions.length === 0) {
    listContainer.innerHTML = '<div style="color: var(--text-tertiary); font-size: 0.85rem; text-align: center; padding: 10px 0;">No edit history yet</div>';
  } else {
    listContainer.innerHTML = revisions.map((rev, idx) => {
      const hasDocs = rev.documents && rev.documents.length > 0;
      return `
        <div class="revision-item">
          <div class="revision-meta">Revision #${revisions.length - idx} · ${formatRevisionDate(rev.revisedAt)}</div>
          <div class="revision-details">
            <div><strong>Amount:</strong> ₹${formatRevisionAmount(rev.amount)}</div>
            <div><strong>Category:</strong> ${escapeHtml(rev.category || 'Other')}</div>
            <div><strong>Description:</strong> ${escapeHtml(rev.description)}</div>
            <div><strong>Paid By:</strong> ${escapeHtml(rev.paidBy || 'None')}</div>
            ${hasDocs ? `<div><strong>Attachments:</strong> ${rev.documents.length} file(s)</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Reset edit modal file states
  editUploadedDoc = null;
  document.getElementById('edit-expense-document').value = '';
  document.getElementById('edit-file-info-display').classList.add('hidden');
  document.getElementById('edit-doc-type-selection').classList.add('hidden');
  document.getElementById('edit-upload-trigger-btn').innerHTML = '<span class="upload-icon">📁</span> Select File';

  editTempDocs = expense.documents ? expense.documents.map(d => ({ ...d })) : [];
  renderEditExistingDocs();
  updateMandatoryLabels();

  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editTargetId = null;
  editSelectedCategory = '';
  editUploadedDoc = null;
  editTempDocs = [];
}

async function handleEditExpense(e) {
  e.preventDefault();

  const amountVal = document.getElementById('edit-amount').value.trim();
  if (!amountVal) {
    showToast('Please fill all required fields', 'error');
    return;
  }
  if (!/^\d+$/.test(amountVal)) {
    showToast('Decimal entry is not allowed. Please enter a whole number.', 'error');
    return;
  }
  const amount = parseInt(amountVal, 10);
  const category = editSelectedCategory;
  const description = document.getElementById('edit-description').value.trim();
  const date = document.getElementById('edit-date').value;
  const paidBy = normalizePaidBy(document.getElementById('edit-paid-by').value);

  if (isNaN(amount) || amount <= 0 || !category || !description || !date) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  const expense = expenses.find(item => item.id === editTargetId);
  if (!expense) return;

  // Append new uploaded doc if any
  if (editUploadedDoc) {
    const docType = document.querySelector('input[name="edit-expense-doc-type"]:checked').value;
    editTempDocs.push({
      id: genId('doc'),
      base64: editUploadedDoc.base64,
      filename: editUploadedDoc.filename,
      mimeType: editUploadedDoc.mimeType,
      type: docType
    });
  }

  // Validate mandatory document upload for Equipment or Machines
  if ((category === 'Machines' || category === 'Equipment') && editTempDocs.length === 0) {
    showToast('Document upload is mandatory for Equipment and Machines!', 'error');
    return;
  }

  const docsChanged = !areDocumentsEqual(expense.documents, editTempDocs);
  const hasChanged = 
    expense.amount !== amount ||
    expense.category !== category ||
    expense.description !== description ||
    expense.date !== date ||
    normalizePaidBy(expense.paidBy) !== paidBy ||
    docsChanged;

  if (hasChanged) {
    if (!expense.revisions) {
      expense.revisions = [];
    }

    // Capture previous values in revisions history
    expense.revisions.unshift({
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      paidBy: normalizePaidBy(expense.paidBy),
      documents: expense.documents ? expense.documents.map(d => ({ ...d })) : [],
      revisedAt: new Date().toISOString()
    });

    // Capping revision history to 15 to prevent unbounded growth in expenses.json
    if (expense.revisions.length > 15) {
      expense.revisions = expense.revisions.slice(0, 15);
    }

    // Update with new values
    expense.amount = amount;
    expense.category = category;
    expense.description = description;
    expense.date = date;
    expense.paidBy = paidBy;
    expense.documents = editTempDocs;

    saveCache();
    renderDashboard();
    renderHistory();

    if (GITHUB_TOKEN) {
      try {
        await migrateDocumentsInPlace(expense.documents);
        saveCache();
        await syncToGitHub();
        hasPendingChanges = false;
        saveCache();
        showToast('Expense updated & synced!', 'success');
      } catch (err) {
        hasPendingChanges = true;
        saveCache();
        showToast('Updated locally, will sync later', 'error');
      }
    } else {
      showToast('Updated locally', 'success');
    }
  } else {
    showToast('No changes made', 'success');
  }

  closeEditModal();
}

function formatRevisionDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unknown Date';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function normalizePaidBy(value) {
  return (value ?? '').toString().trim();
}

function formatRevisionAmount(amount) {
  const num = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

// ===== GitHub Sync =====

function decodeBase64Content(base64) {
  const clean = base64.replace(/\s/g, '');
  const binaryStr = atob(clean);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (_) { return new TextDecoder('latin1').decode(bytes); }
}

function ghHeaders() {
  return { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' };
}

async function getRemoteFileInfo() {
  const resp = await fetch(
    `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/git/trees/${CONFIG.branch}`,
    { headers: ghHeaders() }
  );
  if (resp.status === 401 || resp.status === 403) return { error: 'auth' };
  if (!resp.ok) throw new Error(`GitHub API error (${resp.status})`);
  const data = await resp.json();
  const entry = data.tree.find(t => t.path === CONFIG.filePath);
  if (!entry) return { error: 'not_found' };
  return { sha: entry.sha };
}

async function fetchRemoteExpenses(blobSha) {
  const resp = await fetch(
    `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/git/blobs/${blobSha}`,
    { headers: ghHeaders() }
  );
  if (!resp.ok) throw new Error(`Failed to download data (${resp.status})`);
  const data = await resp.json();
  return JSON.parse(decodeBase64Content(data.content));
}

// ===== Document Storage (attachments live as separate GitHub files, =====
// ===== never embedded in expenses.json, so metadata sync stays fast =====

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf'
  };
  return map[mimeType] || 'bin';
}

async function uploadDocumentFile(docId, dataUrl, mimeType) {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const path = `${CONFIG.documentsDir}/${docId}.${extFromMime(mimeType)}`;
  const url = `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: `Add document ${docId}`, content: base64, branch: CONFIG.branch })
  });

  if (response.ok) return path;

  // 422 usually means the file already exists at this path (e.g. a retry
  // after a dropped response) — since doc ids are unique per upload, that
  // means our own upload already landed, so treat it as success.
  if (response.status === 422) return path;

  const err = await response.json().catch(() => ({}));
  throw new Error(err.message || `Document upload failed (${response.status})`);
}

async function fetchDocumentContent(path, mimeType) {
  const url = `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`;
  const resp = await fetch(url, { headers: ghHeaders() });

  if (resp.status === 403) {
    const errBody = await resp.json().catch(() => ({}));
    if (errBody.message && errBody.message.includes('too large')) {
      return await fetchDocumentContentViaBlob(path, mimeType);
    }
    throw new Error('Failed to fetch document (auth)');
  }

  if (!resp.ok) throw new Error(`Failed to fetch document (${resp.status})`);
  const data = await resp.json();
  return `data:${mimeType};base64,${data.content.replace(/\s/g, '')}`;
}

async function fetchDocumentContentViaBlob(path, mimeType) {
  const treeResp = await fetch(
    `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/git/trees/${CONFIG.branch}?recursive=1`,
    { headers: ghHeaders() }
  );
  if (!treeResp.ok) throw new Error('Failed to fetch file tree');
  const treeData = await treeResp.json();
  const entry = treeData.tree.find(t => t.path === path);
  if (!entry) throw new Error('Document not found');

  const blobResp = await fetch(
    `${CONFIG.apiBase}/repos/${CONFIG.owner}/${CONFIG.repo}/git/blobs/${entry.sha}`,
    { headers: ghHeaders() }
  );
  if (!blobResp.ok) throw new Error('Failed to fetch document blob');
  const blobData = await blobResp.json();
  return `data:${mimeType};base64,${blobData.content.replace(/\s/g, '')}`;
}

// Resolves a document's viewable base64 data URL: in-memory cache first,
// then any legacy inline base64 still on the object, then GitHub.
async function getDocumentBase64(doc) {
  const cacheKey = doc.id || doc.path || doc.filename;
  if (docCache.has(cacheKey)) return docCache.get(cacheKey);
  if (doc.base64) {
    docCache.set(cacheKey, doc.base64);
    return doc.base64;
  }
  if (!doc.path) throw new Error('Document not available');
  const dataUrl = await fetchDocumentContent(doc.path, doc.mimeType);
  docCache.set(cacheKey, dataUrl);
  return dataUrl;
}

// Uploads any inline (legacy or newly-added) base64 documents in this array
// to GitHub as standalone files, then strips the base64 so expenses.json
// only ever carries a lightweight path reference. Mutates in place.
async function migrateDocumentsInPlace(docsArray) {
  if (!docsArray || docsArray.length === 0) return false;
  let changed = false;
  for (const doc of docsArray) {
    if (doc.path || !doc.base64) continue;
    if (!doc.id) doc.id = genId('doc');
    try {
      const path = await uploadDocumentFile(doc.id, doc.base64, doc.mimeType);
      docCache.set(doc.id, doc.base64);
      doc.path = path;
      delete doc.base64;
      changed = true;
    } catch (err) {
      console.error('Document migration failed:', err);
    }
  }
  return changed;
}

async function migrateAllDocuments() {
  let changed = false;
  for (const expense of expenses) {
    if (await migrateDocumentsInPlace(expense.documents)) changed = true;
    if (expense.revisions) {
      for (const rev of expense.revisions) {
        if (await migrateDocumentsInPlace(rev.documents)) changed = true;
      }
    }
  }
  return changed;
}

function getLastModified(expense) {
  if (expense.revisions && expense.revisions.length > 0 && expense.revisions[0].revisedAt) {
    return new Date(expense.revisions[0].revisedAt).getTime() || 0;
  }
  return new Date(expense.createdAt || expense.date).getTime() || 0;
}

function mergeExpenses(local, remote) {
  const map = new Map();
  remote.forEach(e => map.set(e.id, e));
  local.forEach(e => {
    if (!map.has(e.id)) {
      map.set(e.id, e);
    } else if (getLastModified(e) > getLastModified(map.get(e.id))) {
      map.set(e.id, e);
    }
  });
  return Array.from(map.values())
    .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
}

async function syncFromGitHub() {
  if (!GITHUB_TOKEN) return;

  try {
    const fileInfo = await getRemoteFileInfo();

    if (fileInfo.error === 'auth') {
      showToast('Token invalid — tap Settings to re-enter it', 'error');
      return;
    }

    if (fileInfo.error === 'not_found') {
      fileSha = null;
      if (expenses.length > 0) {
        await syncToGitHub();
        hasPendingChanges = false;
        saveCache();
      }
      return;
    }

    const remoteChanged = fileInfo.sha !== fileSha;

    if (!remoteChanged && !hasPendingChanges) {
      showToastSync();
      return;
    }

    const remoteExpenses = await fetchRemoteExpenses(fileInfo.sha);

    const remoteMap = new Map(remoteExpenses.map(e => [e.id, e]));
    const needsPush = expenses.some(e => {
      if (!remoteMap.has(e.id)) return true;
      return getLastModified(e) > getLastModified(remoteMap.get(e.id));
    });

    expenses = mergeExpenses(expenses, remoteExpenses);
    fileSha = fileInfo.sha;
    saveCache();
    renderDashboard();
    renderHistory();
    showToastSync();

    let migrated = false;
    try {
      migrated = await migrateAllDocuments();
      if (migrated) saveCache();
    } catch (err) {
      console.error('Document migration pass failed:', err);
    }

    if (needsPush || hasPendingChanges || migrated) {
      try {
        await syncToGitHub();
        hasPendingChanges = false;
        saveCache();
      } catch (err) {
        hasPendingChanges = true;
        saveCache();
        console.error('Push after sync failed:', err);
      }
    }
  } catch (err) {
    console.error('Sync error:', err);
    showToast('Sync failed — check internet & token in Settings', 'error');
  }
}

async function syncToGitHub() {
  if (!GITHUB_TOKEN) return;

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const fileInfo = await getRemoteFileInfo();

    if (fileInfo.error === 'auth') {
      showToast('Token invalid — tap Settings to re-enter it', 'error');
      return;
    }

    let remoteSha = null;

    if (fileInfo.error === 'not_found') {
      remoteSha = null;
    } else {
      remoteSha = fileInfo.sha;
      if (remoteSha !== fileSha) {
        const remoteExpenses = await fetchRemoteExpenses(remoteSha);
        expenses = mergeExpenses(expenses, remoteExpenses);
      }
    }

    fileSha = remoteSha;
    saveCache();

    const jsonStr = JSON.stringify(expenses, null, 2);
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
    const content = btoa(binary);

    const body = {
      message: `Update expenses - ${new Date().toLocaleString()}`,
      content,
      branch: CONFIG.branch
    };
    if (fileSha) body.sha = fileSha;

    const response = await fetch(getFileUrl(), {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const data = await response.json();
      fileSha = data.content.sha;
      hasPendingChanges = false;
      saveCache();
      return;
    }

    if ((response.status === 409 || response.status === 422) && attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }

    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Upload failed (${response.status})`);
  }
}

// ===== Cache =====
function loadCache() {
  try {
    expenses = JSON.parse(localStorage.getItem('shop_khata_expenses') || '[]');
    fileSha = localStorage.getItem('shop_khata_sha') || null;
    hasPendingChanges = localStorage.getItem('shop_khata_pending') === 'true';
  } catch (e) {
    expenses = [];
    hasPendingChanges = false;
  }
}

function saveCache() {
  localStorage.setItem('shop_khata_expenses', JSON.stringify(expenses));
  if (fileSha) localStorage.setItem('shop_khata_sha', fileSha);
  else localStorage.removeItem('shop_khata_sha');
  localStorage.setItem('shop_khata_pending', hasPendingChanges ? 'true' : 'false');
}

// ===== Helpers =====
function today() {
  return new Date().toISOString().split('T')[0];
}

function setGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good Evening';
  if (hour < 12) greeting = 'Good Morning';
  else if (hour < 17) greeting = 'Good Afternoon';
  document.getElementById('greeting').textContent = greeting;
}

function formatCurrency(amount) {
  if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(1) + ' Cr';
  if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + ' L';
  if (amount >= 1000) return '₹' + (amount / 1000).toFixed(1) + 'K';
  return '₹' + amount.toFixed(0);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));

  if (dateStr === today()) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();

  if (dateStr === today()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('success-toast');
  toast.className = `toast ${type}-toast`;
  toast.querySelector('.toast-text').textContent = message;
  toast.querySelector('.toast-icon').textContent = type === 'success' ? '✓' : '✕';
  toast.classList.remove('hidden');

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 2500);
}

function showToastSync() {
  const toast = document.getElementById('sync-toast');
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 2000);
}

// ===== Document Management & Gallery Support =====
function setupDocumentUploads() {
  // Add Expense form triggers
  const uploadTriggerBtn = document.getElementById('upload-trigger-btn');
  const expenseDocumentInput = document.getElementById('expense-document');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const fileInfoDisplay = document.getElementById('file-info-display');
  const docTypeSelection = document.getElementById('doc-type-selection');
  const selectedFileName = document.getElementById('selected-file-name');

  uploadTriggerBtn.addEventListener('click', () => {
    expenseDocumentInput.click();
  });

  expenseDocumentInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      uploadedDoc = {
        base64: event.target.result,
        filename: file.name,
        mimeType: file.type
      };
      selectedFileName.textContent = file.name;
      fileInfoDisplay.classList.remove('hidden');
      docTypeSelection.classList.remove('hidden');
      uploadTriggerBtn.innerHTML = '<span class="upload-icon">🔄</span> Change File';
    };
    reader.readAsDataURL(file);
  });

  removeFileBtn.addEventListener('click', () => {
    expenseDocumentInput.value = '';
    uploadedDoc = null;
    fileInfoDisplay.classList.add('hidden');
    docTypeSelection.classList.add('hidden');
    uploadTriggerBtn.innerHTML = '<span class="upload-icon">📁</span> Select File';
  });

  // Edit Expense form triggers
  const editUploadTriggerBtn = document.getElementById('edit-upload-trigger-btn');
  const editExpenseDocumentInput = document.getElementById('edit-expense-document');
  const editRemoveFileBtn = document.getElementById('edit-remove-file-btn');
  const editFileInfoDisplay = document.getElementById('edit-file-info-display');
  const editDocTypeSelection = document.getElementById('edit-doc-type-selection');
  const editSelectedFileName = document.getElementById('edit-selected-file-name');

  editUploadTriggerBtn.addEventListener('click', () => {
    editExpenseDocumentInput.click();
  });

  editExpenseDocumentInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      editUploadedDoc = {
        base64: event.target.result,
        filename: file.name,
        mimeType: file.type
      };
      editSelectedFileName.textContent = file.name;
      editFileInfoDisplay.classList.remove('hidden');
      editDocTypeSelection.classList.remove('hidden');
      editUploadTriggerBtn.innerHTML = '<span class="upload-icon">🔄</span> Change File';
    };
    reader.readAsDataURL(file);
  });

  editRemoveFileBtn.addEventListener('click', () => {
    editExpenseDocumentInput.value = '';
    editUploadedDoc = null;
    editFileInfoDisplay.classList.add('hidden');
    editDocTypeSelection.classList.add('hidden');
    editUploadTriggerBtn.innerHTML = '<span class="upload-icon">📁</span> Select File';
  });

  // Persistent click listener for document viewer download/open button
  document.getElementById('viewer-download-btn').addEventListener('click', () => {
    if (currentViewerDoc && currentViewerData) {
      const link = document.createElement('a');
      link.href = currentViewerData;
      link.download = currentViewerDoc.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  });
}

function updateMandatoryLabels() {
  const addLabel = document.getElementById('document-upload-label');
  const isMandatoryAdd = (selectedCategory === 'Machines' || selectedCategory === 'Equipment');
  addLabel.innerHTML = `Upload Bill or Warranty Document ${isMandatoryAdd ? '<span class="required-star">*</span>' : ''}`;

  const editLabel = document.getElementById('edit-document-upload-label');
  const isMandatoryEdit = (editSelectedCategory === 'Machines' || editSelectedCategory === 'Equipment');
  editLabel.innerHTML = `Upload Bill or Warranty Document ${isMandatoryEdit ? '<span class="required-star">*</span>' : ''}`;
}

function renderEditExistingDocs() {
  const container = document.getElementById('edit-existing-docs');
  if (editTempDocs.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `<label class="form-label" style="margin-top: 10px;">Current Documents</label>` +
    editTempDocs.map((doc, idx) => {
      const isImage = doc.mimeType.startsWith('image/');
      const cachedSrc = doc.base64 || docCache.get(doc.id);
      const preview = isImage && cachedSrc
        ? `<img src="${cachedSrc}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border);">`
        : `<span style="font-size: 1.5rem;">${isImage ? '🖼️' : '📄'}</span>`;
      const badgeClass = doc.type === 'Warranty' ? 'badge-warranty' : 'badge-bill';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
            ${preview}
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(doc.filename)}</div>
              <span class="document-type-badge ${badgeClass}" style="position: static; font-size: 0.6rem; padding: 2px 6px;">${doc.type}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="view-doc-btn" onclick="previewDocByIndex(${idx})" style="background: var(--accent-bg); color: var(--accent); border: none; font-size: 0.8rem; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">View</button>
            <button type="button" class="delete-doc-btn" onclick="deleteDocByIndex(${idx})" style="background: var(--danger-bg); color: var(--danger); border: none; font-size: 0.8rem; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">Delete</button>
          </div>
        </div>
      `;
    }).join('');
}

window.previewDocByIndex = function(idx) {
  const doc = editTempDocs[idx];
  if (doc) {
    viewDocument(doc);
  }
};

window.deleteDocByIndex = function(idx) {
  editTempDocs.splice(idx, 1);
  renderEditExistingDocs();
};

function setupGalleryFilters() {
  const searchInput = document.getElementById('gallery-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderDocumentsGallery();
    });
  }

  document.querySelectorAll('[data-gfilter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-gfilter]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      galleryFilter = chip.dataset.gfilter;
      renderDocumentsGallery();
    });
  });
}

function areDocumentsEqual(docs1, docs2) {
  // Create shallow copies of document lists and sort them in-place intentionally for comparison
  const arr1 = [...(docs1 || [])];
  const arr2 = [...(docs2 || [])];
  if (arr1.length !== arr2.length) return false;

  // Identity is the doc id/path once uploaded, falling back to inline
  // base64 for not-yet-migrated docs, so equality still holds regardless
  // of whether a document has been offloaded to GitHub yet.
  const key = d => `${d.filename || ''}_${d.type || ''}_${d.mimeType || ''}_${d.id || d.path || d.base64 || ''}`;
  arr1.sort((a, b) => key(a).localeCompare(key(b)));
  arr2.sort((a, b) => key(a).localeCompare(key(b)));

  for (let i = 0; i < arr1.length; i++) {
    if (key(arr1[i]) !== key(arr2[i])) return false;
  }
  return true;
}

function renderDocumentsGallery() {
  const container = document.getElementById('documents-grid');
  const emptyState = document.getElementById('gallery-empty-state');
  const searchQuery = document.getElementById('gallery-search').value.toLowerCase().trim();

  // Extract all documents from all expenses
  let allDocs = [];
  expenses.forEach(e => {
    if (e.documents && e.documents.length > 0) {
      e.documents.forEach((doc, idx) => {
        allDocs.push({
          ...doc,
          expenseId: e.id,
          expenseDesc: e.description,
          expenseDate: e.date,
          expenseAmount: e.amount,
          expenseCategory: e.category,
          docIndex: idx
        });
      });
    }
  });

  // Apply filters
  if (galleryFilter !== 'all') {
    allDocs = allDocs.filter(d => d.type === galleryFilter);
  }

  // Apply search query
  if (searchQuery) {
    allDocs = allDocs.filter(d => 
      d.filename.toLowerCase().includes(searchQuery) ||
      d.expenseDesc.toLowerCase().includes(searchQuery) ||
      d.expenseCategory.toLowerCase().includes(searchQuery)
    );
  }

  if (allDocs.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = allDocs.map((doc, idx) => {
    const isImage = doc.mimeType.startsWith('image/');
    const badgeClass = doc.type === 'Warranty' ? 'badge-warranty' : 'badge-bill';
    const cachedSrc = doc.base64 || docCache.get(doc.id);
    const previewHtml = isImage && cachedSrc
      ? `<img src="${cachedSrc}" class="document-thumb" alt="${escapeHtml(doc.filename)}">`
      : `<span class="document-pdf-icon">${isImage ? '🖼️' : '📄'}</span>`;

    return `
      <div class="document-gallery-card" onclick="viewDocFromGallery(${idx})">
        <div class="document-thumb-container">
          ${previewHtml}
          <span class="document-type-badge ${badgeClass}">${doc.type}</span>
        </div>
        <div class="document-gallery-info">
          <div class="document-gallery-desc">${escapeHtml(doc.expenseDesc)}</div>
          <div class="document-gallery-meta">${escapeHtml(doc.expenseCategory)} · ${formatDate(doc.expenseDate)}</div>
          <div class="document-gallery-amount">${formatCurrency(doc.expenseAmount)}</div>
        </div>
      </div>
    `;
  }).join('');

  // Save filtered list globally in the module scope
  galleryDocuments = allDocs;
}

window.viewDocFromGallery = function(idx) {
  const doc = galleryDocuments[idx];
  if (doc) {
    viewDocument(doc);
  }
};

async function viewDocument(doc) {
  const modal = document.getElementById('viewer-modal');
  const title = document.getElementById('viewer-title');
  const content = document.getElementById('viewer-content');

  currentViewerDoc = doc;
  currentViewerData = null;
  title.textContent = doc.filename;
  content.innerHTML = '<div style="text-align:center; padding: 30px 0;"><span class="btn-spinner" style="display:inline-block;"></span><div style="margin-top:10px; font-size:0.85rem; color:var(--text-tertiary);">Loading document...</div></div>';
  modal.classList.remove('hidden');

  let dataUrl;
  try {
    dataUrl = await getDocumentBase64(doc);
  } catch (err) {
    content.innerHTML = `
      <div style="text-align:center; padding: 20px;">
        <div style="font-size: 3rem; margin-bottom: 10px;">⚠️</div>
        <div style="font-size: 0.9rem; color: var(--text-secondary);">Could not load this document. Check your internet connection and try again.</div>
      </div>
    `;
    return;
  }

  currentViewerData = dataUrl;
  content.innerHTML = '';

  if (doc.mimeType.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = doc.filename;
    content.appendChild(img);
  } else if (doc.mimeType === 'application/pdf') {
    const pdfDiv = document.createElement('div');
    pdfDiv.style.textAlign = 'center';
    pdfDiv.style.padding = '20px';
    pdfDiv.innerHTML = `
      <div style="font-size: 4rem; margin-bottom: 10px;">📄</div>
      <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); word-break: break-all;">${escapeHtml(doc.filename)}</div>
      <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 4px;">PDF Document</div>
    `;
    content.appendChild(pdfDiv);
  } else {
    const otherDiv = document.createElement('div');
    otherDiv.style.textAlign = 'center';
    otherDiv.style.padding = '20px';
    otherDiv.innerHTML = `
      <div style="font-size: 4rem; margin-bottom: 10px;">📎</div>
      <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); word-break: break-all;">${escapeHtml(doc.filename)}</div>
    `;
    content.appendChild(otherDiv);
  }
}

window.closeViewerModal = function() {
  document.getElementById('viewer-modal').classList.add('hidden');
};