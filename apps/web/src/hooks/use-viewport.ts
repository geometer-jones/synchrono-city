import { useEffect, useState } from "react";

/**
 * Hook to detect if the viewport is narrow (below a breakpoint).
 *
 * @param breakpoint - Maximum width to consider "narrow" (default: 860px)
 * @returns boolean indicating if viewport width is <= breakpoint
 *
 * @example
 * const isNarrow = useNarrowViewport();
 * const isNarrow = useNarrowViewport(768);
 */
export function useNarrowViewport(breakpoint = 860): boolean {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleResize() {
      setIsNarrow(window.innerWidth <= breakpoint);
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [breakpoint]);

  return isNarrow;
}
