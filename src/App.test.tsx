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
describe("canvas workflow", () => {
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
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(4);
  });
  it("creates text at a double-click, saves it, and restores it after reload", async () => {
    const first = render(<App initial={seed()} />);
    fireEvent.doubleClick(first.container.querySelector(".canvas")!, {
      clientX: 100,
      clientY: 120,
    });
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
