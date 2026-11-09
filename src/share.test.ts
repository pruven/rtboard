import { describe, it, expect } from "vitest";
import { createBoard, encodeShare, decodeShare } from "./model";
describe("share links", () => {
  it("round-trips compressed Unicode board data", async () => {
    const board = createBoard("Design · 設計");
    board.items = [
      {
        id: "a",
        kind: "text",
        x: -20,
        y: 10,
        w: 200,
        h: 100,
        text: "Ideas → tomorrow 🌱",
      },
    ];
    const value = await encodeShare(board);
    expect(value).toMatch(/^[a-zA-Z0-9_-]+$/);
    const restored = await decodeShare(value);
    expect(restored.name).toBe(board.name);
    expect(restored.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: board.items[0].text, x: -20 }),
      ]),
    );
  });
  it("rejects corrupt compressed data", async () => {
    await expect(decodeShare("not-a-board")).rejects.toThrow();
  });
});
