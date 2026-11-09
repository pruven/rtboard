import { canvasFont, shapePaths, sketchPath, penPath } from "./sketch";
import handwritingFont from "./fonts/kalam.woff2?inline";
import { type Board, embedUrl, connectionGeometry, drawingConnectorPath, connectorMarkers } from "./model";
import { instagramEmbedDocument, instagramSandbox } from "./instagram";
// Serialized into exported files. Keep this function independent of module scope.
function viewer() {
  const data = JSON.parse(
    document.getElementById("rtboard-data")!.textContent!,
  );
  const board = data.board;
  const media = data.embeds as Record<string, string>;
  const embedDocuments = data.embedDocuments as Record<string, string>;
  const stage = document.getElementById("stage")!,
    world = document.getElementById("world")!;
  let x = 0,
    y = 0,
    z = 1;
  let drag: { x: number; y: number; ox: number; oy: number } | null = null;
  document.getElementById("name")!.textContent = board.name;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:visible;pointer-events:none";
  const defs = document.createElementNS(ns, "defs");
  const marker = document.createElementNS(ns, "marker");
  Object.entries({
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "7",
    markerHeight: "7",
    orient: "auto-start-reverse",
  }).forEach(([k, v]) => marker.setAttribute(k, v));
  const tip = document.createElementNS(ns, "path");
  tip.setAttribute("d", "M 0 0 L 10 5 L 0 10");
  tip.setAttribute("fill", "none");
  tip.setAttribute("stroke", "context-stroke");
  tip.setAttribute("stroke-opacity", "1");
  tip.setAttribute("stroke-width", "1.5");
  marker.append(tip);
  defs.append(marker);
  svg.append(defs);
  for (const line of data.lines) {
    const el = document.createElementNS(ns, "path");
    Object.entries({
      d: line.inkD,
      fill: "none",
      stroke: "#888",
      "stroke-width": 2,
    }).forEach(([k, v]) => el.setAttribute(k, String(v)));
    svg.append(el);
    const tips = document.createElementNS(ns, "path");
    tips.setAttribute("d", line.d);
    tips.setAttribute("fill", "none");
    tips.setAttribute("stroke", "currentColor");
    tips.setAttribute("stroke-opacity", "0");
    tips.setAttribute("stroke-width", "2");
    tips.style.color = "#888";
    if (line.markerStart) tips.setAttribute("marker-start", line.markerStart);
    if (line.markerEnd) tips.setAttribute("marker-end", line.markerEnd);
    svg.append(tips);
  }
  world.append(svg);
  for (const i of board.items) {
    const el = document.createElement("div");
    el.className = "item";
    Object.assign(el.style, {
      left: i.x + "px",
      top: i.y + "px",
      width: i.w + "px",
      height: i.h + "px",
      fontFamily: ["text", "shape", "note"].includes(i.kind) ? data.canvasFont : "inherit",
      fontSize: (i.fontSize || 20) + "px",
      fontWeight: i.bold ? "700" : "400",
      fontStyle: i.italic ? "italic" : "normal",
      textAlign: i.align || "left",
    });
    if (i.kind === "image") {
      const img = new Image();
      img.src = i.src;
      img.alt = i.text;
      el.append(img);
    } else if (i.kind === "video" || i.kind === "audio") {
      const m = document.createElement(i.kind);
      m.src = i.src;
      m.controls = true;
      el.append(m);
    } else if (i.kind === "link") {
      if (media[i.id]) {
        const frame = document.createElement("iframe");
        frame.src = media[i.id];
        if (embedDocuments[i.id]) {
          frame.setAttribute("sandbox", data.instagramSandbox);
          frame.srcdoc = embedDocuments[i.id];
        }
        frame.title = i.text;
        frame.allow =
          "autoplay; encrypted-media; fullscreen; picture-in-picture";
        frame.allowFullscreen = true;
        el.append(frame);
      } else {
        el.classList.add("bookmark");
        const a = document.createElement("a");
        a.href = i.src;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = i.text + " ↗";
        el.append(a);
      }
      const a = document.createElement("a");
      a.className = "url";
      a.href = i.src;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = i.src;
      el.append(a);
    } else if (i.kind === "drawing") {
      const s = document.createElementNS(ns, "svg");
      s.setAttribute("viewBox", `0 0 ${i.w} ${i.h}`);
      const p = document.createElementNS(ns, "path");
      p.setAttribute(
        "d",
        data.inkPaths[i.id],
      );
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", i.stroke || "#ddd");
      p.setAttribute("stroke-width", String(i.strokeWidth || 2));
      p.setAttribute("stroke-linecap", "round");
      s.append(p);
      if (i.arrow) {
        const markers = data.drawingMarkers[i.id];
        const tips = document.createElementNS(ns, "path");
        tips.setAttribute("d", data.drawingPaths[i.id]);
        tips.setAttribute("fill", "none");
        tips.setAttribute("stroke", "currentColor");
        tips.setAttribute("stroke-opacity", "0");
        tips.setAttribute("stroke-width", String(i.strokeWidth || 2));
        tips.style.color = i.stroke || "#ddd";
        if (markers?.markerStart) tips.setAttribute("marker-start", markers.markerStart);
        if (markers?.markerEnd) tips.setAttribute("marker-end", markers.markerEnd);
        s.append(tips);
      }
      el.append(s);
    } else {
      if (i.kind === "shape") {
        const s = document.createElementNS(ns, "svg");
        s.setAttribute("viewBox", `0 0 ${i.w} ${i.h}`);
        s.style.cssText = "position:absolute;inset:0;overflow:visible;pointer-events:none";
        for (const path of data.shapes[i.id]) {
          const p = document.createElementNS(ns, "path");
          Object.entries({ d: path.d, fill: path.fill || "none", stroke: path.stroke,
            "stroke-width": path.strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round" })
            .forEach(([k, v]) => p.setAttribute(k, String(v)));
          s.append(p);
        }
        el.append(s);
      }
      const label = document.createElement("span");
      label.style.position = "relative";
      label.textContent = i.text;
      el.append(label);
      if (i.kind === "text" && i.stroke) el.style.color = i.stroke;
      el.style.whiteSpace = "pre-wrap";
      if (i.kind === "note" || i.kind === "shape") {
        el.style.background = i.kind === "note" ? i.color || "transparent" : "transparent";
        el.style.borderRadius = i.shape === "ellipse" ? "50%" : "4px";
        el.style.padding = "20px";
        if (i.kind === "note") el.style.color = "#222";
      } else el.style.padding = "4px";
    }
    world.append(el);
  }
  const apply = () => {
    world.style.transform = `translate(${x}px,${y}px) scale(${z})`;
    document.getElementById("zoom")!.textContent = Math.round(z * 100) + "%";
  };
  const zoom = (
    next: number,
    cx = stage.clientWidth / 2,
    cy = stage.clientHeight / 2,
  ) => {
    next = Math.max(0.1, Math.min(4, next));
    x = cx - ((cx - x) * next) / z;
    y = cy - ((cy - y) * next) / z;
    z = next;
    apply();
  };
  const fit = () => {
    if (!board.items.length) return;
    const minX = Math.min(...board.items.map((i: { x: number }) => i.x)) - 50,
      minY = Math.min(...board.items.map((i: { y: number }) => i.y)) - 50,
      maxX =
        Math.max(
          ...board.items.map((i: { x: number; w: number }) => i.x + i.w),
        ) + 50,
      maxY =
        Math.max(
          ...board.items.map((i: { y: number; h: number }) => i.y + i.h),
        ) + 70;
    z = Math.min(
      1,
      stage.clientWidth / (maxX - minX),
      stage.clientHeight / (maxY - minY),
    );
    x = (stage.clientWidth - (maxX - minX) * z) / 2 - minX * z;
    y = (stage.clientHeight - (maxY - minY) * z) / 2 - minY * z;
    apply();
  };
  stage.onpointerdown = (e) => {
    if ((e.target as HTMLElement).closest("a,video,audio,iframe")) return;
    stage.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, ox: x, oy: y };
  };
  stage.onpointermove = (e) => {
    if (drag) {
      x = drag.ox + e.clientX - drag.x;
      y = drag.oy + e.clientY - drag.y;
      apply();
    }
  };
  stage.onpointerup = () => {
    drag = null;
  };
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = stage.getBoundingClientRect();
        zoom(
          z * Math.exp(-e.deltaY * 0.008),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else {
        x -= e.deltaX;
        y -= e.deltaY;
        apply();
      }
    },
    { passive: false },
  );
  document.getElementById("minus")!.onclick = () => zoom(z / 1.2);
  document.getElementById("plus")!.onclick = () => zoom(z * 1.2);
  document.getElementById("zoom")!.onclick = fit;
  document.getElementById("theme")!.onclick = () =>
    document.documentElement.classList.toggle("light");
  window.addEventListener("resize", fit);
  fit();
}
export function shareHtml(board: Board) {
  const embeds = Object.fromEntries(
    board.items.map((i) => [i.id, embedUrl(i.src || "")]),
  );
  const embedDocuments = Object.fromEntries(
    board.items.flatMap((i) => {
      const html = instagramEmbedDocument(i.src || "");
      return html ? [[i.id, html]] : [];
    }),
  );
  const lines = board.connections.flatMap((c) => {
    const a = board.items.find((i) => i.id === c.from),
      b = board.items.find((i) => i.id === c.to);
    if (!a || !b) return [];
    return [{ ...connectionGeometry(a, b, c.route), inkD: sketchPath(connectionGeometry(a, b, c.route).d, c.id), ...connectorMarkers(c.arrowheads) }];
  });
  const drawingPaths = Object.fromEntries(board.items.flatMap((i) => {
    if (!i.arrow || !i.points || i.points.length < 2) return [];
    return [[i.id, drawingConnectorPath(i, board.items, true).d]];
  }));
  const drawingMarkers = Object.fromEntries(board.items.filter((i) => i.arrow)
    .map((i) => [i.id, connectorMarkers(i.arrowheads)]));
  const shapes = Object.fromEntries(board.items.filter((i) => i.kind === "shape").map((i) => [i.id, shapePaths(i)]));
  const inkPaths = Object.fromEntries(board.items.filter((i) => i.kind === "drawing").map((i) => [i.id,
    i.arrow ? sketchPath(drawingPaths[i.id] || "", i.id, i.strokeWidth) : penPath(i.points)]));
  const data = JSON.stringify({ canvasFont, shapes, inkPaths, board, embeds, embedDocuments, instagramSandbox, lines, drawingPaths, drawingMarkers }).replace(
    /</g,
    "\\u003c",
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>rtboard collection</title><style>@font-face{font-family:Kalam;font-style:normal;font-weight:400;src:url(${handwritingFont}) format("woff2");font-display:swap}:root{color-scheme:dark;--bg:#0a0a0a;--surface:#141414;--ink:#eee;--border:#282828;--dot:#252525}.light{color-scheme:light;--bg:#fafafa;--surface:#fff;--ink:#171717;--border:#ddd;--dot:#ddd}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px system-ui}header{height:48px;padding:0 16px;display:flex;align-items:center;gap:16px;background:var(--surface);border-bottom:1px solid var(--border)}#name{border-left:1px solid var(--border);padding-left:16px}button{border:1px solid var(--border);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer;padding:8px 12px}#theme{margin-left:auto}#stage{position:absolute;inset:48px 0 0;overflow:hidden;touch-action:none;background-image:radial-gradient(var(--dot) 1px,transparent 1px);background-size:24px 24px}#world{position:absolute;transform-origin:0 0}.item{position:absolute;overflow:visible;font-synthesis:weight style;line-height:1.4}.item>img,.item>video,.item>svg{width:100%;height:100%;object-fit:cover}.item>audio{width:100%;height:100%}.item>iframe{width:100%;height:calc(100% - 28px);border:0;background:white}.item a{color:inherit}.url{display:block;height:28px;background:var(--surface);padding:6px 10px;font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bookmark{border:1px solid var(--border);background:var(--surface);padding:20px}.controls{position:fixed;right:16px;bottom:16px;display:flex;border:1px solid var(--border);border-radius:20px;overflow:hidden;background:var(--surface)}.controls button{border:0;border-radius:0}#zoom{min-width:65px}</style></head><body><header><b>rtboard</b><span id="name"></span><button id="theme">◐</button></header><div id="stage"><div id="world"></div></div><div class="controls"><button id="minus">−</button><button id="zoom">100%</button><button id="plus">+</button></div><script id="rtboard-data" type="application/json">${data}</script><script>(${viewer.toString()})()</script></body></html>`;
}
