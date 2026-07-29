"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Send, Sparkles, Users, Trash2, AlertCircle, Loader2, Search, Plus,
  Copy, Pencil, Pin, PinOff, MoreVertical, Check, X, MessageSquare, UserRound,
  Forward, Reply, Paperclip, FileText, Download, LogOut, UserPlus, ChevronRight,
} from "lucide-react";

type Selection = { kind: "ai" } | { kind: "conv"; id: string };

type Member = { accId: string; name: string; department: string | null };

type Conversation = {
  id: string;
  kind: "dm" | "group";
  name: string | null;
  members: Member[];
  last_message: { body: string; createdAt: string; senderName: string; deleted: boolean } | null;
};

type DirectoryUser = {
  acc_id: string;
  name: string;
  department: string | null;
  job_title: string | null;
  email: string;
  isMe: boolean;
};

type ChatMessage = {
  id: string;
  conversation_id: string | null;
  acc_id: string | null;
  sender_name: string;
  role: "user" | "assistant";
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  is_forwarded?: boolean;
  forwarded_from?: string | null;
  reply_to?: string | null;
  reply_sender?: string | null;
  /** null when the quoted message was deleted */
  reply_body?: string | null;
  reply_attachment_name?: string | null;
  reply_attachment_mime?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  mine: boolean;
};

function isImageMime(mime?: string | null) {
  return Boolean(mime && mime.startsWith("image/"));
}

function formatBytes(n?: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Menu anchored at viewport coords — works for both right-click and the ⋮ button. */
type MenuState = { msg: ChatMessage; x: number; y: number } | null;

const POLL_MS = 4000;
/** Horizontal drag distance (px) that arms reply-on-release. */
const REPLY_THRESHOLD = 64;
const MENU_W = 172;
const MENU_H = 250;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/** Title/subtitle for a conversation, resolving DM names against the other member. */
function convTitle(c: Conversation, myAccId: string) {
  if (c.kind === "group") return c.name ?? "Group";
  const other = c.members.find((m) => String(m.accId) !== String(myAccId));
  return other?.name ?? "Direct message";
}

function AssistantBody({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1.5" />;
        const bullet = /^[-*•]\s+/.test(trimmed);
        const content = bullet ? trimmed.replace(/^[-*•]\s+/, "") : trimmed;
        const parts = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        const rendered = parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={j} className="font-bold">{p.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{p}</span>
          )
        );
        return bullet ? (
          <div key={i} className="flex gap-2 pl-0.5">
            <span className="text-emerald-500 shrink-0 leading-relaxed">•</span>
            <span className="leading-relaxed">{rendered}</span>
          </div>
        ) : (
          <p key={i} className="leading-relaxed">{rendered}</p>
        );
      })}
    </div>
  );
}

