export const runtime="nodejs";
export async function GET(){
  const env={
    OPENAI_API_KEY:process.env.OPENAI_API_KEY?'set':'unset',
    REPLICATE_API_TOKEN:process.env.REPLICATE_API_TOKEN?'set':'unset',
    SEEDREAM_PROVIDER:process.env.SEEDREAM_PROVIDER||'unset',
    SEEDREAM_BASE_URL:process.env.SEEDREAM_BASE_URL?'set':'unset',
    SEEDREAM_API_KEY:process.env.SEEDREAM_API_KEY?'set':'unset',
    IMAGE_GEN_URL:process.env.IMAGE_GEN_URL?'set':'unset',
    NEWSAPI_KEY:process.env.NEWSAPI_KEY?'set':'unset',
    GNEWS_KEY:process.env.GNEWS_KEY?'set':'unset',
    NEWSDATA_KEY:process.env.NEWSDATA_KEY?'set':'unset',
    NEWS_MIN_SCORE:Number(process.env.NEWS_MIN_SCORE||'1.8'),
  };
  return new Response(JSON.stringify({env}),{status:200,headers:{'content-type':'application/json'}});
}
