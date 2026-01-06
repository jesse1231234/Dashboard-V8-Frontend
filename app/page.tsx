"use client";

import React, { useEffect, useMemo, useState } from "react";
import EchoComboChart from "./components/charts/EchoComboChart";
import GradebookComboChart from "./components/charts/GradebookComboChart";

type AnyRow = Record<string, any>;
type Row = Record<string, any>;

type AnalyzeResponse = {
  kpis?: Record<string, any>;
  echo?: {
    summary?: AnyRow[];
    modules?: AnyRow[];
  };
  grades?: {
    summary?: AnyRow[]; // includes "Metric"
    module_metrics?: AnyRow[];
  };
  analysis?: {
    text?: string | null;
    error?: string | null;
  };
};

// ---------- Column presets (match Streamlit intent) ----------
const ECHO_SUMMARY_COLS = [
  "Media Title",
  "Video Duration",
  "# of Unique Views",
  "Total Views",
  "Total Watch Time (Min)",
  "Average View %",
  "% of Students Viewing",
  "% of Video Viewed Overall",
];

const ECHO_MODULE_COLS = ["Module", "Average View %", "# of Students Viewing", "Overall View %", "# of Students"];

const GRADEBOOK_MODULE_COLS = ["Module", "Avg % Turned In", "Avg Average Excluding Zeros", "n_assignments"];

const ECHO_SUMMARY_PERCENT_COLS = ["Average View %", "% of Students Viewing", "% of Video Viewed Overall"];
const ECHO_MODULE_PERCENT_COLS = ["Average View %", "Overall View %"];
const GRADEBOOK_MODULE_PERCENT_COLS = ["Avg % Turned In", "Avg Average Excluding Zeros"];

