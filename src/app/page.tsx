"use client";

import { useMemo, useRef, useState } from "react";

type Data = { headers: string[]; rows: string[][] };

const box =
  "rounded-2xl border border-[#e5e0ec] bg-white p-5 shadow-sm sm:p-6";
const btn =
  "rounded-xl border border-[#ded6ea] bg-white px-4 py-2.5 text-sm font-semibold text-[#594775] transition hover:border-purple-400 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40";
const select =
  "w-full rounded-xl border border-[#ded6ea] bg-[#faf8fd] px-3 py-2.5 text-sm text-[#352746] outline-none focus:border-purple-500";

function numberOf(value: string): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, n) => sum + n, 0) / values.length
    : null;
}

function missingCount(rows: string[][]) {
  return rows.reduce(
    (sum, row) => sum + row.filter((cell) => !cell.trim()).length,
    0
  );
}

function duplicatesCount(rows: string[][]) {
  return rows.length - new Set(rows.map((row) => JSON.stringify(row))).size;
}

function readCSV(text: string): Data {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;

  const source = text.replace(/^\uFEFF/, "");

  function endField() {
    row.push(field);
    field = "";
    closed = false;
  }

  function endRow() {
    endField();
    records.push(row);
    row = [];
  }

  for (let i = 0; i < source.length; i++) {
    const c = source[i];

    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === ",") {
      endField();
    } else if (c === "\n" || c === "\r") {
      endRow();
      if (c === "\r" && source[i + 1] === "\n") i++;
    } else if (c === '"') {
      if (field.length || closed) throw new Error("Invalid CSV quotes.");
      quoted = true;
    } else if (closed) {
      if (c !== " " && c !== "\t") {
        throw new Error("Unexpected text after a quoted value.");
      }
    } else {
      field += c;
    }
  }

  if (quoted) throw new Error("A quoted value is not closed.");
  if (field.length || row.length || closed) endRow();

  const valid = records.filter(
    (record) => record.length > 1 || record[0].trim() !== ""
  );

  if (valid.length < 2) {
    throw new Error("Include a header row and at least one data row.");
  }

  const headers = valid[0].map((cell) => cell.trim());
  const rows = valid.slice(1);

  if (headers.some((header) => !header)) {
    throw new Error("Every column needs a name.");
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error("Column names must be unique.");
  }

  if (rows.some((record) => record.length !== headers.length)) {
    throw new Error("Rows have different column counts. Check commas and quotes.");
  }

  if (rows.length > 10000 || headers.length > 100) {
    throw new Error("Maximum: 10,000 rows and 100 columns.");
  }

  return { headers, rows };
}

function demo(): Data {
  const rows = Array.from({ length: 50 }, (_, i) => [
    `S${String(i + 1).padStart(3, "0")}`,
    `Demo Student ${i + 1}`,
    ["Education", "Statistics", "Commerce", "Computer Science"][i % 4],
    String((i % 4) + 1),
    String(45 + ((i * 7) % 54)),
    String(60 + ((i * 3) % 41)),
    String(1 + (i % 6)),
  ]);

  rows[4][4] = "";
  rows[12][5] = "";
  rows[23][4] = "";
  rows[36][6] = "";
  rows[43][2] = "";
  rows.push([...rows[2]], [...rows[17]], [...rows[31]]);

  return {
    headers: [
      "Student_ID",
      "Student_Name",
      "Department",
      "Semester",
      "Marks",
      "Attendance_Percent",
      "Study_Hours_Per_Day",
    ],
    rows,
  };
}

