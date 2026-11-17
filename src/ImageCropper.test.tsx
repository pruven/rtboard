// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode, RefObject } from "react";
import { exportCrop } from "@zriz/core/dom";
import { ImageCropper } from "./ImageCropper";
import App from "./App";
import { createBoard } from "./model";

vi.mock("@zriz/core/dom", () => ({ exportCrop: vi.fn() }));
// Keep image decoding and canvas rendering at the package boundary: happy-dom
// cannot decode photos or export pixels. Exercise the app's save lifecycle here.
vi.mock("@zriz/react/cropper", async () => {
  const { useEffect } = await import("react");
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Button = ({ children }: { children?: ReactNode }) => <button>{children}</button>;
  return {
    Root: ({ children, actionsRef, onLoad, onError }: {
      children: ReactNode; actionsRef: RefObject<unknown>; onLoad: () => void; onError: () => void;
    }) => {
      useEffect(() => { actionsRef.current = {}; }, [actionsRef]);
      return <div>{children}<button onClick={onLoad}>Load image</button><button onClick={onError}>Fail image</button></div>;
    },
    Viewport: Part, Image: () => null, Mask: () => null, Area: Part,
    Grid: () => null, Handle: () => null, DialValue: () => null,
    Dial: Part, DialTicks: () => null, Rotate: Button, Flip: Button,
    ZoomStep: Button, Reset: Button,
  };
});

beforeEach(() => {
  vi.mocked(exportCrop).mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const result = () => ({
  blob: new Blob(["cropped pixels"], { type: "image/png" }),
  type: "image/png" as const, width: 200, height: 100, scaled: false, crop: {} as never,
});

const openBoardCropper = () => {
  const board = createBoard();
  board.items = [{ id: "photo", kind: "image", src: "data:image/png;base64,b3JpZ2luYWw=",
    text: "Photo", x: 20, y: 30, w: 400, h: 300 }];
  const view = render(<App initial={{ boards: [board], active: board.id }} />);
  const node = view.container.querySelector<HTMLElement>('[data-item-id="photo"]')!;
  fireEvent.pointerDown(node, { button: 0, clientX: 40, clientY: 50, pointerId: 1 });
  fireEvent.pointerUp(view.container.querySelector(".canvas")!, { clientX: 40, clientY: 50, pointerId: 1 });
  expect(screen.queryByRole("button", { name: "Crop image" })).toBeNull();
  fireEvent.contextMenu(node, { clientX: 40, clientY: 50 });
  fireEvent.click(screen.getByRole("button", { name: "Crop image" }));
  expect(view.container.querySelector(".context-menu")).toBeNull();
  return node;
};

describe("image cropping", () => {
  it("applies the exported pixels and aspect ratio as one undoable edit", async () => {
    vi.mocked(exportCrop).mockResolvedValue(result());
    const node = openBoardCropper();
    const original = node.querySelector("img")!.src;
    expect((screen.getByRole("button", { name: "Apply crop" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(node.querySelector("img")!.src).not.toBe(original);
    expect(node.style.width).toBe("400px");
    expect(node.style.height).toBe("200px");
    expect(node.style.left).toBe("20px");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(node.querySelector("img")!.src).toBe(original);
    expect(node.style.height).toBe("300px");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(node.style.height).toBe("200px");
  });

  it("cancels without changing the image or selection", () => {
    const node = openBoardCropper();
    const original = node.querySelector("img")!.src;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(node.querySelector("img")!.src).toBe(original);
    expect(node.classList.contains("selected")).toBe(true);
    expect(exportCrop).not.toHaveBeenCalled();
  });

  it("keeps a failed export open for retry", async () => {
    vi.mocked(exportCrop).mockRejectedValueOnce(new Error("Export failed"));
    vi.mocked(exportCrop).mockResolvedValueOnce(result());
    const onApply = vi.fn();
    render(<ImageCropper src="photo.png" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Export failed"));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({
      src: expect.stringContaining("data:image/png;base64,"), width: 200, height: 100,
    }));
  });

  it("aborts an in-flight export on close and never applies stale pixels", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    vi.mocked(exportCrop).mockReturnValue(new Promise((done) => { resolve = done; }));
    const onApply = vi.fn();
    const view = render(<ImageCropper src="photo.png" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    const signal = vi.mocked(exportCrop).mock.calls[0][1]!.signal!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    resolve(result());
    await Promise.resolve();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("reports load errors and leaves apply disabled", () => {
    render(<ImageCropper src="missing.png" onApply={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fail image" }));
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
    expect((screen.getByRole("button", { name: "Apply crop" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
