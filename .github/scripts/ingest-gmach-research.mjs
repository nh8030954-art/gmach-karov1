import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const token=createHash('sha256').update('gmach-research-ingest:'+process.env.CLOUDFLARE_API_TOKEN).digest('hex');
const files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','--diff-filter=AM','-r',process.env.GITHUB_SHA,'--','.research-inbox'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(!files.length)throw new Error('No encrypted research reports in this commit');
for(const file of files){if(!/^\.research-inbox\/[a-zA-Z0-9_-]+\.json$/.test(file))throw new Error('Invalid research inbox path');const body=await readFile(file,'utf8');
 const response=await fetch('https://gmach-berega.co.il/api/internal/gmach-research',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://gmach-berega.co.il'},body});
 if(!response.ok)throw new Error('Research ingestion failed with HTTP '+response.status);
 const result=await response.json();console.log(JSON.stringify({file,ok:result.ok,duplicate:result.duplicate,accepted:result.accepted,suspected:result.suspected}));
}
