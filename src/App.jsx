import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SK = "lumera_v2";
const AUTH_KEY = "lumera_auth";

// デモ会員ID（実際は管理側で発行）
const MEMBERS = {
  "LM-0001": { name: "田中 彩花", plan: "Premium" },
  "LM-0002": { name: "佐藤 美咲", plan: "Standard" },
  "LM-0099": { name: "山田 陽菜", plan: "Premium" },
};

const defaultData = {
  goal: { weight: 52, startWeight: 58, calories: 1600, height: 162 },
  weights: [], meals: [], exercises: [],
  habits: [
    { id: 1, name: "白湯を飲む", icon: "🫧", done: [] },
    { id: 2, name: "7時間睡眠", icon: "🌙", done: [] },
    { id: 3, name: "朝のストレッチ", icon: "✨", done: [] },
  ],
  customVideos: [], customSchedule: [],
};

function loadData() {
  try { const r = localStorage.getItem(SK); return r ? { ...defaultData, ...JSON.parse(r) } : defaultData; }
  catch { return defaultData; }
}
function saveData(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} }
function loadAuth() {
  try { const r = localStorage.getItem(AUTH_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function saveAuth(a) { try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch {} }
function clearAuth() { try { localStorage.removeItem(AUTH_KEY); } catch {} }

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  if (d === today()) return "今日";
  return new Date(d).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });
};

const LIBRARY = [
  { id: "l1", cat: "有酸素", level: "初級", title: "朝の全身有酸素 15分", url: "https://www.youtube.com/embed/UItWltVZZmE", kcal: 120, min: 15 },
  { id: "l2", cat: "有酸素", level: "中級", title: "HIIT 20分", url: "https://www.youtube.com/embed/ml6cT4AZdqI", kcal: 250, min: 20 },
  { id: "l3", cat: "筋トレ", level: "初級", title: "自重スクワット 10分", url: "https://www.youtube.com/embed/aclHkVaku9U", kcal: 80, min: 10 },
  { id: "l4", cat: "筋トレ", level: "中級", title: "腹筋コア強化 15分", url: "https://www.youtube.com/embed/DHD1-2P94DI", kcal: 100, min: 15 },
  { id: "l5", cat: "ヨガ", level: "初級", title: "朝ヨガ 10分", url: "https://www.youtube.com/embed/4pKly2JojMw", kcal: 40, min: 10 },
  { id: "l6", cat: "ヨガ", level: "中級", title: "夜ヨガ 深ストレッチ 20分", url: "https://www.youtube.com/embed/v7AYKMP6rOE", kcal: 60, min: 20 },
];

const SCHEDULE = [
  { id: "s1", day: "月", time: "07:00", title: "朝の燃焼セッション", instructor: "田中コーチ", zoom: "https://zoom.us/j/123456789", cat: "有酸素", duration: 30 },
  { id: "s2", day: "月", time: "20:00", title: "夜のボディリセット", instructor: "鈴木先生", zoom: "https://zoom.us/j/987654321", cat: "ヨガ", duration: 45 },
  { id: "s3", day: "水", time: "12:00", title: "コアメイク", instructor: "山田トレーナー", zoom: "https://zoom.us/j/111222333", cat: "筋トレ", duration: 20 },
  { id: "s4", day: "水", time: "20:00", title: "ストレッチ & 呼吸法", instructor: "鈴木先生", zoom: "https://zoom.us/j/777888999", cat: "ヨガ", duration: 30 },
  { id: "s5", day: "金", time: "07:00", title: "全身サーキット", instructor: "田中コーチ", zoom: "https://zoom.us/j/202020202", cat: "有酸素", duration: 30 },
  { id: "s6", day: "土", time: "10:00", title: "週末ヨガ", instructor: "鈴木先生", zoom: "https://zoom.us/j/303030303", cat: "ヨガ", duration: 60 },
];

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