function exportCSV(data: Data) {
  function cell(value: string) {
    const formula =
      /^[=+@\t\r]/.test(value) ||
      (/^-/.test(value) && numberOf(value) === null);

    const safe = formula ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  const csv = [data.headers, ...data.rows]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");

  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = "datalens_cleaned.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmt(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function short(value: string) {
  return value.length > 18 ? `${value.slice(0, 16)}…` : value;
}

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Data | null>(demo);
  const [original, setOriginal] = useState<Data | null>(demo);
  const [filename, setFilename] = useState("demo_students.csv");
  const [tab, setTab] = useState("Overview");
  const [metric, setMetric] = useState("Marks");
  const [category, setCategory] = useState("Department");
  const [xColumn, setXColumn] = useState("Study_Hours_Per_Day");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Fictional demo data is ready: 53 rows. Upload your own CSV to explore your data.");
  const [error, setError] = useState("");

  const headers = data?.headers ?? [];
  const rows = data?.rows ?? [];

  const numericColumns = useMemo(() => {
    if (!data) return [];

    return data.headers.filter((_, column) => {
      const present = data.rows
        .map((row) => row[column])
        .filter((value) => value.trim());

      return (
        present.length > 0 &&
        present.every((value) => numberOf(value) !== null)
      );
    });
  }, [data]);

  const activeMetric = numericColumns.includes(metric)
    ? metric
    : numericColumns[0] ?? "";

  const activeX = numericColumns.includes(xColumn)
    ? xColumn
    : numericColumns.find((column) => column !== activeMetric) ??
      numericColumns[0] ??
      "";

  const activeCategory = headers.includes(category)
    ? category
    : headers[0] ?? "";

  const metricIndex = headers.indexOf(activeMetric);
  const xIndex = headers.indexOf(activeX);
  const categoryIndex = headers.indexOf(activeCategory);

  const values = rows
    .map((row) => numberOf(row[metricIndex] ?? ""))
    .filter((n): n is number => n !== null);

  const missing = missingCount(rows);
  const duplicates = duplicatesCount(rows);
  const cells = rows.length * headers.length;
  const completeness = cells ? ((cells - missing) / cells) * 100 : 0;

  const groups = useMemo(() => {
    const map = new Map<string, { count: number; values: number[] }>();

    if (!data || categoryIndex < 0) return [];

    for (const row of data.rows) {
      const label = row[categoryIndex].trim() || "(Missing)";
      const entry = map.get(label) ?? { count: 0, values: [] };
      entry.count++;
      const value = numberOf(row[metricIndex] ?? "");
      if (value !== null) entry.values.push(value);
      map.set(label, entry);
    }

    return Array.from(map, ([label, entry]) => ({
      label,
      count: entry.count,
      average: mean(entry.values),
    }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [data, categoryIndex, metricIndex]);

  const histogram = useMemo(() => {
    if (!values.length) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      return [{ label: fmt(min), count: values.length }];
    }

    const width = (max - min) / 6;
    const bins = Array.from({ length: 6 }, (_, i) => ({
      label: `${fmt(min + i * width)}–${fmt(min + (i + 1) * width)}`,
      count: 0,
    }));

    values.forEach((value) => {
      const index = Math.min(5, Math.floor((value - min) / width));
      bins[index].count++;
    });

    return bins;
  }, [values]);

  const points = rows
    .map((row) => ({
      x: numberOf(row[xIndex] ?? ""),
      y: numberOf(row[metricIndex] ?? ""),
    }))
    .filter(
      (point): point is { x: number; y: number } =>
        point.x !== null && point.y !== null
    );

  const minX = points.length ? Math.min(...points.map((p) => p.x)) : 0;
  const maxX = points.length ? Math.max(...points.map((p) => p.x)) : 1;
  const minY = points.length ? Math.min(...points.map((p) => p.y)) : 0;
  const maxY = points.length ? Math.max(...points.map((p) => p.y)) : 1;

  function plotX(x: number) {
    return minX === maxX ? 290 : 65 + ((x - minX) / (maxX - minX)) * 450;
  }

  function plotY(y: number) {
    return minY === maxY ? 125 : 215 - ((y - minY) / (maxY - minY)) * 180;
  }

  const comparisons = [
    {
      label: "Rows",
      before: original?.rows.length ?? 0,
      after: rows.length,
    },
    {
      label: "Missing cells",
      before: original ? missingCount(original.rows) : 0,
      after: missing,
    },
    {
      label: "Duplicate rows",
      before: original ? duplicatesCount(original.rows) : 0,
      after: duplicates,
    },
  ];

  const filtered = rows.filter((row) =>
    row.some((cell) => cell.toLowerCase().includes(search.toLowerCase()))
  );

  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const preview = filtered.slice((currentPage - 1) * 10, currentPage * 10);

  function load(dataset: Data, name: string) {
    setData(dataset);
    setOriginal(dataset);
    setFilename(name);
    setMetric(dataset.headers.includes("Marks") ? "Marks" : "");
    setCategory(
      dataset.headers.includes("Department")
        ? "Department"
        : dataset.headers[0]
    );
    setXColumn(
      dataset.headers.includes("Study_Hours_Per_Day")
        ? "Study_Hours_Per_Day"
        : ""
    );
    setSearch("");
    setPage(1);
    setTab("Overview");
    setError("");
    setMessage(`${name} loaded successfully: ${dataset.rows.length} rows.`);
  }

  async function upload(file: File) {
    setError("");

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a CSV smaller than 5 MB.");
      return;
    }

    setBusy(true);

    try {
      load(readCSV(await file.text()), file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to read CSV.");
    } finally {
      setBusy(false);
    }
  }

  function clean(action: "trim" | "duplicates" | "missing") {
    if (!data) return;

    let updated = data.rows;
    let info = "";

    if (action === "trim") {
      let changed = 0;
      updated = data.rows.map((row) =>
        row.map((cell) => {
          if (cell !== cell.trim()) changed++;
          return cell.trim();
        })
      );
      info = `Trimmed whitespace in ${changed} cells.`;
    }

    if (action === "duplicates") {
      const seen = new Set<string>();
      updated = data.rows.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      info = `Removed ${data.rows.length - updated.length} duplicate rows.`;
    }

    if (action === "missing") {
      updated = data.rows.filter((row) =>
        row.every((cell) => cell.trim() !== "")
      );
      info = `Removed ${data.rows.length - updated.length} incomplete rows.`;
    }

    setData({ ...data, rows: updated });
    setPage(1);
    setMessage(info);
  }

  const navigation = [
    ["Overview", "◈"],
    ["Data Explorer", "▦"],
    ["Cleaning Studio", "✦"],
  ];

  return (
    <main className="min-h-screen bg-[#f7f5ef] font-sans text-[#30263f] selection:bg-purple-200">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-[#e5e0ec] bg-white p-6 lg:flex">
        <a href="#" className="flex items-center gap-3 text-xl font-extrabold">
          <span className="rounded-xl bg-[#7550b6] px-3 py-2 text-white">▥</span>
          Data<span className="-ml-3 text-[#7550b6]">Lens</span>
        </a>

        <p className="mb-4 mt-12 text-[10px] font-bold uppercase tracking-[0.2em] text-[#978ba5]">
          Your workspace
        </p>

        <nav aria-label="Main navigation" className="space-y-2">
          {navigation.map(([label, icon]) => (
            <button
              key={label}
              onClick={() => setTab(label)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                tab === label
                  ? "bg-[#eee6f8] text-[#7045a8]"
                  : "text-[#81758e] hover:bg-[#f7f4fb]"
              }`}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-teal-100 bg-[#edf8f4] p-4">
          <p className="text-sm font-semibold text-teal-800">
            Private by design
          </p>
          <p className="mt-2 text-xs leading-6 text-teal-700">
            CSV processing happens in this browser tab. Refreshing restores the
            fictional demo data.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
            FJ
          </span>
          <div>
            <p className="text-xs font-semibold">Farkhanda Jabeen</p>
            <p className="mt-1 text-[10px] text-[#978ba5]">Portfolio project</p>
          </div>
        </div>
      </aside>

      <div className="lg:ml-60">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e0ec] bg-white/70 px-5 py-5 sm:px-8">
          <p className="text-sm text-[#8b7e99]">
            Workspace <span className="mx-2">/</span>
            <span className="font-semibold text-[#564368]">{tab}</span>
          </p>
          <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">
            ● Local browser workspace
          </span>
        </header>

        <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
          <section className="relative overflow-hidden rounded-3xl border border-purple-100 bg-gradient-to-br from-[#eee5fa] via-[#f6f0fc] to-[#edf8f3] p-6 sm:p-8">
            <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8060a9]">
                  A clearer view of your data
                </p>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Small details. Meaningful insights.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-7 text-[#857391]">
                  Clean your CSV, explore patterns and turn numbers into a
                  visual story.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={() => load(demo(), "demo_students.csv")} className={btn}>
                  Load demo
                </button>
                <button
                  disabled={!data || !rows.length}
                  onClick={() => data && exportCSV(data)}
                  className={btn}
                >
                  ↓ Export CSV
                </button>
                <button
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  className="rounded-xl bg-[#7550b6] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-200 transition hover:bg-[#64409e] disabled:opacity-50"
                >
                  {busy ? "Reading..." : "↑ Upload CSV"}
                </button>
              </div>
            </div>
          </section>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose CSV"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />

          <nav aria-label="Mobile navigation" className="flex flex-wrap gap-2 lg:hidden">
            {navigation.map(([label]) => (
              <button
                key={label}
                onClick={() => setTab(label)}
                className={`${btn} ${tab === label ? "bg-purple-100" : ""}`}
              >
                {label}
              </button>
            ))}
          </nav>

          <p
            role="status"
            aria-live="polite"
            className="rounded-xl border border-teal-100 bg-[#edf8f4] px-4 py-3 text-sm leading-6 text-teal-800"
          >
            {message}
          </p>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </p>
          )}

          {!data ? (
            <section className={`${box} py-16 text-center`}>
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-50 text-4xl text-purple-500">
                ↑
              </span>
              <h2 className="mt-6 text-2xl font-bold">Meet your data.</h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#8b7e99]">
                Upload a comma-separated CSV with column headers, or load our
                fictional student demo.
              </p>
              <button
                onClick={() => fileInput.current?.click()}
                className={`${btn} mt-6`}
              >
                Choose CSV file
              </button>
              <p className="mt-5 text-xs text-[#a095aa]">
                Up to 5 MB · 10,000 rows · 100 columns
              </p>
            </section>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Total rows", rows.length.toLocaleString(), `${headers.length} columns`, "text-purple-700", "bg-purple-50"],
                  ["Missing cells", String(missing), "Empty cells in current data", "text-amber-700", "bg-amber-50"],
                  ["Duplicate rows", String(duplicates), "Identical extra rows", "text-rose-600", "bg-rose-50"],
                  ["Completeness", `${completeness.toFixed(1)}%`, "Non-empty cells", "text-teal-700", "bg-teal-50"],
                ].map(([label, value, detail, color, background]) => (
                  <div key={label} className={box}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[#8b7e99]">{label}</p>
                      <span className={`rounded-lg px-2.5 py-1 ${background} ${color}`}>✦</span>
                    </div>
                    <p className={`mt-4 text-3xl font-bold ${color}`}>{value}</p>
                    <p className="mt-2 text-xs text-[#a095aa]">{detail}</p>
                  </div>
                ))}
              </section>

              {tab === "Overview" && (
                <>
                  <section className={box}>
                    <div className="grid items-end gap-4 sm:grid-cols-3">
                      <div>
                        <h2 className="font-bold">Explore your dataset</h2>
                        <p className="mt-2 text-xs leading-6 text-[#978ba5]">
                          Charts use the current data after cleaning.
                        </p>
                      </div>

                      <label className="text-xs font-medium text-[#857391]">
                        Group by
                        <select
                          value={activeCategory}
                          onChange={(e) => setCategory(e.target.value)}
                          className={`${select} mt-2`}
                        >
                          {headers.map((header) => <option key={header}>{header}</option>)}
                        </select>
                      </label>

                      <label className="text-xs font-medium text-[#857391]">
                        Numeric measure
                        <select
                          value={activeMetric}
                          disabled={!numericColumns.length}
                          onChange={(e) => setMetric(e.target.value)}
                          className={`${select} mt-2`}
                        >
                          {!numericColumns.length && <option value="">No numeric columns</option>}
                          {numericColumns.map((header) => <option key={header}>{header}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-2">
                    <div className={box}>
                      <h2 className="font-bold">Category breakdown</h2>
                      <p className="mt-2 text-xs text-[#978ba5]">Top 8 categories by row count</p>
                      <div className="mt-6 space-y-4">
                        {groups.map((group) => (
                          <div key={group.label}>
                            <div className="mb-2 flex justify-between gap-3 text-xs">
                              <span className="truncate">{group.label}</span>
                              <span className="text-[#978ba5]">{group.count} rows</span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-purple-50">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#9770cf] to-[#7250aa]"
                                style={{
                                  width: `${(group.count / Math.max(1, ...groups.map((g) => g.count))) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                        {!groups.length && <p className="text-sm text-[#978ba5]">No rows available.</p>}
                      </div>
                    </div>

                    <div className={box}>
                      <h2 className="font-bold">Dataset completeness</h2>
                      <p className="mt-2 text-xs text-[#978ba5]">Non-empty cells across the current data</p>
                      <div className="relative mx-auto mt-6 h-48 w-48">
                        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`${completeness.toFixed(1)} percent complete`}>
                          <circle cx="60" cy="60" r="48" fill="none" stroke="#e6f3ee" strokeWidth="10" />
                          <circle
                            cx="60" cy="60" r="48" fill="none"
                            stroke="#39a68f" strokeWidth="10"
                            strokeDasharray={`${(completeness / 100) * 301.593} 301.593`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-teal-700">{completeness.toFixed(1)}%</span>
                          <span className="mt-2 text-xs text-[#978ba5]">complete</span>
                        </div>
                      </div>
                      <p className="mt-5 text-center text-xs leading-6 text-[#978ba5]">
                        Completeness does not measure accuracy or validity.
                      </p>
                    </div>

                    <div className={box}>
                      <h2 className="font-bold">Value distribution</h2>
                      <p className="mt-2 text-xs text-[#978ba5]">
                        {activeMetric || "Select a numeric measure"} · equal-width bins; final bin includes maximum
                      </p>
                      {histogram.length ? (
                        <div className="mt-8 flex h-56 items-end gap-2 border-b border-purple-100 pb-1 sm:gap-4">
                          {histogram.map((bin) => (
                            <div key={bin.label} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                              <span className="mb-2 text-xs font-semibold text-purple-700">{bin.count}</span>
                              <div
                                title={`${bin.label}: ${bin.count} rows`}
                                className="mx-auto w-full max-w-16 rounded-t-lg bg-gradient-to-t from-[#8058b8] to-[#b59bd8]"
                                style={{
                                  height: `${(bin.count / Math.max(1, ...histogram.map((b) => b.count))) * 140}px`,
                                  minHeight: bin.count ? 3 : 0,
                                }}
                              />
                              <span className="mt-3 h-9 break-words text-[9px] leading-4 text-[#978ba5]">{bin.label}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-16 text-center text-sm text-[#978ba5]">No numeric data to display.</p>
                      )}
                    </div>

                    <div className={box}>
                      <h2 className="font-bold">Category averages</h2>
                      <p className="mt-2 text-xs text-[#978ba5]">
                        Mean {activeMetric || "value"} by {activeCategory} · missing values excluded
                      </p>
                      <div className="mt-7 space-y-4">
                        {groups.map((group) => {
                          const max = Math.max(1, ...groups.map((g) => Math.abs(g.average ?? 0)));
                          return (
                            <div key={group.label}>
                              <div className="mb-2 flex justify-between gap-3 text-xs">
                                <span className="truncate">{group.label}</span>
                                <span className="font-semibold text-teal-700">{fmt(group.average)}</span>
                              </div>
                              <div className="h-3 overflow-hidden rounded-full bg-teal-50">
                                <div
                                  className="h-full rounded-full bg-[#49aa96]"
                                  style={{ width: `${(Math.abs(group.average ?? 0) / max) * 100}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-5 text-[10px] leading-5 text-[#978ba5]">
                        Bar lengths show absolute magnitude; labels preserve negative signs.
                      </p>
                    </div>

                    <div className={box}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="font-bold">Relationship explorer</h2>
                          <p className="mt-2 text-xs text-[#978ba5]">Paired numeric values · association is not causation</p>
                        </div>
                        <label className="w-full text-xs text-[#857391] sm:w-44">
                          X-axis
                          <select
                            value={activeX}
                            disabled={!numericColumns.length}
                            onChange={(e) => setXColumn(e.target.value)}
                            className={`${select} mt-2`}
                          >
                            {!numericColumns.length && <option value="">No numeric columns</option>}
                            {numericColumns.map((column) => <option key={column}>{column}</option>)}
                          </select>
                        </label>
                      </div>

                      {points.length ? (
                        <>
                          <p className="mt-4 text-xs text-purple-700">Y-axis: {activeMetric}</p>
                          <svg viewBox="0 0 570 270" className="mt-2 w-full" role="img" aria-label={`${activeMetric} versus ${activeX} scatter plot`}>
                            {[0, 1, 2, 3, 4].map((tick) => (
                              <g key={tick}>
                                <line x1="65" x2="515" y1={35 + tick * 45} y2={35 + tick * 45} stroke="#eee8f3" />
                                <text x="55" y={39 + tick * 45} textAnchor="end" fontSize="10" fill="#978ba5">
                                  {fmt(maxY - ((maxY - minY) * tick) / 4)}
                                </text>
                              </g>
                            ))}
                            <line x1="65" x2="65" y1="35" y2="215" stroke="#cfc2dd" />
                            <line x1="65" x2="515" y1="215" y2="215" stroke="#cfc2dd" />

                            {points.slice(0, 2000).map((point, i) => (
                              <circle key={i} cx={plotX(point.x)} cy={plotY(point.y)} r="4" fill="#8b61bb" fillOpacity="0.55">
                                <title>{`${activeX}: ${point.x}; ${activeMetric}: ${point.y}`}</title>
                              </circle>
                            ))}

                            <text x="65" y="235" fontSize="10" fill="#978ba5">{fmt(minX)}</text>
                            <text x="515" y="235" textAnchor="end" fontSize="10" fill="#978ba5">{fmt(maxX)}</text>
                            <text x="290" y="260" textAnchor="middle" fontSize="11" fill="#806b94">{short(activeX)}</text>
                          </svg>
                          <p className="text-xs text-[#978ba5]">
                            {points.length} valid pairs. {points.length > 2000 ? "First 2,000 plotted." : "Overlapping points may appear as one."}
                          </p>
                        </>
                      ) : (
                        <p className="py-16 text-center text-sm text-[#978ba5]">No valid numeric pairs available.</p>
                      )}
                    </div>

                    <div className={box}>
                      <h2 className="font-bold">Before & after cleaning</h2>
                      <p className="mt-2 text-xs text-[#978ba5]">Each pair uses its own scale and shows exact counts.</p>
                      <div className="mt-5 flex gap-5 text-xs text-[#978ba5]">
                        <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#baa2d6]" />Original</span>
                        <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#49aa96]" />Current</span>
                      </div>
                      <div className="mt-6 space-y-6">
                        {comparisons.map((item) => {
                          const max = Math.max(1, item.before, item.after);
                          return (
                            <div key={item.label}>
                              <p className="mb-3 text-xs font-semibold">{item.label}</p>
                              {[
                                ["Original", item.before, "#baa2d6"],
                                ["Current", item.after, "#49aa96"],
                              ].map(([label, value, color]) => (
                                <div key={String(label)} className="mb-2 flex items-center gap-3">
                                  <span className="w-12 text-[10px] text-[#978ba5]">{label}</span>
                                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#f4f0f7]">
                                    <div className="h-full rounded-full" style={{ width: `${(Number(value) / max) * 100}%`, backgroundColor: String(color) }} />
                                  </div>
                                  <span className="w-8 text-right text-xs font-semibold">{value}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  <section className={box}>
                    <h2 className="font-bold">Numeric summary · {activeMetric || "No numeric column"}</h2>
                    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                      {[
                        ["Valid values", String(values.length)],
                        ["Average", fmt(mean(values))],
                        ["Minimum", values.length ? fmt(Math.min(...values)) : "—"],
                        ["Maximum", values.length ? fmt(Math.max(...values)) : "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-[#f8f5fc] p-4">
                          <p className="text-xs text-[#978ba5]">{label}</p>
                          <p className="mt-2 text-xl font-bold text-[#7550b6]">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {tab === "Cleaning Studio" && (
                <section className={box}>
                  <h2 className="text-lg font-bold">Cleaning Studio</h2>
                  <p className="mt-2 text-sm leading-7 text-[#978ba5]">
                    Choose a cleaning action. Reset restores your originally loaded data.
                  </p>
                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    {[
                      ["trim", "Trim spaces", "Remove leading and trailing whitespace."],
                      ["duplicates", "Remove duplicates", "Keep the first copy of each identical row."],
                      ["missing", "Remove incomplete", "Remove entire rows containing any empty cell."],
                    ].map(([action, title, detail]) => (
                      <div key={action} className="flex flex-col rounded-xl border border-[#e8e0ef] bg-[#fbf9fd] p-5">
                        <h3 className="text-sm font-bold">{title}</h3>
                        <p className="mb-5 mt-3 flex-1 text-xs leading-6 text-[#978ba5]">{detail}</p>
                        <button disabled={!rows.length} onClick={() => clean(action as "trim" | "duplicates" | "missing")} className={btn}>
                          {title}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-6 text-[#978ba5]">
                    Removing incomplete rows can affect findings. Choose a missing-data approach appropriate to your dataset.
                  </p>
                  <button
                    onClick={() => {
                      setData(original);
                      setPage(1);
                      setMessage("Original dataset restored.");
                    }}
                    className={`${btn} mt-5`}
                  >
                    ↺ Reset original
                  </button>

                  <h3 className="mb-4 mt-8 text-sm font-bold">Missing cells by column</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {headers.map((header, index) => (
                      <div key={header} className="flex justify-between gap-4 rounded-xl bg-[#faf7fd] px-4 py-3 text-sm">
                        <span className="truncate text-[#857391]">{header}</span>
                        <span className="font-semibold text-purple-700">
                          {rows.filter((row) => !row[index].trim()).length}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className={`${box} min-w-0`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Data Explorer</h2>
                    <p className="mt-2 break-all text-xs text-[#978ba5]">{filename} · {filtered.length} matching rows</p>
                  </div>
                  <input
                    type="search"
                    aria-label="Search all cells"
                    placeholder="Search your data..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-[#e2d9ec] bg-[#fbf9fd] px-4 py-2.5 text-sm outline-none focus:border-purple-400 sm:w-64"
                  />
                </div>

                <div className="mt-6 max-h-[450px] overflow-auto rounded-xl border border-[#eee7f3]">
                  <table className="w-full whitespace-nowrap text-left text-xs">
                    <thead className="sticky top-0 bg-[#f0e9f8] text-[#806395]">
                      <tr>
                        {headers.map((header) => <th key={header} className="px-4 py-4 font-semibold">{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={`${currentPage}-${i}`} className="border-t border-[#f0eaf5] transition hover:bg-purple-50/50">
                          {row.map((cell, column) => (
                            <td key={column} title={cell} className="max-w-64 truncate px-4 py-4 text-[#786887]">
                              {cell.trim() ? cell : (
                                <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Missing</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!preview.length && <p className="p-8 text-center text-sm text-[#978ba5]">No matching rows.</p>}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#978ba5]">Page {currentPage} of {pages} · 10 rows per page</p>
                  <div className="flex gap-2">
                    <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className={btn}>← Previous</button>
                    <button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} className={btn}>Next →</button>
                  </div>
                </div>
              </section>
            </>
          )}

          <footer className="flex flex-wrap justify-between gap-3 border-t border-[#e5e0ec] py-5 text-xs leading-6 text-[#978ba5]">
            <p>DataLens · Farkhanda Jabeen</p>
            <p>Fictional demo data · Local CSV processing</p>
          </footer>
        </div>
      </div>
    </main>
  );
}