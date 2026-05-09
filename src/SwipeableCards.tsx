import {
  type ComponentPropsWithoutRef,
  createContext,
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type JSX,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cssEasing } from "./utils/cssEasing.js";
import type { MaybeNull } from "./utils/maybe.js";

// Scales the pivot-weighted rotation so small drags don't over-rotate
const rotationFactor = 0.1;
// Maximum tilt angle (degrees) a card can reach while dragging or flying out
const maxRotation = 32;
// Minimum drag distance (as a fraction of card width) required to commit a swipe
const minDistanceThreshold = 0.3;
// Minimum pointer velocity (px/ms) required to commit a swipe on release
const minVelocity = 0.15;
// Reference length (px) used to normalise pivot offset in the rotation formula
const rotationBasis = 250;
// Maximum (rubber-banded) drag distance allowed when dragging in a direction
// that is not in the configured `swipeDirections` list
const disallowedDirectionMaxDistance = 32;
// Whether to enable debug mode (draws debug rectangles)
const DEBUG = false;

export type DraggingState = {
  // whether a card is being dragged
  dragging: boolean;
  // the id of the card being dragged, if any
  draggingId: string;
  // the x coordinate of the pointer when the drag started
  startX: number;
  // the y coordinate of the pointer when the drag started
  startY: number;
  // the latest x coordinate of the pointer
  lastX: number;
  // the latest y coordinate of the pointer
  lastY: number;
  // the x velocity of the pointer since the last update
  velocityX: number;
  // the y velocity of the pointer since the last update
  velocityY: number;
  // the last time the state was updated
  lastTime: number;
  // the pivot point of the drag, relative to the center of the card, percentage
  pivotX: number;
  // the pivot point of the drag, relative to the center of the card, percentage
  pivotY: number;
  // the element being dragged, if any
  element: MaybeNull<HTMLElement>;
};

export type CardWithId = {
  id: string;
  card: JSX.Element;
};

export type SwipeDirection = "left" | "right" | "up" | "down";

// Values accepted by the `swipeDirections` prop. Single directions or axis
// shortcuts ("x"/"horizontal" => left+right, "y"/"vertical" => up+down).
export type AllowedSwipeDirection =
  | SwipeDirection
  | "x"
  | "y"
  | "horizontal"
  | "vertical";

export type SwipeStyle = "discard" | "sendToBack";

export type GetCardElement = (element: Element) => Element;

export type BaseSwipeableCardsProps = ComponentPropsWithoutRef<"div"> & {
  // The initial cards to display in the stack
  cards: CardWithId[];
  // Callback that is run when the user swipes a card
  onSwipe?: (direction: SwipeDirection, cardId: string) => void;
  // The discard style when swiping,
  swipeStyle?: SwipeStyle;
  // The optional margin to apply when swiping to the back, in pixels. Default is 0
  sendToBackMargin?: number;
  // Function that receives the Card element and returns the element to use for
  // collision detection. For example, if you use padding around the actual card,
  // by default we will include the padding in the collision detection.
  // Returning a different element allows you to override this behavior.
  getCardElement?: GetCardElement;
  // The directions in which the user is allowed to swipe. Accepts a single
  // direction or an array; "x"/"horizontal" expands to ["left", "right"] and
  // "y"/"vertical" expands to ["up", "down"]. Constrains both pointer drag
  // and the directional buttons' disabled state. Defaults to all 4 directions.
  swipeDirections?: AllowedSwipeDirection | AllowedSwipeDirection[];
};

export type NotLoopingSwipeableProps = BaseSwipeableCardsProps & {
  // Whether to loop the cards.
  loop?: false;
  // The view to display when there are no more cards in the stack.
  emptyView: ReactNode;
};

export type LoopingSwipeableProps = BaseSwipeableCardsProps & {
  // Whether to loop the cards.
  loop: true;
  // The view to display when there are no more cards in the stack.
  emptyView?: never;
};

export type SwipeableCardsProps =
  | NotLoopingSwipeableProps
  | LoopingSwipeableProps;

const defaultDragState: DraggingState = {
  dragging: false,
  draggingId: "",
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  velocityX: 0,
  velocityY: 0,
  lastTime: 0,
  pivotX: 0,
  pivotY: 0,
  element: null,
};

const defaultGetCard: GetCardElement = (element) => {
  return element.firstElementChild ?? element;
};

const defaultSwipeDirections: SwipeDirection[] = [
  "left",
  "right",
  "up",
  "down",
];

/**
 * Normalize the `swipeDirections` prop value into a deduplicated
 * `SwipeDirection[]`, expanding axis shortcuts ("x"/"horizontal",
 * "y"/"vertical") to their corresponding pair of directions.
 */
const normalizeSwipeDirections = (
  input: AllowedSwipeDirection | AllowedSwipeDirection[],
): SwipeDirection[] => {
  const list = Array.isArray(input) ? input : [input];
  const result: SwipeDirection[] = [];
  const add = (direction: SwipeDirection) => {
    if (!result.includes(direction)) {
      result.push(direction);
    }
  };
  for (const item of list) {
    if (item === "x" || item === "horizontal") {
      add("left");
      add("right");
    } else if (item === "y" || item === "vertical") {
      add("up");
      add("down");
    } else {
      add(item);
    }
  }
  return result;
};

/**
 * Combines the given refs into a single ref
 */
const combineRefs = <T,>(
  ...refs: (ForwardedRef<T> | RefObject<T> | undefined)[]
): ((node: T | null) => void) => {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref != null) {
        (ref as { current: T | null }).current = node;
      }
    });
  };
};

/**
 * Returns the given element to the top of the stack
 */
const animateReturnToStack = (state: DraggingState, element: HTMLElement) => {
  state.dragging = false;
  state.draggingId = "";
  state.element = null;
  const animation = element.animate(
    {
      transform: ["none"],
      translate: ["0 0"],
      rotate: ["0deg"],
      transformOrigin: ["center 0"],
    },
    {
      duration: 300,
      easing: cssEasing["--spring-easing-1"],
      fill: "forwards",
    },
  );
  animation.onfinish = () => {
    element.style.transform = "";
    element.style.translate = "";
    element.style.rotate = "";
    element.style.transformOrigin = "";
    animation.cancel();
  };
};

