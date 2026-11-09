// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  type Item,
  createBoard,
  initialWorkspace,
  safeUrl,
  embedUrl,
  validateBoard,
  shareHtml,
  parseBoardFile,
  duplicateItems,
  linkItem,
  connectionPoints,
  encodeShare,
  decodeShare,
} from "./model";
const item = (id = "a"): Item => ({
  id,
  kind: "text",
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  text: "Hello",
});
const fixture = () => ({
  ...createBoard("Research"),
  items: [
    item(),
    { ...item("b"), kind: "note" as const, x: 400, color: "#ffe58a" },
  ],
  connections: [{ id: "c", from: "a", to: "b" }],
});
describe("boards, media, and portable files", () => {
  it("starts with an empty board library", () => {
    expect(initialWorkspace()).toEqual({ boards: [], active: "" });
    expect(createBoard().items).toEqual([]);
  });
  it("round-trips editable boards without reusing board identity", () => {
    const b = fixture(),
      copy = parseBoardFile(JSON.stringify(b));
    expect(copy.name).toBe(b.name);
    expect(copy.id).not.toBe(b.id);
    expect(copy.items.map((i) => i.text)).toEqual(["Hello", "Hello"]);
    expect(copy.connections).toHaveLength(1);
  });
  it("only accepts safe web URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
  it.each([
    ["https://youtu.be/abc", "https://www.youtube-nocookie.com/embed/abc"],
    [
      "https://www.youtube.com/shorts/abc",
      "https://www.youtube-nocookie.com/embed/abc",
    ],
    ["https://vimeo.com/12345", "https://player.vimeo.com/video/12345"],
    [
      "https://www.instagram.com/reel/ABC/",
      "https://www.instagram.com/reel/ABC/embed/",
    ],
    [
      "https://www.tiktok.com/@user/video/1234",
      "https://www.tiktok.com/player/v1/1234",
    ],
    [
      "https://x.com/user/status/1234",
      "https://platform.twitter.com/embed/Tweet.html?id=1234&theme=dark",
    ],
    [
      "https://open.spotify.com/track/abc",
      "https://open.spotify.com/embed/track/abc",
    ],
    [
      "https://www.reddit.com/r/art/comments/abc/post/",
      "https://www.redditmedia.com/r/art/comments/abc/post/?ref_source=embed&ref=share&embed=true",
    ],
    ["https://www.loom.com/share/abc", "https://www.loom.com/embed/abc"],
    [
      "https://codepen.io/user/pen/ABC",
      "https://codepen.io/user/embed/ABC?default-tab=result",
    ],
  ])("embeds %s", (url, expected) => expect(embedUrl(url)).toBe(expected));
  it("rejects lookalike provider domains", () => {
    expect(embedUrl("https://youtube.com.evil.com/watch?v=abc")).toBeNull();
    expect(embedUrl("https://instagram.evil/reel/abc")).toBeNull();
  });
  it("rejects unsafe media, malformed drawing geometry, and duplicate IDs", () => {
    const b = fixture();
    expect(() =>
      validateBoard({
        ...b,
        items: [{ ...item(), src: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      validateBoard({ ...b, items: [{ ...item(), x: NaN }] }),
    ).toThrow();
    expect(() => validateBoard({ ...b, items: [item(), item()] })).toThrow();
    expect(() =>
      validateBoard({
        ...b,
        items: [{ ...item(), kind: "drawing", points: [[1, "x"]] }],
      }),
    ).toThrow();
    expect(() =>
      validateBoard({ ...b, items: [{ ...item(), kind: "drawing" }] }),
    ).toThrow();
  });
  it("keeps supported media attachments on import", () => {
    const b = fixture();
    b.items = [
      { ...item(), kind: "audio", src: "data:audio/mpeg;base64,YWJj" },
    ];
    expect(validateBoard(b).items[0].src).toBe(b.items[0].src);
  });
  it("duplicates a selected group and reconnects the copied cards", () => {
    const b = fixture(),
      result = duplicateItems(b, ["a", "b"]);
    expect(result.board.items).toHaveLength(4);
    expect(result.board.connections).toHaveLength(2);
    expect(result.board.connections[1].from).toBe(result.ids[0]);
    expect(result.board.items[2].x).toBe(24);
    expect(result.board.items[2].id).not.toBe("a");
  });
  it("drops dangling connections and sanitizes imported styles", () => {
    const b = fixture();
    b.connections.push({ id: "bad", from: "a", to: "absent" });
    b.items[0].color = "url(javascript:alert(1))";
    const copy = validateBoard(b);
    expect(copy.connections).toHaveLength(1);
    expect(copy.items[0].color).toBeUndefined();
  });
  it("exports safe HTML that can be opened for editing again", () => {
    const b = fixture();
    b.items[0].text = "</script><script>alert(1)</script>";
    const html = shareHtml(b);
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
    expect(parseBoardFile(html).items[0].text).toBe(b.items[0].text);
    expect(html).toContain("onpointerdown");
  });
  it("rejects unrelated HTML rather than executing it", () =>
    expect(() =>
      parseBoardFile("<html><script>alert(1)</script></html>"),
    ).toThrow());
  it("uses a portrait frame for social videos and direct media controls for video URLs", () => {
    expect(
      linkItem("https://www.instagram.com/reel/ABC/", { x: 2, y: 3 }).h,
    ).toBeGreaterThan(400);
    expect(linkItem("https://example.com/film.mp4", { x: 0, y: 0 }).kind).toBe(
      "video",
    );
  });
  it("anchors connections at card boundaries", () => {
    const b = fixture(),
      p = connectionPoints(b.items[0], b.items[1]);
    expect(p.a).toEqual({ x: 200, y: 50 });
    expect(p.b).toEqual({ x: 400, y: 50 });
  });
});
