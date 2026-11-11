import { useState, useEffect, useRef } from "react";

// ─── 設定 ─────────────────────────────────────────────────────────────────────
const STORE_KEY = "medal_land_v1";

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

// スロットの絵柄：w = 出現の重み / x = 3つ揃いの配当倍率（還元率 約92%）
const SYMBOLS = [
  { s: "🍒", w: 30, x: 5 },
  { s: "🍋", w: 25, x: 8 },
  { s: "🔔", w: 20, x: 12 },
  { s: "⭐", w: 13, x: 20 },
  { s: "💎", w: 8, x: 50 },
  { s: "7️⃣", w: 4, x: 100 },
];
const BETS = [10, 30, 100];

// ─── ユーティリティ ───────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const fmt = (n) => n.toLocaleString("ja-JP");
const fmtTime = (t) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function loadStore() {
  try {
    const r = localStorage.getItem(STORE_KEY);
    if (r) return { session: null, wallets: {}, ...JSON.parse(r) };
  } catch {}
  return { session: null, wallets: {} };
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }

const newWallet = () => ({
  paid: 0, free: 0, welcomed: false, lastBonusDate: null, streak: 0,
  history: [], spins: 0, maxWin: 0,
});

const addHistory = (w, entry) => [{ t: Date.now(), ...entry }, ...w.history].slice(0, 50);

function pickSymbol() {
  let r = Math.random() * SYMBOLS.reduce((a, b) => a + b.w, 0);
  for (const sym of SYMBOLS) { if ((r -= sym.w) < 0) return sym; }
  return SYMBOLS[0];
}

function judge(result, bet) {
  const [a, b, c] = result.map((r) => r.s);
  if (a === b && b === c) return { win: bet * result[0].x, kind: "three" };
  if (a === b || b === c || a === c) return { win: bet, kind: "two" };
  return { win: 0, kind: "none" };
}

// ─── デモ用 TikTokログイン ────────────────────────────────────────────────────
// 本番では TikTok Login Kit (OAuth 2.0) に差し替える：
//   1. /auth/tiktok へリダイレクト → TikTokの認可画面
//   2. コールバックでサーバーが code を access_token に交換
//   3. user.info.basic から open_id / display_name / avatar_url を取得
// ここではその結果と同じ形のユーザー情報を、入力された名前から作るだけ。
function demoTikTokLogin(rawHandle) {
  const handle = rawHandle.trim().replace(/^@+/, "").toLowerCase() || "guest";
  return { openId: `demo-${handle}`, handle, name: `@${handle}` };
}