/**
 * Returns the visual bounding box of the given element, taking into account
 * any transforms applied to it or its children.
 */
const getVisualBoundingBox = (
  element: Element | Element[],
  // list of elements to exclude from the bounding box calculation
  elementsToExclude: Element[] = [],
  // whether we should also exclude elements contained in the excluded elements
  strict = true,
) => {
  const cache = new Map<Element, string>();
  elementsToExclude.forEach((el) => {
    if (el instanceof HTMLElement && el !== element) {
      cache.set(el, el.style.position);
      el.style.position = "absolute";
    }
  });
  const rects = (
    Array.isArray(element)
      ? element.flatMap((element) => [
          element,
          ...element.querySelectorAll("*"),
        ])
      : [element, ...element.querySelectorAll("*")]
  )
    .filter(
      (e) =>
        !elementsToExclude.includes(e) &&
        (strict
          ? elementsToExclude.every((excluded) => !excluded.contains(e))
          : true),
    )
    .map((el) => ({ element: el, rect: el.getBoundingClientRect() }));
  elementsToExclude.forEach((el) => {
    if (el instanceof HTMLElement && el !== element) {
      el.style.position = cache.get(el) ?? "";
    }
  });

  const top = Math.min(...rects.map((r) => r.rect.top));
  const left = Math.min(...rects.map((r) => r.rect.left));
  const bottom = Math.max(...rects.map((r) => r.rect.bottom));
  const right = Math.max(...rects.map((r) => r.rect.right));

  return new DOMRect(left, top, right - left, bottom - top);
};

/**
 * Temporarily clears all inline transform-related styles, reads the bounding
 * rect, then restores the styles. Use this wherever the "true" undeformed
 * dimensions of an element are needed.
 */
const getElementRectWithoutTransforms = (
  element: HTMLElement,
  visualBoundingBox?: boolean,
): DOMRect => {
  const {
    transform: prevTransform,
    translate: prevTranslate,
    rotate: prevRotate,
  } = element.style;
  element.style.transform = "";
  element.style.translate = "";
  element.style.rotate = "";
  const rect = visualBoundingBox
    ? getVisualBoundingBox(element)
    : element.getBoundingClientRect();
  element.style.transform = prevTransform;
  element.style.translate = prevTranslate;
  element.style.rotate = prevRotate;
  return rect;
};

/**
 * Returns the element's bounding rect with all transforms temporarily stripped,
 * falling back to `fallback` if there is no element on the drag state.
 */
const getUnrotatedRect = (
  state: DraggingState,
  fallback: DOMRect,
  getCard: GetCardElement,
): DOMRect => {
  if (state.element) {
    const card = getCard(state.element);
    if (card instanceof HTMLElement) {
      return getElementRectWithoutTransforms(card, true);
    }
  }
  return fallback;
};

/**
 * Returns a stable color derived from the given string
 */
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash >> 8) % 20); // 60–80%
  const lightness = 40 + (Math.abs(hash >> 16) % 20); // 40–60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * Draws a rectangle on the page, with the given id and with an optional color.
 * If the color is not provided, it will be derived from the id.
 * If an element with the same id already exists, it will be replaced.
 * @returns the element and the rect
 */
const drawRect = (
  elementOrRect: HTMLElement | DOMRect,
  id = "rect",
  color?: string,
) => {
  const prevRect = document.getElementById(id);
  if (prevRect) {
    prevRect.remove();
  }
  const rect =
    elementOrRect instanceof HTMLElement
      ? getVisualBoundingBox(elementOrRect)
      : elementOrRect;
  const rectElement = document.createElement("div");
  rectElement.dataset.debug = "";
  rectElement.style.position = "absolute";
  rectElement.style.top = `${
    (document.scrollingElement?.scrollTop ?? 0) + rect.top
  }px`;
  rectElement.style.left = `${
    (document.scrollingElement?.scrollLeft ?? 0) + rect.left
  }px`;
  rectElement.style.width = `${rect.width}px`;
  rectElement.style.height = `${rect.height}px`;
  rectElement.style.outline = `1px dashed ${color ?? stringToColor(id)}`;
  rectElement.style.pointerEvents = "none";
  rectElement.id = id;
  document.body.appendChild(rectElement);
  return { element: rectElement, rect };
};

/**
 * Returns the future stack rect (after swiping the current card), so we can use
 * it to prevent collisions with the card being swiped.
 */
const getStackFutureBoundingBox = (
  cards: HTMLElement,
  swipedCard: HTMLElement,
) => {
  const cache = new Map<
    HTMLElement,
    {
      animation: CSSProperties["animationDuration"];
      transition: CSSProperties["transitionDuration"];
      index1: string;
      index0: string;
    }
  >();
  const cardsElements = cards.querySelectorAll<HTMLElement>(
    "[data-swipeable-cards-card-wrapper]",
  );
  // shift indices and disable animations to ensure final rect is accurate
  cardsElements.forEach((el, index, list) => {
    cache.set(el, {
      animation: el.style.animationDuration,
      transition: el.style.transitionDuration,
      index1: el.style.getPropertyValue("--stack-index"),
      index0: el.style.getPropertyValue("--stack-index0"),
    });
    const index1 = list.length - 1 - index;
    const index0 = index1 - 1;
    el.style.setProperty("--stack-index", index1.toString());
    el.style.setProperty("--stack-index0", index0.toString());
    el.style.animationDuration = "0s";
    el.style.transitionDuration = "0s";
  });
  // measure the stack, excluding the element being swiped
  const cardsRect = getVisualBoundingBox([...cardsElements], [swipedCard]);
  // restore indices
  cardsElements.forEach((el) => {
    el.style.setProperty("--stack-index", cache.get(el)?.index1 ?? "");
    el.style.setProperty("--stack-index0", cache.get(el)?.index0 ?? "");
  });
  // force a reflow to ensure cards don't animate back to their original index
  void cards.offsetHeight;
  // re-enable animations
  cardsElements.forEach((el) => {
    el.style.animationDuration = cache.get(el)?.animation ?? "";
    el.style.transitionDuration = cache.get(el)?.transition ?? "";
  });
  return cardsRect;
};

