/**
 * XenoValidator — Frontend Application Logic
 */
(function () {
  'use strict';

  // ── DOM References ──────────────────────────────────────────────
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const uploadOptions = document.getElementById('upload-options');
  const chunkSizeSelect = document.getElementById('chunk-size');
  const btnValidate = document.getElementById('btn-validate');
  const progressSection = document.getElementById('progress-section');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const resultsSection = document.getElementById('results-section');
  const resultsSubtitle = document.getElementById('results-subtitle');
  const btnDownloadSample = document.getElementById('btn-download-sample');
  const btnHeroSample = document.getElementById('btn-hero-sample');
  const toastContainer = document.getElementById('toast-container');

  // Auth DOM References
  const userAuthSection = document.getElementById('user-auth-section');
  const userProfileSection = document.getElementById('user-profile-section');
  const userDisplayName = document.getElementById('user-display-name');
  const btnLogout = document.getElementById('btn-logout');
  const navHistory = document.getElementById('nav-history');
  const historySection = document.getElementById('history-section');
  const historyTbody = document.getElementById('history-tbody');
  const heroLoginBtn = document.getElementById('hero-login-btn');

  let selectedFile = null;
  let currentUser = null;

  // ── Theme Toggle ─────────────────────────────────────────────
  const themeToggle = document.getElementById('theme-toggle');
  const THEME_KEY = 'xeno-theme';

  function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    // Notify particles.js about the theme change
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  // Apply stored theme immediately (before paint)
  setTheme(getPreferredTheme());

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // Listen for OS-level theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // ── File Selection ──────────────────────────────────────────────
  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileSelect(files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileSelect(fileInput.files[0]);
  });

  btnRemoveFile.addEventListener('click', () => {
    clearFile();
  });

  function handleFileSelect(file) {
    const validExts = ['.csv', '.tsv', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext)) {
      showToast('Please upload a CSV, TSV, or TXT file.', 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast('File exceeds 100MB limit.', 'error');
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    uploadZone.style.display = 'none';
    fileInfo.style.display = 'flex';
    uploadOptions.style.display = 'flex';
    progressSection.style.display = 'none';
    resultsSection.style.display = 'none';
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    uploadZone.style.display = 'flex';
    fileInfo.style.display = 'none';
    uploadOptions.style.display = 'none';
    progressSection.style.display = 'none';
  }

  // ── Validation ──────────────────────────────────────────────────
  btnValidate.addEventListener('click', () => {
    if (!selectedFile) {
      showToast('Please select a file first.', 'error');
      return;
    }
    uploadFile(selectedFile);
  });

  async function uploadFile(file) {
    btnValidate.disabled = true;
    progressSection.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = 'Uploading file...';
    resultsSection.style.display = 'none';

    resetProgressSteps();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chunkSize', chunkSizeSelect.value);

    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Validation failed');
      }

      const uploadResult = await response.json();
      const jobId = uploadResult.jobId;

      // Subscribe to Server-Sent Events for real-time progress tracking
      const eventSource = new EventSource(`/api/validate/progress/${jobId}`);

      eventSource.onmessage = (event) => {
        const job = JSON.parse(event.data);

        if (job.error) {
          eventSource.close();
          progressBar.style.width = '0%';
          progressText.textContent = 'Error: ' + job.error;
          showToast(job.error, 'error');
          btnValidate.disabled = false;
          return;
        }

        // Update progress bar width
        progressBar.style.width = job.progress + '%';

        // Update step indicators
        updateProgressSteps(job.status);

        if (job.status === 'completed') {
          eventSource.close();
          progressText.textContent = 'Complete!';
          setTimeout(() => {
            renderResults(job.result);
            showToast('Validation complete!', 'success');
            btnValidate.disabled = false;
            if (currentUser) {
              loadHistory();
            }
          }, 500);
        } else if (job.status === 'failed') {
          eventSource.close();
          progressBar.style.width = '0%';
          progressText.textContent = 'Error: ' + (job.error || 'Failed');
          showToast(job.error || 'Validation job failed', 'error');
          btnValidate.disabled = false;
        }
      };

      eventSource.onerror = (err) => {
        eventSource.close();
        progressBar.style.width = '0%';
        progressText.textContent = 'Connection interrupted';
        showToast('Lost connection to validation progress stream.', 'error');
        btnValidate.disabled = false;
      };

    } catch (err) {
      progressBar.style.width = '0%';
      progressText.textContent = 'Error: ' + err.message;
      showToast(err.message, 'error');
      btnValidate.disabled = false;
    }
  }

  function resetProgressSteps() {
    const steps = ['step-upload', 'step-parse', 'step-validate', 'step-clean'];
    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'progress-step';
    });
    const uploadEl = document.getElementById('step-upload');
    if (uploadEl) uploadEl.classList.add('active');
    progressText.textContent = 'Uploading file...';
  }

  function updateProgressSteps(status) {
    const stepUpload = document.getElementById('step-upload');
    const stepParse = document.getElementById('step-parse');
    const stepValidate = document.getElementById('step-validate');
    const stepClean = document.getElementById('step-clean');

    if (status === 'parsing') {
      stepUpload.className = 'progress-step completed';
      stepParse.className = 'progress-step active';
      progressText.textContent = 'Parsing CSV file...';
    } else if (status === 'validating') {
      stepUpload.className = 'progress-step completed';
      stepParse.className = 'progress-step completed';
      stepValidate.className = 'progress-step active';
      progressText.textContent = 'Validating records...';
    } else if (status === 'cleaning') {
      stepUpload.className = 'progress-step completed';
      stepParse.className = 'progress-step completed';
      stepValidate.className = 'progress-step completed';
      stepClean.className = 'progress-step active';
      progressText.textContent = 'Normalizing & cleaning...';
    } else if (status === 'saving') {
      stepUpload.className = 'progress-step completed';
      stepParse.className = 'progress-step completed';
      stepValidate.className = 'progress-step completed';
      stepClean.className = 'progress-step active';
      progressText.textContent = 'Saving cleaned output and splitting chunks...';
    } else if (status === 'completed') {
      stepUpload.className = 'progress-step completed';
      stepParse.className = 'progress-step completed';
      stepValidate.className = 'progress-step completed';
      stepClean.className = 'progress-step completed';
    }
  }

  // ── Render Results ──────────────────────────────────────────────
  function renderResults(data) {
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const s = data.summary;
    resultsSubtitle.textContent = `Processed ${s.totalRows.toLocaleString()} rows with ${s.mappedFields} mapped fields`;

    // Animated counters
    animateCounter('total-rows', s.totalRows);
    animateCounter('valid-rows', s.validRows);
    animateCounter('error-rows', s.errorRows);
    animateCounter('warning-rows', s.warningRows);

    // Donut chart
    renderDonut(s.validRows, s.errorRows, s.warningRows - s.errorRows);

    // Field mapping
    renderMapping(s.fieldMapping, s.unmappedColumns);

    // Issues table
    renderIssues(data.errors, data.warnings);

    // Downloads
    renderDownloads(data);
  }

  function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    const duration = 1200;
    const start = performance.now();
    const startVal = 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (target - startVal) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // ── Donut Chart ─────────────────────────────────────────────────
  function renderDonut(valid, errors, warningsOnly) {
    const canvas = document.getElementById('donut-chart');
    const ctx = canvas.getContext('2d');
    const total = valid + errors + Math.max(warningsOnly, 0);
    if (total === 0) return;

    const passRate = Math.round((valid / (valid + errors)) * 100);
    document.getElementById('donut-percent').textContent = passRate + '%';

    const data = [
      { value: valid, color: '#10b981', label: 'Valid' },
      { value: errors, color: '#ef4444', label: 'Errors' },
    ];

    if (warningsOnly > 0) {
      data.push({ value: warningsOnly, color: '#f59e0b', label: 'Warnings Only' });
    }

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 95;
    const lineWidth = 24;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let startAngle = -Math.PI / 2;
    const gap = 0.04;

    for (const segment of data) {
      if (segment.value === 0) continue;
      const sliceAngle = (segment.value / total) * (Math.PI * 2) - gap;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = segment.color;
      ctx.lineCap = 'round';
      ctx.stroke();

      startAngle += sliceAngle + gap;
    }

    // Legend
    const legendEl = document.getElementById('chart-legend');
    legendEl.innerHTML = data
      .filter(d => d.value > 0)
      .map(d => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${d.color}"></span>
          ${d.label}: ${d.value.toLocaleString()}
        </div>
      `).join('');
  }

  // ── Field Mapping ───────────────────────────────────────────────
  function renderMapping(mappings, unmapped) {
    const el = document.getElementById('mapping-list');
    let html = mappings.map(m => `
      <div class="mapping-item">
        <span class="mapping-csv">${escapeHtml(m.csvColumn)}</span>
        <span class="mapping-arrow">→</span>
        <span class="mapping-schema">${m.schemaField}</span>
      </div>
    `).join('');

    if (unmapped && unmapped.length > 0) {
      html += unmapped.map(u => `
        <div class="mapping-item mapping-unmapped">
          <span class="mapping-csv">${escapeHtml(u)}</span>
          <span class="mapping-arrow">→</span>
          <span class="mapping-schema" style="color:var(--text-muted)">unmapped</span>
        </div>
      `).join('');
    }

    el.innerHTML = html;
  }

  // ── Issues Table ────────────────────────────────────────────────
  let allIssues = [];
  let currentFilter = 'all';

  function renderIssues(errors, warnings) {
    allIssues = [
      ...errors.map(e => ({ ...e, type: 'error' })),
      ...warnings.map(w => ({ ...w, type: 'warning' })),
    ].sort((a, b) => a.row - b.row);

    document.getElementById('filter-all').textContent = `All (${allIssues.length})`;
    document.getElementById('filter-errors').textContent = `Errors (${errors.length})`;
    document.getElementById('filter-warnings').textContent = `Warnings (${warnings.length})`;

    filterIssues('all');

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterIssues(btn.dataset.filter);
      });
    });
  }

  function filterIssues(filter) {
    currentFilter = filter;
    const filtered = filter === 'all'
      ? allIssues
      : allIssues.filter(i => i.type === filter);

    const maxDisplay = 100;
    const display = filtered.slice(0, maxDisplay);

    const tbody = document.getElementById('issues-tbody');
    tbody.innerHTML = display.map(issue => `
      <tr>
        <td><span class="badge badge-${issue.type}">${issue.type}</span></td>
        <td>${issue.row}</td>
        <td><code>${escapeHtml(issue.field)}</code></td>
        <td class="td-value" title="${escapeHtml(String(issue.value || ''))}">${escapeHtml(String(issue.value || '—'))}</td>
        <td class="td-message">${escapeHtml(issue.message)}</td>
      </tr>
    `).join('');

    const footer = document.getElementById('table-footer');
    if (filtered.length > maxDisplay) {
      footer.textContent = `Showing ${maxDisplay} of ${filtered.length} issues. Download the validation report for the full list.`;
    } else if (filtered.length === 0) {
      footer.textContent = 'No issues found — your data looks great!';
    } else {
      footer.textContent = `Showing all ${filtered.length} issues`;
    }
  }

  // ── Downloads ───────────────────────────────────────────────────
  function renderDownloads(data) {
    const grid = document.getElementById('downloads-grid');
    let html = '';

    // Cleaned file
    html += downloadItem(data.downloads.cleanedFile, 'Validated CSV', `${data.cleaning.finalRowCount} rows · cleaned`, 'csv');

    // Report
    html += downloadItem(data.downloads.report, 'Validation Report', 'JSON format', 'json');

    // Chunks
    if (data.chunking) {
      html += downloadItem(data.chunking.zipDownloadUrl, 'All Chunks (ZIP)', `${data.chunking.totalChunks} chunks`, 'zip');

      for (const chunk of data.chunking.chunks) {
        html += downloadItem(chunk.downloadUrl, chunk.filename, `${chunk.rowCount} rows`, 'csv');
      }
    }

    grid.innerHTML = html;
  }

  function downloadItem(url, name, meta, type) {
    const iconClass = type === 'csv' ? 'csv-icon' : type === 'zip' ? 'zip-icon' : 'json-icon';
    const svgIcons = {
      csv: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      zip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
      json: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    };

    return `
      <a href="${url}" class="download-item" download>
        <div class="download-icon ${iconClass}">${svgIcons[type]}</div>
        <div class="download-info">
          <span class="download-name">${escapeHtml(name)}</span>
          <span class="download-meta">${meta}</span>
        </div>
      </a>
    `;
  }

  // ── Sample CSV ──────────────────────────────────────────────────
  btnDownloadSample.addEventListener('click', downloadSample);
  btnHeroSample.addEventListener('click', () => {
    downloadSample();
    showToast('Sample CSV downloaded! Upload it to try the validator.', 'info');
  });

  function downloadSample() {
    window.location.href = '/api/sample?rows=50';
  }

  // ── Countries ───────────────────────────────────────────────────
  const FLAG_EMOJI = {
    SG: '🇸🇬', IN: '🇮🇳', US: '🇺🇸', GB: '🇬🇧', AU: '🇦🇺',
    MY: '🇲🇾', JP: '🇯🇵', DE: '🇩🇪', AE: '🇦🇪', CA: '🇨🇦',
  };

  async function loadCountries() {
    try {
      const res = await fetch('/api/countries');
      const countries = await res.json();
      const grid = document.getElementById('countries-grid');

      grid.innerHTML = countries.map(c => `
        <div class="country-card">
          <div class="country-flag">${FLAG_EMOJI[c.code] || '🏳️'}</div>
          <div class="country-info">
            <div class="country-name">${escapeHtml(c.name)}</div>
            <div class="country-detail">${c.countryCode} · ${Array.isArray(c.phoneDigits) ? c.phoneDigits.join('-') : c.phoneDigits} digits</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      // Countries section will remain empty
    }
  }

  loadCountries();

  // ── Toast Notifications ─────────────────────────────────────────
  function showToast(message, type = 'info') {
    const icons = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ── Utilities ───────────────────────────────────────────────────
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Smooth scroll for anchor links ──────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── User Authentication and Validation History ──────────────────

  async function checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setLoggedInState(data.user);
      } else {
        setLoggedOutState();
      }
    } catch (err) {
      setLoggedOutState();
    }
  }

  function setLoggedInState(user) {
    currentUser = user;
    userDisplayName.textContent = user.name;
    userAuthSection.style.display = 'none';
    userProfileSection.style.display = 'flex';
    navHistory.style.display = 'inline-block';
    historySection.style.display = 'block';
    if (heroLoginBtn) heroLoginBtn.style.display = 'none';
    loadHistory();
  }

  function setLoggedOutState() {
    currentUser = null;
    userDisplayName.textContent = '';
    userAuthSection.style.display = 'flex';
    userProfileSection.style.display = 'none';
    navHistory.style.display = 'none';
    historySection.style.display = 'none';
    historyTbody.innerHTML = '';
    if (heroLoginBtn) heroLoginBtn.style.display = 'inline-flex';
  }

  // Logout handler
  btnLogout.addEventListener('click', async () => {
    try {

      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        setLoggedOutState();
        showToast('Logged out successfully', 'info');
      }
    } catch (err) {
      showToast('Logout failed', 'error');
    }
  });

  // Load history from API
  async function loadHistory() {
    try {
      const res = await fetch('/api/validate/history');
      if (!res.ok) throw new Error('Could not retrieve validation history');
      
      const history = await res.json();
      renderHistoryTable(history);
    } catch (err) {
      historyTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error)">${err.message}</td></tr>`;
    }
  }

  function renderHistoryTable(items) {
    if (items.length === 0) {
      historyTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No validation history yet. Try validating a file!</td></tr>`;
      return;
    }

    historyTbody.innerHTML = items.map(item => {
      const date = new Date(item.timestamp).toLocaleString();
      const s = item.summary;
      
      const badgeValid = `<span class="badge-valid-summary">${s.validRows.toLocaleString()} valid</span>`;
      const badgeError = s.errorRows > 0 ? `<span class="badge-error-summary">${s.errorRows.toLocaleString()} errors</span>` : '';
      const badgeWarn = s.warningRows > 0 ? `<span class="badge-warning-summary">${s.warningRows.toLocaleString()} warnings</span>` : '';
      
      const dlCleaned = `<a href="${item.downloads.cleanedFile}" class="btn btn-sm btn-outline" download style="margin-right:6px">Cleaned CSV</a>`;
      const dlReport = `<a href="${item.downloads.report}" class="btn btn-sm btn-ghost" download>Report JSON</a>`;
      
      return `
        <tr>
          <td>${date}</td>
          <td><code>${escapeHtml(item.filename)}</code></td>
          <td>${s.totalRows.toLocaleString()}</td>
          <td>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${badgeValid}
              ${badgeError}
              ${badgeWarn}
            </div>
          </td>
          <td>
            <div style="display:flex">
              ${dlCleaned}
              ${dlReport}
            </div>
          </td>
          <td>
            <button class="btn btn-sm btn-icon btn-delete-history" data-job-id="${item.jobId}" title="Delete history record">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach delete handlers
    historyTbody.querySelectorAll('.btn-delete-history').forEach(btn => {
      btn.addEventListener('click', async () => {
        const jobId = btn.dataset.jobId;
        if (confirm('Are you sure you want to delete this validation run and all associated files?')) {
          await deleteHistoryItem(jobId);
        }
      });
    });
  }

  async function deleteHistoryItem(jobId) {
    try {
      const res = await fetch(`/api/validate/history/${jobId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete history record');
      }

      showToast('Validation run deleted successfully', 'success');
      loadHistory();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Verify auth status on load
  checkAuthStatus();
})();
