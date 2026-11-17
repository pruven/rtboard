// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createFrame, frameContents, slideCamera } from "./frames";
import { createBoard, parseBoardFile, shareHtml, validateBoard, type Item } from "./model";
const node: Item = { id: "node", kind: "note", text: "Hello", x: -100, y: 40, w: 200, h: 100 };
describe("frames", () => {
  it("wraps content with padding and preserves frames through board validation", () => {
    const frame = createFrame([node], "frame", "Opening", { x: 0, y: 0 });
    expect(frame).toMatchObject({ x: -132, y: 8, w: 264, h: 164 });
    expect(validateBoard({ ...createBoard(), items: [frame, node] }).items[0]).toMatchObject(frame);
  });
  it("moves contained content once and leaves outside or partially overlapping content alone", () => {
    const frame = createFrame([node], "frame", "Opening", { x: 0, y: 0 });
    const outside = { ...node, id: "outside", x: 130 };
    expect(frameContents([frame, node, outside], [frame.id, node.id])).toEqual([frame.id, node.id]);
  });
  it("fits the whole slide at small and large viewport sizes", () => {
    const frame = createFrame([], "frame", "Opening", { x: -600, y: 100 });
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const { offset, zoom } = slideCamera(frame, width, height);
      expect(frame.x * zoom + offset.x).toBeGreaterThanOrEqual(0);
      expect(frame.y * zoom + offset.y).toBeGreaterThanOrEqual(0);
      expect((frame.x + frame.w) * zoom + offset.x).toBeLessThanOrEqual(width);
      expect((frame.y + frame.h) * zoom + offset.y).toBeLessThanOrEqual(height);
    }
  });

  it("keeps slide order, names, and geometry in portable HTML", () => {
    const frames = [createFrame([], "one", "Opening", { x: -200, y: 80 }), createFrame([], "two", "Closing", { x: 1100, y: 400 })];
    const imported = parseBoardFile(shareHtml({ ...createBoard(), items: frames }));
    expect(imported.items).toHaveLength(frames.length);
    frames.forEach((frame, index) => expect(imported.items[index]).toMatchObject(frame));
  });

  it.each(["w", "h"] as const)("rejects oversized selections along %s without cropping content", (dimension) => {
    const item = { ...node, [dimension]: 19936 };
    const frame = createFrame([item], "frame", "At the limit", { x: 0, y: 0 });
    expect(frame[dimension]).toBe(20000);
    expect(frameContents([frame, item], [frame.id])).toContain(item.id);
    expect(() => createFrame([{ ...item, [dimension]: 19937 }], "frame", "Too large", { x: 0, y: 0 })).toThrow("too large");
  });
});
