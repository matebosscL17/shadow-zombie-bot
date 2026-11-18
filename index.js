// =============================================================
//  [~*| SHADOW |*~] Discord bot - Zombie Plague szerverhez
//  - /setup      : felépíti a Discord szervert (rangok, csatornák, jogok) - csak a tulaj
//  - /szerver    : szerver állapota
//  - /jatekosok  : ki van fent
//  - /ip         : csatlakozási cím
//  - Élő státusz üzenet a 🟢•szerver-státusz csatornában (percenként frissül)
//  - Szerver napló a 📋•szerver-napló csatornába (RCON-on, a shadow_discord.amxx-ből)
// =============================================================
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes,
  ActivityType, Events, ModalBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, escapeMarkdown, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits,
} = require('discord.js');
const q = require('./lib/query');
const setup = require('./lib/setup');

const CONFIG_UT = path.join(__dirname, 'config.json');
const ADAT_UT = path.join(__dirname, 'adat.json');

if (!fs.existsSync(CONFIG_UT)) {
  console.error('Hiányzik a config.json! Másold le a config.example.json-t config.json néven, és töltsd ki.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_UT, 'utf8'));
if (typeof cfg.guildId === 'number') {
  console.error('HIBA: a config.json-ban a guildId-t idézőjelek közé kell írni, pl.: "guildId": "123456789012345678"');
  process.exit(1);
}
cfg.guildId = String(cfg.guildId || '').trim();
cfg.token = String(cfg.token || '').trim();
const PREFIX = '[~*| SHADOW |*~]';
// Discordon a * dőlt betűt csinálna, ezért szövegben így kell írni
const PREFIX_MD = '[~\\*| SHADOW |\\*~]';
const BANNER = path.join(__dirname, 'kepek', 'shadow_banner.png');
const SZIN = 0xb00000;

let adat = {};
try { adat = JSON.parse(fs.readFileSync(ADAT_UT, 'utf8')); } catch (_) {}
const mentes = () => fs.writeFileSync(ADAT_UT, JSON.stringify(adat, null, 2));

if (!cfg.token || cfg.token.startsWith('IDE_')) {
  console.error('HIBA: nincs kitöltve a token a config.json-ban!');
  process.exit(1);
}

// A "Server Members Intent" nélkül a Discord nem engedi belépni a botot.
// Ha egyszer már emiatt nem sikerült, többé nem kérjük (az új tagok rangadása kimarad).
// Ha az előző indulás 3 percen belül a hiányzó "Server Members Intent" miatt bukott el,
// most nélküle indulunk. Később (pm2 restart) mindig újra megpróbáljuk vele.
const intents = [GatewayIntentBits.Guilds];
const tagIntentHiba = adat.nincsTagIntentIdo && Date.now() - adat.nincsTagIntentIdo < 3 * 60 * 1000;
if (cfg.ujTagJatekosRang !== false && !tagIntentHiba) intents.push(GatewayIntentBits.GuildMembers);
const VAN_TAG_INTENT = intents.includes(GatewayIntentBits.GuildMembers);
delete adat.nincsTagIntent; // régi verzió jelzője
const client = new Client({ intents });

// ---------------- segédek ----------------
const cim = () => `${cfg.szerverIp}:${cfg.szerverPort}`;

function idoSzoveg(mp) {
  mp = Math.floor(mp || 0);
  const o = Math.floor(mp / 3600), p = Math.floor((mp % 3600) / 60);
  return o ? `${o}ó ${p}p` : `${p}p`;
}

async function lekerdez() {
  try {
    const i = await q.info(cfg.szerverIp, cfg.szerverPort);
    let lista = [];
    try { lista = await q.jatekosok(cfg.szerverIp, cfg.szerverPort); } catch (_) {}
    return { online: true, ...i, lista };
  } catch (e) {
    return { online: false, hiba: e.message };
  }
}

// ---------------- státusz kártya ----------------
const SZAMOK = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const ermek = ['🥇', '🥈', '🥉'];

function csik(akt, max, hossz = 10) {
  const tele = max > 0 ? Math.round((akt / max) * hossz) : 0;
  return '🟥'.repeat(Math.min(tele, hossz)) + '⬛'.repeat(Math.max(0, hossz - tele));
}

function nagySzam(n) {
  return String(n).split('').map((c) => SZAMOK[+c] || c).join('');
}

// mai csúcs és rekord számolása
function csucsFrissit(n) {
  const ma = new Date().toISOString().slice(0, 10);
  adat.csucs = adat.csucs || { nap: ma, ma: 0, rekord: 0 };
  if (adat.csucs.nap !== ma) { adat.csucs.nap = ma; adat.csucs.ma = 0; }
  let valt = false;
  if (n > adat.csucs.ma) { adat.csucs.ma = n; valt = true; }
  if (n > adat.csucs.rekord) { adat.csucs.rekord = n; valt = true; }
  if (valt) mentes();
  return adat.csucs;
}

function statuszEmbed(s, banner = true) {
  const e = new EmbedBuilder()
    .setAuthor({ name: 'CS 1.6 • Zombie Plague • Élő státusz' })
    .setTitle(`🧟 ${PREFIX_MD} ZOMBIE PLAGUE 🧟`)
    .setTimestamp(new Date())
    .setFooter({ text: `${PREFIX} • percenként frissül` });
  if (banner && fs.existsSync(BANNER)) e.setImage('attachment://shadow_banner.png');

  if (!s.online) {
    e.setColor(0x4f545c)
      .setDescription([
        '## 🔴 A szerver jelenleg OFFLINE',
        'Valószínűleg újraindul vagy karbantartás van.',
        'Pár perc múlva újra megnézem! ⏳',
        '',
        `**🌐 Cím:** \`${cim()}\``,
      ].join('\n'));
    return e;
  }

  const emberek = Math.max(0, s.jatekos - (s.botok || 0));
  const cs = csucsFrissit(emberek);
  const tele = emberek >= s.max;
  const hangulat = emberek === 0 ? '😴 Most csendes... legyél te az első!'
    : tele ? '🔥 TELE VAN! Siess, ha felszabadul egy hely!'
      : emberek >= s.max / 2 ? '⚔️ Javában tart a harc!' : '🧟 Gyere, kell az erősítés!';

  e.setColor(tele ? 0xff0000 : emberek ? 0xb00000 : 0x6b0000)
    .setDescription([
      `## 🟢 ONLINE  •  ${nagySzam(emberek)} / ${nagySzam(s.max)}`,
      `${csik(emberek, s.max)}`,
      `*${hangulat}*`,
      '',
      `**📡 Szerver:** ${escapeMarkdown(s.nev)}`,
    ].join('\n'))
    .setThumbnail(`https://image.gametracker.com/images/maps/160x120/cs/${encodeURIComponent(s.palya)}.jpg`)
    .addFields(
      { name: '🗺️ Pálya', value: `\`\`\`${s.palya}\`\`\``, inline: true },
      { name: '👥 Játékosok', value: `\`\`\`${emberek} / ${s.max}\`\`\``, inline: true },
      { name: '📈 Mai csúcs / Rekord', value: `\`\`\`${cs.ma} / ${cs.rekord}\`\`\``, inline: true },
      { name: '🎮 Csatlakozás (másold a CS konzolba)', value: `\`\`\`connect ${cim()}\`\`\`` },
    );

  if (s.lista.length) {
    const sorok = s.lista.slice(0, 15).map((p, n) => {
      const hely = ermek[n] || `\`${String(n + 1).padStart(2)}.\``;
      return `${hely} **${escapeMarkdown(p.nev.slice(0, 24))}** — ${p.pont} pont • ${idoSzoveg(p.ido)}`;
    });
    if (s.lista.length > 15) sorok.push(`*... és még ${s.lista.length - 15} játékos*`);
    let szoveg = sorok.join('\n');
    if (szoveg.length > 1024) szoveg = szoveg.slice(0, 1000) + '\n*...*';
    e.addFields({ name: `🏆 Ranglista (${s.lista.length} fő)`, value: szoveg });
  } else {
    e.addFields({ name: '🏆 Ranglista', value: '*Most senki sincs fent. Gyere, legyél az első! 🧟*' });
  }
  return e;
}

function statuszGombok(guild) {
  const sor = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Statisztika').setEmoji('📊')
      .setURL(`https://www.gametracker.com/server_info/${cim()}/`),
  );
  const szab = csatorna(guild, 'szabaly');
  if (szab) sor.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Szabályzat').setEmoji('📜').setURL(szab.url));
  const patch = csatorna(guild, 'patch');
  if (patch) sor.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Patch Notes').setEmoji('🛠️').setURL(patch.url));
  return [sor];
}

// Csatorna keresése. Sorrend:
//  1) config.json "csatornak": { "patch": "csatorna ID" } - ha kézzel megadod
//  2) a /setup által adott pontos név
//  3) bármilyen díszítésű név, amiben benne van a kulcsszó (pl. "| 🛠️ • patch-notes")
const KULCSSZAVAK = {
  patch: ['patchnotes', 'patchnote', 'changelog'],
  szabaly: ['szabályzat', 'szabalyzat', 'szabályok', 'rules'],
  statusz: ['szerverstátusz', 'szerverstatusz', 'státusz', 'statusz', 'status'],
  naplo: ['szervernapló', 'szervernaplo', 'napló', 'naplo'],
  udvozles: ['üdvözlés', 'udvozles', 'welcome', 'üdv'],
};
const tisztit = (n) => n.toLowerCase().replace(/[^a-z0-9áéíóöőúüű]/g, '');

function csatorna(guild, kulcs) {
  const id = cfg.csatornak && cfg.csatornak[kulcs];
  if (id) {
    const c = guild.channels.cache.get(String(id));
    if (c && c.isTextBased()) return c;
  }
  const szoveges = guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread?.() && !c.isVoiceBased?.());
  const nev = setup.csatornaNev(kulcs);
  const pontos = szoveges.find((c) => c.name === nev);
  if (pontos) return pontos;
  for (const szo of KULCSSZAVAK[kulcs] || []) {
    const c = szoveges.find((x) => tisztit(x.name).includes(szo));
    if (c) return c;
  }
  return null;
}

