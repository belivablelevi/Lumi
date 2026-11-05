/**
 * Opening and saving files in Studio. Chrome (including on a Chromebook) gets real Open and
 * Save dialogs through the File System Access API; other browsers fall back to an upload
 * picker and a download.
 */

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o: { types?: PickerType[]; multiple?: boolean }) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o: { suggestedName?: string; types?: PickerType[] }) => Promise<FileHandle>;
};

export const hasFilePickers = () =>
  typeof window !== "undefined" && typeof (window as PickerWindow).showSaveFilePicker === "function";

const aborted = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Asks for one or more files. Resolves to [] if the person cancels. */
export async function openFiles(description: string, extensions: string[], multiple = false): Promise<File[]> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const handles = await w.showOpenFilePicker({ multiple, types: [{ description, accept: { "application/octet-stream": extensions } }] });
      return Promise.all(handles.map((h) => h.getFile()));
    } catch (e) {
      if (aborted(e)) return [];
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.join(",");
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** Saves `data` under a suggested name. Returns false if the person cancels. */
export async function saveFile(name: string, data: BlobPart, type: string, description: string): Promise<boolean> {
  const blob = new Blob([data], { type });
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const ext = name.slice(name.lastIndexOf("."));
      const handle = await w.showSaveFilePicker({ suggestedName: name, types: [{ description, accept: { [type]: [ext] } }] });
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
      return true;
    } catch (e) {
      if (aborted(e)) return false;
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