// ─── 小さな部品 ───────────────────────────────────────────────────────────────
function Coin({ size = 20 }) {
  return <span className="coin" style={{ width: size, height: size, fontSize: size * 0.55 }}>M</span>;
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
      const p = Math.min(1, (now - t0) / 500);
      const v = Math.round(start + diff * (1 - Math.pow(1 - p, 3)));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
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

// ─── ログイン画面 ─────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [consent, setConsent] = useState(false);
  const [handle, setHandle] = useState("");

  return (
    <div className="login">
      <div className="marquee">
        <div className="logo-coins"><Coin size={34} /><Coin size={52} /><Coin size={34} /></div>
        <h1 className="logo">MEDAL<span>LAND</span></h1>
        <p className="tagline">オンライン メダルゲーム</p>
      </div>

      <div className="login-perks">
        <div><b>はじめてボーナス</b><span><Coin size={16} /> {fmt(WELCOME_BONUS)}</span></div>
        <div><b>毎日ログインボーナス</b><span><Coin size={16} /> 最大 {fmt(Math.max(...DAILY_BONUS))}</span></div>
      </div>

      <button className="btn tiktok" onClick={() => setConsent(true)}>
        <span className="note">♪</span> TikTokでログイン
      </button>
      <p className="fine">ログインすると無料コインがもらえます</p>

      {consent && (
        <Modal onClose={() => setConsent(false)}>
          <div className="demo-badge">デモ</div>
          <h2>TikTokアカウントで続行</h2>
          <p className="muted">
            これはデモ画面です。実際のTikTok認証は行われず、入力した名前でログインします。
          </p>
          <form onSubmit={(e) => { e.preventDefault(); onLogin(demoTikTokLogin(handle)); }}>
            <label className="field">
              <span>@</span>
              <input
                autoFocus value={handle} maxLength={24} placeholder="tiktok_user"
                onChange={(e) => setHandle(e.target.value.replace(/[^\w.]/g, ""))}
              />
            </label>
            <ul className="scopes">
              <li>プロフィール名とアイコンの読み取り</li>
            </ul>
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
      <p className="muted">無料コインをプレゼント！さっそく遊んでみよう。</p>
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
      <button className="btn gold" onClick={onClaim}>
        <Coin size={20} /> {DAILY_BONUS[day - 1]} を受け取る
      </button>
    </Modal>
  );
}

// ─── ゲーム（スロット） ───────────────────────────────────────────────────────
function Game({ total, onBet, onNeedCoins }) {
  const [reels, setReels] = useState(() => [SYMBOLS[5], SYMBOLS[5], SYMBOLS[5]]);
  const [rolling, setRolling] = useState([false, false, false]);
  const [bet, setBet] = useState(BETS[0]);
  const [result, setResult] = useState(null);
  const timers = useRef([]);
  const busy = rolling.some(Boolean);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 回転中のリールは絵柄をパラパラ切り替える
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => {
      setReels((cur) => cur.map((sym, i) => (rolling[i] ? pickSymbol() : sym)));
    }, 70);
    return () => clearInterval(id);
  }, [rolling, busy]);

  const spin = () => {
    if (busy) return;
    if (total < bet) return onNeedCoins();
    const payout = onBet(bet);          // ここでコインを消費（配当の受け取り口を返す）
    const final = [pickSymbol(), pickSymbol(), pickSymbol()];
    const outcome = judge(final, bet);
    setResult(null);
    setRolling([true, true, true]);
    timers.current = [0, 1, 2].map((i) =>
      setTimeout(() => {
        setReels((cur) => cur.map((sym, j) => (j === i ? final[i] : sym)));
        setRolling((cur) => cur.map((r, j) => (j === i ? false : r)));
        if (i === 2) { payout(outcome.win); setResult({ ...outcome, bet }); }
      }, 700 + i * 450)
    );
  };

  return (
    <div className="game">
      <div className={`cabinet ${result?.kind === "three" ? "jackpot" : ""}`}>
        <div className="cabinet-top">★ LUCKY SLOT ★</div>
        <div className="reels">
          {reels.map((sym, i) => (
            <div key={i} className={`reel ${rolling[i] ? "rolling" : ""}`}><span>{sym.s}</span></div>
          ))}
          <div className="payline" />
        </div>

        <div className="result" aria-live="polite">
          {busy && <span className="muted">…</span>}
          {!busy && !result && <span className="muted">ベットを選んでSPIN！</span>}
          {!busy && result?.kind === "three" && (
            <span className="win big">🎉 大当たり！ <Coin size={22} /> +{fmt(result.win)}</span>
          )}
          {!busy && result?.kind === "two" && (
            <span className="win">おしい！ <Coin size={18} /> {fmt(result.win)} 返却</span>
          )}
          {!busy && result?.kind === "none" && <span className="muted">ハズレ… もう一回！</span>}
        </div>
        {result?.kind === "three" && !busy && <CoinRain />}
      </div>

      <div className="bets">
        {BETS.map((b) => (
          <button key={b} disabled={busy} className={`bet ${bet === b ? "on" : ""}`} onClick={() => setBet(b)}>
            <small>BET</small><b>{b}</b>
          </button>
        ))}
      </div>

      <button className="btn spin" disabled={busy} onClick={spin}>
        {busy ? "回転中…" : <>SPIN <em><Coin size={18} /> {bet}</em></>}
      </button>

      {total < BETS[0] && !busy && (
        <button className="empty-cta" onClick={onNeedCoins}>
          コインがなくなりました。<u>ショップで買い足す →</u>
        </button>
      )}

      <div className="paytable">
        <h3>配当表（3つ揃い）</h3>
        <div className="pay-grid">
          {[...SYMBOLS].reverse().map((sym) => (
            <div key={sym.s}><span>{sym.s}{sym.s}{sym.s}</span><b>×{sym.x}</b></div>
          ))}
        </div>
        <p className="fine">2つ揃いはベット額を返却</p>
      </div>
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
            <div className="pile" data-size={Math.min(i, 5)}>
              {Array.from({ length: Math.min(i + 1, 5) }, (_, k) => <Coin key={k} size={30} />)}
            </div>
            <div className="pack-coins">{fmt(p.coins)}</div>
            <div className="pack-bonus">{p.bonus ? `+ おまけ ${fmt(p.bonus)}` : " "}</div>
            <div className="price">¥{fmt(p.price)}</div>
          </button>
        ))}
      </div>
      <p className="fine">
        ※ デモ版のため実際の決済は発生しません。コインは本サービス内のゲーム専用で、換金・譲渡はできません。
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
                  <button key={m} className={method === m ? "on" : ""} disabled={phase === "paying"} onClick={() => setMethod(m)}>
                    {m}
                  </button>
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
        <div><small>プレイ回数</small><b>{fmt(wallet.spins)}</b></div>
        <div><small>最高配当</small><b>{fmt(wallet.maxWin)}</b></div>
      </div>

      <h2 className="section">コイン履歴</h2>
      {wallet.history.length === 0 && <p className="muted">まだ履歴がありません。</p>}
      <ul className="history">
        {wallet.history.map((h) => (
          <li key={h.t}>
            <div>
              <b>{h.label}</b>
              <small>{fmtTime(h.t)}{h.price ? ` ・ ¥${fmt(h.price)}` : ""}</small>
            </div>
            <span className="plus"><Coin size={16} /> +{fmt(h.coins)}</span>
          </li>
        ))}
      </ul>

      <button className="btn ghost" onClick={onLogout}>ログアウト</button>
    </div>
  );
}

