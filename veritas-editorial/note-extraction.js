"use strict";

function createNoteWorkspace({ onService, onComparison, onReview, onExportFollowUps }) {
  const workspace = document.createElement("section");
  workspace.className = "extract-workspace";
  workspace.innerHTML = `
    <header class="extract-hero">
      <h1 class="h1" tabindex="-1">Discharge medication review</h1>
    </header>
    <div class="extract-shell">
      <div class="extract-status">
        <p id="extraction-status" role="status">Checking the local service…</p>
        <button type="button" class="btn quiet" id="extraction-retry">Check service</button>
      </div>
      <form id="extraction-form" aria-describedby="extraction-status">
        <div class="extract-note-grid">
          <div class="extract-note">
            <label for="earlier-note">Earlier note</label>
            <textarea id="earlier-note" rows="5" placeholder="Enter fictional note text" aria-describedby="earlier-count" required disabled></textarea>
            <small id="earlier-count"></small>
          </div>
          <div class="extract-note">
            <label for="later-note">Later note</label>
            <textarea id="later-note" rows="5" placeholder="Enter fictional note text" aria-describedby="later-count" required disabled></textarea>
            <small id="later-count"></small>
          </div>
        </div>
        <div class="extract-actions">
          <button class="btn primary" type="submit" disabled>Compare notes</button>
          <button class="btn quiet" type="button" id="extraction-example" hidden>Load example</button>
          <button class="btn quiet" type="button" id="extraction-reset" hidden>Clear notes</button>
        </div>
      </form>
      <p id="extraction-error" role="alert"></p>
    </div>
    <section id="extraction-result" aria-labelledby="extraction-result-title" hidden></section>
    <p class="extract-scope">Fictional notes only. Review both sources before interpreting a difference.</p>`;

  const form = workspace.querySelector("form");
  const fields = [...form.querySelectorAll("textarea")];
  const submit = form.querySelector("button");
  const retry = workspace.querySelector("#extraction-retry");
  const example = workspace.querySelector("#extraction-example");
  const reset = workspace.querySelector("#extraction-reset");
  const counts = [...form.querySelectorAll("small")];
  const status = workspace.querySelector("#extraction-status");
  const error = workspace.querySelector("#extraction-error");
  const result = workspace.querySelector("#extraction-result");
  const sample = [
    "Fictional outpatient note. The medication list includes Lisinopril and Aspirin.",
    "Fictional discharge note. The medication list includes Lisinopril and Atorvastatin."
  ];
  const liveDraft = [...sample];
  let health = null;
  let busy = false;

  function refreshControls() {
    retry.disabled = busy;
    submit.disabled = busy || !health;
    example.hidden = reset.hidden = !health || health.simulated;
    example.disabled = reset.disabled = busy;
    for (const input of fields) {
      input.disabled = busy || !health;
      input.readOnly = health?.simulated === true;
    }
  }

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  function showNotes(texts) {
    fields.forEach((input, index) => {
      input.value = texts[index];
      updateCount(input, index);
    });
  }

  function updateCount(input, index) {
    const length = Array.from(input.value).length;
    counts[index].hidden = health?.simulated === true;
    counts[index].textContent = length > 10000 ? `${length.toLocaleString()} / 12,000 characters` : "";
  }

  async function request(path, options, timeout) {
    let response;
    try {
      response = await fetch(path, { ...options, signal: AbortSignal.timeout(timeout), cache: "no-store" });
    } catch (failure) {
      throw new Error(failure.name === "TimeoutError"
        ? "The local service did not respond in time. Try again."
        : "The local service is unreachable. Start the editorial server and use Check service.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || `The local service returned HTTP ${response.status}.`);
    }
    if (!body || typeof body !== "object") throw new Error("The local service returned invalid data.");
    return body;
  }

  function clearResult() {
    result.replaceChildren();
    result.hidden = true;
    error.textContent = "";
  }

  function modeLabel(mode) {
    return mode === "deterministic_replay" ? "Simulated replay · fixed fictional notes" : "Local model · editable fictional notes";
  }

  async function checkService() {
    if (busy) return;
    busy = true;
    refreshControls();
    clearResult();
    setStatus("Checking the local service…", "checking");
    try {
      const next = await request("/health", {}, 5000);
      if (!isValidHealth(next)) {
        throw new Error("The local service sent an unsupported mode or fixture.");
      }
      health = next;
      onService(next.mode);
      const texts = next.simulated ? [next.fixture.earlier.text, next.fixture.later.text] : liveDraft;
      showNotes(texts);
      setStatus(modeLabel(next.mode), next.simulated ? "replay" : "live");
    } catch (failure) {
      health = null;
      onService("unavailable");
      setStatus("Service unavailable", "error");
      error.textContent = failure.message;
    } finally {
      busy = false;
      refreshControls();
    }
  }

  fields.forEach((input, index) => input.addEventListener("input", () => {
    if (!health?.simulated) liveDraft[index] = input.value;
    updateCount(input, index);
    clearResult();
    if (health) setStatus(modeLabel(health.mode), health.simulated ? "replay" : "live");
  }));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!health || busy) return;
    clearResult();
    const payload = health.simulated ? health.fixture : {
      synthetic_only: true,
      earlier: { source_id: "earlier-note", text: fields[0].value },
      later: { source_id: "later-note", text: fields[1].value }
    };
    if (fields.some(input => !hasVisibleText(input.value) || Array.from(input.value).length > 12000)) {
      error.textContent = "Each note needs between 1 and 12,000 characters of fictional text.";
      return;
    }
    busy = true;
    refreshControls();
    setStatus(health.simulated ? "Running simulated replay…" :
      "Comparing with the local model… The first run may take longer.", "checking");
    try {
      const data = await request("/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, 180000);
      if (!hasValidMode(data) || data.mode !== health.mode) {
        throw new Error("The service mode changed. Use Check service before comparing again.");
      }
      const diffCount = renderExtractionResult(result, data, payload, onReview, onExportFollowUps);
      setStatus(modeLabel(data.mode), data.simulated ? "replay" : "live");
      onComparison(data.mode, diffCount);
      if (workspace.isConnected) result.querySelector("h2").focus();
    } catch (failure) {
      setStatus(`${modeLabel(health.mode)} · comparison failed`, "error");
      error.textContent = failure.message;
    } finally {
      busy = false;
      refreshControls();
    }
  });
  function replaceDraft(texts) {
    if (!health || health.simulated) return;
    liveDraft.splice(0, liveDraft.length, ...texts);
    showNotes(liveDraft);
    clearResult();
    setStatus(modeLabel(health.mode), "live");
    fields[0].focus();
  }
  example.addEventListener("click", () => replaceDraft(sample));
  reset.addEventListener("click", () => replaceDraft(["", ""]));
  retry.addEventListener("click", checkService);
  checkService();
  return workspace;
}

