"use client";

import React, { useState } from "react";
import Image from "next/image";

type Participant = {
  id: string;
  name: string;
  email: string;
};

type Assignment = {
  giver: Participant;
  recipient: Participant;
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignSecretSantas(participants: Participant[]): Assignment[] {
  const n = participants.length;
  if (n < 2) return [];

  // try shuffling to find a derangement (no one assigned to themselves)
  for (let attempt = 0; attempt < 1000; attempt++) {
    const recipients = shuffle(participants);
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (participants[i].id === recipients[i].id) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return participants.map((p, i) => ({ giver: p, recipient: recipients[i] }));
    }
  }

  // fallback: simple rotation (guaranteed derangement for n>1)
  return participants.map((p, i) => ({ giver: p, recipient: participants[(i + 1) % n] }));
}

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [encryptedTokens, setEncryptedTokens] = useState<string[] | null>(null);
  const [verification, setVerification] = useState<{ derangement: boolean; bijection: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  function addParticipant(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      setError("Please provide both name and email.");
      return;
    }
    const p: Participant = { id: uid(), name: n, email: em };
    setParticipants((prev) => [...prev, p]);
    setName("");
    setEmail("");
    setAssignments(null);
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    setAssignments(null);
  }

  function handleAssign() {
    setError(null);
    if (participants.length < 2) {
      setError("Add at least 2 participants to assign Santas.");
      return;
    }
    const res = assignSecretSantas(participants);
    setAssignments(res);
    setEncryptedTokens(null);
    setVerification(null);
    // kick off async creation of encrypted tokens and verification
    createEncryptedTokensAndVerify(res, participants);
  }

  async function createEncryptedTokensAndVerify(res: Assignment[], parts: Participant[]) {
    try {
      // verification: derangement and bijection
      const derangement = res.every((a) => a.giver.id !== a.recipient.id);
      const recipientIds = res.map((a) => a.recipient.id);
      const uniqueRecipients = new Set(recipientIds);
      const bijection = uniqueRecipients.size === parts.length;
      setVerification({ derangement, bijection });

      // create AES-GCM key and encrypt each recipient id
      if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
        // environment doesn't support Web Crypto — skip tokens
        setEncryptedTokens(null);
        return;
      }

      const subtle = window.crypto.subtle;
      const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
      const encoder = new TextEncoder();

      const toBase64 = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      };

      const tokens: string[] = [];
      for (const a of res) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const data = encoder.encode(a.recipient.id);
        const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, data);
        // combine iv + ct for a single token
        const combined = new Uint8Array(iv.byteLength + ct.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ct), iv.byteLength);
        tokens.push(toBase64(combined.buffer));
      }

      setEncryptedTokens(tokens);
      // Note: key is intentionally not saved or displayed — tokens cannot be decrypted here.
    } catch (e) {
      console.error(e);
      setError("Failed to create encrypted tokens.");
    }
  }

  async function sendEmails() {
    if (!assignments) return;
    setSendStatus("Sending emails via server...");
    try {
      const res = await fetch("/api/send-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendStatus(`Failed: ${data?.error || 'server error'}`);
      } else {
        setSendStatus(`Sent: ${data.success}/${data.total} emails`);
      }
    } catch (err) {
      setSendStatus("Network error while sending emails. Check the console for details.");
      console.error(err);
    }
    setTimeout(() => setSendStatus(null), 8000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-900 font-sans">
      <main className="w-full max-w-3xl py-16 px-6">
        <div className="mb-8 flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-white">Secret Santa Organizer</h1>
        </div>

        <form
          onSubmit={addParticipant}
          className="mb-6 flex flex-col gap-3 rounded-lg bg-red-800 p-6 shadow-sm border border-white"
        >
          <div className="flex gap-3">
            <input
              className="w-1/2 rounded-md border border-white bg-red-700 text-white px-3 py-2"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="w-1/2 rounded-md border border-white bg-red-700 text-white px-3 py-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:opacity-95 border border-white"
            >
              Add participant
            </button>
            <button
              type="button"
              onClick={handleAssign}
              className="ml-auto rounded-full bg-green-600 px-4 py-2 text-sm text-white hover:opacity-95 border border-white"
            >
              Assign Santas
            </button>
          </div>
          {error && <p className="text-sm text-red-200">{error}</p>}
        </form>

        <section className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-red-800 p-4 shadow-sm border border-white">
            <h2 className="mb-3 text-lg font-medium text-white">Participants ({participants.length})</h2>
            {participants.length === 0 ? (
              <p className="text-sm text-white/80">No participants yet.</p>
            ) : (
              <ul className="space-y-2">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="text-sm text-white/80">{p.email}</div>
                    </div>
                    <button
                      onClick={() => removeParticipant(p.id)}
                      className="rounded px-2 py-1 text-sm text-red-300 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg bg-red-800 p-4 shadow-sm border border-white">
            <h2 className="mb-3 text-lg font-medium text-white">Assignments (encrypted)</h2>
            {!assignments ? (
              <p className="text-sm text-white/80">No assignments yet. Click "Assign Santas" to create pairings.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {verification ? (
                  <div className="space-y-1 text-sm">
                    <div>
                      <strong>Derangement (no self-assignments): </strong>
                      <span className={verification.derangement ? "text-green-300" : "text-red-300"}>
                        {verification.derangement ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <div>
                      <strong>Bijection (all recipients unique): </strong>
                      <span className={verification.bijection ? "text-green-300" : "text-red-300"}>
                        {verification.bijection ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <p className="text-xs text-white/80">Assignments are shown below as non-decryptable tokens.</p>
                  </div>
                ) : (
                  <p className="text-sm text-white/80">Creating verification and encrypted tokens…</p>
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      // toggle show tokens by clearing when already present
                      if (encryptedTokens) setEncryptedTokens(null);
                      else if (assignments) createEncryptedTokensAndVerify(assignments, participants);
                    }}
                    className="rounded-full bg-green-600 px-3 py-1 text-sm text-white hover:opacity-95 border border-white"
                  >
                    {encryptedTokens ? "Hide tokens" : "(Re)create encrypted tokens"}
                  </button>
                </div>

                {encryptedTokens ? (
                  <ol className="list-decimal list-inside text-xs break-words text-white">
                    {encryptedTokens.map((t, i) => (
                      <li key={i} className="py-1">{t}</li>
                    ))}
                  </ol>
                ) : null}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={sendEmails}
                    className="rounded-full bg-green-600 px-4 py-2 text-sm text-white hover:opacity-95 border border-white"
                  >
                    Send emails to participants
                  </button>
                  {sendStatus ? <div className="mt-2 text-xs text-white/80">{sendStatus}</div> : null}
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="text-sm text-white/80">Made by @t0mtait</footer>
      </main>
    </div>
  );
}
