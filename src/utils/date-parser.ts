/**
 * Parses date strings into Date objects, supporting both ISO format and relative dates.
 */
export class DateParser {
  /**
   * Parse a date string into a Date object.
   * Supports:
   * - ISO format: YYYY-MM-DD
   * - Relative: today, tomorrow, yesterday
   * - Relative: next week, next monday, next tuesday, etc.
   * - Relative: in X days, in X weeks
   */
  static parse(input: string): Date {
    const normalized = input.toLowerCase().trim();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (this.isISODate(normalized)) {
      const date = new Date(normalized + 'T12:00:00');
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${input}`);
      }
      return date;
    }
    if (normalized === 'today') {
      return today;
    }
    if (normalized === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    if (normalized === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }
    if (normalized === 'next week') {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    const nextDayMatch = normalized.match(
      /^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/
    );
    if (nextDayMatch) {
      return this.getNextDayOfWeek(today, nextDayMatch[1]);
    }
    const inDaysMatch = normalized.match(/^in\s+(\d+)\s+days?$/);
    if (inDaysMatch) {
      const days = parseInt(inDaysMatch[1], 10);
      const future = new Date(today);
      future.setDate(future.getDate() + days);
      return future;
    }
    const inWeeksMatch = normalized.match(/^in\s+(\d+)\s+weeks?$/);
    if (inWeeksMatch) {
      const weeks = parseInt(inWeeksMatch[1], 10);
      const future = new Date(today);
      future.setDate(future.getDate() + weeks * 7);
      return future;
    }
    const dateAttempt = new Date(normalized);
    if (!isNaN(dateAttempt.getTime())) {
      return dateAttempt;
    }
    throw new Error(
      `Invalid date format: "${input}". Use YYYY-MM-DD or relative dates like "today", "tomorrow", "next monday", "in 3 days".`
    );
  }

  /**
   * Check if a string is in ISO date format (YYYY-MM-DD).
   */
  private static isISODate(input: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(input);
  }

  /**
   * Get the next occurrence of a specific day of the week.
   */
  private static getNextDayOfWeek(from: Date, dayName: string): Date {
    const dayMap: { [key: string]: number } = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDay = dayMap[dayName];
    const currentDay = from.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) {
      daysUntil += 7;
    }
    const result = new Date(from);
    result.setDate(result.getDate() + daysUntil);
    return result;
  }

  /**
   * Format a Date object or timestamp for display.
   */
  static formatForDisplay(
    date: Date | number | string | null | undefined
  ): string {
    if (!date) {
      return 'Not set';
    }
    let dateObj: Date;
    if (typeof date === 'number') {
      dateObj = new Date(date);
    } else if (typeof date === 'string') {
      dateObj = new Date(parseInt(date, 10));
    } else {
      dateObj = date;
    }
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Convert a Date to Unix timestamp in milliseconds (ClickUp format).
   */
  static toClickUpTimestamp(date: Date): number {
    return date.getTime();
  }
}
