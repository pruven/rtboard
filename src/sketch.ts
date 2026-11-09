import { RoughGenerator } from "roughjs/bin/generator";
import type { Item } from "./model";

const generator = new RoughGenerator();
export const canvasFont = 'Kalam, "Segoe Print", cursive';
export function sketchSeed(id: string) {
  let seed = 1;
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) | 0;
  return (seed >>> 0) || 1;
}
export function sketchPath(d: string, id: string, width = 2) {
  return generator.toPaths(generator.path(d, {
    seed: sketchSeed(id), roughness: 0.85, bowing: 1,
    strokeWidth: width, preserveVertices: true,
  })).map((p) => p.d).join(" ");
}
export function shapePaths(i: Item) {
  const options = {
    seed: sketchSeed(i.id), roughness: 0.85, bowing: 1,
    stroke: i.stroke || "transparent", strokeWidth: i.strokeWidth || 2,
    fill: i.color && i.color !== "transparent" ? i.color : undefined,
    fillStyle: "hachure", hachureGap: 7, fillWeight: 0.5,
  };
  return generator.toPaths(i.shape === "ellipse"
    ? generator.ellipse(i.w / 2, i.h / 2, Math.max(1, i.w - 4), Math.max(1, i.h - 4), options)
    : generator.rectangle(2, 2, Math.max(1, i.w - 4), Math.max(1, i.h - 4), options));
}
// Midpoint curves retain the original samples while taking the corners out of pen strokes.
export function penPath(points: number[][] = []) {
  if (!points.length) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let n = 1; n < points.length - 1; n++) {
    const p = points[n], next = points[n + 1];
    d += ` Q ${p[0]} ${p[1]} ${(p[0] + next[0]) / 2} ${(p[1] + next[1]) / 2}`;
  }
  const last = points.at(-1)!;
  return `${d} L ${last[0]} ${last[1]}`;
}
