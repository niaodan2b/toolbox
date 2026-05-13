import { useEffect, useState, useCallback } from "react";

const HASH_PREFIX = "#/tool/";

function readActiveFromHash(): string | undefined {
  const hash = window.location.hash || "";
  if (hash.startsWith(HASH_PREFIX)) {
    return hash.slice(HASH_PREFIX.length) || undefined;
  }
  return undefined;
}

/**
 * 基于 URL hash (#/tool/<id>) 管理当前激活工具。
 * 不引入 react-router，保持最小依赖。
 */
export function useActiveTool() {
  const [activeId, setActiveId] = useState<string | undefined>(() =>
    readActiveFromHash(),
  );

  useEffect(() => {
    const onHashChange = () => setActiveId(readActiveFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setActive = useCallback((id: string) => {
    window.location.hash = `${HASH_PREFIX}${id}`;
  }, []);

  return { activeId, setActive };
}