async function analyzeFoodImage(base64Image, mediaType) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
        { type: "text", text: `この食事の写真を分析して、以下のJSON形式のみで回答してください。余分なテキストは不要です。
{"dishes":[{"name":"料理名","calories":数値,"protein":数値,"carbs":数値,"fat":数値,"amount":"量の目安"}],"totalCalories":数値,"mealType":"朝食/昼食/夕食/間食","advice":"25文字以内のアドバイス","confidence":"高/中/低"}` }
      ]}]
    })
  });
  const data = await response.json();
  return JSON.parse(data.content.find(b => b.type === "text").text.replace(/```json|```/g, "").trim());
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(loadAuth);
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(null);

  useEffect(() => { saveData(data); }, [data]);
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));

  const login = (id) => {
    const member = MEMBERS[id.toUpperCase()];
    if (!member) return false;
    const a = { id: id.toUpperCase(), ...member, loginAt: Date.now() };
    saveAuth(a); setAuth(a); return true;
  };
  const logout = () => { clearAuth(); setAuth(null); };

  if (!auth) return <LoginScreen onLogin={login} />;

  const todayKcal = data.meals.filter(m => m.date === today()).reduce((s, m) => s + (m.calories || 0), 0);
  const burnedKcal = data.exercises.filter(e => e.date === today()).reduce((s, e) => s + (e.calories || 0), 0);
  const latestW = data.weights.length ? [...data.weights].sort((a, b) => b.date.localeCompare(a.date))[0].weight : null;

  const TABS = [
    { label: "HOME", icon: "◈" }, { label: "FOOD", icon: "◎" },
    { label: "LIVE", icon: "◉" }, { label: "MOVE", icon: "◇" }, { label: "LOG", icon: "◻" },
  ];

  return (
    <div style={S.app}>
      <style>{css}</style>
      <header style={S.header}>
        <div>
          <div style={S.logoSub}>私が輝き始める、ここから</div>
          <div style={S.logo}>LUMERA</div>
        </div>
        <div style={S.headerRight}>
          <div style={S.memberInfo}>
            <span style={S.memberName}>{auth.name}</span>
            <span style={S.memberId}>{auth.id}</span>
          </div>
          <button style={S.logoutBtn} onClick={logout}>退出</button>
        </div>
      </header>

      <main style={S.main}>
        {tab === 0 && <HomeTab data={data} upd={upd} todayKcal={todayKcal} burnedKcal={burnedKcal} latestW={latestW} setTab={setTab} auth={auth} />}
        {tab === 1 && <AIFoodTab data={data} upd={upd} />}
        {tab === 2 && <LiveTab data={data} upd={upd} />}
        {tab === 3 && <LibraryTab data={data} upd={upd} playing={playing} setPlaying={setPlaying} />}
        {tab === 4 && <LogTab data={data} upd={upd} />}
      </main>

      <nav style={S.nav}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ ...S.navBtn, ...(tab === i ? S.navActive : {}) }}>
            <span style={{ fontSize: 15, color: tab === i ? GOLD : "rgba(255,255,255,0.3)" }}>{t.icon}</span>
            <span style={{ ...S.navLabel, color: tab === i ? GOLD : "rgba(255,255,255,0.3)" }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [id, setId] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // 前回使ったIDを履歴から取得
  const lastAuth = loadAuth();

  const handleLogin = async (useId) => {
    const loginId = useId || id;
    if (!loginId.trim()) return;
    setLoading(true); setError(false);
    await new Promise(r => setTimeout(r, 600)); // 自然な遅延
    const ok = onLogin(loginId.trim());
    if (!ok) { setError(true); setLoading(false); }
  };

  return (
    <div style={LS.wrap}>
      <style>{css}</style>

      {/* Background texture */}
      <div style={LS.bg} />

      <div style={LS.inner}>
        {/* Logo */}
        <div style={LS.logoArea}>
          <div style={LS.logoSub}>私が輝き始める、ここから</div>
          <div style={LS.logo}>LUMERA</div>
          <div style={LS.dividerLine} />
          <div style={LS.memberPortal}>MEMBER PORTAL</div>
        </div>

        {/* Quick re-login: 前回のIDが残っていれば表示 */}
        {lastAuth && (
          <div style={LS.quickBox}>
            <div style={LS.quickLabel}>前回のアカウント</div>
            <button style={LS.quickCard} onClick={() => handleLogin(lastAuth.id)} disabled={loading}>
              <div style={LS.quickName}>{lastAuth.name}</div>
              <div style={LS.quickId}>{lastAuth.id}</div>
              <div style={LS.quickArrow}>{loading ? "..." : "→"}</div>
            </button>
            <div style={LS.quickOr}>別のIDでログイン</div>
          </div>
        )}

        {/* ID入力 */}
        <div style={LS.formArea}>
          <div style={LS.inputLabel}>会員ID</div>
          <input
            style={{ ...LS.input, borderColor: error ? "rgba(201,169,122,0.8)" : "rgba(255,255,255,0.15)" }}
            placeholder="例：LM-0001"
            value={id}
            onChange={e => { setId(e.target.value); setError(false); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <div style={LS.errorMsg}>会員IDが見つかりません</div>}

          <button style={{ ...LS.loginBtn, opacity: loading ? 0.6 : 1 }}
            onClick={() => handleLogin()} disabled={loading || !id.trim()}>
            {loading ? <span style={LS.loadDots}><span>·</span><span>·</span><span>·</span></span> : "ログイン"}
          </button>
        </div>

        {/* デモ用ヒント */}
        <div style={LS.hint}>
          <div style={LS.hintTitle}>デモ用 会員ID</div>
          {Object.entries(MEMBERS).map(([id, m]) => (
            <button key={id} style={LS.hintChip} onClick={() => { setId(id); setError(false); }}>
              {id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeTab({ data, upd, todayKcal, burnedKcal, latestW, setTab, auth }) {
  const net = todayKcal - burnedKcal;
  const goal = data.goal.calories;
  const pct = Math.min(100, Math.round((net / goal) * 100));
  const over = net > goal;
  const todayDay = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const todayLive = SCHEDULE.filter(s => s.day === todayDay).sort((a, b) => a.time.localeCompare(b.time));
  const doneCount = data.habits.filter(h => h.done.includes(today())).length;

  return (
    <div style={S.page}>
      <div style={S.dateLine}>
        {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
        <span style={{ marginLeft: 10, color: GOLD, fontSize: 10 }}>{auth.plan}</span>
      </div>

      {/* Calorie hero */}
      <div style={S.heroCard}>
        <div style={S.heroInner}>
          <div>
            <div style={S.eyebrow}>TODAY'S INTAKE</div>
            <div style={{ fontSize: 52, fontWeight: 300, lineHeight: 1, color: over ? GOLD : "#fff" }}>{net}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6, letterSpacing: "0.1em" }}>kcal · {over ? `+${net - goal} over` : `${goal - net} remaining`}</div>
          </div>
          <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
              <circle cx="48" cy="48" r="40" fill="none" stroke={over ? GOLD : "rgba(255,255,255,0.75)"}
                strokeWidth="5" strokeDasharray={`${2 * Math.PI * 40 * pct / 100} 999`}
                strokeLinecap="round" transform="rotate(-90 48 48)"
                style={{ transition: "stroke-dasharray .8s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 300, color: "#fff" }}>{pct}%</div>
          </div>
        </div>
        <div style={S.heroBar}>
          {[["摂取", todayKcal], ["消費", burnedKcal], ["目標", goal]].map(([l, v]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 300, color: "#fff" }}>{v}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 3, letterSpacing: "0.12em" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick tiles */}
      <div style={S.tileRow}>
        <QuickTile icon="◎" label="AI食事分析" onClick={() => setTab(1)} arrow />
        <QuickTile icon="◉" label="LIVE" value={`${todayLive.length}本`} onClick={() => setTab(2)} />
        <QuickTile icon="⚖" label="体重" value={latestW ? `${latestW}kg` : "—"} onClick={() => setTab(4)} />
      </div>

      {/* Today LIVE */}
      {todayLive.length > 0 && (
        <div style={S.section}>
          <SecHead label="TODAY'S LIVE CLASS" action="すべて見る" onAction={() => setTab(2)} />
          {todayLive.map(s => <LiveCard key={s.id} s={s} />)}
        </div>
      )}

      {/* Habits */}
      <div style={S.section}>
        <SecHead label="DAILY RITUAL" action={`${doneCount} / ${data.habits.length}`} />
        {data.habits.map(h => {
          const done = h.done.includes(today());
          return (
            <div key={h.id} style={S.habitRow}
              onClick={() => upd("habits", data.habits.map(hh => hh.id === h.id
                ? { ...hh, done: done ? hh.done.filter(d => d !== today()) : [...hh.done, today()] } : hh))}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: done ? "none" : "1.5px solid rgba(255,255,255,0.25)", background: done ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .25s" }}>
                  {done && <span style={{ fontSize: 10, color: "#1a1412" }}>✓</span>}
                </div>
                <span style={{ fontSize: 14, color: done ? "#fff" : "rgba(255,255,255,0.6)", transition: "color .2s" }}>{h.icon} {h.name}</span>
              </div>
              <span style={{ fontSize: 11, color: done ? GOLD : "transparent" }}>{h.done.length}日</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickTile({ icon, label, value, onClick, arrow }) {
  return (
    <div style={S.tile} onClick={onClick}>
      <div style={{ fontSize: 16, color: GOLD, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 10, color: MUTED, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      {value && <div style={{ fontSize: 15, color: "#fff", fontWeight: 300 }}>{value}</div>}
      {arrow && <div style={{ fontSize: 12, color: GOLD, marginTop: 4 }}>→</div>}
    </div>
  );
}

function SecHead({ label, action, onAction }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div style={S.eyebrow}>{label}</div>
      {action && <button style={{ background: "none", border: "none", fontSize: 11, color: GOLD, cursor: "pointer", letterSpacing: "0.05em" }} onClick={onAction}>{action}</button>}
    </div>
  );
}

// ─── AI FOOD ──────────────────────────────────────────────────────────────────
function AIFoodTab({ data, upd }) {
  const [image, setImage] = useState(null);
  const [b64, setB64] = useState(null);
  const [mime, setMime] = useState("image/jpeg");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(); const camRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    setResult(null); setSaved(false); setError(null); setMime(file.type || "image/jpeg");
    const r = new FileReader();
    r.onload = e => { setImage(e.target.result); setB64(e.target.result.split(",")[1]); };
    r.readAsDataURL(file);
  };
  const analyze = async () => {
    setLoading(true); setError(null); setResult(null); setSaved(false);
    try { setResult(await analyzeFoodImage(b64, mime)); }
    catch { setError("分析できませんでした。もう一度お試しください。"); }
    finally { setLoading(false); }
  };
  const saveLog = () => {
    if (!result || saved) return;
    upd("meals", [...data.meals, ...result.dishes.map(d => ({ name: d.name, calories: d.calories, type: result.mealType, date: today(), ai: true }))]);
    setSaved(true);
  };

  return (
    <div style={S.page}>
      <PageHead title="AI FOOD SCAN" sub="写真を撮るだけでカロリーを分析" />
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />

      <div style={{ ...S.uploadBox, border: image ? "none" : "1.5px dashed rgba(255,255,255,0.15)" }} onClick={() => fileRef.current.click()}>
        {image
          ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, color: GOLD, opacity: 0.7, marginBottom: 12 }}>◎</div>
              <div style={{ fontSize: 14, color: "#fff", letterSpacing: "0.05em", marginBottom: 6 }}>タップして写真を選択</div>
              <div style={{ fontSize: 11, color: MUTED }}>ギャラリー / カメラ</div>
            </div>
        }
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button style={S.ghostBtn} onClick={() => camRef.current.click()}>📷 カメラ</button>
        <button style={S.ghostBtn} onClick={() => fileRef.current.click()}>🖼 ライブラリ</button>
      </div>

      {image && !loading && !result && (
        <button style={S.goldBtn} onClick={analyze}>✦ AI で分析する</button>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ animation: "lspin 1.2s linear infinite", display: "block", margin: "0 auto 14px" }}>
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(201,169,122,0.2)" strokeWidth="2" />
            <circle cx="22" cy="22" r="18" fill="none" stroke={GOLD} strokeWidth="2" strokeDasharray="28 84" strokeLinecap="round" transform="rotate(-90 22 22)" />
          </svg>
          <div style={{ fontSize: 13, color: "#fff", letterSpacing: "0.1em" }}>食事を分析中...</div>
        </div>
      )}

      {error && <div style={{ background: "rgba(201,169,122,0.08)", border: "1px solid rgba(201,169,122,0.25)", borderRadius: 2, padding: 14, fontSize: 13, color: GOLD, textAlign: "center" }}>{error}</div>}

      {result && (
        <div>
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 18, marginBottom: 18 }}>
            <div style={S.eyebrow}>TOTAL CALORIES</div>
            <div style={{ fontSize: 52, fontWeight: 300, color: GOLD, lineHeight: 1 }}>{result.totalCalories}<span style={{ fontSize: 16, color: MUTED, marginLeft: 6 }}>kcal</span></div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{result.mealType} · 精度：{result.confidence}</div>
          </div>

          {result.dishes[0]?.protein !== undefined && (
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 16, marginBottom: 16 }}>
              {[["Protein", result.dishes.reduce((s, d) => s + (d.protein || 0), 0), GOLD],
                ["Carbs", result.dishes.reduce((s, d) => s + (d.carbs || 0), 0), "#fff"],
                ["Fat", result.dishes.reduce((s, d) => s + (d.fat || 0), 0), MUTED]].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 300, color: c }}>{v}<span style={{ fontSize: 10 }}>g</span></div>
                  <div style={{ fontSize: 9, color: MUTED, marginTop: 2, letterSpacing: "0.1em" }}>{l}</div>
                </div>
              ))}
            </div>
          )}

          {result.dishes.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div>
                <div style={{ fontSize: 14, color: "#fff" }}>{d.name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{d.amount}</div>
              </div>
              <div style={{ fontSize: 14, color: MUTED }}>{d.calories} kcal</div>
            </div>
          ))}

          {result.advice && (
            <div style={{ display: "flex", gap: 8, padding: "14px 0", color: MUTED, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: GOLD, flexShrink: 0 }}>✦</span>
              <span style={{ fontSize: 13, lineHeight: 1.6 }}>{result.advice}</span>
            </div>
          )}

          <button style={{ ...S.goldBtn, marginTop: 18, background: saved ? "rgba(201,169,122,0.15)" : "rgba(201,169,122,0.1)", opacity: saved ? 0.8 : 1 }} onClick={saveLog} disabled={saved}>
            {saved ? "✓ 記録に保存しました" : "食事記録に追加する"}
          </button>
          <button style={{ ...S.ghostBtn, width: "100%", marginTop: 8 }} onClick={() => { setImage(null); setB64(null); setResult(null); setSaved(false); }}>別の写真で試す</button>
        </div>
      )}
    </div>
  );
}

// ─── LIVE ─────────────────────────────────────────────────────────────────────
function LiveTab({ data, upd }) {
  const [selDay, setSelDay] = useState(DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", instructor: "", time: "09:00", day: "月", zoom: "", cat: "ヨガ", duration: 45 });
  const allSch = [...SCHEDULE, ...data.customSchedule];
  const filtered = allSch.filter(s => s.day === selDay).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={S.page}>
      <PageHead title="LIVE CLASS" sub="Zoomでオンラインレッスンに参加" />
      <div style={S.dayStrip}>
        {DAYS.map(d => {
          const isToday = d === DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
          return (
            <button key={d} onClick={() => setSelDay(d)} style={{ ...S.dayChip, ...(selDay === d ? S.dayChipOn : {}), position: "relative" }}>
              {d}{isToday && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: GOLD, display: "block" }} />}
            </button>
          );
        })}
      </div>
      {filtered.length === 0
        ? <div style={S.emptyMsg}>この曜日はレッスンなし</div>
        : filtered.map(s => <LiveCard key={s.id} s={s} />)
      }
      {adding ? (
        <div style={S.card}>
          <div style={S.cardTitle}>セッションを追加</div>
          <input style={S.input} placeholder="レッスン名" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <input style={S.input} placeholder="講師名" value={form.instructor} onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} />
          <input style={S.input} placeholder="Zoom URL" value={form.zoom} onChange={e => setForm(f => ({ ...f, zoom: e.target.value }))} />
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...S.input, flex: 1 }} value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))}>{DAYS.map(d => <option key={d}>{d}</option>)}</select>
            <input style={{ ...S.input, flex: 1 }} type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button style={{ ...S.ghostBtn, flex: 1 }} onClick={() => setAdding(false)}>キャンセル</button>
            <button style={{ ...S.goldBtn, flex: 1, marginTop: 0 }} onClick={() => { if (!form.title || !form.zoom) return; upd("customSchedule", [...data.customSchedule, { ...form, id: `c${Date.now()}` }]); setAdding(false); }}>追加</button>
          </div>
        </div>
      ) : (
        <button style={S.addLineBtn} onClick={() => setAdding(true)}>＋ セッションを追加</button>
      )}
    </div>
  );
}