/**
 * Adjust the state horizontal velocity to ensure the element animates far
 * enough (or close enough), so that
 * - the element does not clip with the stack when `swipeStyle` is `sendToBack`
 * - the element animates out of the viewport when `swipeStyle` is `discard`
 *
 * `direction` controls which screen edge the card should exit from. Pass the
 * already-resolved `swipeDirection` for the primary (boosting) axis so the
 * exit animation matches the reported swipe even when the user dragged
 * primarily along a different axis.
 */
const adjustHorizontalVelocityForExit = (
  state: DraggingState,
  nextCardsRect: DOMRect,
  innerRect: DOMRect,
  animationDuration: number,
  swipeStyle: SwipeStyle,
  sendToBackMargin: number,
  direction: "left" | "right",
  maxOnly = false,
) => {
  const isLeft = direction === "left";
  const cardStackKey: keyof DOMRect = isLeft ? "left" : "right";
  const innerKey: keyof DOMRect = isLeft ? "right" : "left";
  const minDistance =
    swipeStyle === "sendToBack"
      ? sendToBackMargin
      : isLeft
        ? nextCardsRect.right
        : window.innerWidth - nextCardsRect.left;
  const maxDistance = swipeStyle === "sendToBack" ? sendToBackMargin : Infinity;
  const currentDistance =
    (nextCardsRect[cardStackKey] - innerRect[innerKey]) * (isLeft ? 1 : -1);
  if (currentDistance < minDistance && !maxOnly) {
    // boost velocity
    if (swipeStyle === "sendToBack") {
      state.velocityX +=
        ((minDistance - currentDistance) / animationDuration) *
        (isLeft ? -1 : 1);
    } else {
      state.velocityX =
        (window.innerWidth / animationDuration) * (isLeft ? -1 : 1);
    }
  } else if (currentDistance > maxDistance) {
    // lower velocity
    state.velocityX +=
      ((currentDistance - minDistance) / animationDuration) * (isLeft ? 1 : -1);
  }
};

/**
 * Adjust the state vertical velocity to ensure the element animates far
 * enough (or close enough), so that
 * - the element does not clip with the stack when `swipeStyle` is `sendToBack`
 * - the element animates out of the viewport when `swipeStyle` is `discard`
 *
 * `direction` controls which screen edge the card should exit from. Pass the
 * already-resolved `swipeDirection` for the primary (boosting) axis so the
 * exit animation matches the reported swipe even when the user dragged
 * primarily along a different axis.
 */
const adjustVerticalVelocityForExit = (
  state: DraggingState,
  nextCardsRect: DOMRect,
  innerRect: DOMRect,
  animationDuration: number,
  swipeStyle: SwipeStyle,
  sendToBackMargin: number,
  direction: "up" | "down",
  maxOnly = false,
) => {
  const isTop = direction === "up";
  const cardStackKey: keyof DOMRect = isTop ? "top" : "bottom";
  const innerKey: keyof DOMRect = isTop ? "bottom" : "top";
  const minDistance =
    swipeStyle === "sendToBack"
      ? sendToBackMargin
      : isTop
        ? nextCardsRect.bottom
        : window.innerHeight - nextCardsRect.top;
  const maxDistance = swipeStyle === "sendToBack" ? sendToBackMargin : Infinity;
  const currentDistance =
    (nextCardsRect[cardStackKey] - innerRect[innerKey]) * (isTop ? 1 : -1);
  if (currentDistance < minDistance && !maxOnly) {
    // boost velocity
    if (swipeStyle === "sendToBack") {
      state.velocityY +=
        ((minDistance - currentDistance) / animationDuration) *
        (isTop ? -1 : 1);
    } else {
      state.velocityY =
        (window.innerHeight / animationDuration) * (isTop ? -1 : 1);
    }
  } else if (currentDistance > maxDistance) {
    // lower velocity
    state.velocityY +=
      ((currentDistance - minDistance) / animationDuration) * (isTop ? 1 : -1);
  }
};

/**
 * Returns the final rect for the swiped element, after applying velocity and
 * rotation, so we can proceed with collision detection and velocity adjustment.
 */
const getCurrentFinalRect = (
  state: DraggingState & { element: HTMLElement },
  rect: DOMRect,
  animationDuration: number,
  getCard: GetCardElement,
) => {
  const unrotatedCardRect = getUnrotatedRect(state, rect, getCard);
  const { rotation, distanceX, distanceY } = getAnimationValues(
    state,
    animationDuration,
  );
  const prevTranslate = state.element.style.translate;
  const prevRotate = state.element.style.rotate;
  const prevScale = state.element.style.scale;
  const prevTransform = state.element.style.transform;
  const prevOrigin = state.element.style.transformOrigin;
  const origin = `${
    state.pivotX * unrotatedCardRect.width + unrotatedCardRect.width / 2
  }px ${
    state.pivotY * unrotatedCardRect.height + unrotatedCardRect.height / 2
  }px`;
  const transform = `translate(${distanceX}px, ${distanceY}px) rotate(${rotation}deg)`;
  state.element.style.transformOrigin = origin;
  state.element.style.transform = transform;
  state.element.style.rotate = "0deg";
  state.element.style.translate = "none";
  state.element.style.scale = "1";
  const boundingRect = getVisualBoundingBox(
    state.element,
    getCard(state.element) !== state.element ? [state.element] : [],
    false,
  );
  state.element.style.transformOrigin = prevOrigin;
  state.element.style.transform = prevTransform;
  state.element.style.rotate = prevRotate;
  state.element.style.translate = prevTranslate;
  state.element.style.scale = prevScale;
  return { boundingRect, origin, transform, unrotatedCardRect, rotation };
};

/**
 * Boosts the velocity, so that:
 * - the element animates out of the viewport when `swipeStyle` is `discard`.
 * - the element does not clip with the stack when `swipeStyle` is `sendToBack`.
 * Called recursively for `sendToBack` (pass 0 then pass 1) to refine the result.
 */
