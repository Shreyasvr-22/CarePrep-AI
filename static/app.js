const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
let toastTimer;
let currentSummaryRaw = '';
let currentQuestionsRaw = '';
let editingNoteId = null;
let currentMedicineExplanationRaw = '';
let currentMissedDoseSource = '';
let medicationReminderTimer = null;

const STORAGE_KEYS = {
  notes: 'careprepAI.notes.v2',
  checklist: 'careprepAI.checklist.v2',
  preferences: 'careprepAI.preferences.v2',
  medicationReminders: 'careprepAI.medicationReminders.v1'
};

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function safeReadStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function safeWriteStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_error) {
    showToast('Browser storage is unavailable or full. Remove some saved notes and try again.');
    return false;
  }
}

function setPage(page) {
  $$('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  const labels = {
    home: 'Overview', assistant: 'Health assistant', questions: 'Doctor questions',
    summary: 'Visit preparation', checklist: 'Appointment checklist', prescription: 'Prescription Companion', notes: 'My notes'
  };
  $('#breadcrumbCurrent').textContent = labels[page] || 'Overview';
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'notes') renderNotes();
  if (page === 'checklist') renderChecklist();
  if (page === 'prescription') renderMedicationReminders();
}

$$('.nav-item').forEach((item) => item.addEventListener('click', () => setPage(item.dataset.page)));
document.addEventListener('click', (event) => {
  const promptItem = event.target.closest('[data-prompt]');
  if (promptItem) {
    event.preventDefault();
    setPage('assistant');
    sendMessage(promptItem.dataset.prompt);
    return;
  }
  const goItem = event.target.closest('[data-go]');
  if (goItem) {
    event.preventDefault();
    setPage(goItem.dataset.go);
  }
});
$('#mobileMenu')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#dismissNotice')?.addEventListener('click', () => $('.notice-banner')?.remove());
$('#todayLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());

async function refreshStatus() {
  const pill = $('#connectionPill');
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    pill.classList.toggle('connected', Boolean(data.ai_enabled));
    pill.classList.toggle('demo', !data.ai_enabled);
    const provider = data.provider ? 'AI key configured' : 'Preview mode · AI key needed';
    pill.innerHTML = `<i></i><span>${escapeHtml(provider)}</span>`;
    const dashboardLabel = $('#dashboardAiLabel');
    const dashboardDot = $('#dashboardAiDot');
    if (dashboardLabel) dashboardLabel.textContent = data.ai_enabled ? 'Configured' : 'Preview';
    if (dashboardDot) dashboardDot.classList.toggle('is-connected', Boolean(data.ai_enabled));
  } catch (_error) {
    pill.classList.add('demo');
    pill.innerHTML = '<i></i><span>Connection unavailable</span>';
    const dashboardLabel = $('#dashboardAiLabel');
    const dashboardDot = $('#dashboardAiDot');
    if (dashboardLabel) dashboardLabel.textContent = 'Unavailable';
    if (dashboardDot) dashboardDot.classList.remove('is-connected');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInlineMarkdown(value) {
  let text = escapeHtml(value);
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `@@CODE${codeSpans.length}@@`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });
  text = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  return text.replace(/@@CODE(\d+)@@/g, (_match, index) => codeSpans[Number(index)] || '');
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  if (!line || !line.includes('|')) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (/^\s*```/.test(line)) {
      index += 1;
      const code = [];
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const headHtml = `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>`;
      const bodyHtml = rows.length
        ? `<tbody>${rows.map((row) => `<tr>${header.map((_cell, col) => `<td>${renderInlineMarkdown(row[col] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`
        : '';
      blocks.push(`<div class="markdown-table-wrap"><table>${headHtml}${bodyHtml}</table></div>`);
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    // Ignore standalone markdown separators to keep responses visually clean.
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { index += 1; continue; }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${renderInlineMarkdown(quote.join(' '))}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const tag = isOrdered ? 'ol' : 'ul';
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      blocks.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index];
      if (/^\s*(#{1,4}\s|```|>|---+\s*$|\*\*\*+\s*$|[-*+]\s+|\d+[.)]\s+)/.test(next)) break;
      if (next.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) break;
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
  }
  return blocks.join('');
}

function addMessage(role, text, typing = false) {
  const container = $('#chatMessages');
  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}${typing ? ' typing' : ''}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'You' : '✳';
  const content = document.createElement('div');
  content.className = 'message-content';
  const author = document.createElement('span');
  author.className = 'message-author';
  author.textContent = role === 'user' ? 'YOU' : 'CAREPREP AI';
  const time = document.createElement('small');
  time.textContent = 'NOW';
  author.appendChild(time);
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  if (role === 'assistant' && !typing) {
    bubble.classList.add('markdown-body');
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = String(text ?? '');
  }
  content.append(author, bubble);
  row.append(avatar, content);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
  return row;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function sendMessage(presetText) {
  const input = $('#chatInput');
  const button = $('#sendChat');
  const message = String(presetText ?? input.value).trim();
  if (!message) return;
  if (message.length > 2500) { showToast('Please shorten your question.'); return; }

  addMessage('user', message);
  input.value = '';
  $('#charCount').textContent = '0 / 2500';
  input.style.height = 'auto';
  const loading = addMessage('assistant', 'Thinking through your question...', true);
  button.disabled = true;
  try {
    const data = await postJson('/api/chat', {
      message,
      language: $('#chatLanguage').value,
      style: $('#answerStyle').value
    });
    loading.remove();
    addMessage('assistant', data.response || 'The service returned an empty response. Please try again.');
    if (data.mode === 'demo') showToast('Preview examples · connect Groq for live AI');
  } catch (error) {
    loading.remove();
    addMessage('assistant', error.message || 'Something went wrong. Please try again.');
  } finally {
    button.disabled = false;
    input.focus();
  }
}

$('#sendChat')?.addEventListener('click', () => sendMessage());
$('#chatInput')?.addEventListener('input', (event) => {
  $('#charCount').textContent = `${event.target.value.length} / 2500`;
  event.target.style.height = 'auto';
  event.target.style.height = `${Math.min(event.target.scrollHeight, 110)}px`;
});
$('#chatInput')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
$('#clearChat')?.addEventListener('click', () => {
  $('#chatMessages').replaceChildren();
  addMessage('assistant', 'Hello! I can explain general health topics and help you prepare questions for a healthcare professional. Select your preferred language and ask a question.');
});

// Persist language and explanation preferences locally in this browser.
const savedPreferences = safeReadStorage(STORAGE_KEYS.preferences, {});
if (savedPreferences.language && $('#chatLanguage')) $('#chatLanguage').value = savedPreferences.language;
if (savedPreferences.style && $('#answerStyle')) $('#answerStyle').value = savedPreferences.style;
$('#chatLanguage')?.addEventListener('change', savePreferences);
$('#answerStyle')?.addEventListener('change', savePreferences);
function savePreferences() {
  safeWriteStorage(STORAGE_KEYS.preferences, {
    language: $('#chatLanguage').value,
    style: $('#answerStyle').value
  });
}

// Doctor question generator.
$('#questionsForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#generateQuestions');
  const concern = $('#questionConcern').value.trim();
  if (!concern) { showToast('Please describe a topic first.'); return; }
  button.disabled = true;
  button.textContent = 'Generating questions...';
  try {
    const data = await postJson('/api/doctor-questions', {
      concern,
      context: $('#questionContext').value.trim(),
      language: $('#questionLanguage').value
    });
    currentQuestionsRaw = data.response || '';
    $('#questionsOutput').innerHTML = renderMarkdown(currentQuestionsRaw);
    $('#questionsPlaceholder').classList.add('hidden');
    $('#questionsResult').classList.remove('hidden');
    showToast(data.mode === 'demo' ? 'Preview question examples created.' : 'Your question list is ready.');
  } catch (error) {
    showToast(error.message || 'Could not generate questions.');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Generate doctor questions <span>→</span>';
  }
});

