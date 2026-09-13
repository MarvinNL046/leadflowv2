# Automatische codecontroles

GitHub Actions voert bij iedere pull request en push naar main twee onafhankelijke controles uit: `typecheck` (`npm run typecheck`) en `test` (`npm run test`). Dezelfde workflow kan handmatig worden gestart via Actions > Quality checks zodra hij op main staat.

Beide jobs draaien op Ubuntu met Node.js 24, installeren exact package-lock.json via npm ci en hebben maximaal 15 minuten. Nieuwe commits annuleren oude runs van dezelfde PR. Een typefout verhindert niet dat de tests hun eigen uitslag geven. Er zijn geen productiecredentials of deploycommando's opgenomen. De officiële checkout/setup-node-actions zijn vastgezet op hun gecontroleerde v7-commit.

Bij een rode controle: open de PR > Checks > betreffende job > mislukte stap. Herstel de fout en push een nieuwe commit; de controles starten opnieuw. Lokaal reproduceren: npm ci, npm run typecheck, npm test. De tests gebruiken de bestaande Vitest-configuratie en gesimuleerde backends.

Sinds 13 september 2026 beschermt GitHub-regel 83137603 exact main: een pull request is verplicht, test en typecheck moeten slagen met GitHub Actions als bron, en de branch moet bijgewerkt zijn met main. De regel geldt ook voor beheerders; force pushes en verwijderen van main zijn niet toegestaan. Een tweede reviewer is niet verplicht. Bij een verouderde PR: werk de branch bij met main en wacht de nieuwe controles af. Vercel blijft de deployment uitvoeren zoals eerder ingericht.

Beheer: https://github.com/MarvinNL046/leadflowv2/settings/branch_protection_rules/83137603. Deze repositoryinstelling staat los van het workflowbestand; wijzigen van YAML past de beschermingsregel niet automatisch aan.

Bronnen: https://github.com/actions/checkout en https://github.com/actions/setup-node.
