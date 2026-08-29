'use client';
import { useState } from 'react';

function blockChordText(block) {
  if (Array.isArray(block.lines) && block.lines.length) {
    return block.lines.map((line) => line.chords || '').filter(Boolean).join('\n');
  }
  return Array.isArray(block.chords) ? block.chords.join('  ') : block.chords || '';
}

function blockLyricText(block) {
  if (typeof block.anchor === 'string' && block.anchor) return block.anchor.replace(/\.\.\.$/, '');
  return block.lines?.find((line) => line.lyric)?.lyric || '';
}

function BlockPreview({ block }) {
  const chords = Array.isArray(block.lines)
    ? block.lines.map((line) => line.chords || '').filter(Boolean)
    : [blockChordText(block)].filter(Boolean);

  return (
    <div className="music-lines">
      {chords.map((chordLine, index) => (
        <div className="music-line" key={index}>
          <div className="line-chords">{chordLine}</div>
        </div>
      ))}
      {blockLyricText(block) && <div className="line-lyric block-anchor">{blockLyricText(block)}...</div>}
    </div>
  );
}

function applyEdits(block, chordsText, lyricText) {
  const chordLines = chordsText.split('\n').map((line) => line.trim()).filter(Boolean);
  const lyric = lyricText.trim();
  return {
    ...block,
    anchor: lyric,
    chords: chordLines,
    lines: [
      ...chordLines.map((chords) => ({ chords, lyric: '' })),
      ...(lyric ? [{ chords: '', lyric }] : [])
    ]
  };
}

export default function Home(){
  const [url,setUrl]=useState(''),[loading,setLoading]=useState(false),[blocks,setBlocks]=useState([]),[error,setError]=useState(''),[editing,setEditing]=useState(null);

  async function processCifra(){
    setError('');setLoading(true);
    try{
      const r=await fetch('/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||'Não foi possível processar.');
      setBlocks(d.blocks||[]);
      setEditing(null);
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  function toggle(i){setBlocks(p=>p.map((b,n)=>n===i?{...b,selected:!b.selected}:b))}
  function selectAll(v){setBlocks(p=>p.map(b=>({...b,selected:v})))}
  function updateBlock(i, changes){setBlocks(p=>p.map((b,n)=>n===i?{...b,...changes}:b))}
  function startEditing(i){setEditing(i)}
  function saveEditing(){setEditing(null)}
  function pdf(){if(blocks.some(b=>b.selected))window.print();}

  return <main className="wrap">
    <header><div className="logo">♪</div><div><h1>Cifras</h1><p>Monte sua cifra personalizada em PDF</p></div></header>
    <section className="card"><label>Link do Cifra Club</label><div className="row"><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Cole aqui o link da cifra..."/><button onClick={processCifra} disabled={loading||!url}>{loading?'Processando...':'Processar cifra'}</button></div>{error&&<div className="error">{error}</div>}</section>
    {blocks.length>0&&<section className="card"><div className="toolbar"><div><h2>{blocks[0].title}</h2><p>{blocks[0].artist}</p></div><div><button className="ghost" onClick={()=>selectAll(true)}>Selecionar todos</button><button className="ghost" onClick={()=>selectAll(false)}>Limpar</button></div></div><p className="hint">Marque os trechos que você quer no PDF. Você também pode editar acordes e o início de cada verso antes de selecionar.</p><div className="blocks">{blocks.map((b,i)=>{
      const chordsText=blockChordText(b);
      const lyricText=blockLyricText(b);
      const isEditing=editing===i;
      return <div className={`block ${b.selected?'selected':''} ${isEditing?'editing':''}`} key={i}>
        <input type="checkbox" checked={!!b.selected} onChange={()=>toggle(i)} aria-label="Selecionar trecho"/>
        <div className="block-content">
          {isEditing ? <div className="editor">
            <div className="editor-field"><label>Acordes</label><textarea value={chordsText} onChange={e=>updateBlock(i,applyEdits(b,e.target.value,lyricText))} rows={Math.max(2,chordsText.split('\n').length)} /></div>
            <div className="editor-field"><label>Início do verso</label><input value={lyricText} onChange={e=>updateBlock(i,applyEdits(b,chordsText,e.target.value))} placeholder="Ex.: Mesmo estando em guerra" /></div>
            <button className="save-edit" onClick={saveEditing}>Concluir edição</button>
          </div> : <BlockPreview block={b}/>} 
        </div>
        {!isEditing && <button className="edit-button" onClick={()=>startEditing(i)}>Editar</button>}
      </div>;
    })}</div><button className="pdf" onClick={pdf}>Gerar PDF dos selecionados</button></section>}
  </main>
}
