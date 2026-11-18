// [~*| SHADOW |*~] Discord szerver felépítése: rangok, kategóriák, csatornák, jogok.
// Többször is futtatható: ami már megvan (ugyanazzal a névvel), azt nem hozza létre
// újra, csak a jogait állítja be. Semmit NEM töröl.
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');

// ---------------- RANGOK (fentről lefelé) ----------------
const RANGOK = [
  {
    kulcs: 'tulaj', nev: '👑 Tulajdonos', szin: 0xff0000, kulon: true,
    jogok: [P.Administrator],
  },
  {
    kulcs: 'foadmin', nev: '🔱 Főadmin', szin: 0xff7a00, kulon: true,
    jogok: [P.ViewAuditLog, P.ManageMessages, P.ManageThreads, P.KickMembers, P.BanMembers,
      P.ModerateMembers, P.ManageNicknames, P.MuteMembers, P.DeafenMembers, P.MoveMembers,
      P.MentionEveryone],
  },
  {
    kulcs: 'admin', nev: '🛡️ Admin', szin: 0xffd000, kulon: true,
    jogok: [P.ViewAuditLog, P.ManageMessages, P.ManageThreads, P.KickMembers, P.ModerateMembers,
      P.ManageNicknames, P.MuteMembers, P.MoveMembers],
  },
  {
    kulcs: 'moderator', nev: '⚔️ Moderátor', szin: 0x00c8ff, kulon: true,
    jogok: [P.ManageMessages, P.ModerateMembers, P.MuteMembers],
  },
  {
    kulcs: 'vip', nev: '💎 VIP', szin: 0xb44cff, kulon: true,
    jogok: [],
  },
  {
    kulcs: 'bot', nev: '🤖 Bot', szin: 0x7289da, kulon: true,
    jogok: [],
  },
  {
    kulcs: 'jatekos', nev: '🧟 Játékos', szin: 0x43b581, kulon: false,
    jogok: [],
  },
  {
    kulcs: 'nemitott', nev: '🔇 Némított', szin: 0x555555, kulon: false,
    jogok: [],
  },
];

const STAFF = ['tulaj', 'foadmin', 'admin', 'moderator'];
const IRHAT_INFOBA = ['tulaj', 'foadmin', 'admin'];

