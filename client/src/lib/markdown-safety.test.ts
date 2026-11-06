import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const helpRequire = createRequire(path.join(realpathSync("node_modules/streamdown"), "package.json"));
const renderers = [
  ["help", helpRequire("katex")],
  ["diagrams", createRequire(helpRequire.resolve("mermaid"))("katex")],
] as const;

describe.each(renderers)("patched %s math rendering", (_name, renderer) => {
  it("still renders ordinary maths used in help content", () => {
    expect(renderer.renderToString("x^2 + y^2")).toContain('class="katex"');
  });
  it("does not enable links without explicit trust", () => {
    expect(renderer.renderToString(String.raw`\href{https://example.invalid}{link}`, { throwOnError: false })).not.toContain('href="https://example.invalid"');
  });
  it("does not inherit trust from an options prototype", () => {
    const options = Object.assign(Object.create({ trust: true }), { throwOnError: false });
    expect(renderer.renderToString(String.raw`\href{https://example.invalid}{link}`, options)).not.toContain('href="https://example.invalid"');
  });
});
