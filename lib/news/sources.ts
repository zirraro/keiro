import { XMLParser } from 'fast-xml-parser'

export type RawNews = {
  title: string
  link: string
  pubDate?: string
  description?: string
}

export async function fetchGoogleNews(
  query: string,
  opts: { lang?: string; region?: string; max?: number } = {}
): Promise<RawNews[]> {
  const lang = (opts.lang ?? 'fr').toLowerCase()      // 'fr'
  const region = (opts.region ?? 'FR').toUpperCase()  // 'FR'
  const max = Math.max(1, Math.min(opts.max ?? 20, 50))

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${region}&ceid=${region}:${lang}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`google news http ${res.status}`)

  const xml = await res.text()
  const parser = new XMLParser({ ignoreAttributes: false })
  const j = parser.parse(xml)

  const items: any[] =
    j?.rss?.channel?.item
      ? (Array.isArray(j.rss.channel.item) ? j.rss.channel.item : [j.rss.channel.item])
      : []

  return items.slice(0, max).map((it: any) => ({
    title: (it?.title ?? '').toString(),
    link: (it?.link ?? '').toString(),
    pubDate: it?.pubDate ? new Date(it.pubDate).toISOString() : undefined,
    description: (it?.description ?? '').toString(),
  }))
}
