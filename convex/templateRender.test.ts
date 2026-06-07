import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  htmlToPlainText,
  leadTemplateVars,
} from "./templateRender";

const contact = {
  firstName: "Jan",
  lastName: "Jansen",
  email: "jan@x.nl",
  phone: "0612",
  city: "Maastricht",
  company: null,
};

describe("renderTemplate", () => {
  it("substitueert contact-vars + doorgegeven company", () => {
    const vars = leadTemplateVars(contact, "Acme BV");
    expect(renderTemplate("Beste {{contact.firstName}}", vars)).toBe(
      "Beste Jan",
    );
    expect(renderTemplate("{{contact.fullName}}", vars)).toBe("Jan Jansen");
    expect(renderTemplate("{{company}}", vars)).toBe("Acme BV");
  });
  it("ontbrekende var → lege string", () => {
    expect(renderTemplate("[{{onbekend}}]", {})).toBe("[]");
  });
});

describe("htmlToPlainText", () => {
  it("strip tags", () => {
    expect(htmlToPlainText("<p>Hallo <b>Jan</b></p>")).toBe("Hallo Jan");
  });
});
