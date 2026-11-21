# [~*| SHADOW |*~] Discord bot – telepítés

## Mit tud?
- `/setup` – felépíti az egész Discord szervert: rangok, kategóriák, csatornák, jogok. Csak a szerver tulajdonosa használhatja. Többször is lefuttathatod, nem töröl semmit és nem csinál duplán.
- `/szerver`, `/jatekosok` – a zombi szerver állapota, a pálya és kik vannak fent.
- `/ip` – a szerver címe.
- `/patchnotes kuldes` – egy kész Patch Notes kiküldése a `┃🛠️・patch-notes` csatornába (a `patchnotes` mappából, dátum szerint választható). Csak Admin és fölötte.
- `/patchnotes iras` – új Patch Notes írása egy ablakban a Discordon. A bot kiküldi és el is menti.
- `/udvozles-teszt` – kipróbálja rajtad az üdvözlést és a rangadást, és megmondja, ha valami nincs beállítva (Admin és fölötte).
- `/szabalyzat` – kiírja a szabályzatot a `┃📜・szabályzat` csatornába. Ha átírod a `szabalyzat.md` fájlt, futtasd újra: a bot a régi üzeneteket frissíti, nem csinál duplát. A `/setup` is kiírja.
- **Élő státusz** a `┃🟢・szerver-státusz` csatornában. Percenként frissül, és a bot neve alatt is látszik, hányan vannak fent.
- **Szerver napló** a `┃📋・szerver-napló` csatornában (csak a staff látja). Ide kerülnek a kitiltások, feloldások, némítások, rangadások, rangelvételek, a Boss pálya indulása, a pályaszavazás eredménye és a pálya betöltése.
- **Új tagok:** a bot szép üdvözlő kártyát küld a `┃👋・üdvözlés` csatornába (profilkép, hányadik tag, szabályzat, szerver IP), és megadja az illő rangot:
  - új ember → `🧟 Játékos`
  - bot → `🤖 Bot`
  - visszatérő tag → visszakapja a régi rangjait (VIP, Admin…, de a Némítottat is!). A 👑 Tulajdonost sosem adja vissza magától.
  - A `/setup` a már bent lévőknek is megadja a Játékos / Bot rangot.
  - Ehhez a fejlesztői oldalon be kell kapcsolni: **Bot → Server Members Intent**.

## Rangok, amiket a /setup létrehoz (fentről lefelé)
| Rang | Mit tud |
|---|---|
| 👑 Tulajdonos | mindent (Adminisztrátor) |
| 🔱 Főadmin | kirúgás, kitiltás, némítás, üzenetek törlése, napló |
| 🛡️ Admin | kirúgás, némítás, üzenetek törlése, napló |
| ⚔️ Moderátor | üzenetek törlése, némítás (timeout) |
| 💎 VIP | VIP csatornák |
| 🧟 Játékos | sima tag |
| 🔇 Némított | sehol nem írhat és nem beszélhet |

## 1. A bot létrehozása (egyszer kell)
1. Menj ide: https://discord.com/developers/applications → **New Application** → név: `SHADOW Bot`.
2. Bal oldalt **Bot** → **Reset Token** → másold ki a tokent. **Ezt senkinek ne add oda!**
3. Ugyanitt kapcsold be: **Server Members Intent**. Ez kell, hogy az új tagok megkapják a Játékos rangot.
4. Bal oldalt **OAuth2** → **URL Generator**:
   - Scopes: `bot` és `applications.commands`
   - Bot Permissions: `Administrator`
   - Nyisd meg a lent kapott linket, és hívd meg a botot a szerveredre.
5. A Discordban: Beállítások → Haladó → **Fejlesztői mód** BE. Utána jobb klikk a szervered ikonjára → **Szerverazonosító másolása**. Ez a `guildId`.

## 2. config.json
Másold le a `config.example.json` fájlt `config.json` néven, és töltsd ki:
- `token` – a bot tokenje
- `guildId` – a Discord szervered azonosítója
- `szerverIp`, `szerverPort` – a zombi szerver címe (SRKHOST-ból)
- `rconJelszo` – a szerver RCON jelszava. Ez kell a naplóhoz; ha üresen hagyod, nem lesz napló.

⚠️ Ha rossz az RCON jelszó, a bot magától leáll a próbálkozással, különben a szerver kitiltaná az IP-jét.

## 3. Futtatás Termuxban (telefonon)
A legegyszerűbb: `bash inditas.sh`. Ez mindent elintéz: telepít, ellenőrzi a config.json-t, elindítja a botot, és kiírja a naplót.

