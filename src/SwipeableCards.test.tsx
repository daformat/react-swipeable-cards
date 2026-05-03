import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, type JSX } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type CardWithId,
  SwipeableCards,
  type SwipeableCardsProps,
  SwipeableCardsRoot,
} from "./SwipeableCards.js";

/**
 * Build a deterministic list of {id, card} entries so tests can match on the
 * rendered text of each card.
 */
const makeCards = (count: number): CardWithId[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `card-${i + 1}`,
    card: <div data-testid={`card-${i + 1}`}>Card {i + 1}</div>,
  }));

type RenderOptions = Partial<Omit<SwipeableCardsProps, "cards">> & {
  cards?: CardWithId[];
  withButtons?: boolean;
};

/**
 * Helper that renders a SwipeableCards tree configured for testing.
 * - Always wraps the cards container so commitSwipe can find it.
 * - Optionally renders the directional swipe buttons.
 */
const renderCards = (options: RenderOptions = {}) => {
  const {
    cards = makeCards(3),
    onSwipe,
    swipeStyle,
    loop,
    sendToBackMargin,
    emptyView,
    withButtons = true,
  } = options;

  const props = {
    cards,
    onSwipe,
    swipeStyle,
    sendToBackMargin,
    ...(loop
      ? { loop: true as const }
      : { loop: false as const, emptyView: emptyView ?? <div>No more</div> }),
  } as SwipeableCardsProps;

  return render(
    <SwipeableCards.Root {...props}>
      <SwipeableCards.Cards>
        {(stack) =>
          stack.map((card) => (
            <SwipeableCards.CardWrapper card={card} key={card.id} />
          ))
        }
      </SwipeableCards.Cards>
      {withButtons ? (
        <>
          <SwipeableCards.SwipeLeftButton>left</SwipeableCards.SwipeLeftButton>
          <SwipeableCards.SwipeRightButton>
            right
          </SwipeableCards.SwipeRightButton>
          <SwipeableCards.SwipeUpButton>up</SwipeableCards.SwipeUpButton>
          <SwipeableCards.SwipeDownButton>down</SwipeableCards.SwipeDownButton>
        </>
      ) : null}
    </SwipeableCards.Root>,
  );
};

const getRoot = () =>
  document.querySelector<HTMLDivElement>("[data-swipeable-cards-root]");

const getCardsContainer = () =>
  document.querySelector<HTMLDivElement>("[data-swipeable-cards-cards]");

const getCardWrappers = () =>
  Array.from(
    document.querySelectorAll<HTMLDivElement>(
      "[data-swipeable-cards-card-wrapper]",
    ),
  );

const getTopCard = () =>
  document.querySelector<HTMLDivElement>(
    '[data-swipeable-cards-top-card="true"]',
  );

describe("SwipeableCards.Root", () => {
  it("renders its children inside a root element with the correct data attribute", () => {
    renderCards({ cards: makeCards(2) });

    const root = getRoot();
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-swipeable-cards-root", "");
    expect(getCardsContainer()).toBeInTheDocument();
  });

  it("forwards the ref to the underlying root div", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <SwipeableCardsRoot
        ref={ref}
        cards={makeCards(1)}
        loop={false}
        emptyView={null}
      >
        <SwipeableCards.Cards />
      </SwipeableCardsRoot>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveAttribute("data-swipeable-cards-root", "");
  });

  it("spreads extra HTML attributes on the root element", () => {
    render(
      <SwipeableCards.Root
        cards={makeCards(1)}
        loop={false}
        emptyView={null}
        className="custom-root"
        aria-label="cards"
        id="my-root"
      >
        <SwipeableCards.Cards />
      </SwipeableCards.Root>,
    );
    const root = getRoot();
    expect(root).toHaveClass("custom-root");
    expect(root).toHaveAttribute("aria-label", "cards");
    expect(root).toHaveAttribute("id", "my-root");
  });
});

