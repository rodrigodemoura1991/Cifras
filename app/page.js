'use client';
import { useRef, useState } from 'react';

function blockChordText(block){if(Array.isArray(block.lines)&&block.lines.length)return block.lines.map(line=>line.chords||'').filter(Boolean).join('\n');return Array.isArray(block.chords)?block.chords.join('  '):block.chords||'';}
function blockLyricText(block){if(typeof block.anchor==='string'&&block.anchor)return block.anchor.replace(/\.\.\.$/,'');return block.lines?.find(line=>line.lyric)?.lyric||'';}
function BlockPreview({block}){const chords=Array.isArray(block.lines)?block.lines.map(line=>line.chords||'').filter(Boolean):[blockChordText(block)].filter(Boolean);return <div className="music-lines">{chords.map((c,i)=><div className="music-line" key={i}><div className="line-chords">{c}</div></div>)}{blockLyricText(block)&&<div className="line-lyric block-anchor">{blockLyricText(block)}...</div>}</div>}
function applyEdits(block,chordsText,lyricText){const chordLines=chordsText.split('\n').map(x=>x.trim()).filter(Boolean);const lyric=lyricText.trim();return {...block,anchor:lyric,chords:chordLines,lines:chordLines.map(chords=>({chords,lyric:''})),_editText:chordsText};}
function SelectedSong({song}){return <section className="print-song"><h2>{song.title}</h2>{song.artist&&<p className="print-artist">{song.artist}</p>}{song.key&&<p className="print-key">Tom: {song.key}</p>}{song.blocks.map((b,i)=><BlockPreview block={b} key={i}/>)}</section>}

