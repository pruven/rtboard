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
