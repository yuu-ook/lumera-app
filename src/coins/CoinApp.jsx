import { useState, useEffect, useRef } from "react";

// ─── 設定 ─────────────────────────────────────────────────────────────────────
const STORE_KEY = "medal_land_v2";
const OLD_STORE_KEY = "medal_land_v1";
const SIM_KEY = "medal_land_sim";

const WELCOME_BONUS = 300;
// 連続ログイン日数（1〜7日目）ごとの無料コイン
const DAILY_BONUS = [30, 30, 50, 30, 50, 50, 100];

// coins = 有償コイン / bonus = おまけ（無償コイン）
const PACKS = [
  { id: "p1", price: 120, coins: 100, bonus: 0 },
  { id: "p2", price: 490, coins: 400, bonus: 30 },
  { id: "p3", price: 980, coins: 800, bonus: 100, tag: "人気No.1" },
  { id: "p4", price: 2400, coins: 2000, bonus: 350 },
  { id: "p5", price: 4900, coins: 4000, bonus: 900, tag: "おトク" },
  { id: "p6", price: 9800, coins: 8000, bonus: 2200, tag: "最大ボーナス" },
];
const PAY_METHODS = ["クレジットカード", "キャリア決済", "QRコード決済"];

// 予想（Twitchの Predictions と同じルール）
//   ・選択肢は2〜10個、受付時間を過ぎたら締め切り
//   ・1人1つの選択肢にだけ賭けられる（同じ選択肢への追加はOK）
//   ・当たった人で全体の賭け金を、賭けた額に応じて山分け（パリミュチュエル方式）
//   ・中止したら全額返金
const OUTCOME_COLORS = ["#387aff", "#f5009b", "#f59e0b", "#00c27a", "#a970ff", "#14b8a6", "#ef4444", "#84cc16", "#f97316", "#6366f1"];
const MAX_OUTCOMES = 10;
const MAX_BET = 100000;
const DURATIONS = [[30, "30秒"], [60, "1分"], [120, "2分"], [300, "5分"], [600, "10分"], [1800, "30分"]];

const GENRES = ["ゲーム", "雑談", "歌", "料理", "釣り", "フィットネス", "その他"];
const GENRE_ICON = { ゲーム: "🎮", 雑談: "💬", 歌: "🎤", 料理: "🍳", 釣り: "🎣", フィットネス: "💪", その他: "✨" };
const GENRE_TEMPLATES = {
  ゲーム: [["次の試合、勝てる？", ["勝つ", "負ける"]], ["この試合のキル数は？", ["0〜4", "5〜9", "10以上"]], ["ボスを1回で倒せる？", ["倒せる", "無理"]]],
  雑談: [["今日の配信、何時間やる？", ["1時間以内", "1〜2時間", "2時間以上"]], ["次のおみくじは？", ["大吉", "中吉・小吉", "凶"]]],
  歌: [["サビの高音、出せる？", ["出る", "かすれる"]], ["次のリクエスト曲は？", ["バラード", "アップテンポ", "アニソン"]]],
  料理: [["今日の料理、成功する？", ["大成功", "ふつう", "失敗"]], ["完成まで何分かかる？", ["15分以内", "15〜30分", "30分以上"]]],
  釣り: [["30分以内に釣れる？", ["釣れる", "ボウズ"]], ["次に釣れるのは？", ["アジ", "サバ", "まさかの大物"]]],
  フィットネス: [["腕立て100回いける？", ["いける", "途中でギブ"]], ["プランク何分もつ？", ["1分未満", "1〜3分", "3分以上"]]],
  その他: [["この挑戦、成功する？", ["成功", "失敗"]]],
};

// デモ用：最初から登録されている架空の配信者
const SEED_CHANNELS = [
  { handle: "hinata_games", name: "ひなた", genre: "ゲーム", bio: "FPSとパズルゲームを毎晩配信。初見さん大歓迎！", live: true, liveTitle: "ランクマ耐久！今夜こそダイヤ帯へ", followerBase: 12840, viewerBase: 1320, hue: 265 },
  { handle: "kuma_kitchen", name: "くまキッチン", genre: "料理", bio: "冷蔵庫の余りもので深夜ごはん。", live: true, liveTitle: "冷蔵庫の残りで3品つくる", followerBase: 8420, viewerBase: 640, hue: 25 },
  { handle: "tetsu_tsuri", name: "てつ", genre: "釣り", bio: "堤防から夜釣りライブ。", live: true, liveTitle: "大物狙いで朝まで夜釣り", followerBase: 5310, viewerBase: 410, hue: 195 },
  { handle: "riku_training", name: "りく", genre: "フィットネス", bio: "毎日きつめの筋トレ。一緒に動こう。", live: true, liveTitle: "腕立て100回チャレンジ", followerBase: 3920, viewerBase: 280, hue: 140 },
  { handle: "mio_utau", name: "みお", genre: "歌", bio: "弾き語りとリクエスト曲。", live: false, liveTitle: "", followerBase: 15200, viewerBase: 900, hue: 330 },
  { handle: "nana_zatsudan", name: "なな", genre: "雑談", bio: "ゆるっと雑談。お悩み相談も。", live: false, liveTitle: "", followerBase: 2140, viewerBase: 150, hue: 45 },
];

// デモ用：配信を見ている架空の視聴者
const BOT_NAMES = ["mika_chan", "takumi88", "neko_neko", "ryo.live", "sakura_77", "hiro_gg", "yuki.m", "kenta_x",
  "momo_pop", "daichi_01", "aoi_tt", "sora.sky", "rin_rin", "kaito_z", "hana_23", "shun.play", "nagi_x", "kou.tt"];
const BOT_AMOUNTS = [[10, 5], [30, 5], [50, 4], [100, 4], [300, 2], [500, 1.5], [1000, 1], [3000, 0.3]];
const NAME_COLORS = ["#ff7f50", "#9acd32", "#1e90ff", "#ff69b4", "#daa520", "#00ced1", "#b47cff", "#ff4500", "#2e8b57", "#5f9ea0"];