const adjustVelocityForExit = (
  state: DraggingState,
  rect: DOMRect,
  animationDuration: number,
  swipeStyle: SwipeStyle,
  cards: HTMLElement,
  getCard: GetCardElement,
  sendToBackMargin: number,
  swipeDirection: SwipeDirection,
  pass = 0,
) => {
  if (!state.element) {
    return;
  }
  const nextCardsRect = getStackFutureBoundingBox(cards, state.element);
  const { boundingRect } = getCurrentFinalRect(
    state as DraggingState & { element: HTMLElement },
    rect,
    animationDuration,
    getCard,
  );

  if (DEBUG) {
    drawRect(nextCardsRect, "original-rect");
  }

  // Pick the primary axis from the resolved swipe direction so the exit
  // matches what `commitSwipe` reports, even if displacement is dominated by
  // the perpendicular axis (e.g. when that axis is rubber-banded by
  // `swipeDirections`). For the secondary axis (sendToBack only, maxOnly) we
  // still need a sign — derive it from the live velocity so we cap whichever
  // way the card is currently drifting.
  const isHorizontal = swipeDirection === "left" || swipeDirection === "right";

  if (isHorizontal) {
    adjustHorizontalVelocityForExit(
      state,
      nextCardsRect,
      boundingRect,
      animationDuration,
      swipeStyle,
      sendToBackMargin,
      swipeDirection,
    );
    if (swipeStyle === "sendToBack") {
      adjustVerticalVelocityForExit(
        state,
        nextCardsRect,
        boundingRect,
        animationDuration,
        swipeStyle,
        sendToBackMargin,
        state.velocityY < 0 ? "up" : "down",
        true,
      );
    }
  } else {
    adjustVerticalVelocityForExit(
      state,
      nextCardsRect,
      boundingRect,
      animationDuration,
      swipeStyle,
      sendToBackMargin,
      swipeDirection,
    );
    if (swipeStyle === "sendToBack") {
      adjustHorizontalVelocityForExit(
        state,
        nextCardsRect,
        boundingRect,
        animationDuration,
        swipeStyle,
        sendToBackMargin,
        state.velocityX < 0 ? "left" : "right",
        true,
      );
    }
  }

  const iterations = 3;
  if (pass <= iterations && swipeStyle === "sendToBack") {
    adjustVelocityForExit(
      state,
      rect,
      animationDuration,
      swipeStyle,
      cards,
      getCard,
      sendToBackMargin,
      swipeDirection,
      pass + 1,
    );
  }

  if (DEBUG) {
    const { boundingRect, origin, transform, rotation } = getCurrentFinalRect(
      state as DraggingState & { element: HTMLElement },
      rect,
      animationDuration,
      getCard,
    );
    drawRect(boundingRect, "bounding-rect");
    const card = getCard(state.element);
    if (card instanceof HTMLElement) {
      const wrapperRect = getElementRectWithoutTransforms(state.element);
      const { element: wrapper } = drawRect(
        wrapperRect,
        "wrapper",
        "transparent",
      );
      wrapper.style.transformOrigin = origin;
      wrapper.style.transform = transform;
      wrapper.style.rotate = "0deg";
      wrapper.style.translate = "none";
      wrapper.style.scale = "1";
      const prevTranslate = state.element.style.translate;
      const prevRotate = state.element.style.rotate;
      const prevScale = state.element.style.scale;
      const prevTransform = state.element.style.transform;
      state.element.style.translate = "none";
      state.element.style.rotate = "0deg";
      state.element.style.scale = "1";
      state.element.style.transform = "none";
      const rect = getElementRectWithoutTransforms(card, true);
      const top = rect.top - wrapperRect.top;
      const left = rect.left - wrapperRect.left;
      const { element: div } = drawRect(rect, "rect");
      div.style.left = `${left}px`;
      div.style.top = `${top}px`;
      div.style.transform = card.style.transform;
      div.style.transformOrigin = card.style.transformOrigin;
      div.style.rotate = card.style.rotate;
      div.style.translate = card.style.translate;
      div.style.scale = card.style.scale;
      wrapper.appendChild(div);
      state.element.style.translate = prevTranslate;
      state.element.style.rotate = prevRotate;
      state.element.style.scale = prevScale;
      state.element.style.transform = prevTransform;
    }
  }
};

/**
 * @returns the direction of the swipe, based on velocity or on distance from
 * the start position
 */
const getSwipeDirection = (
  state: DraggingState,
  useVelocity = true,
): SwipeDirection => {
  if (useVelocity) {
    if (Math.abs(state.velocityX) >= Math.abs(state.velocityY)) {
      if (state.velocityX > 0) {
        return "right";
      } else {
        return "left";
      }
    } else {
      if (state.velocityY > 0) {
        return "down";
      } else {
        return "up";
      }
    }
  }
  if (
    Math.abs(state.lastX - state.startX) > Math.abs(state.lastY - state.startY)
  ) {
    if (state.lastX > state.startX) {
      return "right";
    } else {
      return "left";
    }
  } else {
    if (state.lastY > state.startY) {
      return "down";
    } else {
      return "up";
    }
  }
};

/**
 * Calculate rotation based on horizontal movement and pivot point. The further
 * from the center the pivot is, the greater the rotation is
 */
const getRotation = (
  distanceX: number,
  distanceY: number,
  pivotX: number,
  pivotY: number,
  initialRotation?: number,
) => {
  const rotation =
    (initialRotation ?? 0) +
    ((distanceX * pivotY * rotationBasis - distanceY * pivotX * rotationBasis) *
      rotationFactor) /
      100;
  return Math.sign(rotation) * Math.min(Math.abs(rotation), maxRotation);
};

/**
 * iOS-style rubber-band easing curve. Maps an unbounded `translation` onto an
 * asymptote of `dimension`, so the user gets diminishing returns past the
 * limit. `ratio` reduces the eased value (0 = full effect, 1 = none).
 */
