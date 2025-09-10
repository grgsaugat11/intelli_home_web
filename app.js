// =================== MQTT Setup ===================
const broker = 'wss://broker.emqx.io:8084/mqtt';
const topic = 'relay/control';
let relayState = { r1: 'OFF', r2: 'OFF', r3: 'OFF', r4: 'OFF' };

const client = mqtt.connect(broker);

client.on('connect', () => {
  const statusElem = document.getElementById('status');
  if (statusElem) {
    statusElem.innerText = '✅ Connected to MQTT broker';
    statusElem.style.color = 'green';
  }
});

client.on('error', (err) => {
  const statusElem = document.getElementById('status');
  if (statusElem) {
    statusElem.innerText = '❌ MQTT Error: ' + err.message;
    statusElem.style.color = 'red';
  }
});

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD7ctsSMAe2MS9DItBbzDjTFzVnoauACZ4",
  authDomain: "intelli-home-79cae.firebaseapp.com",
  databaseURL: "https://intelli-home-79cae-default-rtdb.firebaseio.com",
  projectId: "intelli-home-79cae",
  storageBucket: "intelli-home-79cae.appspot.com",
  messagingSenderId: "394281064188",
  appId: "1:394281064188:web:ea944df259bd4633baa979",
  measurementId: "G-DRBLL2T1NN"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Session management: Only run app logic if user is logged in
auth.onAuthStateChanged((user) => {
  if (!user) {
    // Not logged in, redirect to login page
    window.location.href = "login.html";
    return;
  }

  // User is logged in, run your app logic below

  // Listen for notifications count
  db.ref("notifications/count").on("value", (snapshot) => {
  const count = snapshot.val() || 0;
  console.log("Notification count:", count); // DEBUG
  const notifElem = document.getElementById("notifCount");
  if (notifElem) {
    notifElem.textContent = ""; // no numbers, just red dot
    notifElem.style.display = count > 0 ? "block" : "none";
  }
});

  // Open notifications function
  window.openNotifications = function () {
    window.location.href = "notification.html";
  };
  });

// =================== Relay Control ===================
function toggleRelay(elem, state = null) {
  const id = elem.id ? elem.id : elem;
  const checkbox = typeof elem === 'object' ? elem : document.getElementById(elem);

  let newState;
  if (state === 'TOGGLE') {
    newState = relayState[id] === 'ON' ? 'OFF' : 'ON';
  } else if (state) {
    newState = state;
  } else {
    newState = checkbox.checked ? 'ON' : 'OFF';
  }

  relayState[id] = newState;
  checkbox.checked = newState === 'ON';

  // Update UI
  const label = document.getElementById(`status-${id}`);
  if (label) label.innerText = id === "r3" ? (newState === "ON" ? "Unlocked" : "Locked") : `Status: ${newState}`;

  // Publish to MQTT immediately
  client.publish(topic, JSON.stringify(relayState));

  // Update Firebase in the background
  db.ref(`relays/${id}`).set(newState)
  .then(() => console.log(`Relay ${id} updated in Firebase: ${newState}`))
  .catch((err) => console.error('Firebase update error:', err));
}

// Realtime sync UI from Firebase
window.addEventListener('DOMContentLoaded', () => {
  ["r1", "r2", "r3", "r4"].forEach(relayId => {
    const relayRef = db.ref(`relays/${relayId}`);
    relayRef.on("value", (snapshot) => {
      const status = snapshot.val();
      relayState[relayId] = status;
      const checkbox = document.getElementById(relayId);
      if (checkbox) {
        checkbox.checked = status === "ON";
      }
      const label = document.getElementById(`status-${relayId}`);
      if (label) label.innerText = relayId === "r3" ? (status === "ON" ? "Unlocked" : "Locked") : `Status: ${status}`;
    });
  });
});

// =================== Timer Functionality ===================
let timers = [];

