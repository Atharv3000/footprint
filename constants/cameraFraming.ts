type Size = { width: number; height: number };
type Frame = Size & { left: number; top: number };

/** Native preview geometry depends on camera setup, never on analysis results. */
export function previewFrame(view: Size, configuredAspect: number, fit: boolean): Frame {
  const aspect = Number.isFinite(configuredAspect) && configuredAspect > 0 ? configuredAspect : .75;
  const width = fit ? Math.min(view.width, view.height * aspect) : Math.max(view.width, view.height * aspect);
  const height = width / aspect;
  return { width, height, left: (view.width - width) / 2, top: (view.height - height) / 2 };
}

/** Captures may be center-cropped differently; fit their joints inside the fixed preview. */
export function landmarkFrame(preview: Frame, capturedAspect?: number): Frame {
  const aspect = capturedAspect && Number.isFinite(capturedAspect) && capturedAspect > 0
    ? capturedAspect : preview.width / preview.height;
  const width = Math.min(preview.width, preview.height * aspect);
  const height = width / aspect;
  return { width, height, left: preview.left + (preview.width - width) / 2,
    top: preview.top + (preview.height - height) / 2 };
}