// ---------------- élő státusz ----------------
async function statuszFrissit() {
  const guild = client.guilds.cache.get(cfg.guildId);
  if (!guild) return;
  const s = await lekerdez();

  client.user.setActivity(
    s.online ? `🧟 ${s.jatekos - (s.botok || 0)}/${s.max} | ${s.palya}` : '🔴 Szerver offline',
    { type: ActivityType.Watching },
  );

  const ch = csatorna(guild, 'statusz');
  if (!ch) return;
  const embed = statuszEmbed(s);
  const components = statuszGombok(guild);
  try {
    if (adat.statuszUzenet) {
      const m = await ch.messages.fetch(adat.statuszUzenet).catch(() => null);
      if (m && adat.statuszVerzio === 2) {
        // a kép a régi üzeneten marad, nem kell újra feltölteni
        await m.edit({ embeds: [embed], components });
        return;
      }
      if (m) await m.delete().catch(() => {}); // régi kinézetű üzenet -> újat küldünk
    }
    const files = fs.existsSync(BANNER) ? [new AttachmentBuilder(BANNER, { name: 'shadow_banner.png' })] : [];
    const m = await ch.send({ embeds: [embed], components, files });
    adat.statuszUzenet = m.id;
    adat.statuszVerzio = 2;
    mentes();
  } catch (e) {
    console.error('Státusz hiba:', e.message);
  }
}

// ---------------- szerver napló (RCON) ----------------
let rconLeallitva = false;
async function naploLekeres() {
  if (rconLeallitva || !cfg.rconJelszo) return;
  const guild = client.guilds.cache.get(cfg.guildId);
  if (!guild) return;
  const ch = csatorna(guild, 'naplo');
  if (!ch) return;

  let szoveg;
  try {
    szoveg = await q.rcon(cfg.szerverIp, cfg.szerverPort, cfg.rconJelszo, 'shadow_dc_naplo');
  } catch (e) {
    if (e instanceof q.RconHiba) {
      // rossz jelszóval nem próbálkozunk tovább, különben a szerver kitiltja a bot IP-jét
      rconLeallitva = true;
      console.error(`RCON hiba: ${e.message}. A napló leállt - javítsd a config.json-t és indítsd újra a botot.`);
      await ch.send(`⚠️ **Napló hiba:** ${e.message}. Javítsd a \`config.json\`-ban, és indítsd újra a botot.`).catch(() => {});
    }
    return; // szerver offline: később újra
  }

  if (!szoveg.includes('SDC_VEGE')) {
    if (!adat.pluginFigyelmeztetes) {
      adat.pluginFigyelmeztetes = true; mentes();
      await ch.send('⚠️ A szerveren nem fut a `shadow_discord.amxx` plugin, ezért nincs mit kiírni. Tedd fel, és írd be a plugins-zplague.ini-be.').catch(() => {});
    }
    return;
  }
  if (adat.pluginFigyelmeztetes) { adat.pluginFigyelmeztetes = false; mentes(); }

  const sorok = szoveg.split('\n').filter((l) => l.startsWith('SDC|')).map((l) => l.slice(4).trim());
  if (!sorok.length) return;

  // max 2000 karakteres üzenetekben
  let darab = '';
  for (const s of sorok) {
    if ((darab + s).length > 1900) { await ch.send(darab).catch(() => {}); darab = ''; }
    darab += s + '\n';
  }
  if (darab) await ch.send({ content: darab, allowedMentions: { parse: [] } }).catch(() => {});
}

