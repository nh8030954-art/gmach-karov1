// Run on the research agent, with a local private plaintext report and the site's public key.
// Only the encrypted output may be committed to the public repository.
import {readFile,writeFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const [reportFile,keyFile,outputFile]=process.argv.slice(2);if(!outputFile)throw new Error('Usage: report.json public-key.json envelope.json');
const pub=JSON.parse(await readFile(keyFile,'utf8')),plain=await readFile(reportFile);
const key=await webcrypto.subtle.importKey('jwk',pub.jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
const raw=webcrypto.getRandomValues(new Uint8Array(32)),iv=webcrypto.getRandomValues(new Uint8Array(12));
const aes=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
const base64=b=>Buffer.from(b).toString('base64');
const result={version:1,keyId:pub.keyId,wrappedKey:base64(await webcrypto.subtle.encrypt('RSA-OAEP',key,raw)),iv:base64(iv),ciphertext:base64(await webcrypto.subtle.encrypt({name:'AES-GCM',iv},aes,plain))};
await writeFile(outputFile,JSON.stringify(result));
