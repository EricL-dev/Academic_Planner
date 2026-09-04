import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarDays, BookOpen, ClipboardCheck, Flag, ListChecks, Flame,
  Plus, X, Check, ChevronLeft, ChevronRight, Trash2, Circle, CheckCircle2,
  UploadCloud, AlertCircle, Repeat, Pencil, Download, Upload, Save
} from "lucide-react";

/* ---------------------------------------------------------
   Utilities
--------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = toKey(new Date());
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function daysBetween(fromKey, toKeyStr) {
  const a = new Date(fromKey + "T00:00:00");
  const b = new Date(toKeyStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function dueLabel(dateKey) {
  const diff = daysBetween(todayKey, dateKey);
  if (diff === 0) return { text: "Due today", tone: "urgent" };
  if (diff === 1) return { text: "Due tomorrow", tone: "soon" };
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  if (diff <= 3) return { text: `Due in ${diff}d`, tone: "soon" };
  return { text: `Due in ${diff}d`, tone: "normal" };
}

const DEFAULT_DATA = {
  homework: [],
  tests: [],
  deadlines: [],
  todos: [],
  habits: [],
  recurring: [],
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const DOW_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* Expand a recurring task definition into individual dated occurrences,
   between its start and end date (inclusive), capped to a sane number. */
function expandRecurring(r) {
  const out = [];
  if (!r.startDate || !r.endDate || !r.days || r.days.length === 0) return out;
  let d = new Date(r.startDate + "T00:00:00");
  const end = new Date(r.endDate + "T00:00:00");
  let guard = 0;
  while (d <= end && guard < 400) {
    if (r.days.includes(d.getDay())) {
      const key = toKey(d);
      out.push({
        id: `${r.id}:${key}`,
        recurringId: r.id,
        date: key,
        text: r.title,
        priority: r.priority || "medium",
        done: !!r.completions[key],
      });
    }
    d.setDate(d.getDate() + 1);
    guard += 1;
  }
  return out;
}

function dayGroupLabel(dateKey) {
  if (!dateKey) return "No date";
  const diff = daysBetween(todayKey, dateKey);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/* Very small ICS parser — pulls SUMMARY + DTSTART out of VEVENT blocks.
   Good enough for Canvas's exported calendar feed text. */
function parseICS(text) {
  const events = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  blocks.forEach(block => {
    const body = block.split("END:VEVENT")[0];
    const summaryMatch = body.match(/SUMMARY:(.*)/);
    const dateMatch = body.match(/DTSTART[^:]*:(\d{8})/);
    if (!summaryMatch || !dateMatch) return;
    let title = summaryMatch[1].trim();
    // Canvas often appends the course code in brackets, e.g. "Problem Set 4 [MATH 111]"
    let course = "";
    const courseMatch = title.match(/\[([^\]]+)\]\s*$/);
    if (courseMatch) {
      course = courseMatch[1];
      title = title.replace(/\[([^\]]+)\]\s*$/, "").trim();
    }
    const raw = dateMatch[1];
    const dateKey = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    events.push({ id: uid(), title, course, date: dateKey, type: "homework" });
  });
  return events;
}

/* ---------------------------------------------------------
   Persistence
--------------------------------------------------------- */
const STORAGE_KEY = "academic-planner-data";

function usePlannerData() {
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    } catch (e) {
      // no saved data yet, or it was corrupted — start fresh
    }
    return DEFAULT_DATA;
  });
  const loaded = true; // localStorage reads are synchronous, so data is ready immediately

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // storage full or unavailable (e.g. private browsing) — data just won't persist
    }
  }, [data]);

  return [data, setData, loaded];
}

