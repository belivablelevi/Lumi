// Records a canvas to a video file in the browser (the Clip maker). MP4 when the browser can
// make it (current Chrome and Edge), because Instagram doesn't take WebM.

export interface ClipFormat {
  mimeType: string;
  ext: "mp4" | "webm";
}

const CANDIDATES: ClipFormat[] = [
  { mimeType: "video/mp4;codecs=avc1", ext: "mp4" },
  { mimeType: "video/mp4", ext: "mp4" },
  { mimeType: "video/webm;codecs=vp9", ext: "webm" },
  { mimeType: "video/webm", ext: "webm" },
];

/** The best format this browser records, or null if it can't record at all. */
export function pickFormat(isTypeSupported: (type: string) => boolean): ClipFormat | null {
  return CANDIDATES.find((c) => isTypeSupported(c.mimeType)) ?? null;
}

/**
 * Records `canvas` for `seconds`. The caller keeps drawing the clip in real time while this
 * runs; `onFrame` is not needed because captureStream picks up whatever is drawn.
 */
export function recordCanvas(canvas: HTMLCanvasElement, seconds: number, format: ClipFormat, fps = 30): Promise<Blob> {
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  return new Promise((resolve, reject) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: format.mimeType.split(";")[0] }));
    };
    rec.onerror = () => reject(new Error("The browser stopped recording."));
    rec.start(250);
    setTimeout(() => rec.state !== "inactive" && rec.stop(), seconds * 1000);
  });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
