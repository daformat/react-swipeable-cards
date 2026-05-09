# React swipeable cards

![NPM Version](https://img.shields.io/npm/v/%40daformat%2Freact-swipeable-cards)
![NPM Downloads](https://img.shields.io/npm/dm/%40daformat%2Freact-swipeable-cards)

A headless React swipeable cards carousel component, similar to Tinder, with no
runtime dependencies. Drag, fling, or programmatically swipe cards left, right,
up or down. Cards can be discarded off-screen or sent to the back of the stack
to loop forever. Built with the Web Animations API for smooth, momentum-aware
animations and pivot-weighted rotation that feels natural under the finger.

## Installation

```bash
npm install @daformat/react-swipeable-cards
```

```bash
yarn add @daformat/react-swipeable-cards
```

```bash
pnpm add @daformat/react-swipeable-cards
```

```bash
bun add @daformat/react-swipeable-cards
```

```bash
deno add npm:@daformat/react-swipeable-cards
```

## Demo

https://hello-mat.com/design-engineering/component/swipeable-cards

## Quick start

```tsx
import { SwipeableCards } from "@daformat/react-swipeable-cards";

const cards = [
  { id: "1", card: <div className="card">Card 1</div> },
  { id: "2", card: <div className="card">Card 2</div> },
  { id: "3", card: <div className="card">Card 3</div> },
];

export function App() {
  return (
    <SwipeableCards.Root
      cards={cards}
      emptyView={<div>No more cards</div>}
      onSwipe={(direction, cardId) => {
        console.log(`Swiped ${cardId} ${direction}`);
      }}
    >
      <SwipeableCards.Cards />
      <SwipeableCards.SwipeLeftButton>👎</SwipeableCards.SwipeLeftButton>
      <SwipeableCards.SwipeRightButton>👍</SwipeableCards.SwipeRightButton>
    </SwipeableCards.Root>
  );
}
```

The component is **headless**: nothing is styled out of the box. You decide
how cards look, you decide how the stack is laid out (typically with CSS
custom properties exposed by the component, see
[CSS custom properties](#css-custom-properties)).

## Styling examples

Given the following jsx:

```tsx
// full source: https://github.com/daformat/hello-mat/blob/master/pages/design-engineering/component/swipeable-cards.tsx

<SwipeableCards.Root
  cards={[...cards /* omitted for brevity */]}
  className={styles.cards_root}
  data-style={"stacked-offset" /* "stacked-rotation" | "minimal" */}
  swipeStyle={"sendToBack"}
  sendToBackMargin={16}
  loop
>
  <SwipeableCards.Cards
    visibleStackLength={4}
    style={{ aspectRatio: "650 / 400" }}
  />
</SwipeableCards.Root>
```

Here is how I styled it in the [demo](https://hello-mat.com/design-engineering/component/swipeable-cards)

```scss
/* full source: https://github.com/daformat/hello-mat/blob/master/components/SwipeableCards/SwipeableCards.module.scss */

.cards_root {
  --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);

  [data-swipeable-cards-cards] {
    display: grid;
    grid-template-columns: 1fr;
    place-content: center;
    position: relative;
    touch-action: none;
    z-index: 1;

    [data-swipeable-cards-card-wrapper] {
      align-content: center;
      align-self: center;
      grid-area: 1 / 1;
      opacity: calc(
        1 - clamp(0, var(--stack-index0) - var(--visible-stack-length), 1)
      );
      touch-action: none;
      transform-origin: center 0;
      transition: all 0.2s var(--ease-out-cubic);
      transition-property: opacity, scale, padding-top, margin-top;
      width: 100%;
      will-change: opacity, scale, padding-top, margin-top, transform;
    }
  }

  &:is([data-style="stacked-offset"], [data-style="stacked-rotation"]) {
    [data-swipeable-cards-cards] {
      [data-swipeable-cards-card-wrapper] {
        scale: calc(
          100% - min(var(--stack-index0), var(--visible-stack-length)) * 10%
        );
      }
    }
  }

  &[data-style="stacked-offset"] {
    [data-swipeable-cards-cards] {
      [data-swipeable-cards-card-wrapper] {
        // Pick whatever vertical step you want between stacked cards.
        --card-top-distance: clamp(16px, 1vw, 32px);
        --p: calc(
          var(--card-top-distance) *
            max(var(--visible-stack-length) - var(--stack-index0), 0)
        );
        --m: calc(
          var(--card-top-distance) *
            (
              var(--visible-stack-length) - max(
                  var(--visible-stack-length) - var(--stack-index0),
                  0
                )
            )
        );
        margin-top: calc(var(--m) * -1);
        padding-top: calc(var(--p));
      }
    }
  }
}
```

## Component structure

```tsx
/* Provides context to all swipeable card components */
<SwipeableCards.Root cards={cards} emptyView={...}>
  {/* The stack container */}
  <SwipeableCards.Cards>
    {/* Optional: bring your own renderer; otherwise the default renders one CardWrapper per card */}
    {(stack) =>
      stack.map((card) => (
        <SwipeableCards.CardWrapper key={card.id} card={card} />
      ))
    }
  </SwipeableCards.Cards>
  {/* Optional programmatic swipe buttons */}
  <SwipeableCards.SwipeLeftButton />
  <SwipeableCards.SwipeRightButton />
  <SwipeableCards.SwipeUpButton />
  <SwipeableCards.SwipeDownButton />
</SwipeableCards.Root>
```

## Components

### `SwipeableCards.Root`

The outermost wrapper. Provides context, sets up the drag state, and listens
to `pointermove` / `pointerup` on the document. Renders a `<div>`.

The `loop` prop is part of a discriminated union: when `loop` is `false` (or
omitted) you **must** pass `emptyView`; when `loop` is `true` you **must not**
pass `emptyView`.

| Prop               | Type                                                  | Default     | Description                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards` (required) | `CardWithId[]`                                        | —           | Initial cards in the stack. The last item is the top card.                                                                                                                                                                                                                                                                                                                                    |
| `emptyView`        | `ReactNode`                                           | —           | Required when `loop` is `false`. Displayed when the stack is empty.                                                                                                                                                                                                                                                                                                                           |
| `loop`             | `boolean`                                             | `false`     | When `true`, swiped cards animate to the back of the stack instead of being removed. `emptyView` cannot be set in this mode.                                                                                                                                                                                                                                                                  |
| `onSwipe`          | `(direction: SwipeDirection, cardId: string) => void` | —           | Called once per swipe, immediately after the card commits to flying out (before the animation finishes).                                                                                                                                                                                                                                                                                      |
| `swipeStyle`       | `"discard" \| "sendToBack"`                           | `"discard"` | `"discard"` flings the card off-screen and fades it out. `"sendToBack"` slides it just past the stack edge before animating it under the other cards.                                                                                                                                                                                                                                         |
| `sendToBackMargin` | `number`                                              | `0`         | Extra pixels the card travels past the stack edge before being sent to the back. Only used when `swipeStyle` is `"sendToBack"`.                                                                                                                                                                                                                                                               |
| `getCardElement`   | `(element: Element) => Element`                       | first child | Receives the wrapper element and returns the actual card element to use for collision detection. Defaults to `element.firstElementChild ?? element`, so by default any padding on the wrapper is excluded. Override when the visible card isn't the wrapper's first child (e.g. when you nest extra layout elements inside the wrapper).                                                      |
| `swipeDirections`  | `AllowedSwipeDirection \| AllowedSwipeDirection[]`    | all 4       | Restricts which directions the card can be swiped. Accepts a single value or array of `SwipeDirection \| "x" \| "y" \| "horizontal" \| "vertical"`. The shortcuts expand to the corresponding pair (`"x"`/`"horizontal"` → `["left", "right"]`, `"y"`/`"vertical"` → `["up", "down"]`). Constrains pointer drag to the allowed axes/directions and disables the matching directional buttons. |
| `ref`              | `Ref<HTMLDivElement>`                                 | —           | Forwarded ref to the root `<div>`.                                                                                                                                                                                                                                                                                                                                                            |
| `...props`         | `ComponentPropsWithoutRef<"div">`                     | —           | All standard `<div>` props (`className`, `style`, `children`, etc.).                                                                                                                                                                                                                                                                                                                          |

#### Data attributes set on the root

| Attribute                   | Values | Description                                         |
| --------------------------- | ------ | --------------------------------------------------- |
| `data-swipeable-cards-root` | `""`   | Always present. Marks the root for context lookups. |

---

### `SwipeableCards.Cards`

The stack container. Sets CSS custom properties used by your card styles to
compute z-index, scale, opacity, etc. for stacked cards. Renders a `<div>`
plus an inner `<div data-empty>` that holds the empty view when the stack is
empty (the empty view is always rendered, so you can transition it in/out
freely).

| Prop                 | Type                                                | Default                      | Description                                                                                                                                               |
| -------------------- | --------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibleStackLength` | `number`                                            | `4`                          | How many cards from the top of the stack should appear in the visible peek. Used to compute `--visible-stack-length` for your styles.                     |
| `children`           | `ReactNode \| (stack: CardWithId[]) => ReactNode`   | renders one wrapper per card | Either pre-rendered children or a function that receives the current stack and returns nodes. Use the function form when you need per-card customization. |
| `ref`                | `Ref<HTMLDivElement>`                               | —                            | Forwarded ref to the cards `<div>`.                                                                                                                       |
| `...props`           | `Omit<ComponentPropsWithoutRef<"div">, "children">` | —                            | All standard `<div>` props except `children` (overridden by the function-as-children variant).                                                            |

#### Data attributes set on the cards container

| Attribute                    | Values | Description                                          |
| ---------------------------- | ------ | ---------------------------------------------------- |
| `data-swipeable-cards-cards` | `""`   | Always present. Used internally to locate the stack. |
| `data-empty`                 | `""`   | Set on the inner wrapper that holds the empty view.  |

---

### `SwipeableCards.CardWrapper`

A wrapper around a single card. Owns the pointer interactions for that card —
only the top card responds to `pointerdown`. Renders a `<div>` containing
either `card.card` or, if you pass `children`, your own content.

| Prop              | Type                              | Default     | Description                                                                                                                     |
| ----------------- | --------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `card` (required) | `CardWithId`                      | —           | The `{ id, card }` entry from the stack this wrapper represents.                                                                |
| `children`        | `ReactNode`                       | `card.card` | Override the card's own JSX. Useful for layering controls on top of the card while keeping the wrapper handling pointer events. |
| `ref`             | `Ref<HTMLDivElement>`             | —           | Forwarded ref to the wrapper `<div>`.                                                                                           |
| `...props`        | `ComponentPropsWithoutRef<"div">` | —           | All standard `<div>` props. `onPointerDown` and `onDragStart` are merged with internal handlers (yours runs after).             |

#### Data attributes set on each wrapper

| Attribute                           | Values                | Description                                                                                                                   |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `data-swipeable-cards-card-wrapper` | `""`                  | Always present. Used internally to enumerate stack items.                                                                     |
| `data-swipeable-cards-id`           | the `card.id`         | Lets you target a specific card from CSS or query selectors.                                                                  |
| `data-swipeable-cards-top-card`     | `"true"` \| `"false"` | `"true"` when this wrapper is currently the top card. Useful for highlighting the actionable card with an attribute selector. |

---

### `SwipeableCards.SwipeLeftButton` / `SwipeRightButton` / `SwipeUpButton` / `SwipeDownButton`

Programmatic swipe buttons. Clicking one triggers a swipe of the current top
card in that direction with a randomized pivot, velocity, and rotation, so
repeated clicks feel natural. Automatically no-op when the stack is empty or
a swipe is already in progress. Render a `<button>`.

| Prop       | Type                                   | Default | Description                                                                                                                  |
| ---------- | -------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `onClick`  | `MouseEventHandler<HTMLButtonElement>` | —       | Called synchronously before the swipe is triggered. Useful for analytics, sound effects, or syncing companion UI animations. |
| `ref`      | `Ref<HTMLButtonElement>`               | —       | Forwarded ref to the `<button>`.                                                                                             |
| `...props` | `ComponentPropsWithoutRef<"button">`   | —       | All standard `<button>` props.                                                                                               |

---

## Hooks

### `SwipeableCards.useSwipeableCardsContext()`

Returns the full internal context. Must be used inside `SwipeableCards.Root`.

```tsx
const {
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
} = SwipeableCards.useSwipeableCardsContext();
```

| Property             | Type                                               | Description                                                                                                                          |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `loop`               | `boolean \| undefined`                             | Reflects the `loop` prop passed to `Root`.                                                                                           |
| `emptyView`          | `ReactNode`                                        | The empty view passed to `Root` (only set when `loop` is `false`).                                                                   |
| `cards`              | `CardWithId[]`                                     | The original `cards` prop passed to `Root`. Use `stack` for the live, mutated list.                                                  |
| `stack`              | `CardWithId[]`                                     | The current stack. Cards are removed (or rotated, when looping) as they are swiped.                                                  |
| `setStack`           | `Dispatch<SetStateAction<CardWithId[]>>`           | Imperatively replace the stack. Useful for adding new cards on demand.                                                               |
| `discardedCardId`    | `string`                                           | The id of the card currently animating out, or `""` if no swipe is in progress.                                                      |
| `setDiscardedCardId` | `Dispatch<SetStateAction<string>>`                 | Setter for the above (rarely needed externally).                                                                                     |
| `dragStateRef`       | `RefObject<DraggingState>`                         | The mutable drag state (pointer position, velocity, pivot, currently-dragged element). Read it during a drag for custom UI feedback. |
| `animationRef`       | `RefObject<Animation[]>`                           | The Web Animations API animations currently running for the active swipe.                                                            |
| `commitSwipe`        | `(manual?: boolean, event?: PointerEvent) => void` | Commits the current drag state into a swipe (or returns the card to the stack if the gesture is too small).                          |
| `swipeStyle`         | `"discard" \| "sendToBack"`                        | Reflects the `swipeStyle` prop.                                                                                                      |
| `getCardElement`     | `(element: Element) => Element`                    | Reflects the `getCardElement` prop.                                                                                                  |
| `sendToBackMargin`   | `number`                                           | Reflects the `sendToBackMargin` prop.                                                                                                |
| `rootRef`            | `RefObject<HTMLDivElement>`                        | Ref to the root `<div>` rendered by `SwipeableCards.Root`.                                                                           |
| `swipeDirections`    | `SwipeDirection[]`                                 | The normalized list of allowed swipe directions (defaults to all 4). Re-renders consumers when the `swipeDirections` prop changes.   |
| `swipeDirectionsRef` | `RefObject<SwipeDirection[]>`                      | Ref mirror of the above for read-anywhere access in event handlers without re-binding listeners.                                     |

---

### `SwipeableCards.useSwipeableCardsStack()`

Convenience hook that returns just the current `stack` (memoized). Use this
in components that only care about the stack, to avoid re-rendering on
unrelated context changes.

```tsx
const stack = SwipeableCards.useSwipeableCardsStack();
```

---

### `SwipeableCards.useProgrammaticSwipe()`

Powers the built-in directional buttons. Use it to build your own swipe
triggers. Throws if the surrounding tree does not include a
`SwipeableCards.Cards` container when the trigger fires.

```tsx
const { trigger, swipeStyle, swipeDirections } =
  SwipeableCards.useProgrammaticSwipe();
```

| Property          | Type                                                                 | Description                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trigger`         | `(configure: (state: DraggingState, rect: DOMRect) => void) => void` | Triggers a swipe of the top card. Your `configure` callback receives the (zeroed) drag state and the wrapper's bounding rect; set `velocityX/Y`, `pivotX/Y`, `startX/Y`, `lastX/Y`. |
| `swipeStyle`      | `"discard" \| "sendToBack"`                                          | Mirrors the active `swipeStyle` so your custom button can pick velocity values that look right for either mode.                                                                     |
| `swipeDirections` | `SwipeDirection[]`                                                   | The normalized list of allowed directions, useful for disabling your own custom triggers when their direction is not allowed.                                                       |

#### Example: a "super-like" upward swipe

```tsx
function SuperLikeButton() {
  const { trigger } = SwipeableCards.useProgrammaticSwipe();
  return (
    <button
      type="button"
      onClick={() =>
        trigger((state, rect) => {
          state.velocityX = 0;
          state.velocityY = -(rect.height / 442) * 4;
          state.pivotX = 0;
          state.pivotY = -0.4;
          state.startY = 0;
          state.lastY = -1;
        })
      }
    >
      ⭐
    </button>
  );
}
```

---

## CSS custom properties

The component sets these CSS custom properties so you can fully drive the
visual stack appearance from your own CSS, without prop-drilling values
into every card.

#### On `SwipeableCards.Cards`

| Property                 | Description                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `--stack-length`         | Number of cards currently in the stack.                                                                           |
| `--visible-stack-length` | Number of cards in the "peek" (top of the stack visible behind the topmost card), capped to `visibleStackLength`. |

#### On each `SwipeableCards.CardWrapper`

| Property         | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `--stack-index`  | 1-based index of the card from the top. The top card is `1`. |
| `--stack-index0` | 0-based index of the card from the top. The top card is `0`. |

#### Example styling

```css
[data-swipeable-cards-card-wrapper] {
  position: absolute;
  inset: 0;
  transform-origin: center top;
  transition:
    scale 0.3s,
    translate 0.3s;
  scale: calc(1 - var(--stack-index0) * 0.05);
  translate: 0 calc(var(--stack-index0) * clamp(16px, 1vw, 32px));
  z-index: var(--stack-length);
  pointer-events: none;
}

[data-swipeable-cards-top-card="true"] {
  pointer-events: auto;
  cursor: grab;
}

[data-swipeable-cards-top-card="true"]:active {
  cursor: grabbing;
}
```

---

## Exported types

```ts
import type {
  CardWithId,
  SwipeDirection,
  AllowedSwipeDirection,
  SwipeStyle,
  GetCardElement,
  StackRenderer,
  DraggingState,
  BaseSwipeableCardsProps,
  NotLoopingSwipeableProps,
  LoopingSwipeableProps,
  SwipeableCardsProps,
  SwipeableCardsCardsProps,
  SwipeableCardsCardWrapperProps,
} from "@daformat/react-swipeable-cards";
```

| Type                    | Shape                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CardWithId`            | `{ id: string; card: JSX.Element }`                                                                                 |
| `SwipeDirection`        | `"left" \| "right" \| "up" \| "down"`                                                                               |
| `AllowedSwipeDirection` | `SwipeDirection \| "x" \| "y" \| "horizontal" \| "vertical"` — accepted by the `swipeDirections` prop.              |
| `SwipeStyle`            | `"discard" \| "sendToBack"`                                                                                         |
| `GetCardElement`        | `(element: Element) => Element`                                                                                     |
| `StackRenderer`         | `(stack: CardWithId[]) => ReactNode`                                                                                |
| `DraggingState`         | Mutable drag state object (pointer position, velocity, pivot, currently-dragged element). See `dragStateRef` above. |
| `SwipeableCardsProps`   | Discriminated union of `NotLoopingSwipeableProps` and `LoopingSwipeableProps`.                                      |
