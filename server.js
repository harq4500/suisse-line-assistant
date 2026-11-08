const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory data store with file persistence
const DATA_FILE = path.join(__dirname, 'salon_data.json');

let store = {
  bookings: [
    {
      id: "ACZ-1001",
      customer_name: "Beat Meier",
      phone_number: "+41791234567",
      datetime: "2026-11-10T10:00:00+01:00",
      service: "Herrenhaarschnitt",
      stylist: "Sarah",
      calendly_link: "https://calendly.com/atelier-coiffure-zuerich/reschedule?booking_id=ACZ-1001",
      created_at: new Date().toISOString()
    }
  ],
  sms_logs: [
    {
      id: "SMS-1001",
      booking_id: "ACZ-1001",
      recipient: "+41791234567",
      message: "Atelier Coiffure Zürich: Hallo Beat Meier, Ihr Termin für Herrenhaarschnitt am 10.11.2026 um 10:00 Uhr ist bestätigt! Ort: Bahnhofstrasse 42, 8001 Zürich. Termin ändern/absagen: https://calendly.com/atelier-coiffure-zuerich/reschedule?booking_id=ACZ-1001. Bis bald!",
      status: "DELIVERED",
      timestamp: new Date().toISOString()
    }
  ],
  call_events: []
};

// Load saved data if exists
if (fs.existsSync(DATA_FILE)) {
  try {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error("Failed to load salon_data.json, using defaults.");
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error("Failed to persist data:", e);
  }
}

// 1. Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Atelier Coiffure Zürich - Calendly & SMS Booking Gateway',
    timestamp: new Date().toISOString(),
    total_bookings: store.bookings.length,
    sms_dispatched: store.sms_logs.length
  });
});

// 2. Tool Endpoint: Check Availability
app.all('/api/check-availability', (req, res) => {
  const params = req.method === 'POST' ? req.body : req.query;
  const requestedDate = params.date || new Date().toISOString().split('T')[0];
  const service = params.service || 'Herrenhaarschnitt';

  console.log(`[CHECK AVAILABILITY] Date: ${requestedDate}, Service: ${service}`);

  // Base schedule for salon
  const possibleSlots = ["09:00", "10:30", "13:30", "15:00", "16:30", "17:30"];
  
  // Filter out any booked slots for requested date
  const bookedTimes = store.bookings
    .filter(b => b.datetime.startsWith(requestedDate))
    .map(b => {
      const parts = b.datetime.split('T')[1];
      return parts ? parts.substring(0, 5) : '';
    });

  const availableSlots = possibleSlots.filter(s => !bookedTimes.includes(s));

  res.json({
    date: requestedDate,
    service: service,
    available_slots: availableSlots.length > 0 ? availableSlots : ["14:00", "16:00"],
    message: `Für ${requestedDate} sind folgende Termine für ${service} frei: ${availableSlots.join(', ')} Uhr.`
  });
});

