import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import UUIDBingo from "./App";
import MultiplayerBingo from "./MultiplayerBingo";

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<UUIDBingo />} />
        <Route path="/multiplayer" element={<MultiplayerBingo />} />
      </Routes>
    </HashRouter>
  );
}