function setTimer() {
  const hours = parseInt(document.getElementById('hours').value) || 0;
  const minutes = parseInt(document.getElementById('minutes').value) || 0;
  const seconds = parseInt(document.getElementById('seconds').value) || 0;
  const action = document.getElementById('timerAction').value;

  // Get selected relays
  const selectedRelays = Array.from(document.querySelectorAll('.timer-relay:checked')).map(cb => cb.value);
  if (selectedRelays.length === 0) {
    alert('Select at least one relay.');
    return;
  }

  const totalMs = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
  if (totalMs <= 0) {
    alert('Please set a valid timer duration.');
    return;
  }

  const timerId = Date.now();
  const endTime = Date.now() + totalMs;
  timers.push({ id: timerId, relays: selectedRelays, action, endTime });

  // Display timer with countdown
  const timerItem = document.createElement('div');
  timerItem.className = 'timer-item';
  timerItem.id = 'timer-' + timerId;
  timerItem.innerHTML = `
    <span>
      Will turn <strong>${action}</strong> ${selectedRelays.map(r => r.toUpperCase()).join(', ')} in 
      <span class="timer-countdown" id="timer-countdown-${timerId}"></span>
    </span>
    <button class="delete-btn" onclick="cancelTimer(${timerId})">Cancel</button>
  `;
  document.getElementById('activeTimers').appendChild(timerItem);

  updateTimerCountdown(timerId, endTime);

  // Timer logic
  const interval = setInterval(() => {
    updateTimerCountdown(timerId, endTime);
    if (Date.now() >= endTime) {
      clearInterval(interval);
      // Perform action on selected relays
      selectedRelays.forEach(r => {
        toggleRelay(r, action);
      });
      // Remove timer UI
      const elem = document.getElementById('timer-' + timerId);
      if (elem) elem.remove();
      timers = timers.filter(t => t.id !== timerId);
    }
  }, 1000);
}

function updateTimerCountdown(timerId, endTime) {
  const countdownElem = document.getElementById(`timer-countdown-${timerId}`);
  if (!countdownElem) return;
  const msLeft = Math.max(0, endTime - Date.now());
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  const s = Math.floor((msLeft % 60000) / 1000);
  countdownElem.textContent = `${h}h ${m}m ${s}s`;
}

function cancelTimer(id) {
  timers = timers.filter(tid => tid !== id);
  const elem = document.getElementById('timer-' + id);
  if (elem) elem.remove();
}

// =================== Scheduling Functionality ===================
let schedules = [];

function addSchedule() {
  const relayId = document.getElementById('scheduleRelay').value;
  const time = document.getElementById('scheduleTime').value;
  const action = document.getElementById('scheduleAction').value;

  if (!time) {
    alert('Please select a time for the schedule.');
    return;
  }

  const scheduleId = Date.now();
  const [hours, minutes] = time.split(':').map(Number);
  const endTime = getNextScheduleTime(hours, minutes);

  schedules.push({
    id: scheduleId,
    relayId,
    hours,
    minutes,
    action,
    triggered: false,
    endTime
  });

  // Display schedule with countdown
  const scheduleItem = document.createElement('div');
  scheduleItem.className = 'schedule-item';
  scheduleItem.id = `schedule-${scheduleId}`;
  scheduleItem.innerHTML = `
    <span>
      At ${time} - Turn <strong>${action}</strong>
      <span class="schedule-countdown" id="schedule-countdown-${scheduleId}"></span>
    </span>
    <button class="delete-btn" onclick="removeSchedule(${scheduleId})">Delete</button>
  `;
  document.getElementById(`schedules-${relayId}`).appendChild(scheduleItem);

  updateScheduleCountdown(scheduleId, endTime);

  // Save to localStorage
  saveSchedules();
}

function getNextScheduleTime(hours, minutes) {
  const now = new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  if (target < now) target.setDate(target.getDate() + 1); // Next day if time passed
  return target.getTime();
}

function updateScheduleCountdown(scheduleId, endTime) {
  const countdownElem = document.getElementById(`schedule-countdown-${scheduleId}`);
  if (!countdownElem) return;
  const msLeft = Math.max(0, endTime - Date.now());
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  const s = Math.floor((msLeft % 60000) / 1000);
  countdownElem.textContent = ` (${h}h ${m}m ${s}s left)`;
}

function removeSchedule(id) {
  schedules = schedules.filter(s => s.id !== id);
  const elem = document.getElementById(`schedule-${id}`);
  if (elem) elem.remove();
  saveSchedules();
}

function saveSchedules() {
  const schedulesToSave = schedules.map(s => ({
    id: s.id,
    relayId: s.relayId,
    hours: s.hours,
    minutes: s.minutes,
    action: s.action
  }));
  localStorage.setItem('relaySchedules', JSON.stringify(schedulesToSave));
}