const WORD_CHAR_RE = /[\p{L}\p{N}\p{M}_\-\u2010\u2011]/u;
const CONCAT_DOSE_RE = /^\d+(?:\.\d+)?(?:mg|mcg|ug|g|ml|iu|meq|mmol|units?|u)(?![a-zA-Z0-9_-])/i;

function stripInvisible(text) {
  return text.replace(/^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu, "");
}

function hasVisibleText(text) {
  return typeof text === "string" && text.replace(/[\s\p{Cf}]/gu, "").length > 0;
}

function normalizeName(name) {
  return stripInvisible(name)
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .replace(/[\u0130\u0131]/g, "i")
    .toLowerCase();
}

function normalizeSourceId(sourceId) {
  return stripInvisible(sourceId).normalize("NFC");
}

function isValidHealth(next) {
  if (!next || typeof next !== "object" || next.status !== "ready" || !hasValidMode(next)) {
    return false;
  }
  if (!next.simulated) return true;
  if (!next.fixture || typeof next.fixture !== "object" || next.fixture.synthetic_only !== true) {
    return false;
  }
  const validSides = ["earlier", "later"].every(side => {
    const entry = next.fixture[side];
    return entry && typeof entry === "object" &&
      typeof entry.text === "string" && hasVisibleText(entry.text) &&
      Array.from(entry.text).length <= 12000 &&
      typeof entry.source_id === "string" && hasVisibleText(entry.source_id) &&
      Array.from(entry.source_id).length <= 100;
  });
  if (!validSides) return false;
  return normalizeSourceId(next.fixture.earlier.source_id) !== normalizeSourceId(next.fixture.later.source_id);
}

