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
  | { action: "list_reservations" }
  | { action: "enable_reminder" }
  | { action: "create_ticket"; category?: "pc" | "account" | "printer_network" | "etc"; title?: string; description?: string; urgency?: "normal" | "urgent" }
  | { action: "list_tickets" }
  | { action: "ticket_detail"; hint?: string }
  | { action: "none" };

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

function parseDate(text: string): string | undefined {
  if (/오늘/.test(text)) return seoulToday();
  if (/내일/.test(text)) return addDays(seoulToday(), 1);
  const ymd = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    const year = seoulToday().slice(0, 4);
    return `${year}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
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

export function parseOfficeIntent(question: string): OfficeAction {
  const text = question.replace(/\s+/g, " ").trim();
  if (/날씨|맛집|농담|주식|운세/.test(text)) return { action: "none" };

  if (/모니터|프린터|비밀번호|노트북|컴퓨터|와이파이/.test(text) && /안|고장|문의|초기화|안됨/.test(text) && !/규정|근로|연차/.test(text)) {
    return {
      action: "create_ticket",
      category: parseCategory(text),
      title: text.slice(0, 40),
      description: text,
      urgency: /긴급|급해|당장/.test(text) ? "urgent" : "normal",
    };
  }

  if (/10\s*분|알람|알림/.test(text) && /예약|회의|켜/.test(text)) {
    return { action: "enable_reminder" };
  }
  if (/예약\s*내역|내\s*예약|예약\s*확인|예약\s*목록/.test(text)) {
    return { action: "list_reservations" };
  }
  if (/문의\s*목록|내\s*문의|티켓\s*목록|헬프데스크\s*목록/.test(text)) {
    return { action: "list_tickets" };
  }
  if (/문의\s*상세|티켓\s*상세|문의\s*상태/.test(text)) {
    return { action: "ticket_detail", hint: text };
  }
  if (/문의\s*등록|헬프데스크.*등록|IT\s*(helpdesk|헬프).*등록|고장|안\s*됩니다|수리/.test(text) && /규정|근로|연차/.test(text) === false) {
    if (/회의실|예약/.test(text) && !/IT|헬프|문의|고장/.test(text)) {
      // fall through to booking
    } else if (/IT|헬프|문의|고장|프린터|모니터|계정|비밀번호/.test(text)) {
      return {
        action: "create_ticket",
        category: parseCategory(text),
        title: text.slice(0, 40),
        description: text,
        urgency: /긴급|급해|당장/.test(text) ? "urgent" : "normal",
      };
    }
  }
  if (/회의실|예약/.test(text)) {
    const start = parseClock(text);
    const range = text.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*(?:부터|~|-)\s*(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
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
    const titleMatch = text.match(/(?:제목|안건)\s*[:：]?\s*(.+)$/);
    const title = titleMatch?.[1]?.slice(0, 80) || (people ? `${people}명 회의` : /미팅|회의/.test(text) ? "회의" : "예약");
    return {
      action: "book_room",
      roomName: parseRoom(text),
      date: parseDate(text) ?? seoulToday(),
      startMinutes,
      endMinutes,
      title,
      people,
      anyEmpty: /빈\s*회의실|비어\s*있|아무\s*회의실|남는\s*방|가능한\s*회의실/.test(text) || !parseRoom(text),
    };
  }
  if (/IT|헬프데스크|helpdesk|문의\s*등록/.test(text)) {
    return {
      action: "create_ticket",
      category: parseCategory(text),
      title: text.slice(0, 40),
      description: text,
      urgency: /긴급|급해|당장/.test(text) ? "urgent" : "normal",
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