describe("SwipeableCards.Cards", () => {
  it("renders all cards using the default renderer", () => {
    renderCards({ cards: makeCards(3), withButtons: false });

    expect(screen.getByText("Card 1")).toBeInTheDocument();
    expect(screen.getByText("Card 2")).toBeInTheDocument();
    expect(screen.getByText("Card 3")).toBeInTheDocument();
    expect(getCardWrappers()).toHaveLength(3);
  });

  it("invokes the function-as-children renderer with the current stack", () => {
    const renderer = vi.fn((stack: CardWithId[]) =>
      stack.map((card) => (
        <SwipeableCards.CardWrapper card={card} key={card.id}>
          <div>render: {card.id}</div>
        </SwipeableCards.CardWrapper>
      )),
    );

    render(
      <SwipeableCards.Root cards={makeCards(2)} loop={false} emptyView={null}>
        <SwipeableCards.Cards>{renderer}</SwipeableCards.Cards>
      </SwipeableCards.Root>,
    );

    expect(renderer).toHaveBeenCalled();
    const lastCall = renderer.mock.calls[renderer.mock.calls.length - 1];
    expect(lastCall?.[0]).toHaveLength(2);
    expect(screen.getByText("render: card-1")).toBeInTheDocument();
    expect(screen.getByText("render: card-2")).toBeInTheDocument();
  });

  it("renders the empty view container, populated when there are no cards", () => {
    renderCards({ cards: [], emptyView: <span>nothing left</span> });

    expect(screen.getByText("nothing left")).toBeInTheDocument();
    expect(getCardWrappers()).toHaveLength(0);
  });

  it("sets stack-related CSS variables on the cards container", () => {
    renderCards({ cards: makeCards(5), withButtons: false });

    const container = getCardsContainer();
    expect(container?.style.getPropertyValue("--stack-length")).toBe("5");
    expect(container?.style.getPropertyValue("--visible-stack-length")).toBe(
      "3",
    );
    expect(container?.style.getPropertyValue("--card-top-distance")).toBe(
      "clamp(16px, 1vw, 32px)",
    );
  });

  it("respects custom visibleStackLength and cardsTopDistance props", () => {
    render(
      <SwipeableCards.Root cards={makeCards(10)} loop={false} emptyView={null}>
        <SwipeableCards.Cards visibleStackLength={2} cardsTopDistance="8px" />
      </SwipeableCards.Root>,
    );
    const container = getCardsContainer();
    expect(container?.style.getPropertyValue("--visible-stack-length")).toBe(
      "1",
    );
    expect(container?.style.getPropertyValue("--card-top-distance")).toBe(
      "8px",
    );
  });
});