// ---------- Formatting helpers ----------
function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/%/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatNumberCell(n: number) {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercentCell(v: any) {
  const n = toNumber(v);
  if (n === null) return "";
  const pct = n * 100;
  return `${pct.toFixed(1)}%`;
}

function formatCell(key: string, value: any, percentCols?: string[]) {
  if (value === null || value === undefined) return "";

  if (percentCols?.includes(key)) return formatPercentCell(value);

  // Auto percent if header includes % and value looks like proportion
  const n = toNumber(value);
  if (key.includes("%") && n !== null && n >= 0 && n <= 1.5) {
    return formatPercentCell(n);
  }

  if (typeof value === "number") return formatNumberCell(value);
  if (n !== null && String(value).match(/^[\d,\.\-]+%?$/)) return formatNumberCell(n);

  return String(value);
}

// ---------- Option B: measure + set widths via colgroup ----------
function isTextHeavyCol(col: string) {
  return /title|name|media|assignment|page|url|link|description/i.test(col);
}

function isNumericishCol(col: string) {
  return /%|count|views|time|duration|avg|total|n_/i.test(col);
}

function buildColWidths(
  rows: AnyRow[],
  cols: string[],
  percentCols?: string[],
  opts?: {
    sample?: number;
    font?: string;
    paddingPx?: number;
    minPx?: number;
    maxTextPx?: number;
    maxDefaultPx?: number;
  }
) {
  const sample = opts?.sample ?? 80;
  const font = opts?.font ?? "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const paddingPx = opts?.paddingPx ?? 22; // cell padding + some breathing room
  const minPx = opts?.minPx ?? 70;
  const maxTextPx = opts?.maxTextPx ?? 520; // cap long text columns
  const maxDefaultPx = opts?.maxDefaultPx ?? 320;

  // SSR safety
  if (typeof document === "undefined") return {};

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return {};

  ctx.font = font;

  const widths: Record<string, number> = {};
  const take = rows.slice(0, sample);

  for (const c of cols) {
    let max = ctx.measureText(String(c)).width;

    for (const r of take) {
      const txt = String(formatCell(c, r?.[c], percentCols) ?? "");
      const w = ctx.measureText(txt).width;
      if (w > max) max = w;
    }

    const padded = Math.ceil(max + paddingPx);

    const cap = isTextHeavyCol(c) ? maxTextPx : maxDefaultPx;
    const clamped = Math.max(minPx, Math.min(padded, cap));

    // Numeric-ish columns can be tighter
    widths[c] = isNumericishCol(c) && !isTextHeavyCol(c) ? Math.min(clamped, 180) : clamped;
  }

  return widths;
}

// ---------- Table component ----------
function Table({
  title,
  rows,
  columns,
  percentCols,
  maxRows = 50,
}: {
  title: string;
  rows: AnyRow[];
  columns?: string[];
  percentCols?: string[];
  maxRows?: number;
}) {
  const cols = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const keys = Object.keys(rows[0] ?? {});
    if (!columns || columns.length === 0) return keys;

    const set = new Set(keys);
    const picked = columns.filter((c) => set.has(c));

    // Don’t collapse to 1 col if mismatch—fall back to all keys
    if (picked.length <= 1 && keys.length > 1) return keys;

    return picked;
  }, [rows, columns]);

  const slice = useMemo(() => rows.slice(0, maxRows), [rows, maxRows]);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!slice.length || !cols.length) {
      setColWidths({});
      return;
    }

    const widths = buildColWidths(rows, cols, percentCols, {
      sample: Math.min(120, rows.length),
      font: "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      paddingPx: 20,
      minPx: 70,
      maxTextPx: 520,
      maxDefaultPx: 320,
    });

    setColWidths(widths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols.join("|"), (percentCols ?? []).join("|"), maxRows]);

  return (
    <div className="rounded-2xl bg-white shadow p-4 min-w-0">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">
          Showing {slice.length.toLocaleString()}
          {rows.length > slice.length ? ` of ${rows.length.toLocaleString()}` : ""} rows
        </div>
      </div>

      {slice.length === 0 ? (
        <div className="text-sm text-slate-600">No data.</div>
      ) : (
        // Individual table scroll container (x + y), with a fixed max height and sticky header
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {/* This box is constrained to the card width (screen-width container) */}
          <div className="w-full max-h-[520px] overflow-x-auto overflow-y-auto">
            {/* Table can be wider than the box; scroll happens on the box */}
            <table className="w-max text-sm table-fixed">

              <colgroup>
                {cols.map((c) => (
                  <col key={c} style={colWidths[c] ? { width: `${colWidths[c]}px` } : undefined} />
                ))}
              </colgroup>

              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  {cols.map((c) => {
                    const textHeavy = isTextHeavyCol(c);
                    return (
                      <th
                        key={c}
                        className={`text-left px-2 py-1 text-xs font-semibold text-slate-700 align-top ${
                          textHeavy ? "break-words" : "whitespace-nowrap"
                        }`}
                      >
                        {c}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {slice.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    {cols.map((c) => {
                      const textHeavy = isTextHeavyCol(c);
                      return (
                        <td
                          key={c}
                          className={`px-2 py-1 text-xs leading-snug text-slate-800 align-top ${
                            textHeavy ? "break-words" : "whitespace-nowrap"
                          }`}
                        >
                          {formatCell(c, r[c], percentCols)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeTab, setActiveTab] = useState<"tables" | "charts" | "exports" | "ai">("tables");

  const [courseId, setCourseId] = useState("");
  const [canvasCsv, setCanvasCsv] = useState<File | null>(null);
  const [echoCsv, setEchoCsv] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const echoSummary = result?.echo?.summary ?? [];
  const echoModules = result?.echo?.modules ?? [];

  const gradeSummary = result?.grades?.summary ?? [];
  const gradeModuleMetrics = result?.grades?.module_metrics ?? [];

  const gradeSummaryPercentCols = useMemo(() => {
    if (!gradeSummary?.[0]) return [];
    return Object.keys(gradeSummary[0]).filter((k) => k !== "Metric");
  }, [gradeSummary]);

  async function runAnalysis() {
    setError(null);

    if (!apiBase) {
      setError("Missing NEXT_PUBLIC_API_BASE_URL environment variable in Vercel.");
      return;
    }
    if (!courseId.trim()) {
      setError("Please enter a Canvas Course ID (number).");
      return;
    }
    if (!canvasCsv || !echoCsv) {
      setError("Please upload both CSV files.");
      return;
    }

    try {
      setLoading(true);

      const form = new FormData();
      form.append("course_id", courseId.trim());
      form.append("canvas_gradebook_csv", canvasCsv);
      form.append("echo_analytics_csv", echoCsv);

      const res = await fetch(`${apiBase.replace(/\/$/, "")}/analyze`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Backend error (${res.status}): ${txt}`);
      }

      const json = (await res.json()) as AnalyzeResponse;
      setResult(json);
      setStep(3);
      setActiveTab("tables");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      {/* Screen-width container (centered), with normal padding */}
      <div className="mx-auto max-w-screen-2xl px-6 py-6">
        <div className="text-2xl font-bold text-slate-900 mb-1">CLE Analytics Dashboard</div>
        <div className="text-sm text-slate-600 mb-6">Vercel (Frontend) + Render (Backend)</div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="rounded-2xl bg-white shadow p-6">
            <div className="text-lg font-semibold text-slate-900 mb-2">Step 1: Enter Course</div>
            <div className="text-sm text-slate-600 mb-3">
              Use the numeric Canvas Course ID (the number in the course URL).
            </div>

            <label className="block text-sm text-slate-700 mb-1">Canvas Course ID</label>
            <input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g., 123456"
            />

            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep(2)} className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl bg-white shadow p-6">
            <div className="text-lg font-semibold text-slate-900 mb-2">Step 2: Upload CSVs</div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Canvas Gradebook CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCanvasCsv(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
                <div className="text-xs text-slate-500 mt-1">{canvasCsv ? canvasCsv.name : "No file selected"}</div>
              </div>

              <div>
                <label className="block text-sm text-slate-700 mb-1">Echo360 Analytics CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setEchoCsv(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
                <div className="text-xs text-slate-500 mt-1">{echoCsv ? echoCsv.name : "No file selected"}</div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800"
              >
                Back
              </button>

              <button
                onClick={runAnalysis}
                disabled={loading}
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                {loading ? "Running..." : "Run Analysis"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              {(["tables", "charts", "exports", "ai"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`rounded-xl px-4 py-2 text-sm ${
                    activeTab === t ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-800"
                  }`}
                >
                  {t === "tables"
                    ? "Tables"
                    : t === "charts"
                    ? "Charts"
                    : t === "exports"
                    ? "Exports"
                    : "AI Analysis"}
                </button>
              ))}
            </div>

            {activeTab === "tables" && (
              <div className="grid gap-4">
                <Table
                  title="Echo Summary"
                  rows={echoSummary}
                  columns={ECHO_SUMMARY_COLS}
                  percentCols={ECHO_SUMMARY_PERCENT_COLS}
                  maxRows={200}
                />

                <Table
                  title="Echo Module Table"
                  rows={echoModules}
                  columns={ECHO_MODULE_COLS}
                  percentCols={ECHO_MODULE_PERCENT_COLS}
                  maxRows={200}
                />

                <Table
                  title="Gradebook Summary Rows"
                  rows={gradeSummary}
                  columns={
                    gradeSummary?.[0]?.Metric
                      ? ["Metric", ...Object.keys(gradeSummary[0]).filter((k) => k !== "Metric")]
                      : undefined
                  }
                  percentCols={gradeSummaryPercentCols}
                  maxRows={50}
                />

                <Table
                  title="Gradebook Module Metrics"
                  rows={gradeModuleMetrics}
                  columns={GRADEBOOK_MODULE_COLS}
                  percentCols={GRADEBOOK_MODULE_PERCENT_COLS}
                  maxRows={200}
                />
              </div>
            )}

            {activeTab === "charts" && (
              <div className="grid gap-4">
                <div className="rounded-2xl bg-white shadow p-6">
                  <div className="text-lg font-semibold text-slate-900 mb-2">Echo Chart</div>
                  <EchoComboChart moduleRows={echoModules as any} />
                </div>

                <div className="rounded-2xl bg-white shadow p-6">
                  <div className="text-lg font-semibold text-slate-900 mb-2">Gradebook Chart</div>
                  <GradebookComboChart rows={gradeModuleMetrics as any} />
                </div>
              </div>
            )}

            {activeTab === "exports" && (
              <div className="rounded-2xl bg-white shadow p-6">
                <div className="text-lg font-semibold text-slate-900 mb-2">Exports</div>
                <div className="text-sm text-slate-600">Add your CSV export buttons here.</div>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="rounded-2xl bg-white shadow p-6">
                <div className="text-lg font-semibold text-slate-900 mb-2">AI Analysis</div>
                {result?.analysis?.error ? (
                  <div className="text-sm text-red-700">{result.analysis.error}</div>
                ) : (
                  <pre className="text-sm whitespace-pre-wrap text-slate-800">
                    {result?.analysis?.text ?? "No AI analysis returned."}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
