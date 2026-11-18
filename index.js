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
  ActivityType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits,
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
const intents = [GatewayIntentBits.Guilds];
if (cfg.ujTagJatekosRang && !adat.nincsTagIntent) intents.push(GatewayIntentBits.GuildMembers);
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

function statuszEmbed(s) {
  const e = new EmbedBuilder()
    .setTitle(`${PREFIX} Zombi szerver`)
    .setColor(s.online ? 0x2ecc71 : 0xe74c3c)
    .setTimestamp(new Date())
    .setFooter({ text: 'Frissítve' });

  if (!s.online) {
    e.setDescription('🔴 **A szerver most nem elérhető.**\nPár perc múlva újra megnézem.');
    e.addFields({ name: '🌐 IP', value: `\`connect ${cim()}\`` });
    return e;
  }

  const emberek = s.jatekos - (s.botok || 0);
  e.setDescription(`🟢 **Online** — ${s.nev}`);
  e.addFields(
    { name: '🗺️ Pálya', value: `\`${s.palya}\``, inline: true },
    { name: '👥 Játékosok', value: `**${emberek}/${s.max}**`, inline: true },
    { name: '🌐 IP', value: `\`connect ${cim()}\``, inline: true },
  );

  if (s.lista.length) {
    const sorok = s.lista.slice(0, 20).map((p, n) =>
      `${String(n + 1).padStart(2)}. ${p.nev.slice(0, 22).padEnd(22)} ${String(p.pont).padStart(4)}  ${idoSzoveg(p.ido)}`);
    let szoveg = sorok.join('\n');
    if (s.lista.length > 20) szoveg += `\n... és még ${s.lista.length - 20} játékos`;
    e.addFields({ name: '🧟 Fent vannak (név / pont / idő)', value: '```' + szoveg + '```' });
  } else {
    e.addFields({ name: '🧟 Fent vannak', value: 'Most senki sincs fent. Gyere, legyél az első! 🧟' });
  }
  return e;
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
  try {
    if (adat.statuszUzenet) {
      const m = await ch.messages.fetch(adat.statuszUzenet).catch(() => null);
      if (m) { await m.edit({ embeds: [embed] }); return; }
    }
    const m = await ch.send({ embeds: [embed] });
    adat.statuszUzenet = m.id;
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
      .addStringOption((o) => o.setName('fajl').setDescription('Melyik Patch Notes (dátum)').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sc) => sc.setName('iras').setDescription('Új Patch Notes írása itt a Discordon')),
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

// a Discord egy üzenetben max 2000 karaktert enged: szakaszonként (## ) daraboljuk
function darabol(szoveg) {
  const sorok = szoveg.replace(/\r/g, '').split('\n');
  const darabok = [];
  let akt = '';
  for (const sor of sorok) {
    const uj = akt ? akt + '\n' + sor : sor;
    if (uj.length > 1900 || (sor.startsWith('## ') && akt.length > 1200)) {
      if (akt.trim()) darabok.push(akt);
      akt = sor;
    } else akt = uj;
  }
  if (akt.trim()) darabok.push(akt);
  return darabok;
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
    return it.respond(patchFajlok().filter((f) => f.toLowerCase().includes(keres)).slice(0, 25)
      .map((f) => ({ name: f, value: f }))).catch(() => {});
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
      return it.reply(`🌐 **${PREFIX}** zombi szerver: \`connect ${cim()}\`\nMásold be a CS konzolba (~ gomb)!`);
    }

    if (it.commandName === 'szerver' || it.commandName === 'jatekosok') {
      await it.deferReply();
      const s = await lekerdez();
      return it.editReply({ embeds: [statuszEmbed(s)] });
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
      const fajl = path.basename(it.options.getString('fajl'));
      const ut = path.join(PATCH_MAPPA, fajl + '.md');
      if (!fs.existsSync(ut)) return it.reply({ content: `❌ Nincs ilyen Patch Notes: ${fajl}`, ephemeral: true });
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

client.on('guildMemberAdd', async (tag) => {
  if (tag.guild.id !== cfg.guildId) return;
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
    await tag.roles.add(adando, '[SHADOW] belépési rang').catch((e) => console.error('Rangadás hiba:', e.message));
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
    .setTitle(regi ? `👋 Üdv újra itthon, ${tag.user.username}!` : `🧟 Üdv a ${PREFIX} közösségben!`)
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
  ch.send({ content: `${tag}`, embeds: [e] }).catch(() => {});
});

// /setup után: a már bent lévők is megkapják az illő rangot (Játékos / Bot)
async function rangokPotlasa(guild) {
  if (!intents.includes(GatewayIntentBits.GuildMembers)) {
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
  // tagok betöltése, hogy kilépéskor tudjuk a rangjaikat
  if (intents.includes(GatewayIntentBits.GuildMembers)) await guild?.members.fetch().catch(() => {});
  statuszFrissit();
  setInterval(statuszFrissit, Math.max(30, cfg.statuszMasodperc || 60) * 1000);
  setInterval(naploLekeres, Math.max(10, cfg.naploMasodperc || 15) * 1000);
}
client.once('ready', indulas);
client.once('clientReady', indulas);

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
    adat.nincsTagIntent = true; mentes();
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
