import { QueryClient, QueryFunction } from "@tanstack/react-query";

function isHtmlBody(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly category?: string;
  readonly fieldErrors: Record<string, string>;
  readonly referenceId?: string;
  readonly retryable: boolean;

  constructor(
    status: number,
    fallbackMessage: string,
    payload?: Record<string, any>,
  ) {
    const details = payload?.error && typeof payload.error === "object"
      ? payload.error
      : payload || {};
    super(details.message || payload?.message || fallbackMessage);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = details.code || payload?.code || payload?.error_code;
    this.category = details.category || payload?.category;
    this.fieldErrors = details.fieldErrors || payload?.fieldErrors || {};
    this.referenceId = details.referenceId || payload?.referenceId;
    this.retryable = details.retryable === true || payload?.retryable === true;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // When the auth proxy intercepts the request (session expired) it returns
    // an HTML page with status 401 or 403 instead of a JSON error. Normalize
    // those into a recognisable SESSION_EXPIRED sentinel so callers can show a
    // useful "please refresh" message instead of dumping raw HTML.
    if ((res.status === 401 || res.status === 403) && isHtmlBody(text)) {
      throw new Error(`SESSION_EXPIRED:${res.status}`);
    }
    let payload: Record<string, any> | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") payload = parsed;
    } catch {
      // Non-JSON API errors retain the existing status/body fallback below.
    }
    throw new ApiRequestError(res.status, `${res.status}: ${text}`, payload);
  }
}

type ApiRequestOptions = {
  headers?: Record<string, string>;
};

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: ApiRequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    // Tell any intermediate proxy/CDN not to serve a cached response for
    // mutating requests.  The server already sends Cache-Control: no-store
    // on all /api responses, but belt-and-suspenders here prevents the
    // browser's own HTTP cache from re-using a prior response.
    "Cache-Control": "no-cache",
    ...options?.headers,
  };
  if (data) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      // Prevent the browser / CDN from serving a stale cached response.
      // The server also sends Cache-Control: no-store so new responses are
      // never stored, but this header ensures we always ask for a fresh copy.
      headers: { "Cache-Control": "no-cache" },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // Most DriverHub data is operationally important but not live-streaming.
      // Polling every mounted query caused pages with many data panels (notably
      // Recruiting) to create periodic request bursts and exhaust shared proxy
      // limits during ordinary navigation. Live screens opt in explicitly.
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
