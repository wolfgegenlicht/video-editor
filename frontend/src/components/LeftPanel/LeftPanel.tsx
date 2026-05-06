import { useState } from "react";
import MediaTab from "./MediaTab";
import TranscriptTab from "./TranscriptTab";
import ClipPropertiesPanel from "./ClipPropertiesPanel";

type Tab = "Media" | "Transcript" | "Properties";

interface Props { seek: (t: number) => void }

export default function LeftPanel({ seek }: Props) {
  const [tab, setTab] = useState<Tab>("Media");

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {(["Media", "Transcript", "Properties"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors
              ${tab === t ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "Media" && <MediaTab />}
        {tab === "Transcript" && <TranscriptTab seek={seek} />}
        {tab === "Properties" && <ClipPropertiesPanel />}
      </div>
    </aside>
  );
}
