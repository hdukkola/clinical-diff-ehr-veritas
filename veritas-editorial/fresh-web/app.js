'use strict';

const BASE = 'http://127.0.0.1:8765';
const HEALTH_URL = BASE + '/health';
const COMPARE_URL = BASE + '/compare';

const FIXTURE_EARLIER_ID = 'fixture-earlier';
const FIXTURE_LATER_ID = 'fixture-later';
const FIXTURE_EARLIER_TEXT = 'Fictional outpatient medication list for a demo patient. The note explicitly lists Lisinopril, Metformin, and Aspirin.';
const FIXTURE_LATER_TEXT = 'Fictional discharge medication list for a demo patient. The note explicitly lists Lisinopril, Metformin, and Atorvastatin.';

const LIVE_DEFAULT_EARLIER_ID = 'note-a';
const LIVE_DEFAULT_LATER_ID = 'note-b';
const LIVE_DEFAULT_EARLIER_TEXT = 'Fictional outpatient note (note-a). The note lists Lisinopril and Metformin.';
const LIVE_DEFAULT_LATER_TEXT = 'Fictional discharge note (note-b). The note lists Lisinopril, Metformin, and Atorvastatin.';

const els = {
  shell: document.getElementById('shell'),
  navToggle: document.getElementById('navToggle'),
  sidebar: document.getElementById('sidebar'),
  healthStatus: document.getElementById('healthStatus'),
  healthMode: document.getElementById('healthMode'),
  healthRefresh: document.getElementById('healthRefresh'),
  replayBanner: document.getElementById('replayBanner'),
  statusStrip: document.getElementById('statusStrip'),
  btnCompare: document.getElementById('btnCompare'),
  btnClear: document.getElementById('btnClear'),
  btnRetry: document.getElementById('btnRetry'),
  txtEarlier: document.getElementById('txtEarlier'),
  txtLater: document.getElementById('txtLater'),
  countEarlier: document.getElementById('countEarlier'),
  countLater: document.getElementById('countLater'),
  srcEarlier: document.getElementById('srcEarlier'),
  srcLater: document.getElementById('srcLater'),
  panelEarlier: document.getElementById('panelEarlier'),
  panelLater: document.getElementById('panelLater'),
  results: document.getElementById('results'),
  errorBanner: document.getElementById('errorBanner'),
  errorMessage: document.getElementById('errorMessage'),
  alertDisclaimer: document.getElementById('alertDisclaimer'),
  alertLimitations: document.getElementById('alertLimitations'),
  evEarlier: document.getElementById('evEarlier'),
  evLater: document.getElementById('evLater'),
  diffList: document.getElementById('diffList'),
  emptyResults: document.getElementById('emptyResults'),
  unsupPanel: document.getElementById('panelUnsupported'),
  unsupList: document.getElementById('unsupList'),
  reviewPanel: document.getElementById('panelReview'),
  reviewList: document.getElementById('reviewList'),
};

let state = {
  mode: null,
  simulated: false,
  liveAi: false,
  notice: '',
  earlierText: '',
  laterText: '',
  earlierId: '',
  laterId: '',
  notesLocked: false,
  results: null,
  reviewFlags: new Map(),
  loading: false,
};

