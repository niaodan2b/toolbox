import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Copy,
  Eraser,
  LockKeyhole,
  LockKeyholeOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { decode, encode } from "./base64";

export function Base64Panel() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const handleEncode = () => {
    try {
      setOutput(encode(input));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "编码失败");
    }
  };

  const handleDecode = () => {
    try {
      setOutput(decode(input));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解码失败");
    }
  };

  const handleSwap = () => {
    setInput(output);
    setOutput(input);
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
  };

  const handleCopy = async () => {
    if (!output) {
      toast.info("结果为空");
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Base64 编解码</CardTitle>
          <CardDescription>
            支持 UTF-8 中文；在下方输入文本或 Base64 字符串，点击按钮完成编码 / 解码。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">输入</label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="在此输入原文或 Base64 字符串..."
              className="min-h-[140px] font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleEncode}>
              <LockKeyhole />
              编码
            </Button>
            <Button variant="secondary" onClick={handleDecode}>
              <LockKeyholeOpen />
              解码
            </Button>
            <Button variant="outline" onClick={handleSwap}>
              <ArrowDownUp />
              交换
            </Button>
            <Button variant="ghost" onClick={handleClear}>
              <Eraser />
              清空
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={handleCopy}>
              <Copy />
              复制结果
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">结果</label>
            <Textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              readOnly
              placeholder="结果将显示在这里..."
              className="min-h-[140px] font-mono"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
