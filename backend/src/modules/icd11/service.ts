import { ExternalApiError } from './errors';

const TOKEN_URL = 'https://icdaccessmanagement.who.int/connect/token';
const WHO_API_BASE = 'https://id.who.int';
const DEFAULT_RELEASE = '2026-01';
const LINEARIZATION = 'mms';
// A doctor is waiting on this as they type; a slow lookup must fail fast, not hang the search box.
const REQUEST_TIMEOUT_MS = 8000;

// Two ways to reach ICD-11:
//   - ICD11_API_URL set: WHO's ICD-API running locally (the clinic's `icd-api` container, see
//     deploy/icd-api). Works with no internet and needs no credentials.
//   - otherwise: WHO's hosted API, which needs ICD11_CLIENT_ID/ICD11_CLIENT_SECRET and internet.
// ICD11_RELEASE must be a release the chosen API actually holds; the local container holds only
// the one it was built with.
const localApiUrl = () => process.env.ICD11_API_URL?.trim().replace(/\/+$/, '') || null;
const release = () => process.env.ICD11_RELEASE?.trim() || DEFAULT_RELEASE;

// fetch rejects (rather than returning !ok) when the service is down or times out. Those are
// upstream failures like any other — a 502 for the caller, not an unexpected server error.
const fetchUpstream = async (input: string | URL, init: RequestInit, failure: string): Promise<Response> => {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new ExternalApiError(failure);
  }
};

export interface Icd11Match {
  code: string;
  title: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

const getAccessToken = async (): Promise<string> => {
  const clientId = process.env.ICD11_CLIENT_ID;
  const clientSecret = process.env.ICD11_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ExternalApiError('ICD-11 API credentials are not configured');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetchUpstream(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'icdapi_access',
      }),
    },
    'Failed to authenticate with the ICD-11 API',
  );

  if (!res.ok) {
    throw new ExternalApiError('Failed to authenticate with the ICD-11 API');
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    // Refresh a minute early so an in-flight search never races token expiry.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
};

const stripHighlight = (title: string) => title.replace(/<\/?em[^>]*>/g, '');

const SEARCH_FAILED = 'ICD-11 search request failed';

// An ICD-11 code as a doctor would type it: a chapter character, a letter, a digit and one more
// character (CA23, 5A11, 1D2Z), optionally a subcategory after a dot (CA23.32). WHO's text search
// does not match codes, so these are looked up directly. Words never have a digit third, so
// "gout" or "rash" still go to the text search.
const CODE_PATTERN = /^[0-9A-Z][A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,2})?$/i;
// A code's subcategories are listed under it so the doctor can pick the specific one.
const MAX_SUBCATEGORIES = 12;

interface Icd11Entity {
  code?: string;
  title?: { '@value'?: string };
  classKind?: string;
  child?: string[];
}

interface Icd11Api {
  base: string;
  headers: Record<string, string>;
}

const connect = async (): Promise<Icd11Api> => {
  const local = localApiUrl();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'en',
    'API-Version': 'v2',
  };
  if (!local) headers.Authorization = `Bearer ${await getAccessToken()}`;
  return { base: local ?? WHO_API_BASE, headers };
};

const linearizationUrl = (api: Icd11Api, path: string) => `${api.base}/icd/release/11/${release()}/${LINEARIZATION}/${path}`;

// Entity ids are WHO URIs (http://id.who.int/...) even when a local API returns them, so only
// their path is used, against whichever API this is.
const getEntity = async (api: Icd11Api, uri: string): Promise<Icd11Entity> => {
  const res = await fetchUpstream(`${api.base}${new URL(uri).pathname}`, { headers: api.headers }, SEARCH_FAILED);
  if (!res.ok) throw new ExternalApiError(SEARCH_FAILED);
  return (await res.json()) as Icd11Entity;
};

// Only categories are diagnoses: a chapter or block has a code-like id but cannot be recorded.
const toMatch = (e: Icd11Entity): Icd11Match | null =>
  e.classKind === 'category' && e.code && e.title?.['@value'] ? { code: e.code, title: e.title['@value'] } : null;

const lookupCode = async (api: Icd11Api, code: string): Promise<Icd11Match[]> => {
  const res = await fetchUpstream(linearizationUrl(api, `codeinfo/${encodeURIComponent(code.toUpperCase())}`), { headers: api.headers }, SEARCH_FAILED);
  if (res.status === 404) return [];
  if (!res.ok) throw new ExternalApiError(SEARCH_FAILED);

  const { stemId } = (await res.json()) as { stemId?: string };
  if (!stemId) return [];
  const entity = await getEntity(api, stemId);
  const match = toMatch(entity);
  if (!match) return [];

  // The code itself is what was asked for; a subcategory that fails to load is simply left out.
  const children = await Promise.allSettled((entity.child ?? []).slice(0, MAX_SUBCATEGORIES).map((uri) => getEntity(api, uri)));
  const subcategories = children.flatMap((c) => (c.status === 'fulfilled' ? [toMatch(c.value)] : [])).filter((m): m is Icd11Match => !!m);
  return [match, ...subcategories];
};

const searchText = async (api: Icd11Api, query: string): Promise<Icd11Match[]> => {
  const url = new URL(linearizationUrl(api, 'search'));
  url.searchParams.set('q', query);

  const res = await fetchUpstream(url, { headers: api.headers }, SEARCH_FAILED);
  if (!res.ok) throw new ExternalApiError(SEARCH_FAILED);

  const data = (await res.json()) as { destinationEntities?: Array<{ theCode?: string; title?: string }> };
  return (data.destinationEntities ?? [])
    .filter((e) => !!e.theCode && !!e.title)
    .map((e) => ({ code: e.theCode as string, title: stripHighlight(e.title as string) }));
};

export const searchIcd11 = async (query: string): Promise<Icd11Match[]> => {
  const api = await connect();
  const trimmed = query.trim();
  if (CODE_PATTERN.test(trimmed)) {
    const matches = await lookupCode(api, trimmed);
    // Not a real code after all — fall back to searching it as text.
    if (matches.length > 0) return matches;
  }
  return searchText(api, query);
};