function escapeAttr(v) { return String(v).replace(/"/g, '&quot;'); }

// UTF-16 index from a Python Unicode code-point index. Backend offsets are
// Python code-point indices (end exclusive); JavaScript strings are UTF-16,
// so non-BMP characters must be converted before slicing.
function utf16IndexFromCodePoint(text, cpIndex) {
  if (cpIndex <= 0) return 0;
  if (cpIndex >= codePointLength(text)) return text.length;
  let cp = 0;
  let i = 0;
  while (i < text.length && cp < cpIndex) {
    i += text.codePointAt(i) > 0xFFFF ? 2 : 1;
    cp += 1;
  }
  return i;
}

function codePointLength(text) {
  let n = 0;
  for (const ch of text) n += 1;
  return n;
}

function setStatus(text, kind) {
  const strip = els.statusStrip;
  strip.textContent = text;
  strip.className = 'status-strip' + (kind ? ' status--' + kind : '');
}

function setLoading(loading) {
  state.loading = loading;
  els.btnCompare.disabled = loading || !state.mode;
  els.txtEarlier.disabled = loading || state.notesLocked;
  els.txtLater.disabled = loading || state.notesLocked;
  els.btnCompare.textContent = loading ? 'Comparing…' : 'Compare notes';
  if (loading) setStatus('Comparing notes…');
}

function htmlEscape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function evidenceNodes(sourceText, start, end) {
  const frag = document.createDocumentFragment();
  const us = utf16IndexFromCodePoint(sourceText, start);
  const ue = utf16IndexFromCodePoint(sourceText, end);
  const before = sourceText.slice(0, us);
  const evidence = sourceText.slice(us, ue);
  const after = sourceText.slice(ue);
  if (before) frag.appendChild(document.createTextNode(before));
  const mark = document.createElement('mark');
  mark.textContent = evidence;
  mark.title = 'Code-point offsets [' + start + ', ' + end + ') — end exclusive';
  frag.appendChild(mark);
  if (after) frag.appendChild(document.createTextNode(after));
  return frag;
}

function renderSourceMentions(container, sourceText, mentions) {
  container.textContent = '';
  if (!mentions || mentions.length === 0) {
    const p = document.createElement('p');
    p.className = 'evidence-item';
    p.textContent = 'No supported mentions extracted.';
    container.appendChild(p);
    return;
  }
  for (const m of mentions) {
    const item = document.createElement('div');
    item.className = 'evidence-item';
    const name = document.createElement('div');
    name.className = 'evidence-name';
    name.textContent = m.name;
    const quote = document.createElement('div');
    quote.className = 'evidence-quote';
    quote.appendChild(evidenceNodes(sourceText, m.start, m.end));
    const meta = document.createElement('div');
    meta.className = 'evidence-meta';
    meta.textContent = 'Source ' + htmlEscape(String(m.source_id)) + '  ·  code-point offsets [' + m.start + ', ' + m.end + ')';
    item.appendChild(name);
    item.appendChild(quote);
    item.appendChild(meta);
    container.appendChild(item);
  }
}

function renderError(message) {
  els.results.classList.add('hidden');
  els.emptyResults.classList.add('hidden');
  els.errorBanner.classList.remove('hidden');
  els.errorMessage.textContent = message;
  setStatus('Request failed', 'error');
}

function clearError() {
  els.errorBanner.classList.add('hidden');
  els.errorMessage.textContent = '';
}

function clearResults() {
  state.results = null;
  state.reviewFlags.clear();
  els.results.classList.add('hidden');
  els.emptyResults.classList.add('hidden');
  els.diffList.textContent = '';
  els.evEarlier.textContent = '';
  els.evLater.textContent = '';
  els.unsupList.textContent = '';
  els.unsupPanel.classList.add('hidden');
  els.reviewPanel.classList.add('hidden');
  els.alertLimitations.classList.add('hidden');
  clearError();
  setStatus('Results cleared');
}

function buildPayload() {
  const payload = { synthetic_only: true };
  if (state.simulated) {
    // Replay accepts only the exact fixed fixture payload.
    payload.earlier = { source_id: FIXTURE_EARLIER_ID, text: FIXTURE_EARLIER_TEXT };
    payload.later = { source_id: FIXTURE_LATER_ID, text: FIXTURE_LATER_TEXT };
  } else {
    payload.earlier = { source_id: state.earlierId, text: state.earlierText };
    payload.later = { source_id: state.laterId, text: state.laterText };
  }
  return payload;
}

function renderResults(data) {
  clearError();
  state.results = data;

  const disclaimer = data.disclaimer || 'Synthetic prototype only; differences are not confirmed errors or medical advice.';
  els.alertDisclaimer.textContent = disclaimer;

  const limitations = Array.isArray(data.limitations) ? data.limitations : [];
  if (limitations.length) {
    els.alertLimitations.classList.remove('hidden');
    const ul = document.createElement('ul');
    for (const lim of limitations) {
      const li = document.createElement('li');
      li.textContent = lim;
      ul.appendChild(li);
    }
    // replace existing list
    const existing = els.alertLimitations.querySelector('ul');
    if (existing) existing.replaceWith(ul);
    else els.alertLimitations.appendChild(ul);
  }

  const earlier = data.earlier || {};
  const later = data.later || {};
  state.earlierText = earlier.text || state.earlierText;
  state.laterText = later.text || state.laterText;

  renderSourceMentions(els.evEarlier, state.earlierText, earlier.mentions);
  renderSourceMentions(els.evLater, state.laterText, later.mentions);

  const earlierUnsup = Array.isArray(earlier.unsupported_outputs) ? earlier.unsupported_outputs : [];
  const laterUnsup = Array.isArray(later.unsupported_outputs) ? later.unsupported_outputs : [];
  const allUnsup = earlierUnsup.concat(laterUnsup);
  if (allUnsup.length) {
    els.unsupPanel.classList.remove('hidden');
    els.unsupList.textContent = '';
    for (const name of allUnsup) {
      const item = document.createElement('div');
      item.className = 'evidence-item';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'evidence-name';
      nameDiv.textContent = name;
      const note = document.createElement('div');
      note.className = 'evidence-quote';
      note.textContent = 'Not found literally in its source; listed as unsupported, not promoted to a mention.';
      item.appendChild(nameDiv);
      item.appendChild(note);
      els.unsupList.appendChild(item);
    }
  } else {
    els.unsupPanel.classList.add('hidden');
  }

  const differences = Array.isArray(data.differences) ? data.differences : [];
  els.results.classList.remove('hidden');
  els.emptyResults.classList.add('hidden');
  els.diffList.textContent = '';
  els.reviewList.textContent = '';
  els.reviewPanel.classList.add('hidden');

  if (differences.length === 0) {
    els.emptyResults.classList.remove('hidden');
    setStatus('Comparison complete — no extracted differences; review both notes', 'ok');
  } else {
    for (let i = 0; i < differences.length; i += 1) {
      const d = differences[i];
      const item = document.createElement('div');
      item.className = 'diff-item';

      const kind = document.createElement('span');
      kind.className = 'diff-kind kind--' + (d.kind === 'earlier_only' ? 'earlier_only' : 'later_only');
      kind.textContent = d.kind === 'earlier_only' ? 'Earlier only' : 'Later only';

      const body = document.createElement('div');
      body.className = 'diff-body';

      const name = document.createElement('div');
      name.className = 'diff-name';
      name.textContent = d.name || '(no name)';

      const evidence = d.evidence && d.evidence.length ? d.evidence[0] : null;
      const quote = document.createElement('div');
      quote.className = 'diff-evidence';
      if (evidence) {
        const sourceText = evidence.source_id === state.laterId ? state.laterText : state.earlierText;
        const start = typeof evidence.start === 'number' ? evidence.start : 0;
        const end = typeof evidence.end === 'number' ? evidence.end : 0;
        const frag = document.createDocumentFragment();
        const label = document.createTextNode('Quoted evidence: ');
        frag.appendChild(label);
        frag.appendChild(evidenceNodes(sourceText, start, end));
        const offs = document.createTextNode('  ·  code-point offsets [' + start + ', ' + end + ')');
        frag.appendChild(offs);
        quote.appendChild(frag);
      } else {
        quote.textContent = 'No quoted evidence returned by the extractor.';
      }

      const label = document.createElement('label');
      label.className = 'review-flag';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', 'Temporarily flag "' + htmlEscape(String(d.name)) + '" for review (this session only)');
      cb.checked = state.reviewFlags.has(i);
      cb.addEventListener('change', function () {
        if (cb.checked) state.reviewFlags.set(i, true); else state.reviewFlags.delete(i);
      });
      const cbText = document.createTextNode(' Flag for temporary review (this session only, not an order or audit entry)');
      label.appendChild(cb);
      label.appendChild(cbText);

      body.appendChild(name);
      body.appendChild(quote);
      body.appendChild(label);
      item.appendChild(kind);
      item.appendChild(body);
      els.diffList.appendChild(item);
    }
    els.reviewPanel.classList.remove('hidden');
    setStatus('Comparison complete — ' + differences.length + ' difference(s)', 'ok');
  }

  // Announce results to assistive tech via focus.
  const title = document.getElementById('resultsTitle');
  if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
}

async function fetchJson(url, init) {
  const resp = await fetch(url, init);
  let body = null;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { body = await resp.json(); } catch (e) { body = { error: 'Invalid JSON response.' }; }
  }
  return { ok: resp.ok, status: resp.status, body };
}

async function loadHealth() {
  setStatus('Checking backend…');
  try {
    const r = await fetchJson(HEALTH_URL, { credentials: 'omit' });
    if (!r.ok) throw new Error('Backend returned HTTP ' + r.status + ': ' + (r.body && r.body.error ? r.body.error : ''));
    const h = r.body || {};
    if (!((h.mode === 'deterministic_replay' && h.simulated === true && h.live_ai === false) || (h.mode === 'local_mlx' && h.simulated === false && h.live_ai === true))) throw new Error('Unknown or inconsistent backend mode.');
    const previousMode = state.mode;
    state.mode = h.mode;
    state.simulated = h.simulated === true;
    state.liveAi = h.live_ai === true;
    state.notice = h.notice || '';
    els.healthStatus.textContent = (h.status || 'ready') + (state.simulated ? ' (simulated)' : '');
    els.healthMode.textContent = state.mode || '—';
    els.healthStatus.className = 'health-value' + (state.simulated ? ' status--simulated' : '');
    if (previousMode && previousMode !== state.mode) { clearResults(); els.txtEarlier.value = ''; els.txtLater.value = ''; }
    applyMode();
    clearError();
    setStatus(state.simulated ? 'Ready · simulated fixed-fixture replay' : 'Ready · local model configured', 'ok');
  } catch (err) {
    state.mode = null;
    state.simulated = false;
    state.liveAi = false;
    els.btnCompare.disabled = true;
    els.healthStatus.textContent = 'Inaccessible';
    els.healthMode.textContent = '—';
    els.healthStatus.className = 'health-value';
    setStatus('Backend inaccessible on 127.0.0.1:8765', 'error');
    renderError('Cannot reach the backend at ' + HEALTH_URL + '. ' + (err.message || 'Check that the backend is running and allowed by CORS (fresh-backend/README.md).') + ' Start it per fresh-backend/README.md, then click Retry. Review source records manually; no data is shown while the backend fails.');
  }
}

function applyMode() {
  const locked = state.simulated || state.mode === 'deterministic_replay';
  state.notesLocked = locked;

  els.replayBanner.classList.toggle('hidden', !state.simulated);
  if (state.simulated) {
    els.txtEarlier.disabled = true;
    els.txtLater.disabled = true;
    els.txtEarlier.value = FIXTURE_EARLIER_TEXT;
    els.txtLater.value = FIXTURE_LATER_TEXT;
    els.srcEarlier.textContent = FIXTURE_EARLIER_ID;
    els.srcLater.textContent = FIXTURE_LATER_ID;
    state.earlierId = FIXTURE_EARLIER_ID;
    state.laterId = FIXTURE_LATER_ID;
    state.earlierText = FIXTURE_EARLIER_TEXT;
    state.laterText = FIXTURE_LATER_TEXT;
    els.countEarlier.textContent = String(FIXTURE_EARLIER_TEXT.length);
    els.countLater.textContent = String(FIXTURE_LATER_TEXT.length);
  } else {
    els.txtEarlier.disabled = false;
    els.txtLater.disabled = false;
    if (!els.txtEarlier.value) {
      els.txtEarlier.value = LIVE_DEFAULT_EARLIER_TEXT;
      state.earlierText = LIVE_DEFAULT_EARLIER_TEXT;
      els.countEarlier.textContent = String(LIVE_DEFAULT_EARLIER_TEXT.length);
    }
    if (!els.txtLater.value) {
      els.txtLater.value = LIVE_DEFAULT_LATER_TEXT;
      state.laterText = LIVE_DEFAULT_LATER_TEXT;
      els.countLater.textContent = String(LIVE_DEFAULT_LATER_TEXT.length);
    }
    els.srcEarlier.textContent = LIVE_DEFAULT_EARLIER_ID;
    els.srcLater.textContent = LIVE_DEFAULT_LATER_ID;
    state.earlierId = LIVE_DEFAULT_EARLIER_ID;
    state.laterId = LIVE_DEFAULT_LATER_ID;
  }
  els.btnCompare.disabled = state.loading || !state.mode;
}

function wireInputs() {
  for (const side of ['Earlier', 'Later']) {
    const txt = els['txt' + side];
    const count = els['count' + side];
    txt.addEventListener('input', function () {
      clearResults();
      const value = txt.value;
      if (side === 'Earlier') { state.earlierText = value; els.countEarlier.textContent = String(value.length); }
      else { state.laterText = value; els.countLater.textContent = String(value.length); }
    });
  }
}

async function compareNotes() {
  if (state.loading) return;
  if (!state.mode) {
    renderError('Backend mode unknown. Refresh the backend status, then retry.');
    return;
  }
  clearResults();
  setLoading(true);
  try {
    const payload = buildPayload();
    const r = await fetchJson(COMPARE_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const msg = (r.body && r.body.error) || 'Backend returned HTTP ' + r.status;
      throw new Error(msg + '. Review the source records manually.');
    }
    const data = r.body;
    if (!data || !data.earlier || !data.later || !Array.isArray(data.earlier.mentions) || !Array.isArray(data.later.mentions) || !Array.isArray(data.differences)) throw new Error('Invalid comparison response; review source records manually.');
    if (state.simulated && !(data.mode === 'deterministic_replay' && data.simulated === true && data.live_ai === false)) throw new Error('Replay response was not correctly labeled.');
    if (!state.simulated && (data.simulated === true || data.mode === 'deterministic_replay')) throw new Error('Backend mode changed; refresh status and retry.');
    renderResults(data);
  } catch (err) {
    renderError((err && err.message) || 'Comparison failed. Confirm the backend is running on 127.0.0.1:8765, then click Retry. No data is shown while the backend fails.');
  } finally {
    setLoading(false);
  }
}

function init() {
  wireInputs();
  els.navToggle.addEventListener('click', function () {
    const expanded = els.navToggle.getAttribute('aria-expanded') === 'true';
    els.navToggle.setAttribute('aria-expanded', String(!expanded));
    els.shell.classList.toggle('sidebar-open', !expanded);
  });
  els.healthRefresh.addEventListener('click', loadHealth);
  els.btnCompare.addEventListener('click', compareNotes);
  els.btnClear.addEventListener('click', clearResults);
  els.btnRetry.addEventListener('click', function () { clearError(); loadHealth(); });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { clearResults(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); compareNotes(); }
  });

  loadHealth();
}

init();
