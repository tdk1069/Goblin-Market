// Port of LuvlyAH's searchclient.lua: the LandSandBoat xi_search protocol.
// Framing, MD5 and the FFXI Blowfish variant follow src/search/ in the server source.
import { createHash } from 'node:crypto';
import net from 'node:net';
import { BF_INIT_HEX } from './bf-init.mjs';

export const TYPE_AH_LIST = 0x15;
export const TYPE_HIST_ONE = 0x05;
export const TYPE_HIST_STK = 0x06;

const KEY_CONST = Buffer.from('30733D6D3C31495A327A424363387B7E', 'hex');

export const md5 = (buf) => createHash('md5').update(buf).digest();

const le32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
};

/* ---------------------------- Blowfish (FFXI) ---------------------------- */

const INIT_WORDS = (() => {
  const b = Buffer.from(BF_INIT_HEX, 'hex');
  const w = new Int32Array(1042);
  for (let i = 0; i < 1042; i++) w[i] = b.readInt32LE(i * 4);
  return w;
})();

function bfInit(key) {
  const P = new Int32Array(18);
  const S = new Int32Array(1024);
  for (let i = 0; i < 18; i++) P[i] = INIT_WORDS[i];
  for (let i = 0; i < 1024; i++) S[i] = INIT_WORDS[18 + i];

  // The server reads the key as signed chars and ORs them in sign-extended; keep that quirk.
  const T = (w) => {
    const a = (S[256 + ((w >>> 8) & 0xff)] & 1) ^ 32;
    const b = (S[768 + (w >>> 24)] & 1) ^ 32;
    return (a + b + S[512 + ((w >>> 16) & 0xff)] + S[w & 0xff]) | 0;
  };
  const enc = (xl, xr) => {
    for (let i = 0; i < 16; i++) {
      xl ^= P[i];
      xr = T(xl) ^ xr;
      const t = xl; xl = xr; xr = t;
    }
    { const t = xl; xl = xr; xr = t; }
    xr ^= P[16];
    xl ^= P[17];
    return [xl, xr];
  };
  const dec = (xl, xr) => {
    for (let i = 17; i >= 2; i--) {
      xl ^= P[i];
      xr = T(xl) ^ xr;
      const t = xl; xl = xr; xr = t;
    }
    { const t = xl; xl = xr; xr = t; }
    xr ^= P[1];
    xl ^= P[0];
    return [xl, xr];
  };

  let j = 0;
  for (let i = 0; i < 18; i++) {
    let data = 0;
    for (let k = 0; k < 4; k++) {
      const kb = (key[j] << 24) >> 24; // signed char
      data = (data << 8) | kb;
      j = (j + 1) % key.length;
    }
    P[i] ^= data;
  }
  let dl = 0, dr = 0;
  for (let i = 0; i < 18; i += 2) {
    [dl, dr] = enc(dl, dr);
    P[i] = dl; P[i + 1] = dr;
  }
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 256; k += 2) {
      [dl, dr] = enc(dl, dr);
      S[i * 256 + k] = dl; S[i * 256 + k + 1] = dr;
    }
  }
  return { enc, dec };
}

function cryptRegion(buf, len, bf, encrypt) {
  let tmp = Math.floor((len - 12) / 4);
  tmp -= tmp % 2;
  for (let i = 0; i < tmp; i += 2) {
    const o1 = (i + 2) * 4, o2 = (i + 3) * 4;
    let xl = buf.readInt32LE(o1), xr = buf.readInt32LE(o2);
    [xl, xr] = encrypt ? bf.enc(xl, xr) : bf.dec(xl, xr);
    buf.writeInt32LE(xl, o1);
    buf.writeInt32LE(xr, o2);
  }
}

/* ------------------------- Packet build / parse -------------------------- */

function buildRequest(L, ptype, fill, clientKey, keyPart) {
  const t = Buffer.alloc(L);
  t.writeUInt16LE(L, 0);
  t.writeUInt32LE(0x46465849, 4); // 'IXFF'
  t[0x0b] = ptype;
  fill(t);
  t.writeUInt32LE(keyPart >>> 0, L - 0x18);
  md5(t.subarray(8, L - 0x14)).copy(t, L - 0x14);
  const bf = bfInit(md5(Buffer.concat([KEY_CONST, le32(clientKey)])));
  cryptRegion(t, L, bf, true);
  t.writeUInt32LE(clientKey >>> 0, L - 4);
  return t;
}

