export interface DateRange {
  from: Date;
  to: Date;
}

export function parseDateRange(searchParams: URLSearchParams): DateRange {
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : daysBeforeDate(to, 7);

  to.setHours(23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

export function previousPeriod(range: DateRange): DateRange {
  const diff = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - diff),
    to: new Date(range.from.getTime() - 1),
  };
}

function daysBeforeDate(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - n);
  return copy;
}

export function jsonCached(data: unknown, maxAgeSeconds = 30): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `s-maxage=${maxAgeSeconds}, stale-while-revalidate`,
    },
  });
}
