import React from "react";

export type Contact = { id: string; name: string; role?: string; phone?: string; email?: string };

export default function ContactsField({
  label,
  contacts,
  setContacts,
  max = 6,
}: {
  label: string;
  contacts: Contact[];
  setContacts: (next: Contact[]) => void;
  max?: number;
}) {
  const add = () => {
    if (contacts.length >= max) return;
    setContacts([...contacts, { id: crypto.randomUUID(), name: "" }]);
  };
  const rm = (id: string) => setContacts(contacts.filter((c) => c.id !== id));
  const upd = (id: string, patch: Partial<Contact>) =>
    setContacts(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="col-span-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium">{label}</div>
        <button
          type="button"
          onClick={add}
          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/15"
          disabled={contacts.length >= max}
          title={contacts.length >= max ? "Max reached" : "Add contact"}
        >
          Add contact
        </button>
      </div>
      <div className="space-y-2">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-1 md:grid-cols-4 gap-2 p-2 rounded border border-white/10 bg-white/5"
          >
            <input
              placeholder="Name"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
              value={c.name || ""}
              onChange={(e) => upd(c.id, { name: e.target.value })}
            />
            <input
              placeholder="Role"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
              value={c.role || ""}
              onChange={(e) => upd(c.id, { role: e.target.value })}
            />
            <input
              placeholder="Phone"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
              value={c.phone || ""}
              onChange={(e) => upd(c.id, { phone: e.target.value })}
            />
            <div className="flex gap-2">
              <input
                placeholder="Email"
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                value={c.email || ""}
                onChange={(e) => upd(c.id, { email: e.target.value })}
              />
              <button
                type="button"
                onClick={() => rm(c.id)}
                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/15"
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {contacts.length === 0 && (
          <div className="text-sm text-slate-400">No contacts added.</div>
        )}
      </div>
    </div>
  );
}
