import React, { useEffect, useState, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

const generateBoard = () => {
  const set = new Set();
  while (set.size < 25) set.add(uuidv4());
  return Array.from(set);
};

const PlayerBoard = ({ uuids, calledUuids }) => (
  <div className="grid grid-cols-5 gap-1 text-xs">
    {uuids.map((uuid) => (
      <div
        key={uuid}
        className={`p-1 border rounded ${
          calledUuids.includes(uuid) ? "bg-green-200" : "bg-white"
        }`}
        title={uuid}
      >
        {uuid.slice(0, 6)}&hellip;
      </div>
    ))}
  </div>
);

export default function UUIDBingo() {
  const [calledUuids, setCalledUuids] = useState([]);
  const [currentUuid, setCurrentUuid] = useState("");
  const [intervalMs, setIntervalMs] = useState(5000);

  const boardsRef = useRef([
    generateBoard(),
    generateBoard(),
    generateBoard(),
    generateBoard(),
  ]);

  const callNewUuid = () => {
    const newUuid = uuidv4();
    setCurrentUuid(newUuid);
    setCalledUuids((prev) => [...prev, newUuid]);
  };

  useEffect(() => {
    callNewUuid();
    const interval = setInterval(() => {
      callNewUuid();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center space-y-4">
      <h1 className="text-xl font-bold">UUID Bingo</h1>
      <div className="text-sm">Current UUID:</div>
      <div className="text-center font-mono text-lg break-all bg-white border p-2 rounded shadow">
        {currentUuid || "Waiting..."}
      </div>

      <input
        type="range"
        min="100"
        max="10000"
        step="100"
        value={intervalMs}
        onChange={(e) => setIntervalMs(Number(e.target.value))}
        className="w-64"
      />
      <div className="text-xs">Speed: 1 UUID every {(intervalMs / 1000).toFixed(1)}s</div>

      <div className="grid grid-cols-2 grid-rows-2 gap-6 mt-4">
        {boardsRef.current.map((board, i) => (
          <div key={i} className="border p-2 rounded shadow bg-white">
            <h2 className="text-sm font-semibold mb-1">Player {i + 1}</h2>
            <PlayerBoard uuids={board} calledUuids={calledUuids} />
          </div>
        ))}
      </div>
    </div>
  );
}
