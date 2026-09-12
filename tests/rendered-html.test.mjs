import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports a GitHub Pages-ready application", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /Mnemónica/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview/);
});
