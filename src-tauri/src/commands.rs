use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub filename: String,
}

fn format_timestamp(seconds: f64) -> String {
    format!("{seconds:.6}")
}

/// macOS 从 Finder 启动的 GUI 应用不加载 shell 配置，PATH 通常不含 Homebrew 等路径。
fn augmented_path() -> String {
    let mut dirs: Vec<String> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        for dir in [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/opt/local/bin",
            "/usr/bin",
            "/bin",
        ] {
            dirs.push(dir.to_string());
        }
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(format!("{home}/.nix-profile/bin"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        for dir in ["/usr/local/bin", "/usr/bin", "/bin", "/snap/bin"] {
            dirs.push(dir.to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        for dir in ["C:\\ffmpeg\\bin", "C:\\Program Files\\ffmpeg\\bin"] {
            dirs.push(dir.to_string());
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            dirs.push(format!("{local}\\Programs\\ffmpeg\\bin"));
        }
    }

    if let Ok(path) = std::env::var("PATH") {
        if !path.is_empty() {
            dirs.push(path);
        }
    }

    #[cfg(windows)]
    {
        dirs.join(";")
    }
    #[cfg(not(windows))]
    {
        dirs.join(":")
    }
}

fn ffmpeg_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("ffmpeg")];

    #[cfg(target_os = "macos")]
    {
        for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"] {
            candidates.push(PathBuf::from(dir).join("ffmpeg"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        for dir in ["/usr/local/bin", "/usr/bin", "/snap/bin"] {
            candidates.push(PathBuf::from(dir).join("ffmpeg"));
        }
    }

    candidates
}

fn run_ffmpeg_version(ffmpeg: &Path) -> Result<String, String> {
    let mut command = Command::new(ffmpeg);
    command.arg("-version").env("PATH", augmented_path());

    let output = command
        .output()
        .map_err(|error| format!("执行 ffmpeg 失败: {error}"))?;

    if !output.status.success() {
        return Err("ffmpeg 执行失败".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .next()
        .unwrap_or("ffmpeg")
        .to_string())
}

fn resolve_ffmpeg() -> Result<PathBuf, String> {
    for candidate in ffmpeg_candidates() {
        if run_ffmpeg_version(&candidate).is_ok() {
            return Ok(candidate);
        }
    }

    Err(
        "未找到 ffmpeg，请先安装（macOS: brew install ffmpeg）。若已安装，请确认 ffmpeg 位于 /opt/homebrew/bin 或 /usr/local/bin"
            .to_string(),
    )
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    let ffmpeg = resolve_ffmpeg()?;
    run_ffmpeg_version(&ffmpeg)
}

#[tauri::command]
pub async fn split_video(
    input_path: String,
    output_dir: String,
    segments: Vec<Segment>,
) -> Result<Vec<String>, String> {
    if segments.is_empty() {
        return Err("没有可分割的片段".to_string());
    }

    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err(format!("输入文件不存在: {input_path}"));
    }

    let output = PathBuf::from(&output_dir);
    if !output.is_dir() {
        return Err(format!("输出目录不存在: {output_dir}"));
    }

    let ffmpeg = resolve_ffmpeg()?;
    let mut written: Vec<String> = Vec::with_capacity(segments.len());

    for (index, segment) in segments.iter().enumerate() {
        if segment.end <= segment.start {
            return Err(format!(
                "片段 {} 时间范围无效: {} - {}",
                index + 1,
                segment.start,
                segment.end
            ));
        }

        let output_path = output.join(&segment.filename);

        // -ss 放在 -i 之后并重新编码，可在任意帧精确切割；
        // -c copy 只能在关键帧切割，通常会有数秒误差。
        let result = Command::new(&ffmpeg)
            .env("PATH", augmented_path())
            .args([
                "-y",
                "-i",
                &input_path,
                "-ss",
                &format_timestamp(segment.start),
                "-to",
                &format_timestamp(segment.end),
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "18",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                "-avoid_negative_ts",
                "make_zero",
                output_path.to_string_lossy().as_ref(),
            ])
            .output()
            .map_err(|e| format!("执行 ffmpeg 失败: {e}"))?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            let summary = stderr
                .lines()
                .rev()
                .find(|line| !line.trim().is_empty())
                .unwrap_or("未知错误");
            return Err(format!(
                "分割片段 {} ({}) 失败: {}",
                index + 1,
                segment.filename,
                summary
            ));
        }

        written.push(output_path.to_string_lossy().to_string());
    }

    Ok(written)
}
