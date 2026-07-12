import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Calendar, Users, ClipboardList, Wallet, User, Plus, X, Check,
  Trash2, Sparkles, Send, ChevronLeft, ChevronRight, Search,
  Clock, BookOpen, TrendingUp, Loader2, AlertCircle, Bot,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   TOKENS
   ═══════════════════════════════════════════════════════════════ */

const T = {
  brand: "#E8820C",
  brandSoft: "#FFF4E6",
  brandDeep: "#B8650A",
  ink: "#1C1B1F",
  ink60: "#6B6873",
  ink30: "#A5A2AC",
  line: "#E6E3DE",
  surface: "#FFFFFF",
  bg: "#F7F6F3",
  ok: "#1E9E62",
  okSoft: "#E6F5EE",
  warn: "#C4441F",
  warnSoft: "#FBEAE5",
};

const GRADES = [
  "İlkokul", "5. Sınıf", "6. Sınıf", "7. Sınıf", "8. Sınıf (LGS)",
  "9. Sınıf", "10. Sınıf", "11. Sınıf", "12. Sınıf (YKS)", "Mezun", "Üniversite",
];

const DURATIONS = ["40 dk", "60 dk", "90 dk", "120 dk"];
const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00 – 22:00

/* ═══════════════════════════════════════════════════════════════
   DATE HELPERS  — dersler gerçek tarihe bağlı, hafta gezinme çalışır
   ═══════════════════════════════════════════════════════════════ */

const iso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
/** Pazartesi = haftanın ilk günü */
const startOfWeek = (d) => {
  const c = new Date(d);
  const wd = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - wd);
  c.setHours(0, 0, 0, 0);
  return c;
};
const weekdayIndex = (d) => (d.getDay() + 6) % 7;
const sameDay = (a, b) => iso(a) === iso(b);
const fmtDate = (s) => {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};
const money = (n) => "₺" + Number(n || 0).toLocaleString("tr-TR");

/* ═══════════════════════════════════════════════════════════════
   STORAGE  — tüm veri tek anahtarda; yenilemede kaybolmaz
   ═══════════════════════════════════════════════════════════════ */

const KEY = "keci-data-v1";
const EMPTY = { students: [], lessons: [], homework: [], library: [], payments: [] };

/**
 * İki katmanlı kalıcılık: önce window.storage (artifact ortamı),
 * yoksa localStorage (tarayıcı / kendi projeniz). Biri çalışmazsa diğeri devreye girer.
 */
const disk = {
  async read() {
    try {
      const res = await window.storage?.get(KEY);
      if (res?.value) return JSON.parse(res.value);
    } catch {
      /* anahtar yok ya da storage yok — localStorage'a düş */
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* localStorage engelli */
    }
    return null;
  },

  async write(value) {
    const raw = JSON.stringify(value);
    let saved = false;
    try {
      localStorage.setItem(KEY, raw);
      saved = true;
    } catch {
      /* kota dolu ya da gizli mod */
    }
    try {
      await window.storage?.set(KEY, raw);
      saved = true;
    } catch {
      /* artifact storage yok */
    }
    if (!saved) throw new Error("write");
  },
};

function useStore() {
  const [data, setData] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // ilk açılışta oku
  useEffect(() => {
    let alive = true;
    disk.read().then((saved) => {
      if (!alive) return;
      if (saved) setData({ ...EMPTY, ...saved });
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  // her değişiklikte yaz — okuma bitmeden yazma
  useEffect(() => {
    if (!ready) return;
    disk.write(data).catch(() =>
      setError("Kaydedilemedi. Tarayıcınızın site verilerine izin verdiğinden emin olun.")
    );
  }, [data, ready]);

  /** update(collection, fn) — koleksiyonu değiştirir; kayıt otomatik */
  const update = useCallback((key, fn) => {
    setData((prev) => ({ ...prev, [key]: fn(prev[key]) }));
  }, []);

  const reset = useCallback(() => setData(EMPTY), []);

  return { data, ready, error, update, reset, clearError: () => setError(null) };
}

/* ═══════════════════════════════════════════════════════════════
   AI  — her yanıt şema kontrolünden geçer, ham JSON'a güvenilmez
   ═══════════════════════════════════════════════════════════════ */

async function callClaude(prompt, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error("network");
  const data = await res.json();
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function extractJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error("parse");
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (end === -1) throw new Error("parse");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function aiParseStudent(text) {
  const raw = await callClaude(
    `Aşağıdaki serbest metinden öğrenci bilgisini çıkar. Yalnızca şu şemada JSON döndür, başka hiçbir şey yazma:
{"name": string, "grade": string, "fee": number, "duration": string}

grade şu listeden biri olmalı: ${GRADES.join(" | ")}
duration şu listeden biri olmalı: ${DURATIONS.join(" | ")}
Bilinmeyen alanlar için: fee 0, duration "60 dk", grade "".

Metin: ${text}`
  );
  const p = extractJSON(raw);
  if (typeof p !== "object" || p === null || Array.isArray(p)) throw new Error("shape");
  return {
    name: typeof p.name === "string" ? p.name.trim() : "",
    grade: GRADES.includes(p.grade) ? p.grade : "",
    fee: Number.isFinite(Number(p.fee)) ? Math.max(0, Number(p.fee)) : 0,
    duration: DURATIONS.includes(p.duration) ? p.duration : "60 dk",
  };
}

async function aiWriteHomework(topic) {
  const raw = await callClaude(
    `Özel ders öğretmeni için tek paragraflık, net bir ödev yönergesi yaz. Yalnızca yönerge metnini döndür — başlık, giriş cümlesi, madde işareti kullanma.
Konu: ${topic}`,
    400
  );
  const text = raw.trim();
  if (!text) throw new Error("empty");
  return text;
}

async function aiBuildQuiz(topic) {
  const raw = await callClaude(
    `"${topic}" konusunda 5 adet çoktan seçmeli soru üret. Yalnızca şu şemada JSON dizisi döndür, başka hiçbir şey yazma:
[{"question": string, "options": [string, string, string, string], "answer": "A"|"B"|"C"|"D"}]
options her biri "A) ...", "B) ..." biçiminde başlasın.`,
    2000
  );
  const arr = extractJSON(raw);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("shape");
  const valid = arr.filter(
    (q) =>
      q &&
      typeof q.question === "string" &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      q.options.every((o) => typeof o === "string") &&
      ["A", "B", "C", "D"].includes(q.answer)
  );
  if (valid.length === 0) throw new Error("shape");
  return valid;
}

const AI_ERRORS = {
  network: "Yapay zekâya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
  parse: "Yapay zekâ beklenmedik bir yanıt verdi. Konuyu biraz daha açık yazıp tekrar deneyin.",
  shape: "Yapay zekâ beklenmedik bir yanıt verdi. Konuyu biraz daha açık yazıp tekrar deneyin.",
  empty: "Yapay zekâ boş yanıt verdi. Tekrar deneyin.",
};
const aiErrorText = (e) => AI_ERRORS[e?.message] || AI_ERRORS.network;

/* ═══════════════════════════════════════════════════════════════
   PRIMITIVES
   ═══════════════════════════════════════════════════════════════ */

function Mark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={T.brand} />
      <path
        d="M9 11c0-1 .6-1.6 1.4-1.2L13 11h6l2.6-1.2c.8-.4 1.4.2 1.4 1.2v4.5c0 3.6-2.8 6.3-7 6.3s-7-2.7-7-6.3V11Z"
        fill="#fff"
      />
      <circle cx="13.2" cy="15.2" r="1.15" fill={T.brand} />
      <circle cx="18.8" cy="15.2" r="1.15" fill={T.brand} />
      <path d="M16 18.4v1.6" stroke={T.brand} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Button({ children, onClick, variant = "solid", size = "md", full, disabled, type = "button" }) {
  const sizes = {
    sm: { padding: "8px 12px", fontSize: 13, borderRadius: 10, gap: 6 },
    md: { padding: "13px 18px", fontSize: 15, borderRadius: 12, gap: 8 },
  };
  const variants = {
    solid: { background: disabled ? T.ink30 : T.brand, color: "#fff", border: "1px solid transparent" },
    quiet: { background: T.bg, color: T.ink, border: `1px solid ${T.line}` },
    outline: { background: T.surface, color: T.brand, border: `1.5px solid ${T.brand}` },
    ghost: { background: "transparent", color: T.ink60, border: "1px solid transparent" },
    danger: { background: T.warnSoft, color: T.warn, border: "1px solid transparent" },
  };
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="k-btn"
      style={{
        ...sizes[size],
        ...variants[variant],
        width: full ? "100%" : undefined,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.65 : 1,
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 14,
        padding: 14,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 650, color: T.ink, marginBottom: 6 }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: T.ink60, marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: 11,
  border: `1.5px solid ${T.line}`,
  background: T.bg,
  fontSize: 15,
  color: T.ink,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function TextInput({ value, onChange, ...rest }) {
  return <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} className="k-input" />;
}

function Picker({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, color: value ? T.ink : T.ink30, appearance: "none" }}
      className="k-input"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="k-btn"
            style={{
              padding: "8px 13px",
              borderRadius: 9,
              border: `1.5px solid ${on ? T.brand : T.line}`,
              background: on ? T.brandSoft : T.surface,
              color: on ? T.brandDeep : T.ink60,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="k-scrim"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,27,32,.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 900,
      }}
    >
      <div
        className="k-sheet"
        role="dialog"
        aria-modal="true"
        style={{
          background: T.surface, width: "100%", maxWidth: 480,
          borderRadius: "20px 20px 0 0", maxHeight: "88vh", overflowY: "auto",
          padding: "20px 18px 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: "-0.01em" }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="k-btn"
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "none", background: T.bg,
              cursor: "pointer", display: "grid", placeItems: "center",
            }}
          >
            <X size={16} color={T.ink60} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Confirm({ text, confirmLabel = "Sil", onConfirm, onCancel }) {
  return (
    <div
      className="k-scrim"
      style={{
        position: "fixed", inset: 0, background: "rgba(28,27,32,.45)",
        display: "grid", placeItems: "center", zIndex: 950, padding: 24,
      }}
    >
      <div style={{ background: T.surface, borderRadius: 16, padding: 20, maxWidth: 320, width: "100%" }}>
        <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.45 }}>{text}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="quiet" full onClick={onCancel}>Vazgeç</Button>
          <Button variant="danger" full onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, tone = "ok", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  const bad = tone === "bad";
  return (
    <div
      role="status"
      className="k-toast"
      style={{
        position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
        background: bad ? T.warn : T.ink, color: "#fff", padding: "11px 16px",
        borderRadius: 11, fontSize: 14, fontWeight: 500, zIndex: 980,
        maxWidth: 340, display: "flex", alignItems: "center", gap: 8,
        boxShadow: "0 8px 24px rgba(28,27,32,.25)",
      }}
    >
      {bad ? <AlertCircle size={16} /> : <Check size={16} />}
      <span>{message}</span>
    </div>
  );
}

function Empty({ icon: Icon, title, body, action }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: T.brandSoft,
        display: "grid", placeItems: "center", margin: "0 auto 14px",
      }}>
        <Icon size={24} color={T.brand} />
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>{title}</h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: T.ink60, lineHeight: 1.5 }}>{body}</p>
      {action}
    </div>
  );
}

