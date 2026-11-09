import { canvasFont, shapePaths, sketchPath, penPath } from "./sketch";
import {
  type Board,
  type Item,
  bounds,
  connectionGeometry,
  connectorPath,
  drawingConnectorPath,
  type ConnectorRoute,
  type ConnectorArrowheads,
  connectorArrowheads,
  downloadBlob,
} from "./model";
export async function exportPng(board: Board, dark: boolean) {
  await document.fonts.load(`20px Kalam`);
  const box = bounds(board.items),
    scale = Math.min(
      2,
      16000 / (box.w + 80),
      16000 / (box.h + 80),
      Math.sqrt(32000000 / ((box.w + 80) * (box.h + 80))),
    );
  if (scale < 0.1)
    throw new Error("This board is too large for a PNG. Use HTML export.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((box.w + 80) * scale);
  canvas.height = Math.ceil((box.h + 80) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable.");
  ctx.scale(scale, scale);
  ctx.fillStyle = dark ? "#0a0a0a" : "#fafafa";
  ctx.fillRect(0, 0, box.w + 80, box.h + 80);
  ctx.translate(40 - box.x, 40 - box.y);
  const ink = dark ? "#fafafa" : "#0a0a0a";
  const arrow = (x1: number, y1: number, x2: number, y2: number, route?: ConnectorRoute,
    path = connectorPath({ x: x1, y: y1 }, { x: x2, y: y2 }, route), arrowheads?: ConnectorArrowheads, id = "arrow") => {
    ctx.stroke(new Path2D(sketchPath(path.d, id, ctx.lineWidth)));
    const cap = (x: number, y: number, angle: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10 * Math.cos(angle - 0.4), y - 10 * Math.sin(angle - 0.4));
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10 * Math.cos(angle + 0.4), y - 10 * Math.sin(angle + 0.4));
      ctx.stroke();
    };
    const mode = connectorArrowheads(arrowheads);
    if (mode !== "none") cap(x2, y2, Math.atan2(y2 - path.tail.y, x2 - path.tail.x));
    if (mode === "both") cap(x1, y1, Math.atan2(y1 - path.head.y, x1 - path.head.x));
  };
  ctx.strokeStyle = dark ? "#aaa" : "#555";
  ctx.lineWidth = 2;
  for (const c of board.connections) {
    const a = board.items.find((i) => i.id === c.from),
      b = board.items.find((i) => i.id === c.to);
    if (a && b) {
      const p = connectionGeometry(a, b, c.route);
      arrow(p.a.x, p.a.y, p.b.x, p.b.y, c.route, p, c.arrowheads, c.id);
    }
  }
  const text = (i: Item, padding: number, color: string) => {
    const size = i.fontSize || 20;
    ctx.font = `${i.italic ? "italic " : ""}${i.bold ? "700" : "400"} ${size}px ${canvasFont}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.textAlign = i.align || "left";
    const width = i.w - padding * 2,
      x =
        i.align === "center"
          ? i.x + i.w / 2
          : i.align === "right"
            ? i.x + i.w - padding
            : i.x + padding;
    let y = i.y + padding;
    for (const line of i.text.split("\n")) {
      let row = "";
      for (const word of line.split(" ")) {
        const test = row ? row + " " + word : word;
        if (ctx.measureText(test).width > width && row) {
          ctx.fillText(row, x, y, width);
          y += size * 1.4;
          row = word;
        } else row = test;
      }
      if (y < i.y + i.h - padding) ctx.fillText(row, x, y, width);
      y += size * 1.4;
    }
  };
  for (const i of board.items) {
    ctx.save();
    if (!["shape", "drawing"].includes(i.kind)) {
      ctx.beginPath();
      ctx.rect(i.x, i.y, i.w, i.h);
      ctx.clip();
    }
    if (i.kind === "shape") {
      ctx.save();
      ctx.translate(i.x, i.y);
      for (const p of shapePaths(i)) {
        const path = new Path2D(p.d);
        if (p.fill && p.fill !== "none") { ctx.fillStyle = p.fill; ctx.fill(path); }
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(path);
      }
      ctx.restore();
      // Keep sketch edges free to overshoot, but contain the shape's label.
      ctx.beginPath();
      ctx.rect(i.x, i.y, i.w, i.h);
      ctx.clip();
      text(i, 18, ink);
    } else if (i.kind === "note") {
      ctx.beginPath();
      if (i.shape === "ellipse")
        ctx.ellipse(
          i.x + i.w / 2,
          i.y + i.h / 2,
          i.w / 2 - 2,
          i.h / 2 - 2,
          0,
          0,
          2 * Math.PI,
        );
      else ctx.roundRect(i.x + 1, i.y + 1, i.w - 2, i.h - 2, 4);
      ctx.fillStyle = i.color || "transparent";
      ctx.fill();
      ctx.strokeStyle = i.stroke || "transparent";
      ctx.lineWidth = i.strokeWidth || 2;
      ctx.stroke();
      text(i, 20, i.kind === "note" ? "#222" : ink);
    } else if (i.kind === "text") text(i, 4, i.stroke || ink);
    else if (i.kind === "image") {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("An image could not be exported."));
        img.src = i.src!;
      });
      ctx.drawImage(image, i.x, i.y, i.w, i.h);
    } else if (i.kind === "drawing") {
      ctx.strokeStyle = i.stroke || ink;
      ctx.lineWidth = i.strokeWidth || 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const p = i.points || [];
      if (i.arrow && p.length > 1)
        arrow(
          i.x + p[0][0],
          i.y + p[0][1],
          i.x + p.at(-1)![0],
          i.y + p.at(-1)![1],
          i.route,
          drawingConnectorPath(i, board.items),
          i.arrowheads,
          i.id,
        );
      else {
        ctx.translate(i.x, i.y);
        ctx.stroke(new Path2D(penPath(p)));
      }
    } else {
      ctx.fillStyle = dark ? "#1f1f1f" : "#eee";
      ctx.fillRect(i.x, i.y, i.w, i.h);
      text(
        {
          ...i,
          text:
            (i.kind === "link" ? "↗ " : i.kind === "video" ? "▶ " : "♫ ") +
            i.text +
            "\n\n" +
            (i.src?.startsWith("data:") ? "Media attachment" : i.src || ""),
          fontSize: 16,
        },
        20,
        ink,
      );
    }
    ctx.restore();
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
      "image/png",
    ),
  );
  downloadBlob(board.name + ".png", blob);
}
