import { useCallback, useMemo, useState } from "react";
import JSZip from "jszip";
import { translateBatch } from "@/lib/api/translate.functions";

const LANGUAGES = [
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina" },
  { code: "bg", name: "Bulgarian", nativeName: "Български" },
  { code: "sr", name: "Serbian", nativeName: "Српски" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски" },
  { code: "be", name: "Belarusian", nativeName: "Беларуская" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ" },
  { code: "ha", name: "Hausa", nativeName: "Hausa" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "he", name: "Hebrew", nativeName: "עברית" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "fa", name: "Persian", nativeName: "فارسی" },
  { code: "ku", name: "Kurdish", nativeName: "کوردی" },
];

type AnyObj = Record<string, unknown>;

function flattenKeys(obj: AnyObj, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      Object.assign(out, flattenKeys(v as AnyObj, key));
    } else {
      out[key] = v as string;
    }
  }
  return out;
}

function buildNested(keys: string[], values: string[]) {
  const result: AnyObj = {};
  keys.forEach((key, i) => {
    const parts = key.split(".");
    let cur: AnyObj = result;
    parts.forEach((p, idx) => {
      if (idx === parts.length - 1) {
        cur[p] = values[i] ?? key;
      } else {
        if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
        cur = cur[p] as AnyObj;
      }
    });
  });
  return result;
}

