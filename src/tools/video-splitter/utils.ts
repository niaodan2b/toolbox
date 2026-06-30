export interface VideoSegment {
  start: number;
  end: number;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTimeForFilename(seconds: number): string {
  return formatTime(seconds).replace(/:/g, "-");
}

export function parseTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  if (parts.length === 2) {
    const [m, s] = parts;
    if (s >= 60) return null;
    return m * 60 + s;
  }

  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }

  return null;
}

export function splitBaseNameAndExt(filename: string): { baseName: string; ext: string } {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) {
    return { baseName: filename, ext: "" };
  }
  return {
    baseName: filename.slice(0, dotIndex),
    ext: filename.slice(dotIndex),
  };
}

export function buildOutputFilename(
  baseName: string,
  ext: string,
  start: number,
  end: number,
): string {
  return `${baseName}_${formatTimeForFilename(start)}_${formatTimeForFilename(end)}${ext}`;
}

export function normalizeMarkers(markers: number[], duration: number): number[] {
  const unique = new Map<number, number>();
  for (const marker of markers) {
    if (marker <= 0 || marker >= duration) continue;
    const rounded = Math.round(marker * 1000) / 1000;
    unique.set(rounded, rounded);
  }
  return Array.from(unique.values()).sort((a, b) => a - b);
}

export function computeSegments(markers: number[], duration: number): VideoSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const points = [0, ...normalizeMarkers(markers, duration), duration];
  const segments: VideoSegment[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end > start) {
      segments.push({ start, end });
    }
  }

  return segments;
}

export function isDuplicateMarker(markers: number[], seconds: number, epsilon = 0.1): boolean {
  return markers.some((marker) => Math.abs(marker - seconds) < epsilon);
}

export function isValidMarker(seconds: number, duration: number): boolean {
  return seconds > 0 && seconds < duration;
}
