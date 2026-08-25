import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";
import {
  AIRPLANE_TYPES,
  BOMBS_PER_SIDE,
  allRealHeadsDestroyed,
  attackBoard,
  countPlacementType,
  countType,
  createEmptyBoard,
  deriveEnemyBoard,
  placePlacements,
  randomPlacement,
  revealBomb,
  type Board,
  type PlayerView,
  type PVPConfig,
  type Ship,
  type ShipPlacement,
  type Side,
} from "../shared/pvpGame";

interface PlayerSlot {
  id: string;
  name: string;
  board: Board;
  ships: Ship[];
  ready: boolean;
}

interface PVPStorageState {
  roomId: string;
  config: PVPConfig;
  p1: PlayerSlot | null;
  p2: PlayerSlot | null;
  gameStarted: boolean;
  gameOver: boolean;
  currentTurn: Side | null;
  status: string;
  winner: Side | null;
  bombs: Record<Side, number>;
  firstTurn: Side;
  createdAt: number;
  updatedAt: number;
}

type Result = Record<string, unknown>;

function genToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/* ============ 每房间一个 Durable Object，持有权威游戏状态 ============ */

export class PVPGameRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async load(): Promise<PVPStorageState | null> {
    return (await this.ctx.storage.get<PVPStorageState>("state")) ?? null;
  }

  private async save(state: PVPStorageState | null): Promise<void> {
    if (state) {
      state.updatedAt = Date.now();
      await this.ctx.storage.put("state", state);
    }
  }

  private newState(roomId: string): PVPStorageState {
    return {
      roomId,
      config: { large: 2, small: 1, cross: 1 },
      p1: null,
      p2: null,
      gameStarted: false,
      gameOver: false,
      currentTurn: null,
      status: "房间已创建，等待玩家加入…",
      winner: null,
      bombs: { p1: BOMBS_PER_SIDE, p2: BOMBS_PER_SIDE },
      firstTurn: "p1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private sideOf(state: PVPStorageState, player: string | null | undefined): Side | null {
    if (!player) return null;
    if (state.p1?.id === player) return "p1";
    if (state.p2?.id === player) return "p2";
    return null;
  }

  private isPlacedComplete(slot: PlayerSlot, cfg: PVPConfig): boolean {
    return (
      countType(slot.ships, "large") === cfg.large &&
      countType(slot.ships, "small") === cfg.small &&
      countType(slot.ships, "cross") === cfg.cross
    );
  }

  private buildView(state: PVPStorageState, side: Side): PlayerView {
    const other: Side = side === "p1" ? "p2" : "p1";
    const me = state[side];
    const op = state[other];
    return {
      roomId: state.roomId,
      config: state.config,
      side,
      yourName: me?.name ?? "",
      opponentName: op?.name ?? "等待对手…",
      yourBoard: me?.board ?? createEmptyBoard(),
      enemyBoard: op ? deriveEnemyBoard(op.board) : createEmptyBoard(),
      yourShips: (me?.ships ?? []).map((s) => ({ type: s.type, destroyed: s.destroyed })),
      enemyShipsTotal: op ? op.ships.filter((s) => !s.isDecoy).length : 0,
      enemyShipsDestroyed: op ? op.ships.filter((s) => !s.isDecoy && s.destroyed).length : 0,
      yourBombs: state.bombs[side],
      enemyBombs: op ? state.bombs[other] : 0,
      currentTurn: state.gameStarted ? state.currentTurn : null,
      gameStarted: state.gameStarted,
      gameOver: state.gameOver,
      winner: state.winner,
      yourReady: me?.ready ?? false,
      opponentReady: op?.ready ?? false,
      yourPlaced: me ? this.isPlacedComplete(me, state.config) : false,
      opponentPlaced: op ? this.isPlacedComplete(op, state.config) : false,
      status: state.status,
    };
  }

  /* ---------- 各操作处理器（就地修改 state，返回结果） ---------- */

  private handleCreate(state: PVPStorageState, body: Record<string, unknown>): Result {
    if (state.p1) return { ok: false, error: "房间已存在" };
    state.roomId = String(body.roomId ?? "");
    state.p1 = {
      id: genToken(),
      name: String(body.name || "玩家1"),
      board: createEmptyBoard(),
      ships: [],
      ready: false,
    };
    state.p2 = null;
    state.config = { large: 2, small: 1, cross: 1 };
    state.gameStarted = false;
    state.gameOver = false;
    state.winner = null;
    state.currentTurn = null;
    state.bombs = { p1: BOMBS_PER_SIDE, p2: BOMBS_PER_SIDE };
    state.firstTurn = "p1";
    state.status = "房间已创建，分享房间号邀请好友加入";
    return { ok: true, roomId: state.roomId, playerId: state.p1.id, view: this.buildView(state, "p1") };
  }

  private handleJoin(state: PVPStorageState, body: Record<string, unknown>): Result {
    if (!state.p1) return { ok: false, error: "房间不存在" };
    if (state.p2) return { ok: false, error: "房间已满" };
    state.p2 = {
      id: genToken(),
      name: String(body.name || "玩家2"),
      board: createEmptyBoard(),
      ships: [],
      ready: false,
    };
    state.status = "双方已加入，请布置飞机";
    return { ok: true, roomId: state.roomId, playerId: state.p2.id, view: this.buildView(state, "p2") };
  }

  private handleGetState(state: PVPStorageState, player: string | null): Result {
    const side = this.sideOf(state, player);
    if (!side) return { ok: false, error: "无效玩家" };
    return { ok: true, view: this.buildView(state, side) };
  }

  private handlePlace(state: PVPStorageState, body: Record<string, unknown>): Result {
    const side = this.sideOf(state, body.player as string);
    if (!side) return { ok: false, error: "无效玩家" };
    if (state.gameStarted) return { ok: false, error: "游戏已开始" };
    const slot = state[side]!;
    const placements = (body.ships ?? []) as ShipPlacement[];
    const cfg = state.config;
    if (
      countPlacementType(placements, "large") !== cfg.large ||
      countPlacementType(placements, "small") !== cfg.small ||
      countPlacementType(placements, "cross") !== cfg.cross
    ) {
      return { ok: false, error: "飞机数量与配置不符" };
    }
    if (!placePlacements(slot.board, slot.ships, placements)) {
      return { ok: false, error: "无法放置：位置冲突或越界" };
    }
    slot.ready = false;
    state.status = `${slot.name} 已布置飞机`;
    return { ok: true, view: this.buildView(state, side) };
  }

  private handleRandom(state: PVPStorageState, body: Record<string, unknown>): Result {
    const side = this.sideOf(state, body.player as string);
    if (!side) return { ok: false, error: "无效玩家" };
    if (state.gameStarted) return { ok: false, error: "游戏已开始" };
    const slot = state[side]!;
    const result = randomPlacement(state.config.large, state.config.small, state.config.cross);
    if (!result) return { ok: false, error: "无法生成随机布置，请重试" };
    slot.board = result.board;
    slot.ships = result.ships;
    state.status = `${slot.name} 已随机布置飞机`;
    return { ok: true, view: this.buildView(state, side) };
  }

  private handleReady(state: PVPStorageState, body: Record<string, unknown>): Result {
    const side = this.sideOf(state, body.player as string);
    if (!side) return { ok: false, error: "无效玩家" };
    if (state.gameStarted) return { ok: false, error: "游戏已开始" };
    const slot = state[side]!;
    if (!this.isPlacedComplete(slot, state.config)) {
      return { ok: false, error: "请先布置完所有飞机" };
    }
    slot.ready = true;
    const other: Side = side === "p1" ? "p2" : "p1";
    const otherSlot = state[other];
    if (otherSlot && otherSlot.ready) {
      state.gameStarted = true;
      state.gameOver = false;
      state.currentTurn = state.firstTurn;
      state.status = `游戏开始！轮到 ${state[state.firstTurn]!.name} 攻击`;
    } else {
      state.status = `${slot.name} 已就绪，等待对方布置`;
    }
    return { ok: true, view: this.buildView(state, side) };
  }

  private handleAttack(state: PVPStorageState, body: Record<string, unknown>): Result {
    const side = this.sideOf(state, body.player as string);
    if (!side) return { ok: false, error: "无效玩家" };
    if (!state.gameStarted || state.gameOver) return { ok: false, error: "游戏未开始" };
    if (state.currentTurn !== side) return { ok: false, error: "还没轮到你" };
    const other: Side = side === "p1" ? "p2" : "p1";
    const defender = state[other];
    if (!defender) return { ok: false, error: "对手未加入" };
    const row = Number(body.row);
    const col = Number(body.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 11 || col < 0 || col >= 11) {
      return { ok: false, error: "坐标无效" };
    }
    const cell = defender.board[row][col];
    if (cell === "X" || cell === "O" || cell === "*") {
      return { ok: false, error: "该格子已攻击过" };
    }
    const res = attackBoard(defender.board, defender.ships, row, col);
    const attacker = state[side]!;
    if (allRealHeadsDestroyed(defender.ships)) {
      state.gameOver = true;
      state.winner = side;
      state.currentTurn = null;
      state.status = `${attacker.name} 获胜！已击毁对方所有飞机`;
    } else {
      if (res.result === "headDestroyed") {
        state.status = `${attacker.name} 命中并击毁 ${AIRPLANE_TYPES[res.shipName!].name}！继续攻击`;
      } else if (res.result === "headDecoy") {
        state.status = `${attacker.name} 命中十字飞机，继续攻击`;
      } else if (res.result === "partHit") {
        state.status = `${attacker.name} 命中机身，继续攻击`;
      } else {
        state.status = `${attacker.name} 未命中，轮到对方攻击`;
      }
      if (res.result === "miss") state.currentTurn = other;
    }
    return { ok: true, view: this.buildView(state, side) };
  }

  private handleBomb(state: PVPStorageState, body: Record<string, unknown>): Result {
    const side = this.sideOf(state, body.player as string);
    if (!side) return { ok: false, error: "无效玩家" };
    if (!state.gameStarted || state.gameOver) return { ok: false, error: "游戏未开始" };
    if (state.currentTurn !== side) return { ok: false, error: "还没轮到你" };
    if (state.bombs[side] <= 0) return { ok: false, error: "炸弹已用完" };
    const other: Side = side === "p1" ? "p2" : "p1";
    const defender = state[other];
    if (!defender) return { ok: false, error: "对手未加入" };
    const row = Number(body.row);
    const col = Number(body.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 11 || col < 0 || col >= 11) {
      return { ok: false, error: "坐标无效" };
    }
    const cell = defender.board[row][col];
    if (cell === "X" || cell === "O" || cell === "*" || cell === "R") {
      return { ok: false, error: "该格子已攻击过" };
    }
    state.bombs[side]--;
    const res = revealBomb(defender.board, defender.ships, row, col);
    const attacker = state[side]!;
    if (res.hit) {
      state.status = `${attacker.name} 使用炸弹命中！揭示周围区域，继续攻击`;
    } else {
      state.status = `${attacker.name} 炸弹未命中，轮到对方攻击`;
      state.currentTurn = other;
    }
    return { ok: true, view: this.buildView(state, side) };
  }

  private handleReset(state: PVPStorageState, body: Record<string, unknown>): Result {
    const side = this.sideOf(state, body.player as string);
    if (!side) return { ok: false, error: "无效玩家" };
    for (const s of ["p1", "p2"] as Side[]) {
      if (state[s]) {
        state[s]!.board = createEmptyBoard();
        state[s]!.ships = [];
        state[s]!.ready = false;
      }
    }
    state.gameStarted = false;
    state.gameOver = false;
    state.currentTurn = null;
    state.winner = null;
    state.bombs = { p1: BOMBS_PER_SIDE, p2: BOMBS_PER_SIDE };
    state.status = "游戏已重置，请重新布置";
    return { ok: true, view: this.buildView(state, side) };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    let body: Record<string, unknown> = {};
    if (request.method === "POST" || request.method === "PUT") {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    let state = await this.load();
    let result: Result;

    try {
      switch (path) {
        case "/create": {
          if (state && state.p1) {
            result = { ok: false, error: "房间已存在" };
            break;
          }
          const fresh = this.newState(String(body.roomId ?? ""));
          result = this.handleCreate(fresh, body);
          state = fresh;
          break;
        }
        case "/join":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleJoin(state, body);
          break;
        case "/state":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleGetState(state, url.searchParams.get("player"));
          break;
        case "/place":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handlePlace(state, body);
          break;
        case "/random":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleRandom(state, body);
          break;
        case "/ready":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleReady(state, body);
          break;
        case "/attack":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleAttack(state, body);
          break;
        case "/bomb":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleBomb(state, body);
          break;
        case "/reset":
          if (!state) result = { ok: false, error: "房间不存在" };
          else result = this.handleReset(state, body);
          break;
        default:
          result = { ok: false, error: "未知操作" };
      }
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "服务器错误" };
    }

    await this.save(state);
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

/* ---------- Hono 路由 ---------- */

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newRoomId(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  return s;
}

function roomStub(env: Env, roomId: string) {
  const id = env.PVP_ROOMS.idFromName(roomId);
  return env.PVP_ROOMS.get(id);
}

async function forward(stub: ReturnType<typeof roomStub>, path: string, body: unknown): Promise<Response> {
  return stub.fetch(`https://room${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

// 创建房间
app.post("/api/pvp/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const roomId = body.roomId ? String(body.roomId) : newRoomId();
  const res = await forward(roomStub(c.env, roomId), "/create", { ...body, roomId });
  return res;
});

// 加入房间
app.post("/api/pvp/rooms/:roomId/join", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/join", body);
  return res;
});

// 获取状态（轮询）
app.get("/api/pvp/rooms/:roomId/state", async (c) => {
  const roomId = c.req.param("roomId");
  const player = c.req.query("player") ?? "";
  const stub = roomStub(c.env, roomId);
  const res = await stub.fetch(`https://room/state?player=${encodeURIComponent(player)}`);
  return res;
});

// 提交布置
app.post("/api/pvp/rooms/:roomId/place", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/place", body);
  return res;
});

// 随机布置
app.post("/api/pvp/rooms/:roomId/random", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/random", body);
  return res;
});

// 准备
app.post("/api/pvp/rooms/:roomId/ready", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/ready", body);
  return res;
});

// 攻击
app.post("/api/pvp/rooms/:roomId/attack", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/attack", body);
  return res;
});

// 炸弹
app.post("/api/pvp/rooms/:roomId/bomb", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/bomb", body);
  return res;
});

// 重置
app.post("/api/pvp/rooms/:roomId/reset", async (c) => {
  const roomId = c.req.param("roomId");
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const res = await forward(roomStub(c.env, roomId), "/reset", body);
  return res;
});

export default app;
