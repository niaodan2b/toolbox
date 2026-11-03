import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  RATIOS,
  computeOther,
  findRatio,
  formatLength,
  parseLength,
  sanitizeLength,
  type RatioId,
} from "./aspect";

/** 预览框最大尺寸 */
const PREVIEW_MAX_W = 280;
const PREVIEW_MAX_H = 150;

interface DimensionFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** 复制成功返回 true，用于给出勾选反馈 */
  onCopy: () => Promise<boolean> | boolean;
}

function DimensionField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onCopy,
}: DimensionFieldProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const ok = await onCopy();
    if (!ok) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}{" "}
        <span className="text-muted-foreground text-xs font-normal">px</span>
      </label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono pr-9"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!value}
          onClick={() => void handleCopy()}
          aria-label={copied ? "已复制" : `复制${label}`}
          title={copied ? "已复制" : `复制${label}`}
          className={cn(
            "text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-7 -translate-y-1/2 hover:bg-transparent",
            copied && "text-primary hover:text-primary",
          )}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export function AspectCalculatorPanel() {
  const [ratioId, setRatioId] = useState<RatioId>("16:9");
  /** 用户正在编辑的一边，另一边由它换算 */
  const [source, setSource] = useState<"width" | "height">("width");
  const [raw, setRaw] = useState("1920");

  const ratio = findRatio(ratioId);
  const parsed = parseLength(raw);

  const width =
    parsed === null
      ? null
      : source === "width"
        ? parsed
        : computeOther("height", parsed, ratio);
  const height =
    parsed === null
      ? null
      : source === "height"
        ? parsed
        : computeOther("width", parsed, ratio);

  const widthText =
    width === null ? "" : source === "width" ? raw : formatLength(width);
  const heightText =
    height === null ? "" : source === "height" ? raw : formatLength(height);

  const scale =
    width === null || height === null
      ? 1
      : Math.min(PREVIEW_MAX_W / width, PREVIEW_MAX_H / height);

  const roundedW = width === null ? 0 : Math.round(width);
  const roundedH = height === null ? 0 : Math.round(height);
  const needsRound =
    width !== null &&
    height !== null &&
    (roundedW !== width || roundedH !== height);

  const handleChange = (next: "width" | "height", value: string) => {
    setSource(next);
    setRaw(sanitizeLength(value));
  };

  const copyValue = async (value: string) => {
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>画幅计算</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">画幅</span>
            <div className="bg-muted inline-flex rounded-md p-1">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={ratioId === r.id}
                  onClick={() => setRatioId(r.id)}
                  className={cn(
                    "rounded-sm px-4 py-1 text-sm font-medium transition-colors",
                    ratioId === r.id
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.id}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DimensionField
              id="aspect-width"
              label="宽度"
              placeholder="1920"
              value={widthText}
              onChange={(value) => handleChange("width", value)}
              onCopy={() => copyValue(widthText)}
            />
            <DimensionField
              id="aspect-height"
              label="高度"
              placeholder="1080"
              value={heightText}
              onChange={(value) => handleChange("height", value)}
              onCopy={() => copyValue(heightText)}
            />
          </div>

          <div className="flex flex-col items-center gap-4 rounded-lg border bg-muted/30 px-4 py-6">
            <div className="flex h-[150px] items-center justify-center">
              {width !== null && height !== null ? (
                <div
                  className="border-primary/70 bg-primary/10 flex items-center justify-center rounded-sm border-2"
                  style={{ width: width * scale, height: height * scale }}
                >
                  <span className="text-muted-foreground text-xs font-medium">
                    {ratio.id}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">
                  输入宽度或高度
                </span>
              )}
            </div>

            <span className="font-mono text-2xl font-semibold tabular-nums">
              {width !== null && height !== null
                ? `${formatLength(width)} × ${formatLength(height)}`
                : "—"}
            </span>

            {needsRound && (
              <span className="text-muted-foreground text-xs">
                取整：{roundedW} × {roundedH}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
