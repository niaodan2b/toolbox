/**
 * 将数字转换为中文数字（1-9999）
 */
export function numToChinese(num: number): string {
  const chineseNums = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const chineseUnits = ["", "十", "百", "千"];

  if (num === 0) return chineseNums[0];

  const numStr = String(num);
  const length = numStr.length;
  const result: string[] = [];

  for (let i = 0; i < numStr.length; i++) {
    const digit = parseInt(numStr[i]);
    const unitPos = length - i - 1;

    if (digit !== 0) {
      result.push(chineseNums[digit]);
      if (unitPos > 0) {
        result.push(chineseUnits[unitPos]);
      }
    } else {
      if (result.length > 0 && result[result.length - 1] !== chineseNums[0]) {
        const hasNonZeroAfter = numStr
          .slice(i + 1)
          .split("")
          .some((c) => parseInt(c) !== 0);
        if (hasNonZeroAfter) {
          result.push(chineseNums[0]);
        }
      }
    }
  }

  // "一十" 开头简化为 "十"
  if (length === 2 && numStr[0] === "1") {
    return "十" + (numStr[1] !== "0" ? chineseNums[parseInt(numStr[1])] : "");
  }

  return result.join("");
}

/**
 * 格式化文件大小
 */
export function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface TxtFileEntry {
  /** 唯一标识 */
  id: string;
  /** File 对象 */
  file: File;
  /** 文件名 */
  filename: string;
  /** 别名（用于合并标题） */
  alias: string;
  /** 格式化后的文件大小 */
  sizeStr: string;
}

let _nextId = 0;
export function generateId(): string {
  return `file_${Date.now()}_${_nextId++}`;
}
