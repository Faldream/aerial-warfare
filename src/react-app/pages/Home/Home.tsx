import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Home.css";

interface MenuItem {
  to: string;
  label: string;
  d: string;
  evenOdd?: boolean;
}

const menuItems: MenuItem[] = [
  {
    to: "/pve",
    label: "人机对战",
    d: "M3 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm4.293 5.707a1 1 0 0 1 1.414-1.414l3 3a1 1 0 0 1 0 1.414l-3 3a1 1 0 0 1-1.414-1.414L9.586 12zM13 14a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2z",
    evenOdd: true,
  },
  {
    to: "/pvp",
    label: "在线对战",
    d: "M16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2s.06-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.92 7.92 0 0 1 9.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8 8 0 0 1 5.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.7 15.7 0 0 0-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2",
  },
  {
    to: "/intro",
    label: "游戏介绍",
    d: "M10 14h4v-2h-4zm0-3h8V9h-8zm0-3h8V6h-8zM6 18V2h16v16zm-4 4V6h2v14h14v2z",
  },
];

/* —— 背景对局标记：直接绘制在斜向网格上（命中 / 未命中 / 炸弹探测 / 击毁机头） —— */
type BgState = "hit" | "miss" | "head" | "reveal";

interface BgMarker {
  left: number;
  top: number;
  s: BgState;
}

const GRID_P = 44; // 网格周期(px)，与 CSS 中 44px 保持一致
const STATE_POOL: BgState[] = ["hit", "hit", "hit", "miss", "miss", "miss", "reveal", "reveal", "head"];

const markerSymbol = (s: BgState): string => {
  switch (s) {
    case "hit":
      return "X";
    case "miss":
      return "O";
    case "head":
      return "*";
    case "reveal":
      return "◆";
  }
};

export default function Home() {
  const [markers, setMarkers] = useState<BgMarker[]>([]);

  useEffect(() => {
    const container = document.querySelector(".home-container") as HTMLElement | null;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const BOX = Math.max((200 * Math.max(window.innerWidth, window.innerHeight)) / 100, 1600);
    const half = BOX / 2;
    const s = Math.SQRT1_2;
    const ox = cw / 2;
    const oy = ch / 2;
    const arr: BgMarker[] = [];
    for (let i = 0; i < 42; i++) {
      const sx = Math.random() * cw;
      const sy = Math.random() * ch;
      const dx = sx - ox;
      const dy = sy - oy;
      const mxr = (dx + dy) * s;
      const myr = (dy - dx) * s;
      const mx = half + mxr;
      const my = half + myr;
      const col = Math.round(mx / GRID_P);
      const row = Math.round(my / GRID_P);
      arr.push({
        left: col * GRID_P + GRID_P / 2,
        top: row * GRID_P + GRID_P / 2,
        s: STATE_POOL[Math.floor(Math.random() * STATE_POOL.length)],
      });
    }
    setMarkers(arr);
  }, []);

  return (
    <div className="home-container">
      {/* 背景：正在进行中的对局（标记随机生成、与斜向网格对齐） */}
      <div className="home-battle-bg" aria-hidden="true">
        {markers.map((m, i) => (
          <span
            key={i}
            className={`bg-marker m-${m.s}`}
            style={{ left: `${m.left}px`, top: `${m.top}px` }}
          >
            {markerSymbol(m.s)}
          </span>
        ))}
      </div>

      <header className="home-hero">
        <div className="home-emblem">
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
        </div>
        <h1 className="home-title">空战棋</h1>
        <p className="home-subtitle">AERIAL WARFARE</p>
        <p className="home-desc">
          一款基于经典海战棋玩法改编的空战策略游戏。布置你的飞机编队，预判敌方布局，夺取制空权。
        </p>
      </header>

      <nav className="home-menu">
        {menuItems.map((item) => (
          <Link key={item.to} to={item.to} className="menu-btn">
            <span className="menu-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  fillRule={item.evenOdd ? "evenodd" : "nonzero"}
                  clipRule={item.evenOdd ? "evenodd" : "nonzero"}
                  d={item.d}
                />
              </svg>
            </span>
            <span className="menu-label">{item.label}</span>
            <span className="menu-arrow">→</span>
          </Link>
        ))}
      </nav>

      <footer className="home-footer">©Faldream 2026 空战棋 · Aerial Warfare</footer>
    </div>
  );
}