function LiveCard({ s }) {
  const now = new Date();
  const [h, m] = s.time.split(":").map(Number);
  const ct = new Date(); ct.setHours(h, m, 0);
  const diff = Math.round((ct - now) / 60000);
  const soon = diff >= 0 && diff <= 30;
  const past = diff < -s.duration;
  const catC = { 有酸素: GOLD, 筋トレ: "#fff", ヨガ: "rgba(255,255,255,0.7)" };

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 2, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14, opacity: past ? 0.4 : 1, borderLeft: soon ? `2px solid ${GOLD}` : "2px solid transparent" }}>
      <div style={{ minWidth: 46 }}>
        <div style={{ fontSize: 15, fontWeight: 300, color: "#fff" }}>{s.time}</div>
        {soon && <div style={{ fontSize: 9, color: GOLD, marginTop: 2, letterSpacing: "0.1em" }}>まもなく</div>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: "#fff", marginBottom: 3 }}>{s.title}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{s.instructor} · {s.duration}min · <span style={{ color: catC[s.cat] }}>{s.cat}</span></div>
      </div>
      <a href={s.zoom} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 11, color: soon ? GOLD : MUTED, border: `1px solid ${soon ? "rgba(201,169,122,0.5)" : "rgba(255,255,255,0.15)"}`, borderRadius: 1, padding: "7px 12px", textDecoration: "none", letterSpacing: "0.12em", whiteSpace: "nowrap", pointerEvents: past ? "none" : "auto" }}>
        {past ? "終了" : "入室"}
      </a>
    </div>
  );
}