/* ---------------------------------------------------------
   Small building blocks
--------------------------------------------------------- */
function Pill({ tone = "normal", children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="empty">
      <Icon size={22} strokeWidth={1.5} />
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

function IconButton({ onClick, label, children, danger }) {
  return (
    <button className={`icon-btn ${danger ? "icon-btn-danger" : ""}`} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function ProgressRing({ percent, size = 34 }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  const complete = percent >= 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="progress-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={complete ? "var(--mustard)" : "var(--forest)"}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="progress-ring-text">
        {Math.round(percent)}
      </text>
    </svg>
  );
}

const CONFETTI_COLORS = ["#2B5941", "#D9A441", "#C98F2A", "#C1502E", "#3B6EA5", "#6B4E8E"];

function Confetti({ trigger }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    const next = Array.from({ length: 46 }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      duration: 1 + Math.random() * 0.6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 60,
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 1700);
    return () => clearTimeout(t);
  }, [trigger]);

  if (pieces.length === 0) return null;

  return (
    <div className="confetti-layer">
      {pieces.map(p => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--drift": `${p.drift}px`,
            "--rot": `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}

function ItemForm({ fields, initialValues, onSubmit, onCancel, submitLabel }) {
  const [vals, setVals] = useState(initialValues);
  const set = (k, v) => setVals(prev => ({ ...prev, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const titleField = fields.find(f => f.key === "title" || f.key === "text" || f.key === "name");
    if (titleField && !String(vals[titleField.key]).trim()) return;
    onSubmit(vals);
  };

  return (
    <form className="add-form" onSubmit={submit}>
      {fields.map(f => (
        <div className={`field field-${f.width || "full"}`} key={f.key}>
          <label>{f.label}</label>
          {f.type === "textarea" ? (
            <textarea
              value={vals[f.key] ?? ""}
              onChange={e => set(f.key, e.target.value)}
              rows={2}
              placeholder={f.placeholder || ""}
            />
          ) : f.type === "select" ? (
            <select value={vals[f.key] ?? ""} onChange={e => set(f.key, e.target.value)}>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.type || "text"}
              value={vals[f.key] ?? ""}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder || ""}
              autoFocus={f.key === (fields[0] && fields[0].key)}
            />
          )}
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-solid">{submitLabel}</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------
   Add-item form (shared shape, used per module)
--------------------------------------------------------- */
function AddForm({ fields, onSubmit, submitLabel }) {
  const initial = {};
  fields.forEach(f => { initial[f.key] = f.default || ""; });
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="add-trigger" onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={2.25} /> {submitLabel}
      </button>
    );
  }

  return (
    <ItemForm
      fields={fields}
      initialValues={initial}
      submitLabel="Add"
      onCancel={() => setOpen(false)}
      onSubmit={(vals) => { onSubmit(vals); setOpen(false); }}
    />
  );
}

/* ---------------------------------------------------------
   Homework Module
--------------------------------------------------------- */
const HOMEWORK_FIELDS = [
  { key: "title", label: "Assignment", placeholder: "Problem set 4", width: "full" },
  { key: "course", label: "Course", placeholder: "MATH 111", width: "half" },
  { key: "dueDate", label: "Due date", type: "date", width: "half", default: todayKey },
  { key: "notes", label: "Notes", type: "textarea", placeholder: "Chapters 3–4, show work", width: "full" },
];

function HomeworkView({ items, setItems }) {
  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const toggle = (id) => setItems(items.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const remove = (id) => setItems(items.filter(i => i.id !== id));
  const [editingId, setEditingId] = useState(null);
  const saveEdit = (id, vals) => { setItems(items.map(i => i.id === id ? { ...i, ...vals } : i)); setEditingId(null); };

  return (
    <div className="module">
      <header className="module-head">
        <h2>Homework</h2>
        <p className="module-sub">Assignments tracked by due date. Checked items still show, faded, until you clear them.</p>
      </header>

      <AddForm
        submitLabel="Add assignment"
        fields={HOMEWORK_FIELDS}
        onSubmit={(v) => setItems([...items, { id: uid(), done: false, ...v }])}
      />

      {sorted.length === 0 ? (
        <EmptyState icon={BookOpen} title="No homework yet" hint="Add your first assignment above." />
      ) : (
        <ul className="item-list">
          {sorted.map(hw => {
            if (editingId === hw.id) {
              return (
                <li key={hw.id} className="item-row item-editing">
                  <ItemForm fields={HOMEWORK_FIELDS} initialValues={hw} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => saveEdit(hw.id, v)} />
                </li>
              );
            }
            const due = dueLabel(hw.dueDate);
            return (
              <li key={hw.id} className={`item-row ${hw.done ? "item-done" : ""}`}>
                <button className="check-toggle" onClick={() => toggle(hw.id)} aria-label="Toggle complete">
                  {hw.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                </button>
                <div className="item-body">
                  <div className="item-title-row">
                    <span className="item-title">{hw.title}</span>
                    {hw.course && <span className="item-course">{hw.course}</span>}
                  </div>
                  {hw.notes && <p className="item-notes">{hw.notes}</p>}
                </div>
                {!hw.done && <Pill tone={due.tone}>{due.text}</Pill>}
                <IconButton label="Edit" onClick={() => setEditingId(hw.id)}><Pencil size={14} /></IconButton>
                <IconButton label="Delete" onClick={() => remove(hw.id)} danger><Trash2 size={15} /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Tests Module
--------------------------------------------------------- */
const TEST_FIELDS = [
  { key: "title", label: "Test / Exam", placeholder: "Midterm 1", width: "full" },
  { key: "course", label: "Course", placeholder: "CHEM 150", width: "half" },
  { key: "date", label: "Date", type: "date", width: "half", default: todayKey },
  { key: "notes", label: "Notes", type: "textarea", placeholder: "Covers ch. 1–5, bring calculator", width: "full" },
];

function TestsView({ items, setItems }) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const remove = (id) => setItems(items.filter(i => i.id !== id));
  const [editingId, setEditingId] = useState(null);
  const saveEdit = (id, vals) => { setItems(items.map(i => i.id === id ? { ...i, ...vals } : i)); setEditingId(null); };

  return (
    <div className="module">
      <header className="module-head">
        <h2>Tests &amp; Exams</h2>
        <p className="module-sub">Everything you need to study for, soonest first.</p>
      </header>

      <AddForm
        submitLabel="Add test"
        fields={TEST_FIELDS}
        onSubmit={(v) => setItems([...items, { id: uid(), ...v }])}
      />

      {sorted.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No tests scheduled" hint="Add one above to start tracking study time." />
      ) : (
        <ul className="item-list">
          {sorted.map(t => {
            if (editingId === t.id) {
              return (
                <li key={t.id} className="item-row item-editing">
                  <ItemForm fields={TEST_FIELDS} initialValues={t} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => saveEdit(t.id, v)} />
                </li>
              );
            }
            const due = dueLabel(t.date);
            return (
              <li key={t.id} className="item-row">
                <div className="item-body">
                  <div className="item-title-row">
                    <span className="item-title">{t.title}</span>
                    {t.course && <span className="item-course">{t.course}</span>}
                  </div>
                  {t.notes && <p className="item-notes">{t.notes}</p>}
                </div>
                <Pill tone={due.tone}>{due.text}</Pill>
                <IconButton label="Edit" onClick={() => setEditingId(t.id)}><Pencil size={14} /></IconButton>
                <IconButton label="Delete" onClick={() => remove(t.id)} danger><Trash2 size={15} /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Deadlines Module (general — scholarships, forms, etc.)
--------------------------------------------------------- */
const DEADLINE_FIELDS = [
  { key: "title", label: "Deadline", placeholder: "Immunization records due", width: "full" },
  { key: "category", label: "Category", type: "select", options: ["Scholarship", "Registration", "Housing", "Health", "Financial", "Other"], width: "half" },
  { key: "date", label: "Date", type: "date", width: "half", default: todayKey },
  { key: "notes", label: "Notes", type: "textarea", placeholder: "Submit via patient portal", width: "full" },
];

function DeadlinesView({ items, setItems }) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const remove = (id) => setItems(items.filter(i => i.id !== id));
  const [editingId, setEditingId] = useState(null);
  const saveEdit = (id, vals) => { setItems(items.map(i => i.id === id ? { ...i, ...vals } : i)); setEditingId(null); };

  return (
    <div className="module">
      <header className="module-head">
        <h2>Deadlines</h2>
        <p className="module-sub">Admin and paperwork — scholarship forms, registration, anything with a hard cutoff.</p>
      </header>

      <AddForm
        submitLabel="Add deadline"
        fields={DEADLINE_FIELDS}
        onSubmit={(v) => setItems([...items, { id: uid(), ...v }])}
      />

      {sorted.length === 0 ? (
        <EmptyState icon={Flag} title="No deadlines tracked" hint="Add scholarship, health, or registration deadlines here." />
      ) : (
        <ul className="item-list">
          {sorted.map(d => {
            if (editingId === d.id) {
              return (
                <li key={d.id} className="item-row item-editing">
                  <ItemForm fields={DEADLINE_FIELDS} initialValues={d} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => saveEdit(d.id, v)} />
                </li>
              );
            }
            const due = dueLabel(d.date);
            return (
              <li key={d.id} className="item-row">
                <div className="item-body">
                  <div className="item-title-row">
                    <span className="item-title">{d.title}</span>
                    {d.category && <span className="item-course">{d.category}</span>}
                  </div>
                  {d.notes && <p className="item-notes">{d.notes}</p>}
                </div>
                <Pill tone={due.tone}>{due.text}</Pill>
                <IconButton label="Edit" onClick={() => setEditingId(d.id)}><Pencil size={14} /></IconButton>
                <IconButton label="Delete" onClick={() => remove(d.id)} danger><Trash2 size={15} /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   To-Do Module
--------------------------------------------------------- */
function PriorityPill({ priority }) {
  return <span className={`priority-pill priority-${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

function DayGroupHeader({ label, items, isOverdue }) {
  const totalWeight = items.reduce((sum, i) => sum + PRIORITY_WEIGHT[i.priority || "medium"], 0);
  const doneWeight = items.reduce((sum, i) => sum + (i.done ? PRIORITY_WEIGHT[i.priority || "medium"] : 0), 0);
  const percent = totalWeight === 0 ? 0 : (doneWeight / totalWeight) * 100;

  const prevPercentRef = React.useRef(percent);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const prev = prevPercentRef.current;
    if (prev < 100 && percent >= 100 && totalWeight > 0) {
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 50);
    }
    prevPercentRef.current = percent;
  }, [percent, totalWeight]);

  return (
    <div className="todo-group-head">
      <h4 className={`todo-group-label ${isOverdue ? "is-overdue" : ""}`}>{label}</h4>
      <div className="todo-group-ring-wrap">
        <ProgressRing percent={percent} size={30} />
        <Confetti trigger={celebrate} />
      </div>
    </div>
  );
}

const TODO_FIELDS = [
  { key: "text", label: "Task", placeholder: "Email financial aid office", width: "full" },
  { key: "date", label: "Date (optional)", type: "date", width: "half", default: todayKey },
  { key: "priority", label: "Priority", type: "select", options: ["high", "medium", "low"], default: "medium", width: "half" },
];

function TodoView({ items, setItems, recurring, toggleRecurringCompletion }) {
  const toggle = (id) => setItems(items.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const remove = (id) => setItems(items.filter(i => i.id !== id));
  const cyclePriority = (id) => setItems(items.map(i => {
    if (i.id !== id) return i;
    const order = ["high", "medium", "low"];
    const next = order[(order.indexOf(i.priority) + 1) % order.length];
    return { ...i, priority: next };
  }));
  const [editingId, setEditingId] = useState(null);
  const saveEdit = (id, vals) => { setItems(items.map(i => i.id === id ? { ...i, ...vals } : i)); setEditingId(null); };

  const recurringOccurrences = useMemo(() => {
    const all = recurring.flatMap(expandRecurring);
    // keep the view manageable: only occurrences from a week ago through their own end date
    const cutoff = toKey(new Date(Date.now() - 7 * 86400000));
    return all.filter(o => o.date >= cutoff);
  }, [recurring]);

  const groups = useMemo(() => {
    const map = {};
    const addTo = (key, entry) => {
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    };
    items.forEach(td => addTo(td.date || "", { ...td, source: "todo" }));
    recurringOccurrences.forEach(o => addTo(o.date, { ...o, source: "recurring" }));

    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    });
    const dated = Object.keys(map).filter(k => k !== "").sort();
    const noDate = map[""] ? [""] : [];
    return [...dated, ...noDate].map(key => ({ key, label: dayGroupLabel(key), items: map[key] }));
  }, [items, recurringOccurrences]);

  return (
    <div className="module">
      <header className="module-head">
        <h2>To-Do</h2>
        <p className="module-sub">Grouped by day. Each ring fills as you finish higher-priority tasks first — full ring means the day's done.</p>
      </header>

      <AddForm
        submitLabel="Add task"
        fields={TODO_FIELDS}
        onSubmit={(v) => setItems([...items, { id: uid(), done: false, ...v }])}
      />

      {items.length === 0 && recurringOccurrences.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing on your list" hint="Add a task above, or set up something recurring in the Recurring tab." />
      ) : (
        <div className="todo-groups">
          {groups.map(g => (
            <div className="todo-group" key={g.key || "none"}>
              <DayGroupHeader label={g.label} items={g.items} isOverdue={g.label === "Overdue"} />
              <ul className="item-list">
                {g.items.map(td => {
                  if (td.source === "todo" && editingId === td.id) {
                    return (
                      <li key={td.id} className="item-row item-editing">
                        <ItemForm fields={TODO_FIELDS} initialValues={td} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => saveEdit(td.id, v)} />
                      </li>
                    );
                  }
                  return (
                    <li key={td.id} className={`item-row ${td.done ? "item-done" : ""}`}>
                      <button
                        className="check-toggle"
                        onClick={() => td.source === "recurring" ? toggleRecurringCompletion(td.recurringId, td.date) : toggle(td.id)}
                        aria-label="Toggle complete"
                      >
                        {td.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                      </button>
                      <div className="item-body">
                        <span className="item-title">{td.text}</span>
                        {td.source === "recurring" && <span className="item-course"><Repeat size={10} strokeWidth={2.5} /> Recurring</span>}
                      </div>
                      <button className="priority-toggle" onClick={() => td.source === "todo" && cyclePriority(td.id)}>
                        <PriorityPill priority={td.priority || "medium"} />
                      </button>
                      {td.source === "todo" && <IconButton label="Edit" onClick={() => setEditingId(td.id)}><Pencil size={14} /></IconButton>}
                      {td.source === "todo" && <IconButton label="Delete" onClick={() => remove(td.id)} danger><Trash2 size={15} /></IconButton>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Backup & Restore (full data export/import as JSON)
--------------------------------------------------------- */
function BackupSection({ data, onRestore }) {
  const fileInputRef = React.useRef(null);
  const [note, setNote] = useState(null); // { type: "success" | "error", text }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `academic-planner-backup-${todayKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setNote({ type: "success", text: "Backup downloaded." });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        onRestore(parsed);
        setNote({ type: "success", text: "Backup restored — your data is back." });
      } catch (err) {
        setNote({ type: "error", text: "That file doesn't look like a valid backup." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="backup-section">
      <h3>Backup &amp; Restore</h3>
      <p className="module-sub">Download everything — homework, tests, deadlines, to-dos, habits, and recurring tasks — as a file you can keep, and load it back in whenever you want (including on a different device or browser).</p>
      <div className="backup-actions">
        <button className="btn-solid" onClick={exportData}><Download size={15} /> Export backup</button>
        <button className="btn-ghost" onClick={() => fileInputRef.current.click()}><Upload size={14} /> Restore from file</button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleFile} />
      </div>
      {note && <p className={`backup-note backup-note-${note.type}`}>{note.text}</p>}
    </div>
  );
}

/* ---------------------------------------------------------
   Import from Canvas (paste calendar feed / ICS text)
--------------------------------------------------------- */
function ImportView({ onImport, data, onRestore }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState("");

  const runParse = () => {
    setError("");
    if (!text.trim()) return;
    const events = parseICS(text);
    if (events.length === 0) {
      setError("Couldn't find any events in that text. Paste the full contents of your Canvas calendar feed (.ics) — it should contain lines like \"BEGIN:VEVENT\".");
      setParsed([]);
      return;
    }
    setParsed(events);
  };

  const updateType = (id, type) => setParsed(parsed.map(p => p.id === id ? { ...p, type } : p));
  const removeParsed = (id) => setParsed(parsed.filter(p => p.id !== id));

  const confirmImport = () => {
    onImport(parsed);
    setParsed([]);
    setText("");
  };

  return (
    <div className="module">
      <header className="module-head">
        <h2>Import from Canvas</h2>
        <p className="module-sub">
          In Canvas, go to Calendar → Calendar Feed, open that link, select all, and copy the page text. Paste it below —
          nothing is sent anywhere, it's parsed right here in your browser.
        </p>
      </header>

      <textarea
        className="import-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;SUMMARY:Problem Set 4 [MATH 111]&#10;DTSTART:20260915&#10;END:VEVENT..."
        rows={7}
      />
      <div className="import-actions">
        <button className="btn-solid" onClick={runParse}><UploadCloud size={15} /> Parse</button>
        {error && <span className="import-error"><AlertCircle size={14} /> {error}</span>}
      </div>

      {parsed.length > 0 && (
        <div className="import-preview">
          <h3>{parsed.length} item{parsed.length !== 1 ? "s" : ""} found — choose where each goes</h3>
          <ul className="item-list">
            {parsed.map(p => (
              <li key={p.id} className="item-row">
                <div className="item-body">
                  <div className="item-title-row">
                    <span className="item-title">{p.title}</span>
                    {p.course && <span className="item-course">{p.course}</span>}
                  </div>
                  <p className="item-notes">{p.date}</p>
                </div>
                <select className="import-type-select" value={p.type} onChange={e => updateType(p.id, e.target.value)}>
                  <option value="homework">Homework</option>
                  <option value="test">Test</option>
                  <option value="deadline">Deadline</option>
                </select>
                <IconButton label="Remove" onClick={() => removeParsed(p.id)} danger><Trash2 size={15} /></IconButton>
              </li>
            ))}
          </ul>
          <button className="btn-solid" onClick={confirmImport}><Check size={15} /> Add {parsed.length} item{parsed.length !== 1 ? "s" : ""}</button>
        </div>
      )}

      <hr className="section-divider" />
      <BackupSection data={data} onRestore={onRestore} />
    </div>
  );
}

/* ---------------------------------------------------------
   Habit Tracker Module
--------------------------------------------------------- */
const HABIT_COLORS = ["#2B5941", "#D9A441", "#3B6EA5", "#C1502E", "#6B4E8E"];

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function HabitsView({ habits, setHabits }) {
  const [name, setName] = useState("");
  const weekStart = startOfWeek(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const addHabit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const color = HABIT_COLORS[habits.length % HABIT_COLORS.length];
    setHabits([...habits, { id: uid(), name: name.trim(), color, logs: {} }]);
    setName("");
  };

  const toggleLog = (habitId, key) => {
    setHabits(habits.map(h => {
      if (h.id !== habitId) return h;
      const logs = { ...h.logs };
      if (logs[key]) delete logs[key]; else logs[key] = true;
      return { ...h, logs };
    }));
  };

  const removeHabit = (id) => setHabits(habits.filter(h => h.id !== id));

  const streak = (h) => {
    let count = 0;
    let d = new Date();
    while (h.logs[toKey(d)]) {
      count += 1;
      d.setDate(d.getDate() - 1);
    }
    return count;
  };

  return (
    <div className="module">
      <header className="module-head">
        <h2>Habits</h2>
        <p className="module-sub">This week, at a glance. Tap a dot to mark a day done.</p>
      </header>

      <form className="habit-add" onSubmit={addHabit}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New habit — e.g. Review flashcards"
        />
        <button type="submit" className="btn-solid"><Plus size={16} /> Add</button>
      </form>

      {habits.length === 0 ? (
        <EmptyState icon={Flame} title="No habits yet" hint="Add one above to start building your streak." />
      ) : (
        <div className="habit-table">
          <div className="habit-table-head">
            <span className="habit-name-col" />
            {weekDays.map(d => (
              <span key={toKey(d)} className={`habit-day-label ${toKey(d) === todayKey ? "is-today" : ""}`}>
                {DOW[d.getDay()]}<br />{d.getDate()}
              </span>
            ))}
            <span className="habit-streak-col">Streak</span>
          </div>
          {habits.map(h => (
            <div className="habit-row" key={h.id}>
              <span className="habit-name-col">
                <span className="habit-dot" style={{ background: h.color }} />
                {h.name}
              </span>
              {weekDays.map(d => {
                const key = toKey(d);
                const done = !!h.logs[key];
                return (
                  <button
                    key={key}
                    className={`habit-cell ${done ? "habit-cell-done" : ""}`}
                    style={done ? { background: h.color, borderColor: h.color } : {}}
                    onClick={() => toggleLog(h.id, key)}
                    aria-label={`Toggle ${h.name} for ${key}`}
                  >
                    {done && <Check size={13} color="#fff" strokeWidth={3} />}
                  </button>
                );
              })}
              <span className="habit-streak-col habit-streak-value">
                {streak(h) > 0 ? `${streak(h)}d` : "—"}
              </span>
              <IconButton label="Delete habit" onClick={() => removeHabit(h.id)} danger><Trash2 size={14} /></IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Recurring Tasks Module
--------------------------------------------------------- */
function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7 * 8); // default: 8 weeks out
  return toKey(d);
}

function RecurringForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [title, setTitle] = useState(initial.title || "");
  const [days, setDays] = useState(initial.days || []);
  const [startDate, setStartDate] = useState(initial.startDate || todayKey);
  const [endDate, setEndDate] = useState(initial.endDate || defaultEndDate());
  const [priority, setPriority] = useState(initial.priority || "medium");

  const toggleDay = (i) => setDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort());

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim() || days.length < 2 || !startDate || !endDate) return;
    onSubmit({ title: title.trim(), days, startDate, endDate, priority });
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="field field-full">
        <label>Task</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Review lecture notes" autoFocus />
      </div>
      <div className="field field-full">
        <label>Repeats on (pick 2 or more days)</label>
        <div className="day-picker">
          {DOW_FULL.map((d, i) => (
            <button
              type="button"
              key={d}
              className={`day-chip ${days.includes(i) ? "day-chip-active" : ""}`}
              onClick={() => toggleDay(i)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="field field-half">
        <label>Starts</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>
      <div className="field field-half">
        <label>Ends</label>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>
      <div className="field field-half">
        <label>Priority</label>
        <select value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </div>
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-solid">{submitLabel}</button>
      </div>
    </form>
  );
}

function RecurringView({ recurring, setRecurring }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addRecurring = (vals) => {
    setRecurring([...recurring, { id: uid(), ...vals, completions: {} }]);
    setOpen(false);
  };

  const saveEdit = (id, vals) => {
    setRecurring(recurring.map(r => r.id === id ? { ...r, ...vals } : r));
    setEditingId(null);
  };

  const remove = (id) => setRecurring(recurring.filter(r => r.id !== id));

  return (
    <div className="module">
      <header className="module-head">
        <h2>Recurring</h2>
        <p className="module-sub">Things that happen more than once a week — study blocks, lab sections, gym — repeating over a date range. These show up automatically in your To-Do and Calendar.</p>
      </header>

      {!open ? (
        <button className="add-trigger" onClick={() => setOpen(true)}>
          <Plus size={16} strokeWidth={2.25} /> Add recurring task
        </button>
      ) : (
        <RecurringForm initial={{}} submitLabel="Add" onCancel={() => setOpen(false)} onSubmit={addRecurring} />
      )}

      {recurring.length === 0 ? (
        <EmptyState icon={Repeat} title="No recurring tasks yet" hint="Set one up above — it'll auto-populate your To-Do list and Calendar." />
      ) : (
        <ul className="item-list">
          {recurring.map(r => {
            if (editingId === r.id) {
              return (
                <li key={r.id} className="item-row item-editing">
                  <RecurringForm initial={r} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => saveEdit(r.id, v)} />
                </li>
              );
            }
            return (
              <li key={r.id} className="item-row">
                <div className="item-body">
                  <div className="item-title-row">
                    <span className="item-title">{r.title}</span>
                    <PriorityPill priority={r.priority} />
                  </div>
                  <p className="item-notes">
                    {r.days.map(d => DOW_FULL[d]).join(", ")} · {r.startDate} through {r.endDate}
                  </p>
                </div>
                <IconButton label="Edit" onClick={() => setEditingId(r.id)}><Pencil size={14} /></IconButton>
                <IconButton label="Delete" onClick={() => remove(r.id)} danger><Trash2 size={15} /></IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Calendar Module — aggregates all dated items
--------------------------------------------------------- */
const CAL_KIND_META = {
  homework: { label: "Homework", color: "var(--forest)" },
  test: { label: "Tests", color: "var(--coral)" },
  deadline: { label: "Deadlines", color: "var(--mustard)" },
  todo: { label: "To-Do", color: "var(--blue)" },
  recurring: { label: "Recurring", color: "var(--purple)" },
};

function CalendarView({ data, setItemDone }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState(todayKey);
  const [visibleKinds, setVisibleKinds] = useState({ homework: true, test: true, deadline: true, todo: true, recurring: true });
  const [hiddenCourses, setHiddenCourses] = useState({});

  const courses = useMemo(() => {
    const set = new Set();
    data.homework.forEach(h => { if (h.course && h.course.trim()) set.add(h.course.trim()); });
    data.tests.forEach(t => { if (t.course && t.course.trim()) set.add(t.course.trim()); });
    return Array.from(set).sort();
  }, [data.homework, data.tests]);

  const toggleKind = (kind) => setVisibleKinds(prev => ({ ...prev, [kind]: !prev[kind] }));
  const toggleCourse = (course) => setHiddenCourses(prev => ({ ...prev, [course]: !prev[course] }));

  const agendaByDay = useMemo(() => {
    const map = {};
    const push = (key, entry) => {
      if (!key) return;
      if (visibleKinds[entry.kind] === false) return;
      if (entry.course && hiddenCourses[entry.course]) return;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    };
    data.homework.forEach(h => push(h.dueDate, { kind: "homework", color: CAL_KIND_META.homework.color, label: h.title, sub: h.course, course: h.course, done: h.done, id: h.id }));
    data.tests.forEach(t => push(t.date, { kind: "test", color: CAL_KIND_META.test.color, label: t.title, sub: t.course, course: t.course, id: t.id }));
    data.deadlines.forEach(dl => push(dl.date, { kind: "deadline", color: CAL_KIND_META.deadline.color, label: dl.title, sub: dl.category, id: dl.id }));
    data.todos.forEach(td => { if (td.date) push(td.date, { kind: "todo", color: CAL_KIND_META.todo.color, label: td.text, done: td.done, id: td.id }); });
    data.recurring.forEach(r => expandRecurring(r).forEach(o => push(o.date, { kind: "recurring", color: CAL_KIND_META.recurring.color, label: o.text, done: o.done, id: o.recurringId, dateKey: o.date })));
    return map;
  }, [data, visibleKinds, hiddenCourses]);

  const gridDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const changeMonth = (delta) => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };

  const selectedItems = agendaByDay[selected] || [];

  return (
    <div className="module">
      <header className="module-head calendar-head">
        <div>
          <h2>{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</h2>
          <p className="module-sub">Homework, tests, deadlines, recurring tasks, and dated to-dos, pulled in automatically.</p>
        </div>
        <div className="month-nav">
          <IconButton label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></IconButton>
          <button className="btn-ghost" onClick={() => { setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(todayKey); }}>Today</button>
          <IconButton label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={18} /></IconButton>
        </div>
      </header>

      <div className="calendar-layout">
        <aside className="cal-filters">
          <h3>Show</h3>
          <ul className="filter-list">
            {Object.entries(CAL_KIND_META).map(([kind, meta]) => (
              <li key={kind}>
                <label className="filter-check">
                  <input type="checkbox" checked={visibleKinds[kind] !== false} onChange={() => toggleKind(kind)} />
                  <span className="filter-dot" style={{ background: meta.color }} />
                  {meta.label}
                </label>
              </li>
            ))}
          </ul>

          {courses.length > 0 && (
            <>
              <h3 className="cal-filters-classes-head">Classes</h3>
              <ul className="filter-list">
                {courses.map(c => (
                  <li key={c}>
                    <label className="filter-check">
                      <input type="checkbox" checked={!hiddenCourses[c]} onChange={() => toggleCourse(c)} />
                      {c}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <div className="calendar-grid">
          <div className="calendar-dow-row">
            {DOW.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="calendar-cells">
            {gridDays.map(d => {
              const key = toKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const entries = agendaByDay[key] || [];
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  className={`cal-cell ${inMonth ? "" : "cal-cell-out"} ${key === todayKey ? "cal-cell-today" : ""} ${isSelected ? "cal-cell-selected" : ""}`}
                  onClick={() => setSelected(key)}
                >
                  <span className="cal-date">{d.getDate()}</span>
                  <span className="cal-dots">
                    {entries.slice(0, 4).map((e, i) => (
                      <span key={i} className="cal-dot" style={{ background: e.color, opacity: e.done ? 0.35 : 1 }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="agenda">
          <h3>{new Date(selected + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
          {selectedItems.length === 0 ? (
            <p className="agenda-empty">Nothing due this day.</p>
          ) : (
            <ul className="agenda-list">
              {selectedItems.map((e, i) => (
                <li key={i} className="agenda-item">
                  {("done" in e) ? (
                    <button className="check-toggle" onClick={() => setItemDone(e.kind, e.id, !e.done, e.dateKey)}>
                      {e.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                  ) : (
                    <span className="agenda-dot" style={{ background: e.color }} />
                  )}
                  <div>
                    <span className={`agenda-label ${e.done ? "item-done" : ""}`}>{e.label}</span>
                    {e.sub && <span className="agenda-sub"> · {e.sub}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   App shell
--------------------------------------------------------- */
const TABS = [
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "homework", label: "Homework", icon: BookOpen },
  { key: "tests", label: "Tests", icon: ClipboardCheck },
  { key: "deadlines", label: "Deadlines", icon: Flag },
  { key: "todo", label: "To-Do", icon: ListChecks },
  { key: "recurring", label: "Recurring", icon: Repeat },
  { key: "habits", label: "Habits", icon: Flame },
  { key: "import", label: "Import", icon: UploadCloud },
];

export default function App() {
  const [data, setData, loaded] = usePlannerData();
  const [tab, setTab] = useState("calendar");

  const setHomework = useCallback((next) => setData(d => ({ ...d, homework: next })), [setData]);
  const setTests = useCallback((next) => setData(d => ({ ...d, tests: next })), [setData]);
  const setDeadlines = useCallback((next) => setData(d => ({ ...d, deadlines: next })), [setData]);
  const setTodos = useCallback((next) => setData(d => ({ ...d, todos: next })), [setData]);
  const setHabits = useCallback((next) => setData(d => ({ ...d, habits: next })), [setData]);
  const setRecurring = useCallback((next) => setData(d => ({ ...d, recurring: next })), [setData]);

  const toggleRecurringCompletion = useCallback((recurringId, dateKey) => {
    setData(d => ({
      ...d,
      recurring: d.recurring.map(r => {
        if (r.id !== recurringId) return r;
        const completions = { ...r.completions };
        if (completions[dateKey]) delete completions[dateKey]; else completions[dateKey] = true;
        return { ...r, completions };
      }),
    }));
  }, [setData]);

  const setItemDone = useCallback((kind, id, done, dateKey) => {
    if (kind === "recurring") {
      toggleRecurringCompletion(id, dateKey);
      return;
    }
    setData(d => {
      if (kind === "homework") return { ...d, homework: d.homework.map(h => h.id === id ? { ...h, done } : h) };
      if (kind === "todo") return { ...d, todos: d.todos.map(t => t.id === id ? { ...t, done } : t) };
      return d;
    });
  }, [setData, toggleRecurringCompletion]);

  const counts = {
    homework: data.homework.filter(h => !h.done).length,
    tests: data.tests.length,
    deadlines: data.deadlines.length,
    todo: data.todos.filter(t => !t.done).length,
    habits: data.habits.length,
  };

  const handleImport = useCallback((parsedItems) => {
    setData(d => {
      const next = { ...d, homework: [...d.homework], tests: [...d.tests], deadlines: [...d.deadlines] };
      parsedItems.forEach(p => {
        if (p.type === "homework") next.homework.push({ id: uid(), title: p.title, course: p.course, dueDate: p.date, notes: "", done: false });
        else if (p.type === "test") next.tests.push({ id: uid(), title: p.title, course: p.course, date: p.date, notes: "" });
        else next.deadlines.push({ id: uid(), title: p.title, category: p.course || "Other", date: p.date, notes: "" });
      });
      return next;
    });
  }, [setData]);

  const restoreData = useCallback((parsed) => {
    setData({ ...DEFAULT_DATA, ...parsed });
  }, [setData]);

  return (
    <div className="planner-root">
      <style>{CSS}</style>

      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">§</span>
          <span className="brand-name">Coursework</span>
        </div>
        <ul className="tab-list">
          {TABS.map(t => {
            const Icon = t.icon;
            const count = counts[t.key];
            return (
              <li key={t.key}>
                <button className={`tab-btn ${tab === t.key ? "tab-btn-active" : ""}`} onClick={() => setTab(t.key)}>
                  <Icon size={17} strokeWidth={2} />
                  <span>{t.label}</span>
                  {!!count && <span className="tab-count">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <main className="content">
        {!loaded ? (
          <div className="loading">Loading your planner…</div>
        ) : (
          <>
            {tab === "calendar" && <CalendarView data={data} setItemDone={setItemDone} />}
            {tab === "homework" && <HomeworkView items={data.homework} setItems={setHomework} />}
            {tab === "tests" && <TestsView items={data.tests} setItems={setTests} />}
            {tab === "deadlines" && <DeadlinesView items={data.deadlines} setItems={setDeadlines} />}
            {tab === "todo" && <TodoView items={data.todos} setItems={setTodos} recurring={data.recurring} toggleRecurringCompletion={toggleRecurringCompletion} />}
            {tab === "recurring" && <RecurringView recurring={data.recurring} setRecurring={setRecurring} />}
            {tab === "habits" && <HabitsView habits={data.habits} setHabits={setHabits} />}
            {tab === "import" && <ImportView onImport={handleImport} data={data} onRestore={restoreData} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------
   Styles
--------------------------------------------------------- */
const CSS = `
:root {
  --paper: #FAF8F3;
  --paper-line: #E4DFCF;
  --card: #FFFFFF;
  --ink: #22241F;
  --ink-soft: #6B6B60;
  --forest: #2B5941;
  --forest-dark: #1F4531;
  --mustard: #C98F2A;
  --coral: #C1502E;
  --blue: #3B6EA5;
  --purple: #6B4E8E;
  --overdue: #B23A2E;
}

.planner-root {
  display: flex;
  min-height: 640px;
  background: var(--paper);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--paper-line);
}

h2, h3 { font-family: Georgia, "Source Serif Pro", serif; font-weight: 600; margin: 0; }
h2 { font-size: 22px; letter-spacing: -0.01em; }
h3 { font-size: 16px; margin-bottom: 10px; }

/* Sidebar */
.sidebar {
  width: 190px;
  flex-shrink: 0;
  background: var(--forest-dark);
  color: #EFE9DA;
  padding: 22px 14px;
  display: flex;
  flex-direction: column;
}
.brand { display: flex; align-items: center; gap: 8px; padding: 0 8px 22px; }
.brand-mark { font-family: Georgia, serif; font-size: 22px; color: var(--mustard); }
.brand-name { font-family: Georgia, serif; font-size: 15px; letter-spacing: 0.01em; }
.tab-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.tab-btn {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  background: none; border: none; color: #C9C4B3;
  font-size: 13.5px; padding: 9px 10px; border-radius: 7px; cursor: pointer;
  text-align: left; transition: background 0.15s ease, color 0.15s ease;
}
.tab-btn:hover { background: rgba(255,255,255,0.06); color: #F3EFE3; }
.tab-btn-active { background: rgba(201,143,42,0.18); color: #F6EFDC; }
.tab-btn-active svg { color: var(--mustard); }
.tab-count {
  margin-left: auto; font-size: 11px; background: rgba(255,255,255,0.12);
  padding: 1px 6px; border-radius: 999px; color: #EFE9DA;
}
.tab-btn-active .tab-count { background: var(--mustard); color: #241C0C; }

/* Content */
.content { flex: 1; padding: 26px 30px 34px; overflow-y: auto; }
.loading { color: var(--ink-soft); font-size: 14px; padding-top: 40px; text-align: center; }

.module { max-width: 760px; }
.module-head { margin-bottom: 18px; }
.module-sub { color: var(--ink-soft); font-size: 13px; margin: 4px 0 0; }
.calendar-head { display: flex; justify-content: space-between; align-items: flex-start; }
.month-nav { display: flex; align-items: center; gap: 4px; }

/* Buttons */
.icon-btn {
  border: none; background: transparent; color: var(--ink-soft); cursor: pointer;
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; transition: background 0.15s ease, color 0.15s ease;
}
.icon-btn:hover { background: var(--paper-line); color: var(--ink); }
.icon-btn-danger:hover { background: #F6DEDA; color: var(--overdue); }
.btn-ghost {
  background: none; border: 1px solid var(--paper-line); color: var(--ink-soft);
  font-size: 12.5px; padding: 5px 11px; border-radius: 7px; cursor: pointer;
}
.btn-ghost:hover { border-color: var(--forest); color: var(--forest); }
.btn-solid {
  background: var(--forest); color: #fff; border: none; font-size: 13px;
  padding: 7px 14px; border-radius: 7px; cursor: pointer; display: inline-flex;
  align-items: center; gap: 6px; font-weight: 500;
}
.btn-solid:hover { background: var(--forest-dark); }

/* Add form */
.add-trigger {
  display: flex; align-items: center; gap: 6px; background: var(--card);
  border: 1px dashed var(--paper-line); color: var(--forest); font-size: 13.5px;
  font-weight: 500; padding: 10px 14px; border-radius: 9px; cursor: pointer;
  margin-bottom: 18px; width: 100%; justify-content: center;
}
.add-trigger:hover { border-color: var(--forest); background: #F3F6F1; }
.add-form {
  background: var(--card); border: 1px solid var(--paper-line); border-radius: 10px;
  padding: 16px; margin-bottom: 18px; display: flex; flex-wrap: wrap; gap: 12px;
}
.field { display: flex; flex-direction: column; gap: 5px; }
.field-full { flex: 1 1 100%; }
.field-half { flex: 1 1 calc(50% - 6px); }
.field label { font-size: 11.5px; color: var(--ink-soft); font-weight: 500; }
.field input, .field select, .field textarea {
  border: 1px solid var(--paper-line); border-radius: 6px; padding: 7px 9px;
  font-size: 13.5px; font-family: inherit; color: var(--ink); background: var(--paper);
  resize: vertical;
}
.field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--forest); outline-offset: 0; border-color: var(--forest); }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; width: 100%; margin-top: 2px; }

/* Item list */
.item-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.item-row {
  display: flex; align-items: flex-start; gap: 10px; background: var(--card);
  border: 1px solid var(--paper-line); border-radius: 9px; padding: 11px 12px;
}
.item-done { opacity: 0.55; }
.item-done .item-title { text-decoration: line-through; }
.check-toggle { background: none; border: none; color: var(--forest); cursor: pointer; padding: 1px; display: flex; margin-top: 1px; }
.item-body { flex: 1; min-width: 0; }
.item-title-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.item-title { font-size: 14px; font-weight: 500; }
.item-course { font-size: 11.5px; color: var(--ink-soft); background: var(--paper); padding: 1px 7px; border-radius: 999px; border: 1px solid var(--paper-line); }
.item-notes { font-size: 12.5px; color: var(--ink-soft); margin: 3px 0 0; line-height: 1.4; }

.pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.pill-normal { background: #EEF2ED; color: var(--forest); }
.pill-soon { background: #FBF0DC; color: var(--mustard); }
.pill-urgent { background: #FAE4DC; color: var(--coral); }
.pill-overdue { background: #F6DEDA; color: var(--overdue); }

.todo-groups { display: flex; flex-direction: column; gap: 20px; }
.todo-group-label { font-size: 12px; font-weight: 700; text-transform: none; color: var(--ink-soft); margin: 0 0 8px 2px; letter-spacing: 0.01em; }
.todo-group-label.is-overdue { color: var(--overdue); }
.priority-toggle { background: none; border: none; padding: 0; cursor: pointer; }
.priority-pill { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.priority-high { background: #FAE4DC; color: var(--coral); }
.priority-medium { background: #FBF0DC; color: var(--mustard); }
.priority-low { background: #EAF0F7; color: var(--blue); }

.import-textarea {
  width: 100%; border: 1px solid var(--paper-line); border-radius: 9px; padding: 12px;
  font-size: 12.5px; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  background: var(--card); color: var(--ink); resize: vertical; margin-bottom: 12px;
}
.import-textarea:focus { outline: 2px solid var(--forest); border-color: var(--forest); }
.import-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.import-error { color: var(--overdue); font-size: 12.5px; display: flex; align-items: center; gap: 5px; }
.import-preview { background: var(--card); border: 1px solid var(--paper-line); border-radius: 10px; padding: 16px; }
.import-preview h3 { margin-bottom: 12px; }
.import-preview .item-list { margin-bottom: 14px; }
.import-type-select {
  border: 1px solid var(--paper-line); border-radius: 6px; padding: 5px 8px; font-size: 12.5px;
  background: var(--paper); color: var(--ink);
}

.section-divider { border: none; border-top: 1px solid var(--paper-line); margin: 26px 0; }

.backup-section h3 { margin-bottom: 4px; }
.backup-actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.backup-note { font-size: 12.5px; margin-top: 10px; }
.backup-note-success { color: var(--forest); }
.backup-note-error { color: var(--overdue); }

/* Recurring day picker */
.day-picker { display: flex; gap: 6px; flex-wrap: wrap; }
.day-chip {
  border: 1.5px solid var(--paper-line); background: var(--paper); color: var(--ink-soft);
  font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 999px; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.1s ease;
}
.day-chip:hover { border-color: var(--forest); color: var(--forest); }
.day-chip-active {
  background: var(--forest); border-color: var(--forest); color: #fff;
  transform: scale(1.05);
}
.day-chip-active:hover { background: var(--forest-dark); border-color: var(--forest-dark); color: #fff; }

/* Inline edit form nested in an item row */
.item-editing { padding: 0; border: none; background: none; }
.item-editing .add-form { margin-bottom: 0; width: 100%; }

/* Progress ring */
.progress-ring-text { font-size: 10px; font-weight: 700; fill: var(--ink); font-family: -apple-system, sans-serif; }
.todo-group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.todo-group-head .todo-group-label { margin: 0; }
.todo-group-ring-wrap { position: relative; }

/* Confetti */
.confetti-layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 999; overflow: hidden;
}
.confetti-piece {
  position: absolute; top: -12px; width: 8px; height: 8px; border-radius: 2px;
  animation-name: confetti-fall; animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-fill-mode: forwards;
}
@keyframes confetti-fall {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--drift), 320px) rotate(var(--rot)); opacity: 0; }
}

/* Calendar filters panel */
.cal-filters {
  width: 150px; flex-shrink: 0; background: var(--card); border: 1px solid var(--paper-line);
  border-radius: 10px; padding: 14px;
}
.cal-filters h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); margin-bottom: 8px; }
.cal-filters-classes-head { margin-top: 18px; }
.filter-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.filter-check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; cursor: pointer; }
.filter-check input { accent-color: var(--forest); cursor: pointer; }
.filter-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }

.empty { text-align: center; padding: 40px 10px; color: var(--ink-soft); }
.empty-title { font-size: 14px; font-weight: 500; margin: 10px 0 2px; color: var(--ink); }
.empty-hint { font-size: 12.5px; margin: 0; }

/* Habits */
.habit-add { display: flex; gap: 8px; margin-bottom: 18px; }
.habit-add input {
  flex: 1; border: 1px solid var(--paper-line); border-radius: 7px; padding: 8px 11px;
  font-size: 13.5px; background: var(--card);
}
.habit-add input:focus { outline: 2px solid var(--forest); border-color: var(--forest); }
.habit-table { background: var(--card); border: 1px solid var(--paper-line); border-radius: 10px; padding: 14px 16px; }
.habit-table-head, .habit-row { display: grid; grid-template-columns: 1fr repeat(7, 32px) 52px 28px; align-items: center; gap: 6px; }
.habit-table-head { padding-bottom: 10px; border-bottom: 1px solid var(--paper-line); margin-bottom: 8px; }
.habit-day-label { text-align: center; font-size: 10px; color: var(--ink-soft); line-height: 1.3; }
.habit-day-label.is-today { color: var(--forest); font-weight: 700; }
.habit-streak-col { text-align: center; font-size: 10.5px; color: var(--ink-soft); font-weight: 600; }
.habit-row { padding: 6px 0; }
.habit-name-col { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 7px; }
.habit-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
.habit-cell {
  width: 26px; height: 26px; border-radius: 7px; border: 1.5px solid var(--paper-line);
  background: var(--paper); cursor: pointer; display: flex; align-items: center; justify-content: center;
  margin: 0 auto; transition: transform 0.1s ease;
}
.habit-cell:hover { transform: scale(1.08); }
.habit-streak-value { color: var(--forest); }

/* Calendar */
.calendar-layout { display: flex; gap: 20px; margin-top: 16px; }
.calendar-grid { flex: 1; }
.calendar-dow-row { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 11px; color: var(--ink-soft); font-weight: 600; margin-bottom: 6px; }
.calendar-cells { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.cal-cell {
  aspect-ratio: 1; background: var(--card); border: 1px solid var(--paper-line); border-radius: 8px;
  cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between;
  padding: 6px; min-height: 52px;
}
.cal-cell:hover { border-color: var(--forest); }
.cal-cell-out { opacity: 0.35; }
.cal-date { font-size: 12px; color: var(--ink-soft); }
.cal-cell-today .cal-date { color: #fff; background: var(--forest); border-radius: 999px; width: 19px; height: 19px; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.cal-cell-selected { outline: 2px solid var(--mustard); outline-offset: -1px; }
.cal-dots { display: flex; gap: 3px; flex-wrap: wrap; }
.cal-dot { width: 6px; height: 6px; border-radius: 999px; }

.agenda { width: 210px; flex-shrink: 0; background: var(--card); border: 1px solid var(--paper-line); border-radius: 10px; padding: 14px; }
.agenda-empty { font-size: 12.5px; color: var(--ink-soft); }
.agenda-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.agenda-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; }
.agenda-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 5px; flex-shrink: 0; }
.agenda-label { font-weight: 500; }
.agenda-sub { color: var(--ink-soft); font-size: 12px; }

@media (max-width: 720px) {
  .planner-root { flex-direction: column; }
  .sidebar { width: auto; flex-direction: row; overflow-x: auto; padding: 12px; }
  .brand { display: none; }
  .tab-list { flex-direction: row; }
  .tab-btn span:not(.tab-count) { display: none; }
  .content { padding: 18px; }
  .calendar-layout { flex-direction: column; }
  .agenda { width: auto; }
  .cal-filters { width: auto; }
  .habit-table-head, .habit-row { grid-template-columns: 90px repeat(7, 1fr) 40px 24px; }
}
`;
