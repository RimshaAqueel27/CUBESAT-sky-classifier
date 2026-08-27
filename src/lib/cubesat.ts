export const CLOUD_CLASSES = [
  "Cumulus",
  "Stratus",
  "Cirrus",
  "Cumulonimbus",
  "Clear Sky",
] as const;

export type CloudClass = (typeof CLOUD_CLASSES)[number];

export const CLASS_PRIORITY: Record<CloudClass, number> = {
  Cumulonimbus: 100,
  Cumulus: 60,
  Stratus: 40,
  Cirrus: 30,
  "Clear Sky": 10,
};

export type Verdict = "TRANSMIT" | "OPTIONAL" | "DO NOT TRANSMIT";

export type Analysis = {
  cloudClass: CloudClass;
  confidence: number; // 0..1
  priority: number;
  importance: number; // priority * confidence
  verdict: Verdict;
  level: string; // e.g. "HIGH PRIORITY"
  detail: string;
  uncertain: boolean;
  probabilities: { label: CloudClass; value: number }[];
};

/** Demo decision logic — see the DEMO ML MODEL notice in the UI. */
export function decide(cloudClass: CloudClass, confidence: number): Analysis {
  const priority = CLASS_PRIORITY[cloudClass];
  const importance = priority * confidence;
  const uncertain = confidence < 0.5;

  let verdict: Verdict;
  let level: string;
  let detail: string;

  if (uncertain) {
    verdict = "TRANSMIT";
    level = "UNCERTAIN";
    detail = "Confidence below 50% — transmit for ground analysis.";
  } else if (importance >= 70) {
    verdict = "TRANSMIT";
    level = "HIGH PRIORITY";
    detail = "Weather-significant scene. Downlink on next pass.";
  } else if (importance >= 40) {
    verdict = "OPTIONAL";
    level = "MEDIUM PRIORITY";
    detail = "Transmit only if downlink budget allows.";
  } else {
    verdict = "DO NOT TRANSMIT";
    level = "LOW PRIORITY";
    detail = "Low science value — discard onboard and save energy.";
  }

  return {
    cloudClass,
    confidence,
    priority,
    importance,
    verdict,
    level,
    detail,
    uncertain,
    probabilities: [],
  };
}

/* ---- Deterministic pseudo-classifier (heuristic demo, not a trained net) ---- */

function hash32(bytes: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softmax(scores: number[], temp = 0.55): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temp));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Produces a stable, image-derived class distribution using simple pixel
 * statistics (brightness, contrast, texture, blue ratio) + a seeded jitter.
 * This is a heuristic stand-in for a trained CNN.
 */
export function classifyFromStats(stats: ImageStats, seedBytes: Uint8Array): Analysis {
  const rand = mulberry(hash32(seedBytes));
  const { brightness, contrast, texture, blueRatio, coverage } = stats;

  const scores: Record<CloudClass, number> = {
    Cumulonimbus: contrast * 1.5 + texture * 1.6 + (1 - brightness) * 1.1 + coverage * 0.6,
    Cumulus: texture * 1.4 + brightness * 0.9 + coverage * 0.9 + (1 - blueRatio) * 0.4,
    Stratus: (1 - texture) * 1.5 + (1 - contrast) * 1.0 + coverage * 1.0,
    Cirrus: (1 - coverage) * 1.1 + texture * 0.7 + blueRatio * 1.2 + brightness * 0.5,
    "Clear Sky": blueRatio * 1.9 + (1 - coverage) * 1.7 + (1 - texture) * 0.8,
  };

  const labels = [...CLOUD_CLASSES];
  const raw = labels.map((l) => scores[l] + (rand() - 0.5) * 0.25);
  const probs = softmax(raw);

  let bestIdx = 0;
  probs.forEach((p, i) => {
    if (p > probs[bestIdx]!) bestIdx = i;
  });

  const cloudClass = labels[bestIdx]!;
  const confidence = Math.min(0.985, Math.max(0.31, probs[bestIdx]!));
  const analysis = decide(cloudClass, confidence);
  analysis.probabilities = labels
    .map((label, i) => ({ label, value: probs[i]! }))
    .sort((a, b) => b.value - a.value);
  return analysis;
}

export type ImageStats = {
  brightness: number;
  contrast: number;
  texture: number;
  blueRatio: number;
  coverage: number;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export async function computeImageStats(file: File): Promise<{
  stats: ImageStats;
  seed: Uint8Array;
}> {
  const buf = await file.arrayBuffer();
  const seed = new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 4096)));

  const bitmap = await createImageBitmap(file);
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  bitmap.close();

  const lum: number[] = [];
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let bright = 0;
  let lowSat = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    rSum += r;
    gSum += g;
    bSum += b;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum.push(l);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (l > 0.62) bright++;
    if (l > 0.55 && sat < 0.22) lowSat++;
  }

  const n = lum.length;
  const mean = lum.reduce((a, b) => a + b, 0) / n;
  const variance = lum.reduce((a, l) => a + (l - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  let gradSum = 0;
  for (let y = 1; y < size; y++) {
    for (let x = 1; x < size; x++) {
      const i = y * size + x;
      gradSum += Math.abs(lum[i]! - lum[i - 1]!) + Math.abs(lum[i]! - lum[i - size]!);
    }
  }
  const texture = clamp01((gradSum / ((size - 1) * (size - 1) * 2)) * 12);
  const total = rSum + gSum + bSum || 1;
  const blueRatio = clamp01(((bSum / total) * 3 - 0.95) * 3);

  return {
    seed,
    stats: {
      brightness: clamp01(mean * 1.15),
      contrast: clamp01(std * 3.2),
      texture,
      blueRatio,
      coverage: clamp01((lowSat / n) * 1.6),
    },
  };
}

/* ---- Mission simulation ---- */

export type SimRow = {
  id: number;
  cloudClass: CloudClass;
  confidence: number;
  importance: number;
  verdict: Verdict;
};

const SIM_MIX: { cls: CloudClass; w: number }[] = [
  { cls: "Clear Sky", w: 0.34 },
  { cls: "Cirrus", w: 0.19 },
  { cls: "Stratus", w: 0.2 },
  { cls: "Cumulus", w: 0.19 },
  { cls: "Cumulonimbus", w: 0.08 },
];

export function runSimulation(count: number, seed = Date.now()): SimRow[] {
  const rand = mulberry(seed);
  const rows: SimRow[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    let acc = 0;
    let cls: CloudClass = "Clear Sky";
    for (const entry of SIM_MIX) {
      acc += entry.w;
      if (r <= acc) {
        cls = entry.cls;
        break;
      }
    }
    const confidence = Math.min(0.98, Math.max(0.35, 0.55 + rand() * 0.45));
    const a = decide(cls, confidence);
    rows.push({
      id: i + 1,
      cloudClass: cls,
      confidence,
      importance: a.importance,
      verdict: a.verdict,
    });
  }
  return rows;
}

export const AVG_IMAGE_MB = 2.4;
/** Watt-hours of downlink energy avoided per filtered image (demo estimate). */
export const ENERGY_PER_IMAGE_WH = 0.85;
