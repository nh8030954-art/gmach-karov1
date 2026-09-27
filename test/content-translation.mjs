import assert from 'node:assert/strict';
import {translateUserContent} from '../worker/index.js';
const calls=[];
const env={
  AI:{run:async(model,input)=>{calls.push({model,input});return {translated_text:'Community request for a stroller'}}},
  DB:{prepare:()=>({bind:()=>({first:async()=>({count:0}),run:async()=>({})})})}
};
const request=texts=>new Request('https://example.test/api/translate/user-content',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.test','CF-Connecting-IP':'203.0.113.10'},body:JSON.stringify({texts})});
let response=await translateUserContent(request(['בקשת עזרה לעגלה לתינוק','Already English']),env);
assert.equal(response.status,200);
assert.deepEqual((await response.json()).translations,['Community request for a stroller','Already English']);
assert.equal(calls.length,1);
assert.equal(calls[0].model,'@cf/meta/m2m100-1.2b');
assert.equal(calls[0].input.source_lang,'he');
assert.equal(calls[0].input.target_lang,'en');
await assert.rejects(()=>translateUserContent(request(Array(13).fill('בדיקת טקסט')),env),error=>error.status===400);
await assert.rejects(()=>translateUserContent(request(['בדיקת טקסט']),{...env,AI:undefined}),error=>error.status===503);
