import { useEffect, useRef, useState } from "react";
import { exportCrop } from "@zriz/core/dom";
import type { Cropper as CropperApi } from "@zriz/react";
import * as Cropper from "@zriz/react/cropper";
import "@zriz/react/styles.css";

export type CroppedImage = { src: string; width: number; height: number };

export function ImageCropper({ src, onApply, onCancel }: {
  src: string;
  onApply: (image: CroppedImage) => void;
  onCancel: () => void;
}) {
  const cropper = useRef<CropperApi>(null);
  const running = useRef<AbortController | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => running.current?.abort(), []);

  const apply = async () => {
    if (!cropper.current || !loaded || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setSaving(true);
    setError("");
    try {
      // Export also reads the initial crop when no gesture has been committed.
      const result = await exportCrop(cropper.current, {
        type: "image/png",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.blob.size > 40 * 1024 * 1024) {
        throw new Error("The cropped image is larger than 40 MB. Choose a smaller crop.");
      }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read the cropped image."));
        reader.readAsDataURL(result.blob);
      });
      if (!controller.signal.aborted) {
        onApply({ src: data, width: result.width, height: result.height });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "Could not crop this image. Try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        running.current = null;
        setSaving(false);
      }
    }
  };

  return (
    <>
      <h2>Crop image</h2>
      <Cropper.Root src={src} actionsRef={cropper} disabled={saving}
        onLoad={() => { setLoaded(true); setError(""); }}
        onError={() => { setLoaded(false); setError("Could not load this image for cropping."); }}>
        <Cropper.Viewport className="image-crop-viewport">
          <Cropper.Image />
          <Cropper.Mask />
          <Cropper.Area aria-label="Crop area">
            <Cropper.Grid />
            <Cropper.Handle position="top-left" />
            <Cropper.Handle position="top-right" />
            <Cropper.Handle position="bottom-right" />
            <Cropper.Handle position="bottom-left" />
          </Cropper.Area>
        </Cropper.Viewport>
        <div className="image-crop-straighten">
          <span>Straighten <Cropper.DialValue />°</span>
          <Cropper.Dial aria-label="Straighten image"><Cropper.DialTicks /></Cropper.Dial>
        </div>
        <div className="image-crop-tools">
          <Cropper.Rotate className="secondary">Rotate left</Cropper.Rotate>
          <Cropper.Flip className="secondary">Flip image</Cropper.Flip>
          <Cropper.ZoomStep className="secondary" factor={0.8} aria-label="Zoom image out">−</Cropper.ZoomStep>
          <Cropper.ZoomStep className="secondary" factor={1.25} aria-label="Zoom image in">+</Cropper.ZoomStep>
          <Cropper.Reset className="secondary">Reset crop</Cropper.Reset>
        </div>
      </Cropper.Root>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="secondary" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!loaded || saving} onClick={() => void apply()}>
          {saving ? "Applying crop…" : "Apply crop"}
        </button>
      </div>
    </>
  );
}
