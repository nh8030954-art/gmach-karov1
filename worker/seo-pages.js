export const PUBLIC_PAGES = {
  "/": ["גמ״ח ברגע — גמ״חים והשאלת ציוד בכל הארץ", "מצאו גמ״חים וציוד להשאלה קרוב לבית, ללא תשלום או בתשלום סמלי."],
  "/catalog": ["חיפוש ציוד להשאלה | גמ״ח ברגע", "חפשו פריטים להשאלה לפי קטגוריה ועיר, ללא תשלום או בתשלום סמלי."],
  "/gmachim": ["גמ״חים ברחבי הארץ | גמ״ח ברגע", "מצאו גמ״חים ברחבי הארץ וצפו בפרטי השירות והציוד שהם מציעים."],
  "/how-it-works": ["איך שואלים ציוד | גמ״ח ברגע", "מוצאים פריט, שולחים בקשת השאלה ומתאמים איסוף והחזרה."],
  "/community": ["לוח בקשות עזרה | גמ״ח ברגע", "בקשות עזרה וציוד מהקהילה, וחיבור בין מי שצריך למי שיכול לעזור."]
};
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function publicPageHtml(html, url) {
  const [title, description] = PUBLIC_PAGES[url.pathname];
  const canonical = url.origin + url.pathname;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escape(title) + "</title>")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:(?:title|description|url)["'][^>]*>/gi, "");
  return html.replace(/<head>/i, '<head>\n<link rel="canonical" href="' + escape(canonical) + '">\n<meta name="description" content="' + escape(description) + '">\n<meta property="og:title" content="' + escape(title) + '">\n<meta property="og:description" content="' + escape(description) + '">\n<meta property="og:url" content="' + escape(canonical) + '">');
}
export function notFoundResponse(head = false) {
  return new Response(head ? null : '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>הדף לא נמצא | גמ״ח ברגע</title></head><body><h1>הדף לא נמצא</h1><p>ייתכן שהכתובת השתנתה או שהדף הוסר.</p><a href="/">חזרה לדף הבית</a></body></html>', {status:404, headers:{"Content-Type":"text/html; charset=utf-8","X-Robots-Tag":"noindex","Cache-Control":"no-store"}});
}
export function robotsResponse(origin, head = false) {
  const body = "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /invite/\nSitemap: " + origin + "/sitemap.xml\n";
  return new Response(head ? null : body, {headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"public, max-age=3600"}});
}

export async function publicClosureResponse(request,env,closure,fallback){
  const path=new URL(request.url).pathname;
  if(!PUBLIC_PAGES[path]&&path!=="/index.html")return fallback;
  const response=await env.ASSETS.fetch(new Request(new URL("/sacred-closed.html",request.url),{method:"GET"}));
  if(!response.ok)return fallback;
  let html=await response.text();
  html=html.replace(/<meta\s+name=["']robots["'][^>]*>/gi,"").replace(/<script>[\s\S]*?<\/script>/gi,"")
    .replace(/(<h1 id="title">)[\s\S]*?(<\/h1>)/,(_,a,b)=>a+escape(closure.title)+b)
    .replace(/(<p id="message">)[\s\S]*?(<\/p>)/,(_,a,b)=>a+escape(closure.message)+b)
    .replace('<p id="reopen"></p>','<p id="reopen">האתר ישוב לפעילות בעזרת ה׳ במוצאי שבת.</p>');
  return new Response(request.method==="HEAD"?null:html,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Retry-After":"900"}});
}
