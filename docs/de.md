# Kanboard

Die Aufgaben deines [Kanboard](https://kanboard.org) in Gladys: was heute noch
zu tun ist, was überfällig ist, die nächste Aufgabe jedes Projekts. Eine Szene
reagiert, wenn eine Aufgabe fällig wird oder um Mitternacht noch offen ist,
eine andere legt „Brot kaufen, morgen“ per Taste an, ein Tippen auf dem
Dashboard schließt eine Aufgabe, und Gladys kann jeden Morgen die Aufgaben des
Tages vorlesen.

> **Feedback willkommen.** Diese Integration wurde mit einem echten
> Kanboard-Server getestet (Docker-Image `kanboard/kanboard` v1.2.56, Oktober
> 2026), noch nicht im Alltag. Wenn etwas nicht wie beschrieben funktioniert,
> sag es im [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-kanboard/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Ein **selbst gehostetes Kanboard** (1.2 oder neuer), von Gladys aus
  erreichbar (das Docker-Image lauscht auf Port 80).
- Zugangsdaten für seine API, eine der beiden Varianten:
  - das **API-Token der Anwendung**: in Kanboard **Settings** → **API**, das
    **API token** kopieren, mit dem Benutzernamen `jsonrpc`. Es sieht **alle
    Projekte** der Instanz (auch private), und nur ein Administrator kann es
    lesen;
  - ein **Benutzerkonto**: sein Benutzername und sein Passwort oder ein
    persönliches Zugriffstoken (**Mein Profil** → **API**; Pflicht bei
    aktiver Zwei-Faktor-Authentifizierung). Es sieht **die Projekte, in denen
    dieser Benutzer Mitglied ist**, und handelt in seinem Namen.

## Einrichtung

1. In Gladys **Integrationen** → **Kanboard** installieren.
2. Im Bildschirm **Konfiguration** ausfüllen:
   - **Adresse**: die Adresse von Kanboard, zum Beispiel
     `http://192.168.1.20:8080` oder `https://kanboard.example.org/kanboard`,
     wenn es in einem Unterordner liegt (die von einem Board kopierte Adresse
     funktioniert auch);
   - **Benutzername**: `jsonrpc` (Standard) für das API-Token der Anwendung
     oder dein Kanboard-Benutzername;
   - **API-Token oder Passwort**: das passende Geheimnis.
3. Optionen:
   - **Verfolgte Projekte**: Namen oder Nummern, durch Kommas getrennt
     (`Haushalt, 3`). Leer: alle Projekte. Inaktive (geschlossene) Projekte
     werden nie verfolgt;
   - **Selbstsignierte Zertifikate akzeptieren**: für eine `https://`-Adresse
     mit selbstsigniertem Zertifikat, nur für deinen eigenen Server;
   - **Aktualisierungsintervall**: 1 bis 10 Minuten (standardmäßig 5).
     Fälligkeiten und Mitternacht werden immer pünktlich berücksichtigt,
     unabhängig vom Intervall;
   - **Sprache der Funktionsnamen**: die Namen der Funktionen beim Hinzufügen
     eines Geräts (standardmäßig Französisch) und die an Szenen gesendeten
     Texte.
4. Speichern, dann **Verbindung testen**: Die Integration liest Kanboard und
   nennt seine Version, die Zahl der offenen Aufgaben und der verfolgten
   Projekte.
5. Im Tab **Erkennung** die gewünschten Geräte hinzufügen.

## Geräte

**Kanboard** (alle verfolgten Projekte zusammen) und **Kanboard _Projekt_**
für jedes verfolgte Projekt. Jedes hat vier Funktionen:

| Funktion               | Was sie anzeigt                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `Offene Aufgaben`      | offene Aufgaben, mit oder ohne Fälligkeit                                                           |
| `Aufgaben für heute`   | offene Aufgaben, die vor Mitternacht fällig sind, überfällige inklusive: was bis heute Abend bleibt |
| `Überfällige Aufgaben` | offene Aufgaben, deren Fälligkeitsdatum und -uhrzeit vorbei sind                                    |
| `Nächste Aufgabe`      | der Titel der offenen Aufgabe mit der nächsten anstehenden Fälligkeit; sonst `Keine`                |

„Heute“ ist der Tag in der Zeitzone von Gladys. In Kanboard hat eine
Fälligkeit immer eine Uhrzeit: Ein Datum ohne Uhrzeit bekommt die Uhrzeit des
Moments, in dem es gespeichert wurde.

## Dashboard

Das Widget **Heutige Aufgaben** zeigt zwei Kacheln (heute zu tun,
überfällig), die Liste der Aufgaben des Tages, überfällige zuerst, mit ihrer
Uhrzeit (orange bei der höchsten Priorität des Projekts) und ihrem Projekt,
und eine Taste für jede der vier dringendsten: Ein Tippen schließt die
Aufgabe. Wähle in den Widget-Einstellungen ein Projektgerät, um nur dessen
Aufgaben zu sehen; leer für alle verfolgten Projekte. Wenn nichts mehr übrig
ist, sagt das Widget es und zeigt die nächste Aufgabe.

Die Zähler können auch wie jede Gerätefunktion auf das Dashboard.

## Szenen

### Auslöser

- **Kanboard-Aufgabe fällig**: Eine offene Aufgabe hat ihre Fälligkeit
  erreicht.
- **Kanboard-Aufgabe überfällig**: Um Mitternacht ist eine an diesem Tag
  fällige Aufgabe noch offen. Einmal pro Aufgabe und Fälligkeit.

Filter, für beide: das Projekt (ein Projektgerät: Das Gerät **Kanboard**
filtert nichts, lass das Feld für alle Projekte leer), der Titel der Aufgabe.
An die Aktionen übergebene Informationen: die Aufgabe, ihre Nummer, ihr
Projekt, ihre Priorität (standardmäßig 0 bis 3, pro Projekt in Kanboard
eingestellt), ihre Fälligkeit.

Eine vor ihrer Fälligkeit geschlossene Aufgabe löst nichts aus. Eine von Hand
vor die vorherige Abfrage verschobene Fälligkeit löst auch nichts aus: Es
zählen nur die Momente, die vergehen, während die Integration läuft. Ein
Neustart löst nichts doppelt aus; ein Moment, der verging, während die
Integration gestoppt war, wird beim Neustart ausgelöst, wenn er weniger als
eine Stunde alt ist.

### Aktionen

- **Kanboard-Aufgabe schließen**: Gib den genauen **Titel** (Groß- und
  Kleinschreibung und Akzente egal) oder die **Nummer** der Aufgabe an
  (`#12`, auf der Karte in Kanboard angezeigt). Jede offene Aufgabe, die die
  Zugangsdaten sehen, verfolgtes Projekt oder nicht. Eine Aufgabe, die sich
  „beim Schließen“ wiederholt, hinterlässt ihr nächstes Vorkommen, wie in
  Kanboard. Ergebnisse: die Aufgabe, ihre Nummer, ihr Projekt, die Fälligkeit
  des nächsten Vorkommens.
- **Kanboard-Aufgabe erstellen**: ein Titel, das Projekt per Name oder Nummer
  (leer: das erste verfolgte Projekt, nach Namen) und eine optionale
  Fälligkeit: `2026-10-25 18:00`, `25.10.2026`, `heute`, `morgen 9:00`, `+3`
  (in drei Tagen) oder nur eine Uhrzeit für heute; ohne Uhrzeit 18:00. Die
  Wörter funktionieren auch auf Englisch, Französisch und Spanisch
  (`tomorrow`, `demain`, `mañana`). Das Datum wird in der Zeitzone von Gladys
  gelesen, egal welche Kanboard nutzt. Ergebnisse: die Aufgabe, ihre Nummer,
  ihr Projekt, ihre Fälligkeit.
- **Heutige Kanboard-Aufgaben lesen**: die Aufgaben des Tages als Satz
  (`5 Aufgabe(n) für heute: …. 2 überfällig.`), für alle verfolgten Projekte
  oder eines davon. Ergebnisse: der Satz, die Zahl der Aufgaben für heute und
  der überfälligen Aufgaben. Schick den Satz in einer Nachricht oder lass ihn
  Gladys sprechen.

Die Felder akzeptieren Szenenvariablen: `{{triggerEvent.data.task_id}}`
schließt die Aufgabe, die die Szene ausgelöst hat.

### Szenenideen

- Um 7:30 **Heutige Kanboard-Aufgaben lesen**, dann den Satz per Telegram
  schicken.
- **Kanboard-Aufgabe fällig** im Projekt `Haushalt`: das Licht im Flur
  blinken lassen.
- Eine Taste an der Tür startet **Kanboard-Aufgabe erstellen** mit
  `Brot kaufen` in `Einkauf`, fällig `morgen 9:00`.
- Ein NFC-Tag an den Mülltonnen startet **Kanboard-Aufgabe schließen** mit
  `Müll rausbringen`.

## Fehlerbehebung

- **„Kanboard antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner
  aus (die Adresse öffnet Kanboard im Browser).
- **„Benutzername, Token oder Passwort abgelehnt“**: Mit `jsonrpc` das Token
  unter **Settings** → **API** neu kopieren (es ändert sich beim
  Neugenerieren); mit einem Benutzer das Passwort prüfen oder bei aktiver
  Zwei-Faktor-Authentifizierung ein persönliches Zugriffstoken verwenden.
  Kanboard sperrt ein Konto nach mehreren Fehlversuchen.
- **„Zugriff für diesen Benutzer verboten“**: Der Benutzer darf ein Projekt
  nicht lesen, oder der Benutzername ist für ein Anwendungstoken nicht
  `jsonrpc`.
- **„Keine Kanboard-API unter dieser Adresse“**: Die Adresse antwortet, aber
  nicht mit der Kanboard-API: Prüfe Port und Unterordner.
- **„Die Adresse leitet um“**: Gib die `https://`-Adresse ein.
- **Ein Projekt fehlt**: Inaktive Projekte werden nicht verfolgt; mit einem
  Benutzerkonto werden nur seine Projekte gesehen; ein unter **Verfolgte
  Projekte** eingegebener Name ohne passendes Projekt wird ignoriert, und
  **Verbindung testen** nennt ihn.
- **„Mehrere offene Aufgaben haben diesen Titel“**: Gib stattdessen die
  Nummer an (`#12`).
- Protokolle: `LOG_LEVEL=debug` am Container zeigt jede Abfrage.

## Grenzen

- Kanboard wird alle 1 bis 10 Minuten gelesen (und zu jeder Fälligkeit und um
  Mitternacht): Eine in Kanboard geschlossene Aufgabe erscheint in Gladys
  innerhalb dieser Zeit. Kanboard-Webhooks werden nicht genutzt.
- Zwei Anfragen pro Abfrage: die Projekte, dann die offenen Aufgaben aller
  verfolgten Projekte in einem einzigen JSON-RPC-Stapel.
- Die Integration schließt und erstellt Aufgaben; sie bearbeitet,
  verschiebt, weist zu oder löscht sie nicht. Teilaufgaben werden nicht
  gezählt.
- Getestet mit Kanboard v1.2.56, mit dem Anwendungstoken und mit einem
  Benutzerkonto.
- Gladys speichert keine Kanboard-Daten außer `/data/kanboard-state.json`
  (die Zeit der letzten Abfrage, damit kein Ereignis doppelt ausgelöst wird).
- Keine Verbindung zu Kanboard.
