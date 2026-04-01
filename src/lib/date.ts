function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return { year, month, day };
}

export function getDateInputValueFromDate(date: Date) {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

export function getDateInputValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return getDateInputValueFromDate(date);
}

export function addMonthsToDateInputValue(dateValue: string, months: number) {
  const parsedDate = parseDateInput(dateValue);
  if (!parsedDate || !Number.isFinite(months)) {
    return "";
  }

  const targetMonthIndex = parsedDate.month - 1 + months;
  const targetYear = parsedDate.year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate();
  const targetDay = Math.min(parsedDate.day, lastDayOfTargetMonth);

  return getDateInputValueFromDate(
    new Date(targetYear, normalizedMonthIndex, targetDay),
  );
}

export function getDateInputValueFromIso(value?: string) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return getDateInputValueFromDate(parsed);
}

export function getTimeInputValueFromIso(value?: string, fallback = "09:00") {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return `${padTwo(parsed.getHours())}:${padTwo(parsed.getMinutes())}`;
}

export function buildIsoFromDate(dateValue: string, hour: number, minute = 0) {
  const parsedDate = parseDateInput(dateValue);
  if (!parsedDate) {
    return "";
  }

  return new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    hour,
    minute,
    0,
    0,
  ).toISOString();
}

export function buildIsoFromDateTime(dateValue: string, timeValue: string) {
  const parsedDate = parseDateInput(dateValue);
  const [hour, minute] = timeValue.split(":").map(Number);
  if (
    !parsedDate ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return "";
  }

  return new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    hour,
    minute,
    0,
    0,
  ).toISOString();
}

export function addMinutesToIso(value: string, minutes: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function getLocalDateKey(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return getDateInputValueFromDate(parsed);
}

export function getTodayDateKey(now = new Date()) {
  return getLocalDateKey(now);
}

export function getLocalMonthKey(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return `${parsed.getFullYear()}-${padTwo(parsed.getMonth() + 1)}`;
}

export function getCurrentMonthKey(now = new Date()) {
  return getLocalMonthKey(now);
}

export function getNextMonthKey(now = new Date()) {
  return getLocalMonthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}