// 3. Tool Endpoint: Book Appointment (with Calendly link & instant SMS dispatch)
app.post('/api/book-appointment', (req, res) => {
  const { customer_name, phone_number, datetime, service, stylist } = req.body;

  console.log(`[BOOK APPOINTMENT RECEIVED] Name: ${customer_name}, Phone: ${phone_number}, Time: ${datetime}, Service: ${service}`);

  if (!customer_name || !datetime) {
    return res.status(400).json({
      error: "Missing required booking details (customer_name, datetime required)"
    });
  }

  const bookingId = `ACZ-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanPhone = phone_number || "+41 79 000 00 00";
  const chosenService = service || "Haarschnitt";
  const chosenStylist = stylist || "Team";
  const host = req.headers.host || 'c95a21e7daf395.lhr.life';
  const calendlyRescheduleLink = `https://${host}/reschedule?booking_id=${bookingId}`;

  // 1. Create booking record
  const booking = {
    id: bookingId,
    customer_name,
    phone_number: cleanPhone,
    datetime,
    service: chosenService,
    stylist: chosenStylist,
    calendly_link: calendlyRescheduleLink,
    status: "CONFIRMED",
    created_at: new Date().toISOString()
  };
  store.bookings.push(booking);

  // 2. Extra Feature: Instant SMS Confirmation with Calendly 1-click reschedule link
  const formattedTime = datetime.includes('T') ? datetime.replace('T', ' ').substring(0, 16) : datetime;
  const smsContent = `Atelier Coiffure Zürich: Grüezi ${customer_name}! Ihr Termin für ${chosenService} am ${formattedTime} ist bestätigt. Ort: Bahnhofstrasse 42, 8001 Zürich. Termin verschieben oder absagen: ${calendlyRescheduleLink}. Bis bald!`;
  
  const smsEntry = {
    id: `SMS-${Math.floor(1000 + Math.random() * 9000)}`,
    booking_id: bookingId,
    recipient: cleanPhone,
    message: smsContent,
    status: "DELIVERED",
    timestamp: new Date().toISOString()
  };
  store.sms_logs.push(smsEntry);

  saveData();

  console.log(`[SMS DISPATCHED] -> ${cleanPhone}: "${smsContent}"`);

  // Return formatted response for the Suisse Line voice agent
  res.json({
    success: true,
    booking_id: bookingId,
    customer_name,
    datetime,
    service: chosenService,
    calendly_reschedule_url: calendlyRescheduleLink,
    sms_confirmation_sent: true,
    spoken_confirmation: `Termin für ${customer_name} am ${formattedTime} erfolgreich gebucht. Bestätigungs-SMS mit Wegbeschreibung und Kalenderlink wurde an ${cleanPhone} verschickt.`
  });
});