// ---------------- CSATORNÁK ----------------
// mod: nyilvanos | csakolvas | staff | staffolvas | vip
const T = ChannelType.GuildText;
const V = ChannelType.GuildVoice;
const KATEGORIAK = [
  {
    nev: '╔═══『 📢 INFORMÁCIÓ 』═══╗', regi: '📢 INFORMÁCIÓ', mod: 'nyilvanos', csatornak: [
      { nev: '┃📜・szabályzat', regi: '📜•szabályzat', tipus: T, mod: 'csakolvas', tema: 'A szerver szabályai. Kérlek olvasd el!', kulcs: 'szabaly' },
      { nev: '┃📣・hírek', regi: '📣•hírek', tipus: T, mod: 'csakolvas', tema: 'Hírek és bejelentések a [~*| SHADOW |*~] szerverről.' },
      { nev: '┃🛠️・patch-notes', regi: ['┃🔄・changelog', '🔄•changelog'], tipus: T, mod: 'csakolvas', tema: 'A CS 1.6 zombie szerver frissítései: új fegyverek, módok, javítások.', kulcs: 'patch' },
      { nev: '┃🟢・szerver-státusz', regi: '🟢•szerver-státusz', tipus: T, mod: 'csakolvas', tema: 'A zombi szerver élő állapota (a bot frissíti).', kulcs: 'statusz' },
      { nev: '┃👋・üdvözlés', regi: '👋•üdvözlés', tipus: T, mod: 'csakolvas', tema: 'Itt köszöntjük az új tagokat.', kulcs: 'udvozles' },
    ],
  },
  {
    nev: '╔═══『 💬 KÖZÖSSÉG 』═══╗', regi: '💬 KÖZÖSSÉG', mod: 'nyilvanos', csatornak: [
      { nev: '┃💬・általános', regi: '💬•általános', tipus: T, mod: 'nyilvanos', tema: 'Beszélgetés mindenről.' },
      { nev: '┃📸・képek-videók', regi: '📸•képek-videók', tipus: T, mod: 'nyilvanos', tema: 'Képek, klipek a szerverről.' },
      { nev: '┃🤖・bot-parancsok', regi: '🤖•bot-parancsok', tipus: T, mod: 'nyilvanos', tema: '/szerver, /jatekosok, /ip' },
      { nev: '┃💡・ötletek', regi: '💡•ötletek', tipus: T, mod: 'nyilvanos', tema: 'Mit tegyünk még a szerverre?' },
    ],
  },
  {
    nev: '╔═══『 🧟 ZOMBI SZERVER 』═══╗', regi: '🧟 ZOMBI SZERVER', mod: 'nyilvanos', csatornak: [
      { nev: '┃🧟・zombi-chat', regi: '🧟•zombi-chat', tipus: T, mod: 'nyilvanos', tema: 'Minden a zombi szerverről.' },
      { nev: '┃🏆・eredmények', regi: '🏆•eredmények', tipus: T, mod: 'nyilvanos', tema: 'Rekordok, Boss győzelmek, jó körök.' },
      { nev: '┃🐛・hibajelentés', regi: '🐛•hibajelentés', tipus: T, mod: 'nyilvanos', tema: 'Írd le, mi nem működik a szerveren.' },
      { nev: '┃💎・vip-társalgó', regi: '💎•vip-társalgó', tipus: T, mod: 'vip', tema: 'Csak VIP-eknek.' },
    ],
  },
  {
    nev: '╔═══『 🔊 HANGCSATORNÁK 』═══╗', regi: '🔊 HANGCSATORNÁK', mod: 'nyilvanos', csatornak: [
      { nev: '🔊 ┃ Társalgó', regi: '🔊 • Társalgó', tipus: V, mod: 'nyilvanos' },
      { nev: '🎮 ┃ Játék 1', regi: '🎮 • Játék 1', tipus: V, mod: 'nyilvanos' },
      { nev: '🎮 ┃ Játék 2', regi: '🎮 • Játék 2', tipus: V, mod: 'nyilvanos' },
      { nev: '💎 ┃ VIP hang', regi: '💎 • VIP hang', tipus: V, mod: 'vip' },
    ],
  },
  {
    nev: '╔═══『 🛡️ STAFF 』═══╗', regi: '🛡️ STAFF', mod: 'staff', csatornak: [
      { nev: '┃🛡️・staff-chat', regi: '🛡️•staff-chat', tipus: T, mod: 'staff', tema: 'Csak a csapatnak.' },
      { nev: '┃📋・szerver-napló', regi: '📋•szerver-napló', tipus: T, mod: 'staffolvas', tema: 'Kitiltások, némítások, rangok, Boss, pályaváltás (a bot írja).', kulcs: 'naplo' },
      { nev: '┃🔨・büntetések', regi: '🔨•büntetések', tipus: T, mod: 'staff', tema: 'Büntetések megbeszélése.' },
      { nev: '🔊 ┃ Staff hang', regi: '🔊 • Staff hang', tipus: V, mod: 'staff' },
    ],
  },
];

function jogLista(guild, rangok, botId, mod, tipus) {
  const ev = guild.roles.everyone.id;
  const lista = [];
  const hang = tipus === V;
  const latas = hang ? [P.ViewChannel, P.Connect] : [P.ViewChannel];

  // a bot mindent lásson és írhasson
  lista.push({ id: botId, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ManageMessages, P.Connect] });

  // némított: sehol se írhasson / beszélhessen
  lista.push({
    id: rangok.nemitott.id,
    deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.AddReactions, P.Speak],
  });

  if (mod === 'csakolvas' || mod === 'staffolvas') {
    lista.push({ id: ev, deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] });
  }
  if (mod === 'csakolvas') {
    for (const k of IRHAT_INFOBA) lista.push({ id: rangok[k].id, allow: [P.SendMessages, P.AddReactions] });
  }
  if (mod === 'staff' || mod === 'staffolvas') {
    lista.push({ id: ev, deny: latas.concat(mod === 'staffolvas' ? [P.SendMessages] : []) });
    for (const k of STAFF) lista.push({ id: rangok[k].id, allow: latas });
  }
  if (mod === 'vip') {
    lista.push({ id: ev, deny: latas });
    for (const k of ['vip', ...STAFF]) lista.push({ id: rangok[k].id, allow: latas });
  }

  // azonos id-k összevonása (különben a Discord hibát ad)
  const egy = new Map();
  for (const o of lista) {
    const r = egy.get(o.id) || { id: o.id, allow: [], deny: [] };
    r.allow.push(...(o.allow || []));
    r.deny.push(...(o.deny || []));
    egy.set(o.id, r);
  }
  return [...egy.values()];
}

