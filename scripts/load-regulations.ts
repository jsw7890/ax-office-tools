import { getDb } from "../src/lib/bootstrap";
import { reloadRegulations } from "../src/lib/regulations";

async function main() {
  const db = await getDb();
  await reloadRegulations(db);
  console.log("규정 조항을 로컬 데이터베이스에 다시 넣었습니다.");
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});