import { describe, it, expect } from "vitest";
import { renderEmailShell } from "./emailShell";

describe("renderEmailShell", () => {
  it("wrapt content + bevat bedrijfsnaam, afmeldlink en preheader", () => {
    const html = renderEmailShell("<p>Hoi Jan</p>", {
      companyName: "StayCool Airco",
      unsubUrl: "https://x/unsubscribe?token=t",
      previewText: "Zomer-check",
    });
    expect(html).toContain("<p>Hoi Jan</p>");
    expect(html).toContain("StayCool Airco");
    expect(html).toContain("https://x/unsubscribe?token=t");
    expect(html).toContain("Zomer-check");
    expect(html.toLowerCase()).toContain("<!doctype html>");
  });
  it("escapet bedrijfsnaam (geen HTML-injectie via companyName)", () => {
    const html = renderEmailShell("<p>x</p>", {
      companyName: "<b>Acme</b>",
      unsubUrl: "#",
    });
    expect(html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(html).not.toContain("<b>Acme</b>");
  });
});
