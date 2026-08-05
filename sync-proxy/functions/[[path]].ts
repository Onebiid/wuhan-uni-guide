const WORKER_ORIGIN = 'https://whu-couple-map-sync.fyhzxy.workers.dev';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);

interface Env {
  SYNC: Fetcher;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const source = new URL(request.url);
  if (!ALLOWED_METHODS.has(request.method) || (source.pathname !== '/health' && !source.pathname.startsWith('/v1/'))) {
    return new Response('Not found', { status: 404 });
  }

  const target = new URL(source.pathname + source.search, WORKER_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');

  return env.SYNC.fetch(new Request(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  }));
};