function AIBadge({ children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
      fontSize: 13, fontWeight: 700, color: T.brandDeep,
    }}>
      <Sparkles size={15} color={T.brand} /> {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ÖĞRENCİLER
   ═══════════════════════════════════════════════════════════════ */

function StudentForm({ initial, onSave, onClose, toast }) {
  const [name, setName] = useState(initial?.name || "");
  const [grade, setGrade] = useState(initial?.grade || "");
  const [fee, setFee] = useState(String(initial?.fee ?? ""));
  const [duration, setDuration] = useState(initial?.duration || "60 dk");
  const [aiText, setAiText] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function runAI() {
    if (!aiText.trim() || busy) return;
    setBusy(true);
    try {
      const p = await aiParseStudent(aiText);
      if (p.name) setName(p.name);
      if (p.grade) setGrade(p.grade);
      if (p.fee) setFee(String(p.fee));
      setDuration(p.duration);
      setAiOpen(false);
      setAiText("");
      toast("Bilgiler dolduruldu — kontrol edip kaydedin.");
    } catch (e) {
      toast(aiErrorText(e), "bad");
    }
    setBusy(false);
  }

  const valid = name.trim().length > 1;

  return (
    <Sheet title={initial ? "Öğrenciyi düzenle" : "Öğrenci ekle"} onClose={onClose}>
      {!initial && (
        <div style={{ background: T.brandSoft, borderRadius: 12, padding: 13, marginBottom: 18 }}>
          {!aiOpen ? (
            <button
              onClick={() => setAiOpen(true)}
              className="k-btn"
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                textAlign: "left", fontFamily: "inherit",
              }}
            >
              <Sparkles size={17} color={T.brand} />
              <span>
                <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: T.ink }}>
                  Yapay zekâyla doldur
                </span>
                <span style={{ fontSize: 12.5, color: T.ink60 }}>
                  Bilgileri serbest yazın, alanları o doldursun
                </span>
              </span>
              <ChevronRight size={16} color={T.brand} style={{ marginLeft: "auto", flexShrink: 0 }} />
            </button>
          ) : (
            <>
              <AIBadge>Serbest yazın</AIBadge>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="Ali Yılmaz, 11. sınıf, ders başı 1500 TL, 90 dakika"
                rows={3}
                style={{ ...inputStyle, background: T.surface, resize: "none" }}
                className="k-input"
              />
              <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                <Button size="sm" variant="ghost" onClick={() => setAiOpen(false)}>Vazgeç</Button>
                <Button size="sm" onClick={runAI} disabled={!aiText.trim() || busy}>
                  {busy ? <Loader2 size={14} className="k-spin" /> : <Sparkles size={14} />}
                  {busy ? "Okunuyor…" : "Alanları doldur"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <Field label="Ad soyad">
        <TextInput value={name} onChange={setName} placeholder="Ali Yılmaz" />
      </Field>
      <Field label="Sınıf">
        <Picker
          value={grade}
          onChange={setGrade}
          placeholder="Sınıf seçin"
          options={GRADES.map((g) => ({ value: g, label: g }))}
        />
      </Field>
      <Field label="Ders ücreti" hint="Bir ders için alınan tutar.">
        <TextInput value={fee} onChange={setFee} type="number" inputMode="numeric" placeholder="0" />
      </Field>
      <Field label="Ders süresi">
        <Chips options={DURATIONS} value={duration} onChange={setDuration} />
      </Field>

      <Button
        full
        disabled={!valid}
        onClick={() =>
          onSave({
            name: name.trim(),
            grade,
            fee: Math.max(0, Number(fee) || 0),
            duration,
          })
        }
      >
        <Check size={17} /> {initial ? "Değişiklikleri kaydet" : "Öğrenciyi ekle"}
      </Button>
    </Sheet>
  );
}

function StudentsScreen({ data, update, toast, go }) {
  const [form, setForm] = useState(null); // null | "new" | student
  const [q, setQ] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr");
    return data.students.filter((s) => !term || s.name.toLocaleLowerCase("tr").includes(term));
  }, [data.students, q]);

  function save(fields) {
    if (form === "new") {
      update("students", (xs) => [...xs, { id: crypto.randomUUID(), ...fields, active: true }]);
      toast(`${fields.name} eklendi.`);
    } else {
      update("students", (xs) => xs.map((s) => (s.id === form.id ? { ...s, ...fields } : s)));
      toast("Değişiklikler kaydedildi.");
    }
    setForm(null);
  }

  function remove(id) {
    const s = data.students.find((x) => x.id === id);
    update("students", (xs) => xs.filter((x) => x.id !== id));
    update("lessons", (xs) => xs.filter((l) => l.studentId !== id));
    setPendingDelete(null);
    toast(`${s?.name || "Öğrenci"} ve dersleri silindi.`);
  }

  const lessonCount = (id) => data.lessons.filter((l) => l.studentId === id).length;

  return (
    <div style={{ padding: "0 16px 96px" }}>
      {data.students.length > 0 && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <Search size={17} color={T.ink30} style={{ position: "absolute", left: 12, top: 13 }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Öğrenci ara"
            aria-label="Öğrenci ara"
            className="k-input"
            style={{ ...inputStyle, background: T.surface, paddingLeft: 38 }}
          />
        </div>
      )}

      {data.students.length === 0 ? (
        <Empty
          icon={Users}
          title="Henüz öğrenci yok"
          body="İlk öğrencinizi ekleyin; takvim, ödev ve ödeme takibi buradan başlar."
          action={<Button onClick={() => setForm("new")}><Plus size={17} /> Öğrenci ekle</Button>}
        />
      ) : list.length === 0 ? (
        <p style={{ textAlign: "center", color: T.ink60, fontSize: 14, padding: "32px 0" }}>
          “{q}” ile eşleşen öğrenci yok.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {list.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15.5 }}>{s.name}</span>
                    {s.grade && (
                      <span style={{
                        fontSize: 11.5, background: T.bg, color: T.ink60,
                        padding: "3px 8px", borderRadius: 6, fontWeight: 600,
                      }}>
                        {s.grade}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: T.ink60, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                    {money(s.fee)} · {s.duration} · {lessonCount(s.id)} ders planlı
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <Button size="sm" variant="quiet" onClick={() => setForm(s)}>Düzenle</Button>
                  <button
                    onClick={() => setPendingDelete(s)}
                    aria-label={`${s.name} sil`}
                    className="k-btn"
                    style={{
                      border: `1px solid ${T.line}`, background: T.surface, borderRadius: 10,
                      width: 34, cursor: "pointer", display: "grid", placeItems: "center",
                    }}
                  >
                    <Trash2 size={15} color={T.ink60} />
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${T.line}` }}>
                <Button size="sm" variant="outline" onClick={() => go("takvim")}>
                  <Calendar size={14} /> Ders planla
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data.students.length > 0 && (
        <button
          onClick={() => setForm("new")}
          aria-label="Öğrenci ekle"
          className="k-fab"
          style={{
            position: "fixed", right: 18, bottom: 92, width: 52, height: 52, borderRadius: 16,
            background: T.brand, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
            boxShadow: "0 6px 20px rgba(232,130,12,.38)", zIndex: 100,
          }}
        >
          <Plus size={24} color="#fff" />
        </button>
      )}

      {form && (
        <StudentForm
          initial={form === "new" ? null : form}
          onSave={save}
          onClose={() => setForm(null)}
          toast={toast}
        />
      )}
      {pendingDelete && (
        <Confirm
          text={`${pendingDelete.name} silinsin mi? Planlanmış dersleri de kaldırılacak.`}
          onConfirm={() => remove(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAKVİM  — gerçek tarihler, çalışan hafta gezinme
   ═══════════════════════════════════════════════════════════════ */

const STATUS = {
  planned: { label: "Planlandı", fg: T.brandDeep, bg: T.brandSoft },
  done: { label: "Yapıldı", fg: T.ok, bg: T.okSoft },
  cancelled: { label: "İptal", fg: T.warn, bg: T.warnSoft },
};
const NEXT_STATUS = { planned: "done", done: "cancelled", cancelled: "planned" };

function LessonForm({ students, date, hour, onSave, onClose }) {
  const [studentId, setStudentId] = useState(students[0]?.id || "");
  const [time, setTime] = useState(`${String(hour ?? 9).padStart(2, "0")}:00`);
  const [repeats, setRepeats] = useState(false);
  const [weeks, setWeeks] = useState("8");

  const student = students.find((s) => s.id === studentId);

  return (
    <Sheet title="Ders ekle" onClose={onClose}>
      <p style={{ margin: "-6px 0 16px", fontSize: 13.5, color: T.ink60 }}>
        {parseISO(date).getDate()} {MONTHS[parseISO(date).getMonth()]}{" "}
        {DAY_NAMES[weekdayIndex(parseISO(date))]}
      </p>

      <Field label="Öğrenci">
        <Picker
          value={studentId}
          onChange={setStudentId}
          placeholder="Öğrenci seçin"
          options={students.map((s) => ({ value: s.id, label: s.grade ? `${s.name} — ${s.grade}` : s.name }))}
        />
      </Field>

      <Field label="Saat">
        <TextInput value={time} onChange={setTime} type="time" />
      </Field>

      <div style={{
        border: `1px solid ${T.line}`, borderRadius: 12, padding: 13, marginBottom: 18,
        background: repeats ? T.brandSoft : T.surface,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={repeats}
            onChange={(e) => setRepeats(e.target.checked)}
            style={{ width: 17, height: 17, accentColor: T.brand, cursor: "pointer" }}
          />
          <span style={{ fontSize: 14, fontWeight: 650 }}>
            Her {DAY_NAMES[weekdayIndex(parseISO(date))].toLocaleLowerCase("tr")} tekrarla
          </span>
        </label>
        {repeats && (
          <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 9 }}>
            <input
              type="number"
              min="2"
              max="52"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              className="k-input"
              style={{ ...inputStyle, background: T.surface, width: 74, padding: "9px 11px" }}
            />
            <span style={{ fontSize: 13.5, color: T.ink60 }}>hafta boyunca</span>
          </div>
        )}
      </div>

      <Button
        full
        disabled={!student}
        onClick={() =>
          onSave({
            studentId,
            time,
            count: repeats ? Math.min(52, Math.max(2, Number(weeks) || 2)) : 1,
          })
        }
      >
        <Check size={17} /> {repeats ? `${weeks} ders ekle` : "Dersi ekle"}
      </Button>
    </Sheet>
  );
}

function CalendarScreen({ data, update, toast, go }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [anchor, setAnchor] = useState(today);   // görünen haftanın herhangi bir günü
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState("day");
  const [form, setForm] = useState(null);        // { date, hour }
  const [pendingDelete, setPendingDelete] = useState(null);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const nameOf = useCallback(
    (id) => data.students.find((s) => s.id === id)?.name || "Silinmiş öğrenci",
    [data.students]
  );
  const onDate = useCallback(
    (d) => data.lessons.filter((l) => l.date === iso(d)).sort((a, b) => a.time.localeCompare(b.time)),
    [data.lessons]
  );

  function addLessons({ studentId, time, count }) {
    const base = parseISO(form.date);
    const student = data.students.find((s) => s.id === studentId);
    const created = Array.from({ length: count }, (_, i) => ({
      id: crypto.randomUUID(),
      studentId,
      date: iso(addDays(base, i * 7)),
      time,
      duration: student?.duration || "60 dk",
      fee: student?.fee || 0,
      status: "planned",
    }));
    update("lessons", (xs) => [...xs, ...created]);
    setForm(null);
    toast(count > 1 ? `${count} ders eklendi.` : "Ders eklendi.");
  }

  function cycleStatus(id) {
    update("lessons", (xs) =>
      xs.map((l) => (l.id === id ? { ...l, status: NEXT_STATUS[l.status] } : l))
    );
  }

  function removeLesson(id) {
    update("lessons", (xs) => xs.filter((l) => l.id !== id));
    setPendingDelete(null);
    toast("Ders silindi.");
  }

  if (data.students.length === 0) {
    return (
      <div style={{ padding: "0 16px" }}>
        <Empty
          icon={Calendar}
          title="Takvim öğrencilerle başlar"
          body="Ders planlayabilmek için önce en az bir öğrenci ekleyin."
          action={<Button onClick={() => go("ogrenciler")}><Users size={17} /> Öğrenci ekle</Button>}
        />
      </div>
    );
  }

  const dayLessons = onDate(selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 152px)" }}>
      {/* hafta gezinme */}
      <div style={{ padding: "0 16px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => setAnchor(addDays(weekStart, -7))}
          aria-label="Önceki hafta"
          className="k-btn"
          style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, width: 34, height: 34, cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <ChevronLeft size={17} color={T.ink} />
        </button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            {weekStart.getDate()} – {addDays(weekStart, 6).getDate()} {MONTHS[addDays(weekStart, 6).getMonth()]}
          </div>
          {iso(startOfWeek(today)) !== iso(weekStart) && (
            <button
              onClick={() => { setAnchor(today); setSelected(today); }}
              className="k-btn"
              style={{ background: "none", border: "none", color: T.brand, fontSize: 12, fontWeight: 650, cursor: "pointer", padding: "2px 0 0", fontFamily: "inherit" }}
            >
              Bugüne dön
            </button>
          )}
        </div>

        <button
          onClick={() => setAnchor(addDays(weekStart, 7))}
          aria-label="Sonraki hafta"
          className="k-btn"
          style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, width: 34, height: 34, cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <ChevronRight size={17} color={T.ink} />
        </button>
      </div>

      {/* gün şeridi */}
      <div style={{ display: "flex", gap: 5, padding: "0 16px 10px" }}>
        {week.map((d) => {
          const on = sameDay(d, selected);
          const isToday = sameDay(d, today);
          const n = onDate(d).length;
          return (
            <button
              key={iso(d)}
              onClick={() => { setSelected(d); setView("day"); }}
              className="k-btn"
              style={{
                flex: 1, padding: "8px 0 6px", borderRadius: 11, cursor: "pointer",
                border: `1.5px solid ${on ? T.brand : "transparent"}`,
                background: on ? T.brand : T.surface,
                color: on ? "#fff" : isToday ? T.brand : T.ink,
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 650, opacity: on ? 0.85 : 0.6 }}>{DAY_SHORT[weekdayIndex(d)]}</div>
              <div style={{ fontSize: 16, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{d.getDate()}</div>
              <div style={{
                width: 4, height: 4, borderRadius: "50%", margin: "3px auto 0",
                background: n ? (on ? "#fff" : T.brand) : "transparent",
              }} />
            </button>
          );
        })}
      </div>

      {/* görünüm */}
      <div style={{ padding: "0 16px 10px", display: "flex", background: "transparent", gap: 6 }}>
        {[["day", "Gün"], ["week", "Hafta"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className="k-btn"
            style={{
              flex: 1, padding: "7px 0", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${view === k ? T.brand : T.line}`,
              background: view === k ? T.brandSoft : T.surface,
              color: view === k ? T.brandDeep : T.ink60,
              fontWeight: 650, fontSize: 13, fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* GÜN */}
      {view === "day" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
          {dayLessons.length === 0 && (
            <p style={{ textAlign: "center", color: T.ink60, fontSize: 13.5, padding: "14px 0 4px" }}>
              Bu gün boş. Bir saate dokunup ders ekleyin.
            </p>
          )}
          {HOURS.map((h) => {
            const l = dayLessons.find((x) => Number(x.time.slice(0, 2)) === h);
            return (
              <div key={h} style={{ display: "flex", borderTop: `1px solid ${T.line}`, minHeight: 54 }}>
                <span style={{
                  width: 42, flexShrink: 0, fontSize: 11, color: T.ink30, paddingTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {String(h).padStart(2, "0")}:00
                </span>
                <div style={{ flex: 1, padding: "5px 0 5px 6px" }}>
                  {l ? (
                    <div style={{
                      background: STATUS[l.status].bg, borderLeft: `3px solid ${STATUS[l.status].fg}`,
                      borderRadius: "0 10px 10px 0", padding: "9px 10px",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <button
                        onClick={() => cycleStatus(l.id)}
                        className="k-btn"
                        style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                        title="Durumu değiştirmek için dokunun"
                      >
                        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{nameOf(l.studentId)}</div>
                        <div style={{ fontSize: 12, color: T.ink60, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                          {l.time} · {l.duration} · {money(l.fee)}
                        </div>
                      </button>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, color: STATUS[l.status].fg,
                        border: `1px solid ${STATUS[l.status].fg}33`, padding: "3px 7px", borderRadius: 6,
                        whiteSpace: "nowrap",
                      }}>
                        {STATUS[l.status].label}
                      </span>
                      <button
                        onClick={() => setPendingDelete(l)}
                        aria-label="Dersi sil"
                        className="k-btn"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}
                      >
                        <Trash2 size={14} color={T.ink30} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setForm({ date: iso(selected), hour: h })}
                      aria-label={`${String(h).padStart(2, "0")}:00 için ders ekle`}
                      className="k-slot"
                      style={{
                        width: "100%", height: 42, background: "transparent", border: "none",
                        borderRadius: 9, cursor: "pointer",
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HAFTA */}
      {view === "week" && (
        <div style={{ flex: 1, overflow: "auto", padding: "0 16px 24px" }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ display: "flex", position: "sticky", top: 0, background: T.bg, zIndex: 2 }}>
              <div style={{ width: 40, flexShrink: 0 }} />
              {week.map((d) => (
                <div key={iso(d)} style={{
                  flex: 1, textAlign: "center", padding: "5px 0 7px",
                  color: sameDay(d, today) ? T.brand : T.ink60,
                  fontSize: 11, fontWeight: 700,
                }}>
                  {DAY_SHORT[weekdayIndex(d)]} {d.getDate()}
                </div>
              ))}
            </div>
            {HOURS.map((h) => (
              <div key={h} style={{ display: "flex", borderTop: `1px solid ${T.line}`, minHeight: 46 }}>
                <div style={{
                  width: 40, flexShrink: 0, fontSize: 10, color: T.ink30, paddingTop: 4,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {String(h).padStart(2, "0")}
                </div>
                {week.map((d) => {
                  const l = onDate(d).find((x) => Number(x.time.slice(0, 2)) === h);
                  return (
                    <div key={iso(d)} style={{ flex: 1, borderLeft: `1px solid ${T.line}`, padding: 2 }}>
                      {l ? (
                        <button
                          onClick={() => { setSelected(d); setView("day"); }}
                          className="k-btn"
                          style={{
                            width: "100%", height: "100%", minHeight: 38, borderRadius: 7,
                            background: STATUS[l.status].bg, border: `1px solid ${STATUS[l.status].fg}44`,
                            color: STATUS[l.status].fg, cursor: "pointer", padding: "3px 5px",
                            fontSize: 10.5, fontWeight: 700, textAlign: "left", overflow: "hidden",
                            fontFamily: "inherit",
                          }}
                        >
                          <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {nameOf(l.studentId).split(" ")[0]}
                          </span>
                          <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{l.time}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setForm({ date: iso(d), hour: h })}
                          aria-label="Ders ekle"
                          className="k-slot"
                          style={{ width: "100%", height: "100%", minHeight: 38, background: "transparent", border: "none", borderRadius: 7, cursor: "pointer" }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setForm({ date: iso(selected), hour: 9 })}
        aria-label="Ders ekle"
        className="k-fab"
        style={{
          position: "fixed", right: 18, bottom: 92, width: 52, height: 52, borderRadius: 16,
          background: T.brand, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
          boxShadow: "0 6px 20px rgba(232,130,12,.38)", zIndex: 100,
        }}
      >
        <Plus size={24} color="#fff" />
      </button>

      {form && (
        <LessonForm
          students={data.students}
          date={form.date}
          hour={form.hour}
          onSave={addLessons}
          onClose={() => setForm(null)}
        />
      )}
      {pendingDelete && (
        <Confirm
          text={`${nameOf(pendingDelete.studentId)} — ${fmtDate(pendingDelete.date)} ${pendingDelete.time} dersi silinsin mi?`}
          onConfirm={() => removeLesson(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ÖDEVLER
   ═══════════════════════════════════════════════════════════════ */

function AssignForm({ students, preset, onSave, onClose, toast }) {
  const [studentId, setStudentId] = useState("");
  const [text, setText] = useState(preset?.text || "");
  const [due, setDue] = useState(iso(addDays(new Date(), 1)));
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(false);

  async function write() {
    if (!topic.trim() || busy) return;
    setBusy(true);
    try {
      setText(await aiWriteHomework(topic));
      setTopic("");
    } catch (e) {
      toast(aiErrorText(e), "bad");
    }
    setBusy(false);
  }

  return (
    <Sheet title="Ödev ver" onClose={onClose}>
      <Field label="Öğrenci" hint="Boş bırakırsanız tüm öğrencilere verilir.">
        <Picker
          value={studentId}
          onChange={setStudentId}
          placeholder="Tüm öğrenciler"
          options={students.map((s) => ({ value: s.id, label: s.grade ? `${s.name} — ${s.grade}` : s.name }))}
        />
      </Field>

      <div style={{ background: T.brandSoft, borderRadius: 12, padding: 13, marginBottom: 18 }}>
        <AIBadge>Yönergeyi yapay zekâ yazsın</AIBadge>
        <div style={{ display: "flex", gap: 7 }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && write()}
            placeholder="10. sınıf türev, zincir kuralı"
            className="k-input"
            style={{ ...inputStyle, background: T.surface, flex: 1 }}
          />
          <Button size="sm" onClick={write} disabled={!topic.trim() || busy}>
            {busy ? <Loader2 size={14} className="k-spin" /> : <Sparkles size={14} />}
          </Button>
        </div>
      </div>

      <Field label="Ödev yönergesi">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Matematik kitabı sayfa 45, 1–10 arası sorular."
          className="k-input"
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Teslim tarihi">
        <TextInput value={due} onChange={setDue} type="date" />
      </Field>

      <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={saveToLibrary}
          onChange={(e) => setSaveToLibrary(e.target.checked)}
          style={{ width: 17, height: 17, accentColor: T.brand, cursor: "pointer" }}
        />
        <span style={{ fontSize: 13.5, color: T.ink60 }}>Kütüphaneye de kaydet</span>
      </label>

      <Button full disabled={!text.trim()} onClick={() => onSave({ studentId, text: text.trim(), due, saveToLibrary })}>
        <Send size={16} /> Ödevi ver
      </Button>
    </Sheet>
  );
}

function QuizForm({ onSave, onClose, toast }) {
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);

  async function build() {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setQuestions([]);
    try {
      setQuestions(await aiBuildQuiz(topic));
    } catch (e) {
      toast(aiErrorText(e), "bad");
    }
    setBusy(false);
  }

  return (
    <Sheet title="Test oluştur" onClose={onClose}>
      <div style={{ background: T.brandSoft, borderRadius: 12, padding: 13, marginBottom: 18 }}>
        <AIBadge>Konuyu yazın, 5 soru üretilsin</AIBadge>
        <div style={{ display: "flex", gap: 7 }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && build()}
            placeholder="10. sınıf kimya, mol hesabı"
            className="k-input"
            style={{ ...inputStyle, background: T.surface, flex: 1 }}
          />
          <Button size="sm" onClick={build} disabled={!topic.trim() || busy}>
            {busy ? <Loader2 size={14} className="k-spin" /> : <Sparkles size={14} />}
          </Button>
        </div>
      </div>

      {busy && (
        <p style={{ textAlign: "center", color: T.ink60, fontSize: 13.5, padding: "20px 0" }}>
          Sorular hazırlanıyor…
        </p>
      )}

      {questions.length > 0 && (
        <>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: "0 0 10px" }}>
            {questions.length} soru hazır — doğru cevaplar yeşil.
          </p>
          <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ background: T.bg, borderRadius: 11, padding: 12 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 7, lineHeight: 1.4 }}>
                  {i + 1}. {q.question}
                </div>
                {q.options.map((o, j) => {
                  const right = o.trim().startsWith(q.answer);
                  return (
                    <div key={j} style={{
                      fontSize: 12.5, padding: "3px 0",
                      color: right ? T.ok : T.ink60,
                      fontWeight: right ? 700 : 400,
                    }}>
                      {o}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <Button full onClick={() => onSave({ title: topic.trim(), questions })}>
            <BookOpen size={16} /> Kütüphaneye kaydet
          </Button>
        </>
      )}
    </Sheet>
  );
}

function HomeworkScreen({ data, update, toast, go }) {
  const [tab, setTab] = useState("sent");
  const [assign, setAssign] = useState(null); // null | {} | {text}
  const [quiz, setQuiz] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const nameOf = (id) => (id ? data.students.find((s) => s.id === id)?.name || "Silinmiş öğrenci" : "Tüm öğrenciler");

  function saveAssignment({ studentId, text, due, saveToLibrary }) {
    update("homework", (xs) => [
      { id: crypto.randomUUID(), studentId, text, due, assigned: iso(new Date()), status: "pending" },
      ...xs,
    ]);
    if (saveToLibrary) {
      update("library", (xs) => [
        { id: crypto.randomUUID(), kind: "note", title: text.slice(0, 60), text, created: iso(new Date()) },
        ...xs,
      ]);
    }
    setAssign(null);
    toast("Ödev verildi.");
  }

  function saveQuiz({ title, questions }) {
    update("library", (xs) => [
      { id: crypto.randomUUID(), kind: "quiz", title, questions, created: iso(new Date()) },
      ...xs,
    ]);
    setQuiz(false);
    toast("Test kütüphaneye kaydedildi.");
  }

  function toggleStatus(id) {
    update("homework", (xs) =>
      xs.map((h) => (h.id === id ? { ...h, status: h.status === "pending" ? "done" : "pending" } : h))
    );
  }

  const overdue = (h) => h.status === "pending" && parseISO(h.due) < new Date().setHours(0, 0, 0, 0);

  if (data.students.length === 0) {
    return (
      <div style={{ padding: "0 16px" }}>
        <Empty
          icon={ClipboardList}
          title="Ödev vermek için öğrenci gerekir"
          body="Önce bir öğrenci ekleyin, ardından buradan ödev verebilirsiniz."
          action={<Button onClick={() => go("ogrenciler")}><Users size={17} /> Öğrenci ekle</Button>}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 96px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["sent", "Verilenler"], ["library", "Kütüphane"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="k-btn"
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${tab === k ? T.brand : T.line}`,
              background: tab === k ? T.brandSoft : T.surface,
              color: tab === k ? T.brandDeep : T.ink60,
              fontWeight: 650, fontSize: 13.5, fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sent" && (
        data.homework.length === 0 ? (
          <Empty
            icon={ClipboardList}
            title="Henüz ödev verilmedi"
            body="Yönergeyi kendiniz yazın ya da konuyu söyleyip yapay zekâya yazdırın."
            action={<Button onClick={() => setAssign({})}><Plus size={17} /> Ödev ver</Button>}
          />
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {data.homework.map((h) => {
              const late = overdue(h);
              const done = h.status === "done";
              return (
                <Card key={h.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{nameOf(h.studentId)}</div>
                      <p style={{
                        margin: "5px 0 0", fontSize: 13.5, color: T.ink60, lineHeight: 1.45,
                        textDecoration: done ? "line-through" : "none",
                      }}>
                        {h.text}
                      </p>
                      <div style={{
                        fontSize: 12, marginTop: 7, fontWeight: 600,
                        color: late ? T.warn : T.ink30, fontVariantNumeric: "tabular-nums",
                      }}>
                        Teslim: {fmtDate(h.due)}{late ? " · gecikti" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleStatus(h.id)}
                        aria-label={done ? "Bekliyor olarak işaretle" : "Yapıldı olarak işaretle"}
                        className="k-btn"
                        style={{
                          width: 34, height: 34, borderRadius: 10, cursor: "pointer",
                          border: `1px solid ${done ? T.ok : T.line}`,
                          background: done ? T.okSoft : T.surface,
                          display: "grid", placeItems: "center",
                        }}
                      >
                        <Check size={16} color={done ? T.ok : T.ink30} />
                      </button>
                      <button
                        onClick={() => setPendingDelete({ kind: "homework", item: h })}
                        aria-label="Ödevi sil"
                        className="k-btn"
                        style={{
                          width: 34, height: 34, borderRadius: 10, cursor: "pointer",
                          border: `1px solid ${T.line}`, background: T.surface,
                          display: "grid", placeItems: "center",
                        }}
                      >
                        <Trash2 size={15} color={T.ink30} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {tab === "library" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Button size="sm" variant="outline" onClick={() => setQuiz(true)}>
              <Sparkles size={14} /> Test oluştur
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAssign({})}>
              <Plus size={14} /> Ödev yaz
            </Button>
          </div>

          {data.library.length === 0 ? (
            <Empty
              icon={BookOpen}
              title="Kütüphane boş"
              body="Sık kullandığınız ödevleri ve testleri buraya kaydedin, tek dokunuşla tekrar verin."
              action={<Button onClick={() => setQuiz(true)}><Sparkles size={17} /> İlk testi oluştur</Button>}
            />
          ) : (
            <div style={{ display: "grid", gap: 9 }}>
              {data.library.map((k) => (
                <Card key={k.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        {k.kind === "quiz" ? <Check size={15} color={T.ok} /> : <BookOpen size={15} color={T.brand} />}
                        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{k.title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.ink30, marginTop: 4 }}>
                        {k.kind === "quiz" ? `${k.questions.length} soru` : "Yazılı ödev"} · {fmtDate(k.created)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      {k.kind === "note" && (
                        <Button size="sm" variant="quiet" onClick={() => { setAssign({ text: k.text }); setTab("sent"); }}>
                          Ver
                        </Button>
                      )}
                      <button
                        onClick={() => setPendingDelete({ kind: "library", item: k })}
                        aria-label="Sil"
                        className="k-btn"
                        style={{
                          width: 34, borderRadius: 10, cursor: "pointer",
                          border: `1px solid ${T.line}`, background: T.surface,
                          display: "grid", placeItems: "center",
                        }}
                      >
                        <Trash2 size={15} color={T.ink30} />
                      </button>
                    </div>
                  </div>

                  {k.kind === "quiz" && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12.5, color: T.brand, fontWeight: 650 }}>
                        Soruları göster
                      </summary>
                      <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                        {k.questions.map((q, i) => (
                          <div key={i} style={{ background: T.bg, borderRadius: 10, padding: 10 }}>
                            <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}>
                              {i + 1}. {q.question}
                            </div>
                            {q.options.map((o, j) => {
                              const right = o.trim().startsWith(q.answer);
                              return (
                                <div key={j} style={{
                                  fontSize: 12, padding: "2px 0",
                                  color: right ? T.ok : T.ink60,
                                  fontWeight: right ? 700 : 400,
                                }}>
                                  {o}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "sent" && data.homework.length > 0 && (
        <button
          onClick={() => setAssign({})}
          aria-label="Ödev ver"
          className="k-fab"
          style={{
            position: "fixed", right: 18, bottom: 92, width: 52, height: 52, borderRadius: 16,
            background: T.brand, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
            boxShadow: "0 6px 20px rgba(232,130,12,.38)", zIndex: 100,
          }}
        >
          <Plus size={24} color="#fff" />
        </button>
      )}

      {assign && (
        <AssignForm
          students={data.students}
          preset={assign}
          onSave={saveAssignment}
          onClose={() => setAssign(null)}
          toast={toast}
        />
      )}
      {quiz && <QuizForm onSave={saveQuiz} onClose={() => setQuiz(false)} toast={toast} />}
      {pendingDelete && (
        <Confirm
          text="Bu kayıt silinsin mi?"
          onConfirm={() => {
            update(pendingDelete.kind, (xs) => xs.filter((x) => x.id !== pendingDelete.item.id));
            setPendingDelete(null);
            toast("Silindi.");
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FİNANS
   ═══════════════════════════════════════════════════════════════ */

function PaymentForm({ students, onSave, onClose }) {
  const [studentId, setStudentId] = useState(students[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(iso(new Date()));

  return (
    <Sheet title="Ödeme kaydet" onClose={onClose}>
      <Field label="Öğrenci">
        <Picker
          value={studentId}
          onChange={setStudentId}
          placeholder="Öğrenci seçin"
          options={students.map((s) => ({ value: s.id, label: s.grade ? `${s.name} — ${s.grade}` : s.name }))}
        />
      </Field>
      <Field label="Tutar">
        <TextInput value={amount} onChange={setAmount} type="number" inputMode="numeric" placeholder="0" />
      </Field>
      <Field label="Tarih">
        <TextInput value={date} onChange={setDate} type="date" />
      </Field>
      <Field label="Not" hint="İsteğe bağlı.">
        <TextInput value={note} onChange={setNote} placeholder="Mayıs ayı" />
      </Field>
      <Button
        full
        disabled={!studentId || !(Number(amount) > 0)}
        onClick={() => onSave({ studentId, amount: Number(amount), date, note: note.trim() })}
      >
        <Check size={17} /> Ödemeyi kaydet
      </Button>
    </Sheet>
  );
}

function Stat({ icon: Icon, label, value, sub, tone = T.brand }) {
  return (
    <Card style={{ padding: 13 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, background: tone + "1A",
        display: "grid", placeItems: "center", marginBottom: 9,
      }}>
        <Icon size={15} color={tone} />
      </div>
      <div style={{ fontSize: 11.5, color: T.ink60, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.ink30, marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

function FinanceScreen({ data, update, toast, go }) {
  const [form, setForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const nameOf = (id) => data.students.find((s) => s.id === id)?.name || "Silinmiş öğrenci";

  const now = new Date();
  const thisMonth = (s) => {
    const d = parseISO(s);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const collected = data.payments.filter((p) => thisMonth(p.date)).reduce((a, p) => a + p.amount, 0);
  const earned = data.lessons
    .filter((l) => l.status === "done" && thisMonth(l.date))
    .reduce((a, l) => a + l.fee, 0);
  const outstanding = Math.max(0, earned - collected);
  const upcoming = data.lessons.filter((l) => l.status === "planned" && parseISO(l.date) >= now.setHours(0, 0, 0, 0)).length;

  const sorted = [...data.payments].sort((a, b) => b.date.localeCompare(a.date));

  if (data.students.length === 0) {
    return (
      <div style={{ padding: "0 16px" }}>
        <Empty
          icon={Wallet}
          title="Finans takibi öğrencilerle başlar"
          body="Öğrenci ekleyip ders işaretledikçe hakediş ve tahsilat burada birikir."
          action={<Button onClick={() => go("ogrenciler")}><Users size={17} /> Öğrenci ekle</Button>}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 96px" }}>
      <Card style={{ marginBottom: 10, padding: 16 }}>
        <div style={{ fontSize: 12.5, color: T.ink60, marginBottom: 4 }}>
          {MONTHS[now.getMonth()]} ayı tahsilatı
        </div>
        <div style={{
          fontSize: 32, fontWeight: 780, letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
        }}>
          {money(collected)}
        </div>
        <div style={{ fontSize: 12.5, color: T.ink60, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          Hakediş {money(earned)}
          {outstanding > 0 && (
            <>
              {" · "}
              <span style={{ color: T.warn, fontWeight: 650 }}>{money(outstanding)} bekliyor</span>
            </>
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 18 }}>
        <Stat icon={Users} label="Öğrenci" value={data.students.length} tone={T.brand} />
        <Stat icon={Clock} label="Yaklaşan ders" value={upcoming} tone="#4C6EF5" />
        <Stat
          icon={TrendingUp}
          label="Yapılan ders"
          value={data.lessons.filter((l) => l.status === "done" && thisMonth(l.date)).length}
          sub="Bu ay"
          tone={T.ok}
        />
        <Stat
          icon={Wallet}
          label="Ders başı ort."
          value={money(
            data.students.length
              ? Math.round(data.students.reduce((a, s) => a + s.fee, 0) / data.students.length)
              : 0
          )}
          tone="#9C36B5"
        />
      </div>

      <h2 style={{
        fontSize: 15, fontWeight: 700, margin: "0 0 10px",
        borderLeft: `3px solid ${T.brand}`, paddingLeft: 9,
      }}>
        Ödemeler
      </h2>

      {sorted.length === 0 ? (
        <Empty
          icon={Wallet}
          title="Henüz ödeme yok"
          body="Aldığınız her ödemeyi kaydedin; aylık tahsilat otomatik hesaplanır."
          action={<Button onClick={() => setForm(true)}><Plus size={17} /> Ödeme kaydet</Button>}
        />
      ) : (
        <div style={{ display: "grid", gap: 7 }}>
          {sorted.map((p) => (
            <Card key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 13px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 14 }}>{nameOf(p.studentId)}</div>
                <div style={{ fontSize: 12, color: T.ink30, marginTop: 2 }}>
                  {fmtDate(p.date)}{p.note ? ` · ${p.note}` : ""}
                </div>
              </div>
              <span style={{
                fontWeight: 750, fontSize: 15, color: T.ok,
                fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              }}>
                +{money(p.amount)}
              </span>
              <button
                onClick={() => setPendingDelete(p)}
                aria-label="Ödemeyi sil"
                className="k-btn"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}
              >
                <Trash2 size={14} color={T.ink30} />
              </button>
            </Card>
          ))}
        </div>
      )}

      <button
        onClick={() => setForm(true)}
        aria-label="Ödeme kaydet"
        className="k-fab"
        style={{
          position: "fixed", right: 18, bottom: 92, width: 52, height: 52, borderRadius: 16,
          background: T.brand, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
          boxShadow: "0 6px 20px rgba(232,130,12,.38)", zIndex: 100,
        }}
      >
        <Plus size={24} color="#fff" />
      </button>

      {form && (
        <PaymentForm
          students={data.students}
          onClose={() => setForm(false)}
          onSave={(p) => {
            update("payments", (xs) => [{ id: crypto.randomUUID(), ...p }, ...xs]);
            setForm(false);
            toast("Ödeme kaydedildi.");
          }}
        />
      )}
      {pendingDelete && (
        <Confirm
          text={`${money(pendingDelete.amount)} tutarındaki ödeme silinsin mi?`}
          onConfirm={() => {
            update("payments", (xs) => xs.filter((x) => x.id !== pendingDelete.id));
            setPendingDelete(null);
            toast("Ödeme silindi.");
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AI ASİSTAN  — her ekrandan erişilebilir
   ═══════════════════════════════════════════════════════════════ */

function Assistant({ data, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const history = [...messages, { role: "user", text: q }];
    setMessages(history);
    setBusy(true);

    const roster = data.students.length
      ? data.students.map((s) => `${s.name} (${s.grade || "sınıf belirtilmemiş"})`).join(", ")
      : "henüz öğrenci yok";
    const convo = history.map((m) => `${m.role === "user" ? "Öğretmen" : "Sen"}: ${m.text}`).join("\n");

    try {
      const reply = await callClaude(
        `Sen Keçi'sin — özel ders öğretmenleri için bir asistan. Türkçe, kısa ve pratik yanıt ver. Öğretmenin öğrencileri: ${roster}.

${convo}

Sen:`
      );
      setMessages((m) => [...m, { role: "assistant", text: reply.trim() }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Şu an yanıt veremiyorum. Bağlantınızı kontrol edip tekrar deneyin.", failed: true },
      ]);
    }
    setBusy(false);
  }

  const prompts = ["Bu haftanın planını özetle", "Türev için 3 ödev fikri ver", "Veliye ilerleme mesajı yaz"];

  return (
    <Sheet title="Keçi asistan" onClose={onClose}>
      <div
        ref={scroller}
        style={{ height: 340, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 9 }}
      >
        {messages.length === 0 && (
          <div style={{ margin: "auto 0", textAlign: "center" }}>
            <Bot size={30} color={T.ink30} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 13.5, color: T.ink60, margin: "0 0 14px", lineHeight: 1.5 }}>
              Ders planı, ödev fikri, veli mesajı — ne gerekiyorsa sorun.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="k-btn"
                  style={{
                    border: `1px solid ${T.line}`, background: T.surface, borderRadius: 9,
                    padding: "9px 12px", fontSize: 13, color: T.ink60, cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "84%", padding: "10px 13px", fontSize: 14, lineHeight: 1.5,
              borderRadius: m.role === "user" ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
              background: m.role === "user" ? T.brand : m.failed ? T.warnSoft : T.bg,
              color: m.role === "user" ? "#fff" : m.failed ? T.warn : T.ink,
              whiteSpace: "pre-wrap",
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{
            alignSelf: "flex-start", background: T.bg, borderRadius: "13px 13px 13px 3px",
            padding: "12px 14px", display: "flex", gap: 4,
          }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="k-dot"
                style={{
                  width: 6, height: 6, borderRadius: "50%", background: T.ink30,
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 7 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Bir şey sorun"
          aria-label="Mesajınız"
          className="k-input"
          style={{ ...inputStyle, flex: 1 }}
        />
        <Button onClick={send} disabled={!input.trim() || busy}>
          <Send size={17} />
        </Button>
      </div>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFİL
   ═══════════════════════════════════════════════════════════════ */

function ProfileScreen({ data, reset, toast }) {
  const [confirmReset, setConfirmReset] = useState(false);

  const done = data.lessons.filter((l) => l.status === "done").length;
  const total = data.payments.reduce((a, p) => a + p.amount, 0);

  return (
    <div style={{ padding: "0 16px 96px" }}>
      <Card style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
        <Mark size={46} />
        <div>
          <div style={{ fontWeight: 750, fontSize: 16 }}>Öğretmen</div>
          <div style={{ fontSize: 13, color: T.ink60 }}>
            {data.students.length} öğrenci · {done} ders tamamlandı
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          ["Öğrenci", data.students.length],
          ["Ders", data.lessons.length],
          ["Toplam", money(total)],
        ].map(([label, value]) => (
          <Card key={label} style={{ textAlign: "center", padding: "13px 6px" }}>
            <div style={{
              fontSize: 17, fontWeight: 750, color: T.brand,
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
            }}>
              {value}
            </div>
            <div style={{ fontSize: 11, color: T.ink60, marginTop: 2 }}>{label}</div>
          </Card>
        ))}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>Veriler</h2>
      <Card>
        <p style={{ margin: "0 0 12px", fontSize: 13.5, color: T.ink60, lineHeight: 1.5 }}>
          Tüm kayıtlarınız bu cihazda saklanır. Sıfırlarsanız öğrenciler, dersler,
          ödevler ve ödemeler kalıcı olarak silinir.
        </p>
        <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
          <Trash2 size={14} /> Tüm verileri sil
        </Button>
      </Card>

      {confirmReset && (
        <Confirm
          text="Tüm veriler kalıcı olarak silinecek. Bu işlem geri alınamaz."
          confirmLabel="Hepsini sil"
          onConfirm={() => {
            reset();
            setConfirmReset(false);
            toast("Tüm veriler silindi.");
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════ */

const TABS = [
  { id: "takvim", label: "Takvim", icon: Calendar },
  { id: "ogrenciler", label: "Öğrenciler", icon: Users },
  { id: "odevler", label: "Ödevler", icon: ClipboardList },
  { id: "finans", label: "Finans", icon: Wallet },
  { id: "profil", label: "Profil", icon: User },
];

export default function App() {
  const { data, ready, error, update, reset, clearError } = useStore();
  const [tab, setTab] = useState("ogrenciler");
  const [assistant, setAssistant] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, tone = "ok") => {
    setToast({ message, tone, key: Date.now() });
  }, []);

  useEffect(() => {
    if (error) notify(error, "bad");
  }, [error, notify]);

  const go = useCallback((t) => setTab(t), []);

  return (
    <div style={{
      maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: T.bg,
      color: T.ink, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: "relative",
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; }
        .k-btn:focus-visible, .k-input:focus-visible, .k-slot:focus-visible {
          outline: 2px solid ${T.brand}; outline-offset: 2px;
        }
        .k-input:focus { border-color: ${T.brand}; }
        .k-slot:hover { background: ${T.brandSoft} !important; }
        .k-fab:active { transform: scale(.94); }
        .k-btn { transition: opacity .12s ease, transform .12s ease; }
        .k-btn:active:not(:disabled) { opacity: .78; }
        .k-sheet { animation: rise .26s cubic-bezier(.32,.72,0,1); }
        .k-scrim { animation: fade .2s ease; }
        .k-toast { animation: fade .18s ease; }
        .k-spin { animation: spin .8s linear infinite; }
        .k-dot { animation: pulse 1.1s ease-in-out infinite; }
        @keyframes rise { from { transform: translateY(100%); } }
        @keyframes fade { from { opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: .3; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      {/* başlık */}
      <header style={{
        position: "sticky", top: 0, zIndex: 60, background: T.surface,
        borderBottom: `1px solid ${T.line}`, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Mark size={34} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 780, fontSize: 17, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Keçi</div>
          <div style={{ fontSize: 11.5, color: T.ink60 }}>Özel ders asistanı</div>
        </div>
        <button
          onClick={() => setAssistant(true)}
          aria-label="Asistanı aç"
          className="k-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
            borderRadius: 10, border: `1px solid ${T.brand}`, background: T.brandSoft,
            color: T.brandDeep, fontWeight: 650, fontSize: 13, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Sparkles size={15} color={T.brand} /> Sor
        </button>
      </header>

      <main style={{ paddingTop: 14 }}>
        {!ready ? (
          <div style={{ display: "grid", placeItems: "center", padding: "80px 0" }}>
            <Loader2 size={22} color={T.ink30} className="k-spin" />
          </div>
        ) : (
          <>
            {tab === "takvim" && <CalendarScreen data={data} update={update} toast={notify} go={go} />}
            {tab === "ogrenciler" && <StudentsScreen data={data} update={update} toast={notify} go={go} />}
            {tab === "odevler" && <HomeworkScreen data={data} update={update} toast={notify} go={go} />}
            {tab === "finans" && <FinanceScreen data={data} update={update} toast={notify} go={go} />}
            {tab === "profil" && <ProfileScreen data={data} reset={reset} toast={notify} />}
          </>
        )}
      </main>

      {/* alt gezinme */}
      <nav style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: T.surface,
        borderTop: `1px solid ${T.line}`, display: "flex",
        padding: "7px 0 max(10px, env(safe-area-inset-bottom))", zIndex: 80,
      }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={on ? "page" : undefined}
              className="k-btn"
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                background: "none", border: "none", cursor: "pointer", padding: "5px 0",
                color: on ? T.brand : T.ink30, fontFamily: "inherit",
              }}
            >
              <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: on ? 700 : 500 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {assistant && <Assistant data={data} onClose={() => setAssistant(false)} />}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          tone={toast.tone}
          onDone={() => { setToast(null); clearError(); }}
        />
      )}
    </div>
  );
}