// ─── ユーティリティ ───────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const fmt = (n) => n.toLocaleString("ja-JP");
const fmtShort = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, "")}万` : fmt(n));
const fmtTime = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtUptime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const fmtRatio = (r) => (r ? `1:${r < 10 ? r.toFixed(2) : r.toFixed(1)}` : "—");
const hashStr = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const nameColor = (u) => NAME_COLORS[Math.abs(hashStr(u)) % NAME_COLORS.length];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function pickWeighted(pairs) {
  let r = Math.random() * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[0][0];
}

// ─── 保存データ ───────────────────────────────────────────────────────────────
function seedChannels() {
  const now = Date.now();
  return Object.fromEntries(SEED_CHANNELS.map((c, i) => [c.handle, {
    ...c, followers: [], seeded: true, createdAt: now, liveSince: c.live ? now - (20 + i * 37) * 60000 : null,
  }]));
}
const emptyStore = () => ({ session: null, wallets: {}, channels: seedChannels(), predictions: {} });

function loadStore() {
  try {
    const r = localStorage.getItem(STORE_KEY);
    if (r) return { ...emptyStore(), ...JSON.parse(r) };
    // 前のバージョンのログイン状態とコインは引き継ぐ
    const old = JSON.parse(localStorage.getItem(OLD_STORE_KEY) || "null");
    if (old) return { ...emptyStore(), session: old.session ?? null, wallets: old.wallets ?? {} };
  } catch {}
  return emptyStore();
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }

const newWallet = () => ({
  paid: 0, free: 0, welcomed: false, lastBonusDate: null, streak: 0,
  history: [], joined: 0, wins: 0, maxWin: 0,
});
const walletOf = (s, h) => ({ ...newWallet(), ...s.wallets[h] });
const addHistory = (w, entry) => [{ t: Date.now(), ...entry }, ...w.history].slice(0, 50);

const followerCount = (ch) => ch.followerBase + ch.followers.length;
function viewersOf(ch, s, now) {
  if (!ch.live) return 0;
  if (ch.seeded) return Math.round(ch.viewerBase * (1 + 0.06 * Math.sin(now / 9000 + ch.hue)));
  const p = s.predictions[ch.handle]?.[0];
  return 1 + ch.followers.length + (p ? new Set(p.bets.map((b) => b.user)).size * 3 : 0);
}

// ─── 予想の計算 ───────────────────────────────────────────────────────────────
const latestOf = (s, h) => s.predictions[h]?.[0] ?? null;
const replaceLatest = (s, h, p) => ({ ...s, predictions: { ...s.predictions, [h]: [p, ...(s.predictions[h] ?? []).slice(1)] } });
const poolOf = (p) => p.bets.reduce((a, b) => a + b.amount, 0);
function totalsOf(p) {
  const t = Object.fromEntries(p.outcomes.map((o) => [o.id, 0]));
  for (const b of p.bets) t[b.outcomeId] += b.amount;
  return t;
}
// 賭けを人ごとにまとめる（同じ選択肢への追加賭けを合算）
function bettorsOf(p) {
  const m = new Map();
  for (const b of p.bets) {
    const key = (b.bot ? "bot:" : "") + b.user;
    const u = m.get(key) ?? { user: b.user, bot: !!b.bot, outcomeId: b.outcomeId, amount: 0, free: 0, paid: 0 };
    u.amount += b.amount; u.free += b.free || 0; u.paid += b.paid || 0;
    m.set(key, u);
  }
  return [...m.values()];
}
const myBetOf = (p, me) => bettorsOf(p).find((u) => !u.bot && u.user === me) ?? null;
const phaseOf = (p, now) => (p.status === "open" && now >= p.locksAt ? "locked" : p.status);
const isActive = (p) => !!p && (p.status === "open" || p.status === "locked");

function botBet(p) {
  const user = pick(BOT_NAMES);
  const prev = p.bets.find((b) => b.bot && b.user === user);
  const outcomeId = prev ? prev.outcomeId : pickWeighted(p.outcomes.map((o, i) => [o.id, p.bias[i]]));
  return { ...p, bets: [...p.bets, { user, bot: true, outcomeId, amount: pickWeighted(BOT_AMOUNTS), t: Date.now() }] };
}

function addPrediction(s, h, title, labels, duration, prefill = 0) {
  const t = Date.now();
  let p = {
    id: t.toString(36) + Math.random().toString(36).slice(2, 5), title, duration, createdAt: t, locksAt: t + duration * 1000,
    status: "open", bets: [],
    outcomes: labels.map((label, i) => ({ id: `o${i}`, label, color: OUTCOME_COLORS[i] })),
    bias: labels.map(() => 0.4 + Math.random()), // デモ用：架空の視聴者の偏り
  };
  for (let i = 0; i < prefill; i++) p = botBet(p);
  return { ...s, predictions: { ...s.predictions, [h]: [p, ...(s.predictions[h] ?? [])].slice(0, 15) } };
}

// 結果確定（winnerId）または中止（winnerId = null）
function settle(s, h, winnerId) {
  const p = latestOf(s, h);
  if (!isActive(p)) return s;
  const pool = poolOf(p);
  const winTotal = winnerId ? totalsOf(p)[winnerId] : 0;
  const winLabel = winnerId && p.outcomes.find((o) => o.id === winnerId).label;
  const wallets = { ...s.wallets };
  let top = null;

  for (const u of bettorsOf(p)) {
    const payout = !winnerId ? u.amount : u.outcomeId === winnerId ? Math.floor((u.amount * pool) / winTotal) : 0;
    if (winnerId && payout && (!top || payout > top.payout)) top = { user: u.user, payout };
    if (u.bot || !payout) continue;
    const w = walletOf(s, u.user);
    // 賭けた分は元の有償/無償に戻し、増えた分は無償コインとして加算
    const profit = payout - u.amount;
    wallets[u.user] = {
      ...w,
      paid: w.paid + u.paid,
      free: w.free + u.free + profit,
      ...(winnerId ? { wins: w.wins + 1, maxWin: Math.max(w.maxWin, payout) } : {}),
      history: addHistory(w, { label: winnerId ? `@${h} の予想が的中「${winLabel}」` : `@${h} の予想の中止による返金`, coins: payout }),
    };
  }
  const ended = { ...p, status: winnerId ? "resolved" : "canceled", winnerId, top, endedAt: Date.now() };
  return { ...replaceLatest(s, h, ended), wallets };
}

// デモ用：架空の視聴者が賭け、架空の配信者は予想を自動で出して結果も出す
function simTick(s) {
  const now = Date.now();
  let out = s;
  for (const ch of Object.values(s.channels)) {
    if (!ch.live) continue;
    const h = ch.handle;
    const p = latestOf(out, h);
    if (p?.status === "open" && now >= p.locksAt) { out = replaceLatest(out, h, { ...p, status: "locked" }); continue; }
    if (p?.status === "open") {
      if (Math.random() < (ch.seeded ? 0.45 : 0.65)) out = replaceLatest(out, h, botBet(p));
      continue;
    }
    if (!ch.seeded) continue; // あなたのチャンネルの予想は、あなたが操作する
    if (p?.status === "locked" && now >= p.locksAt + 8000) {
      out = settle(out, h, pickWeighted(p.outcomes.map((o, i) => [o.id, p.bias[i]])));
      continue;
    }
    if (!isActive(p) && now >= (p?.endedAt ?? 0) + 12000) {
      const [title, labels] = pick(GENRE_TEMPLATES[ch.genre] ?? GENRE_TEMPLATES.その他);
      out = addPrediction(out, h, title, labels, 60 + Math.floor(Math.random() * 90), 3 + Math.floor(Math.random() * 6));
    }
  }
  return out;
}

// 複数タブで開いたときに、架空視聴者の動きが二重にならないよう1タブだけが担当する
const TAB_ID = Math.random().toString(36).slice(2);
function claimSim() {
  try {
    const now = Date.now();
    const r = JSON.parse(localStorage.getItem(SIM_KEY) || "null");
    if (!r || r.id === TAB_ID || now - r.t > 3000) {
      localStorage.setItem(SIM_KEY, JSON.stringify({ id: TAB_ID, t: now }));
      return true;
    }
    return false;
  } catch { return true; }
}

// ─── デモ用 TikTokログイン ────────────────────────────────────────────────────
// 本番では TikTok Login Kit (OAuth 2.0) に差し替える：
//   1. /auth/tiktok へリダイレクト → TikTokの認可画面
//   2. コールバックでサーバーが code を access_token に交換
//   3. user.info.basic から open_id / display_name / avatar_url を取得
// ここではその結果と同じ形のユーザー情報を、入力された名前から作るだけ。
const cleanHandle = (raw) => raw.trim().replace(/^@+/, "").toLowerCase();
function demoTikTokLogin(rawHandle) {
  const handle = cleanHandle(rawHandle) || "guest";
  return { openId: `demo-${handle}`, handle, name: `@${handle}` };
}

// ─── フック ───────────────────────────────────────────────────────────────────
function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function useCountUp(value) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, diff = value - start;
    if (!diff) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 500);
      const v = Math.round(start + diff * (1 - Math.pow(1 - k, 3)));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

// ─── 小さな部品 ───────────────────────────────────────────────────────────────
function Coin({ size = 20 }) {
  return <span className="coin" style={{ width: size, height: size, fontSize: size * 0.55 }}>M</span>;
}

function Avatar({ ch, size = 40, ring = false }) {
  return (
    <span className={`avatar ${ring && ch.live ? "ring" : ""}`} style={{ "--h": ch.hue, width: size, height: size, fontSize: size * 0.42 }}>
      {ch.name[0]}
    </span>
  );
}

function LiveBadge({ small }) {
  return <span className={`live-badge ${small ? "sm" : ""}`}>LIVE</span>;
}

function FollowButton({ following, onClick, compact }) {
  return (
    <button type="button" className={`follow-btn ${following ? "on" : ""} ${compact ? "compact" : ""}`} onClick={onClick}>
      {following ? "♥ 登録済み" : "♡ チャンネル登録"}
    </button>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function CoinRain() {
  return (
    <div className="rain" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.09}s` }}>
          <Coin size={18 + (i % 3) * 6} />
        </span>
      ))}
    </div>
  );
}

function StatusPill({ p, now }) {
  const phase = phaseOf(p, now);
  const text = {
    open: `受付中 ${fmtClock(p.locksAt - now)}`,
    locked: "受付終了・結果待ち",
    resolved: "結果発表",
    canceled: "中止（返金済み）",
  }[phase];
  return <span className={`pill ${phase}`}>{phase === "open" && <i className="dot" />}{text}</span>;
}

