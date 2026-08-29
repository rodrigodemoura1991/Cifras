import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_FALLBACK = 'https://cifraclub-api.vercel.app/api/cifra';

const NOTE_VALUES = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function noteValue(n){ return NOTE_VALUES[n] ?? null; }
function normalizeKey(key){
  if(typeof key !== 'string') return '';
  const m=key.trim().match(/^([A-Ga-g])([#b]?)(?:m)?$/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : '';
}
function slug(v){ return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }
function isCifraClubUrl(value){ try{const u=new URL(value);return ['www.cifraclub.com.br','cifraclub.com.br'].includes(u.hostname);}catch{return false;} }
function getArtistSongFromUrl(value){
  const u=new URL(value); const parts=u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const ignored=new Set(['letra','imprimir','tab','tabs','guitarra','violao','bateria']);
  const useful=parts.filter(p=>!ignored.has(p.toLowerCase()));
  return useful.length>=2 ? {artist:slug(useful[0]),song:slug(useful[1])} : null;
}
function htmlToText(html){
  return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?>(?=.)/gi,'\n').replace(/<\/(p|div|li|tr|section|article|h[1-6])\s*>/gi,'\n')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/\r/g,'').split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}
async function fetchCifraContent(url){
  const source=getArtistSongFromUrl(url);
  if(source){
    try{
      const r=await fetch(`${API_FALLBACK}?artist=${encodeURIComponent(source.artist)}&song=${encodeURIComponent(source.song)}`,{headers:{Accept:'application/json'},cache:'no-store'});
      if(r.ok){const d=await r.json();if(Array.isArray(d?.cifra)&&d.cifra.length)return {text:d.cifra.join('\n'),title:d.name||source.song,artist:d.artist||source.artist,source:'cifraclub-api'};}
    }catch(_){ }
  }
  const page=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; CifrasPDF/1.0)'},cache:'no-store'});
  if(!page.ok) throw new Error('O Cifra Club não permitiu acessar essa página agora.');
  return {text:htmlToText(await page.text()).slice(0,60000),source:'cifraclub-html'};
}
async function readUploadedFile(file){
  const name=(file.name||'arquivo').toLowerCase(), type=(file.type||'').toLowerCase();
  const bytes=Buffer.from(await file.arrayBuffer());
  if(bytes.length>10*1024*1024) throw new Error('O arquivo deve ter no máximo 10 MB.');
  if(type==='application/pdf'||name.endsWith('.pdf')){
    const parsed=await pdfParse(bytes);
    return {text:String(parsed.text||'').slice(0,60000),title:file.name.replace(/\.pdf$/i,''),artist:'',source:'uploaded-pdf'};
  }
  if(type.includes('html')||/\.(html?|htm)$/i.test(name)) return {text:htmlToText(bytes.toString('utf8')).slice(0,60000),title:file.name.replace(/\.(html?|htm)$/i,''),artist:'',source:'uploaded-html'};
  if(type.startsWith('text/')||/\.(txt|md|csv)$/i.test(name)) return {text:bytes.toString('utf8').slice(0,60000),title:file.name.replace(/\.(txt|md|csv)$/i,''),artist:'',source:'uploaded-text'};
  throw new Error('Formato não suportado. Envie PDF, TXT ou HTML.');
}

