import { getDb } from "@/lib/bootstrap";
import { AppError, mapDbError } from "@/lib/errors";
import { statusLabel } from "@/lib/labels";
import { oneOf, requiredText, requiredUuid } from "@/lib/validate";

const CATEGORIES = ["pc", "account", "printer_network", "etc"] as const;
const URGENCIES = ["normal", "urgent"] as const;
const STATUSES = ["received", "in_progress", "done"] as const;

export type Ticket = {
  id: string;
  requesterId: string;
  requesterName: string;
  category: string;
  title: string;
  description: string;
  urgency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
};

export type Comment = {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

function instant(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asTicket(row: Record<string, unknown>): Ticket {
  return {
    id: String(row.id),
    requesterId: String(row.requester_id),
    requesterName: String(row.requester_name ?? ""),
    category: String(row.category),
    title: String(row.title),
    description: String(row.description),
    urgency: String(row.urgency),
    status: String(row.status),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    doneAt: row.done_at == null ? null : instant(row.done_at),
  };
}

function asComment(row: Record<string, unknown>): Comment {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name ?? ""),
    body: String(row.body),
    createdAt: instant(row.created_at),
  };
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapDbError(error);
  }
}

const TICKET_SELECT = `
  select t.id, t.requester_id, p.name as requester_name, t.category, t.title, t.description,
         t.urgency, t.status, t.created_at, t.updated_at, t.done_at
  from tickets t
  join profiles p on p.id = t.requester_id
`;

export async function createTicket(
  userId: string,
  input: { category?: unknown; title?: unknown; description?: unknown; urgency?: unknown },
): Promise<Ticket> {
  const category = oneOf(input.category, CATEGORIES, "분류");
  const title = requiredText(input.title, 80, "제목");
  const description = requiredText(input.description, 4000, "내용");
  const urgency = oneOf(input.urgency, URGENCIES, "긴급도");
  const db = await getDb();
  return run(async () => {
    const recent = await db.withUser(userId, (sql) =>
      sql(
        `${TICKET_SELECT}
         where t.requester_id = auth.uid()
           and t.title = $1
           and t.description = $2
           and t.created_at > now() - interval '20 seconds'
         order by t.created_at desc
         limit 1`,
        [title, description],
      ),
    );
    if (recent[0]) return asTicket(recent[0]);
    const inserted = await db.withUser(userId, (sql) =>
      sql(
        `insert into tickets (requester_id, category, title, description, urgency, status)
         values (auth.uid(), $1, $2, $3, $4, 'received')
         returning id`,
        [category, title, description, urgency],
      ),
    );
    const rows = await db.withUser(userId, (sql) => sql(`${TICKET_SELECT} where t.id = $1`, [inserted[0]?.id]));
    return asTicket(rows[0]);
  });
}

export async function collapseDuplicateTickets(actorId: string): Promise<number> {
  const db = await getDb();
  return run(async () => {
    const profile = await db.withUser(actorId, (sql) => sql("select role from profiles where id = auth.uid()"));
    if (profile[0]?.role !== "admin") throw new AppError(403, "관리자만 중복 문의를 정리할 수 있습니다.", "forbidden");
    const extras = await db.asOwner((sql) =>
      sql(
        `with ranked as (
           select id,
             row_number() over (
               partition by requester_id, title
               order by case status when 'done' then 0 when 'in_progress' then 1 else 2 end, created_at
             ) as rn
           from tickets
         )
         select id from ranked where rn > 1`,
      ),
    );
    for (const row of extras) {
      const id = String(row.id);
      await db.asOwner((sql) => sql("delete from ticket_comments where ticket_id = $1", [id]));
      await db.asOwner((sql) => sql("delete from notifications where href = $1", [`/helpdesk/${id}`]));
      await db.asOwner((sql) => sql("delete from tickets where id = $1", [id]));
    }
    return extras.length;
  });
}

export async function listMyTickets(userId: string): Promise<Ticket[]> {
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) =>
      sql(`${TICKET_SELECT} where t.requester_id = auth.uid() order by t.created_at desc`),
    );
    return rows.map(asTicket);
  });
}

