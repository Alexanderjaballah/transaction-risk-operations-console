import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("reason rendering", () => {
  it("renders HTML-like reason text as escaped text", () => {
    const reason = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const markup = renderToStaticMarkup(createElement("td", null, reason));

    expect(markup).toContain("&lt;img");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<script>");
  });
});
