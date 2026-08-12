# TBAU – Firemný portál

Interný firemný portál pre stavebnú firmu **TBAU**. Ide o jednotnú platformu,
ktorá pod sebou združuje viacero aplikácií (modulov) pre každodenný chod firmy.

## O projekte

Cieľom je jednoduchý, prehľadný a bezpečný portál, cez ktorý firma spravuje
svoju administratívu a prevádzku na jednom mieste. Portál je navrhnutý modulárne
– jednotlivé aplikácie sa dajú postupne pridávať a rozširovať.

### Plánované moduly

| Modul | Popis | Stav |
|-------|-------|------|
| RSV | Riadenie stavebnej výroby (evidencia zákaziek, výkazov) | 🔲 plánované |
| Správa faktúr | Vystavovanie a evidencia faktúr | 🔲 plánované |
| Zamestnanci | Evidencia zamestnancov a dochádzky | 🔲 plánované |
| _(ďalšie)_ | Podľa potrieb firmy | 🔲 plánované |

> Tabuľka modulov sa priebežne aktualizuje podľa toho, čo je rozpracované/hotové.

## Technológie

_Zatiaľ neurčené – doplní sa pri založení základnej štruktúry aplikácie._

## Denník prác

Sekcia, ktorá sa dopĺňa po každej pracovnej session – čo sa spravilo a čo je na rade.

- **2026-08-12** – Založené repo, prvotná štruktúra a README (popis projektu + sekcie Bezpečnosť a ISO 27000).
- **2026-08-12** – Nastavený prístup na produkčný VPS (TBAU-Server): SSH kľúčová autentifikácia, vytvorený admin účet `tbau` (sudo).

---

## 🖥️ Prístupy na server

Produkčný VPS, na ktorom pobeží portál.

| Parameter | Hodnota |
|-----------|---------|
| Názov | TBAU-Server |
| IPv4 | 80.211.202.23 |
| OS | Ubuntu 24.04.4 LTS |

### Používateľské účty

| Účet | Práva | Prihlásenie | Poznámka |
|------|-------|-------------|----------|
| `tbau` | sudo (admin) | SSH kľúč | Hlavný správcovský účet |
| `tomas` (Tomáš Kuriak) | bez sudo | SSH kľúč | 🔲 čaká na verejný kľúč |

> Prihlásenie je **len cez SSH kľúč**, každý používateľ má vlastný účet (účtovateľnosť).
> Súkromné kľúče sa nikdy nezdieľajú – zdieľa sa iba verejný `.pub` kľúč.

---

## 🔒 Bezpečnosť

Tu priebežne evidujeme, čo ešte treba dorobiť, aby bola aplikácia bezpečná.
Zoznam sa aktualizuje po každej práci na projekte.

### Čo treba dorobiť

- [ ] **Zmeniť root heslo servera** – bolo zdieľané v plaintexte, treba rotovať (`passwd`).
- [ ] **Zakázať prihlásenie heslom cez SSH** – povoliť len kľúče (`PasswordAuthentication no`).
- [ ] **Obmedziť/zakázať root SSH login** – po overení admin účtu (`PermitRootLogin no`).
- [ ] **Nahradiť NOPASSWD sudo** pri účte `tbau` za sudo s heslom (aktuálne passwordless).
- [ ] **Firewall (ufw)** – povoliť len potrebné porty (SSH, HTTP/HTTPS).
- [ ] **Autentifikácia** – prihlasovanie používateľov (silné heslá, hashovanie napr. bcrypt/argon2).
- [ ] **Autorizácia / role** – rozdelenie prístupu podľa rolí (admin, účtovník, zamestnanec…).
- [ ] **Šifrovanie prenosu** – vynútené HTTPS/TLS na celom portáli.
- [ ] **Šifrovanie dát v pokoji** – citlivé údaje (osobné, mzdové) šifrované v DB.
- [ ] **Správa tajomstiev** – žiadne heslá/kľúče v kóde; použiť `.env` / secret manager.
- [ ] **Ochrana pred útokmi** – SQL injection, XSS, CSRF, rate-limiting.
- [ ] **Bezpečné session** – HttpOnly/Secure cookies, expirácia, odhlásenie.
- [ ] **Logovanie a audit** – kto, kedy a čo urobil (auditný záznam).
- [ ] **Zálohovanie** – pravidelné zálohy a overený postup obnovy.
- [ ] **Aktualizácie závislostí** – sledovanie zraniteľností (napr. Dependabot).
- [ ] **GDPR** – spracovanie osobných údajov zamestnancov v súlade s legislatívou.

### Hotové

- [x] **SSH kľúčová autentifikácia** – prístup na server cez kľúče (nie heslá).
- [x] **Samostatné účty s vlastným kľúčom** – účtovateľnosť (kto sa prihlásil).

---

## 📋 ISO/IEC 27000 (najmä 27001)

Kroky potrebné na zosúladenie so štandardmi radu ISO 27000 (systém riadenia
informačnej bezpečnosti – ISMS). Aktualizuje sa po každej práci na projekte.

### Čo treba dorobiť

- [ ] **Rozsah ISMS** – definovať, čo systém riadenia bezpečnosti pokrýva.
- [ ] **Analýza rizík** – identifikácia aktív, hrozieb a zraniteľností + hodnotenie.
- [ ] **Plán zvládania rizík** – opatrenia na zníženie identifikovaných rizík.
- [ ] **Politiky bezpečnosti** – smernice (heslá, prístupy, práca s dátami).
- [ ] **Riadenie prístupu (A.9)** – princíp najmenších oprávnení, pravidelná revízia.
- [ ] **Kryptografia (A.10)** – pravidlá pre šifrovanie a správu kľúčov.
- [ ] **Bezpečnosť prevádzky (A.12)** – zálohy, logovanie, ochrana pred malvérom.
- [ ] **Bezpečnosť vývoja (A.14)** – bezpečné programovanie, testovanie, oddelené prostredia.
- [ ] **Riadenie incidentov (A.16)** – postup pri bezpečnostných incidentoch.
- [ ] **Kontinuita činností (A.17)** – plán obnovy po výpadku/havárii.
- [ ] **Súlad (A.18)** – legislatíva (GDPR) a interné pravidlá.
- [ ] **Dokumentácia a záznamy** – evidencia dôkazov pre prípadný audit/certifikáciu.

### Hotové

_(zatiaľ nič – projekt v úvodnej fáze)_