function hasValidMode(data) {
  if (!data || typeof data !== "object") return false;
  return (data.mode === "deterministic_replay" && data.simulated === true && data.live_ai === false) ||
    (data.mode === "local_mlx" && data.simulated === false && data.live_ai === true);
}

function extractionElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function hasValidWordBoundary(chars, start, end) {
  if (start > 0 && WORD_CHAR_RE.test(chars[start - 1])) return false;
  if (end < chars.length) {
    const nextCh = chars[end];
    if (WORD_CHAR_RE.test(nextCh)) {
      if (!(/\p{N}/u.test(nextCh) && /\p{L}/u.test(chars[end - 1]) &&
            CONCAT_DOSE_RE.test(chars.slice(end).join("")))) {
        return false;
      }
    }
  }
  return true;
}

function extractionQuote(evidence, source) {
  if (!source || typeof source !== "object" || typeof source.source_id !== "string" ||
      typeof source.text !== "string" || !evidence || typeof evidence !== "object" ||
      evidence.source_id !== source.source_id || typeof evidence.name !== "string" ||
      !Number.isInteger(evidence.start) || !Number.isInteger(evidence.end) ||
      evidence.start < 0 || evidence.end <= evidence.start) {
    throw new Error("A result had invalid source evidence. Review both notes manually.");
  }
  const chars = Array.from(source.text);
  if (evidence.end > chars.length) {
    throw new Error("A result had invalid source evidence. Review both notes manually.");
  }
  const { start, end, name } = evidence;
  if (chars.slice(start, end).join("") !== name || !hasValidWordBoundary(chars, start, end)) {
    throw new Error("A result did not match the source text. Review both notes manually.");
  }
  let first = Math.max(0, start - 85);
  let last = Math.min(chars.length, end + 85);
  while (first < start && first > 0 && !/\s/u.test(chars[first - 1])) first++;
  while (last > end && last < chars.length && !/\s/u.test(chars[last])) last--;
  const quote = extractionElement("blockquote");
  quote.append(first > 0 ? "…" : "", chars.slice(first, start).join(""),
    extractionElement("mark", name), chars.slice(end, last).join(""), last < chars.length ? "…" : "");
  return quote;
}

