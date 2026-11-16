# TeamZeit – technischer Freigabestand, 16. November 2026

Die geprüften Kernfunktionen und die erste regionale Ausbaustufe sind veröffentlicht. **Keine Freigabe als nachweislich für 1.000 gleichzeitig aktive Produktionsnutzer geeignete Plattform:** NFR-PERF-001 bleibt offen, weil die lokalen Antwortzeiten die Ziele verfehlen und eine Cloudflare-Staging-Abnahme noch fehlt.

- App und öffentliche Demo: https://teamzeit.yousef-alhabod.de
- Quellcode: https://github.com/YousefAlhabod/teamzeit-fullstack
- Portfolio: https://yousef-alhabod.de/#teamzeit
- Produktionsversion: 0e8ef469-770d-422d-bf84-50125e55a411
- Eigener Worker und separate D1-Datenbank mit EU-Jurisdiktion; fünf Migrationen angewendet.

## Nachfolgende gezielte Performance-Optimierung

Nur Authentifizierungs-/Berechtigungsabfragen und Buchungsrückgabe optimiert; kein Redesign, keine neuen Produktfunktionen, keine Datenmigration. 32 Regressionstests erfolgreich. Echter privater Cloudflare-Staging-Vergleich mit je 1.000 aktiven API-Nutzern für 120 Sekunden: p95 Abfrage 171→119 ms, Buchung 244→138 ms, Absage 261→143 ms, API-Fehler insgesamt 2,971→0 %. Zusätzlich harte gleichzeitige Buchungsspitze: p95 5.443→3.842 ms. 50 bestätigte Plätze, 950 Wartende, keine Überbuchung oder unberechtigte Buchung und keine Test-E-Mails.

Gesamtziel weiterhin nicht erreicht: 39,4 % HTTP-503-Ressourcenlimitfehler bei den separaten 1.000 echten Anmeldeversuchen. Höheres CPU-Limit wurde für den Free-Plan vom Anbieter abgewiesen; kein Tarifwechsel, keine Abschwächung der Passwortprüfung. Vollständige Methodik und Nachweise: [Performance-Optimierung](PERFORMANCE_OPTIMIZATION.md).

## Nachweise der regionalen Ausbaustufe

- Additive Datenstruktur für Standorte, Standortverantwortliche, Plattformadministratoren und Trainingsserien. Bestehende Gruppen zunächst beim Platzhalterstandort. Das bereits vorhandene persönliche Betreiberkonto ist Plattformadministrator; keine neuen produktiven Benutzerkonten erzeugt.
- Mehrere Trainer je Gruppe, bis zu 26 wöchentliche Termine mit stabiler Berliner Ortszeit, einzelne Termine bearbeiten/absagen, Kapazitätslimit und atomare Warteliste mit Nachrücken. Standort- und Datumsfilter sowie begrenzte Terminseiten. Neue regionale Gruppen werden von der zuständigen Verwaltung angelegt.
- Geschützte Projektseite `/projekt`, einschließlich Scrum-Rollen und Backlog-Anforderung; Mitgliedschaft allein gibt keinen Projektzugriff. Projekt-Reviewer erhalten keine operativen Sportrechte. Keine zusätzliche Scrum-Verwaltungsanwendung implementiert.
- Freiwillige Trainingsbenachrichtigungen mit persistenter, begrenzter Resend-Outbox; Datenexport enthält neue Rollen-, Standort-, Buchungs- und Benachrichtigungsdaten. Bestehende Einladung und Wiederherstellung bleiben erhalten.
- 30 automatische Regressionstests erfolgreich. Lokale Browserprüfung bei 390 und 1280 Pixeln: Serienanlage über Sommerzeitwechsel, Wartestatus, Nachrücken nach Absage, Datumsfilter, Rollenanzeige und Projektseite. Kein physischer Smartphone-Test.
- Produktionsprüfung mit isolierten Standorten und unabhängigen Sitzungen: Standortisolation, Rollen, Serie/Zeitumstellung, Filter, Registrierung, Buchung, Warteliste, Nachrücken, Export und Projektzugriff erfolgreich. Separater D1-Export vor Migration; Fingerprint-Vergleich bestätigte unveränderte bestehende Konten, Gruppen, Mitgliedschaften, Einladungen, Termine und Antworten.
- Automatischer Fünf-Minuten-Lauf hat beide isolierten Trainingsmails beim ersten Versuch verarbeitet; Resend zeigt jeweils Delivered: „Platz bestätigt“ (01a1e572-3542-73ae-a53a-df2463fb609d) und „Training geändert“ (01a1e572-3365-7b36-9267-1654809f48d5). Ausschließlich offizielle Resend-Testadresse, keine echten Mitglieder angeschrieben. Beide Teststandorte/-gruppen und drei synthetische Konten anschließend entfernt; Bestandsvergleich erneut erfolgreich. Bestehende Resend-Secrets unverändert.
- Verbindliche Performance-Anforderung und Akzeptanzkriterien: [Product Backlog](PRODUCT_BACKLOG.md). Vollständiger lokaler Lauf mit 1.000 echten Logins, 8.000 relevanten Anfragen und 1.000 zusätzlichen Rechteprüfungen: 0 unerwartete Fehler und keine beobachtete Überbuchung; p95 Anmeldung 235.595 ms, Abfrage 5.495 ms, Buchung 6.937 ms, Absage 6.684 ms. Details und klare Grenzen: [Performance-Bericht](PERFORMANCE.md).

