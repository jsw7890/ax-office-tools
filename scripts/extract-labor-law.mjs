import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const htmlPath = process.argv[2];
const outPath = process.argv[3];
if (!htmlPath || !outPath) {
  console.error("usage: node scripts/extract-labor-law.mjs <html> <json>");
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");

function decode(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function plain(fragment) {
  return decode(
    fragment
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<span class="sfon">[\s\S]*?<\/span>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const blocks = html.split('<div class="lawcon">').slice(1);
const chunks = [];

for (const block of blocks) {
  const labelMatch = block.match(/<label[^>]*>([\s\S]*?)<\/label>/i);
  if (!labelMatch) continue;
  const label = plain(labelMatch[1]).replace(/\s+/g, " ").trim();
  const article = label.match(/^제(\d+)조(?:의(\d+))?\s*\(([\s\S]+)\)\s*$/);
  if (!article) continue;
  const articleNo = article[2] ? `제${article[1]}조의${article[2]}` : `제${article[1]}조`;
  const heading = article[3].replace(/\s+/g, " ").trim();
  const afterLabel = block.slice(labelMatch.index + labelMatch[0].length);
  const content = plain(afterLabel);
  if (content.length < 2) continue;
  const sortOrder = Number(article[1]) * 10 + (article[2] ? Number(article[2]) : 0);
  chunks.push({ articleNo, heading, content, sortOrder });
}

chunks.sort((a, b) => a.sortOrder - b.sortOrder || a.articleNo.localeCompare(b.articleNo, "ko"));

const doc = {
  title: "근로기준법",
  publisher: "법제처 국가법령정보센터",
  sourceUrl: "https://www.law.go.kr/법령/근로기준법",
  baseDate: "2026-10-08",
  promulgatedOn: "2026-04-07",
  lawNumber: "법률 제21533호",
  lawId: "001872",
  lsiSeq: "285279",
  isSample: true,
  fetchedAt: "2026-11-06",
  usage:
    "대한민국 저작권법 제7조 제1호에 따라 법률 조문은 저작권 보호 대상이 아닙니다. 국가법령정보센터 화면의 HTML과 디자인은 저장하지 않았고, 2026-11-06에 시행일 2026-10-08(법률 제21533호, 공포 2026-04-07) 조문 텍스트만 추출했습니다. 이 자료는 공개 법령 샘플이며 특정 회사의 취업규칙이 아닙니다.",
  chunks,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`chunks=${chunks.length} bytes=${Buffer.byteLength(JSON.stringify(doc))}`);
