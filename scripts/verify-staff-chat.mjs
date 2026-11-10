const base = "http://127.0.0.1:3460";
const headers = {
  "content-type": "application/json",
  origin: base,
  "x-requested-with": "ax-office",
};

const page = await fetch(`${base}/chat`);
const html = await page.text();
console.log("PAGE_STATUS", page.status);
console.log("PAGE_HAS_FUTURE", html.includes("향후 LLM"));
console.log("PAGE_HAS_HINT", html.includes("꺼져 있으면 조문 검색"));

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email: "staff@example.com" }),
});
const cookies = typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [login.headers.get("set-cookie")].filter(Boolean);
const cookie = cookies.map((item) => item.split(";")[0]).join("; ");
console.log("LOGIN", login.status, await login.text());
console.log("COOKIE", cookie);

const status = await fetch(`${base}/api/chat/status`, { headers: { ...headers, cookie } });
console.log("STATUS", await status.text());

const ask = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { ...headers, cookie },
  body: JSON.stringify({ question: "1주 근로시간은 최대 몇 시간인가요?" }),
});
console.log("ASK_STATUS", ask.status);
console.log("ASK", await ask.text());
