import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_FALLBACK = 'https://cifraclub-api.vercel.app/api/cifra';

function isCifraClubUrl(value) {
  try {
    const u = new URL(value);
    return u.hostname === 'www.cifraclub.com.br' || u.hostname === 'cifraclub.com.br';
  } catch {
    return false;
  }
}

function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getArtistSongFromUrl(value) {
  const u = new URL(value);
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const ignored = new Set(['letra', 'imprimir', 'tab', 'tabs', 'guitarra', 'violao', 'bateria']);
  const useful = parts.filter(p => !ignored.has(p.toLowerCase()));
  if (useful.length < 2) return null;
  return { artist: slug(useful[0]), song: slug(useful[1]) };
}

function htmlToStructuredText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(p|div|li|tr|section|article|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeBlocks(data) {
  if (!Array.isArray(data?.blocks)) return { ...data, blocks: [] };
  const blocks = data.blocks.map(block => {
    const lines = Array.isArray(block.lines)
      ? block.lines.map(line => ({
          chords: typeof line?.chords === 'string' ? line.chords.trim() : '',
          lyric: typeof line?.lyric === 'string' ? line.lyric.trim() : ''
        })).filter(line => line.chords || line.lyric)
      : [];
    const fallbackChords = Array.isArray(block.chords)
      ? block.chords.map(v => String(v).trim()).filter(Boolean)
      : (typeof block.chords === 'string' ? block.chords.split('\n').map(v => v.trim()).filter(Boolean) : []);
    const finalLines = lines.length ? lines : fallbackChords.map(chords => ({ chords, lyric: '' }));
    const anchor = typeof block.anchor === 'string' && block.anchor.trim()
      ? block.anchor.trim()
      : (finalLines.find(line => line.lyric)?.lyric || '');
    return { ...block, lines: finalLines, anchor };
  }).filter(block => block.lines.length || block.anchor);
  return { ...data, blocks };
}

function noteValue(note) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return map[note] ?? null;
}

