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

  let selectedFile = null;

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

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chunkSize', chunkSizeSelect.value);

    try {
      // Simulate progress
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 85) progress = 85;
        progressBar.style.width = progress + '%';
        if (progress > 40) progressText.textContent = 'Validating data...';
        if (progress > 70) progressText.textContent = 'Generating output files...';
      }, 300);

      const response = await fetch('/api/validate', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Validation failed');
      }

      progressBar.style.width = '100%';
      progressText.textContent = 'Complete!';

      const data = await response.json();

      setTimeout(() => {
        renderResults(data);
        showToast('Validation complete!', 'success');
      }, 500);
    } catch (err) {
      progressBar.style.width = '0%';
      progressText.textContent = 'Error: ' + err.message;
      showToast(err.message, 'error');
    } finally {
      btnValidate.disabled = false;
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
})();
