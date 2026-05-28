import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { uploadFile, fileUrl, deleteFile } from "../../lib/api";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isAudio(file: { width: number; height: number }) {
  return file.width === 0 || file.height === 0;
}

function AudioThumbnail() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#f2f2f6]">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#9b9baa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V6l10-2v12" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="16" r="2.5" />
      </svg>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-10 pb-4 px-4 text-center">
      <div className="size-12 rounded-xl bg-[#f2f2f6] flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#9b9baa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="18" height="14" rx="2" />
          <path d="M9 10l5 2.5L9 15V10z" fill="#9b9baa" stroke="none" />
          <path d="M7 2h8" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-[#6b6b78]">No media yet</p>
        <p className="text-[11px] text-[#6b6b78] leading-relaxed">
          Upload video or audio files,<br />or drag them into this panel.
        </p>
      </div>
    </div>
  );
}

export default function MediaTab() {
  const { files, addFile, removeFile, addClip, addTrackWithClip, project, activeProjectId } = useProjectStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usedFileIds = new Set(
    project.tracks.flatMap((t) => t.clips.map((c) => c.fileId))
  );

  async function handleRemoveFile(fileId: string) {
    if (confirmDelete !== fileId) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmDelete(fileId);
      confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmDelete(null);
    try { await deleteFile(fileId); } catch { /* already gone */ }
    removeFile(fileId);
  }

  function addUploadedToTimeline(uploaded: { id: string; duration: number; width: number; height: number }) {
    const trackType = isAudio(uploaded) ? "audio" : "video";
    // Read fresh state so multiple back-to-back uploads don't stomp each other
    const currentProject = useProjectStore.getState().project;
    const matchingTrack = currentProject.tracks.find((t) => t.type === trackType);
    const startTime = matchingTrack
      ? matchingTrack.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
      : 0;
    if (matchingTrack) {
      addClip(matchingTrack.id, { fileId: uploaded.id, startTime, duration: uploaded.duration, sourceStart: 0, sourceEnd: uploaded.duration });
    } else {
      addTrackWithClip(trackType, { fileId: uploaded.id, startTime: 0, duration: uploaded.duration, sourceStart: 0, sourceEnd: uploaded.duration });
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const selected = Array.from(fileList).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("audio/")
    );
    if (!selected.length) return;
    setUploading(true);
    setUploadError(null);
    for (const file of selected) {
      try {
        const uploaded = await uploadFile(file, activeProjectId ?? undefined);
        addFile(uploaded);
        addUploadedToTimeline(uploaded);
      } catch (err) {
        setUploadError("Upload failed: " + String(err));
      }
    }
    setUploading(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    await uploadFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDraggingOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDraggingOver(false);
  }

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDraggingOver(false);
    if (e.dataTransfer.files.length > 0) await uploadFiles(e.dataTransfer.files);
  }

  function handleDragStart(e: React.DragEvent, fileId: string) {
    e.dataTransfer.setData("fileId", fileId);
  }

  function handleAddToTimeline(fileId: string) {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    addUploadedToTimeline(file);
  }

  return (
    <div
      className={`flex flex-col h-full relative transition-colors ${draggingOver ? "bg-[rgba(14,165,160,0.05)]" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {draggingOver && (
        <div className="absolute inset-0 border-2 border-[#0ea5a0] border-dashed rounded pointer-events-none z-10 flex flex-col items-center justify-center gap-1.5 bg-[rgba(14,165,160,0.08)]">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#0ea5a0" strokeWidth="1.5" strokeLinecap="round">
            <path d="M11 14V4M7 8l4-4 4 4" />
            <path d="M4 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />
          </svg>
          <span className="text-xs font-medium text-[#0d9488]">Drop to upload</span>
        </div>
      )}

      {/* Upload button */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium
            border border-dashed border-black/10 text-[#6b6b78]
            hover:border-[#0ea5a0]/50 hover:text-[#0d9488] hover:bg-[rgba(14,165,160,0.05)]
            disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
        >
          {uploading ? (
            <>
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="6" r="4" strokeOpacity="0.25" />
                <path d="M6 2a4 4 0 0 1 4 4" />
              </svg>
              Uploading…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 2v8M2 6l4-4 4 4" />
              </svg>
              Upload media
            </>
          )}
        </button>
        {uploadError && (
          <p className="mt-1.5 text-[11px] text-red-500 leading-tight" title={uploadError}>{uploadError}</p>
        )}
        <input ref={inputRef} type="file" accept="video/*,audio/*" multiple className="hidden" onChange={handleUpload} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {files.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {files.map((file) => {
              const audio = isAudio(file);
              const inUse = usedFileIds.has(file.id);
              const armed = confirmDelete === file.id;

              return (
                <div
                  key={file.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file.id)}
                  className="group relative rounded-lg overflow-hidden cursor-grab active:cursor-grabbing
                    ring-1 ring-black/[0.08] hover:ring-black/[0.14] bg-white transition-shadow"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video w-full bg-[#ebebef] overflow-hidden">
                    {audio ? (
                      <AudioThumbnail />
                    ) : (
                      <video
                        src={fileUrl(file.id)}
                        className="w-full h-full object-cover"
                        preload="metadata"
                      />
                    )}
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors pointer-events-none" />

                  {/* Action buttons — revealed on hover */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleAddToTimeline(file.id)}
                      className="flex items-center justify-center size-7 rounded-full bg-white/90 shadow
                        text-[#141416] hover:text-[#0d9488] hover:bg-white transition-colors"
                      title="Add to timeline"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M6.5 1v11M1 6.5h11" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      className={`flex items-center justify-center size-7 rounded-full shadow transition-colors
                        ${armed
                          ? "bg-red-500 text-white hover:bg-red-600"
                          : "bg-white/90 text-[#6b6b78] hover:text-red-500 hover:bg-white"}`}
                      title={armed ? "Click again to confirm delete" : "Remove file"}
                    >
                      {armed ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M2 6h8" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1.5 2.5h8M4 2.5V1.5h3v1M3.5 2.5l.5 6h3.5l.5-6" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Type badge */}
                  <div className="absolute top-1 left-1 pointer-events-none">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded
                      ${audio ? "bg-violet-500/85 text-white" : "bg-black/50 text-white"}`}>
                      {audio ? "audio" : "video"}
                    </span>
                  </div>

                  {/* In-timeline dot */}
                  {inUse && (
                    <div
                      className="absolute top-1 right-1 size-1.5 rounded-full bg-teal-400 ring-1 ring-white/80 pointer-events-none"
                      title="Used in timeline"
                    />
                  )}

                  {/* Filename + duration */}
                  <div className="px-2 pt-1.5 pb-1.5 bg-white">
                    <p className="text-[11px] font-medium text-[#141416] truncate leading-tight">{file.originalName}</p>
                    <p className="text-[11px] text-[#6b6b78] mt-0.5">{formatDuration(file.duration)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