// Reconhece acordes tanto separados quanto colados: "E F#m C#m", "EF#mC#m", "C#m7A", etc.
const CHORD_TOKEN = /[A-Ga-g](?:#|b)?(?:maj|min|m|dim|aug|sus|add)?(?:2|4|5|6|7|9|11|13)?(?:b5|#5)?(?:\/[A-Ga-g](?:#|b)?)?/;
function isChordToken(token){ return typeof token==='string' && CHORD_TOKEN.test(token.trim()) && CHORD_TOKEN.exec(token.trim())?.[0]===token.trim(); }
function splitChordSequence(line){
  const s=String(line||'').trim(); if(!s)return [];
  const compact=s.replace(/[|,;]+/g,' ').trim();
  const full=new RegExp(`^\\s*${CHORD_TOKEN.source}(?:(?:\\s+|[|,;:-]*?)${CHORD_TOKEN.source})*\\s*$`);
  if(full.test(compact)){
    const out=[]; const re=new RegExp(CHORD_TOKEN.source,'g'); let m;
    while((m=re.exec(compact))!==null) out.push(m[0]);
    return out;
  }
  // Caso os acordes tenham sido colados pelo extrator do PDF.
  const compactNoSpace=compact.replace(/\s+/g,'');
  const out=[]; let pos=0; const re=new RegExp(CHORD_TOKEN.source,'g'); let m;
  while((m=re.exec(compactNoSpace))!==null){ if(m.index!==pos)return []; out.push(m[0]); pos=re.lastIndex; }
  return pos===compactNoSpace.length?out:[];
}
function normalizeChordLine(line){ const seq=splitChordSequence(line); return seq.length?seq.join('  '):String(line||'').trim(); }
function looksLikeChordLine(line){ const seq=splitChordSequence(line); return seq.length>=1; }
function cleanAnchor(line){ return String(line||'').replace(/^[\s•*-]+/,'').replace(/\.\.\.$/,'').trim(); }

// Estrutura determinística para PDFs/TXT: linhas consecutivas de acordes formam um único trecho,
// e o primeiro texto logo depois vira somente a chamada inicial do verso. Isso evita os cartões
// quebrados que estavam aparecendo quando a IA separava cada acorde em um bloco.
function structureRawText(text){
  const raw=String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
  const blocks=[]; let chordLines=[];
  const flush=(anchor='')=>{
    if(!chordLines.length)return;
    blocks.push({selected:true,anchor:cleanAnchor(anchor),chords:[...chordLines],lines:chordLines.map(chords=>({chords,lyric:''}))});
    chordLines=[];
  };
  for(const line of raw){
    if(looksLikeChordLine(line)){ chordLines.push(normalizeChordLine(line)); continue; }
    if(chordLines.length){ flush(line); continue; }
  }
  flush('');
  return blocks;
}

function normalizeBlocks(data,text){
  const aiBlocks=Array.isArray(data?.blocks)?data.blocks:[];
  const blocks=aiBlocks.map(b=>{
    const lines=Array.isArray(b?.lines)?b.lines.map(l=>({chords:typeof l?.chords==='string'?normalizeChordLine(l.chords):'',lyric:typeof l?.lyric==='string'?l.lyric.trim():''})).filter(l=>l.chords||l.lyric):[];
    const chords=Array.isArray(b?.chords)?b.chords.map(x=>normalizeChordLine(String(x))).filter(Boolean):(typeof b?.chords==='string'?b.chords.split('\n').map(normalizeChordLine).filter(Boolean):[]);
    const finalLines=lines.length?lines:chords.map(chords=>({chords,lyric:''}));
    return {...b,selected:b.selected!==false,lines:finalLines,anchor:cleanAnchor(b?.anchor||finalLines.find(l=>l.lyric)?.lyric||''),chords:finalLines.map(l=>l.chords).filter(Boolean)};
  }).filter(b=>b.lines.length||b.anchor);

  const rawBlocks=structureRawText(text);
  // Se a resposta da IA perdeu uma quantidade relevante de linhas, o parser do arquivo ganha.
  const aiChordCount=blocks.reduce((n,b)=>n+b.lines.filter(l=>splitChordSequence(l.chords).length).length,0);
  const rawChordCount=rawBlocks.reduce((n,b)=>n+b.lines.length,0);
  const finalBlocks=rawChordCount>aiChordCount+1?rawBlocks:(blocks.length?blocks:rawBlocks);
  return {...data,blocks:finalBlocks};
}

function transposeChordToken(token,semitones,flats){
  const m=String(token).match(/^([A-Ga-g])([#b]?)(.*)$/); if(!m)return token;
  const root=`${m[1].toUpperCase()}${m[2]}`; if(noteValue(root)===null)return token;
  const suffix=m[3]||''; const bassMatch=suffix.match(/^(.*)\/([A-Ga-g])([#b]?)$/); const quality=bassMatch?bassMatch[1]:suffix; const bass=bassMatch?`${bassMatch[2].toUpperCase()}${bassMatch[3]}`:'';
  const notes=flats?FLATS:SHARPS; const newRoot=notes[(noteValue(root)+semitones+120)%12]; const newBass=bass&&noteValue(bass)!==null?`/${notes[(noteValue(bass)+semitones+120)%12]}`:'';
  return `${newRoot}${quality}${newBass}`;
}
function transposeLine(line,semitones,flats){ return String(line||'').split(/(\s+)/).map(t=>isChordToken(t)?transposeChordToken(t,semitones,flats):t).join(''); }
function transposeBlocks(data,fromKey,toKey){
  const from=noteValue(normalizeKey(fromKey)),to=noteValue(normalizeKey(toKey)); if(from===null||to===null)return data;
  const semitones=(to-from+12)%12, flats=/b/.test(normalizeKey(toKey));
  return {...data,key:normalizeKey(toKey),blocks:data.blocks.map(b=>({...b,chords:Array.isArray(b.chords)?b.chords.map(x=>transposeLine(x,semitones,flats)):b.chords,lines:Array.isArray(b.lines)?b.lines.map(l=>({...l,chords:transposeLine(l.chords,semitones,flats)})):b.lines}))};
}

async function aiOrganize(content){
  const prompt=`Organize esta cifra para um editor e PDF. Retorne JSON válido com title, artist, key e blocks. NÃO invente acordes nem letras. Preserve TODAS as linhas de acordes e a ordem exata do conteúdo. Uma sequência de linhas consecutivas de acordes pertence ao MESMO trecho; não crie um bloco para cada acorde. Exemplos: "E F#m C#m" é uma única linha; "EF#mC#m" deve virar "E  F#m  C#m"; "C#m7A" deve virar "C#m7  A". O bloco deve ter lines:[{chords,lyric}] com todas as linhas de acordes na mesma ordem. anchor deve conter SOMENTE o início curto do próximo verso, sem a letra completa e sem acordes. Não use a primeira nota encontrada como tom automaticamente: identifique o tom original pelo conjunto da cifra. Se a fonte já informa o tom, preserve-o. Nunca transponha durante a organização.`;
  const r=await openai.chat.completions.create({model:'gpt-4o-mini',response_format:{type:'json_object'},messages:[{role:'system',content:prompt},{role:'user',content:`Fonte: ${content.source||''}\nTítulo: ${content.title||''}\nArtista: ${content.artist||''}\nCifra:\n${content.text}`}]});
  return JSON.parse(r.choices[0].message.content||'{}');
}

export async function POST(request){
  try{
    if(!process.env.OPENAI_API_KEY) return Response.json({error:'OPENAI_API_KEY ainda não foi configurada na Vercel.'},{status:500});
    let url='',targetKey='',content;
    const ct=request.headers.get('content-type')||'';
    if(ct.includes('multipart/form-data')){
      const form=await request.formData(); url=String(form.get('url')||'').trim(); targetKey=String(form.get('targetKey')||'').trim(); const file=form.get('file'); if(file&&typeof file!=='string')content=await readUploadedFile(file);
    }else{const body=await request.json();url=String(body.url||'').trim();targetKey=String(body.targetKey||'').trim();}
    if(!content){if(!isCifraClubUrl(url))return Response.json({error:'Cole um link válido do Cifra Club ou envie um arquivo.'},{status:400});content=await fetchCifraContent(url);}
    if(!content.text||content.text.trim().length<20) throw new Error('O arquivo não trouxe texto suficiente. Se for um PDF escaneado/imagem, envie uma versão com texto selecionável ou TXT/HTML.');

    let data=normalizeBlocks(await aiOrganize(content),content.text);
    if(!data.title)data.title=content.title||''; if(!data.artist)data.artist=content.artist||'';
    const originalKey=normalizeKey(data.key); data.originalKey=originalKey||data.key||'';
    if(!data.blocks.length) throw new Error('A cifra foi lida, mas não consegui localizar linhas de acordes.');
    const desired=normalizeKey(targetKey); if(desired)data=transposeBlocks(data,originalKey||data.key,desired); else data.key=originalKey;
    return Response.json(data);
  }catch(error){return Response.json({error:error?.message||'Erro ao processar a cifra.'},{status:500});}
}
