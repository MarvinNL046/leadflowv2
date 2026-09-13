# Historische migratiescripts

Deze bestanden zijn op 13 september 2026 gearchiveerd vanuit scripts/. Ze gebruiken de vroegere publieke api.migration via ConvexHttpClient. De huidige migratiefuncties zijn intern; deze scripts zijn daarom niet uitvoerbaar tegen de huidige backend. Ook de ETL-skeleton in de bovenliggende map is uitsluitend een historisch voorbeeld.

De .ts.txt-extensie bewaart de broncode als referentie zonder deze als actieve TypeScript-code te presenteren. Er zijn geen typecheck-excludes toegevoegd. Herstel de publieke migratie-API niet om deze scripts te laten werken. Een nieuwe migratie vereist een afzonderlijk gecontroleerd plan met de huidige interne functies; zie docs/cutover-runbook.md voor historische context.
