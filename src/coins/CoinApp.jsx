import { useState, useEffect, useRef } from "react";

// ─── 設定 ─────────────────────────────────────────────────────────────────────
const STORE_KEY = "medal_land_v1";
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
const OUTCOME_COLORS = ["#3b82f6", "#ec4899", "#f59e0b", "#22c55e", "#a855f7", "#14b8a6", "#ef4444", "#84cc16", "#f97316", "#6366f1"];
const MAX_OUTCOMES = 10;
const MAX_BET = 100000;
const DURATIONS = [[30, "30秒"], [60, "1分"], [120, "2分"], [300, "5分"], [600, "10分"], [1800, "30分"]];
const TEMPLATES = [
  { title: "この勝負、勝てる？", outcomes: ["勝つ", "負ける"] },
  { title: "ボスを1回で倒せる？", outcomes: ["倒せる", "無理"] },
  { title: "ガチャで最高レアは出る？", outcomes: ["出る", "出ない"] },
  { title: "今日の最終順位は？", outcomes: ["1位", "2〜3位", "4位以下"] },
];

// デモ用：配信を見ている架空の視聴者
const BOT_NAMES = ["mika_chan", "takumi88", "neko_neko", "ryo.live", "sakura_77", "hiro_gg", "yuki.m", "kenta_x",
  "momo_pop", "daichi_01", "aoi_tt", "sora.sky", "rin_rin", "kaito_z", "hana_23", "shun.play"];
const BOT_AMOUNTS = [[10, 5], [30, 5], [50, 4], [100, 4], [300, 2], [500, 1.5], [1000, 1], [3000, 0.3]];

// ─── ユーティリティ ───────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const fmt = (n) => n.toLocaleString("ja-JP");
const fmtTime = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const fmtRatio = (r) => (r ? `1:${r < 10 ? r.toFixed(2) : r.toFixed(1)}` : "—");

function pickWeighted(pairs) {
  let r = Math.random() * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[0][0];
}

const emptyStore = () => ({ session: null, wallets: {}, channel: null, predictions: [] });
function loadStore() {
  try { const r = localStorage.getItem(STORE_KEY); if (r) return { ...emptyStore(), ...JSON.parse(r) }; } catch {}
  return emptyStore();
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }

const newWallet = () => ({
  paid: 0, free: 0, welcomed: false, lastBonusDate: null, streak: 0,
  history: [], joined: 0, wins: 0, maxWin: 0,
});
const walletOf = (s, h) => ({ ...newWallet(), ...s.wallets[h] });
const addHistory = (w, entry) => [{ t: Date.now(), ...entry }, ...w.history].slice(0, 50);

// ─── 予想の計算 ───────────────────────────────────────────────────────────────
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
const isActive = (p) => p && (p.status === "open" || p.status === "locked");
const replaceFirst = (s, p) => ({ ...s, predictions: [p, ...s.predictions.slice(1)] });

// 結果確定（winnerId）または中止（winnerId = null）
function settle(s, winnerId) {
  const p = s.predictions[0];
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
      history: addHistory(w, { label: winnerId ? `予想的中「${winLabel}」` : "予想の中止による返金", coins: payout }),
    };
  }
  const ended = { ...p, status: winnerId ? "resolved" : "canceled", winnerId, top, endedAt: Date.now() };
  return { ...s, wallets, predictions: [ended, ...s.predictions.slice(1)].slice(0, 20) };
}

