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
  ActivityType,
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
const PREFIX = '[~*| SHADOW |*~]';
const SZIN = 0xb00000;

let adat = {};
try { adat = JSON.parse(fs.readFileSync(ADAT_UT, 'utf8')); } catch (_) {}
const mentes = () => fs.writeFileSync(ADAT_UT, JSON.stringify(adat, null, 2));

const intents = [GatewayIntentBits.Guilds];
if (cfg.ujTagJatekosRang) intents.push(GatewayIntentBits.GuildMembers);
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
].map((c) => c.toJSON());

client.on('interactionCreate', async (it) => {
  if (!it.isChatInputCommand()) return;
  try {
    if (it.commandName === 'ip') {
      return it.reply(`🌐 **${PREFIX}** zombi szerver: \`connect ${cim()}\`\nMásold be a CS konzolba (~ gomb)!`);
    }

    if (it.commandName === 'szerver' || it.commandName === 'jatekosok') {
      await it.deferReply();
      const s = await lekerdez();
      return it.editReply({ embeds: [statuszEmbed(s)] });
    }

    if (it.commandName === 'setup') {
      if (it.user.id !== it.guild.ownerId) {
        return it.reply({ content: '❌ Ezt csak a Discord szerver tulajdonosa használhatja.', ephemeral: true });
      }
      await it.deferReply({ ephemeral: true });
      const sorok = [];
      const naplo = (s) => { sorok.push('• ' + s); };
      await setup.felepit(it.guild, naplo);
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

// új tag: Játékos rang + üdvözlés
client.on('guildMemberAdd', async (tag) => {
  if (!cfg.ujTagJatekosRang || tag.guild.id !== cfg.guildId || tag.user.bot) return;
  const r = tag.guild.roles.cache.find((x) => x.name === '🧟 Játékos');
  if (r) await tag.roles.add(r).catch(() => {});
  const ch = csatorna(tag.guild, 'udvozles');
  if (ch) {
    ch.send(`👋 Üdv a **${PREFIX}** közösségben, ${tag}! 🧟\nA zombi szerver címe: \`connect ${cim()}\``).catch(() => {});
  }
});

client.once('ready', async () => {
  console.log(`${PREFIX} bot elindult: ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(cfg.token);
    await rest.put(Routes.applicationGuildCommands(client.user.id, cfg.guildId), { body: PARANCSOK });
    console.log('Parancsok regisztrálva.');
  } catch (e) {
    console.error('Parancs regisztráció hiba:', e.message);
  }

  await client.guilds.cache.get(cfg.guildId)?.channels.fetch().catch(() => {});
  statuszFrissit();
  setInterval(statuszFrissit, Math.max(30, cfg.statuszMasodperc || 60) * 1000);
  setInterval(naploLekeres, Math.max(10, cfg.naploMasodperc || 15) * 1000);
});

process.on('unhandledRejection', (e) => console.error('Hiba:', e?.message || e));
client.login(cfg.token);
