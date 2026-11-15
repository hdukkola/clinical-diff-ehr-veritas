import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "cases.jsonl");

// Deterministic PRNG (Mulberry32)
function createRng(seed = 20261115) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20261115);

function pick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const MEDS = [
  { name: "Lisinopril", doses: ["5 mg", "10 mg", "20 mg", "40 mg"], routes: ["PO", "oral"], freqs: ["daily", "BID", "once daily"], safety: true },
  { name: "Metformin", doses: ["500 mg", "850 mg", "1000 mg"], routes: ["PO"], freqs: ["daily", "BID", "with meals"], safety: true },
  { name: "Warfarin", doses: ["1 mg", "2.5 mg", "5 mg", "7.5 mg"], routes: ["PO"], freqs: ["daily", "every evening"], safety: true },
  { name: "Insulin Glargine", doses: ["10 units", "16 units", "24 units", "32 units"], routes: ["SubQ", "SC"], freqs: ["QHS", "at bedtime", "daily"], safety: true },
  { name: "Amoxicillin", doses: ["250 mg", "500 mg", "875 mg"], routes: ["PO"], freqs: ["TID", "BID", "q8h"], safety: false },
  { name: "Furosemide", doses: ["20 mg", "40 mg", "80 mg"], routes: ["PO", "IV"], freqs: ["daily", "BID", "q12h"], safety: true },
  { name: "Atorvastatin", doses: ["10 mg", "20 mg", "40 mg", "80 mg"], routes: ["PO"], freqs: ["QHS", "daily"], safety: false },
  { name: "Apixaban", doses: ["2.5 mg", "5 mg"], routes: ["PO"], freqs: ["BID", "twice daily"], safety: true },
  { name: "Prednisone", doses: ["5 mg", "10 mg", "20 mg", "40 mg"], routes: ["PO"], freqs: ["daily", "taper"], safety: true },
  { name: "Albuterol", doses: ["90 mcg", "2 puffs"], routes: ["inhaled", "MDI"], freqs: ["q4-6h PRN", "PRN SOB"], safety: false }
];

const DURATIONS = ["3 days", "5 days", "7 days", "10 days", "14 days", "30 days", "90 days"];

const LABS = [
  { name: "Potassium (K+)", unit: "mEq/L", normal: [3.5, 5.0], critical: [2.6, 6.4], safety: true },
  { name: "Sodium (Na+)", unit: "mEq/L", normal: [135, 145], critical: [122, 156], safety: true },
  { name: "Creatinine", unit: "mg/dL", normal: [0.7, 1.2], critical: [2.8, 5.2], safety: true },
  { name: "Hemoglobin", unit: "g/dL", normal: [12.0, 15.5], critical: [6.5, 7.8], safety: true },
  { name: "WBC", unit: "x10^3/uL", normal: [4.5, 11.0], critical: [1.8, 22.5], safety: true },
  { name: "Platelets", unit: "x10^3/uL", normal: [150, 400], critical: [35, 850], safety: true },
  { name: "HbA1c", unit: "%", normal: [5.2, 6.4], critical: [9.5, 12.8], safety: false },
  { name: "TSH", unit: "mIU/L", normal: [0.5, 4.0], critical: [0.05, 18.0], safety: false }
];

const VITALS = [
  { name: "BP", genNormal: () => `${randInt(110, 128)}/${randInt(68, 82)} mmHg`, genCrit: () => `${randInt(180, 215)}/${randInt(105, 125)} mmHg`, safety: true },
  { name: "HR", genNormal: () => `${randInt(62, 88)} bpm`, genCrit: () => `${randInt(125, 155)} bpm`, safety: true },
  { name: "SpO2", genNormal: () => `${randInt(96, 99)}% on RA`, genCrit: () => `${randInt(82, 88)}% on 4L NC`, safety: true },
  { name: "Temp", genNormal: () => `${(36.4 + rng() * 0.8).toFixed(1)} C`, genCrit: () => `${(39.1 + rng() * 1.2).toFixed(1)} C`, safety: true },
  { name: "RR", genNormal: () => `${randInt(14, 18)} /min`, genCrit: () => `${randInt(26, 34)} /min`, safety: true }
];

