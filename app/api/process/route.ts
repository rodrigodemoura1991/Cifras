import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { url } = await req.json()

    if (!url || !/^https?:\/\/(www\.)?cifraclub\.com\.br\//i.test(url)) {
      return NextResponse.json(
        { error: 'Cole um link válido do Cifra Club.' },
        { status: 400 }
      )
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })

    if (!res.ok) {
      throw new Error('Não consegui acessar a cifra.')
    }

    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30000)

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ blocks: demoFromText(text) })
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Você organiza cifras musicais. Separe a música em trechos úteis para teclado. Para cada trecho, retorne apenas o começo da primeira frase cantada (curto, para localização) e a sequência de acordes daquele trecho. Se trechos consecutivos repetirem exatamente a mesma sequência de acordes, não duplique: mantenha uma única ocorrência. Responda JSON com {"blocks":[{"phrase":"...","chords":"..."}]}. Não invente acordes.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content || '{"blocks":[]}'
    const data = JSON.parse(raw)

    const blocks = (Array.isArray(data.blocks) ? data.blocks : [])
      .map((b: any, i: number) => ({
        id: i + 1,
        phrase: String(b?.phrase || ''),
        chords: String(b?.chords || ''),
      }))
      .filter((b: { phrase: string; chords: string }) => b.phrase && b.chords)

    return NextResponse.json({ blocks })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erro ao processar a cifra.' },
      { status: 500 }
    )
  }
}

function demoFromText(_text: string) {
  return [
    {
      id: 1,
      phrase: 'IA não configurada',
      chords: 'Configure OPENAI_API_KEY na Vercel para analisar o link.',
    },
  ]
}