function deepMerge(target: AnyObj, source: AnyObj): AnyObj {
  const out: AnyObj = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (typeof sv === "object" && sv !== null && !Array.isArray(sv)) {
      out[key] = deepMerge((out[key] as AnyObj) || {}, sv as AnyObj);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

function downloadBlob(filename: string, content: string | Blob, mime = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CHUNK = 60;

async function translateAll(
  enFlat: Record<string, string>,
  keys: string[],
  langName: string,
  nativeName: string,
  onProgress: (msg: string, pct: number) => void,
): Promise<{ ok: true; values: string[] } | { ok: false; error: string }> {
  const values = keys.map((k) => enFlat[k]);
  const out: string[] = [];
  const chunks = Math.ceil(keys.length / CHUNK);
  for (let i = 0; i < keys.length; i += CHUNK) {
    const idx = i / CHUNK;
    onProgress(
      `Chunk ${idx + 1}/${chunks} (${Math.min(CHUNK, keys.length - i)} strings)`,
      Math.round(10 + (idx / chunks) * 80),
    );
    const slice = keys.slice(i, i + CHUNK).map((k, j) => ({ key: k, value: values[i + j] }));
    const res = await translateBatch({
      data: { languageName: langName, nativeName, pairs: slice },
    });
    if (!res.ok) return { ok: false, error: res.error };
    if (res.translations.length !== slice.length) {
      // Pad/truncate defensively
      const padded = [...res.translations];
      while (padded.length < slice.length) padded.push(slice[padded.length].value);
      out.push(...padded.slice(0, slice.length));
    } else {
      out.push(...res.translations);
    }
  }
  return { ok: true, values: out };
}

type BulkResult = { code: string; json: string; error?: string };

export default function I18nFiller() {
  const [enJson, setEnJson] = useState("");
  const [targetJson, setTargetJson] = useState("");
  const [selectedLang, setSelectedLang] = useState("es");
  const [mode, setMode] = useState<"gap" | "full">("gap");
  const [status, setStatus] = useState<"idle" | "translating" | "done" | "error" | "analyzed">("idle");
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState({ step: "", pct: 0 });
  const [enError, setEnError] = useState("");
  const [targetError, setTargetError] = useState("");

  // Bulk
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(
    () => new Set(LANGUAGES.map((l) => l.code)),
  );
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ step: "", pct: 0 });

  const lang = useMemo(() => LANGUAGES.find((l) => l.code === selectedLang)!, [selectedLang]);

  const validateJSON = (str: string, setter: (s: string) => void): AnyObj | null => {
    if (!str.trim()) {
      setter("");
      return {};
    }
    try {
      const parsed = JSON.parse(str);
      setter("");
      return parsed;
    } catch (e) {
      setter("Invalid JSON: " + (e as Error).message);
      return null;
    }
  };

  const analyze = useCallback(() => {
    const en = validateJSON(enJson, setEnError);
    if (!en) return;
    const target = validateJSON(targetJson, setTargetError);
    if (target === null) return;
    const enFlat = flattenKeys(en);
    const targetFlat = flattenKeys(target);
    const missing = Object.keys(enFlat).filter((k) => !(k in targetFlat));
    setMissingKeys(missing);
    setStatus("analyzed");
  }, [enJson, targetJson]);

  const translate = useCallback(async () => {
    const en = validateJSON(enJson, setEnError);
    if (!en) return;
    let target: AnyObj = {};
    if (targetJson.trim() && mode === "gap") {
      const t = validateJSON(targetJson, setTargetError);
      if (!t) return;
      target = t;
    }
    const enFlat = flattenKeys(en);
    const targetFlat = flattenKeys(target);
    const keys = mode === "gap"
      ? Object.keys(enFlat).filter((k) => !(k in targetFlat))
      : Object.keys(enFlat);

    if (keys.length === 0) {
      setOutput(JSON.stringify(target, null, 2));
      setStatus("done");
      return;
    }

    setStatus("translating");
    setProgress({ step: `Translating ${keys.length} keys → ${lang.nativeName}…`, pct: 5 });

    const res = await translateAll(enFlat, keys, lang.name, lang.nativeName, (step, pct) =>
      setProgress({ step, pct }),
    );
    if (!res.ok) {
      setStatus("error");
      setProgress({ step: res.error, pct: 0 });
      return;
    }
    setProgress({ step: "Building file…", pct: 95 });
    const nested = buildNested(keys, res.values);
    const finalObj = mode === "gap" ? deepMerge(target, nested) : nested;
    setOutput(JSON.stringify(finalObj, null, 2));
    setStatus("done");
    setProgress({ step: "Done!", pct: 100 });
  }, [enJson, targetJson, mode, lang]);

  const runBulk = useCallback(async () => {
    const en = validateJSON(enJson, setEnError);
    if (!en) return;
    const enFlat = flattenKeys(en);
    const keys = Object.keys(enFlat);
    const targets = LANGUAGES.filter((l) => bulkSelected.has(l.code));
    if (targets.length === 0) return;

    setBulkRunning(true);
    setBulkResults([]);
    const results: BulkResult[] = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      setBulkProgress({
        step: `(${i + 1}/${targets.length}) ${t.nativeName} — ${t.code}.json`,
        pct: Math.round((i / targets.length) * 100),
      });
      const res = await translateAll(enFlat, keys, t.name, t.nativeName, (step, _pct) => {
        setBulkProgress((prev) => ({ ...prev, step: `(${i + 1}/${targets.length}) ${t.nativeName} — ${step}` }));
      });
      if (!res.ok) {
        results.push({ code: t.code, json: "", error: res.error });
      } else {
        const nested = buildNested(keys, res.values);
        results.push({ code: t.code, json: JSON.stringify(nested, null, 2) });
      }
      setBulkResults([...results]);
    }
    setBulkProgress({ step: "All done!", pct: 100 });
    setBulkRunning(false);
  }, [enJson, bulkSelected]);

  const downloadAllZip = useCallback(async () => {
    if (bulkResults.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("locales")!;
    for (const r of bulkResults) {
      if (r.json) folder.file(`${r.code}.json`, r.json);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob("locales.zip", blob, "application/zip");
  }, [bulkResults]);

  const toggleAll = (val: boolean) =>
    setBulkSelected(val ? new Set(LANGUAGES.map((l) => l.code)) : new Set());

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0f1e",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #0047AB 0%, #001f5c 100%)",
          borderBottom: "1px solid rgba(0,71,171,0.4)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "rgba(0,71,171,0.5)",
            border: "1px solid rgba(0,229,255,0.3)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          🌐
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "0.5px" }}>
            BMET SEEKER — i18n Gap Filler
          </div>
          <div style={{ fontSize: 11, color: "rgba(0,229,255,0.7)", marginTop: 2 }}>
            Translate, preview, and download locale files for {LANGUAGES.length} languages
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 980,
          margin: "0 auto",
        }}
      >
        {/* en.json */}
        <Panel error={!!enError}>
          <Label>en.json (source — paste your English file)</Label>
          <textarea
            value={enJson}
            onChange={(e) => {
              setEnJson(e.target.value);
              setEnError("");
              setStatus("idle");
            }}
            placeholder="Paste your en.json content here…"
            style={ta}
          />
          {enError && <ErrorText>{enError}</ErrorText>}
        </Panel>

        {/* Tabs: single vs bulk */}
        <Panel>
          <Label>Single language</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([
              { val: "gap", label: "🔍 Fill Missing Keys" },
              { val: "full", label: "🔄 Full Retranslate" },
            ] as const).map((m) => (
              <button
                key={m.val}
                onClick={() => {
                  setMode(m.val);
                  setStatus("idle");
                  setOutput("");
                }}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: mode === m.val ? "1px solid #0047AB" : "1px solid rgba(255,255,255,0.08)",
                  background: mode === m.val ? "rgba(0,71,171,0.25)" : "rgba(255,255,255,0.03)",
                  color: mode === m.val ? "#60a5fa" : "#64748b",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <select
            value={selectedLang}
            onChange={(e) => {
              setSelectedLang(e.target.value);
              setStatus("idle");
              setOutput("");
            }}
            style={{
              width: "100%",
              background: "#0d1526",
              border: "1px solid rgba(0,71,171,0.4)",
              borderRadius: 8,
              color: "#e2e8f0",
              padding: "10px 12px",
              fontSize: 13,
              outline: "none",
              marginBottom: 12,
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName} ({l.name}) — {l.code}.json
              </option>
            ))}
          </select>

          {mode === "gap" && (
            <>
              <Label>{selectedLang}.json (target — optional)</Label>
              <textarea
                value={targetJson}
                onChange={(e) => {
                  setTargetJson(e.target.value);
                  setTargetError("");
                  setStatus("idle");
                }}
                placeholder={`Paste your existing ${selectedLang}.json here (optional)…`}
                style={ta}
              />
              {targetError && <ErrorText>{targetError}</ErrorText>}
              {enJson && (
                <button onClick={analyze} style={{ ...secondaryBtn, marginTop: 10 }}>
                  🔍 Analyze Gap
                </button>
              )}
              {status === "analyzed" && (
                <div
                  style={{
                    marginTop: 10,
                    background:
                      missingKeys.length === 0 ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                    border: `1px solid ${missingKeys.length === 0 ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  {missingKeys.length === 0 ? (
                    <div style={{ color: "#22c55e", fontSize: 12 }}>
                      ✅ {selectedLang}.json is fully in sync
                    </div>
                  ) : (
                    <>
                      <div style={{ color: "#f59e0b", fontSize: 12, marginBottom: 6 }}>
                        ⚠ {missingKeys.length} missing key{missingKeys.length !== 1 ? "s" : ""}
                      </div>
                      <div
                        style={{
                          maxHeight: 120,
                          overflowY: "auto",
                          background: "#060c1a",
                          borderRadius: 6,
                          padding: "6px 10px",
                        }}
                      >
                        {missingKeys.map((k) => (
                          <div key={k} style={{ fontSize: 10, color: "#f59e0b", lineHeight: 1.8 }}>
                            • {k}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <button
            onClick={translate}
            disabled={!enJson || status === "translating"}
            style={{
              ...primaryBtn,
              marginTop: 12,
              cursor: !enJson || status === "translating" ? "not-allowed" : "pointer",
              opacity: !enJson ? 0.5 : 1,
            }}
          >
            {status === "translating"
              ? `⏳ ${progress.step}`
              : mode === "gap"
                ? `🌐 Fill → ${lang.nativeName}`
                : `🔄 Retranslate → ${lang.nativeName}`}
          </button>

          {status === "translating" && <ProgressBar pct={progress.pct} />}
          {status === "error" && (
            <div
              style={{
                marginTop: 10,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#f87171",
                fontSize: 12,
              }}
            >
              ❌ {progress.step}
            </div>
          )}

          {status === "done" && output && (
            <div
              style={{
                marginTop: 12,
                background: "rgba(34,197,94,0.05)",
                border: "1px solid rgba(34,197,94,0.25)",
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, flex: 1 }}>
                  ✅ {selectedLang}.json — {output.split("\n").length} lines
                </div>
                <button
                  onClick={() => downloadBlob(`${selectedLang}.json`, output)}
                  style={primaryBtnSm}
                >
                  ⬇ Download
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(output).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2500);
                    });
                  }}
                  style={secondaryBtnSm}
                >
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
              <textarea readOnly value={output} style={{ ...ta, height: 240, color: "#4ade80" }} />
            </div>
          )}
        </Panel>

        {/* Bulk panel */}
        <Panel>
          <Label>Bulk — generate every language at once</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => toggleAll(true)} style={secondaryBtnSm}>
              Select all
            </button>
            <button onClick={() => toggleAll(false)} style={secondaryBtnSm}>
              Clear
            </button>
            <div style={{ flex: 1, textAlign: "right", fontSize: 11, color: "#64748b", alignSelf: "center" }}>
              {bulkSelected.size} / {LANGUAGES.length} selected
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 6,
              maxHeight: 200,
              overflowY: "auto",
              background: "#060c1a",
              padding: 10,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {LANGUAGES.map((l) => {
              const sel = bulkSelected.has(l.code);
              return (
                <label
                  key={l.code}
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 11,
                    color: sel ? "#e2e8f0" : "#64748b",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={(e) => {
                      const next = new Set(bulkSelected);
                      if (e.target.checked) next.add(l.code);
                      else next.delete(l.code);
                      setBulkSelected(next);
                    }}
                  />
                  <span>{l.code}</span>
                  <span style={{ opacity: 0.6 }}>{l.nativeName}</span>
                </label>
              );
            })}
          </div>
          <button
            onClick={runBulk}
            disabled={!enJson || bulkRunning || bulkSelected.size === 0}
            style={{
              ...primaryBtn,
              cursor:
                !enJson || bulkRunning || bulkSelected.size === 0 ? "not-allowed" : "pointer",
              opacity: !enJson || bulkSelected.size === 0 ? 0.5 : 1,
            }}
          >
            {bulkRunning ? `⏳ ${bulkProgress.step}` : `🚀 Generate ${bulkSelected.size} files`}
          </button>
          {bulkRunning && <ProgressBar pct={bulkProgress.pct} />}

          {bulkResults.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, flex: 1 }}>
                  {bulkResults.filter((r) => !r.error).length} / {bulkResults.length} files ready
                </div>
                <button onClick={downloadAllZip} style={primaryBtnSm}>
                  ⬇ Download all (.zip)
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 6,
                  maxHeight: 260,
                  overflowY: "auto",
                  background: "#060c1a",
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                {bulkResults.map((r) => (
                  <div
                    key={r.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      padding: "6px 8px",
                      background: r.error ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.05)",
                      borderRadius: 6,
                    }}
                  >
                    <span style={{ flex: 1, color: r.error ? "#f87171" : "#86efac" }}>
                      {r.code}.json
                    </span>
                    {r.error ? (
                      <span title={r.error} style={{ color: "#f87171" }}>⚠</span>
                    ) : (
                      <button
                        onClick={() => downloadBlob(`${r.code}.json`, r.json)}
                        style={{
                          background: "transparent",
                          color: "#60a5fa",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                      >
                        ⬇
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// --- tiny presentational helpers ---
const ta: React.CSSProperties = {
  width: "100%",
  height: 120,
  background: "#060c1a",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 8,
  color: "#94a3b8",
  padding: 10,
  fontSize: 11,
  fontFamily: "monospace",
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: 14,
  background: "linear-gradient(135deg, #0047AB, #003380)",
  border: "1px solid rgba(0,71,171,0.5)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.5px",
  fontFamily: "inherit",
};
const primaryBtnSm: React.CSSProperties = {
  padding: "8px 14px",
  background: "linear-gradient(135deg, #0047AB, #003380)",
  border: "1px solid rgba(0,71,171,0.5)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
const secondaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "rgba(0,71,171,0.15)",
  border: "1px solid rgba(0,71,171,0.4)",
  borderRadius: 8,
  color: "#60a5fa",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const secondaryBtnSm: React.CSSProperties = { ...secondaryBtn, padding: "6px 12px", fontSize: 11 };

function Panel({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: error ? "1px solid #ef4444" : "1px solid rgba(0,71,171,0.3)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#64748b",
        marginBottom: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}
function ErrorText({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#ef4444", fontSize: 11, marginTop: 6 }}>⚠ {children}</div>;
}
function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        marginTop: 10,
        background: "rgba(255,255,255,0.05)",
        borderRadius: 6,
        height: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "linear-gradient(90deg, #0047AB, #00E5FF)",
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}