## Erweiterung: persönliche E-Mail-Einladungen

- Mehrere Adressen unter „Gruppe & Einladen“, eigene Resend-Nachricht je Empfänger, ausschließlich gehashte Einmaltokens in D1, Empfängerbindung und automatische Mitgliedschaft nach Registrierung oder Annahme. Status ausstehend/angenommen/abgelaufen, Versandfehler, erneutes Senden und 1/3/7 Tage Gültigkeit sind implementiert.
- 23 automatisierte Tests erfolgreich: zusätzlich Batch-Versand, Weitergabe an fremde Adresse, bestehende Konten, Tokenrotation, abgelaufene Links, Providerfehler, konkurrierender Versand, Rollen- und Gruppenisolation, Größenlimits, CSRF und Bereinigung.
- Produktionsprüfung mit isolierter Gruppe und unabhängigen HTTP-Sitzungen: zwei individuelle Einladungen in einem echten Resend-Batch; beide Delivered. Erneuter Versand ebenfalls Delivered. IDs: 01a1e518-d9ed-7bea-b4ad-ba712f3d2995, 01a1e518-d9ed-7bd9-923d-e113a4c570ec, 01a1e51a-13cd-709e-9c99-8c13d7300142.
- Falsche Empfängeradresse abgewiesen; Registrierung automatisch als Mitglied der richtigen Gruppe gespeichert. Beide persönlichen Einladungen anschließend als angenommen gespeichert, einschließlich des bestehenden Eigentümerkontos. Verbrauchte und ersetzte Links abgewiesen. Schutzfrist beim zu frühen erneuten Versand bestätigt.
- Trainerformular auf der veröffentlichten App bei schmaler Browserbreite geprüft. Datenschutzhinweise um die persönliche Einladung erweitert. Bestehender Resend-Schlüssel und Hauptwebsite unverändert.
- Isolierte Testgruppe samt zwei synthetischen Konten nach der Prüfung entfernt. Persönliches Trainerkonto und ursprüngliche Gruppe bleiben erhalten. Vor der Migration wurde ein privater D1-Export gesichert.

## Nachgewiesene Prüfungen

