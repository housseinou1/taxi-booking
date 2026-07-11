import React, { useEffect, useState } from "react";

import {
  MAX_TRUSTED_CONTACTS,
  deleteTrustedContact,
  fetchTrustedContacts,
  saveTrustedContact,
} from "./safetyApi";

export default function TrustedContactsSection({ compact = false }) {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ name: "", phone_number: "", relationship: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await fetchTrustedContacts();
      setContacts(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    if (contacts.length >= MAX_TRUSTED_CONTACTS) {
      setMessage(`You can save up to ${MAX_TRUSTED_CONTACTS} trusted contacts.`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await saveTrustedContact(form);
      setForm({ name: "", phone_number: "", relationship: "" });
      setMessage("Trusted contact saved.");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (contactId) => {
    setBusy(true);
    try {
      await deleteTrustedContact(contactId);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`trusted-contacts${compact ? " trusted-contacts--compact" : ""}`}>
      <style>{`
        .trusted-contacts { display: grid; gap: 12px; }
        .trusted-contacts h3 { margin: 0; }
        .trusted-contacts p { margin: 0; color: #64748b; }
        .trusted-contacts__list { display: grid; gap: 8px; }
        .trusted-contacts__item {
          display: flex; justify-content: space-between; gap: 12px; align-items: center;
          border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #fff;
        }
        .trusted-contacts form { display: grid; gap: 8px; }
        .trusted-contacts input {
          width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px;
        }
        .trusted-contacts button {
          min-height: 40px; border: 0; border-radius: 8px; background: #087a45; color: #fff; font-weight: 800;
        }
        .trusted-contacts button[type="button"] { background: #fee2e2; color: #991b1b; min-height: auto; padding: 6px 10px; }
        .trusted-contacts__message { color: #0f766e; font-weight: 700; }
      `}</style>
      <div>
        <h3>Trusted contacts</h3>
        <p>Add up to {MAX_TRUSTED_CONTACTS} people who can receive your live trip link.</p>
      </div>
      <div className="trusted-contacts__list">
        {contacts.map((contact) => (
          <div key={contact.id} className="trusted-contacts__item">
            <div>
              <strong>{contact.name}</strong>
              <div>{contact.phone_number}</div>
              {contact.relationship ? <small>{contact.relationship}</small> : null}
            </div>
            <button type="button" onClick={() => handleDelete(contact.id)} disabled={busy}>
              Remove
            </button>
          </div>
        ))}
      </div>
      {contacts.length < MAX_TRUSTED_CONTACTS ? (
        <form onSubmit={handleSave}>
          <input
            required
            placeholder="Contact name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            required
            placeholder="Phone number"
            value={form.phone_number}
            onChange={(event) => setForm({ ...form, phone_number: event.target.value })}
          />
          <input
            placeholder="Relationship (optional)"
            value={form.relationship}
            onChange={(event) => setForm({ ...form, relationship: event.target.value })}
          />
          <button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Add trusted contact"}
          </button>
        </form>
      ) : null}
      {message ? <div className="trusted-contacts__message">{message}</div> : null}
    </section>
  );
}
