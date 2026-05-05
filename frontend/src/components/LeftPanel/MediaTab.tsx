import { useRef } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { uploadFile, fileUrl } from "../../lib/api";

export default function MediaTab() {
  const { files, addFile, removeFile, addClip, project } = useProjectStore();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    for (const file of selected) {
      try {
        const uploaded = await uploadFile(file);
        addFile(uploaded);
      } catch (err) {
        alert("Upload failed: " + String(err));
      }
    }
    // Reset input so same file can be re-uploaded
    e.target.value = "";
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
    <div className="flex flex-col h-full">
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
                onClick={() => removeFile(file.id)}
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