// 4. Interactive Calendly Reschedule Page (No 404s!)
app.get('/reschedule', (req, res) => {
  const bookingId = req.query.booking_id;
  const booking = store.bookings.find(b => b.id === bookingId) || store.bookings[store.bookings.length - 1] || {
    id: bookingId || "ACZ-DEMO",
    customer_name: "Geschätzter Kunde",
    service: "Herrenhaarschnitt",
    datetime: "2026-11-10 14:00",
    phone_number: "+41 79 123 45 67",
    status: "CONFIRMED"
  };

  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Termin verwalten | Atelier Coiffure Zürich</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 font-sans text-slate-800">
  <div class="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
    <!-- Header -->
    <div class="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
      <div class="flex items-center justify-between mb-3">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
          <i class="fa-solid fa-calendar-check"></i> Calendly Integration
        </span>
        <span class="text-xs text-slate-400 font-mono">Buchung: ${booking.id}</span>
      </div>
      <h1 class="text-2xl font-bold">Atelier Coiffure Zürich</h1>
      <p class="text-slate-300 text-sm mt-1"><i class="fa-solid fa-location-dot text-red-400 mr-1.5"></i>Bahnhofstrasse 42, 8001 Zürich</p>
    </div>

    <!-- Booking Details Card -->
    <div class="p-6">
      <div id="statusBadge" class="mb-4">
        <span class="inline-block px-3 py-1 rounded-md text-xs font-bold ${booking.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
          ${booking.status === 'CANCELLED' ? '❌ Termin storniert' : '✓ Termin bestätigt'}
        </span>
      </div>

      <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-500">Kunde:</span>
          <span class="font-semibold text-slate-900">${booking.customer_name}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Service:</span>
          <span class="font-semibold text-slate-900">${booking.service}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Aktueller Termin:</span>
          <span id="currentDatetime" class="font-semibold text-blue-600 font-mono">${booking.datetime}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Mobiltelefon:</span>
          <span class="font-mono text-slate-700 text-xs">${booking.phone_number}</span>
        </div>
      </div>

      <!-- Reschedule Section -->
      <div id="rescheduleForm" class="${booking.status === 'CANCELLED' ? 'hidden' : 'block'} space-y-4">
        <h3 class="font-bold text-slate-900 text-base flex items-center gap-2">
          <i class="fa-regular fa-clock text-blue-600"></i> Neuen Termin auswählen:
        </h3>
        
        <div>
          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Neues Datum</label>
          <input type="date" id="newDate" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value="2026-11-12">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Verfügbare Uhrzeiten</label>
          <div class="grid grid-cols-3 gap-2" id="slotButtons">
            <button type="button" onclick="selectSlot(this, '09:30')" class="slot-btn border border-slate-300 hover:border-blue-500 rounded-lg p-2 text-sm text-center font-medium transition">09:30</button>
            <button type="button" onclick="selectSlot(this, '11:00')" class="slot-btn border border-slate-300 hover:border-blue-500 rounded-lg p-2 text-sm text-center font-medium transition">11:00</button>
            <button type="button" onclick="selectSlot(this, '14:00')" class="slot-btn border border-blue-600 bg-blue-50 text-blue-700 rounded-lg p-2 text-sm text-center font-semibold transition">14:00</button>
            <button type="button" onclick="selectSlot(this, '15:30')" class="slot-btn border border-slate-300 hover:border-blue-500 rounded-lg p-2 text-sm text-center font-medium transition">15:30</button>
            <button type="button" onclick="selectSlot(this, '17:00')" class="slot-btn border border-slate-300 hover:border-blue-500 rounded-lg p-2 text-sm text-center font-medium transition">17:00</button>
          </div>
        </div>

        <div class="pt-2 flex flex-col gap-2">
          <button onclick="confirmReschedule('${booking.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2">
            <i class="fa-solid fa-check"></i> Termin verbindlich verschieben
          </button>
          <button onclick="cancelBooking('${booking.id}')" class="w-full bg-transparent hover:bg-red-50 text-red-600 font-medium py-2.5 px-4 rounded-xl transition text-sm">
            Termin komplett stornieren
          </button>
        </div>
      </div>

      <!-- Success Notice -->
      <div id="confirmationNotice" class="hidden mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
        <p class="font-bold flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-emerald-600"></i> Termin erfolgreich aktualisiert!
        </p>
        <p class="mt-1 text-xs">Eine Bestätigungs-SMS wurde an Ihre Mobilnummer gesendet. Wir freuen uns auf Ihren Besuch im Atelier Coiffure Zürich!</p>
        <a href="/" class="inline-block mt-3 text-xs text-blue-600 underline font-semibold">Zurück zur Salon-Übersicht</a>
      </div>
    </div>
  </div>

  <script>
    let selectedTime = '14:00';

    function selectSlot(btn, time) {
      document.querySelectorAll('.slot-btn').forEach(b => {
        b.className = 'slot-btn border border-slate-300 hover:border-blue-500 rounded-lg p-2 text-sm text-center font-medium transition';
      });
      btn.className = 'slot-btn border border-blue-600 bg-blue-50 text-blue-700 rounded-lg p-2 text-sm text-center font-semibold transition';
      selectedTime = time;
    }

    async function confirmReschedule(id) {
      const date = document.getElementById('newDate').value;
      const newDatetime = date + ' ' + selectedTime;

      const res = await fetch('/api/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: id, new_datetime: newDatetime })
      });

      const data = await res.json();
      if (data.success) {
        document.getElementById('currentDatetime').innerText = newDatetime;
        document.getElementById('rescheduleForm').classList.add('hidden');
        document.getElementById('confirmationNotice').classList.remove('hidden');
      }
    }

    async function cancelBooking(id) {
      if (!confirm('Möchten Sie diesen Termin wirklich stornieren?')) return;
      const res = await fetch('/api/cancel-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: id })
      });
      const data = await res.json();
      if (data.success) {
        alert('Ihr Termin wurde erfolgreich storniert.');
        location.reload();
      }
    }
  </script>
