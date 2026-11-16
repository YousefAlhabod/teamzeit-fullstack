# Performance-Optimierung · 16. November 2026

**Gesamtziel nicht erreicht.** Die optimierte API erfüllt das Ziel im definierten realistischen Mischbetrieb mit 1.000 aktiven Nutzern; Passwortanmeldung und die zusätzliche gleichzeitige Buchungsspitze verhindern weiterhin eine Gesamtfreigabe. Keine neuen Produktfunktionen, kein Redesign und keine Schemaänderung.

## Ursachen mit Messungen

1. **Die alten 235,6 Sekunden waren lokale Rückstauzeit, keine gemessene Cloudflare-Loginzeit.** Der callbackbasierte `scrypt`-Aufruf führt in workerd die native Berechnung synchron aus. Ein isolierter lokaler Test mit unveränderten Parametern N=16384, r=8, p=5 verzögerte eine parallel gesendete triviale Kontrollanfrage um 321 ms bei einem Hash, 1.158 ms bei vier und 4.533 ms bei 16 Hashes. Gesamtdauer: 346/1.190/4.555 ms. Das belegt die Blockierung der gemeinsamen lokalen Runtime. [workerd-Implementierung](https://github.com/cloudflare/workerd/blob/main/src/node/internal/crypto_scrypt.ts).
2. **Cloudflare blockiert einen großen Teil der Anmeldungen am CPU-Limit.** Vor Optimierung: 612 von 1.000 Anmeldungen erfolgreich, 388 HTTP 503. Separater Diagnoseaufruf bestätigte ausdrücklich „Worker exceeded resource limits“. Nach Optimierung: 606 erfolgreich, 394 solche Ablehnungen. Ein Versuch, im Staging 1.000 ms CPU pro Anfrage im bestehenden Tarif zuzulassen, wurde vom Anbieter mit Code 100328 abgewiesen: CPU-Limits sind im Free-Plan nicht konfigurierbar. Es wurde kein Tarifwechsel vorgenommen. [Workers-Limits](https://developers.cloudflare.com/workers/platform/limits/).
3. **Unnötige Datenbank-Rundreisen vergrößerten normale Antwortzeiten und Buchungsspitzen.** Die anwendungsintern gemessene Zahl erfolgreicher Datenbankaufrufe sank bei Anmeldung von 5 auf 3, Terminabfrage von 3 auf 2 und Buchung/Absage von 4 auf 2. Vorher lieferte die zusätzliche 1.000er-Buchungsspitze 208 HTTP 500; deren genaue interne Datenbankausnahme wurde im Ausgangslauf nicht erfasst und wird deshalb nicht nachträglich als sicherer Providerfehler behauptet. Nachher gab es bei diesem Lauf keine unerwarteten API-Fehler.

## Umgesetzte Änderungen

- Konto und Fehlversuchszähler in einer Abfrage lesen; beim erfolgreichen Login ohne bestehenden Fehlversuchszähler keine leere DELETE-Abfrage ausführen. Bestehende Hashformate, Parameter, zufällige Salts und Einmal-/Sitzungstoken bleiben unverändert.
- Fehlversuche atomar in D1 inkrementieren. Acht parallele Fehlversuche gehen nicht durch konkurrierendes Lesen/Schreiben verloren. Bestehende Sperrregeln werden nicht abgeschwächt.
- Sitzung, aktuelle Gruppenberechtigung und Terminkontext gemeinsam lesen. **Kein** Cache persönlicher Antworten, Passwörter, Sitzungen oder Berechtigungen; Widerruf und Rollenänderungen wirken bei der nächsten Anfrage.
- Buchungsergebnis mit SQL `RETURNING` aus demselben atomaren Statement zurückgeben. Die zusätzliche Rücklese-Abfrage entfällt; Kapazitäts- und Nachrücktrigger bleiben erhalten.
- Vorhandene Indizes für Sitzungstoken, Gruppenmitgliedschaft, Gruppenzeitraum und Warteliste passen zu den neuen Abfragen. Kein zusätzlicher Index wurde ohne nachgewiesenen Bedarf eingeführt; zusätzliche Schreibkosten werden vermieden.
- Diagnosewrapper, virtuelle IP-Adressen und Server-Timing befinden sich ausschließlich im separaten Staging-Worker. Der produktive Worker erhält diese Testzugänge nicht.

## Gleiche Staging-Bedingungen vorher/nachher

Eigener Cloudflare-Worker `teamzeit-perf-staging`, eigene EU-D1-Datenbank `eba63996-3ef2-47b1-bca1-c2bdb01d57de`; Produktionsdatenbank und Produktivdomain werden vom Lastgenerator ausdrücklich abgewiesen. Geheimschlüssel schützt jede Staging-Anfrage. Staging erhält keine Resend-Schlüssel; E-Mail-Konfiguration wird zusätzlich im Wrapper entfernt. Keine realen Konten oder E-Mails.

Lastquelle: Windows-Rechner in Deutschland, Node 26.13.1, 256 HTTP/1-Verbindungen, TLS-Prüfung aktiv. Poolwartezeit zählt zur Antwortzeit; keine automatischen Wiederholungen. p95 des Lastgenerator-Eventloops: 32 ms. Rate-Limits bleiben aktiv; ausschließlich hinter dem geheimen Staging-Zugang werden 1.000 synthetische Quell-IP-Adressen simuliert. Gemeinsame NAT-/WLAN-Spitzen sind damit nicht abgenommen.

- Je 1.000 **echte Passwortanmeldeversuche**, über 60 Sekunden gestartet. Bei Fehlern wird diese Gesamtprüfung als fehlgeschlagen gespeichert; es gibt keinen stillen Ersatz durch vorbereitete Sitzungen.
- Separater API-Vergleich mit jeweils **1.000 ausdrücklich vorbereiteten Testsitzungen**, 1.000 aktiven virtuellen Nutzern für volle 120 Sekunden, 50 Gruppen, drei Standorten und 600 Terminen. Jeder Nutzer fragt viermal Termine ab, bucht einmal und sagt einmal ab. Aktive Nutzer bleiben bis zum Ende im Szenario; dies sind nicht bloß gespeicherte Konten.
- Danach 1.000 Fremdgruppen-Zugriffe (erwartet 403) und zusätzlich 1.000 gleichzeitig gestartete Buchungen auf einen gemeinsamen Termin mit 50 Plätzen. Höchstens 1.000 ausstehende Anfragen. Normale Mischlast und zusätzliche harte Spitze werden getrennt ausgewiesen.
- Daten vor jedem Vergleich zurückgesetzt; nur synthetische Sitzungen, Antworten und Zähler im fest erlaubten Staging-Ziel. Schutzbudget pro Lauf: 25.000 geschriebene bzw. 1,8 Mio. gelesene Zeilen, danach Abbruch weiterer Anfragen. Gemessen: vorher 11.500/233.943, nachher 12.200/243.601 geschriebene/gelesene Zeilen. Keine Änderung eines gemeinsamen Kontingents oder kostenpflichtigen Plans.

## Tatsächliche Vorher-/Nachher-Werte

Alle p95-Werte in Millisekunden, einschließlich fehlerhafter Antworten. Für erfolgreiche Logins allein: vorher 676 ms, nachher 581 ms. Vorher: Anwendungsstand 1ed53ad, Staging-Version 434e99d5-b3d3-4923-9c80-49d5ef40049e. Nachher: bad9303, Staging-Version 21f0909f-ec0d-469d-9f85-f3c9f261f1d8. Gleicher Tarif und gleiches Lastprofil. Die früheren lokalen Sekundenwerte sind **kein** fairer Vorherwert für diese Cloudflare-Vergleiche.

| Vorgang | p95 vorher | p95 nachher | Unerwartete Fehler vorher → nachher |
| --- | ---: | ---: | ---: |
| Anmeldung, 1.000 Versuche | 671 | 584 | 38,8 % → 39,4 % |
| Terminabfrage, 4.000 Aufrufe | 171 | 119 | 0 % → 0 % |
| Buchung, 1.000 Aufrufe im Mischbetrieb | 244 | 138 | 0 % → 0 % |
| Absage, 1.000 Aufrufe im Mischbetrieb | 261 | 143 | 0 % → 0 % |
| Zusätzliche 1.000er-Buchungsspitze | 5.443 | 3.842 | 20,8 % → 0 % |

API gesamt einschließlich Spitze: vorher p95 4.625 ms / 2,971 % Fehler, nachher p95 3.224 ms / 0 % Fehler, jeweils 7.000 relevante Anfragen. Weitere 1.000 Fremdzugriffe wurden jeweils korrekt abgewiesen. Sicherheits-Burst nachher p95 3.741 ms; auch hier ist die Latenzgrenze nicht erfüllt.

Nachheriger Datenbankcheck: 1.000 Testnutzer, **0 überbuchte Termine, 50 bestätigte und 950 wartende Personen, 0 verbliebene normale Buchungen nach den Absagen, 0 unberechtigte Buchungen, 0 E-Mails in der Queue**. 32 Regressionstests erfolgreich, einschließlich Rollen, Isolation, sofortigem Sitzungs-/Mitgliedschaftswiderruf, parallelen Fehlversuchen, Einladungen, Reset, Serien, Warteliste und E-Mail-Sperre.

Die Ergebnisse sind ein definierter Staging-Vergleich je Stand, keine statistisch abgesicherte 15-Minuten-Dauerabnahme mit mehreren Lastquellen. Versionierte Messzusammenfassungen unter `docs/performance/staging-*`; lokale Einzelmessungen bleiben unter `test-results`. Die Anforderungen in NFR-PERF-001 bleiben ausdrücklich offen.

## Reproduktion im autorisierten Staging

Die getrennte Konfiguration ist `wrangler.perf.jsonc`. Die private Datei `.private/perf-staging.json` enthält synthetische Testzugänge und den Staging-Schlüssel; sie gehört niemals ins Repository. Für eine frische Einrichtung erzeugt `node scripts/prepare-staging.mjs` SQL und private Zugangsdaten; anschließend werden ausschließlich mit der Staging-Konfiguration Migrationen/Fixture importiert und `STAGING_ACCESS_KEY` aus der privaten Datei sicher per Wrangler gesetzt. Das Skript verweigert das Überschreiben einer bestehenden privaten Fixture. Die aktuelle Einrichtung bleibt für berechtigte Wiederholungen erhalten.

```sh
npm run perf:hash
node scripts/reset-staging.mjs
npm run test:staging:login
# Für den ausdrücklich getrennten API-Vergleich:
node scripts/reset-staging.mjs
node scripts/seed-staging-sessions.mjs
node node_modules/wrangler/bin/wrangler.js d1 execute teamzeit-perf-staging --remote --config wrangler.perf.jsonc --file .private/perf-sessions.sql
npm run test:staging:api
node scripts/check-staging.mjs
```

Ein Exit-Code 2 markiert verfehlte Latenz-/Fehlerziele; er ist kein erfolgreicher Leistungsnachweis. Scheitern echte Anmeldungen, ist der nachfolgende API-Test ein eigener Versuch mit klar ausgewiesenen vorbereiteten Sitzungen.

## Verbleibende Grenzen

Die CPU-Grenze für die unverändert sichere Passwortprüfung muss in einer dafür geeigneten Laufzeit bzw. mit ausdrücklich freigegebenem Compute-Tarif gelöst werden; eine schwächere Passwortprüfung ist keine zulässige Performance-Abhilfe. Die harte Buchungsspitze benötigt weitere Messungen von Cloudflare-/D1-Queuezeiten und gegebenenfalls eine abgestimmte Kapazitäts-/Lastverteilung. Solange Anmeldung und Spitze die Kriterien verfehlen, gibt es **keine Freigabe für 1.000 gleichzeitig aktive Produktionsnutzer**.
