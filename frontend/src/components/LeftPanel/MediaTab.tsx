import { useRef, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { uploadFile, fileUrl, deleteFile } from "../../lib/api";

export default function MediaTab() {
  const { files, addFile, removeFile, addClip, project, activeProjectId } = useProjectStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  async function handleRemoveFile(fileId: string) {
    try { await deleteFile(fileId); } catch { /* already gone */ }
    removeFile(fileId);
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const selected = Array.from(fileList).filter((f) =>
      f.type.startsWith("video/") || f.type.startsWith("audio/")
    );
    for (const file of selected) {
      try {
        const uploaded = await uploadFile(file, activeProjectId ?? undefined);
        addFile(uploaded);
      } catch (err) {
        alert("Upload failed: " + String(err));
      }
    }
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
    if (e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  }

  function handleDragStart(e: React.DragEvent, fileId: string) {
    e.dataTransfer.setData("fileId", fileId);
  }

  function handleAddToTimeline(fileId: string) {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    const firstTrack = project.tracks[0];
    if (!firstTrack) return;
    const lastClipEnd = firstTrack.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
    addClip(firstTrack.id, {
      fileId,
      startTime: lastClipEnd,
      duration: file.duration,
      sourceStart: 0,
      sourceEnd: file.duration,
    });
  }

  return (
    <div
      className={`flex flex-col h-full relative transition-colors ${draggingOver ? "bg-blue-50" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {draggingOver && (
        <div className="absolute inset-0 border-2 border-blue-400 border-dashed rounded pointer-events-none z-10 flex items-center justify-center bg-blue-50/80">
          <span className="text-xs text-blue-600 font-medium">Drop to upload</span>
        </div>
      )}
      <div className="p-2 border-b border-gray-100">
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-2 text-xs border-2 border-dashed border-gray-300 rounded hover:border-blue-400 hover:text-blue-600 text-gray-500 transition-colors"
        >
          + Upload Media
        </button>
        <input ref={inputRef} type="file" accept="video/*,audio/*" multiple className="hidden" onChange={handleUpload} />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.map((file) => (
          <div
            key={file.id}
            draggable
            onDragStart={(e) => handleDragStart(e, file.id)}
            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-grab group"
          >
            <div className="w-12 h-8 bg-gray-200 rounded flex-shrink-0 overflow-hidden">
              <video
                src={fileUrl(file.id)}
                className="w-full h-full object-cover"
                preload="metadata"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{file.originalName}</p>
              <p className="text-xs text-gray-400">{file.duration.toFixed(1)}s</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleAddToTimeline(file.id)}
                className="text-xs text-blue-500 hover:text-blue-700 px-1"
                title="Add to timeline"
              >+</button>
              <button
                onClick={() => handleRemoveFile(file.id)}
                className="text-xs text-red-400 hover:text-red-600 px-1"
                title="Remove"
              >×</button>
            </div>
          </div>
        ))}
        {files.length === 0 && (
          <p className="text-xs text-gray-400 text-center pt-4">No media uploaded</p>
        )}
      </div>
    </div>
  );
}
