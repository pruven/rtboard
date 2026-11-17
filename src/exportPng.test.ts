import { afterEach, expect, it, vi } from "vitest";
import { createBoard, downloadBlob } from "./model";
import { exportPng } from "./exportPng";

vi.mock("./model", async (importOriginal) => ({
  ...await importOriginal<typeof import("./model")>(),
  downloadBlob: vi.fn(),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("clips shape labels while leaving sketch strokes and following drawings unclipped", async () => {
  let clipped = false;
  const stack: boolean[] = [], strokes: boolean[] = [], labels: boolean[] = [];
  const ctx = {
    save: () => stack.push(clipped), restore: () => { clipped = stack.pop()!; },
    clip: () => { clipped = true; },
    stroke: () => strokes.push(clipped), fillText: () => labels.push(clipped),
    rect: vi.fn(), beginPath: vi.fn(), scale: vi.fn(), fillRect: vi.fn(), translate: vi.fn(),
    measureText: () => ({ width: 80 }),
  };
  const canvas = {
    getContext: () => ctx,
    toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
  };
  vi.stubGlobal("document", { fonts: { load: async () => [] }, createElement: () => canvas });
  vi.stubGlobal("Path2D", class { constructor(_d: string) {} });
  const board = createBoard();
  board.items = [
    { id: "label", kind: "shape", x: 10, y: 20, w: 120, h: 60, text: "Large", fontSize: 160, stroke: "#0a0a0a" },
    { id: "pen", kind: "drawing", x: 200, y: 20, w: 20, h: 20, text: "", points: [[0, 0], [20, 20]] },
  ];
  await exportPng(board, false);
  expect(ctx.rect).toHaveBeenCalledWith(10, 20, 120, 60);
  expect(labels).toEqual([true]);
  expect(strokes.length).toBeGreaterThan(1);
  expect(strokes.every((clip) => !clip)).toBe(true);
  expect(clipped).toBe(false);
  expect(downloadBlob).toHaveBeenCalledWith(board.name + ".png", expect.any(Blob));
});

it.each([false, true])("renders numbered frame titles in slide order above their outlines (dark: %s)", async (dark) => {
  const labelStyles: { font: string; fillStyle: string; textBaseline: string; textAlign: string }[] = [];
  const ctx = {
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), fillRect: vi.fn(), translate: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn((): void => {
      labelStyles.push({ font: ctx.font, fillStyle: ctx.fillStyle, textBaseline: ctx.textBaseline, textAlign: ctx.textAlign });
    }),
    beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    measureText: () => ({ width: 80 }),
    font: "", fillStyle: "", strokeStyle: "", textBaseline: "", textAlign: "",
  };
  const canvas = {
    getContext: () => ctx,
    toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
  };
  vi.stubGlobal("document", { fonts: { load: async () => [] }, createElement: () => canvas });
  const board = createBoard();
  board.items = [
    { id: "slide", kind: "frame", text: "Opening slide", x: -100, y: -200, w: 960, h: 540 },
    { id: "content", kind: "text", text: "Canvas content", x: 0, y: 0, w: 200, h: 100 },
    { id: "closing", kind: "frame", text: "Closing slide", x: -1200, y: -200, w: 960, h: 540 },
  ];
  await exportPng(board, dark);
  expect(ctx.strokeRect).toHaveBeenCalledWith(-100, -200, 960, 540);
  expect(ctx.fillText).toHaveBeenNthCalledWith(1, "1 · Opening slide", -100, -208, 960);
  expect(ctx.fillText).toHaveBeenNthCalledWith(2, "2 · Closing slide", -1200, -208, 960);
  for (const style of labelStyles.slice(0, 2)) {
    expect(style).toEqual({ font: "12px Geist, sans-serif", fillStyle: dark ? "#686868" : "#aaa", textBaseline: "bottom", textAlign: "left" });
  }
});
