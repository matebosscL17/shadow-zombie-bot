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

function csatorna(guild, kulcs) {
  const nev = setup.csatornaNev(kulcs);
  return guild.channels.cache.find((c) => c.name === nev && c.isTextBased());
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

function patchFajlok() {
  try {
    return fs.readdirSync(PATCH_MAPPA).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort().reverse();
  } catch (_) { return []; }
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
  const nyers = fs.readFileSync(path.join(__dirname, 'szabalyzat.md'), 'utf8').replace(/\r/g, '').split(PREFIX).join(PREFIX_MD);
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
      return it.respond([{ name: '⚠️ Nincs Patch Notes fájl a botnál – írd be Termuxban: git pull', value: '__nincs__' }]).catch(() => {});
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
        return it.reply({ content: '❌ A botnál nincs egy Patch Notes fájl sem (`patchnotes` mappa).\nTermuxban: `cd shadow-zombie-bot` → `git pull` → `pm2 restart shadowbot`\nVagy írj újat: `/patchnotes iras`', ephemeral: true });
      }
      const fajl = path.basename(it.options.getString('fajl') || lista[0]);
      const ut = path.join(PATCH_MAPPA, fajl + '.md');
      if (!fs.existsSync(ut)) return it.reply({ content: `❌ Nincs ilyen Patch Notes: **${fajl}**\nEzek vannak: ${lista.map((f) => '`' + f + '`').join(', ')}`, ephemeral: true });
      await it.deferReply({ ephemeral: true });
      const ch = await patchKuldes(it.guild, fs.readFileSync(ut, 'utf8'));
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
  const szab = guild.channels.cache.find((c) => c.name === setup.csatornaNev('szabaly'));
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
  } catch (e) {
    console.error('GitHub frissítés hiba:', e.message);
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
  setInterval(tartalomFrissites, 30 * 60 * 1000); // félóránként
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