const iOSRubberBand = (translation: number, ratio: number, dimension = 1) => {
  const constant = 0.55;
  const easedValue =
    (1 - 1 / ((translation * constant) / dimension + 1)) * dimension;
  return easedValue * (1 - ratio);
};

/**
 * Returns the rubber-banded `clientX/clientY` for a pointer position when
 * the user is dragging in a direction that is not allowed by
 * `swipeDirections`. The drag asymptotically approaches
 * `disallowedDirectionMaxDistance` instead of hard-clamping to the start.
 */
const applyDisallowedDirectionRubberBand = (
  clientX: number,
  clientY: number,
  startX: number,
  startY: number,
  allowed: SwipeDirection[],
): { clientX: number; clientY: number } => {
  const dx = clientX - startX;
  const dy = clientY - startY;
  let easedDx = dx;
  let easedDy = dy;
  if (dx < 0 && !allowed.includes("left")) {
    easedDx = -iOSRubberBand(-dx, 0, disallowedDirectionMaxDistance);
  } else if (dx > 0 && !allowed.includes("right")) {
    easedDx = iOSRubberBand(dx, 0, disallowedDirectionMaxDistance);
  }
  if (dy < 0 && !allowed.includes("up")) {
    easedDy = -iOSRubberBand(-dy, 0, disallowedDirectionMaxDistance);
  } else if (dy > 0 && !allowed.includes("down")) {
    easedDy = iOSRubberBand(dy, 0, disallowedDirectionMaxDistance);
  }
  return { clientX: startX + easedDx, clientY: startY + easedDy };
};

/**
 * @returns the final animations values for card animating away from the stack animation
 */
const getAnimationValues = (
  state: DraggingState,
  animationDuration: number,
) => {
  const distanceX = state.velocityX * animationDuration;
  const distanceY = state.velocityY * animationDuration;
  const currentTranslateX = state.lastX - state.startX;
  const currentTranslateY = state.lastY - state.startY;
  const currentRotation = getRotation(
    currentTranslateX,
    currentTranslateY,
    state.pivotX,
    state.pivotY,
  );
  const rotation = getRotation(
    distanceX,
    distanceY,
    state.pivotX,
    state.pivotY,
    currentRotation,
  );
  return { distanceX, distanceY, rotation };
};

/**
 * Animate the swiped element
 * @returns the animations as an array
 */
const animateSwipedElement = (
  element: HTMLElement,
  state: DraggingState,
  animationDuration: number,
  swipeStyle: SwipeStyle,
  getCard: GetCardElement,
  manual?: boolean,
) => {
  const [_emptyView, firstChild] = element.parentElement?.children ?? [];
  const firstChildStyle = firstChild ? getComputedStyle(firstChild) : undefined;
  const { distanceX, distanceY, rotation } = getAnimationValues(
    state,
    animationDuration,
  );
  const prevTranslate = element.style.translate;
  const prevRotate = element.style.rotate;
  const card = getCard(element);
  const originalRect =
    card instanceof HTMLElement
      ? getElementRectWithoutTransforms(card, true)
      : getElementRectWithoutTransforms(element, true);
  const origin = `${
    state.pivotX * originalRect.width + originalRect.width / 2
  }px ${state.pivotY * originalRect.height + originalRect.height / 2}px`;
  element.style.transformOrigin = origin;
  const [translateX = 0, translateY = 0] = prevTranslate
    .split(" ")
    .map((v) => parseFloat(v));
  const isTranslatedEnough =
    (Math.abs(distanceX) >= Math.abs(distanceY) &&
      Math.abs(translateX) >= Math.abs(distanceX)) ||
    (Math.abs(distanceX) < Math.abs(distanceY) &&
      Math.abs(translateY) >= Math.abs(distanceY));
  const options: KeyframeAnimationOptions = {
    duration: animationDuration,
    easing: manual
      ? cssEasing["--ease-in-out-cubic"]
      : cssEasing["--ease-out-cubic"],
    fill: "forwards",
  };
  const transform = `translate(${
    isTranslatedEnough ? translateX : distanceX
  }px, ${isTranslatedEnough ? translateY : distanceY}px) rotate(${
    isTranslatedEnough ? parseFloat(prevRotate) : rotation
  }deg)`;

  const animation = element.animate(
    {
      scale: swipeStyle === "discard" ? [0.9] : [1],
      rotate: ["0deg"],
      translate: ["none"],
      transform: [transform],
    },
    { ...options, duration: isTranslatedEnough ? 0 : animationDuration },
  );

  const animation2 =
    swipeStyle === "discard"
      ? element.animate(
          { opacity: [0] },
          { ...options, easing: cssEasing["--ease-in-cubic"] },
        )
      : element.animate(
          {
            scale: [firstChildStyle?.getPropertyValue("scale") ?? "0"],
            transform: ["translate(0, 0) rotate(0deg)"],
            translate: ["none"],
            transformOrigin: ["center 0"],
            rotate: ["0deg"],
            zIndex: [-1, -1],
            opacity: [0.5],
            paddingTop: [
              firstChildStyle?.getPropertyValue("padding-top") ?? "0",
            ],
            marginTop: [firstChildStyle?.getPropertyValue("margin-top") ?? "0"],
          },
          {
            ...options,
            easing: cssEasing["--ease-in-out-cubic"],
            delay: isTranslatedEnough ? 0 : animationDuration,
          },
        );
  const animations = [animation, animation2];
  return { animations };
};

/**
 * Compute the velocity of the swipe gesture for the given pointer coordinates
 */
const computeVelocity = (
  state: DraggingState,
  clientX: number,
  clientY: number,
) => {
  const maxAbsoluteVelocity = 1000;
  const currentTime = Date.now();
  const deltaTime = currentTime - state.lastTime;
  const deltaX = clientX - state.lastX;
  const deltaY = clientY - state.lastY;
  if (deltaTime > 0) {
    state.velocityX = deltaX / deltaTime; // (pixels per millisecond)
    if (Math.abs(state.velocityX) > maxAbsoluteVelocity) {
      state.velocityX = Math.sign(state.velocityX) * maxAbsoluteVelocity;
    }
    state.velocityY = deltaY / deltaTime; // (pixels per millisecond)
    if (Math.abs(state.velocityY) > maxAbsoluteVelocity) {
      state.velocityY = Math.sign(state.velocityY) * maxAbsoluteVelocity;
    }
  }
  state.lastX = clientX;
  state.lastY = clientY;
  state.lastTime = currentTime;
};