const ALLERGENS = [
  { substance: "Penicillin", reaction: "anaphylaxis", severity: "severe" },
  { substance: "Sulfa drugs", reaction: "Stevens-Johnson syndrome", severity: "severe" },
  { substance: "Latex", reaction: "urticaria and angioedema", severity: "moderate" },
  { substance: "Iodinated contrast", reaction: "bronchospasm", severity: "severe" },
  { substance: "Aspirin", reaction: "GI bleed", severity: "severe" },
  { substance: "Codeine", reaction: "nausea and vomiting", severity: "mild" },
  { substance: "ACE inhibitors", reaction: "angioedema", severity: "severe" }
];

const CONTRAINDICATIONS = [
  "Pregnancy (teratogenic risk)",
  "Severe renal impairment (eGFR < 30 mL/min)",
  "Active gastrointestinal bleeding",
  "History of angioedema",
  "Decompensated cirrhosis"
];

const CONDITIONS = [
  "acute coronary syndrome",
  "pulmonary embolism",
  "community-acquired pneumonia",
  "acute kidney injury",
  "sepsis",
  "deep vein thrombosis",
  "congestive heart failure exacerbation",
  "diabetic ketoacidosis"
];

function genMedicationCase(idx) {
  const med = pick(MEDS);
  const subType = pick(["dose", "frequency", "duration", "route", "start", "stop", "hold"]);
  const doseA = pick(med.doses);
  const routeA = pick(med.routes);
  const freqA = pick(med.freqs);
  const durA = pick(DURATIONS);

  let noteA = "";
  let noteB = "";
  let expected = [];
  let difficulty = "easy";
  let safetyCritical = med.safety;

  if (subType === "dose") {
    const otherDoses = med.doses.filter((d) => d !== doseA);
    const doseB = pick(otherDoses);
    noteA = `Medications:\n- ${med.name} ${doseA} ${routeA} ${freqA}`;
    noteB = `Medications:\n- ${med.name} ${doseB} ${routeA} ${freqA}`;
    expected = [{ type: "medication_dose_change", entity: med.name, field: "dose", from: doseA, to: doseB, safety_critical: safetyCritical }];
    difficulty = rng() < 0.5 ? "easy" : "medium";
  } else if (subType === "frequency") {
    const otherFreqs = med.freqs.filter((f) => f !== freqA);
    const freqB = pick(otherFreqs);
    noteA = `Active Meds: ${med.name} ${doseA} ${routeA} ${freqA}.`;
    noteB = `Active Meds: ${med.name} ${doseA} ${routeA} ${freqB}.`;
    expected = [{ type: "medication_frequency_change", entity: med.name, field: "frequency", from: freqA, to: freqB, safety_critical: safetyCritical }];
    difficulty = "medium";
  } else if (subType === "duration") {
    const durB = pick(DURATIONS.filter((d) => d !== durA));
    noteA = `Plan: Continue ${med.name} ${doseA} ${routeA} ${freqA} for ${durA}.`;
    noteB = `Plan: Continue ${med.name} ${doseA} ${routeA} ${freqA} for ${durB}.`;
    expected = [{ type: "medication_duration_change", entity: med.name, field: "duration", from: durA, to: durB, safety_critical: false }];
    difficulty = "medium";
  } else if (subType === "route") {
    const routeB = med.routes.length > 1 ? pick(med.routes.filter((r) => r !== routeA)) : (routeA === "PO" ? "IV" : "PO");
    noteA = `Order: ${med.name} ${doseA} ${routeA} ${freqA}`;
    noteB = `Order: ${med.name} ${doseA} ${routeB} ${freqA}`;
    expected = [{ type: "medication_route_change", entity: med.name, field: "route", from: routeA, to: routeB, safety_critical: true }];
    safetyCritical = true;
    difficulty = "hard";
  } else if (subType === "start") {
    noteA = `Medications:\n- None reported.`;
    noteB = `Medications:\n- Start ${med.name} ${doseA} ${routeA} ${freqA}.`;
    expected = [{ type: "medication_started", entity: med.name, field: "status", from: null, to: `${doseA} ${routeA} ${freqA}`, safety_critical: safetyCritical }];
    difficulty = "easy";
  } else if (subType === "stop") {
    noteA = `Medications:\n- ${med.name} ${doseA} ${routeA} ${freqA}`;
    noteB = `Medications:\n- Discontinue ${med.name} ${doseA} ${routeA} ${freqA}`;
    expected = [{ type: "medication_stopped", entity: med.name, field: "status", from: "active", to: "discontinued", safety_critical: true }];
    safetyCritical = true;
    difficulty = "medium";
  } else {
    noteA = `Medications:\n- ${med.name} ${doseA} ${routeA} ${freqA}`;
    noteB = `Medications:\n- HOLD ${med.name} ${doseA} ${routeA} ${freqA} pending morning labs.`;
    expected = [{ type: "medication_held", entity: med.name, field: "status", from: "active", to: "held", safety_critical: true }];
    safetyCritical = true;
    difficulty = "hard";
  }

  return {
    id: `case_${String(idx).padStart(5, "0")}`,
    category: "medication_changes",
    difficulty,
    safety_critical: safetyCritical,
    note_a: noteA,
    note_b: noteB,
    expected_changes: expected
  };
}

