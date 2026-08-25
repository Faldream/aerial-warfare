/* ========================== 空战棋 PVE 游戏引擎 ========================== */

export const SIZE = 11;
export const ROWS = "ABCDEFGHIJK";
export const COLS = Array.from({ length: SIZE }, (_, i) => (i + 1).toString());

export const BOMBS_PER_SIDE = 3;
const MIN_BOMB_COOLDOWN = 5;

export type CellValue = "" | "ship" | "head" | "X" | "O" | "*" | "R";
export type Board = CellValue[][];

export interface AirplaneType {
  name: string;
  shape: number[][];
  head: number[];
  size: number;
  width: number;
  canDestroy: boolean;
}

export const AIRPLANE_TYPES: Record<"small" | "large" | "cross", AirplaneType> = {
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
  type: AirplaneType;
  row: number;
  col: number;
  rotation: number;
  head: [number, number];
  destroyed: boolean;
  isDecoy: boolean;
  discovered: boolean;
  hitParts: Set<string>;
  shape: number[][];
}

export interface AIState {
  confirmedHits: number[][];
  probabilityMap: number[][] | null;
  headProbabilityMap: number[][] | null;
  lastProbCalcAt: number;
  huntingMode: boolean;
  hitStreak: number[][];
  inferredDirection: "horizontal" | "vertical" | null;
  parityMode: boolean;
  lastMove: [number, number] | null;
  moveHistory: number[][];
  lastBombMove: number;
  searchPattern: "spiral" | "cross" | "cluster";
  adaptiveWeights: { probability: number; hunting: number; pattern: number; parity: number; head: number };
  escapeChance: number;
  inferredShips: { type: string; row: number; col: number; rotation: number; shape: number[][] }[];
  remainingShipTypes: { large: number; small: number; cross: number };
  hitPatterns: number[][][];
  smartTargeting: boolean;
  directionConfidence: number;
  shipLengths: number[];
  searchMode: string;
  orphanHits: Set<string>;
  probDirty: boolean;
}

export interface GameState {
  playerBoard: Board;
  playerShips: Ship[];
  enemyBoard: Board;
  enemyShips: Ship[];
  gameStarted: boolean;
  gameOver: boolean;
  manualPlacementMode: boolean;
  currentShipType: "large" | "small" | "cross";
  currentRotation: number;
  largeShipCount: number;
  smallShipCount: number;
  crossShipCount: number;
  largeShipsPlaced: number;
  smallShipsPlaced: number;
  crossShipsPlaced: number;
  playerBombs: number;
  enemyBombs: number;
  currentTurn: "player" | "enemy";
  firstMove: "player" | "enemy";
  showEnemyLayout: boolean;
  showAIDebug: boolean;
  showProbabilityMap: boolean;
  status: string;
  aiState: AIState;
  enemyTargetQueue: number[][];
}

/* ---------- 纯工具函数 ---------- */

function createEmptyBoard(): Board {
  return Array(SIZE)
    .fill(null)
    .map(() => Array(SIZE).fill("") as CellValue[]);
}

const ROTATE_CACHE = new Map<string, number[][]>();

function rotateShape(shape: number[][], times = 0): number[][] {
  const t = ((times % 4) + 4) % 4;
  const key = shape.map((p) => p.join(",")).join(";") + "|" + t;
  if (ROTATE_CACHE.has(key)) return ROTATE_CACHE.get(key)!.map((p) => [...p]);
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

function canPlaceShipOnBoard(
  board: Board,
  type: AirplaneType,
  row: number,
  col: number,
  rotation = 0,
): boolean {
  const shape = rotateShape(type.shape, rotation);
  for (const [dx, dy] of shape) {
    const r = row + dx;
    const c = col + dy;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
    if (board[r][c] === "ship" || board[r][c] === "head") return false;
  }
  return true;
}

function placeShipOnBoard(
  board: Board,
  ships: Ship[],
  type: AirplaneType,
  row: number,
  col: number,
  rotation = 0,
): Ship {
  const shape = rotateShape(type.shape, rotation);
  const head = rotateShape([type.head], rotation)[0];
  for (const [dx, dy] of shape) {
    const r = row + dx;
    const c = col + dy;
    if (r === row + head[0] && c === col + head[1]) board[r][c] = "head";
    else board[r][c] = "ship";
  }
  const ship: Ship = {
    type,
    row,
    col,
    rotation,
    head: [row + head[0], col + head[1]],
    destroyed: false,
    isDecoy: !type.canDestroy,
    discovered: false,
    hitParts: new Set(),
    shape,
  };
  ships.push(ship);
  return ship;
}

function placeRandomShipsGeneric(
  board: Board,
  ships: Ship[],
  largeCount: number,
  smallCount: number,
  crossCount: number,
): boolean {
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE; j++) board[i][j] = "";
  ships.length = 0;

  let placedLarge = 0;
  let placedSmall = 0;
  let placedCross = 0;
  let attempts = 0;
  const maxAttempts = 2000;

  attempts = 0;
  while (placedLarge < largeCount && attempts < maxAttempts) {
    const r = Math.floor(Math.random() * SIZE);
    const c = Math.floor(Math.random() * SIZE);
    const rot = Math.floor(Math.random() * 4);
    if (canPlaceShipOnBoard(board, AIRPLANE_TYPES.large, r, c, rot)) {
      placeShipOnBoard(board, ships, AIRPLANE_TYPES.large, r, c, rot);
      placedLarge++;
    }
    attempts++;
  }

  attempts = 0;
  while (placedSmall < smallCount && attempts < maxAttempts) {
    const r = Math.floor(Math.random() * SIZE);
    const c = Math.floor(Math.random() * SIZE);
    const rot = Math.floor(Math.random() * 4);
    if (canPlaceShipOnBoard(board, AIRPLANE_TYPES.small, r, c, rot)) {
      placeShipOnBoard(board, ships, AIRPLANE_TYPES.small, r, c, rot);
      placedSmall++;
    }
    attempts++;
  }

  attempts = 0;
  while (placedCross < crossCount && attempts < maxAttempts) {
    const r = Math.floor(Math.random() * SIZE);
    const c = Math.floor(Math.random() * SIZE);
    const rot = Math.floor(Math.random() * 4);
    if (canPlaceShipOnBoard(board, AIRPLANE_TYPES.cross, r, c, rot)) {
      placeShipOnBoard(board, ships, AIRPLANE_TYPES.cross, r, c, rot);
      placedCross++;
    }
    attempts++;
  }

  return placedLarge === largeCount && placedSmall === smallCount && placedCross === crossCount;
}

