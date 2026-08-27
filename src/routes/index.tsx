import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CircleAlert,
  CloudUpload,
  Cpu,
  Gauge,
  HardDriveDownload,
  Radio,
  RefreshCw,
  Satellite,
  Trash2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AVG_IMAGE_MB,
  CLASS_PRIORITY,
  CLOUD_CLASSES,
  ENERGY_PER_IMAGE_WH,
  classifyFromStats,
  computeImageStats,
  runSimulation,
  type Analysis,
  type SimRow,
} from "@/lib/cubesat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CubeSat Cloud Intelligence — Onboard ML Downlink Triage" },
      {
        name: "description",
        content:
          "Mission-control dashboard demo: classify cloud imagery onboard a CubeSat, score its importance and decide what is worth transmitting to Earth.",
      },
      { property: "og:title", content: "CubeSat Cloud Intelligence" },
      {
        property: "og:description",
        content:
          "Classify intelligently. Transmit selectively. Save CubeSat energy. A demo dashboard for onboard cloud-image triage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

/* --------------------------------- pieces -------------------------------- */

function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={cn("panel p-5", className)}>{children}</section>;
}

function PanelTitle({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ElementType;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="mono-label text-foreground">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "accent" | "success";
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    accent: "text-accent",
    success: "text-success",
  }[tone];

  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="mono-label">{label}</span>
        <Icon className={cn("size-4", toneClass)} />
      </div>
      <div className={cn("font-mono text-2xl leading-none tracking-tight", toneClass)}>
        {value}
      </div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function VerdictBadge({ analysis }: { analysis: Analysis }) {
  const tone = analysis.uncertain
    ? "border-accent/50 bg-accent/12 text-accent"
    : analysis.verdict === "TRANSMIT"
      ? "border-success/50 bg-success/12 text-success"
      : analysis.verdict === "OPTIONAL"
        ? "border-accent/50 bg-accent/12 text-accent"
        : "border-destructive/50 bg-destructive/12 text-destructive";

  return (
    <div className={cn("rounded-md border px-4 py-3", tone)}>
      <div className="font-mono text-[0.65rem] tracking-[0.18em] opacity-80">
        {analysis.level}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tracking-tight">
        {analysis.verdict}
      </div>
      <p className="mt-1 text-xs opacity-80">{analysis.detail}</p>
    </div>
  );
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/* -------------------------------- dashboard ------------------------------- */

type LogEntry = {
  id: number;
  name: string;
  analysis: Analysis;
};

function Dashboard() {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [sim, setSim] = useState<SimRow[] | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback((f: File | undefined | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setResult(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }, []);

  const analyze = useCallback(async () => {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    const stages = [
      "Reading frame buffer…",
      "Normalising 64×64 tile…",
      "Extracting texture & spectral features…",
      "Scoring class distribution…",
      "Applying downlink policy…",
    ];
    try {
      for (const s of stages) {
        setStage(s);
        await new Promise((r) => setTimeout(r, 220));
      }
      const { stats, seed } = await computeImageStats(file);
      const analysis = classifyFromStats(stats, seed);
      setResult(analysis);
      setLog((prev) =>
        [{ id: Date.now(), name: file.name, analysis }, ...prev].slice(0, 40),
      );
    } finally {
      setStage("");
      setBusy(false);
    }
  }, [busy, file]);

  const stats = useMemo(() => {
    const analyzed = log.length;
    const transmitted = log.filter((l) => l.analysis.verdict === "TRANSMIT").length;
    const optional = log.filter((l) => l.analysis.verdict === "OPTIONAL").length;
    const filtered = log.filter((l) => l.analysis.verdict === "DO NOT TRANSMIT").length;
    const reduction = analyzed ? (filtered / analyzed) * 100 : 0;
    return {
      analyzed,
      transmitted,
      optional,
      filtered,
      reduction,
      energy: filtered * ENERGY_PER_IMAGE_WH,
      dataSaved: filtered * AVG_IMAGE_MB,
    };
  }, [log]);

  const simStats = useMemo(() => {
    if (!sim) return null;
    const transmitted = sim.filter((r) => r.verdict === "TRANSMIT").length;
    const optional = sim.filter((r) => r.verdict === "OPTIONAL").length;
    const filtered = sim.filter((r) => r.verdict === "DO NOT TRANSMIT").length;
    const byClass = CLOUD_CLASSES.map((c) => ({
      label: c,
      value: sim.filter((r) => r.cloudClass === c).length,
    }));
    return {
      total: sim.length,
      transmitted,
      optional,
      filtered,
      reduction: (filtered / sim.length) * 100,
      energy: filtered * ENERGY_PER_IMAGE_WH,
      dataSaved: filtered * AVG_IMAGE_MB,
      byClass,
    };
  }, [sim]);

  const simulate = useCallback(async () => {
    setSimBusy(true);
    setSim(null);
    await new Promise((r) => setTimeout(r, 700));
    setSim(runSimulation(100));
    setSimBusy(false);
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-8 md:px-8">
      {/* Header */}
      <header className="panel signal-glow relative overflow-hidden p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="mono-label flex items-center gap-2">
              <Satellite className="size-3.5 text-primary" />
              CubeSat / Payload-01 / Cloud Intelligence
            </div>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Classify intelligently. Transmit selectively.
              <span className="text-primary"> Save CubeSat energy.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Onboard triage of cloud imagery: every captured frame is classified, scored
              for scientific importance, and only the frames worth the downlink budget are
              queued for transmission to the ground station.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent/12 px-3 py-1.5 font-mono text-[0.65rem] tracking-[0.18em] text-accent">
              <CircleAlert className="size-3.5" />
              DEMO ML MODEL
            </span>
            <span className="inline-flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground">
              <span
                className="size-1.5 rounded-full bg-success"
                style={{ animation: "pulse-dot 1.8s ease-in-out infinite" }}
              />
              LINK NOMINAL · S-BAND
            </span>
          </div>
        </div>
        <p className="mt-5 max-w-3xl rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-accent">Notice:</strong> no trained neural network is
          connected. Predictions come from a deterministic heuristic classifier that reads
          brightness, contrast, texture and spectral ratios from the uploaded image. It
          exists to demonstrate the decision pipeline, not to provide meteorological truth.
        </p>
      </header>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Activity} label="Images analyzed" value={String(stats.analyzed)} />
        <Stat
          icon={Radio}
          label="Images transmitted"
          value={String(stats.transmitted)}
          sub={`${stats.optional} optional queued`}
          tone="success"
        />
        <Stat
          icon={Trash2}
          label="Images filtered"
          value={String(stats.filtered)}
          sub="Discarded onboard"
          tone="accent"
        />
        <Stat
          icon={HardDriveDownload}
          label="Data reduction"
          value={`${stats.reduction.toFixed(1)}%`}
          sub={`${stats.dataSaved.toFixed(1)} MB not downlinked`}
          tone="primary"
        />
        <Stat
          icon={Zap}
          label="Energy saved"
          value={`${stats.energy.toFixed(2)} Wh`}
          sub={`@ ${ENERGY_PER_IMAGE_WH} Wh / frame`}
          tone="accent"
        />
      </div>

      {/* Upload + result */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Panel>
          <PanelTitle icon={CloudUpload} title="Frame ingest" />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              accept(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "scanline flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-6 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/8"
                : "border-border bg-muted/25 hover:border-primary/60",
            )}
          >
            {preview ? (
              <img
                src={preview}
                alt="Uploaded cloud frame awaiting onboard classification"
                className="max-h-64 w-full rounded-md object-cover"
              />
            ) : (
              <>
                <CloudUpload className="size-8 text-primary/80" />
                <p className="mt-3 text-sm font-medium">
                  Drop a cloud image or click to browse
                </p>
                <p className="mono-label mt-1">JPG · PNG · WEBP</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => accept(e.target.files?.[0])}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={analyze} disabled={!file || busy} className="font-mono">
              <Cpu className="size-4" />
              {busy ? "Analyzing…" : "Analyze Image"}
            </Button>
            {file ? (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
            ) : null}
          </div>

          {busy ? (
            <div className="mt-4">
              <p className="mono-label">{stage}</p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full w-1/3 rounded-full"
                  style={{
                    backgroundImage: "var(--gradient-signal)",
                    animation: "sweep 1.1s linear infinite",
                    transform: "rotate(90deg)",
                  }}
                />
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <PanelTitle
            icon={Gauge}
            title="Classification & downlink decision"
            right={
              result ? (
                <span className="mono-label">
                  PRIORITY {result.priority} · {CLOUD_CLASSES.length} CLASSES
                </span>
              ) : null
            }
          />
          {result ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mono-label">Predicted type</div>
                  <div className="mt-1 font-mono text-lg text-primary">
                    {result.cloudClass}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mono-label">Confidence</div>
                  <div className="mt-1 font-mono text-lg">
                    {(result.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mono-label">Importance score</div>
                  <div className="mt-1 font-mono text-lg text-accent">
                    {result.importance.toFixed(1)}
                  </div>
                </div>
              </div>

              <div>
                <div className="mono-label mb-2">
                  Transmission priority — {result.priority}/100
                </div>
                <Progress value={result.priority} className="h-2" />
              </div>

              <VerdictBadge analysis={result} />

              <div>
                <div className="mono-label mb-2">Class distribution</div>
                <div className="space-y-2">
                  {result.probabilities.map((p) => (
                    <div key={p.label} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                        {p.label}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(2, p.value * 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-xs">
                        {(p.value * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
              <Gauge className="size-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Awaiting a frame. Upload an image and run the onboard classifier to see
                the downlink verdict.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* Policy + log */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel>
          <PanelTitle icon={Cpu} title="Decision policy" />
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-2 text-left font-normal">Class</th>
                <th className="pb-2 text-right font-normal">Priority</th>
              </tr>
            </thead>
            <tbody>
              {CLOUD_CLASSES.map((c) => (
                <tr key={c} className="border-t border-border/60">
                  <td className="py-2">{c}</td>
                  <td className="py-2 text-right text-primary">{CLASS_PRIORITY[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-1.5 font-mono text-[0.7rem] text-muted-foreground">
            <li>score = priority × confidence</li>
            <li>
              <span className="text-success">score ≥ 70</span> → HIGH · TRANSMIT
            </li>
            <li>
              <span className="text-accent">40 ≤ score &lt; 70</span> → MEDIUM · OPTIONAL
            </li>
            <li>
              <span className="text-destructive">score &lt; 40</span> → LOW · DO NOT
              TRANSMIT
            </li>
            <li>
              <span className="text-accent">confidence &lt; 50%</span> → UNCERTAIN ·
              TRANSMIT FOR GROUND ANALYSIS
            </li>
          </ul>
        </Panel>

        <Panel>
          <PanelTitle
            icon={Activity}
            title="Frame log"
            right={
              log.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mono-label"
                  onClick={() => setLog([])}
                >
                  Clear
                </Button>
              ) : null
            }
          />
          {log.length ? (
            <div className="max-h-72 overflow-auto">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-normal">Frame</th>
                    <th className="pb-2 text-left font-normal">Class</th>
                    <th className="pb-2 text-right font-normal">Conf</th>
                    <th className="pb-2 text-right font-normal">Score</th>
                    <th className="pb-2 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((entry) => (
                    <tr key={entry.id} className="border-t border-border/60">
                      <td className="max-w-32 truncate py-2 pr-2">{entry.name}</td>
                      <td className="py-2">{entry.analysis.cloudClass}</td>
                      <td className="py-2 text-right">
                        {(entry.analysis.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 text-right text-accent">
                        {entry.analysis.importance.toFixed(1)}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right",
                          entry.analysis.verdict === "TRANSMIT"
                            ? "text-success"
                            : entry.analysis.verdict === "OPTIONAL"
                              ? "text-accent"
                              : "text-destructive",
                        )}
                      >
                        {entry.analysis.verdict}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No frames processed yet this session.
            </p>
          )}
        </Panel>
      </div>

      {/* Mission simulation */}
      <Panel className="mt-6">
        <PanelTitle
          icon={Satellite}
          title="Mission simulation"
          right={
            <Button
              onClick={simulate}
              disabled={simBusy}
              variant="secondary"
              size="sm"
              className="font-mono"
            >
              <RefreshCw className={cn("size-3.5", simBusy && "animate-spin")} />
              {simBusy ? "Running orbit…" : "Simulate 100 images"}
            </Button>
          }
        />
        {simStats ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Stat icon={Activity} label="Total images" value={String(simStats.total)} />
                <Stat
                  icon={Radio}
                  label="Transmitted"
                  value={String(simStats.transmitted)}
                  sub={`${simStats.optional} optional`}
                  tone="success"
                />
                <Stat
                  icon={Trash2}
                  label="Filtered"
                  value={String(simStats.filtered)}
                  tone="accent"
                />
                <Stat
                  icon={HardDriveDownload}
                  label="Data reduction"
                  value={`${simStats.reduction.toFixed(1)}%`}
                  sub={`${simStats.dataSaved.toFixed(0)} MB saved · ${simStats.energy.toFixed(1)} Wh`}
                  tone="primary"
                />
              </div>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={simStats.byClass}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={24}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {simStats.byClass.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { label: "Transmitted", value: simStats.transmitted },
                        { label: "Optional", value: simStats.optional },
                        { label: "Filtered", value: simStats.filtered },
                      ]}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={3}
                      stroke="var(--card)"
                    >
                      <Cell fill="var(--chart-3)" />
                      <Cell fill="var(--chart-2)" />
                      <Cell fill="var(--chart-5)" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--popover-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="mono-label">Transmit</div>
                  <div className="font-mono text-success">{simStats.transmitted}</div>
                </div>
                <div>
                  <div className="mono-label">Optional</div>
                  <div className="font-mono text-accent">{simStats.optional}</div>
                </div>
                <div>
                  <div className="mono-label">Filtered</div>
                  <div className="font-mono text-destructive">{simStats.filtered}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Run a synthetic 100-frame orbit to see how much downlink the onboard filter
            saves.
          </p>
        )}
      </Panel>

      <footer className="mt-10 text-center font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground">
        CUBESAT CLOUD INTELLIGENCE · DEMO ML MODEL · NO TRAINED NETWORK CONNECTED
      </footer>
    </main>
  );
}
