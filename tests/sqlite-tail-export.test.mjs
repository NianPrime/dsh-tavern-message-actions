import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {SqliteSessionDb} from '../../sqlite-v2-reference/dsh-tavern-sqlite-v2-main/store.js'
import {snapshotDatabase,inspectDatabase} from '../../sqlite-v2-reference/dsh-tavern-sqlite-v2-main/lib/db-save-codec.js'
test('real SQLite tail deletion survives reopen and is absent from a new export snapshot',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'message-actions-sqlite-'));
  t.after(()=>{if(path.dirname(path.resolve(root))!==path.resolve(tmpdir()))throw Error('临时目录边界不符');rmSync(root,{recursive:true});});
  const file=path.join(root,'native.db'),output=path.join(root,'export.db');
  const sentinel='DELETED_ROUND_UNIQUE_20261008';
  let db=new SqliteSessionDb(file);
  db.materialize({id:'fixture-session',version:1,createdAt:1},0,[
    {seq:0,type:'turn/start',time:1,data:{turn:1}},
    {seq:1,type:'turn/end',time:2,data:{turn:1,text:'retained'}},
    {seq:2,type:'turn/start',time:3,data:{turn:2}},
    {seq:3,type:'assistant/message',time:4,data:{turn:2,message:{content:[{type:'text',text:sentinel}]}}},
    {seq:4,type:'turn/end',time:5,data:{turn:2}}
  ]);
  assert.match(JSON.stringify(db.readAll()),new RegExp(sentinel));
  db.truncateFrom(1);db.close();db=new SqliteSessionDb(file);
  try{assert.equal(db.cursor(),2);assert.doesNotMatch(JSON.stringify(db.readAll()),new RegExp(sentinel));}finally{db.close();}
  snapshotDatabase(file,output,'native');
  const exported=inspectDatabase(output,'native');
  assert.equal(exported.tables.events.length,2);assert.doesNotMatch(JSON.stringify(exported),new RegExp(sentinel));
});
