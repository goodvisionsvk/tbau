# Zálohovanie TBAU portálu

Cieľ: denná záloha databázy a dokumentov, prírastkovo (len nové/zmenené) na firemné
**NAS Synology DS220+ (DSM 7.4)**. Dáta existujú na dvoch miestach: produkčný server (VPS) + NAS.

Smer: **NAS si ťahá dáta z VPS** (NAS otvára spojenie von, nemusí byť vystavený do internetu).

## Čo sa zálohuje

Na serveri sa denne (02:30) vytvára **izolovaný export priečinok** `/opt/tbau-portal/backups/`,
ktorý obsahuje len to, čo má NAS vidieť (žiadne `.env` ani živá DB):

| Obsah | Cesta na serveri |
|-------|------------------|
| Konzistentné kópie DB (gzip, rotácia 30 dní) | `/opt/tbau-portal/backups/db/tbau-*.db.gz` |
| Zrkadlo nahratých dokumentov (smenovky) | `/opt/tbau-portal/backups/uploads/` |

Kód aplikácie netreba zálohovať – je v Git repozitári (GitHub).

## Časť 1 – Server (VPS) ✅ hotové

Systemd timer `tbau-backup.timer` spúšťa `scripts/backup-db.js` každý deň o 02:30:
konzistentná kópia DB → gzip → rotácia 30, plus prírastkové zrkadlo uploadov.

Inštalácia (jednorazovo, už vykonané):

```bash
sudo cp /opt/tbau-portal/deploy/tbau-backup.service /etc/systemd/system/
sudo cp /opt/tbau-portal/deploy/tbau-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now tbau-backup.timer
node /opt/tbau-portal/scripts/backup-db.js      # ručný test
systemctl list-timers tbau-backup.timer
```

Stav poslednej zálohy: portál → **Nastavenia → Zálohovanie dát**.

### Prístup pre NAS (read-only) ✅ hotové

Na VPS je vyhradený účet **`nasbackup`** (bez hesla, len SSH kľúč), obmedzený cez `rrsync` na
**čítanie len priečinka `/opt/tbau-portal/backups`**. Nevie sa prihlásiť do shellu, nevie zapisovať,
nevidí zvyšok servera. Súkromný kľúč je u správcu (nahrá sa na NAS).

## Časť 2 – NAS Synology DS220+ 🔧 nastaviť v DSM

Pull sa na Synology rieši cez **Plánovač úloh + rsync** (Hyper Backup je pre opačný smer).

### 1. Nahraj súkromný kľúč na NAS

Súbor `tbau-nas-backup-key` (súkromný kľúč) ulož na NAS, napr. do
`/volume1/tbau-backup/.ssh/tbau-nas-backup-key`. Práva kľúča musia byť `600`.
*(Enable SSH v DSM: Ovládací panel → Terminál a SNMP → Povoliť SSH; po nastavení môžeš vypnúť.)*

```bash
chmod 600 /volume1/tbau-backup/.ssh/tbau-nas-backup-key
# prvé overenie (prijme fingerprint servera):
rsync -rtz -e "ssh -i /volume1/tbau-backup/.ssh/tbau-nas-backup-key -p 22 -o StrictHostKeyChecking=accept-new" \
  nasbackup@80.211.202.23:db/ /volume1/tbau-backup/db/
```

### 2. Plánovaná úloha (denne)

*Ovládací panel → Plánovač úloh → Vytvoriť → Plánovaná úloha → Skript definovaný používateľom*
- Používateľ: `root`
- Plán: **denne**, napr. **03:30** (po 02:30, keď VPS spraví zálohu)
- Príkaz (skript):

```bash
KEY=/volume1/tbau-backup/.ssh/tbau-nas-backup-key
SSH="ssh -i $KEY -p 22 -o StrictHostKeyChecking=accept-new"
# DB zálohy (gzip) – prírastkovo
rsync -rtz -e "$SSH" nasbackup@80.211.202.23:db/      /volume1/tbau-backup/db/
# nahraté dokumenty (smenovky) – prírastkovo
rsync -rtz -e "$SSH" nasbackup@80.211.202.23:uploads/ /volume1/tbau-backup/uploads/
```

> Cesty `db/` a `uploads/` sú relatívne k `backups/` (vďaka rrsync obmedzeniu).
> `--delete` zámerne NEpoužívame – read-only rrsync ho blokuje a pre zálohu je lepšie, aby si NAS
> držal aj staršiu históriu, než má server (server rotuje 30 dní, NAS môže viac).
> Prenesie sa vždy len to, čo je nové/zmenené.

## Tajomstvá (.env) – šifrovaná záloha

Súbor `.env` (obsahuje `SESSION_SECRET`, `WORKLOG_SECRET`) sa pri každej zálohe **zašifruje
verejným GPG kľúčom** (`deploy/secrets-pubkey.asc`, je v gite – verejný kľúč je bezpečný) do
`backups/db/env.gpg`. Ten putuje na NAS spolu s `db/`. **Server vie len šifrovať** – dešifrovať
sa dá iba **súkromným kľúčom**, ktorý je mimo servera aj gitu (u správcu, v správcovi hesiel).

Obnova `.env` (na stroji so súkromným kľúčom, napr. Mac s `gpg`):

```bash
gpg --import tbau-secrets-PRIVATE.asc     # jednorazovo (ak kľúč ešte nemáš)
gpg --decrypt env.gpg > .env              # env.gpg stiahneš z NAS (ZALOHY/tbau-backup/db/)
```

Po kompletnej strate servera: nasadiť kód z gitu, obnoviť DB (nižšie), obnoviť `uploads/`,
a `.env` dešifrovať z `env.gpg` (alebo zadať tajomstvá nanovo – `SESSION_SECRET` sa dá vygenerovať,
SMTP heslo je aj v DB). Súkromný kľúč drž v správcovi hesiel; keby sa stratil, vygenerujeme nový pár.

## Obnova zo zálohy

```bash
gunzip -c tbau-2026-10-14-02-30-00.db.gz > tbau-restore.db
sqlite3 tbau-restore.db "PRAGMA integrity_check;"
sudo systemctl stop tbau-portal
cp tbau-restore.db /opt/tbau-portal/data/tbau.db
rm -f /opt/tbau-portal/data/tbau.db-wal /opt/tbau-portal/data/tbau.db-shm
sudo systemctl start tbau-portal
```

Dokumenty (uploads) sa obnovia skopírovaním späť do `/opt/tbau-portal/data/uploads/`.
