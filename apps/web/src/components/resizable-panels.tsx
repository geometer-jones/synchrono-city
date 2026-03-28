import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from "react";

type PanelElement = ReactElement<{ className?: string }>;

type ResizablePanelsProps = {
  as?: ElementType;
  className?: string;
  storageKey: string;
  primary: PanelElement;
  secondary: PanelElement;
  defaultPrimarySize: number;
  minPrimarySize?: number;
  minSecondarySize?: number;
  resizeStep?: number;
  handleLabel?: string;
};

const handleSize = 8;
const storageKeyPrefix = "synchrono-city.resizable-panels.";
const resizeBodyClassName = "is-resizing-panels";

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function clampPrimarySize(
  size: number,
  containerWidth: number,
  minPrimarySize: number,
  minSecondarySize: number
) {
  if (!Number.isFinite(size)) {
    return minPrimarySize;
  }

  if (containerWidth <= 0) {
    return Math.max(minPrimarySize, Math.round(size));
  }

  const maxPrimarySize = Math.max(minPrimarySize, containerWidth - minSecondarySize - handleSize);
  return Math.min(Math.max(Math.round(size), minPrimarySize), maxPrimarySize);
}

function loadStoredPrimarySize(storageKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(`${storageKeyPrefix}${storageKey}.v1`);
    if (!rawValue) {
      return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function storePrimarySize(storageKey: string, size: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(`${storageKeyPrefix}${storageKey}.v1`, String(Math.round(size)));
  } catch {
    // Ignore storage failures so panel resizing remains usable.
  }
}

export function ResizablePanels({
  as: Root = "div",
  className,
  storageKey,
  primary,
  secondary,
  defaultPrimarySize,
  minPrimarySize = 280,
  minSecondarySize = 320,
  resizeStep = 24,
  handleLabel = "Resize panels"
}: ResizablePanelsProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [primarySize, setPrimarySize] = useState(() => loadStoredPrimarySize(storageKey) ?? defaultPrimarySize);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const measure = () => {
      const nextWidth = Math.round(container.getBoundingClientRect().width);
      setContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    measure();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, []);

  const resolvedPrimarySize = clampPrimarySize(primarySize, containerWidth, minPrimarySize, minSecondarySize);
  const maxPrimarySize =
    containerWidth > 0 ? Math.max(minPrimarySize, containerWidth - minSecondarySize - handleSize) : resolvedPrimarySize;

  useEffect(() => {
    if (resolvedPrimarySize !== primarySize) {
      setPrimarySize(resolvedPrimarySize);
    }
  }, [primarySize, resolvedPrimarySize]);

  useEffect(() => {
    if (containerWidth > 0) {
      storePrimarySize(storageKey, resolvedPrimarySize);
    }
  }, [containerWidth, resolvedPrimarySize, storageKey]);

  useEffect(() => {
    return () => {
      document.body.classList.remove(resizeBodyClassName);
    };
  }, []);

  function commitPrimarySize(nextPrimarySize: number) {
    setPrimarySize(clampPrimarySize(nextPrimarySize, containerWidth, minPrimarySize, minSecondarySize));
  }

  function stopDragging(handlePointerMove: (event: PointerEvent) => void, handlePointerUp: () => void) {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    document.body.classList.remove(resizeBodyClassName);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();

    const startX = event.clientX;
    const startPrimarySize = resolvedPrimarySize;

    document.body.classList.add(resizeBodyClassName);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      commitPrimarySize(startPrimarySize + (moveEvent.clientX - startX));
    };

    const handlePointerUp = () => {
      stopDragging(handlePointerMove, handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitPrimarySize(resolvedPrimarySize - resizeStep);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      commitPrimarySize(resolvedPrimarySize + resizeStep);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      commitPrimarySize(minPrimarySize);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      commitPrimarySize(maxPrimarySize);
    }
  }

  return (
    <Root
      ref={containerRef}
      className={joinClassNames("resizable-panels", className)}
      style={
        containerWidth > 0
          ? {
              gridTemplateColumns: `${resolvedPrimarySize}px ${handleSize}px minmax(${minSecondarySize}px, 1fr)`
            }
          : undefined
      }
    >
      {cloneElement(primary, {
        className: joinClassNames(primary.props.className, "resizable-panel", "resizable-panel-primary")
      })}
      <div
        className="resizable-panels-handle"
        role="separator"
        aria-label={handleLabel}
        aria-orientation="vertical"
        aria-valuemin={minPrimarySize}
        aria-valuemax={maxPrimarySize}
        aria-valuenow={resolvedPrimarySize}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
      />
      {cloneElement(secondary, {
        className: joinClassNames(secondary.props.className, "resizable-panel", "resizable-panel-secondary")
      })}
    </Root>
  );
}