// ─── LIBRARY ──────────────────────────────────────────────────────────────────
function LibraryTab({ data, upd, playing, setPlaying }) {
  const [cat, setCat] = useState("全て");
  const [adding, setAdding] = useState(false);
  const [vf, setVf] = useState({ title: "", url: "", cat: "ヨガ", level: "初級", kcal: 60, min: 20 });
  const CATS = ["全て", "ヨガ", "有酸素", "筋トレ"];
  const all = [...LIBRARY, ...data.customVideos];
  const filtered = all.filter(v => cat === "全て" || v.cat === cat);
  const toEmbed = url => { const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/); return m ? `https://www.youtube.com/embed/${m[1]}` : url; };

  return (
    <div style={S.page}>
      <PageHead title="MOVEMENT LIBRARY" sub={`${all.length} programs`} />
      <div style={S.dayStrip}>
        {CATS.map(c => <button key={c} onClick={() => setCat(c)} style={{ ...S.dayChip, ...(cat === c ? S.dayChipOn : {}) }}>{c}</button>)}
      </div>
      {playing && (
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden", marginBottom: 20, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 14px 10px" }}>
            <div>
              <div style={{ fontSize: 14, color: "#fff", marginBottom: 3 }}>{playing.title}</div>
              <div style={{ fontSize: 11, color: MUTED }}>{playing.cat} · {playing.level} · {playing.min}min · {playing.kcal}kcal</div>
            </div>
            <button style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 1, width: 26, height: 26, cursor: "pointer", fontSize: 11, color: MUTED }} onClick={() => setPlaying(null)}>✕</button>
          </div>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe src={playing.url} title={playing.title} frameBorder="0" allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
          </div>
        </div>
      )}
      <div>
        {filtered.map(v => (
          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" }} onClick={() => setPlaying(v)}>
            <div style={{ fontSize: 13, color: GOLD, flexShrink: 0 }}>▷</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "#fff", marginBottom: 3 }}>{v.title}</div>
              <div style={{ fontSize: 11, color: MUTED }}>{v.cat} · {v.level} · {v.min}min · {v.kcal}kcal</div>
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>→</div>
          </div>
        ))}
      </div>
      {adding ? (
        <div style={S.card}>
          <div style={S.cardTitle}>動画を追加</div>
          <input style={S.input} placeholder="タイトル" value={vf.title} onChange={e => setVf(f => ({ ...f, title: e.target.value }))} />
          <input style={S.input} placeholder="YouTube URL" value={vf.url} onChange={e => setVf(f => ({ ...f, url: e.target.value }))} />
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...S.input, flex: 1 }} value={vf.cat} onChange={e => setVf(f => ({ ...f, cat: e.target.value }))}>{["ヨガ", "有酸素", "筋トレ"].map(c => <option key={c}>{c}</option>)}</select>
            <select style={{ ...S.input, flex: 1 }} value={vf.level} onChange={e => setVf(f => ({ ...f, level: e.target.value }))}>{["初級", "中級", "上級"].map(l => <option key={l}>{l}</option>)}</select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button style={{ ...S.ghostBtn, flex: 1 }} onClick={() => setAdding(false)}>キャンセル</button>
            <button style={{ ...S.goldBtn, flex: 1, marginTop: 0 }} onClick={() => { if (!vf.title || !vf.url) return; upd("customVideos", [...data.customVideos, { ...vf, id: `v${Date.now()}`, url: toEmbed(vf.url) }]); setAdding(false); }}>追加</button>
          </div>
        </div>
      ) : (
        <button style={S.addLineBtn} onClick={() => setAdding(true)}>＋ 動画を追加する</button>
      )}
    </div>
  );
}