function renderExtractionResult(result, data, payload, onReview, onExportFollowUps) {
  if (!result || typeof result.replaceChildren !== "function") {
    throw new Error("Cannot render comparison result.");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.differences) ||
      ![data.earlier, data.later].every(source =>
        source && typeof source === "object" &&
        Array.isArray(source.mentions) && Array.isArray(source.unsupported_outputs))) {
    throw new Error("The comparison response is incomplete. Review both notes manually.");
  }
  if (!payload || typeof payload !== "object" ||
      !payload.earlier || typeof payload.earlier !== "object" ||
      !payload.later || typeof payload.later !== "object" ||
      typeof payload.earlier.source_id !== "string" || typeof payload.later.source_id !== "string" ||
      !hasVisibleText(payload.earlier.source_id) || !hasVisibleText(payload.later.source_id) ||
      normalizeSourceId(payload.earlier.source_id) === normalizeSourceId(payload.later.source_id)) {
    throw new Error("Source metadata did not match the submitted notes.");
  }
  for (const side of ["earlier", "later"]) {
    const bucket = data[side];
    if (bucket.source_id !== payload[side].source_id ||
        bucket.unsupported_outputs.some(name => typeof name !== "string")) {
      throw new Error("Source metadata did not match the submitted notes.");
    }
  }

  const sources = { earlier_only: ["Earlier note", payload.earlier], later_only: ["Later note", payload.later] };
  const dedupedDifferences = [];
  const diffIndexByKey = new Map();
  for (const item of data.differences) {
    if (!item || typeof item !== "object" || !Object.hasOwn(sources, item.kind) ||
        typeof item.name !== "string" || !hasVisibleText(item.name) ||
        !Array.isArray(item.evidence) || !item.evidence.length) {
      throw new Error("A comparison row is incomplete. Review both notes manually.");
    }
    const [label, source] = sources[item.kind];
    const normName = normalizeName(item.name);
    const itemKey = `${item.kind}\0${normName}`;
    let entry = diffIndexByKey.get(itemKey);
    if (!entry) {
      entry = {
        kind: item.kind,
        name: item.name,
        normName,
        label,
        quotes: [],
        seenSpans: new Set()
      };
      diffIndexByKey.set(itemKey, entry);
      dedupedDifferences.push(entry);
    }
    for (const evidence of item.evidence) {
      if (typeof evidence?.name !== "string" || normalizeName(evidence.name) !== entry.normName) {
        throw new Error("A comparison row did not match its evidence.");
      }
      const quote = extractionQuote(evidence, source);
      const spanKey = `${evidence.source_id}\0${evidence.start}\0${evidence.end}`;
      if (!entry.seenSpans.has(spanKey)) {
        entry.seenSpans.add(spanKey);
        entry.quotes.push(quote);
      }
    }
  }

  const sideDetails = {};
  const mentionNamesBySide = { earlier: new Set(), later: new Set() };
  for (const [side, label] of [["earlier", "Earlier note"], ["later", "Later note"]]) {
    const bucket = data[side];
    const seenSpans = new Set();
    const quotes = [];
    for (const mention of bucket.mentions) {
      const quote = extractionQuote(mention, payload[side]);
      mentionNamesBySide[side].add(normalizeName(mention.name));
      const spanKey = `${mention.source_id}\0${mention.start}\0${mention.end}`;
      if (!seenSpans.has(spanKey)) {
        seenSpans.add(spanKey);
        quotes.push(quote);
      }
    }
    sideDetails[side] = { label, quotes, unsupported: [...new Set(bucket.unsupported_outputs)] };
  }

  const expectedEarlierOnly = new Set(
    [...mentionNamesBySide.earlier].filter(name => !mentionNamesBySide.later.has(name))
  );
  const expectedLaterOnly = new Set(
    [...mentionNamesBySide.later].filter(name => !mentionNamesBySide.earlier.has(name))
  );
  const actualEarlierOnly = new Set();
  const actualLaterOnly = new Set();
  for (const diff of dedupedDifferences) {
    if (diff.kind === "earlier_only") {
      if (!expectedEarlierOnly.has(diff.normName)) {
        throw new Error("Comparison differences did not match the extracted mentions. Review both notes manually.");
      }
      actualEarlierOnly.add(diff.normName);
    } else {
      if (!expectedLaterOnly.has(diff.normName)) {
        throw new Error("Comparison differences did not match the extracted mentions. Review both notes manually.");
      }
      actualLaterOnly.add(diff.normName);
    }
  }
  if (actualEarlierOnly.size !== expectedEarlierOnly.size || actualLaterOnly.size !== expectedLaterOnly.size) {
    throw new Error("Comparison differences did not match the extracted mentions. Review both notes manually.");
  }

  const heading = extractionElement("h2", "Mention differences");
  heading.id = "extraction-result-title";
  heading.tabIndex = -1;
  const reviewSummary = extractionElement("p", undefined, "extract-review-summary");
  reviewSummary.setAttribute("role", "status");
  const exportButton = extractionElement("button", "Download follow-ups", "btn");
  exportButton.type = "button";
  const reviewBar = extractionElement("div", undefined, "extract-review-bar");
  reviewBar.append(reviewSummary, exportButton);
  const decisions = new Map();
  const flaggedEntries = () => dedupedDifferences.filter(entry => decisions.get(entry) === "clarify");
  const followUpQuestion = entry => `Can you confirm whether ${entry.name} belongs on the discharge medication list?`;
  function updateReviewSummary() {
    const flagged = flaggedEntries().length;
    reviewSummary.textContent = `${dedupedDifferences.length - decisions.size} to review · ${flagged} flagged for clarification`;
    exportButton.disabled = flagged === 0;
  }
  exportButton.addEventListener("click", () => {
    const flagged = flaggedEntries();
    if (!flagged.length) return;
    const mode = data.simulated ? "Simulated replay" : "Local model";
    const sections = flagged.map(entry => [
      followUpQuestion(entry),
      `Source excerpts from ${entry.label.toLowerCase()}:`,
      ...entry.quotes.map(quote => `> ${quote.textContent.replace(/\r?\n/g, "\n> ")}`),
    ].join("\n"));
    const text = ["Discharge medication follow-ups", `${mode} · Fictional notes only`, ...sections,
      "Review both source notes before recording a medication decision."].join("\n\n") + "\n";
    onExportFollowUps?.(text, flagged.length);
  });
  const list = extractionElement("ul", undefined, "extract-rows");
  for (const entry of dedupedDifferences) {
    const row = extractionElement("li");
    const title = extractionElement("div", undefined, "extract-row-title");
    title.append(extractionElement("strong", entry.name), extractionElement("span", `${entry.label} only`));
    const controls = extractionElement("div", undefined, "extract-review-controls");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", `Review ${entry.name} · ${entry.label.toLowerCase()}`);
    const clarify = extractionElement("button", "Flag for clarification", "btn");
    const reviewed = extractionElement("button", "Mark reviewed", "btn");
    const question = extractionElement("p", followUpQuestion(entry), "extract-followup");
    question.hidden = true;
    for (const [button, choice] of [[clarify, "clarify"], [reviewed, "reviewed"]]) {
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const next = decisions.get(entry) === choice ? null : choice;
        if (next) decisions.set(entry, next);
        else decisions.delete(entry);
        clarify.setAttribute("aria-pressed", String(next === "clarify"));
        reviewed.setAttribute("aria-pressed", String(next === "reviewed"));
        question.hidden = next !== "clarify";
        updateReviewSummary();
        onReview?.(entry.name, entry.label, next);
      });
    }
    controls.append(clarify, reviewed);
    row.append(title, ...entry.quotes, controls, question);
    list.append(row);
  }
  const detail = extractionElement("details");
  detail.append(extractionElement("summary", "All extracted mentions by note"));
  for (const side of ["earlier", "later"]) {
    const info = sideDetails[side];
    const group = extractionElement("div", undefined, "extract-detail");
    group.append(extractionElement("strong", info.label));
    if (!info.quotes.length) group.append(extractionElement("p", "No supported mentions returned."));
    else group.append(...info.quotes);
    if (info.unsupported.length) {
      group.append(extractionElement("p", `Unverified outputs excluded: ${info.unsupported.join(", ")}`));
    }
    detail.append(group);
  }
  const header = extractionElement("div", undefined, "extract-result-header");
  const count = dedupedDifferences.length;
  header.append(heading, extractionElement("span",
    `${count} ${count === 1 ? "difference" : "differences"}`, "extract-metrics"));
  updateReviewSummary();
  result.replaceChildren(header, ...(count
    ? [reviewBar, list]
    : [extractionElement("p", "No differences in extracted mentions. Review both notes.", "empty")]), detail,
    extractionElement("p", "Extracted mentions can be missed. Compare the source text before drawing conclusions.", "extract-result-note"));
  result.hidden = false;
  return count;
}
