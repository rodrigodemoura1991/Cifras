import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isCifraClubUrl(value) {
  try {
    const u = new URL(value);
    return u.hostname === 'www.cifraclub.com.br' || u.hostname === 'cifraclub.com.br';
  } catch { return false; }
}

export async function POST(request) {
  try {
    const { url } = await request.json();
    if (!isCifraClubUrl(url)) return Response.json({ error: 'Cole um link válido do Cifra Club.' }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'OPENAI_API_KEY ainda não foi configurada na Vercel.' }, { status: 500 });

    const page = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CifrasPDF/1.0)' }, next: { revalidate: 0 } });
    if (!page.ok) throw new Error('O Cifra Club não permitiu acessar essa página agora.');
    const html = await page.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const clipped = text.slice(0, 50000);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Você organiza cifras musicais para uma visualização compacta. Retorne JSON válido com title, artist e blocks.
Cada block representa uma parte natural da música (intro, verso, pré-refrão, refrão, ponte etc.).
Cada block deve ter selected=true e lines.
Cada item de lines deve ter exatamente dois campos: chords (string) e lyric (string curta).
IMPORTANTE: mantenha a ordem musical e agrupe os acordes que pertencem à mesma linha da letra. A apresentação desejada é SEMPRE: linha de acordes em cima e a linha correspondente da letra logo abaixo. Quando uma parte tiver várias linhas, cada par acordes/letra deve ficar um abaixo do outro, sem juntar todas as cifras em uma única linha.
Use lyric apenas como uma âncora curta/inicial da linha, não reproduza a letra inteira. Preserve as palavras iniciais necessárias para reconhecer cada parte. Não invente acordes nem altere sua ordem.
Se não for possível identificar a letra correspondente, use lyric como uma âncora curta e mantenha os acordes daquela linha.`
        },
        { role: 'user', content: `URL: ${url}\nConteúdo da página:\n${clipped}` }
      ]
    });
    const data = JSON.parse(completion.choices[0].message.content);
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro ao processar a cifra.' }, { status: 500 });
  }
}
