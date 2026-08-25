import { Link } from "react-router-dom";
import { AIRPLANE_TYPES, type ShipTypeName } from "../../../shared/pvpGame";
import "./Introduction.css";

/* —— 飞机形状网格 —— */
type ShapeCell = "" | "ship" | "head";

function buildShapeGrid(type: ShipTypeName): { grid: ShapeCell[][]; rows: number; cols: number } {
  const t = AIRPLANE_TYPES[type];
  const head = t.head;
  const rs = t.shape.map((p) => p[0]);
  const cs = t.shape.map((p) => p[1]);
  const minR = Math.min(...rs);
  const maxR = Math.max(...rs);
  const minC = Math.min(...cs);
  const maxC = Math.max(...cs);
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const grid: ShapeCell[][] = Array.from({ length: rows }, () => Array(cols).fill("") as ShapeCell[]);
  for (const [x, y] of t.shape) {
    grid[x - minR][y - minC] = x === head[0] && y === head[1] ? "head" : "ship";
  }
  return { grid, rows, cols };
}

const PLANES: { key: ShipTypeName; name: string; desc: string; note: string }[] = [
  { key: "large", name: "大飞机", desc: "体型更大、更占地方，但也更难被锁定。", note: "击毁整机" },
  { key: "small", name: "小飞机", desc: "更小巧灵活，便于在棋盘边缘布阵。", note: "击毁整机" },
  { key: "cross", name: "十字飞机", desc: "只能被命中、无法被击毁，用于干扰对手推理。", note: "干扰" },
];

/* —— 玩法演示棋盘（命中 / 未命中 / 炸弹探测 / 击毁机头） —— */
type DemoCell = "" | "hit" | "miss" | "head" | "reveal";

const demoBoard: DemoCell[][] = [
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "miss", "", "", ""],
  ["", "hit", "hit", "head", "", "", "", ""],
  ["", "hit", "miss", "", "", "", "", ""],
  ["", "hit", "", "", "", "", "", ""],
  ["", "", "", "", "reveal", "hit", "", ""],
  ["", "", "", "", "hit", "hit", "", ""],
  ["", "", "", "", "head", "", "", ""],
];

const demoContent = (c: DemoCell): string =>
  c === "hit" ? "X" : c === "miss" ? "O" : c === "head" ? "*" : c === "reveal" ? "◆" : "";

const rules = [
  { step: "01", title: "布置飞机", desc: "设置大飞机与小飞机数量，使用随机布置或手动布置你的飞机编队。" },
  { step: "02", title: "选择先手", desc: "决定谁先行动：玩家先手或敌方先手，抢占先机。" },
  { step: "03", title: "轮番攻击", desc: "点击敌方棋盘进行攻击。命中可继续攻击，未命中则轮到对方。" },
  { step: "04", title: "击毁机头", desc: "击中飞机头部（*）即可击毁整架飞机。击毁对方所有机头即可获胜。" },
];

const JET_SVG = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="256"
    height="256"
    viewBox="0 0 48 48"
    role="img"
    aria-label="空战棋"
  >
    <path
      fill="currentColor"
      d="m11.806 14.129l-3.484 3.484c-1.16 1.161-2.322 0-1.16-1.162l9.29-9.29c1.16-1.161 2.322 0 1.16 1.161l-3.483 3.484s2.323 0 4.645 2.323l2.323 2.323l9.037-9.038a2 2 0 0 1 2.828 0l1.151 1.15a2 2 0 0 1 .453 2.133l-5.34 13.884l6.968 9.29l4.03-2.015a.954.954 0 0 1 1.101 1.529l-7.94 7.94a.954.954 0 0 1-1.53-1.102l2.016-4.03l-9.29-6.967l-13.884 5.34a2 2 0 0 1-2.132-.453l-1.15-1.15a2 2 0 0 1 0-2.829l9.036-9.037l-2.322-2.323c-2.323-2.323-2.323-4.645-2.323-4.645"
    />
  </svg>
);

