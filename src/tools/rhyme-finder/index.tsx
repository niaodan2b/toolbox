import { Music2 } from "lucide-react";
import type { ToolModule } from "../types";
import { RhymeFinderPanel } from "./RhymeFinderPanel";

const rhymeFinderTool: ToolModule = {
  id: "rhyme-finder",
  name: "查韵",
  description: "按汉语拼音韵母查找常用汉字，支持多选",
  category: "文本",
  icon: Music2,
  component: RhymeFinderPanel,
  keywords: ["查韵", "韵母", "拼音", "汉字", "rhyme", "pinyin"],
};

export default rhymeFinderTool;
