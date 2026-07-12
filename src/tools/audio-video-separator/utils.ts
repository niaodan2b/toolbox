export const VIDEO_EXTENSIONS = ["mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v"];

export function isVideoFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && VIDEO_EXTENSIONS.includes(ext);
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

export function buildOutputFilenames(baseName: string, ext: string) {
  return {
    audio: `${baseName}.mp3`,
    video: `${baseName}_silent${ext || ".mp4"}`,
  };
}
