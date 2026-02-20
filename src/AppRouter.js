import React from "react";
import { HashRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import UUIDBingo from "./App";
import MultiplayerBingo from "./MultiplayerBingo";

function MultiplayerLink() {
  const location = useLocation();
  if (location.pathname !== "/") return null;
  return (
    <div className="fixed top-3 right-3 z-50">
      <Link
        to="/multiplayer"
        className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-full shadow hover:bg-blue-600 transition"
      >
        🎮 Multiplayer
      </Link>
    </div>
  );
}

export default function AppRouter() {
  return (
    <HashRouter>
      <MultiplayerLink />
      <Routes>
        <Route path="/" element={<UUIDBingo />} />
        <Route path="/multiplayer" element={<MultiplayerBingo />} />
      </Routes>
    </HashRouter>
  );
}
