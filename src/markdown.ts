import { colors, uid, type Connection, type Item, type Point } from "./model";

export const markdownLimit = 1_000_000;
type Node = { item: Item; children: Node[]; height: number };

/** Import Markdown structure as editable plain-text notes, without rendering HTML. */
export function importMarkdown(source: string, at: Point = { x: 0, y: 0 }) {
  if (source.length > markdownLimit || new TextEncoder().encode(source).length > markdownLimit)
    throw new Error("Choose Markdown smaller than 1 MB.");
  const roots: Node[] = [], items: Item[] = [], connections: Connection[] = [];
  const headings: { level: number; node: Node }[] = [];
  const lists: { indent: number; node: Node }[] = [];
  let paragraph: string[] = [];
  let paragraphParent: Node | undefined;
  let fence: { marker: string; size: number; lines: string[]; parent?: Node } | undefined;
  const parent = () => lists.at(-1)?.node || headings.at(-1)?.node;
  const add = (text: string, owner?: Node, heading = false): Node => {
    if (items.length >= 500) throw new Error("Import up to 500 Markdown notes at a time.");
    if (text.length > 12_000) throw new Error("A Markdown block is too long. Split it into smaller paragraphs.");
    const fontSize = heading ? 24 : 20;
    const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (heading ? 20 : 24))), 0);
    const height = Math.max(100, lines * fontSize * 1.4 + 48);
    if (height > 19_000) throw new Error("A Markdown block is too long. Split it into smaller paragraphs.");
    const item: Item = {
      id: uid(), kind: "note", x: 0, y: 0, w: 320,
      h: height, text,
      fontSize, bold: heading, color: heading ? colors[1] : colors[0],
    };
    const node: Node = { item, children: [], height: item.h };
    (owner ? owner.children : roots).push(node);
    items.push(item);
    if (owner) connections.push({ id: uid(), from: owner.item.id, to: item.id, route: "elbow", arrowheads: "one" });
    return node;
  };
  const flush = () => {
    if (paragraph.length) add(paragraph.join("\n"), paragraphParent);
    paragraph = [];
  };
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      const closing = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.size) {
        add(fence.lines.join("\n") || "(empty code block)", fence.parent);
        fence = undefined;
      } else fence.lines.push(line);
      continue;
    }
    const opening = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (opening) {
      flush();
      const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length || 0;
      while (lists.length && lists.at(-1)!.indent >= indent) lists.pop();
      fence = { marker: opening[1][0], size: opening[1].length, lines: [], parent: parent() };
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*$/);
    const setext = line.trim() && lines[index + 1]?.match(/^ {0,3}(=+|-+)\s*$/);
    if (heading || setext) {
      flush();
      lists.length = 0;
      const level = heading ? heading[1].length : setext![1][0] === "=" ? 1 : 2;
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      const node = add(heading ? heading[2].replace(/\s+#+\s*$/, "") : line.trim(), headings.at(-1)?.node, true);
      headings.push({ level, node });
      if (!heading) index++;
      continue;
    }
    // Separators do not create empty notes.
    if (/^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/.test(line)) { flush(); continue; }
    const list = line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (list) {
      flush();
      const indent = list[1].replace(/\t/g, "    ").length;
      while (lists.length && lists.at(-1)!.indent >= indent) lists.pop();
      const text = list[2].replace(/^\[([ xX])\]\s+/, (_, checked: string) => checked === " " ? "☐ " : "☑ ");
      const node = add(text, parent());
      lists.push({ indent, node });
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length || 0;
    if (lists.length && indent > lists.at(-1)!.indent && !paragraph.length) {
      const item = lists.at(-1)!.node.item;
      item.text += "\n" + line.trim();
      if (item.text.length > 12_000) throw new Error("A Markdown block is too long. Split it into smaller paragraphs.");
      item.h += Math.max(1, Math.ceil(line.trim().length / 24)) * 28;
      if (item.h > 19_000) throw new Error("A Markdown block is too long. Split it into smaller paragraphs.");
    } else {
      if (!paragraph.length) { lists.length = 0; paragraphParent = parent(); }
      paragraph.push(line.trim());
    }
  }
  if (fence) add(fence.lines.join("\n") || "(empty code block)", fence.parent);
  flush();
  if (!items.length) throw new Error("Add a Markdown heading, list, or paragraph to import.");
  const measure = (node: Node): number => {
    const childHeight = node.children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, node.children.length - 1) * 40;
    return node.height = Math.max(node.item.h, childHeight);
  };
  const place = (node: Node, depth: number, top: number) => {
    node.item.x = at.x + depth * 420;
    node.item.y = top + (node.height - node.item.h) / 2;
    const total = node.children.reduce((sum, child) => sum + child.height, 0) + Math.max(0, node.children.length - 1) * 40;
    let y = top + (node.height - total) / 2;
    for (const child of node.children) { place(child, depth + 1, y); y += child.height + 40; }
  };
  let y = at.y;
  for (const root of roots) { measure(root); place(root, 0, y); y += root.height + 60; }
  return { items, connections };
}