function loadSchedulesLocal() {
  const savedSchedules = localStorage.getItem('relaySchedules');
  if (savedSchedules) {
    schedules = JSON.parse(savedSchedules);
    schedules.forEach(schedule => {
      schedule.triggered = false;
      schedule.endTime = getNextScheduleTime(schedule.hours, schedule.minutes);
      const timeStr = `${String(schedule.hours).padStart(2, '0')}:${String(schedule.minutes).padStart(2, '0')}`;
      const scheduleItem = document.createElement('div');
      scheduleItem.className = 'schedule-item';
      scheduleItem.id = `schedule-${schedule.id}`;
      scheduleItem.innerHTML = `
        <span>
          At ${timeStr} - Turn <strong>${schedule.action}</strong>
          <span class="schedule-countdown" id="schedule-countdown-${schedule.id}"></span>
        </span>
        <button class="delete-btn" onclick="removeSchedule(${schedule.id})">Delete</button>
      `;
      document.getElementById(`schedules-${schedule.relayId}`).appendChild(scheduleItem);
      updateScheduleCountdown(schedule.id, schedule.endTime);
    });
  }
}

function checkSchedulesLocal() {
  const now = Date.now();
  schedules.forEach(schedule => {
    updateScheduleCountdown(schedule.id, schedule.endTime);
    if (
      now >= schedule.endTime &&
      !schedule.triggered
    ) {
      // Perform the scheduled action
      toggleRelay(schedule.relayId, schedule.action);
      schedule.triggered = true;

      // Auto-delete after trigger
      setTimeout(() => removeSchedule(schedule.id), 1000);
    }
  });
}

// =================== Firebase Schedules & Notifications ===================
// Schedules from Firebase
function loadSchedulesFirebase() {
  const scheduleList = document.getElementById('scheduleList');
  if (!scheduleList) return;
  db.ref("schedules").on("value", (snapshot) => {
    scheduleList.innerHTML = '';
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const schedule = childSnapshot.val();
        const scheduleId = childSnapshot.key;
        const listItem = document.createElement("li");
        listItem.textContent = `Relay ${schedule.relayId.toUpperCase()} → ${schedule.action} at ${schedule.time}`;
        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.style.marginLeft = "10px";
        deleteBtn.style.backgroundColor = "#f44336";
        deleteBtn.style.color = "white";
        deleteBtn.style.border = "none";
        deleteBtn.style.padding = "4px 8px";
        deleteBtn.style.borderRadius = "4px";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.onclick = () => {
          if (confirm("Delete this schedule?")) {
            db.ref(`schedules/${scheduleId}`).remove();
          }
        };
        listItem.appendChild(deleteBtn);
        scheduleList.appendChild(listItem);
      });
    } else {
      const noItem = document.createElement("li");
      noItem.textContent = "No schedules found.";
      scheduleList.appendChild(noItem);
    }
  });
}

// Notifications from Firebase
function loadNotifications() {
  const notificationList = document.getElementById("notificationList");
  if (!notificationList) return;
  db.ref("notifications").on("value", (snapshot) => {
    notificationList.innerHTML = '';
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const notif = childSnapshot.val();
        const notifId = childSnapshot.key;
        const listItem = document.createElement("li");
        listItem.textContent = `[${notif.timestamp}] ${notif.message}`;
        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.style.marginLeft = "10px";
        deleteBtn.style.backgroundColor = "#f44336";
        deleteBtn.style.color = "white";
        deleteBtn.style.border = "none";
        deleteBtn.style.padding = "4px 8px";
        deleteBtn.style.borderRadius = "4px";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.onclick = () => {
          if (confirm("Delete this notification?")) {
            db.ref(`notifications/${notifId}`).remove();
          }
        };
        listItem.appendChild(deleteBtn);
        notificationList.appendChild(listItem);
      });
    } else {
      const noItem = document.createElement("li");
      noItem.textContent = "No notifications yet.";
      notificationList.appendChild(noItem);
    }
  });
}

// Notification button logic
function openNotifications() {
  window.location.href = 'notification.html';
}

// Relay ON > 1 Minute Notification
const relayTimers = {};
["r1", "r2", "r3", "r4"].forEach(relayId => {
  const relayRef = db.ref(`relays/${relayId}`);
  relayRef.on("value", (snapshot) => {
    const status = snapshot.val();
    if (status === "ON") {
      if (!relayTimers[relayId]) {
        relayTimers[relayId] = Date.now();
      }
    } else {
      delete relayTimers[relayId];
    }
  });
});

