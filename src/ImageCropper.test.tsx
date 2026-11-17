// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode, RefObject } from "react";
import { exportCrop } from "@zriz/core/dom";
import { ImageCropper } from "./ImageCropper";
import App from "./App";
import { createBoard } from "./model";

const imageMetadata = vi.hoisted(() => ({ mime: "image/png" as string | null }));

vi.mock("@zriz/core/dom", () => ({ exportCrop: vi.fn() }));
// Keep image decoding and canvas rendering at the package boundary: happy-dom
// cannot decode photos or export pixels. Exercise the app's save lifecycle here.
vi.mock("@zriz/react/cropper", async () => {
  const { useEffect } = await import("react");
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Button = ({ children }: { children?: ReactNode }) => <button>{children}</button>;
  return {
    Root: ({ children, actionsRef, onLoad, onError }: {
      children: ReactNode; actionsRef: RefObject<unknown>; onLoad: (image: { mime: string | null }) => void; onError: () => void;
    }) => {
      useEffect(() => { actionsRef.current = {}; }, [actionsRef]);
      return <div>{children}<button onClick={() => onLoad(imageMetadata)}>Load image</button><button onClick={onError}>Fail image</button></div>;
    },
    Viewport: Part, Image: () => null, Mask: () => null, Area: Part,
    Grid: () => null, Handle: () => null, DialValue: () => null,
    Dial: Part, DialTicks: () => null, Rotate: Button, Flip: Button,
    ZoomStep: Button, Reset: Button,
  };
});

beforeEach(() => {
  vi.mocked(exportCrop).mockReset();
  imageMetadata.mime = "image/png";
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
const result = (type = "image/png") => ({
  blob: new Blob(["cropped pixels"], { type }),
  type, width: 200, height: 100, scaled: false, crop: {} as never,
});

const finishRead = (reader: FileReader) => {
  Object.defineProperty(reader, "result", { configurable: true, value: "data:image/png;base64,Y3JvcA==" });
  reader.dispatchEvent(new ProgressEvent("load"));
};

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
    // Complete reads synchronously so the assertion also fails if both abort
    // guards are removed and a stale export proceeds through FileReader.
    const read = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      finishRead(this);
    });
    await act(async () => { resolve(result()); });
    expect(read).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("aborts FileReader when closed during conversion", async () => {
    vi.mocked(exportCrop).mockResolvedValue(result());
    let reader!: FileReader;
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) { reader = this; });
    const abort = vi.spyOn(FileReader.prototype, "abort").mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent("abort"));
    });
    const onApply = vi.fn();
    const view = render(<ImageCropper src="photo.png" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Apply crop" })); });
    expect(reader).toBeDefined();
    await act(async () => { view.unmount(); });
    expect(abort).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("does not apply a completed read when closed before its continuation", async () => {
    vi.mocked(exportCrop).mockResolvedValue(result());
    let reader!: FileReader;
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) { reader = this; });
    const onApply = vi.fn();
    const view = render(<ImageCropper src="photo.png" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Apply crop" })); });
    await act(async () => {
      finishRead(reader);
      view.unmount();
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it.each([
    ["image/jpeg", "image/jpeg"],
    ["image/webp", "image/webp"],
    ["image/png", "image/png"],
    ["image/gif", "image/png"],
    [null, "image/png"],
  ])("exports loaded %s images as %s", async (mime, type) => {
    imageMetadata.mime = mime;
    vi.mocked(exportCrop).mockResolvedValue(result(type!));
    const onApply = vi.fn();
    render(<ImageCropper src="photo" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({
      src: expect.stringContaining(`data:${type};base64,`), width: 200, height: 100,
    }));
    expect(exportCrop).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type }));
  });

  it("uses the browser's actual export format if WebP falls back to JPEG", async () => {
    imageMetadata.mime = "image/webp";
    vi.mocked(exportCrop).mockResolvedValue(result("image/jpeg"));
    const onApply = vi.fn();
    render(<ImageCropper src="photo" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({
      src: expect.stringContaining("data:image/jpeg;base64,"), width: 200, height: 100,
    }));
  });

  it.each([40 * 1024 * 1024, 40 * 1024 * 1024 + 1])("enforces the crop size limit at %i bytes", async (bytes) => {
    const exported = result();
    // Simulate the encoded size without allocating a 40 MB fixture.
    vi.spyOn(exported.blob, "size", "get").mockReturnValue(bytes);
    vi.mocked(exportCrop).mockResolvedValue(exported);
    const onApply = vi.fn();
    render(<ImageCropper src="photo.png" onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));
    if (bytes > 40 * 1024 * 1024) {
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(
        "The cropped image is larger than 40 MB. Choose a smaller crop.",
      ));
      expect(onApply).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
      expect(screen.queryByRole("alert")).toBeNull();
    }
  });

  it("reports load errors and leaves apply disabled", () => {
    render(<ImageCropper src="missing.png" onApply={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fail image" }));
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
    expect((screen.getByRole("button", { name: "Apply crop" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
