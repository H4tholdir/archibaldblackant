import { useSyncExternalStore, useCallback, type CSSProperties } from "react";

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

function scrollElementIntoVisible(
  element: HTMLElement,
  behavior: ScrollBehavior,
) {
  const vv = window.visualViewport;
  if (!vv) return;

  const scrollParent = getScrollParent(element);
  const rect = element.getBoundingClientRect();
  const visibleTop = vv.offsetTop;
  const visibleHeight = vv.height;
  const targetY = visibleTop + visibleHeight * 0.12;
  const delta = rect.top - targetY;

  if (scrollParent) {
    scrollParent.scrollBy({ top: delta, behavior });
  }
}

// --- Singleton keyboard monitor ---

let currentKeyboardHeight = 0;
let previousVvHeight = 0;
const listeners = new Set<() => void>();
let debounceTimer: number | undefined;
let initialized = false;

function notifyListeners() {
  listeners.forEach((l) => l());
}

function initMonitor() {
  if (initialized) return;
  initialized = true;
  const vv = window.visualViewport;
  if (!vv) return;
  previousVvHeight = vv.height;

  vv.addEventListener("resize", () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const newHeight = window.innerHeight - vv.height;
      const wasOpening = vv.height < previousVvHeight;
      previousVvHeight = vv.height;
      currentKeyboardHeight = newHeight > 50 ? newHeight : 0;
      notifyListeners();

      if (wasOpening && currentKeyboardHeight > 0) {
        const active = document.activeElement as HTMLElement | null;
        if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
          scrollElementIntoVisible(active, "instant");
        }
      }
    }, 120);
  });
}

function subscribe(listener: () => void) {
  initMonitor();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentKeyboardHeight;
}

function getServerSnapshot() {
  return 0;
}

// --- Hook ---

export function useKeyboardScroll() {
  const keyboardHeight = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const keyboardOpen = keyboardHeight > 0;

  const scrollFieldIntoView = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      if (keyboardOpen) {
        scrollElementIntoVisible(element, "smooth");
      } else {
        setTimeout(() => {
          scrollElementIntoVisible(element, "instant");
        }, 300);
      }
    },
    [keyboardOpen],
  );

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
