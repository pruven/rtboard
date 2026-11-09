// Keep Instagram's SDK inside a document it owns: it replaces blockquotes with
// player frames and listens for their sizing/initialization messages.
export const instagramSandbox = "allow-scripts allow-popups allow-popups-to-escape-sandbox";
function instagramPlayer() {
  let ready = false;
  const fail = () => {
    if (ready) return;
    document.body.className = "failed";
    document.getElementById("message")!.textContent =
      "Instagram couldn't load this content here. Open it on Instagram to view it.";
  };
  const timeout = window.setTimeout(fail, 15000);
  window.addEventListener("error", (event) => {
    if ((event.target as HTMLElement)?.tagName === "SCRIPT") {
      window.clearTimeout(timeout);
      fail();
    }
  }, true);
  window.addEventListener("message", (event) => {
    const frame = document.querySelector("iframe");
    // Descendants inherit the sandbox's opaque origin. Still require the
    // message to come from this exact player, including for opaque messages.
    if (!["https://www.instagram.com", "null"].includes(event.origin) ||
        !frame || event.source !== frame.contentWindow) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.type === "MOUNTED" || data?.type === "MEASURE") {
        ready = true;
        window.clearTimeout(timeout);
        document.body.className = "ready";
        // The SDK ignores opaque-origin messages; apply its measured size here.
        frame.style.position = "static";
        const styles = data.details?.styles;
        const mountedHeight = Array.isArray(styles)
          ? styles.find((style) => Array.isArray(style) && style[0] === "height")?.[1] : undefined;
        const height = data.details?.height ?? (typeof mountedHeight === "string" && /^\d+(\.\d+)?px$/.test(mountedHeight)
          ? Number.parseFloat(mountedHeight) : undefined);
        if (typeof height === "number" && Number.isFinite(height) && height > 0 && height <= 20000) {
          frame.style.height = `${height}px`;
        } else if (!frame.style.height || frame.style.height === "0px") {
          // Keep the player visible while waiting for its first MEASURE.
          frame.style.height = "520px";
        }
      }
    } catch { /* Ignore messages that aren't Instagram's embed protocol. */ }
  });
}

export function instagramPermalink(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"].includes(url.hostname)
    ) return null;
    const match = url.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)(?:\/|$)/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/`;
  } catch {
    return null;
  }
}

export function instagramEmbedDocument(value: string): string | undefined {
  const permalink = instagramPermalink(value);
  if (!permalink) return undefined;
  // Only the allowlisted host, fixed path segments, and a shortcode enter HTML.
  // No arbitrary board text or URL query parameters are interpolated here.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#fff}body{font:14px system-ui;color:#333}a{color:#333}#status{padding:24px;line-height:1.5}.ready #status,.failed .instagram-media,.ready blockquote.instagram-media{display:none!important}.instagram-media{width:100%;min-width:0!important;max-width:none!important;margin:0!important;box-sizing:border-box}</style></head><body><div id="status" role="status"><p id="message">Loading Instagram content…</p><a href="${permalink}" target="_blank" rel="noopener noreferrer">View on Instagram</a></div><blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14"><a href="${permalink}" target="_blank" rel="noopener noreferrer">View on Instagram</a></blockquote><script>(${instagramPlayer.toString()})()</script><script async src="https://www.instagram.com/embed.js"></script></body></html>`;
}
