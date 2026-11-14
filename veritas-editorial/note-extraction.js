"use strict";

function createNoteWorkspace({ onService, onComparison }) {
  const workspace = document.createElement("section");
  workspace.className = "extract-workspace";
  workspace.innerHTML = `
    <header class="extract-hero">
      <h1 class="h1" tabindex="-1">Medication mentions</h1>
    </header>
    <div class="extract-shell">
      <div class="extract-status">
        <p id="extraction-status" role="status">Checking the local service…</p>
        <button type="button" class="btn quiet" id="extraction-retry">Check service</button>
      </div>
      <form id="extraction-form" aria-describedby="extraction-status">
        <div class="extract-note-grid">
          <div class="extract-note">
            <div id="earlier-label">Earlier note</div>
            <p class="extract-note-text" aria-labelledby="earlier-label" role="group" hidden></p>
            <textarea id="earlier-note" aria-labelledby="earlier-label" rows="5" placeholder="Enter fictional note text" aria-describedby="earlier-count" required disabled></textarea>
            <small id="earlier-count"></small>
          </div>
          <div class="extract-note">
            <div id="later-label">Later note</div>
            <p class="extract-note-text" aria-labelledby="later-label" role="group" hidden></p>
            <textarea id="later-note" aria-labelledby="later-label" rows="5" placeholder="Enter fictional note text" aria-describedby="later-count" required disabled></textarea>
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
  const documents = [...form.querySelectorAll(".extract-note-text")];
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
    const replay = health?.simulated === true;
    fields.forEach((input, index) => {
      input.hidden = replay;
      input.disabled = busy || !health || replay;
      documents[index].hidden = !replay;
    });
  }

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  function showNotes(texts) {
    fields.forEach((input, index) => {
      input.value = texts[index];
      documents[index].textContent = health?.simulated ? texts[index] : "";
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
      if (next.status !== "ready" || !hasValidMode(next) ||
          (next.simulated && (next.fixture?.synthetic_only !== true ||
            !["earlier", "later"].every(side =>
              typeof next.fixture[side]?.text === "string" &&
              typeof next.fixture[side].source_id === "string"
            )))) {
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
    liveDraft[index] = input.value;
    updateCount(input, index);
    clearResult();
    if (health) setStatus(modeLabel(health.mode), "live");
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
    if (!health.simulated && fields.some(input => !input.value.trim() || Array.from(input.value).length > 12000)) {
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
      renderExtractionResult(result, data, payload);
      setStatus(modeLabel(data.mode), data.simulated ? "replay" : "live");
      onComparison(data.mode, data.differences.length);
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

function hasValidMode(data) {
  return (data.mode === "deterministic_replay" && data.simulated === true && data.live_ai === false) ||
    (data.mode === "local_mlx" && data.simulated === false && data.live_ai === true);
}

function extractionElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function extractionQuote(evidence, source) {
  const chars = Array.from(source.text);
  if (!evidence || evidence.source_id !== source.source_id ||
      typeof evidence.name !== "string" || !Number.isInteger(evidence.start) ||
      !Number.isInteger(evidence.end) || evidence.start < 0 ||
      evidence.end <= evidence.start || evidence.end > chars.length) {
    throw new Error("A result had invalid source evidence. Review both notes manually.");
  }
  const { start, end, name } = evidence;
  if (chars.slice(start, end).join("") !== name) {
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

function renderExtractionResult(result, data, payload) {
  if (!Array.isArray(data.differences) || ![data.earlier, data.later].every(source =>
    Array.isArray(source?.mentions) && Array.isArray(source.unsupported_outputs))) {
    throw new Error("The comparison response is incomplete. Review both notes manually.");
  }
  const heading = extractionElement("h2", "Mention differences");
  heading.id = "extraction-result-title";
  heading.tabIndex = -1;
  const list = extractionElement("ul", undefined, "extract-rows");
  const sources = { earlier_only: ["Earlier note", payload.earlier], later_only: ["Later note", payload.later] };
  for (const item of data.differences) {
    if (!item || !Object.hasOwn(sources, item.kind) || typeof item.name !== "string" ||
        !Array.isArray(item.evidence) || !item.evidence.length) {
      throw new Error("A comparison row is incomplete. Review both notes manually.");
    }
    const [label, source] = sources[item.kind];
    const row = extractionElement("li");
    const title = extractionElement("div", undefined, "extract-row-title");
    title.append(extractionElement("strong", item.name), extractionElement("span", `${label} only`));
    row.append(title);
    for (const evidence of item.evidence) {
      if (evidence?.name !== item.name) throw new Error("A comparison row did not match its evidence.");
      row.append(extractionQuote(evidence, source));
    }
    list.append(row);
  }
  const detail = extractionElement("details");
  detail.append(extractionElement("summary", "All extracted mentions by note"));
  for (const [side, label] of [["earlier", "Earlier note"], ["later", "Later note"]]) {
    const bucket = data[side];
    if (bucket.source_id !== payload[side].source_id ||
        bucket.unsupported_outputs.some(name => typeof name !== "string")) {
      throw new Error("Source metadata did not match the submitted notes.");
    }
    const group = extractionElement("div", undefined, "extract-detail");
    group.append(extractionElement("strong", label));
    if (!bucket.mentions.length) group.append(extractionElement("p", "No supported mentions returned."));
    for (const mention of bucket.mentions) group.append(extractionQuote(mention, payload[side]));
    if (bucket.unsupported_outputs.length) {
      group.append(extractionElement("p", `Unverified outputs excluded: ${bucket.unsupported_outputs.join(", ")}`));
    }
    detail.append(group);
  }
  const header = extractionElement("div", undefined, "extract-result-header");
  const count = data.differences.length;
  header.append(heading, extractionElement("span",
    `${count} ${count === 1 ? "difference" : "differences"}`, "extract-metrics"));
  result.replaceChildren(header, data.differences.length
    ? list
    : extractionElement("p", "No differences in extracted mentions. Review both notes.", "empty"), detail,
    extractionElement("p", "Extracted mentions can be missed. Compare the source text before drawing conclusions.", "extract-result-note"));
  result.hidden = false;
}