// デモ用：架空の視聴者が少しずつ賭けてくる＋締め切り時間で自動的に受付終了
function simTick(s) {
  const p = s.predictions[0];
  if (!p || p.status !== "open") return s;
  if (Date.now() >= p.locksAt) return replaceFirst(s, { ...p, status: "locked" });
  if (Math.random() < 0.35) return s;
  const user = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const prev = p.bets.find((b) => b.bot && b.user === user);
  const outcomeId = prev ? prev.outcomeId : pickWeighted(p.outcomes.map((o, i) => [o.id, p.bias[i]]));
  const amount = pickWeighted(BOT_AMOUNTS);
  return replaceFirst(s, { ...p, bets: [...p.bets, { user, bot: true, outcomeId, amount, t: Date.now() }] });
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
const newRoomCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

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

// 選択肢ごとのバー（賭け金の割合・倍率・人数）
function OutcomeBars({ p, now, selected, onSelect, myBet }) {
  const t = totalsOf(p);
  const pool = poolOf(p);
  const counts = {};
  for (const u of bettorsOf(p)) counts[u.outcomeId] = (counts[u.outcomeId] || 0) + 1;
  const phase = phaseOf(p, now);
  const Tag = onSelect ? "button" : "div";

  return (
    <div className="outcomes">
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
              <b>{won && "🏆 "}{o.label}{myBet?.outcomeId === o.id && <em className="mine">あなた</em>}</b>
              <span className="pct">{pct}%</span>
            </div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="o-meta">
              <span><Coin size={13} /> {fmt(t[o.id])}</span>
              <span>{fmtRatio(t[o.id] ? pool / t[o.id] : null)}</span>
              <span>👤 {counts[o.id] || 0}</span>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

function BetFeed({ p, limit = 5 }) {
  const items = p.bets.slice(-limit).reverse();
  if (!items.length) return <p className="feed-empty">まだ誰も予想していません</p>;
  return (
    <ul className="feed">
      {items.map((b) => {
        const o = p.outcomes.find((x) => x.id === b.outcomeId);
        return (
          <li key={`${b.user}-${b.t}`}>
            <b>@{b.user}</b> が <span style={{ color: o.color }}>{o.label}</span> に
            <span className="feed-amt"><Coin size={13} /> {fmt(b.amount)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── 配信に重ねる表示（オーバーレイ） ─────────────────────────────────────────
function OverlayCard({ p, now, channel }) {
  if (!p) {
    return (
      <div className="ov ov-idle">
        <div className="ov-brand">🎯 MEDAL LAND 予想</div>
        <p>次の予想をお楽しみに！</p>
        {channel && <small>参加コード <b>{channel.room}</b></small>}
      </div>
    );
  }
  const phase = phaseOf(p, now);
  const winner = p.outcomes.find((o) => o.id === p.winnerId);
  return (
    <div className={`ov ${phase}`}>
      <div className="ov-head">
        <span className="ov-brand">🎯 予想{channel ? ` · @${channel.tiktok}` : ""}</span>
        <StatusPill p={p} now={now} />
      </div>
      <h3 className="ov-title">{p.title}</h3>
      <OutcomeBars p={p} now={now} />
      {phase === "resolved" && (
        <div className="ov-result">
          結果：<b style={{ color: winner.color }}>{winner.label}</b>
          {p.top && <span>最高配当 @{p.top.user} <Coin size={14} /> {fmt(p.top.payout)}</span>}
        </div>
      )}
      <div className="ov-foot">
        <span>合計 <Coin size={14} /> {fmt(poolOf(p))}</span>
        {channel && <span>参加コード <b>{channel.room}</b></span>}
      </div>
    </div>
  );
}

function OverlayPage({ store }) {
  const now = useNow();
  return (
    <div className="ov-page">
      <OverlayCard p={store.predictions[0]} now={now} channel={store.channel} />
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
        <p className="tagline">配信を予想で盛り上げよう</p>
      </div>

      <div className="login-perks">
        <div><b>はじめてボーナス</b><span><Coin size={16} /> {fmt(WELCOME_BONUS)}</span></div>
        <div><b>毎日ログインボーナス</b><span><Coin size={16} /> 最大 {fmt(Math.max(...DAILY_BONUS))}</span></div>
        <div><b>配信者の予想に参加</b><span>当てて山分け</span></div>
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

// ─── 視聴者：予想に参加 ───────────────────────────────────────────────────────
function PredictView({ p, now, me, total, channel, onBet, onNeedCoins, goStreamer }) {
  const [selected, setSelected] = useState(null);
  const [amountText, setAmountText] = useState("100");
  const myBet = p ? myBetOf(p, me) : null;

  useEffect(() => { setSelected(null); }, [p?.id]);

  if (!channel) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📡</div>
        <h2>まだ配信と連携されていません</h2>
        <p className="muted">配信者がTikTok配信と連携して予想を出すと、ここに表示されます。</p>
        <button className="btn ghost" onClick={goStreamer}>配信者としてためす →</button>
      </div>
    );
  }

  const live = (
    <div className="live-strip">
      <span className="live-badge">LIVE</span>
      <b>@{channel.tiktok}</b> の配信と連携中
    </div>
  );

  if (!p) {
    return (
      <div className="predict">
        {live}
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <h2>次の予想を待っています</h2>
          <p className="muted">配信者が予想を出すと、ここで参加できます。</p>
        </div>
      </div>
    );
  }

  const phase = phaseOf(p, now);
  const sel = myBet?.outcomeId ?? selected;
  const selOutcome = p.outcomes.find((o) => o.id === sel);
  const amount = Math.floor(Number(amountText)) || 0;
  const room = MAX_BET - (myBet?.amount || 0);
  const t = totalsOf(p);
  const pool = poolOf(p);
  const estimate = sel && amount > 0 ? Math.floor((((myBet?.amount || 0) + amount) * (pool + amount)) / (t[sel] + amount)) : 0;
  const short = amount > total;

  const submit = () => {
    if (short) return onNeedCoins();
    onBet(sel, amount);
  };

  // 終了した予想での自分の結果
  let myResult = null;
  if (myBet && phase === "resolved") {
    const won = myBet.outcomeId === p.winnerId;
    myResult = won
      ? { won, coins: Math.floor((myBet.amount * pool) / t[p.winnerId]) }
      : { won, coins: myBet.amount };
  }

  return (
    <div className="predict">
      {live}
      <div className="pred">
        <div className="pred-head">
          <StatusPill p={p} now={now} />
          <span className="pool"><small>合計</small><Coin size={16} /> {fmt(pool)}</span>
        </div>
        <h2 className="pred-title">{p.title}</h2>
        <OutcomeBars p={p} now={now} selected={sel} myBet={myBet} onSelect={phase === "open" ? setSelected : null} />

        {phase === "open" && !sel && <p className="hint">当たると思う選択肢をタップ</p>}

        {phase === "open" && sel && (
          <div className="betbox" style={{ "--c": selOutcome.color }}>
            <div className="betbox-head">
              <span><b style={{ color: selOutcome.color }}>{selOutcome.label}</b> に{myBet ? "追加で" : ""}賭ける</span>
              {myBet && <small>賭け済み <Coin size={12} /> {fmt(myBet.amount)}</small>}
            </div>
            <label className="field amount-field">
              <Coin size={20} />
              <input
                id="bet-amount" inputMode="numeric" value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
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
            <button className="btn gold" disabled={amount <= 0 || amount > room} onClick={submit}>
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

        {phase === "canceled" && (
          <div className="notice">この予想は中止されました。{myBet && "賭けたコインは全額返金済みです。"}</div>
        )}

        <h3 className="sub">みんなの予想</h3>
        <BetFeed p={p} />
      </div>

      <details className="rules">
        <summary>予想のルール</summary>
        <ul>
          <li>受付時間内に、当たると思う選択肢にコインを賭けます。</li>
          <li>1回の予想で賭けられる選択肢は1つだけです（同じ選択肢への追加はできます）。</li>
          <li>当たった人で、全員の賭け金の合計を賭けた額に応じて山分けします。人気のない選択肢ほど倍率が高くなります。</li>
          <li>予想が中止されたときは全額返金されます。</li>
          <li>無償コインから先に使われます。増えた分は無償コインとして受け取ります。</li>
        </ul>
      </details>
      <p className="fine legal">
        ※ デモ版です。有償コインを賭けられる仕様は、公開前に法令（賭博罪・資金決済法など）への適合を専門家に確認する必要があります。
      </p>
    </div>
  );
}

// ─── 配信者：連携と予想の管理 ─────────────────────────────────────────────────
function StreamerView({ store, now, onLink, onUnlink, onCreate, onLock, onResolve, onCancel }) {
  const { channel } = store;
  const p = store.predictions[0];
  const active = isActive(p);
  const [handle, setHandle] = useState(store.session?.handle ?? "");
  const [title, setTitle] = useState("");
  const [outcomes, setOutcomes] = useState(["", ""]);
  const [duration, setDuration] = useState(120);
  const [pick, setPick] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => { setPick(null); setConfirmCancel(false); }, [p?.id, p?.status]);

  const viewerUrl = channel ? `${window.location.origin}${window.location.pathname}?room=${channel.room}` : "";
  const copy = () => {
    navigator.clipboard?.writeText(viewerUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const valid = title.trim() && outcomes.filter((o) => o.trim()).length >= 2;
  const create = () => {
    onCreate(title.trim(), outcomes.map((o) => o.trim()).filter(Boolean), duration);
    setTitle(""); setOutcomes(["", ""]);
  };

  if (!channel) {
    return (
      <div className="streamer">
        <section className="panel">
          <h2>TikTok配信と連携する</h2>
          <p className="muted">
            連携すると予想を出せるようになります。視聴者は配信に映した参加コードかリンクから、このサイトで予想に参加します。
          </p>
          <label className="field">
            <span>@</span>
            <input id="link-handle" value={handle} maxLength={24} placeholder="あなたのTikTok ID"
              onChange={(e) => setHandle(e.target.value.replace(/[^\w.]/g, ""))} />
          </label>
          <button className="btn tiktok" disabled={!cleanHandle(handle)} onClick={() => onLink(cleanHandle(handle))}>
            <span className="note">♪</span> 配信と連携する（デモ）
          </button>
        </section>
        <section className="panel steps">
          <h3>使い方</h3>
          <ol>
            <li>TikTok配信とこのサイトを連携</li>
            <li>参加コードと予想画面を配信に映す（TikTok LIVE Studio や OBS のブラウザソース）</li>
            <li>予想を出す → 視聴者がコインで参加</li>
            <li>結果が出たら勝った選択肢を選ぶ → 自動で山分け</li>
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="streamer">
      <section className="panel linked">
        <div className="linked-head">
          <span className="live-badge">LIVE</span>
          <b>@{channel.tiktok}</b>
          <span className="muted">と連携中（デモ）</span>
        </div>
        <div className="room">
          <small>参加コード</small>
          <b>{channel.room}</b>
        </div>
        <div className="link-box">
          <code>{viewerUrl}</code>
          <button type="button" onClick={copy}>{copied ? "コピーしました" : "コピー"}</button>
        </div>
        <button className="text-btn" onClick={onUnlink}>連携を解除</button>
      </section>

      {active ? (
        <section className="panel">
          <h2>進行中の予想</h2>
          <OverlayCard p={p} now={now} channel={channel} />
          {phaseOf(p, now) === "open" && (
            <button className="btn gold" onClick={onLock}>受付を締め切る（残り {fmtClock(p.locksAt - now)}）</button>
          )}
          {phaseOf(p, now) === "locked" && (
            <div className="resolve">
              <h3>結果を選んでください</h3>
              <div className="resolve-grid">
                {p.outcomes.map((o) => (
                  <button key={o.id} className={pick === o.id ? "on" : ""} style={{ "--c": o.color }} onClick={() => setPick(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <button className="btn gold" disabled={!pick} onClick={() => onResolve(pick)}>
                {pick ? `「${p.outcomes.find((o) => o.id === pick).label}」で確定して配当する` : "勝った選択肢を選ぶ"}
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
      ) : (
        <section className="panel">
          <h2>予想を出す</h2>
          {p && (
            <div className="last">
              <small>前回の予想</small>
              <OverlayCard p={p} now={now} channel={channel} />
            </div>
          )}
          <div className="tpl">
            {TEMPLATES.map((tp) => (
              <button key={tp.title} type="button" onClick={() => { setTitle(tp.title); setOutcomes(tp.outcomes); }}>{tp.title}</button>
            ))}
          </div>
          <label className="lbl" htmlFor="pred-title">質問</label>
          <input id="pred-title" className="input" value={title} maxLength={45} placeholder="例：この勝負、勝てる？" onChange={(e) => setTitle(e.target.value)} />

          <label className="lbl">選択肢（2〜{MAX_OUTCOMES}個）</label>
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

          <label className="lbl">受付時間</label>
          <div className="chips dur">
            {DURATIONS.map(([sec, label]) => (
              <button key={sec} type="button" className={duration === sec ? "on" : ""} onClick={() => setDuration(sec)}>{label}</button>
            ))}
          </div>
          <button className="btn gold" disabled={!valid} onClick={create}>予想を開始する</button>
        </section>
      )}

      <section className="panel">
        <h3>配信に映す画面</h3>
        <p className="muted">
          TikTok LIVE Studio や OBS の「ブラウザソース」に、このページの末尾に <code>#overlay</code> を付けたURLを設定すると、上のカードと同じ表示を配信に重ねられます。
        </p>
        <a className="btn ghost" href="#overlay">配信用の画面を開く</a>
      </section>
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
            {p.tag && <span className="tag">{p.tag}</span>}
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
function MyPage({ user, wallet, onLogout }) {
  return (
    <div className="mypage">
      <div className="profile">
        <div className="avatar">{user.handle[0].toUpperCase()}</div>
        <div>
          <b>{user.name}</b>
          <small>TikTok連携済み（デモ）</small>
        </div>
      </div>

      <div className="stats">
        <div><small>連続ログイン</small><b>{wallet.streak}日</b></div>
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
  const [tab, setTab] = useState("predict");
  const [needCoins, setNeedCoins] = useState(false);
  const now = useNow();

  const user = store.session;
  const wallet = user ? walletOf(store, user.handle) : null;
  const total = wallet ? wallet.paid + wallet.free : 0;
  const shownTotal = useCountUp(total);

  const login = (u) =>
    setStore((s) => ({ ...s, session: u, wallets: s.wallets[u.handle] ? s.wallets : { ...s.wallets, [u.handle]: newWallet() } }));
  const logout = () => { setTab("predict"); setStore((s) => ({ ...s, session: null })); };

  if (!user) return <div className="app"><Login onLogin={login} /></div>;

  const me = user.handle;
  const updateWallet = (fn) => setStore((s) => { const w = walletOf(s, me); return { ...s, wallets: { ...s.wallets, [me]: { ...w, ...fn(w) } } }; });

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

  // 視聴者：予想に賭ける（無償コインから先に使う）
  const placeBet = (outcomeId, amount) => setStore((s) => {
    const p = s.predictions[0];
    if (!p || phaseOf(p, Date.now()) !== "open") return s;
    const w = walletOf(s, me);
    const prev = myBetOf(p, me);
    if (prev && prev.outcomeId !== outcomeId) return s;
    if (amount <= 0 || amount > w.paid + w.free || (prev?.amount || 0) + amount > MAX_BET) return s;
    const free = Math.min(w.free, amount), paid = amount - free;
    const label = p.outcomes.find((o) => o.id === outcomeId).label;
    return {
      ...replaceFirst(s, { ...p, bets: [...p.bets, { user: me, outcomeId, amount, free, paid, t: Date.now() }] }),
      wallets: {
        ...s.wallets,
        [me]: { ...w, free: w.free - free, paid: w.paid - paid, joined: w.joined + (prev ? 0 : 1),
          history: addHistory(w, { label: `予想「${label}」に参加`, coins: -amount }) },
      },
    };
  });

  // 配信者の操作
  const link = (tiktok) => setStore((s) => ({ ...s, channel: { tiktok, room: newRoomCode(), linkedAt: Date.now() } }));
  const unlink = () => setStore((s) => (isActive(s.predictions[0]) ? settle({ ...s, channel: null }, null) : { ...s, channel: null }));
  const create = (title, labels, duration) => setStore((s) => {
    if (isActive(s.predictions[0])) return s;
    const t = Date.now();
    const p = {
      id: t.toString(36), title, duration, createdAt: t, locksAt: t + duration * 1000, status: "open", bets: [],
      outcomes: labels.map((label, i) => ({ id: `o${i}`, label, color: OUTCOME_COLORS[i] })),
      bias: labels.map(() => 0.4 + Math.random()), // デモ用：架空の視聴者の偏り
    };
    return { ...s, predictions: [p, ...s.predictions].slice(0, 20) };
  });
  const lock = () => setStore((s) => {
    const p = s.predictions[0];
    return p?.status === "open" ? replaceFirst(s, { ...p, status: "locked", locksAt: Math.min(p.locksAt, Date.now()) }) : s;
  });
  const resolve = (winnerId) => setStore((s) => (isActive(s.predictions[0]) ? settle(s, winnerId) : s));
  const cancel = () => setStore((s) => (isActive(s.predictions[0]) ? settle(s, null) : s));

  const goShop = () => { setNeedCoins(false); setTab("shop"); };
  const current = store.predictions[0] ?? null;
  const tabs = [["predict", "🎯", "予想"], ["shop", "🛒", "ショップ"], ["streamer", "🎥", "配信者"], ["my", "👤", "マイページ"]];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">MEDAL<span>LAND</span></div>
        <button className="balance" onClick={goShop} aria-label="コインを買い足す">
          <Coin size={22} /><b>{fmt(shownTotal)}</b><i>＋</i>
        </button>
      </header>

      <main>
        {tab === "predict" && (
          <PredictView p={current} now={now} me={me} total={total} channel={store.channel}
            onBet={placeBet} onNeedCoins={() => setNeedCoins(true)} goStreamer={() => setTab("streamer")} />
        )}
        {tab === "shop" && <Shop wallet={wallet} onBuy={buy} />}
        {tab === "streamer" && (
          <StreamerView store={store} now={now} onLink={link} onUnlink={unlink} onCreate={create}
            onLock={lock} onResolve={resolve} onCancel={cancel} />
        )}
        {tab === "my" && <MyPage user={user} wallet={wallet} onLogout={logout} />}
      </main>

      <nav className="tabs">
        {tabs.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
            {id === "predict" && tab !== "predict" && phaseOf(current ?? { status: "" }, now) === "open" && <i className="badge" />}
          </button>
        ))}
      </nav>

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

  // デモ用：架空の視聴者の参加と、締め切り時間での自動受付終了
  useEffect(() => {
    const id = setInterval(() => { if (claimSim()) setStore(simTick); }, 1000);
    return () => clearInterval(id);
  }, []);

  if (hash === "#overlay") return <OverlayPage store={store} />;
  return <Main store={store} setStore={setStore} />;
}
