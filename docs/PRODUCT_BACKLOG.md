# Product Backlog: Sportplattform TeamZeit

Die Sportorganisation hat Vorrang. Scrum-Rollen sind ausschließlich Projektrollen und werden unter `/projekt` nach Anmeldung und Freigabe angezeigt. Sie verleihen keinerlei Sportplattformrechte.

| ID | Priorität | Ergebnis | Akzeptanzkriterien |
| --- | --- | --- | --- |
| SPORT-001 | P0 | Standorte und regionale Gruppen | Bestandsgruppen erhalten; Standorte mit Stadt; Gruppe einem Standort zuordnen; Standortfilter; Verantwortliche sehen ausschließlich ihren Bereich. |
| SPORT-002 | P0 | Vier operative Rollen | Plattformadmin übergreifend; Standortverantwortliche nur eigener Standort; mehrere Trainer je Gruppe; Mitglieder nur eigene Buchungen. Rechte serverseitig und mit gruppenfremden IDs geprüft. Letzter Plattformadmin geschützt. |
| SPORT-003 | P0 | Wiederkehrende Trainings | Bis zu 26 wöchentliche Termine atomar anlegen; gleiche Berliner Ortszeit über Sommerzeitwechsel; einzelne Termine bearbeiten/absagen; Bestandsdaten unverändert. |
| SPORT-004 | P0 | Plätze und Warteliste | Limit 1–1.000 oder unbegrenzt; konkurrierende Zusagen überbuchen nie; Warteliste nach Eingangszeit, bei Zeitgleichheit stabil nach Nutzer-ID; Absage oder Kontolöschung gibt Platz frei und lässt nachrücken; Reduktion unter bestätigte Plätze abweisen. |
| SPORT-005 | P1 | Mobile Planung | Eigene Standorte/Gruppen, Zeitraumfilter, Seiten mit höchstens 150 Terminen, Wartestatus sichtbar, Anmeldung und bestehende E-Mail-Einladungen funktionieren weiter. |
| SPORT-006 | P1 | Trainingsbenachrichtigungen | Freiwillige Einschaltung; Nachrücken/Änderung/Absage über persistente Outbox; Empfänger einzeln, keine CC; Wiederholungen mit Idempotenz, maximal fünf Versuche; Abwahl unterdrückt offene Nachrichten; isolierter Versandtest. |
| NFR-PERF-001 | P0, verbindlich | Mindestens 1.000 gleichzeitig aktive Nutzer | Siehe verbindliche Spezifikation unten. Ohne bestandene Lasttests keine Freigabe als nachweislich für 1.000 gleichzeitige Produktionsnutzer geeignet. |

## NFR-PERF-001: verbindliche nichtfunktionale Anforderung

TeamZeit muss für mindestens **1.000 gleichzeitig aktive Nutzer** ausgelegt sein. 1.000 gespeicherte Mitglieder oder überwiegend inaktive Sitzungen sind kein ausreichender Nachweis. **Mindestens 95 % der relevanten Anfragen müssen unter 2.000 ms liegen, die Quote unerwarteter Fehler muss unter 1 % liegen.** Dies gilt jeweils auch für Login, Terminabfrage, Buchung und Absage, nicht nur für ein gemitteltes Gesamtergebnis.

Aktueller Stand nach gezielter Optimierung: im echten privaten Cloudflare-Staging bei 1.000 aktiven Nutzern p95 Abfrage 119 ms, Buchung 138 ms, Absage 143 ms; 0 unerwartete API-Fehler. Trotzdem **nicht abgenommen**: 39,4 % Ressourcenlimit-Fehler bei den separaten 1.000 Anmeldeversuchen und p95 3.842 ms bei der zusätzlichen gleichzeitigen Buchungsspitze. Der bestätigte Free-Plan erlaubt kein höheres CPU-Limit. Details, Rohdatenbezüge und unveränderte Sicherheitsparameter: [Performance-Optimierung](PERFORMANCE_OPTIMIZATION.md).

