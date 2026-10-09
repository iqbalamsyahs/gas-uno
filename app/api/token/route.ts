export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = body?.code;
  if (typeof code !== 'string' || !code) return Response.json({ error: 'code wajib diisi' }, { status: 400 });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
    }).toString(),
  });
  if (!res.ok) {
    // jawaban Discord tidak berisi secret; dicatat supaya secret/ID yang salah terlihat di log Vercel
    console.error('discord oauth2/token', res.status, await res.text());
    return Response.json({ error: 'gagal menukar token' }, { status: 502 });
  }

  const { access_token } = await res.json();
  return Response.json({ access_token });
}
