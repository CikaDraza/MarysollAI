export function getToken(): string | null {
  // First try from URL
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("assistant_token");
    if (urlToken) return urlToken;
  }
  // Then try localStorage
  return localStorage.getItem("assistant_token");
}
