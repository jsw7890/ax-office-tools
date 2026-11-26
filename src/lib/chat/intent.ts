import { addDays, seoulToday, seoulToIso } from "@/lib/time";

export type OfficeAction =
  | {
      action: "book_room";
      roomName?: string;
      date?: string;
      startMinutes?: number;
      endMinutes?: number;
      title?: string;
      people?: number;
      anyEmpty?: boolean;
    }
  | { action: "cancel_reservation"; date?: string; startMinutes?: number; roomName?: string }
  | { action: "list_reservations" }
  | { action: "enable_reminder" }
  | {
      action: "create_ticket";
      category?: "pc" | "account" | "printer_network" | "etc";
      title?: string;
      description?: string;
      urgency?: "normal" | "urgent";
    }
  | { action: "list_tickets" }
  | { action: "ticket_detail"; hint?: string }
  | { action: "none" };

const WEEKDAY: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function utcDayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function mondayOfWeek(date: string): string {
  const dow = utcDayOfWeek(date);
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(date, offset);
}

function minutesFromClock(hour: number, minute: number, pm?: boolean): number {
  let h = hour;
  if (pm === true && h < 12) h += 12;
  if (pm === false && h === 12) h = 0;
  return h * 60 + minute;
}

function officeHour(hour: number, minute: number, pm?: boolean): number {
  if (pm !== undefined) return minutesFromClock(hour, minute, pm);
  if (hour >= 1 && hour <= 6) return minutesFromClock(hour, minute, true);
  return minutesFromClock(hour, minute, pm);
}

function parseClock(text: string): number | undefined {
  const half = text.match(/(오전|오후)?\s*(\d{1,2})\s*시\s*반/);
  if (half) {
    const pm = half[1] === "오후" ? true : half[1] === "오전" ? false : undefined;
    return officeHour(Number(half[2]), 30, pm);
  }
  const kor = text.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (kor) {
    const pm = kor[1] === "오후" ? true : kor[1] === "오전" ? false : undefined;
    return officeHour(Number(kor[2]), Number(kor[3] ?? 0), pm);
  }
  const colon = text.match(/(\d{1,2}):(\d{2})/);
  if (colon) return officeHour(Number(colon[1]), Number(colon[2]));
  return undefined;
}

function parsePeople(text: string): number | undefined {
  const labeled = text.match(/인원\s*(?:은|는|:|：)?\s*(\d{1,2})/);
  if (labeled) return Number(labeled[1]);
  const named = text.match(/(\d{1,2})\s*명/);
  if (named) return Number(named[1]);
  return undefined;
}

function weekdayOnOrAfter(from: string, targetDow: number): string {
  let d = from;
  for (let i = 0; i < 8; i++) {
    if (utcDayOfWeek(d) === targetDow) return d;
    d = addDays(d, 1);
  }
  return from;
}

function parseWeekdayDate(text: string, today: string): string | undefined {
  const labeled = text.match(/(이번\s*주|다음\s*주)\s*(월|화|수|목|금|토|일)요일/);
  const bare = text.match(/(?<![가-힣])(월|화|수|목|금|토|일)요일/);
  const weekTag = labeled?.[1];
  const dayChar = labeled?.[2] ?? bare?.[1];
  if (!dayChar) return undefined;
  const target = WEEKDAY[dayChar];
  if (weekTag && /다음/.test(weekTag)) {
    const base = addDays(today, 7);
    return weekdayOnOrAfter(base, target);
  }
  if (weekTag && /이번/.test(weekTag)) {
    const mon = mondayOfWeek(today);
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      if (utcDayOfWeek(d) === target && d >= today) return d;
    }
    return addDays(today, 7);
  }
  let d = addDays(today, 1);
  return weekdayOnOrAfter(d, target);
}

