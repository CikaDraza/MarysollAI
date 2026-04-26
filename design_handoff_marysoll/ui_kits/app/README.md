# Marysoll Booking App UI Kit

Hi-fi recreation of the **logged-in booking app** — what a returning user sees when they sign in via the AI drawer or the header Login button.

This kit covers the dashboard / "Moji termini" surface, an inline calendar/appointment block, an auth flow, and the bottom AI agent panel that appears on detail pages (the one the brief instructs to *hide on the landing*).

## Components
- `AppShell.jsx` — outer chrome: header + content + AI agent dock
- `AppointmentsList.jsx` — past + upcoming appointments
- `CalendarBlock.jsx` — inline service / date / slot picker (taken from `AppointmentCalendarBlockView`)
- `LoginCard.jsx` — auth card (login + register tabs)
- `AIAgentDock.jsx` — fixed bottom AI input (matches `AIAgentPanel.tsx`)
- `index.html` — wires it together with screen switching: login → dashboard → AI confirms a new termin
