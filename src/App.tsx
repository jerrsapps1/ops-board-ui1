import React from "react";
import "./index.css";
import Board from "./features/board/Board";

export default function App() {
  // App is intentionally thin; Board owns the entire UI (Dashboard, Profiles, Time, Logs, Import)
  return <Board />;
}