describe("SwipeableCards.CardWrapper", () => {
  it("flags the last card in the stack as the top card", () => {
    renderCards({ cards: makeCards(3), withButtons: false });

    const wrappers = getCardWrappers();
    expect(wrappers).toHaveLength(3);
    expect(wrappers[0]).toHaveAttribute(
      "data-swipeable-cards-top-card",
      "false",
    );
    expect(wrappers[1]).toHaveAttribute(
      "data-swipeable-cards-top-card",
      "false",
    );
    expect(wrappers[2]).toHaveAttribute(
      "data-swipeable-cards-top-card",
      "true",
    );
  });

  it("exposes the card id as a data attribute", () => {
    renderCards({ cards: makeCards(2), withButtons: false });

    const wrappers = getCardWrappers();
    expect(wrappers[0]).toHaveAttribute("data-swipeable-cards-id", "card-1");
    expect(wrappers[1]).toHaveAttribute("data-swipeable-cards-id", "card-2");
  });

  it("sets per-card stack-index CSS variables", () => {
    renderCards({ cards: makeCards(3), withButtons: false });

    const wrappers = getCardWrappers();
    expect(wrappers[0]?.style.getPropertyValue("--stack-index")).toBe("3");
    expect(wrappers[2]?.style.getPropertyValue("--stack-index")).toBe("1");
    expect(wrappers[2]?.style.getPropertyValue("--stack-index0")).toBe("0");
  });

  it("renders the card's own JSX by default and custom children when provided", () => {
    render(
      <SwipeableCards.Root cards={makeCards(1)} loop={false} emptyView={null}>
        <SwipeableCards.Cards>
          {(stack) =>
            stack.map((card) => (
              <SwipeableCards.CardWrapper card={card} key={card.id}>
                <span>custom inner</span>
              </SwipeableCards.CardWrapper>
            ))
          }
        </SwipeableCards.Cards>
      </SwipeableCards.Root>,
    );
    expect(screen.getByText("custom inner")).toBeInTheDocument();
    expect(screen.queryByText("Card 1")).not.toBeInTheDocument();
  });

  it("starts a drag when the user presses on the top card", () => {
    type Ctx = ReturnType<typeof SwipeableCards.useSwipeableCardsContext>;
    const contexts: Ctx[] = [];
    const Spy = () => {
      contexts.push(SwipeableCards.useSwipeableCardsContext());
      return null;
    };
    render(
      <SwipeableCards.Root cards={makeCards(2)} loop={false} emptyView={null}>
        <SwipeableCards.Cards />
        <Spy />
      </SwipeableCards.Root>,
    );

    const top = getTopCard();
    expect(top).not.toBeNull();
    fireEvent.pointerDown(top!, {
      clientX: 100,
      clientY: 200,
      pointerId: 1,
      button: 0,
    });

    const ctx = contexts.at(-1);
    expect(ctx).toBeDefined();
    const state = ctx!.dragStateRef.current;
    expect(state.dragging).toBe(true);
    expect(state.draggingId).toBe("card-2");
    expect(state.startX).toBe(100);
    expect(state.startY).toBe(200);
    expect(state.element).toBe(top);
  });

  it("ignores pointer down on cards that are not on top of the stack", () => {
    type Ctx = ReturnType<typeof SwipeableCards.useSwipeableCardsContext>;
    const contexts: Ctx[] = [];
    const Spy = () => {
      contexts.push(SwipeableCards.useSwipeableCardsContext());
      return null;
    };
    render(
      <SwipeableCards.Root cards={makeCards(3)} loop={false} emptyView={null}>
        <SwipeableCards.Cards />
        <Spy />
      </SwipeableCards.Root>,
    );

    const wrappers = getCardWrappers();
    fireEvent.pointerDown(wrappers[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
    });

    expect(contexts.at(-1)!.dragStateRef.current.dragging).toBe(false);
  });
});

describe("Programmatic swipe buttons", () => {
  it("calls onSwipe with 'right' and removes the top card", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: makeCards(3), onSwipe });

    expect(getCardWrappers()).toHaveLength(3);

    await act(async () => {
      fireEvent.click(screen.getByText("right"));
    });

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("right", "card-3");

    await waitFor(() => {
      expect(getCardWrappers()).toHaveLength(2);
    });
  });

  it("calls onSwipe with 'left' for the left button", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: makeCards(2), onSwipe });

    await act(async () => {
      fireEvent.click(screen.getByText("left"));
    });

    expect(onSwipe).toHaveBeenCalledWith("left", "card-2");
  });

  it("calls onSwipe with 'up' for the up button", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: makeCards(2), onSwipe });

    await act(async () => {
      fireEvent.click(screen.getByText("up"));
    });

    expect(onSwipe).toHaveBeenCalledWith("up", "card-2");
  });

  it("calls onSwipe with 'down' for the down button", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: makeCards(2), onSwipe });

    await act(async () => {
      fireEvent.click(screen.getByText("down"));
    });

    expect(onSwipe).toHaveBeenCalledWith("down", "card-2");
  });

  it("does nothing when there are no cards left", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: [], onSwipe });

    await act(async () => {
      fireEvent.click(screen.getByText("right"));
    });

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("forwards the onClick handler before triggering the swipe", async () => {
    const userClick = vi.fn();
    const onSwipe = vi.fn();
    render(
      <SwipeableCards.Root
        cards={makeCards(1)}
        loop={false}
        emptyView={null}
        onSwipe={onSwipe}
      >
        <SwipeableCards.Cards />
        <SwipeableCards.SwipeRightButton onClick={userClick}>
          go
        </SwipeableCards.SwipeRightButton>
      </SwipeableCards.Root>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("go"));
    });

    expect(userClick).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith("right", "card-1");
  });

  it("throws a helpful error when no <Cards> container is rendered", () => {
    // React captures errors thrown inside event handlers and forwards them to
    // console.error; the throw doesn't propagate out of fireEvent. We trigger
    // the swipe directly through the hook to observe the synchronous throw.
    type Trigger = ReturnType<
      typeof SwipeableCards.useProgrammaticSwipe
    >["trigger"];
    const triggers: Trigger[] = [];
    const Capture = () => {
      const { trigger } = SwipeableCards.useProgrammaticSwipe();
      triggers.push(trigger);
      return null;
    };
    render(
      <SwipeableCards.Root cards={makeCards(1)} loop={false} emptyView={null}>
        <SwipeableCards.CardWrapper card={makeCards(1)[0]!} />
        <Capture />
      </SwipeableCards.Root>,
    );
    const trigger = triggers.at(-1);
    expect(trigger).toBeDefined();
    expect(() =>
      trigger!((state) => {
        state.velocityX = 5;
        state.startX = 0;
        state.lastX = 1;
      }),
    ).toThrow(/SwipeableCards\.Cards/);
  });
});

