import "@testing-library/jest-dom";

import { afterEach, beforeEach, vi } from "vitest";

/**
 * jsdom does not implement the Web Animations API in a useful way for tests.
 * The component relies heavily on `element.animate(...)` returning an
 * `Animation` whose `finished` property is a thenable. We provide a minimal
 * fake here so that swipe / return-to-stack flows can complete during tests.
 */
type FakeAnimation = {
  finished: Promise<FakeAnimation>;
  cancel: () => void;
  finish: () => void;
  onfinish: ((this: FakeAnimation) => void) | null;
  playState: string;
};

const installAnimateMock = () => {
  const animate = vi.fn(function (
    this: HTMLElement,
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    _options?: number | KeyframeAnimationOptions,
  ) {
    const animation: FakeAnimation = {
      finished: undefined as unknown as Promise<FakeAnimation>,
      cancel: () => undefined,
      finish: () => {
        animation.playState = "finished";
        animation.onfinish?.call(animation);
      },
      onfinish: null,
      playState: "running",
    };
    animation.finished = Promise.resolve(animation);
    return animation as unknown as Animation;
  });

  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate,
  });
};

/**
 * jsdom does not implement pointer capture; the component calls these methods
 * when starting a drag, so they need to exist as no-ops.
 */
const installPointerCaptureMocks = () => {
  if (!("setPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
  if (!("releasePointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
  if (!("hasPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      writable: true,
      value: vi.fn(() => false),
    });
  }
};

/**
 * jsdom returns zero-sized rects by default which breaks the swipe-distance
 * heuristics the component uses. Override `getBoundingClientRect` to return a
 * realistic 300x400 card centered on a 1024x768 viewport.
 */
const installBoundingRectMock = () => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const rect = original.call(this);
    if (rect.width === 0 && rect.height === 0) {
      const width = 300;
      const height = 400;
      const left = (1024 - width) / 2;
      const top = (768 - height) / 2;
      return new DOMRect(left, top, width, height);
    }
    return rect;
  };
};

beforeEach(() => {
  installAnimateMock();
  installPointerCaptureMocks();
  installBoundingRectMock();

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1024,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: 768,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
