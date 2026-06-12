import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface MenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ClipContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const menuWidth = 180;
  const menuHeight = items.length * 36 + 8;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-[0_8px_30px_oklch(0%_0_0_/_0.5)] py-1 min-w-[180px]"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.label === "---" ? (
          <div key={i} className="my-1 border-t border-[var(--border)]" />
        ) : (
          <button
            type="button"
            key={i}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors cursor-pointer
              ${item.disabled
                ? "text-[#a0a0ae] cursor-not-allowed"
                : item.danger
                  ? "text-[var(--danger)] hover:bg-[var(--danger)]/10"
                  : "text-[var(--txt1)] hover:bg-[var(--panel-2)]"
              }`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