describe("Loop behaviour", () => {
  it("removes swiped cards from the stack when loop is disabled", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: makeCards(3), onSwipe, loop: false });

    expect(getCardWrappers()).toHaveLength(3);

    await act(async () => {
      fireEvent.click(screen.getByText("right"));
    });

    await waitFor(() => {
      expect(getCardWrappers()).toHaveLength(2);
    });
    expect(screen.queryByText("Card 3")).not.toBeInTheDocument();
  });

  it("sends swiped cards to the back of the stack when loop is enabled", async () => {
    const onSwipe = vi.fn();
    renderCards({ cards: makeCards(3), onSwipe, loop: true });

    expect(getCardWrappers()).toHaveLength(3);
    const initialIds = getCardWrappers().map((wrapper) =>
      wrapper.getAttribute("data-swipeable-cards-id"),
    );
    expect(initialIds).toEqual(["card-1", "card-2", "card-3"]);

    await act(async () => {
      fireEvent.click(screen.getByText("right"));
    });

    await waitFor(() => {
      const ids = getCardWrappers().map((wrapper) =>
        wrapper.getAttribute("data-swipeable-cards-id"),
      );
      expect(ids).toEqual(["card-3", "card-1", "card-2"]);
    });

    expect(getCardWrappers()).toHaveLength(3);
  });
});

describe("Context propagation", () => {
  type Ctx = ReturnType<typeof SwipeableCards.useSwipeableCardsContext>;

  it("exposes provided props through the context", () => {
    const captures: Ctx[] = [];
    const Spy = () => {
      captures.push(SwipeableCards.useSwipeableCardsContext());
      return null;
    };
    render(
      <SwipeableCards.Root
        cards={makeCards(2)}
        loop={true}
        swipeStyle="sendToBack"
        sendToBackMargin={42}
      >
        <SwipeableCards.Cards />
        <Spy />
      </SwipeableCards.Root>,
    );
    const captured = captures.at(-1)!;
    expect(captured.swipeStyle).toBe("sendToBack");
    expect(captured.sendToBackMargin).toBe(42);
    expect(captured.loop).toBe(true);
    expect(captured.stack.map((c) => c.id)).toEqual(["card-1", "card-2"]);
  });

  it("falls back to default values when optional props are not set", () => {
    const captures: Ctx[] = [];
    const Spy = () => {
      captures.push(SwipeableCards.useSwipeableCardsContext());
      return null;
    };
    render(
      <SwipeableCards.Root cards={makeCards(1)} loop={false} emptyView={null}>
        <SwipeableCards.Cards />
        <Spy />
      </SwipeableCards.Root>,
    );
    const captured = captures.at(-1)!;
    expect(captured.swipeStyle).toBe("discard");
    expect(captured.sendToBackMargin).toBe(0);
    expect(captured.loop).toBe(false);
    expect(captured.emptyView).toBeNull();
  });
});

