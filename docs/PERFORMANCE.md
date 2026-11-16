# Performance-Abnahme TeamZeit · 16. November 2026

**Aktualisierung:** Der anschließende echte Cloudflare-Staging-Vergleich, die gezielten Optimierungen und die bestätigte CPU-Tarifgrenze sind in [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) dokumentiert. Die folgenden lokalen Messungen bleiben als historischer Ausgangsstand erhalten; sie sind keine Cloudflare-Vorherwerte.

**Status NFR-PERF-001: offen, nicht abgenommen.** Ziel sind mindestens 1.000 gleichzeitig aktive Nutzer, p95 unter 2.000 ms je relevantem Vorgang und weniger als 1 % unerwartete Fehler. Die veröffentlichten Sportfunktionen sind funktional geprüft; eine Kapazität für 1.000 gleichzeitige Produktionsnutzer wird ausdrücklich nicht behauptet.

## Umgebung und Reproduktion

Intel Core i5-7300HQ (4 logische Kerne), 11,9 GiB RAM, Windows 10.0.19045, Node 26.13.1, Miniflare 5.20261116.0-beta/workerd. Lastgenerator und isolierte Worker-/SQLite-Datenbank laufen auf demselben Rechner. Normale Desktopaktivität und einzelne leichte Verwaltungsaufrufe liefen parallel; dies ist kein dedizierter Benchmark-Host. Keine Produktionsdatenbank, echten Mitglieder oder E-Mail-Konten werden belastet. Lokale HTTP-Verbindungen bilden weder TLS/Internetlatenz noch Cloudflare-CPU-, Queue- und Tarifgrenzen nach.

```sh
npm ci
npm run check
npm run test:load
# Ergänzende Diagnose ausschließlich der Trainings-API, ohne Login-Abnahme:
node scripts/load-test.mjs --users=1000 --ramp=60 --auth=seeded --connections=128
```

Das Skript akzeptiert absichtlich kein entferntes Testziel. Es erstellt 1.000 synthetische Konten, 50 Gruppen an drei Beispielstandorten und 600 Termine. Nach einer 60-Sekunden-Anmelderampe folgen 1.000 aktive Nutzer mit eigenen Cookies und deterministischen Denkpausen von 0,5–5 Sekunden: Abfrage, Buchung, Abfrage, Vielleicht, Buchung, Absage. Anschließend starten 1.000 Buchungen gleichzeitig für einen Termin mit 50 Plätzen. Jeder Nutzer fordert außerdem eine fremde Gruppe an; erwartet wird 403.

Der Verbindungspool hat 128 HTTP/1-Verbindungen. Alle 1.000 virtuellen Nutzer bleiben aktiv; Wartezeit im Pool zählt vollständig zur Latenz. Keine automatischen Wiederholungen kaschieren Fehler. Fehlende Sitzungen nach gescheiterten Logins werden nur für die zusätzliche API-Prüfung vorbereitet und gesondert ausgewiesen. Vorbereitete Sitzungen ersetzen keinen erfolgreichen Login-Test. p50/p95/p99/Maximum beziehen sich auf vollständig eingelesene Antworten einschließlich Fehlern und Transport-/Poolwartezeit. Erwartete 403 sind ausschließlich im Sicherheitsprofil erfolgreich; unerwartete 4xx/5xx und Transportfehler zählen als Fehler. Exit-Code 2 bedeutet verfehlte Ziele, nicht einen abgebrochenen Messlauf.

Rohmessungen mit Einzelanfragen liegen unter `test-results/load-*.json`; versionierte Zusammenfassungen in [performance](performance). Jede Zusammenfassung enthält Commit, Quellhash, Szenario, Indexpläne und SHA-256 des lokalen Rohberichts. Zum Erzeugen einer Zusammenfassung: `node scripts/summarize-load.mjs test-results/report.json bericht-name`.

## Gemessenes API-Profil mit 1.000 aktiven Nutzern

Stand ac52a21, 1.000 ausdrücklich vorbereitete Testsitzungen, keine Login-Prüfung in diesem zusätzlichen Profil. Aktive Mischlast 51,75 Sekunden; Buchungsspitze 9,47 Sekunden. Höchstens 1.000 gleichzeitig ausstehende Anfragen. 6.000 Mischlastanfragen entsprechen rund 116 Anfragen/Sekunde einschließlich Denkpausen; der Burst erreichte rund 106 Buchungen/Sekunde.

