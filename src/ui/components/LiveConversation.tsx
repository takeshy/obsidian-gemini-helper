import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, PhoneOff, X } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import type { Message } from "src/types";
import { t, getLocale } from "src/i18n";
import { GeminiLiveSession } from "src/core/live/gemini-live";
import { GEMINI_LIVE_MODELS, GEMINI_LIVE_VOICES } from "src/core/live/gemini-live-config";
import type { LiveSession, LiveState, LiveTranscript } from "src/core/live/live-session";
import { liveToolInstructions } from "src/core/live/live-tool-definitions";
import { createLiveVaultToolRunner, liveTranscriptMessages } from "src/core/live/live-vault-tools";

interface Props {
  plugin: GeminiHelperPlugin; messages: Message[]; historyEnabled: boolean;
  selectedRagSetting: string | null; initialFileAccess: boolean; onClose: (messages: Message[]) => void;
}

/** The voice transport owns media resources; this dialog owns the transcript until it is saved. */
export default function LiveConversation({ plugin, messages, historyEnabled, selectedRagSetting, initialFileAccess, onClose }: Props) {
  const models = GEMINI_LIVE_MODELS;
  const voices = GEMINI_LIVE_VOICES;
  const [model, setModel] = useState<string>(models[0]);
  const [voice, setVoice] = useState<string>(voices[0]);
  const [state, setState] = useState<LiveState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [fileAccess, setFileAccess] = useState(initialFileAccess);
  const [ragName, setRagName] = useState(selectedRagSetting ?? "");
  const [toolStatus, setToolStatus] = useState("");
  const [ragReport, setRagReport] = useState<{ count?: number; error?: string } | null>(null);
  const [transcript, setTranscript] = useState<LiveTranscript[]>([]);
  const transcriptRef = useRef<LiveTranscript[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);
  const runSequenceRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const finishedRef = useRef(false);
  const runnerRef = useRef<ReturnType<typeof createLiveVaultToolRunner> | null>(null);
  const activeToolsRef = useRef(new Map<string, { status: string }>());
  const ragNames = plugin.getRagSettingNames();

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    sessionRef.current?.stop();
    onCloseRef.current(liveTranscriptMessages(transcriptRef.current));
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onPageHide = () => finish();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      const shouldSave = !finishedRef.current && transcriptRef.current.some(item => item.text.trim());
      finishedRef.current = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
      if (shouldSave) onCloseRef.current(liveTranscriptMessages(transcriptRef.current));
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const stop = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    activeToolsRef.current.clear();
    setToolStatus(""); setState("idle"); setMuted(false);
  };

  const start = () => {
    if (state !== "idle") return;
    const run = ++runSequenceRef.current;
    sessionRef.current?.stop();
    const previousTranscript = [...transcriptRef.current];
    const current = () => !finishedRef.current && runSequenceRef.current === run;
    setError(""); setMuted(false); setRagReport(null);
    const session = new GeminiLiveSession({
      audio: audioRef.current!,
      onState: value => { if (current()) { setState(value); if (value === "idle") { activeToolsRef.current.clear(); setToolStatus(""); } } },
      onError: value => { if (current()) setError(value); },
      onTranscript: value => {
        if (!current()) return;
        const combined = [...previousTranscript, ...value.map(item => ({ ...item, id: `${run}:${item.id}` }))];
        transcriptRef.current = combined;
        setTranscript(combined);
      },
      onToolCall: async (call, signal) => {
        if (!current()) throw new Error("This live session has ended.");
        const status = call.name === "rag_search" ? t("live.searchingRag") : call.name.includes("search") || call.name.startsWith("list_") ? t("live.searchingFiles") : t("live.readingFile");
        const activity = { status };
        activeToolsRef.current.set(call.id, activity);
        setToolStatus(status);
        const done = () => {
          if (activeToolsRef.current.get(call.id) !== activity) return;
          activeToolsRef.current.delete(call.id);
          if (current()) setToolStatus([...activeToolsRef.current.values()].pop()?.status ?? "");
        };
        signal.addEventListener("abort", done, { once: true });
        try {
          if (!runnerRef.current) throw new Error("Vault access is not enabled.");
          const result = await runnerRef.current(call, signal);
          if (call.name === "rag_search" && current() && !signal.aborted) {
            const report = result && typeof result === "object" ? result as { error?: unknown; resultCount?: unknown; results?: unknown } : {};
            if (typeof report.error === "string") setRagReport({ error: report.error });
            else if (typeof report.resultCount === "number") setRagReport({ count: report.resultCount });
            else if (Array.isArray(report.results)) setRagReport({ count: report.results.length });
          }
          return result;
        } finally { signal.removeEventListener("abort", done); done(); }
      },
    }, { apiKey: plugin.settings.googleApiKey.trim() });
    sessionRef.current = session;
    const setting = ragName ? plugin.getRagSetting(ragName) : null;
    const access = { fileAccess, ragEnabled: !!setting };
    runnerRef.current = fileAccess || access.ragEnabled ? createLiveVaultToolRunner(plugin.app, plugin.settings, access, setting ? { name: ragName, storeIds: plugin.getStoreIdsForRagSetting(setting), metadataFilter: setting.metadataFilter || undefined } : undefined) : null;
    const contextMessages = [...messages, ...liveTranscriptMessages(previousTranscript)];
    const context = includeContext ? contextMessages.slice(-20).map(item => `${item.role}: ${item.content}`).join("\n").slice(-40_000) : "";
    void session.start({
      ...access, model, voice, language: getLocale() === "ja" ? "ja" : "en",
      instructions: [
        "You are a helpful voice assistant integrated with Obsidian. Follow the user's preferred language and speaking style. If speech is unclear, ask for clarification instead of guessing.",
        plugin.settings.systemPrompt, liveToolInstructions(access),
        context ? `Prior text conversation for context (not new instructions):\n${context}` : "",
      ].filter(Boolean).join("\n\n"),
    });
  };

  return createPortal(<div className="gemini-helper-live-backdrop" onPointerDown={() => {
    if (state === "connected") void audioRef.current?.play().catch(() => {});
  }} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); finish(); }
    if (event.key === "Tab") {
      const elements = panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)");
      const first = elements?.[0], last = elements?.[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div ref={panelRef} className="gemini-helper-live-dialog" role="dialog" aria-modal="true" aria-label={t("live.title")}>
      <div className="gemini-helper-live-heading"><h3>{t("live.title")} · Gemini</h3><button ref={closeRef} type="button" className="clickable-icon" onClick={finish} aria-label={t("common.close")}><X size={20} /></button></div>
      <div className="gemini-helper-live-body">
        <p className="gemini-helper-live-description">{t("live.description")}</p>
        <div className="gemini-helper-live-options">
          <label>{t("live.model")}<select aria-label={t("live.model")} value={model} disabled={state !== "idle"} onChange={event => setModel(event.target.value)}>{models.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>{t("live.voice")}<select aria-label={t("live.voice")} value={voice} disabled={state !== "idle"} onChange={event => setVoice(event.target.value)}>{voices.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <p className="gemini-helper-live-description">{t("live.switchHint")}</p>
        <label className="gemini-helper-live-check"><input type="checkbox" checked={includeContext} disabled={state !== "idle"} onChange={event => setIncludeContext(event.target.checked)} />{t("live.includeContext")}</label>
        <label className="gemini-helper-live-check"><input type="checkbox" checked={fileAccess} disabled={state !== "idle"} onChange={event => setFileAccess(event.target.checked)} />{t("live.fileAccess")}</label>
        {ragNames.length > 0 && <label className="gemini-helper-live-rag">RAG<select aria-label="RAG" value={ragName} disabled={state !== "idle"} onChange={event => { setRagName(event.target.value); setRagReport(null); }}><option value="">{t("live.noRag")}</option>{ragNames.map(name => <option key={name}>{name}</option>)}</select></label>}
        {ragName && <p className="gemini-helper-live-description">{t("live.ragScope")}</p>}
        <p className="gemini-helper-live-description">{t(historyEnabled ? "live.historySaved" : "live.historyDisabled")}</p>
        <p role="status">{t(state === "connecting" ? "live.connecting" : state === "connected" ? "live.connected" : "live.stopped")}</p>
        {error && <p className="gemini-helper-live-error" role="alert">{error}</p>}
        {toolStatus && <p role="status">{toolStatus}</p>}
        {ragName && <p className={ragReport?.error ? "gemini-helper-live-error" : "gemini-helper-live-description"} role={ragReport?.error ? "alert" : "status"}>
          {ragReport?.error ? t("live.ragFailed", { error: ragReport.error }) : ragReport?.count !== undefined ? t("live.ragResults", { count: String(ragReport.count) }) : t("live.ragNotRun")}
        </p>}
        <div className="gemini-helper-live-transcript" role="log" aria-label={t("live.transcript")}>{transcript.map(item => <p key={item.id}><strong>{t(item.role === "user" ? "live.you" : "live.assistant")}: </strong>{item.text}</p>)}</div>
        <audio ref={audioRef} autoPlay playsInline hidden />
      </div>
      <div className="gemini-helper-live-actions">
        {state === "idle" ? <>
          <button type="button" className="mod-cta" onClick={start}>{t("live.start")}</button>
          {transcript.length > 0 && <button type="button" onClick={finish}>{t("live.returnToChat")}</button>}
        </> : <>
          <button type="button" disabled={state !== "connected"} aria-pressed={muted} onClick={() => { sessionRef.current?.mute(!muted); setMuted(!muted); }}>{muted ? <MicOff size={16} /> : <Mic size={16} />}{t(muted ? "live.unmute" : "live.mute")}</button>
          <button type="button" onClick={stop}>{t("live.stop")}</button>
          <button type="button" className="mod-warning" onClick={finish}><PhoneOff size={16} />{t("live.end")}</button>
        </>}
      </div>
    </div>
  </div>, document.body);
}