describe("Hooks", () => {
  it("useSwipeableCardsStack returns the current stack", async () => {
    const observed: CardWithId[][] = [];
    const Observer = () => {
      const stack = SwipeableCards.useSwipeableCardsStack();
      observed.push(stack);
      return null;
    };
    render(
      <SwipeableCards.Root cards={makeCards(2)} loop={false} emptyView={null}>
        <SwipeableCards.Cards />
        <SwipeableCards.SwipeRightButton>go</SwipeableCards.SwipeRightButton>
        <Observer />
      </SwipeableCards.Root>,
    );

    expect(observed.at(-1)?.map((c) => c.id)).toEqual(["card-1", "card-2"]);

    await act(async () => {
      fireEvent.click(screen.getByText("go"));
    });

    await waitFor(() => {
      expect(observed.at(-1)?.map((c) => c.id)).toEqual(["card-1"]);
    });
  });

  it("useProgrammaticSwipe exposes a trigger callback and the active swipeStyle", async () => {
    const onSwipe = vi.fn();
    const Custom = () => {
      const { trigger, swipeStyle } = SwipeableCards.useProgrammaticSwipe();
      return (
        <button
          type="button"
          data-swipe-style={swipeStyle}
          onClick={() =>
            trigger((state) => {
              state.velocityX = 5;
              state.velocityY = 0;
              state.startX = 0;
              state.lastX = 1;
            })
          }
        >
          custom-trigger
        </button>
      );
    };
    render(
      <SwipeableCards.Root
        cards={makeCards(2)}
        loop={false}
        emptyView={null}
        swipeStyle="discard"
        onSwipe={onSwipe}
      >
        <SwipeableCards.Cards />
        <Custom />
      </SwipeableCards.Root>,
    );

    const button = screen.getByText("custom-trigger");
    expect(button).toHaveAttribute("data-swipe-style", "discard");

    await act(async () => {
      fireEvent.click(button);
    });

    expect(onSwipe).toHaveBeenCalledWith("right", "card-2");
  });
});

describe("Pointer-driven swipe flow", () => {
  it("returns the card to the stack when the drag is too small to commit", async () => {
    const onSwipe = vi.fn();
    renderCards({
      cards: makeCards(2),
      onSwipe,
      withButtons: false,
    });

    // Simulate a slow, tiny drag so velocity stays below the swipe threshold
    // and total distance stays below the distance threshold.
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const top = getTopCard()!;
    fireEvent.pointerDown(top, { clientX: 200, clientY: 200, pointerId: 1 });
    now += 1000;
    fireEvent.pointerMove(document, { clientX: 203, clientY: 202 });
    now += 1000;
    fireEvent.pointerUp(document, { clientX: 203, clientY: 202 });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSwipe).not.toHaveBeenCalled();
    expect(getCardWrappers()).toHaveLength(2);
  });

  it("commits a swipe when the pointer is released after a long, fast drag", async () => {
    const onSwipe = vi.fn();
    renderCards({
      cards: makeCards(2),
      onSwipe,
      withButtons: false,
    });

    const top = getTopCard()!;
    fireEvent.pointerDown(top, { clientX: 200, clientY: 200, pointerId: 1 });

    // Advance time so velocity is computed against a non-zero deltaTime,
    // and move far enough horizontally to clear the distance threshold.
    const realNow = Date.now;
    let now = realNow();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    now += 50;
    fireEvent.pointerMove(document, { clientX: 600, clientY: 210 });
    fireEvent.pointerUp(document, { clientX: 600, clientY: 210 });

    await waitFor(() => {
      expect(onSwipe).toHaveBeenCalledTimes(1);
    });
    expect(onSwipe.mock.calls[0]?.[0]).toBe("right");
    expect(onSwipe.mock.calls[0]?.[1]).toBe("card-2");

    await waitFor(() => {
      expect(getCardWrappers()).toHaveLength(1);
    });
  });
});

describe("combineRefs (via Root)", () => {
  it("supports both callback and object refs", () => {
    const objectRef = createRef<HTMLDivElement>();
    const callbackTargets: (HTMLDivElement | null)[] = [];
    const Wrapper = (): JSX.Element => (
      <SwipeableCardsRoot
        ref={(node) => {
          callbackTargets.push(node);
          (objectRef as { current: HTMLDivElement | null }).current = node;
        }}
        cards={makeCards(1)}
        loop={false}
        emptyView={null}
      >
        <SwipeableCards.Cards />
      </SwipeableCardsRoot>
    );
    render(<Wrapper />);
    const callbackTarget = callbackTargets.at(-1);
    expect(callbackTarget).toBeInstanceOf(HTMLDivElement);
    expect(objectRef.current).toBe(callbackTarget);
  });
});