// 選択肢ごとの表示（賭け金の割合・倍率・人数）
function OutcomeBars({ p, now, selected, onSelect, myBet }) {
  const t = totalsOf(p);
  const pool = poolOf(p);
  const counts = {};
  for (const u of bettorsOf(p)) counts[u.outcomeId] = (counts[u.outcomeId] || 0) + 1;
  const phase = phaseOf(p, now);
  const Tag = onSelect ? "button" : "div";

  return (
    <div className={`outcomes ${p.outcomes.length === 2 ? "two" : ""}`}>
      {p.outcomes.map((o) => {
        const pct = pool ? Math.round((t[o.id] / pool) * 100) : 0;
        const won = p.winnerId === o.id;
        const lost = phase === "resolved" && !won;
        const locked = myBet && myBet.outcomeId !== o.id;
        return (
          <Tag
            key={o.id}
            className={`outcome ${selected === o.id ? "sel" : ""} ${won ? "won" : ""} ${lost ? "lost" : ""}`}
            style={{ "--c": o.color }}
            {...(onSelect ? { type: "button", disabled: phase !== "open" || locked, onClick: () => onSelect(o.id) } : {})}
          >
            <div className="o-top">
              <b>{won && "🏆 "}{o.label}</b>
              {myBet?.outcomeId === o.id && <em className="mine">あなた</em>}
            </div>
            <div className="o-pct">{pct}%</div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="o-meta">
              <span><Coin size={12} /> {fmt(t[o.id])}</span>
              <span>🏆 {fmtRatio(t[o.id] ? pool / t[o.id] : null)}</span>
              <span>👤 {counts[o.id] || 0}</span>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

function TimerBar({ p, now }) {
  if (phaseOf(p, now) !== "open") return null;
  const left = Math.max(0, (p.locksAt - now) / (p.duration * 1000));
  return <div className="timer-bar"><i style={{ width: `${left * 100}%` }} /></div>;
}

// チャット風の参加ログ（予想の開始・参加・締め切り・結果）
function chatEvents(preds, limit = 40) {
  const ev = [];
  for (const p of preds.slice(0, 3)) {
    ev.push({ t: p.createdAt, kind: "start", text: `予想が始まりました「${p.title}」` });
    for (const b of p.bets) {
      const o = p.outcomes.find((x) => x.id === b.outcomeId);
      ev.push({ t: b.t, kind: "bet", user: b.user, label: o.label, color: o.color, amount: b.amount });
    }
    if (p.status !== "open") ev.push({ t: Math.min(p.locksAt, p.endedAt ?? Infinity), kind: "lock", text: "予想の受付が終了しました" });
    if (p.status === "resolved") {
      const w = p.outcomes.find((o) => o.id === p.winnerId);
      ev.push({ t: p.endedAt, kind: "result", text: `結果は「${w.label}」！${p.top ? ` 最高配当 @${p.top.user} ${fmt(p.top.payout)}` : ""}` });
    }
    if (p.status === "canceled") ev.push({ t: p.endedAt, kind: "lock", text: "予想は中止され、全額返金されました" });
  }
  return ev.sort((a, b) => a.t - b.t).slice(-limit);
}

function ChatPanel({ preds, title = "チャット" }) {
  const events = chatEvents(preds);
  const box = useRef(null);
  const last = events.length ? events[events.length - 1].t : 0;
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [last, events.length]);

  return (
    <section className="chat">
      <header className="chat-head">{title}</header>
      <div className="chat-body" ref={box}>
        {events.length === 0 && <p className="chat-empty">まだ動きはありません。予想が始まるとここに流れます。</p>}
        {events.map((e, i) =>
          e.kind === "bet" ? (
            <p key={i} className="msg">
              <b style={{ color: nameColor(e.user) }}>{e.user}</b>
              <span>: <em style={{ color: e.color }}>{e.label}</em> に <Coin size={12} /> {fmt(e.amount)} を予想</span>
            </p>
          ) : (
            <p key={i} className={`msg sys ${e.kind}`}>{e.kind === "result" ? "🏆 " : "🎯 "}{e.text}</p>
          )
        )}
      </div>
    </section>
  );
}

// ─── 配信に重ねる表示（オーバーレイ） ─────────────────────────────────────────
function OverlayCard({ p, now, ch }) {
  if (!p) {
    return (
      <div className="ov ov-idle">
        <div className="ov-brand">🎯 予想</div>
        <p>次の予想をお楽しみに！</p>
        {ch && <small>@{ch.handle} のチャンネルから参加できます</small>}
      </div>
    );
  }
  const phase = phaseOf(p, now);
  const winner = p.outcomes.find((o) => o.id === p.winnerId);
  return (
    <div className={`ov ${phase}`}>
      <div className="ov-head">
        <span className="ov-brand">🎯 予想{ch ? ` · @${ch.handle}` : ""}</span>
        <StatusPill p={p} now={now} />
      </div>
      <h3 className="ov-title">{p.title}</h3>
      <TimerBar p={p} now={now} />
      <OutcomeBars p={p} now={now} />
      {phase === "resolved" && (
        <div className="ov-result">
          結果：<b style={{ color: winner.color }}>{winner.label}</b>
          {p.top && <span>最高配当 @{p.top.user} <Coin size={14} /> {fmt(p.top.payout)}</span>}
        </div>
      )}
      <div className="ov-foot">
        <span>合計 <Coin size={14} /> {fmt(poolOf(p))}</span>
        {ch && <span>参加は MEDAL LAND の @{ch.handle} から</span>}
      </div>
    </div>
  );
}

function OverlayPage({ store }) {
  const now = useNow();
  const ch = store.session ? store.channels[store.session.handle] : null;
  return (
    <div className="ov-page">
      {ch ? <OverlayCard p={latestOf(store, ch.handle)} now={now} ch={ch} /> : <p className="muted">配信者ダッシュボードでチャンネルを登録すると、ここに予想が表示されます。</p>}
      <a className="ov-back" href="#">← アプリに戻る</a>
    </div>
  );
}

// ─── ログイン画面 ─────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [consent, setConsent] = useState(false);
  const [handle, setHandle] = useState("");

  return (
    <div className="login">
      <div className="marquee">
        <div className="logo-coins"><Coin size={34} /><Coin size={52} /><Coin size={34} /></div>
        <h1 className="logo">MEDAL<span>LAND</span></h1>
        <p className="tagline">TikTok配信を予想で盛り上げよう</p>
      </div>

      <div className="login-perks">
        <div><b>はじめてボーナス</b><span><Coin size={16} /> {fmt(WELCOME_BONUS)}</span></div>
        <div><b>毎日ログインボーナス</b><span><Coin size={16} /> 最大 {fmt(Math.max(...DAILY_BONUS))}</span></div>
        <div><b>好きな配信者をチャンネル登録</b><span>♥</span></div>
      </div>

      <button className="btn tiktok" onClick={() => setConsent(true)}>
        <span className="note">♪</span> TikTokでログイン
      </button>
      <p className="fine">ログインすると無料コインがもらえます</p>

      {consent && (
        <Modal onClose={() => setConsent(false)}>
          <div className="demo-badge">デモ</div>
          <h2>TikTokアカウントで続行</h2>
          <p className="muted">これはデモ画面です。実際のTikTok認証は行われず、入力した名前でログインします。</p>
          <form onSubmit={(e) => { e.preventDefault(); onLogin(demoTikTokLogin(handle)); }}>
            <label className="field">
              <span>@</span>
              <input
                id="login-handle" autoFocus value={handle} maxLength={24} placeholder="tiktok_user"
                onChange={(e) => setHandle(e.target.value.replace(/[^\w.]/g, ""))}
              />
            </label>
            <ul className="scopes"><li>プロフィール名とアイコンの読み取り</li></ul>
            <button className="btn gold" type="submit">許可してログイン</button>
            <button className="btn ghost" type="button" onClick={() => setConsent(false)}>キャンセル</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── ボーナスのモーダル ───────────────────────────────────────────────────────
function WelcomeModal({ onClaim }) {
  return (
    <Modal>
      <CoinRain />
      <div className="ribbon">WELCOME</div>
      <h2>はじめてボーナス</h2>
      <div className="big-amount"><Coin size={40} /> {fmt(WELCOME_BONUS)}</div>
      <p className="muted">無料コインをプレゼント！配信者の予想に参加してみよう。</p>
      <button className="btn gold" onClick={onClaim}>受け取る</button>
    </Modal>
  );
}

function DailyModal({ day, onClaim }) {
  return (
    <Modal>
      <div className="ribbon">DAILY BONUS</div>
      <h2>ログインボーナス {day}日目</h2>
      <div className="days">
        {DAILY_BONUS.map((amt, i) => (
          <div key={i} className={`day ${i + 1 < day ? "got" : ""} ${i + 1 === day ? "now" : ""}`}>
            <small>{i + 1}日目</small>
            <Coin size={i === 6 ? 26 : 20} />
            <b>{i + 1 < day ? "✓" : amt}</b>
          </div>
        ))}
      </div>
      <p className="muted">毎日ログインでコインが増える。7日目は大ボーナス！</p>
      <button className="btn gold" onClick={onClaim}><Coin size={20} /> {DAILY_BONUS[day - 1]} を受け取る</button>
    </Modal>
  );
}

// ─── 視聴者：ホーム（配信者一覧） ─────────────────────────────────────────────
function LiveCard({ ch, s, now, me, onOpen }) {
  const p = latestOf(s, ch.handle);
  const open = p && phaseOf(p, now) === "open";
  return (
    <button type="button" className="live-card" onClick={() => onOpen(ch.handle)}>
      <div className="thumb" style={{ "--h": ch.hue }}>
        <span className="thumb-icon">{GENRE_ICON[ch.genre] ?? "✨"}</span>
        <span className="thumb-tl"><LiveBadge /></span>
        <span className="thumb-bl">👁 {fmt(viewersOf(ch, s, now))}人</span>
        {open && <span className="thumb-tr">🎯 予想受付中</span>}
      </div>
      <div className="lc-info">
        <Avatar ch={ch} size={36} />
        <div className="lc-text">
          <b className="lc-title">{ch.liveTitle || "配信中"}</b>
          <span className="lc-name">{ch.name}{ch.handle === me && <em className="you">あなた</em>}</span>
          <span className="tag">{ch.genre}</span>
        </div>
      </div>
    </button>
  );
}

function ChannelRow({ ch, s, now, me, onOpen, onFollow }) {
  const following = ch.followers.includes(me);
  return (
    <li className="ch-row">
      <button type="button" className="ch-row-main" onClick={() => onOpen(ch.handle)}>
        <Avatar ch={ch} size={48} ring />
        <span className="ch-row-text">
          <b>{ch.name}{ch.handle === me && <em className="you">あなた</em>}</b>
          <small>@{ch.handle} ・ {ch.genre} ・ 登録者 {fmtShort(followerCount(ch))}人</small>
          <small className={ch.live ? "is-live" : ""}>{ch.live ? `● 配信中 ${fmt(viewersOf(ch, s, now))}人が視聴` : "オフライン"}</small>
        </span>
      </button>
      {ch.handle !== me && <FollowButton compact following={following} onClick={() => onFollow(ch.handle)} />}
    </li>
  );
}

function HomeView({ s, now, me, onOpen, onFollow }) {
  const [genre, setGenre] = useState("すべて");
  const [q, setQ] = useState("");
  const all = Object.values(s.channels);
  const followedLive = all.filter((c) => c.live && c.followers.includes(me));
  const live = all.filter((c) => c.live).sort((a, b) => viewersOf(b, s, now) - viewersOf(a, s, now));
  const query = q.trim().toLowerCase();
  const list = all
    .filter((c) => genre === "すべて" || c.genre === genre)
    .filter((c) => !query || c.name.toLowerCase().includes(query) || c.handle.includes(query))
    .sort((a, b) => Number(b.live) - Number(a.live) || followerCount(b) - followerCount(a));

  return (
    <div className="home">
      {followedLive.length > 0 && (
        <section>
          <h2 className="section">登録チャンネルのライブ</h2>
          <div className="story-row">
            {followedLive.map((c) => (
              <button key={c.handle} type="button" className="story" onClick={() => onOpen(c.handle)}>
                <Avatar ch={c} size={60} ring />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section">配信中のチャンネル <span className="count">{live.length}</span></h2>
        {live.length === 0 ? (
          <p className="muted">今は誰も配信していません。</p>
        ) : (
          <div className="live-grid">
            {live.map((c) => <LiveCard key={c.handle} ch={c} s={s} now={now} me={me} onOpen={onOpen} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="section">登録しているTikToker <span className="count">{all.length}</span></h2>
        <label className="search">
          <span aria-hidden="true">🔍</span>
          <input id="search-channels" value={q} placeholder="名前やIDでさがす" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips genre-chips">
          {["すべて", ...GENRES].map((g) => (
            <button key={g} type="button" className={genre === g ? "on" : ""} onClick={() => setGenre(g)}>
              {g !== "すべて" && `${GENRE_ICON[g]} `}{g}
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="muted">条件に合う配信者がいません。</p>}
        <ul className="ch-list">
          {list.map((c) => <ChannelRow key={c.handle} ch={c} s={s} now={now} me={me} onOpen={onOpen} onFollow={onFollow} />)}
        </ul>
      </section>
    </div>
  );
}

function FollowingView({ s, now, me, onOpen, onFollow, goHome }) {
  const list = Object.values(s.channels)
    .filter((c) => c.followers.includes(me))
    .sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name, "ja"));
  if (!list.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">♡</div>
        <h2>まだチャンネル登録していません</h2>
        <p className="muted">好きな配信者をチャンネル登録すると、ここにまとまります。配信が始まるとすぐ分かります。</p>
        <button className="btn ghost" onClick={goHome}>配信者をさがす</button>
      </div>
    );
  }
  return (
    <div>
      <h2 className="section">登録チャンネル <span className="count">{list.length}</span></h2>
      <ul className="ch-list">
        {list.map((c) => <ChannelRow key={c.handle} ch={c} s={s} now={now} me={me} onOpen={onOpen} onFollow={onFollow} />)}
      </ul>
    </div>
  );
}

// ─── 視聴者：チャンネル画面 ───────────────────────────────────────────────────
function PredictionPanel({ p, now, me, total, onBet, onNeedCoins }) {
  const [selected, setSelected] = useState(null);
  const [amountText, setAmountText] = useState("100");
  useEffect(() => { setSelected(null); }, [p?.id]);

  if (!p) {
    return (
      <section className="pred empty">
        <header className="pred-bar"><span>🎯 予想</span></header>
        <p className="muted">この配信ではまだ予想が出ていません。配信者が予想を出すとここで参加できます。</p>
      </section>
    );
  }

  const myBet = myBetOf(p, me);
  const phase = phaseOf(p, now);
  const sel = myBet?.outcomeId ?? selected;
  const selOutcome = p.outcomes.find((o) => o.id === sel);
  const amount = Math.floor(Number(amountText)) || 0;
  const room = MAX_BET - (myBet?.amount || 0);
  const t = totalsOf(p);
  const pool = poolOf(p);
  const estimate = sel && amount > 0 ? Math.floor((((myBet?.amount || 0) + amount) * (pool + amount)) / (t[sel] + amount)) : 0;
  const short = amount > total;

  let myResult = null;
  if (myBet && phase === "resolved") {
    const won = myBet.outcomeId === p.winnerId;
    myResult = { won, coins: won ? Math.floor((myBet.amount * pool) / t[p.winnerId]) : myBet.amount };
  }

  return (
    <section className="pred">
      <header className="pred-bar">
        <span>🎯 予想</span>
        <StatusPill p={p} now={now} />
      </header>
      <TimerBar p={p} now={now} />
      <div className="pred-body">
        <div className="pred-head">
          <h2 className="pred-title">{p.title}</h2>
          <span className="pool"><small>合計</small><Coin size={16} /> {fmt(pool)}</span>
        </div>
        <OutcomeBars p={p} now={now} selected={sel} myBet={myBet} onSelect={phase === "open" ? setSelected : null} />

        {phase === "open" && !sel && <p className="hint">当たると思う選択肢をタップして参加</p>}

        {phase === "open" && sel && (
          <div className="betbox" style={{ "--c": selOutcome.color }}>
            <div className="betbox-head">
              <span><b style={{ color: selOutcome.color }}>{selOutcome.label}</b> に{myBet ? "追加で" : ""}賭ける</span>
              {myBet && <small>賭け済み <Coin size={12} /> {fmt(myBet.amount)}</small>}
            </div>
            <label className="field amount-field">
              <Coin size={20} />
              <input id="bet-amount" inputMode="numeric" value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </label>
            <div className="chips">
              {[10, 100, 1000].map((n) => (
                <button key={n} type="button" onClick={() => setAmountText(String(Math.min(room, amount + n)))}>+{fmt(n)}</button>
              ))}
              <button type="button" onClick={() => setAmountText(String(Math.max(0, Math.min(total, room))))}>全部</button>
            </div>
            {amount > 0 && !short && (
              <p className="estimate">
                今当たると <Coin size={14} /> <b>{fmt(estimate)}</b> もらえる見込み
                <small>（締め切りまで変動します）</small>
              </p>
            )}
            <button className="btn primary" disabled={amount <= 0 || amount > room} onClick={() => (short ? onNeedCoins() : onBet(sel, amount))}>
              {short ? "コインが足りません（買い足す）" : <>予想する <Coin size={18} /> {fmt(amount)}</>}
            </button>
            {!myBet && <button className="btn ghost" onClick={() => setSelected(null)}>選び直す</button>}
          </div>
        )}

        {phase === "locked" && (
          <div className="notice">
            受付は終了しました。配信者が結果を出すのを待っています。
            {myBet && <div>あなたの予想：<b>{p.outcomes.find((o) => o.id === myBet.outcomeId).label}</b> <Coin size={14} /> {fmt(myBet.amount)}</div>}
          </div>
        )}
        {phase === "resolved" && (
          <div className={`notice result ${myResult?.won ? "win" : ""}`}>
            {myResult?.won && <CoinRain />}
            {!myResult && <>結果は <b>{p.outcomes.find((o) => o.id === p.winnerId).label}</b> でした。次の予想に参加しよう！</>}
            {myResult?.won && <>🎉 的中！ <Coin size={18} /> <b>{fmt(myResult.coins)}</b> を受け取りました</>}
            {myResult && !myResult.won && <>ざんねん…はずれ（<Coin size={14} /> {fmt(myResult.coins)}）</>}
          </div>
        )}
        {phase === "canceled" && <div className="notice">この予想は中止されました。{myBet && "賭けたコインは全額返金済みです。"}</div>}
      </div>
    </section>
  );
}

function ChannelView({ ch, s, now, me, total, onBack, onFollow, onBet, onNeedCoins }) {
  const preds = s.predictions[ch.handle] ?? [];
  const p = preds[0] ?? null;
  const past = preds.filter((x) => x.status === "resolved").slice(p?.status === "resolved" ? 1 : 0, 6);
  const following = ch.followers.includes(me);
  const isMine = ch.handle === me;

  return (
    <div className="channel">
      <button type="button" className="back" onClick={onBack}>← 配信者一覧</button>
      <div className="ch-layout">
        <div className="ch-main">
          <div className={`player ${ch.live ? "" : "offline"}`} style={{ "--h": ch.hue }}>
            <span className="player-icon">{GENRE_ICON[ch.genre] ?? "✨"}</span>
            {ch.live ? (
              <>
                <span className="thumb-tl"><LiveBadge /></span>
                <span className="thumb-bl">👁 {fmt(viewersOf(ch, s, now))}人 ・ {fmtUptime(now - (ch.liveSince ?? now))}</span>
                <a className="player-link" href={`https://www.tiktok.com/@${ch.handle}/live`} target="_blank" rel="noreferrer">
                  ▶ TikTokで配信を見る
                </a>
              </>
            ) : (
              <span className="player-off">オフライン</span>
            )}
          </div>

          <div className="ch-info">
            <Avatar ch={ch} size={64} ring />
            <div className="ch-info-text">
              <h1>{ch.name}{isMine && <em className="you">あなた</em>}</h1>
              <small>@{ch.handle} ・ 登録者 {fmt(followerCount(ch))}人</small>
              {ch.live && <p className="ch-live-title">{ch.liveTitle}</p>}
              <span className="tag">{GENRE_ICON[ch.genre]} {ch.genre}</span>
            </div>
            {!isMine && <FollowButton following={following} onClick={() => onFollow(ch.handle)} />}
          </div>

          <PredictionPanel p={p} now={now} me={me} total={total} onBet={(o, a) => onBet(ch.handle, o, a)} onNeedCoins={onNeedCoins} />
        </div>

        <aside className="ch-side">
          <ChatPanel preds={preds} />
          <section className="about">
            <h3>{ch.name} について</h3>
            <p>{ch.bio || "自己紹介はまだありません。"}</p>
          </section>
          {past.length > 0 && (
            <section className="about">
              <h3>これまでの予想</h3>
              <ul className="past">
                {past.map((x) => {
                  const w = x.outcomes.find((o) => o.id === x.winnerId);
                  return (
                    <li key={x.id}>
                      <span>{x.title}</span>
                      <b style={{ color: w.color }}>{w.label}</b>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
      <p className="fine legal">
        ※ デモ版です。有償コインを賭けられる仕様は、公開前に法令（賭博罪・資金決済法など）への適合を専門家に確認する必要があります。
      </p>
    </div>
  );
}

// ─── 配信者ダッシュボード ─────────────────────────────────────────────────────
function StudioRegister({ me, onRegister }) {
  const [name, setName] = useState(me);
  const [genre, setGenre] = useState("ゲーム");
  const [bio, setBio] = useState("");
  return (
    <div className="studio-register">
      <section className="panel">
        <h2>チャンネルを登録する</h2>
        <p className="muted">
          登録すると視聴者の「配信者一覧」に表示され、チャンネル登録してもらえるようになります。配信中は予想を出せます。
        </p>
        <label className="lbl" htmlFor="reg-id">TikTok ID</label>
        <input id="reg-id" className="input" value={`@${me}`} readOnly />
        <label className="lbl" htmlFor="reg-name">表示名</label>
        <input id="reg-name" className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <span className="lbl">ジャンル</span>
        <div className="chips genre-chips">
          {GENRES.map((g) => (
            <button key={g} type="button" className={genre === g ? "on" : ""} onClick={() => setGenre(g)}>{GENRE_ICON[g]} {g}</button>
          ))}
        </div>
        <label className="lbl" htmlFor="reg-bio">自己紹介</label>
        <textarea id="reg-bio" className="input" rows={3} maxLength={120} value={bio} placeholder="どんな配信をしているか書きましょう"
          onChange={(e) => setBio(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()} onClick={() => onRegister({ name: name.trim(), genre, bio: bio.trim() })}>
          チャンネルを登録する（TikTok連携・デモ）
        </button>
      </section>
      <section className="panel steps">
        <h3>使い方</h3>
        <ol>
          <li>チャンネルを登録する（TikTokアカウントと連携）</li>
          <li>TikTokで配信を始めたら、ここで「配信を開始」を押す</li>
          <li>予想を出す → 視聴者がコインで参加する</li>
          <li>結果が出たら勝った選択肢を選ぶ → 自動で山分けされる</li>
        </ol>
      </section>
    </div>
  );
}

function PredictionControl({ ch, p, now, onCreate, onLock, onResolve, onCancel }) {
  const active = isActive(p);
  const [title, setTitle] = useState("");
  const [outcomes, setOutcomes] = useState(["", ""]);
  const [duration, setDuration] = useState(120);
  const [winner, setWinner] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => { setWinner(null); setConfirmCancel(false); }, [p?.id, p?.status]);

  const templates = [...(GENRE_TEMPLATES[ch.genre] ?? []), ...GENRE_TEMPLATES.その他];
  const valid = title.trim() && outcomes.filter((o) => o.trim()).length >= 2;
  const create = () => {
    onCreate(title.trim(), outcomes.map((o) => o.trim()).filter(Boolean), duration);
    setTitle(""); setOutcomes(["", ""]);
  };

  if (!ch.live) {
    return (
      <section className="panel">
        <h2>予想</h2>
        <p className="muted">配信を開始すると予想を出せます。</p>
      </section>
    );
  }

  if (active) {
    const phase = phaseOf(p, now);
    return (
      <section className="panel">
        <h2>進行中の予想</h2>
        <OverlayCard p={p} now={now} ch={ch} />
        {phase === "open" && <button className="btn primary" onClick={onLock}>受付を締め切る（残り {fmtClock(p.locksAt - now)}）</button>}
        {phase === "locked" && (
          <div className="resolve">
            <h3>結果を選んでください</h3>
            <div className="resolve-grid">
              {p.outcomes.map((o) => (
                <button key={o.id} type="button" className={winner === o.id ? "on" : ""} style={{ "--c": o.color }} onClick={() => setWinner(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
            <button className="btn primary" disabled={!winner} onClick={() => onResolve(winner)}>
              {winner ? `「${p.outcomes.find((o) => o.id === winner).label}」で確定して配当する` : "勝った選択肢を選ぶ"}
            </button>
          </div>
        )}
        {confirmCancel ? (
          <div className="confirm">
            <p>予想を中止して、全員に全額返金しますか？</p>
            <div className="confirm-row">
              <button className="btn ghost" onClick={() => setConfirmCancel(false)}>やめる</button>
              <button className="btn danger" onClick={onCancel}>中止して返金</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setConfirmCancel(true)}>予想を中止する</button>
        )}
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>予想を出す</h2>
      <div className="tpl">
        {templates.map(([tt, labels]) => (
          <button key={tt} type="button" onClick={() => { setTitle(tt); setOutcomes(labels); }}>{tt}</button>
        ))}
      </div>
      <label className="lbl" htmlFor="pred-title">質問</label>
      <input id="pred-title" className="input" value={title} maxLength={45} placeholder="例：この勝負、勝てる？" onChange={(e) => setTitle(e.target.value)} />
      <span className="lbl">選択肢（2〜{MAX_OUTCOMES}個）</span>
      <div className="o-inputs">
        {outcomes.map((o, i) => (
          <div key={i} className="o-input" style={{ "--c": OUTCOME_COLORS[i] }}>
            <i />
            <input id={`outcome-${i}`} className="input" value={o} maxLength={25} placeholder={`選択肢 ${i + 1}`}
              onChange={(e) => setOutcomes(outcomes.map((x, j) => (j === i ? e.target.value : x)))} />
            {outcomes.length > 2 && (
              <button type="button" aria-label="選択肢を削除" onClick={() => setOutcomes(outcomes.filter((_, j) => j !== i))}>×</button>
            )}
          </div>
        ))}
        {outcomes.length < MAX_OUTCOMES && (
          <button type="button" className="add-o" onClick={() => setOutcomes([...outcomes, ""])}>＋ 選択肢を追加</button>
        )}
      </div>
      <span className="lbl">受付時間</span>
      <div className="chips">
        {DURATIONS.map(([sec, label]) => (
          <button key={sec} type="button" className={duration === sec ? "on" : ""} onClick={() => setDuration(sec)}>{label}</button>
        ))}
      </div>
      <button className="btn primary" disabled={!valid} onClick={create}>予想を開始する</button>
    </section>
  );
}

function StudioLive({ ch, s, now, onGoLive, onEndLive, ...ctl }) {
  const [liveTitle, setLiveTitle] = useState(ch.liveTitle || "");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const preds = s.predictions[ch.handle] ?? [];
  const p = preds[0] ?? null;

  return (
    <div className="studio-grid">
      <div className="studio-col">
        <section className={`panel live-panel ${ch.live ? "on" : ""}`}>
          {ch.live ? (
            <>
              <div className="live-now">
                <LiveBadge />
                <b>{ch.liveTitle}</b>
              </div>
              <div className="kpis">
                <div><small>配信時間</small><b>{fmtUptime(now - ch.liveSince)}</b></div>
                <div><small>視聴者</small><b>{fmt(viewersOf(ch, s, now))}</b></div>
                <div><small>登録者</small><b>{fmt(followerCount(ch))}</b></div>
              </div>
              {confirmEnd ? (
                <div className="confirm">
                  <p>配信を終了しますか？{isActive(p) && "進行中の予想は中止され、全額返金されます。"}</p>
                  <div className="confirm-row">
                    <button className="btn ghost" onClick={() => setConfirmEnd(false)}>やめる</button>
                    <button className="btn danger" onClick={() => { setConfirmEnd(false); onEndLive(); }}>配信を終了</button>
                  </div>
                </div>
              ) : (
                <button className="btn ghost" onClick={() => setConfirmEnd(true)}>配信を終了する</button>
              )}
            </>
          ) : (
            <>
              <h2>配信を始める</h2>
              <p className="muted">TikTokでライブを始めたら、ここも「配信を開始」にしてください。視聴者の一覧で「配信中」になります。</p>
              <label className="lbl" htmlFor="live-title">配信タイトル</label>
              <input id="live-title" className="input" value={liveTitle} maxLength={40} placeholder="例：ランクマ耐久配信"
                onChange={(e) => setLiveTitle(e.target.value)} />
              <button className="btn tiktok" disabled={!liveTitle.trim()} onClick={() => onGoLive(liveTitle.trim())}>
                <span className="note">♪</span> 配信を開始（TikTok LIVEと連携・デモ）
              </button>
            </>
          )}
        </section>
        <PredictionControl ch={ch} p={p} now={now} {...ctl} />
      </div>
      <div className="studio-col">
        <ChatPanel preds={preds} title="視聴者の動き" />
        <section className="panel">
          <h3>配信に映す画面</h3>
          <p className="muted">
            TikTok LIVE Studio や OBS の「ブラウザソース」に、このページのURLの末尾へ <code>#overlay</code> を付けて設定すると、予想カードを配信に重ねられます。
          </p>
          <a className="btn ghost" href="#overlay">配信用の画面を開く</a>
        </section>
      </div>
    </div>
  );
}

function StudioStats({ ch, s }) {
  const preds = s.predictions[ch.handle] ?? [];
  const done = preds.filter((p) => p.status !== "open" && p.status !== "locked");
  const totalPool = preds.reduce((a, p) => a + poolOf(p), 0);
  const people = new Set(preds.flatMap((p) => p.bets.map((b) => (b.bot ? "bot:" : "") + b.user))).size;
  return (
    <div className="studio-stats">
      <div className="stat-tiles">
        <div><small>登録者</small><b>{fmt(followerCount(ch))}</b></div>
        <div><small>予想の回数</small><b>{fmt(preds.length)}</b></div>
        <div><small>集まったコイン</small><b><Coin size={16} /> {fmt(totalPool)}</b></div>
        <div><small>参加した人</small><b>{fmt(people)}</b></div>
      </div>

      <section className="panel">
        <h3>予想の履歴</h3>
        {done.length === 0 ? (
          <p className="muted">終わった予想はまだありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>質問</th><th>結果</th><th className="num">合計</th><th className="num">参加</th><th>日時</th></tr></thead>
              <tbody>
                {done.map((p) => {
                  const w = p.outcomes.find((o) => o.id === p.winnerId);
                  return (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>{w ? <b style={{ color: w.color }}>{w.label}</b> : <span className="muted">中止</span>}</td>
                      <td className="num">{fmt(poolOf(p))}</td>
                      <td className="num">{bettorsOf(p).length}</td>
                      <td className="nowrap">{fmtTime(p.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>このサイトで登録してくれた人</h3>
        {ch.followers.length === 0 ? (
          <p className="muted">まだいません。配信でこのサイトのチャンネルを紹介してみましょう。</p>
        ) : (
          <ul className="fan-list">
            {ch.followers.map((f) => <li key={f}><b style={{ color: nameColor(f) }}>@{f}</b></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

function StudioSettings({ ch, onSave, onDelete }) {
  const [name, setName] = useState(ch.name);
  const [genre, setGenre] = useState(ch.genre);
  const [bio, setBio] = useState(ch.bio);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}?c=${ch.handle}`;
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  return (
    <div className="studio-settings">
      <section className="panel">
        <h2>チャンネル情報</h2>
        <label className="lbl" htmlFor="set-name">表示名</label>
        <input id="set-name" className="input" value={name} maxLength={20} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        <span className="lbl">ジャンル</span>
        <div className="chips genre-chips">
          {GENRES.map((g) => (
            <button key={g} type="button" className={genre === g ? "on" : ""} onClick={() => { setGenre(g); setSaved(false); }}>{GENRE_ICON[g]} {g}</button>
          ))}
        </div>
        <label className="lbl" htmlFor="set-bio">自己紹介</label>
        <textarea id="set-bio" className="input" rows={3} maxLength={120} value={bio} onChange={(e) => { setBio(e.target.value); setSaved(false); }} />
        <button className="btn primary" disabled={!name.trim()} onClick={() => { onSave({ name: name.trim(), genre, bio: bio.trim() }); setSaved(true); }}>
          {saved ? "保存しました" : "保存する"}
        </button>
      </section>

      <section className="panel">
        <h3>視聴者に案内するリンク</h3>
        <p className="muted">TikTokのプロフィールや配信の説明に貼ると、視聴者があなたのチャンネルに直接来られます。</p>
        <div className="link-box">
          <code>{url}</code>
          <button type="button" onClick={copy}>{copied ? "コピーしました" : "コピー"}</button>
        </div>
      </section>

      <section className="panel">
        <h3>チャンネルの削除</h3>
        {confirmDel ? (
          <div className="confirm">
            <p>チャンネルを削除すると一覧から消え、登録者と予想の履歴もなくなります。進行中の予想は全額返金されます。</p>
            <div className="confirm-row">
              <button className="btn ghost" onClick={() => setConfirmDel(false)}>やめる</button>
              <button className="btn danger" onClick={onDelete}>削除する</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setConfirmDel(true)}>チャンネルを削除する</button>
        )}
      </section>
    </div>
  );
}

function Studio({ s, now, me, actions }) {
  const [tab, setTab] = useState("live");
  const ch = s.channels[me];
  if (!ch) return <StudioRegister me={me} onRegister={actions.register} />;

  return (
    <div className="studio">
      <div className="studio-head">
        <Avatar ch={ch} size={44} ring />
        <div>
          <b>{ch.name}</b>
          <small>@{ch.handle} ・ {ch.live ? "● 配信中" : "オフライン"}</small>
        </div>
      </div>
      <div className="seg">
        {[["live", "ライブ"], ["stats", "分析"], ["settings", "設定"]].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "live" && (
        <StudioLive ch={ch} s={s} now={now} onGoLive={actions.goLive} onEndLive={actions.endLive}
          onCreate={actions.create} onLock={actions.lock} onResolve={actions.resolve} onCancel={actions.cancel} />
      )}
      {tab === "stats" && <StudioStats ch={ch} s={s} />}
      {tab === "settings" && <StudioSettings ch={ch} onSave={actions.saveChannel} onDelete={actions.deleteChannel} />}
    </div>
  );
}

// ─── ショップ ─────────────────────────────────────────────────────────────────
function Shop({ wallet, onBuy }) {
  const [pack, setPack] = useState(null);
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [phase, setPhase] = useState("confirm"); // confirm → paying → done
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  const open = (p) => { setPack(p); setPhase("confirm"); };
  const close = () => { if (phase !== "paying") setPack(null); };
  const pay = () => {
    setPhase("paying");
    // 本番ではここで決済API（Stripe等）を呼び、Webhookでコイン付与する
    timer.current = setTimeout(() => { onBuy(pack, method); setPhase("done"); }, 1200);
  };

  return (
    <div className="shop">
      <div className="wallet-card">
        <div>
          <small>保有コイン</small>
          <div className="wallet-total"><Coin size={30} /> {fmt(wallet.paid + wallet.free)}</div>
        </div>
        <div className="wallet-split">
          <span>有償 <b>{fmt(wallet.paid)}</b></span>
          <span>無償 <b>{fmt(wallet.free)}</b></span>
        </div>
      </div>

      <h2 className="section">コインを買う</h2>
      <div className="packs">
        {PACKS.map((p, i) => (
          <button key={p.id} className={`pack ${p.tag ? "featured" : ""}`} onClick={() => open(p)}>
            {p.tag && <span className="tag-hot">{p.tag}</span>}
            <div className="pile">
              {Array.from({ length: Math.min(i + 1, 5) }, (_, k) => <Coin key={k} size={30} />)}
            </div>
            <div className="pack-coins">{fmt(p.coins)}</div>
            <div className="pack-bonus">{p.bonus ? `+ おまけ ${fmt(p.bonus)}` : " "}</div>
            <div className="price">¥{fmt(p.price)}</div>
          </button>
        ))}
      </div>
      <p className="fine">
        ※ デモ版のため実際の決済は発生しません。コインは本サービス内専用で、換金・譲渡はできません。
        無償コインから先に消費されます。
      </p>

      {pack && (
        <Modal onClose={close}>
          {phase === "done" ? (
            <>
              <CoinRain />
              <div className="ribbon">THANK YOU</div>
              <h2>購入が完了しました</h2>
              <div className="big-amount"><Coin size={40} /> +{fmt(pack.coins + pack.bonus)}</div>
              <button className="btn gold" onClick={() => setPack(null)}>OK</button>
            </>
          ) : (
            <>
              <div className="demo-badge">デモ決済</div>
              <h2>購入内容の確認</h2>
              <dl className="receipt">
                <div><dt>コイン（有償）</dt><dd><Coin size={16} /> {fmt(pack.coins)}</dd></div>
                {pack.bonus > 0 && <div><dt>おまけ（無償）</dt><dd><Coin size={16} /> {fmt(pack.bonus)}</dd></div>}
                <div className="sum"><dt>お支払い金額</dt><dd>¥{fmt(pack.price)}</dd></div>
              </dl>
              <div className="methods">
                {PAY_METHODS.map((m) => (
                  <button key={m} className={method === m ? "on" : ""} disabled={phase === "paying"} onClick={() => setMethod(m)}>{m}</button>
                ))}
              </div>
              <p className="muted">デモ版のため、お金はかかりません。</p>
              <button className="btn gold" disabled={phase === "paying"} onClick={pay}>
                {phase === "paying" ? "決済処理中…" : "購入を確定する"}
              </button>
              <button className="btn ghost" disabled={phase === "paying"} onClick={close}>キャンセル</button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── マイページ ───────────────────────────────────────────────────────────────
function MyPage({ user, wallet, followingCount, onLogout }) {
  return (
    <div className="mypage">
      <div className="profile">
        <div className="avatar me">{user.handle[0].toUpperCase()}</div>
        <div>
          <b>{user.name}</b>
          <small>TikTok連携済み（デモ）</small>
        </div>
      </div>

      <div className="stats">
        <div><small>登録チャンネル</small><b>{fmt(followingCount)}</b></div>
        <div><small>予想に参加</small><b>{fmt(wallet.joined)}回</b></div>
        <div><small>的中</small><b>{fmt(wallet.wins)}回</b></div>
      </div>

      <h2 className="section">コイン履歴</h2>
      {wallet.history.length === 0 && <p className="muted">まだ履歴がありません。</p>}
      <ul className="history">
        {wallet.history.map((h) => (
          <li key={h.t + h.label}>
            <div>
              <b>{h.label}</b>
              <small>{fmtTime(h.t)}{h.price ? ` ・ ¥${fmt(h.price)}` : ""}</small>
            </div>
            <span className={h.coins < 0 ? "minus" : "plus"}>
              <Coin size={16} /> {h.coins < 0 ? "−" : "+"}{fmt(Math.abs(h.coins))}
            </span>
          </li>
        ))}
      </ul>

      <button className="btn ghost" onClick={onLogout}>ログアウト</button>
    </div>
  );
}

// ─── アプリ本体 ───────────────────────────────────────────────────────────────
function Main({ store, setStore }) {
  const [mode, setMode] = useState("watch"); // watch = 視聴者 / studio = 配信者ダッシュボード
  const [tab, setTab] = useState("home");
  const [channel, setChannel] = useState(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    return c && store.channels[c] ? c : null;
  });
  const [needCoins, setNeedCoins] = useState(false);
  const now = useNow();

  const user = store.session;
  const wallet = user ? walletOf(store, user.handle) : null;
  const total = wallet ? wallet.paid + wallet.free : 0;
  const shownTotal = useCountUp(total);

  const login = (u) =>
    setStore((s) => ({ ...s, session: u, wallets: s.wallets[u.handle] ? s.wallets : { ...s.wallets, [u.handle]: newWallet() } }));
  const logout = () => { setTab("home"); setMode("watch"); setChannel(null); setStore((s) => ({ ...s, session: null })); };

  if (!user) return <div className="app"><Login onLogin={login} /></div>;

  const me = user.handle;
  const updateWallet = (fn) => setStore((s) => { const w = walletOf(s, me); return { ...s, wallets: { ...s.wallets, [me]: { ...w, ...fn(w) } } }; });
  const updateChannel = (h, fn) => setStore((s) => (s.channels[h] ? { ...s, channels: { ...s.channels, [h]: { ...s.channels[h], ...fn(s.channels[h]) } } } : s));

  const nextDay = wallet.lastBonusDate === yesterday() ? (wallet.streak % 7) + 1 : 1;
  const bonusModal = !wallet.welcomed ? "welcome" : wallet.lastBonusDate !== ymd() ? "daily" : null;

  const claimWelcome = () => updateWallet((w) => ({
    welcomed: true, free: w.free + WELCOME_BONUS,
    history: addHistory(w, { label: "はじめてボーナス", coins: WELCOME_BONUS }),
  }));
  const claimDaily = () => updateWallet((w) => ({
    free: w.free + DAILY_BONUS[nextDay - 1], streak: nextDay, lastBonusDate: ymd(),
    history: addHistory(w, { label: `ログインボーナス ${nextDay}日目`, coins: DAILY_BONUS[nextDay - 1] }),
  }));
  const buy = (pack, method) => updateWallet((w) => ({
    paid: w.paid + pack.coins, free: w.free + pack.bonus,
    history: addHistory(w, { label: `コイン購入（${method}）`, coins: pack.coins + pack.bonus, price: pack.price }),
  }));

  // 視聴者の操作
  const toggleFollow = (h) => updateChannel(h, (c) => ({
    followers: c.followers.includes(me) ? c.followers.filter((f) => f !== me) : [...c.followers, me],
  }));
  // 予想に賭ける（無償コインから先に使う）
  const placeBet = (h, outcomeId, amount) => setStore((s) => {
    const p = latestOf(s, h);
    if (!p || phaseOf(p, Date.now()) !== "open") return s;
    const w = walletOf(s, me);
    const prev = myBetOf(p, me);
    if (prev && prev.outcomeId !== outcomeId) return s;
    if (amount <= 0 || amount > w.paid + w.free || (prev?.amount || 0) + amount > MAX_BET) return s;
    const free = Math.min(w.free, amount), paid = amount - free;
    const label = p.outcomes.find((o) => o.id === outcomeId).label;
    return {
      ...replaceLatest(s, h, { ...p, bets: [...p.bets, { user: me, outcomeId, amount, free, paid, t: Date.now() }] }),
      wallets: {
        ...s.wallets,
        [me]: { ...w, free: w.free - free, paid: w.paid - paid, joined: w.joined + (prev ? 0 : 1),
          history: addHistory(w, { label: `@${h} の予想に参加「${label}」`, coins: -amount }) },
      },
    };
  });

  // 配信者の操作（自分のチャンネルだけ）
  const studio = {
    register: ({ name, genre, bio }) => setStore((s) => ({
      ...s,
      channels: { ...s.channels, [me]: {
        handle: me, name, genre, bio, live: false, liveTitle: "", liveSince: null,
        followerBase: 0, viewerBase: 0, hue: Math.abs(hashStr(me)) % 360, followers: [], seeded: false, createdAt: Date.now(),
      } },
    })),
    saveChannel: (fields) => updateChannel(me, () => fields),
    deleteChannel: () => setStore((s) => {
      const out = settle(s, me, null);
      const { [me]: _c, ...channels } = out.channels;
      const { [me]: _p, ...predictions } = out.predictions;
      return { ...out, channels, predictions };
    }),
    goLive: (liveTitle) => updateChannel(me, () => ({ live: true, liveTitle, liveSince: Date.now() })),
    endLive: () => setStore((s) => {
      const out = settle(s, me, null);
      return { ...out, channels: { ...out.channels, [me]: { ...out.channels[me], live: false, liveSince: null } } };
    }),
    create: (title, labels, duration) => setStore((s) => (isActive(latestOf(s, me)) || !s.channels[me]?.live ? s : addPrediction(s, me, title, labels, duration))),
    lock: () => setStore((s) => {
      const p = latestOf(s, me);
      return p?.status === "open" ? replaceLatest(s, me, { ...p, status: "locked", locksAt: Math.min(p.locksAt, Date.now()) }) : s;
    }),
    resolve: (winnerId) => setStore((s) => settle(s, me, winnerId)),
    cancel: () => setStore((s) => settle(s, me, null)),
  };

  const goShop = () => { setNeedCoins(false); setMode("watch"); setChannel(null); setTab("shop"); };
  const openChannel = (h) => { setChannel(h); window.scrollTo(0, 0); };
  const goTab = (id) => { setTab(id); setChannel(null); window.scrollTo(0, 0); };
  const ch = channel ? store.channels[channel] : null;
  const followingLive = Object.values(store.channels).filter((c) => c.live && c.followers.includes(me)).length;
  const followingCount = Object.values(store.channels).filter((c) => c.followers.includes(me)).length;

  return (
    <div className={`app ${mode}`}>
      <header className="topbar">
        <div className="brand">MEDAL<span>LAND</span>{mode === "studio" && <em className="studio-tag">Studio</em>}</div>
        <div className="top-actions">
          <button className="balance" onClick={goShop} aria-label="コインを買い足す">
            <Coin size={20} /><b>{fmt(shownTotal)}</b><i>＋</i>
          </button>
          <button className="mode-btn" onClick={() => setMode(mode === "watch" ? "studio" : "watch")}>
            {mode === "watch" ? "🎥 配信者" : "📺 視聴"}
          </button>
        </div>
      </header>

      <main>
        {mode === "studio" && <Studio s={store} now={now} me={me} actions={studio} />}
        {mode === "watch" && ch && (
          <ChannelView ch={ch} s={store} now={now} me={me} total={total} onBack={() => setChannel(null)}
            onFollow={toggleFollow} onBet={placeBet} onNeedCoins={() => setNeedCoins(true)} />
        )}
        {mode === "watch" && !ch && tab === "home" && <HomeView s={store} now={now} me={me} onOpen={openChannel} onFollow={toggleFollow} />}
        {mode === "watch" && !ch && tab === "following" && (
          <FollowingView s={store} now={now} me={me} onOpen={openChannel} onFollow={toggleFollow} goHome={() => goTab("home")} />
        )}
        {mode === "watch" && !ch && tab === "shop" && <Shop wallet={wallet} onBuy={buy} />}
        {mode === "watch" && !ch && tab === "my" && <MyPage user={user} wallet={wallet} followingCount={followingCount} onLogout={logout} />}
      </main>

      {mode === "watch" && (
        <nav className="tabs">
          {[["home", "🏠", "ホーム"], ["following", "♥", "登録チャンネル"], ["shop", "🛒", "ショップ"], ["my", "👤", "マイページ"]].map(([id, icon, label]) => (
            <button key={id} className={tab === id && !ch ? "on" : ""} onClick={() => goTab(id)}>
              <span>{icon}</span>{label}
              {id === "following" && followingLive > 0 && <i className="badge">{followingLive}</i>}
            </button>
          ))}
        </nav>
      )}

      {bonusModal === "welcome" && <WelcomeModal onClaim={claimWelcome} />}
      {bonusModal === "daily" && <DailyModal day={nextDay} onClaim={claimDaily} />}

      {needCoins && (
        <Modal onClose={() => setNeedCoins(false)}>
          <h2>コインが足りません</h2>
          <p className="muted">ショップでコインを買い足すか、明日のログインボーナスをお待ちください。</p>
          <button className="btn gold" onClick={goShop}>ショップへ行く</button>
          <button className="btn ghost" onClick={() => setNeedCoins(false)}>とじる</button>
        </Modal>
      )}
    </div>
  );
}

export default function CoinApp() {
  const [store, setStore] = useState(loadStore);
  const hash = useHash();

  useEffect(() => saveStore(store), [store]);

  // 別タブ（配信用の画面など）での変更を取り込む
  useEffect(() => {
    const on = (e) => { if (e.key === STORE_KEY) setStore(loadStore()); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  // デモ用：架空の視聴者・配信者の動き
  useEffect(() => {
    const id = setInterval(() => { if (claimSim()) setStore(simTick); }, 1000);
    return () => clearInterval(id);
  }, []);

  if (hash === "#overlay") return <OverlayPage store={store} />;
  return <Main store={store} setStore={setStore} />;
}
