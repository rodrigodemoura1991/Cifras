'use client';
import { useState } from 'react';

function BlockLines({ block }) {
  if (Array.isArray(block.lines) && block.lines.length) {
    // Na tela de seleção, mostrar somente o início do verso:
    // a primeira linha que contém letra, e não a última.
    const lyric = block.lines.find((line) => line.lyric)?.lyric || '';
    return (
      <div className="music-lines">
        {block.lines.map((line, index) => (
          <div className="music-line" key={index}>
            <div className="line-chords">{line.chords || ''}</div>
          </div>
        ))}
        {lyric && <div className="line-lyric block-anchor">{lyric}...</div>}
      </div>
    );
  }

  return (
    <div className="music-lines">
      <div className="music-line">
        <div className="line-chords">{Array.isArray(block.chords) ? block.chords.join('  ') : block.chords || ''}</div>
      </div>
      {block.anchor && <div className="line-lyric block-anchor">{block.anchor}...</div>}
    </div>
  );
}

export default function Home(){
  const [url,setUrl]=useState(''),[loading,setLoading]=useState(false),[blocks,setBlocks]=useState([]),[error,setError]=useState('');
  async function processCifra(){
    setError('');setLoading(true);
    try{
      const r=await fetch('/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||'Não foi possível processar.');
      setBlocks(d.blocks||[]);
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  function toggle(i){setBlocks(p=>p.map((b,n)=>n===i?{...b,selected:!b.selected}:b))}
  function selectAll(v){setBlocks(p=>p.map(b=>({...b,selected:v})))}
  function pdf(){if(blocks.some(b=>b.selected))window.print();}
  return <main className="wrap">
    <header><div className="logo">♪</div><div><h1>Cifras</h1><p>Monte sua cifra personalizada em PDF</p></div></header>
    <section className="card"><label>Link do Cifra Club</label><div className="row"><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Cole aqui o link da cifra..."/><button onClick={processCifra} disabled={loading||!url}>{loading?'Processando...':'Processar cifra'}</button></div>{error&&<div className="error">{error}</div>}</section>
    {blocks.length>0&&<section className="card"><div className="toolbar"><div><h2>{blocks[0].title}</h2><p>{blocks[0].artist}</p></div><div><button className="ghost" onClick={()=>selectAll(true)}>Selecionar todos</button><button className="ghost" onClick={()=>selectAll(false)}>Limpar</button></div></div><p className="hint">Marque somente os trechos que você quer no PDF.</p><div className="blocks">{blocks.map((b,i)=><label className={`block ${b.selected?'selected':''}`} key={i}><input type="checkbox" checked={!!b.selected} onChange={()=>toggle(i)}/><div className="block-content"><BlockLines block={b}/></div></label>)}</div><button className="pdf" onClick={pdf}>Gerar PDF dos selecionados</button></section>}
  </main>
}