### Reproduzierbares Abnahmeszenario

- Isolierte Worker/D1-Testumgebung mit 1.000 synthetischen Konten, 3 Städten, 50 regionalen Gruppen, mehreren Trainern, 600 Terminen und einem gemeinsamen stark nachgefragten Termin. Keine echten Nutzer, Secrets oder E-Mails. Produktionsdatenbank wird nie als Lasttestziel akzeptiert.
- 1.000 echte Passwortanmeldungen gleichmäßig innerhalb 60 Sekunden hochfahren; Passwortprüfung unverändert. Danach 1.000 aktive virtuelle Nutzer mit eigenen Sitzungscookies, 6 Aktionen je Person und deterministischen Denkpausen von 0,5 bis 5 Sekunden: Terminabfrage, Zusage, Abfrage, Vielleicht, Zusage, Absage. 1.000 zusätzlich gleichzeitig gestartete Buchungen konkurrieren um 50 Plätze. Ein Zugriffstest pro Nutzer fordert fremde Gruppendaten an und muss 403 liefern.
- Falls die Anmeldephase scheitert, darf der zusätzliche Datenbanktest die fehlenden isolierten Testsitzungen direkt vorbereiten, um trotzdem 1.000 aktive Nutzer zu simulieren. Diese Anzahl muss ausgewiesen werden; sie macht weder die fehlgeschlagenen Logins erfolgreich noch erfüllt sie die gesamte Performance-Anforderung.
- Anfragen ohne automatische Wiederholungen messen; unerwartete 4xx, 5xx, Zeitüberschreitungen und Verbindungsfehler zählen als Fehler. Erwartete 403 ausschließlich im getrennten Sicherheitstest ausweisen. Latenz vom Absenden bis zum vollständigen JSON-Empfang. p50/p95/p99/Maximum, Anzahl, tatsächliche Parallelität, Durchsatz und Fehlerquote je Operation/Phase dokumentieren.
- Während und nach der Last keine Überbuchung; keine doppelten Mitgliedschaften oder Antworten; Warteliste konsistent und eigene Sitzungen isoliert. Abgesagte Buchungen geben Plätze frei. Datenbankpläne müssen Indizes für Gruppenzeitraum, Mitgliedschaft und Warteliste verwenden.
- Ergebnis mit Rechner/Runtime, Commit, Testdauer, Lastparametern und Rohmesswerten speichern. Lokales Miniflare simuliert dieselbe Worker-Logik und SQLite/D1-Schnittstelle, aber keine Cloudflare-Netzlatenz, regionale Queues, CPU- oder Tarifgrenzen. Der lokale Test kann diese Anforderung für Produktion **nicht** abschließend erfüllen.
- Für endgültige 1.000-Nutzer-Abnahme: dieselbe Last gegen eine isolierte Cloudflare-Staging-Installation mit produktionstypischem Tarif/Limits und externer Lastquelle ausführen; mindestens 15 Minuten aktive Last nach der Rampe, zwei erfolgreiche Wiederholungen sowie nachgewiesene E-Mail-Kapazität. Kostenbudget vor kostenpflichtiger Infrastruktur klären. Solange dies fehlt oder Ziele verfehlt sind, Status ausdrücklich **offen**.

### Scrum-Nachweis anhand technischer Arbeit

Product Owner: Lastprofil und Kosten-/Leistungsziel priorisieren und akzeptieren. Scrum Master: Engpässe und Blocker transparent machen, Wiederholbarkeit prüfen. Developers: Datenbankkonkurrenz absichern, Indizes und Zugriffswege optimieren, Messwerte liefern. Stakeholder/Reviewer: Trainingsspitzen und Bedienbarkeit gegen Messprotokoll bewerten. Review zeigt tatsächliche Messwerte statt einer unbelegten Skalierbarkeitsbehauptung.
