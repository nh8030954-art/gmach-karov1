import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('dist/index.html','utf8');
const dictionaryCode=readFileSync('dist/i18n-en.js','utf8');
const context={window:{}};vm.runInNewContext(dictionaryCode,context);
vm.runInNewContext(readFileSync('dist/i18n-errors.js','utf8'),context);
const keys=new Set(Object.keys(context.window.GmachEnglish));
const runtime=readFileSync('dist/remaining-features.js','utf8');
const app=readFileSync('dist/app.js','utf8');
const worker=readFileSync('worker/index.js','utf8');
const operational=readFileSync('worker/platform-completion.js','utf8');
assert.match(runtime,/I18N_FINAL_EN/,'Dynamic English completion dictionary must be loaded');
assert.match(runtime,/replaceTranslatedPhrase/,'English runtime must avoid translating inside Hebrew words');
assert.match(runtime,/document\.title=translateText\(document\.title\)/,'English mode must localize the document title');
assert.match(app,/preferredLanguage/,'Authenticated UI must receive the saved language preference');
assert.match(worker,/preferredLanguage:\s*user\.preferred_language/,'Authenticated user response must expose saved language preference');
for(const phrase of ['New device sign-in','Inventory hold expired','Ownership transfer pending','Extension approved','New results found']) assert.ok(operational.includes(phrase),`Missing operational email translation: ${phrase}`);

const legacy=readFileSync('dist/remaining-features.js','utf8').split('Object.assign(I18N.en')[0];
for(const match of legacy.matchAll(/"([^"\n]*[\u0590-\u05ff][^"\n]*)"\s*:/g))keys.add(match[1]);
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&nbsp;',' ');
const withoutScripts=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
const texts=[...withoutScripts.replace(/<[^>]+>/g,'\n').split('\n').map(s=>decode(s.trim()))];
for(const match of withoutScripts.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g))texts.push(decode(match[1].trim()));
const hebrew=[...new Set(texts.filter(s=>/[\u0590-\u05ff]/.test(s)))];
const errors=[...new Set([...readFileSync('worker/index.js','utf8'),readFileSync('worker/platform-completion.js','utf8'),readFileSync('worker/final-features.js','utf8'),readFileSync('worker/remaining-features.js','utf8')].flatMap(source=>[...source.matchAll(/(?:new HttpError|throw new Error)\(\s*\d+\s*,\s*["']([^"']*[\u0590-\u05ff][^"']*)/g)].map(match=>match[1])))]
  .filter(message=>!keys.has(message));
assert.deepEqual(errors,[],'Every literal server error shown to English users requires an English translation');
assert.ok(html.indexOf('i18n-errors.js')<html.indexOf('remaining-features.js'),'Load server error translations before runtime');
const missing=hebrew.filter(s=>!keys.has(s));
const coverage=1-missing.length/hebrew.length;
assert.equal(missing.length,0,`English static UI is missing translations: ${missing.join(' | ')}`);
assert.ok(html.indexOf('i18n-en.js')<html.indexOf('remaining-features.js'),'Load English translations before language runtime');
assert.ok(html.indexOf('i18n-boot.js')<html.indexOf('styles.css'),'Select the stored language before first paint');
const runtimeLogic=runtime.slice(runtime.indexOf('function replaceTranslatedPhrase'),runtime.indexOf('function translateNode'));
for(const language of ['he','en']){
  const sandbox={window:{}};
  vm.runInNewContext(`let lang=${JSON.stringify(language)}; const I18N={en:{"השליחה לא הושלמה":"Sending was not completed"}};${runtimeLogic}`,sandbox);
  assert.equal(sandbox.window.GmachTranslate('השליחה לא הושלמה'),language==='en'?'Sending was not completed':'השליחה לא הושלמה');
}
assert.match(runtime,/characterData:true/,'Translate updated text nodes');
assert.match(runtime,/attributeFilter:\["placeholder","title","aria-label","value"\]/,'Translate dynamically changed controls');
console.log(`Static English interface coverage ${(coverage*100).toFixed(1)}% (${hebrew.length-missing.length}/${hebrew.length})`);
assert.ok(app.includes('compare-rating-row')&&app.includes('ratingStars(item.rating,{size:"compare"})'),'Item comparison must include item star ratings');
assert.ok(runtime.includes('NEVER_TRANSLATE_SELECTOR=".organization-name')&&runtime.includes('"דירוג פריט":"Item rating"'),'English runtime must preserve gmach names and translate item-rating labels');
const userContent=readFileSync('dist/user-content-translation.js','utf8');
assert.ok(!userContent.includes('.organization-hero h2')&&!userContent.includes('.organization-card h3'),'Gmach names must remain in their original language');
assert.ok(app.includes("subcategoryDisplayName")&&app.includes("categoryDisplayName(item.category)"),"English item views must use catalog English category/subcategory names");


assert.ok(html.includes("user-content-translation.js"),"Offer optional translation for user written content");

for(const phrase of ["Alternative pickup branch","Start here","Recently viewed gmachs","Coordination and timeline","Pickup proposals"]) assert.ok(runtime.includes(phrase),`Missing recent workflow translation: ${phrase}`);

const userTranslator=readFileSync('dist/user-content-translation.js','utf8');
assert.ok(userTranslator.includes("const selector = 'body'")&&userTranslator.includes("NEVER_TRANSLATE"),"English fallback translation must cover all remaining visible Hebrew while preserving gmach names");
assert.ok(userTranslator.includes("#organization-title")&&userTranslator.includes(".organization-name")&&!userTranslator.includes("[data-open-organization]"),"only actual gmach-name elements may bypass English translation");

assert.ok(runtime.includes('only organization names stay original')&&runtime.includes('[alt]'),"English mode must translate all visible/dynamic content and attributes except organization names");