// ─── LOG ──────────────────────────────────────────────────────────────────────
function LogTab({ data, upd }) {
  const [sub, setSub] = useState(0);
  return (
    <div style={S.page}>
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 20 }}>
        {["FOOD", "BODY", "MOVE"].map((t, i) => (
          <button key={t} onClick={() => setSub(i)} style={{ flex: 1, background: "none", border: "none", padding: "10px", fontSize: 10, letterSpacing: "0.2em", cursor: "pointer", color: sub === i ? GOLD : "rgba(255,255,255,0.35)", borderBottom: sub === i ? `1px solid ${GOLD}` : "1px solid transparent", transition: "color .15s" }}>{t}</button>
        ))}
      </div>
      {sub === 0 && <FoodLog data={data} upd={upd} />}
      {sub === 1 && <BodyLog data={data} upd={upd} />}
      {sub === 2 && <MoveLog data={data} upd={upd} />}
    </div>
  );
}

function FoodLog({ data, upd }) {
  const [name, setName] = useState(""); const [cal, setCal] = useState(""); const [type, setType] = useState("朝食");
  const add = () => { if (!name || !cal) return; upd("meals", [...data.meals, { name, calories: Number(cal), type, date: today() }]); setName(""); setCal(""); };
  const grouped = [...data.meals].sort((a, b) => b.date.localeCompare(a.date)).reduce((acc, m) => { (acc[m.date] = acc[m.date] || []).push(m); return acc; }, {});
  return (
    <div>
      <div style={S.card}>
        <input style={S.input} placeholder="食事名" value={name} onChange={e => setName(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ ...S.input, flex: 1 }} value={type} onChange={e => setType(e.target.value)}>{["朝食", "昼食", "夕食", "間食"].map(t => <option key={t}>{t}</option>)}</select>
          <input style={{ ...S.input, flex: 1 }} type="number" placeholder="kcal" value={cal} onChange={e => setCal(e.target.value)} />
        </div>
        <button style={S.goldBtn} onClick={add}>記録する</button>
      </div>
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: GOLD, padding: "4px 0 10px" }}>{fmtDate(date)}</div>
          {items.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {m.ai && <span style={{ fontSize: 8, color: GOLD, border: `1px solid rgba(201,169,122,0.4)`, borderRadius: 1, padding: "1px 5px", letterSpacing: "0.1em" }}>AI</span>}
                <div>
                  <div style={{ fontSize: 13, color: "#fff" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{m.type}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "#fff" }}>{m.calories} kcal</span>
                <button style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 15 }} onClick={() => upd("meals", data.meals.filter(x => x !== m))}>×</button>
              </div>
            </div>
          ))}
          <div style={{ textAlign: "right", fontSize: 10, color: MUTED, padding: "6px 0", letterSpacing: "0.08em" }}>{items.reduce((s, m) => s + m.calories, 0)} kcal total</div>
        </div>
      ))}
    </div>
  );
}

