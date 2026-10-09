import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const req = (body: unknown) => new Request('http://localhost/api/token', { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/token', () => {
  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = 'id-123';
    process.env.DISCORD_CLIENT_SECRET = 'secret-456';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('menukar code menjadi access_token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: 'tok', token_type: 'Bearer' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(req({ code: 'abc' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'tok' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://discord.com/api/oauth2/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('client_id')).toBe('id-123');
    expect(body.get('client_secret')).toBe('secret-456');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('abc');
  });

  it('400 kalau code tidak ada atau body rusak', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(new Request('http://localhost/api/token', { method: 'POST', body: 'bukan json' }))).status).toBe(400);
  });

  it('502 kalau Discord menolak, tanpa membocorkan secret', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid_grant', { status: 400 })));
    const res = await POST(req({ code: 'basi' }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('secret-456');
  });
});