/**
 * Returns true if the card should be returned to the stack, based on
 * the velocity and drag distance
 */
const shouldReturnToStack = (state: DraggingState, rect: DOMRect) => {
  const deltaX = state.startX - state.lastX;
  const deltaY = state.startY - state.lastY;
  const dominantDimension =
    Math.abs(deltaX) >= Math.abs(deltaY) ? rect.width : rect.height;
  return (
    Math.abs(state.velocityX) < minVelocity &&
    Math.abs(state.velocityY) < minVelocity &&
    Math.hypot(deltaX, deltaY) < dominantDimension * minDistanceThreshold
  );
};

/**
 * Returns a `trigger` function and the current `swipeStyle` for use inside
 * programmatic swipe buttons. `trigger` handles finding the top card element,
 * wiring up the drag state, and committing the swipe — the callback only needs
 * to set the velocity/pivot/position values that differ per direction.
 */
const useProgrammaticSwipe = () => {
  const {
    discardedCardId,
    stack,
    dragStateRef,
    commitSwipe,
    swipeStyle,
    rootRef,
    swipeDirections,
  } = useContext(SwipeableCardsContext);

  const trigger = useCallback(
    (configure: (state: DraggingState, rect: DOMRect) => void) => {
      const last = stack[stack.length - 1];
      if (discardedCardId || !last) {
        return;
      }
      const element = rootRef.current?.querySelector(
        `[data-swipeable-cards-id="${last.id}"]`,
      );
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const rect = element.getBoundingClientRect();
      dragStateRef.current = { ...defaultDragState };
      const state = dragStateRef.current;
      state.element = element;
      state.dragging = true;
      state.draggingId = last.id;
      configure(state, rect);
      commitSwipe(true);
    },
    [commitSwipe, discardedCardId, dragStateRef, rootRef, stack],
  );

  return { trigger, swipeStyle, swipeDirections };
};

const useSwipeableCards = (
  cards: CardWithId[],
  loop?: boolean,
  emptyView?: ReactNode,
  onSwipe?: (direction: SwipeDirection, cardId: string) => void,
  swipeStyle: SwipeStyle = "discard",
  getCardElement: GetCardElement = defaultGetCard,
  sendToBackMargin = 0,
  swipeDirectionsInput?: AllowedSwipeDirection | AllowedSwipeDirection[],
) => {
  const [stack, setStack] = useState(cards);
  const [discardedCardId, setDiscardedCardId] = useState<string>("");
  const dragStateRef = useRef<DraggingState>({ ...defaultDragState });
  const animationRef = useRef<Animation[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Normalized list exposed via context so consumers (buttons, custom triggers)
  // can read the active directions and react to changes.
  const swipeDirections = useMemo(
    () =>
      swipeDirectionsInput
        ? normalizeSwipeDirections(swipeDirectionsInput)
        : defaultSwipeDirections,
    [swipeDirectionsInput],
  );
  // Mirror in a ref so the pointer-move listener and `commitSwipe` can read
  // the latest value without forcing re-registration / re-creation.
  const swipeDirectionsRef = useRef(swipeDirections);
  // eslint-disable-next-line react-hooks/refs
  swipeDirectionsRef.current = swipeDirections;

  /**
   * Update the stack when the animations are finished and reset styles
   */
  const handleAnimationsFinished = useCallback(
    (animations: Animation[], element: HTMLElement) => {
      Promise.all(animations.map((animation) => animation.finished)).then(
        (animations) => {
          setDiscardedCardId("");
          setStack((prev) => {
            const last = prev[prev.length - 1];
            if (last) {
              return loop ? [last, ...prev.slice(0, -1)] : prev.slice(0, -1);
            }
            return prev;
          });
          setTimeout(() => {
            animations.forEach((animation) => {
              animation.cancel();
            });
            element.style.transform = "";
            element.style.translate = "";
            element.style.rotate = "";
            element.style.transformOrigin = "";
          });
          animationRef.current = [];
        },
      );
    },
    [loop],
  );

  const commitSwipe = useCallback(
    (manual?: boolean, _event?: PointerEvent) => {
      const animationDuration = 300;
      const state = dragStateRef.current;
      const element = state.element;
      if (!state.dragging || !element) {
        return;
      }
      const rect = getCardElement(element).getBoundingClientRect();
      if (shouldReturnToStack(state, rect)) {
        animateReturnToStack(state, element);
        return;
      }
      const swipeDirection = getSwipeDirection(state);
      if (!swipeDirectionsRef.current.includes(swipeDirection)) {
        animateReturnToStack(state, element);
        return;
      }
      const cards = rootRef.current?.querySelector<HTMLElement>(
        "[data-swipeable-cards-cards]",
      );
      if (!cards) {
        throw new Error(
          "No cards container found, did you wrap cards within <SwipeableCards.Cards>?",
        );
      }
      adjustVelocityForExit(
        state,
        rect,
        animationDuration,
        swipeStyle,
        cards,
        getCardElement,
        sendToBackMargin,
        swipeDirection,
        0,
      );
      const discardedCardId = element.dataset.swipeableCardsId ?? "";
      setDiscardedCardId(discardedCardId);
      const { animations } = animateSwipedElement(
        element,
        state,
        animationDuration,
        swipeStyle,
        getCardElement,
        manual,
      );
      handleAnimationsFinished(animations, element);
      animationRef.current.push(...animations);
      state.dragging = false;
      state.draggingId = "";
      state.element = null;
      onSwipe?.(swipeDirection, discardedCardId);
    },
    [
      swipeStyle,
      getCardElement,
      handleAnimationsFinished,
      onSwipe,
      sendToBackMargin,
    ],
  );

  return {
    loop,
    emptyView,
    cards,
    stack,
    setStack,
    discardedCardId,
    setDiscardedCardId,
    dragStateRef,
    animationRef,
    commitSwipe,
    swipeStyle,
    getCardElement,
    sendToBackMargin,
    rootRef,
    swipeDirections,
    swipeDirectionsRef,
  };
};

const SwipeableCardsContext = createContext<
  ReturnType<typeof useSwipeableCards>
>({
  loop: undefined,
  emptyView: undefined,
  cards: [],
  stack: [],
  setStack: () => undefined,
  discardedCardId: "",
  setDiscardedCardId: () => undefined,
  dragStateRef: { current: defaultDragState },
  animationRef: { current: [] },
  commitSwipe: () => undefined,
  swipeStyle: "discard",
  rootRef: { current: null },
  getCardElement: defaultGetCard,
  sendToBackMargin: 0,
  swipeDirections: defaultSwipeDirections,
  swipeDirectionsRef: { current: defaultSwipeDirections },
});

export const SwipeableCardsRoot = forwardRef<
  HTMLDivElement,
  SwipeableCardsProps
>(
  (
    {
      cards,
      loop,
      onSwipe,
      emptyView,
      swipeStyle,
      children,
      getCardElement,
      sendToBackMargin,
      swipeDirections,
      ...rest
    },
    ref,
  ) => {
    const context = useSwipeableCards(
      cards,
      loop,
      emptyView,
      onSwipe,
      swipeStyle,
      getCardElement,
      sendToBackMargin,
      swipeDirections,
    );
    const { dragStateRef, commitSwipe, swipeDirectionsRef } = context;

    useEffect(() => {
      const handlePointerMove = (event: PointerEvent) => {
        const state = dragStateRef.current;
        if (!state.dragging || !state.element) {
          return;
        }
        event.preventDefault();
        // Rubber-band the pointer position on any axis whose direction is not
        // in `swipeDirections`, so the card eases up to a small offset
        // (`disallowedDirectionMaxDistance`) instead of moving freely.
        const { clientX, clientY } = applyDisallowedDirectionRubberBand(
          event.clientX,
          event.clientY,
          state.startX,
          state.startY,
          swipeDirectionsRef.current,
        );
        computeVelocity(state, clientX, clientY);
        const translateX = state.lastX - state.startX;
        const translateY = state.lastY - state.startY;
        const rotation = getRotation(
          translateX,
          translateY,
          state.pivotX,
          state.pivotY,
        );
        state.element.style.translate = `${translateX}px ${translateY}px`;
        state.element.style.rotate = `${rotation}deg`;
      };

      const handlePointerUp = (event: PointerEvent) => {
        if (dragStateRef.current.dragging) {
          commitSwipe(false, event);
        }
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      return () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };
    }, [commitSwipe, dragStateRef, swipeDirectionsRef]);

    return (
      <SwipeableCardsContext.Provider value={context}>
        <div
          ref={combineRefs(ref, context.rootRef)}
          {...rest}
          data-swipeable-cards-root={""}
        >
          {children}
        </div>
      </SwipeableCardsContext.Provider>
    );
  },
);

SwipeableCardsRoot.displayName = "SwipeableCardsRoot";

export type StackRenderer = (stack: CardWithId[]) => ReactNode;

export type SwipeableCardsCardsProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  visibleStackLength?: number;
  children?: ReactNode | StackRenderer;
};

