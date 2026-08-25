/* ========================== 空战棋 共享对战逻辑 ========================== */
/* 该模块被 前端客户端 与 Cloudflare Worker(后端) 共同引用，保证规则一致。 */

export const SIZE = 11;
export const ROWS = "ABCDEFGHIJK";
export const COLS = Array.from({ length: SIZE }, (_, i) => (i + 1).toString());

export const BOMBS_PER_SIDE = 3;

export type CellValue = "" | "ship" | "head" | "X" | "O" | "*" | "R";
export type Board = CellValue[][];

export type ShipTypeName = "small" | "large" | "cross";
export type Side = "p1" | "p2";

export interface AirplaneType {
  name: string;
  shape: number[][];
  head: number[];
  size: number;
  width: number;
  canDestroy: boolean;
}

export const AIRPLANE_TYPES: Record<ShipTypeName, AirplaneType> = {
  small: {
    name: "小飞机",
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    head: [0, 1],
    size: 3,
    width: 3,
    canDestroy: true,
  },
  large: {
    name: "大飞机",
    shape: [
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [3, 0],
      [3, 1],
      [3, 2],
    ],
    head: [0, 1],
    size: 4,
    width: 5,
    canDestroy: true,
  },
  cross: {
    name: "十字飞机",
    shape: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 1],
    ],
    head: [1, 1],
    size: 3,
    width: 3,
    canDestroy: false,
  },
};

export interface Ship {
  type: ShipTypeName;
  row: number;
  col: number;
  rotation: number;
  head: [number, number];
  destroyed: boolean;
  isDecoy: boolean;
  discovered: boolean;
  shape: number[][];
}

/** 客户端提交的布置项（不含服务端推导状态） */
export interface ShipPlacement {
  type: ShipTypeName;
  row: number;
  col: number;
  rotation: number;
}

export interface PVPConfig {
  large: number;
  small: number;
  cross: number;
}

/* ---------- 纯工具函数 ---------- */

export function createEmptyBoard(): Board {
  return Array(SIZE)
    .fill(null)
    .map(() => Array(SIZE).fill("") as CellValue[]);
}

const ROTATE_CACHE = new Map<string, number[][]>();

export function rotateShape(shape: number[][], times = 0): number[][] {
  const t = ((times % 4) + 4) % 4;
  const key = shape.map((p) => p.join(",")).join(";") + "|" + t;
  const cached = ROTATE_CACHE.get(key);
  if (cached) return cached.map((p) => [...p]);
  const rotated: number[][] = [];
  for (const [x, y] of shape) {
    let nx: number, ny: number;
    switch (t) {
      case 1:
        nx = -y;
        ny = x;
        break;
      case 2:
        nx = -x;
        ny = -y;
        break;
      case 3:
        nx = y;
        ny = -x;
        break;
      default:
        nx = x;
        ny = y;
    }
    rotated.push([nx, ny]);
  }
  const copy = rotated.map((p) => [...p]);
  ROTATE_CACHE.set(key, copy);
  return copy.map((p) => [...p]);
}

export function getShape(type: ShipTypeName, rotation = 0): number[][] {
  return rotateShape(AIRPLANE_TYPES[type].shape, rotation);
}

export function canPlaceShip(
  board: Board,
  type: ShipTypeName,
  row: number,
  col: number,
  rotation = 0,
): boolean {
  const shape = getShape(type, rotation);
  for (const [dx, dy] of shape) {
    const r = row + dx;
    const c = col + dy;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
    if (board[r][c] === "ship" || board[r][c] === "head") return false;
  }
  return true;
}

export function addShip(
  board: Board,
  ships: Ship[],
  type: ShipTypeName,
  row: number,
  col: number,
  rotation = 0,
): Ship {
  const shape = getShape(type, rotation);
  const headRel = rotateShape([AIRPLANE_TYPES[type].head], rotation)[0];
  for (const [dx, dy] of shape) {
    const r = row + dx;
    const c = col + dy;
    if (r === row + headRel[0] && c === col + headRel[1]) board[r][c] = "head";
    else board[r][c] = "ship";
  }
  const ship: Ship = {
    type,
    row,
    col,
    rotation,
    head: [row + headRel[0], col + headRel[1]],
    destroyed: false,
    isDecoy: !AIRPLANE_TYPES[type].canDestroy,
    discovered: false,
    shape,
  };
  ships.push(ship);
  return ship;
}

/** 用一组布置填充棋盘；全部合法则提交，否则返回 false 不改变现况。 */
export function placePlacements(
  board: Board,
  ships: Ship[],
  placements: ShipPlacement[],
): boolean {
  const nb = createEmptyBoard();
  const ns: Ship[] = [];
  for (const p of placements) {
    if (!canPlaceShip(nb, p.type, p.row, p.col, p.rotation)) return false;
    addShip(nb, ns, p.type, p.row, p.col, p.rotation);
  }
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++) board[i][j] = nb[i][j];
  ships.length = 0;
  for (const s of ns) ships.push(s);
  return true;
}

function tryPlaceType(
  board: Board,
  ships: Ship[],
  type: ShipTypeName,
  count: number,
): boolean {
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < 600) {
    const r = Math.floor(Math.random() * SIZE);
    const c = Math.floor(Math.random() * SIZE);
    const rot = Math.floor(Math.random() * 4);
    if (canPlaceShip(board, type, r, c, rot)) {
      addShip(board, ships, type, r, c, rot);
      placed++;
    }
    tries++;
  }
  return placed === count;
}

