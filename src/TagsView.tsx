import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, Input, Menu, Modal, SearchField, Table, Textarea, useToast, type Column } from "./ui";
import { copyText, deleteTag, saveTag, type Entry } from "./api";

/** Tabloda görünen not en fazla bu kadar karakter olur; tamamı düzenleme penceresinde. */
const NOTE_MAX = 40;
const COPIED_MS = 1400;

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

interface Draft {
  original: string | null;
  tag: string;
  value: string;
  note: string;
}

const emptyDraft: Draft = { original: null, tag: "", value: "", note: "" };

/** Değer gizli gösterilir; tıklayınca panoya kopyalanır ve yeşil çerçeveyle onaylanır. */
function SecretCell({ entry, prefix }: { entry: Entry; prefix: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await copyText(entry.value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch (e) {
      toast({ tone: "danger", title: "Kopyalanamadı", text: String(e) });
    }
  };

  return (
    <button
      type="button"
      className={`app-secret${copied ? " is-copied" : ""}`}
      aria-label={`${prefix}${entry.tag} değerini kopyala`}
      title="Kopyalamak için tıkla"
      onClick={() => void copy()}
    >
      {copied ? (
        <>
          <Check size={16} />
          Kopyalandı
        </>
      ) : (
        <>
          ••••••••
          <Copy size={14} />
        </>
      )}
    </button>
  );
}

export function TagsView({ entries, prefix, onChanged }: { entries: Entry[]; prefix: string; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [toDelete, setToDelete] = useState<Entry | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.tag.includes(q) || (e.note ?? "").toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  const openNew = () => { setDraft(emptyDraft); setError(undefined); };
  const openEdit = (e: Entry) => {
    setDraft({ original: e.tag, tag: e.tag, value: e.value, note: e.note ?? "" });
    setError(undefined);
  };
  // Sabit kimlik şart: Modal, onClose değiştikçe odağı kendine çeker ve yazarken alan odağı kaybeder.
  const closeForm = useCallback(() => setDraft(null), []);
  const closeDelete = useCallback(() => setToDelete(null), []);

  // Modal kendi kapsayıcısına odaklanır; açıldıktan sonra Tag alanına geçelim.
  const formOpen = draft !== null;
  useEffect(() => {
    if (!formOpen) return;
    const t = window.setTimeout(() => document.getElementById("tag-input")?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [formOpen]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    try {
      const saved = await saveTag({ original: draft.original, tag: draft.tag, value: draft.value, note: draft.note });
      toast({ tone: "success", title: "Kaydedildi", text: `${prefix}${saved.tag}` });
      closeForm();
      await onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteTag(toDelete.tag);
      toast({ tone: "info", title: "Silindi", text: `${prefix}${toDelete.tag}` });
    } catch (e) {
      toast({ tone: "danger", title: "Silinemedi", text: String(e) });
    }
    setToDelete(null);
    await onChanged();
  };

  const columns: Column<Entry>[] = [
    { key: "tag", header: "Tag", render: (r) => <strong>{prefix}{r.tag}</strong> },
    { key: "value", header: "Değer", render: (r) => <SecretCell entry={r} prefix={prefix} /> },
    {
      key: "note",
      header: "Not",
      render: (r) => <span className="app-note" title={r.note ?? undefined}>{r.note ? truncate(r.note, NOTE_MAX) : ""}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Menu
          aria-label={`${prefix}${r.tag} işlemleri`}
          align="end"
          items={[
            { label: "Düzenle", icon: <Pencil size={16} />, onSelect: () => openEdit(r) },
            "separator",
            { label: "Sil", icon: <Trash2 size={16} />, destructive: true, onSelect: () => setToDelete(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="ui-stack is-loose">
      <div className="ui-row is-between app-page-head">
        <div>
          <h1 className="ui-title">Tag'ler</h1>
          <p className="ui-muted">{prefix}tag yazıp tetikleyici tuşa bas, değeri gelsin.</p>
        </div>
        <Button variant="filled" icon={<Plus size={18} />} onClick={openNew}>Yeni tag</Button>
      </div>

      <SearchField value={query} onValueChange={setQuery} placeholder="Tag veya notlarda ara" />

      {entries.length === 0 ? (
        <EmptyState
          icon={<Tag size={26} />}
          title="Henüz tag yok"
          description="İlk tag'ini ekleyerek başla."
          action={<Button variant="filled" onClick={openNew}>Yeni tag</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Tag size={26} />} title="Eşleşen tag yok" description="Aramayı değiştirmeyi dene." />
      ) : (
        <div className="app-table">
          <Table columns={columns} rows={visible} rowKey={(r) => r.tag} />
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={closeForm}
        title={draft?.original ? `${prefix}${draft.original} düzenle` : "Yeni tag"}
        footer={
          <>
            <Button type="button" onClick={closeForm}>Vazgeç</Button>
            <Button type="submit" form="tag-form" variant="filled" disabled={!draft?.tag || !draft?.value}>Kaydet</Button>
          </>
        }
      >
        {draft && (
          <form id="tag-form" className="ui-stack" onSubmit={(ev) => void submit(ev)}>
            <Field label="Tag" hint="Harf, rakam, - ve _ kullanılabilir." error={error}>
              {() => <Input id="tag-input" value={draft.tag} onValueChange={(v) => setDraft({ ...draft, tag: v })} placeholder="mail" />}
            </Field>
            <Field label="Değer">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  value={draft.value}
                  onValueChange={(v) => setDraft({ ...draft, value: v })}
                  placeholder="test@test.com"
                />
              )}
            </Field>
            <Field label="Not">
              {(id) => <Textarea id={id} rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />}
            </Field>
          </form>
        )}
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={closeDelete}
        title={`${prefix}${toDelete?.tag ?? ""} silinsin mi?`}
        footer={
          <>
            <Button onClick={closeDelete}>Vazgeç</Button>
            <Button variant="filled" destructive onClick={() => void remove()}>Sil</Button>
          </>
        }
      >
        Bu işlem geri alınamaz.
      </Modal>
    </div>
  );
}
