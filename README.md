# TBAU – Firemný portál

Interný firemný portál pre stavebnú firmu **TBAU, s. r. o.** (Žilina). Ide o jednotnú
platformu, ktorá pod sebou združuje viacero aplikácií (modulov) pre každodenný chod
firmy a postupnú optimalizáciu procesov.

**Naživo:** https://tbau.goodvision.sk  *(dočasná doména; neskôr prechod na `portal.tbau.sk`)*

## O projekte

Cieľom je jednoduchý, prehľadný a bezpečný portál, cez ktorý firma spravuje svoju
administratívu a prevádzku na jednom mieste. Portál je navrhnutý modulárne – jednotlivé
aplikácie sa pridávajú postupne. Rozloženie: **logo hore, menu vľavo**, obsah vpravo.

### Stav modulov a sekcií

| Sekcia / modul | Popis | Stav |
|----------------|-------|------|
| Prehľad | Dashboard so štatistikami | ✅ hotové |
| Používatelia | Správa účtov (admin), role, reset hesla | ✅ hotové |
| Aplikácie | Zoznam modulov automatizujúcich procesy | ✅ hotové (rozcestník) |
| Projekty | Evidencia stavebných projektov | ✅ základ |
| Úlohy | Úlohy pri budovaní portálu | ✅ základ |
| Testy | Automatické testy portálu (health check) | ✅ základ (1 test) |
| **RSV** – Riadenie stavebnej výroby | Priebeh stavieb, kontrola rozpočtu (plán vs. skutočnosť), výkazy | 🔲 plánované |
| **Objednávkový systém** | Evidencia a schvaľovanie objednávok | 🔲 plánované |
| Správa faktúr | Vystavovanie a evidencia faktúr | 🔲 plánované |
| Zamestnanci | Evidencia zamestnancov a dochádzky | 🔲 plánované |

## Technológie

- **Backend:** Node.js + Express
- **Šablóny:** EJS (server-side rendering) + express-ejs-layouts
- **Databáza:** SQLite (better-sqlite3)
- **Auth:** express-session (session store v SQLite), heslá hashované cez bcrypt
- **Bezpečnosť:** helmet (CSP, HSTS), vlastná CSRF ochrana, morgan (audit log)
- **Prevádzka:** systemd služba + nginx (reverzný proxy) + Let's Encrypt (HTTPS)

### Spustenie lokálne

```bash
npm install
cp .env.example .env          # doplň SESSION_SECRET (openssl rand -hex 32)
npm run init-db               # vytvorí DB, admin účet a seed dáta
npm start                     # http://localhost:3000
```

### Štruktúra

```
server.js            – vstupný bod (Express, middleware, routy)
src/config.js        – konfigurácia z .env
src/constants.js     – firemné údaje + definícia menu
src/db/              – databáza, schéma, seed, CLI na tvorbu používateľov
src/middleware/      – auth (prihlásenie/role) + CSRF
src/routes/          – auth, pages, users, apps, projects, tasks
views/               – EJS šablóny (layouts, stránky)
public/              – CSS a logo
deploy/              – systemd služba, nginx konfig, deploy skript
```

### Nasadenie novej verzie

```bash
bash deploy/deploy.sh          # git pull + npm ci + reštart služby na VPS
```

## Denník prác

Sekcia, ktorá sa dopĺňa po každej pracovnej session – čo sa spravilo a čo je na rade.

- **2026-08-12** – Založené repo, prvotná štruktúra a README (popis + Bezpečnosť + ISO 27000).
- **2026-08-12** – Prístup na VPS (TBAU-Server): SSH kľúčová autentifikácia, admin účet `tbau` (sudo).
- **2026-08-23** – Vytvorený **základ portálu**: úvodná stránka, prihlásenie (session, bcrypt,
  vynútená zmena hesla), databáza (users/apps/projects/tasks), ľavé menu s kategóriami
  (Používatelia, Aplikácie, Projekty, Úlohy). Značka TBAU (logo, farby, Montserrat).
- **2026-08-23** – **Nasadenie na VPS**: systemd služba, nginx reverzný proxy, otvorený firewall
  (80/443), **HTTPS cez Let's Encrypt** (auto-obnova). Portál beží na https://tbau.goodvision.sk.
- **2026-08-24** – Pridaná sekcia **Testy** do ľavého menu + endpoint `GET /health` (server + DB).
  Prvý test „Stránka funguje" (self-check, PASS/FAIL). Overené naživo.

---

## 🖥️ Prístupy na server

Produkčný VPS, na ktorom beží portál.

| Parameter | Hodnota |
|-----------|---------|
| Názov | TBAU-Server |
| IPv4 | 80.211.202.23 |
| OS | Ubuntu 24.04.4 LTS |
| Doména | tbau.goodvision.sk (A → 80.211.202.23) |

### Nasadenie portálu

| Vec | Hodnota |
|-----|---------|
| Adresár aplikácie | `/opt/tbau-portal` |
| systemd služba | `tbau-portal` (`systemctl status tbau-portal`) |
| Beží na porte | 3000 (interne), navonok cez nginx 80/443 |
| nginx konfig | `/etc/nginx/sites-available/tbau` |
| HTTPS | Let's Encrypt, auto-obnova cez certbot.timer |
| Deploy z repa | read-only deploy key (git pull) |

