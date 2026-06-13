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

  // Regressie: workflow-engine-mails lieten {{company}} letterlijk staan
  // (engine gebruikte een eigen interpolate die alleen {{contact.<veld>}}
  // kende). Engine gebruikt nu leadTemplateVars + renderTemplate, exact
  // zoals hieronder — dit is het Diana-scenario uit de bugmelding.
  it("rendert {{company}} in subject én body (workflow-engine-mail)", () => {
    const vars = leadTemplateVars(
      { firstName: "Diana", lastName: "de Graef", company: null },
      "StayCool Airco",
    );
    expect(renderTemplate("Re: Je aanvraag bij {{company}}", vars)).toBe(
      "Re: Je aanvraag bij StayCool Airco",
    );
    expect(
      renderTemplate("Hoi {{contact.firstName}},\n\nGroet,\n{{company}}", vars),
    ).toBe("Hoi Diana,\n\nGroet,\nStayCool Airco");
  });
});

describe("htmlToPlainText", () => {
  it("strip tags", () => {
    expect(htmlToPlainText("<p>Hallo <b>Jan</b></p>")).toBe("Hallo Jan");
  });
});
