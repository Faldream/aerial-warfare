import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AIRPLANE_TYPES,
  COLS,
  ROWS,
  buildBoardFromPlacements,
  canPlaceShip,
  countPlacementType,
  type Board,
  type PlayerView,
  type ShipPlacement,
  type ShipTypeName,
} from "../../../shared/pvpGame";
import "./PVP.css";

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getJSON(url: string) {
  const res = await fetch(url);
  return res.json();
}

export default function PVP() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [inGame, setInGame] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem("pvp_name") || "");
  const [joinRoom, setJoinRoom] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bombMode, setBombMode] = useState(false);
  const [placements, setPlacements] = useState<ShipPlacement[]>([]);
  const [currentType, setCurrentType] = useState<ShipTypeName>("large");
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const [turnToast, setTurnToast] = useState("");
  const prevTurn = useRef<string | null>(null);

  // 从 URL ?room= 恢复会话
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      const stored = localStorage.getItem(`pvp_room_${room}`);
      if (stored) {
        setRoomId(room);
        setPlayerId(stored);
        setInGame(true);
      } else {
        setJoinRoom(room);
      }
    }
  }, []);

  // 进入房间后轮询服务器状态
  useEffect(() => {
    if (!inGame || !roomId || !playerId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getJSON(
          `/api/pvp/rooms/${roomId}/state?player=${encodeURIComponent(playerId)}`,
        );
        if (cancelled) return;
        if (data.ok) setView(data.view);
      } catch {
        /* 忽略瞬时网络错误 */
      }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [inGame, roomId, playerId]);

  // 回合切换提示
  useEffect(() => {
    if (!view || !view.gameStarted) {
      prevTurn.current = null;
      return;
    }
    const turn = view.currentTurn ?? null;
    const changed = prevTurn.current !== null && prevTurn.current !== turn;
    prevTurn.current = turn;
    if (changed && turn === view.side) {
      setTurnToast("⚔️ 轮到你了！");
      const id = setTimeout(() => setTurnToast(""), 1500);
      return () => clearTimeout(id);
    }
  }, [view]);

  const createRoom = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await postJSON("/api/pvp/rooms", { name });
      if (!data.ok) {
        setError(data.error || "创建房间失败");
        return;
      }
      localStorage.setItem(`pvp_room_${data.roomId}`, data.playerId);
      localStorage.setItem("pvp_name", name);
      setRoomId(data.roomId);
      setPlayerId(data.playerId);
      setView(data.view);
      setInGame(true);
      window.history.replaceState(null, "", `/pvp?room=${data.roomId}`);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const joinRoomFn = async () => {
    const room = joinRoom.trim().toUpperCase();
    if (!room) {
      setError("请输入房间号");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await postJSON(`/api/pvp/rooms/${room}/join`, { name });
      if (!data.ok) {
        setError(data.error || "加入失败");
        return;
      }
      localStorage.setItem(`pvp_room_${room}`, data.playerId);
      localStorage.setItem("pvp_name", name);
      setRoomId(room);
      setPlayerId(data.playerId);
      setView(data.view);
      setInGame(true);
      window.history.replaceState(null, "", `/pvp?room=${room}`);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (path: string, extra: Record<string, unknown> = {}) => {
    try {
      const data = await postJSON(`/api/pvp/rooms/${roomId}${path}`, {
        player: playerId,
        ...extra,
      });
      if (data.ok) setView(data.view);
      else setError(data.error || "操作失败");
    } catch {
      setError("网络错误");
    }
  };

  const doRandom = async () => {
    setPlacements([]);
    await runAction("/random");
  };
  const doPlace = async () => {
    await runAction("/place", { ships: placements });
  };
  const doReady = async () => {
    await runAction("/ready");
  };
  const doAttack = async (r: number, c: number) => {
    await runAction("/attack", { row: r, col: c });
  };
  const doBomb = async (r: number, c: number) => {
    await runAction("/bomb", { row: r, col: c });
    setBombMode(false);
  };
  const doReset = async () => {
    setPlacements([]);
    setBombMode(false);
    await runAction("/reset");
  };

  const handlePlaceCell = (r: number, c: number) => {
    if (!view || view.gameStarted || view.yourPlaced) return;
    const board = buildBoardFromPlacements(placements);
    if (!canPlaceShip(board, currentType, r, c, rotation)) {
      setError("无法放置：位置冲突或越界");
      return;
    }
    const cfg = view.config;
    const max = currentType === "large" ? cfg.large : currentType === "small" ? cfg.small : cfg.cross;
    if (countPlacementType(placements, currentType) >= max) {
      setError("该机型数量已达上限");
      return;
    }
    setPlacements((p) => [...p, { type: currentType, row: r, col: c, rotation }]);
    setError("");
  };

  const handleBattleCell = (r: number, c: number) => {
    if (!view || view.gameOver) return;
    if (view.currentTurn !== view.side) {
      setError("还没轮到你");
      return;
    }
    // 已命中/未命中/击毁格不可再点；炸弹揭示的 R 格可被攻击（但炸弹不能再打它）
    const cellVal = view.enemyBoard[r][c];
    if (cellVal === "X" || cellVal === "O" || cellVal === "*") {
      setError("");
      return;
    }
    if (bombMode && cellVal === "R") {
      setError("");
      return;
    }
    setError("");
    if (bombMode) {
      if (view.yourBombs <= 0) {
        setError("炸弹已用完");
        setBombMode(false);
        return;
      }
      doBomb(r, c);
    } else {
      doAttack(r, c);
    }
  };

  const renderGrid = (
    board: Board,
    hideShips: boolean,
    onCell?: (r: number, c: number) => void,
    onlyEmpty = false,
  ) => {
    return (
      <table className="board">
        <thead>
          <tr>
            <td className="header-cell" />
            {COLS.map((col) => (
              <td key={col} className="header-cell">
                {col}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.map((rowArr, i) => (
            <tr key={i}>
              <td className="header-cell">{ROWS[i]}</td>
              {rowArr.map((val, j) => {
                const cls = ["cell"];
                let content = "";
                if (val === "ship" && !hideShips) {
                  cls.push("ship");
                } else if (val === "head" && !hideShips) {
                  cls.push("head");
                  content = "*";
                } else if (val === "X") {
                  cls.push("hit");
                  content = "X";
                } else if (val === "O") {
                  cls.push("miss");
                  content = "O";
                } else if (val === "*") {
                  cls.push("hit");
                  content = "*";
                } else if (val === "R") {
                  cls.push("reveal");
                  content = "◆";
                }
                const clickable =
                  onCell !== undefined && (!onlyEmpty || val === "" || val === "R");
                if (clickable) cls.push("clickable");
                const onClick = clickable ? () => onCell!(i, j) : undefined;
                return (
                  <td key={j} className={cls.join(" ")} onClick={onClick}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const inviteLink = `${window.location.origin}/pvp?room=${roomId}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 忽略剪贴板失败 */
    }
  };

  const isYourTurn = !!view && view.gameStarted && !view.gameOver && view.currentTurn === view.side;

  return (
    <div className="pvp-page">
      <header className="pvp-header">
        <div className="top-bar">
          <h1>空战棋 · 在线对战</h1>
          {inGame ? (
            <button
              className="back-btn"
              onClick={() => {
                setInGame(false);
                window.history.replaceState(null, "", "/pvp");
              }}
            >
              退出房间
            </button>
          ) : (
            <Link to="/" className="back-btn">
              返回主页
            </Link>
          )}
        </div>
        {inGame && view && !(view.gameStarted && !view.gameOver) && (
          <div className="status">
            {view.gameOver ? "游戏结束" : "布置阶段"}
          </div>
        )}
      </header>

      {/* 大厅：创建 / 加入 */}
      {!inGame && (
        <div className="lobby-card">
          <div className="lobby-icon">🛰️</div>
          <h2>加入在线对战</h2>
          <p className="lobby-desc">
            创建房间并分享房间号邀请好友，或输入房间号加入好友的棋局。
          </p>

          <div className="field">
            <label>昵称</label>
            <input
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入你的昵称"
              maxLength={12}
            />
          </div>

          <button className="primary-btn" disabled={loading} onClick={createRoom}>
            {loading ? "处理中…" : "创建房间"}
          </button>

          <div className="divider">
            <span>或</span>
          </div>

          <div className="field">
            <label>房间号</label>
            <input
              className="text-input"
              value={joinRoom}
              onChange={(e) => setJoinRoom(e.target.value.toUpperCase())}
              placeholder="例如 AB12CD"
              maxLength={6}
            />
          </div>
          <button className="secondary-btn" disabled={loading} onClick={joinRoomFn}>
            加入房间
          </button>

          {error && <div className="error-msg">{error}</div>}

          <Link to="/" className="pvp-back">
            返回主页
          </Link>
        </div>
      )}

      {/* 房间内 */}
      {inGame && view && (
        <div className="room-wrap">
          <div className="room-info">
            <span className="room-label">房间号</span>
            <span className="room-code">{view.roomId}</span>
            <button className="copy-btn" onClick={copyInvite}>
              {copied ? "已复制" : "复制邀请链接"}
            </button>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {/* 布置阶段 */}
          {!view.gameStarted && (
            <div className="setup-panel">
              <div className="setup-status">
                <span className={view.yourPlaced ? "ok" : ""}>
                  {view.yourName}：{view.yourReady ? "已准备" : view.yourPlaced ? "已布置，请准备" : "布置中"}
                </span>
                <span className={view.opponentReady ? "ok" : ""}>
                  {view.opponentName}：{view.opponentReady ? "已准备" : view.opponentPlaced ? "已布置" : "布置中"}
                </span>
              </div>

              <div className="config-line">
                编队：大飞机 ×{view.config.large} · 小飞机 ×{view.config.small} · 十字飞机 ×
                {view.config.cross}
              </div>

              {!view.yourPlaced && (
                <>
                  <div className="placement-controls">
                    <div className="rotation-controls">
                      {(Object.keys(AIRPLANE_TYPES) as ShipTypeName[]).map((t) => (
                        <button
                          key={t}
                          className={currentType === t ? "type-active" : ""}
                          onClick={() => setCurrentType(t)}
                        >
                          {AIRPLANE_TYPES[t].name}
                        </button>
                      ))}
                      <button onClick={() => setRotation((r) => (r + 1) % 4)}>
                        旋转 {rotation * 90}°
                      </button>
                    </div>
                    <div className="ship-info">
                      已放 {countPlacementType(placements, "large")}/{view.config.large} 大 ·{" "}
                      {countPlacementType(placements, "small")}/{view.config.small} 小 ·{" "}
                      {countPlacementType(placements, "cross")}/{view.config.cross} 十
                    </div>
                    <div className="placement-actions">
                      <button onClick={doRandom}>随机布置</button>
                      <button onClick={() => setPlacements([])}>清空</button>
                      <button className="primary-btn" onClick={doPlace}>
                        提交布置
                      </button>
                    </div>
                  </div>
                  <div className="board-note">点击下方棋盘放置 {AIRPLANE_TYPES[currentType].name}</div>
                </>
              )}

              {view.yourPlaced && !view.yourReady && (
                <div className="ready-bar">
                  <button className="primary-btn" onClick={doReady}>
                    我已布置好，准备战斗
                  </button>
                  <button onClick={() => doReset()}>重新布置</button>
                </div>
              )}

              <div className="board-container setup-board">
                <div className="header">我的棋盘</div>
                {renderGrid(
                  view.yourPlaced ? view.yourBoard : buildBoardFromPlacements(placements),
                  false,
                  view.yourPlaced ? undefined : handlePlaceCell,
                  true,
                )}
              </div>
            </div>
          )}

          {/* 战斗阶段 */}
          {view.gameStarted && (
            <div className="battle-panel">
              <div className={`turn-banner ${isYourTurn ? "your-turn" : "opponent-turn"}`}>
                {isYourTurn ? "你的回合 · 点击敌方棋盘攻击" : `等待 ${view.opponentName} 行动…`}
              </div>
              <div className="battle-info">
                <div className="info-item">
                  <span className="info-label">回合</span>
                  <span className="info-value">
                    {view.currentTurn === view.side ? "你" : view.opponentName}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">你摧毁</span>
                  <span className="info-value">
                    {view.enemyShipsDestroyed}/{view.enemyShipsTotal}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">炸弹</span>
                  <span className="info-value">你 {view.yourBombs} · 敌 {view.enemyBombs}</span>
                </div>
              </div>

              {bombMode && (
                <div className="battle-note">炸弹瞄准中：点击敌方棋盘使用炸弹</div>
              )}

              <div className="game-container">
                <div className="board-container">
                  <div className="header">我的棋盘</div>
                  {renderGrid(view.yourBoard, false)}
                  <div className="board-note">对方命中你的飞机时会显示在这里</div>
                </div>

                <div className={`board-container board-enemy ${isYourTurn ? "active" : "inactive"}`}>
                  <div className="board-enemy-head">
                    <div className="header">敌方棋盘</div>
                    <button
                      className={bombMode ? "bomb-btn bomb-active" : "bomb-btn"}
                      disabled={view.yourBombs <= 0 || view.currentTurn !== view.side}
                      onClick={() => setBombMode((b) => !b)}
                    >
                      {bombMode ? "取消炸弹" : `炸弹 (${view.yourBombs})`}
                    </button>
                  </div>
                  {renderGrid(view.enemyBoard, true, handleBattleCell, true)}
                </div>
              </div>
            </div>
          )}

          {/* 结束 */}
          {view.gameOver && (
            <div className="game-over">
              <div className="game-over-title">
                {view.winner === view.side ? "🎉 你赢了！" : "😵 你输了"}
              </div>
              <p>{view.status}</p>
              <div className="game-over-actions">
                <button className="primary-btn" onClick={doReset}>
                  再来一局
                </button>
                <button
                  className="back-btn"
                  onClick={() => {
                    setInGame(false);
                    window.history.replaceState(null, "", "/pvp");
                  }}
                >
                  退出
                </button>
              </div>
            </div>
          )}

          <div className="legend">
            <div className="legend-item">
              <div className="legend-color hit" />
              <span>命中</span>
            </div>
            <div className="legend-item">
              <div className="legend-color miss" />
              <span>未命中</span>
            </div>
            <div className="legend-item">
              <div className="legend-color reveal" />
              <span>炸弹揭示</span>
            </div>
          </div>
        </div>
      )}

      {inGame && !view && <div className="loading">正在连接服务器…</div>}

      {turnToast && <div className="turn-toast">{turnToast}</div>}
    </div>
  );
}