$('#copyQuestions')?.addEventListener('click', async () => {
  if (!currentQuestionsRaw) return;
  try { await navigator.clipboard.writeText(currentQuestionsRaw); showToast('Questions copied.'); }
  catch (_error) { showToast('Copy is unavailable in this browser.'); }
});
$('#saveQuestions')?.addEventListener('click', () => {
  if (!currentQuestionsRaw) return;
  const topic = $('#questionConcern').value.trim().slice(0, 55) || 'Doctor questions';
  saveLocalNote(`Doctor questions — ${topic}`, currentQuestionsRaw);
});

// Visit preparation workflow.
$('#visitForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#generateSummary');
  const payload = {
    concern: $('#concern').value.trim(),
    duration: $('#duration').value.trim(),
    impact: $('#impact').value.trim(),
    context: $('#context').value.trim(),
    questions: $('#questions').value.trim(),
    language: $('#visitLanguage').value
  };
  if (!payload.concern) { showToast('Please add your main concern first.'); return; }
  button.disabled = true;
  button.textContent = 'Preparing your note...';
  try {
    const data = await postJson('/api/visit-summary', payload);
    currentSummaryRaw = data.response || '';
    $('#summaryText').innerHTML = renderMarkdown(currentSummaryRaw);
    $('#summaryPlaceholder').classList.add('hidden');
    $('#summaryResult').classList.remove('hidden');
    showToast(data.mode === 'demo' ? 'Preview note created · connect Groq for live AI' : 'Your draft is ready. Please review it.');
  } catch (error) {
    showToast(error.message || 'Could not create the note.');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Generate my visit note <span>→</span>';
  }
});

