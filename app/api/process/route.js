import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isCifraClubUrl(value) {
  try {
    const u = new URL(value);
    return u.hostname === 'www.cifraclub.com.br' || u.hostname === 'cifraclub.com.br';
  } catch { return false; }
}

function htmlToStructuredText(html) {
  // Preserve the original musical line boundaries. Flattening all whitespace
  // was causing the model to invent line breaks based on screen width.
  return html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<br\\s*\\/?>(?=.)/gi, '\\n')
    .replace(/<\\/(p|div|li|tr|section|article|h[1-6])\\s*>/gi, '\\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\\r/g, '')
    .split('\\n')
    .map(line => line.replace(/\\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\\n');
}

export async function POST(request) {
  try {
    const { url } = await request.json();
    if (!isCifraClubUrl(url)) return Response.json({ error: 'Cole um link válido do Cifra Club.' }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'OPENAI_API_KEY ainda não foi configurada na Vercel.' }, { status: 500 });

    const page = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CifrasPDF/1.0)' },
      next: { revalidate: 0 }
    });
    if (!page.ok) throw new Error('O Cifra Club não permitiu acessar essa página agora.');

    const html = await page.text();
    const text = htmlToStructuredText(html);
    const clipped = text.slice(0, 60000);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Você organiza cifras musicais para uma visualização e PDF. Retorne JSON válido com title, artist e blocks.

Cada block representa uma parte natural da música (intro, verso, pré-refrão, refrão, ponte etc.). Cada block deve ter selected=true e lines.

REGRA PRINCIPAL — PRESERVE A ESTRUTURA ORIGINAL:
- A entrada contém quebras de linha preservadas da página original do Cifra Club.
- Essas quebras são MUSICAIS e devem ser respeitadas. NUNCA quebre uma linha por largura de tela, quantidade de caracteres ou tamanho do card.
- Não junte linhas musicais diferentes em uma só.
- Não crie novas linhas apenas porque uma linha ficou comprida.
- Mantenha os acordes exatamente na ordem em que aparecem.

FORMATO DE CADA PARTE:
- lines é uma lista na ordem musical.
- Cada item possui chords (string) e lyric (string).
- Normalmente, uma linha de acordes corresponde a uma linha musical.
- Quando a letra/frase original ocupa DUAS OU MAIS linhas de acordes, mantenha TODAS as linhas de acordes separadas e coloque a letra/âncora dessa frase SOMENTE NA ÚLTIMA linha de acordes do grupo.
- Assim, um trecho como:
  C F Em Am Dm Em F
  C F Em Am Dm Em F
  Mesmo estando em guerra...
  deve ser representado como duas linhas de chords, com lyric vazio na primeira e lyric="Mesmo estando em guerra..." na segunda.
- O resultado visual será, portanto: todas as linhas de acordes do grupo primeiro e a frase uma única vez abaixo delas.
- lyric deve ser apenas a frase inicial/âncora curta, sem reproduzir a letra inteira.
- Preserve as palavras iniciais que identificam o trecho.
- Não invente acordes. Não altere acordes. Não altere a ordem.

Se a página original já separar claramente uma frase em mais de uma linha, preserve exatamente essa separação.`
        },
        { role: 'user', content: `URL: ${url}\\nConteúdo estruturado da página original (quebras de linha preservadas):\\n${clipped}` }
      ]
    });

    const data = JSON.parse(completion.choices[0].message.content);
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao processar a cifra.' }, { status: 500 });
  }
}