| Vorgang | Anfragen | p50 ms | p95 ms | p99 ms | Fehler |
| --- | ---: | ---: | ---: | ---: | ---: |
| Terminabfrage | 2.000 | 3.877 | 5.701 | 5.841 | 0 % |
| Buchung/Zusage | 2.000 | 5.588 | 7.156 | 7.553 | 0 % |
| Vielleicht | 1.000 | 5.633 | 7.153 | 7.247 | 0 % |
| Absage | 1.000 | 4.873 | 6.261 | 6.730 | 0 % |
| Gemeinsame Buchungsspitze | 1.000 | 4.946 | 9.347 | 9.364 | 0 % |
| Fremdzugriff, erwartete 403 | 1.000 | 4.600 | 5.589 | 5.692 | 0 unerwartete Ergebnisse |

7.000 relevante API-Anfragen, 0 unerwartete Fehler; Gesamt-p95 7.224 ms, Maximum 9.365 ms. **Fehlerziel erfüllt, Antwortzeitziel verfehlt.** Beim gemeinsamen Termin blieben exakt 50 bestätigte und 950 wartende Personen. Die periodischen Prüfungen fanden keine Überbuchung. Primärschlüssel verhindern doppelte Antworten/Mitgliedschaften. Alle 1.000 Fremdzugriffe wurden abgewiesen. Details: [API-Messung](performance/api-128-connections.json).

## Vollständiger Abschlusslauf mit Passwortanmeldungen

Stand ac52a21, gleicher Quellhash wie beim API-Profil, korrigierter Verbindungspool mit 128 Verbindungen. **1.000 von 1.000 echten Passwortanmeldungen erfolgreich; keine vorbereiteten Ersatzsitzungen.** Die 60-Sekunden-Startrampe erzeugte durch die lokale Passwortberechnung einen Rückstau: Erst nach 291,44 Sekunden waren alle Logins fertig. Anschließend 54,61 Sekunden aktive Mischlast und 9,33 Sekunden gemeinsame Buchungsspitze; Gesamtlauf einschließlich Aufbau 380,72 Sekunden.

| Vorgang | Anfragen | p50 ms | p95 ms | p99 ms | Unerwartete Fehler |
| --- | ---: | ---: | ---: | ---: | ---: |
| Anmeldung | 1.000 | 131.344 | 235.595 | 237.975 | 0 % |
| Terminabfrage | 2.000 | 4.009 | 5.495 | 5.954 | 0 % |
| Buchung/Zusage | 2.000 | 5.805 | 6.937 | 7.413 | 0 % |
| Vielleicht | 1.000 | 6.066 | 7.071 | 7.263 | 0 % |
| Absage | 1.000 | 5.844 | 6.684 | 6.760 | 0 % |
| Gemeinsame Buchungsspitze | 1.000 | 4.757 | 9.279 | 9.281 | 0 % |
| Fremdzugriff, erwartete 403 | 1.000 | 5.149 | 6.569 | 6.700 | 0 unerwartete Ergebnisse |

8.000 relevante Anfragen plus 1.000 getrennte Sicherheitsprüfungen; **0 % unerwartete Fehler**, 50 bestätigte Plätze und 950 Wartende, keine beobachtete Überbuchung. Gesamt-p95 einschließlich Anmeldung 162.300 ms, Maximum 238.563 ms. Alle Vorgänge verfehlen das Antwortzeitziel. Dies ist ausdrücklich keine bestandene Performance-Abnahme. [Vollständige Messzusammenfassung](performance/full-128-connections.json).

## Diagnose und Optimierungen

