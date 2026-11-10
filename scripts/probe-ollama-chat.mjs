const res = await fetch("http://127.0.0.1:11434/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "qwen2.5:0.5b",
    stream: false,
    messages: [
      { role: "system", content: "짧게 답하세요." },
      { role: "user", content: "1주 근로시간은 40시간입니다. 이 조문만 보고 한 줄로 답하세요. 질문: 1주 근로시간은?" },
    ],
  }),
});
console.log("HTTP", res.status);
const text = await res.text();
console.log(text.slice(0, 2000));
