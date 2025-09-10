
// server.js  (CommonJS)
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));

const ALLOWED_STAGES = new Set(["router", "db", "chart", "trend", "compose"]);
const ALLOWED_STATUS = new Set(["active", "done"]);

/** 세션별 클라이언트 보관: sessionId -> Set(res) */
const clients = new Map(); // Map<string, Set<Response>>
/** 세션별 마지막 상태 스냅샷: sessionId -> Map<stage, {status, context, payload, at}> */
const snapshots = new Map(); // Map<string, Map<string, object>>

const now = () => new Date().toISOString();

/** SSE 한 건 전송 */
function sendSSE(res, { event = "message", data, id }) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  if (event) res.write(`event: ${event}\n`);
  if (id) res.write(`id: ${id}\n`);
  res.write(`data: ${payload}\n\n`);
}

/** 스냅샷 전송 (신규 구독자에게 최근 상태를 한번에 재생) */
function sendSnapshot(session, res) {
  const map = snapshots.get(session);
  if (!map || map.size === 0) return;
  for (const [stage, info] of map.entries()) {
    sendSSE(res, {
      event: "progress",
      data: { stage, status: info.status, session, context: info.context, payload: info.payload, at: info.at },
    });
  }
}

/** 구독 엔드포인트 */
app.get("/events", (req, res) => {
  const session = String(req.query.session || "default");

  // SSE 권장 헤더
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // Nginx 버퍼링 방지
  });
  res.flushHeaders?.();

  // 세션에 구독자 등록
  const bucket = clients.get(session) || new Set();
  bucket.add(res);
  clients.set(session, bucket);

  console.log(`[${now()}] CONNECT session=${session} (clients=${bucket.size})`);

  // 첫 인사 이벤트
  sendSSE(res, { event: "hello", data: { session, time: now() } });
  // 최근 상태 스냅샷을 즉시 전송
  sendSnapshot(session, res);

  // keep-alive: 주석 라인(: )은 클라이언트에 표시되지 않지만 연결 유지에 유용
  const ka = setInterval(() => {
    res.write(`: keepalive ${now()}\n\n`);
  }, 15000);

  // 연결 종료 처리
  req.on("close", () => {
    clearInterval(ka);
    bucket.delete(res);
    if (bucket.size === 0) clients.delete(session);
    console.log(
      `[${now()}] DISCONNECT session=${session} (remaining=${bucket.size})`
    );
  });
});

/** 입력 검증 */
function validateEmitInput({ session, stage, status }) {
  const errors = [];
  if (!session || typeof session !== "string") errors.push("session must be a non-empty string");
  if (!ALLOWED_STAGES.has(stage)) errors.push(`stage must be one of: ${[...ALLOWED_STAGES].join(", ")}`);
  if (!ALLOWED_STATUS.has(status)) errors.push(`status must be one of: ${[...ALLOWED_STATUS].join(", ")}`);
  return errors;
}

/** 특정 세션으로 진행상황(스테이지) 푸시
 * Body: { session, stage, status, context?, payload? }
 */
app.post("/emit", (req, res) => {
  const {
    session = "default",
    stage = "unknown",
    status = "active",
    context = "",
    payload = {},
  } = req.body || {};

  const errors = validateEmitInput({ session, stage, status });
  if (errors.length) {
    console.warn(`[${now()}] EMIT INVALID`, { session, stage, status, errors });
    return res.status(400).json({ ok: false, errors });
  }

  // 스냅샷 업데이트
  const info = { status, context, payload, at: now() };
  const snap = snapshots.get(session) || new Map();
  snap.set(stage, info);
  snapshots.set(session, snap);

  const targets = clients.get(session);
  const data = { stage, status, session, context, payload, at: info.at };
  let delivered = 0;

  if (targets?.size) {
    for (const r of targets) {
      sendSSE(r, { event: "progress", data });
      delivered++;
    }
  }

  console.log(
    `[${now()}] EMIT stage=${stage} status=${status} session=${session} → delivered=${delivered}`
  );
  res.json({ ok: true, delivered });
});

/** 모든 세션으로 브로드캐스트 (옵션: only=[세션목록]) 
 * Body: { stage, status, context?, payload?, only? }
 */
app.post("/broadcast", (req, res) => {
  const {
    stage = "note",
    status = "active",
    context = "",
    payload = {},
    only = [],
  } = req.body || {};

  // stage/status 검증은 /emit과 동일하게 적용 (원하면 완화 가능)
  const errors = validateEmitInput({ session: "broadcast", stage, status });
  if (errors.length) {
    console.warn(`[${now()}] BROADCAST INVALID`, { stage, status, errors });
    return res.status(400).json({ ok: false, errors });
  }

  const data = { stage, status, context, payload, at: now() };
  let delivered = 0;
  let touchedSessions = 0;

  for (const [session, set] of clients) {
    if (Array.isArray(only) && only.length && !only.includes(session)) continue;
    touchedSessions++;
    // 스냅샷 업데이트
    const snap = snapshots.get(session) || new Map();
    snap.set(stage, { status, context, payload, at: data.at });
    snapshots.set(session, snap);

    for (const r of set) {
      sendSSE(r, { event: "progress", data: { ...data, session } });
      delivered++;
    }
  }

  console.log(
    `[${now()}] BROADCAST stage=${stage} status=${status} sessions=${touchedSessions}/${clients.size} → delivered=${delivered}`
  );
  res.json({ ok: true, delivered, sessions: touchedSessions });
});

app.get("/", (_, res) => res.send("SSE server OK"));
app.get("/health", (_, res) => res.json({ ok: true, time: now(), clients: clients.size }));

const PORT = process.env.PORT || 5679;
app.listen(PORT, () =>
  console.log(`[${now()}] SSE listening on http://localhost:${PORT}`)
);