- Erste unbeschränkte lokale Transportprofile lieferten `fetch failed`; die zusätzliche Ursachenaufzeichnung identifizierte `ECONNREFUSED` am lokalen workerd-Port. Im vollständigen frühen Profil waren nur 450 von 1.000 Logins erfolgreich, Login-p95 135.414 ms; 550 Sitzungen mussten für den anschließenden API-Test vorbereitet werden. Der API-Diagnoselauf ohne Login zeigte 329 lokale Verbindungsablehnungen bei 7.000 relevanten Aufrufen. Diese Fehler werden nicht nachträglich aus den Berichten entfernt und sind kein Beleg für HTTP-500-Fehler einer Cloudflare-Produktionsdatenbank.
- Korrektur des Lastgenerators: dokumentierter Pool mit 128 Verbindungen, weiterhin 1.000 virtuelle Nutzer und Einrechnung sämtlicher Poolwartezeit. Im danach durchgeführten API-Profil verschwanden die Verbindungsfehler; die erhöhten Antwortzeiten blieben. Das grenzt einen Transportengpass der lokalen Testumgebung ab, beweist aber keine Produktionsleistung.
- Anwendung: gemeinsame Rechte-/Termindatenabfrage statt getrennter Abfragen; atomarer Buchungs-Upsert und Datenbanktrigger statt zusätzlicher, wiederholter Nachrückabfragen; keine drei unbenutzten Trainerzählungen in Mitgliederlisten. Passwortschutz wurde nicht herabgesetzt.
- Indizes für Mitgliedschaft nach Nutzer, Gruppen nach Standort, Termine nach Gruppe/Zeit und Antworten nach Termin/Status bzw. Wartelistenreihenfolge. `EXPLAIN QUERY PLAN` bestätigt `idx_events_group_start` und den abdeckenden Index `idx_responses_queue`. Die Abfragen sind auf 150 Termine pro Seite bzw. begrenzte Verwaltungslisten beschränkt. Indexnutzung allein erfüllt das Latenzziel nicht.
- Verbleibend: lokale Passwortberechnung und Warteschlangen im gemeinsamen Testprozess; Lastgenerator-/Runtime-Transportgrenzen; serieller Datenbank-Schreibpfad. Der Anteil einzelner Komponenten wurde noch nicht mit getrennten Lastgeneratoren und Cloudflare-Traces quantifiziert. Eine konkrete Cloudflare- oder PostgreSQL-Kapazität lässt sich daraus nicht seriös ableiten. D1 verarbeitet Anfragen je Datenbank seriell; siehe [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/).

## Offene Abnahme vor breitem Rollout

1. Isoliertes Cloudflare-Staging mit produktionstypischen Limits und externer Lastquelle, mindestens 15 Minuten aktive Last nach Rampe und zwei erfolgreiche Wiederholungen. Netzwerk, Worker-CPU, Datenbankzeiten und Queue-Wartezeit getrennt messen.
2. Passwort-/Anmeldepfad und Spitzen aus gemeinsam genutzten Netzen dimensionieren. Bestehende IP- und Kontosperren müssen legitime Nutzung erlauben und Missbrauch weiter begrenzen; Hashschutz nicht zur Erfüllung eines Benchmarks schwächen.
3. Abhängig von Staging-Messwerten: weitere Abfrage-/Antwortoptimierungen, konsistente Read-Replication für reine Lesezugriffe oder Aufteilung nach Organisation/Standort bewerten. Noch keine dieser Infrastrukturmaßnahmen ist umgesetzt oder als ausreichend bewiesen. Keine kostenpflichtige Kapazität wurde aktiviert.
4. Trainingsmail-Queue derzeit maximal zehn Nachrichten je fünf Minuten, fünf Versuche, bestehendes Resend-Kontingent. Massensendungen, Überwachung endgültig fehlgeschlagener Zustellungen, Betriebsalarmierung und Versandbudget müssen vor Wachstum dimensioniert werden.
5. Reale Standorte und Verantwortliche organisatorisch zuordnen; bestehende Gruppen bleiben bis dahin beim Platzhalterstandort. Die technischen Prüfungen ersetzen keine organisationsbezogene Datenschutzprüfung.

Der [Backlog-Eintrag NFR-PERF-001](PRODUCT_BACKLOG.md) bleibt bis zur bestandenen Abnahme offen. Product Owner und Stakeholder erhalten diese gemessenen Einschränkungen als Entscheidungsgrundlage; es gibt keine Freigabeaussage „1.000 Nutzer produktionsbereit“.
