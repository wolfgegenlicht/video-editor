import type { UploadedFile, Project, AudioEnhanceType } from "../types/project";

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  updated_at: string;
}

export interface ProjectData {
  project: Project;
  files: UploadedFile[];
  missingFileIds?: string[];
}

export interface EyeContactStatusResponse {
  status: "processing" | "done" | "error";
  correctedFileId?: string;
  progress?: number;
  error?: string;
}

function mapFile(raw: { fileId: string; originalName: string; duration: number; width: number; height: number }): UploadedFile {
  return { id: raw.fileId, originalName: raw.originalName, duration: raw.duration, width: raw.width, height: raw.height };
}

export async function uploadFile(file: File, projectId?: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const url = projectId ? `/upload?project_id=${projectId}` : "/upload";
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return mapFile(await res.json());
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
  return (await res.json()).segments;
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

export interface ExportOptions {
  resolution: 1080 | 720 | 480;
  burn_captions: boolean;
  preset: string;
  preview_width: number;
  caption_line_breaks: Record<string, number[][]>;
}

export interface ExportJobResponse {
  jobId: string;
  filename: string;
}

export interface ExportStatusResponse {
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  error?: string;
}

export async function startExportJob(
  project: Project,
  options: ExportOptions,
  filename: string
): Promise<ExportJobResponse> {
  const res = await fetch("/export/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, options, filename }),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.json();
}

export async function getExportStatus(jobId: string): Promise<ExportStatusResponse> {
  const res = await fetch(`/export/status/${jobId}`);
  if (!res.ok) throw new Error(`Export status failed: ${res.status}`);
  return res.json();
}

export async function downloadExport(jobId: string, filename: string): Promise<void> {
  const res = await fetch(`/export/download/${jobId}`);
  if (!res.ok) throw new Error(`Export download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await fetch("/projects");
  if (!res.ok) throw new Error(`List projects failed: ${res.status}`);
  return res.json();
}

export async function createProject(name: string): Promise<ProjectData> {
  const res = await fetch("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create project failed: ${res.status}`);
  const data = await res.json();
  return { project: data.project, files: data.files.map(mapFile) };
}

export async function loadProject(id: string): Promise<ProjectData> {
  const res = await fetch(`/projects/${id}`);
  if (!res.ok) throw new Error(`Load project failed: ${res.status}`);
  const data = await res.json();
  return { project: data.project, files: data.files.map(mapFile), missingFileIds: data.missingFileIds ?? [] };
}

export async function saveProject(id: string, project: Project): Promise<void> {
  const res = await fetch(`/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) throw new Error(`Save project failed: ${res.status}`);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const res = await fetch(`/projects/${id}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename project failed: ${res.status}`);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete project failed: ${res.status}`);
}

export async function startEyeContactJob(fileId: string): Promise<{ jobId: string }> {
  const res = await fetch("/eye-contact/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) throw new Error(`Eye contact job failed: ${res.status}`);
  return res.json();
}

export async function getEyeContactStatus(jobId: string): Promise<EyeContactStatusResponse> {
  const res = await fetch(`/eye-contact/status/${jobId}`);
  if (!res.ok) throw new Error(`Eye contact status check failed: ${res.status}`);
  return res.json();
}

export async function deleteEyeContactFile(fileId: string): Promise<void> {
  const res = await fetch(`/eye-contact/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete eye contact file failed: ${res.status}`);
}

export interface AudioEnhanceStatusResponse {
  status: "processing" | "done" | "error";
  progress?: number;
  enhancedFileId?: string;
  error?: string;
}

export async function startAudioEnhanceJob(fileId: string, type: AudioEnhanceType): Promise<{ jobId: string }> {
  const res = await fetch("/enhance-audio/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, enhanceType: type }),
  });
  if (!res.ok) throw new Error(`Audio enhance job failed: ${res.status}`);
  return res.json();
}

export async function getAudioEnhanceStatus(jobId: string): Promise<AudioEnhanceStatusResponse> {
  const res = await fetch(`/enhance-audio/status/${jobId}`);
  if (!res.ok) throw new Error(`Audio enhance status check failed: ${res.status}`);
  return res.json();
}

export async function cancelAudioEnhanceJob(jobId: string): Promise<void> {
  const res = await fetch(`/enhance-audio/cancel/${jobId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Cancel audio enhance job failed: ${res.status}`);
}
