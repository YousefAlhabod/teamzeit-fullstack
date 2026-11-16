import test from 'node:test';
import assert from 'node:assert/strict';
import {textField,validEmail,validPassword,validDate,validStatus,safeEqual,formatEvent,HttpError} from '../src/core.js';

test('Textfelder trimmen und Steuerzeichen entfernen',()=>assert.equal(textField('  Training\n  ','Titel',100),'Training'));
test('Leere und zu lange Werte werden zurückgewiesen',()=>{
 assert.throws(()=>textField('  ','Titel',100),HttpError);
 assert.throws(()=>textField('x'.repeat(101),'Titel',100),HttpError);
});
test('Email-Prüfung und Normalisierung',()=>{
 assert.equal(validEmail('  Yousef@Example.DE '),'yousef@example.de');
 assert.throws(()=>validEmail('nicht-email'),HttpError);
});
test('Passwörter mindestens 12 Zeichen',()=>{
 assert.throws(()=>validPassword('123456789'),HttpError);
 assert.equal(validPassword('EinSicheresPasswort123!'),'EinSicheresPasswort123!');
});
test('UTC-Termine validieren',()=>{
 assert.equal(validDate('2026-11-18T17:30:00.000Z'),'2026-11-18T17:30:00.000Z');
 assert.throws(()=>validDate('morgen um 18 Uhr'),HttpError);
});
test('Teilnahmestatus nur yes/no/maybe',()=>{
 for(const x of ['yes','no','maybe'])assert.equal(validStatus(x),x);
 assert.throws(()=>validStatus('admin'),HttpError);
});
test('Digest-Vergleich',()=>{
 assert.equal(safeEqual('abc','abc'),true);
 assert.equal(safeEqual('abc','abd'),false);
 assert.equal(safeEqual('abc','abcd'),false);
});
test('Teilnehmerzahlen nur für Trainer in Ereignisausgabe',()=>{
 const row={id:'1',group_id:'g',title:'Train',start_at:'2026-11-18T17:30:00.000Z',location:'Ort',notes:'',my_status:'yes',yes_count:2,no_count:1,maybe_count:1};
 assert.equal('counts' in formatEvent(row),false);
 assert.deepEqual(formatEvent(row,true).counts,{yes:2,no:1,maybe:1});
});