function parseDate(text: string, today: string): string | undefined {
  if (/내일모레/.test(text)) return addDays(today, 2);
  if (/(?<![가-힣])모레(?![가-힣])/.test(text)) return addDays(today, 2);
  if (/글피/.test(text)) return addDays(today, 3);
  if (/내일/.test(text)) return addDays(today, 1);
  if (/오늘/.test(text)) return today;

  const weekday = parseWeekdayDate(text, today);
  if (weekday) return weekday;

  const ymd = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const slash = text.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?!\d)/);
  if (slash) {
    const year = slash[3] ?? today.slice(0, 4);
    const candidate = `${year}-${String(slash[1]).padStart(2, "0")}-${String(slash[2]).padStart(2, "0")}`;
    if (!slash[3] && candidate < today) {
      return `${Number(year) + 1}-${String(slash[1]).padStart(2, "0")}-${String(slash[2]).padStart(2, "0")}`;
    }
    return candidate;
  }

  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    const year = Number(today.slice(0, 4));
    let candidate = `${year}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
    if (candidate < today) {
      candidate = `${year + 1}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
    }
    return candidate;
  }
  return undefined;
}

function parseRoom(text: string): string | undefined {
  const named = text.match(/회의실\s*([ABC])/i);
  if (named) return `회의실 ${named[1].toUpperCase()}`;
  if (/A실|에이실/.test(text)) return "회의실 A";
  if (/B실|비실/.test(text)) return "회의실 B";
  if (/C실|씨실/.test(text)) return "회의실 C";
  return undefined;
}

function parseCategory(text: string): "pc" | "account" | "printer_network" | "etc" {
  if (/모니터|컴퓨터|PC|노트북|화면/i.test(text)) return "pc";
  if (/계정|비밀번호|로그인|메일함/.test(text)) return "account";
  if (/프린터|네트워크|와이파이|인터넷/.test(text)) return "printer_network";
  return "etc";
}

function officeRequestPhrase(text: string): boolean {
  return /(예약해|예약\s*해|취소해|취소\s*해|등록해|등록\s*해|초기화해|알람\s*켜|알림\s*켜|문의\s*등록|헬프데스크.*등록|IT\s*(helpdesk|헬프).*등록)/i.test(
    text,
  );
}

function faultPhrase(text: string): boolean {
  return /(안\s*켜|안\s*돼|안\s*됨|안\s*됩니다|켜지지\s*않|고장|먹통|작동하지\s*않|초기화)/.test(text);
}

function looksLikeRegulation(text: string): boolean {
  if (/안내해줘|안내해\s*주/.test(text) && !/(등록|초기화|고장|켜지지)/.test(text)) return true;
  const lawCue =
    /(규정|근로|법률|조문|임금|교육은|점심\s*먹|며칠\s*전|몇\s*칠\s*전|받을\s*수\s*있|받아\?|해야\s*해\?|어떻게\s*돼|돼\?|인가요)/.test(text);
  if (lawCue && !officeRequestPhrase(text)) return true;
  if (!officeRequestPhrase(text) && /(월급|해고|휴가|연차|야근|근로계약|취업규칙|알바|직원|괴롭|퇴사)/.test(text)) return true;
  return false;
}

function bookingTitle(text: string, people?: number): string {
  const titleMatch = text.match(/(?:제목|안건)\s*[:：]?\s*(.+)$/);
  if (titleMatch?.[1]) return titleMatch[1].slice(0, 80);
  const between = text.match(
    /\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?\s*(?:부터|~|-)\s*(?:오전|오후)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?\s+(.+?)\s*예약/,
  );
  if (between?.[1]) return between[1].trim().slice(0, 80);
  if (people) return `${people}명 회의`;
  if (/미팅|회의/.test(text)) return "회의";
  return "예약";
}

