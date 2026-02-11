import { useState, useEffect } from "react";
import type { RefObject } from "react";

export function useSearchMatches(
  containerRef: RefObject<HTMLElement | null>,
  query: string,
) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [totalMatches, setTotalMatches] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !query) {
      setTotalMatches(0);
      setCurrentIndex(-1);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const marks = containerRef.current!.querySelectorAll(
        "[data-search-match]",
      );
      setTotalMatches(marks.length);
      if (marks.length > 0 && currentIndex < 0) setCurrentIndex(0);
    });
    return () => cancelAnimationFrame(raf);
  });

  useEffect(() => {
    if (!containerRef.current || currentIndex < 0) return;
    const marks = containerRef.current.querySelectorAll("[data-search-match]");
    marks.forEach((m, i) => {
      (m as HTMLElement).style.backgroundColor =
        i === currentIndex ? "#fb923c" : "#fef08a";
    });
    marks[currentIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [currentIndex, totalMatches, containerRef]);

  const goNext = () =>
    setCurrentIndex((i) => (totalMatches > 0 ? (i + 1) % totalMatches : -1));
  const goPrev = () =>
    setCurrentIndex((i) =>
      totalMatches > 0 ? (i - 1 + totalMatches) % totalMatches : -1,
    );

  return { currentIndex, totalMatches, goNext, goPrev };
}