const defaultStackRenderer: StackRenderer = (stack) => {
  return stack.map((card) => (
    <SwipeableCardsCardWrapper card={card} key={card.id} />
  ));
};

const SwipeableCardsCards = forwardRef<
  HTMLDivElement,
  SwipeableCardsCardsProps
>(
  (
    { visibleStackLength = 4, style, children = defaultStackRenderer, ...rest },
    ref,
  ) => {
    const { stack, emptyView, discardedCardId, loop } = useContext(
      SwipeableCardsContext,
    );

    const shouldOffset =
      stack.length <= visibleStackLength && discardedCardId && !loop;

    return (
      <div
        ref={ref}
        data-swipeable-cards-cards={""}
        {...rest}
        style={
          {
            ...style,
            "--visible-stack-length": Math.max(
              Math.min(visibleStackLength, stack.length) -
                1 -
                (shouldOffset ? 1 : 0),
              0,
            ),
            "--stack-length": Math.max(
              stack.length - (shouldOffset ? 1 : 0),
              0,
            ),
          } as CSSProperties
        }
      >
        <div data-empty={""}>{emptyView ?? null}</div>
        {typeof children === "function" ? children(stack) : children}
      </div>
    );
  },
);

SwipeableCardsCards.displayName = "SwipeableCardsCards";

export type SwipeableCardsCardWrapperProps = ComponentPropsWithoutRef<"div"> &
  PropsWithChildren<{
    card: CardWithId;
  }>;

const SwipeableCardsCardWrapper = forwardRef<
  HTMLDivElement,
  SwipeableCardsCardWrapperProps
>(({ card, onDragStart, onPointerDown, style, children, ...rest }, ref) => {
  const { discardedCardId, stack, dragStateRef, animationRef } = useContext(
    SwipeableCardsContext,
  );
  const isBeingDiscarded = discardedCardId === card.id;
  const isDiscarding = !!discardedCardId;
  const index = stack.findIndex((stackCard) => stackCard.id === card.id);
  const stackIndex =
    stack.length - (index + (isDiscarding && !isBeingDiscarded ? 1 : 0));
  const stackIndex0 = stackIndex - 1;

  return (
    <div
      ref={ref}
      data-swipeable-cards-card-wrapper={""}
      data-swipeable-cards-id={card.id}
      data-swipeable-cards-top-card={stackIndex0 ? "false" : "true"}
      style={
        {
          ...style,
          "--stack-index": stackIndex,
          "--stack-index0": stackIndex0,
        } as CSSProperties
      }
      {...rest}
      onDragStart={(event) => {
        event.preventDefault();
        onDragStart?.(event);
      }}
      onPointerDown={(event) => {
        if (stackIndex0 !== 0) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const dragState = dragStateRef.current;
        const rect = event.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        dragState.dragging = true;
        dragState.startX = event.clientX;
        dragState.startY = event.clientY;
        dragState.lastX = event.clientX;
        dragState.lastY = event.clientY;
        dragState.velocityX = 0;
        dragState.velocityY = 0;
        dragState.lastTime = Date.now();
        dragState.draggingId = card.id;
        dragState.pivotX = (event.clientX - centerX) / rect.width / 2;
        dragState.pivotY = (event.clientY - centerY) / rect.height / 2;
        dragState.element = event.currentTarget;
        event.currentTarget.style.transformOrigin = `${
          event.clientX - rect.left
        }px ${event.clientY - rect.top}px`;
        animationRef.current.forEach((animation) => {
          animation.finish();
        });
        onPointerDown?.(event);
      }}
    >
      {children ?? card.card}
    </div>
  );
});

