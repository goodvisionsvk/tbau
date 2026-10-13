# TBAU 360 – modul Obchod (CRM): zadanie pre Claude Code

Verzia 1.0 · 8. 10. 2026 · zadávateľ: Tomáš Kuriak, TBAU s.r.o. (Žilina)

Tento súbor je hlavné zadanie. Vedľa neho leží `reference/crm-prototype.html`, klikací prototyp, ktorý je zdrojom pravdy pre **vzhľad, obrazovky a správanie**. Zadanie hovorí, čo z prototypu treba zachovať, čo doplniť a v akom poradí to stavať. Keď sa zadanie a prototyp rozchádzajú, platí zadanie, ak je v ňom uvedený dôvod, inak sa pýtaj.

---

## 1. Kontext a cieľ

TBAU s.r.o. posiela stavebných pracovníkov na stavby v Nemecku. Systém **TBAU 360** nahradí Excel tabuľky, Asanu a WhatsApp jednou aplikáciou. Tento modul, **Obchod (CRM)**, je pre obchodný tím a koordinátorov. Rieši jednu vec: **od prvého oslovenia nemeckej firmy až po naplnenú požiadavku na ľudí na konkrétnej stavbe**.

Reťaz, ktorú modul drží pokope:

`Zákazník → Stavba → Požiadavka (koľko ľudí, aká profesia, odkedy dokedy) → turnus (iný modul) → hodiny a fakturácia (iné moduly)`

Ku každému objektu patria **úlohy, dokumenty, chat s kolegami a história aktivít**.

**Mimo rozsahu:** slovenská pobočka firmy (rieši sa samostatne), turnusová tabuľka, smenovky, fakturácia, mzdy, automatické hromadné e-maily. CRM s nimi len počíta cez rozhrania (kap. 11).

## 2. Stav k dnešku (čo už existuje)

- **Hotový je klikací prototyp** (`reference/crm-prototype.html`, jeden súbor, HTML a JavaScript bez backendu). Údaje sú vymyslené a po obnovení stránky sa vynulujú. Obsahuje všetky obrazovky z kap. 6 a väčšinu pravidiel z kap. 5.
- **Hotové je spracovanie podkladov** (obchodná tabuľka z Excelu, kap. 9), ale zatiaľ nie nahraté.
- **Nič z backendu neexistuje.** Nie je databáza, prihlasovanie, ukladanie súborov, chat v reálnom čase, import ani nasadenie.
- **Technológia nie je rozhodnutá.** Navrhni ju v fáze 0 (kap. 12) a počkaj na schválenie.

Čo prototyp **nerobí** a treba to doplniť: ukladanie do databázy, prihlásenie a roly, pridávanie a úprava kontaktov, úprava údajov zákazníka a stavby (v prototype sú len na čítanie), skutočné nahrávanie súborov, upozornenia na zmienky v chate, import z Excelu, export do CSV, správa používateľov a číselníkov, úroveň „Projekt (kód)“ medzi zákazníkom a stavbou (otvorená otázka 1).

## 3. Slovník (pojmy a názvy v kóde)

UI je po slovensky. Identifikátory v kóde, názvy tabuliek a polí sú po anglicky podľa tejto tabuľky. Nové pojmy dopĺňaj sem.

| UI (slovensky) | Kód | Poznámka |
| --- | --- | --- |
| Zákazník | `customer` | firma, nemecký klient |
| Kontakt | `contact` | osoba u zákazníka, má rolu |
| Stavba | `site` | miesto práce, patrí zákazníkovi |
| Požiadavka | `request` | koľko ľudí a akej profesie treba na stavbe |
| Úloha | `task` | patrí práve jednej karte (zákazník, stavba alebo požiadavka) |
| História aktivít | `activity` | záznamy o udalostiach na karte |
| Dokument | `document` | súbor viazaný na kartu |
| Správa (chat) | `message` | správa v chate karty |
| Oddelenie | `department` | Obchod, Koordinácia, Administratíva, Doprava a ubytovanie |
| Používateľ | `user` | kolega s rolou |

