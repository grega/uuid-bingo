import React, { useEffect, useState, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { Link } from "react-router-dom";
import Peer from "peerjs";

// constants & helpers
const PEER_PREFIX = "uuid-bingo-";

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

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

// main multiplayer component
export default function MultiplayerBingo() {
  // ui state
  const [phase, setPhase] = useState("lobby"); // lobby | waiting | playing
  const [role, setRole] = useState(null); // host | guest
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerCount, setPlayerCount] = useState(0);
  const [myIndex, setMyIndex] = useState(0);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknames, setNicknames] = useState({});

  // game state
  const [boards, setBoards] = useState([]);
  const [calledUuids, setCalledUuids] = useState([]);
  const [currentUuid, setCurrentUuid] = useState("");
  const [winnerIndex, setWinnerIndex] = useState(null);
  const [poolSize, setPoolSize] = useState(500);
  const [intervalMs, setIntervalMs] = useState(1000);

  // refs (for use inside setInterval / PeerJS callbacks)
  const peerRef = useRef(null);
  const connsRef = useRef([]); // host keeps guest connections; guest keeps single host conn
  const timerRef = useRef(null);
  const poolRef = useRef([]);
  const calledRef = useRef([]);
  const boardsRef = useRef([]);
  const winnerRef = useRef(null);
  const intervalMsRef = useRef(1000);
  const timeoutRef = useRef(null);
  const nicknamesRef = useRef({});
  const connNicknameMapRef = useRef(new Map());

  // keep refs in sync with state
  useEffect(() => {
    intervalMsRef.current = intervalMs;
  }, [intervalMs]);

  useEffect(() => {
    nicknamesRef.current = nicknames;
  }, [nicknames]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // shared helpers
  const broadcast = (data) => {
    connsRef.current.forEach((c) => {
      if (c.open)
        try {
          c.send(data);
        } catch (_) {
          /* ignore */
        }
    });
  };

  const rebuildAndBroadcastNicknames = () => {
    const nicks = { 0: nicknamesRef.current[0] || "Player 1" };
    const openConns = connsRef.current.filter((c) => c.open);
    openConns.forEach((conn, i) => {
      nicks[i + 1] =
        connNicknameMapRef.current.get(conn) || `Player ${i + 2}`;
    });
    nicknamesRef.current = nicks;
    setNicknames(nicks);
    const count = openConns.length + 1;
    setPlayerCount(count);
    openConns.forEach((conn, i) => {
      if (conn.open) {
        conn.send({
          type: "nicknameUpdate",
          nicknames: nicks,
          yourIndex: i + 1,
          playerCount: count,
        });
      }
    });
  };

  // call the next UUID – host only, reads from refs so it's closure-safe
  const callNext = () => {
    const pool = poolRef.current;
    const called = calledRef.current;
    const remaining = pool.filter((u) => !called.includes(u));
    if (remaining.length === 0) return;

    const next = remaining[Math.floor(Math.random() * remaining.length)];
    const updated = [...called, next];
    calledRef.current = updated;

    setCalledUuids(updated);
    setCurrentUuid(next);

    let winner = null;
    boardsRef.current.forEach((board, i) => {
      if (board.every((u) => updated.includes(u))) winner = i;
    });

    if (winner !== null) {
      winnerRef.current = winner;
      setWinnerIndex(winner);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    broadcast({
      type: "tick",
      calledUuids: updated,
      currentUuid: next,
      winnerIndex: winner,
    });
  };

  const getLabel = (i) => {
    const name = nicknames[i] || `Player ${i + 1}`;
    const tags = [];
    if (i === 0) tags.push("Host");
    if (i === myIndex) tags.push("You");
    return tags.length ? `${name} (${tags.join(", ")})` : name;
  };

  // host logic
  const hostGame = () => {
    setError("");
    const code = generateRoomCode();
    setRoomCode(code);
    setRole("host");
    setMyIndex(0);
    setPlayerCount(1);
    setPhase("waiting");

    const hostNick = nickname.trim() || "Player 1";
    const initialNicknames = { 0: hostNick };
    nicknamesRef.current = initialNicknames;
    connNicknameMapRef.current = new Map();
    setNicknames(initialNicknames);

    const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
    peerRef.current = peer;

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        setError("Room code conflict — please try again.");
        peer.destroy();
        setPhase("lobby");
        return;
      }
      setError("Connection error: " + err.type);
    });

    peer.on("connection", (conn) => {
      const openConns = connsRef.current.filter((c) => c.open);
      if (openConns.length >= 3) {
        conn.on("open", () => {
          conn.send({
            type: "error",
            message: "Game is full (max 4 players)",
          });
          setTimeout(() => conn.close(), 200);
        });
        return;
      }

      conn.on("open", () => {
        connsRef.current = [...connsRef.current, conn];
        const count = connsRef.current.filter((c) => c.open).length + 1;
        setPlayerCount(count);
        conn.send({
          type: "welcome",
          playerCount: count,
          nicknames: nicknamesRef.current,
        });
        rebuildAndBroadcastNicknames();
      });

      conn.on("data", (data) => {
        if (data.type === "setNickname") {
          connNicknameMapRef.current.set(
            conn,
            data.nickname || "Player"
          );
          rebuildAndBroadcastNicknames();
        }
      });

      conn.on("close", () => {
        connNicknameMapRef.current.delete(conn);
        connsRef.current = connsRef.current.filter((c) => c !== conn);
        rebuildAndBroadcastNicknames();
      });
    });
  };

  const startGame = () => {
    // keep only live connections
    const openConns = connsRef.current.filter((c) => c.open);
    connsRef.current = openConns;
    const total = openConns.length + 1;

    const pool = generateUuidPool(poolSize);
    poolRef.current = pool;
    calledRef.current = [];
    winnerRef.current = null;

    const newBoards = Array.from({ length: total }, () =>
      generateBoardFromPool(pool)
    );
    boardsRef.current = newBoards;

    setBoards(newBoards);
    setCalledUuids([]);
    setCurrentUuid("");
    setWinnerIndex(null);
    setPlayerCount(total);
    setPhase("playing");

    // each guest gets their specific index
    openConns.forEach((conn, i) => {
      conn.send({
        type: "start",
        boards: newBoards,
        yourIndex: i + 1,
        playerCount: total,
        poolSize,
        intervalMs,
        nicknames: nicknamesRef.current,
      });
    });

    // begin calling UUIDs
    if (timerRef.current) clearInterval(timerRef.current);
    callNext();
    timerRef.current = setInterval(callNext, intervalMsRef.current);
  };

  const changeSpeed = (ms) => {
    setIntervalMs(ms);
    intervalMsRef.current = ms;
    if (winnerRef.current === null) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(callNext, ms);
    }
    broadcast({ type: "speed", intervalMs: ms });
  };

  const newGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    calledRef.current = [];
    winnerRef.current = null;
    boardsRef.current = [];
    const count = connsRef.current.filter((c) => c.open).length + 1;

    setPhase("waiting");
    setBoards([]);
    setCalledUuids([]);
    setCurrentUuid("");
    setWinnerIndex(null);
    setPlayerCount(count);

    rebuildAndBroadcastNicknames();
    broadcast({ type: "lobby", playerCount: count });
  };

  // guest logic
  const joinGame = () => {
    const code = joinCode.toUpperCase().trim();
    if (!code) {
      setError("Please enter a room code");
      return;
    }

    setError("");
    setConnecting(true);
    setRoomCode(code);
    setRole("guest");
    setMyIndex(-1);

    // timeout so the guest isn't stuck forever
    timeoutRef.current = setTimeout(() => {
      setError("Connection timed out. Check the room code and try again.");
      setConnecting(false);
      setPhase("lobby");
      if (peerRef.current) peerRef.current.destroy();
    }, 15000);

    const peer = new Peer({ debug: 0 });
    peerRef.current = peer;

    peer.on("open", () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      connsRef.current = [conn];

      conn.on("open", () => {
        clearTimeout(timeoutRef.current);
        setConnecting(false);
        setPhase("waiting");
        conn.send({
          type: "setNickname",
          nickname: nickname.trim() || "Player",
        });
      });

      conn.on("data", (data) => {
        switch (data.type) {
          case "welcome":
            setPlayerCount(data.playerCount);
            if (data.nicknames) setNicknames(data.nicknames);
            break;
          case "playerUpdate":
            setPlayerCount(data.playerCount);
            break;
          case "nicknameUpdate":
            setNicknames(data.nicknames);
            if (data.yourIndex != null) setMyIndex(data.yourIndex);
            if (data.playerCount != null) setPlayerCount(data.playerCount);
            break;
          case "start":
            setMyIndex(data.yourIndex);
            setBoards(data.boards);
            setPlayerCount(data.playerCount);
            setPoolSize(data.poolSize);
            setIntervalMs(data.intervalMs);
            if (data.nicknames) setNicknames(data.nicknames);
            setCalledUuids([]);
            setCurrentUuid("");
            setWinnerIndex(null);
            setPhase("playing");
            break;
          case "tick":
            setCalledUuids(data.calledUuids);
            setCurrentUuid(data.currentUuid);
            setWinnerIndex(data.winnerIndex);
            break;
          case "speed":
            setIntervalMs(data.intervalMs);
            break;
          case "lobby":
            setPhase("waiting");
            setBoards([]);
            setCalledUuids([]);
            setCurrentUuid("");
            setWinnerIndex(null);
            if (data.playerCount != null) setPlayerCount(data.playerCount);
            break;
          case "error":
            setError(data.message);
            setPhase("lobby");
            break;
          default:
            break;
        }
      });

      conn.on("close", () => {
        clearTimeout(timeoutRef.current);
        setError("Disconnected from host.");
        setConnecting(false);
      });

      conn.on("error", () => {
        clearTimeout(timeoutRef.current);
        setError("Connection error.");
        setConnecting(false);
      });
    });

    peer.on("error", (err) => {
      clearTimeout(timeoutRef.current);
      setError(
        err.type === "peer-unavailable"
          ? "Room not found. Check the code and try again."
          : "Could not connect. Please try again."
      );
      setPhase("lobby");
      setConnecting(false);
    });
  };

  // leave / cleanup
  const leave = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    connsRef.current = [];
    setPhase("lobby");
    setRole(null);
    setRoomCode("");
    setJoinCode("");
    setPlayerCount(0);
    setError("");
    setConnecting(false);
    setNicknames({});
    setBoards([]);
    setCalledUuids([]);
    setCurrentUuid("");
    setWinnerIndex(null);
  };

  // render — lobby
  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center space-y-6">
        <h1 className="text-xl font-bold">UUID Bingo (multi-player)</h1>
        <p className="text-sm text-gray-500">
          Play with up to 4 players in real time
        </p>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-5 flex flex-col items-center space-y-2 w-full max-w-sm">
          <label className="text-sm font-semibold text-gray-600">Choose a nickname</label>
          <input
            type="text"
            placeholder="Enter a nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="border rounded px-3 py-2 text-center text-lg w-full"
            maxLength={20}
          />
        </div>

        <div className="bg-white rounded-lg shadow-md p-5 flex flex-col items-center space-y-4 w-full max-w-sm">
          <button
            onClick={hostGame}
            className="w-full py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition shadow"
          >
            Host a Game
          </button>

          <div className="flex items-center w-full space-x-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-sm text-gray-400">or join</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <div className="flex items-center space-x-2 w-full">
            <input
              type="text"
              placeholder="Room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinGame()}
              className="border rounded px-3 py-2 text-center tracking-widest font-mono text-lg flex-1 min-w-0"
              maxLength={6}
            />
            <button
              onClick={joinGame}
              disabled={connecting}
              className="px-5 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition shadow disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {connecting ? "Connecting…" : "Join"}
            </button>
          </div>
        </div>

        <Link
          to="/"
          className="text-sm text-blue-500 hover:underline mt-4"
        >
          ← Back to Single Player
        </Link>
      </div>
    );
  }

  // render — waiting room
  if (phase === "waiting") {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center space-y-6">
        <h1 className="text-xl font-bold">UUID Bingo (multi-player)</h1>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center space-y-4 w-full max-w-sm">
          {/* room code */}
          <div className="text-sm text-gray-500">Room Code</div>
          <div
            className="text-3xl font-mono font-bold tracking-[0.3em] text-blue-600 cursor-pointer select-all"
            onClick={() => navigator.clipboard?.writeText(roomCode)}
            title="Click to copy"
          >
            {roomCode}
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(roomCode)}
            className="text-xs text-blue-500 hover:underline"
          >
            Copy to clipboard
          </button>

          {/* player list */}
          <div className="border-t w-full pt-4">
            <div className="text-sm font-semibold mb-2">
              Players ({playerCount}/4)
            </div>
            {Array.from({ length: playerCount }, (_, i) => (
              <div
                key={i}
                className={`text-sm py-1 px-2 rounded ${
                  i === myIndex
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-gray-700"
                }`}
              >
                {nicknames[i] || `Player ${i + 1}`}
                {i === 0 ? " (Host)" : ""}
                {i === myIndex ? " — You" : ""}
              </div>
            ))}
            {playerCount < 4 && (
              <div className="text-xs text-gray-400 mt-2 italic">
                Waiting for more players to join…
              </div>
            )}
          </div>

          {/* host controls */}
          {role === "host" && (
            <>
              <div className="border-t w-full pt-4 flex flex-col items-center space-y-2">
                <label className="text-xs">
                  Speed: 1 UUID every {(intervalMs / 1000).toFixed(3)}s
                </label>
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
                  onChange={(e) => setPoolSize(Number(e.target.value))}
                  className="w-64"
                />
              </div>

              <button
                onClick={startGame}
                disabled={playerCount < 2}
                className={`w-full py-3 rounded-lg font-semibold transition shadow ${
                  playerCount >= 2
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                Start Game
              </button>
              {playerCount < 2 && (
                <div className="text-xs text-gray-400">
                  Need at least 2 players to start
                </div>
              )}
            </>
          )}

          {/* guest waiting */}
          {role === "guest" && (
            <div className="text-sm text-gray-500 italic pt-2">
              Waiting for host to start the game…
            </div>
          )}
        </div>

        <button
          onClick={leave}
          className="text-sm text-red-500 hover:underline"
        >
          Leave Game
        </button>
      </div>
    );
  }

  // render — playing
  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center space-y-4">
      <h1 className="text-xl font-bold">UUID Bingo (multi-player)</h1>

      <div className="text-xs text-gray-400">Room: {roomCode}</div>

      {winnerIndex !== null && (
        <div className="text-green-600 font-semibold">
          🎉 {getLabel(winnerIndex)} completed their board! 🎉
        </div>
      )}

      <div className="text-sm">Current UUID:</div>
      <div className="text-center font-mono text-lg break-all bg-white border p-2 rounded shadow">
        {currentUuid || "Waiting…"}
      </div>

      {/* speed control — host only */}
      {role === "host" ? (
        <div className="flex flex-col items-center space-y-2">
          <label className="text-xs">
            Speed: 1 UUID every {(intervalMs / 1000).toFixed(3)}s
          </label>
          <input
            type="range"
            min="1"
            max="10000"
            step="1"
            value={intervalMs}
            onChange={(e) => changeSpeed(Number(e.target.value))}
            className="w-64"
          />
        </div>
      ) : (
        <div className="text-xs text-gray-400">
          Speed: 1 UUID every {(intervalMs / 1000).toFixed(3)}s
          &nbsp;·&nbsp;Pool: {poolSize} UUIDs
        </div>
      )}

      {/* player boards */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {boards.map((board, i) => (
          <div
            key={i}
            className={`border p-2 rounded shadow ${
              i === myIndex
                ? "bg-blue-50 ring-2 ring-blue-300"
                : "bg-white"
            }`}
          >
            <h2 className="text-sm font-semibold mb-1">
              {getLabel(i)} {winnerIndex === i ? "🏆" : ""}
            </h2>
            <PlayerBoard uuids={board} calledUuids={calledUuids} />
          </div>
        ))}
      </div>

      {/* post-game controls */}
      <div className="flex items-center space-x-4 mt-4">
        {role === "host" && winnerIndex !== null && (
          <button
            onClick={newGame}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition shadow"
          >
            New Game
          </button>
        )}
        <button
          onClick={leave}
          className="text-sm text-red-500 hover:underline"
        >
          Leave Game
        </button>
      </div>
    </div>
  );
}
