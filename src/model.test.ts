import { describe, it, expect } from "vitest";
import {
  initialWorkspace,
  safeUrl,
  embedUrl,
  validateBoard,
  shareHtml,
} from "./model";
describe("board files and embeds", () => {
  it("creates a usable board and preserves it on import", () => {
    const w = initialWorkspace();
    const b = validateBoard(JSON.parse(JSON.stringify(w.boards[0])));
    expect(b.items).toHaveLength(7);
    expect(b.name).toBe(w.boards[0].name);
    expect(b.id).not.toBe(w.active);
  });
  it("only accepts web links", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
  it("embeds supported URLs without trusting arbitrary hostnames", () => {
    expect(embedUrl("https://youtu.be/abc")).toBe(
      "https://www.youtube-nocookie.com/embed/abc",
    );
    expect(embedUrl("https://www.youtube.com/watch?v=abc&t=3")).toContain(
      "/embed/abc",
    );
    expect(embedUrl("https://vimeo.com/12345")).toBe(
      "https://player.vimeo.com/video/12345",
    );
    expect(embedUrl("https://youtube.com.evil.com/watch?v=abc")).toBeNull();
    expect(embedUrl("https://example.com")).toBeNull();
  });
  it("rejects malicious or malformed imports", () => {
    const b = initialWorkspace().boards[0];
    expect(() =>
      validateBoard({ ...b, items: [{ ...b.items[0], x: NaN }] }),
    ).toThrow();
    expect(() =>
      validateBoard({
        ...b,
        items: [{ ...b.items[0], kind: "image", src: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      validateBoard({ ...b, items: [b.items[0], b.items[0]] }),
    ).toThrow();
  });
  it("drops dangling connections", () => {
    const b = initialWorkspace().boards[0];
    b.connections = [{ id: "x", from: b.items[0].id, to: "missing" }];
    expect(validateBoard(b).connections).toEqual([]);
  });
  it("escapes script termination in exported user content", () => {
    const b = initialWorkspace().boards[0];
    b.items[0].text = "</script><script>alert(1)</script>";
    const html = shareHtml(b);
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain("youtube-nocookie.com/embed/");
  });
});