- 15 automatisierte Tests: Validierung, echte lokale Worker/D1-Integration, Rollen, Gruppenisolation, Einladungen, Termine, Antworten, neue Sitzungen, Passwortreset, Kontolöschung mit Referenzübertragung, Schutz der letzten Trainerrolle und konkurrierende Einmal-Einladungen.
- Vier getrennte Konten auf der Produktionsdomain: Trainer und drei Mitglieder. Zusage, Absage, Vielleicht, Antwortänderung, Teilnehmerliste, Terminerstellung/-änderung/-löschung, Datenexport und Anmeldung aus unabhängigen HTTP-Sitzungen erfolgreich.
- Öffentlicher Browser-Test: zusätzliche Registrierung über Einladungslink, gespeicherte Antwort nach Neuladen, Trainerliste, Termin anlegen/bearbeiten und Demo. Der zusätzliche Listen-Aktualisieren-Knopf wurde nach Veröffentlichung im offenen Dialog geprüft.
- Darstellung bei tatsächlichen Browserbreiten 390 und 1280 Pixeln geprüft; mobile Überbreite korrigiert.
- SMTP-Versand: Resend-Domain mail.teamzeit.yousef-alhabod.de in Irland verifiziert. DKIM und beide CNAME-Einträge öffentlich auflösbar. Bestehende DNS-Einträge der Hauptwebsite unverändert.
- Echte Testmail und echte Passwortreset-Mail an das persönliche Trainerkonto laut Resend jeweils Delivered. Testmail-ID: 01a1e4c6-f5cf-7116-a175-04cf6d957c65. Reset-Mail-ID: 01a1e4c7-fb98-7a32-a7a6-6229f3b39c73.
- Persönlicher Passwortreset durch den Eigentümer abgeschlossen: zuvor ein gültiger Rücksetztoken, danach null Tokens und eine aktive neue Sitzung; Trainerrolle in der App und Datenbank bestätigt. Das persönliche Passwort wurde weder gelesen noch protokolliert.
- Sämtliche fünf synthetischen Produktionskonten und die konkrete E2E-Testgruppe entfernt. Das persönliche Trainerkonto und die Gruppe Die wilden Waden bleiben erhalten; ursprüngliche Gruppenreferenzen wurden übertragen. Alte Test-Sitzung ungültig.
- Temporärer Operator-Endpunkt entfernt. RESEND_SETUP_KEY und das verbrauchte SETUP_TOKEN aus der Produktion gelöscht. Nur RATE_LIMIT_SECRET und RESEND_API_KEY bleiben als Secrets bestehen.
- Bestehender Resend-Schlüssel mit Sending Access auf ausdrücklichen Wunsch beibehalten. Es wurde kein neuer Schlüssel erstellt oder der aktive Schlüssel widerrufen. Das entfernte Setup-Secret enthielt denselben Wert und war kein eigenständiger Full-Access-Schlüssel.
- Öffentliche Schlussprüfung: HTTPS, HTTP-Weiterleitung, Sicherheitsheader, geschützte Kontodaten, aktive Registrierung per Einladung, konfigurierte Wiederherstellung, Rechtsseiten und Assets erfolgreich.
- npm audit: keine bekannten Schwachstellen im geprüften Stand. GitHub-Prüfläufe erfolgreich; Schlussstand wird über denselben Workflow geprüft.
- Portfolio: sieben bestehende Testgruppen erfolgreich. Original-CSS, JavaScript und Profilbild per Hashvergleich unverändert; Seiten und Gästebuch-API nach Veröffentlichung erreichbar. Portfolio-Link per Pull Request 3 mit main synchronisiert.

## Nutzung

Besucher können sofort die interaktive Demo öffnen. Der Eigentümer meldet sich mit dem persönlichen Konto und dem selbst gesetzten Passwort an. Unter Gruppe & Einladen erzeugt er einen sieben Tage gültigen Mitgliedslink für bis zu 25 Beitritte. Mitglieder registrieren sich damit ohne Einrichtungscode. Trainer können Mitglieder verwalten und weitere Trainer bestimmen.

## Grenzen

Kein Test auf einem physischen iPhone oder Android-Gerät; geprüft wurde die responsive Browserdarstellung. Fotos, Push-Nachrichten, Leistungsstatistiken und automatische Erinnerungen gehören nicht zu dieser Ausbaustufe. Die technischen Prüfungen sind keine pauschale rechtliche Konformitätsgarantie; insbesondere bei später geänderten Verarbeitungszwecken sind die Datenschutzhinweise anzupassen.

## Nachweise und Sicherung

Lokale Prüfberichte und Browserbilder liegen in test-results, private Einrichtungsdateien in .private; beide Verzeichnisse sind von Git ausgeschlossen. Einrichtungsskripte dokumentieren den abgeschlossenen Aufbau und benötigen teilweise inzwischen ungültige private Testzugänge. Sie sind kein Bestandteil des normalen Betriebs. Das Originalprojekt wurde vor Änderungen außerhalb des Repositories gesichert; ursprüngliche lokale .wrangler-Daten wurden nicht gelöscht.
