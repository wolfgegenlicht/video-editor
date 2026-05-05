import { useState } from "react";
import MediaTab from "./MediaTab";
import TranscriptTab from "./TranscriptTab";

type Tab = "media" | "transcript";

export default function LeftPanel() {
  const [tab, setTab] = useState<Tab>("media");

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      <div className="flex border-b border-gray-200">
        {(["media", "transcript"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "media" ? <MediaTab /> : <TranscriptTab />}
      </div>
    </aside>
  );
}
