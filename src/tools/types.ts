import type { ComponentType } from "react";

export interface ToolIconProps {
  className?: string;
}

export interface ToolModule {
  /** 唯一 id，用于 hash 路由 */
  id: string;
  /** 工具显示名 */
  name: string;
  /** 简短描述 */
  description?: string;
  /** 分组（如：编解码、文本、网络） */
  category?: string;
  /** 侧边栏图标 */
  icon?: ComponentType<ToolIconProps>;
  /** 工具主 UI 组件 */
  component: ComponentType;
  /** 侧边栏搜索关键词 */
  keywords?: string[];
}
