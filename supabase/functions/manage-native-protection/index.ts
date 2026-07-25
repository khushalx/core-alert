import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = { action?: unknown; installationId?: unknown };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'AUTH_REQUIRED' }, 401);
    const body = await request.json() as Body;
    if (!isUuid(body.installationId)) return json({ error: 'INVALID_INSTALLATION_ID' }, 400);

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceRoleKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: 'INVALID_SESSION' }, 401);

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    if (body.action === 'revoke') {
      await admin.from('protection_devices')
        .update({ enabled: false })
        .eq('user_id', userData.user.id)
        .eq('installation_id', body.installationId);
      return json({ revoked: true });
    }
    if (body.action !== 'register') return json({ error: 'INVALID_ACTION' }, 400);

    const secret = randomSecret();
    const secretHash = await sha256(secret);
    const { data, error } = await admin.from('protection_devices').upsert({
      user_id: userData.user.id,
      installation_id: body.installationId,
      secret_hash: secretHash,
      platform: 'android',
      enabled: true,
      last_used_at: null,
    }, { onConflict: 'user_id,installation_id' }).select('id').single();
    if (error || !data) return json({ error: 'REGISTRATION_FAILED' }, 500);
    return json({ deviceId: data.id, deviceSecret: secret });
  } catch {
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