async function felepit(guild, naplo = () => {}) {
  const me = guild.members.me;
  if (!me.permissions.has(P.Administrator)) {
    throw new Error('A botnak "Adminisztrátor" jog kell a szerver felépítéséhez (a meghívó linkben pipáld be).');
  }

  await guild.roles.fetch();
  await guild.channels.fetch();

  // ---- rangok ----
  const rangok = {};
  let ujRang = 0;
  for (const r of RANGOK) {
    let role = guild.roles.cache.find((x) => x.name === r.nev);
    if (!role) {
      role = await guild.roles.create({
        name: r.nev, color: r.szin, hoist: r.kulon, permissions: r.jogok,
        mentionable: false, reason: '[SHADOW] szerver felépítés',
      });
      ujRang++;
    } else {
      await role.edit({ color: r.szin, hoist: r.kulon, permissions: r.jogok, reason: '[SHADOW] jogok frissítése' })
        .catch((e) => naplo(`A(z) ${r.nev} rangot nem tudtam frissíteni (a bot rangja alatt kell lennie): ${e.message}`));
    }
    rangok[r.kulcs] = role;
  }
  naplo(`Rangok kész (${ujRang} új).`);

  // sorrend: a bot saját rangja alá, a lista szerint
  try {
    const teteje = me.roles.highest.position;
    const sor = RANGOK.map((r, i) => ({ role: rangok[r.kulcs].id, position: Math.max(1, teteje - 1 - i) }));
    await guild.roles.setPositions(sor);
  } catch (e) {
    naplo('A rangok sorrendjét nem tudtam beállítani (húzd a bot rangját legfelülre): ' + e.message);
  }

  // ---- kategóriák, csatornák ----
  let ujCsat = 0;
  const kulcsok = {};
  for (const [ki, kat] of KATEGORIAK.entries()) {
    let k = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && [kat.nev].concat(kat.regi || []).includes(c.name));
    if (k && k.name !== kat.nev) await k.setName(kat.nev).catch(() => {});
    const kJog = jogLista(guild, rangok, me.id, kat.mod, T);
    if (!k) {
      k = await guild.channels.create({ name: kat.nev, type: ChannelType.GuildCategory, permissionOverwrites: kJog, position: ki });
      ujCsat++;
    } else {
      await k.permissionOverwrites.set(kJog);
    }

    for (const cs of kat.csatornak) {
      const nevek = [cs.nev].concat(cs.regi || []);
      let c = guild.channels.cache.find((x) => x.parentId === k.id && nevek.includes(x.name))
        || guild.channels.cache.find((x) => x.type === cs.tipus && nevek.includes(x.name));
      if (c && c.name !== cs.nev) await c.setName(cs.nev).catch(() => {});
      const jog = jogLista(guild, rangok, me.id, cs.mod, cs.tipus);
      if (!c) {
        c = await guild.channels.create({
          name: cs.nev, type: cs.tipus, parent: k.id, permissionOverwrites: jog,
          topic: cs.tipus === T ? cs.tema : undefined,
        });
        ujCsat++;
      } else {
        if (c.parentId !== k.id) await c.setParent(k.id, { lockPermissions: false });
        await c.permissionOverwrites.set(jog);
        if (cs.tipus === T && cs.tema && c.topic !== cs.tema) await c.setTopic(cs.tema).catch(() => {});
      }
      if (cs.kulcs) kulcsok[cs.kulcs] = c.id;
    }
  }
  naplo(`Csatornák kész (${ujCsat} új).`);

  return { rangok, kulcsok };
}

// Csatorna keresése név alapján (a bot ezt használja a státuszhoz / naplóhoz)
function csatornaNev(kulcs) {
  for (const kat of KATEGORIAK) for (const cs of kat.csatornak) if (cs.kulcs === kulcs) return cs.nev;
  return null;
}

module.exports = { felepit, csatornaNev, RANGOK, KATEGORIAK };
