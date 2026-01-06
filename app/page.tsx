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

function downloadTablesAsXlsx(sheets: { name: string; rows: AnyRow[] }[], filename: string) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    if (!sheet.rows || sheet.rows.length === 0) continue;
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  // If all tables are empty, still produce a file with a note sheet
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["No tables available to export. Run an analysis first."]]);
    XLSX.utils.book_append_sheet(wb, ws, "Readme");
  }

  XLSX.writeFile(wb, filename);
}

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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

function FilePicker({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept: string;
  onFile: (f: File | null) => void;
}) {
  return (
    <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <input
        type="file"
        accept={accept}
        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function KpiCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-white shadow p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value ?? "—"}</div>
    </div>
  );
}

function Table({
  title,
  rows,
  columns,
  maxRows = 100,
  percentCols = [],
}: {
  title: string;
  rows: Row[];
  columns: string[];
  maxRows?: number;
  percentCols?: string[];
}) {
  const safeRows = rows ?? [];
  const limited = safeRows.slice(0, maxRows);

  const formatCell = (col: string, val: any) => {
    if (val === null || val === undefined) return "—";
    if (percentCols.includes(col) && typeof val === "number") {
      // if already in 0-100 scale, keep; if 0-1, scale
      const v = val <= 1 ? val * 100 : val;
      return `${v.toFixed(1)}%`;
    }
    if (typeof val === "number") {
      return Number.isInteger(val) ? val.toString() : val.toFixed(2);
    }
    return String(val);
  };

  return (
    <div className="rounded-2xl bg-white shadow p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        <Badge>{safeRows.length} rows</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              {columns.map((c) => (
                <th key={c} className="text-left font-semibold text-slate-700 py-2 pr-4 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {limited.length === 0 ? (
              <tr>
                <td className="py-3 text-slate-500" colSpan={columns.length}>
                  No data.
                </td>
              </tr>
            ) : (
              limited.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {columns.map((c) => (
                    <td key={c} className="py-2 pr-4 text-slate-800 whitespace-nowrap">
                      {formatCell(c, r?.[c])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {safeRows.length > maxRows && (
        <div className="mt-3 text-xs text-slate-500">
          Showing first {maxRows} rows. Export to view the full dataset.
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [courseId, setCourseId] = useState("");
  const [gradebookCsv, setGradebookCsv] = useState<File | null>(null);
  const [echoCsv, setEchoCsv] = useState<File | null>(null);

  const [activeTab, setActiveTab] = useState<"tables" | "charts" | "exports" | "ai">("tables");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const echoSummary = result?.echo?.summary ?? [];
  const echoModules = result?.echo?.modules ?? [];

  const gradeSummary = result?.grades?.summary ?? [];
  const gradeModuleMetrics = result?.grades?.module_metrics ?? [];

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

  const gradeSummaryPercentCols = useMemo(() => {
    if (!gradeSummary?.[0]) return [];
    return Object.keys(gradeSummary[0]).filter((k) => k !== "Metric");
  }, [gradeSummary]);

  const canRun = !!courseId && !!gradebookCsv && !!echoCsv && !!apiBase;

  async function runAnalysis() {
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("course_id", courseId);
      form.append("canvas_gradebook_csv", gradebookCsv as File);
      form.append("echo_analytics_csv", echoCsv as File);

      const res = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Backend error (${res.status}): ${txt}`);
      }

      const json = (await res.json()) as AnalyzeResponse;
      setResult(json);
      setActiveTab("tables");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // auto-switch to tables when new result arrives
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
                <div className="text-sm text-slate-600">Upload your Canvas Gradebook + Echo360 Analytics and run analysis.</div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={runAnalysis}
                  disabled={!canRun || loading}
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {loading ? "Running..." : "Run Analysis"}
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

              <FilePicker label="Canvas Gradebook CSV" accept=".csv" onFile={setGradebookCsv} />
              <FilePicker label="Echo360 Analytics CSV" accept=".csv" onFile={setEchoCsv} />
            </div>

            {error && <div className="mt-4 text-sm text-red-700">{error}</div>}
          </div>

          {result && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(result.kpis ?? {}).map(([k, v]) => (
                  <KpiCard key={k} label={k} value={v} />
                ))}
              </div>

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
                    maxRows={200}
                  />

                  <Table
                    title="Echo Module Overview"
                    rows={echoModules}
                    columns={ECHO_MODULE_COLS}
                    percentCols={ECHO_MODULE_PERCENT_COLS}
                    maxRows={200}
                  />

                  <Table
                    title="Gradebook Summary Rows"
                    rows={gradeSummary}
                    columns={gradeSummary?.[0] ? Object.keys(gradeSummary[0]) : ["Metric"]}
                    percentCols={gradeSummaryPercentCols}
                    maxRows={200}
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
                    <GradebookComboChart rows={gradeModuleMetrics as any[]} />
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
