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

function SelectedSong({ song }) {
  return (
    <section className="print-song">
      <h2>{song.title}</h2>
      {song.artist && <p className="print-artist">{song.artist}</p>}
      {song.blocks.map((block, index) => <BlockPreview block={block} key={index} />)}
    </section>
  );
}

export default function Home(){
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(false);
  const [blocks,setBlocks]=useState([]);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState(null);
  const [history,setHistory]=useState({});
  const [songs,setSongs]=useState([]);

  async function processCifra(){
    setError('');
    setLoading(true);
    try{
      const r=await fetch('/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||'Não foi possível processar.');
      setBlocks(d.blocks||[]);
      setEditing(null);
      setHistory({});
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }

  function toggle(i){setBlocks(p=>p.map((b,n)=>n===i?{...b,selected:!b.selected}:b))}
  function selectAll(v){setBlocks(p=>p.map(b=>({...b,selected:v})))}

  function updateBlock(i, changes, remember = false){
    if (remember) {
      setHistory(h => ({
        ...h,
        [i]: [...(h[i] || []), blocks[i]].slice(-50)
      }));
    }
    setBlocks(p=>p.map((b,n)=>n===i?{...b,...changes}:b));
  }

  function undoBlock(i){
    const stack = history[i] || [];
    if (!stack.length) return;
    const previous = stack[stack.length - 1];
    setBlocks(p=>p.map((b,n)=>n===i?previous:b));
    setHistory(h=>({...h,[i]:stack.slice(0,-1)}));
  }

  function startEditing(i){setEditing(i)}
  function saveEditing(){setEditing(null)}

  function advanceSong(){
    const selectedBlocks = blocks.filter(b => b.selected);
    if (!selectedBlocks.length) {
      setError('Selecione pelo menos um trecho antes de avançar.');
      return;
    }
    if (songs.length >= 4) return;
    const first = blocks[0] || {};
    setSongs(prev => [...prev, {
      title: first.title || `Música ${prev.length + 1}`,
      artist: first.artist || '',
      blocks: selectedBlocks.map(b => ({...b, selected: true}))
    }]);
    setBlocks([]);
    setEditing(null);
    setHistory({});
    setUrl('');
    setError('');
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function removeSong(index){
    setSongs(prev => prev.filter((_,i)=>i!==index));
  }

  function pdf(){
    if (songs.length !== 4) return;
    window.print();
  }

  const canProcess = songs.length < 4;

  return <main className="wrap">
    <header><div className="logo">♪</div><div><h1>Cifras</h1><p>Monte sua cifra personalizada em PDF</p></div></header>

    <section className="card no-print">
      <label>Link do Cifra Club</label>
      <div className="row">
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder={canProcess ? "Cole aqui o link da cifra..." : "PDF completo com 4 músicas"} disabled={!canProcess}/>
        <button onClick={processCifra} disabled={loading||!url||!canProcess}>{loading?'Processando...':'Processar cifra'}</button>
      </div>
      {error&&<div className="error">{error}</div>}
    </section>

    <section className="card no-print song-counter">
      <strong>{songs.length}/4 músicas preparadas para o PDF</strong>
      {songs.length > 0 && <div className="song-list">{songs.map((song,i)=><div className="song-item" key={i}><span>{i+1}. {song.title}</span><button className="remove-song" onClick={()=>removeSong(i)}>Remover</button></div>)}</div>}
    </section>

    {blocks.length>0&&<section className="card no-print">
      <div className="toolbar"><div><h2>{blocks[0].title}</h2><p>{blocks[0].artist}</p></div><div><button className="ghost" onClick={()=>selectAll(true)}>Selecionar todos</button><button className="ghost" onClick={()=>selectAll(false)}>Limpar</button></div></div>
      <p className="hint">Marque os trechos que você quer no PDF. Edite acordes e o início de cada verso como quiser.</p>
      <div className="blocks">{blocks.map((b,i)=>{
        const chordsText=blockChordText(b);
        const lyricText=blockLyricText(b);
        const isEditing=editing===i;
        const hasUndo=(history[i]||[]).length>0;
        return <div className={`block ${b.selected?'selected':''} ${isEditing?'editing':''}`} key={i}>
          <input type="checkbox" checked={!!b.selected} onChange={()=>toggle(i)} aria-label="Selecionar trecho"/>
          <div className="block-content">
            {isEditing ? <div className="editor">
              <div className="editor-field"><label>Acordes</label><textarea value={chordsText} onChange={e=>updateBlock(i,applyEdits(b,e.target.value,lyricText),true)} rows={Math.max(2,chordsText.split('\n').length)} /></div>
              <div className="editor-field"><label>Início do verso</label><input value={lyricText} onChange={e=>updateBlock(i,applyEdits(b,chordsText,e.target.value),true)} placeholder="Ex.: Mesmo estando em guerra" /></div>
              <div className="editor-actions"><button className="undo-button" onClick={()=>undoBlock(i)} disabled={!hasUndo}>↶ Desfazer</button><button className="save-edit" onClick={saveEditing}>Concluir edição</button></div>
            </div> : <BlockPreview block={b}/>} 
          </div>
          {!isEditing && <button className="edit-button" onClick={()=>startEditing(i)}>Editar</button>}
        </div>;
      })}</div>
      <div className="song-actions">
        <button className="advance" onClick={advanceSong}>{songs.length + 1 < 4 ? 'Avançar para próxima música' : 'Adicionar 4ª música'}</button>
      </div>
    </section>}

    {songs.length===4&&<section className="card no-print ready-card">
      <h2>As 4 músicas estão prontas! 🎵</h2>
      <p>O PDF será gerado com somente as músicas e os trechos que você selecionou.</p>
      <button className="pdf" onClick={pdf}>Gerar PDF com 4 músicas</button>
    </section>}

    <div className="print-document">
      {songs.map((song,i)=><SelectedSong song={song} key={i}/>)}
    </div>
  </main>
}