/** 随机布置一整队飞机；失败返回 null。 */
export function randomPlacement(
  large: number,
  small: number,
  cross: number,
): { board: Board; ships: Ship[] } | null {
  for (let attempt = 0; attempt < 300; attempt++) {
    const board = createEmptyBoard();
    const ships: Ship[] = [];
    if (
      tryPlaceType(board, ships, "large", large) &&
      tryPlaceType(board, ships, "small", small) &&
      tryPlaceType(board, ships, "cross", cross)
    ) {
      return { board, ships };
    }
  }
  return null;
}

/* ---------- 攻击 / 炸弹规则 ---------- */

export function cellHitsShip(ships: Ship[], board: Board, row: number, col: number): boolean {
  if (board[row][col] === "R") return true;
  for (const ship of ships) {
    const shape = ship.shape;
    for (const [dx, dy] of shape) {
      if (ship.row + dx === row && ship.col + dy === col) return true;
    }
  }
  return false;
}

export interface AttackResult {
  result: "miss" | "partHit" | "headDecoy" | "headDestroyed";
  destroyed: boolean;
  hitHead: boolean;
  hitPart: boolean;
  isDecoy: boolean;
  shipName: ShipTypeName | null;
}

/** 对防守方棋盘执行一次攻击，就地修改 board 与 ships。 */
export function attackBoard(
  board: Board,
  ships: Ship[],
  row: number,
  col: number,
): AttackResult {
  let hitHead = false;
  let hitPart = false;
  let hitShip: Ship | null = null;

  // 命中判定不跳过已摧毁的飞机：击毁后剩余机身格子仍应算命中，避免“判空”
  for (const ship of ships) {
    if (ship.head[0] === row && ship.head[1] === col) {
      hitHead = true;
      hitPart = true;
      hitShip = ship;
      break;
    }
  }
  if (!hitHead) {
    for (const ship of ships) {
      const shape = ship.shape;
      for (const [dx, dy] of shape) {
        const r = ship.row + dx;
        const c = ship.col + dy;
        if (r === ship.head[0] && c === ship.head[1]) continue;
        if (r === row && c === col) {
          hitPart = true;
          hitShip = ship;
          break;
        }
      }
      if (hitPart) break;
    }
  }

  if (hitHead) {
    if (hitShip!.isDecoy) {
      board[row][col] = "X";
      hitShip!.discovered = true;
      return { result: "headDecoy", destroyed: false, hitHead: true, hitPart: true, isDecoy: true, shipName: hitShip!.type };
    }
    board[row][col] = "*";
    hitShip!.destroyed = true;
    // 只标记被命中的机头；剩余机身格保持隐藏，玩家可继续攻击并判定为命中（避免“判空”）
    return { result: "headDestroyed", destroyed: true, hitHead: true, hitPart: true, isDecoy: false, shipName: hitShip!.type };
  }
  if (hitPart) {
    board[row][col] = "X";
    return { result: "partHit", destroyed: false, hitHead: false, hitPart: true, isDecoy: false, shipName: hitShip!.type };
  }
  board[row][col] = "O";
  return { result: "miss", destroyed: false, hitHead: false, hitPart: false, isDecoy: false, shipName: null };
}

/** 使用炸弹：揭示 3x3 范围，返回是否命中与揭示的飞机格。 */
export function revealBomb(
  board: Board,
  ships: Ship[],
  row: number,
  col: number,
): { hit: boolean; revealed: number[][] } {
  const revealed: number[][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const v = board[nr][nc];
      if (v === "X" || v === "O" || v === "*" || v === "R") continue;
      if (cellHitsShip(ships, board, nr, nc)) {
        board[nr][nc] = "R";
        revealed.push([nr, nc]);
      } else {
        board[nr][nc] = "O";
      }
    }
  }
  return { hit: revealed.length > 0, revealed };
}

/* ---------- 胜负判定 ---------- */

export function allRealHeadsDestroyed(ships: Ship[]): boolean {
  const real = ships.filter((sh) => !sh.isDecoy);
  return real.length > 0 && real.every((sh) => sh.destroyed);
}

export function countType(ships: Ship[], type: ShipTypeName): number {
  let n = 0;
  for (const s of ships) if (s.type === type) n++;
  return n;
}

export function countPlacementType(placements: ShipPlacement[], type: ShipTypeName): number {
  let n = 0;
  for (const p of placements) if (p.type === type) n++;
  return n;
}

/* ---------- 服务端视图投影 ---------- */

export interface PlayerView {
  roomId: string;
  config: PVPConfig;
  side: Side;
  yourName: string;
  opponentName: string;
  yourBoard: Board;
  enemyBoard: Board;
  yourShips: { type: ShipTypeName; destroyed: boolean }[];
  enemyShipsTotal: number;
  enemyShipsDestroyed: number;
  yourBombs: number;
  enemyBombs: number;
  currentTurn: Side | null;
  gameStarted: boolean;
  gameOver: boolean;
  winner: Side | null;
  yourReady: boolean;
  opponentReady: boolean;
  yourPlaced: boolean;
  opponentPlaced: boolean;
  status: string;
}

/** 从防守方棋盘派生“敌方视图”，只暴露已攻击的标记，隐藏飞机。 */
export function deriveEnemyBoard(defender: Board): Board {
  return defender.map((rowArr) =>
    rowArr.map((cell) =>
      cell === "X" || cell === "O" || cell === "*" || cell === "R" ? cell : "",
    ),
  );
}

/** 由一组布置重建用于展示的棋盘（客户端手动布置预览）。 */
export function buildBoardFromPlacements(placements: ShipPlacement[]): Board {
  const board = createEmptyBoard();
  const ships: Ship[] = [];
  for (const p of placements) {
    if (canPlaceShip(board, p.type, p.row, p.col, p.rotation)) {
      addShip(board, ships, p.type, p.row, p.col, p.rotation);
    }
  }
  return board;
}