Karta (`card`) je spoločný pojem pre zákazníka, stavbu, požiadavku a úlohu. Všetky štyri majú rovnaké súčasti: dokumenty, chat, históriu. Navrhni to ako jeden zdieľaný mechanizmus, nie štyri kópie.

## 4. Dátový model

Všetky záznamy majú: `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `archived_at` (mazanie je len archivácia). Zobrazované ID: Z-0001 (zákazník), S-0001 (stavba), P-0001 (požiadavka), U-0001 (úloha).

### Zákazník (`customer`)

| Pole | Typ | Poznámka |
| --- | --- | --- |
| Názov firmy | text | povinné, kontrola duplicity (bez ohľadu na veľkosť písmen) |
| Krajina, mesto, adresa | text | |
| Stav | číselník | Potenciálny, Oslovený, Ponuka, Aktívny, Pozastavený, Ukončený |
| Zodpovedný obchodník | používateľ | povinný od stavu Oslovený |
| Zdroj kontaktu | číselník | databáza firiem, návšteva, odporúčanie, iné |
| Fakturačné údaje | text | IČO / USt-IdNr., adresa |
| Typ práce | číselník | Hodinovka, Výkonová práca (LV), Obe |
| Cena za hodinu | číslo, € | nepovinné |
| Minimálna skupina | číselník | Jednotlivci, Dvojice, Väčšia skupina |
| Platobná lehota | text alebo dni | |
| Platobná disciplína | číselník | V poriadku, Oneskorené, Spor, Neuhradené |
| Hodnotenie | 1 až 5 | |
| Dôvod ukončenia | číselník | Nedostatok ľudí, Zlá komunikácia, Polier, Cena, Platby, Iné |
| Poznámka | dlhý text | |

### Kontakt (`contact`)

Meno, rola (Obchodný kontakt, Bauleiter, Polier, Schvaľovateľ hodín, Fakturačný kontakt), e-mail, telefón (medzinárodný formát), jazyk, príznak hlavný kontakt, poznámka. Zákazník má viac kontaktov.

### Stavba (`site`)

Zákazník (povinné), názov, adresa, kód projektu (nepovinné, otázka 1), začiatok a koniec v kalendárnych týždňoch (KW), Bauleiter, Polier, stav (Plánovaná, Prebieha, Ukončená), poznámka. **Počet ľudí na stavbe sa nezadáva ručne**, preberá sa z turnusu (kap. 11). Do doby, kým turnus nie je napojený, je to pole len na čítanie s hodnotou 0.

### Požiadavka (`request`)

Stavba (povinné, zákazník sa odvodí zo stavby), profesia, KW od a do, počet žiadaných (`requested`), počet navrhnutých (`proposed`), počet potvrdených (`confirmed`), kto požiadal (kontakt), dátum prijatia, podmienky (text), príznaky `searching` (začali sme hľadať) a `cancelled`.

Stav požiadavky sa **odvodzuje**, neukladá sa ručne:

| Stav | Podmienka (v tomto poradí) |
| --- | --- |
| Zrušená | `cancelled` |
| Naplnená | `confirmed >= requested` |
| Potvrdená | `confirmed > 0` |
| Navrhnutá | `proposed > 0` |
| Hľadáme ľudí | `searching` |
| Prijatá | inak |

Invarianty: `0 <= confirmed <= proposed <= requested`. Zníženie navrhnutých zníži aj potvrdených. Potvrdiť sa dá len už navrhnutý človek.

### Úloha (`task`)

Text, popis, termín, zodpovedný (používateľ), oddelenie, stav (Nová, Prebieha, Čaká, Hotová), **karta, ku ktorej patrí (povinné: zákazník, stavba alebo požiadavka)**. Má vlastné dokumenty, chat a históriu.

Termínový kôš (odvodený): Po termíne (termín pred dneškom), Dnes, Tento týždeň (do nedele), Neskôr, Hotová.

### Ostatné

- **História aktivít:** dátum a čas, typ, text, autor, karta. Typy: Telefonát, E-mail, Návšteva, Stretnutie, Poznámka (ručné) a systémové (Zmena stavu, Zmena, Úprava, Nová úloha, Úloha splnená, Dokument pridaný, Nová stavba, Nová požiadavka, Požiadavka naplnená, Požiadavka zrušená, Založená).
- **Dokument:** názov, typ (Zmluva, Ponuka, Cenník, Plán stavby, Zadanie profesie, Smenovka, Iné), súbor, kto a kedy pridal.
- **Správa:** autor, čas, text, zmienky `@meno`, karta.
- **Používateľ:** meno, e-mail, rola, oddelenie, aktívny.

## 5. Pravidlá a správanie

1. **Duplicita zákazníka:** pri písaní názvu sa hneď upozorní na existujúcu firmu a uloženie duplicity sa odmietne.
2. **Nový zákazník:** s vybraným obchodníkom vznikne v stave Oslovený a s úlohou „Prvý telefonát“ (nasledujúci deň). Bez obchodníka vznikne ako Potenciálny.
3. **Stav Aktívny** vyžaduje aspoň jeden kontakt. Inak zmenu odmietni so správou.
4. **Stav Ukončený** vyžaduje dôvod ukončenia (výber z číselníka). Po potvrdení sa všetky otvorené úlohy zákazníka označia ako Hotové. Zmena sa zapíše do histórie.
5. **Pri prechode na Oslovený** sa prázdny obchodník doplní prihláseným používateľom.
6. **Nová stavba** sa zakladá z karty zákazníka. **Nová požiadavka** sa zakladá z karty stavby (alebo v zozname požiadaviek po výbere stavby), aby bola vždy viazaná na zákazníka aj stavbu.
7. **Nová požiadavka** vytvorí úlohu „Nájsť ľudí na požiadavku“ (Koordinátor, oddelenie Koordinácia, termín +7 dní) a záznam v histórii požiadavky, stavby aj zákazníka.
8. **Keď sa požiadavka stane Naplnenou**, zapíše sa to do histórie jej stavby a zákazníka. Zrušenie požiadavky sa zapíše do histórie stavby.
9. **Úloha „Hotovo“** zapíše do histórie úlohy aj nadradenej karty. Zmena stavu, termínu, osoby a oddelenia úlohy sa zapisuje do histórie úlohy.
10. **Pipeline presuny** (šípky) menia stav presne tak, ako keby sa zmena urobila na karte, a zapisujú sa do histórie. Presun požiadavky o stupeň upraví počty takto: Prijatá (navrhnutí 0, potvrdení 0) → Hľadáme ľudí (`searching`) → Navrhnutá (aspoň 1 navrhnutý) → Potvrdená (aspoň 1 potvrdený, ale nie všetci) → Naplnená (všetci) → Zrušená. Presun zo Zrušenej vráti požiadavku do stavu Prijatá.
11. **Mazanie neexistuje**, len archivácia. Archivovaná karta sa nezobrazuje v zoznamoch, ale zostáva v histórii.
12. **Každá zmena stavu, termínu, osoby a podmienok** sa loguje (kto, kedy, pôvodná hodnota).

## 6. Obrazovky (podľa prototypu)

Menu vľavo: **Obchod** (Dnes, Zákazníci, Stavby, Požiadavky stavieb, Úlohy, Pipeline) a **Ostatné moduly** (Turnus, Smenovky, Fakturácia; zatiaľ len odkazy bez obsahu). Na mobile sa menu zmení na horizontálny pás hore.

| Obrazovka | Čo musí vedieť |
| --- | --- |
| **Dnes** | štyri čísla (úlohy dnes, po termíne, aktívni zákazníci, otvorené požiadavky) ako odkazy; tabuľka mojich otvorených úloh s tlačidlom Hotovo; požiadavky na doplnenie; zákazníci podľa stavu; tlačidlo Nový zákazník |
| **Zákazníci** | zoznam s hľadaním (názov alebo kontakt) a filtrom podľa stavu; stĺpce firma, stav, obchodník, najbližšia úloha, počet stavieb, otvorené požiadavky; formulár nového zákazníka |
| **Stavby** | zoznam stavieb: názov a adresa, zákazník, stav, ľudia, KW, otvorené požiadavky |
| **Požiadavky stavieb** | zoznam s filtrami (všetky, otvorené, hľadáme ľudí, naplnené); počty navrhnutých a potvrdených sa menia tlačidlami plus a mínus; ukazovateľ naplnenia; nová požiadavka cez výber stavby |
| **Úlohy** | tri zobrazenia: Zoznam, Kanban, Kalendár (viď nižšie), filtre oddelenie a osoba, prepínač Zobraziť hotové, nová úloha viazaná na kartu |
| **Pipeline** | prepínač Zákazníci, Stavby, Požiadavky, Úlohy; kanban s presunom šípkami |
| **Karta zákazníka** | záložky Prehľad, Podmienky, Kontakty, Stavby, Požiadavky, Úlohy, Dokumenty, Chat, História aktivít; zmena stavu výberom |
| **Karta stavby** | záložky Prehľad, Požiadavky (tu sa zakladá nová), Úlohy, Dokumenty, Chat, História aktivít |
| **Karta požiadavky** | Prehľad (údaje, obsadenie s tlačidlami, odkaz na zákazníka a stavbu), Úlohy, Dokumenty, Chat, História aktivít; tlačidlá Začať hľadať ľudí a Zrušiť požiadavku |
| **Karta úlohy** | Prehľad (úprava všetkých polí), Dokumenty, Chat, História aktivít; navigačná cesta Úlohy / nadradená karta / úloha |

**Úlohy, tri zobrazenia**

- **Zoznam:** tabuľka s termínom, úlohou, kartou, oddelením, zodpovedným a stavom, ktorý sa mení priamo v riadku.
- **Kanban:** zoskupenie sa prepína na **stav dokončenia** (Nová, Prebieha, Čaká, Hotová), **oddelenia**, **osoby** alebo **termín dokončenia** (Po termíne, Dnes, Tento týždeň, Neskôr, a Hotová, keď sú zapnuté hotové). Šípky menia stav, oddelenie, osobu alebo termín podľa aktuálneho zoskupenia (presun do koša termínu nastaví konkrétny dátum, napr. Dnes = dnešný deň).
- **Kalendár:** stĺpec Po termíne, potom sedem dní od dnes, potom Neskôr.

Tretie zobrazenie (kalendár) je môj návrh. Zadávateľ spomenul „zoznam, kanban a tretie“. Otázka 4.

**Spoločné pravidlá UI:** každá karta má rovnaké záložky (kde dávajú zmysel), odkazy medzi súvisiacimi kartami sú vždy klikateľné, tabuľky sa na mobile posúvajú vodorovne vo vlastnom kontajneri, nikdy nie celá stránka. Svetlý a tmavý režim podľa systému.

**Dizajn:** držať sa prototypu. Písma Barlow Semi Condensed (nadpisy) a Source Sans 3 (text). Farebné tokeny a hodnoty sú v `:root` v prototype; preber ich do dizajnového systému (CSS premenné) a nemeň bez dohody. Stavy sú vždy vyjadrené farbou **aj textom**.

## 7. Roly a práva

| Rola | Práva |
| --- | --- |
| Obchodník | vytvára a upravuje svojich zákazníkov, ich kontakty, stavby, požiadavky; ostatných zákazníkov len číta |
| Koordinátor | upravuje stavby a požiadavky (navrhnutí, potvrdení), úlohy; zákazníkov číta |
| Administratíva | číta zákazníkov, kontakty a podmienky; pridáva dokumenty a úlohy; nič iné nemení |
| Vedenie | vidí a upravuje všetko, priraďuje zákazníkov obchodníkom, schvaľuje ukončenie spolupráce |

Matica je návrh. Potvrdí ju zadávateľ (otázka 5). Implementuj práva centrálne (jedno miesto), nie roztrúsené v obrazovkách.

## 8. Chat, dokumenty, upozornenia

- **Chat** je pri každej karte. Správy vidia všetci, ktorí kartu vidia. Zmienka `@meno` sa zvýrazní a vytvorí upozornenie adresátovi. Enter odošle správu, Shift a Enter nový riadok. Správy sa nemažú a neupravujú v prvej verzii.
- **Aktualizácia chatu:** nové správy sa objavia bez obnovenia stránky (websocket alebo krátky polling podľa zvolenej technológie).
- **Upozornenia (v1):** v aplikácii (zvonček s počtom neprečítaných), bez e-mailov. E-mail až neskôr.
- **Dokumenty:** reálne nahrávanie súborov do úložiska, zoznam s typom a dátumom, sťahovanie. Limit veľkosti a povolené formáty navrhni (PDF, Office, obrázky). Antivírusová kontrola, ak ju hosting ponúka.

## 9. Import z obchodnej tabuľky

Zdroj: Excel „TBAU – FIRMY DE spolupráca“ (SharePoint, **len na čítanie**). Importér vytvor ako opakovane spustiteľný skript, ktorý z **kópie** súboru naplní databázu a vypíše správu. Originál nikdy nemeň.

| List | Obsah | Kam |
| --- | --- | --- |
| Oslovení zákazníci | asi 56 riadkov, oslovovanie od 26. 2. 2026 | zákazníci a kontakty, aktivity |
| Navštívení | 12 riadkov | zákazníci, aktivita typu Návšteva |
| Začiatok stavby | 6 riadkov | stavby a požiadavky (väčšinou neúplné) |
| Databáza firiem | asi 131 firiem | zákazníci v stave Potenciálny |

Kroky: zjednotiť firmy (názov a adresa), pridelí sa ID a duplicity sa zlúčia (zoznam zlúčení na kontrolu); rozdeliť kontakty na meno, rolu, e-mail, telefón (opraviť telefóny poškodené Excelom); voľný text stavu prepísať na číselník (čo sa nedá, ostane v poznámke so značkou „na kontrolu“); z poznámok vytiahnuť typ práce, cenu, skupinu, platobnú disciplínu a dôvod ukončenia; zjednotiť dátumy. Staršie stavy P (ponuka), A (aktuálne), N (neaktuálne), O (oslovit) mapuj na Ponuka, Aktívny, Pozastavený, Oslovený. Po importe vypíš počet načítaných, zlúčených a odmietnutých riadkov s dôvodom.

Dev a testovacie dáta sú **vymyslené** (ako v prototype). Reálne firemné dáta nepatria do repozitára.

## 10. Nefunkčné požiadavky

- Jazyk UI: slovenčina, správna diakritika (UTF-8), nemecké názvy firiem a mená bez straty znakov.
- Prihlásenie osobným účtom. Firma používa Microsoft 365, preto zváž prihlásenie cez M365 (otázka 6). Žiadne spoločné heslo.
- Audit zmien (kto, kedy, pôvodná hodnota) pre stav, termín, osobu, podmienky, hodnotenie.
- Zálohovanie databázy a súborov aspoň denne, test obnovy pred ostrým spustením.
- Osobné údaje (kontakty): možnosť vymazať alebo anonymizovať kontakt na požiadanie (GDPR). Hosting v EÚ.
- Výkon: zoznamy do 2 sekúnd pri niekoľkých tisíckach záznamov, stránkovanie, uložené filtre.
- Mobil: karta zákazníka, nová aktivita, úlohy a chat musia byť plne použiteľné na telefóne (390 px).
- Prístupnosť: skutočné tlačidlá a polia, viditeľný fokus, kontrast textu aspoň 4,5:1, ovládanie klávesnicou, zmena stavu nie len farbou.
- Export zoznamov do CSV.

## 11. Rozhrania na ostatné moduly

V prvej verzii len pripraviť, nič nenapájať naostro:

- **Turnus:** potvrdená požiadavka vytvorí v turnuse plán pridelení pod rovnakou stavbou. Počet ľudí na stavbe a počty navrhnutých a potvrdených sa budú počítať z pridelení. Teraz: rozhranie (interface) a atrapa, ručné zadávanie počtov tlačidlami ako v prototype.
- **Smenovky a hodiny:** karta stavby zobrazí hodiny len na čítanie. Teraz: prázdne miesto s popisom.
- **Fakturácia:** typ práce, cena a fakturačný kontakt zo zákazníka budú vstupom do fakturácie. Teraz: len polia.

## 12. Ako pracuj (pokyny pre Claude Code)

Postupuj po fázach. Po každej fáze krátko zhrň, čo je hotové, ako to spustiť, a počkaj na odsúhlasenie. Nepokračuj do ďalšej fázy bez neho.

**Fáza 0: návrh a kostra (bez funkčného kódu).**
- Prečítaj `reference/crm-prototype.html` celý a tento súbor. Vypíš nejasnosti do `OPEN_QUESTIONS.md`.
- Navrhni technológiu, **dve varianty** s krátkym porovnaním (jednoduchosť správy pre malý tím, cena, hosting v EÚ, prihlásenie cez M365, súbory, chat v reálnom čase) a odporúčaním. Zadávateľ nie je programátor, vysvetli to jednoducho. Vyber až po schválení.
- Navrhni databázovú schému (diagram a zoznam tabuliek podľa kap. 4) a štruktúru repozitára.
- Založ `DECISIONS.md` a `CHANGELOG.md`.
- Hotovo, keď zadávateľ schváli stack a schému.

**Fáza 1: základ.** Repozitár, prostredie (lokálne a testovacie), databáza a migrácie, prihlásenie a roly (kap. 7), plášť aplikácie (menu, téma, svetlý a tmavý režim), dizajnový systém z prototypu, vývojové ukážkové dáta. Hotovo: prihlásim sa a vidím prázdne obrazovky v správnom vzhľade.

**Fáza 2: zákazníci a úlohy.** Zákazník, kontakty, História aktivít, Úlohy (CRUD), karta zákazníka, karta úlohy, obrazovky Dnes a Zákazníci, pravidlá 1 až 5, 9, 11, 12. Hotovo: všetko, čo robí prototyp na tieto objekty, funguje nad databázou a po obnovení ostane uložené.

**Fáza 3: stavby a požiadavky.** Stavba, požiadavka, odvodený stav, pravidlá 6 až 8, karty stavby a požiadavky, zoznamy Stavby a Požiadavky stavieb. Hotovo: celý reťaz zákazník, stavba, požiadavka funguje vrátane histórie na všetkých troch kartách.

**Fáza 4: Úlohy v troch zobrazeniach a Pipeline.** Zoznam, Kanban so štyrmi zoskupeniami, Kalendár, Pipeline so štyrmi tabuľami a pravidlom 10. Hotovo: zhoduje sa s prototypom.

**Fáza 5: chat, dokumenty, upozornenia.** Kap. 8.

**Fáza 6: import, export, spoľahlivosť.** Kap. 9, export CSV, audit, zálohy, nasadenie.

**Fáza 7: dotiahnutie.** Prístupnosť, mobil, výkon, rozhrania na turnus (kap. 11), dokumentácia pre správcu.

**Pravidlá práce:**

- Slovenský UI text, anglické identifikátory (kap. 3).
- Malé, súvislé zmeny. Pri každej logike (stavy požiadavky, pravidlá 1 až 12, práva) napíš **automatické testy**.
- Stav požiadavky a termínový kôš počítaj na jednom mieste, nie v obrazovkách.
- Nevymýšľaj biznis pravidlá. Čo v zadaní nie je, zapíš do `OPEN_QUESTIONS.md` a navrhni predvolené riešenie.
- Žiadne reálne firemné dáta ani tajomstvá v repozitári. Heslá a kľúče len v premenných prostredia.
- Prototyp neprepisuj ani nemaž, ostáva v `reference/`.
- Každú zmenu rozsahu alebo pravidla zapíš do `CHANGELOG.md` a aktualizuj tento súbor.

## 13. Kde budeme dolaďovať (otvorené otázky)

Zadávateľ ich doladí počas práce. Navrhnuté predvolené hodnoty sú v zátvorke a použi ich, kým nepríde odpoveď.

1. Je medzi zákazníkom a stavbou ešte úroveň **Projekt (kód)**? V ERP dnes existuje kód projektu a 6 z 31 projektov má viac stavieb. (Predvolene: kód projektu ako nepovinné pole na stavbe.)
2. Presné **stavy zákazníka a požiadavky**. (Predvolene: ako v kap. 4.)
3. Presné **oddelenia a osoby** pre úlohy. (Predvolene: štyri oddelenia z kap. 3, osoby sú používatelia.)
4. **Tretie zobrazenie úloh.** (Predvolene: kalendár.)
5. **Matica práv** (kap. 7).
6. **Prihlásenie** cez Microsoft 365 alebo vlastné? A kto je správca používateľov?
7. Kto zadáva **požiadavku stavby**: obchodník, koordinátor, alebo zákazník priamo (napr. e-mailom)?
8. Platí **cena a typ práce na zákazníka alebo na stavbu**? (Predvolene: na zákazníka.)
9. **Číselníky** (profesie, dôvody ukončenia, typy dokumentov, zdroje kontaktu): majú ich spravovať používatelia v nastaveniach? (Predvolene: áno, vedenie.)
10. Zahrnúť do importu aj ďalšie dve obchodné tabuľky („5.1 TBAU – OBCHOD DE“ a „5.3 OBCHOD DE (Jakalová)“)? Zatiaľ neprečítané.
11. **Upozornenia** na zmienky aj e-mailom? (Predvolene: len v aplikácii.)
12. **Hosting a rozpočet** na prevádzku.

## 14. Ako sa budú robiť ďalšie úpravy

Zadávateľ posiela zmeny po malých kusoch, nie ako nové veľké zadanie. Pri každej zmene postupuj takto:

1. Prečítaj požiadavku a nájdi dotknutú kapitolu tohto súboru. Ak sa dotýka pravidla, stavov alebo polí, najprv navrhni úpravu zadania.
2. Zapíš zmenu do `CHANGELOG.md` (dátum, čo, prečo) a aktualizuj tento súbor.
3. Implementuj a pridaj alebo uprav testy.
4. Ukáž výsledok a čo si zmenil.

**Šablóna požiadavky na zmenu (zadávateľ):**

```
Obrazovka alebo karta:
Čo má byť inak:
Prečo:
Naliehavosť (teraz / do konca fázy / neskôr):
```

Nápady, ktoré nie sú naliehavé, idú do `BACKLOG.md`. Zadávateľ ich preberá a priraďuje do fáz.

## 15. Definícia „hotovo“ pre celý modul

- Všetky obrazovky z kap. 6 fungujú nad databázou a zhodujú sa s prototypom.
- Pravidlá 1 až 12 sú pokryté testami.
- Prihlásenie a roly fungujú, nikto nevidí viac, ako mu dovoľuje matica práv.
- Import z obchodnej tabuľky prebehol na kópii a správa o ňom je odsúhlasená.
- Chat a dokumenty fungujú medzi dvoma prihlásenými používateľmi.
- Aplikácia je nasadená, zálohuje sa a obnova bola vyskúšaná.
- Je napísaná krátka príručka pre správcu a pre obchodný tím.