function formatTimestamp() {
  const now = new Date();

  // Date parts
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0'); // months are 0-based
  const year = now.getFullYear();

  // Time parts
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12; // convert 0 -> 12 for 12-hour clock
  hours = String(hours).padStart(2, '0');

  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
}

setInterval(() => {
  const now = Date.now();
  Object.keys(relayTimers).forEach(relayId => {
    const elapsed = (now - relayTimers[relayId]) / 1000;
    if (elapsed >= 60) {
      const notifId = Date.now();

      // Increment the notification count
      db.ref("notifications/count").transaction((currentCount) => {
        return (currentCount || 0) + 1;
      }).then(() => {
        // After incrementing the count, create the notification
        db.ref(`notifications/${notifId}`).set({
          relayId,
          message: `Relay ${relayId.toUpperCase()} has been ON for more than 1 minute!`,
          timestamp: formatTimestamp()
        });
      });

      delete relayTimers[relayId];
    }
  });
}, 10000);

// =================== Voice Control ===================
function startVoiceControl() {
  const voiceStatus = document.getElementById("voiceStatus");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceStatus.innerText = "❌ Speech Recognition not supported in this browser.";
    voiceStatus.style.color = "red";
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  voiceStatus.innerText = "🎤 Listening...";
  voiceStatus.style.color = "blue";
  recognition.start();

  recognition.onresult = (event) => {
    const command = event.results[0][0].transcript.toLowerCase().trim();
    voiceStatus.innerText = `✅ Heard: "${command}"`;
    voiceStatus.style.color = "green";

    if (command.includes("lights on")) {
      toggleRelay('r1', 'ON');
    } else if (command.includes("lights off")) {
      toggleRelay('r1', 'OFF');
    } else if (command.includes("strip light on")) {
      toggleRelay('r2', 'ON');
    } else if (command.includes("strip light off")) {
      toggleRelay('r2', 'OFF');
    } else if (command.includes("unlock door")) {
      toggleRelay('r3', 'ON');
    } else if (command.includes("lock door")) {
      toggleRelay('r3', 'OFF');
    } else if (command.includes("turn on fan")) {
      toggleRelay('r4', 'ON');
    } else if (command.includes("turn off fan")) {
      toggleRelay('r4', 'OFF');
    } else if (command.includes("turn on everything") || command.includes("turn on all")) {
      ['r1','r2','r3','r4'].forEach(relayId => toggleRelay(relayId, 'ON'));
    } else if (command.includes("turn off everything") || command.includes("turn off all")) {
      ['r1','r2','r3','r4'].forEach(relayId => toggleRelay(relayId, 'OFF'));
    } else if (command.includes("turn on relay")) {
      const relayNum = command.match(/\d+/);
      if (relayNum && relayNum[0] >= 1 && relayNum[0] <= 4) {
        const relayId = `r${relayNum[0]}`;
        toggleRelay(relayId, "ON");
      }
    } else if (command.includes("turn off relay")) {
      const relayNum = command.match(/\d+/);
      if (relayNum && relayNum[0] >= 1 && relayNum[0] <= 4) {
        const relayId = `r${relayNum[0]}`;
        toggleRelay(relayId, "OFF");
      }
    } else {
      voiceStatus.innerText = `🤔 Unknown command: "${command}"`;
      voiceStatus.style.color = "orange";
    }
  };

  recognition.onerror = (event) => {
    voiceStatus.innerText = "❌ Error: " + event.error;
    voiceStatus.style.color = "red";
  };
}

// =================== Theme Toggle ===================
function toggleTheme() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// =================== On Load ===================
window.onload = () => {
  // Load theme
  const theme = localStorage.getItem('theme');
  if (theme === 'dark') {
    document.body.classList.add('dark');
  }

  // Load local schedules
  loadSchedulesLocal();

  // Check schedules every second
  setInterval(checkSchedulesLocal, 1000);

  // Hide voice button if not supported
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const voiceBtn = document.getElementById('voiceControlBtn');
    if (voiceBtn) voiceBtn.style.display = 'none';
    const voiceStatus = document.getElementById('voiceStatus');
    if (voiceStatus) voiceStatus.innerText =
      'Voice control not supported in this browser. Try Chrome or Edge.';
  }
};

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("logoutBtn").onclick = function() {
    firebase.auth().signOut().then(() => {
      window.location.href = "login.html";
    }).catch((error) => {
      alert("Logout failed: " + error.message);
    });
  };
});