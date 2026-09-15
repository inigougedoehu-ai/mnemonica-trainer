import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("includes the requested training controls", async () => {
  const source = await readFile(new URL("../app/trainer-app.tsx", import.meta.url), "utf8");
  for (const text of [
    "Toca para ver las opciones",
    "No la sé",
    "Sin límite",
    "Ruta guiada",
    "Precisión y velocidad",
    "Guardado en este dispositivo",
  ]) {
    assert.match(source, new RegExp(text));
  }
});

test("publishes an installable offline app shell", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.icons.length, 2);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /self\.registration\.scope/);
});

test("backend returns review priority and per-mode metrics", async () => {
  const backend = await readFile(new URL("../backend/Code.gs", import.meta.url), "utf8");
  assert.match(backend, /review_priority/);
  assert.match(backend, /modes: modeProgress/);
  assert.match(backend, /version: "1\.4\.0"/);
  assert.match(backend, /has_session/);
  assert.match(backend, /recent_attempts/);
  assert.match(backend, /lastFiveCorrect/);
});

test("keeps backend credentials on the device", async () => {
  const client = await readFile(new URL("../app/backend-client.ts", import.meta.url), "utf8");
  assert.match(client, /localStorage\.setItem/);
  assert.match(client, /mode: "no-cors"/);
  assert.match(client, /has_session/);
  assert.doesNotMatch(client, /[a-f0-9]{64}/i);
});

test("supports persistent light, dark, and system themes", async () => {
  const source = await readFile(new URL("../app/trainer-app.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /mnemonica\.theme\.v1/);
  assert.match(source, /Automático/);
  assert.match(source, /Claro/);
  assert.match(source, /Oscuro/);
  assert.match(styles, /html\[data-theme="dark"\]/);
  assert.match(layout, /prefers-color-scheme: dark/);
});
