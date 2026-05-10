// ===== GitHub Config =====
const CONFIG = {
  owner: 'shoebkhan4',
  repo: 'NewShop-Expense',
  filePath: 'expenses.json',
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
let selectedCategory = '';
let activeFilter = '';
let deleteTargetId = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', init);

function init() {
  document.getElementById('date').value = today();
  setGreeting();
  loadCache();
  setupNavigation();
  setupForm();
  setupFilters();
  setupSettings();
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
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedCategory = chip.dataset.value;
      document.getElementById('selected-category').value = selectedCategory;
    });
  });

  document.getElementById('expense-form').addEventListener('submit', handleAddExpense);
  document.querySelector('#delete-modal .modal-backdrop').addEventListener('click', closeDeleteModal);
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
}

async function handleAddExpense(e) {
  e.preventDefault();

  const amount = parseFloat(document.getElementById('amount').value);
  const category = selectedCategory;
  const description = document.getElementById('description').value.trim();
  const date = document.getElementById('date').value;
  const paidBy = document.getElementById('paid-by').value.trim();

  if (!amount || !category || !description || !date) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loading').classList.remove('hidden');

  const expense = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    amount, category, description, date,
    paidBy: paidBy || '',
    createdAt: new Date().toISOString()
  };

  expenses.unshift(expense);
  saveCache();
  renderDashboard();

  if (GITHUB_TOKEN) {
    try {
      await syncToGitHub();
      showToast('Expense added & synced!', 'success');
    } catch (err) {
      showToast('Saved locally, will sync later', 'error');
    }
  } else {
    showToast('Saved locally (add token in Settings to sync)', 'success');
  }

  document.getElementById('expense-form').reset();
  document.getElementById('date').value = today();
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  selectedCategory = '';

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
    return `
      <div class="recent-item" style="animation-delay: ${i * 0.05}s">
        <div class="recent-icon ${info.bg}">${info.emoji}</div>
        <div class="recent-info">
          <div class="recent-desc">${escapeHtml(e.description)}</div>
          <div class="recent-meta">${e.category} · ${formatDate(e.date)}${e.paidBy ? ' · ' + escapeHtml(e.paidBy) : ''}</div>
        </div>
        <div class="recent-amount">-${formatCurrency(e.amount)}</div>
      </div>
    `;
  }).join('');
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
      html += `
        <div class="expense-item" style="animation-delay: ${i * 0.04}s" data-id="${e.id}">
          <div class="expense-icon ${info.bg}">${info.emoji}</div>
          <div class="expense-details">
            <div class="expense-desc">${escapeHtml(e.description)}</div>
            <div class="expense-category">${e.category}${e.paidBy ? ' · Paid by ' + escapeHtml(e.paidBy) : ''}</div>
          </div>
          <div class="expense-amount">-${formatCurrency(e.amount)}</div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
  setupSwipeDelete();
}

function setupSwipeDelete() {
  document.querySelectorAll('.expense-item').forEach(item => {
    let startX = 0;
    let currentX = 0;

    item.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    });

    item.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
      const diff = startX - currentX;
      if (diff > 30) {
        item.style.transform = `translateX(-${Math.min(diff - 30, 80)}px)`;
      }
    });

    item.addEventListener('touchend', () => {
      const diff = startX - currentX;
      if (diff > 100) {
        deleteTargetId = item.dataset.id;
        document.getElementById('delete-modal').classList.remove('hidden');
      }
      item.style.transform = '';
    });
  });
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  deleteTargetId = null;
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  expenses = expenses.filter(e => e.id !== deleteTargetId);
  saveCache();
  renderDashboard();
  renderHistory();
  closeDeleteModal();

  if (GITHUB_TOKEN) {
    try {
      await syncToGitHub();
      showToast('Expense deleted', 'success');
    } catch (err) {
      showToast('Deleted locally, will sync later', 'error');
    }
  } else {
    showToast('Deleted locally', 'success');
  }
}

// ===== GitHub Sync =====
async function syncFromGitHub() {
  if (!GITHUB_TOKEN) return;

  try {
    const response = await fetch(getFileUrl(), {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.status === 404) {
      await syncToGitHub();
      return;
    }

    if (!response.ok) throw new Error('Sync failed');

    const data = await response.json();
    const remoteExpenses = JSON.parse(atob(data.content));
    fileSha = data.sha;

    expenses = mergeExpenses(expenses, remoteExpenses);
    saveCache();
    renderDashboard();
    renderHistory();
    showToastSync();
  } catch (err) {
    console.error('Sync error:', err);
    showToast('Sync failed - check your token', 'error');
  }
}

async function syncToGitHub() {
  if (!GITHUB_TOKEN) return;

  const content = btoa(JSON.stringify(expenses, null, 2));
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

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Upload failed');
  }

  const data = await response.json();
  fileSha = data.content.sha;
  saveCache();
}

function mergeExpenses(local, remote) {
  const merged = [...remote];
  const remoteIds = new Set(remote.map(e => e.id));
  local.forEach(e => {
    if (!remoteIds.has(e.id)) merged.push(e);
  });
  return merged.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
}

// ===== Cache =====
function loadCache() {
  try {
    expenses = JSON.parse(localStorage.getItem('shop_khata_expenses') || '[]');
    fileSha = localStorage.getItem('shop_khata_sha') || null;
  } catch (e) {
    expenses = [];
  }
}

function saveCache() {
  localStorage.setItem('shop_khata_expenses', JSON.stringify(expenses));
  if (fileSha) localStorage.setItem('shop_khata_sha', fileSha);
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