function createAIState(large: number, small: number, cross: number): AIState {
  return {
    confirmedHits: [],
    probabilityMap: null,
    headProbabilityMap: null,
    lastProbCalcAt: 0,
    huntingMode: false,
    hitStreak: [],
    inferredDirection: null,
    parityMode: true,
    lastMove: null,
    moveHistory: [],
    lastBombMove: 0,
    searchPattern: "spiral",
    adaptiveWeights: { probability: 1.0, hunting: 1.5, pattern: 0.7, parity: 0.5, head: 2.0 },
    escapeChance: 0.2,
    inferredShips: [],
    remainingShipTypes: { large, small, cross },
    hitPatterns: [],
    smartTargeting: true,
    directionConfidence: 0,
    shipLengths: [],
    searchMode: "adaptive",
    orphanHits: new Set(),
    probDirty: true,
  };
}

function initGameState(): GameState {
  return {
    playerBoard: createEmptyBoard(),
    playerShips: [],
    enemyBoard: createEmptyBoard(),
    enemyShips: [],
    gameStarted: false,
    gameOver: false,
    manualPlacementMode: false,
    currentShipType: "large",
    currentRotation: 0,
    largeShipCount: 2,
    smallShipCount: 1,
    crossShipCount: 1,
    largeShipsPlaced: 0,
    smallShipsPlaced: 0,
    crossShipsPlaced: 0,
    playerBombs: BOMBS_PER_SIDE,
    enemyBombs: BOMBS_PER_SIDE,
    currentTurn: "player",
    firstMove: "player",
    showEnemyLayout: false,
    showAIDebug: false,
    showProbabilityMap: false,
    status: "请设置飞机数量并布置飞机",
    aiState: createAIState(2, 1, 1),
    enemyTargetQueue: [],
  };
}

/* ---------- 游戏引擎类 ---------- */

export class AirWarGame {
  state: GameState;
  private notify: () => void;

  constructor(notify: () => void) {
    this.state = initGameState();
    this.notify = notify;
  }

  private refresh() {
    this.notify();
  }

  private setStatus(msg: string) {
    this.state.status = msg;
    this.refresh();
  }

  private isCellTried(board: Board, r: number, c: number): boolean {
    const v = board[r][c];
    return v === "X" || v === "O" || v === "*";
  }

  /* ---------- 布置相关 ---------- */

  applyShipConfig() {
    const s = this.state;
    if (s.gameStarted) return;
    s.largeShipCount = Math.max(0, s.largeShipCount);
    s.smallShipCount = Math.max(0, s.smallShipCount);
    s.crossShipCount = Math.max(0, s.crossShipCount);
    this.resetGame();
    this.setStatus(`已设置: ${s.largeShipCount} 个大飞机, ${s.smallShipCount} 个小飞机, ${s.crossShipCount} 个十字飞机`);
  }

  resetGame() {
    const s = this.state;
    s.playerBoard = createEmptyBoard();
    s.playerShips = [];
    s.enemyBoard = createEmptyBoard();
    s.enemyShips = [];
    s.gameStarted = false;
    s.gameOver = false;
    s.manualPlacementMode = false;
    s.largeShipsPlaced = 0;
    s.smallShipsPlaced = 0;
    s.crossShipsPlaced = 0;
    s.playerBombs = BOMBS_PER_SIDE;
    s.enemyBombs = BOMBS_PER_SIDE;
    s.currentRotation = 0;
    s.currentTurn = "player";
    s.firstMove = "player";
    s.enemyTargetQueue = [];
    s.showEnemyLayout = false;
    s.showAIDebug = false;
    s.showProbabilityMap = false;
    s.aiState = createAIState(s.largeShipCount, s.smallShipCount, s.crossShipCount);
    this.setStatus("游戏已重置，请布置飞机");
  }

  toggleManualPlacement() {
    const s = this.state;
    if (s.gameStarted) return;
    s.manualPlacementMode = !s.manualPlacementMode;
    if (s.manualPlacementMode) {
      this.setStatus("手动布置模式 - 选择飞机类型和旋转，然后点击玩家棋盘放置");
    } else {
      this.setStatus('请布置飞机，可以使用"玩家随机布置"按钮');
    }
  }

  rotateCurrentShip() {
    this.state.currentRotation = (this.state.currentRotation + 1) % 4;
    this.refresh();
  }

  changeShipType(type: "large" | "small" | "cross") {
    this.state.currentShipType = type;
    this.refresh();
  }

  setFirstMove(fm: "player" | "enemy") {
    this.state.firstMove = fm;
    this.refresh();
  }

  setLargeShipCount(n: number) {
    this.state.largeShipCount = Math.max(0, n);
    this.refresh();
  }

  setSmallShipCount(n: number) {
    this.state.smallShipCount = Math.max(0, n);
    this.refresh();
  }

  setCrossShipCount(n: number) {
    this.state.crossShipCount = Math.max(0, n);
    this.refresh();
  }

  placeRandomShipsForPlayer() {
    const s = this.state;
    s.playerBoard = createEmptyBoard();
    s.playerShips = [];
    s.largeShipsPlaced = 0;
    s.smallShipsPlaced = 0;
    s.crossShipsPlaced = 0;
    const ok = placeRandomShipsGeneric(
      s.playerBoard,
      s.playerShips,
      s.largeShipCount,
      s.smallShipCount,
      s.crossShipCount,
    );
    s.largeShipsPlaced = s.largeShipCount;
    s.smallShipsPlaced = s.smallShipCount;
    s.crossShipsPlaced = s.crossShipCount;
    this.setStatus(ok ? "玩家飞机已随机布置" : "玩家：无法放置所有飞机，请调整数量");
  }

  placeRandomShipsForEnemy() {
    const s = this.state;
    s.enemyBoard = createEmptyBoard();
    s.enemyShips = [];
    const ok = placeRandomShipsGeneric(
      s.enemyBoard,
      s.enemyShips,
      s.largeShipCount,
      s.smallShipCount,
      s.crossShipCount,
    );
    this.setStatus(ok ? "敌方飞机已随机布置（对玩家不可见）" : "敌方：无法放置所有飞机，请调整数量");
  }