function BodyLog({ data, upd }) {
  const [val, setVal] = useState("");
  const add = () => { if (!val) return; upd("weights", [...data.weights, { weight: Number(val), date: today() }]); setVal(""); };
  const sorted = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const goal = data.goal.weight;
  const max = sorted.length ? Math.max(...sorted.map(w => w.weight), goal) + 1.5 : 65;
  const min = sorted.length ? Math.min(...sorted.map(w => w.weight), goal) - 1.5 : 48;
  const range = max - min || 1;
  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...S.input, flex: 1 }} type="number" step="0.1" placeholder="体重 (kg)" value={val} onChange={e => setVal(e.target.value)} />
          <button style={{ ...S.goldBtn, flex: "0 0 80px", marginTop: 0 }} onClick={add}>記録</button>
        </div>
      </div>
      {sorted.length >= 2 && (
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 2, padding: "16px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={S.eyebrow}>WEIGHT TREND</div>
          <svg width="100%" height="100" viewBox="0 0 300 100" preserveAspectRatio="none">
            <line x1="0" y1={((max - goal) / range) * 80 + 10} x2="300" y2={((max - goal) / range) * 80 + 10} stroke={`rgba(201,169,122,0.25)`} strokeWidth="1" strokeDasharray="4 4" />
            <polyline points={sorted.map((w, i) => `${(i / (sorted.length - 1)) * 280 + 10},${((max - w.weight) / range) * 80 + 10}`).join(" ")}
              fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            {sorted.map((w, i) => <circle key={i} cx={(i / (sorted.length - 1)) * 280 + 10} cy={((max - w.weight) / range) * 80 + 10} r="3" fill={GOLD} />)}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, marginTop: 6 }}>
            <span style={{ color: "rgba(201,169,122,0.7)" }}>goal {goal}kg</span>
            <span>latest {sorted[sorted.length - 1].weight}kg</span>
          </div>
        </div>
      )}
      <div>
        {[...sorted].reverse().slice(0, 10).map((w, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: 12, color: MUTED }}>{fmtDate(w.date)}</span>
            <span style={{ fontSize: 13, color: "#fff" }}>{w.weight} kg</span>
          </div>
        ))}
        {!sorted.length && <div style={S.emptyMsg}>体重を記録しましょう</div>}
      </div>
    </div>
  );
}