export default function Home(){
  const[url,setUrl]=useState(''),[file,setFile]=useState(null),[loading,setLoading]=useState(false),[transposing,setTransposing]=useState(false),[blocks,setBlocks]=useState([]),[error,setError]=useState(''),[editing,setEditing]=useState(null),[history,setHistory]=useState({}),[songs,setSongs]=useState([]),[songInfo,setSongInfo]=useState({title:'',artist:'',key:'',originalKey:''}),[targetKey,setTargetKey]=useState('');
  const fileRef=useRef(null);

  async function callProcess(key=''){
    const form=new FormData();
    if(url.trim())form.append('url',url.trim());
    if(file)form.append('file',file);
    if(key)form.append('targetKey',key);
    const r=await fetch('/api/process',{method:'POST',body:form});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||'Não foi possível processar.');
    return d;
  }
  function resetSource(){setUrl('');setFile(null);if(fileRef.current)fileRef.current.value='';}
  async function processCifra(){
    setError('');
    if(!url.trim()&&!file){setError('Cole um link ou envie um arquivo.');return;}
    setLoading(true);
    try{const d=await callProcess();const original=d.key||'';setBlocks(d.blocks||[]);setSongInfo({title:d.title||'',artist:d.artist||'',key:original,originalKey:original});setTargetKey(original);setEditing(null);setHistory({});}
    catch(e){setError(e.message)}finally{setLoading(false)}
  }
  async function transposeCifra(){
    const desired=targetKey.trim().toUpperCase();
    if(!desired){setError('Informe o tom desejado.');return;}
    if(!url.trim()&&!file){setError('Primeiro processe uma cifra.');return;}
    setError('');setTransposing(true);
    try{const d=await callProcess(desired);setBlocks(d.blocks||[]);setSongInfo(p=>({...p,title:d.title||p.title,artist:d.artist||p.artist,key:desired,originalKey:p.originalKey||d.key||''}));setTargetKey(desired);setEditing(null);setHistory({});}
    catch(e){setError(e.message)}finally{setTransposing(false)}
  }
  function toggle(i){setBlocks(p=>p.map((b,n)=>n===i?{...b,selected:!b.selected}:b))}
  function selectAll(v){setBlocks(p=>p.map(b=>({...b,selected:v})))}
  function updateBlock(i,changes){setHistory(h=>({...h,[i]:[...(h[i]||[]),blocks[i]].slice(-50)}));setBlocks(p=>p.map((b,n)=>n===i?{...b,...changes}:b))}
  function undoBlock(i){const s=history[i]||[];if(!s.length)return;setBlocks(p=>p.map((b,n)=>n===i?s[s.length-1]:b));setHistory(h=>({...h,[i]:s.slice(0,-1)}));}
  function addChordLine(i){const b=blocks[i];const current=b._editText??blockChordText(b);updateBlock(i,applyEdits(b,current+(current?'\n':''),blockLyricText(b)))}
  function advanceSong(){const selected=blocks.filter(b=>b.selected);if(!selected.length){setError('Selecione pelo menos um trecho antes de adicionar a música.');return;}setSongs(p=>[...p,{...songInfo,title:songInfo.title||`Música ${p.length+1}`,blocks:selected.map(b=>({...b,selected:true}))}]);setBlocks([]);setEditing(null);setHistory({});setSongInfo({title:'',artist:'',key:'',originalKey:''});setTargetKey('');resetSource();setError('');window.scrollTo({top:0,behavior:'smooth'})}
  function removeSong(i){setSongs(p=>p.filter((_,n)=>n!==i))}
  function pdf(){if(!songs.length)return;window.print()}

  return <main className="wrap">
    <header><div className="logo">♪</div><div><h1>Cifras</h1><p>Monte sua cifra personalizada em PDF</p></div></header>

    <section className="card no-print">
      <label>Como você quer adicionar a cifra?</label>
      <div className="source-options">
        <div className="source-box">
          <label>🔗 Link do Cifra Club</label>
          <input value={url} onChange={e=>{setUrl(e.target.value);if(e.target.value)setFile(null)}} placeholder="Cole aqui o link da cifra..."/>
        </div>
        <div className="source-divider">ou</div>
        <div className="source-box file-source">
          <label>📄 Arquivo da cifra</label>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.html,.htm,.md,.csv,application/pdf,text/plain,text/html" onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f)setUrl('')}}/>
          {file?<div className="selected-file">✓ {file.name}</div>:<div className="file-help">PDF, TXT ou HTML — até 10 MB</div>}
        </div>
      </div>
      <div className="row process-row"><button onClick={processCifra} disabled={loading||transposing||(!url.trim()&&!file)}>{loading?'Processando...':'Processar cifra'}</button></div>
      {error&&<div className="error">{error}</div>}
    </section>

    {songs.length>0&&<section className="card no-print song-counter"><strong>{songs.length} {songs.length===1?'música preparada':'músicas preparadas'} para o PDF</strong><div className="song-list">{songs.map((s,i)=><div className="song-item" key={i}><span>{i+1}. {s.title} {s.key&&` — Tom ${s.key}`}</span><button className="remove-song" onClick={()=>removeSong(i)}>Remover</button></div>)}</div><p className="hint">Adicione quantas músicas quiser.</p><button className="pdf" onClick={pdf}>Gerar PDF com {songs.length} {songs.length===1?'música':'músicas'}</button></section>}

    {blocks.length>0&&<section className="card no-print"><div className="toolbar"><div><h2>{songInfo.title||blocks[0].title}</h2><p>{songInfo.artist||blocks[0].artist}</p>{songInfo.originalKey&&<p><strong>Tom original: {songInfo.originalKey}</strong></p>}</div><div><button className="ghost" onClick={()=>selectAll(true)}>Selecionar todos</button><button className="ghost" onClick={()=>selectAll(false)}>Limpar</button></div></div><div className="song-meta-editor"><div><label>Nome da música</label><input value={songInfo.title} onChange={e=>setSongInfo(p=>({...p,title:e.target.value}))}/></div><div><label>Tom desejado</label><input value={targetKey} onChange={e=>setTargetKey(e.target.value.toUpperCase())} placeholder="Ex.: E"/><button className="transpose-button" onClick={transposeCifra} disabled={transposing||!targetKey.trim()}>{transposing?'Transpondo...':'Transpor para este tom'}</button></div></div><p className="hint">Digite o tom que você quer e o app irá transpor todos os acordes da música. O tom original fica registrado como referência.</p><div className="blocks">{blocks.map((b,i)=>{const chordsText=b._editText??blockChordText(b),lyricText=blockLyricText(b),isEditing=editing===i,hasUndo=(history[i]||[]).length>0;return <div className={`block ${b.selected?'selected':''} ${isEditing?'editing':''}`} key={i}><input type="checkbox" checked={!!b.selected} onChange={()=>toggle(i)}/><div className="block-content">{isEditing?<div className="editor"><div className="editor-field"><label>Acordes — escreva como quiser</label><textarea value={chordsText} onChange={e=>updateBlock(i,applyEdits(b,e.target.value,lyricText))} rows={Math.max(3,chordsText.split('\n').length+1)} placeholder="Ex.: C  F  Em  Am  Dm7  Em  F"/><div className="editor-help">Uma linha = uma linha de acordes no resultado.</div><button className="add-line-button" onClick={()=>addChordLine(i)}>＋ Adicionar linha de acordes</button></div><div className="editor-field"><label>Início do verso</label><input value={lyricText} onChange={e=>updateBlock(i,applyEdits(b,chordsText,e.target.value))}/></div><div className="editor-actions"><button className="undo-button" onClick={()=>undoBlock(i)} disabled={!hasUndo}>↶ Desfazer</button><button className="save-edit" onClick={()=>setEditing(null)}>Concluir edição</button></div></div>:<BlockPreview block={b}/>}</div>{!isEditing&&<button className="edit-button" onClick={()=>setEditing(i)}>Editar</button>}</div>})}</div><button className="advance" onClick={advanceSong}>Adicionar ao PDF e avançar para próxima música</button></section>}
    <div className="print-document">{songs.map((s,i)=><SelectedSong song={s} key={i}/>)}</div>
  </main>
}
