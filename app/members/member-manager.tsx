"use client";

import { useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  currentCycleHands: number;
  inCurrentCycle: boolean;
};

type Data = {
  cycle: { id: string; name: string } | null;
  members: Member[];
};

export default function MemberManager({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<Data>({ cycle: null, members: [] });
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load members.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createMember() {
    const cleanName = name.trim();
    if (!cleanName) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Unable to create member.");

      setName("");
      setMessage(cleanName + " was added to the master member register.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create member.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(id: string, changes: { name?: string; active?: boolean }) {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Unable to update member.");

      setEditing(null);
      setEditName("");
      setMessage("Member updated.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update member.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="card"><p className="muted">Loading members…</p></section>;
  }

  return (
    <>
      {isAdmin ? (
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Add member</h2>
              <p className="muted">Create a master member record for future cycle administration.</p>
            </div>
          </div>
          <div className="member-add-form">
            <label>
              <span>Member name</span>
              <input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createMember();
                }}
                placeholder="Example: Mary Johnson"
                disabled={saving}
              />
            </label>
            <button className="button" type="button" onClick={() => void createMember()} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Add member"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Member register</h2>
            <p className="muted">
              {data.members.length} master member{data.members.length === 1 ? "" : "s"}
              {data.cycle ? " · " + data.cycle.name : ""}
            </p>
          </div>
          <span className="badge">{data.members.filter((member) => member.active).length} active</span>
        </div>

        {data.members.length === 0 ? (
          <p className="muted">No members have been added yet.</p>
        ) : (
          <div className="member-list">
            {data.members.map((member) => (
              <article className={"member-row " + (member.active ? "" : "inactive")} key={member.id}>
                {editing === member.id ? (
                  <div className="member-edit">
                    <label>
                      <span>Member name</span>
                      <input
                        value={editName}
                        maxLength={120}
                        onChange={(event) => setEditName(event.target.value)}
                        disabled={saving}
                        autoFocus
                      />
                    </label>
                    <div className="member-actions">
                      <button
                        className="button"
                        type="button"
                        onClick={() => void updateMember(member.id, { name: editName.trim() })}
                        disabled={saving || !editName.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setEditName("");
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{member.name}</strong>
                      <div className="member-meta">
                        <span>
                          {member.inCurrentCycle
                            ? member.currentCycleHands + " current-cycle hands"
                            : "Not in active cycle"}
                        </span>
                        <span className={member.active ? "member-state active" : "member-state inactive-state"}>
                          {member.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    {isAdmin ? (
                      <div className="member-actions">
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => {
                            setEditing(member.id);
                            setEditName(member.name);
                            setError(null);
                            setMessage(null);
                          }}
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() =>
                            void updateMember(member.id, { active: !member.active })
                          }
                          disabled={saving}
                        >
                          {member.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