const EX_PRESETS = [
  { name: "ウォーキング 30分", cal: 120 }, { name: "ジョギング 30分", cal: 250 },
  { name: "ヨガ 30分", cal: 90 }, { name: "筋トレ 30分", cal: 150 },
  { name: "HIIT 20分", cal: 280 }, { name: "水泳 30分", cal: 200 },
];

function MoveLog({ data, upd }) {
  const [name, setName] = useState(""); const [cal, setCal] = useState("");
  const add = (n, c) => { upd("exercises", [...data.exercises, { name: n || name, calories: Number(c || cal), date: today() }]); setName(""); setCal(""); };
  const grouped = [...data.exercises].sort((a, b) => b.date.localeCompare(a.date)).reduce((acc, e) => { (acc[e.date] = acc[e.date] || []).push(e); return acc; }, {});
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {EX_PRESETS.map(p => (
          <button key={p.name} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 1, padding: "8px 10px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "#fff" }} onClick={() => add(p.name, p.cal)}>
            <span style={{ fontSize: 11 }}>{p.name}</span>
            <span style={{ fontSize: 10, color: GOLD }}>-{p.cal}</span>
          </button>
        ))}
      </div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...S.input, flex: 2 }} placeholder="カスタム運動名" value={name} onChange={e => setName(e.target.value)} />
          <input style={{ ...S.input, flex: 1 }} type="number" placeholder="kcal" value={cal} onChange={e => setCal(e.target.value)} />
        </div>
        <button style={S.goldBtn} onClick={() => add()}>記録する</button>
      </div>
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: GOLD, padding: "4px 0 10px" }}>{fmtDate(date)}</div>
          {items.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize: 13, color: "#fff" }}>{e.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: GOLD }}>−{e.calories} kcal</span>
                <button style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 15 }} onClick={() => upd("exercises", data.exercises.filter(x => x !== e))}>×</button>
              </div>
            </div>
          ))}
          <div style={{ textAlign: "right", fontSize: 10, color: MUTED, padding: "6px 0" }}>{items.reduce((s, e) => s + e.calories, 0)} kcal burned</div>
        </div>
      ))}
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function PageHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, letterSpacing: "0.2em", color: "#fff", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: MUTED, letterSpacing: "0.05em" }}>{sub}</div>
    </div>
  );
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const BG = "#0e0c0b";
const SURF = "rgba(255,255,255,0.05)";
const GOLD = "#c9a97a";
const MUTED = "rgba(255,255,255,0.45)";

