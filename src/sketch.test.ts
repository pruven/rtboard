import { describe, expect, it } from "vitest";
import { penPath, shapePaths, sketchPath } from "./sketch";
import { createBoard, shareHtml } from "./model";

describe("sketch rendering", () => {
  it("keeps strokes stable across renders and varies them by element", () => {
    const d = "M 10 20 L 200 80";
    expect(sketchPath(d, "a")).toBe(sketchPath(d, "a"));
    expect(sketchPath(d, "a")).not.toBe(sketchPath(d, "b"));
    expect(sketchPath(d, "a")).toContain("C");
  });
  it("smooths pen samples and handles empty strokes", () => {
    expect(penPath([])).toBe("");
    expect(penPath([[0, 0], [10, 20], [20, 20]])).toBe("M 0 0 Q 10 20 15 20 L 20 20");
  });
  it("includes the font and generated ink in portable HTML", () => {
    const board = createBoard();
    board.items = [{ id: "shape", kind: "shape", text: "Hello", x: 0, y: 0, w: 100, h: 100, color: "#a5d8ff", stroke: "#0a0a0a" }];
    const html = shareHtml(board);
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain(JSON.stringify(shapePaths(board.items[0])));
    expect(shapePaths(board.items[0]).length).toBeGreaterThan(1);
  });
});

describe("large shape hatch density", () => {
  it.each(["rectangle", "ellipse"] as const)("bounds hatch strokes for a maximum-size %s", (shape) => {
    const paths = shapePaths({ id: "large", kind: "shape", text: "", x: 0, y: 0,
      w: 20000, h: 20000, shape, color: "#a5d8ff", stroke: "#0a0a0a" });
    const hatch = paths.find((p) => p.stroke === "#a5d8ff")!;
    expect(hatch).toBeDefined();
    const curves = hatch.d.match(/C/g) || [];
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.length).toBeLessThan(400);
  });
});
