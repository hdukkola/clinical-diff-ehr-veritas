// Clinical Diff · integration contracts
// Reference types for wiring real databases and models into the prototype.
// The browser build registers drivers at runtime via window.ClinicalDiff.registerDriver.

export type HealthState = "idle" | "checking" | "ok" | "degraded" | "error";

export interface Health {
  state: HealthState;
  latency?: number;
  detail?: string;
}

export interface Connection {
  id: string;
  kind: "db" | "model";
  driver: string;
  name: string;
  endpoint: string;
  model?: string;
  config: Record<string, unknown>; // never contains secrets; use server-side env vars
  active: boolean;
}

export interface MedicationStatement {
  id: string; // identity is supplied by the source, never inferred
  name: string;
  dose: string | null; // null renders as "Not documented"
  route: string | null;
  frequency: string | null;
}

export interface Snapshot {
  label: string; // source label, kept verbatim
  date: string; // recorded date, kept verbatim
  meds: MedicationStatement[];
}

export interface Patient {
  name: string;
  born: string;
  a: Snapshot;
  b: Snapshot;
}

export type DiffKind = "changed" | "onlyA" | "onlyB" | "same";

export interface DiffItem {
  id: string;
  name: string;
  kind: DiffKind;
  fields: { key: string; label: string; a: string | null | undefined; b: string | null | undefined; changed: boolean }[];
}

export interface Suggestion {
  proposal: string;
  rationale: string;
  confidence: number; // 0..1, displayed as a number, never as a verdict
  evidence: string[];
}

export interface DataAdapter {
  id: string;
  kind: "db";
  label: string;
  defaultEndpoint?: string;
  health(conn: Connection): Promise<Health>;
  load(patientId: string): Promise<Patient>;
}

export interface ModelAdapter {
  id: string;
  kind: "model";
  label: string;
  defaultEndpoint?: string;
  defaultModel?: string;
  health(conn: Connection): Promise<Health>;
  infer(input: { item: DiffItem; patient: Patient }): Promise<Suggestion>;
}

export type Driver = DataAdapter | ModelAdapter;
