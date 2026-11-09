// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import { sketchPath } from "./sketch";
import { createBoard, type Workspace, type Item } from "./model";
import { storageKey } from "./storage";
const seed = (): Workspace => {
  const b = createBoard();
  return { boards: [b], active: b.id };
};
beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const write = (text: string) => {
  const input = screen.getByLabelText("Edit text");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};
describe("theme switching", () => {
  it("switches from the library, keeps the theme on the canvas, and restores it", () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("rtboard.theme")).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Create your first board" }));
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
    first.unmount();
    render(<App initial={seed()} />);
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("rtboard.theme")).toBe("dark");
  });

  it("allows switching when theme storage is blocked", () => {
    const getItem = localStorage.getItem.bind(localStorage);
    const setItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      if (key === "rtboard.theme") throw new Error("Storage blocked");
      return getItem(key);
    });
    vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "rtboard.theme") throw new Error("Storage blocked");
      setItem(key, value);
    });
    render(<App initial={seed()} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
describe("Select and Hand modes", () => {
  const withNode = () => {
    const initial = seed();
    initial.boards[0].items = [{ id: "node", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "Node" }];
    return render(<App initial={initial} />);
  };

  it("switches between Select (V) and Hand (H), panning over selected items without moving or editing them", () => {
    const { container } = withNode();
    const canvas = container.querySelector(".canvas")!;
    const node = container.querySelector<HTMLElement>('[data-item-id="node"]')!;
    fireEvent.pointerDown(node, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.keyDown(window, { key: "h" });
    expect(screen.getByRole("button", { name: "Hand" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerDown(node, { button: 0, clientX: 50, clientY: 50, pointerId: 2 });
    expect(canvas.classList.contains("is-panning")).toBe(true);
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 120, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 150, clientY: 120, pointerId: 2 });
    expect(container.querySelector<HTMLElement>(".world")!.style.transform).toBe("translate(100px,70px) scale(1)");
    expect(node.style.left).toBe("0px");
    expect(node.style.top).toBe("0px");
    expect(node.classList.contains("selected")).toBe(true);
    expect(canvas.classList.contains("is-panning")).toBe(false);
    fireEvent.doubleClick(node);
    expect(screen.queryByLabelText("Edit text")).toBeNull();
    fireEvent.keyDown(window, { key: "v" });
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerDown(node, { button: 0, clientX: 150, clientY: 120, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 170, clientY: 120, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 170, clientY: 120, pointerId: 3 });
    expect(node.style.left).toBe("20px");
  });

  it.each(["Select", "Draw", "Connector", "Text", "Shapes"])("temporarily pans with the middle mouse button and restores %s", (tool) => {
    const { container } = withNode();
    const canvas = container.querySelector(".canvas")!;
    const node = container.querySelector<HTMLElement>('[data-item-id="node"]')!;
    const button = screen.getByRole("button", { name: tool });
    fireEvent.click(button);
    if (tool === "Draw") fireEvent.doubleClick(button);
    expect(fireEvent.pointerDown(node, { button: 1, clientX: 50, clientY: 50, pointerId: 1 })).toBe(false);
    expect(screen.getByRole("button", { name: "Hand" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 1, clientX: 150, clientY: 100, pointerId: 1 });
    expect(container.querySelector<HTMLElement>(".world")!.style.transform).toBe("translate(100px,50px) scale(1)");
    expect(node.style.left).toBe("0px");
    expect(node.style.top).toBe("0px");
    expect(container.querySelectorAll(".board-item")).toHaveLength(1);
    expect(container.querySelectorAll(".connector-line")).toHaveLength(0);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    if (tool === "Draw") expect(button.querySelector(".locked")).toBeTruthy();
  });

  it("pans over resize handles and links, suppresses middle-click navigation, and restores the tool on cancel or blur", () => {
    const { container } = withNode();
    const canvas = container.querySelector(".canvas")!;
    const node = container.querySelector<HTMLElement>('[data-item-id="node"]')!;
    fireEvent.pointerDown(node, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerDown(screen.getByTitle("Drag to resize"), { button: 1, clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 130, pointerId: 2 });
    fireEvent.pointerCancel(canvas, { pointerId: 2 });
    expect(node.style.width).toBe("100px");
    expect(node.style.height).toBe("100px");
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
    const link = document.createElement("a");
    link.href = "https://example.com/";
    canvas.append(link);
    expect(fireEvent.pointerDown(link, { button: 1, clientX: 100, clientY: 100, pointerId: 3 })).toBe(false);
    expect(fireEvent(link, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }))).toBe(false);
    fireEvent.blur(window);
    expect(canvas.classList.contains("is-panning")).toBe(false);
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
    link.remove();
  });

  it("keeps Space-drag as a temporary Hand shortcut", () => {
    const { container } = withNode();
    const canvas = container.querySelector(".canvas")!;
    fireEvent.click(screen.getByRole("button", { name: "Connector" }));
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(screen.getByRole("button", { name: "Hand" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerDown(canvas, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 240, clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 240, clientY: 260, pointerId: 1 });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(container.querySelector<HTMLElement>(".world")!.style.transform).toBe("translate(40px,60px) scale(1)");
    expect(screen.getByRole("button", { name: "Connector" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("dragging selected elements", () => {
  it.each(["link", "video", "audio"] as const)("drags selected %s media and provides an explicit playback interaction", (kind) => {
    const initial = seed();
    initial.boards[0].items = [{ id: "media", kind, x: 20, y: 30, w: 300, h: 200, text: "Media",
      src: kind === "link" ? "https://www.instagram.com/reel/abc/" : `https://example.com/media.${kind === "video" ? "mp4" : "mp3"}` }];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    const item = container.querySelector<HTMLElement>('[data-item-id="media"]')!;
    fireEvent.pointerDown(screen.getByLabelText("Drag Media"), { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(item.style.left).toBe("70px");
    expect(item.style.top).toBe("70px");
    fireEvent.click(screen.getByRole("button", { name: "Interact with media" }));
    expect(container.querySelector(".media-drag-surface")).toBeNull();
    if (kind === "link") expect(item.querySelector("iframe")!.style.pointerEvents).toBe("auto");
    // The border stays draggable even while the media itself accepts input.
    fireEvent.pointerDown(item.querySelector(".drag-edge.right")!, { button: 0, clientX: 370, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 390, clientY: 110, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 390, clientY: 110, pointerId: 2 });
    expect(item.style.left).toBe("90px");
    expect(item.style.top).toBe("80px");
    expect(container.querySelector(".media-drag-surface")).toBeTruthy();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(item.style.left).toBe("70px");
    expect(item.style.top).toBe("70px");
  });

  it("drags a multiselection from its empty space and preserves middle-button panning", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "A" },
      { id: "b", kind: "shape", x: 300, y: 0, w: 100, h: 100, text: "B" },
    ];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.pointerDown(screen.getByLabelText("Drag selected elements"), { button: 0, clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 240, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 240, clientY: 80, pointerId: 1 });
    const a = container.querySelector<HTMLElement>('[data-item-id="a"]')!;
    const b = container.querySelector<HTMLElement>('[data-item-id="b"]')!;
    expect([a.style.left, b.style.left]).toEqual(["40px", "340px"]);
    expect([a.style.top, b.style.top]).toEqual(["30px", "30px"]);
    fireEvent.pointerDown(screen.getByLabelText("Drag selected elements"), { button: 1, clientX: 240, clientY: 80, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 280, clientY: 110, pointerId: 2 });
    fireEvent.pointerUp(canvas, { button: 1, clientX: 280, clientY: 110, pointerId: 2 });
    expect([a.style.left, b.style.left]).toEqual(["40px", "340px"]);
    expect(container.querySelector<HTMLElement>(".world")!.style.transform).toBe("translate(40px,30px) scale(1)");
    expect(container.querySelectorAll(".board-item.selected")).toHaveLength(2);
  });
});

describe("review regressions", () => {
  const connected = (drawing = false) => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "A" },
      { id: "b", kind: "shape", x: 300, y: 200, w: 100, h: 100, text: "B" },
      { id: "c", kind: "shape", x: 600, y: 200, w: 100, h: 100, text: "C" },
    ];
    if (drawing) initial.boards[0].items.push({ id: "arrow", kind: "drawing", x: 95, y: 45, w: 210, h: 210,
      text: "", arrow: true, route: "elbow", points: [[5, 5], [205, 205]],
      startBinding: "a", endBinding: "b", bindingsInitialized: true });
    else initial.boards[0].connections = [{ id: "line", from: "a", to: "b", route: "elbow" }];
    return initial;
  };

  it("deletes all selected elements after selecting a connector then pressing Ctrl+A", () => {
    const { container } = render(<App initial={connected()} />);
    fireEvent.pointerDown(container.querySelector(".connector-line")!, { button: 0 });
    expect(screen.getByLabelText("Reconnect end")).toBeTruthy();
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(container.querySelectorAll(".board-item.selected")).toHaveLength(3);
    expect(screen.queryByLabelText("Reconnect end")).toBeNull();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(container.querySelectorAll(".board-item")).toHaveLength(0);
    expect(container.querySelectorAll(".connector-line")).toHaveLength(0);
  });

  it.each([false, true])("can commit and cancel keyboard reconnection (drawing=%s)", async (drawing) => {
    const { container } = render(<App initial={connected(drawing)} />);
    const canvas = container.querySelector(".canvas")!;
    const selectable = container.querySelector(drawing ? '[data-item-id="arrow"]' : ".connector-line")!;
    fireEvent.pointerDown(selectable, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 50, pointerId: 1 });
    const path = () => container.querySelector(drawing ? ".item-drawing path" : ".connector-line")!.getAttribute("data-geometry");
    const before = path();
    const handle = screen.getByRole("button", { name: "Reconnect end" });
    expect(handle.getAttribute("tabindex")).toBe("0");
    handle.focus();
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Reconnect endpoint" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "A" })).toBeNull(); // No self-loop.
    const select = screen.getByLabelText("Attach to element");
    fireEvent.change(select, { target: { value: "c" } });
    fireEvent.keyDown(select, { key: "Escape" });
    expect(path()).toBe(before);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(handle));
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.change(screen.getByLabelText("Attach to element"), { target: { value: "c" } });
    fireEvent.submit(screen.getByRole("button", { name: "Apply connection" }).closest("form")!);
    expect(path()).not.toBe(before);
    expect(path()!.endsWith(drawing ? "505 205" : "600 250")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(path()).toBe(before);
  });

  it("renders bound drawing routes using the element centers rather than the endpoint gap", () => {
    const initial = connected(true);
    initial.boards[0].items[0].w = 500;
    Object.assign(initial.boards[0].items[1], { x: 600, y: 400, w: 500 });
    const { container } = render(<App initial={initial} />);
    const rendered = container.querySelector(".item-drawing path")!;
    expect(rendered.getAttribute("data-geometry")).toBe("M 5 5 L 55 5 L 55 405 L 105 405");
    expect(rendered.getAttribute("d")).toBe(sketchPath(rendered.getAttribute("data-geometry")!, "arrow"));
  });

  it("keeps a parent-side pan area available while an Instagram player is interactive", () => {
    const initial = seed();
    initial.boards[0].items = [{ id: "media", kind: "link", x: 0, y: 0, w: 330, h: 520,
      text: "Instagram", src: "https://instagram.com/p/ABC/" }];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Interact with media" }));
    const frame = container.querySelector("iframe")!;
    expect(frame.style.pointerEvents).toBe("auto");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-popups allow-popups-to-escape-sandbox");
    const footer = container.querySelector(".embed-footer")!;
    expect(footer.getAttribute("title")).toContain("Middle-drag this footer");
    fireEvent.pointerDown(footer, { button: 1, clientX: 50, clientY: 510, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 550, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 1, clientX: 150, clientY: 550, pointerId: 1 });
    expect(container.querySelector<HTMLElement>(".world")!.style.transform).toBe("translate(100px,40px) scale(1)");
    expect(container.querySelector<HTMLElement>(".board-item")!.style.left).toBe("0px");
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hand" }));
    expect(frame.style.pointerEvents).toBe("none");
  });
});

describe("canvas workflow", () => {
  it.each(["start", "end"] as const)("keeps a snapped %s endpoint attached when the other end is free", (endpoint) => {
    const initial = seed();
    initial.boards[0].items = [{ id: "node", kind: "shape", x: 300, y: 200, w: 100, h: 100, text: "Node" }];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    const start = endpoint === "start" ? { x: 288, y: 250 } : { x: 50, y: 250 };
    const end = endpoint === "end" ? { x: 288, y: 250 } : { x: 50, y: 250 };
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.pointerDown(canvas, { button: 0, clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: end.x, clientY: end.y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: end.x, clientY: end.y, pointerId: 1 });
    const line = () => container.querySelector<HTMLElement>(".item-drawing")!;
    const path = () => line().querySelector("path")!.getAttribute("data-geometry");
    const beforeX = Number.parseFloat(line().style.left);
    const beforePath = path();
    fireEvent.pointerDown(container.querySelector('[data-item-id="node"]')!, { button: 0, clientX: 350, clientY: 250, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 450, clientY: 250, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 450, clientY: 250, pointerId: 2 });
    // The free endpoint remains at x=50 while the bound endpoint moves 300→400.
    expect(Number.parseFloat(line().style.left)).toBe(beforeX);
    expect(path()).not.toBe(beforePath);
    expect(path()).toContain(endpoint === "start" ? "M 355 5" : "L 355 5");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(path()).toBe(beforePath);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(path()).toContain(endpoint === "start" ? "M 355 5" : "L 355 5");
  });

  it("can bind an existing free connector endpoint and then follows its target", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "node", kind: "shape", x: 300, y: 200, w: 100, h: 100, text: "Node" },
      { id: "arrow", kind: "drawing", x: 45, y: 245, w: 160, h: 10, text: "", arrow: true,
        points: [[5, 5], [155, 5]], bindingsInitialized: true },
    ];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.pointerDown(container.querySelector('[data-item-id="arrow"]')!, { button: 0, clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerDown(screen.getByLabelText("Reconnect end"), { button: 0, clientX: 200, clientY: 250, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 288, clientY: 250, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 288, clientY: 250, pointerId: 2 });
    fireEvent.pointerDown(container.querySelector('[data-item-id="node"]')!, { button: 0, clientX: 350, clientY: 250, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 450, clientY: 250, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 450, clientY: 250, pointerId: 3 });
    expect(container.querySelector(".item-drawing path")!.getAttribute("data-geometry")).toBe("M 5 5 L 355 5");
  });

  it.each(["Straight", "Curved", "Elbow"])("supports all arrowhead modes on %s connectors and their previews", (route) => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "A" },
      { id: "b", kind: "shape", x: 300, y: 200, w: 100, h: 100, text: "B" },
    ];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: route }));
    expect(screen.getByRole("button", { name: "One end" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Both ends" }));
    fireEvent.pointerDown(canvas, { button: 0, clientX: 112, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 288, clientY: 250, pointerId: 1 });
    const preview = container.querySelector('.connections > path[stroke="var(--selection)"]')!;
    expect(preview.getAttribute("marker-start")).toBe("url(#arrow)");
    expect(preview.getAttribute("marker-end")).toBe("url(#arrow)");
    fireEvent.pointerUp(canvas, { clientX: 288, clientY: 250, pointerId: 1 });
    const path = () => container.querySelector(".connector-line")!;
    expect(path().nextElementSibling!.getAttribute("marker-start")).toBe("url(#arrow)");
    expect(path().nextElementSibling!.getAttribute("marker-end")).toBe("url(#arrow)");
    fireEvent.pointerDown(path(), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    expect(path().nextElementSibling!.getAttribute("marker-start")).toBeNull();
    expect(path().nextElementSibling!.getAttribute("marker-end")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "One end" }));
    expect(path().nextElementSibling!.getAttribute("marker-start")).toBeNull();
    expect(path().nextElementSibling!.getAttribute("marker-end")).toBe("url(#arrow)");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(path().nextElementSibling!.getAttribute("marker-end")).toBeNull();
    expect(screen.getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps standalone connectors editable when arrowheads are set to None", () => {
    const { container } = render(<App initial={seed()} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 220, clientY: 120, pointerId: 1 });
    const path = () => container.querySelector(".item-drawing path")!;
    expect(path().nextElementSibling!.getAttribute("marker-start")).toBeNull();
    expect(path().nextElementSibling!.getAttribute("marker-end")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Both ends" }));
    expect(path().nextElementSibling!.getAttribute("marker-start")).toBe("url(#arrow)");
    expect(path().nextElementSibling!.getAttribute("marker-end")).toBe("url(#arrow)");
  });

  it("snaps routed connectors to elements, edits routes, reconnects endpoints, and follows moved elements", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "A" },
      { id: "b", kind: "shape", x: 300, y: 200, w: 100, h: 100, text: "B" },
      { id: "c", kind: "shape", x: 600, y: 200, w: 100, h: 100, text: "C" },
    ];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "Elbow" }));
    fireEvent.pointerDown(canvas, { button: 0, clientX: 112, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 288, clientY: 250, pointerId: 1 });
    expect(container.querySelector('[data-item-id="b"]')!.classList.contains("snap-target")).toBe(true);
    fireEvent.pointerUp(canvas, { clientX: 288, clientY: 250, pointerId: 1 });
    const path = () => container.querySelector<SVGPathElement>(".connector-line")!;
    expect(path().getAttribute("data-geometry")).toBe("M 100 50 L 200 50 L 200 250 L 300 250");
    fireEvent.pointerDown(path(), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Curved" }));
    expect(path().getAttribute("data-geometry")).toContain(" C ");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(path().getAttribute("data-geometry")).not.toContain(" C ");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(path().getAttribute("data-geometry")).toContain(" C ");
    fireEvent.pointerDown(screen.getByLabelText("Reconnect end"), { button: 0, clientX: 300, clientY: 250, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 588, clientY: 250, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 588, clientY: 250, pointerId: 2 });
    expect(path().getAttribute("data-geometry")).toBe("M 100 50 C 350 50 350 250 600 250");
    fireEvent.pointerDown(screen.getByLabelText("Reconnect start"), { button: 0, clientX: 100, clientY: 50, pointerId: 4 });
    fireEvent.pointerMove(canvas, { clientX: 900, clientY: 500, pointerId: 4 });
    fireEvent.pointerUp(canvas, { clientX: 900, clientY: 500, pointerId: 4 });
    expect(path().getAttribute("data-geometry")).toBe("M 100 50 C 350 50 350 250 600 250");
    fireEvent.pointerDown(container.querySelector('[data-item-id="a"]')!, { button: 0, clientX: 50, clientY: 50, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 90, clientY: 50, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 90, clientY: 50, pointerId: 3 });
    expect(path().getAttribute("data-geometry")).toBe("M 140 50 C 370 50 370 250 600 250");
  });

  it("keeps standalone arrows routed and supports cancelling a connector gesture", () => {
    const { container } = render(<App initial={seed()} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "Curved" }));
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 220, clientY: 120, pointerId: 1 });
    expect(container.querySelector(".item-drawing path")!.getAttribute("data-geometry")).toContain(" C ");
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 320, clientY: 20, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 520, clientY: 120, pointerId: 2 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(canvas, { clientX: 520, clientY: 120, pointerId: 2 });
    expect(container.querySelectorAll(".item-drawing")).toHaveLength(1);
  });
  it("copies and pastes connected selections through the system clipboard payload", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "text", x: 0, y: 0, w: 200, h: 80, text: "First" },
      { id: "b", kind: "note", x: 300, y: 0, w: 200, h: 100, text: "Second" },
    ];
    initial.boards[0].connections = [{ id: "c", from: "a", to: "b" }];
    const { container } = render(<App initial={initial} />);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    const values = new Map<string, string>();
    const data = {
      getData: (key: string) => values.get(key) || "",
      setData: (key: string, value: string) => values.set(key, value),
      files: [],
    };
    fireEvent.copy(document.body, { clipboardData: data });
    expect(values.get("application/x-rtboard")).toContain("First");
    fireEvent.paste(document.body, { clipboardData: data });
    expect(container.querySelectorAll(".board-item")).toHaveLength(4);
    expect(container.querySelectorAll(".connector-line")).toHaveLength(2);
  });
  it("moves a selected group and attaches connectors to cards", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "text", x: 0, y: 0, w: 200, h: 80, text: "First" },
      { id: "b", kind: "note", x: 300, y: 0, w: 200, h: 100, text: "Second" },
    ];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.pointerDown(container.querySelector("[data-item-id=a]")!, {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 40, pointerId: 1 });
    expect(
      container.querySelector<HTMLElement>("[data-item-id=a]")!.style.left,
    ).toBe("40px");
    expect(
      container.querySelector<HTMLElement>("[data-item-id=b]")!.style.left,
    ).toBe("340px");
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.pointerDown(container.querySelector("[data-item-id=a]")!, {
      button: 0,
      clientX: 100,
      clientY: 40,
      pointerId: 2,
    });
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 50, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: 50, pointerId: 2 });
    expect(container.querySelectorAll(".connector-line")).toHaveLength(1);
  });

  it("opens a minimal empty canvas from the board library", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "No boards yet" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Create your first board" }),
    );
    expect(screen.getByRole("heading", { name: "Empty board" })).toBeTruthy();
    expect(screen.getByLabelText("Board name")).toHaveProperty(
      "value",
      "Untitled board",
    );
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(5);
  });
  it("opens a sticky note at a double-click, saves it, and restores it after reload", async () => {
    const first = render(<App initial={seed()} />);
    fireEvent.doubleClick(first.container.querySelector(".canvas")!, {
      clientX: 100,
      clientY: 120,
    });
    const note = first.container.querySelector<HTMLElement>(".item-note")!;
    expect(note.style.left).toBe("100px");
    expect(note.style.top).toBe("120px");
    expect(note.contains(screen.getByLabelText("Edit text"))).toBe(true);
    expect(first.container.querySelector(".item-text")).toBeNull();
    write("Remember this");
    expect(screen.getByText("Remember this")).toBeTruthy();
    await waitFor(() =>
      expect(localStorage.getItem(storageKey)).toContain("Remember this"),
    );
    first.unmount();
    render(<App />);
    expect(screen.getByText("Remember this")).toBeTruthy();
  });
  it("selects all, duplicates groups, nudges, deletes, and supports undo/redo", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "text", x: 0, y: 0, w: 200, h: 80, text: "First" },
      { id: "b", kind: "note", x: 300, y: 0, w: 200, h: 100, text: "Second" },
    ];
    const { container } = render(<App initial={initial} />);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(container.querySelectorAll(".selected")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(container.querySelectorAll(".board-item")).toHaveLength(4);
    const selected = container.querySelector<HTMLElement>(
      ".board-item.selected",
    )!;
    expect(selected.style.left).toBe("24px");
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(selected.style.left).toBe("34px");
    fireEvent.keyDown(window, { key: "Delete" });
    expect(container.querySelectorAll(".board-item")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll(".board-item")).toHaveLength(4);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(container.querySelectorAll(".board-item")).toHaveLength(2);
  });
  it("draws a sticky note using the shape tool", () => {
    const { container } = render(<App initial={seed()} />);
    fireEvent.click(screen.getByRole("button", { name: "Shapes" }));
    fireEvent.click(screen.getByRole("button", { name: "Sticky note" }));
    const c = container.querySelector(".canvas")!;
    fireEvent.pointerDown(c, {
      button: 0,
      clientX: 80,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(c, { clientX: 320, clientY: 280, pointerId: 1 });
    fireEvent.pointerUp(c, { clientX: 320, clientY: 280, pointerId: 1 });
    write("A note");
    expect(container.querySelector(".item-note")).toBeTruthy();
    expect(screen.getByText("A note")).toBeTruthy();
  });
  it("opens provider embeds directly and supports board search", () => {
    render(<App initial={seed()} />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a link…" }));
    fireEvent.change(screen.getByLabelText("Links"), {
      target: { value: "https://www.instagram.com/reel/ABC/" },
    });
    fireEvent.change(screen.getByLabelText("Title (optional)"), {
      target: { value: "Reference reel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to board" }));
    expect(screen.getByTitle("Reference reel")).toHaveProperty(
      "src",
      "https://www.instagram.com/reel/ABC/embed/",
    );
    const frame = screen.getByTitle("Reference reel") as HTMLIFrameElement;
    const player = new DOMParser().parseFromString(frame.srcdoc, "text/html");
    expect(player.querySelector("blockquote")?.dataset.instgrmPermalink).toBe(
      "https://www.instagram.com/reel/ABC/",
    );
    expect(player.querySelector("script[src]")?.getAttribute("src")).toBe(
      "https://www.instagram.com/embed.js",
    );
    expect(frame.style.pointerEvents).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Interact with media" }));
    expect(frame.style.pointerEvents).toBe("auto");
    expect(frame.allow).toContain("autoplay");
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Find on board"), {
      target: { value: "Reference" },
    });
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
  it("keeps tools active when locked and switches to connector with C", () => {
    render(<App initial={seed()} />);
    const pen = screen.getByRole("button", { name: "Draw" });
    fireEvent.doubleClick(pen);
    expect(pen.querySelector(".locked")).toBeTruthy();
    fireEvent.keyDown(window, { key: "c" });
    expect(
      screen
        .getByRole("button", { name: "Connector" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("returns to the library and creates a second independent board", async () => {
    render(<App initial={seed()} />);
    fireEvent.click(screen.getByRole("button", { name: "rtboard" }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(storageKey)!).boards).toHaveLength(
        2,
      ),
    );
  });
});

describe("sketch canvas interactions", () => {
  it("opens and focuses a text box immediately with T without intercepting typing", () => {
    const { container } = render(<App initial={seed()} />);
    fireEvent.keyDown(window, { key: "t" });
    const editor = screen.getByLabelText("Edit text");
    expect(document.activeElement).toBe(editor);
    expect(container.querySelector(".item-text")!.contains(editor)).toBe(true);
    for (const repeat of [false, true]) {
      const key = new KeyboardEvent("keydown", { key: "t", repeat, bubbles: true, cancelable: true });
      expect(fireEvent(editor, key)).toBe(true);
      expect(key.defaultPrevented).toBe(false);
    }
    fireEvent.change(editor, { target: { value: "text" } });
    expect(container.querySelectorAll(".item-text")).toHaveLength(1);
    expect(editor).toHaveProperty("value", "text");
    fireEvent.blur(editor);
    fireEvent.pointerMove(container.querySelector(".canvas")!, { clientX: 210, clientY: 160 });
    fireEvent.keyDown(window, { key: "T", shiftKey: true });
    const next = screen.getByLabelText("Edit text").closest<HTMLElement>(".item-text")!;
    expect(next.style.left).toBe("210px");
    expect(next.style.top).toBe("160px");
  });

  it("constrains shapes, draws sketch outlines, and supports ellipse shortcuts", () => {
    const { container } = render(<App initial={seed()} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, shiftKey: true, pointerId: 1 });
    const shape = container.querySelector<HTMLElement>(".item-shape")!;
    expect(shape.style.width).toBe("160px");
    expect(shape.style.height).toBe("160px");
    expect(shape.querySelector(".sketch-shape path")!.getAttribute("d")).toContain("C");
    expect(shape.style.fontFamily).toContain("Kalam");
    fireEvent.keyDown(window, { key: "o" });
    expect(screen.getByRole("button", { name: "Ellipse" }).classList.contains("active")).toBe(true);
  });

  it("samples a pen gesture and renders a smooth path through the canvas", () => {
    const { container } = render(<App initial={seed()} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.pointerDown(canvas, { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 90, pointerId: 1 });
    expect(container.querySelector(".connections > path")!.getAttribute("d"))
      .toBe("M 40 50 Q 60 80 80 85 L 100 90");
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 90, pointerId: 1 });
    const drawing = container.querySelector<HTMLElement>(".item-drawing")!;
    expect(drawing.style.left).toBe("36px");
    expect(drawing.style.top).toBe("46px");
    expect(drawing.querySelector("path")!.getAttribute("d")).toBe("M 4 4 Q 24 34 44 39 L 64 44");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelector(".item-drawing")).toBeNull();
  });

  it("shows the chosen sticky-note fill during drawing", () => {
    const { container } = render(<App initial={seed()} />);
    const canvas = container.querySelector(".canvas")!;
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.click(screen.getByRole("button", { name: "Fill #a5d8ff" }));
    fireEvent.pointerDown(canvas, { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 180, pointerId: 1 });
    const fill = container.querySelector<HTMLElement>(".shape-preview")!.style.background;
    expect(fill).not.toBe("transparent");
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 180, pointerId: 1 });
    expect(container.querySelector<HTMLElement>(".item-note")!.style.background).toBe(fill);
  });

  it("passes the selected connector color to its endpoint markers", () => {
    const initial = seed();
    initial.boards[0].items = [
      { id: "a", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "A" },
      { id: "b", kind: "shape", x: 300, y: 0, w: 100, h: 100, text: "B" },
    ];
    initial.boards[0].connections = [{ id: "ab", from: "a", to: "b" }];
    const { container } = render(<App initial={initial} />);
    const line = container.querySelector(".connector-line")!;
    const tips = line.nextElementSibling!;
    expect(tips.getAttribute("stroke")).toBe("currentColor");
    expect(tips.getAttribute("stroke-opacity")).toBe("0");
    const marker = container.querySelector("#arrow path")!;
    expect(marker.getAttribute("stroke")).toBe("context-stroke");
    expect(marker.getAttribute("stroke-opacity")).toBe("1");
    fireEvent.pointerDown(line, { button: 0 });
    expect((line.parentElement as unknown as SVGElement).style.color).toBe("var(--selection)");
    fireEvent.pointerDown(container.querySelector(".canvas")!, { button: 0, clientX: 600, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(container.querySelector(".canvas")!, { clientX: 600, clientY: 300, pointerId: 1 });
    expect((line.parentElement as unknown as SVGElement).style.color).toBe("");
  });

  it.each(["click", "cancel", "blur", "escape"])("does not leave an Alt-drag copy after %s", (ending) => {
    const initial = seed();
    initial.boards[0].items = [{ id: "node", kind: "shape", x: 20, y: 20, w: 100, h: 100, text: "Original" }];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    const node = container.querySelector<HTMLElement>('[data-item-id="node"]')!;
    fireEvent.pointerDown(node, { button: 0, clientX: 50, clientY: 50, altKey: true, pointerId: 1 });
    expect(container.querySelectorAll(".board-item")).toHaveLength(1);
    if (ending === "click") {
      fireEvent.pointerMove(canvas, { clientX: 51, clientY: 51, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 51, clientY: 51, pointerId: 1 });
    } else {
      fireEvent.pointerMove(canvas, { clientX: 180, clientY: 80, pointerId: 1 });
      expect(container.querySelectorAll(".board-item")).toHaveLength(2);
      if (ending === "cancel") fireEvent.pointerCancel(canvas, { pointerId: 1 });
      else if (ending === "blur") fireEvent.blur(window);
      else fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.pointerUp(canvas, { clientX: 180, clientY: 80, pointerId: 1 });
    }
    expect(container.querySelectorAll(".board-item")).toHaveLength(1);
    expect(node.style.left).toBe("20px");
    expect(node.style.top).toBe("20px");
  });

  it.each(["x", "y"])("keeps the initial Shift-drag %s axis when the pointer crosses the diagonal", (axis) => {
    const initial = seed();
    initial.boards[0].items = [{ id: "node", kind: "shape", x: 20, y: 20, w: 100, h: 100, text: "Node" }];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    const node = container.querySelector<HTMLElement>('[data-item-id="node"]')!;
    fireEvent.pointerDown(node, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: axis === "x" ? 90 : 80, clientY: axis === "x" ? 80 : 90, shiftKey: true, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: axis === "x" ? 100 : 180, clientY: axis === "x" ? 180 : 100, shiftKey: true, pointerId: 1 });
    expect(node.style.left).toBe(axis === "x" ? "70px" : "20px");
    expect(node.style.top).toBe(axis === "x" ? "20px" : "70px");
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 180, pointerId: 1 });
  });

  it("Alt-drags a copy along one axis and undoes the entire gesture", () => {
    const initial = seed();
    initial.boards[0].items = [{ id: "node", kind: "shape", x: 20, y: 20, w: 100, h: 100, text: "Original" }];
    const { container } = render(<App initial={initial} />);
    const canvas = container.querySelector(".canvas")!;
    const node = container.querySelector<HTMLElement>('[data-item-id="node"]')!;
    fireEvent.pointerDown(node, { button: 0, clientX: 50, clientY: 50, altKey: true, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 180, clientY: 80, shiftKey: true, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 180, clientY: 80, pointerId: 1 });
    const copy = container.querySelector<HTMLElement>('.board-item:not([data-item-id="node"])')!;
    expect(copy.style.left).toBe("150px");
    expect(copy.style.top).toBe("20px");
    expect(node.style.left).toBe("20px");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll(".board-item")).toHaveLength(1);
  });
});
