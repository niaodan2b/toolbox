import { Film } from "lucide-react";
import type { ToolModule } from "../types";
import { AudioVideoSeparatorPanel } from "./AudioVideoSeparatorPanel";

const audioVideoSeparatorTool: ToolModule = {
  id: "audio-video-separator",
  name: "音视频分离",
  description: "从视频中提取 MP3 音频，并导出无声视频文件",
  category: "媒体",
  icon: Film,
  component: AudioVideoSeparatorPanel,
  keywords: ["audio", "video", "分离", "提取", "ffmpeg", "音轨", "无声", "mp3"],
};

export default audioVideoSeparatorTool;
