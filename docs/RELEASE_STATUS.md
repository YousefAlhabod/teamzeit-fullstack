# TeamZeit – Releaseprüfung, 16. November 2026

## Veröffentlicht

- Anwendung: https://teamzeit.yousef-alhabod.de
- Portfolio-Eintrag: https://yousef-alhabod.de/#teamzeit
- Worker: teamzeit-app, getrennt vom bestehenden Pages-Projekt des Portfolios.
- Produktions-D1: teamzeit-production, EU-Jurisdiktion. Drei Migrationen angewendet.
- Eigene Datenschutz- und Impressumseiten, Teamrollen mit Vornamen und separat ausgewiesener Full-Stack-Beitrag.
- Registrierung ausschließlich über gültige Einladung. Noch keine bestätigte E-Mail-Zustellung.

## Nachgewiesen

- 15 automatisierte Tests einschließlich echter lokaler Worker/D1-Integration.
- Vier getrennte Konten und unabhängige HTTP-Sitzungen auf der Produktionsdomain: Trainer, drei Mitglieder; zusätzliche Browserregistrierung mit ausschließlich fiktiven Angaben.
- Zusage/Absage/Vielleicht, Änderung der Antwort und korrekte Trainerliste. Gespeicherter Zustand über neue Sitzung abrufbar.
- Erstellung, Änderung und Löschung von Terminen; Zugriffstrennung nach Rolle und Gruppe; CSRF-Origin-Abwehr und Abmeldung.
- Kontoexport, lokale Kontolöschung mit Referenzübertragung, Schutz der letzten Trainerrolle, einmalige Trainerinvitation unter konkurrierenden Registrierungen.
- Browser auf der öffentlichen Domain: Registrierung mit Einladungslink, Teilnahme nach Neuladen, Trainerliste, Termin anlegen/bearbeiten, Demo ohne Konto.
- Responsive Darstellung bei tatsächlichen Browserbreiten 390 und 1280 Pixeln. Mobile Überbreite korrigiert. Kein Test auf physischem iPhone/Android-Gerät.
- HTTP leitet auf HTTPS um. API und statische Seiten liefern Sicherheitsheader.
- Passwortreset mit simuliertem Versand: identische öffentliche Antwort für bekannte/unbekannte Adresse, gehashter Token, Ablauf, Einmalverwendung, neue Anmeldung und ungültige alte Sitzungen.
- Produktionsfehler beim bisherigen PBKDF2 (>100.000 Iterationen) nachgewiesen und durch scrypt für neue Konten behoben. Echtes Produktionskonto anschließend erfolgreich erstellt und angemeldet.
- npm audit: keine bekannten Schwachstellen im geprüften Abhängigkeitsstand.
- Portfolio: sieben bestehende Testgruppen erfolgreich; Original-CSS, JavaScript und Profilbild per Hashvergleich unverändert; bestehende Seiten und Gästebuch-API nach Veröffentlichung erreichbar.

## Noch offen – keine vollständige Freigabe

- GitHub-Repository veröffentlicht: https://github.com/YousefAlhabod/teamzeit-fullstack . Der erste automatisierte GitHub-Prüflauf ist erfolgreich (Run 43881054339).
- Portfolio-Verlinkung ist mit GitHub synchronisiert: Pull Request 3 nach bestandener Cloudflare-Prüfung zusammengeführt, Merge 9620e8b8cf87bc1c456cf480d9e78610c2c7f588.
- RESEND_API_KEY ist als Produktions-Secret vorhanden und vom Anbieter als Sending Access erkannt. Der für Domain-Verwaltung erforderliche temporäre RESEND_SETUP_KEY fehlt in den über die API sichtbaren Versionen. Senderdomain, DNS, echte Nachrichtenzustellung und vollständiger Reset über zugestellte E-Mail sind deshalb noch offen.
- Temporärer Deployment-Operator-Endpunkt /api/admin/mail-config ist durch den zufälligen SETUP_TOKEN geschützt. Nach erfolgreicher Einrichtung entfernen und erneut veröffentlichen.
- Die konkrete E2E-Testgruppe und vier synthetische Mitgliedskonten wurden entfernt. Der initiale Trainer bleibt vorläufig erhalten, damit der einzige Verwaltungszugang nicht verloren geht. Eine private einmalige Trainer-Einladung ist vorbereitet. Die Produktionsprüfung zählt bisher nur dieses eine synthetische Konto und noch keinen persönlichen Trainer. Erst nach verifiziertem persönlichem Konto das technische Trainerkonto entfernen.
- Provider-Vertragsunterlagen, tatsächliche Versandkonfiguration und Datenschutzhinweise vor abschließender Freigabe abgleichen. Keine pauschale rechtliche Konformitätsgarantie.

## Lokale Nachweise

Private Testzugänge und Operator-Secret liegen ausschließlich im ignorierten Verzeichnis .private. Produktionsprüfbericht und Browserbilder befinden sich in test-results (ebenfalls ignoriert). Das ursprüngliche Projekt wurde vor den Änderungen außerhalb dieses Repositories gesichert; die ursprünglichen lokalen .wrangler-Daten wurden nicht gelöscht.
