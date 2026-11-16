import {test} from 'node:test';
import assert from 'node:assert/strict';
import {berlinToUtc} from '../public/time.js';
test('Berlin winter and summer are independent of device timezone',()=>{
 assert.equal(berlinToUtc('2026-11-18T18:30'),'2026-11-18T17:30:00.000Z');
 assert.equal(berlinToUtc('2027-07-18T18:30'),'2027-07-18T16:30:00.000Z');
 assert.throws(()=>berlinToUtc('2027-03-28T02:30'));
 assert.throws(()=>berlinToUtc('2027-02-30T12:00'));
});
