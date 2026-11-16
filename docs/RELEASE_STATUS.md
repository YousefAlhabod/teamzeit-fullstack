# TeamZeit – technischer Freigabestand, 16. November 2026

Die geprüften Kernfunktionen sind für die Kurs- und Portfolio-Nutzung veröffentlicht.

- App und öffentliche Demo: https://teamzeit.yousef-alhabod.de
- Quellcode: https://github.com/YousefAlhabod/teamzeit-fullstack
- Portfolio: https://yousef-alhabod.de/#teamzeit
- Produktionsversion: 8636031c-7320-4704-a72a-8e030f88fe09
- Eigener Worker und separate D1-Datenbank mit EU-Jurisdiktion; drei Migrationen angewendet.

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
