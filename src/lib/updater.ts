import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

export type UpdateProgress = {
  downloaded: number;
  contentLength?: number;
  status: "downloading" | "installing";
};

export const isTauri = Boolean(
  typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__,
);

export async function getAppVersion(): Promise<string> {
  if (!isTauri) return "";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}

/** Check for a desktop update. Returns null on mobile / browser / errors / no update. */
export async function checkAppUpdate(): Promise<Update | null> {
  if (!isTauri) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    return (await check()) ?? null;
  } catch {
    return null;
  }
}

export async function installAppUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | undefined;
  await update.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        downloaded = 0;
        contentLength = event.data.contentLength || undefined;
        onProgress?.({ downloaded, contentLength, status: "downloading" });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, contentLength, status: "downloading" });
        break;
      case "Finished":
        onProgress?.({ downloaded, contentLength, status: "installing" });
        break;
    }
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function formatUpdateBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const kb = bytes / 1024;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
}

export function updateProgressLabel(progress: UpdateProgress): string {
  if (progress.status === "installing") return "安装中";
  const { downloaded, contentLength } = progress;
  if (!contentLength) return downloaded > 0 ? `下载中 ${formatUpdateBytes(downloaded)}` : "下载中";
  const pct = Math.min(100, Math.round((downloaded / contentLength) * 100));
  return `${pct}% · ${formatUpdateBytes(downloaded)} / ${formatUpdateBytes(contentLength)}`;
}

export function updateProgressValue(progress: UpdateProgress | null): number | undefined {
  if (!progress) return undefined;
  if (progress.status === "installing") return 100;
  if (!progress.contentLength) return undefined;
  return Math.min(100, (progress.downloaded / progress.contentLength) * 100);
}
