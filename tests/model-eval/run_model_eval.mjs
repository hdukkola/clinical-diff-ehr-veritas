#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_PATH = path.join(__dirname, "cases.jsonl");
const REPORT_PATH = path.join(__dirname, "report.json");

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
  if (endpoint.includes("/v1/chat/completions")) return "openai-chat-completions";
  if (endpoint.includes("/api/compare")) return "clinical-diff-compare";
  if (endpoint.includes("/extract_synthetic_medications")) return "gradio-extract";
  return "openai-chat-completions";
}

function buildSocketConfig() {
  const endpoint = process.env.AI_MODEL_ENDPOINT || "";
  const apiKey = process.env.AI_MODEL_API_KEY || "";
  const modelName = process.env.AI_MODEL_NAME || "";
  const hfToken = process.env.HF_TOKEN || "";
  const protocol = detectProtocol(endpoint);

  return {
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

async function callModel(testCase, socket) {
  const headers = { "Content-Type": "application/json" };
  const token = socket.apiKey || socket.hfToken;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let body;
  if (socket.protocol === "openai-chat-completions") {
    const messages = testCase.messages || [
      {
        role: "user",
        content:
          typeof testCase.input === "string"
            ? testCase.input
            : testCase.note_a !== undefined && testCase.note_b !== undefined
              ? `Compare Note A and Note B:\n\nNote A:\n${testCase.note_a}\n\nNote B:\n${testCase.note_b}`
              : JSON.stringify(testCase.input ?? testCase.prompt ?? testCase.note ?? testCase),
      },
    ];
    body = {
      model: socket.modelName || "default",
      messages,
      temperature: 0,
    };
  } else if (socket.protocol === "clinical-diff-compare") {
    body = {
      source: testCase.note_a ?? testCase.source ?? testCase.input?.source ?? "",
      target: testCase.note_b ?? testCase.target ?? testCase.input?.target ?? "",
      ...(testCase.input && typeof testCase.input === "object" ? testCase.input : {}),
    };
  } else if (socket.protocol === "gradio-extract") {
    const text =
      typeof testCase.input === "string"
        ? testCase.input
        : testCase.note ?? testCase.prompt ?? JSON.stringify(testCase.input ?? {});
    body = { data: [text] };
  }

  const res = await fetch(socket.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

function extractOutputText(rawResponse, protocol) {
  if (rawResponse == null) return "";
  if (protocol === "openai-chat-completions") {
    return rawResponse?.choices?.[0]?.message?.content ?? JSON.stringify(rawResponse);
  }
  if (protocol === "gradio-extract") {
    return Array.isArray(rawResponse?.data)
      ? JSON.stringify(rawResponse.data[0])
      : JSON.stringify(rawResponse);
  }
  return typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
}

function evaluateCase(testCase, rawResponse, socket, dryRun) {
  const category = testCase.category || testCase.type || "uncategorized";
  if (dryRun) {
    return {
      id: testCase.id,
      category,
      passed: true,
      dryRun: true,
      reason: "Schema and socket contract valid",
    };
  }

  const outputText = extractOutputText(rawResponse, socket.protocol);
  const expected =
    testCase.expected_changes ?? testCase.expected ?? testCase.expected_output ?? testCase.label;

  if (expected === undefined) {
    return {
      id: testCase.id,
      category,
      passed: outputText.length > 0,
      reason: outputText.length > 0 ? "Non-empty response" : "Empty response",
    };
  }

  const expectedStr = typeof expected === "string" ? expected : JSON.stringify(expected);
  const passed = outputText.toLowerCase().includes(expectedStr.toLowerCase());
  return {
    id: testCase.id,
    category,
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

function buildReport({ opts, socket, cases, schemaErrors, results }) {
  const passedCount = results.filter((r) => r.passed).length;
  const failedResults = results.filter((r) => !r.passed);
  const totalEvaluated = results.length;
  const accuracy = totalEvaluated > 0 ? Number((passedCount / totalEvaluated).toFixed(4)) : 0;

  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { total: 0, passed: 0, failed: 0 };
    }
    byCategory[r.category].total += 1;
    if (r.passed) byCategory[r.category].passed += 1;
    else byCategory[r.category].failed += 1;
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
      modelName: socket.modelName || null,
      hasApiKey: socket.hasApiKey,
      hasHfToken: socket.hasHfToken,
    },
    summary: {
      totalCasesLoaded: cases.length,
      totalEvaluated,
      passed: passedCount,
      failed: failedResults.length,
      schemaErrors: schemaErrors.length,
      accuracy,
    },
    byCategory,
    holeAnalysis: {
      schemaErrors,
      failureReasons: holesByReason,
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

  const { cases, schemaErrors } = loadCases(CASES_PATH, opts.limit);

  const results = await runPool(cases, opts.concurrency, async (testCase) => {
    if (opts.dryRun) {
      return evaluateCase(testCase, null, socket, true);
    }
    try {
      const raw = await callModel(testCase, socket);
      return evaluateCase(testCase, raw, socket, false);
    } catch (err) {
      return {
        id: testCase.id,
        category: testCase.category || testCase.type || "uncategorized",
        passed: false,
        reason: `Model call error: ${err.message}`,
      };
    }
  });

  const report = buildReport({ opts, socket, cases, schemaErrors, results });
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