export async function listAllTickets(userId: string, status: unknown, category: unknown): Promise<Ticket[]> {
  const statusFilter = status ? oneOf(status, STATUSES, "상태") : null;
  const categoryFilter = category ? oneOf(category, CATEGORIES, "분류") : null;
  const db = await getDb();
  return run(async () => {
    const profile = await db.withUser(userId, (sql) => sql("select role from profiles where id = auth.uid()"));
    if (profile[0]?.role !== "admin") throw new AppError(403, "관리자만 전체 문의를 볼 수 있습니다.", "forbidden");
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `${TICKET_SELECT}
         where ($1::text is null or t.status = $1)
           and ($2::text is null or t.category = $2)
         order by t.created_at desc`,
        [statusFilter, categoryFilter],
      ),
    );
    return rows.map(asTicket);
  });
}

export async function getTicket(userId: string, ticketId: unknown): Promise<{ ticket: Ticket; comments: Comment[] }> {
  const id = requiredUuid(ticketId, "문의");
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) => sql(`${TICKET_SELECT} where t.id = $1`, [id]));
    if (!rows[0]) throw new AppError(404, "문의를 찾을 수 없습니다.", "not_found");
    const comments = await db.withUser(userId, (sql) =>
      sql(
        `select c.id, c.ticket_id, c.author_id, p.name as author_name, c.body, c.created_at
         from ticket_comments c
         join profiles p on p.id = c.author_id
         where c.ticket_id = $1
         order by c.created_at`,
        [id],
      ),
    );
    return { ticket: asTicket(rows[0]), comments: comments.map(asComment) };
  });
}

export async function changeTicketStatus(userId: string, ticketId: unknown, statusInput: unknown): Promise<Ticket> {
  const id = requiredUuid(ticketId, "문의");
  const status = oneOf(statusInput, STATUSES, "상태");
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) =>
      sql("update tickets set status = $2 where id = $1 returning id", [id, status]),
    );
    if (!rows[0]) throw new AppError(403, "문의 상태를 바꿀 수 없습니다.", "forbidden");
    const loaded = await db.withUser(userId, (sql) => sql(`${TICKET_SELECT} where t.id = $1`, [id]));
    const ticket = asTicket(loaded[0]);
    if (ticket.requesterId !== userId) {
      await db.withUser(userId, (sql) =>
        sql(
          `insert into notifications (user_id, kind, title, body, href)
           values ($1, 'helpdesk_status', $2, $3, $4)`,
          [ticket.requesterId, "IT helpdesk 상태가 바뀌었습니다", `${ticket.title} → ${statusLabel[ticket.status]}`, `/helpdesk/${ticket.id}`],
        ),
      );
    }
    return ticket;
  });
}

export async function addComment(userId: string, ticketId: unknown, bodyInput: unknown): Promise<Comment> {
  const id = requiredUuid(ticketId, "문의");
  const body = requiredText(bodyInput, 1000, "댓글");
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `insert into ticket_comments (ticket_id, author_id, body)
         values ($1, auth.uid(), $2)
         returning id, ticket_id, author_id, body, created_at`,
        [id, body],
      ),
    );
    const author = await db.withUser(userId, (sql) => sql("select name, role from profiles where id = auth.uid()"));
    const ticket = await db.withUser(userId, (sql) => sql("select requester_id, title from tickets where id = $1", [id]));
    const comment = asComment({ ...rows[0], author_name: author[0]?.name ?? "" });
    if (author[0]?.role === "admin" && ticket[0] && String(ticket[0].requester_id) !== userId) {
      await db.withUser(userId, (sql) =>
        sql(
          `insert into notifications (user_id, kind, title, body, href)
           values ($1, 'helpdesk_reply', $2, $3, $4)`,
          [String(ticket[0].requester_id), "IT helpdesk 답변이 달렸습니다", String(ticket[0].title ?? "문의"), `/helpdesk/${id}`],
        ),
      );
    }
    return comment;
  });
}
