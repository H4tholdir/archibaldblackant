import { useState, useEffect, useCallback, type CSSProperties } from "react";

function getScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function scrollElementIntoVisible(element: HTMLElement) {
  const vv = window.visualViewport;
  if (!vv) return;

  const scrollParent = getScrollParent(element);
  const rect = element.getBoundingClientRect();
  const visibleTop = vv.offsetTop;
  const visibleHeight = vv.height;
  const targetY = visibleTop + visibleHeight * 0.12;
  const delta = rect.top - targetY;

  if (scrollParent) {
    scrollParent.scrollBy({ top: delta, behavior: "smooth" });
  } else {
    window.scrollBy({ top: delta, behavior: "smooth" });
  }
}

export function useKeyboardScroll() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleResize = () => {
      const kbHeight = window.innerHeight - vv.height;
      setKeyboardHeight(kbHeight > 50 ? kbHeight : 0);

      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        scrollElementIntoVisible(active);
      }
    };
    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  const scrollFieldIntoView = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const doScroll = () => {
        const vv = window.visualViewport;
        if (vv && vv.height < window.innerHeight * 0.85) {
          scrollElementIntoVisible(element);
        } else {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };
      setTimeout(doScroll, 150);
      setTimeout(doScroll, 400);
    },
    [],
  );

  const keyboardOpen = keyboardHeight > 0;

  const keyboardPaddingStyle: CSSProperties = keyboardOpen
    ? { paddingBottom: `${keyboardHeight + 32}px` }
    : {};

  const modalOverlayKeyboardStyle: CSSProperties = keyboardOpen
    ? { alignItems: "flex-start" as const, paddingTop: "16px" }
    : {};

  return {
    keyboardHeight,
    keyboardOpen,
    scrollFieldIntoView,
    keyboardPaddingStyle,
    modalOverlayKeyboardStyle,
  };
}
