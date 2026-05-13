import { Binary } from "lucide-react";
import type { ToolModule } from "../types";
import { Base64Panel } from "./Base64Panel";

const base64Tool: ToolModule = {
  id: "base64",
  name: "Base64 编解码",
  description: "字符串与 Base64 互转，支持 UTF-8 中文",
  category: "编解码",
  icon: Binary,
  component: Base64Panel,
  keywords: ["base64", "编码", "解码", "encode", "decode"],
};

export default base64Tool;