function genLabsVitalsCase(idx) {
  const isLab = rng() < 0.6;
  if (isLab) {
    const lab = pick(LABS);
    const valA = (lab.normal[0] + rng() * (lab.normal[1] - lab.normal[0])).toFixed(1);
    const isCrit = rng() < 0.5;
    const valB = isCrit
      ? pick(lab.critical).toFixed(1)
      : (lab.normal[0] + rng() * (lab.normal[1] - lab.normal[0])).toFixed(1);
    const noteA = `Labs:\n${lab.name}: ${valA} ${lab.unit}`;
    const noteB = `Labs:\n${lab.name}: ${valB} ${lab.unit}${isCrit ? " (CRITICAL)" : ""}`;
    const changed = valA !== valB;
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "labs_vitals",
      difficulty: isCrit ? "hard" : "easy",
      safety_critical: isCrit && lab.safety,
      note_a: noteA,
      note_b: noteB,
      expected_changes: changed
        ? [{ type: "lab_value_change", entity: lab.name, field: "value", from: `${valA} ${lab.unit}`, to: `${valB} ${lab.unit}`, safety_critical: isCrit && lab.safety }]
        : []
    };
  } else {
    const vital = pick(VITALS);
    const valA = vital.genNormal();
    const isCrit = rng() < 0.55;
    const valB = isCrit ? vital.genCrit() : vital.genNormal();
    const noteA = `Vitals: ${vital.name} ${valA}`;
    const noteB = `Vitals: ${vital.name} ${valB}`;
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "labs_vitals",
      difficulty: isCrit ? "medium" : "easy",
      safety_critical: isCrit && vital.safety,
      note_a: noteA,
      note_b: noteB,
      expected_changes: valA !== valB
        ? [{ type: "vital_change", entity: vital.name, field: "value", from: valA, to: valB, safety_critical: isCrit && vital.safety }]
        : []
    };
  }
}

