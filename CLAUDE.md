# UTS Bus Schedule Project

## Project Overview
A lightweight PWA for checking UTS bus timetables between Broadway and Botany.

## Core Route Logic & Rules
The application enforces specific boarding and alighting restrictions based on direction:

### 1. Broadway $\rightarrow$ Botany (B2B)
- **Selected Stop**: Acts as the **boarding point**.
- **Destination**: Always Botany (Lord St).
- **Timing**: The "Next Bus" and countdowns are calculated based on when the bus reaches the selected boarding stop.
- **Logic**: `Boarding Time (Selected Stop) $\rightarrow$ Arrival Time (Botany)`.

### 2. Botany $\rightarrow$ Broadway (B2B_Rev)
- **Selected Stop**: Acts as the **alighting point**.
- **Boarding Point**: Always Botany (Lord St).
- **Timing**: The "Next Bus" and countdowns are calculated based on the departure from Botany.
- **Logic**: `Departure Time (Botany) $\rightarrow$ Arrival Time (Selected Stop)`.

## Technical Implementation Details

### Schedule & Fallback Logic
- **Service Days**: The app uses `window.busData.serviceDays` (default: Mon-Fri) to determine when the bus operates.
- **Multi-Day Fallback**: If no more trips are available for the current day (or today is a non-service day), the app automatically displays the schedule for the **next available service day**.
- **Time Calculation**: All countdowns and notifications account for multi-day offsets (e.g., Friday evening $\rightarrow$ Monday morning).

### UI/UX Features
- **Interactive Stop Selector**: A visual route map (`O---O---O`) replaces standard dropdowns. Selecting a stop highlights the node and text in bold blue.
- **Arrival Alerts**:
    - Synthetic audio alerts via `AudioContext` (beep).
    - Browser-native notifications via `Notification` API.
- **Live Map**: Integration with a live tracking iframe.
- **PWA**: Custom SVG branding, `manifest.json` configuration, and a service worker for offline access.

## Guidelines
- **Quality First**: Before saying the work is done, always make sure to test it by yourself to see if all the features are working flawlessly as expected.
- **Rigorous Review**: Always perform a thorough code review before finalizing any implementation.
- **Mobile-First**: All UI changes must be verified for mobile responsiveness.
- **PWA Compliance**: Ensure offline functionality is maintained across all updates.
