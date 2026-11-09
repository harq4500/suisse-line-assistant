# Atelier Coiffure Zürich – Suisse Line AI Phone Assistant

> **AI Product Builder Application Challenge A – Suisse IT GmbH**  
> An autonomous, bilingual (Swiss German / Standard German / English) AI phone receptionist built for small businesses on the **[Suisse Line](https://suisse-line.ch)** Voice AI platform.

---

## 🎯 Problem & Solution Overview

### The Problem

Swiss boutique service providers (such as hair salons, physiotherapists, and medical practices) lose **15–25% of potential revenue** to two issues:

1. **Unanswered calls during peak styling hours** when staff cannot pick up the phone.
2. **Last-minute no-shows and forgotten bookings**, creating costly dead gaps in the calendar.

### The Solution: Atelier Coiffure Zürich

An autonomous voice AI receptionist named **Lea** configured on Suisse Line:

- **Natural Swiss Communication**: Welcomes callers with warm Swiss hospitality (_"Grüezi!"_), fluently understands **Swiss German dialects (_Schwiizerdütsch_)**, and seamlessly falls back to English when addressed in English.
- **Direct Calendar Integration**: Checks real-time open slots and creates calendar reservations via automated tool calling.
- **The Killer Extra Feature (No-Show Prevention)**: Instantly dispatches a confirmation SMS to the caller's mobile with the salon address (_Bahnhofstrasse 42, 8001 Zürich_) and a **1-click self-service Calendly reschedule link**, allowing customers to manage their booking without calling back.

---

## 🏗️ System Architecture

```
                  +-----------------------------------------+
                  |        Caller (Phone or Browser)        |
                  +-----------------------------------------+
                                       |
                                       v
                  +-----------------------------------------+
                  |          Suisse Line Platform           |
                  |  - Dialect STT: stt-pro (de-CH)         |
                  |  - Realtime LLM with Turn Detection     |
                  |  - Voice Synthesis: Lea (Swiss German)  |
                  +-----------------------------------------+
                          |                         |
           (Tool: checkAvailability)        (Tool: bookAppointment)
                          |                         |
                          v                         v
        +---------------------------------------------------------+
        |      Salon Gateway Server (Node.js & Express)           |
        |  - Validates opening hours (Mon–Sat)                    |
        |  - Allocates service duration & stylists                |
        |  - Dispatches SMS Confirmation via Carrier Gateway      |
        |  - Generates 1-Click Reschedule URL                     |
        +---------------------------------------------------------+
                          |                         |
                          v                         v
           +-----------------------------+   +-----------------------------+
           |   Calendly Booking Engine   |   | Instant SMS Gateway Feed    |
           |   (Real-Time Slot Sync)     |   | (Customer Mobile Delivery)  |
           +-----------------------------+   +-----------------------------+
```

---

## ✨ Key Features

1. **Autonomous Voice Receptionist**:
   - Answers incoming customer inquiries 24/7.
   - Understands services & pricing: Herrenhaarschnitt (48 CHF), Damenhaarschnitt (85 CHF), Färben/Balayage (ab 140 CHF), Bartpflege (35 CHF).
2. **Dynamic Tool Calling (`AgentTool`)**:
   - `checkAvailability`: Queries open time slots for any requested date.
   - `bookAppointment`: Collects customer name, mobile phone, service, and datetime, returning structured confirmation.
3. **Automated SMS & Reschedule Link (Custom Feature)**:
   - Triggers an immediate SMS to the caller’s mobile containing the appointment details and a 1-click reschedule/cancel link.
   - Reduces no-shows by giving customers zero-friction self-service.
4. **Live Interactive Dashboard & WebRTC Voice Widget**:
   - Live calendar table tracking incoming bookings in real time.
   - Real-time SMS dispatch feed.
   - Embedded Suisse Line WebRTC voice widget to test-call the assistant directly in the browser.

---

## 🚀 Quickstart: Single-Command Launch

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/suisse-line-assistant.git
cd suisse-line-assistant
npm install
```

### 2. Configure Environment Variables

Copy the template and set your Suisse Line credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SUISSE_LINE_API_KEY=your_suisse_line_api_key_here
SUISSE_LINE_AGENT_ID=1554
PORT=3000
```

### 3. Run Everything in One Command

```bash
npm start
```

_(or run `./start.sh`)_

**What `npm start` does automatically:**

1. Starts the local Express backend on port 3000.
2. Establishes a secure public HTTPS tunnel.
3. Programmatically patches and deploys Suisse Line Agent `1554` via the Suisse Line REST API with the new tool endpoints.
4. Displays the live URLs ready for testing!

---

## 🧪 Testing Scenarios Conducted

| Scenario                           | Input (Caller)                                                                   | Expected AI Behavior                                                                                   |  Result  |
| :--------------------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- | :------: |
| **1. Standard Booking (German)**   | _"Grüezi, ich möchte gerne morgen um 14:00 Uhr einen Herrenhaarschnitt buchen."_ | Checks slot, collects name and phone number, books appointment, triggers SMS confirmation.             | **PASS** |
| **2. Swiss German Understanding**  | _"Hoi zäme, chani am Dunnschtig am Nüni verbicho zum d'Hoor schniide?"_          | Accurately parses Thursday 09:00 haircut request in Swiss German dialect and answers in polite German. | **PASS** |
| **3. Slot Conflict & Alternative** | Requests an occupied slot (e.g. 10:00).                                          | Detects collision, offers alternative open slots (`10:30`, `13:30`).                                   | **PASS** |
| **4. English Fallback**            | _"Hello, do you speak English? I'd like to book an appointment."_                | Switches seamlessly to fluent English and completes the booking.                                       | **PASS** |

---

## 📁 Repository Structure

```
├── .env.example              # Environment variables template (API keys omitted)
├── .gitignore                # Ensures .env, node_modules, and logs are never tracked
├── package.json              # Node.js dependencies and scripts
├── salon_data.json           # In-memory persistent JSON store for bookings & SMS logs
├── server.js                 # Express backend: tool endpoints, dashboard & reschedule UI
├── start.sh                  # Single-command automated startup & Suisse Line deploy script
├── walkthrough.md            # Complete architecture documentation & 20-min interview plan
└── README.md                 # Project documentation
```