function genAllergyCase(idx) {
  const mode = pick(["nkda_to_allergy", "reaction_escalation", "contraindication_added", "contraindication_removed"]);
  const alg = pick(ALLERGENS);

  if (mode === "nkda_to_allergy") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "allergies_contraindications",
      difficulty: "easy",
      safety_critical: true,
      note_a: "Allergies: NKDA (No Known Drug Allergies).",
      note_b: `Allergies: ${alg.substance} (${alg.reaction}, ${alg.severity}).`,
      expected_changes: [{ type: "allergy_added", entity: alg.substance, field: "allergy", from: "NKDA", to: `${alg.reaction} (${alg.severity})`, safety_critical: true }]
    };
  } else if (mode === "reaction_escalation") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "allergies_contraindications",
      difficulty: "medium",
      safety_critical: true,
      note_a: `Allergies: ${alg.substance} (mild rash).`,
      note_b: `Allergies: ${alg.substance} (${alg.reaction}, ${alg.severity}).`,
      expected_changes: [{ type: "allergy_severity_change", entity: alg.substance, field: "reaction", from: "mild rash", to: `${alg.reaction} (${alg.severity})`, safety_critical: true }]
    };
  } else if (mode === "contraindication_added") {
    const ci = pick(CONTRAINDICATIONS);
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "allergies_contraindications",
      difficulty: "hard",
      safety_critical: true,
      note_a: "Contraindications: None documented.",
      note_b: `Contraindications: ${ci}.`,
      expected_changes: [{ type: "contraindication_added", entity: ci, field: "status", from: null, to: "present", safety_critical: true }]
    };
  } else {
    const ci = pick(CONTRAINDICATIONS);
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "allergies_contraindications",
      difficulty: "hard",
      safety_critical: true,
      note_a: `Contraindications: ${ci}.`,
      note_b: `Contraindications: ${ci} resolved / cleared.`,
      expected_changes: [{ type: "contraindication_removed", entity: ci, field: "status", from: "present", to: "resolved", safety_critical: true }]
    };
  }
}

function genNegationHedgingCase(idx) {
  const cond = pick(CONDITIONS);
  const pattern = pick(["neg_to_pos", "hedge_to_confirmed", "hedge_to_ruled_out", "pos_to_neg"]);

  if (pattern === "neg_to_pos") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "negation_hedging",
      difficulty: "medium",
      safety_critical: true,
      note_a: `Assessment: Patient denies symptoms of ${cond}; no evidence of ${cond}.`,
      note_b: `Assessment: Confirmed ${cond} on imaging and clinical exam.`,
      expected_changes: [{ type: "assertion_change", entity: cond, field: "certainty", from: "negated", to: "confirmed", safety_critical: true }]
    };
  } else if (pattern === "hedge_to_confirmed") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "negation_hedging",
      difficulty: "hard",
      safety_critical: true,
      note_a: `Assessment: Possible ${cond}, cannot rule out ${cond}.`,
      note_b: `Assessment: Definite ${cond}, initiating treatment.`,
      expected_changes: [{ type: "assertion_change", entity: cond, field: "certainty", from: "uncertain", to: "confirmed", safety_critical: true }]
    };
  } else if (pattern === "hedge_to_ruled_out") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "negation_hedging",
      difficulty: "hard",
      safety_critical: false,
      note_a: `Assessment: Rule out ${cond}.`,
      note_b: `Assessment: ${cond} ruled out.`,
      expected_changes: [{ type: "assertion_change", entity: cond, field: "certainty", from: "uncertain", to: "negated", safety_critical: false }]
    };
  } else {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "negation_hedging",
      difficulty: "medium",
      safety_critical: true,
      note_a: `Assessment: Active ${cond}.`,
      note_b: `Assessment: No longer has ${cond}; resolved.`,
      expected_changes: [{ type: "assertion_change", entity: cond, field: "certainty", from: "confirmed", to: "negated", safety_critical: true }]
    };
  }
}

function genFormattingNoiseCase(idx) {
  const med = pick(MEDS);
  const dose = pick(med.doses);
  const freq = pick(med.freqs);
  const style = pick(["whitespace", "casing", "bullets", "headers"]);

  let noteA = `Assessment & Plan:\n- ${med.name} ${dose} PO ${freq}\n- Allergies: NKDA`;
  let noteB = noteA;

  if (style === "whitespace") {
    noteB = `Assessment  &  Plan:\n\n  -   ${med.name}   ${dose}   PO   ${freq}  \n  -   Allergies:   NKDA  `;
  } else if (style === "casing") {
    noteB = `ASSESSMENT & PLAN:\n- ${med.name.toUpperCase()} ${dose.toUpperCase()} po ${freq.toUpperCase()}\n- ALLERGIES: nkda`;
  } else if (style === "bullets") {
    noteB = `Assessment & Plan:\n* ${med.name} ${dose} PO ${freq}\n* Allergies: NKDA`;
  } else {
    noteB = `A/P:\n1. ${med.name} ${dose} PO ${freq}\n2. Allergies: NKDA`;
  }

  return {
    id: `case_${String(idx).padStart(5, "0")}`,
    category: "formatting_noise",
    difficulty: "medium",
    safety_critical: false,
    note_a: noteA,
    note_b: noteB,
    expected_changes: []
  };
}

