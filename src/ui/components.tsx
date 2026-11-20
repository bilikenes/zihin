import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
} from "react";
import type {
  ChangeEvent, HTMLAttributes, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Glass } from "glisse";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Info, Sparkles, X } from "lucide-react";

export type Tone = "accent" | "neutral" | "success" | "danger" | "info";
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const TONE_ICON = { accent: Sparkles, neutral: Info, success: CheckCircle2, danger: AlertTriangle, info: Info };

/* ---------- Card ---------- */
export function Card({ title, description, actions, footer, glass, className, children, ...rest }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; footer?: ReactNode; glass?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const inner = (
    <>
      {(title || actions) && (
        <div className="ui-card-head">
          <div>
            {title && <h3 className="ui-card-title">{title}</h3>}
            {description && <p className="ui-card-desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="ui-card-body">{children}</div>
      {footer && <div className="ui-card-foot">{footer}</div>}
    </>
  );
  return glass
    ? <Glass className={cx("ui-card is-glass", className)} {...rest}>{inner}</Glass>
    : <div className={cx("ui-card", className)} {...rest}>{inner}</div>;
}

/* ---------- Badge ---------- */
/**
 * Solid status label. Fill = tone colour; text colour comes from --color-on-* tokens,
 * which are picked per mode so contrast stays >= 4.5:1 (never hardcode white).
 */
export function Badge({ tone = "accent", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return <span className={`ui-badge tone-${tone}`}>{icon}{children}</span>;
}

/* ---------- Alert ---------- */
/** Glass surface; colour lives only in the icon, text stays neutral. */
export function Alert({ tone = "info", title, children, onClose, action }: {
  tone?: Exclude<Tone, "neutral">; title?: ReactNode; children?: ReactNode; onClose?: () => void; action?: ReactNode;
}) {
  const I = TONE_ICON[tone];
  return (
    <Glass className={`ui-alert tone-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="ui-alert-icon"><I size={18} /></span>
      <div className="ui-alert-body">
        {title && <p className="ui-alert-title">{title}</p>}
        {children && <p className="ui-alert-text">{children}</p>}
        {action && <div className="ui-alert-action">{action}</div>}
      </div>
      {onClose && <button className="ui-icon-btn" aria-label="Kapat" onClick={onClose}><X size={16} /></button>}
    </Glass>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, src, size = "md" }: { name: string; src?: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`ui-avatar size-${size}`} title={name} aria-label={name} role="img">
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}
export function AvatarGroup({ children }: { children: ReactNode }) {
  return <div className="ui-avatar-group">{children}</div>;
}

/* ---------- Field wrapper ---------- */
export function Field({ label, hint, error, children }: {
  label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx("ui-field", !!error && "has-error")}>
      {label && <label className="ui-field-label" htmlFor={id}>{label}</label>}
      {children(id)}
      {error ? <span className="ui-field-error">{error}</span> : hint && <span className="ui-field-hint">{hint}</span>}
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  // Same glass shell as glisse <Input>, so the two always look alike.
  return (
    <Glass className="lg-input ui-textarea-glass">
      <textarea {...props} className={cx("ui-textarea", props.className)} />
    </Glass>
  );
}

/** Themed dropdown (replaces native <select>, whose option list can't be styled). */
export type SelectOption = { value: string; label: string; icon?: ReactNode; description?: string };
export function Select({ options, value, defaultValue, onValueChange, placeholder = "Seç…", id, disabled, invalid, "aria-label": ariaLabel }: {
  options: SelectOption[]; value?: string; defaultValue?: string; onValueChange?: (v: string) => void;
  placeholder?: string; id?: string; disabled?: boolean; invalid?: boolean; "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === current);

  const choose = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.value === current);
    setActive(i < 0 ? 0 : i);
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive((a) => Math.min(last, a + 1)); break;
      case "ArrowUp": e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(last); break;
      case "Enter": case " ": e.preventDefault(); choose(options[active].value); break;
      case "Escape": e.preventDefault(); setOpen(false); break;
      case "Tab": setOpen(false); break;
    }
  };

  return (
    <div className={cx("ui-select-root", open && "is-open")} ref={rootRef}>
      <Glass className={cx("lg-input ui-select-glass", invalid && "is-invalid")}>
      <button
        id={id} type="button" disabled={disabled}
        className={cx("ui-select", !selected && "is-placeholder", invalid && "is-invalid")}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
      >
        {selected?.icon}
        <span className="ui-select-value">{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className="ui-select-chevron" />
      </button>
      </Glass>
      {open && (
        <ul className="ui-select-pop" role="listbox" id={listId} ref={listRef}>
          {options.map((o, i) => (
            <li
              key={o.value} id={`${listId}-${i}`} data-index={i} role="option"
              aria-selected={o.value === current} data-active={i === active || undefined}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o.value)}
            >
              {o.icon && <span className="ui-select-opt-icon">{o.icon}</span>}
              <span className="ui-select-opt-text">
                {o.label}
                {o.description && <small>{o.description}</small>}
              </span>
              {o.value === current && <Check size={16} className="ui-select-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Checkbox / Radio ---------- */
/** Round (iOS-like) checkbox. */
export function Checkbox({ label, onCheckedChange, ...props }: {
  label: ReactNode; onCheckedChange?: (c: boolean) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="ui-check">
      <input type="checkbox" {...props} onChange={(e: ChangeEvent<HTMLInputElement>) => { props.onChange?.(e); onCheckedChange?.(e.target.checked); }} />
      {label}
    </label>
  );
}

/**
 * Radio as a pill: the selected option changes colour, with no tick mark, so the
 * pill never changes size. Native radio underneath: arrow keys move between options.
 */
export function Radio({ label, icon, ...props }: { label: ReactNode; icon?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="ui-radio">
      <input type="radio" className="ui-sr-only" {...props} />
      {icon}{label}
    </label>
  );
}

/** A set of Radio pills sharing one name. */
export function RadioGroup({ name, options, value, defaultValue, onValueChange, "aria-label": ariaLabel }: {
  name?: string; options: { value: string; label: ReactNode; icon?: ReactNode; disabled?: boolean }[];
  value?: string; defaultValue?: string; onValueChange?: (v: string) => void; "aria-label"?: string;
}) {
  const auto = useId();
  const n = name ?? auto;
  return (
    <div className="ui-radio-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <Radio
          key={o.value} name={n} value={o.value} label={o.label} icon={o.icon} disabled={o.disabled}
          {...(value !== undefined ? { checked: value === o.value } : { defaultChecked: defaultValue === o.value })}
          onChange={() => onValueChange?.(o.value)}
        />
      ))}
    </div>
  );
}

/** Selectable tile: a checkbox or radio with a title, description and optional icon. */
export function ChoiceCard({ type = "radio", title, description, icon, onCheckedChange, ...props }: {
  type?: "radio" | "checkbox"; title: ReactNode; description?: ReactNode; icon?: ReactNode; onCheckedChange?: (c: boolean) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "title">) {
  return (
    <label className={`ui-choice type-${type}`}>
      <input type={type} className="ui-sr-only" {...props} onChange={(e) => { props.onChange?.(e); onCheckedChange?.(e.target.checked); }} />
      {icon && <span className="ui-choice-icon">{icon}</span>}
      <span className="ui-choice-text">
        <span className="ui-choice-title">{title}</span>
        {description && <span className="ui-choice-desc">{description}</span>}
      </span>
      <span className="ui-choice-mark" aria-hidden><Check size={14} strokeWidth={3} /></span>
    </label>
  );
}

/** Multi-select pill for filters and tags. Same look as Radio; selection = colour change only. */
export function Chip({ label, icon, onCheckedChange, ...props }: {
  label: ReactNode; icon?: ReactNode; onCheckedChange?: (c: boolean) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="ui-radio">
      <input type="checkbox" className="ui-sr-only" {...props} onChange={(e) => { props.onChange?.(e); onCheckedChange?.(e.target.checked); }} />
      {icon}{label}
    </label>
  );
}

/** Settings-style list row: label on the left, check mark on the right when selected. */
export function ListOption({ type = "radio", label, description, onCheckedChange, ...props }: {
  type?: "radio" | "checkbox"; label: ReactNode; description?: ReactNode; onCheckedChange?: (c: boolean) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="ui-listopt">
      <input type={type} className="ui-sr-only" {...props} onChange={(e) => { props.onChange?.(e); onCheckedChange?.(e.target.checked); }} />
      <span className="ui-listopt-text">{label}{description && <small>{description}</small>}</span>
      <Check size={18} strokeWidth={2.5} className="ui-listopt-mark" aria-hidden />
    </label>
  );
}
export const ListGroup = ({ children }: { children: ReactNode }) => <div className="ui-listgroup" role="group">{children}</div>;

/* ---------- Progress / Spinner / Skeleton ---------- */
export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="ui-progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="ui-progress-bar" style={{ width: `${v}%` }} />
    </div>
  );
}
export const Spinner = ({ label = "Yükleniyor" }: { label?: string }) => <span className="ui-spinner" role="status" aria-label={label} />;
export const Skeleton = ({ width = "100%", height = 14, radius }: { width?: number | string; height?: number | string; radius?: string }) =>
  <span className="ui-skeleton" style={{ display: "block", width, height, borderRadius: radius }} aria-hidden />;

/* ---------- Tooltip / Kbd ---------- */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return <span className="ui-tooltip">{children}<span className="ui-tooltip-bubble" role="tooltip">{content}</span></span>;
}
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="ui-kbd">{children}</kbd>;

/* ---------- Table ---------- */
export type Column<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; align?: "left" | "right" };
export function Table<T>({ columns, rows, rowKey }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.align === "right" ? "align-right" : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>{columns.map((c) => <td key={c.key} className={c.align === "right" ? "align-right" : undefined}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; children?: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Glass ref={ref} className="ui-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ui-modal-head">
          <h2 className="ui-modal-title" id={titleId}>{title}</h2>
          <button className="ui-icon-btn" aria-label="Kapat" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </Glass>
    </div>,
    document.body,
  );
}

/* ---------- Toast ---------- */
type ToastItem = { id: number; tone: Exclude<Tone, "neutral">; title: ReactNode; text?: ReactNode };
const ToastCtx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children, duration = 4000 }: { children: ReactNode; duration?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => remove(id), duration);
  }, [duration, remove]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="ui-toasts" aria-live="polite">
          {items.map((t) => {
            const I = TONE_ICON[t.tone];
            return (
              <Glass key={t.id} className={`ui-toast tone-${t.tone}`}>
                <I className="ui-toast-icon" size={18} />
                <div style={{ flex: 1 }}>
                  <p className="ui-toast-title">{t.title}</p>
                  {t.text && <p className="ui-toast-text">{t.text}</p>}
                </div>
                <button className="ui-icon-btn" aria-label="Kapat" onClick={() => remove(t.id)}><X size={16} /></button>
              </Glass>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Navbar ---------- */
export function Navbar({ brand, links, active, onNavigate, actions }: {
  brand: ReactNode; links: { value: string; label: ReactNode }[]; active?: string;
  onNavigate?: (v: string) => void; actions?: ReactNode;
}) {
  return (
    <Glass className="ui-navbar">
      <div className="ui-navbar-brand">{brand}</div>
      <nav className="ui-navbar-links">
        {links.map((l) => (
          <button key={l.value} className="ui-navbar-link" aria-current={l.value === active ? "page" : undefined} onClick={() => onNavigate?.(l.value)}>{l.label}</button>
        ))}
      </nav>
      <div className="ui-navbar-actions">{actions}</div>
    </Glass>
  );
}

/* ---------- Sidebar ---------- */
export type SidebarEntry = { value: string; label: ReactNode; icon?: ReactNode; badge?: ReactNode } | { section: ReactNode };
export function Sidebar({ items, active, onSelect }: { items: SidebarEntry[]; active?: string; onSelect?: (v: string) => void }) {
  return (
    <Glass className="ui-sidebar">
      {items.map((it, i) => "section" in it
        ? <div key={i} className="ui-sidebar-section">{it.section}</div>
        : (
          <button key={it.value} className="ui-sidebar-item" aria-current={it.value === active ? "page" : undefined} onClick={() => onSelect?.(it.value)}>
            {it.icon}{it.label}{it.badge}
          </button>
        ))}
    </Glass>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <div className="ui-empty-icon">{icon}</div>
      <h3 className="ui-empty-title">{title}</h3>
      {description && <p className="ui-empty-text">{description}</p>}
      {action}
    </div>
  );
}