  handleManualPlacement(row: number, col: number) {
    const s = this.state;
    if (s.gameStarted) return;
    const type = AIRPLANE_TYPES[s.currentShipType];
    if (!canPlaceShipOnBoard(s.playerBoard, type, row, col, s.currentRotation)) {
      this.setStatus(`无法在此位置放置${type.name}`);
      return;
    }
    if (s.currentShipType === "large" && s.largeShipsPlaced >= s.largeShipCount) {
      this.setStatus(`大飞机数量已达上限 (${s.largeShipCount})`);
      return;
    }
    if (s.currentShipType === "small" && s.smallShipsPlaced >= s.smallShipCount) {
      this.setStatus(`小飞机数量已达上限 (${s.smallShipCount})`);
      return;
    }
    if (s.currentShipType === "cross" && s.crossShipsPlaced >= s.crossShipCount) {
      this.setStatus(`十字飞机数量已达上限 (${s.crossShipCount})`);
      return;
    }
    placeShipOnBoard(s.playerBoard, s.playerShips, type, row, col, s.currentRotation);
    if (s.currentShipType === "large") s.largeShipsPlaced++;
    else if (s.currentShipType === "small") s.smallShipsPlaced++;
    else s.crossShipsPlaced++;
    if (
      s.largeShipsPlaced >= s.largeShipCount &&
      s.smallShipsPlaced >= s.smallShipCount &&
      s.crossShipsPlaced >= s.crossShipCount
    ) {
      this.setStatus('所有飞机已放置，点击"开始游戏"开始');
    } else {
      this.setStatus(`${type.name}已放置，继续放置其他飞机`);
    }
  }

  /* ---------- AI 逻辑 ---------- */

  private inferDirectionFromHits(): "horizontal" | "vertical" | null {
    const ai = this.state.aiState;
    const hits = ai.hitStreak;
    if (hits.length < 2) return null;
    const firstRow = hits[0][0];
    const firstCol = hits[0][1];
    let allSameRow = true;
    let allSameCol = true;
    for (let i = 1; i < hits.length; i++) {
      if (hits[i][0] !== firstRow) allSameRow = false;
      if (hits[i][1] !== firstCol) allSameCol = false;
    }
    if (allSameRow) {
      ai.directionConfidence = Math.min(1.0, ai.directionConfidence + 0.25 * hits.length);
      return "horizontal";
    }
    if (allSameCol) {
      ai.directionConfidence = Math.min(1.0, ai.directionConfidence + 0.25 * hits.length);
      return "vertical";
    }
    ai.directionConfidence = Math.max(0, ai.directionConfidence - 0.1);
    return null;
  }

  private addAdjacentTargets(r: number, c: number) {
    const ai = this.state.aiState;
    const s = this.state;
    let deltas: number[][];
    if (ai.inferredDirection === "horizontal" && ai.directionConfidence > 0.5) {
      deltas = [
        [0, -1],
        [0, 1],
      ];
    } else if (ai.inferredDirection === "vertical" && ai.directionConfidence > 0.5) {
      deltas = [
        [-1, 0],
        [1, 0],
      ];
    } else {
      deltas = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
    }
    const candidates: number[][] = [];
    for (const [dx, dy] of deltas) {
      const nr = r + dx;
      const nc = c + dy;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (this.isCellTried(s.playerBoard, nr, nc)) continue;
      const exists = s.enemyTargetQueue.some((t) => t[0] === nr && t[1] === nc);
      if (!exists) candidates.push([nr, nc]);
    }
    if (ai.inferredDirection && ai.directionConfidence > 0.7) {
      for (const cnd of candidates) s.enemyTargetQueue.unshift(cnd);
    } else {
      for (const cnd of candidates) s.enemyTargetQueue.push(cnd);
    }
  }

