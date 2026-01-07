"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
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

// --- XLSX Export helper (added) ---
function downloadTablesAsXlsx(
  sheets: { name: string; rows: Record<string, any>[] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    if (!sheet.rows || sheet.rows.length === 0) continue;
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  // If everything is empty, still generate a file with a note.
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["No tables available to export. Run an analysis first."]]);
    XLSX.utils.book_append_sheet(wb, ws, "Readme");
  }

  XLSX.writeFile(wb, filename);
}
// --- end XLSX Export helper ---

// ---- Column presets ----
const ECHO_SUMMARY_COLS = [
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
const ECHO_MODULE_PERCENT_COLS = ["Average View %", "Overall View %", "# of Students Viewing"];
const GRADEBOOK_MODULE_PERCENT_COLS = ["Avg % Turned In", "Avg Average Excluding Zeros"];

// ---- Formatters ----
function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
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
  const n = toNumber(value);
  if (n !== null) return formatNumberCell(n);
  return String(value);
}

// ---- Table ----
function buildColWidths(rows: Row[], cols: string[], percentCols?: string[]) {
  const maxChar = (s: string) => Math.min(36, Math.max(8, s.length));
  const widths: Record<string, number> = {};

  for (const c of cols) widths[c] = maxChar(c);
  for (const r of rows.slice(0, 50)) {
    for (const c of cols) {
      const val = formatCell(c, r?.[c], percentCols);
      widths[c] = Math.max(widths[c], maxChar(val));
    }
  }
  return widths;
}

function Table({
  rows,
  title,
  columns,
  percentCols,
}: {
  rows: Row[];
  title?: string;
  columns?: string[];
  percentCols?: string[];
}) {
  const cols = useMemo(() => {
    if (columns?.length) return columns;
    if (rows?.length) return Object.keys(rows[0]);
    return [];
  }, [columns, rows]);

  const colWidths = useMemo(() => buildColWidths(rows ?? [], cols, percentCols), [rows, cols, percentCols]);

  return (
    <div className="rounded-2xl bg-white shadow p-6">
      {title && <div className="text-lg font-semibold text-slate-900 mb-2">{title}</div>}

      {(!rows || rows.length === 0) && <div className="text-sm text-slate-600">No data.</div>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {cols.map((c) => (
                  <th
                    key={c}
                    className="text-left font-semibold text-slate-700 py-2 pr-4 whitespace-nowrap"
                    style={{ minWidth: `${colWidths[c] ?? 10}ch` }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {cols.map((c) => (
                    <td
                      key={c}
                      className="py-2 pr-4 text-slate-800 whitespace-nowrap"
                      style={{ minWidth: `${colWidths[c] ?? 10}ch` }}
                    >
                      {formatCell(c, r[c], percentCols)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [courseId, setCourseId] = useState("");
  const [canvasCsv, setCanvasCsv] = useState<File | null>(null);
  const [echoCsv, setEchoCsv] = useState<File | null>(null);

  const [activeTab, setActiveTab] = useState<"tables" | "charts" | "exports" | "ai">("tables");

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const echoSummary = result?.echo?.summary ?? [];
  const echoModules = result?.echo?.modules ?? [];
  const gradeSummary = result?.grades?.summary ?? [];
  const gradeModuleMetrics = result?.grades?.module_metrics ?? [];

  // --- XLSX download handler (added) ---
  const downloadTablesXlsx = () => {
    if (!result) return;
    downloadTablesAsXlsx(
      [
        { name: "Echo Summary", rows: echoSummary },
        { name: "Echo Modules", rows: echoModules },
        { name: "Gradebook Summary", rows: gradeSummary },
        { name: "Gradebook Module Metrics", rows: gradeModuleMetrics },
      ],
      "course_analytics_tables.xlsx"
    );
  };
  // --- end XLSX download handler ---

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
      setError("Please upload both the Canvas Gradebook CSV and Echo Analytics CSV.");
      return;
    }

    try {
      const form = new FormData();
      form.append("course_id", courseId);
      form.append("canvas_gradebook_csv", canvasCsv);
      form.append("echo_analytics_csv", echoCsv);

      const res = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const txt = await res.text();
        setError(`Backend error (${res.status}): ${txt}`);
        return;
      }

      const json = (await res.json()) as AnalyzeResponse;
      setResult(json);
      setActiveTab("tables");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  }

  useEffect(() => {
    if (result) setActiveTab("tables");
  }, [result]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white shadow p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-2xl font-bold text-slate-900">CLE Analytics Dashboard</div>
                <div className="text-sm text-slate-600">
                  Upload your Canvas Gradebook + Echo360 Analytics and run analysis.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={runAnalysis}
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold"
                >
                  Run Analysis
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-900 mb-2">Course ID</div>
                <input
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  placeholder="e.g., 208393"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                {!apiBase && (
                  <div className="mt-2 text-xs text-amber-700">
                    NEXT_PUBLIC_API_BASE_URL is not set. Configure it in Vercel env vars.
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-900">Canvas Gradebook CSV</div>
                <input
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                  onChange={(e) => setCanvasCsv(e.target.files?.[0] ?? null)}
                />
              </label>

              <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-slate-900">Echo360 Analytics CSV</div>
                <input
                  type="file"
                  accept=".csv"
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                  onChange={(e) => setEchoCsv(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {error && <div className="mt-4 text-sm text-red-700">{error}</div>}
          </div>

          {result && (
            <div className="grid gap-4">
              <div className="flex gap-2 flex-wrap">
                {(["tables", "charts", "exports", "ai"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      activeTab === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"
                    }`}
                  >
                    {t === "tables" ? "Tables" : t === "charts" ? "Charts" : t === "exports" ? "Exports" : "AI Analysis"}
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
                  />

                  <Table
                    title="Echo Module Overview"
                    rows={echoModules}
                    columns={ECHO_MODULE_COLS}
                    percentCols={ECHO_MODULE_PERCENT_COLS}
                  />

                  <Table
                    title="Gradebook Summary Rows"
                    rows={gradeSummary}
                    columns={gradeSummary?.[0] ? Object.keys(gradeSummary[0]) : ["Metric"]}
                    percentCols={gradeSummaryPercentCols}
                  />

                  <Table
                    title="Gradebook Module Metrics"
                    rows={gradeModuleMetrics}
                    columns={GRADEBOOK_MODULE_COLS}
                    percentCols={GRADEBOOK_MODULE_PERCENT_COLS}
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
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-lg font-semibold text-slate-900">Exports</div>

                    <button
                      onClick={downloadTablesXlsx}
                      disabled={!result}
                      className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-60"
                      title={!result ? "Run an analysis first" : "Download all tables as an Excel workbook"}
                    >
                      Download tables (XLSX)
                    </button>
                  </div>

                  <div className="text-sm text-slate-600">
                    Downloads one Excel file with each table in its own sheet.
                  </div>
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
      </div>
    </main>
  );
}
