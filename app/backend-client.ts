"use client";

export type BackendConfig = {
  secret: string;
  email: string;
  name: string;
};

type BackendResponse<T> = {
  ok?: boolean;
  error?: string;
  progress?: T;
  exists?: boolean;
};

const BACKEND_URL =
  "https://script.google.com/macros/s/AKfycbxqx4Fj5clI1O2VHJNi-3at89XhfVs4rFlG9iz2_y7rkb8CWLlJWboCySaZO287T1wToA/exec";
const CONFIG_KEY = "mnemonica.backend.v1";

export function readBackendConfig(): BackendConfig | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONFIG_KEY) || "null") as Partial<BackendConfig> | null;
    if (!value?.secret || !value.email || !value.email.includes("@")) return null;
    return {
      secret: value.secret,
      email: value.email.trim().toLowerCase(),
      name: value.name?.trim() || value.email.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function saveBackendConfig(config: BackendConfig) {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify({
    secret: config.secret.trim(),
    email: config.email.trim().toLowerCase(),
    name: config.name.trim() || config.email.trim().toLowerCase(),
  }));
}

export function removeBackendConfig() {
  window.localStorage.removeItem(CONFIG_KEY);
}

function requireConfig() {
  const config = readBackendConfig();
  if (!config) throw new Error("Sincronización sin configurar");
  return config;
}

function jsonp<T>(action: "get_progress" | "has_session", values: Record<string, string> = {}) {
  const config = requireConfig();
  return new Promise<BackendResponse<T>>((resolve, reject) => {
    const callback = `__mnemonica_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const globalWindow = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("Google Sheets no ha respondido")), 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete globalWindow[callback];
    }

    function finish(error?: Error, data?: BackendResponse<T>) {
      cleanup();
      if (error) reject(error);
      else resolve(data || {});
    }

    globalWindow[callback] = (data: BackendResponse<T>) => finish(undefined, data);
    script.onerror = () => finish(new Error("No se ha podido leer Google Sheets"));
    const query = new URLSearchParams({
      action,
      secret: config.secret,
      email: config.email,
      name: config.name,
      callback,
      ...values,
    });
    script.src = `${BACKEND_URL}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

export async function getRemoteProgress<T>() {
  const data = await jsonp<T>("get_progress");
  if (!data.ok || !data.progress) throw new Error(data.error || "No se ha podido cargar el progreso");
  return data.progress;
}

async function postWithoutBlocking(body: unknown) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as BackendResponse<unknown>;
    if (!data.ok) throw new Error(data.error || "No se ha podido guardar la sesión");
    return;
  } catch {
    // Apps Script puede bloquear la lectura CORS de su respuesta aunque haya
    // recibido el POST. Repetir es seguro porque los ID de sesión son únicos.
    await fetch(BACKEND_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
  }
}

export async function saveRemoteSession<T>(payload: unknown) {
  const config = requireConfig();
  const sessionId = (payload as { session?: { session_id?: string } })?.session?.session_id;
  if (!sessionId) throw new Error("Sesión no válida");

  await postWithoutBlocking({
    action: "save_session",
    secret: config.secret,
    user: { email: config.email, name: config.name },
    payload,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 500 * attempt));
    const confirmation = await jsonp<T>("has_session", { session_id: sessionId });
    if (confirmation.ok && confirmation.exists) return getRemoteProgress<T>();
    if (confirmation.error) throw new Error(confirmation.error);
  }
  throw new Error("La sesión sigue pendiente de sincronización");
}
