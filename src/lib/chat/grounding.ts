const UNIT_PATTERN = /(\d+(?:\.\d+)?)\s*(일|주|개월|년|시간|분|퍼센트|%|배|명|세|원|회)/g;
const HANGUL_QUANTITY = /십오|삼십|이십|사십|오십|육십|칠십|팔십|구십|백|천/;

export type NumberUnit = { number: string; unit: string };

export function normalizeEvidence(text: string): string {
  return text.replace(/\s+/g, "");
}

export function extractNumberUnits(text: string): NumberUnit[] {
  const found: NumberUnit[] = [];
  const pattern = new RegExp(UNIT_PATTERN.source, "g");
  for (const match of text.matchAll(pattern)) {
    const unit = match[2] === "퍼센트" ? "%" : match[2];
    found.push({ number: match[1], unit });
  }
  return found;
}

export function containsHangulQuantity(text: string): boolean {
  return HANGUL_QUANTITY.test(text);
}

export function answerIsGrounded(answer: string, evidence: string): boolean {
  const compact = normalizeEvidence(evidence);
  return extractNumberUnits(answer).every((item) => {
    const glued = `${item.number}${item.unit}`;
    if (compact.includes(glued)) return true;
    if (item.unit === "%" && compact.includes(`${item.number}퍼센트`)) return true;
    return false;
  });
}

export function normalizeArticleNo(value: string): string {
  const match = value.match(/제\d+조(?:의\d+)?/);
  return match ? match[0] : value.trim();
}

export function articlesAllowed(claimed: string[], allowed: string[]): boolean {
  if (claimed.length === 0) return false;
  return claimed.map(normalizeArticleNo).every((article) => allowed.includes(article));
}
