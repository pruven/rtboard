// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  type Item, createBoard, connectionPoints, connectorPath, snapConnection,
  connectionGeometry,
  connectorArrowheads, connectorMarkers,
  duplicateItems, validateBoard, shareHtml, parseBoardFile,
} from "./model";

const a: Item = { id: "a", kind: "shape", x: 0, y: 0, w: 100, h: 100, text: "" };
const b: Item = { ...a, id: "b", x: 300, y: 200 };

describe("connector routing", () => {
  it("snaps nearby endpoints, excludes the source, and prefers the nearest/topmost element", () => {
    expect(snapConnection([a, b], { x: 288, y: 250 }, 18, "a")?.id).toBe("b");
    expect(snapConnection([a, b], { x: 280, y: 250 }, 18, "a")).toBeUndefined();
    expect(snapConnection([a, b], { x: 50, y: 50 }, 18, "a")).toBeUndefined();
    expect(snapConnection([a, { ...a, id: "top" }], { x: 50, y: 50 }, 18)?.id).toBe("top");
  });

  it("anchors routed connectors to side centers and follows element movement and resize", () => {
    expect(connectionPoints(a, b, "elbow")).toEqual({ a: { x: 100, y: 50 }, b: { x: 300, y: 250 } });
    expect(connectionPoints({ ...a, x: 20, w: 160 }, b, "curved").a).toEqual({ x: 180, y: 50 });
    const ellipse = { ...a, shape: "ellipse" as const };
    const p = connectionPoints(ellipse, b).a;
    expect(((p.x - 50) / 50) ** 2 + ((p.y - 50) / 50) ** 2).toBeCloseTo(1);
  });

  it("uses distinct straight, cubic, and orthogonal paths with the right arrow tangent", () => {
    const start = { x: 100, y: 50 }, end = { x: 300, y: 250 };
    expect(connectorPath(start, end).d).toBe("M 100 50 L 300 250");
    expect(connectorPath(start, end, "curved").d).toBe("M 100 50 C 200 50 200 250 300 250");
    expect(connectorPath(start, end, "elbow")).toEqual({
      d: "M 100 50 L 200 50 L 200 250 L 300 250", tail: { x: 200, y: 250 }, head: { x: 200, y: 50 },
    });
    expect(connectorPath({ x: 50, y: 300 }, { x: 150, y: 0 }, "elbow").d)
      .toBe("M 50 300 L 50 150 L 150 150 L 150 0");
  });

  it("keeps routes perpendicular to the element edge even when wide elements narrow the gap", () => {
    const path = connectionGeometry({ ...a, w: 500 }, { ...b, x: 600, y: 400, w: 500 }, "elbow");
    expect(path.d).toBe("M 500 50 L 550 50 L 550 450 L 600 450");
  });

  it.each(["straight", "curved", "elbow"] as const)("preserves %s routes in imports, duplication, and HTML exports", (route) => {
    const free: Item = { ...a, id: "free", kind: "drawing", arrow: true, points: [[0, 0], [100, 80]], route };
    const board = { ...createBoard(), items: [a, b, free], connections: [{ id: "c", from: "a", to: "b", route }] };
    expect(validateBoard(JSON.parse(JSON.stringify(board))).connections[0].route).toBe(route);
    expect(duplicateItems(board, ["a", "b"]).board.connections[1].route).toBe(route);
    const html = shareHtml(board);
    expect(parseBoardFile(html).connections[0].route).toBe(route);
    const data = JSON.parse(new DOMParser().parseFromString(html, "text/html").getElementById("rtboard-data")!.textContent!);
    const ends = connectionPoints(a, b, route);
    expect(data.lines[0].d).toBe(connectorPath(ends.a, ends.b, route).d);
    expect(data.drawingPaths.free).toBe(connectorPath({ x: 0, y: 0 }, { x: 100, y: 80 }, route).d);
  });

  it("keeps old boards straight and sanitizes unsupported routes", () => {
    const board = { ...createBoard(), items: [a, b], connections: [{ id: "c", from: "a", to: "b", route: "invalid" }] };
    expect(validateBoard(board).connections[0].route).toBe("straight");
    expect(validateBoard({ ...board, connections: [{ id: "c", from: "a", to: "b" }] }).connections[0].route).toBe("straight");
  });

  it.each(["one", "both", "none"] as const)("preserves %s arrowheads through duplication and exports", (arrowheads) => {
    const free: Item = { ...a, id: "free", kind: "drawing", arrow: true, points: [[0, 0], [100, 80]], arrowheads };
    const board = { ...createBoard(), items: [a, b, free], connections: [{ id: "c", from: "a", to: "b", arrowheads }] };
    const copied = duplicateItems(board, ["a", "b", "free"]).board;
    expect(copied.connections[1].arrowheads).toBe(arrowheads);
    expect(copied.items.at(-1)!.arrowheads).toBe(arrowheads);
    const html = shareHtml(board);
    const restored = parseBoardFile(html);
    expect(restored.connections[0].arrowheads).toBe(arrowheads);
    expect(restored.items[2]).toMatchObject({ arrow: true, arrowheads });
    const data = JSON.parse(new DOMParser().parseFromString(html, "text/html").getElementById("rtboard-data")!.textContent!);
    for (const markers of [data.lines[0], data.drawingMarkers.free]) {
      expect(markers.markerStart).toBe(arrowheads === "both" ? "url(#arrow)" : undefined);
      expect(markers.markerEnd).toBe(arrowheads === "none" ? undefined : "url(#arrow)");
    }
  });

  it("defaults legacy or unsupported arrowhead values to one end", () => {
    expect(connectorArrowheads(undefined)).toBe("one");
    expect(connectorArrowheads("invalid")).toBe("one");
    expect(connectorMarkers(undefined)).toEqual({ markerStart: undefined, markerEnd: "url(#arrow)" });
    const board = { ...createBoard(), items: [a, b], connections: [{ id: "c", from: "a", to: "b", arrowheads: "invalid" }] };
    expect(validateBoard(board).connections[0].arrowheads).toBe("one");
  });
});
