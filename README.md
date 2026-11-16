# TeamZeit

Deutschsprachige Full-Stack-Portfolio-Version eines gemeinsam erarbeiteten Scrum-Kursprojekts. Trainingstermine und Teilnahmen für erwachsene Freizeitsportgruppen.

- Anwendung und Demo: https://teamzeit.yousef-alhabod.de
- Portfolio: https://yousef-alhabod.de/#teamzeit
- Datenschutz: https://teamzeit.yousef-alhabod.de/datenschutz.html

## Funktionen

Anmeldung und Abmeldung, Trainer- und Mitgliederrollen pro Gruppe, Gruppen anlegen/löschen, Mitglieder verwalten, Einladungslinks, Termine erstellen/bearbeiten/löschen, Zusage/Absage/Vielleicht, Teilnehmerlisten für Trainer, eigene Daten exportieren und Konto löschen. Die Demo benötigt kein Konto und speichert ausschließlich lokale Beispieldaten. Termine verwenden Europe/Berlin unabhängig von der Gerätezeitzone.

Cloudflare Workers stellt API und statische Dateien bereit. Eine separate D1-Datenbank mit EU-Jurisdiktion speichert Konten und Gruppendaten. Neue Passwörter verwenden scrypt (N=16384, r=8, p=5, zufälliger Salt). Ursprüngliche lokale PBKDF2-Konten behalten ihr Format. Sitzungen liegen als Hash in D1 und als Secure/HttpOnly/SameSite-Cookie im Browser. Einladungen und Rücksetztokens werden nur gehasht gespeichert. Berechtigungen werden serverseitig geprüft. Zähler begrenzen Anmelde- und Rücksetzversuche; ein täglicher Lauf bereinigt abgelaufene Sicherheitsdaten.

## Ursprüngliche Teamrollen

| Name | Kursrolle | Beitrag |
| --- | --- | --- |
| Vanessa | Product Owner | Produktwert und Priorisierung |
| Ünal | Scrum Master | Scrum-Prozess und Moderation |
| Stefan | Developer | US01: Termin erstellen |
| Suzana | Developer | US02: Teilnahme melden |
| Yousef | Developer | US03: Teilnehmerliste |

**Yousef Alhabod – Full-Stack Developer der eigenständigen TeamZeit-Portfolio-Version.** Die technische Weiterentwicklung ersetzt nicht die Beiträge des ursprünglichen Scrum-Teams. Weitere Mitwirkende werden bis zur geklärten Zustimmung nur mit Vornamen genannt.

## Lokal entwickeln

Node.js 22 oder neuer (empfohlen: 24).

```sh
npm ci
npm run db:local
# .dev.vars.example als .dev.vars kopieren und eigenen zufälligen SETUP_TOKEN setzen
npm run dev
npm run check
```

Die vorhandene lokale Datenbank und das Backup des ursprünglichen Projekts bleiben getrennt von der neu eingerichteten Produktionsdatenbank. Die ursprüngliche .wrangler-Verzeichnisstruktur wurde nicht gelöscht. Die einmalige Einrichtung benötigt den geheimen SETUP_TOKEN und ist auf einer bereits eingerichteten Datenbank gesperrt.

## Produktion und Geheimnisse

`wrangler.jsonc` bindet ausschließlich den eigenständigen Worker und die TeamZeit-Produktionsdatenbank. `npm run db:remote` wendet Migrationen an, `npm run deploy` veröffentlicht. Beide Schritte benötigen ein autorisiertes Cloudflare-Konto. Die Hauptdomain wird von einem separaten Pages-Projekt ausgeliefert.

Im eingerichteten Produktivbetrieb verbleiben `RATE_LIMIT_SECRET` und `RESEND_API_KEY` als Cloudflare-Secrets. `SETUP_TOKEN` wird nur für die einmalige Ersteinrichtung benötigt und wurde anschließend aus der Produktion entfernt. `APP_ORIGIN`, `MAIL_FROM` und die Registrierungsschaltung sind normale Variablen. Keine Secrets, .dev.vars, Testzugänge oder lokale Sicherungen veröffentlichen. Die Verzeichnisse `.private`, `tooling` und `test-results` sind ausgeschlossen.

Die Passwort-Wiederherstellung verwendet die verifizierte Resend-Senderdomain `mail.teamzeit.yousef-alhabod.de` (Irland) und einen Sending-Access-Schlüssel. Echte Test- und Rücksetzmails wurden als Delivered bestätigt; der persönliche Reset samt neuer Anmeldung wurde abgeschlossen. Ein Link gilt 30 Minuten, nur einmal, und beendet vorhandene Sitzungen. Fehlt die Konfiguration in einer anderen Installation, meldet die App die fehlende Verfügbarkeit.

## Validierung

`npm run check` prüft Syntax und führt 23 Tests aus, darunter integrierte Worker/D1-Abläufe mit vier Konten, Rollen, getrennten Gruppen, persönlichen E-Mail-Einladungen, Terminen, veränderten Antworten, neuen Sitzungen, Passwortreset, Kontolöschung mit Referenzübertragung und Schutz der letzten Trainerrolle.

### Persönliche E-Mail-Einladungen

Trainer können unter „Gruppe & Einladen“ bis zu 20 Adressen gleichzeitig eingeben. Resend erhält für jede Adresse eine eigene Nachricht mit einem zufälligen, einmaligen und an die Empfängeradresse gebundenen Link. Nach Registrierung oder ausdrücklicher Annahme mit einem bestehenden Konto wird die Person Mitglied der ausgewählten Gruppe. Die Übersicht zeigt ausstehende, angenommene und abgelaufene Einladungen sowie Versandfehler. Der Versandstatus bestätigt die Annahme durch Resend, keine Inbox-Zustellung.

Gültigkeit: 1, 3 oder 7 Tage. Erneutes Senden ersetzt den alten Link und erneuert die Frist. Mindestens 60 Sekunden Abstand und höchstens fünf Versuche je Adresse pro Tag; höchstens 20 Versandaktionen je Trainer pro Stunde und 100 Empfänger je Gruppe pro Tag. Doppelte Adressen werden zusammengeführt, bestehende Mitglieder übersprungen. Historie: letzte 100 Einladungen, tägliche Löschung ab 30 Tagen nach Ablauf. Migration `0004_email_invitations.sql` erweitert die bestehende Tabelle; bisherige Gruppenlinks bleiben nutzbar. Keine zusätzlichen Secrets erforderlich.

Zusätzlich wurden auf der öffentlichen Produktionsdomain vier unabhängige Konten über HTTP-Sitzungen getestet. Ein weiterer Browser-Test prüfte Registrierung, gespeicherte Teilnahme nach Neuladen, Trainerliste und Terminbearbeitung. Die Darstellung wurde mit 390 Pixeln Breite geprüft; dies ist kein Test auf einem physischen Android- oder iOS-Gerät. Ergebnisse und offene Schritte stehen in `docs/RELEASE_STATUS.md`.

Fotos, Leistungsstatistiken, automatische Erinnerungen und Push-Nachrichten aus späteren Backlog-Ideen sind nicht implementiert. Eine technische Prüfung ist keine pauschale Bestätigung sämtlicher rechtlicher Anforderungen.
