// Checks the protocol port against the known-good vectors in the addon's selftest
// (those were produced by the real server code).
import assert from 'node:assert/strict';
import { md5, reqHistory, openReply, parseReply } from '../scraper/proto.mjs';

const unhex = (h) => Buffer.from(h, 'hex');

assert.equal(md5(Buffer.from('abc')).toString('hex'), '900150983cd24fb0d6963f7d28e17f72');
console.log('ok md5("abc")');

const req = reqHistory(4096, false, 0x11223344, 0xa1b2c3d4);
assert.equal(
  req.toString('hex'),
  '3c0000004958464653b7b822f86f745160222e45866c031379ec70504f73042268bc52a1600fae1e7f8ce89122f8157cf2cab8195daf64c444332211',
);
console.log('ok request encryption');

const rep = unhex(
  '520000004958464645910b5fefd3d1feeffd5017431bfa742eccaf73e583fdb7bd52874dd7c93ae315867ffb545b238e0819678eaad626cedcc9cffd48df82cf2154fbb742f2df39993605639f7544332211',
);
const r = openReply(rep, 0x11223344, 0xa1b2c3d4);
assert.ok(r.t, r.err);
const acc = {};
parseReply(r.t, r.len, acc);
assert.equal(acc.kind, 'list');
assert.equal(acc.total, 3);
assert.equal(acc.items.length, 3);
assert.equal(acc.items[0].id, 100);
assert.equal(acc.items[1].single, 2);
assert.equal(acc.items[2].stack, 4);
console.log('ok reply decryption + parse');
console.log('all protocol checks passed');
