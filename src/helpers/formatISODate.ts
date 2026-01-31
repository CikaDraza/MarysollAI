/**
 * Converts an ISO 8601 date string (e.g., 2025-11-12T03:35:09.618Z)
 * into a specific format: dd.mm.yy hh:mm, using the client's local timezone.
 *
 * @param isoString The ISO 8601 date string.
 * @returns The formatted date string (dd.mm.yy hh:mm) or 'N/A'.
 */
export function formatISODate(isoString: string): string {
  if (!isoString) {
    return "N/A";
  }

  try {
    // Create a Date object, which automatically interprets the ISO string
    // and stores the moment in time. Date methods like getDate() return
    // values based on the local timezone where the code is executing.
    const date = new Date(isoString);

    // Get date parts, ensuring two digits (dd.mm.yy)
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Months are 0-indexed
    const year = date.getFullYear().toString().slice(-2); // Get last two digits of the year

    // Get time parts (hh:mm)
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");

    return `${hours}:${minutes} - ${day}.${month}.${year}`;
  } catch (error) {
    console.error("Error formatting date string:", isoString, error);
    return "Invalid Date";
  }
}

// lib/dateUtils.ts
export function formatDateTimePretty(isoString: string): string {
  if (!isoString) return "";

  const date = new Date(isoString);

  if (isNaN(date.getTime())) return isoString; // fallback

  return date.toLocaleString("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  // Vraća: 31.12.2025. 19:22
}

export function formatDatePretty(isoString: string): string {
  if (!isoString) return "";

  const date = new Date(isoString);

  if (isNaN(date.getTime())) return isoString;

  return date.toLocaleDateString("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  // Vraća: 31.12.2025.
}