export function reqList(category, params, clientKey, keyPart) {
  params = params || [];
  const n = params.length;
  const L = 0x34 + 8 * n;
  return buildRequest(L, TYPE_AH_LIST, (t) => {
    t[0x12] = n;
    t[0x16] = category;
    params.forEach((p, i) => {
      let bits = (p.value || 0) * 4;
      if (p.hasValue) bits += 1;
      if (p.descending) bits += 2;
      t.writeUInt32LE(p.type >>> 0, 0x18 + 8 * i);
      t.writeUInt32LE(bits >>> 0, 0x1c + 8 * i);
    });
  }, clientKey, keyPart);
}

export function reqHistory(itemId, stack, clientKey, keyPart) {
  return buildRequest(0x3c, stack ? TYPE_HIST_STK : TYPE_HIST_ONE, (t) => {
    t.writeUInt16LE(itemId, 0x12);
    t[0x15] = stack ? 1 : 0;
  }, clientKey, keyPart);
}

const cstring = (buf, o, n) => {
  let e = o;
  while (e < o + n && buf[e] !== 0) e++;
  return buf.toString('latin1', o, e);
};

export function openReply(pkt, clientKey, keyPart) {
  const len = pkt.length;
  const t = Buffer.from(pkt);
  const bf = bfInit(md5(Buffer.concat([KEY_CONST, le32(clientKey), le32(keyPart)])));
  cryptRegion(t, len, bf, false);
  const want = t.subarray(len - 0x14, len - 0x14 + 16);
  const got = md5(t.subarray(8, len - 0x14));
  if (!want.equals(got)) return { err: 'reply hash mismatch' };
  return { t, len };
}

// Returns true when the reply is complete.
export function parseReply(t, len, acc) {
  const ptype = t[0x0b];
  if (ptype === 0x95) {
    acc.kind = 'list';
    acc.total = t.readUInt16LE(0x0e);
    acc.items = acc.items || [];
    const n = Math.floor((len - 0x18 - 28) / 10);
    for (let i = 0; i < n; i++) {
      const o = 0x18 + 10 * i;
      acc.items.push({ id: t.readUInt16LE(o), single: t.readUInt32LE(o + 2), stack: t.readUInt32LE(o + 6) });
    }
    return t[0x0a] === 0x80 || acc.items.length >= acc.total;
  }
  if (ptype === 0x85) {
    acc.kind = 'history';
    acc.id = t.readUInt16LE(0x18);
    acc.stock = t.readUInt32LE(0x1a);
    acc.category = t.readUInt16LE(0x1e);
    acc.entries = [];
    const n = Math.floor((len - 0x20 - 28) / 40);
    for (let i = 0; i < n; i++) {
      const o = 0x20 + 40 * i;
      acc.entries.push({
        price: t.readUInt32LE(o),
        time: t.readUInt32LE(o + 4),
        seller: cstring(t, o + 8, 16),
        buyer: cstring(t, o + 0x18, 16),
      });
    }
    return true;
  }
  return true; // unknown type: stop
}

/* ------------------------------- Networking ------------------------------ */

const rnd32 = () => (Math.floor(Math.random() * 65536) * 65536 + Math.floor(Math.random() * 65536)) >>> 0;

// Sends one request on a fresh connection (that is how the game client does it) and resolves with the parsed reply.
function exchange({ host, port, data, clientKey, keyPart, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    const acc = {};
    let buf = Buffer.alloc(0);
    let settled = false;
    const done = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve(val);
    };
    const timer = setTimeout(() => done(new Error('timed out')), timeoutMs);
    sock.on('connect', () => sock.write(data));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const len = buf.readUInt16LE(0);
        if (len < 28 || len > 4096) return done(new Error('bad reply length ' + len));
        if (buf.length < len) break;
        const pkt = buf.subarray(0, len);
        buf = buf.subarray(len);
        const r = openReply(pkt, clientKey, keyPart);
        if (r.err) return done(new Error(r.err));
        if (parseReply(r.t, r.len, acc)) return done(null, acc);
      }
    });
    sock.on('error', (e) => done(new Error('connect/receive failed: ' + e.message)));
    sock.on('close', () => (acc.kind ? done(null, acc) : done(new Error('server closed the connection'))));
  });
}

export function fetchList(host, port, category, params) {
  const clientKey = rnd32(), keyPart = rnd32();
  return exchange({ host, port, clientKey, keyPart, data: reqList(category, params, clientKey, keyPart) });
}

export function fetchHistory(host, port, itemId, stack) {
  const clientKey = rnd32(), keyPart = rnd32();
  return exchange({ host, port, clientKey, keyPart, data: reqHistory(itemId, stack, clientKey, keyPart) });
}

// The search service reports 0xFFFFFFFF when there are none of something.
export const count = (v) => {
  v = Number(v) || 0;
  return v < 0 || v >= 0x7fffffff ? 0 : v;
};

// Exposed for tests (the mock server needs the server side of the same crypto).
export const _internals = { bfInit, cryptRegion, le32, KEY_CONST };
