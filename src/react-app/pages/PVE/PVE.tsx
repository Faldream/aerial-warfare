import { useState } from "react";
import { Link } from "react-router-dom";
import { AIRPLANE_TYPES, AirWarGame, COLS, ROWS } from "./gameEngine";
import "./PVE.css";

interface PVEProps {
  onBack?: () => void;
}

export default function PVE({ onBack }: PVEProps) {
  const [, setTick] = useState(0);
  const [bombMode, setBombMode] = useState(false);
  const [game] = useState(
    () => new AirWarGame(() => setTick((t) => (t + 1) % 1000000)),
  );
  const s = game.state;

  const renderBoard = (board: typeof s.playerBoard, isEnemy: boolean, hideShips: boolean) => {
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
                const cellClass = ["cell"];
                let content = "";
                if (val === "ship" && !hideShips) {
                  cellClass.push("ship");
                } else if (val === "head" && !hideShips) {
                  cellClass.push("head");
                  content = "*";
                } else if (val === "X") {
                  cellClass.push("hit");
                  content = "X";
                } else if (val === "O") {
                  cellClass.push("miss");
                  content = "O";
                } else if (val === "*") {
                  cellClass.push("hit");
                  content = "*";
                } else if (val === "R") {
                  cellClass.push("reveal");
                  content = "◆";
                }
                const onClick = () => {
                  if (isEnemy) {
                    if (bombMode) {
                      game.usePlayerBomb(i, j);
                      setBombMode(false);
                    } else {
                      game.handlePlayerAttack(i, j);
                    }
                  } else if (s.manualPlacementMode && !s.gameStarted) game.handleManualPlacement(i, j);
                };
                return (
                  <td key={j} className={cellClass.join(" ")} onClick={onClick}>
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

  const renderProbabilityMap = (map: number[][] | null) => {
    if (!map) return null;
    const flat = map.flat();
    const maxProb = flat.length ? Math.max(...flat) : 0;
    const safeMax = maxProb || 1;
    return (
      <div className="probability-map">
        {map.map((rowArr, r) => (
          <div key={r} className="probability-row">
            {rowArr.map((prob, c) => {
              const intensity = maxProb > 0 ? Math.floor((prob / safeMax) * 255) : 30;
              return (
                <div
                  key={c}
                  className="probability-cell"
                  style={{ backgroundColor: `rgb(${intensity}, 100, 100)` }}
                  title={`(${ROWS[r]}${COLS[c]}): ${prob.toFixed(2)}`}
                >
                  <div className="probability-value">{maxProb > 0 && prob > 0 ? Math.round(prob).toString() : ""}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container">
      <header className="pve-header">
        <div className="top-bar">
          <h1>空战棋</h1>
          {onBack ? (
            <button className="back-btn" onClick={onBack}>
              返回主页
            </button>
          ) : (
            <Link to="/" className="back-btn">
              返回主页
            </Link>
          )}
        </div>
        <div className="status" id="status">
          {s.status}
        </div>
      </header>

      <div className="game-phase">
        <div className={`phase-indicator ${!s.gameStarted ? "active" : ""}`}>布置阶段</div>
        <div className={`phase-indicator ${s.gameStarted ? "active" : ""}`}>战斗阶段</div>
      </div>

      <div className="controls">
        <button onClick={() => game.setupGame()}>开始游戏</button>
        <button onClick={() => game.resetGame()}>重置游戏</button>
        <button onClick={() => game.placeRandomShipsForPlayer()}>玩家随机布置</button>
        <button onClick={() => game.placeRandomShipsForEnemy()}>敌方随机布置</button>
        <button onClick={() => game.toggleManualPlacement()}>
          {s.manualPlacementMode ? "退出手动布置" : "手动布置"}
        </button>
        <button onClick={() => game.toggleEnemyLayout()}>{s.showEnemyLayout ? "隐藏敌方布局" : "显示敌方布局"}</button>
        <button onClick={() => game.toggleAIDebug()}>{s.showAIDebug ? "隐藏AI调试" : "AI调试信息"}</button>
      </div>

      <div className="settings-card">
        <span className="settings-title">游戏设置</span>
        <div className="first-move-item">
          <label htmlFor="first-move">先手</label>
          <select
            id="first-move"
            value={s.firstMove}
            disabled={s.gameStarted}
            onChange={(e) => game.setFirstMove(e.target.value as "player" | "enemy")}
          >
            <option value="player">玩家先手</option>
            <option value="enemy">敌方先手</option>
          </select>
        </div>
        <div className="ship-config-item">
          <label htmlFor="large-ship-count">大飞机</label>
          <input
            type="number"
            id="large-ship-count"
            min={0}
            max={5}
            value={s.largeShipCount}
            disabled={s.gameStarted}
            onChange={(e) => game.setLargeShipCount(parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="ship-config-item">
          <label htmlFor="small-ship-count">小飞机</label>
          <input
            type="number"
            id="small-ship-count"
            min={0}
            max={5}
            value={s.smallShipCount}
            disabled={s.gameStarted}
            onChange={(e) => game.setSmallShipCount(parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="ship-config-item">
          <label htmlFor="cross-ship-count" title="十字飞机只能被命中，无法击毁，用于干扰推理">
            十字飞机
          </label>
          <input
            type="number"
            id="cross-ship-count"
            min={0}
            max={5}
            value={s.crossShipCount}
            disabled={s.gameStarted}
            onChange={(e) => game.setCrossShipCount(parseInt(e.target.value) || 0)}
          />
        </div>
        <button onClick={() => game.applyShipConfig()}>应用</button>
      </div>

      {s.manualPlacementMode && (
        <div className="placement-controls" id="placement-controls">
          <div className="rotation-controls">
            <button onClick={() => game.rotateCurrentShip()}>旋转飞机 (当前: {s.currentRotation * 90}°)</button>
            <button onClick={() => game.changeShipType("large")}>选择大飞机</button>
            <button onClick={() => game.changeShipType("small")}>选择小飞机</button>
            <button onClick={() => game.changeShipType("cross")}>选择十字飞机</button>
          </div>
          <div className="ship-info">
            当前选择: {AIRPLANE_TYPES[s.currentShipType].name} | 剩余大飞机:{" "}
            {Math.max(0, s.largeShipCount - s.largeShipsPlaced)} | 剩余小飞机:{" "}
            {Math.max(0, s.smallShipCount - s.smallShipsPlaced)} | 剩余十字飞机:{" "}
            {Math.max(0, s.crossShipCount - s.crossShipsPlaced)}
          </div>
        </div>
      )}

      <div className="game-info">
        <div className="info-panel">
          <h3>玩家舰队</h3>
          <div>
            大:{s.largeShipCount} 小:{s.smallShipCount} 十:{s.crossShipCount}
          </div>
          <div>已摧毁: {s.playerShips.filter((sh) => !sh.isDecoy && sh.destroyed).length}</div>
          <div>炸弹: {s.playerBombs}</div>
        </div>
        <div className="info-panel">
          <h3>敌方舰队</h3>
          <div>
            大:{s.largeShipCount} 小:{s.smallShipCount} 十:{s.crossShipCount}
          </div>
          <div>已摧毁: {s.enemyShips.filter((sh) => !sh.isDecoy && sh.destroyed).length}</div>
          <div>炸弹: {s.enemyBombs}</div>
        </div>
        <div className="info-panel">
          <h3>游戏状态</h3>
          <div>当前回合: {s.currentTurn === "player" ? "玩家" : "敌方"}</div>
          <div>
            玩家命中: {s.enemyBoard.flat().filter((c) => c === "X" || c === "*").length}, 敌方命中:{" "}
            {s.playerBoard.flat().filter((c) => c === "X" || c === "*").length}
          </div>
        </div>
      </div>

      <div className="game-container">
        <div className="board-container">
          <div className="header">玩家棋盘</div>
          {renderBoard(s.playerBoard, false, false)}
          <div className="board-note">（玩家被敌方攻击时，结果会显示在这里）</div>
        </div>

        <div className="board-container board-enemy">
          <div className="board-enemy-head">
            <div className="header">敌方棋盘</div>
            <button
              className={bombMode ? "bomb-btn bomb-active" : "bomb-btn"}
              disabled={s.playerBombs <= 0 || !s.gameStarted || s.currentTurn !== "player"}
              onClick={() => setBombMode((b) => !b)}
              title="大型炸弹：命中飞机则揭示 3x3 区域"
            >
              {bombMode ? "取消炸弹瞄准" : `使用炸弹 (${s.playerBombs})`}
            </button>
          </div>
          {renderBoard(s.enemyBoard, true, !s.showEnemyLayout)}
          <div className="board-note">
            {bombMode
              ? `炸弹瞄准中：点击上方棋盘使用炸弹（剩余 ${s.playerBombs} 枚）`
              : "（点击此棋盘进行攻击；敌方飞机对玩家隐藏）"}
          </div>
        </div>
      </div>

      {s.showAIDebug && (
        <div className="ai-debug" id="ai-debug">
          <h3>AI决策信息</h3>
          <div className="ai-debug-content">
            <div>
              <strong>状态:</strong> {s.aiState.huntingMode ? "追击模式" : "搜索模式"}, 方向:{" "}
              {s.aiState.inferredDirection || "未知"}
            </div>
            <div>
              <strong>命中点:</strong>{" "}
              {s.aiState.confirmedHits.map((hit) => `(${ROWS[hit[0]]}${COLS[hit[1]]})`).join(", ")}
            </div>
            <div>
              <strong>队列长度:</strong> {s.enemyTargetQueue.length}
            </div>
            <div>
              <strong>推断飞机:</strong> {s.aiState.inferredShips.length}
            </div>
            <div>
              <strong>方向置信度:</strong> {s.aiState.directionConfidence.toFixed(2)}
            </div>
            <div>
              <strong>剩余飞机:</strong> 大={s.aiState.remainingShipTypes.large}, 小={s.aiState.remainingShipTypes.small}
            </div>
          </div>
          <button onClick={() => game.toggleProbabilityMap()}>
            {s.showProbabilityMap ? "隐藏概率图" : "刷新概率图"}
          </button>
          {s.showProbabilityMap && (
            <>
              <div className="probability-title">概率图 (红色越深表示概率越高)</div>
              {renderProbabilityMap(s.aiState.probabilityMap)}
              <div className="probability-title">头部概率图 (红色越深表示头部概率越高)</div>
              {renderProbabilityMap(s.aiState.headProbabilityMap)}
            </>
          )}
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
          <div className="legend-color ship" />
          <span>飞机（仅显示于玩家棋盘布置阶段）</span>
        </div>
        <div className="legend-item">
          <div className="legend-color head" />
          <span>飞机头部（仅显示于玩家棋盘布置阶段）</span>
        </div>
        <div className="legend-item">
          <div className="legend-color reveal" />
          <span>炸弹揭示的飞机格子</span>
        </div>
      </div>

      <details className="instructions">
        <summary>游戏说明</summary>
        <p>1. 设置大飞机、小飞机、十字飞机数量，点击"应用"；</p>
        <p>2. 可使用"玩家随机布置"或手动布置飞机；点击"敌方随机布置"会为敌方生成位置（也会在开始游戏时自动布置）；</p>
        <p>3. 选择先手设置，点击"开始游戏"开始对战；</p>
        <p>4. 回合制：命中敌方飞机可继续攻击，未命中则轮到对方；</p>
        <p>5. 击中真实飞机的头部（*）即击毁该机；击毁对方所有真实飞机的机头获胜；</p>
        <p>6. <strong>十字飞机</strong> 只能被命中、无法被击毁，用于干扰判断与增加推理难度；</p>
        <p>7. <strong>大型炸弹</strong> 双方各 3 枚，点击"使用炸弹"后瞄准敌方棋盘。若命中有飞机的格子，则以命中点为中心揭示 3x3 区域内被命中的格子；若未命中则轮到对方回合。</p>
      </details>
    </div>
  );
}
