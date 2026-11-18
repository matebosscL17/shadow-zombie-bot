// [~*| SHADOW |*~] CS 1.6 szerver lekérdezés (A2S) és RCON - külső csomag nélkül
const dgram = require('dgram');

const FF = Buffer.from([0xff, 0xff, 0xff, 0xff]);

// Egy UDP kérés. A "valaszFigyelo" minden bejövő csomagot megkap;
// ha true-t ad vissza, a kérés kész. collectMs > 0 esetén az első válasz
// után még ennyi ideig gyűjti a csomagokat (RCON-nál több darabban jöhet).
function udp(host, port, kuldes, { timeout = 3000, collectMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const csomagok = [];
    let vege = false;
    let gyujtoTimer = null;

    const befejez = (hiba) => {
      if (vege) return;
      vege = true;
      clearTimeout(timer);
      clearTimeout(gyujtoTimer);
      try { sock.close(); } catch (_) {}
      if (hiba) reject(hiba); else resolve(csomagok);
    };

    const timer = setTimeout(() => {
      if (csomagok.length) befejez();
      else befejez(new Error('Nem válaszol a szerver (időtúllépés)'));
    }, timeout);

    const ctx = {
      kuld: (buf) => sock.send(buf, port, host),
    };

    sock.on('error', (e) => befejez(e));
    sock.on('message', (msg) => {
      const res = kuldes.uzenet(msg, ctx);
      if (res === 'kesz') {
        csomagok.push(msg);
        if (collectMs > 0) {
          clearTimeout(gyujtoTimer);
          gyujtoTimer = setTimeout(() => befejez(), collectMs);
        } else befejez();
      }
    });

    ctx.kuld(kuldes.elso);
  });
}

class Olvaso {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; }
  byte() { return this.b.readUInt8(this.p++); }
  short() { const v = this.b.readInt16LE(this.p); this.p += 2; return v; }
  long() { const v = this.b.readInt32LE(this.p); this.p += 4; return v; }
  float() { const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  str() {
    let e = this.b.indexOf(0, this.p);
    if (e < 0) e = this.b.length;
    const s = this.b.toString('utf8', this.p, e);
    this.p = e + 1;
    return s;
  }
}

// ---------------- A2S_INFO ----------------
async function info(host, port) {
  const keres = Buffer.concat([FF, Buffer.from('TSource Engine Query\0', 'latin1')]);
  const valasz = await udp(host, port, {
    elso: keres,
    uzenet: (msg, ctx) => {
      if (msg.length < 5) return;
      const tipus = msg[4];
      if (tipus === 0x41) { // challenge
        ctx.kuld(Buffer.concat([keres, msg.subarray(5, 9)]));
        return;
      }
      if (tipus === 0x49 || tipus === 0x6d) return 'kesz';
    },
  });

  const msg = valasz[0];
  const r = new Olvaso(msg, 5);
  if (msg[4] === 0x6d) { // régi GoldSrc formátum
    r.str(); // cím
    const nev = r.str(), palya = r.str(); r.str(); r.str();
    const jatekos = r.byte(), max = r.byte();
    return { nev, palya, jatekos, max, botok: 0 };
  }
  r.byte(); // protokoll
  const nev = r.str(), palya = r.str(); r.str(); r.str();
  r.short(); // app id
  const jatekos = r.byte(), max = r.byte(), botok = r.byte();
  return { nev, palya, jatekos, max, botok };
}

// ---------------- A2S_PLAYER ----------------
async function jatekosok(host, port) {
  const alap = Buffer.concat([FF, Buffer.from([0x55])]);
  const valasz = await udp(host, port, {
    elso: Buffer.concat([alap, FF]),
    uzenet: (msg, ctx) => {
      if (msg.length < 5) return;
      if (msg[4] === 0x41) { ctx.kuld(Buffer.concat([alap, msg.subarray(5, 9)])); return; }
      if (msg[4] === 0x44) return 'kesz';
    },
  });

  const r = new Olvaso(valasz[0], 5);
  const db = r.byte();
  const lista = [];
  for (let i = 0; i < db; i++) {
    try {
      r.byte();
      const nev = r.str();
      const pont = r.long();
      const ido = r.float();
      if (nev) lista.push({ nev, pont, ido });
    } catch (_) { break; }
  }
  lista.sort((a, b) => b.pont - a.pont);
  return lista;
}

// ---------------- RCON (GoldSrc) ----------------
class RconHiba extends Error {}

async function rcon(host, port, jelszo, parancs) {
  let challenge = null;
  const csomagok = await udp(host, port, {
    elso: Buffer.concat([FF, Buffer.from('challenge rcon\n', 'latin1')]),
    uzenet: (msg, ctx) => {
      const s = msg.toString('utf8', 4);
      if (challenge === null && s.startsWith('challenge rcon')) {
        challenge = s.trim().split(/\s+/)[2];
        ctx.kuld(Buffer.concat([FF, Buffer.from(`rcon ${challenge} "${jelszo}" ${parancs}\n`, 'utf8')]));
        return;
      }
      if (challenge !== null && msg[4] === 0x6c) return 'kesz'; // 'l'
    },
  }, { timeout: 4000, collectMs: 700 });

  const szoveg = csomagok
    .map((m) => m.toString('utf8', 5).replace(/\0+$/, ''))
    .join('');
  if (/Bad rcon_password/i.test(szoveg)) throw new RconHiba('Rossz RCON jelszó');
  if (/You have been banned/i.test(szoveg)) throw new RconHiba('A szerver kitiltotta a bot IP-jét RCON-ról');
  return szoveg;
}

module.exports = { info, jatekosok, rcon, RconHiba };
