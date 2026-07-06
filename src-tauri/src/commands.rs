use serde::Deserialize;
use std::path::PathBuf;
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

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map_err(|_| "未找到 ffmpeg，请先安装（macOS: brew install ffmpeg）".to_string())?;

    if !output.status.success() {
        return Err("ffmpeg 执行失败".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let version_line = stdout
        .lines()
        .next()
        .unwrap_or("ffmpeg")
        .to_string();

    Ok(version_line)
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
        let result = Command::new("ffmpeg")
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