$('#copySummary')?.addEventListener('click', async () => {
  if (!currentSummaryRaw) return;
  try { await navigator.clipboard.writeText(currentSummaryRaw); showToast('Visit note copied.'); }
  catch (_error) { showToast('Copy is unavailable in this browser.'); }
});
$('#downloadSummary')?.addEventListener('click', () => {
  if (!currentSummaryRaw) return;
  downloadTextFile('careprep-visit-preparation-note.txt', currentSummaryRaw);
});
$('#saveVisitNote')?.addEventListener('click', () => {
  if (!currentSummaryRaw) return;
  const concern = $('#concern').value.trim().slice(0, 55) || 'Visit preparation';
  saveLocalNote(`Visit preparation — ${concern}`, currentSummaryRaw);
});

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printReport(title, content) {
  if (!content.trim()) { showToast('Generate a note before exporting a report.'); return; }
  const reportWindow = window.open('', '_blank', 'width=900,height=720');
  if (!reportWindow) {
    showToast('Allow pop-ups for this local website to export the PDF report.');
    return;
  }
  const generatedOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const reportHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
    <style>
      @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:14px/1.65 Arial,sans-serif;color:#263d38;margin:0}header{border-bottom:2px solid #d8e9e0;padding-bottom:14px;margin-bottom:22px}header h1{font-size:23px;margin:0 0 4px;color:#23473c}header p{margin:0;color:#667a73;font-size:11px}.report-content h2,.report-content h3,.report-content h4{color:#315d4e;margin:19px 0 7px;page-break-after:avoid}.report-content p{margin:7px 0}.report-content ul,.report-content ol{padding-left:23px}.report-content li{margin:4px 0}.report-content table{width:100%;border-collapse:collapse;font-size:12px}.report-content th,.report-content td{border:1px solid #dbe5df;padding:7px;text-align:left}.report-content th{background:#edf5f0}.report-content blockquote{border-left:3px solid #80b79a;padding:8px 12px;background:#f3f8f5}.disclaimer{border-top:1px solid #dbe5df;margin-top:30px;padding-top:12px;color:#6c7e77;font-size:10px}.print-tip{margin:0 0 18px;padding:9px 12px;background:#f3f8f5;color:#526a61;font-size:11px}@media print{.print-tip{display:none}}
    </style></head><body><header><h1>CarePrep AI</h1><p>${escapeHtml(title)} · Prepared ${escapeHtml(generatedOn)}</p></header><p class="print-tip">In the print window, choose “Save as PDF” as the destination to create your PDF copy.</p><main class="report-content">${renderMarkdown(content)}</main><div class="disclaimer">Educational appointment-preparation document only. This is not a diagnosis, prescription, or medical recommendation. Review the content and discuss personal medical concerns with a qualified healthcare professional. Avoid sharing identifying details.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;
  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
  reportWindow.focus();
}
$('#exportPdfSummary')?.addEventListener('click', () => printReport('Visit preparation report', currentSummaryRaw));


// Prescription Companion — source-guided medicine-label explanations.
let currentDailyMedSource = null;

