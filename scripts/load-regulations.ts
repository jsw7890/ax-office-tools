import { getDb } from "../src/lib/bootstrap";
import { reloadRegulations } from "../src/lib/regulations";

const db = await getDb();
await reloadRegulations(db);
console.log("규정 조항을 로컬 데이터베이스에 다시 넣었습니다.");
await db.close();
