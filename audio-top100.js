const fs=require('fs'), path=require('path');
const t=JSON.parse(fs.readFileSync('top100.json','utf8'));
const out=path.join(__dirname,'audio-pany');
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const url=(i,x)=>i===0?'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q='+encodeURIComponent(x)
  :'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(x)+'&le=th';
(async()=>{let ok=0,fail=0;
 for(const x of t.list){const f=path.join(out,'t'+x.i+'.mp3');
  if(fs.existsSync(f)&&fs.statSync(f).size>1500){ok++;continue;}
  let done=false;
  for(let s=0;s<2&&!done;s++){try{const r=await fetch(url(s,x.w),{headers:{'User-Agent':UA}});
    if(r.ok){const b=Buffer.from(await r.arrayBuffer()); if(b.length>1500){fs.writeFileSync(f,b);done=true;}}}catch(e){}
   if(!done)await sleep(700);}
  done?ok++:fail++; await sleep(120);}
 console.log('top100 audio ok='+ok+' fail='+fail);})();