function setPrescriptionSourceStatus(message, isError = false) {
  const status = $('#medicineSearchStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

$('#medicineNameInput')?.addEventListener('input', () => {
  currentDailyMedSource = null;
  const results = $('#medicineLabelResults');
  if (results) results.classList.add('hidden');
  setPrescriptionSourceStatus('Search results must be reselected if you change the medicine name.');
});

$('#searchMedicineButton')?.addEventListener('click', async () => {
  const query = $('#medicineNameInput').value.trim();
  if (query.length < 2) { showToast('Enter at least two characters of the medicine name.'); return; }
  const button = $('#searchMedicineButton');
  button.disabled = true;
  button.textContent = 'Searching...';
  setPrescriptionSourceStatus('Searching DailyMed for possible label matches...');
  try {
    const response = await fetch(`/api/prescription/search?q=${encodeURIComponent(query)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Medicine-label search failed.');
    const select = $('#medicineLabelSelect');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select the exact strength / manufacturer label';
    select.appendChild(placeholder);
    (data.labels || []).forEach((label, index) => {
      const option = document.createElement('option');
      option.value = label.setid;
      option.textContent = `${label.title} · ${label.published_date || 'Date not listed'}`;
      option.dataset.title = label.title;
      option.dataset.publishedDate = label.published_date || '';
      option.dataset.sourceUrl = label.source_url || '';
      select.appendChild(option);
    });
    $('#medicineLabelResults').classList.toggle('hidden', !(data.labels || []).length);
    if ((data.labels || []).length) {
      setPrescriptionSourceStatus(`${data.labels.length} possible label(s) found. Select the exact product, strength and manufacturer where possible.`);
    } else {
      setPrescriptionSourceStatus('No DailyMed matches were found. You can paste the exact text from your local package leaflet below.', true);
    }
  } catch (error) {
    setPrescriptionSourceStatus(error.message || 'Could not search medicine labels.', true);
    showToast(error.message || 'Could not search medicine labels.');
  } finally {
    button.disabled = false;
    button.textContent = 'Search label';
  }
});

$('#medicineLabelSelect')?.addEventListener('change', (event) => {
  const option = event.target.selectedOptions[0];
  currentDailyMedSource = option?.value ? {
    setid: option.value,
    title: option.dataset.title || option.textContent,
    published_date: option.dataset.publishedDate || '',
    source_url: option.dataset.sourceUrl || ''
  } : null;
  const meta = $('#selectedLabelMeta');
  if (!meta) return;
  meta.replaceChildren();
  if (!currentDailyMedSource) {
    meta.textContent = 'Choose the exact strength and manufacturer where shown.';
    return;
  }
  const text = document.createElement('span');
  text.textContent = `${currentDailyMedSource.title} · Published: ${currentDailyMedSource.published_date || 'not listed'}`;
  meta.appendChild(text);
  if (currentDailyMedSource.source_url) {
    const link = document.createElement('a');
    link.href = currentDailyMedSource.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open label';
    meta.append(' ', link);
  }
});

$('#prescriptionExplainForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#explainMedicineButton');
  const medicineName = $('#medicineNameInput').value.trim();
  const localLabelText = $('#localLeafletText').value.trim();
  const prescribedInstructions = $('#prescribedInstructionInput').value.trim();
  if (!medicineName) { showToast('Enter the medicine name first.'); return; }
  if (!currentDailyMedSource && localLabelText.length < 40) {
    showToast('Select a matching DailyMed label or paste at least 40 characters from your local leaflet.');
    return;
  }
  button.disabled = true;
  button.textContent = 'Reviewing source information...';
  try {
    const data = await postJson('/api/prescription/explain', {
      medicine_name: medicineName,
      strength: $('#medicineStrengthInput').value.trim(),
      prescribed_instructions: prescribedInstructions,
      local_label_text: localLabelText,
      setid: currentDailyMedSource?.setid || '',
      language: $('#prescriptionLanguage').value
    });
    currentMedicineExplanationRaw = data.response || '';
    currentMissedDoseSource = data.missed_dose_text || '';
    $('#medicineExplanationText').innerHTML = renderMarkdown(currentMedicineExplanationRaw);
    $('#medicineExplanationPlaceholder').classList.add('hidden');
    $('#medicineExplanationResult').classList.remove('hidden');
    const sourceContainer = $('#medicineExplanationSource');
    sourceContainer.replaceChildren();
    const sourceText = document.createElement('span');
    sourceText.textContent = data.source_title ? `Source label: ${data.source_title}. ` : 'Source: user-provided leaflet wording. ';
    sourceContainer.appendChild(sourceText);
    if (data.source_url && data.source_url.startsWith('https://dailymed.nlm.nih.gov/')) {
      const link = document.createElement('a');
      link.href = data.source_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View source label';
      sourceContainer.append(' ', link);
    } else {
      sourceContainer.append('This pasted text has not been independently verified.');
    }
    $('#missedDoseMedicineName').value = medicineName;
    if (currentMissedDoseSource) {
      $('#missedDoseSourceText').value = currentMissedDoseSource;
      setPrescriptionSourceStatus('The selected label includes a paragraph mentioning a missed dose. Review it carefully before asking for a plain-language explanation.');
    } else {
      $('#missedDoseSourceText').value = '';
      setPrescriptionSourceStatus('No explicit missed-dose paragraph was identified in this label. Use the exact instructions from your local leaflet or contact a pharmacist.');
    }
    showToast(data.mode === 'demo' ? 'Source selected · connect Groq for an AI explanation' : 'Source-based medicine explanation is ready. Review it with a pharmacist.');
  } catch (error) {
    showToast(error.message || 'Could not explain this medicine information.');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Explain this medicine information <span>→</span>';
  }
});

$('#copyMedicineExplanation')?.addEventListener('click', async () => {
  if (!currentMedicineExplanationRaw) return;
  try { await navigator.clipboard.writeText(currentMedicineExplanationRaw); showToast('Medicine explanation copied.'); }
  catch (_error) { showToast('Copy is unavailable in this browser.'); }
});
$('#saveMedicineExplanation')?.addEventListener('click', () => {
  if (!currentMedicineExplanationRaw) return;
  const name = ($('#medicineNameInput').value.trim() || 'Medicine information').slice(0, 55);
  saveLocalNote(`Medicine information — ${name}`, currentMedicineExplanationRaw);
});

$('#missedDoseForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#explainMissedDoseButton');
  const sourceText = $('#missedDoseSourceText').value.trim();
  button.disabled = true;
  button.textContent = 'Checking the wording...';
  try {
    const data = await postJson('/api/prescription/missed-dose', {
      medicine_name: $('#missedDoseMedicineName').value.trim(),
      source_text: sourceText,
      language: $('#missedDoseLanguage').value
    });
    $('#missedDoseOutput').innerHTML = renderMarkdown(data.response || 'No explanation was returned.');
    $('#missedDoseResult').classList.remove('hidden');
    showToast(data.mode === 'safe_fallback' ? 'No medicine-specific source text: safe guidance shown.' : 'Missed-dose wording explained. Confirm with a pharmacist if unsure.');
  } catch (error) {
    showToast(error.message || 'Could not explain the missed-dose wording.');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Explain these instructions <span>→</span>';
  }
});

// User-created daily reminders are stored only in this browser. They are
// best-effort alerts while the CarePrep page is open, not a background alarm.
function getMedicationReminders() {
  const reminders = safeReadStorage(STORAGE_KEYS.medicationReminders, []);
  return Array.isArray(reminders) ? reminders.filter((item) => item && item.id && item.medicine && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || '')) : [];
}

function renderMedicationReminders() {
  const container = $('#medicationRemindersList');
  if (!container) return;
  const reminders = getMedicationReminders().sort((a, b) => a.time.localeCompare(b.time));
  container.replaceChildren();
  if (!reminders.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('span'); icon.textContent = '◷';
    const heading = document.createElement('h3'); heading.textContent = 'No reminders yet';
    const paragraph = document.createElement('p'); paragraph.textContent = 'Add a time copied from your prescription schedule.';
    empty.append(icon, heading, paragraph);
    container.appendChild(empty);
    return;
  }
  reminders.forEach((reminder) => {
    const card = document.createElement('article');
    card.className = 'rx-reminder-card';
    const info = document.createElement('div');
    const medicine = document.createElement('strong'); medicine.textContent = reminder.medicine;
    const when = document.createElement('span');
    const [hours, minutes] = reminder.time.split(':').map(Number);
    const displayTime = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    when.textContent = `${displayTime} · Daily${reminder.note ? ` · ${reminder.note}` : ''}`;
    info.append(medicine, when);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'text-danger-button'; remove.textContent = 'Remove';
    remove.dataset.deleteMedicationReminder = reminder.id;
    card.append(info, remove);
    container.appendChild(card);
  });
}

$('#medicationReminderForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const medicine = $('#reminderMedicineName').value.trim();
  const time = $('#reminderTime').value;
  const note = $('#reminderTimingNote').value.trim();
  if (!medicine || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    showToast('Enter a medicine label and a valid reminder time.');
    return;
  }
  const reminders = getMedicationReminders();
  if (reminders.some((item) => item.medicine.toLowerCase() === medicine.toLowerCase() && item.time === time && item.note === note)) {
    showToast('That reminder already exists.');
    return;
  }
  reminders.push({
    id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    medicine,
    time,
    note,
    lastFiredDate: ''
  });
  if (!safeWriteStorage(STORAGE_KEYS.medicationReminders, reminders)) return;
  $('#medicationReminderForm').reset();
  renderMedicationReminders();
  showToast('Daily reminder saved in this browser. Keep this page open for alerts.');
});

$('#medicationRemindersList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-medication-reminder]');
  if (!button) return;
  const next = getMedicationReminders().filter((item) => item.id !== button.dataset.deleteMedicationReminder);
  safeWriteStorage(STORAGE_KEYS.medicationReminders, next);
  renderMedicationReminders();
  showToast('Reminder removed from this browser.');
});

$('#enableMedicationNotifications')?.addEventListener('click', async () => {
  const status = $('#medicationNotificationStatus');
  if (!('Notification' in window)) {
    status.textContent = 'Browser notifications are not supported here; in-page reminders may still appear while open.';
    showToast('Browser notifications are not supported in this browser.');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    status.textContent = permission === 'granted' ? 'Browser alerts enabled for this site.' : 'Notifications were not enabled. In-page alerts may still appear while open.';
    showToast(permission === 'granted' ? 'Browser notifications enabled.' : 'Notification permission was not granted.');
  } catch (_error) {
    status.textContent = 'Could not request browser notification permission.';
  }
});

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function checkMedicationReminders() {
  const reminders = getMedicationReminders();
  if (!reminders.length) return;
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = localDateKey(now);
  let changed = false;
  reminders.forEach((reminder) => {
    if (reminder.time !== currentTime || reminder.lastFiredDate === today) return;
    reminder.lastFiredDate = today;
    changed = true;
    const body = `${reminder.time}${reminder.note ? ` · ${reminder.note}` : ''}. This is the reminder time you selected. Follow your prescription instructions.`;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`CarePrep reminder · ${reminder.medicine}`, { body, tag: `careprep-${reminder.id}-${today}` }); }
      catch (_error) { showToast(`Reminder time: ${reminder.medicine}. Follow your prescription instructions.`); }
    } else {
      showToast(`Reminder time: ${reminder.medicine}. Follow your prescription instructions.`);
    }
  });
  if (changed) safeWriteStorage(STORAGE_KEYS.medicationReminders, reminders);
}

function startMedicationReminderChecks() {
  if (medicationReminderTimer) clearInterval(medicationReminderTimer);
  medicationReminderTimer = setInterval(checkMedicationReminders, 15000);
  checkMedicationReminders();
}

// Appointment checklist, saved locally in this browser.
const checklistItems = [
  { group: 'Before the appointment', items: [
    'Write down the main topic or concern I want to discuss.',
    'Note when I first noticed it and any changes I observed.',
    'Write down how it affects my usual activities.'
  ]},
  { group: 'Information to bring (if relevant)', items: [
    'Bring previous reports or test results I choose to discuss.',
    'Prepare a list of medicines or supplements I choose to mention.',
    'Make a note of allergies or past reactions I want to tell the clinician.',
    'Bring relevant medical or appointment documents, if available.'
  ]},
  { group: 'During and after the visit', items: [
    'Write down questions I do not want to forget.',
    'Ask the clinician to explain anything I do not understand.',
    'Clarify any follow-up instructions and whom to contact with questions.'
  ]}
];
const allChecklistLabels = checklistItems.flatMap((group) => group.items);
let checklistState = safeReadStorage(STORAGE_KEYS.checklist, {});
if (!checklistState || typeof checklistState !== 'object' || Array.isArray(checklistState)) checklistState = {};

function renderChecklist() {
  const container = $('#checklistGroups');
  if (!container) return;
  container.replaceChildren();
  let completed = 0;
  checklistItems.forEach((group, groupIndex) => {
    const section = document.createElement('section');
    section.className = 'checklist-group';
    const heading = document.createElement('h3');
    heading.textContent = group.group;
    section.appendChild(heading);
    group.items.forEach((label, itemIndex) => {
      const index = checklistItems.slice(0, groupIndex).reduce((sum, current) => sum + current.items.length, 0) + itemIndex;
      const row = document.createElement('label');
      row.className = `checklist-item${checklistState[index] ? ' is-checked' : ''}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(checklistState[index]);
      checkbox.addEventListener('change', () => {
        checklistState[index] = checkbox.checked;
        safeWriteStorage(STORAGE_KEYS.checklist, checklistState);
        renderChecklist();
      });
      const text = document.createElement('span');
      text.textContent = label;
      row.append(checkbox, text);
      section.appendChild(row);
      if (checklistState[index]) completed += 1;
    });
    container.appendChild(section);
  });
  const total = allChecklistLabels.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  $('#checklistProgressText').textContent = `${completed} of ${total} items completed`;
  $('#checklistProgressBar').style.width = `${percent}%`;
  $('#homeChecklistCount').textContent = `${percent}%`;
  renderDashboard();
}
$('#resetChecklist')?.addEventListener('click', () => {
  if (!window.confirm('Reset all appointment checklist items?')) return;
  checklistState = {};
  safeWriteStorage(STORAGE_KEYS.checklist, checklistState);
  renderChecklist();
  showToast('Checklist reset.');
});

// Private notes: localStorage only; no notes API exists on the Flask server.
function getNotes() {
  const notes = safeReadStorage(STORAGE_KEYS.notes, []);
  return Array.isArray(notes) ? notes.filter((note) => note && typeof note.title === 'string' && typeof note.content === 'string') : [];
}

function saveLocalNote(title, content) {
  const trimmedTitle = String(title || '').trim().slice(0, 100);
  const trimmedContent = String(content || '').trim().slice(0, 6000);
  if (!trimmedTitle || !trimmedContent) { showToast('Add a title and note content first.'); return false; }
  const notes = getNotes();
  const timestamp = new Date().toISOString();
  if (editingNoteId) {
    const index = notes.findIndex((note) => note.id === editingNoteId);
    if (index >= 0) {
      notes[index] = { ...notes[index], title: trimmedTitle, content: trimmedContent, updatedAt: timestamp };
    } else {
      notes.unshift({ id: makeId(), title: trimmedTitle, content: trimmedContent, createdAt: timestamp, updatedAt: timestamp });
    }
    editingNoteId = null;
  } else {
    notes.unshift({ id: makeId(), title: trimmedTitle, content: trimmedContent, createdAt: timestamp, updatedAt: timestamp });
  }
  if (!safeWriteStorage(STORAGE_KEYS.notes, notes.slice(0, 40))) return false;
  $('#noteForm')?.reset();
  $('#noteEditorTitle').textContent = 'Create a note';
  $('#saveNoteButton').innerHTML = 'Save note <span>→</span>';
  $('#cancelEditNote').classList.add('hidden');
  renderNotes();
  showToast('Note saved on this browser.');
  return true;
}

function makeId() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderNotes() {
  const notes = getNotes();
  const query = ($('#notesSearch')?.value || '').trim().toLowerCase();
  const visible = notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(query));
  const list = $('#notesList');
  if (!list) return;
  list.replaceChildren();
  $('#notesCount').textContent = String(notes.length);
  $('#notesNavCount').textContent = String(notes.length);
  $('#homeNotesCount').textContent = String(notes.length);

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const icon = document.createElement('span'); icon.textContent = '▧';
    const heading = document.createElement('h3'); heading.textContent = query ? 'No matching notes' : 'No notes saved yet';
    const paragraph = document.createElement('p'); paragraph.textContent = query ? 'Try another search term.' : 'Save a visit note or create a new note to see it here.';
    empty.append(icon, heading, paragraph);
    list.appendChild(empty);
    renderDashboard();
    return;
  }

  visible.forEach((note) => {
    const card = document.createElement('article');
    card.className = 'saved-note-card';
    const top = document.createElement('div'); top.className = 'saved-note-top';
    const heading = document.createElement('h3'); heading.textContent = note.title;
    const date = document.createElement('time');
    const dateValue = new Date(note.updatedAt || note.createdAt || Date.now());
    date.textContent = Number.isNaN(dateValue.getTime()) ? '' : dateValue.toLocaleDateString();
    top.append(heading, date);
    const preview = document.createElement('p');
    preview.textContent = note.content.replace(/\s+/g, ' ').slice(0, 180);
    const actions = document.createElement('div'); actions.className = 'saved-note-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary-button'; edit.textContent = 'Edit'; edit.dataset.editNote = note.id;
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'secondary-button'; copy.textContent = 'Copy'; copy.dataset.copyNote = note.id;
    const download = document.createElement('button'); download.type = 'button'; download.className = 'secondary-button'; download.textContent = 'Download'; download.dataset.downloadNote = note.id;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-danger-button'; remove.textContent = 'Delete'; remove.dataset.deleteNote = note.id;
    actions.append(edit, copy, download, remove);
    card.append(top, preview, actions);
    list.appendChild(card);
  });
  renderDashboard();
}

