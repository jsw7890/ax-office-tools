export type PendingAction =
  | {
      type: "reservation.create";
      summary: string;
      payload: { roomId: string; title: string; startAt: string; endAt: string };
    }
  | {
      type: "reservation.cancel";
      summary: string;
      payload: { reservationId: string };
    }
  | {
      type: "ticket.create";
      summary: string;
      payload: { category: string; title: string; description: string; urgency: string };
    };