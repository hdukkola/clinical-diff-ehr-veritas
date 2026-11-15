#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_PATH = path.join(__dirname, "cases.jsonl");
const REPORT_PATH = path.join(__dirname, "report.json");

const EVAL_SYSTEM_PROMPT = [
  "Compare two fictional clinical notes (Note A earlier, Note B later).",
  "Return ONLY JSON matching {\"changes\":[{\"type\":string,\"entity\":string,\"field\":string,\"from\":string|null,\"to\":string|null,\"safety_critical\":boolean}]}.",
  "If there are no meaningful clinical changes (only formatting/case/whitespace differences), return {\"changes\":[]}.",
  "Do not fabricate entities or clinical recommendations.",
].join(" ");

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    limit: Infinity,
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--limit" && i + 1 < argv.length) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${argv[i]}`);
      }
      opts.limit = Math.floor(n);
    } else if (arg === "--concurrency" && i + 1 < argv.length) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --concurrency value: ${argv[i]}`);
      }
      opts.concurrency = Math.floor(n);
    }
  }
  return opts;
}

function detectProtocol(endpoint) {
  if (!endpoint) return "unconfigured";
  if (endpoint.includes("/api/compare") || endpoint.endsWith("/compare")) {
    return "clinical-diff-compare";
  }
  if (endpoint.includes("/extract_synthetic_medications")) return "gradio-extract";
  return "openai-chat-completions";
}

function normalizeEndpointUrl(endpoint, protocol) {
  if (!endpoint || protocol !== "openai-chat-completions") return endpoint;
  const trimmed = endpoint.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1/chat/completions") || trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function deriveModelsUrl(chatEndpoint) {
  return chatEndpoint.replace(/\/chat\/completions$/i, "/models");
}

function buildSocketConfig() {
  const rawEndpoint = (process.env.AI_MODEL_ENDPOINT || "").trim();
  const apiKey = (process.env.AI_MODEL_API_KEY || "").trim();
  const modelName = (process.env.AI_MODEL_NAME || "").trim();
  const hfToken = (process.env.HF_TOKEN || "").trim();
  const protocol = detectProtocol(rawEndpoint);
  const endpoint = normalizeEndpointUrl(rawEndpoint, protocol);

  return {
    rawEndpoint,
    endpoint,
    apiKey,
    modelName,
    hfToken,
    protocol,
    hasApiKey: Boolean(apiKey),
    hasHfToken: Boolean(hfToken),
  };
}

function loadCases(casesPath, limit) {
  if (!fs.existsSync(casesPath)) {
    throw new Error(`Cases file not found: ${casesPath}`);
  }
  const raw = fs.readFileSync(casesPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cases = [];
  const schemaErrors = [];

  for (let idx = 0; idx < lines.length && cases.length < limit; idx++) {
    const lineNum = idx + 1;
    let parsed;
    try {
      parsed = JSON.parse(lines[idx]);
    } catch (err) {
      schemaErrors.push({ line: lineNum, error: `Invalid JSON: ${err.message}` });
      continue;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      schemaErrors.push({ line: lineNum, error: "Case must be a JSON object" });
      continue;
    }

    const id = parsed.id ?? `case-${lineNum}`;
    const hasInput =
      parsed.input !== undefined ||
      parsed.prompt !== undefined ||
      parsed.note !== undefined ||
      parsed.messages !== undefined ||
      (parsed.note_a !== undefined && parsed.note_b !== undefined) ||
      (parsed.source !== undefined && parsed.target !== undefined);

    if (!hasInput) {
      schemaErrors.push({
        line: lineNum,
        id,
        error:
          "Missing input field (expected note_a+note_b, input, prompt, note, messages, or source+target)",
      });
      continue;
    }

    cases.push({ ...parsed, id, _line: lineNum });
  }

  return { cases, schemaErrors, totalLines: lines.length };
}

async function discoverOpenAiModel(socket) {
  if (socket.protocol !== "openai-chat-completions" || socket.modelName || !socket.endpoint) {
    return socket.modelName || "Qwen/Qwen3.5-4B";
  }
  const headers = {};
  const token = socket.apiKey || socket.hfToken;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(deriveModelsUrl(socket.endpoint), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      const id = payload?.data?.[0]?.id ?? payload?.models?.[0]?.id ?? payload?.models?.[0]?.name;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  } catch {
    // Fallback below if /models discovery fails
  }
  return "Qwen/Qwen3.5-4B";
}

function isEmptyCompareBoundaryCase(testCase) {
  const noteA = String(testCase.note_a ?? testCase.source ?? "").trim();
  const noteB = String(testCase.note_b ?? testCase.target ?? "").trim();
  return !noteA || !noteB;
}

async function callModel(testCase, socket, resolvedModelName) {
  const headers = { "Content-Type": "application/json" };
  const token = socket.apiKey || socket.hfToken;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let body;
  if (socket.protocol === "openai-chat-completions") {
    const userPrompt =
      typeof testCase.input === "string"
        ? testCase.input
        : testCase.note_a !== undefined && testCase.note_b !== undefined
          ? `Compare Note A and Note B:\n\nNote A:\n${testCase.note_a}\n\nNote B:\n${testCase.note_b}`
          : JSON.stringify(testCase.input ?? testCase.prompt ?? testCase.note ?? testCase);
    const messages = testCase.messages || [
      { role: "system", content: EVAL_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];
    body = {
      model: resolvedModelName || socket.modelName || "Qwen/Qwen3.5-4B",
      messages,
      temperature: 0,
      max_tokens: 1536,
    };
  } else if (socket.protocol === "clinical-diff-compare") {
    const earlierText = testCase.note_a ?? testCase.source ?? testCase.input?.source ?? "";
    const laterText = testCase.note_b ?? testCase.target ?? testCase.input?.target ?? "";
    body = {
      synthetic_only: true,
      earlier_note: {
        source_id: `${testCase.id}-earlier`,
        text: earlierText,
      },
      later_note: {
        source_id: `${testCase.id}-later`,
        text: laterText,
      },
    };
  } else if (socket.protocol === "gradio-extract") {
    const text =
      typeof testCase.input === "string"
        ? testCase.input
        : testCase.note_a !== undefined && testCase.note_b !== undefined
          ? `Note A:\n${testCase.note_a}\n\nNote B:\n${testCase.note_b}`
          : testCase.note ?? testCase.prompt ?? JSON.stringify(testCase.input ?? {});
    body = { data: [text] };
  }

  const res = await fetch(socket.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (
      socket.protocol === "clinical-diff-compare" &&
      res.status === 400 &&
      isEmptyCompareBoundaryCase(testCase)
    ) {
      return {
        _validationRejected: true,
        status: res.status,
        detail: text.slice(0, 200),
      };
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

function stripThinkAndFences(text) {
  let cleaned = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned);
  if (fenced?.[1]) {
    cleaned = fenced[1].trim();
  }
  return cleaned;
}

function extractOutputText(rawResponse, protocol) {
  if (rawResponse == null) return "";
  if (protocol === "openai-chat-completions") {
    const rawContent = rawResponse?.choices?.[0]?.message?.content;
    if (typeof rawContent === "string") return stripThinkAndFences(rawContent);
    if (Array.isArray(rawContent)) {
      return stripThinkAndFences(
        rawContent
          .map((p) => (p && typeof p === "object" && typeof p.text === "string" ? p.text : ""))
          .join("\n")
      );
    }
    return stripThinkAndFences(JSON.stringify(rawResponse));
  }
  if (protocol === "gradio-extract") {
    return stripThinkAndFences(
      Array.isArray(rawResponse?.data)
        ? typeof rawResponse.data[0] === "string"
          ? rawResponse.data[0]
          : JSON.stringify(rawResponse.data[0])
        : JSON.stringify(rawResponse)
    );
  }
  return typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
}

function tryParseJson(text) {
  const cleaned = stripThinkAndFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const obj = /\{[\s\S]*\}/.exec(cleaned);
    const arr = /\[[\s\S]*\]/.exec(cleaned);
    const candidate = obj?.[0] ?? arr?.[0];
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateStructuredDiff(expectedList, parsedOutput, outputText, rawResponse, protocol) {
  if (protocol === "clinical-diff-compare" && rawResponse && typeof rawResponse === "object") {
    const diffs = Array.isArray(rawResponse.differences) ? rawResponse.differences : [];
    if (expectedList.length === 0) {
      const ok = diffs.length === 0;
      return {
        passed: ok,
        reason: ok ? "Zero false-positive differences" : `Expected 0 diffs, got ${diffs.length}`,
      };
    }
    const evidence = Array.isArray(rawResponse.evidence) ? rawResponse.evidence : [];
    const seenEntities = new Set(
      [...diffs, ...evidence].map((d) => normalizeToken(d?.name)).filter(Boolean)
    );
    const missing = expectedList.filter((exp) => !seenEntities.has(normalizeToken(exp?.entity)));
    return {
      passed: missing.length === 0,
      reason:
        missing.length === 0
          ? "All expected entities grounded in /compare output"
          : `Missed entity in /compare: ${missing.map((m) => m.entity).join(", ")}`,
    };
  }

  const parsedChanges = Array.isArray(parsedOutput)
    ? parsedOutput
    : parsedOutput && typeof parsedOutput === "object"
      ? Array.isArray(parsedOutput.changes)
        ? parsedOutput.changes
        : Array.isArray(parsedOutput.expected_changes)
          ? parsedOutput.expected_changes
          : Array.isArray(parsedOutput.differences)
            ? parsedOutput.differences
            : null
      : null;

  if (expectedList.length === 0) {
    if (parsedChanges !== null) {
      const ok = parsedChanges.length === 0;
      return {
        passed: ok,
        reason: ok ? "Correctly reported zero changes" : `False positive changes: ${parsedChanges.length}`,
      };
    }
    const lower = normalizeToken(outputText);
    const saysNoChange = /\b(no\s+(?:clinical\s+)?(?:changes|differences)|unchanged|identical)\b/.test(lower);
    return {
      passed: saysNoChange,
      reason: saysNoChange ? "Reported no changes" : "Expected empty changes array or explicit no-change output",
    };
  }

  const corpus = normalizeToken(parsedChanges ? JSON.stringify(parsedChanges) : outputText);
  for (const exp of expectedList) {
    const entity = normalizeToken(exp?.entity);
    if (entity && !corpus.includes(entity)) {
      return {
        passed: false,
        reason: `Missed expected entity: ${exp.entity}`,
      };
    }
    const targetVal = normalizeToken(exp?.to);
    if (parsedChanges && targetVal && targetVal !== "null" && targetVal.length <= 40) {
      const hasEntityMatch = parsedChanges.some((item) => {
        const serialized = normalizeToken(JSON.stringify(item));
        return (!entity || serialized.includes(entity));
      });
      if (!hasEntityMatch) {
        return {
          passed: false,
          reason: `Structured changes omitted entity: ${exp.entity}`,
        };
      }
    }
  }

  return { passed: true, reason: "Matched expected entities/changes" };
}

function evaluateCase(testCase, rawResponse, socket, dryRun) {
  const category = testCase.category || testCase.type || "uncategorized";
  const safetyCritical = Boolean(testCase.safety_critical);

  if (dryRun) {
    return {
      id: testCase.id,
      category,
      safety_critical: safetyCritical,
      passed: true,
      dryRun: true,
      reason: "Schema and socket contract valid",
    };
  }

  if (rawResponse && rawResponse._validationRejected) {
    return {
      id: testCase.id,
      category,
      safety_critical: safetyCritical,
      passed: true,
      reason: "Expected empty-note validation rejection (HTTP 400)",
    };
  }

  const outputText = extractOutputText(rawResponse, socket.protocol);
  const expected =
    testCase.expected_changes ?? testCase.expected ?? testCase.expected_output ?? testCase.label;

  if (expected === undefined) {
    return {
      id: testCase.id,
      category,
      safety_critical: safetyCritical,
      passed: outputText.length > 0,
      reason: outputText.length > 0 ? "Non-empty response" : "Empty response",
    };
  }

  if (Array.isArray(expected)) {
    const parsedOutput = tryParseJson(outputText);
    const res = evaluateStructuredDiff(expected, parsedOutput, outputText, rawResponse, socket.protocol);
    return {
      id: testCase.id,
      category,
      safety_critical: safetyCritical,
      passed: res.passed,
      reason: res.reason,
    };
  }

  const expectedStr = typeof expected === "string" ? expected : JSON.stringify(expected);
  const passed = normalizeToken(outputText).includes(normalizeToken(expectedStr));
  return {
    id: testCase.id,
    category,
    safety_critical: safetyCritical,
    passed,
    reason: passed ? "Matched expected output" : "Output did not match expected",
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIdx = 0;

  async function runWorker() {
    while (nextIdx < items.length) {
      const current = nextIdx++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () =>
    runWorker()
  );
  await Promise.all(workers);
  return results;
}

function buildReport({ opts, socket, resolvedModelName, cases, schemaErrors, results }) {
  const passedCount = results.filter((r) => r.passed).length;
  const failedResults = results.filter((r) => !r.passed);
  const safetyCriticalTotal = results.filter((r) => r.safety_critical).length;
  const safetyCriticalFailed = failedResults.filter((r) => r.safety_critical).length;
  const totalEvaluated = results.length;
  const accuracy = totalEvaluated > 0 ? Number((passedCount / totalEvaluated).toFixed(4)) : 0;

  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { total: 0, passed: 0, failed: 0, safetyCriticalFailed: 0 };
    }
    byCategory[r.category].total += 1;
    if (r.passed) byCategory[r.category].passed += 1;
    else {
      byCategory[r.category].failed += 1;
      if (r.safety_critical) byCategory[r.category].safetyCriticalFailed += 1;
    }
  }

  const holesByReason = {};
  for (const f of failedResults) {
    const key = f.reason || "unknown";
    holesByReason[key] = (holesByReason[key] || 0) + 1;
  }

  return {
    timestamp: new Date().toISOString(),
    mode: opts.dryRun ? "dry-run" : "live",
    socket: {
      protocol: socket.protocol,
      endpointConfigured: Boolean(socket.endpoint),
      modelName: resolvedModelName || socket.modelName || null,
      hasApiKey: socket.hasApiKey,
      hasHfToken: socket.hasHfToken,
    },
    summary: {
      totalCasesLoaded: cases.length,
      totalEvaluated,
      passed: passedCount,
      failed: failedResults.length,
      safetyCriticalTotal,
      safetyCriticalFailed,
      schemaErrors: schemaErrors.length,
      accuracy,
    },
    byCategory,
    holeAnalysis: {
      schemaErrors,
      failureReasons: holesByReason,
      sampleFailures: failedResults.slice(0, 50),
      failedCaseIds: failedResults.map((f) => f.id),
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const socket = buildSocketConfig();

  if (!opts.dryRun && !socket.endpoint) {
    throw new Error(
      "AI_MODEL_ENDPOINT is required for live evaluation. Set AI_MODEL_ENDPOINT or pass --dry-run."
    );
  }

  const resolvedModelName = opts.dryRun ? socket.modelName || null : await discoverOpenAiModel(socket);
  const { cases, schemaErrors } = loadCases(CASES_PATH, opts.limit);

  const results = await runPool(cases, opts.concurrency, async (testCase) => {
    if (opts.dryRun) {
      return evaluateCase(testCase, null, socket, true);
    }
    try {
      const raw = await callModel(testCase, socket, resolvedModelName);
      return evaluateCase(testCase, raw, socket, false);
    } catch (err) {
      return {
        id: testCase.id,
        category: testCase.category || testCase.type || "uncategorized",
        safety_critical: Boolean(testCase.safety_critical),
        passed: false,
        reason: `Model call error: ${err.message}`,
      };
    }
  });

  const report = buildReport({ opts, socket, resolvedModelName, cases, schemaErrors, results });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        summary: report.summary,
        reportPath: REPORT_PATH,
      },
      null,
      2
    )
  );

  if (schemaErrors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[run_model_eval] ${err.message}`);
  process.exit(1);
});