// ---------------- parancsok ----------------
const PARANCSOK = [
  new SlashCommandBuilder().setName('szerver').setDescription('A zombi szerver állapota'),
  new SlashCommandBuilder().setName('jatekosok').setDescription('Kik vannak fent a zombi szerveren'),
  new SlashCommandBuilder().setName('ip').setDescription('A zombi szerver címe'),
  new SlashCommandBuilder().setName('setup').setDescription('Felépíti a Discord szervert: rangok, csatornák, jogok (csak a tulaj)'),
  new SlashCommandBuilder().setName('patchnotes').setDescription('Patch Notes kiírása a CS 1.6 szerver frissítéseiről (Admin és fölötte)')
    .addSubcommand((sc) => sc.setName('kuldes').setDescription('Egy kész Patch Notes kiküldése a patchnotes mappából')
      .addStringOption((o) => o.setName('fajl').setDescription('Melyik Patch Notes (ha üresen hagyod: a legújabb)').setRequired(false).setAutocomplete(true)))
    .addSubcommand((sc) => sc.setName('iras').setDescription('Új Patch Notes írása itt a Discordon')),
  new SlashCommandBuilder().setName('udvozles-teszt').setDescription('Kipróbálja az üdvözlést és a rangadást rajtad (Admin és fölötte)'),
  new SlashCommandBuilder().setName('szabalyzat').setDescription('Kiírja / frissíti a szabályzatot a szabályzat csatornában (Admin és fölötte)'),
].map((c) => c.toJSON());

// ---------------- Patch Notes ----------------
const PATCH_MAPPA = path.join(__dirname, 'patchnotes');