Kézzel így megy:
```
pkg install nodejs-lts
cd shadowbot
npm install
pm2 start index.js --name shadowbot
pm2 save
```
Naplót így nézhetsz: `pm2 logs shadowbot`

## 4. Első indítás után
1. A Discordban írd be: `/setup` (csak a tulaj tudja).
2. A Discord szerver beállításaiban (Rangok) húzd a **bot rangját legfelülre**, hogy minden rangot tudjon kezelni.
3. Add magadnak a **👑 Tulajdonos** rangot.

## 5. A CS szerverre (a zipben a cstrike mappa)
- Új plugin: `shadow_discord.amxx`, ez gyűjti az eseményeket. Már benne van a `plugins-zplague.ini`-ben.
- Frissült: `shadow_bans`, `shadow_gag`, `shadow_rangok`, `shadow_boss`, `shadow_rtv`. Ezek küldik az eseményeket a naplóba.
- Ha a be- és kilépéseket is látni akarod a naplóban: `shadow_dc_belepes 1` (amxx.cfg-be).

## Ha nem működnek a / parancsok
1. Nézd meg a bot naplóját: `pm2 logs shadowbot --lines 50`
   - **„Parancsok regisztrálva”**: a bot rendben van. Indítsd újra a Discordot (Ctrl+R vagy az app bezárása), és a parancsok megjelennek.
   - **„Missing Access”**: hívd meg újra a botot a naplóban kiírt linkkel (abban benne van az `applications.commands`).
   - **„a bot nincs bent a ... szerveren”**: rossz a `guildId`. A napló kiírja a jót, azt másold be.
2. A `guildId` mindig idézőjelek között legyen: `"guildId": "123456789012345678"`.
3. Frissítés után mindig: `git pull`, utána `pm2 restart shadowbot`.

## Hosztingon (pl. bot-hosting.net)
- Töltsd fel: `index.js`, `lib/`, `package.json`, `config.json`. Indító fájl: `index.js`.
- A **Patch Notes-okat, a szabályzatot és a bannert a bot magától letölti a GitHubról** induláskor és félóránként, ezeket nem kell kézzel feltölteni. Ha új Patch Notes kerül a GitHubra, pár percen belül ott lesz a `/patchnotes kuldes` listában.
- Kikapcsolás: a `config.json`-ba `"githubFrissites": false`.

## Patch Notes automatikusan
- Ha a GitHub `patchnotes` mappájába új fájl kerül, a bot **10 percen belül magától kiküldi** a Patch Notes csatornába. Nem kell hozzá semmit beírni, és a botot sem kell frissíteni.
- A már kiküldötteket megjegyzi (`adat.json`), kétszer nem küldi ki.
- Az első indításkor a már meglévőket nem küldi ki újra; ezeket a `/patchnotes kuldes` paranccsal tudod kézzel kiküldeni.
- Kikapcsolás: `config.json` → `"patchAuto": false`.

## Happy Hour és heti ranglista
- A CS szerver `shadow_happyhour.amxx` pluginja dupla LCS-t ad (hétköznap 20–22, hétvégén egész nap). A bot a **hírek / bejelentések** csatornába kiírja, amikor kezdődik és amikor véget ér.
- A `shadow_mvp.amxx` számolja a heti statisztikát. A bot **minden hétfőn 12 órától** kiteszi a múlt hét legjobbjait az **eredmények / ranglista** csatornába (`config.json` → `"hetiOra": 12`).
- `/heti` – az e heti vagy a múlt heti ranglista bármikor.
- `/osszekotes` – 6 jegyű kódot ad (10 percig jó). A játékban: `/discord <kód>` → a Discord fiók össze van kötve a Steam fiókkal.
- `/levalasztas` – megszünteti az összekötést.
- `/profil [tag]` – játékbeli szint, XP, helyezés és rang.
- `/szintek` – a 10 legmagasabb szintű játékos.

### Rang szinkron
Összekötés után a játékbeli rang magától megjelenik a Discordon (30 mp-enként figyeli a szerver):
VIP → 💎 VIP, Moderátor → ⚔️ Moderátor, Admin → 🛡️ Admin, Főadmin → 🔱 Főadmin.
A 👑 Tulajdonos rangot a bot **soha** nem adja magától. Kikapcsolás: `"rangSzinkron": false` a config.json-ban.
Ehhez is kell az `rconJelszo`, és a bot rangja legyen a többi rang **felett**.
- Mindkettőhöz kell az `rconJelszo` a `config.json`-ban.
