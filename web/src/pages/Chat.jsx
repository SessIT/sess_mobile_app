import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiUpload, fileUrl } from '../lib/api';
import {
  Card,
  Button,
  Input,
  Field,
  Loading,
  EmptyState,
  ErrorNote,
  PageHeader,
  Modal,
  Spinner,
  cx,
} from '../components/ui';
import { IconChat, IconSearch, IconUsers, IconPlus, IconImage } from '../components/icons';

const POLL_THREAD_MS = 4000;
const POLL_LIST_MS = 15000;

const initialsOf = (n) => (n || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const AVATAR_BG = ['bg-indigo-500', 'bg-cyan-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-violet-600', 'bg-pink-600'];
const NAME_TONE = ['text-indigo-600', 'text-cyan-700', 'text-emerald-700', 'text-amber-700', 'text-rose-700', 'text-violet-700', 'text-pink-700'];

const fmtClock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const listStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtClock(iso);
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};
const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const WISHES = {
  birthday: 'Happy Birthday! 🎂🎉 Wishing you a fantastic year ahead!',
  anniversary: 'Congratulations on your work anniversary with SESS! 🏆🎉',
};

// Team Chat — WhatsApp-style DMs + groups.
export default function Chat() {
  const [params] = useSearchParams();
  const [convos, setConvos] = useState(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null); // { kind:'user'|'group', id, name, ... }
  const [search, setSearch] = useState('');
  const [groupModal, setGroupModal] = useState(false);

  const [messages, setMessages] = useState(null);
  const [meId, setMeId] = useState(null);
  const [meUsername, setMeUsername] = useState(null);
  const [members, setMembers] = useState([]); // group members for @mentions
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notAtBottom, setNotAtBottom] = useState(false);

  const lastIdRef = useRef(0);
  const scrollerRef = useRef(null);
  const atBottomRef = useRef(true);
  const prefRef = useRef(false);
  const fileRef = useRef(null);

  const loadConvos = useCallback(() => {
    apiGet('/chat/conversations')
      .then((r) => setConvos(r.conversations || []))
      .catch((e) => setError(e.message || 'Failed to load conversations'));
  }, []);

  useEffect(() => {
    loadConvos();
    const t = setInterval(loadConvos, POLL_LIST_MS);
    return () => clearInterval(t);
  }, [loadConvos]);

  // Deep link from celebrations: /chat?to=<userId>&wish=birthday|anniversary
  useEffect(() => {
    if (prefRef.current || !convos) return;
    const to = Number(params.get('to'));
    if (to) {
      const c = convos.find((x) => x.kind === 'user' && x.id === to);
      if (c) {
        setActive(c);
        const wish = WISHES[params.get('wish')];
        if (wish) setText(wish);
      }
    }
    prefRef.current = true;
  }, [convos, params]);

  const scrollToBottom = (smooth = true) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const mergeIn = (incoming, { fromMe = false } = {}) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set((prev || []).map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      if (!add.length) return prev || [];
      const next = [...(prev || []), ...add];
      lastIdRef.current = next[next.length - 1].id;
      return next;
    });
    // Only follow the conversation if the reader is already at the bottom.
    if (fromMe || atBottomRef.current) setTimeout(() => scrollToBottom(true), 60);
  };

  // Thread load + poll for the active conversation.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setMessages(null);
    setMembers([]);
    lastIdRef.current = 0;
    atBottomRef.current = true;
    setNotAtBottom(false);

    const path = (after) => active.kind === 'group'
      ? `/chat/group-thread/${active.id}${after ? `?after=${after}` : ''}`
      : `/chat/thread/${active.id}${after ? `?after=${after}` : ''}`;

    const full = async () => {
      try {
        const r = await apiGet(path());
        if (!alive) return;
        const list = r.messages || [];
        lastIdRef.current = list.length ? list[list.length - 1].id : 0;
        setMeId(r.meId ?? null);
        if (r.meUsername) setMeUsername(r.meUsername);
        if (Array.isArray(r.group?.members) && typeof r.group.members[0] === 'object')
          setMembers(r.group.members);
        setMessages(list);
        setTimeout(() => scrollToBottom(false), 40);
      } catch (e) {
        if (alive) { setError(e.message || 'Failed to load messages'); setMessages([]); }
      }
    };
    const poll = async () => {
      try {
        const r = await apiGet(path(lastIdRef.current));
        if (alive) mergeIn(r.messages || []);
      } catch { /* transient */ }
    };

    full();
    const t = setInterval(poll, POLL_THREAD_MS);
    return () => { alive = false; clearInterval(t); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    setNotAtBottom(!atBottom);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      const payload = active.kind === 'group' ? { groupId: active.id, body } : { toUserId: active.id, body };
      const msg = await apiPost('/chat/send', payload);
      setText('');
      mergeIn([msg], { fromMe: true });
      loadConvos();
    } catch (e) {
      setError(e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  // Share a photo/video from the file picker (typed text becomes the caption).
  const sendMedia = async (file) => {
    if (!file || !active || uploading) return;
    if (!/^(image|video)\//.test(file.type)) {
      setError('Only photos and videos can be shared.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('File is too large (max 25 MB).');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const up = await apiUpload('/chat/upload', form);
      const payload = {
        ...(active.kind === 'group' ? { groupId: active.id } : { toUserId: active.id }),
        body: text.trim(),
        attachment: up.path,
        attachmentType: up.type,
      };
      const msg = await apiPost('/chat/send', payload);
      setText('');
      mergeIn([msg], { fromMe: true });
      loadConvos();
    } catch (e) {
      setError(e.message || 'Could not share the file.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const isMine = (m) => (meId != null ? m.senderId === meId : active?.kind === 'user' && m.senderId !== active.id);

  /* ---------- @mentions (group chats) ---------- */
  const mentionMatch = active?.kind === 'group' ? text.match(/@([\w.-]*)$/) : null;
  const mentionOptions = mentionMatch
    ? members.filter((mb) => {
        if (mb.id === meId) return false;
        const q = mentionMatch[1].toLowerCase();
        return !q
          || (mb.username || '').toLowerCase().startsWith(q)
          || (mb.fullName || '').toLowerCase().startsWith(q);
      }).slice(0, 5)
    : [];
  const insertMention = (mb) => setText((t) => t.replace(/@([\w.-]*)$/, `@${mb.username} `));

  const mentionsMe = (body) =>
    !!meUsername && new RegExp(`@${meUsername}\\b`, 'i').test(body);

  // Message body with @tokens highlighted (amber pill when it's YOU).
  const renderBody = (body, mine) =>
    String(body).split(/(@[\w.-]+)/g).map((p, i) => {
      if (/^@[\w.-]+$/.test(p)) {
        const isMe = !!meUsername && p.slice(1).toLowerCase() === meUsername.toLowerCase();
        return (
          <span
            key={i}
            className={cx(
              'font-bold',
              isMe ? 'rounded bg-amber-200 px-0.5 text-amber-900' : mine ? 'text-sky-200' : 'text-brand-700'
            )}
          >
            {p}
          </span>
        );
      }
      return <span key={i}>{p}</span>;
    });

  const filtered = (convos || []).filter((c) =>
    (c.name || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  // Date separators + sender-name flags (group chats only).
  const rows = [];
  let lastDay = null, prevSender = null;
  for (const m of messages || []) {
    const day = dayLabel(m.createdAt);
    if (day !== lastDay) { rows.push({ type: 'day', id: `d-${day}-${m.id}`, day }); lastDay = day; prevSender = null; }
    rows.push({ type: 'msg', ...m, showName: active?.kind === 'group' && !isMine(m) && m.senderId !== prevSender });
    prevSender = m.senderId;
  }

  return (
    <div>
      <PageHeader
        title="Team Chat"
        subtitle="Share wishes, blessings and quick updates — 1:1 or in groups."
        actions={
          <Button variant="secondary" onClick={() => setGroupModal(true)}>
            <IconPlus className="h-4 w-4" />
            New Group
          </Button>
        }
      />

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <Card className="overflow-hidden">
        {/* grid-rows-1 => minmax(0,1fr): rows may shrink below content height,
            so the panes scroll INTERNALLY instead of stretching past the card
            and clipping the composer. */}
        <div className="grid h-[calc(100vh-16rem)] min-h-[28rem] grid-cols-1 grid-rows-1 md:grid-cols-3">
          {/* Conversations */}
          <div className={cx('min-h-0 flex-col overflow-hidden border-r border-slate-100', active ? 'hidden md:flex' : 'flex')}>
            <div className="relative border-b border-slate-100 p-3">
              <IconSearch className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className="pl-9" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {convos === null ? (
                <Loading label="Loading…" />
              ) : filtered.length === 0 ? (
                <EmptyState title="No chats" icon={<IconChat />} />
              ) : (
                filtered.map((c) => (
                  <button
                    key={`${c.kind}-${c.id}`}
                    onClick={() => setActive(c)}
                    className={cx(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50',
                      active?.kind === c.kind && active?.id === c.id && 'bg-brand-50/60'
                    )}
                  >
                    {c.kind === 'group' ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-700 text-white">
                        <IconUsers className="h-5 w-5" />
                      </span>
                    ) : (
                      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', AVATAR_BG[c.id % AVATAR_BG.length])}>
                        {initialsOf(c.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{c.name}</span>
                        {c.lastMessage && <span className="shrink-0 text-[10px] text-slate-400">{listStamp(c.lastMessage.at)}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cx('block truncate text-xs', c.unread > 0 ? 'font-semibold text-slate-700' : 'text-slate-400')}>
                          {c.lastMessage
                            ? `${c.lastMessage.mine ? 'You' : (c.lastMessage.senderName || '').split(' ')[0] || ''}${c.lastMessage.mine || c.lastMessage.senderName ? ': ' : ''}${c.lastMessage.body}`
                            : c.kind === 'group'
                              ? `${c.memberCount} members`
                              : (c.designation || 'Say hello 👋')}
                        </span>
                        {c.unread > 0 && (
                          <span className="ml-auto flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={cx('col-span-2 min-h-0 flex-col overflow-hidden', active ? 'flex' : 'hidden md:flex')}>
            {!active ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  title="Pick a chat to start"
                  hint="Send wishes 1:1, or create a group for the whole team."
                  icon={<IconChat />}
                />
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button onClick={() => setActive(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 md:hidden">←</button>
                  {active.kind === 'group' ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-700 text-white"><IconUsers className="h-4 w-4" /></span>
                  ) : (
                    <span className={cx('flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white', AVATAR_BG[active.id % AVATAR_BG.length])}>
                      {initialsOf(active.name)}
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{active.name}</p>
                    <p className="text-xs text-slate-400">
                      {active.kind === 'group'
                        ? `${active.memberCount} members`
                        : `@${active.username}${active.designation ? ` · ${active.designation}` : ''}`}
                    </p>
                  </div>
                </div>

                {/* Messages */}
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <div ref={scrollerRef} onScroll={onScroll} className="h-full space-y-1 overflow-y-auto bg-slate-50/70 p-4">
                    {messages === null ? (
                      <Loading label="Loading messages…" />
                    ) : rows.length === 0 ? (
                      <p className="pt-10 text-center text-sm text-slate-400">No messages yet — say hello! 💬</p>
                    ) : (
                      rows.map((r) =>
                        r.type === 'day' ? (
                          <div key={r.id} className="my-2 flex justify-center">
                            <span className="rounded-full bg-slate-200 px-3 py-0.5 text-[10px] font-semibold text-slate-500">{r.day}</span>
                          </div>
                        ) : (
                          <div key={r.id} className={cx('flex', isMine(r) ? 'justify-end' : 'justify-start')}>
                            <div
                              className={cx(
                                'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                                isMine(r)
                                  ? 'rounded-br-md bg-brand-700 text-white'
                                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
                                active.kind === 'group' && !isMine(r) && mentionsMe(r.body) &&
                                  'border-amber-400 bg-amber-50 ring-1 ring-amber-300'
                              )}
                            >
                              {r.showName && (r.sender?.fullName || r.sender?.username) && (
                                <p className={cx('mb-0.5 text-[11px] font-bold', NAME_TONE[r.senderId % NAME_TONE.length])}>
                                  {r.sender.fullName || r.sender.username}
                                </p>
                              )}
                              {r.attachment && (
                                r.attachmentType === 'video' ? (
                                  <video
                                    controls
                                    src={fileUrl(r.attachment)}
                                    className="mb-1 max-h-64 w-full max-w-[280px] rounded-lg bg-slate-900"
                                  />
                                ) : (
                                  <img
                                    src={fileUrl(r.attachment)}
                                    alt="shared media"
                                    onClick={() => window.open(fileUrl(r.attachment), '_blank')}
                                    className="mb-1 max-h-64 w-full max-w-[240px] cursor-pointer rounded-lg object-cover"
                                  />
                                )
                              )}
                              {r.body && (
                                <p className="whitespace-pre-wrap break-words">{renderBody(r.body, isMine(r))}</p>
                              )}
                              <p className={cx('mt-0.5 text-right text-[10px]', isMine(r) ? 'text-brand-200' : 'text-slate-400')}>
                                {fmtClock(r.createdAt)}
                                {isMine(r) && active.kind === 'user' && (r.readAt ? ' ✓✓' : ' ✓')}
                              </p>
                            </div>
                          </div>
                        )
                      )
                    )}
                  </div>

                  {/* Jump to latest */}
                  {notAtBottom && (
                    <button
                      onClick={() => { atBottomRef.current = true; setNotAtBottom(false); scrollToBottom(true); }}
                      className="absolute bottom-3 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg transition hover:bg-brand-800"
                      title="Jump to latest"
                    >
                      ↓
                    </button>
                  )}
                </div>

                {/* Composer */}
                <div className="relative flex items-end gap-2 border-t border-slate-100 p-3">
                  {/* @mention suggestions */}
                  {mentionOptions.length > 0 && (
                    <div className="absolute bottom-full left-3 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      {mentionOptions.map((mb) => (
                        <button
                          key={mb.id}
                          type="button"
                          onClick={() => insertMention(mb)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-brand-50"
                        >
                          <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white', AVATAR_BG[mb.id % AVATAR_BG.length])}>
                            {initialsOf(mb.fullName || mb.username)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">{mb.fullName || mb.username}</span>
                            <span className="block text-xs text-brand-600">@{mb.username}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Attach photo / video from gallery */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => sendMedia(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    title="Share a photo or video"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
                  >
                    {uploading ? <Spinner className="h-4 w-4 text-brand-700" /> : <IconImage className="h-5 w-5" />}
                  </button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    placeholder={uploading ? 'Sharing media…' : 'Type a message… (Enter to send)'}
                    rows={1}
                    maxLength={1000}
                    className="max-h-28 flex-1 resize-none rounded-xl border border-slate-300/90 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                  />
                  <Button onClick={send} disabled={!text.trim() || sending}>
                    {sending ? <Spinner className="h-4 w-4 text-current" /> : 'Send'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <NewGroupModal
        open={groupModal}
        people={(convos || []).filter((c) => c.kind === 'user')}
        onClose={() => setGroupModal(false)}
        onCreated={(g) => {
          setGroupModal(false);
          loadConvos();
          setActive({ kind: 'group', id: g.id, name: g.name, memberCount: g.memberCount });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------- New group modal */
function NewGroupModal({ open, people, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(''); setSelected(new Set()); setBusy(false); setError(''); }
  }, [open]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const create = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    if (selected.size === 0) { setError('Pick at least one member.'); return; }
    setBusy(true);
    setError('');
    try {
      const g = await apiPost('/chat/groups', { name: name.trim(), memberIds: [...selected] });
      onCreated(g);
    } catch (e) {
      setError(e.message || 'Could not create the group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="New Group"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy || !name.trim() || selected.size === 0}>
            {busy ? (<><Spinner className="h-4 w-4 text-current" /><span>Creating…</span></>) : 'Create Group'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Field label="Group name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service Team 🚀" autoFocus maxLength={60} />
        </Field>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Members · {selected.size} selected
          </p>
          <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className={cx('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white', AVATAR_BG[p.id % AVATAR_BG.length])}>
                  {initialsOf(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                  {p.designation && <span className="block truncate text-xs text-slate-400">{p.designation}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