// Beépített tartalom: akkor is van Patch Notes és szabályzat, ha a fájlok nincsenek a bot mellett
// (pl. hosztingra csak az index.js került fel). A GitHubról jövő újabbak ezeket felülírják.
const BEEPITETT_PATCH = {
  "2026.11.18": "# 🛠️ Patch Notes 2026.11.18\n\n## 🎮 Új játékmódok - ÚJ\n* **Sniper mód:** egy ember Túlélő lesz, de **AWP-t** kap, ami **egy lövéssel** megöl egy zombit.\n* **Assassin mód:** egy játékos olyan Nemesis lesz, aki **szinte láthatatlan**, **nagyon gyors**, de **fele annyi HP-ja** van. Nem világít körülötte a piros fény, figyeljetek!\n* **Armageddon mód:** a csapat fele **Nemesis**, a másik fele **Túlélő**, mindenki **teljes HP-val**.\n* A módok **véletlenszerűen** jönnek, ugyanaz a mód **nem jön kétszer egymás után**.\n* Sniper és Assassin legalább **4**, Armageddon legalább **6** játékostól indulhat.\n\n## 💰 Jutalmak - ÚJ\n* Fertőzéskor a zombi kiírva látja, mit kapott: **+100 HP** és **+15 LCS**.\n* Aki elkapja az **utolsó embert**, **DUPLA jutalmat** kap, és mindenki látja a chatben.\n* Ha az emberek nyerik a kört, minden élő ember **+5 LCS**-t kap.\n* Ha csak **egy ember** élte túl a kört, ő **+20 LCS**-t kap.\n* A túlélés jutalomhoz legalább **3 játékos** kell, a Boss pályán nem jár.\n\n## ❄️ Gránátok - JAVÍTVA\n* **Fagyasztó gránát:** a fagyott zombi vastag **jégréteget** kap, **kék fény** világít körülötte, és **jégkristályok** jelennek meg.\n* A fagyott zombi látja a visszaszámlálást: **„JÉGBE FAGYTÁL! Kiolvadás: 2.5 mp”**.\n* **Tűz gránát:** az égő zombi körül **narancs tűzfény** villog, és kiírja neki: **„ÉGSZ!”** (a víz eloltja).\n* Aki dobta, látja a chatben, **hány zombit fagyasztott le** vagy **gyújtott fel**.\n\n## 🔪 Kések\n* A **Szent Bárd** mostantól **/cam**-ben is a saját **arany kinézetét** mutatja, nem a katanát.\n* A Szent Bárd **kalapács hangokat** kapott a katana hangjai helyett.\n* A kés menü (**/kes**) **rangok szerint** van rendezve: **VIP**, **ADMIN**, **FŐADMIN**, **TULAJ**.\n* Új kések: **Balrog Kasza** és **Pokol Kasza** (VIP), **Elf Kalapács** és **Szent Bárd** (ADMIN), **Harci Pöröly** (FŐADMIN), **Sötét Lovag Pöröly** (TULAJ).\n\n## 🪂 Ejtőernyő - JAVÍTVA\n* Ejtőernyőzés közben a **Space** becsukja az ernyőt, így a **saját ugrásodat** (dupla ugrás / VIP ugrások) tudod használni.\n* Az ejtőernyő **nem ad extra ugrást**.\n* Ha az **E**-t nyomva tartod, zuhanáskor az ernyő magától **újra kinyílik**.\n\n## 🔫 Fegyverek az Extrák menüben\n* **16 új fegyver:** Janus-3, Thanatos-7, M3 Fekete Sárkány, Infect Balrog-11, Sárkányágyú, M3 Nagy Cápa, HK416 Króm, Dubstep Fegyver, AKM Kék Balrog, Ethereal Lézerpuska, Vérszaggató (Guillotine), Minigun, Arany Deagle, Skull-3, Plazmapuska, Lézeres Mesterlövész.\n* **Örök lőszer (1 kör)** – **10 LCS**, a köröd végéig nem fogy el a lőszered.\n* **VIP Extrák:** Plasma Gun (**35 LCS**), Skull-8 (**30 LCS**), Dual Infinity (**25 LCS**).\n\n## 🧟 Zombik és emberek\n* Új zombi osztály: **Piramis Zombi**.\n* A **Nemesis** új kinézetet és új karmot kapott.\n* **Ember osztályok** (**/osztaly**): Katona, Tank, Futó, Akrobata, Orvos és **Elit (VIP)**. A választás megmarad.\n* A főmenüben (**M**) az **Osztályok** pontban az ember és a zombi osztály is megtalálható.\n* HP: emberek **150**, utolsó ember **350**, Túlélő **3000**, végtelen tárral.\n* A zombik **nem használhatják** az emberi parancsokat (pl. **/kes**, **/osztaly**).\n\n## 👽 Alien Boss\n* **Minden 15. kör után** a szerver átvált az **Alien Boss** pályára.\n* A Boss pályán **senki sem lesz zombi**, csak a Boss ellen harcoltok. A menük megmaradnak.\n* Halál után **5 mp** múlva újraéledsz, összesen **5 alkalommal**.\n* Ha elfogyott mindenki újraéledése, **pályaszavazás** indul.\n\n## 🛠️ Egyéb\n* **/bank** – az LCS-ed elmentődik, és küldhetsz LCS-t másoknak.\n* **/rtv** – pályaváltás szavazással, a váltás **a kör végén** történik.\n* **Sebzés kijelzés:** látod, mennyit sebeztél, és ha rácélzol valakire, látod a **HP**-ját.\n* **23 körvégi zene.**\n* Új, egységes **SHADOW** kinézet minden menüben.\n* Rangok (**VIP**, **Moderátor**, **Admin**, **Főadmin**) a chat **prefixével** együtt.\n* Új kitiltás- és némítás rendszer, a **szerver napló** most már a Discordon is látszik a staffnak.\n",
  "2026.11.18_javitas": "# 🛠️ Patch Notes 2026.11.18 – Javítások\n\n## 🛡️ Admin menü - JAVÍTVA\n* A **Tulaj** az admin menüből most már el tudja indítani a **Boss pályát** (**6. Boss pálya indítása**).\n* A **Pályaszavazás indítása** is működik a Tulajnak.\n"
};
const BEEPITETT_SZABALYZAT = "# 📜 [~*| SHADOW |*~] SZABÁLYZAT\nÜdv a **[~*| SHADOW |*~]** közösségben! 🧟\nA **Discord** és a **CS 1.6 Zombie szerver** használatával **elfogadod** az alábbi szabályokat. Ha nem ismered őket, az **nem mentség**.\n\nA szabályokra **pontszámmal** hivatkozunk (pl. `4.2`), így a büntetésnél mindig látod, miért kaptad.\n> 💡 Röviden: **légy normális, játssz tisztán, és tiszteld a többieket.**\n\n## 🤝 1. ALAPSZABÁLYOK\n`1.1` **Tisztelet.** Mindenkivel tisztelettudóan beszélj. Tilos a sértegetés, a fenyegetés, a zaklatás és a provokálás.\n`1.2` **Gyűlöletkeltés.** Tilos a rasszista, nemi, vallási vagy bármilyen csoport elleni gyűlöletkeltő megnyilvánulás.\n`1.3` **Személyes adatok.** Tilos más személyes adatainak (név, lakcím, kép, telefonszám, IP) kiadása vagy kiadással való fenyegetés.\n`1.4` **Reklám.** Tilos más szerver, Discord, weboldal vagy csatorna hirdetése engedély nélkül (privát üzenetben is).\n`1.5` **Csalás terjesztése.** Tilos hackek, csalóprogramok, crashelő scriptek terjesztése vagy ajánlása.\n`1.6` **Kereskedelem.** Fiók, rang, VIP, LCS vagy item **valódi pénzért** vagy más játék itemeiért való adás-vétele tilos.\n`1.7` **Megszemélyesítés.** Tilos adminnak, tulajnak vagy más játékosnak kiadni magad.\n`1.8` **Kiskapuk.** Ha valami nincs leírva, de nyilvánvalóan rontja mások élményét, azt is büntethetjük.\n\n## 💬 2. DISCORD\n`2.1` **Csatornák.** Mindent a neki szánt csatornába írj (képek → képek-videók, parancsok → bot-parancsok, hiba → hibajelentés).\n`2.2` **Spam.** Tilos a flood, az ismételt üzenetek, a csupa NAGYBETŰ és az emoji/matrica áradat.\n`2.3` **Jelölések.** Tilos a felesleges @everyone, @here, rang- és staff jelölés. Adminnak privátban is csak indokkal írj.\n`2.4` **Tartalom.** Tilos a 18+, a véres, felkavaró vagy illegális tartalom, kép, link és videó.\n`2.5` **Linkek.** Tilos a gyanús, átverős (pl. „ingyen Nitro”) linkek küldése.\n`2.6` **Profil.** A neved, profilképed és státuszod nem lehet sértő, 18+ vagy reklám.\n`2.7` **Nyelv.** A közös csatornákban **magyarul** beszélünk.\n\n## 🔊 3. HANGCSATORNÁK\n`3.1` **Zajkeltés.** Tilos a fülsértő zaj, a kiabálás, a hangtorzító és a soundboard spam.\n`3.2` **Zene.** Mikrofonba zenét csak akkor játszhatsz, ha mindenki beleegyezik.\n`3.3` **Csatornaugrálás.** Tilos a folyamatos csatornák közötti ugrálás.\n`3.4` **Felvétel.** Mások hangját csak az ő engedélyükkel veheted fel.\n\n## 🎮 4. CS 1.6 ZOMBIE – ÁLTALÁNOS\n`4.1` **CSALÁS = ÖRÖK BAN.** Wallhack, aimbot, speedhack, no-recoil, bunnyhop script és minden külső program **tilos**.\n`4.2` **Bugok.** Tilos a pályahibák kihasználása: falba/textúrába bújás, pálya alá esés, olyan hely, ahova a zombi semmilyen módon nem tud feljutni.\n`4.3` **Retry.** Tilos ki-be lépni azért, hogy ne te legyél a zombi, vagy hogy újra élj.\n`4.4` **Név.** A neved nem lehet sértő, nem utánozhat admint, és nem lehet benne reklám vagy IP-cím.\n`4.5` **Mikrofon a játékban.** Tilos a mikrofon spam, a zene és a folyamatos hangoskodás.\n`4.6` **AFK.** Tilos az AFK farmolás (LCS és jutalmak gyűjtése játék nélkül).\n`4.7` **Szavazások.** Tilos az RTV és a pályaszavazás szándékos zavarásra használása.\n`4.8` **Chat.** Tilos a chat spam, a sértegetés és a halottak beszólogatása.\n\n## 🧍 5. EMBERKÉNT\n`5.1` **Blokkolás.** Tilos a csapattársak blokkolása, a táborból való kizárása vagy lelökése.\n`5.2` **Szabotázs.** Tilos szándékosan beengedni a zombikat (pl. kinyitni a tábort, rossz helyre csalni a csapatot).\n`5.3` **Lézer és tárgyak.** Lézert és egyéb tárgyat nem rakhatsz úgy, hogy azzal a saját csapatod útját zárd el, vagy kiszorítsd őket a táborból.\n`5.4` **Túlélő / Sniper.** Ha te vagy a különleges ember, játssz is: ne bújj el bugos helyre a kör végéig.\n\n## 🧟 6. ZOMBIKÉNT\n`6.1` **Játssz.** Zombiként is támadnod kell, tilos szándékosan egy helyben állni vagy bújkálni a kör végéig.\n`6.2` **Segítés tilos.** Zombiként nem segítheted az embereket (pl. nem állsz el az útjukból direkt, nem mutatsz nekik utat).\n`6.3` **Nemesis / Assassin / Boss.** A különleges köröket ne rontsd el AFK-val vagy kilépéssel.\n\n## 💰 7. LCS, BANK, VIP\n`7.1` **Átverés.** Tilos az LCS kölcsönkérése és vissza nem adása, és bármilyen „cserés” átverés a /bank-on keresztül.\n`7.2` **Koldulás.** Tilos az LCS, VIP vagy rang folyamatos kérése a többiektől és a staff-tól.\n`7.3` **Hibák.** Ha bugot találsz (pl. végtelen LCS), **jelentsd** a ┃🐛・hibajelentés csatornában. Aki kihasználja, elveszítheti az LCS-ét és kitiltást kaphat.\n`7.4` **VIP.** A VIP és a rangok a szerver szabályai alól **nem mentesítenek**. Szabályszegésért a VIP is elvehető.\n\n## 🛡️ 8. STAFF\n`8.1` **Döntések.** Az adminok döntését tiszteletben kell tartani. Vitát ne a chatben, hanem privátban vagy a hibajelentésben rendezz.\n`8.2` **Visszaélés.** A staff nem élhet vissza a jogaival: nem büntethet ok nélkül, és nem adhat LCS-t vagy rangot magának vagy barátainak.\n`8.3` **Pártatlanság.** A szabályok a barátokra és a staff tagjaira is **ugyanúgy** vonatkoznak.\n`8.4` **Rangadás.** Rangot (VIP, Moderátor, Admin, Főadmin) csak az adhat, akinek ehhez joga van.\n\n## ⚖️ 9. BÜNTETÉSEK\n**Általános sorrend:**\n`1.` ⚠️ Figyelmeztetés → `2.` 🔇 Némítás (gag) → `3.` 👢 Kirúgás (kick) → `4.` ⏳ Ideiglenes ban (1 nap – 1 hét) → `5.` ⛔ Örök ban\n\n**Gyakori esetek:**\n🔴 Csalás, crash script (`4.1`, `1.5`) → **örök ban**\n🔴 Reklám (`1.4`) → **örök ban**\n🟠 Bug kihasználás (`4.2`, `7.3`) → **1–7 nap ban**\n🟠 Szabotázs, csapat kizárása (`5.1`, `5.2`, `5.3`) → **kick → 1 nap ban**\n🟡 Sértegetés, spam (`1.1`, `2.2`, `4.8`) → **gag 30 perc → 1 nap**\n🟡 Retry, AFK (`4.3`, `4.6`) → **kick → 1 nap ban**\n🟡 Mikrofon spam (`3.1`, `4.5`) → **némítás**\n\n> A staff súlyos esetben **rögtön** nagyobb büntetést adhat. A Discordon kapott büntetés a **CS szerveren is érvényes lehet**, és fordítva.\n\n## 📩 10. FELLEBBEZÉS ÉS JELENTÉS\n`10.1` **Jelentés.** Ha valaki szabályt szeg, jelentsd egy adminnak **képpel vagy videóval** és a pontos idővel.\n`10.2` **Fellebbezés.** Ha szerinted igazságtalan a büntetésed, írj privátban egy **Főadminnak** vagy a **Tulajnak**. Hamis jelentésért te kaphatsz büntetést.\n`10.3` **Változások.** A szabályzat bármikor változhat, a változásokat a ┃📣・hírek csatornában jelezzük.\n\n**Köszönjük, hogy elolvastad! Jó játékot kíván a [~*| SHADOW |*~] csapata! 🧟🔥**\n";

