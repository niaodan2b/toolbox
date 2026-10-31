import { useEffect, useRef, type RefObject } from "react";
import {
  CheckCircle2,
  Compass,
  Dices,
  Home,
  ImagePlus,
  Menu,
  MessageSquareText,
  MoreVertical,
  Play,
  PlusCircle,
  Search,
  ShoppingBag,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  cardImageStyle,
  type CoverImage,
  type CoverTransform,
} from "./cover";
import {
  formatCount,
  formatDuration,
  type FeedEntry,
  type FeedState,
} from "./mockFeed";

interface FeedPreviewProps {
  title: string;
  image: CoverImage | null;
  transform: CoverTransform;
  feed: FeedState;
  onRoll: () => void;
}

const TABS = ["直播", "推荐", "热门", "动画", "影视"];

const BOTTOM_ITEMS = [
  { icon: Home, label: "首页", active: true },
  { icon: Compass, label: "动态", active: false },
  { icon: PlusCircle, label: "发布", active: false },
  { icon: ShoppingBag, label: "会员购", active: false },
  { icon: User, label: "我的", active: false },
];

function PhoneTopBar() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-black/5 bg-white pr-11 pl-3">
      {TABS.map((tab) => {
        const active = tab === "推荐";
        return (
          <span
            key={tab}
            className={cn(
              "relative text-[13px] whitespace-nowrap",
              active ? "font-semibold text-[#18191c]" : "text-[#9499a0]",
            )}
          >
            {tab}
            {active ? (
              <span className="absolute -bottom-2.5 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-[#fb7299]" />
            ) : null}
          </span>
        );
      })}
      <Menu className="ml-auto size-4 shrink-0 text-[#18191c]" />
      <Search className="size-4 shrink-0 text-[#18191c]" />
    </div>
  );
}

function PhoneBottomBar() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-around border-t border-black/5 bg-white text-[9px] text-[#9499a0]">
      {BOTTOM_ITEMS.map(({ icon: Icon, label, active }) => (
        <div
          key={label}
          className={cn(
            "flex flex-col items-center gap-0.5",
            active && "text-[#fb7299]",
          )}
        >
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

interface FeedCardProps {
  entry: FeedEntry;
  title: string;
  image: CoverImage | null;
  transform: CoverTransform;
  cardRef?: RefObject<HTMLDivElement | null>;
}

function FeedCard({ entry, title, image, transform, cardRef }: FeedCardProps) {
  const isUser = entry.mock === null;
  const mock = entry.mock;

  return (
    <div
      ref={cardRef}
      className="min-w-0 overflow-hidden rounded-[5px] bg-white"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-200">
        {isUser ? (
          image ? (
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="absolute max-w-none"
              style={cardImageStyle(image, transform)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#fb7299]/20 to-[#23ade5]/20 text-[#9499a0]">
              <ImagePlus className="size-6" />
              <span className="text-[10px]">你的封面</span>
            </div>
          )
        ) : mock ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(135deg, ${mock.from}, ${mock.to})`,
            }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(255,255,255,0.28),transparent_55%)]" />
            <mock.icon
              className="absolute -right-2 -bottom-3 size-20 text-white/20"
              strokeWidth={1.1}
            />
            {mock.badge ? (
              <span className="absolute top-1.5 left-1.5 rounded-sm bg-black/30 px-1 py-0.5 text-[9px] leading-none font-semibold text-white">
                {mock.badge}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 via-black/15 to-transparent px-1.5 pt-4 pb-1 text-[10px] leading-none text-white">
          <span className="inline-flex items-center gap-0.5">
            <Play className="size-2.5" />
            {formatCount(entry.views)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MessageSquareText className="size-2.5" />
            {formatCount(entry.danmaku)}
          </span>
          <span className="ml-auto tabular-nums">
            {formatDuration(entry.duration)}
          </span>
        </div>
      </div>

      <div className="px-1 pt-1.5 pb-2">
        <div className="line-clamp-2 h-[34px] text-[12px] leading-[1.4] text-[#18191c]">
          {isUser ? title.trim() || "视频标题" : mock?.title}
        </div>
        <div className="mt-1 flex h-4 items-center gap-1 text-[10px] text-[#9499a0]">
          {entry.followed ? (
            <>
              <CheckCircle2 className="size-3 shrink-0 text-[#ff6699]" />
              <span className="shrink-0 text-[#ff6699]">已关注</span>
            </>
          ) : (
            <span className="shrink-0 rounded-[3px] border border-[#c9ccd3] px-1 py-0.5 text-[8px] leading-none font-medium">
              UP
            </span>
          )}
          <span className="truncate">{isUser ? "我的账号" : mock?.up}</span>
          <MoreVertical className="ml-auto size-3 shrink-0" />
        </div>
      </div>
    </div>
  );
}

export function FeedPreview({
  title,
  image,
  transform,
  feed,
  onRoll,
}: FeedPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userCardRef = useRef<HTMLDivElement>(null);
  const initialFeedRef = useRef(feed);

  useEffect(() => {
    // 首次进入时保持首页顶部，上传封面或点击随机后再定位
    if (!image && feed === initialFeedRef.current) return;
    const frame = requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const card = userCardRef.current;
      if (!scroller || !card) return;
      const top =
        card.offsetTop - (scroller.clientHeight - card.offsetHeight) / 2;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [feed, image]);

  return (
    <section className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border-[7px] border-neutral-900 bg-white shadow-xl">
          <PhoneTopBar />
          <div
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-y-auto bg-[#f4f5f7] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 p-2">
              {feed.entries.map((entry, index) => (
                <FeedCard
                  key={entry.key}
                  entry={entry}
                  title={title}
                  image={image}
                  transform={transform}
                  cardRef={index === feed.userIndex ? userCardRef : undefined}
                />
              ))}
            </div>
          </div>
          <PhoneBottomBar />
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={onRoll}
        aria-label="随机位置与周围内容"
        title="随机位置与周围内容"
        className="bg-background/90 absolute top-2 right-2 z-20 rounded-full shadow-md backdrop-blur"
      >
        <Dices />
      </Button>
    </section>
  );
}
