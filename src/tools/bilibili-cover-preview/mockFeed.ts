import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Camera,
  Cat,
  ChefHat,
  Clapperboard,
  Coffee,
  Cpu,
  Film,
  Gamepad2,
  Mountain,
  Music,
  Plane,
  Sparkles,
  Tv,
  Wand2,
} from "lucide-react";

interface MockVideo {
  id: string;
  title: string;
  up: string;
  icon: LucideIcon;
  from: string;
  to: string;
  badge?: string;
}

export interface FeedEntry {
  key: string;
  /** null 表示用户的视频 */
  mock: MockVideo | null;
  views: number;
  danmaku: number;
  duration: number;
  followed: boolean;
}

export interface FeedState {
  entries: FeedEntry[];
  userIndex: number;
}

const FEED_SIZE = 10;

const MOCK_VIDEOS: MockVideo[] = [
  {
    id: "v1",
    title: "花了三个月，我把出租屋改成了赛博朋克风",
    up: "野生改造家",
    icon: Wand2,
    from: "#18122b",
    to: "#635985",
    badge: "改造",
  },
  {
    id: "v2",
    title: "为什么天空是蓝色的？这次终于讲明白了",
    up: "三分钟实验室",
    icon: Sparkles,
    from: "#0f4c81",
    to: "#4ea8de",
    badge: "科普",
  },
  {
    id: "v3",
    title: "用 8K 相机拍猫，结果拍到了不得了的东西",
    up: "猫猫观察局",
    icon: Cat,
    from: "#7b2d26",
    to: "#f4a261",
    badge: "8K",
  },
  {
    id: "v4",
    title: "今年最离谱的独立游戏，我居然玩了一整晚",
    up: "不咕游戏室",
    icon: Gamepad2,
    from: "#14213d",
    to: "#fca311",
    badge: "试玩",
  },
  {
    id: "v5",
    title: "【4K修复】那些年我们追过的动画 OP",
    up: "周末放映厅",
    icon: Tv,
    from: "#2b2d42",
    to: "#ef233c",
    badge: "4K",
  },
  {
    id: "v6",
    title: "试吃全网最辣的火锅，我后悔了",
    up: "饭点研究所",
    icon: ChefHat,
    from: "#9d0208",
    to: "#f48c06",
    badge: "实测",
  },
  {
    id: "v7",
    title: "用 100 天从零学会钢琴，可能吗？",
    up: "慢半拍",
    icon: Music,
    from: "#22223b",
    to: "#9a8c98",
    badge: "挑战",
  },
  {
    id: "v8",
    title: "凌晨三点的便利店，藏着城市最真实的样子",
    up: "城市切片",
    icon: Camera,
    from: "#001219",
    to: "#0a9396",
    badge: "VLOG",
  },
  {
    id: "v9",
    title: "全网都在吹的 AI 工具，真的能替代剪辑师吗",
    up: "剪辑不上班",
    icon: Cpu,
    from: "#023047",
    to: "#219ebc",
    badge: "深度",
  },
  {
    id: "v10",
    title: "在西藏自驾 30 天，我拍到了什么",
    up: "山野来信",
    icon: Mountain,
    from: "#283618",
    to: "#dda15e",
    badge: "旅行",
  },
  {
    id: "v11",
    title: "十分钟学会做一碗正宗兰州牛肉面",
    up: "厨房翻车现场",
    icon: ChefHat,
    from: "#6a040f",
    to: "#dc2f02",
    badge: "教程",
  },
  {
    id: "v12",
    title: "拆解一台 20 年前的 iPod，里面居然还有歌",
    up: "拆解俱乐部",
    icon: Cpu,
    from: "#1d3557",
    to: "#457b9d",
    badge: "拆解",
  },
  {
    id: "v13",
    title: "当我把物理实验做成美食，味道竟然还不错",
    up: "厨房实验室",
    icon: Sparkles,
    from: "#3a0ca3",
    to: "#f72585",
    badge: "硬核",
  },
  {
    id: "v14",
    title: "横跨 5000 公里，只为看一场日出",
    up: "北纬三十度",
    icon: Plane,
    from: "#03045e",
    to: "#00b4d8",
    badge: "纪录",
  },
  {
    id: "v15",
    title: "大学生挑战 100 元活一周，第三天就破防了",
    up: "校园观察员",
    icon: Coffee,
    from: "#2d6a4f",
    to: "#95d5b2",
    badge: "挑战",
  },
  {
    id: "v16",
    title: "等了半年的键盘，到底值不值得买",
    up: "键盘上的猫",
    icon: Clapperboard,
    from: "#212529",
    to: "#6c757d",
    badge: "开箱",
  },
  {
    id: "v17",
    title: "这可能是 B 站最安静的十分钟",
    up: "白噪音电台",
    icon: Music,
    from: "#1b263b",
    to: "#778da9",
    badge: "助眠",
  },
  {
    id: "v18",
    title: "用乐高还原我的大学宿舍，细节拉满",
    up: "一块乐高",
    icon: Sparkles,
    from: "#ffb703",
    to: "#fb8500",
    badge: "手工",
  },
  {
    id: "v19",
    title: "从零开始做一款游戏，第 30 天",
    up: "独立开发日志",
    icon: Gamepad2,
    from: "#10002b",
    to: "#7b2cbf",
    badge: "开发",
  },
  {
    id: "v20",
    title: "【街采】你上一次哭是什么时候？",
    up: "街角采访",
    icon: BookOpen,
    from: "#3c096c",
    to: "#c77dff",
    badge: "街采",
  },
  {
    id: "v21",
    title: "第一次用胶片拍人像，翻车还是惊喜",
    up: "过期胶卷",
    icon: Film,
    from: "#4a4e69",
    to: "#f2e9e4",
    badge: "胶片",
  },
  {
    id: "v22",
    title: "把一整条夜市搬回家是什么体验",
    up: "深夜食堂",
    icon: ChefHat,
    from: "#5f0f40",
    to: "#fb8b24",
    badge: "夜市",
  },
];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function formatCount(value: number): string {
  if (value < 10000) return String(value);
  const wan = value / 10000;
  return `${wan >= 100 ? Math.round(wan) : wan.toFixed(1)}万`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function randomStats() {
  return {
    views: randomInt(200, 480000),
    danmaku: randomInt(0, 3600),
    duration: randomInt(30, 3500),
  };
}

/** 随机生成一条推荐流：9 条模拟数据 + 用户视频，用户位置随机 */
export function createFeed(): FeedState {
  const picked = shuffle(MOCK_VIDEOS).slice(0, FEED_SIZE - 1);
  const entries: FeedEntry[] = picked.map((mock, index) => ({
    key: `mock-${mock.id}-${index}`,
    mock,
    ...randomStats(),
    followed: Math.random() < 0.25,
  }));

  const userIndex = randomInt(0, entries.length);
  entries.splice(userIndex, 0, {
    key: "user",
    mock: null,
    ...randomStats(),
    followed: false,
  });

  return { entries, userIndex };
}
