import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AppSettings, ReportTab } from "../types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

interface Props {
  tab: ReportTab;
  settings: AppSettings;
  onStatus: (left: string, right: string) => void;
}

interface Message {
  role: "user" | "assistant" | "compact";
  content: string;        // display text
  cliContent?: string;    // actual content sent to Claude CLI (includes image paths)
  imagePreviews?: string[]; // base64 DataURLs for inline display
}

interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  messages: Message[];
  files: Record<string, string>; // filePath → fileContent snapshot at checkpoint time
}

type PermissionMode = "auto" | "plan" | "acceptEdits" | "default";
type EffortLevel = "low" | "medium" | "high" | "max";

interface Attachment {
  name: string;
  content: string;
  previewUrl?: string; // set for image attachments
}

interface ModeOption {
  id: PermissionMode;
  title: string;
  description: string;
  icon: string;
  cliValue: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "default",
    title: "Ask before edits",
    description: "Claude will ask for approval before making each edit",
    icon: "codicon-feedback",
    cliValue: "default"
  },
  {
    id: "acceptEdits",
    title: "Edit automatically",
    description: "Claude will edit your selected text or the whole file",
    icon: "codicon-code",
    cliValue: "acceptEdits"
  },
  {
    id: "plan",
    title: "Plan mode",
    description: "Claude will explore the code and present a plan before editing",
    icon: "codicon-layers",
    cliValue: "plan"
  },
  {
    id: "auto",
    title: "Auto mode",
    description: "Claude will automatically choose the best permission mode for each task",
    icon: "codicon-zap",
    cliValue: "auto"
  }
];

const SESSIONS_KEY = "claude_sessions_v1";

interface PresetModel {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  disabled?: boolean;
}

const PRESET_MODELS: PresetModel[] = [
  { id: "", name: "Default (recommended)", subtitle: "Sonnet 4.6", description: "Efficient for routine tasks" },
  { id: "claude-sonnet-4-6", name: "Sonnet", subtitle: "Sonnet 4.6", description: "Efficient for routine tasks" },
  { id: "claude-opus-4-8", name: "Opus", subtitle: "Opus 4.8", description: "Best for everyday, complex tasks · ~2× usage vs Sonnet" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku", subtitle: "Haiku 4.5", description: "Fastest for quick answers" },
  { id: "claude-fable-5", name: "Fable", subtitle: "", description: "Claude Fable 5 is currently unavailable.", disabled: true },
];

function getModelShortName(id: string): string {
  if (!id) return "Default";
  const m = id.match(/claude-([a-z]+)/i);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : id;
}

const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "max"];
const EFFORT_LABELS: Record<EffortLevel, string> = { low: "Low", medium: "Med", high: "High", max: "Max" };

const VALID_TEXT_EXTENSIONS = new Set([
  ".sql", ".rdl", ".xml", ".json", ".txt", ".md",
  ".ts", ".tsx", ".js", ".jsx", ".cs", ".py",
  ".html", ".css", ".csv", ".log", ".yaml", ".yml", ".toml"
]);
const SKIP_DIRS = ["node_modules", ".git", "bin", "obj", ".vs", "dist"];

function isValidTextFile(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, "/").toLowerCase();
  if (SKIP_DIRS.some(d => lower.includes(`/${d}/`) || lower.endsWith(`/${d}`))) return false;
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx < 0) return false;
  return VALID_TEXT_EXTENSIONS.has(lower.slice(dotIdx));
}

