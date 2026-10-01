// 虚词音频：按下标严格对应 pany-func.json 的顺序
const fs=require('fs'), path=require('path');
const FUNC=JSON.parse(fs.readFileSync('pany-func.json','utf8'));
const outDir=path.join(__dirname,'audio-pany');
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function url(i,t){return i===0?'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=th&q='+encodeURIComponent(t)
  :'https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(t)+'&le=th';}
(async()=>{
  let ok=0,fail=0;const failed=[];
  for(let i=0;i<FUNC.length;i++){
    const t=FUNC[i][0], file=path.join(outDir,'f'+i+'.mp3');
    let done=false;
    for(let s=0;s<2&&!done;s++){
      try{const r=await fetch(url(s,t),{headers:{'User-Agent':UA}});
        if(r.ok){const b=Buffer.from(await r.arrayBuffer()); if(b.length>1500){fs.writeFileSync(file,b);done=true;}}}
      catch(e){}
      if(!done) await sleep(700);
    }
    if(done) ok++; else {fail++; failed.push(i+':'+t);}
    await sleep(150);
  }
  console.log('func audio ok='+ok+' fail='+fail);
  if(failed.length) console.log('failed: '+failed.join(', '));
})();
