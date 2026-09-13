# Automatische codecontroles

GitHub Actions voert bij iedere pull request en push naar main twee onafhankelijke controles uit: `typecheck` (`npm run typecheck`) en `test` (`npm run test`). Dezelfde workflow kan handmatig worden gestart via Actions > Quality checks zodra hij op main staat.

Beide jobs draaien op Ubuntu met Node.js 24, installeren exact package-lock.json via npm ci en hebben maximaal 15 minuten. Nieuwe commits annuleren oude runs van dezelfde PR. Een typefout verhindert niet dat de tests hun eigen uitslag geven. Er zijn geen productiecredentials of deploycommando's opgenomen. De officiële checkout/setup-node-actions zijn vastgezet op hun gecontroleerde v7-commit.

Bij een rode controle: open de PR > Checks > betreffende job > mislukte stap. Herstel de fout en push een nieuwe commit; de controles starten opnieuw. Lokaal reproduceren: npm ci, npm run typecheck, npm test. De tests gebruiken de bestaande Vitest-configuratie en gesimuleerde backends.

Deze workflow maakt checkresultaten zichtbaar. Verplicht slagen vóór samenvoegen is een afzonderlijke GitHub-branchregel; de workflow alleen verandert die regel niet. Vercel blijft de deployment uitvoeren zoals eerder ingericht.

Bronnen: https://github.com/actions/checkout en https://github.com/actions/setup-node.
