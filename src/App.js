import React, { useEffect, useState, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

const generateUuidPool = (poolSize) => {
  const set = new Set();
  while (set.size < poolSize) set.add(uuidv4());
  return Array.from(set);
};

const generateBoardFromPool = (pool) => {
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 25);
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
  const [intervalMs, setIntervalMs] = useState(1000);
  const [poolSliderValue, setPoolSliderValue] = useState(2);
  const [poolSize, setPoolSize] = useState(500);
  const [uuidPool, setUuidPool] = useState([]);
  const [boards, setBoards] = useState([]);
  const [winnerIndex, setWinnerIndex] = useState(null);
  const intervalRef = useRef(null);

  const initializeGame = () => {
    const pool = generateUuidPool(poolSize);
    setUuidPool(pool);
    const newBoards = [
      generateBoardFromPool(pool),
      generateBoardFromPool(pool),
      generateBoardFromPool(pool),
      generateBoardFromPool(pool),
    ];
    setBoards(newBoards);
    setCalledUuids([]);
    setCurrentUuid("");
    setWinnerIndex(null);
  };

  useEffect(() => {
    initializeGame();
  }, [poolSize]);

  const checkForWinner = (updatedCalledUuids) => {
    boards.forEach((board, index) => {
      const hasWon = board.every((uuid) => updatedCalledUuids.includes(uuid));
      if (hasWon) {
        setWinnerIndex(index);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    });
  };

  const callNewUuid = () => {
    setCalledUuids((prevCalledUuids) => {
      const remaining = uuidPool.filter((uuid) => !prevCalledUuids.includes(uuid));
      if (remaining.length === 0) return prevCalledUuids;
      const next = remaining[Math.floor(Math.random() * remaining.length)];
      const updatedCalledUuids = [...prevCalledUuids, next];
      setCurrentUuid(next);
      checkForWinner(updatedCalledUuids);
      return updatedCalledUuids;
    });
  };

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    callNewUuid();
    intervalRef.current = setInterval(() => {
      callNewUuid();
    }, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [intervalMs, uuidPool]);

  const handlePoolSliderChange = (e) => {
    const value = Number(e.target.value);
    setPoolSliderValue(value);
    const computedSize = Math.round(value);
    setPoolSize(computedSize);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center space-y-4">
      <h1 className="text-xl font-bold">UUID Bingo</h1>
      {winnerIndex !== null && (
        <div className="text-green-600 font-semibold">🎉 Player {winnerIndex + 1} has completed their board! 🎉</div>
      )}
      <div className="text-sm">Current UUID:</div>
      <div className="text-center font-mono text-lg break-all bg-white border p-2 rounded shadow">
        {currentUuid || "Waiting..."}
      </div>

      <div className="flex flex-col items-center space-y-2">
        <label className="text-xs">Speed: 1 UUID every {(intervalMs / 1000).toFixed(3)}s</label>
        <input
          type="range"
          min="1"
          max="10000"
          step="1"
          value={intervalMs}
          onChange={(e) => setIntervalMs(Number(e.target.value))}
          className="w-64"
        />
      </div>

      <div className="flex flex-col items-center space-y-2">
        <label className="text-xs">UUID Pool Size: {poolSize}</label>
        <input
          type="range"
          min="100"
          max="10000"
          step="100"
          value={poolSize}
          onChange={handlePoolSliderChange}
          className="w-64"
        />
      </div>

      <div className="grid grid-cols-2 grid-rows-2 gap-6 mt-4">
        {boards.map((board, i) => (
          <div key={i} className="border p-2 rounded shadow bg-white">
            <h2 className="text-sm font-semibold mb-1">
              Player {i + 1} {winnerIndex === i ? "🏆" : ""}
            </h2>
            <PlayerBoard uuids={board} calledUuids={calledUuids} />
          </div>
        ))}
      </div>
    </div>
  );
}