### Používateľské účty (server, SSH)

| Účet | Práva | Prihlásenie | Poznámka |
|------|-------|-------------|----------|
| `tbau` | sudo (admin) | SSH kľúč | Hlavný správcovský účet |
| `tomas` (Tomáš Kuriak) | bez sudo | SSH kľúč | 🔲 čaká na verejný kľúč |

### Účty v aplikácii (portál)

| Účet | Rola | Poznámka |
|------|------|----------|
| `admin@tbau.sk` | admin | Prvotný účet – heslo treba po prvom prihlásení zmeniť |

> SSH prihlásenie je **len cez kľúč**, každý má vlastný účet (účtovateľnosť).
> Súkromné kľúče sa nikdy nezdieľajú – zdieľa sa iba verejný `.pub` kľúč.

---

## 🔒 Bezpečnosť

Priebežne evidujeme, čo ešte treba dorobiť, aby bola aplikácia bezpečná.
Aktualizuje sa po každej práci na projekte.

### Čo treba dorobiť

- [ ] **Zmeniť root heslo servera** – bolo zdieľané v plaintexte, treba rotovať (`passwd`).
- [ ] **Zakázať prihlásenie heslom cez SSH** – povoliť len kľúče (`PasswordAuthentication no`).
- [ ] **Obmedziť/zakázať root SSH login** – po overení admin účtu (`PermitRootLogin no`).
- [ ] **Nahradiť NOPASSWD sudo** pri účte `tbau` za sudo s heslom (aktuálne passwordless).
- [ ] **Autorizácia / role** – jemnejšie rozdelenie prístupu (admin, účtovník, zamestnanec…).
- [ ] **Šifrovanie dát v pokoji** – citlivé údaje (osobné, mzdové) šifrované v DB.
- [ ] **Rate-limiting prihlásenia** – ochrana proti hádaniu hesla (brute-force).
- [ ] **Zálohovanie** – pravidelné zálohy DB a overený postup obnovy.
- [ ] **Aktualizácie závislostí** – sledovanie zraniteľností (napr. Dependabot).
- [ ] **GDPR** – spracovanie osobných údajov zamestnancov v súlade s legislatívou.
- [ ] **Monitoring/alerting** – dostupnosť a bezpečnostné udalosti.

### Hotové

- [x] **SSH kľúčová autentifikácia** – prístup na server cez kľúče (nie heslá).
- [x] **Samostatné účty s vlastným kľúčom** – účtovateľnosť.
- [x] **HTTPS/TLS** – vynútené (HTTP→HTTPS redirect), HSTS, Let's Encrypt s auto-obnovou.
- [x] **Firewall (ufw)** – povolené len SSH a 80/443.
- [x] **Hashovanie hesiel** – bcrypt (cost 12), vynútená zmena dočasného hesla.
- [x] **Bezpečné session** – HttpOnly + Secure cookies, expirácia 8 h, regenerácia po prihlásení.
- [x] **Ochrana pred útokmi** – CSRF tokeny, parametrizované SQL (proti injection), CSP proti XSS.
- [x] **Správa tajomstiev** – žiadne heslá/kľúče v kóde; `.env` mimo gitu (`.gitignore`).
- [x] **Audit log** – logovanie požiadaviek (morgan) + systemd/journald.

---

## 📋 ISO/IEC 27000 (najmä 27001)

Kroky potrebné na zosúladenie so štandardmi radu ISO 27000 (systém riadenia informačnej
bezpečnosti – ISMS). Aktualizuje sa po každej práci na projekte.

### Čo treba dorobiť

- [ ] **Rozsah ISMS** – definovať, čo systém riadenia bezpečnosti pokrýva.
- [ ] **Analýza rizík** – identifikácia aktív, hrozieb a zraniteľností + hodnotenie.
- [ ] **Plán zvládania rizík** – opatrenia na zníženie identifikovaných rizík.
- [ ] **Politiky bezpečnosti** – smernice (heslá, prístupy, práca s dátami).
- [ ] **Bezpečnosť prevádzky (A.12)** – doplniť **zálohy** a **monitoring** (logovanie už je).
- [ ] **Riadenie incidentov (A.16)** – postup pri bezpečnostných incidentoch.
- [ ] **Kontinuita činností (A.17)** – plán obnovy po výpadku/havárii.
- [ ] **Súlad (A.18)** – legislatíva (GDPR) a interné pravidlá.
- [ ] **Dokumentácia a záznamy** – evidencia dôkazov pre prípadný audit/certifikáciu.

### Rozpracované / hotové

- [x] **Riadenie prístupu (A.9)** – prihlasovanie, role, princíp najmenších oprávnení, účtovateľnosť *(základ)*.
- [x] **Kryptografia (A.10)** – TLS pri prenose, bcrypt pre heslá *(šifrovanie dát v pokoji ešte chýba)*.
- [x] **Bezpečnosť vývoja (A.14)** – verzionovanie (git), oddelené prostredia (lokál/produkcia), bezpečné programovacie praktiky *(základ)*.
