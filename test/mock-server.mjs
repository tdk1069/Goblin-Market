// A tiny stand-in for xi_search, speaking the same encrypted protocol, for testing the scraper offline.
import net from 'node:net';
import { md5, _internals } from '../scraper/proto.mjs';

const { bfInit, cryptRegion, le32, KEY_CONST } = _internals;

function decodeRequest(buf) {
  const L = buf.readUInt16LE(0);
  const t = Buffer.from(buf.subarray(0, L));
  const clientKey = t.readUInt32LE(L - 4);
  cryptRegion(t, L, bfInit(md5(Buffer.concat([KEY_CONST, le32(clientKey)]))), false);
  const keyPart = t.readUInt32LE(L - 0x18);
  return { t, L, clientKey, keyPart, type: t[0x0b] };
}

function sealReply(t, len, clientKey, keyPart) {
  md5(t.subarray(8, len - 0x14)).copy(t, len - 0x14);
  cryptRegion(t, len, bfInit(md5(Buffer.concat([KEY_CONST, le32(clientKey), le32(keyPart)]))), true);
  return t;
}

function listReplies(items, req, chunk = 3) {
  const out = [];
  for (let i = 0; i < Math.max(items.length, 1); i += chunk) {
    const part = items.slice(i, i + chunk);
    const len = 0x18 + 10 * part.length + 28;
    const t = Buffer.alloc(len);
    t.writeUInt16LE(len, 0);
    t.writeUInt32LE(0x46465849, 4);
    t[0x0b] = 0x95;
    t[0x0a] = i + chunk >= items.length ? 0x80 : 0;
    t.writeUInt16LE(items.length, 0x0e);
    part.forEach((it, j) => {
      t.writeUInt16LE(it.id, 0x18 + 10 * j);
      t.writeUInt32LE(it.single >>> 0, 0x18 + 10 * j + 2);
      t.writeUInt32LE(it.stack >>> 0, 0x18 + 10 * j + 6);
    });
    out.push(sealReply(t, len, req.clientKey, req.keyPart));
  }
  return out;
}

function historyReply(id, stock, entries, req) {
  const len = 0x20 + 40 * entries.length + 28;
  const t = Buffer.alloc(len);
  t.writeUInt16LE(len, 0);
  t.writeUInt32LE(0x46465849, 4);
  t[0x0b] = 0x85;
  t.writeUInt16LE(id, 0x18);
  t.writeUInt32LE(stock >>> 0, 0x1a);
  entries.forEach((e, i) => {
    const o = 0x20 + 40 * i;
    t.writeUInt32LE(e.price, o);
    t.writeUInt32LE(e.time, o + 4);
    t.write(e.seller, o + 8, 16, 'latin1');
    t.write(e.buyer, o + 0x18, 16, 'latin1');
  });
  return sealReply(t, len, req.clientKey, req.keyPart);
}

// world: { categories: { [catId]: [{id, single, stack}] }, history: { 'id:0|1': [{price,time,seller,buyer}] } }
export function startMock(world) {
  const hits = { list: 0, history: 0 };
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      if (buf.length < 2 || buf.length < buf.readUInt16LE(0)) return;
      const req = decodeRequest(buf);
      if (req.type === 0x15) {
        hits.list++;
        const cat = req.t[0x16];
        for (const p of listReplies(world.categories[cat] || [], req)) sock.write(p);
      } else if (req.type === 0x05 || req.type === 0x06) {
        hits.history++;
        const id = req.t.readUInt16LE(0x12);
        const stack = req.type === 0x06 ? 1 : 0;
        sock.write(historyReply(id, 0xffffffff, world.history[`${id}:${stack}`] || [], req));
      }
      sock.end();
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, hits })));
}