function patchFajlok() {
  let lemez = [];
  try { lemez = fs.readdirSync(PATCH_MAPPA).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)); } catch (_) {}
  return [...new Set([...lemez, ...Object.keys(BEEPITETT_PATCH)])].sort().reverse();
}

function patchSzoveg(nev) {
  const ut = path.join(PATCH_MAPPA, nev + '.md');
  if (fs.existsSync(ut)) return fs.readFileSync(ut, 'utf8');
  return BEEPITETT_PATCH[nev] || null;
}

function szabalyzatSzoveg() {
  const ut = path.join(__dirname, 'szabalyzat.md');
  return fs.existsSync(ut) ? fs.readFileSync(ut, 'utf8') : BEEPITETT_SZABALYZAT;
}

function joga(it) {
  if (it.user.id === it.guild.ownerId) return true;
  if (it.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return it.member.roles.cache.some((r) => ['👑 Tulajdonos', '🔱 Főadmin', '🛡️ Admin'].includes(r.name));
}

// a Discord egy üzenetben max 2000 karaktert enged: egész szakaszokat (## ) rakunk egy üzenetbe
function darabol(szoveg) {
  const MAX = 1900;
  const sorok = szoveg.replace(/\r/g, '').trim().split('\n');
  // szakaszokra bontás
  const szakaszok = [];
  for (const sor of sorok) {
    if (sor.startsWith('## ') || !szakaszok.length) szakaszok.push(sor);
    else szakaszok[szakaszok.length - 1] += '\n' + sor;
  }
  // túl hosszú szakasz: sorok mentén vágjuk
  const elemek = [];
  for (const sz of szakaszok) {
    if (sz.length <= MAX) { elemek.push(sz); continue; }
    let akt = '';
    for (const sor of sz.split('\n')) {
      if (akt && (akt + '\n' + sor).length > MAX) { elemek.push(akt); akt = sor; } else akt = akt ? akt + '\n' + sor : sor;
    }
    if (akt) elemek.push(akt);
  }
  // szakaszok összepakolása üzenetekbe
  const darabok = [];
  let akt = '';
  for (const e of elemek) {
    if (akt && (akt + '\n\n' + e).length > MAX) { darabok.push(akt); akt = e; } else akt = akt ? akt + '\n\n' + e : e;
  }
  if (akt.trim()) darabok.push(akt);
  return darabok;
}

// ---------------- Szabályzat ----------------
// A szabalyzat.md-ből szép, színes kártyákat (embed) csinál: a "## " részek külön kártyák.
// Ha már ki volt írva, a régi üzeneteket átírja (nem lesz dupla).
const SZABALY_SZINEK = [0xb00000, 0xe67e22, 0x5865f2, 0x9b59b6, 0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xff7a00, 0x992d22, 0x1abc9c];
const SZABALY_VERZIO = 2;

function szabalyKartyak() {
  const nyers = szabalyzatSzoveg().replace(/\r/g, '').split(PREFIX).join(PREFIX_MD);
  const reszek = nyers.split(/\n(?=## )/);
  const fej = reszek.shift();
  const fejSorok = fej.split('\n');
  const cim = fejSorok[0].replace(/^#\s*/, '');

  const kartyak = [];
  kartyak.push(new EmbedBuilder()
    .setColor(0xb00000)
    .setTitle(cim)
    .setDescription(fejSorok.slice(1).join('\n').trim() || '​')
    .setImage(fs.existsSync(BANNER) ? 'attachment://shadow_banner.png' : null));

  reszek.forEach((r, n) => {
    const sorok = r.split('\n');
    const rcim = sorok[0].replace(/^##\s*/, '');
    let leiras = sorok.slice(1).join('\n').trim();
    // a pontok közé egy kis levegő, hogy jobban olvasható legyen
    leiras = leiras.replace(/\n(?=`\d+\.\d+`)/g, '\n\n');
    const e = new EmbedBuilder().setColor(SZABALY_SZINEK[n % SZABALY_SZINEK.length]).setTitle(rcim)
      .setDescription(leiras.slice(0, 4096) || '​');
    kartyak.push(e);
  });
  const utolso = kartyak[kartyak.length - 1];
  utolso.setFooter({ text: `${PREFIX} • Szabályzat` }).setTimestamp(new Date());
  return kartyak;
}

// üzenetenként max 10 kártya és kb. 6000 karakter
function kartyaCsoportok(kartyak) {
  const csop = [];
  let akt = [], hossz = 0;
  for (const k of kartyak) {
    const h = JSON.stringify(k.toJSON ? k.toJSON() : k).length;
    if (akt.length && (akt.length >= 10 || hossz + h > 5500)) { csop.push(akt); akt = []; hossz = 0; }
    akt.push(k); hossz += h;
  }
  if (akt.length) csop.push(akt);
  return csop;
}

async function szabalyzatKuldes(guild) {
  const ch = csatorna(guild, 'szabaly');
  if (!ch) throw new Error('Nincs meg a szabályzat csatorna. Futtasd le a /setup-ot!');
  const csoportok = kartyaCsoportok(szabalyKartyak());

  const regiek = [];
  for (const id of adat.szabalyUzenetek || []) {
    const m = await ch.messages.fetch(id).catch(() => null);
    if (m) regiek.push(m);
  }

  if (adat.szabalyVerzio === SZABALY_VERZIO && regiek.length === csoportok.length) {
    for (let i = 0; i < csoportok.length; i++) await regiek[i].edit({ content: null, embeds: csoportok[i] });
    return { ch, uj: false };
  }

  for (const m of regiek) await m.delete().catch(() => {});
  const idk = [];
  for (let i = 0; i < csoportok.length; i++) {
    const files = i === 0 && fs.existsSync(BANNER) ? [new AttachmentBuilder(BANNER, { name: 'shadow_banner.png' })] : [];
    const m = await ch.send({ embeds: csoportok[i], files, allowedMentions: { parse: [] } });
    idk.push(m.id);
  }
  adat.szabalyUzenetek = idk;
  adat.szabalyVerzio = SZABALY_VERZIO;
  mentes();
  return { ch, uj: true };
}

async function patchKuldes(guild, szoveg) {
  const ch = csatorna(guild, 'patch');
  if (!ch) throw new Error('Nincs meg a Patch Notes csatorna. Futtasd le a /setup-ot!');
  for (const d of darabol(szoveg)) await ch.send({ content: d, allowedMentions: { parse: [] } });
  return ch;
}

client.on('interactionCreate', async (it) => {
  // Patch Notes fájl választó
  if (it.isAutocomplete() && it.commandName === 'patchnotes') {
    const keres = it.options.getFocused().toLowerCase();
    const lista = patchFajlok();
    if (!lista.length) {
      console.error(`Patch Notes: nincs .md fájl itt: ${PATCH_MAPPA}`);
      return it.respond([{ name: '⚠️ Nincs Patch Notes – írj újat: /patchnotes iras', value: '__nincs__' }]).catch(() => {});
    }
    const talalt = lista.filter((f) => f.toLowerCase().includes(keres));
    return it.respond((talalt.length ? talalt : lista).slice(0, 25)
      .map((f, n) => ({ name: n === 0 && !keres ? `${f}  (legújabb)` : f, value: f }))).catch(() => {});
  }

  // Patch Notes írás ablak beküldése
  if (it.isModalSubmit() && it.customId === 'patchnotes_iras') {
    try {
      const cim = it.fields.getTextInputValue('cim').trim();
      const tartalom = it.fields.getTextInputValue('szoveg').trim();
      const teljes = `# 🛠️ ${cim}\n\n${tartalom}\n`;
      await it.deferReply({ ephemeral: true });
      const ch = await patchKuldes(it.guild, teljes);
      // elmentjük, hogy később újra ki lehessen küldeni
      try {
        fs.mkdirSync(PATCH_MAPPA, { recursive: true });
        const nev = cim.replace(/[^0-9A-Za-z._-]+/g, '_').replace(/^_+|_+$/g, '') || String(Date.now());
        fs.writeFileSync(path.join(PATCH_MAPPA, nev + '.md'), teljes);
        adat.patchIsmert = [...new Set([...(adat.patchIsmert || []), nev])]; mentes(); // ezt mar kikuldtuk
      } catch (_) {}
      return it.editReply(`✅ Kiküldve ide: ${ch}`);
    } catch (e) {
      const uz = '❌ Hiba: ' + e.message;
      return (it.deferred ? it.editReply(uz) : it.reply({ content: uz, ephemeral: true })).catch(() => {});
    }
  }

  if (!it.isChatInputCommand()) return;
  console.log(`/${it.commandName} - ${it.user.tag}`);
  try {
    if (it.commandName === 'ip') {
      return it.reply(`🌐 **${PREFIX_MD}** zombie szerver: \`connect ${cim()}\`\nMásold be a CS konzolba (~ gomb)!`);
    }

    if (it.commandName === 'szerver' || it.commandName === 'jatekosok') {
      await it.deferReply();
      const s = await lekerdez();
      return it.editReply({ embeds: [statuszEmbed(s, false)], components: statuszGombok(it.guild) });
    }

    if (it.commandName === 'udvozles-teszt') {
      if (!joga(it)) return it.reply({ content: '❌ Ezt csak az Admin és afölötti rang használhatja.', ephemeral: true });
      await it.deferReply({ ephemeral: true });
      const g = it.guild;
      const hibak = [];
      if (!VAN_TAG_INTENT) hibak.push('❌ **Server Members Intent KI van kapcsolva** → a bot nem veszi észre, ha valaki belép. Kapcsold be: discord.com/developers → a botod → **Bot** → **Server Members Intent** → Save Changes, utána `pm2 restart shadowbot`.');
      if (!csatorna(g, 'udvozles')) hibak.push('❌ Nincs meg az üdvözlés csatorna → futtasd a `/setup`-ot.');
      const jr = g.roles.cache.find((x) => x.name === '🧟 Játékos');
      if (!jr) hibak.push('❌ Nincs „🧟 Játékos” rang → futtasd a `/setup`-ot.');
      else if (jr.position >= g.members.me.roles.highest.position) hibak.push('❌ A bot rangja a „🧟 Játékos” rang **alatt** van → Szerverbeállítások → Rangok → húzd a bot rangját **legfelülre**.');
      await ujTag(it.member, true);
      return it.editReply(hibak.length ? `**Ezeket kell megjavítani:**\n${hibak.join('\n')}` : '✅ Minden rendben! Megnéztem: az üdvözlés kiment, és a rangot is megkaptad.');
    }

    if (it.commandName === 'szabalyzat') {
      if (!joga(it)) return it.reply({ content: '❌ Ezt csak az Admin és afölötti rang használhatja.', ephemeral: true });
      await it.deferReply({ ephemeral: true });
      const { ch, uj } = await szabalyzatKuldes(it.guild);
      return it.editReply(uj ? `✅ A szabályzat kiírva ide: ${ch}` : `✅ A szabályzat frissítve itt: ${ch}`);
    }

    if (it.commandName === 'patchnotes') {
      if (!joga(it)) return it.reply({ content: '❌ Ezt csak az Admin és afölötti rang használhatja.', ephemeral: true });
      if (it.options.getSubcommand() === 'iras') {
        const ma = new Date();
        const datum = `${ma.getFullYear()}.${String(ma.getMonth() + 1).padStart(2, '0')}.${String(ma.getDate()).padStart(2, '0')}`;
        const modal = new ModalBuilder().setCustomId('patchnotes_iras').setTitle('Új Patch Notes').addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cim').setLabel('Cím')
            .setStyle(TextInputStyle.Short).setValue(`Patch Notes ${datum}`).setMaxLength(80).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('szoveg').setLabel('Mi változott a CS 1.6 szerveren?')
            .setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true)
            .setPlaceholder('## 🔫 Fegyverek - ÚJ\n* **Új fegyver:** ...\n\n## 🛠️ Javítások\n* ...')),
        );
        return it.showModal(modal);
      }
      const lista = patchFajlok();
      if (!lista.length) {
        return it.reply({ content: '❌ Nincs egy Patch Notes sem. Írj újat: `/patchnotes iras`', ephemeral: true });
      }
      const fajl = path.basename(it.options.getString('fajl') || lista[0]);
      const szoveg = patchSzoveg(fajl);
      if (!szoveg) return it.reply({ content: `❌ Nincs ilyen Patch Notes: **${fajl}**\nEzek vannak: ${lista.map((f) => '`' + f + '`').join(', ')}`, ephemeral: true });
      await it.deferReply({ ephemeral: true });
      const ch = await patchKuldes(it.guild, szoveg);
      return it.editReply(`✅ Kiküldve ide: ${ch}`);
    }

    if (it.commandName === 'setup') {
      if (it.user.id !== it.guild.ownerId) {
        return it.reply({ content: '❌ Ezt csak a Discord szerver tulajdonosa használhatja.', ephemeral: true });
      }
      await it.deferReply({ ephemeral: true });
      const sorok = [];
      const naplo = (s) => { sorok.push('• ' + s); };
      await setup.felepit(it.guild, naplo);
      naplo(await rangokPotlasa(it.guild));
      await szabalyzatKuldes(it.guild).then(({ uj }) => naplo(uj ? 'Szabályzat kiírva.' : 'Szabályzat frissítve.'))
        .catch((e) => naplo('Szabályzat hiba: ' + e.message));
      delete adat.statuszUzenet; mentes();
      statuszFrissit();
      return it.editReply(`✅ **Kész!**\n${sorok.join('\n')}\n\nNe felejtsd el: a **👑 Tulajdonos** rangot add magadnak (jobb klikk a nevedre → Rangok).`);
    }
  } catch (e) {
    console.error(e);
    const uz = '❌ Hiba: ' + e.message;
    if (it.deferred || it.replied) it.editReply(uz).catch(() => {});
    else it.reply({ content: uz, ephemeral: true }).catch(() => {});
  }
});

// ---------------- új tagok ----------------
// Védett rangok, amiket a bot sosem ad vissza magától (ezeket csak a tulaj adhatja)
const VEDETT = ['👑 Tulajdonos'];

function illoRang(guild, tag) {
  return guild.roles.cache.find((x) => x.name === (tag.user.bot ? '🤖 Bot' : '🧟 Játékos'));
}

// kilépéskor megjegyezzük a rangjait, hogy visszatéréskor visszakapja
client.on('guildMemberRemove', (tag) => {
  if (tag.guild.id !== cfg.guildId || tag.user.bot) return;
  const rangok = tag.roles.cache
    .filter((r) => r.id !== tag.guild.id && !r.managed && !VEDETT.includes(r.name))
    .map((r) => r.id);
  adat.regiRangok = adat.regiRangok || {};
  if (rangok.length) adat.regiRangok[tag.id] = rangok;
  mentes();
});

client.on('guildMemberAdd', (tag) => ujTag(tag).catch((e) => console.error('Belépés hiba:', e.message)));

async function ujTag(tag, teszt = false) {
  if (tag.guild.id !== cfg.guildId) return;
  console.log(`Új tag: ${tag.user.tag}${teszt ? ' (teszt)' : ''}`);
  const guild = tag.guild;
  const me = guild.members.me;

  // rangok: visszatérő tag -> régi rangjai (a Némított is!), új tag -> Játékos, bot -> Bot
  const adando = [];
  const regi = (adat.regiRangok || {})[tag.id];
  if (regi && !tag.user.bot) {
    for (const id of regi) {
      const r = guild.roles.cache.get(id);
      if (r && r.position < me.roles.highest.position) adando.push(r);
    }
  }
  const alap = illoRang(guild, tag);
  if (alap && !adando.includes(alap)) adando.push(alap);
  if (adando.length) {
    await tag.roles.add(adando, '[SHADOW] belépési rang').catch((e) => {
      console.error('Rangadás hiba:', e.message);
      console.error('  Húzd a bot rangját a Discord szerver beállításaiban (Rangok) LEGFELÜLRE!');
    });
  }
  if (regi) { delete adat.regiRangok[tag.id]; mentes(); }

  if (tag.user.bot) return;

  // üdvözlés
  const ch = csatorna(guild, 'udvozles');
  if (!ch) return;
  const szab = csatorna(guild, 'szabaly');
  const stat = csatorna(guild, 'statusz');
  const e = new EmbedBuilder()
    .setColor(SZIN)
    .setTitle(regi ? `👋 Üdv újra itthon, ${tag.user.username}!` : `🧟 Üdv a ${PREFIX_MD} közösségben!`)
    .setDescription(regi
      ? `${tag} visszatért! Visszakaptad a régi rangjaidat. 💪`
      : `Szia ${tag}! Örülünk, hogy itt vagy! 🎉\nTe vagy a(z) **${guild.memberCount}.** tagunk.`)
    .setThumbnail(tag.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '📜 Szabályzat', value: szab ? `Olvasd el: ${szab}` : 'Olvasd el a szabályzatot!', inline: true },
      { name: '🎮 Zombie szerver', value: `\`connect ${cim()}\``, inline: true },
      { name: '🟢 Ki van fent?', value: stat ? `${stat} vagy \`/szerver\`` : '`/szerver`', inline: true },
      { name: '🏷️ Rangod', value: adando.length ? adando.map((r) => r.toString()).join(' ') : '—' },
    )
    .setFooter({ text: PREFIX })
    .setTimestamp(new Date());
  await ch.send({ content: `${tag}`, embeds: [e] }).catch((er) => console.error('Üdvözlés hiba:', er.message));
}

// /setup után: a már bent lévők is megkapják az illő rangot (Játékos / Bot)
async function rangokPotlasa(guild) {
  if (!VAN_TAG_INTENT) {
    return 'A tagok rangjait nem tudtam pótolni: kapcsold be a "Server Members Intent"-et a fejlesztői oldalon.';
  }
  await guild.roles.fetch();
  const tagok = await guild.members.fetch();
  let db = 0;
  for (const tag of tagok.values()) {
    const r = illoRang(guild, tag);
    if (r && !tag.roles.cache.has(r.id)) {
      await tag.roles.add(r, '[SHADOW] setup').then(() => db++).catch(() => {});
    }
  }
  return `Rangok pótolva: ${db} tag kapta meg a Játékos / Bot rangot.`;
}

// discord.js régebbi verziója "ready", az újabb "clientReady" eseményt küld - mindkettőt figyeljük
let elindult = false;
// ---------------- tartalom frissítése a GitHubról ----------------
// A Patch Notes-ok, a szabályzat és a banner a GitHub repóból jönnek, így
// hosztingon (pl. bot-hosting.net) sem kell őket kézzel feltölteni.
const GITHUB_REPO = cfg.githubRepo || 'matebosscL17/shadow-zombie-bot';

async function letolt(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'shadow-zombie-bot' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function tartalomFrissites() {
  if (cfg.githubFrissites === false || typeof fetch !== 'function') return;
  const raw = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;
  let uj = 0;
  try {
    // Patch Notes mappa
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/patchnotes`, { headers: { 'User-Agent': 'shadow-zombie-bot' } });
    if (r.ok) {
      const lista = await r.json();
      fs.mkdirSync(PATCH_MAPPA, { recursive: true });
      for (const f of lista) {
        if (!f.name.endsWith('.md')) continue;
        const ut = path.join(PATCH_MAPPA, f.name);
        const tart = await letolt(`${raw}/patchnotes/${encodeURIComponent(f.name)}`);
        if (!fs.existsSync(ut) || !fs.readFileSync(ut).equals(tart)) { fs.writeFileSync(ut, tart); uj++; }
      }
    }
    // szabályzat és banner
    for (const [rel, ut] of [['szabalyzat.md', path.join(__dirname, 'szabalyzat.md')], ['kepek/shadow_banner.png', BANNER]]) {
      try {
        const tart = await letolt(`${raw}/${rel}`);
        fs.mkdirSync(path.dirname(ut), { recursive: true });
        if (!fs.existsSync(ut) || !fs.readFileSync(ut).equals(tart)) { fs.writeFileSync(ut, tart); uj++; }
      } catch (_) {}
    }
    console.log(`GitHub frissítés kész (${uj} új/változott fájl). Patch Notes: ${patchFajlok().join(', ') || 'nincs'}`);
    await patchAutoKuldes();
  } catch (e) {
    console.error('GitHub frissítés hiba:', e.message);
  }
}

// ---------------- Patch Notes automatikus kiküldése ----------------
// Ha a GitHubra új Patch Notes kerül (a szerver változásairól), a bot magától
// kiküldi a Patch Notes csatornába. A már kiküldötteket megjegyzi (adat.json).
async function patchAutoKuldes() {
  if (cfg.patchAuto === false) return;
  const guild = client.guilds.cache.get(cfg.guildId);
  if (!guild) return;
  const mind = patchFajlok().slice().sort(); // régebbitől az újabbig
  if (!Array.isArray(adat.patchIsmert)) {
    // első indulás ezzel a funkcióval: a meglévőket nem küldjük ki újra
    adat.patchIsmert = mind;
    mentes();
    console.log(`Patch Notes automatikus kiküldés BE. Már meglévő: ${mind.length} db (ezeket nem küldöm ki újra).`);
    return;
  }
  const ujak = mind.filter((f) => !adat.patchIsmert.includes(f));
  if (!ujak.length) return;
  const ch = csatorna(guild, 'patch');
  if (!ch) { console.error('Patch Notes: nincs meg a csatorna, nem tudom kiküldeni:', ujak.join(', ')); return; }
  for (const f of ujak) {
    const szoveg = patchSzoveg(f);
    if (!szoveg) continue;
    try {
      await patchKuldes(guild, szoveg);
      adat.patchIsmert.push(f);
      mentes();
      console.log(`Patch Notes automatikusan kiküldve: ${f}`);
    } catch (e) {
      console.error(`Patch Notes kiküldési hiba (${f}):`, e.message);
    }
  }
}

async function indulas() {
  if (elindult) return;
  elindult = true;
  console.log(`${PREFIX} bot elindult: ${client.user.tag}`);

  const guild = client.guilds.cache.get(cfg.guildId);
  if (!guild) {
    console.error('HIBA: a bot nincs bent a config.json-ban megadott szerveren (guildId).');
    console.error('  Ezeken a szervereken van bent:');
    client.guilds.cache.forEach((g) => console.error(`   - ${g.name}  ->  guildId: ${g.id}`));
    console.error('  Javítsd a guildId-t, vagy hívd meg a botot a szerverre.');
  }

  const rest = new REST({ version: '10' }).setToken(cfg.token);
  try {
    // minden szerverre, ahol a bot bent van (így rossz guildId esetén is megjelennek)
    const idk = new Set([...client.guilds.cache.keys()]);
    if (cfg.guildId) idk.add(cfg.guildId);
    for (const gid of idk) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, gid), { body: PARANCSOK })
        .then(() => console.log(`Parancsok regisztrálva: ${client.guilds.cache.get(gid)?.name || gid} (/szerver /jatekosok /ip /setup)`))
        .catch((e) => { if (gid === cfg.guildId) throw e; });
    }
  } catch (e) {
    console.error('HIBA a / parancsok regisztrálásánál:', e.message);
    if (e.code === 50001 || /Missing Access/i.test(e.message)) {
      console.error('  A bot meghívásakor nem volt bepipálva az "applications.commands" scope.');
      console.error('  Hívd meg újra ezzel a linkkel (nem kell kirúgni):');
      console.error(`  https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot%20applications.commands&permissions=8`);
    }
  }

  await guild?.channels.fetch().catch(() => {});
  await tartalomFrissites();
  setInterval(tartalomFrissites, 10 * 60 * 1000); // 10 percenként
  // tagok betöltése, hogy kilépéskor tudjuk a rangjaikat
  if (VAN_TAG_INTENT) {
    await guild?.members.fetch().catch(() => {});
    console.log('Server Members Intent: BE - az új tagokat üdvözlöm és rangot adok nekik.');
  } else {
    console.error('FIGYELEM: a "Server Members Intent" KI van kapcsolva, ezért a bot NEM látja az új tagokat!');
    console.error('  discord.com/developers -> a botod -> Bot -> Server Members Intent BE -> Save Changes, utána: pm2 restart shadowbot');
    const nap = guild && csatorna(guild, 'naplo');
    if (nap) nap.send('⚠️ **A bot nem látja az új tagokat**, ezért nem üdvözli őket és nem ad rangot.\nKapcsold be: **discord.com/developers → a botod → Bot → Server Members Intent → Save Changes**, utána Termuxban: `pm2 restart shadowbot`').catch(() => {});
  }
  statuszFrissit();
  setInterval(statuszFrissit, Math.max(30, cfg.statuszMasodperc || 60) * 1000);
  setInterval(naploLekeres, Math.max(10, cfg.naploMasodperc || 15) * 1000);
}
// a discord.js verziójának megfelelő nevet használja (ready / clientReady)
client.once(Events.ClientReady || 'ready', indulas);

process.on('unhandledRejection', (e) => console.error('Hiba:', e?.message || e));
// új szerverre meghívva is kapjon parancsokat
client.on('guildCreate', (g) => {
  new REST({ version: '10' }).setToken(cfg.token)
    .put(Routes.applicationGuildCommands(client.user.id, g.id), { body: PARANCSOK })
    .then(() => console.log(`Parancsok regisztrálva: ${g.name}`)).catch(() => {});
});

console.log(`${PREFIX} bot indul...`);
client.login(cfg.token).catch((e) => {
  const uz = String(e.message || e);
  if (/disallowed intents/i.test(uz)) {
    adat.nincsTagIntentIdo = Date.now(); mentes();
    console.error('HIBA: a fejlesztői oldalon nincs bekapcsolva a "Server Members Intent".');
    console.error('  Most nélküle indulok újra (az új tagok nem kapnak automatikusan rangot).');
    console.error('  Ha kell: discord.com/developers -> a bot -> Bot -> Server Members Intent BE, utána: pm2 restart shadowbot');
    setTimeout(() => process.exit(1), 1000); // a pm2 magától újraindítja
    return;
  }
  if (/token/i.test(uz)) {
    console.error('HIBA: rossz a bot tokenje a config.json-ban!');
    console.error('  discord.com/developers -> a bot -> Bot -> Reset Token, és az újat másold be.');
  } else {
    console.error('HIBA belépéskor:', uz);
  }
  setTimeout(() => process.exit(1), 30000);
});
