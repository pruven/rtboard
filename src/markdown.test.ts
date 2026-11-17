import { describe, expect, it } from "vitest";
import { importMarkdown, markdownLimit } from "./markdown";
import { createBoard, validateBoard } from "./model";

describe("Markdown import", () => {
  it("connects headings, nested lists, and tasks to their correct parents", () => {
    const { items, connections } = importMarkdown("# Plan\nIntro paragraph\n\n## Build\n- UI\n  - [x] Dialog\n  - [ ] Tests\n- Release\n## Next\n1. Review\n2. Ship");
    expect(items.map((i) => i.text)).toEqual(["Plan", "Intro paragraph", "Build", "UI", "☑ Dialog", "☐ Tests", "Release", "Next", "Review", "Ship"]);
    const edges = connections.map((c) => [items.find((i) => i.id === c.from)!.text, items.find((i) => i.id === c.to)!.text]);
    expect(edges).toEqual([
      ["Plan", "Intro paragraph"], ["Plan", "Build"], ["Build", "UI"],
      ["UI", "☑ Dialog"], ["UI", "☐ Tests"], ["Build", "Release"],
      ["Plan", "Next"], ["Next", "Review"], ["Next", "Ship"],
    ]);
    expect(items[0].bold).toBe(true);
  });

  it("handles CRLF, setext headings, tabs, continuation lines, and heading level jumps", () => {
    const { items, connections } = importMarkdown("\uFEFFTitle\r\n=====\r\n- Parent\r\n\t- Child\r\n\t  continued\r\n\r\n### C#\r\nParagraph\r\nwrapped\r\n\r\n---\r\n");
    expect(items.map((i) => i.text)).toEqual(["Title", "Parent", "Child\ncontinued", "C#", "Paragraph\nwrapped"]);
    expect(connections.map((c) => [items.find((i) => i.id === c.from)!.text, items.find((i) => i.id === c.to)!.text])).toEqual([
      ["Title", "Parent"], ["Parent", "Child\ncontinued"],
      ["Title", "C#"], ["C#", "Paragraph\nwrapped"],
    ]);
  });

  it("keeps fenced code and HTML as inert text, including unclosed fences", () => {
    const { items } = importMarkdown('# Code\n```html\n<script>alert(1)</script>\n# Not a heading\n- Not a list\n```\n\n~~~\nunfinished');
    expect(items.map((i) => i.text)).toEqual(["Code", "<script>alert(1)</script>\n# Not a heading\n- Not a list", "unfinished"]);
    expect(items.every((i) => i.kind === "note" && !i.src)).toBe(true);
  });

  it.each(["", "# Section\n"])("keeps unindented fences outside list scopes (%j)", (prefix) => {
    const { items, connections } = importMarkdown(prefix + "- Parent\n  - Child\n\n```\ncode\n```\n- Sibling");
    const edges = connections.map((c) => [items.find((i) => i.id === c.from)!.text, items.find((i) => i.id === c.to)!.text]);
    expect(edges).toEqual(prefix ? [
      ["Section", "Parent"], ["Parent", "Child"], ["Section", "code"], ["Section", "Sibling"],
    ] : [["Parent", "Child"]]);
  });

  it("keeps indented fences under the remaining list scope", () => {
    const { items, connections } = importMarkdown("# Section\n- Parent\n  - Child\n  ```\n  code\n  ```");
    expect(connections.map((c) => [items.find((i) => i.id === c.from)!.text, items.find((i) => i.id === c.to)!.text])).toEqual([
      ["Section", "Parent"], ["Parent", "Child"], ["Parent", "  code"],
    ]);
  });

  it("lays notes out without overlap and preserves them through board validation", () => {
    const imported = importMarkdown("# Root\n## One\n- First\n  - Nested\n- Second\n## Two\nParagraph\n\nAnother paragraph", { x: 100, y: 200 });
    for (const [index, a] of imported.items.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(100);
      expect(a.y).toBeGreaterThanOrEqual(200);
      for (const b of imported.items.slice(index + 1))
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
    const restored = validateBoard(JSON.parse(JSON.stringify({ ...createBoard(), ...imported })));
    expect(restored.items.map((i) => i.text)).toEqual(imported.items.map((i) => i.text));
    expect(restored.connections).toHaveLength(imported.connections.length);
  });

  it("rejects empty, oversized, and overly complex documents without truncation", () => {
    expect(() => importMarkdown(" \n\n---")).toThrow("Add a Markdown");
    expect(() => importMarkdown("a".repeat(markdownLimit + 1))).toThrow("1 MB");
    expect(() => importMarkdown("界".repeat(340_000))).toThrow("1 MB");
    expect(() => importMarkdown("- note\n".repeat(501))).toThrow("500");
    expect(() => importMarkdown("a".repeat(12_001))).toThrow("block is too long");
  });
});
