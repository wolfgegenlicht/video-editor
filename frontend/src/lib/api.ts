import type { UploadedFile, Project, TranscriptSegment } from "../types/project";

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return {
    id: data.fileId,
    originalName: data.originalName,
    duration: data.duration,
    width: data.width,
    height: data.height,
  };
}

export function fileUrl(fileId: string): string {
  return `/files/${fileId}`;
}

export async function transcribeFile(fileId: string): Promise<TranscriptSegment[]> {
  const res = await fetch("/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
  const data = await res.json();
  return data.segments;
}

export async function exportProject(project: Project): Promise<Blob> {
  const res = await fetch("/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