export default function Introduction() {
  return (
    <div className="intro-page">
      <div className="intro-inner">
      <header className="intro-header">
        <div className="intro-emblem">{JET_SVG}</div>
        <h1>游戏介绍</h1>
        <p className="intro-subtitle">《空战棋》玩法一览 · 看懂飞机形状与对战</p>
      </header>

      {/* 飞机形状 */}
      <section className="intro-section">
        <h2 className="intro-section-title">✈️ 飞机形状</h2>
        <p className="intro-section-desc">
          在 11 × 11 的棋盘上布置飞机，每种飞机的形状与命中规则不同。红色格为机头（*），命中机头即击毁整机。
        </p>
        <div className="plane-cards">
          {PLANES.map((p) => {
            const { grid, cols } = buildShapeGrid(p.key);
            return (
              <div key={p.key} className="plane-card">
                <div
                  className="shape-grid"
                  style={{ gridTemplateColumns: `repeat(${cols}, var(--cell))` }}
                >
                  {grid.flatMap((row, r) =>
                    row.map((cell, c) => (
                      <div
                        key={`${r}-${c}`}
                        className={`shape-cell ${cell}`}
                      >
                        {cell === "head" ? "*" : ""}
                      </div>
                    )),
                  )}
                </div>
                <div className="plane-card-info">
                  <h3>{p.name}</h3>
                  <p>{p.desc}</p>
                  <span className={`plane-note ${p.key === "cross" ? "decoy" : ""}`}>{p.note}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 对战玩法演示 */}
      <section className="intro-section">
        <h2 className="intro-section-title">🎯 对战玩法</h2>
        <div className="gameplay">
          <div className="demo-board">
            <div className="demo-title">敌方棋盘 · 对战演示</div>
            <div
              className="demo-grid"
              style={{ gridTemplateColumns: `repeat(8, var(--cell))` }}
            >
              {demoBoard.flatMap((row, r) =>
                row.map((cell, c) => (
                  <div key={`${r}-${c}`} className={`demo-cell ${cell}`}>
                    {demoContent(cell)}
                  </div>
                )),
              )}
            </div>
            <div className="demo-legend">
              <span className="lg"><i className="chip chip-hit" />命中 X</span>
              <span className="lg"><i className="chip chip-miss" />未命中 O</span>
              <span className="lg"><i className="chip chip-reveal" />炸弹探测 ◆</span>
              <span className="lg"><i className="chip chip-head" />击毁机头 *</span>
            </div>
          </div>
          <div className="gameplay-text">
            <ul>
              <li><b>命中</b>：命中飞机任意部位标 <mark>X</mark>，可继续攻击。</li>
              <li><b>未命中</b>：标 <mark>O</mark>，回合交给对方。</li>
              <li><b>炸弹探测</b>：命中有飞机的格子时，揭示以该格为中心的 <mark>3×3</mark> 区域。</li>
              <li><b>击毁机头</b>：命中飞机头部 <mark>*</mark>，整架飞机被击毁。</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 游戏流程 */}
      <section className="intro-section">
        <h2 className="intro-section-title">📝 游戏流程</h2>
        <div className="intro-rules">
          {rules.map((rule) => (
            <div key={rule.step} className="intro-rule">
              <div className="intro-rule-step">{rule.step}</div>
              <div className="intro-rule-body">
                <h3>{rule.title}</h3>
                <p>{rule.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="intro-tips">
        <h2>💡 小贴士</h2>
        <ul>
          <li>棋盘为 11 × 11 网格，行列分别用字母 A-K 和数字 1-11 表示。</li>
          <li>大飞机体型更大，小飞机更灵活；两者布局都会影响战斗走向。</li>
          <li>善用敌方 AI 调试信息可观察 AI 的决策逻辑。</li>
        </ul>
      </div>

      <Link to="/" className="intro-back">
        返回主页
      </Link>
      </div>
    </div>
  );
}
