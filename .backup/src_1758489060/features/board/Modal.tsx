import React from "react";

export default function Modal({
  title, onClose, onPrimary, primaryText = "Save", children
}: {
  title: string;
  onClose: () => void;
  onPrimary?: () => void;
  primaryText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[min(720px,94vw)] rounded-xl bg-slate-900 border border-white/10 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="text-sm px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10">Close</button>
        </div>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-sm">Cancel</button>
          {onPrimary && (
            <button onClick={onPrimary} className="px-3 py-2 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-sm">
              {primaryText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
