import { NextResponse } from "next/server";

type Participant = {
  id: string;
  name: string;
  email: string;
};

type Assignment = {
  giver: Participant;
  recipient: Participant;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const assignments: Assignment[] = body.assignments;
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: "no assignments" }, { status: 400 });
    }

    // Maileroo configuration - set these local env vars
    // MAILEROO_API_KEY
    // MAILEROO_API_URL 
    // MAILEROO_FROM 

    const MAILEROO_API_KEY = process.env.MAILEROO_API_KEY;
    const MAILEROO_API_URL = process.env.MAILEROO_API_URL || process.env.MAILEROO_URL;
    const MAILEROO_FROM = process.env.MAILEROO_FROM;
    // Optional clearer env vars
    const MAILEROO_FROM_ADDRESS = process.env.MAILEROO_FROM_ADDRESS;
    const MAILEROO_FROM_NAME = process.env.MAILEROO_FROM_NAME;

    // helper to parse strings like "Name <email@domain>"
    function parseFromString(fromStr: string) {
      const m = /^(.*)\s*<([^>]+)>\s*$/.exec(fromStr);
      if (m) return { name: m[1].trim(), address: m[2].trim() };
      if (/^[^@\s]+@[^@\s]+$/.test(fromStr)) return { name: "", address: fromStr };
      return { name: "", address: "" };
    }

    if (!MAILEROO_API_KEY || !MAILEROO_API_URL) {
      console.warn('Maileroo not configured - MAILEROO_API_KEY or MAILEROO_API_URL missing');
      return NextResponse.json({ error: "Maileroo not configured on server - set MAILEROO_API_KEY and MAILEROO_API_URL" }, { status: 500 });
    }

    const results: Array<{ to: string; ok: boolean; status: number; body?: any }> = [];
    let success = 0;

    console.log('Maileroo configured?', !!MAILEROO_API_KEY, 'URL:', MAILEROO_API_URL);
    for (const a of assignments) {
      console.log('Sending Maileroo request for giver:', a.giver.email, 'recipient:', a.recipient.email);
      const bodyText = `Hi ${a.giver.name},\n\nYou have been assigned to give a gift to ${a.recipient.name} (${a.recipient.email}).\n\nHappy gifting!`;
      // Maileroo expects the 'to' array to contain objects with an 'address' field (string)
      // Determine 'from' as an object with 'address' and optional 'display_name'
      let fromAddress = MAILEROO_FROM_ADDRESS || "";
      let fromName = MAILEROO_FROM_NAME || "";
      if (!fromAddress) {
        // MAILEROO_FROM may be undefined; only parse when it's a non-empty string.
        const parsed = MAILEROO_FROM ? parseFromString(MAILEROO_FROM) : { name: "", address: "" };
        fromAddress = parsed.address || fromAddress;
        fromName = parsed.name || fromName || "Secret Santa";
      }
      if (!fromAddress) fromAddress = "no-reply@example.com";

      const fromObj: any = { address: fromAddress };
      if (fromName) fromObj.display_name = fromName;

      const payload = {
        from: fromObj,
        to: [{ address: a.giver.email, name: a.giver.name }],
        subject: "Secret Santa assignment",
        text: bodyText,
        // include html and content fields as some Maileroo endpoints expect multipart/content arrays
        html: `<p>Hi ${a.giver.name},</p><p>You have been assigned to shop for <strong>${a.recipient.name}</strong> (${a.recipient.email}).</p><p>Happy gifting!</p>`,
        content: [
          { type: "text/plain", value: bodyText },
          { type: "text/html", value: `<p>Hi ${a.giver.name},</p><p>You have been assigned to shop for <strong>${a.recipient.name}</strong> (${a.recipient.email}).</p><p>Happy gifting!</p>` },
        ],
      };

      const res = await fetch(MAILEROO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MAILEROO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let parsed: any = null;
      try {
        parsed = await res.json();
      } catch (_) {
        parsed = null;
      }

      // debug logs
      try {
        console.log('Maileroo response for', a.giver.email, 'status=', res.status, 'ok=', res.ok, 'body=', parsed);
      } catch (e) {
        console.warn('Failed to log Maileroo response for', a.giver.email);
      }

      results.push({ to: a.giver.email, ok: res.ok, status: res.status, body: parsed });
      if (res.ok) success++;
    }

    return NextResponse.json({ success, total: assignments.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
