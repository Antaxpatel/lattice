import supabase from './supabase';

export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

export async function apiGet<T>(url: string, auth = false): Promise<T> {
  const headers = auth ? await authHeaders() : { 'Content-Type': 'application/json' };
  const res = await fetch(url, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function apiSend<T>(url: string, method: string, body?: unknown, auth = false): Promise<T> {
  const headers = auth ? await authHeaders() : { 'Content-Type': 'application/json' };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}