SwipeableCardsCardWrapper.displayName = "SwipeableCardsCard";

const SwipeableCardsSwipeLeftButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button">
>(({ children, onClick, disabled, ...rest }, ref) => {
  const { trigger, swipeStyle, swipeDirections } = useProgrammaticSwipe();
  const isAllowed = swipeDirections.includes("left");
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || !isAllowed}
      onClick={(event) => {
        onClick?.(event);
        trigger((state, rect) => {
          const xModifier = rect.width / 442;
          state.velocityX =
            swipeStyle === "discard"
              ? -(Math.random() * 2 + 3) * xModifier
              : -0.15;
          state.velocityY =
            swipeStyle === "discard" ? -Math.random() : Math.random() * -0.14;
          state.pivotX = -(Math.random() * 0.25 + 0.25);
          state.pivotY = Math.random() * 0.25 + 0.25;
          state.startX = 0;
          state.lastX = -1;
          state.startY = 0;
          state.lastY = 0;
        });
      }}
    >
      {children}
    </button>
  );
});

SwipeableCardsSwipeLeftButton.displayName = "SwipeableCardsSwipeLeftButton";

const SwipeableCardsSwipeRightButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button">
>(({ children, onClick, disabled, ...rest }, ref) => {
  const { trigger, swipeStyle, swipeDirections } = useProgrammaticSwipe();
  const isAllowed = swipeDirections.includes("right");
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || !isAllowed}
      onClick={(event) => {
        onClick?.(event);
        trigger((state, rect) => {
          const xModifier = rect.width / 442;
          state.velocityX =
            swipeStyle === "discard"
              ? (Math.random() * 2 + 3) * xModifier
              : 0.15;
          state.velocityY =
            swipeStyle === "discard" ? Math.random() : Math.random() * 0.14;
          state.pivotX = Math.random() * 0.25 + 0.25;
          state.pivotY = Math.random() * 0.25 + 0.25;
          state.startX = 0;
          state.lastX = 1;
        });
      }}
    >
      {children}
    </button>
  );
});

SwipeableCardsSwipeRightButton.displayName = "SwipeableCardsSwipeRightButton";

const SwipeableCardsSwipeUpButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button">
>(({ children, onClick, disabled, ...rest }, ref) => {
  const { trigger, swipeStyle, swipeDirections } = useProgrammaticSwipe();
  const isAllowed = swipeDirections.includes("up");
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || !isAllowed}
      onClick={(event) => {
        onClick?.(event);
        trigger((state, rect) => {
          const yModifier = rect.height / 442;
          state.velocityX =
            swipeStyle === "discard"
              ? Math.random() * 2 - 1
              : Math.random() * 0.1 - 0.1;
          state.velocityY =
            swipeStyle === "discard"
              ? -(Math.random() * 2 + 3) * yModifier
              : -0.15;
          state.pivotX = Math.random() * 0.25 * (Math.random() > 0.5 ? 1 : -1);
          state.pivotY = -(Math.random() * 0.25 + 0.25);
          state.startX = 0;
          state.lastX = 0;
          state.startY = 0;
          state.lastY = -1;
        });
      }}
    >
      {children}
    </button>
  );
});

SwipeableCardsSwipeUpButton.displayName = "SwipeableCardsSwipeUpButton";

const SwipeableCardsSwipeDownButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button">
>(({ children, onClick, disabled, ...rest }, ref) => {
  const { trigger, swipeStyle, swipeDirections } = useProgrammaticSwipe();
  const isAllowed = swipeDirections.includes("down");
  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || !isAllowed}
      onClick={(event) => {
        onClick?.(event);
        trigger((state, rect) => {
          const yModifier = rect.height / 442;
          state.velocityX =
            swipeStyle === "discard"
              ? Math.random() * 2 - 1
              : Math.random() * 0.1 - 0.1;
          state.velocityY =
            swipeStyle === "discard"
              ? (Math.random() * 2 + 3) * yModifier
              : 0.15;
          state.pivotX = Math.random() * 0.25 * (Math.random() > 0.5 ? 1 : -1);
          state.pivotY = -(Math.random() * 0.25 + 0.25);
          state.startX = 0;
          state.lastX = 0;
          state.startY = 0;
          state.lastY = 1;
        });
      }}
    >
      {children}
    </button>
  );
});

SwipeableCardsSwipeDownButton.displayName = "SwipeableCardsSwipeDownButton";

export const SwipeableCards = {
  Root: SwipeableCardsRoot,
  Context: SwipeableCardsContext,
  Cards: SwipeableCardsCards,
  CardWrapper: SwipeableCardsCardWrapper,
  SwipeRightButton: SwipeableCardsSwipeRightButton,
  SwipeLeftButton: SwipeableCardsSwipeLeftButton,
  SwipeUpButton: SwipeableCardsSwipeUpButton,
  SwipeDownButton: SwipeableCardsSwipeDownButton,
  useSwipeableCardsContext: () => useContext(SwipeableCardsContext),
  useSwipeableCardsStack: () => {
    const { stack } = useContext(SwipeableCardsContext);
    return useMemo(() => stack, [stack]);
  },
  useProgrammaticSwipe,
};