// ─── アプリ本体 ───────────────────────────────────────────────────────────────
export default function CoinApp() {
  const [store, setStore] = useState(loadStore);
  const [tab, setTab] = useState("game");
  const [needCoins, setNeedCoins] = useState(false);
  useEffect(() => saveStore(store), [store]);

  const user = store.session;
  const wallet = user ? store.wallets[user.handle] ?? newWallet() : null;
  const total = wallet ? wallet.paid + wallet.free : 0;
  const shownTotal = useCountUp(total);

  const updateWallet = (handle, fn) =>
    setStore((s) => {
      const w = s.wallets[handle] ?? newWallet();
      return { ...s, wallets: { ...s.wallets, [handle]: { ...w, ...fn(w) } } };
    });

  const login = (u) =>
    setStore((s) => ({
      ...s, session: u,
      wallets: s.wallets[u.handle] ? s.wallets : { ...s.wallets, [u.handle]: newWallet() },
    }));
  const logout = () => { setTab("game"); setStore((s) => ({ ...s, session: null })); };

  if (!user) return <div className="app"><Login onLogin={login} /></div>;

  const me = user.handle;
  const nextDay = wallet.lastBonusDate === yesterday() ? (wallet.streak % 7) + 1 : 1;
  const bonusModal = !wallet.welcomed ? "welcome" : wallet.lastBonusDate !== ymd() ? "daily" : null;

  const claimWelcome = () =>
    updateWallet(me, (w) => ({
      welcomed: true, free: w.free + WELCOME_BONUS,
      history: addHistory(w, { label: "はじめてボーナス", coins: WELCOME_BONUS }),
    }));

  const claimDaily = () =>
    updateWallet(me, (w) => ({
      free: w.free + DAILY_BONUS[nextDay - 1], streak: nextDay, lastBonusDate: ymd(),
      history: addHistory(w, { label: `ログインボーナス ${nextDay}日目`, coins: DAILY_BONUS[nextDay - 1] }),
    }));

  // 無償コインから先に消費。配当は無償コインとして加算する。
  const placeBet = (bet) => {
    updateWallet(me, (w) => {
      const fromFree = Math.min(w.free, bet);
      return { free: w.free - fromFree, paid: w.paid - (bet - fromFree), spins: w.spins + 1 };
    });
    return (win) => {
      if (win > 0) updateWallet(me, (w) => ({ free: w.free + win, maxWin: Math.max(w.maxWin, win) }));
    };
  };

  const buy = (pack, method) =>
    updateWallet(me, (w) => ({
      paid: w.paid + pack.coins, free: w.free + pack.bonus,
      history: addHistory(w, { label: `コイン購入（${method}）`, coins: pack.coins + pack.bonus, price: pack.price }),
    }));

  const goShop = () => { setNeedCoins(false); setTab("shop"); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">MEDAL<span>LAND</span></div>
        <button className="balance" onClick={goShop} aria-label="コインを買い足す">
          <Coin size={22} /><b>{fmt(shownTotal)}</b><i>＋</i>
        </button>
      </header>

      <main>
        {/* スピン中にタブを切り替えても配当が失われないよう、ゲームは常にマウントしておく */}
        <div hidden={tab !== "game"}>
          <Game total={total} onBet={placeBet} onNeedCoins={() => setNeedCoins(true)} />
        </div>
        {tab === "shop" && <Shop wallet={wallet} onBuy={buy} />}
        {tab === "my" && <MyPage user={user} wallet={wallet} onLogout={logout} />}
      </main>

      <nav className="tabs">
        {[["game", "🎰", "ゲーム"], ["shop", "🛒", "ショップ"], ["my", "👤", "マイページ"]].map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>

      {bonusModal === "welcome" && <WelcomeModal onClaim={claimWelcome} />}
      {bonusModal === "daily" && <DailyModal day={nextDay} onClaim={claimDaily} />}

      {needCoins && (
        <Modal onClose={() => setNeedCoins(false)}>
          <h2>コインが足りません</h2>
          <p className="muted">
            ショップでコインを買い足すか、明日のログインボーナスをお待ちください。
          </p>
          <button className="btn gold" onClick={goShop}>ショップへ行く</button>
          <button className="btn ghost" onClick={() => setNeedCoins(false)}>とじる</button>
        </Modal>
      )}
    </div>
  );
}
