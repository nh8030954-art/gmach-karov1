import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile('dist/app.js','utf8');
const fragment=source.slice(source.indexOf('  function needsOwnerSetup(){'),source.indexOf('  function updateOwnerSetupNotice(){'));
function scenario({intent='owner',organizations=[],local=false,blockedStorage=false,dialog=false}={}){
 const state={user:{id:'new-owner'},myOrganizations:organizations,dashboard:{user:{id:'new-owner'},registrationIntent:intent}};
 let opens=0;
 const context=vm.createContext({state,localStorage:{getItem(){if(blockedStorage)throw Error('storage unavailable');return local?'1':null}},$:()=>dialog,openGmachForm(){opens++}});
 vm.runInContext(fragment,context);
 return {context,state,get opens(){return opens},resume:()=>vm.runInContext('resumeOwnerSetup()',context)};
}
const owner=scenario({blockedStorage:true});
assert.equal(owner.resume(),true);assert.equal(owner.opens,1);
assert.equal(owner.resume(),false);assert.equal(owner.opens,1,'Hydration must not reopen a form the user closed');
assert.equal(scenario({intent:'user'}).resume(),false);
assert.equal(scenario({organizations:[{id:'existing'}]}).resume(),false,'Owners with a gmach must not be sent to create a duplicate');
assert.equal(scenario({intent:'user',local:true}).resume(),true,'Previously registered owners keep their saved setup intent');
assert.equal(scenario({dialog:true}).resume(),false,'Do not stack setup over another open dialog');
const differentAccount=scenario({intent:'user'});differentAccount.state.dashboard={user:{id:'old-owner'},registrationIntent:'owner'};
assert.equal(differentAccount.resume(),false,'Another account snapshot must not trigger owner setup');
console.log('Owner onboarding resume, storage independence and duplicate prevention passed');