const S = {
  app: { fontFamily: "'Georgia', 'Hiragino Mincho ProN', serif", background: BG, minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", color: "#fff" },
  header: { padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", position: "sticky", top: 0, background: BG, zIndex: 10 },
  logoSub: { fontSize: 9, letterSpacing: "0.25em", color: GOLD, marginBottom: 4, fontFamily: "sans-serif" },
  logo: { fontSize: 24, fontWeight: 400, letterSpacing: "0.18em", color: "#fff" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  memberInfo: { textAlign: "right" },
  memberName: { display: "block", fontSize: 12, color: "#fff", marginBottom: 2 },
  memberId: { display: "block", fontSize: 10, color: MUTED, letterSpacing: "0.08em" },
  logoutBtn: { background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 1, padding: "5px 10px", fontSize: 10, color: MUTED, cursor: "pointer", letterSpacing: "0.1em", fontFamily: "sans-serif" },
  main: { flex: 1, overflowY: "auto", paddingBottom: 72 },
  nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: BG, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", padding: "10px 0 14px", zIndex: 10 },
  navBtn: { flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: 1, transition: "opacity .2s" },
  navActive: {},
  navLabel: { fontSize: 8, letterSpacing: "0.15em", fontFamily: "sans-serif" },

  page: { padding: "24px 20px 12px" },
  dateLine: { fontSize: 10, color: MUTED, letterSpacing: "0.1em", marginBottom: 20, fontFamily: "sans-serif" },
  eyebrow: { fontSize: 9, letterSpacing: "0.2em", color: GOLD, marginBottom: 8, fontFamily: "sans-serif" },

  heroCard: { background: SURF, borderRadius: 2, padding: "22px 20px 18px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)" },
  heroInner: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  heroBar: { display: "flex", justifyContent: "space-around", paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" },

  tileRow: { display: "flex", gap: 8, marginBottom: 24 },
  tile: { flex: 1, background: SURF, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, padding: "14px 10px", cursor: "pointer" },

  section: { marginBottom: 28 },
  habitRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.07)", cursor: "pointer" },

  card: { background: SURF, borderRadius: 2, padding: 16, marginBottom: 14, border: "1px solid rgba(255,255,255,0.08)" },
  cardTitle: { fontSize: 10, letterSpacing: "0.15em", color: GOLD, marginBottom: 12, fontFamily: "sans-serif" },
  input: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 1, padding: "11px 12px", fontSize: 13, color: "#fff", outline: "none", boxSizing: "border-box", marginBottom: 8, fontFamily: "sans-serif" },
  goldBtn: { width: "100%", background: "rgba(201,169,122,0.12)", color: GOLD, border: "1px solid rgba(201,169,122,0.35)", borderRadius: 1, padding: "12px", fontSize: 11, letterSpacing: "0.18em", cursor: "pointer", marginTop: 8, fontFamily: "sans-serif", transition: "background .2s" },
  ghostBtn: { flex: 1, background: "none", color: MUTED, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 1, padding: "11px 12px", fontSize: 11, letterSpacing: "0.08em", cursor: "pointer", fontFamily: "sans-serif" },
  addLineBtn: { width: "100%", background: "none", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 1, padding: 14, fontSize: 10, color: MUTED, cursor: "pointer", letterSpacing: "0.12em", marginTop: 8, fontFamily: "sans-serif" },

  dayStrip: { display: "flex", gap: 6, marginBottom: 20, overflowX: "auto" },
  dayChip: { minWidth: 38, height: 38, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 1, background: "none", color: MUTED, fontSize: 13, cursor: "pointer", flexShrink: 0, transition: "all .15s", fontFamily: "sans-serif" },
  dayChipOn: { background: "rgba(201,169,122,0.15)", color: GOLD, borderColor: GOLD },

  uploadBox: { width: "100%", height: 200, borderRadius: 2, overflow: "hidden", marginBottom: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  emptyMsg: { textAlign: "center", color: MUTED, fontSize: 12, padding: "32px 0", letterSpacing: "0.05em", fontFamily: "sans-serif" },
};

// ─── LOGIN STYLES ─────────────────────────────────────────────────────────────
const LS = {
  wrap: { minHeight: "100vh", maxWidth: 480, margin: "0 auto", background: BG, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  bg: { position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(201,169,122,0.08) 0%, transparent 70%)", pointerEvents: "none" },
  inner: { width: "100%", padding: "40px 32px", position: "relative", zIndex: 1 },

  logoArea: { textAlign: "center", marginBottom: 44 },
  logoSub: { fontSize: 10, letterSpacing: "0.3em", color: GOLD, marginBottom: 10, fontFamily: "sans-serif" },
  logo: { fontSize: 36, fontWeight: 400, letterSpacing: "0.22em", color: "#fff", marginBottom: 20 },
  dividerLine: { width: 40, height: "0.5px", background: `rgba(201,169,122,0.4)`, margin: "0 auto 16px" },
  memberPortal: { fontSize: 9, letterSpacing: "0.35em", color: MUTED, fontFamily: "sans-serif" },

  // Quick re-login
  quickBox: { marginBottom: 28 },
  quickLabel: { fontSize: 9, letterSpacing: "0.2em", color: MUTED, marginBottom: 10, fontFamily: "sans-serif" },
  quickCard: { width: "100%", background: SURF, border: `1px solid rgba(201,169,122,0.25)`, borderRadius: 2, padding: "14px 18px", display: "flex", alignItems: "center", cursor: "pointer", textAlign: "left", transition: "border-color .2s" },
  quickName: { flex: 1, fontSize: 15, color: "#fff", fontFamily: "'Georgia', serif" },
  quickId: { fontSize: 11, color: GOLD, letterSpacing: "0.1em", marginRight: 12, fontFamily: "sans-serif" },
  quickArrow: { fontSize: 16, color: GOLD },
  quickOr: { fontSize: 9, color: MUTED, letterSpacing: "0.15em", marginTop: 18, marginBottom: 0, fontFamily: "sans-serif", textAlign: "center" },

  // Form
  formArea: { marginBottom: 32 },
  inputLabel: { fontSize: 9, letterSpacing: "0.2em", color: MUTED, marginBottom: 10, fontFamily: "sans-serif" },
  input: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 1, padding: "14px 16px", fontSize: 16, color: "#fff", outline: "none", boxSizing: "border-box", letterSpacing: "0.12em", fontFamily: "sans-serif", marginBottom: 8 },
  errorMsg: { fontSize: 11, color: "rgba(201,169,122,0.8)", letterSpacing: "0.05em", marginBottom: 8, fontFamily: "sans-serif" },
  loginBtn: { width: "100%", background: "rgba(201,169,122,0.12)", color: GOLD, border: "1px solid rgba(201,169,122,0.4)", borderRadius: 1, padding: "14px", fontSize: 11, letterSpacing: "0.25em", cursor: "pointer", fontFamily: "sans-serif", marginTop: 4, transition: "background .2s" },
  loadDots: { display: "flex", gap: 4, justifyContent: "center", alignItems: "center" },

  // Hint
  hint: { textAlign: "center" },
  hintTitle: { fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.15em", marginBottom: 10, fontFamily: "sans-serif" },
  hintChip: { background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 1, padding: "5px 12px", fontSize: 11, color: "rgba(255,255,255,0.35)", cursor: "pointer", margin: "0 4px", fontFamily: "sans-serif", letterSpacing: "0.08em" },
};

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
input::placeholder { color: rgba(255,255,255,0.2); }
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
select { appearance: none; color: #fff; }
select option { background: #191512; color: #fff; }
::-webkit-scrollbar { width: 0; height: 0; }
@keyframes lspin { to { transform: rotate(360deg); } }
button:active { opacity: 0.65; }
a:active { opacity: 0.65; }
`;