  private deduceHeadCandidates(hitRow: number, hitCol: number) {
    const ai = this.state.aiState;
    const s = this.state;
    if (ai.confirmedHits.length < 1) return;
    const candidates: number[][] = [];
    for (const typeName of ["large", "small", "cross"] as const) {
      if (ai.remainingShipTypes[typeName] <= 0) continue;
      const type = AIRPLANE_TYPES[typeName];
      for (let rot = 0; rot < 4; rot++) {
        const shape = rotateShape(type.shape, rot);
        const head = rotateShape([type.head], rot)[0];
        for (const [dx, dy] of shape) {
          const originR = hitRow - dx;
          const originC = hitCol - dy;
          const headR = originR + head[0];
          const headC = originC + head[1];
          if (headR < 0 || headR >= SIZE || headC < 0 || headC >= SIZE) continue;
          if (this.isCellTried(s.playerBoard, headR, headC)) continue;
          let compatible = true;
          for (const [sdx, sdy] of shape) {
            const nr = originR + sdx;
            const nc = originC + sdy;
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
              compatible = false;
              break;
            }
            const v = s.playerBoard[nr][nc];
            if (v === "O" || v === "*") {
              compatible = false;
              break;
            }
          }
          if (!compatible) continue;
          if (ai.confirmedHits.length > 0) {
            let coversAll = true;
            for (const [hr, hc] of ai.confirmedHits) {
              let covered = false;
              for (const [sdx, sdy] of shape) {
                if (originR + sdx === hr && originC + sdy === hc) {
                  covered = true;
                  break;
                }
              }
              if (!covered) {
                coversAll = false;
                break;
              }
            }
            if (!coversAll) continue;
          }
          const exists =
            candidates.some((cd) => cd[0] === headR && cd[1] === headC) ||
            s.enemyTargetQueue.some((t) => t[0] === headR && t[1] === headC);
          if (!exists) candidates.push([headR, headC]);
        }
      }
    }
    for (let i = candidates.length - 1; i >= 0; i--) s.enemyTargetQueue.unshift(candidates[i]);
  }

  private removeTargetsAroundShip(ship: Ship) {
    const ai = this.state.aiState;
    const s = this.state;
    const shape = rotateShape(ship.type.shape, ship.rotation);
    const shipCells = shape.map(([dx, dy]) => [ship.row + dx, ship.col + dy]);
    for (const [sr, sc] of shipCells) {
      if (s.playerBoard[sr][sc] === "X") ai.orphanHits.add(`${sr},${sc}`);
      else if (s.playerBoard[sr][sc] === "R") s.playerBoard[sr][sc] = "X";
    }
    const toRemoveSet = new Set<string>();
    const deltas = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [sr, sc] of shipCells) {
      for (const [dx, dy] of deltas) {
        const nr = sr + dx;
        const nc = sc + dy;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (!this.isCellTried(s.playerBoard, nr, nc)) toRemoveSet.add(`${nr},${nc}`);
      }
    }
    s.enemyTargetQueue = s.enemyTargetQueue.filter(([r, c]) => !toRemoveSet.has(`${r},${c}`));
    ai.hitStreak = ai.hitStreak.filter(
      (hit) => !shipCells.some((cell) => cell[0] === hit[0] && cell[1] === hit[1]),
    );
    if (ai.hitStreak.length < 2) {
      ai.inferredDirection = null;
      ai.directionConfidence = 0;
    }
    ai.confirmedHits = ai.confirmedHits.filter(
      (hit) => !shipCells.some((cell) => cell[0] === hit[0] && cell[1] === hit[1]),
    );
    if (ai.confirmedHits.length === 0) ai.huntingMode = false;
  }

  private createProbabilityMaps() {
    const ai = this.state.aiState;
    const s = this.state;
    const probMap: number[][] = Array(SIZE)
      .fill(null)
      .map(() => Array(SIZE).fill(0) as number[]);
    const headProbMap: number[][] = Array(SIZE)
      .fill(null)
      .map(() => Array(SIZE).fill(0) as number[]);

    const knownHits: number[][] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (s.playerBoard[r][c] === "X" && !ai.orphanHits.has(`${r},${c}`)) knownHits.push([r, c]);
      }

    const remainingLarge = ai.remainingShipTypes.large;
    const remainingSmall = ai.remainingShipTypes.small;
    const remainingCross = ai.remainingShipTypes.cross;
    if (remainingLarge + remainingSmall + remainingCross === 0) return { probMap, headProbMap };

    const validPlacements: {
      large: { r: number; c: number; rot: number; shape: number[][] }[];
      small: { r: number; c: number; rot: number; shape: number[][] }[];
      cross: { r: number; c: number; rot: number; shape: number[][] }[];
    } = { large: [], small: [], cross: [] };

    for (const typeName of ["large", "small", "cross"] as const) {
      const type = AIRPLANE_TYPES[typeName];
      const expectedCount =
        typeName === "large" ? remainingLarge : typeName === "small" ? remainingSmall : remainingCross;
      if (expectedCount <= 0) continue;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          for (let rot = 0; rot < 4; rot++) {
            const shape = rotateShape(type.shape, rot);
            let compatible = true;
            let coversAnyKnownHit = false;
            for (const [dx, dy] of shape) {
              const nr = r + dx;
              const nc = c + dy;
              if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
                compatible = false;
                break;
              }
              const v = s.playerBoard[nr][nc];
              if (v === "O" || v === "*") {
                compatible = false;
                break;
              }
              if (v === "X" && !ai.orphanHits.has(`${nr},${nc}`)) coversAnyKnownHit = true;
            }
            if (!compatible) continue;
            if (knownHits.length > 0 && !coversAnyKnownHit) continue;
            if (ai.huntingMode && knownHits.length > 0) {
              let coversAll = true;
              for (const [hr, hc] of knownHits) {
                let covered = false;
                for (const [dx, dy] of shape) {
                  if (r + dx === hr && c + dy === hc) {
                    covered = true;
                    break;
                  }
                }
                if (!covered) {
                  coversAll = false;
                  break;
                }
              }
              if (!coversAll) continue;
            }
            validPlacements[typeName].push({ r, c, rot, shape });
          }
        }
      }
    }

    const useParity = knownHits.length === 0 && ai.parityMode === true;
    const headMultiplier = ai.huntingMode ? 100 : ai.adaptiveWeights.head || 2.0;

    for (const typeName of ["large", "small", "cross"] as const) {
      for (const placement of validPlacements[typeName]) {
        const { r, c, rot, shape } = placement;
        const type = AIRPLANE_TYPES[typeName];
        let coversHits = 0;
        for (const [dx, dy] of shape) {
          const nr = r + dx;
          const nc = c + dy;
          if (s.playerBoard[nr][nc] === "X" && !ai.orphanHits.has(`${nr},${nc}`)) coversHits++;
        }
        const baseWeight = 1 + coversHits * 10;
        const head = rotateShape([type.head], rot)[0];
        const headR = r + head[0];
        const headC = c + head[1];
        for (const [dx, dy] of shape) {
          const nr = r + dx;
          const nc = c + dy;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          let parityMul = 1.0;
          if (useParity) parityMul = (nr + nc) % 2 === 0 ? 1.2 : 0.25;
          const isHead = nr === headR && nc === headC;
          probMap[nr][nc] += baseWeight * (isHead ? headMultiplier : 1) * parityMul;
          if (isHead) headProbMap[headR][headC] += baseWeight;
        }
      }
    }
    return { probMap, headProbMap };
  }

  private updateProbabilityMap(force = false) {
    const ai = this.state.aiState;
    const s = this.state;
    if (!force && !ai.probDirty && ai.probabilityMap) return ai.probabilityMap;

    const maps = this.createProbabilityMaps();
    ai.probabilityMap = maps.probMap;
    ai.headProbabilityMap = maps.headProbMap;

    for (const [hr, hc] of ai.confirmedHits) {
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        const nr = hr + dr;
        const nc = hc + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (!this.isCellTried(s.playerBoard, nr, nc)) ai.probabilityMap![nr][nc] += 15;
      }
    }
    const centerR = Math.floor(SIZE / 2);
    const centerC = Math.floor(SIZE / 2);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.isCellTried(s.playerBoard, r, c)) continue;
        const distToCenter = Math.abs(r - centerR) + Math.abs(c - centerC);
        const centerBonus = Math.max(0, 3 - distToCenter * 0.3);
        ai.probabilityMap![r][c] += centerBonus;
        ai.headProbabilityMap![r][c] += centerBonus * 0.5;
      }
    }
    if (ai.inferredShips.length > 0) {
      for (const inferredShip of ai.inferredShips) {
        for (const [dx, dy] of inferredShip.shape) {
          const r = inferredShip.row + dx;
          const c = inferredShip.col + dy;
          if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && !this.isCellTried(s.playerBoard, r, c)) {
            ai.probabilityMap![r][c] += 20;
          }
        }
      }
    }
    ai.lastProbCalcAt = Date.now();
    ai.probDirty = false;
    return ai.probabilityMap;
  }

  private updateRemainingShipTypes() {
    const ai = this.state.aiState;
    const s = this.state;
    const destroyedLarge = s.playerShips.filter((sh) => sh.destroyed && sh.type === AIRPLANE_TYPES.large).length;
    const destroyedSmall = s.playerShips.filter((sh) => sh.destroyed && sh.type === AIRPLANE_TYPES.small).length;
    const discoveredCross = s.playerShips.filter((sh) => sh.discovered && sh.type === AIRPLANE_TYPES.cross).length;
    ai.remainingShipTypes.large = Math.max(0, s.largeShipCount - destroyedLarge);
    ai.remainingShipTypes.small = Math.max(0, s.smallShipCount - destroyedSmall);
    ai.remainingShipTypes.cross = Math.max(0, s.crossShipCount - discoveredCross);
  }

  private allRealHeadsDestroyed(ships: Ship[]): boolean {
    const real = ships.filter((sh) => !sh.isDecoy);
    return real.length > 0 && real.every((sh) => sh.destroyed);
  }

  private getHighProbabilityThreshold() {
    const totalUntried = SIZE * SIZE - this.state.aiState.moveHistory.length;
    const gamePhase = totalUntried / (SIZE * SIZE);
    if (gamePhase > 0.7) return 15;
    if (gamePhase > 0.3) return 10;
    return 5;
  }

  private getSearchPatternBonus(r: number, c: number): number {
    const ai = this.state.aiState;
    if (ai.moveHistory.length === 0) return 0;
    const lastMove = ai.moveHistory[ai.moveHistory.length - 1];
    const [lastR, lastC] = lastMove;
    const distance = Math.abs(lastR - r) + Math.abs(lastC - c);
    switch (ai.searchPattern) {
      case "spiral":
        return 10 - Math.min(distance, 10);
      case "cross":
        return r === lastR || c === lastC ? 15 : 0;
      case "cluster":
        return 5 - Math.min(distance, 5);
      default:
        return 0;
    }
  }

  private getDistanceBonus(r: number, c: number): number {
    const s = this.state;
    let minDistance = SIZE * 2;
    for (let i = 0; i < SIZE; i++)
      for (let j = 0; j < SIZE; j++)
        if (this.isCellTried(s.playerBoard, i, j)) {
          const distance = Math.abs(i - r) + Math.abs(j - c);
          minDistance = Math.min(minDistance, distance);
        }
    return Math.min(minDistance * 2, 10);
  }

  private optimizeTargetSelection(targets: number[][]): number[] | null {
    if (targets.length === 0) return null;
    const ai = this.state.aiState;
    const scored = targets.map(([r, c]) => {
      let score = ai.probabilityMap?.[r][c] || 0;
      const headProb = ai.headProbabilityMap?.[r][c] || 0;
      const headWeight = ai.huntingMode ? 100 : ai.adaptiveWeights.head || 2.0;
      score += headProb * headWeight;
      score += this.getSearchPatternBonus(r, c);
      if (ai.parityMode && (r + c) % 2 === 0) score += 8;
      score += this.getDistanceBonus(r, c);
      return { target: [r, c] as number[], score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].target;
  }

  private densityBasedSearch(untriedCells: number[][]): number[] | null {
    const s = this.state;
    const densityScores = untriedCells.map(([r, c]) => {
      let density = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !this.isCellTried(s.playerBoard, nr, nc)) density++;
        }
      return { target: [r, c] as number[], density };
    });
    densityScores.sort((a, b) => b.density - a.density);
    const topCount = Math.max(3, Math.floor(densityScores.length * 0.1));
    const top = densityScores.slice(0, topCount);
    if (top.length > 0) return top[Math.floor(Math.random() * top.length)].target;
    return null;
  }

  private getRegion(r: number, c: number): number {
    const midRow = Math.floor(SIZE / 2);
    const midCol = Math.floor(SIZE / 2);
    if (r < midRow && c < midCol) return 0;
    if (r < midRow && c >= midCol) return 1;
    if (r >= midRow && c < midCol) return 2;
    return 3;
  }

  private regionBasedSearch(untriedCells: number[][]): number[] | null {
    const ai = this.state.aiState;
    const regionCounts = [0, 0, 0, 0];
    const regionUntried: number[][][] = [[], [], [], []];
    for (const [r, c] of untriedCells) {
      const region = this.getRegion(r, c);
      regionCounts[region]++;
      regionUntried[region].push([r, c]);
    }
    let maxRegion = 0;
    let maxCount = regionCounts[0];
    for (let i = 1; i < 4; i++) {
      if (regionCounts[i] > maxCount) {
        maxCount = regionCounts[i];
        maxRegion = i;
      }
    }
    if (regionUntried[maxRegion].length > 0) {
      const regionTargets = regionUntried[maxRegion];
      let bestTarget = regionTargets[0];
      let bestProb = ai.probabilityMap?.[bestTarget[0]][bestTarget[1]] || 0;
      for (let i = 1; i < regionTargets.length; i++) {
        const [r, c] = regionTargets[i];
        const prob = ai.probabilityMap?.[r][c] || 0;
        if (prob > bestProb) {
          bestProb = prob;
          bestTarget = [r, c];
        }
      }
      return bestTarget;
    }
    return null;
  }

  private generateOptimizedSpiralPattern(centerR: number, centerC: number): number[][] {
    const pattern: number[][] = [];
    const visited = new Set<string>();
    let radius = 0;
    while (pattern.length < SIZE * SIZE) {
      for (let angle = 0; angle < 360; angle += 45) {
        const rad = (angle * Math.PI) / 180;
        const r = Math.round(centerR + radius * Math.sin(rad));
        const c = Math.round(centerC + radius * Math.cos(rad));
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
          const key = `${r},${c}`;
          if (!visited.has(key)) {
            pattern.push([r, c]);
            visited.add(key);
          }
        }
      }
      radius += 0.5;
      if (radius > SIZE * 2) break;
    }
    return pattern;
  }

  private patternBasedSearch(untriedCells: number[][]): number[] | null {
    const ai = this.state.aiState;
    const s = this.state;
    const centerR = Math.floor(SIZE / 2);
    const centerC = Math.floor(SIZE / 2);
    switch (ai.searchPattern) {
      case "spiral": {
        const spiral = this.generateOptimizedSpiralPattern(centerR, centerC);
        for (const [r, c] of spiral) {
          if (!this.isCellTried(s.playerBoard, r, c)) return [r, c];
        }
        break;
      }
      case "cross": {
        const pattern: number[][] = [];
        for (let i = 0; i < SIZE; i++) pattern.push([i, i]);
        for (let i = 0; i < SIZE; i++) pattern.push([i, SIZE - 1 - i]);
        for (let i = 0; i < SIZE; i++) {
          if (i !== centerR) pattern.push([i, centerC]);
          if (i !== centerC) pattern.push([centerR, i]);
        }
        const seen = new Set<string>();
        for (const [r, c] of pattern) {
          const key = `${r},${c}`;
          if (!seen.has(key) && !this.isCellTried(s.playerBoard, r, c)) {
            seen.add(key);
            return [r, c];
          }
        }
        break;
      }
      case "cluster":
        return this.findClusterCenter(untriedCells);
    }
    return null;
  }

  private kMeansClustering(points: number[][], k: number, maxIterations = 10): number[][][] {
    if (points.length <= k) return points.map((point) => [point]);
    const centers: number[][] = [];
    for (let i = 0; i < k; i++) centers.push(points[Math.floor(Math.random() * points.length)]);
    let clusters: number[][][] = Array(k)
      .fill(null)
      .map(() => []);
    for (let iter = 0; iter < maxIterations; iter++) {
      clusters = Array(k)
        .fill(null)
        .map(() => []);
      for (const point of points) {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let i = 0; i < k; i++) {
          const dist = Math.abs(point[0] - centers[i][0]) + Math.abs(point[1] - centers[i][1]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = i;
          }
        }
        clusters[bestCluster].push(point);
      }
      let changed = false;
      for (let i = 0; i < k; i++) {
        if (clusters[i].length > 0) {
          const newCenter = [
            Math.round(clusters[i].reduce((sum, p) => sum + p[0], 0) / clusters[i].length),
            Math.round(clusters[i].reduce((sum, p) => sum + p[1], 0) / clusters[i].length),
          ];
          if (newCenter[0] !== centers[i][0] || newCenter[1] !== centers[i][1]) {
            centers[i] = newCenter;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return clusters;
  }

  private findClusterCenter(untriedCells: number[][]): number[] | null {
    const ai = this.state.aiState;
    if (untriedCells.length === 0) return null;
    const clusters = this.kMeansClustering(untriedCells, 3);
    let largestCluster = clusters[0];
    for (let i = 1; i < clusters.length; i++) {
      if (clusters[i].length > largestCluster.length) largestCluster = clusters[i];
    }
    if (largestCluster.length > 0) {
      let bestTarget = largestCluster[0];
      let bestProb = ai.probabilityMap?.[bestTarget[0]][bestTarget[1]] || 0;
      for (let i = 1; i < largestCluster.length; i++) {
        const [r, c] = largestCluster[i];
        const prob = ai.probabilityMap?.[r][c] || 0;
        if (prob > bestProb) {
          bestProb = prob;
          bestTarget = [r, c];
        }
      }
      return bestTarget;
    }
    return null;
  }

  private intelligentSearch(untriedCells: number[][]): number[] | null {
    const densityTarget = this.densityBasedSearch(untriedCells);
    if (densityTarget) return densityTarget;
    const regionTarget = this.regionBasedSearch(untriedCells);
    if (regionTarget) return regionTarget;
    return this.patternBasedSearch(untriedCells);
  }

  private selectAITarget(): [number, number] | null {
    const ai = this.state.aiState;
    const s = this.state;
    this.updateRemainingShipTypes();
    this.updateProbabilityMap();

    // 优先攻击炸弹揭示出的飞机格
    const revealedCells: number[][] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (s.playerBoard[r][c] === "R") revealedCells.push([r, c]);
    if (revealedCells.length > 0) {
      let best = revealedCells[0];
      for (const [r, c] of revealedCells) {
        const bp = ai.headProbabilityMap?.[best[0]][best[1]] || 0;
        const cp = ai.headProbabilityMap?.[r][c] || 0;
        if (cp > bp) best = [r, c];
      }
      return best as [number, number];
    }

    if (s.enemyTargetQueue.length > 0 && ai.huntingMode) {
      s.enemyTargetQueue.sort((a, b) => {
        const pa = ai.probabilityMap?.[a[0]][a[1]] || 0;
        const pb = ai.probabilityMap?.[b[0]][b[1]] || 0;
        return pb - pa;
      });
      while (s.enemyTargetQueue.length > 0) {
        const target = s.enemyTargetQueue.shift()!;
        if (!this.isCellTried(s.playerBoard, target[0], target[1])) {
          return target as [number, number];
        }
      }
    }

    const untriedCells: number[][] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (!this.isCellTried(s.playerBoard, r, c)) untriedCells.push([r, c]);

    const highProbThreshold = this.getHighProbabilityThreshold();
    const highProbTargets: number[][] = [];
    for (const [r, c] of untriedCells) {
      const prob = ai.probabilityMap?.[r][c] || 0;
      if (prob >= highProbThreshold) highProbTargets.push([r, c]);
    }

    if (highProbTargets.length > 0) {
      const bestTarget = this.optimizeTargetSelection(highProbTargets);
      if (bestTarget) {
        return bestTarget as [number, number];
      }
    }

    const searchTarget = this.intelligentSearch(untriedCells);
    if (searchTarget) {
      return searchTarget as [number, number];
    }

    if (untriedCells.length > 0) {
      const target = untriedCells[Math.floor(Math.random() * untriedCells.length)];
      return target as [number, number];
    }
    return null;
  }

  private inferShipFromHit(ship: Ship) {
    const ai = this.state.aiState;
    ai.inferredShips.push({
      type: ship.type.name,
      row: ship.row,
      col: ship.col,
      rotation: ship.rotation,
      shape: ship.shape,
    });
  }

  private tryInferShipShape() {
    const ai = this.state.aiState;
    if (ai.confirmedHits.length < 2) return;
    const hits = ai.confirmedHits;
    const firstHit = hits[0];
    const lastHit = hits[hits.length - 1];
    if (firstHit[0] === lastHit[0]) {
      const length = Math.abs(firstHit[1] - lastHit[1]) + 1;
      for (const typeName of ["small", "large"] as const) {
        if (AIRPLANE_TYPES[typeName].width >= length) {
          // 推断信息，用于后续扩展
        }
      }
    }
    if (firstHit[1] === lastHit[1]) {
      const length = Math.abs(firstHit[0] - lastHit[0]) + 1;
      for (const typeName of ["small", "large"] as const) {
        if (AIRPLANE_TYPES[typeName].size >= length) {
          // 推断信息，用于后续扩展
        }
      }
    }
  }

  /* ---------- 炸弹相关 ---------- */

  private cellHitsShip(ships: Ship[], board: Board, r: number, c: number): boolean {
    if (board[r][c] === "R") return true;
    for (const ship of ships) {
      const shape = rotateShape(ship.type.shape, ship.rotation);
      for (const [dx, dy] of shape) {
        if (ship.row + dx === r && ship.col + dy === c) return true;
      }
    }
    return false;
  }

  private reveal3x3(board: Board, ships: Ship[], r: number, c: number): [number, number][] {
    const revealed: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const v = board[nr][nc];
        if (v === "X" || v === "O" || v === "*" || v === "R") continue;
        if (this.cellHitsShip(ships, board, nr, nc)) {
          board[nr][nc] = "R";
          revealed.push([nr, nc]);
        } else {
          // 记录该格为无飞机区，AI 后续跳过
          board[nr][nc] = "O";
        }
      }
    }
    return revealed;
  }

  private enqueueRevealedTargets(revealed: [number, number][]) {
    const ai = this.state.aiState;
    const s = this.state;
    for (const [r, c] of revealed) {
      if (this.isCellTried(s.playerBoard, r, c)) continue;
      const exists = s.enemyTargetQueue.some((t) => t[0] === r && t[1] === c);
      if (!exists) s.enemyTargetQueue.unshift([r, c]);
    }
    // 区域内确有飞机：进入追击模式，优先攻击已揭示的飞机格
    if (revealed.length > 0) ai.huntingMode = true;
  }

  private isEnemyBombWorthwhile(): boolean {
    const ai = this.state.aiState;
    const s = this.state;
    if (s.enemyBombs <= 0) return false;
    // 若已有炸弹揭示出的飞机格，优先攻击它们，不再投弹
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (s.playerBoard[r][c] === "R") return false;

    const total = SIZE * SIZE;
    const moves = ai.moveHistory.length;
    const ratio = (total - moves) / total; // 剩余未揭试占比
    const progress = 1 - ratio; // 已揭试进度
    const used = BOMBS_PER_SIDE - s.enemyBombs;
    const sinceLastBomb = moves - ai.lastBombMove;

    // 期望在当前进度下已使用的炸弹数（随进度铺开，避免开局一次打光）
    const desiredUsed = Math.min(BOMBS_PER_SIDE, Math.floor(progress * BOMBS_PER_SIDE));

    // 1) 追击命中后：最佳投弹时机，揭示命中点周围（带冷却，避免连投）
    //    只有当前进度还"欠"炸弹、或之前没在追击时用过，才优先用
    if (ai.huntingMode && ai.confirmedHits.length > 0 && sinceLastBomb >= MIN_BOMB_COOLDOWN) {
      return true;
    }

    // 2) 中后期按预算补投：落后于进度时使用，分散炸弹消耗
    if (progress >= 0.33 && used < desiredUsed && sinceLastBomb >= MIN_BOMB_COOLDOWN) return true;

    // 3) 后期兜底：剩余空间不多且仍有炸弹，强制使用（冷却放宽，保证用完）
    if (ratio < 0.15 && used < BOMBS_PER_SIDE && sinceLastBomb >= MIN_BOMB_COOLDOWN - 3) return true;

    return false;
  }

  private pickBombTarget(): [number, number] | null {
    const ai = this.state.aiState;
    const s = this.state;
    this.updateRemainingShipTypes();
    this.updateProbabilityMap();
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.isCellTried(s.playerBoard, r, c)) continue;
        const score = (ai.headProbabilityMap?.[r][c] || 0) * 10 + (ai.probabilityMap?.[r][c] || 0);
        if (score > bestScore) {
          bestScore = score;
          best = [r, c];
        }
      }
    }
    return best;
  }

  private useEnemyBomb(row: number, col: number) {
    const s = this.state;
    if (s.enemyBombs <= 0) return;
    if (s.playerBoard[row][col] === "X" || s.playerBoard[row][col] === "O" || s.playerBoard[row][col] === "*") return;
    s.enemyBombs--;
    s.aiState.lastBombMove = s.aiState.moveHistory.length;
    const bombHit = this.cellHitsShip(s.playerShips, s.playerBoard, row, col);
    if (bombHit) {
      const revealed = this.reveal3x3(s.playerBoard, s.playerShips, row, col);
      s.aiState.probDirty = true;
      this.enqueueRevealedTargets(revealed);
      this.setStatus("敌方炸弹命中！揭示周围区域，优先攻击，敌方继续攻击");
      setTimeout(() => this.enemyMove(), 500);
    } else {
      s.playerBoard[row][col] = "O";
      s.aiState.probDirty = true;
      this.setStatus("敌方炸弹未命中，轮到玩家攻击");
      s.currentTurn = "player";
    }
    this.refresh();
  }

  usePlayerBomb(row: number, col: number) {
    const s = this.state;
    if (!s.gameStarted || s.gameOver) return;
    if (s.currentTurn !== "player") return;
    if (s.playerBombs <= 0) {
      this.setStatus("你的炸弹已用完");
      return;
    }
    if (s.enemyBoard[row][col] === "X" || s.enemyBoard[row][col] === "O" || s.enemyBoard[row][col] === "*") return;
    s.playerBombs--;
    const bombHit = this.cellHitsShip(s.enemyShips, s.enemyBoard, row, col);
    if (bombHit) {
      this.reveal3x3(s.enemyBoard, s.enemyShips, row, col);
      this.setStatus("炸弹命中！揭示周围区域，玩家继续攻击");
    } else {
      s.enemyBoard[row][col] = "O";
      this.setStatus("炸弹未命中，轮到敌方攻击");
      s.currentTurn = "enemy";
      setTimeout(() => this.enemyMove(), 500);
    }
    this.refresh();
  }

  /* ---------- 敌方 AI 行动 ---------- */

  private enemyMove() {
    const s = this.state;
    if (s.gameOver) return;
    this.setStatus("敌方行动中...");

    // 敌方炸弹决策：追击时可用炸弹揭示周围
    if (this.isEnemyBombWorthwhile()) {
      const bombTarget = this.pickBombTarget();
      if (bombTarget) {
        this.useEnemyBomb(bombTarget[0], bombTarget[1]);
        return;
      }
    }

    const target = this.selectAITarget();
    if (!target) {
      s.gameOver = true;
      this.setStatus("平局：没有可攻击格子");
      return;
    }
    const [row, col] = target;
    const ai = s.aiState;
    ai.lastMove = [row, col];
    ai.moveHistory.push([row, col]);

    let hitHead = false;
    let hitPart = false;
    let hitShip: Ship | null = null;

    for (const ship of s.playerShips) {
      if (ship.destroyed) continue;
      const [hx, hy] = ship.head;
      if (row === hx && col === hy) {
        hitHead = true;
        hitPart = true;
        hitShip = ship;
        break;
      }
    }

    if (!hitHead) {
      for (const ship of s.playerShips) {
        const shape = rotateShape(ship.type.shape, ship.rotation);
        for (const [dx, dy] of shape) {
          const r = ship.row + dx;
          const c = ship.col + dy;
          const [hx, hy] = ship.head;
          if (r === hx && c === hy) continue;
          if (r === row && c === col) {
            hitPart = true;
            hitShip = ship;
            if (!ship.destroyed) ship.hitParts.add(`${dx},${dy}`);
            break;
          }
        }
        if (hitPart) break;
      }
    }

    if (hitHead) {
      if (hitShip!.isDecoy) {
        // 十字飞机：只能命中，不能击毁 -> 标记、发现并脱离追击
        s.playerBoard[row][col] = "X";
        hitShip!.discovered = true;
        ai.probDirty = true;
        this.removeTargetsAroundShip(hitShip!);
        this.refresh();
        const allPlayerHeadsDestroyed = this.allRealHeadsDestroyed(s.playerShips);
        if (allPlayerHeadsDestroyed) {
          s.gameOver = true;
          this.setStatus("敌方胜利：玩家所有飞机被击毁");
          return;
        }
        this.setStatus("敌方命中玩家机身，敌方继续攻击");
        setTimeout(() => this.enemyMove(), 500);
      } else {
        s.playerBoard[row][col] = "*";
        hitShip!.destroyed = true;
        ai.probDirty = true;
        this.removeTargetsAroundShip(hitShip!);
        ai.huntingMode = false;
        ai.hitStreak = [];
        ai.inferredDirection = null;
        ai.directionConfidence = 0;
        this.inferShipFromHit(hitShip!);
        this.refresh();
        const allPlayerHeadsDestroyed = this.allRealHeadsDestroyed(s.playerShips);
        if (allPlayerHeadsDestroyed) {
          s.gameOver = true;
          this.setStatus("敌方胜利：玩家所有飞机被击毁");
          return;
        }
        this.setStatus(`敌方命中玩家飞机头部！击毁一架${hitShip!.type.name}，敌方继续攻击`);
        setTimeout(() => this.enemyMove(), 500);
      }
    } else if (hitPart) {
      s.playerBoard[row][col] = "X";
      ai.probDirty = true;
      if (hitShip && !hitShip.destroyed) {
        if (!ai.confirmedHits.find((h) => h[0] === row && h[1] === col)) {
          ai.confirmedHits.push([row, col]);
        }
        ai.hitStreak.push([row, col]);
        ai.huntingMode = true;
        ai.inferredDirection = this.inferDirectionFromHits();
        this.addAdjacentTargets(row, col);
        this.deduceHeadCandidates(row, col);
        this.tryInferShipShape();
      }
      this.refresh();
      this.setStatus("敌方命中玩家机身，敌方继续攻击");
      setTimeout(() => this.enemyMove(), 500);
    } else {
      s.playerBoard[row][col] = "O";
      ai.probDirty = true;
      if (ai.huntingMode) {
        ai.directionConfidence = Math.max(0, ai.directionConfidence - 0.15);
        if (ai.directionConfidence <= 0.05 && ai.hitStreak.length > 0) {
          const recentMisses = ai.moveHistory.slice(-3).filter(([mr, mc]) => s.playerBoard[mr][mc] === "O").length;
          if (recentMisses >= 2) {
            ai.huntingMode = false;
            ai.hitStreak = [];
            ai.inferredDirection = null;
            ai.directionConfidence = 0;
            this.setStatus("敌方未命中，方向推断失败，退出追击模式，轮到玩家攻击");
          } else {
            this.setStatus("敌方未命中，降低方向置信度，继续追击，轮到玩家攻击");
          }
        } else {
          this.setStatus("敌方未命中，轮到玩家攻击");
        }
      } else {
        this.setStatus("敌方未命中，轮到玩家攻击");
      }
      this.refresh();
      s.currentTurn = "player";
    }
  }

  /* ---------- 玩家攻击 ---------- */

  handlePlayerAttack(row: number, col: number) {
    const s = this.state;
    if (!s.gameStarted || s.gameOver) return;
    if (s.currentTurn !== "player") return;
    if (s.enemyBoard[row][col] === "X" || s.enemyBoard[row][col] === "O" || s.enemyBoard[row][col] === "*") return;

    let hitHead = false;
    let hitPart = false;
    let hitShip: Ship | null = null;

    for (const ship of s.enemyShips) {
      const [hx, hy] = ship.head;
      if (row === hx && col === hy) {
        hitHead = true;
        hitPart = true;
        hitShip = ship;
        break;
      }
    }
    if (!hitHead) {
      for (const ship of s.enemyShips) {
        const shape = rotateShape(ship.type.shape, ship.rotation);
        for (const [dx, dy] of shape) {
          const r = ship.row + dx;
          const c = ship.col + dy;
          const [hx, hy] = ship.head;
          if (r === hx && c === hy) continue;
          if (r === row && c === col) {
            hitPart = true;
            hitShip = ship;
            ship.hitParts.add(`${dx},${dy}`);
            break;
          }
        }
        if (hitPart) break;
      }
    }

    if (hitHead) {
      if (hitShip!.isDecoy) {
        s.enemyBoard[row][col] = "X";
        hitShip!.discovered = true;
        this.setStatus("玩家命中机身！玩家继续攻击");
      } else {
        s.enemyBoard[row][col] = "*";
        hitShip!.destroyed = true;
        this.setStatus(`玩家命中敌方飞机头部！击毁一架${hitShip!.type.name}！玩家继续攻击`);
      }
    } else if (hitPart) {
      s.enemyBoard[row][col] = "X";
      this.setStatus("玩家命中机身！玩家继续攻击");
    } else {
      s.enemyBoard[row][col] = "O";
      this.setStatus("玩家未命中，轮到敌方攻击");
    }
    this.refresh();

    const allEnemyHeadsDestroyed = this.allRealHeadsDestroyed(s.enemyShips);
    if (allEnemyHeadsDestroyed) {
      s.gameOver = true;
      this.setStatus("恭喜玩家！已击毁敌方所有飞机！游戏结束");
      return;
    }

    if (!hitHead && !hitPart) {
      s.currentTurn = "enemy";
      setTimeout(() => this.enemyMove(), 500);
    }
  }

  /* ---------- 开始游戏 ---------- */

  setupGame() {
    const s = this.state;
    if (s.gameStarted) return;
    if (s.playerShips.length === 0) {
      this.setStatus("请先布置玩家飞机！可以使用'玩家随机布置'或手动布置");
      return;
    }
    if (s.largeShipCount + s.smallShipCount === 0) {
      this.setStatus("至少需要一架真实飞机（大飞机或小飞机）才能开始游戏");
      return;
    }
    if (s.enemyShips.length === 0) {
      this.placeRandomShipsForEnemy();
    }
    for (let i = 0; i < SIZE; i++)
      for (let j = 0; j < SIZE; j++) {
        if (s.playerBoard[i][j] === "ship" || s.playerBoard[i][j] === "head") s.playerBoard[i][j] = "";
      }
    s.gameStarted = true;
    s.gameOver = false;
    s.manualPlacementMode = false;
    s.currentTurn = s.firstMove;
    s.enemyTargetQueue = [];
    s.aiState = createAIState(s.largeShipCount, s.smallShipCount, s.crossShipCount);
    if (s.currentTurn === "player") {
      this.setStatus("游戏开始！轮到玩家攻击");
    } else {
      this.setStatus("游戏开始！敌方先手，敌方正在行动...");
      setTimeout(() => this.enemyMove(), 1000);
    }
  }

  toggleEnemyLayout() {
    this.state.showEnemyLayout = !this.state.showEnemyLayout;
    this.refresh();
  }

  toggleAIDebug() {
    this.state.showAIDebug = !this.state.showAIDebug;
    if (this.state.showAIDebug) this.updateProbabilityMap(true);
    this.refresh();
  }

  toggleProbabilityMap() {
    this.state.showProbabilityMap = !this.state.showProbabilityMap;
    this.updateProbabilityMap(true);
    this.refresh();
  }
}