function renderDashboardCalendar() {
  const now = new Date();
  const dateFull = $('#dashboardDateFull');
  const month = $('#dashboardMonth');
  const dayNumber = $('#dashboardDayNumber');
  const dayName = $('#dashboardDayName');
  const calendar = $('#dashboardCalendarWeek');
  if (dateFull) dateFull.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  if (month) month.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(now).toUpperCase();
  if (dayNumber) dayNumber.textContent = String(now.getDate());
  if (dayName) dayName.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);
  if (!calendar) return;

  calendar.replaceChildren();
  const start = new Date(now);
  const mondayOffset = (now.getDay() + 6) % 7;
  start.setDate(now.getDate() - mondayOffset);
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const day = document.createElement('div');
    day.className = `rail-calendar-day${date.toDateString() === now.toDateString() ? ' is-today' : ''}`;
    const weekday = document.createElement('span');
    weekday.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
    const number = document.createElement('strong');
    number.textContent = String(date.getDate());
    day.append(weekday, number);
    calendar.appendChild(day);
  }
}

function renderDashboard() {
  const notes = getNotes();
  const total = allChecklistLabels.length;
  const completed = allChecklistLabels.reduce((sum, _label, index) => sum + (checklistState[index] ? 1 : 0), 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const ring = $('#dashboardProgressRing');
  if (ring) ring.style.setProperty('--progress-angle', `${percent * 3.6}deg`);
  const progressValue = $('#dashboardProgressValue');
  if (progressValue) progressValue.textContent = `${percent}%`;
  const progressSummary = $('#dashboardProgressSummary');
  if (progressSummary) progressSummary.textContent = `${completed} of ${total} steps completed`;
  const railPercent = $('#dashboardRailPercent');
  if (railPercent) railPercent.textContent = `${percent}%`;
  const railBar = $('#dashboardRailProgress');
  if (railBar) railBar.style.width = `${percent}%`;
  const railSummary = $('#dashboardRailSummary');
  if (railSummary) railSummary.textContent = `${completed} of ${total} items completed`;

  const groupContainer = $('#dashboardGroupBars');
  if (groupContainer) {
    groupContainer.replaceChildren();
    let offset = 0;
    checklistItems.forEach((group) => {
      const groupTotal = group.items.length;
      let groupCompleted = 0;
      for (let index = offset; index < offset + groupTotal; index += 1) {
        if (checklistState[index]) groupCompleted += 1;
      }
      offset += groupTotal;
      const row = document.createElement('div');
      row.className = 'dashboard-group-row';
      const label = document.createElement('span');
      label.textContent = group.group.replace(' (if relevant)', '');
      const track = document.createElement('div');
      track.className = 'dashboard-group-track';
      const fill = document.createElement('span');
      fill.style.width = `${groupTotal ? (groupCompleted / groupTotal) * 100 : 0}%`;
      track.appendChild(fill);
      const count = document.createElement('strong');
      count.textContent = `${groupCompleted}/${groupTotal}`;
      row.append(label, track, count);
      groupContainer.appendChild(row);
    });
  }

  const recentContainer = $('#dashboardRecentNotes');
  if (recentContainer) {
    recentContainer.replaceChildren();
    const recent = notes.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)).slice(0, 4);
    if (!recent.length) {
      const empty = document.createElement('div');
      empty.className = 'dashboard-empty-notes';
      empty.textContent = 'No notes saved yet. Create a visit note or add a personal reminder to see it here.';
      recentContainer.appendChild(empty);
    } else {
      recent.forEach((note) => {
        const card = document.createElement('article');
        card.className = 'dashboard-note-mini';
        const icon = document.createElement('span'); icon.textContent = '▤';
        const content = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = note.title;
        const date = document.createElement('small');
        const parsed = new Date(note.updatedAt || note.createdAt || Date.now());
        date.textContent = Number.isNaN(parsed.getTime()) ? 'Saved on this browser' : `Updated ${parsed.toLocaleDateString()}`;
        content.append(title, date);
        card.append(icon, content);
        recentContainer.appendChild(card);
      });
    }
  }
  renderDashboardCalendar();
}