export function parseOfficeIntent(question: string, today: string = seoulToday()): OfficeAction {
  const text = question.replace(/\s+/g, " ").trim();
  if (/날씨|맛집|농담|주식|운세|메뉴\s*추천/.test(text)) return { action: "none" };
  if (looksLikeRegulation(text)) return { action: "none" };

  if (/10\s*분|알람|알림/.test(text) && /(켜|설정)/.test(text) && /예약|회의/.test(text)) {
    return { action: "enable_reminder" };
  }

  if (/예약\s*내역|내\s*예약|예약\s*확인|예약\s*목록/.test(text) && !/취소해/.test(text)) {
    return { action: "list_reservations" };
  }

  if (/문의\s*목록|내\s*문의|티켓\s*목록|헬프데스크\s*목록/.test(text)) {
    return { action: "list_tickets" };
  }

  if (
    /(문의\s*상세|티켓\s*상세|문의\s*상태|상태\s*알려|상세\s*보여)/.test(text) ||
    (/상태|알려줘|알려\s*주/.test(text) && /(문의|티켓|프린터|헬프)/.test(text) && !/(등록|접수)/.test(text))
  ) {
    return { action: "ticket_detail", hint: text };
  }

  if (/취소해|취소\s*해/.test(text) && /예약|회의실/.test(text)) {
    return {
      action: "cancel_reservation",
      date: parseDate(text, today),
      startMinutes: parseClock(text),
      roomName: parseRoom(text),
    };
  }

  if (/내\s*예약\s*취소/.test(text)) {
    return { action: "cancel_reservation" };
  }

  const wantsBook =
    /(예약해|예약\s*해|예약해줘)/.test(text) ||
    (/회의실/.test(text) && /\d{1,2}\s*시/.test(text) && /예약/.test(text));

  if (wantsBook && /회의실|예약/.test(text) && !/취소/.test(text)) {
    const start = parseClock(text);
    const range = text.match(
      /(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*(?:부터|~|-)\s*(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/,
    );
    let startMinutes = start;
    let endMinutes: number | undefined;
    if (range) {
      const startPm = range[1] === "오후" ? true : range[1] === "오전" ? false : undefined;
      const endPm = range[4] === "오후" ? true : range[4] === "오전" ? false : startPm;
      startMinutes = officeHour(Number(range[2]), Number(range[3] ?? 0), startPm);
      endMinutes = officeHour(Number(range[5]), Number(range[6] ?? 0), endPm);
    } else if (startMinutes != null) {
      endMinutes = startMinutes + 60;
    }
    const people = parsePeople(text);
    return {
      action: "book_room",
      roomName: parseRoom(text),
      date: parseDate(text, today),
      startMinutes,
      endMinutes,
      title: bookingTitle(text, people),
      people,
      anyEmpty: /빈\s*회의실|비어\s*있|아무\s*회의실|남는\s*방|가능한\s*회의실/.test(text) || !parseRoom(text),
    };
  }

  if (
    officeRequestPhrase(text) &&
    /(IT|헬프데스크|helpdesk|문의\s*등록|프린터|모니터|계정|비밀번호)/i.test(text) &&
    !/상태\s*알려/.test(text)
  ) {
    return {
      action: "create_ticket",
      category: parseCategory(text),
      title: text.slice(0, 40),
      description: text,
      urgency: /긴급|급해|당장/.test(text) ? "urgent" : "normal",
    };
  }

  if (faultPhrase(text) && /(모니터|프린터|비밀번호|노트북|컴퓨터|와이파이|키보드|PC)/i.test(text)) {
    return {
      action: "create_ticket",
      category: parseCategory(text),
      title: text.slice(0, 40),
      description: text,
      urgency: /긴급|급해|당장/.test(text) ? "urgent" : "normal",
    };
  }

  if (/초기화해/.test(text) && /비밀번호|계정/.test(text)) {
    return {
      action: "create_ticket",
      category: "account",
      title: text.slice(0, 40),
      description: text,
      urgency: "normal",
    };
  }

  return { action: "none" };
}

export function bookingIso(date: string, startMinutes: number, endMinutes: number): { startAt: string; endAt: string } {
  return {
    startAt: seoulToIso(date, startMinutes),
    endAt: seoulToIso(date, endMinutes),
  };
}