function genBoundaryCase(idx) {
  const bType = pick(["both_empty", "empty_to_note", "note_to_empty", "short", "long_4000"]);

  if (bType === "both_empty") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "boundary_cases",
      difficulty: "easy",
      safety_critical: false,
      note_a: "",
      note_b: "",
      expected_changes: []
    };
  } else if (bType === "empty_to_note") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "boundary_cases",
      difficulty: "medium",
      safety_critical: true,
      note_a: "",
      note_b: "Allergies: Penicillin (anaphylaxis). Meds: Warfarin 5 mg PO daily.",
      expected_changes: [
        { type: "allergy_added", entity: "Penicillin", field: "allergy", from: null, to: "anaphylaxis", safety_critical: true },
        { type: "medication_started", entity: "Warfarin", field: "status", from: null, to: "5 mg PO daily", safety_critical: true }
      ]
    };
  } else if (bType === "note_to_empty") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "boundary_cases",
      difficulty: "medium",
      safety_critical: true,
      note_a: "Meds: Insulin Glargine 20 units SubQ QHS.",
      note_b: "",
      expected_changes: [
        { type: "medication_stopped", entity: "Insulin Glargine", field: "status", from: "active", to: "discontinued", safety_critical: true }
      ]
    };
  } else if (bType === "short") {
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "boundary_cases",
      difficulty: "easy",
      safety_critical: false,
      note_a: "NKDA.",
      note_b: "NKDA.",
      expected_changes: []
    };
  } else {
    const filler = "Review of Systems: Negative for fever, chills, chest pain, dyspnea, nausea, vomiting, or focal weakness. ";
    const baseA = "History of Present Illness: Patient presents for routine follow-up. ";
    let noteA = baseA;
    while (noteA.length + filler.length < 3850) {
      noteA += filler;
    }
    const med = pick(MEDS);
    const doseA = med.doses[0];
    const doseB = med.doses[med.doses.length - 1];
    const tailA = `\nPlan: Continue ${med.name} ${doseA} PO daily.`;
    const tailB = `\nPlan: Increase ${med.name} ${doseB} PO daily.`;
    return {
      id: `case_${String(idx).padStart(5, "0")}`,
      category: "boundary_cases",
      difficulty: "hard",
      safety_critical: med.safety,
      note_a: (noteA + tailA).slice(0, 4000),
      note_b: (noteA + tailB).slice(0, 4000),
      expected_changes: [
        { type: "medication_dose_change", entity: med.name, field: "dose", from: doseA, to: doseB, safety_critical: med.safety }
      ]
    };
  }
}

const PLAN = [
  { category: "medication_changes", count: 3600, gen: genMedicationCase },
  { category: "labs_vitals", count: 2400, gen: genLabsVitalsCase },
  { category: "allergies_contraindications", count: 1800, gen: genAllergyCase },
  { category: "negation_hedging", count: 1800, gen: genNegationHedgingCase },
  { category: "formatting_noise", count: 1200, gen: genFormattingNoiseCase },
  { category: "boundary_cases", count: 1200, gen: genBoundaryCase }
];

fs.mkdirSync(__dirname, { recursive: true });
const out = fs.createWriteStream(OUT_FILE, { encoding: "utf8" });

let idx = 1;
const breakdown = {};

for (const item of PLAN) {
  breakdown[item.category] = item.count;
  for (let i = 0; i < item.count; i++) {
    const record = item.gen(idx++);
    out.write(JSON.stringify(record) + "\n");
  }
}

out.end(() => {
  const total = idx - 1;
  console.log(JSON.stringify({ total, breakdown, output: OUT_FILE }, null, 2));
});