$('#noteForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  saveLocalNote($('#noteTitle').value, $('#noteBody').value);
});
$('#cancelEditNote')?.addEventListener('click', () => {
  editingNoteId = null;
  $('#noteForm').reset();
  $('#noteEditorTitle').textContent = 'Create a note';
  $('#saveNoteButton').innerHTML = 'Save note <span>→</span>';
  $('#cancelEditNote').classList.add('hidden');
});
$('#notesSearch')?.addEventListener('input', renderNotes);
$('#notesList')?.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const notes = getNotes();
  const note = notes.find((item) => item.id === (button.dataset.editNote || button.dataset.copyNote || button.dataset.downloadNote || button.dataset.deleteNote));
  if (!note) return;
  if (button.dataset.editNote) {
    editingNoteId = note.id;
    $('#noteTitle').value = note.title;
    $('#noteBody').value = note.content;
    $('#noteEditorTitle').textContent = 'Edit note';
    $('#saveNoteButton').innerHTML = 'Update note <span>→</span>';
    $('#cancelEditNote').classList.remove('hidden');
    $('#noteTitle').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (button.dataset.copyNote) {
    try { await navigator.clipboard.writeText(note.content); showToast('Note copied.'); }
    catch (_error) { showToast('Copy is unavailable in this browser.'); }
  } else if (button.dataset.downloadNote) {
    downloadTextFile('careprep-note.txt', `${note.title}\n\n${note.content}`);
  } else if (button.dataset.deleteNote) {
    if (!window.confirm(`Delete "${note.title}"?`)) return;
    safeWriteStorage(STORAGE_KEYS.notes, notes.filter((item) => item.id !== note.id));
    if (editingNoteId === note.id) $('#cancelEditNote').click();
    renderNotes();
    showToast('Note deleted from this browser.');
  }
});
$('#deleteAllNotes')?.addEventListener('click', () => {
  if (!getNotes().length) { showToast('There are no saved notes.'); return; }
  if (!window.confirm('Delete all notes saved by CarePrep AI in this browser? This cannot be undone.')) return;
  safeWriteStorage(STORAGE_KEYS.notes, []);
  editingNoteId = null;
  $('#noteForm').reset();
  $('#noteEditorTitle').textContent = 'Create a note';
  $('#saveNoteButton').innerHTML = 'Save note <span>→</span>';
  $('#cancelEditNote').classList.add('hidden');
  renderNotes();
  showToast('All CarePrep AI notes deleted from this browser.');
});

// Initial local widgets and connectivity status.
renderChecklist();
renderNotes();
renderDashboard();
renderMedicationReminders();
startMedicationReminderChecks();
refreshStatus();