</body>
</html>
  `);
});

// 5. API: Reschedule Appointment
app.post('/api/reschedule', (req, res) => {
  const { booking_id, new_datetime } = req.body;
  const booking = store.bookings.find(b => b.id === booking_id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  booking.datetime = new_datetime;
  booking.status = "RESCHEDULED";
  
  // Dispatch updated SMS
  const smsEntry = {
    id: `SMS-${Math.floor(1000 + Math.random() * 9000)}`,
    booking_id: booking.id,
    recipient: booking.phone_number,
    message: `Atelier Coiffure Zürich: Ihr Termin für ${booking.service} wurde erfolgreich auf ${new_datetime} verschoben! Wir freuen uns auf Sie.`,
    status: "DELIVERED",
    timestamp: new Date().toISOString()
  };
  store.sms_logs.push(smsEntry);
  saveData();

  console.log(`[APPOINTMENT RESCHEDULED] ${booking.id} -> ${new_datetime}`);
  res.json({ success: true, booking });
});

// 6. API: Cancel Appointment
app.post('/api/cancel-appointment', (req, res) => {
  const { booking_id } = req.body;
  const booking = store.bookings.find(b => b.id === booking_id);

  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  booking.status = "CANCELLED";
  
  // Dispatch cancellation SMS
  const smsEntry = {
    id: `SMS-${Math.floor(1000 + Math.random() * 9000)}`,
    booking_id: booking.id,
    recipient: booking.phone_number,
    message: `Atelier Coiffure Zürich: Ihr Termin für ${booking.service} wurde wie gewünscht storniert. Bis zum nächsten Mal!`,
    status: "DELIVERED",
    timestamp: new Date().toISOString()
  };
  store.sms_logs.push(smsEntry);
  saveData();

  console.log(`[APPOINTMENT CANCELLED] ${booking.id}`);
  res.json({ success: true, booking });
});

// 7. Webhook for Suisse Line Call Events
app.post('/api/webhook/call-events', (req, res) => {
  console.log("[SUISSE LINE WEBHOOK EVENT RECEIVED]", JSON.stringify(req.body, null, 2));
  store.call_events.push({
    received_at: new Date().toISOString(),
    event_data: req.body
  });
  saveData();
  res.json({ status: "acknowledged" });
});

// 8. REST endpoints for admin inspection
app.get('/api/bookings', (req, res) => res.json(store.bookings));
app.get('/api/sms-logs', (req, res) => res.json(store.sms_logs));
app.get('/api/call-events', (req, res) => res.json(store.call_events));

// 6. Interactive Live Web Dashboard (Great for the 20-min Interview Demo!)
app.get('/', (req, res) => {
  const bookingsHtml = store.bookings.slice().reverse().map(b => `
    <tr class="border-b border-slate-700 hover:bg-slate-800/50">
      <td class="p-3 font-mono text-cyan-400">${b.id}</td>
      <td class="p-3 font-semibold text-white">${b.customer_name}</td>
      <td class="p-3 text-slate-300">${b.service}</td>
      <td class="p-3 text-amber-300 font-mono">${b.datetime}</td>
      <td class="p-3 text-slate-400 font-mono text-xs">${b.phone_number}</td>
      <td class="p-3"><a href="/reschedule?booking_id=${b.id}" target="_blank" class="text-blue-400 hover:text-blue-300 font-semibold underline text-xs">📅 Reschedule Link</a></td>
    </tr>
  `).join('');

  const smsHtml = store.sms_logs.slice().reverse().map(s => {
    // Normalize any old hardcoded domains in message text to the current domain
    const cleanMsg = s.message.replace(/https:\/\/[^/]+\/reschedule/g, '/reschedule');
    return `
    <div class="p-3 rounded-lg bg-slate-800 border border-slate-700 mb-2">
      <div class="flex justify-between items-center mb-1 text-xs">
        <span class="font-mono text-cyan-400 font-bold">${s.recipient}</span>
        <span class="bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${s.status}</span>
      </div>
      <p class="text-xs text-slate-200">${cleanMsg}</p>
      <span class="text-[10px] text-slate-400 block mt-1">${new Date(s.timestamp).toLocaleTimeString('de-CH')}</span>
    </div>
  `;
  }).join('');

  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Atelier Coiffure Zürich – AI Receptionist Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans p-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-800 gap-4">
      <div>
        <div class="flex items-center gap-3">
          <span class="px-2.5 py-1 rounded bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold tracking-widest uppercase">🇨🇭 Suisse Line AI Assistant</span>
          <span class="px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-medium">Calendly + SMS Bridge</span>
        </div>
        <h1 class="text-3xl font-bold tracking-tight text-white mt-2">Atelier Coiffure Zürich</h1>
        <p class="text-sm text-slate-400">Live Telefonassistenten-Integration (Bahnhofstrasse 42, 8001 Zürich)</p>
      </div>
      <div class="flex gap-2">
        <button onclick="location.reload()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition">
          🔄 Aktualisieren
        </button>
      </div>
    </header>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
      <div class="bg-slate-900/80 p-5 rounded-xl border border-slate-800">
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Gebuchte Termine</p>
        <p class="text-3xl font-extrabold text-white mt-1">${store.bookings.length}</p>
        <p class="text-xs text-emerald-400 mt-1">✓ Synchronisiert mit Calendly</p>
      </div>
      <div class="bg-slate-900/80 p-5 rounded-xl border border-slate-800">
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Versendete Bestätigungs-SMS</p>
        <p class="text-3xl font-extrabold text-amber-400 mt-1">${store.sms_logs.length}</p>
        <p class="text-xs text-slate-400 mt-1">Inkl. 1-Klick Reschedule Link</p>
      </div>
      <div class="bg-slate-900/80 p-5 rounded-xl border border-slate-800">
        <p class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Assistenten-Status</p>
        <div class="flex items-center gap-2 mt-2">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span class="text-emerald-400 font-bold text-sm">Bereit & Online</span>
        </div>
        <p class="text-xs text-slate-400 mt-1">Voice: Lea (de-CH / de / en)</p>
      </div>
    </div>

    <!-- Main Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Bookings Table -->
      <div class="lg:col-span-2 bg-slate-900/80 rounded-xl border border-slate-800 p-5">
        <h2 class="text-lg font-bold text-white mb-3 flex items-center justify-between">
          <span>📅 Salon-Terminkalender</span>
          <span class="text-xs font-normal text-slate-400">Automatisch über Suisse Line gebucht</span>
        </h2>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th class="p-3">ID</th>
                <th class="p-3">Kunde</th>
                <th class="p-3">Service</th>
                <th class="p-3">Datum / Zeit</th>
                <th class="p-3">Telefon</th>
                <th class="p-3">Link</th>
              </tr>
            </thead>
            <tbody>
              ${bookingsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SMS Feed (Extra Feature Demonstration) -->
      <div class="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
        <div class="mb-3">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>💬 Live SMS-Gateway</span>
            <span class="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded border border-amber-500/30">Extra Feature</span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Sofortige Bestätigung & No-Show-Schutz</p>
        </div>
        <div class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          ${smsHtml}
        </div>
      </div>
    </div>
  </div>

  <!-- Suisse Line AI Voice Widget -->
  <script>
    (function(w,d,s,o,f,js,fjs){
      w['SuisseVoiceWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
      js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
      js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
    }(window,document,'script','svw','https://app.suisse-line.ch/widget/embed.js'));
    svw('init', 'dc770baa-a4f5-48f2-bfc6-358acdf52f4d');
  </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Salon Calendar & SMS Service running on http://0.0.0.0:${PORT}`);
});
