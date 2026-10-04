import fs from 'node:fs';import vm from 'node:vm';
const context={window:{},document:{documentElement:{lang:'en'}},localStorage:{getItem:()=> 'en'}};
for(const file of ['i18n-en.js','i18n-errors.js'])vm.runInNewContext(fs.readFileSync('dist/'+file,'utf8'),context);
const runtime=fs.readFileSync('dist/remaining-features.js','utf8');
vm.runInNewContext(runtime.slice(runtime.indexOf('const I18N='),runtime.indexOf('const NEVER_TRANSLATE_SELECTOR'))+'\n'+runtime.slice(runtime.lastIndexOf('Object.assign(I18N.en,'),runtime.indexOf('function init()'))+'\nwindow.dictionary=I18N.en;',context);
const template=fs.readFileSync('scripts/first-paint-template.js','utf8');
fs.writeFileSync('dist/i18n-first-paint.js',template.replace('/* DICTIONARY */',JSON.stringify(context.window.dictionary)));