function normalizeKey(key) {
  if (typeof key !== 'string') return '';
  const m = key.trim().match(/^([A-Ga-g])([#b]?)(?:m)?$/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : '';
}

function transposeChordToken(token, semitones, preferFlats) {
  const match = token.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return token;
  const root = `${match[1].toUpperCase()}${match[2]}`;
  if (noteValue(root) === null) return token;
  const suffix = match[3] || '';
  const bassMatch = suffix.match(/^(.*?)(?:\/)([A-Ga-g])([#b]?)$/);
  const quality = bassMatch ? bassMatch[1] : suffix;
  const bass = bassMatch ? `${bassMatch[2].toUpperCase()}${bassMatch[3]}` : '';
  const sharpNotes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const flatNotes = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const notes = preferFlats ? flatNotes : sharpNotes;
  const newRoot = notes[(noteValue(root) + semitones + 120) % 12];
  const newBass = bass && noteValue(bass) !== null ? `/${notes[(noteValue(bass) + semitones + 120) % 12]}` : '';
  return `${newRoot}${quality}${newBass}`;
}

function transposeChordLine(line, semitones, preferFlats) {
  return String(line || '').split(/(\s+)/).map(token => {
    if (!/^([A-Ga-g])([#b]?)(.*)$/.test(token)) return token;
    const chordLike = /^([A-Ga-g])([#b]?)(?:(?:maj|min|m|M|dim|aug|sus|add)?(?:2|4|5|6|7|9|11|13)?(?:b5|#5)?)(?:\/[A-Ga-g][#b]?)?$/.test(token);
    return chordLike ? transposeChordToken(token, semitones, preferFlats) : token;
  }).join('');
}

function transposeBlocks(data, originalKey, targetKey) {
  const from = noteValue(normalizeKey(originalKey));
  const to = noteValue(normalizeKey(targetKey));
  if (from === null || to === null || !Array.isArray(data?.blocks)) return data;
  const semitones = (to - from + 12) % 12;
  const preferFlats = /b/.test(normalizeKey(targetKey));
  return {
    ...data,
    key: normalizeKey(targetKey),
    blocks: data.blocks.map(block => ({
      ...block,
      chords: Array.isArray(block.chords) ? block.chords.map(line => transposeChordLine(line, semitones, preferFlats)) : block.chords,
      lines: Array.isArray(block.lines) ? block.lines.map(line => ({ ...line, chords: transposeChordLine(line.chords, semitones, preferFlats) })) : block.lines
    }))
  };
}

async function fetchCifraContent(url) {
  const source = getArtistSongFromUrl(url);
  if (source) {
    try {
      const apiUrl = `${API_FALLBACK}?artist=${encodeURIComponent(source.artist)}&song=${encodeURIComponent(source.song)}`;
      const apiResponse = await fetch(apiUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        if (Array.isArray(apiData?.cifra) && apiData.cifra.length) {
          return {
            text: apiData.cifra.join('\n'),
            title: apiData.name || source.song,
            artist: apiData.artist || source.artist,
            source: 'cifraclub-api'
          };
        }
      }
    } catch (_) {}
  }

  const page = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CifrasPDF/1.0)' },
    cache: 'no-store'
  });
  if (!page.ok) throw new Error('O Cifra Club não permitiu acessar essa página agora.');
  const html = await page.text();
  return { text: htmlToStructuredText(html).slice(0, 60000), source: 'cifraclub-html' };
}

async function readUploadedFile(file) {
  const name = (file.name || 'arquivo').toLowerCase();
  const type = (file.type || '').toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 10 MB.');

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const parsed = await pdfParse(bytes);
    return { text: parsed.text.slice(0, 60000), title: file.name.replace(/\.pdf$/i, ''), artist: '', source: 'uploaded-pdf' };
  }

  if (type.includes('html') || /\.(html?|htm)$/i.test(name)) {
    return { text: htmlToStructuredText(bytes.toString('utf8')).slice(0, 60000), title: file.name.replace(/\.(html?|htm)$/i, ''), artist: '', source: 'uploaded-html' };
  }

  if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) {
    return { text: bytes.toString('utf8').slice(0, 60000), title: file.name.replace(/\.(txt|md|csv)$/i, ''), artist: '', source: 'uploaded-text' };
  }

  throw new Error('Formato não suportado. Envie PDF, TXT ou HTML.');
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'OPENAI_API_KEY ainda não foi configurada na Vercel.' }, { status: 500 });

    const contentType = request.headers.get('content-type') || '';
    let url = '';
    let targetKey = '';
    let content;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      url = String(form.get('url') || '').trim();
      targetKey = String(form.get('targetKey') || '').trim();
      const file = form.get('file');
      if (file && typeof file !== 'string') content = await readUploadedFile(file);
    } else {
      const body = await request.json();
      url = String(body.url || '').trim();
      targetKey = String(body.targetKey || '').trim();
    }

    if (!content) {
      if (!isCifraClubUrl(url)) return Response.json({ error: 'Cole um link válido do Cifra Club ou envie um arquivo.' }, { status: 400 });
      content = await fetchCifraContent(url);
    }

    if (!content.text || content.text.trim().length < 20) throw new Error('Não consegui encontrar conteúdo suficiente para reconhecer a cifra.');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Organize a cifra para visualização e PDF. Retorne JSON válido com title, artist, key e blocks.

O CONTEÚDO RECEBIDO PODE VIR DE PDF, TXT, HTML OU Cifra Club. Preserve a estrutura musical e NÃO descarte linhas de acordes só porque estão separadas das letras.

IDENTIFICAÇÃO DO TOM: encontre o tom original informado no material. Se não houver informação confiável, deduza somente quando houver evidência musical clara nos acordes. Nunca use números da URL ou do nome do arquivo como tom.

Cada block é uma parte natural (Intro, Primeira Parte, Pré-Refrão, Refrão, Ponte, Solo etc.). Cada block deve ter selected=true e lines. Preserve a ordem e as quebras musicais originais. Uma linha de acordes deve continuar sendo uma linha de acordes. Use somente a frase inicial curta de cada trecho como lyric/anchor; não invente letras.

IMPORTANTE: mantenha os acordes exatamente reconhecíveis para edição posterior, por exemplo B, C#m, G#m7, E, F#, B4, B/D#, etc. Não transforme acordes em descrições. Se houver várias linhas de acordes em um trecho, mantenha todas.`
        },
        {
          role: 'user',
          content: `Fonte: ${content.source || ''}\nTítulo detectado: ${content.title || ''}\nArtista detectado: ${content.artist || ''}\nConteúdo da cifra:\n${content.text.slice(0, 60000)}`
        }
      ]
    });

    let data = normalizeBlocks(JSON.parse(completion.choices[0].message.content));
    if (!data.title && content.title) data.title = content.title;
    if (!data.artist && content.artist) data.artist = content.artist;
    const originalKey = normalizeKey(data.key);
    data.originalKey = originalKey || data.key || '';

    if (!data.blocks.length) throw new Error('A cifra foi lida, mas os acordes não foram reconhecidos. Confira se o arquivo contém a cifra e tente novamente.');

    const desired = normalizeKey(typeof targetKey === 'string' ? targetKey : '');
    if (desired) data = transposeBlocks(data, originalKey || data.key, desired);
    else data.key = originalKey;

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao processar a cifra.' }, { status: 500 });
  }
}
