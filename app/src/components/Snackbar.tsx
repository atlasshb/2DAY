"use client";

import { useStore } from "@/lib/store";

export function Snackbar() {
  const { snackbarText, snackbarShow, undoLast } = useStore();

  return (
    <div className={`snack${snackbarShow ? " show" : ""}`}>
      <span>{snackbarText ?? "Logged"}</span>
      <button type="button" className="undo" onClick={undoLast}>
        Undo
      </button>
    </div>
  );
}
