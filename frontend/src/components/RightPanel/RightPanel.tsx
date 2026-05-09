import { useProjectStore } from "../../store/useProjectStore";
import ClipPropertiesPanel from "../LeftPanel/ClipPropertiesPanel";
import MediaTab from "../LeftPanel/MediaTab";
import EffectsTab from "./EffectsTab";
import EffectPropertiesPanel from "./EffectPropertiesPanel";
import TransitionPropertiesPanel from "./TransitionPropertiesPanel";

function PropertiesIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#0f766e" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M14.36 5.64l1.42-1.42M4.22 15.78l1.42-1.42" />
    </svg>
  );
}

function EffectsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#7c3aed" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l1.8 5.4H17l-4.3 3.2 1.6 5L10 13l-4.3 2.6 1.6-5L3 7.4h5.2L10 2z" />
    </svg>
  );
}

function MediaIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={active ? "#0f766e" : "#94a3b8"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="13" rx="2" />
      <path d="M8 8.5l5 2.5-5 2.5V8.5z" fill={active ? "#0f766e" : "#94a3b8"} stroke="none" />
    </svg>
  );
}

const TABS = [
  {
    id: "properties" as const,
    label: "Properties",
    icon: (active: boolean) => <PropertiesIcon active={active} />,
  },
  {
    id: "effects" as const,
    label: "Effects",
    icon: (active: boolean) => <EffectsIcon active={active} />,
  },
  {
    id: "media" as const,
    label: "Media",
    icon: (active: boolean) => <MediaIcon active={active} />,
  },
] as const;

export default function RightPanel() {
  const { rightPanelTab, setRightPanelTab, selectedEffectOverlayId, selectedTransitionId, selectedItemIds } = useProjectStore();

  return (
    <div className="flex flex-shrink-0">
      {/* Slide-in content panel */}
      {rightPanelTab !== null && (
        <div className="w-[260px] flex flex-col bg-white border-l border-r border-slate-200">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 flex-shrink-0">
            <button
              onClick={() => setRightPanelTab(null)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Close panel"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </button>
            <span className="text-[11px] text-slate-400 font-normal">
              {TABS.find((t) => t.id === rightPanelTab)?.label}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {rightPanelTab === "properties" ? (
              selectedItemIds.size > 1 ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-400 p-6">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <span className="text-[13px] font-medium">{selectedItemIds.size} items selected</span>
                  <span className="text-[11px] text-center">Drag any selected item to move them all</span>
                </div>
              ) : selectedEffectOverlayId ? <EffectPropertiesPanel />
              : selectedTransitionId ? <TransitionPropertiesPanel />
              : <ClipPropertiesPanel />
            ) : rightPanelTab === "effects" ? (
              <EffectsTab />
            ) : (
              <MediaTab />
            )}
          </div>
        </div>
      )}

      {/* Vertical icon strip */}
      <div className="w-[64px] flex flex-col items-center pt-4 gap-1 bg-slate-50 border-l border-slate-200">
        {TABS.map(({ id, label, icon }) => {
          const active = rightPanelTab === id;
          return (
            <button
              key={id}
              onClick={() => setRightPanelTab(active ? null : id)}
              className={`w-[52px] flex flex-col items-center gap-1 py-3 px-1 rounded-lg transition-colors cursor-pointer
                ${active
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
              title={label}
            >
              {icon(active)}
              <span className={`text-[11px] font-normal leading-none ${active ? "text-teal-700" : "text-slate-400"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