export default function ChatPage() {
  const [selection, setSelection]       = useState<Selection>({ kind: "ai" });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers]               = useState<DirectoryUser[]>([]);
  const [me, setMe]                     = useState<{ accId: string; name: string } | null>(null);
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [input, setInput]               = useState("");
  const [busy, setBusy]                 = useState(false);
  const [aiThinking, setAiThinking]     = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editDraft, setEditDraft]       = useState("");
  const [menu, setMenu]                 = useState<MenuState>(null);
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const [forwardMsg, setForwardMsg]     = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding]     = useState(false);
  const [replyTo, setReplyTo]           = useState<ChatMessage | null>(null);
  const [flashId, setFlashId]           = useState<string | null>(null);
  const [dragId, setDragId]             = useState<string | null>(null);
  const [dragX, setDragX]               = useState(0);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName]       = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [uploading, setUploading]       = useState(false);
  const [lightboxUrl, setLightboxUrl]   = useState<string | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [renameDraft, setRenameDraft]   = useState("");
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const selRef      = useRef<Selection>(selection);
  selRef.current = selection;
  // Pointer-drag bookkeeping (start position + whether it became a real drag).
  const dragRef = useRef<{ startX: number; startY: number; active: boolean }>({ startX: 0, startY: 0, active: false });

  const selKey = selection.kind === "ai" ? "ai" : selection.id;
  const activeConv = selection.kind === "conv"
    ? conversations.find((c) => String(c.id) === String(selection.id)) ?? null
    : null;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /** Loads the sidebar (conversations + directory). */
  const loadSidebar = useCallback(async () => {
    try {
      const [cRes, uRes] = await Promise.all([
        fetch("/api/chat/conversations", { cache: "no-store" }),
        fetch("/api/chat/users", { cache: "no-store" }),
      ]);
      const cData = await cRes.json();
      const uData = await uRes.json();
      if (cData?.success) {
        setConversations(cData.conversations ?? []);
        setMe(cData.me ?? null);
      }
      if (uData?.success) setUsers(uData.users ?? []);
    } catch { /* sidebar is non-critical; keep the thread usable */ }
  }, []);

  const loadMessages = useCallback(async (sel: Selection, quiet = false) => {
    const url =
      sel.kind === "ai"
        ? "/api/chat/messages?room=ai"
        : `/api/chat/messages?conversationId=${sel.id}`;
    try {
      const res  = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      // Discard responses that arrive after the user switched threads.
      const stillCurrent =
        selRef.current.kind === sel.kind &&
        (sel.kind === "ai" || (selRef.current.kind === "conv" && selRef.current.id === sel.id));
      if (!stillCurrent) return;

      if (!res.ok || !data?.success) {
        if (!quiet) setError(data?.error || "Failed to load messages");
        return;
      }
      setMessages(data.messages ?? []);
      if (data.me) setMe(data.me);
      if (!quiet) setError("");
    } catch {
      if (!quiet) setError("Failed to load messages");
    }
  }, []);

  useEffect(() => { loadSidebar(); }, [loadSidebar]);

  useEffect(() => {
    setLoading(true);
    setEditingId(null);
    setMenu(null);
    loadMessages(selection).finally(() => {
      setLoading(false);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom());
    });
  }, [selKey, selection, loadMessages, scrollToBottom]);

  // Poll team threads for other people's activity (AI threads are solo).
  useEffect(() => {
    if (selection.kind !== "conv") return;
    const id = setInterval(() => {
      loadMessages(selection, true).then(() => {
        if (atBottomRef.current) scrollToBottom(true);
      });
      loadSidebar();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [selKey, selection, loadMessages, loadSidebar, scrollToBottom]);

  useEffect(() => {
    if (atBottomRef.current) requestAnimationFrame(() => scrollToBottom(true));
  }, [messages.length, aiThinking, scrollToBottom]);

  // Close the action menu on outside click, scroll, or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    scrollRef.current?.addEventListener("scroll", close);
    const node = scrollRef.current;
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      node?.removeEventListener("scroll", close);
    };
  }, [menu]);

  /** Scrolls to a quoted message and flashes it so it's easy to spot. */
  function jumpToMessage(id: string) {
    const el = scrollRef.current?.querySelector(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1200);
  }

  /** Opens the action menu at viewport coords, flipped to stay on-screen. */
  function openMenu(msg: ChatMessage, x: number, y: number) {
    setMenu({
      msg,
      x: Math.min(x, window.innerWidth - MENU_W - 8),
      y: Math.min(y, window.innerHeight - MENU_H - 8),
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function send() {
    const body = input.trim();
    if (!body || busy || aiThinking) return;
    setError("");
    setInput("");
    atBottomRef.current = true;

    if (selection.kind === "conv") {
      setBusy(true);
      try {
        const res  = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: selection.id,
            body,
            ...(replyTo ? { replyTo: replyTo.id } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          setError(data?.error || "Failed to send");
          setInput(body);
          return;
        }
        setMessages((prev) => [...prev, data.message]);
        setReplyTo(null);
        loadSidebar();
      } catch {
        setError("Failed to send");
        setInput(body);
      } finally {
        setBusy(false);
      }
      return;
    }

    // AI thread
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, conversation_id: null, acc_id: null, sender_name: "You",
      role: "user", body, created_at: new Date().toISOString(),
      edited_at: null, deleted_at: null, pinned_at: null, pinned_by: null, mine: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setAiThinking(true);
    try {
      const res  = await fetch("/api/chat/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error || "AI request failed");
        if (res.status === 503) {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setInput(body);
        } else {
          await loadMessages({ kind: "ai" }, true);
        }
        return;
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), data.userMessage, data.reply]);
    } catch {
      setError("AI request failed");
      await loadMessages({ kind: "ai" }, true);
    } finally {
      setAiThinking(false);
    }
  }

  async function copyMessage(m: ChatMessage) {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(m.body);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      // Clipboard API needs a secure context (https/localhost) — fall back to execCommand.
      try {
        const ta = document.createElement("textarea");
        ta.value = m.body;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopiedId(m.id);
        setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
      } catch {
        setError("Clipboard blocked by the browser");
      }
    }
  }

  /** Forwards a message into another conversation (body is re-read server-side). */
  async function forwardTo(conversationId: string) {
    if (!forwardMsg) return;
    setForwarding(true);
    try {
      const res  = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, forwardOf: forwardMsg.id }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to forward"); return; }
      setForwardMsg(null);
      await loadSidebar();
      // Jump to the destination so the user sees it land.
      setSelection({ kind: "conv", id: String(conversationId) });
    } catch {
      setError("Failed to forward");
    } finally {
      setForwarding(false);
    }
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    try {
      const res  = await fetch(`/api/chat/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to edit"); return; }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...data.message, mine: true } : m)));
      setEditingId(null);
      loadSidebar();
    } catch { setError("Failed to edit"); }
  }

  async function togglePin(m: ChatMessage) {
    setMenu(null);
    try {
      const res  = await fetch(`/api/chat/messages/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !m.pinned_at }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to pin"); return; }
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...data.message, mine: x.mine } : x)));
    } catch { setError("Failed to pin"); }
  }

  async function deleteMessage(id: string) {
    setMenu(null);
    if (!confirm("Delete this message for everyone?")) return;
    try {
      const res  = await fetch(`/api/chat/messages/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to delete"); return; }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...data.message, mine: true } : m)));
      loadSidebar();
    } catch { setError("Failed to delete"); }
  }

  async function clearAiThread() {
    if (!confirm("Clear your entire AI conversation? This cannot be undone.")) return;
    try {
      const res  = await fetch("/api/chat/messages?room=ai", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to clear"); return; }
      setMessages([]);
    } catch { setError("Failed to clear"); }
  }

  async function openDm(peerAccId: string) {
    try {
      const res  = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "dm", peerAccId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to open chat"); return; }
      await loadSidebar();
      setSelection({ kind: "conv", id: String(data.conversationId) });
    } catch { setError("Failed to open chat"); }
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name) { setError("Group name is required"); return; }
    try {
      const res  = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "group", name, memberIds: groupMembers }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to create group"); return; }
      setShowNewGroup(false);
      setGroupName("");
      setGroupMembers([]);
      await loadSidebar();
      setSelection({ kind: "conv", id: String(data.conversationId) });
    } catch { setError("Failed to create group"); }
  }

  /** Uploads a file (with whatever's currently typed as caption) to the active conversation. */
  async function uploadFile(file: File) {
    if (selection.kind !== "conv" || uploading) return;
    setError("");
    setUploading(true);
    const caption = input.trim();
    try {
      const form = new FormData();
      form.set("conversationId", selection.id);
      form.set("caption", caption);
      form.set("file", file);
      const res  = await fetch("/api/chat/attachments", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Upload failed"); return; }
      setMessages((prev) => [...prev, data.message]);
      setInput("");
      loadSidebar();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (file) uploadFile(file);
  }

  /** Renames the active group (any member may rename — no owner role in this app). */
  async function renameGroup() {
    const name = renameDraft.trim();
    if (!name || !activeConv || renamingGroup) return;
    setRenamingGroup(true);
    try {
      const res  = await fetch(`/api/chat/conversations/${activeConv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to rename group"); return; }
      setConversations((prev) => prev.map((c) => (c.id === data.conversation.id ? data.conversation : c)));
    } catch {
      setError("Failed to rename group");
    } finally {
      setRenamingGroup(false);
    }
  }

  async function addGroupMember(accId: string) {
    if (!activeConv) return;
    setMemberBusyId(accId);
    try {
      const res  = await fetch(`/api/chat/conversations/${activeConv.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to add member"); return; }
      setConversations((prev) => prev.map((c) => (c.id === data.conversation.id ? data.conversation : c)));
    } catch {
      setError("Failed to add member");
    } finally {
      setMemberBusyId(null);
    }
  }

  /** Removes a member; removing yourself is how you leave. */
  async function removeGroupMember(accId: string) {
    if (!activeConv) return;
    const leaving = accId === myAccId;
    if (leaving && !confirm(`Leave "${convTitle(activeConv, myAccId)}"?`)) return;
    setMemberBusyId(accId);
    try {
      const res  = await fetch(`/api/chat/conversations/${activeConv.id}/members/${accId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error || "Failed to remove member"); return; }
      if (leaving) {
        setShowGroupInfo(false);
        setConversations((prev) => prev.filter((c) => c.id !== activeConv.id));
        setSelection({ kind: "ai" });
      } else {
        setConversations((prev) => prev.map((c) => (c.id === data.conversation.id ? data.conversation : c)));
      }
    } catch {
      setError("Failed to remove member");
    } finally {
      setMemberBusyId(null);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const myAccId = me?.accId ?? "";
  const pinned  = messages.filter((m) => m.pinned_at && !m.deleted_at);

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => convTitle(c, myAccId).toLowerCase().includes(q));
  }, [conversations, search, myAccId]);

  // People you don't have a DM with yet.
  const dmPeerIds = new Set(
    conversations.filter((c) => c.kind === "dm").flatMap((c) => c.members.map((m) => String(m.accId)))
  );
  const newPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) => !u.isMe && !dmPeerIds.has(String(u.acc_id)) && (!q || u.name.toLowerCase().includes(q))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, conversations, search]);

  const headerTitle = selection.kind === "ai" ? "AI Assistant" : activeConv ? convTitle(activeConv, myAccId) : "…";
  const headerSub =
    selection.kind === "ai"
      ? "Private thread · knows your live project data"
      : activeConv?.kind === "group"
        ? `${activeConv.members.length} members · ${activeConv.members.map((m) => m.name.split(" ")[0]).join(", ")}`
        : activeConv
          ? activeConv.members.find((m) => String(m.accId) !== String(myAccId))?.department ?? "Direct message"
          : "";

  return (
    <div className="animate-page-enter flex gap-3" style={{ height: "calc(100vh - 112px)" }}>

      {/* ══ LEFT: people & conversations ════════════════════════════════════ */}
      <aside className="glass-panel rounded-2xl w-80 shrink-0 flex flex-col overflow-hidden">
        <div className="glass-panel-card-header flex items-center justify-between gap-2 shrink-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Messages</h3>
          <button onClick={() => setShowNewGroup(true)} aria-label="New group"
            className="p-1.5 rounded-lg brand-gradient text-white shadow-sm active:scale-95 transition-transform">
            <Plus size={15} />
          </button>
        </div>

        <div className="px-3 py-2.5 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people or groups…"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-white/6 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
          {/* AI assistant pinned at top */}
          <button
            onClick={() => setSelection({ kind: "ai" })}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all text-left ${
              selection.kind === "ai" ? "brand-gradient text-white shadow-sm" : "hover:bg-slate-100 dark:hover:bg-white/6"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              selection.kind === "ai" ? "bg-white/20" : "brand-gradient"
            }`}>
              <Sparkles size={15} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[12px] font-bold truncate ${selection.kind === "ai" ? "text-white" : "text-slate-700 dark:text-slate-200"}`}>
                Keystone Assistant
              </p>
              <p className={`text-[10px] truncate ${selection.kind === "ai" ? "text-white/80" : "text-slate-400"}`}>
                AI · knows your projects
              </p>
            </div>
          </button>

          <div className="h-px bg-slate-200 dark:bg-white/8 my-2 mx-1" />

          {/* Existing conversations */}
          {filteredConvs.length > 0 && (
            <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Chats</p>
          )}
          {filteredConvs.map((c) => {
            const active = selection.kind === "conv" && String(selection.id) === String(c.id);
            const title  = convTitle(c, myAccId);
            return (
              <button key={c.id} onClick={() => setSelection({ kind: "conv", id: String(c.id) })}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all text-left ${
                  active ? "brand-gradient text-white shadow-sm" : "hover:bg-slate-100 dark:hover:bg-white/6"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold ${
                  active ? "bg-white/20 text-white"
                    : c.kind === "group" ? "brand-gradient-soft text-white"
                    : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                }`}>
                  {c.kind === "group" ? <Users size={15} /> : initials(title)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-bold truncate ${active ? "text-white" : "text-slate-700 dark:text-slate-200"}`}>{title}</p>
                  <p className={`text-[10px] truncate ${active ? "text-white/80" : "text-slate-400"}`}>
                    {c.last_message
                      ? c.last_message.deleted
                        ? "Message deleted"
                        : `${c.last_message.senderName.split(" ")[0]}: ${c.last_message.body}`
                      : c.kind === "group" ? `${c.members.length} members` : "No messages yet"}
                  </p>
                </div>
              </button>
            );
          })}

          {/* Directory — people without a DM yet */}
          {newPeople.length > 0 && (
            <>
              <p className="px-2.5 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Start a chat</p>
              {newPeople.map((u) => (
                <button key={u.acc_id} onClick={() => openDm(u.acc_id)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 text-[11px] font-bold">
                    {initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">{u.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{u.job_title || u.department || u.email}</p>
                  </div>
                  <UserRound size={13} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </>
          )}

          {filteredConvs.length === 0 && newPeople.length === 0 && (
            <p className="px-3 py-8 text-center text-[11px] text-slate-400">No matches for “{search}”</p>
          )}
        </div>
      </aside>

      {/* ══ RIGHT: conversation pane ══════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl flex flex-col flex-1 min-w-0 overflow-hidden">

        <div className="glass-panel-card-header flex items-center justify-between gap-4 shrink-0">
          <button
            onClick={() => { if (activeConv?.kind === "group") { setRenameDraft(activeConv.name ?? ""); setShowGroupInfo(true); } }}
            disabled={activeConv?.kind !== "group"}
            className={`flex items-center gap-3 min-w-0 text-left ${activeConv?.kind === "group" ? "cursor-pointer hover:opacity-80" : "cursor-default"} transition-opacity`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              selection.kind === "ai" ? "brand-gradient" : activeConv?.kind === "group" ? "brand-gradient-soft" : "bg-slate-200 dark:bg-white/10"
            }`}>
              {selection.kind === "ai" ? <Sparkles size={16} className="text-white" />
                : activeConv?.kind === "group" ? <Users size={16} className="text-white" />
                : <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{initials(headerTitle)}</span>}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight truncate flex items-center gap-1">
                {headerTitle}
                {activeConv?.kind === "group" && <ChevronRight size={13} className="text-slate-400 shrink-0" />}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{headerSub}</p>
            </div>
          </button>
          {selection.kind === "ai" && messages.length > 0 && (
            <button onClick={clearAiThread} aria-label="Clear AI conversation"
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0">
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {/* Pinned bar */}
        {pinned.length > 0 && (
          <div className="px-4 py-2 border-b border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-500/10 shrink-0">
            <div className="flex items-start gap-2">
              <Pin size={12} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  {pinned.length} pinned
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                  <span className="font-semibold">{pinned[pinned.length - 1].sender_name}:</span>{" "}
                  {pinned[pinned.length - 1].body}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-3">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl brand-gradient flex items-center justify-center mb-4 shadow-lg">
                {selection.kind === "ai" ? <Sparkles size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {selection.kind === "ai" ? "Ask about your projects" : "No messages yet"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                {selection.kind === "ai"
                  ? "The assistant can see live project status, phases, progress, and deadlines. Try “which projects are overdue?”"
                  : "Say hello to start the conversation."}
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const prev    = messages[i - 1];
              const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
              const isAi    = m.role === "assistant";
              const mine    = m.mine && !isAi;
              const deleted = Boolean(m.deleted_at);
              const editing = editingId === m.id;

              return (
                <div
                  key={m.id}
                  data-mid={m.id}
                  className={flashId === m.id ? "rounded-xl ring-2 ring-emerald-400/70 transition-shadow" : "transition-shadow"}
                >
                  {showDay && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-white/8" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{dayLabel(m.created_at)}</span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-white/8" />
                    </div>
                  )}

                  <div className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold shadow-sm ${
                      isAi ? "brand-gradient text-white"
                        : mine ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900"
                        : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                    }`}>
                      {isAi ? <Sparkles size={14} /> : initials(m.sender_name)}
                    </div>

                    <div className={`max-w-[min(78%,42rem)] min-w-0 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      <div className={`flex items-baseline gap-2 mb-1 ${mine ? "flex-row-reverse" : ""}`}>
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                          {isAi ? "Keystone Assistant" : mine ? "You" : m.sender_name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{timeLabel(m.created_at)}</span>
                        {m.edited_at && !deleted && <span className="text-[10px] text-slate-400 italic shrink-0">edited</span>}
                        {m.pinned_at && !deleted && <Pin size={10} className="text-emerald-500 shrink-0" />}
                      </div>

                      {editing ? (
                        <div className="w-full min-w-64">
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(m.id); }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            rows={2}
                            autoFocus
                            className="w-full resize-none px-3 py-2 rounded-xl border border-emerald-400 bg-white dark:bg-white/6 text-slate-800 dark:text-slate-100 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          />
                          <div className="flex gap-1.5 mt-1.5 justify-end">
                            <button onClick={() => setEditingId(null)} aria-label="Cancel edit"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8 flex items-center gap-1">
                              <X size={12} /> Cancel
                            </button>
                            <button onClick={() => saveEdit(m.id)} aria-label="Save edit"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white brand-gradient flex items-center gap-1">
                              <Check size={12} /> Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`relative flex items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                          {/* Reply affordance revealed as the bubble is dragged */}
                          {dragId === m.id && Math.abs(dragX) > 8 && (
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                                Math.abs(dragX) >= REPLY_THRESHOLD
                                  ? "brand-gradient text-white"
                                  : "bg-slate-200 dark:bg-white/10 text-slate-400"
                              }`}
                              style={mine ? { right: "100%", marginRight: 8 } : { left: "100%", marginLeft: 8 }}
                            >
                              <Reply size={15} />
                            </div>
                          )}

                          <div
                            onContextMenu={(e) => {
                              if (deleted) return;
                              e.preventDefault();
                              openMenu(m, e.clientX, e.clientY);
                            }}
                            onPointerDown={(e) => {
                              // Left button only, and never while editing or on a tombstone.
                              if (deleted || e.button !== 0) return;
                              dragRef.current = { startX: e.clientX, startY: e.clientY, active: false };
                              setDragId(m.id);
                            }}
                            onPointerMove={(e) => {
                              if (dragId !== m.id) return;
                              const dx = e.clientX - dragRef.current.startX;
                              const dy = e.clientY - dragRef.current.startY;
                              // Only take over once the gesture is clearly horizontal,
                              // so vertical scrolling and text selection still work.
                              if (!dragRef.current.active) {
                                if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
                                dragRef.current.active = true;
                                e.currentTarget.setPointerCapture(e.pointerId);
                              }
                              setDragX(Math.max(-120, Math.min(120, dx)));
                            }}
                            onPointerUp={(e) => {
                              if (dragId !== m.id) return;
                              const passed = Math.abs(dragX) >= REPLY_THRESHOLD;
                              if (dragRef.current.active) {
                                try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
                              }
                              // Swipe = reply. Only for real conversations (the AI
                              // thread has no reply threading).
                              if (passed && dragRef.current.active && selection.kind === "conv") {
                                setReplyTo(m);
                              }
                              dragRef.current.active = false;
                              setDragId(null);
                              setDragX(0);
                            }}
                            onPointerCancel={() => { dragRef.current.active = false; setDragId(null); setDragX(0); }}
                            style={{
                              transform: dragId === m.id ? `translateX(${dragX}px)` : undefined,
                              transition: dragId === m.id ? "none" : "transform 180ms cubic-bezier(0.2,0.9,0.3,1)",
                              touchAction: "pan-y",
                            }}
                            className={`px-3.5 py-2.5 rounded-2xl text-[13px] break-words select-text cursor-default ${
                              deleted
                                ? "bg-slate-100 dark:bg-white/5 text-slate-400 italic border border-dashed border-slate-300 dark:border-white/10"
                                : mine ? "brand-gradient text-white rounded-tr-sm shadow-sm"
                                : isAi ? "bg-emerald-50 dark:bg-emerald-500/10 text-slate-700 dark:text-slate-200 border border-emerald-200/70 dark:border-emerald-500/20 rounded-tl-sm"
                                : "bg-slate-100 dark:bg-white/8 text-slate-700 dark:text-slate-200 rounded-tl-sm"
                            }`}
                          >
                            {m.is_forwarded && !deleted && (
                              <span className={`flex items-center gap-1 text-[10px] italic mb-1 ${mine ? "text-white/70" : "text-slate-400"}`}>
                                <Forward size={10} /> Forwarded
                              </span>
                            )}

                            {/* Quoted message this one replies to */}
                            {m.reply_to && !deleted && (
                              <button
                                onClick={() => jumpToMessage(String(m.reply_to))}
                                className={`w-full text-left mb-1.5 pl-2 py-1 rounded-r border-l-2 transition-opacity hover:opacity-80 ${
                                  mine
                                    ? "border-white/60 bg-white/15"
                                    : "border-emerald-500 bg-emerald-500/10"
                                }`}
                              >
                                <span className={`block text-[10px] font-bold truncate ${mine ? "text-white/90" : "text-emerald-600 dark:text-emerald-400"}`}>
                                  {m.reply_sender ?? "Unknown"}
                                </span>
                                <span className={`flex items-center gap-1 text-[11px] truncate ${mine ? "text-white/70" : "text-slate-500 dark:text-slate-400"}`}>
                                  {m.reply_body === null ? (
                                    <span className="italic">Message deleted</span>
                                  ) : m.reply_body ? (
                                    m.reply_body
                                  ) : m.reply_attachment_name ? (
                                    <><Paperclip size={9} className="shrink-0" /> {m.reply_attachment_name}</>
                                  ) : (
                                    <span className="italic">Message</span>
                                  )}
                                </span>
                              </button>
                            )}

                            {/* Attachment (image thumbnail or file chip) */}
                            {m.attachment_url && !deleted && (
                              isImageMime(m.attachment_mime) ? (
                                <button
                                  onClick={() => setLightboxUrl(m.attachment_url!)}
                                  className="block mb-1.5 max-w-64 rounded-xl overflow-hidden border border-black/5"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary dimensions */}
                                  <img src={m.attachment_url} alt={m.attachment_name ?? "attachment"} className="w-full h-auto max-h-64 object-cover" />
                                </button>
                              ) : (
                                <a
                                  href={m.attachment_url}
                                  download={m.attachment_name ?? undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2 mb-1.5 px-2.5 py-2 rounded-xl border transition-colors ${
                                    mine
                                      ? "border-white/25 bg-white/10 hover:bg-white/15"
                                      : "border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10"
                                  }`}
                                >
                                  <FileText size={16} className="shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] font-semibold truncate">{m.attachment_name}</span>
                                    <span className={`block text-[9px] ${mine ? "text-white/70" : "text-slate-400"}`}>{formatBytes(m.attachment_size)}</span>
                                  </span>
                                  <Download size={13} className="shrink-0 opacity-70" />
                                </a>
                              )
                            )}

                            {deleted ? "This message was deleted"
                              : isAi ? <AssistantBody text={m.body} />
                              : m.body ? <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                              : null}
                          </div>

                          {/* Hover trigger — same menu as right-click */}
                          {!deleted && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const r = e.currentTarget.getBoundingClientRect();
                                if (menu?.msg.id === m.id) setMenu(null);
                                else openMenu(m, mine ? r.left - MENU_W : r.right, r.bottom + 4);
                              }}
                              aria-label="Message actions"
                              className="p-1.5 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8"
                            >
                              {copiedId === m.id ? <Check size={14} className="text-emerald-500" /> : <MoreVertical size={14} />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {aiThinking && (
            <div className="flex gap-2.5">
              <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles size={14} className="text-white" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 flex items-center gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 flex items-start gap-2 shrink-0">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed flex-1">{error}</p>
            <button onClick={() => setError("")} aria-label="Dismiss error" className="text-red-400 hover:text-red-600"><X size={12} /></button>
          </div>
        )}

        {/* Composer */}
        <div className="px-4 py-3 border-t border-slate-200/70 dark:border-white/8 shrink-0">
          {/* Reply context */}
          {replyTo && selection.kind === "conv" && (
            <div className="flex items-start gap-2 mb-2 pl-2.5 py-1.5 pr-2 rounded-lg border-l-2 border-emerald-500 bg-emerald-500/10">
              <Reply size={12} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 truncate">
                  Replying to {replyTo.mine ? "yourself" : replyTo.sender_name}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{replyTo.body}</p>
              </div>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {selection.kind === "conv" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={onPickFile}
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || busy}
                  aria-label="Attach a file"
                  className="shrink-0 w-10 h-10 rounded-xl border border-slate-200 dark:border-white/12 text-slate-500 dark:text-slate-400 hover:text-emerald-600 hover:border-emerald-400 dark:hover:text-emerald-400 flex items-center justify-center transition-all disabled:opacity-40"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                </button>
              </>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }}
              rows={1}
              disabled={busy || aiThinking}
              placeholder={selection.kind === "ai" ? "Ask the assistant…" : uploading ? "Uploading…" : `Message ${headerTitle}…`}
              className="flex-1 resize-none max-h-32 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-white/6 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all disabled:opacity-60 glass-scrollbar"
            />
            <button onClick={send} disabled={busy || aiThinking || !input.trim()} aria-label="Send message"
              className="shrink-0 w-10 h-10 rounded-xl brand-gradient text-white flex items-center justify-center shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
              {busy || aiThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 px-1">Enter to send · Shift+Enter for a new line · Max 15MB per file</p>
        </div>
      </div>


      {/* ══ New group modal ══════════════════════════════════════════════════ */}
      {showNewGroup && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-backdrop-enter" onClick={() => setShowNewGroup(false)} />
          <div className="relative w-full max-w-md glass-panel-elevated rounded-2xl p-5 animate-modal-enter">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl brand-gradient flex items-center justify-center shrink-0">
                <Users size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">New group</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">You&apos;ll be added automatically</p>
              </div>
            </div>

            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (e.g. Renovation Team)"
              autoFocus
              className="w-full px-3.5 py-2.5 mb-3 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-white/6 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />

            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 px-0.5">
              Members {groupMembers.length > 0 && `(${groupMembers.length} selected)`}
            </p>
            <div className="max-h-56 overflow-y-auto space-y-0.5 mb-4 pr-1">
              {users.filter((u) => !u.isMe).map((u) => {
                const on = groupMembers.includes(String(u.acc_id));
                return (
                  <button key={u.acc_id}
                    onClick={() => setGroupMembers((prev) =>
                      on ? prev.filter((x) => x !== String(u.acc_id)) : [...prev, String(u.acc_id)]
                    )}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                      on ? "bg-emerald-50 dark:bg-emerald-500/15" : "hover:bg-slate-100 dark:hover:bg-white/6"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{u.job_title || u.department || u.email}</p>
                    </div>
                    <div className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      on ? "brand-gradient border-transparent" : "border-slate-300 dark:border-white/20"
                    }`}>
                      {on && <Check size={11} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewGroup(false)}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8">
                Cancel
              </button>
              <button onClick={createGroup} disabled={!groupName.trim()}
                className="px-4 py-2 rounded-xl text-[12px] font-bold text-white brand-gradient shadow-sm disabled:opacity-40 active:scale-95 transition-transform">
                Create group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Context menu (right-click or ⋮) — portalled so the scroll container
             can't clip it ═══════════════════════════════════════════════════ */}
      {menu && typeof document !== "undefined" && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ position: "fixed", left: menu.x, top: menu.y, width: MENU_W }}
          className="z-9999 py-1 glass-dropdown animate-dropdown-enter"
        >
          {menu.msg.conversation_id && (
            <button onClick={() => { setReplyTo(menu.msg); setMenu(null); }}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8">
              <Reply size={13} /> Reply
            </button>
          )}

          <button onClick={() => copyMessage(menu.msg)}
            className="w-full px-3 py-2 flex items-center gap-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8">
            <Copy size={13} /> Copy text
          </button>

          <button onClick={() => { setForwardMsg(menu.msg); setMenu(null); }}
            className="w-full px-3 py-2 flex items-center gap-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8">
            <Forward size={13} /> Forward
          </button>

          {menu.msg.conversation_id && (
            <button onClick={() => togglePin(menu.msg)}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8">
              {menu.msg.pinned_at ? <><PinOff size={13} /> Unpin</> : <><Pin size={13} /> Pin message</>}
            </button>
          )}

          {menu.msg.mine && menu.msg.role !== "assistant" && menu.msg.conversation_id && (
            <>
              <div className="h-px bg-slate-200 dark:bg-white/8 my-1" />
              <button onClick={() => { setEditingId(menu.msg.id); setEditDraft(menu.msg.body); setMenu(null); }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={() => deleteMessage(menu.msg.id)}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-[12px] font-medium text-red-500 hover:bg-red-500/10">
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* ══ Forward picker ═══════════════════════════════════════════════════ */}
      {forwardMsg && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-backdrop-enter" onClick={() => setForwardMsg(null)} />
          <div className="relative w-full max-w-md glass-panel-elevated rounded-2xl p-5 animate-modal-enter">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl brand-gradient flex items-center justify-center shrink-0">
                <Forward size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Forward to…</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Pick a chat or group</p>
              </div>
            </div>

            <div className="px-3 py-2 mb-3 rounded-xl bg-slate-100 dark:bg-white/6 border border-slate-200 dark:border-white/10">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3 whitespace-pre-wrap">{forwardMsg.body}</p>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-0.5 mb-4 pr-1">
              {conversations.filter((c) => String(c.id) !== String(forwardMsg.conversation_id ?? "")).map((c) => {
                const title = convTitle(c, myAccId);
                return (
                  <button key={c.id} onClick={() => forwardTo(String(c.id))} disabled={forwarding}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-white/6 disabled:opacity-50 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      c.kind === "group" ? "brand-gradient-soft text-white" : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                    }`}>
                      {c.kind === "group" ? <Users size={14} /> : initials(title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">{title}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {c.kind === "group" ? `${c.members.length} members` : "Direct message"}
                      </p>
                    </div>
                    <Forward size={13} className="text-slate-300 shrink-0" />
                  </button>
                );
              })}
              {conversations.filter((c) => String(c.id) !== String(forwardMsg.conversation_id ?? "")).length === 0 && (
                <p className="px-3 py-8 text-center text-[11px] text-slate-400">
                  No other chats yet — start one from the sidebar first.
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setForwardMsg(null)}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Image lightbox ═══════════════════════════════════════════════════ */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm animate-backdrop-enter"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary dimensions */}
          <img
            src={lightboxUrl}
            alt="attachment"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-xl shadow-2xl animate-modal-enter"
          />
        </div>
      )}

      {/* ══ Group info panel ═════════════════════════════════════════════════ */}
      {showGroupInfo && activeConv?.kind === "group" && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-backdrop-enter" onClick={() => setShowGroupInfo(false)} />
          <div className="relative w-full max-w-md glass-panel-elevated rounded-2xl p-5 animate-modal-enter">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-xl brand-gradient-soft flex items-center justify-center shrink-0">
                <Users size={17} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Group info</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{activeConv.members.length} members</p>
              </div>
              <button onClick={() => setShowGroupInfo(false)} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 shrink-0">
                <X size={15} />
              </button>
            </div>

            {/* Rename */}
            <div className="flex items-center gap-2 mb-4">
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") renameGroup(); }}
                placeholder="Group name"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/12 bg-white dark:bg-white/6 text-slate-800 dark:text-slate-100 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
              <button
                onClick={renameGroup}
                disabled={renamingGroup || !renameDraft.trim() || renameDraft.trim() === activeConv.name}
                className="px-3.5 py-2.5 rounded-xl text-[12px] font-bold text-white brand-gradient shadow-sm disabled:opacity-40 shrink-0"
              >
                {renamingGroup ? <Loader2 size={14} className="animate-spin" /> : "Save"}
              </button>
            </div>

            {/* Members */}
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Members</p>
              <button
                onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <UserPlus size={12} /> Add
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5 mb-4 pr-1">
              {activeConv.members.map((m) => {
                const isMe = String(m.accId) === String(myAccId);
                return (
                  <div key={m.accId} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {initials(m.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {m.name}{isMe && <span className="text-slate-400 font-normal"> (you)</span>}
                      </p>
                      {m.department && <p className="text-[10px] text-slate-400 truncate">{m.department}</p>}
                    </div>
                    <button
                      onClick={() => removeGroupMember(m.accId)}
                      disabled={memberBusyId === m.accId}
                      aria-label={isMe ? "Leave group" : `Remove ${m.name}`}
                      className={`p-1.5 rounded-lg shrink-0 transition-colors disabled:opacity-40 ${
                        isMe ? "text-red-500 hover:bg-red-500/10" : "text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                      }`}
                    >
                      {memberBusyId === m.accId ? <Loader2 size={13} className="animate-spin" /> : isMe ? <LogOut size={13} /> : <X size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ Add member picker (within Group info) ═══════════════════════════════ */}
      {showAddMember && activeConv?.kind === "group" && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-backdrop-enter" onClick={() => setShowAddMember(false)} />
          <div className="relative w-full max-w-md glass-panel-elevated rounded-2xl p-5 animate-modal-enter">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl brand-gradient flex items-center justify-center shrink-0">
                <UserPlus size={16} className="text-white" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Add to group</h3>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {users
                .filter((u) => !u.isMe && !activeConv.members.some((m) => String(m.accId) === String(u.acc_id)))
                .map((u) => (
                  <button
                    key={u.acc_id}
                    onClick={() => addGroupMember(u.acc_id)}
                    disabled={memberBusyId === u.acc_id}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/6 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{u.job_title || u.department || u.email}</p>
                    </div>
                    {memberBusyId === u.acc_id ? <Loader2 size={14} className="animate-spin shrink-0" /> : <UserPlus size={14} className="text-slate-300 shrink-0" />}
                  </button>
                ))}
              {users.filter((u) => !u.isMe && !activeConv.members.some((m) => String(m.accId) === String(u.acc_id))).length === 0 && (
                <p className="px-3 py-8 text-center text-[11px] text-slate-400">Everyone is already in this group.</p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowAddMember(false)}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