function EffortSlider({ value, onChange }: { value: EffortLevel; onChange: (v: EffortLevel) => void }) {
  const activeIdx = EFFORT_LEVELS.indexOf(value);
  return (
    <div style={{ display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid #e0e0e0", flexShrink: 0 }}>
      {EFFORT_LEVELS.map((level, idx) => (
        <button
          key={level}
          onClick={() => onChange(level)}
          style={{
            padding: "3px 11px",
            border: "none",
            borderRight: idx < 3 ? "1px solid #e0e0e0" : "none",
            background: idx <= activeIdx ? "#007acc" : "#f5f5f5",
            color: idx <= activeIdx ? "#fff" : "#999",
            fontSize: 11,
            fontWeight: idx === activeIdx ? 600 : 400,
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s"
          }}
        >
          {EFFORT_LABELS[level]}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{ width: 40, height: 22, borderRadius: 11, background: on ? "#1a1a1a" : "#d4d4d4", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}
    >
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: on ? 20 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
    </div>
  );
}

export function ChatPanel({ tab, settings, onStatus }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<PermissionMode>("auto");
  const [selectedEffort, setSelectedEffort] = useState<EffortLevel>("max");
  const [showModesMenu, setShowModesMenu] = useState(false);
  const [showAutoModeCard, setShowAutoModeCard] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const [hoveredModeOptionId, setHoveredModeOptionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [browseUrl, setBrowseUrl] = useState("");
  const [showBrowseInput, setShowBrowseInput] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atSuggestions, setAtSuggestions] = useState<string[]>([]);
  const [atSelectedIdx, setAtSelectedIdx] = useState(0);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [localModel, setLocalModel] = useState<string>("");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [autoSwitchModel, setAutoSwitchModel] = useState(true);
  const [isCompacting, setIsCompacting] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showCheckpointPanel, setShowCheckpointPanel] = useState(false);
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [isSavingCheckpoint, setIsSavingCheckpoint] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  const contextPct = Math.min(99, Math.round(
    (messages.filter(m => m.role !== "compact").reduce((s, m) => s + (m.cliContent ?? m.content).length, 0) / 4 + messages.length * 4) / 2000
  ));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const attachDropdownRef = useRef<HTMLDivElement>(null);
  const atDropdownRef = useRef<HTMLDivElement>(null);
  const modelPanelRef = useRef<HTMLDivElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const checkpointPanelRef = useRef<HTMLDivElement>(null);
  const checkpointBtnRef = useRef<HTMLButtonElement>(null);
  const workspaceFiles = useRef<string[]>([]);

  // Load messages for this session
  useEffect(() => {
    try {
      const rawMsgs = localStorage.getItem(`claude_messages_${tab.path}`);
      if (rawMsgs) {
        setMessages(JSON.parse(rawMsgs));
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error(e);
      setMessages([]);
    }
  }, [tab.path]);

  // Load checkpoints for this session
  useEffect(() => {
    try {
      const rawCkpts = localStorage.getItem(`claude_checkpoints_${tab.path}`);
      if (rawCkpts) {
        setCheckpoints(JSON.parse(rawCkpts));
      } else {
        setCheckpoints([]);
      }
    } catch (e) {
      setCheckpoints([]);
    }
  }, [tab.path]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-grow textarea height on input change
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Listen for Ctrl+Escape to focus/unfocus input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Escape") {
        e.preventDefault();
        if (document.activeElement === textareaRef.current) {
          textareaRef.current?.blur();
        } else {
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModesMenu(false);
      }
      if (
        !attachBtnRef.current?.contains(e.target as Node) &&
        !attachDropdownRef.current?.contains(e.target as Node)
      ) {
        setShowAttachMenu(false);
      }
      if (!atDropdownRef.current?.contains(e.target as Node) &&
          !textareaRef.current?.contains(e.target as Node)) {
        setAtQuery(null);
        setAtSuggestions([]);
      }
      if (!modelPanelRef.current?.contains(e.target as Node) &&
          !modelBtnRef.current?.contains(e.target as Node)) {
        setShowModelPanel(false);
        setShowModelPicker(false);
      }
      if (!checkpointPanelRef.current?.contains(e.target as Node) &&
          !checkpointBtnRef.current?.contains(e.target as Node)) {
        setShowCheckpointPanel(false);
        setEditingCheckpointId(null);
        setConfirmRestoreId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAttachFile = async (type: "upload" | "context") => {
    setShowAttachMenu(false);
    try {
      const filters = type === "upload"
        ? [{ name: "All files", extensions: ["txt", "sql", "rdl", "xml", "json", "csv", "md", "ts", "tsx", "js", "jsx", "py", "cs", "html", "css", "log"] }]
        : [{ name: "All files", extensions: ["*"] }];
      const selected = await open({ multiple: false, filters });
      if (typeof selected !== "string") return;
      const content = await invoke<string>("read_text_file", { path: selected });
      const name = selected.split(/[\\/]/).pop() || selected;
      setAttachments(prev => [...prev, { name, content }]);
    } catch (e) {
      console.error("Failed to attach file", e);
    }
  };

  const handleBrowseUrlSubmit = () => {
    const url = browseUrl.trim();
    if (!url) return;
    const label = url.startsWith("http") ? url : `https://${url}`;
    setAttachments(prev => [...prev, { name: label, content: `[Referenced URL]: ${label}` }]);
    setBrowseUrl("");
    setShowBrowseInput(false);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Scan workspace files for @ suggestions
  useEffect(() => {
    const loadFiles = async () => {
      const files: string[] = [];
      for (const folder of settings.workspaceFolders) {
        try {
          const folderFiles = await invoke<string[]>("scan_folder", { path: folder.path });
          files.push(...folderFiles.filter(f => !f.endsWith("/")));
        } catch {}
      }
      workspaceFiles.current = files;
    };
    loadFiles();
  }, [settings.workspaceFolders]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const ext = imageItem.type.split("/")[1] || "png";
      const name = `image.${ext}`;
      setAttachments(prev => [...prev, { name, content: `[Attached image: ${name}]`, previewUrl: dataUrl }]);
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      const q = match[1].toLowerCase();
      setAtQuery(match[1]);
      setAtSelectedIdx(0);
      if (q.length > 0) {
        const filtered = workspaceFiles.current
          .filter(f => (f.split(/[\\/]/).pop()?.toLowerCase() || "").includes(q))
          .slice(0, 8);
        setAtSuggestions(filtered);
      } else {
        setAtSuggestions([]);
      }
    } else {
      setAtQuery(null);
      setAtSuggestions([]);
    }
  };

  const handleAtSelect = async (filePath: string) => {
    try {
      const content = await invoke<string>("read_text_file", { path: filePath });
      const name = filePath.split(/[\\/]/).pop() || filePath;
      setAttachments(prev => [...prev, { name, content }]);
    } catch (e) {
      console.error("Failed to attach file via @", e);
    }
    // Remove @query from input
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    const replaced = input.slice(0, cursor).replace(/@\w*$/, "") + input.slice(cursor);
    setInput(replaced);
    setAtQuery(null);
    setAtSuggestions([]);
  };

  const handleClearConversation = () => {
    setMessages([]);
    setAttachments([]);
    setShowBrowseInput(false);
    localStorage.removeItem(`claude_messages_${tab.path}`);
  };

  const MAX_CHECKPOINTS = 10;

  // Internal helper: snapshot current files + messages into a Checkpoint
  const buildCheckpoint = async (snapshotMessages: Message[], label: string): Promise<Checkpoint> => {
    const cwd = settings.claudeFolder || "";
    let files: Record<string, string> = {};
    if (cwd) {
      try {
        const allFiles = await invoke<string[]>("scan_folder", { path: cwd });
        const textFiles = allFiles.filter(f => !f.endsWith("/") && isValidTextFile(f));
        files = await invoke<Record<string, string>>("snapshot_files", { paths: textFiles });
      } catch (e) {
        console.error("File snapshot failed:", e);
      }
    }
    const now = Date.now();
    return { id: `ckpt_${now}`, label, timestamp: now, messages: snapshotMessages, files };
  };

  // Persist updated checkpoint list, trim to MAX_CHECKPOINTS
  const saveCheckpoints = (updated: Checkpoint[]) => {
    setCheckpoints(updated);
    try {
      localStorage.setItem(`claude_checkpoints_${tab.path}`, JSON.stringify(updated));
    } catch {
      // Storage quota: keep only 3 most recent if full
      const trimmed = updated.slice(0, 3);
      setCheckpoints(trimmed);
      try { localStorage.setItem(`claude_checkpoints_${tab.path}`, JSON.stringify(trimmed)); } catch {}
    }
  };

  const handleCreateCheckpoint = async () => {
    if (messages.length === 0 || isSavingCheckpoint) return;
    setIsSavingCheckpoint(true);
    try {
      const label = `Checkpoint ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
      const newCkpt = await buildCheckpoint([...messages], label);
      saveCheckpoints([newCkpt, ...checkpoints].slice(0, MAX_CHECKPOINTS));
    } catch (e) {
      console.error("Failed to create checkpoint:", e);
    } finally {
      setIsSavingCheckpoint(false);
    }
  };

  // Trigger confirmation UI (does not restore yet)
  const handleRestoreCheckpoint = (ckpt: Checkpoint) => {
    setConfirmRestoreId(ckpt.id);
  };

  // Actually restore after user confirms
  const handleConfirmRestore = async (ckpt: Checkpoint) => {
    if (isRestoring) return;
    setIsRestoring(true);
    onStatus("Restoring checkpoint...", "");
    try {
      const cwd = settings.claudeFolder || "";
      if (cwd && Object.keys(ckpt.files).length > 0) {
        // 1. Get current file list
        const currentFiles = await invoke<string[]>("scan_folder", { path: cwd });
        const currentTextFiles = currentFiles.filter(f => !f.endsWith("/") && isValidTextFile(f));
        const checkpointPaths = new Set(Object.keys(ckpt.files));

        // 2. Move to trash: files that exist now but were NOT in checkpoint (created after checkpoint)
        for (const f of currentTextFiles) {
          if (!checkpointPaths.has(f)) {
            try { await invoke("fs_remove", { path: f }); } catch {}
          }
        }

        // 3. Write back all snapshotted files (create or overwrite)
        for (const [filePath, content] of Object.entries(ckpt.files)) {
          try { await invoke("write_text_file", { path: filePath, content }); } catch {}
        }
      }

      // 4. Restore messages
      const restored: Message[] = [
        ...ckpt.messages,
        { role: "compact" as const, content: `__restored:${ckpt.label}` }
      ];
      setMessages(restored);
      localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(restored));
      setShowCheckpointPanel(false);
      setConfirmRestoreId(null);
      onStatus("", "");
    } catch (e) {
      console.error("Restore failed:", e);
      onStatus("Restore failed", "");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteCheckpoint = (id: string) => {
    const updated = checkpoints.filter(c => c.id !== id);
    saveCheckpoints(updated);
  };

  const handleRenameCheckpoint = (id: string, label: string) => {
    const updated = checkpoints.map(c => c.id === id ? { ...c, label } : c);
    saveCheckpoints(updated);
    setEditingCheckpointId(null);
  };

  const handleCompact = async () => {
    const realMessages = messages.filter(m => m.role !== "compact");
    if (realMessages.length < 2 || isCompacting || isLoading) return;
    setIsCompacting(true);
    onStatus("Compacting context...", "");
    const apiKey = settings.claudeApiKey || "";
    try {
      const summary = await invoke<string>("call_claude_api", {
        apiKey,
        model: localModel || settings.claudeModel || "claude-sonnet-4-6",
        messages: [
          ...realMessages,
          { role: "user", content: "Summarize the conversation above into a concise context block (max 400 words). Include: key decisions, important code/file paths, current goal, and any pending items. Write in third person as a context handoff." }
        ],
        system: null,
        permissionMode: "default",
        effortLevel: "low",
        cwd: settings.claudeFolder || "",
        extraDirs: []
      });
      const compacted: Message[] = [
        { role: "compact", content: "" },
        { role: "user", content: `[Context Summary]\n${summary.trim()}` },
      ];
      setMessages(compacted);
      localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(compacted));
      onStatus("", "");
    } catch (e) {
      console.error(e);
      onStatus("Failed to compact context", "");
    } finally {
      setIsCompacting(false);
    }
  };

  const detectsPermissionRequest = (text: string) =>
    /need.*permission|permission.*dialog|approve.*permission|cần quyền|quyền ghi|quyền.*file|I need.*approve|Approve.*permission/i.test(text);

  const handleGrantPermission = async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (!lastUserMsg) return;
    setNeedsPermission(false);
    // Remove last assistant message (the permission request) and re-run
    const withoutLastAssistant = messages.slice(0, messages.map(m => m.role).lastIndexOf("assistant"));
    setMessages(withoutLastAssistant);
    setIsLoading(true);
    onStatus("Claude is thinking...", "");
    try {
      const backendMessages = withoutLastAssistant
        .filter(m => m.role !== "compact")
        .map(m => ({ role: m.role, content: m.cliContent ?? m.content }));
      const modeOption = MODE_OPTIONS.find(o => o.id === selectedMode);
      const response = await invoke<string>("call_claude_api", {
        apiKey: settings.claudeApiKey || "",
        model: localModel || settings.claudeModel || "claude-sonnet-4-6",
        messages: backendMessages,
        system: null,
        permissionMode: modeOption?.cliValue || "auto",
        effortLevel: selectedEffort,
        cwd: settings.claudeFolder || "",
        extraDirs: [],
        skipPermissions: true,
      });
      const updated = [...withoutLastAssistant, { role: "assistant" as const, content: response }];
      setMessages(updated);
      localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(updated));
      setNeedsPermission(detectsPermissionRequest(response));
      onStatus("", "");
    } catch (e) {
      const updated = [...withoutLastAssistant, { role: "assistant" as const, content: `Error: ${e}` }];
      setMessages(updated);
      localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(updated));
      onStatus("Error talking to Claude", "");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const apiKey = settings.claudeApiKey || "";

    // Save image attachments to temp files so Claude CLI can read them
    const processedAttachments = await Promise.all(attachments.map(async a => {
      if (a.previewUrl) {
        try {
          const tempPath = await invoke<string>("save_temp_image", { dataUrl: a.previewUrl });
          return { ...a, tempPath };
        } catch (e) {
          console.error("Failed to save temp image:", e);
          return { ...a, tempPath: null as string | null };
        }
      }
      return { ...a, tempPath: null as string | null };
    }));

    // CLI content includes image file paths and file contents
    const cliAttachmentText = processedAttachments.length > 0
      ? processedAttachments.map(a =>
          a.tempPath
            ? `[Image file saved at: ${a.tempPath} — use the Read tool to view it]`
            : a.previewUrl
              ? `[Attached image: ${a.name} — could not save to disk]`
              : a.name.startsWith("http")
                ? a.content
                : `[File: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``
        ).join("\n\n") + "\n\n"
      : "";

    // Display content: only non-image file/url attachments as text
    const displayAttachmentText = processedAttachments.length > 0
      ? processedAttachments
          .filter(a => !a.previewUrl)
          .map(a => a.name.startsWith("http") ? a.content : `[File: ${a.name}]`)
          .join("\n") + (processedAttachments.some(a => !a.previewUrl) ? "\n" : "")
      : "";

    const imagePreviews = processedAttachments
      .filter(a => a.previewUrl)
      .map(a => a.previewUrl as string);

    const displayContent = displayAttachmentText + input.trim();
    const cliContent = cliAttachmentText + input.trim();

    const userMessage: Message = {
      role: "user",
      content: displayContent,
      cliContent: cliContent !== displayContent ? cliContent : undefined,
      imagePreviews: imagePreviews.length > 0 ? imagePreviews : undefined,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setAttachments([]);
    setShowBrowseInput(false);

    // Auto-checkpoint before each send (Copilot style) — fire and forget, no UI block
    const msgPreview = userMessage.content.trim().slice(0, 32) + (userMessage.content.trim().length > 32 ? "…" : "");
    const autoLabel = `Auto · ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — "${msgPreview}"`;
    const snapshotAtSend = [...messages]; // state before user message
    buildCheckpoint(snapshotAtSend, autoLabel).then(newCkpt => {
      setCheckpoints(prev => {
        const updated = [newCkpt, ...prev].slice(0, MAX_CHECKPOINTS);
        try { localStorage.setItem(`claude_checkpoints_${tab.path}`, JSON.stringify(updated)); } catch {}
        return updated;
      });
    }).catch(() => {});

    setIsLoading(true);
    onStatus("Claude is thinking...", "");

    // Save user message immediately to local storage
    localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(newMessages));

    // Update Session Title in list on the first message
    if (newMessages.filter(m => m.role === "user").length === 1) {
      try {
        const rawSessions = localStorage.getItem(SESSIONS_KEY);
        if (rawSessions) {
          const sessions = JSON.parse(rawSessions);
          if (Array.isArray(sessions)) {
            const title = userMessage.content.length > 30 
              ? userMessage.content.slice(0, 30) + "..." 
              : userMessage.content;
            
            const updated = sessions.map((s: any) => 
              s.id === tab.path 
                ? { ...s, title, timestamp: Date.now() } 
                : s
            );
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
            window.dispatchEvent(new Event("claude-sessions-updated"));
          }
        }
      } catch (e) {
        console.error("Failed to update session title", e);
      }
    }

    try {
      const backendMessages = newMessages
        .filter(m => m.role !== "compact")
        .map(m => ({ role: m.role, content: m.cliContent ?? m.content }));

      const systemPrompt = 
        "You are an AI assistant integrated into 'Report Helper', a desktop reporting tool. " +
        "You help developers write SQL queries, design database schemas, and debug SSRS (RDL) report structures. " +
        "Keep answers concise and focus on practical SQL and database advice.";

      const modeOption = MODE_OPTIONS.find(o => o.id === selectedMode);

      const response = await invoke<string>("call_claude_api", {
        apiKey,
        model: localModel || settings.claudeModel || "claude-sonnet-4-6",
        messages: backendMessages,
        system: systemPrompt,
        permissionMode: modeOption?.cliValue || "auto",
        effortLevel: selectedEffort,
        cwd: settings.claudeFolder || "",
        extraDirs: []
      });

      const updatedMessages = [...newMessages, { role: "assistant" as const, content: response }];
      setMessages(updatedMessages);
      localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(updatedMessages));
      setNeedsPermission(detectsPermissionRequest(response));
      onStatus("", "");
    } catch (e) {
      console.error(e);
      const updatedMessages = [...newMessages, { role: "assistant" as const, content: `Error: ${e}` }];
      setMessages(updatedMessages);
      localStorage.setItem(`claude_messages_${tab.path}`, JSON.stringify(updatedMessages));
      onStatus("Error talking to Claude", "");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAtSelectedIdx(i => Math.min(i + 1, atSuggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAtSelectedIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); handleAtSelect(atSuggestions[atSelectedIdx]); return; }
      if (e.key === "Escape") { setAtQuery(null); setAtSuggestions([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getActiveModeOption = () => {
    return MODE_OPTIONS.find(o => o.id === selectedMode) || MODE_OPTIONS[3];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#fcfcfc", position: "relative", width: "100%" }}>

      {/* Toolbar */}
      {(messages.length > 0 || checkpoints.length > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px", borderBottom: "1px solid #f0f0f0", background: "#fafafa", flexShrink: 0 }}>
          {/* Left: Checkpoint controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              ref={checkpointBtnRef}
              onClick={() => setShowCheckpointPanel(v => !v)}
              title={`${checkpoints.length} checkpoint(s) — click to view`}
              style={{ display: "flex", alignItems: "center", gap: 4, background: showCheckpointPanel ? "#e8f0fe" : "none", border: showCheckpointPanel ? "1px solid #b3c8f5" : "1px solid transparent", cursor: "pointer", color: checkpoints.length > 0 ? "#007acc" : "#bbb", fontSize: 11, padding: "2px 7px", borderRadius: 4, transition: "all 0.15s" }}
              onMouseEnter={e => { if (!showCheckpointPanel) { e.currentTarget.style.color = "#007acc"; e.currentTarget.style.background = "#f0f7ff"; } }}
              onMouseLeave={e => { if (!showCheckpointPanel) { e.currentTarget.style.color = checkpoints.length > 0 ? "#007acc" : "#bbb"; e.currentTarget.style.background = "none"; } }}
            >
              <span className="codicon codicon-milestone" style={{ fontSize: 12 }} />
              {checkpoints.length > 0 ? `${checkpoints.length} checkpoint${checkpoints.length > 1 ? "s" : ""}` : "Checkpoints"}
            </button>
            {messages.length > 0 && (
              <button
                onClick={handleCreateCheckpoint}
                disabled={isSavingCheckpoint}
                title="Save checkpoint of current conversation"
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px solid transparent", cursor: isSavingCheckpoint ? "default" : "pointer", color: isSavingCheckpoint ? "#007acc" : "#888", fontSize: 11, padding: "2px 7px", borderRadius: 4, transition: "all 0.15s" }}
                onMouseEnter={e => { if (!isSavingCheckpoint) { e.currentTarget.style.color = "#007acc"; e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#b3d1f0"; } }}
                onMouseLeave={e => { if (!isSavingCheckpoint) { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; } }}
              >
                <span className={`codicon ${isSavingCheckpoint ? "codicon-loading codicon-modifier-spin" : "codicon-save"}`} style={{ fontSize: 12 }} />
                {isSavingCheckpoint ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          {/* Right: Clear */}
          {messages.length > 0 && (
            <button
              onClick={handleClearConversation}
              title="Clear conversation"
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 11, padding: "2px 6px", borderRadius: 4 }}
              onMouseEnter={e => { e.currentTarget.style.color = "#e81123"; e.currentTarget.style.background = "#fff1f0"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "none"; }}
            >
              <span className="codicon codicon-trash" style={{ fontSize: 12 }} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Checkpoint Panel */}
      {showCheckpointPanel && (
        <div
          ref={checkpointPanelRef}
          style={{ position: "absolute", top: 40, left: 16, right: 16, maxWidth: 520, background: "#fff", border: "1px solid #d4d4d4", borderRadius: 8, boxShadow: "0 10px 24px -4px rgba(0,0,0,0.14)", zIndex: 300, overflow: "hidden" }}
        >
          {/* Panel Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", fontSize: 11, color: "#888", fontWeight: 600, background: "#f5f5f5", borderBottom: "1px solid #ebebeb" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="codicon codicon-milestone" style={{ fontSize: 12, color: "#007acc" }} />
              CHECKPOINTS
              <span style={{ fontWeight: 400, color: "#bbb", fontSize: 10 }}>({checkpoints.length}/{MAX_CHECKPOINTS})</span>
            </span>
            {messages.length > 0 && (
              <button
                onClick={handleCreateCheckpoint}
                disabled={isSavingCheckpoint}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", background: isSavingCheckpoint ? "#5ca8d0" : "#007acc", color: "#fff", border: "none", borderRadius: 4, cursor: isSavingCheckpoint ? "default" : "pointer", fontWeight: 500 }}
                onMouseEnter={e => { if (!isSavingCheckpoint) e.currentTarget.style.background = "#005f99"; }}
                onMouseLeave={e => { if (!isSavingCheckpoint) e.currentTarget.style.background = "#007acc"; }}
              >
                <span className={`codicon ${isSavingCheckpoint ? "codicon-loading codicon-modifier-spin" : "codicon-save"}`} style={{ fontSize: 11 }} />
                {isSavingCheckpoint ? "Saving…" : "Save now"}
              </button>
            )}
          </div>

          {/* Panel Body */}
          {checkpoints.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "#bbb", fontSize: 12 }}>
              <span className="codicon codicon-milestone" style={{ fontSize: 28, display: "block", marginBottom: 10, opacity: 0.35 }} />
              No checkpoints yet.<br />
              <span style={{ color: "#ccc" }}>Click <strong style={{ color: "#007acc" }}>Save</strong> to capture the current conversation state.</span>
            </div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {checkpoints.map((ckpt, i) => (
                <div
                  key={ckpt.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: i < checkpoints.length - 1 ? "1px solid #f3f3f3" : "none", background: "#fff" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafbfc"}
                  onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                >
                  <span className="codicon codicon-circle-filled" style={{ fontSize: 7, color: "#007acc", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: "#bbb", marginBottom: 2 }}>
                      {new Date(ckpt.timestamp).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      {" · "}{ckpt.messages.filter(m => m.role !== "compact").length} messages
                      {Object.keys(ckpt.files ?? {}).length > 0 && ` · ${Object.keys(ckpt.files).length} files`}
                    </div>
                    {editingCheckpointId === ckpt.id ? (
                      <input
                        value={editingLabel}
                        onChange={e => setEditingLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameCheckpoint(ckpt.id, editingLabel.trim() || ckpt.label);
                          if (e.key === "Escape") setEditingCheckpointId(null);
                        }}
                        onBlur={() => handleRenameCheckpoint(ckpt.id, editingLabel.trim() || ckpt.label)}
                        autoFocus
                        style={{ fontSize: 12, padding: "2px 6px", border: "1px solid #007acc", borderRadius: 4, outline: "none", width: "100%", boxSizing: "border-box" }}
                      />
                    ) : (
                      <div
                        onClick={() => { setEditingCheckpointId(ckpt.id); setEditingLabel(ckpt.label); }}
                        title="Click to rename"
                        style={{ fontSize: 12, color: "#333", fontWeight: 500, cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {ckpt.label}
                      </div>
                    )}
                  </div>
                  {confirmRestoreId === ckpt.id ? (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                      <button
                        onClick={() => handleConfirmRestore(ckpt)}
                        disabled={isRestoring}
                        style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 9px", background: "#e0573e", color: "#fff", border: "none", borderRadius: 4, cursor: isRestoring ? "default" : "pointer", fontWeight: 600, flexShrink: 0 }}
                      >
                        <span className={`codicon ${isRestoring ? "codicon-loading codicon-modifier-spin" : "codicon-check"}`} style={{ fontSize: 11 }} />
                        {isRestoring ? "Restoring…" : `Confirm${Object.keys(ckpt.files ?? {}).length > 0 ? ` (${Object.keys(ckpt.files).length} files)` : ""}`}
                      </button>
                      <button
                        onClick={() => setConfirmRestoreId(null)}
                        disabled={isRestoring}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, background: "none", border: "1px solid #e0e0e0", borderRadius: 4, cursor: "pointer", color: "#888", flexShrink: 0 }}
                      >
                        <span className="codicon codicon-close" style={{ fontSize: 11 }} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRestoreCheckpoint(ckpt)}
                      title={`Restore to this checkpoint${Object.keys(ckpt.files ?? {}).length > 0 ? ` · ${Object.keys(ckpt.files).length} files will be restored` : ""}`}
                      style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "3px 9px", background: "#f0f7ff", color: "#007acc", border: "1px solid #b3d1f0", borderRadius: 4, cursor: "pointer", flexShrink: 0, fontWeight: 500 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#d0e8ff"; e.currentTarget.style.borderColor = "#7ab8f5"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#f0f7ff"; e.currentTarget.style.borderColor = "#b3d1f0"; }}
                    >
                      <span className="codicon codicon-history" style={{ fontSize: 11 }} />
                      Restore
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteCheckpoint(ckpt.id)}
                    title="Delete this checkpoint"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, background: "none", border: "none", cursor: "pointer", color: "#ccc", borderRadius: 4, flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#e81123"; e.currentTarget.style.background = "#fff1f0"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#ccc"; e.currentTarget.style.background = "none"; }}
                  >
                    <span className="codicon codicon-trash" style={{ fontSize: 12 }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message List Area */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", padding: "24px" }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "16px", userSelect: "none" }}>
            {/* Brand header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <svg viewBox="0 0 16 16" width="28" height="28" fill="#e0573e">
                <path d="M7.487.051a.6.6 0 0 1 1.026 0l1.83 3.094a.6.6 0 0 0 .428.258l3.528.802a.6.6 0 0 1 .436.937L12.3 7.828a.6.6 0 0 0-.147.458l.422 3.565a.6.6 0 0 1-.83.6l-3.21-1.464a.6.6 0 0 0-.47 0l-3.21 1.464a.6.6 0 0 1-.83-.6l.422-3.565a.6.6 0 0 0-.147-.458L2.3 5.142a.6.6 0 0 1 .436-.937l3.528-.802a.6.6 0 0 0 .428-.258l1.83-3.094Z"/>
              </svg>
              <span style={{ fontSize: 22, fontWeight: 300, color: "#333" }}>Claude Code</span>
            </div>
            {/* Pixel Invader */}
            <svg viewBox="0 0 11 8" style={{ width: 44, height: 32, fill: "#e0573e", marginBottom: 12 }}>
              <path d="M3 0h1v1H3zm5 0h1v1H8zm-5 1h1v1H3zm5 0h1v1H8zm-6 1h9v1H2zm0 1h2v1H2zm3 0h1v1H5zm2 0h2v1H7zm-7 1h11v1H0zm0 1h1v1H0zm2 0h7v1H2zm8 0h1v1H10zm-9 1h1v1H1zm8 0h1v1H9z" />
            </svg>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "#666", marginBottom: 20 }}>
              // TODO: Everything. Let's start.
            </div>

            {/* Auto Mode Enabled Card */}
            {selectedMode === "auto" && showAutoModeCard && (
              <div 
                style={{
                  textAlign: "left",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e5e5e5",
                  backgroundColor: "#fff",
                  position: "relative",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  maxWidth: 280,
                  fontSize: 12,
                  color: "#333"
                }}
              >
                <button 
                  onClick={() => setShowAutoModeCard(false)}
                  style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", color: "#999" }}
                >
                  <span className="codicon codicon-close" style={{ fontSize: 12 }} />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", marginBottom: "6px", color: "#333" }}>
                  <span className="codicon codicon-zap" style={{ color: "#e0573e", fontSize: 12 }} />
                  Auto mode is enabled
                </div>
                <div style={{ color: "#666", lineHeight: 1.4 }}>
                  Auto mode lets Claude handle permission prompts automatically. Claude checks each tool call for risky actions and prompt injection before executing, runs the ones it assesses as lower-risk, and blocks the rest. <a href="#" style={{ color: "#007acc", textDecoration: "none" }}>Learn more</a>
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((m, idx) => {
            if (m.role === "compact") {
              const isRestored = m.content.startsWith("__restored:");
              const restoredLabel = isRestored ? m.content.replace("__restored:", "") : "";
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, color: isRestored ? "#007acc" : "#aaa", fontSize: 11, userSelect: "none", padding: "4px 0" }}>
                  <div style={{ flex: 1, height: 1, background: isRestored ? "#b3d1f0" : "#e8e8e8" }} />
                  <span className={`codicon ${isRestored ? "codicon-history" : "codicon-fold"}`} style={{ fontSize: 11 }} />
                  <span>{isRestored ? `↩ Restored to "${restoredLabel}"` : "Context compacted"}</span>
                  <div style={{ flex: 1, height: 1, background: isRestored ? "#b3d1f0" : "#e8e8e8" }} />
                </div>
              );
            }
            return (
              <div
                key={idx}
                className="selectable-text"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  maxWidth: "80%",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  userSelect: "text",
                  WebkitUserSelect: "text",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  backgroundColor: m.role === "user" ? "#007acc" : "#fff",
                  color: m.role === "user" ? "#fff" : "#333",
                  border: m.role === "user" ? "none" : "1px solid #e5e5e5"
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4, fontWeight: "bold" }}>
                  {m.role === "user" ? "You" : "Claude"}
                </div>
                {m.imagePreviews && m.imagePreviews.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: m.content ? 8 : 0 }}>
                    {m.imagePreviews.map((src, i) => (
                      <img key={i} src={src} alt="attachment" style={{ maxHeight: 180, maxWidth: 280, borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", display: "block" }} />
                    ))}
                  </div>
                )}
                {m.role === "assistant" ? (
                  <MarkdownRenderer content={m.content} />
                ) : (
                  m.content ? <div>{m.content}</div> : null
                )}
              </div>
            );
          })
        )}
        {needsPermission && !isLoading && (
          <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12 }}>
            <span className="codicon codicon-lock" style={{ fontSize: 14, color: "#d97706", flexShrink: 0 }} />
            <span style={{ flex: 1, color: "#92400e" }}>Claude needs permission to write files. Grant access to continue.</span>
            <button
              onClick={handleGrantPermission}
              style={{ padding: "4px 12px", background: "#d97706", color: "#fff", border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.background = "#b45309"}
              onMouseLeave={e => e.currentTarget.style.background = "#d97706"}
            >
              Grant & Retry
            </button>
            <button
              onClick={() => setNeedsPermission(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#999", padding: 2, flexShrink: 0 }}
            >
              <span className="codicon codicon-close" style={{ fontSize: 12 }} />
            </button>
          </div>
        )}

        {isLoading && (
          <div style={{
            backgroundColor: "#fff",
            color: "#333",
            border: "1px solid #e5e5e5",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "13px",
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            maxWidth: "80%",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}>
            <div className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 14 }} />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* @ Suggestions Dropdown */}
      {atQuery !== null && atQuery.length > 0 && (
        <div
          ref={atDropdownRef}
          style={{ position: "absolute", bottom: 80, left: 24, right: 24, maxWidth: 360, background: "#fff", border: "1px solid #d4d4d4", borderRadius: 8, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", padding: 4, zIndex: 200 }}
        >
          {atSuggestions.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "#999" }}>No files found for "@{atQuery}"</div>
          ) : atSuggestions.map((filePath, idx) => {
            const name = filePath.split(/[\\/]/).pop() || filePath;
            const dir = filePath.replace(/[\\/][^\\/]+$/, "").split(/[\\/]/).pop() || "";
            return (
              <button
                key={filePath}
                onClick={() => handleAtSelect(filePath)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", background: idx === atSelectedIdx ? "#f0f7ff" : "none", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={() => setAtSelectedIdx(idx)}
              >
                <span className="codicon codicon-file" style={{ fontSize: 13, color: "#007acc", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#333", fontWeight: 500 }}>{name}</span>
                {dir && <span style={{ fontSize: 11, color: "#999", marginLeft: "auto" }}>{dir}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Model Settings Panel */}
      {showModelPanel && (
        <div
          ref={modelPanelRef}
          style={{ position: "absolute", bottom: 80, left: 16, right: 16, maxWidth: 768, margin: "0 auto", background: "#fff", border: "1px solid #d4d4d4", borderRadius: 8, boxShadow: "0 10px 20px -4px rgba(0,0,0,0.12)", zIndex: 200, overflow: "hidden" }}
        >
          {/* Header */}
          <div style={{ padding: "6px 12px", fontSize: 11, color: "#888", fontWeight: 600, background: "#f5f5f5", borderBottom: "1px solid #ebebeb" }}>
            Model
          </div>

          {/* Switch model row */}
          <div
            onClick={() => setShowModelPicker(v => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
            onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 13, color: "#333" }}>Switch model...</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#888" }}>
                {localModel === "" ? "Default" : getModelShortName(localModel)}
              </span>
              <span className={`codicon codicon-chevron-${showModelPicker ? "up" : "down"}`} style={{ fontSize: 11, color: "#aaa" }} />
            </div>
          </div>

          {/* Model picker */}
          {showModelPicker && (
            <div style={{ borderBottom: "1px solid #f0f0f0", background: "#fff" }}>
              <div style={{ padding: "6px 14px 4px", fontSize: 11, color: "#999", fontWeight: 500 }}>Select a model</div>
              {PRESET_MODELS.map(m => {
                const active = localModel === m.id || (!localModel && m.id === "");
                return (
                  <div
                    key={m.id}
                    onClick={() => { if (!m.disabled) { setLocalModel(m.id); setShowModelPicker(false); } }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", cursor: m.disabled ? "default" : "pointer", opacity: m.disabled ? 0.5 : 1, background: active ? "#f0f7ff" : "transparent" }}
                    onMouseEnter={e => { if (!m.disabled && !active) e.currentTarget.style.background = "#f9f9f9"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                        {m.subtitle && <span>{m.subtitle} · </span>}{m.description}
                      </div>
                    </div>
                    {active && <span className="codicon codicon-check" style={{ fontSize: 13, color: "#007acc", flexShrink: 0, marginLeft: 8 }} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Effort row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: 13, color: "#333" }}>Effort</span>
            <EffortSlider value={selectedEffort} onChange={setSelectedEffort} />
          </div>

          {/* Thinking row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: 13, color: "#333" }}>Thinking</span>
            <Toggle on={thinkingEnabled} onChange={setThinkingEnabled} />
          </div>

          {/* Auto switch row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: autoSwitchModel ? "#fafafa" : "transparent" }}>
            <span style={{ fontSize: 13, color: "#333" }}>Switch models when a message is flagged</span>
            <Toggle on={autoSwitchModel} onChange={setAutoSwitchModel} />
          </div>
        </div>
      )}

      {/* Attach Menu Dropdown */}
      {showAttachMenu && (
        <div
          ref={attachDropdownRef}
          style={{ position: "absolute", bottom: 80, left: 24, background: "#fff", border: "1px solid #d4d4d4", borderRadius: 8, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)", padding: 4, minWidth: 210, zIndex: 200 }}
        >
          <button
            onClick={() => handleAttachFile("upload")}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#333", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f0f0", borderRadius: 6, flexShrink: 0 }}>
              <span className="codicon codicon-cloud-upload" style={{ fontSize: 14, color: "#555" }} />
            </div>
            <span>Upload from computer</span>
          </button>
          <button
            onClick={() => handleAttachFile("context")}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#333", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f0f0", borderRadius: 6, flexShrink: 0 }}>
              <span className="codicon codicon-file-add" style={{ fontSize: 14, color: "#555" }} />
            </div>
            <span>Add context</span>
          </button>
          <button
            onClick={() => { setShowAttachMenu(false); setShowBrowseInput(true); }}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#333", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f0f0", borderRadius: 6, flexShrink: 0 }}>
              <span className="codicon codicon-globe" style={{ fontSize: 14, color: "#555" }} />
            </div>
            <span>Browse the web</span>
          </button>
        </div>
      )}

      {/* Modes Dropdown Menu */}
      {showModesMenu && (
        <div 
          ref={dropdownRef}
          style={{
            position: "absolute",
            border: "1px solid #d4d4d4",
            backgroundColor: "#fff",
            borderRadius: "8px",
            padding: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            bottom: 80,
            right: 24,
            width: 280,
            zIndex: 100
          }}
        >
          {/* Menu Title */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 8px",
            borderBottom: "1px solid #f0f0f0",
            paddingBottom: "6px",
            marginBottom: "4px"
          }}>
            <span style={{ fontSize: 11, fontWeight: "bold", color: "#666" }}>Modes</span>
            <span style={{ fontSize: 9, color: "#999", fontFamily: "monospace" }}>⇧ + tab to switch</span>
          </div>

          {/* Menu Items */}
          {MODE_OPTIONS.map((opt) => {
            const isSelected = selectedMode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setSelectedMode(opt.id);
                  setShowModesMenu(false);
                }}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  textAlign: "left",
                  padding: "10px",
                  borderRadius: "6px",
                  background: isSelected ? "#f5f5f5" : hoveredModeOptionId === opt.id ? "#fafafa" : "none",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  transition: "all 0.2s"
                }}
                onMouseEnter={() => setHoveredModeOptionId(opt.id)}
                onMouseLeave={() => setHoveredModeOptionId(null)}
              >
                {/* Icon */}
                <div style={{ marginTop: 2 }}>
                  <span className={`codicon ${opt.icon}`} style={{ fontSize: 14, color: isSelected ? "#e0573e" : "#666" }} />
                </div>
                {/* Text Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: isSelected ? "bold" : "normal", color: "#333" }}>{opt.title}</div>
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2, lineHeight: 1.3 }}>{opt.description}</div>
                </div>
                {/* Checkmark */}
                {isSelected && (
                  <div style={{ alignSelf: "center" }}>
                    <span className="codicon codicon-check" style={{ fontSize: 12, color: "#333", fontWeight: "bold" }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat Prompt Box (Wide layout aligned at the bottom) */}
      <div style={{ padding: "16px", backgroundColor: "#fff", borderTop: "1px solid #e5e5e5" }}>
        <div 
          style={{ 
            display: "flex",
            flexDirection: "column",
            border: "1px solid",
            borderColor: isFocused ? "#e0573e" : "#d4d4d4",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: isFocused ? "0 0 0 1px #e0573e" : "none",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            maxWidth: "800px",
            margin: "0 auto"
          }}
        >
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px 0 12px" }}>
              {attachments.map((att, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: att.previewUrl ? "transparent" : "#f0f7ff", border: att.previewUrl ? "none" : "1px solid #b3d1f0", borderRadius: att.previewUrl ? 6 : 12, padding: att.previewUrl ? 0 : "2px 8px", fontSize: 11, maxWidth: 220, position: "relative" }}>
                  {att.previewUrl ? (
                    <>
                      <img src={att.previewUrl} alt={att.name} style={{ maxHeight: 60, maxWidth: 120, borderRadius: 6, border: "1px solid #e0e0e0", display: "block" }} />
                      <button onClick={() => handleRemoveAttachment(i)} style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, background: "#555", border: "none", borderRadius: "50%", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="codicon codicon-close" style={{ fontSize: 9 }} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={att.name.startsWith("http") ? "codicon codicon-globe" : "codicon codicon-file"} style={{ fontSize: 11, color: "#007acc", flexShrink: 0 }} />
                      <span style={{ color: "#007acc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.name}>{att.name}</span>
                      <button onClick={() => handleRemoveAttachment(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 0, display: "flex", alignItems: "center", flexShrink: 0 }}>
                        <span className="codicon codicon-close" style={{ fontSize: 10 }} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Browse the web URL input */}
          {showBrowseInput && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px 0 12px" }}>
              <span className="codicon codicon-globe" style={{ fontSize: 13, color: "#666" }} />
              <input
                type="text"
                value={browseUrl}
                onChange={e => setBrowseUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleBrowseUrlSubmit(); if (e.key === "Escape") { setShowBrowseInput(false); setBrowseUrl(""); } }}
                placeholder="Paste a URL and press Enter..."
                autoFocus
                style={{ flex: 1, fontSize: 12, padding: "4px 8px", border: "1px solid #d4d4d4", borderRadius: 4, outline: "none" }}
              />
              <button onClick={handleBrowseUrlSubmit} style={{ fontSize: 11, padding: "3px 8px", background: "#007acc", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Add</button>
              <button onClick={() => { setShowBrowseInput(false); setBrowseUrl(""); }} style={{ fontSize: 11, padding: "3px 6px", background: "none", border: "1px solid #d4d4d4", borderRadius: 4, cursor: "pointer", color: "#666" }}>Cancel</button>
            </div>
          )}

          {/* Text Input Row - side-by-side because it's wide! */}
          <div style={{ display: "flex", alignItems: "center", padding: "6px 8px", gap: "8px" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="ctrl esc to focus or unfocus Claude"
              rows={1}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                fontSize: 13,
                resize: "none",
                outline: "none",
                color: "#333",
                padding: "4px",
                maxHeight: "200px",
                overflowY: "auto"
              }}
            />
            <button
              title="Voice Input"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 4 }}
            >
              <span className="codicon codicon-mic" style={{ fontSize: 16 }} />
            </button>
          </div>

          {/* Controls Row */}
          <div 
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              backgroundColor: "#fafafa",
              borderTop: "1px solid #f0f0f0"
            }}
          >
            {/* Left Tools */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                ref={attachBtnRef}
                onClick={() => setShowAttachMenu(v => !v)}
                title="Add attachment"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: showAttachMenu ? "#f0f0f0" : "none", border: "1px solid", borderColor: showAttachMenu ? "#d4d4d4" : "transparent", borderRadius: 4, cursor: "pointer", color: "#666" }}
              >
                <span className="codicon codicon-add" style={{ fontSize: 15 }} />
              </button>

              {(contextPct >= 15 || isCompacting) && (
                <button
                  onClick={handleCompact}
                  disabled={isCompacting || isLoading}
                  title={`${100 - contextPct}% of context remaining until auto-compact. Click to compact now.`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "none", border: "1px solid transparent", borderRadius: 4, cursor: isCompacting || isLoading ? "default" : "pointer", color: isCompacting ? "#e0573e" : contextPct >= 80 ? "#e0573e" : contextPct >= 50 ? "#f59e0b" : "#666" }}
                >
                  <span className={`codicon ${isCompacting ? "codicon-loading codicon-modifier-spin" : "codicon-sync"}`} style={{ fontSize: 14 }} />
                </button>
              )}

<button
                ref={modelBtnRef}
                onClick={() => { setShowModelPanel(v => !v); setShowModelPicker(false); }}
                title="Model settings"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: showModelPanel ? "#f0f0f0" : "none", border: "1px solid", borderColor: showModelPanel ? "#d4d4d4" : "transparent", borderRadius: 4, cursor: "pointer", color: "#666" }}
              >
                <span className="codicon codicon-circuit-board" style={{ fontSize: 14 }} />
              </button>
            </div>

            {/* Right Tools */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Modes Selection Toggle Button */}
              <button
                onClick={() => setShowModesMenu(!showModesMenu)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 500,
                  background: getActiveModeOption().id === "auto" ? "#e0573e1a" : "#f0f0f0",
                  border: getActiveModeOption().id === "auto" ? "1px solid #e0573e33" : "1px solid #e0e0e0",
                  color: getActiveModeOption().id === "auto" ? "#e0573e" : "#333",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <span className={`codicon ${getActiveModeOption().icon}`} style={{ fontSize: 11 }} />
                {getActiveModeOption().title}
              </button>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                style={{
                  background: isLoading || (!input.trim() && attachments.length === 0) ? "#f8e2de" : "#e0573e",
                  color: isLoading || (!input.trim() && attachments.length === 0) ? "#e0573e" : "#fff",
                  border: "none",
                  borderRadius: "4px",
                  width: 26,
                  height: 26,
                  cursor: isLoading || !input.trim() ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s"
                }}
              >
                <span className="codicon codicon-arrow-up" style={{ fontSize: 13, fontWeight: "bold" }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Context usage bar */}
      {contextPct >= 20 && (
        <div
          onClick={!isCompacting && !isLoading ? handleCompact : undefined}
          title={`${100 - contextPct}% of context remaining until auto-compact. Click to compact now.`}
          style={{
            padding: "5px 16px",
            fontSize: 11,
            textAlign: "center",
            cursor: isCompacting || isLoading ? "default" : "pointer",
            userSelect: "none",
            color: contextPct >= 80 ? "#e0573e" : contextPct >= 50 ? "#d97706" : "#888",
            background: contextPct >= 80 ? "#fef2f0" : contextPct >= 50 ? "#fffbeb" : "#fafafa",
            borderTop: `1px solid ${contextPct >= 80 ? "#fecaca" : contextPct >= 50 ? "#fde68a" : "#f0f0f0"}`,
          }}
        >
          {contextPct}% context used — click to compact
        </div>
      )}
    </div>
  );
}
