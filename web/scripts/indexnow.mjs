// Tells Bing (and the other IndexNow engines) about every page in the live
// sitemap, so new or changed pages get crawled within days instead of weeks.
// The key isn't a secret: IndexNow checks it by fetching public/<key>.txt.
// Run after a deploy that adds or changes pages:  node scripts/indexnow.mjs
const KEY = "a23866184020d0efefb7a55f1ceb3256";
const site = (process.argv[2] ?? "https://www.snaggo.tech").replace(/\/+$/, "");
const host = new URL(site).host;

const keyFile = await fetch(`${site}/${KEY}.txt`);
if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) {
  console.error(`The key file isn't live at ${site}/${KEY}.txt yet. Deploy first.`);
  process.exit(1);
}

const sitemap = await (await fetch(`${site}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => new URL(u).host === host);
if (!urlList.length) {
  console.error("No URLs for", host, "in the sitemap.");
  process.exit(1);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList }),
});
// 200 and 202 both mean accepted; 403 is a key problem, 422 a URL that doesn't match the host.
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
process.exit(res.ok ? 0 : 1);
