/* AstroVibes Crew Health — vanilla JS, built from scratch for NASA Space Apps 2026.
   Static app: state lives in localStorage, all readings are SIMULATED.
   The risk engine is rule-based and explainable. It never diagnoses and never guesses:
   missing data is reported as missing. */
'use strict';

var STORAGE_KEY = 'avch_state_v1';
var MISSION_DAY = 98;
var MISSION_TOTAL = 180;

/* ---------- Environments (comm-delay aware) ---------- */
var ENVIRONMENTS = {
  'ISS':        { delay: 'near-instant (seconds)', advice: 'Ground can reply almost instantly. Escalate to the flight surgeon at once for any Alert or Critical flag.', temp: 22.4, pressure: 101.3, co2: 0.42, noise: 58, radDay: 0.31 },
  'Spacecraft': { delay: 'seconds to minutes',    advice: 'Ground reply is quick but not instant. Start the recommended self-help step now, then send the alert to ground.', temp: 22.1, pressure: 100.9, co2: 0.48, noise: 61, radDay: 0.38 },
  'Rover':      { delay: 'minutes (via relay)',   advice: 'You are on a surface traverse with a relay link. For a Critical flag, return to base and contact the crew medic immediately.', temp: 21.8, pressure: 100.6, co2: 0.51, noise: 55, radDay: 0.44 },
  'Moon Base':  { delay: 'about 1.3 seconds one-way', advice: 'Near-real-time voice is possible. Escalate Alert and Critical flags to the flight surgeon without waiting.', temp: 22.6, pressure: 101.0, co2: 0.45, noise: 57, radDay: 0.52 },
  'Mars Base':  { delay: '20–44 minutes one-way', advice: 'Ground cannot answer in time for an emergency. For a Critical flag, act on the onboard guidance now and message ground in parallel — do not wait for a reply.', temp: 21.9, pressure: 99.8, co2: 0.55, noise: 56, radDay: 0.66 }
};

/* ---------- Demonstration thresholds (NOT medical flight standards) ---------- */
var LIMITS = {
  hr:      { low: 50,  high: 100, critLow: 45,  critHigh: 120 },
  sys:     { low: 90,  high: 140, critHigh: 160 },
  dia:     { low: 60,  high: 90,  critHigh: 100 },
  spo2:    { low: 95,  critLow: 92 },
  temp:    { low: 36.0, high: 37.5, critHigh: 38.5 },
  glucose: { low: 70,  high: 140 },
  sleep:   { short: 6.0, veryShort: 5.0 },
  exercise:{ min: 20 },
  radiation:{ watch: 50, alert: 80 }   /* cumulative mSv, simulated */
};

/* ---------- Fictional crew (own invention — no real astronauts) ---------- */
var CREW_SEED = [
  { id: 'sara',   name: 'Sara Iqbal',   role: 'Commander',       age: 38, sex: 'F',
    baseline: { hr: 68, sys: 116, dia: 74, spo2: 98.5, temp: 36.6, glucose: 92, sleep: 7.4, exercise: 50 },
    radCumulative: 41.2, note: 'Steady all mission. Sleeps well, exercises daily.' },
  { id: 'daniyal', name: 'Daniyal Raza', role: 'Flight Engineer', age: 34, sex: 'M',
    baseline: { hr: 72, sys: 121, dia: 78, spo2: 98.0, temp: 36.7, glucose: 95, sleep: 7.1, exercise: 45 },
    radCumulative: 46.8, note: 'Drifting in the last 3 days: shorter sleep, higher heart rate, lower SpO2. Needs watching.' },
  { id: 'laila',  name: 'Laila Noor',   role: 'Medical Officer',  age: 31, sex: 'F',
    baseline: { hr: 70, sys: 118, dia: 76, spo2: 98.2, temp: 36.6, glucose: 90, sleep: 7.0, exercise: 40 },
    radCumulative: 39.6, note: 'Mostly steady. One short night 2 days ago after a late shift.' }
];

/* ---------- Body systems (NASA hazards, from NASA_Resources_Checked.md) ---------- */
var BODY_SYSTEMS = {
  mind:    { title: 'Mind & behaviour', indicators: ['Mood (1–5)', 'Stress (1–5)', 'Sleep hours & quality'], hazard: 'Isolation and Confinement — behavioural responses in groups isolated in a small space for a long time.', guidance: 'Keep a regular sleep and work schedule, talk with the crew, and tell the crew medic if low mood or high stress lasts 3 days.' },
  eyes:    { title: 'Eyes & vision', indicators: ['Vision check', 'Headache / eye pressure symptoms', 'Sleep (fluid shifts affect the eyes)'], hazard: 'Gravity Fields — fluid shifts in weightlessness; SANS (Spaceflight Associated Neuro-ocular Syndrome) is NASA’s leading spaceflight health risk.', guidance: 'Report any vision change or persistent headache at once. The B-Complex and Thigh Cuff studies look at this risk.' },
  lungs:   { title: 'Lungs & breathing', indicators: ['SpO2 (%)', 'Breathing / cough symptoms', 'Cabin CO2'], hazard: 'Hostile / Closed Environments — air quality, pressure and CO2 inside the spacecraft.', guidance: 'If SpO2 falls below 95%, re-measure, rest, and tell the crew medic. Below 92% is critical.' },
  heart:   { title: 'Heart & circulation', indicators: ['Heart rate (bpm)', 'Blood pressure (mmHg)'], hazard: 'Gravity Fields & Cardiovascular Adaptations — weightlessness changes circulation and how the heart and blood vessels work.', guidance: 'Rest 5 minutes, re-measure, and compare with your own baseline. A rising trend over days matters even inside the normal range.' },
  gut:     { title: 'Gut & nutrition', indicators: ['Appetite / nausea symptoms', 'Glucose (mg/dL)'], hazard: 'Host-Microorganism Interactions — skin and gut microbiomes change in space.', guidance: 'Eat the planned meals, drink water, and log nausea or appetite loss. Food Physiology research studies the spaceflight diet.' },
  muscles: { title: 'Muscles & bones', indicators: ['Exercise minutes & type', 'Muscle soreness / joint pain'], hazard: 'Gravity Fields — without gravity, bones break down and become brittle; muscle strength falls. Exercise is the countermeasure.', guidance: 'Do the planned countermeasure exercise every day. Missing 2 days in a row is flagged. Spinal Health research studies bone and muscle loss.' },
  skin:    { title: 'Skin & immune system', indicators: ['Rash / skin symptoms', 'Stress, sleep, illness symptoms'], hazard: 'Space Radiation & Hostile / Closed Environments — radiation and microbes; stress can awaken inactive viruses.', guidance: 'Log any rash or skin change with a photo note if possible, and tell the crew medic. Immune Biomarkers research studies this with blood and saliva samples.' }
};
/* Which risk rules belong to which body system (for colouring the map). */
var SYSTEM_RULES = {
  mind: ['MOOD_STRESS_HIGH', 'SLEEP_SHORT', 'SLEEP_CONSECUTIVE_SHORT', 'SLEEP_DROP'],
  eyes: ['TEMP_HIGH'],
  lungs: ['SPO2_LOW', 'SPO2_DRIFT'],
  heart: ['HR_HIGH', 'HR_LOW', 'HR_DRIFT', 'BP_HIGH', 'BP_LOW'],
  gut: ['GLUCOSE_HIGH', 'GLUCOSE_LOW'],
  muscles: ['EXERCISE_MISSED'],
  skin: ['RADIATION_DOSE']
};

/* ---------- Small helpers ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function todayISO(offsetDays){
  var d = new Date(); d.setDate(d.getDate() + (offsetDays || 0));
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(iso){ var p = iso.split('-'); return p[2] + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1]; }
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function round1(x){ return Math.round(x * 10) / 10; }
function mean(arr){ if(!arr.length) return null; return arr.reduce(function(a,b){ return a+b; }, 0) / arr.length; }

/* ---------- Seed data (deterministic, simulated) ---------- */
function seedReading(crew, dayOffset, rng){
  var b = crew.baseline, r = {};
  r.date = todayISO(dayOffset);
  r.crewId = crew.id;
  r.source = 'simulated';
  r.hr = Math.round(b.hr + (rng()-0.5)*8);
  r.sys = Math.round(b.sys + (rng()-0.5)*10);
  r.dia = Math.round(b.dia + (rng()-0.5)*8);
  r.spo2 = round1(Math.min(99.5, Math.max(96.5, b.spo2 + (rng()-0.5)*1.6)));
  r.temp = round1(b.temp + (rng()-0.5)*0.5);
  r.glucose = Math.round(b.glucose + (rng()-0.5)*14);
  r.sleep = round1(Math.max(5.5, b.sleep + (rng()-0.5)*1.6));
  r.sleepQuality = rng() > 0.3 ? 'good' : 'fair';
  r.mood = 4; r.stress = 2;
  r.exercise = Math.round(b.exercise + (rng()-0.5)*20);
  r.exerciseType = 'Treadmill';
  r.symptoms = '';
  return r;
}
function buildSeed(){
  var readings = [];
  CREW_SEED.forEach(function(crew, ci){
    var rng = mulberry32(1000 + ci * 77);
    for (var d = -13; d <= 0; d++){
      var r = seedReading(crew, d, rng);
      /* Daniyal drifts in the last 3 days — the demo's watch/alert story. */
      if (crew.id === 'daniyal' && d >= -2){
        var step = d + 3; /* 1, 2, 3 */
        r.sleep = [6.0, 5.2, 4.8][step-1];
        r.sleepQuality = 'poor';
        r.hr = [76, 82, 88][step-1];
        r.spo2 = [95.5, 94.2, 93.1][step-1];
        r.mood = [3, 2, 2][step-1];
        r.stress = [3, 4, 4][step-1];
        r.exercise = [30, 15, 0][step-1];
        r.symptoms = d === 0 ? 'Tired, mild headache' : 'Trouble falling asleep';
      }
      if (crew.id === 'laila' && d === -2){ r.sleep = 5.4; r.sleepQuality = 'poor'; r.symptoms = 'Late shift, short night'; }
      if (crew.id === 'sara' && d === -1){ r.exercise = 55; }
      readings.push(r);
    }
  });
  return {
    version: 1,
    mission: { name: 'MERIDIAN-1', day: MISSION_DAY, total: MISSION_TOTAL },
    crew: CREW_SEED,
    readings: readings,
    acked: {},
    settings: { env: 'ISS', role: 'Flight Surgeon', lowBandwidth: false },
    selectedCrew: 'sara',
    selectedSystem: 'heart',
    trendMetric: 'hr',
    trendRange: '24h',
    alertFilter: 'all'
  };
}
function loadState(){
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw){ var s = JSON.parse(raw); if (s && s.version === 1 && s.readings) return s; }
  } catch (e) { /* corrupted storage: reseed below */ }
  var s = buildSeed(); saveState(s); return s;
}
function saveState(s){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {} }

/* ---------- Risk engine (explainable, rule-based) ---------- */
function baselineFor(crewId, history, field){
  var vals = history.filter(function(r){ return r.crewId === crewId && r[field] != null; })
    .slice(-7).map(function(r){ return r[field]; });
  return mean(vals);
}
function evaluateReading(crew, reading, history){
  var flags = [];
  var base = {};
  ['hr','sys','dia','spo2','temp','glucose','sleep','exercise'].forEach(function(f){ base[f] = baselineFor(crew.id, history, f); });
  function drift(field, pct){
    if (base[field] == null || reading[field] == null) return false;
    return Math.abs(reading[field] - base[field]) / base[field] > pct;
  }
  function add(rule, indicator, value, threshold, severity, reason, action){
    flags.push({ rule: rule, indicator: indicator, value: value, threshold: threshold,
      baseline: base[indicatorKey(indicator)] == null ? 'No baseline yet' : round1(base[indicatorKey(indicator)]),
      severity: severity, reason: reason, action: action });
  }
  function indicatorKey(label){
    return { 'Heart rate':'hr', 'Blood pressure (systolic)':'sys', 'Blood pressure (diastolic)':'dia',
      'SpO2':'spo2', 'Temperature':'temp', 'Glucose':'glucose', 'Sleep':'sleep', 'Exercise':'exercise' }[label] || label;
  }
  var L = LIMITS;
  if (reading.hr != null){
    if (reading.hr >= L.hr.critHigh) add('HR_HIGH','Heart rate', reading.hr + ' bpm', '≥ ' + L.hr.critHigh + ' bpm', 'critical', 'Heart rate is at a critical level.', 'Get help now — contact the crew medic and flight surgeon immediately.');
    else if (reading.hr > L.hr.high) add('HR_HIGH','Heart rate', reading.hr + ' bpm', '> ' + L.hr.high + ' bpm', 'alert', 'Heart rate is above the demonstration limit.', 'Rest 5 minutes, re-measure, and tell the crew medic.');
    else if (reading.hr < L.hr.critLow) add('HR_LOW','Heart rate', reading.hr + ' bpm', '< ' + L.hr.critLow + ' bpm', 'critical', 'Heart rate is at a critical level.', 'Get help now — contact the crew medic and flight surgeon immediately.');
    else if (reading.hr < L.hr.low) add('HR_LOW','Heart rate', reading.hr + ' bpm', '< ' + L.hr.low + ' bpm', 'alert', 'Heart rate is below the demonstration limit.', 'Rest, re-measure, and tell the crew medic.');
    else if (drift('hr', 0.15)) add('HR_DRIFT','Heart rate', reading.hr + ' bpm', 'drift > 15% from own 7-day baseline', 'watch', 'Heart rate has drifted from this astronaut’s own normal, even though it is inside the normal range.', 'Keep an eye on it and check again tomorrow.');
  }
  if (reading.spo2 != null){
    if (reading.spo2 < L.spo2.critLow) add('SPO2_LOW','SpO2', reading.spo2 + '%', '< ' + L.spo2.critLow + '%', 'critical', 'Oxygen saturation is critically low.', 'Get help now — rest, check the sensor, and contact the crew medic immediately.');
    else if (reading.spo2 < L.spo2.low) add('SPO2_LOW','SpO2', reading.spo2 + '%', '< ' + L.spo2.low + '%', 'alert', 'Oxygen saturation is below the demonstration limit.', 'Re-measure, rest, and tell the crew medic.');
    else if (drift('spo2', 0.02)) add('SPO2_DRIFT','SpO2', reading.spo2 + '%', 'drift > 2% from own 7-day baseline', 'watch', 'SpO2 is drifting down from this astronaut’s own normal.', 'Keep an eye on it and check again tomorrow.');
  }
  if (reading.sys != null){
    if (reading.sys >= L.sys.critHigh || (reading.dia != null && reading.dia >= L.dia.critHigh)) add('BP_HIGH','Blood pressure (systolic)', reading.sys + '/' + reading.dia + ' mmHg', '≥ ' + L.sys.critHigh + '/' + L.dia.critHigh + ' mmHg', 'critical', 'Blood pressure is at a critical level.', 'Get help now — rest and contact the crew medic immediately.');
    else if (reading.sys > L.sys.high || (reading.dia != null && reading.dia > L.dia.high)) add('BP_HIGH','Blood pressure (systolic)', reading.sys + '/' + reading.dia + ' mmHg', '> ' + L.sys.high + '/' + L.dia.high + ' mmHg', 'alert', 'Blood pressure is above the demonstration limit.', 'Rest 5 minutes, re-measure, and tell the crew medic.');
    else if (reading.sys < L.sys.low) add('BP_LOW','Blood pressure (systolic)', reading.sys + '/' + reading.dia + ' mmHg', '< ' + L.sys.low + ' mmHg', 'alert', 'Blood pressure is below the demonstration limit.', 'Rest, drink water, re-measure, and tell the crew medic.');
  }
  if (reading.temp != null){
    if (reading.temp >= L.temp.critHigh) add('TEMP_HIGH','Temperature', reading.temp + ' °C', '≥ ' + L.temp.critHigh + ' °C', 'critical', 'Temperature is at a fever level that needs urgent attention.', 'Get help now — contact the crew medic immediately.');
    else if (reading.temp > L.temp.high) add('TEMP_HIGH','Temperature', reading.temp + ' °C', '> ' + L.temp.high + ' °C', 'alert', 'Temperature is above the demonstration limit.', 'Rest, drink water, re-measure in 30 minutes, and tell the crew medic.');
    else if (reading.temp < L.temp.low) add('TEMP_LOW','Temperature', reading.temp + ' °C', '< ' + L.temp.low + ' °C', 'alert', 'Temperature is below the demonstration limit.', 'Warm up, re-measure, and tell the crew medic.');
  }
  if (reading.glucose != null){
    if (reading.glucose > L.glucose.high) add('GLUCOSE_HIGH','Glucose', reading.glucose + ' mg/dL', '> ' + L.glucose.high + ' mg/dL', 'watch', 'Glucose is above the demonstration limit.', 'Drink water, avoid sugary food, and re-measure at the next check-in.');
    else if (reading.glucose < L.glucose.low) add('GLUCOSE_LOW','Glucose', reading.glucose + ' mg/dL', '< ' + L.glucose.low + ' mg/dL', 'watch', 'Glucose is below the demonstration limit.', 'Eat something, rest, and re-measure in 30 minutes.');
  }
  if (reading.sleep != null){
    var last3 = history.filter(function(r){ return r.crewId === crew.id; }).slice(-2).map(function(r){ return r.sleep; });
    last3.push(reading.sleep);
    var shortCount = last3.filter(function(s){ return s != null && s < L.sleep.short; }).length;
    if (reading.sleep < L.sleep.veryShort) add('SLEEP_SHORT','Sleep', reading.sleep + ' h', '< ' + L.sleep.veryShort + ' h', 'alert', 'Last night’s sleep was very short.', 'Prioritise sleep tonight and tell the crew medic.');
    else if (reading.sleep < L.sleep.short) add('SLEEP_SHORT','Sleep', reading.sleep + ' h', '< ' + L.sleep.short + ' h', 'watch', 'Last night’s sleep was short.', 'Keep a regular wind-down routine tonight and check again tomorrow.');
    if (shortCount >= 3) add('SLEEP_CONSECUTIVE_SHORT','Sleep', shortCount + ' short nights in a row', '3 short nights (< ' + L.sleep.short + ' h) in a row', 'alert', 'Sleep has been short for 3 nights in a row.', 'Tell the crew medic — this is a pattern, not one bad night.');
    if (base.sleep != null && base.sleep - reading.sleep >= 1.5) add('SLEEP_DROP','Sleep', reading.sleep + ' h', 'drop ≥ 1.5 h vs own 7-day baseline (' + round1(base.sleep) + ' h)', 'watch', 'Sleep has dropped sharply from this astronaut’s own normal.', 'Keep an eye on it and protect tonight’s sleep window.');
  }
  if (reading.exercise != null){
    var prev = history.filter(function(r){ return r.crewId === crew.id; }).slice(-1)[0];
    if (reading.exercise === 0 && prev && prev.exercise < LIMITS.exercise.min) add('EXERCISE_MISSED','Exercise', '0 min today, ' + prev.exercise + ' min yesterday', 'countermeasure exercise < ' + LIMITS.exercise.min + ' min for 2 days', 'watch', 'The exercise countermeasure has been missed for 2 days — bone and muscle loss risk grows without it.', 'Do the planned countermeasure exercise today and log it.');
    else if (reading.exercise === 0) add('EXERCISE_MISSED','Exercise', '0 min today', 'no countermeasure exercise today', 'watch', 'No countermeasure exercise today.', 'Do the planned exercise today and log it.');
  }
  if (reading.mood != null && reading.stress != null && (reading.mood <= 2 || reading.stress >= 4)){
    add('MOOD_STRESS_HIGH','Mood / stress', 'mood ' + reading.mood + '/5, stress ' + reading.stress + '/5', 'mood ≤ 2 or stress ≥ 4', 'watch', 'Mood is low or stress is high today.', 'Talk with the crew, keep the routine, and tell the crew medic if it lasts 3 days.');
  }
  var rad = crew.radCumulative;
  if (rad >= LIMITS.radiation.alert) add('RADIATION_DOSE','Radiation dose', rad + ' mSv cumulative', '≥ ' + LIMITS.radiation.alert + ' mSv', 'alert', 'Cumulative simulated radiation dose has reached the demonstration alert level.', 'Tell the flight surgeon and review shielding and task planning.');
  else if (rad >= LIMITS.radiation.watch) add('RADIATION_DOSE','Radiation dose', rad + ' mSv cumulative', '≥ ' + LIMITS.radiation.watch + ' mSv', 'watch', 'Cumulative simulated radiation dose is approaching the demonstration alert level.', 'Keep an eye on it and review task planning with the flight surgeon.');
  return flags;
}
function triageFromFlags(flags){
  if (flags.some(function(f){ return f.severity === 'critical'; })) return { tier: 'Get Help Now', cls: 'GetHelp', action: 'Get help now — contact the crew medic and the flight surgeon immediately. Do not wait for a ground reply on Mars delay.' };
  if (flags.some(function(f){ return f.severity === 'alert'; })) return { tier: 'Tell Crew Medic', cls: 'TellMedic', action: 'Tell the crew medic today. Bring this check-in and the flags below to the conversation.' };
  if (flags.some(function(f){ return f.severity === 'watch'; })) return { tier: 'Keep an Eye', cls: 'KeepEye', action: 'Keep an eye on it: follow the guidance under each flag and check again tomorrow.' };
  return { tier: 'All Good', cls: 'AllGood', action: 'All good. Keep the routine — daily check-in, countermeasure exercise, and regular sleep.' };
}
function crewHistory(state, crewId){ return state.readings.filter(function(r){ return r.crewId === crewId; }).sort(function(a,b){ return a.date < b.date ? -1 : 1; }); }
function latestReading(state, crewId){ var h = crewHistory(state, crewId); return h.length ? h[h.length-1] : null; }
function crewFlags(state, crew){
  var h = crewHistory(state, crew.id);
  var latest = h[h.length-1];
  if (!latest) return [];
  return evaluateReading(crew, latest, h.slice(0, -1));
}
function crewStatus(state, crew){
  var flags = crewFlags(state, crew);
  if (flags.some(function(f){ return f.severity === 'critical'; })) return 'critical';
  if (flags.some(function(f){ return f.severity === 'alert'; })) return 'alert';
  if (flags.some(function(f){ return f.severity === 'watch'; })) return 'watch';
  return 'nominal';
}
function statusPill(status){
  if (status === 'critical') return '<span class="pill red">Critical</span>';
  if (status === 'alert') return '<span class="pill red">Alert</span>';
  if (status === 'watch') return '<span class="pill amber">Watch</span>';
  return '<span class="pill green">Nominal</span>';
}
function buildAlerts(state){
  var alerts = [];
  state.crew.forEach(function(crew){
    var h = crewHistory(state, crew.id);
    h.slice(-3).forEach(function(reading){
      var before = h.filter(function(r){ return r.date < reading.date; });
      evaluateReading(crew, reading, before).forEach(function(f){
        alerts.push({ id: crew.id + '|' + reading.date + '|' + f.rule, crewId: crew.id, crewName: crew.name,
          date: reading.date, rule: f.rule, indicator: f.indicator, value: f.value, threshold: f.threshold,
          baseline: f.baseline, severity: f.severity, reason: f.reason, action: f.action,
          acked: !!state.acked[crew.id + '|' + reading.date + '|' + f.rule] });
      });
    });
  });
  var order = { critical: 0, alert: 1, watch: 2 };
  alerts.sort(function(a,b){ return (order[a.severity] - order[b.severity]) || (a.date < b.date ? 1 : -1); });
  return alerts;
}
function streakFor(state, crewId){
  var dates = {};
  crewHistory(state, crewId).forEach(function(r){ dates[r.date] = true; });
  var n = 0, d = new Date();
  while (dates[todayISO(-n)]){ n++; }
  return n;
}
function visibleCrew(state){
  if (state.settings.role === 'Astronaut') return state.crew.filter(function(c){ return c.id === state.selectedCrew; });
  return state.crew;
}

/* ---------- Rendering ---------- */
var state = loadState();
var chartInstance = null;

function fillCrewSelects(){
  var opts = state.crew.map(function(c){ return '<option value="' + c.id + '">' + esc(c.name) + ' — ' + esc(c.role) + '</option>'; }).join('');
  ['ciCrew','bodyCrew','trendCrew','crewSelect'].forEach(function(id){ var el = $(id); if (el) el.innerHTML = opts; });
  $('ciCrew').value = state.selectedCrew; $('bodyCrew').value = state.selectedCrew;
  $('trendCrew').value = state.selectedCrew; $('crewSelect').value = state.selectedCrew;
}

function renderDashboard(){
  var crews = visibleCrew(state);
  var alerts = buildAlerts(state);
  var unacked = alerts.filter(function(a){ return !a.acked; });
  var today = todayISO(0);
  var checkedIn = state.crew.filter(function(c){ return latestReading(state, c.id) && latestReading(state, c.id).date === today; }).length;
  var crit = alerts.filter(function(a){ return a.severity === 'critical' && !a.acked; }).length;
  $('dashSummary').innerHTML =
    '<div class="card"><div class="muted small">Crew nominal</div><div class="stat" style="color:var(--green)">' + state.crew.filter(function(c){ return crewStatus(state,c)==='nominal'; }).length + ' / ' + state.crew.length + '</div><div class="muted small">green status right now</div></div>' +
    '<div class="card"><div class="muted small">Unacknowledged alerts</div><div class="stat" style="color:' + (unacked.length ? 'var(--red)' : 'var(--green)') + '">' + unacked.length + '</div><div class="muted small">' + crit + ' critical</div></div>' +
    '<div class="card"><div class="muted small">Checked in today</div><div class="stat">' + checkedIn + ' / ' + state.crew.length + '</div><div class="muted small">Mission day ' + MISSION_DAY + ' of ' + MISSION_TOTAL + '</div></div>' +
    '<div class="card"><div class="muted small">Ground delay (' + esc(state.settings.env) + ')</div><div class="stat" style="font-size:1.3rem">' + esc(ENVIRONMENTS[state.settings.env].delay) + '</div><div class="muted small">see Settings to change environment</div></div>';
  var missing = state.crew.filter(function(c){ var l = latestReading(state, c.id); return !l || l.date !== today; });
  $('reminderBanner').className = missing.length ? 'banner' : 'banner green';
  $('reminderBanner').innerHTML = missing.length
    ? '<h3>⏰ Routine check-in reminder</h3><p style="margin:0">' + missing.map(function(c){ return esc(c.name); }).join(', ') + ' — no check-in yet today (Day ' + MISSION_DAY + '). A 2-minute check-in keeps the personal baseline honest.</p>'
    : '<h3>✓ All crew checked in today</h3><p style="margin:0">Every crew member has completed today&rsquo;s check-in. Streaks: ' + state.crew.map(function(c){ return esc(c.name) + ' — ' + streakFor(state, c.id) + ' days'; }).join(' · ') + '.</p>';
  $('crewCards').innerHTML = crews.map(function(crew){
    var st = crewStatus(state, crew), latest = latestReading(state, crew.id), flags = crewFlags(state, crew);
    var cls = st === 'nominal' ? 'status-green' : (st === 'watch' ? 'status-amber' : 'status-red');
    return '<div class="card crew-card ' + cls + '" data-crew="' + crew.id + '" tabindex="0">' +
      '<div style="display:flex;justify-content:space-between;gap:8px"><span class="name">' + esc(crew.name) + '</span>' + statusPill(st) + '</div>' +
      '<div class="muted small">' + esc(crew.role) + ' · Age ' + crew.age + ' · ' + esc(crew.note) + '</div>' +
      (latest ? '<div class="vitals">' +
        '<div class="vital"><div class="label">Heart rate</div><div class="value">' + latest.hr + ' bpm</div><div class="base">baseline ' + round1(baselineFor(crew.id, crewHistory(state, crew.id), 'hr')) + '</div></div>' +
        '<div class="vital"><div class="label">SpO2</div><div class="value">' + latest.spo2 + '%</div><div class="base">baseline ' + round1(baselineFor(crew.id, crewHistory(state, crew.id), 'spo2')) + '%</div></div>' +
        '<div class="vital"><div class="label">Sleep</div><div class="value">' + latest.sleep + ' h</div><div class="base">baseline ' + round1(baselineFor(crew.id, crewHistory(state, crew.id), 'sleep')) + ' h</div></div>' +
        '<div class="vital"><div class="label">Streak</div><div class="value">' + streakFor(state, crew.id) + ' days</div><div class="base">check-in streak</div></div>' +
      '</div>' : '<p class="muted">No data — this crew member has no readings yet.</p>') +
      (flags.length ? '<p class="small" style="margin:10px 0 0"><strong>' + flags.length + ' flag' + (flags.length>1?'s':'') + ':</strong> ' + flags.map(function(f){ return esc(f.rule); }).join(', ') + '</p>' : '<p class="small" style="margin:10px 0 0">No flags on the latest check-in.</p>') +
      '<p class="small faint" style="margin:8px 0 0">Click for full crew detail →</p></div>';
  }).join('');
  document.querySelectorAll('.crew-card').forEach(function(el){
    el.addEventListener('click', function(){ state.selectedCrew = el.getAttribute('data-crew'); saveState(state); $('crewSelect').value = state.selectedCrew; showPage('crew'); });
  });
  renderEnv();
  var top = alerts.filter(function(a){ return !a.acked; }).slice(0, 4);
  $('dashAlerts').innerHTML = top.length ? top.map(alertHtml).join('') : '<div class="card"><p style="margin:0">No unacknowledged alerts. All crew are nominal or watched — nothing needs action right now.</p></div>';
  $('streakLine').textContent = state.crew.map(function(c){ return c.name + ' — ' + streakFor(state, c.id) + ' days'; }).join(' · ');
}

function renderEnv(){
  var env = ENVIRONMENTS[state.settings.env];
  $('envPanel').innerHTML =
    '<div><div class="k">Cabin temperature</div><div class="v">' + env.temp + ' °C</div></div>' +
    '<div><div class="k">Cabin pressure</div><div class="v">' + env.pressure + ' kPa</div></div>' +
    '<div><div class="k">Cabin CO2</div><div class="v">' + env.co2 + '%</div></div>' +
    '<div><div class="k">Cabin noise</div><div class="v">' + env.noise + ' dB</div></div>' +
    '<div><div class="k">Radiation today (simulated)</div><div class="v">' + env.radDay + ' mSv/day</div></div>' +
    '<div><div class="k">Environment</div><div class="v">' + esc(state.settings.env) + '</div></div>';
  $('commDelayNote').textContent = 'Ground delay: ' + env.delay + '. ' + env.advice;
  $('envChip').textContent = 'Environment: ' + state.settings.env + ' · Ground delay: ' + env.delay;
}

function alertHtml(a){
  var sevClass = a.severity === 'critical' ? 'critical' : a.severity;
  return '<div class="alert-item ' + sevClass + (a.acked ? ' acked' : '') + '">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="rule">' + esc(a.rule) + ' — ' + esc(a.crewName) + ' · ' + fmtDate(a.date) + '</span>' +
    '<span>' + statusPill(a.severity === 'watch' ? 'watch' : (a.severity === 'critical' ? 'critical' : 'alert')) + (a.acked ? ' <span class="pill grey">Acknowledged</span>' : '') + '</span></div>' +
    '<dl><div><dt>Indicator</dt><dd>' + esc(a.indicator) + '</dd></div><div><dt>Measured value</dt><dd>' + esc(a.value) + '</dd></div>' +
    '<div><dt>Threshold</dt><dd>' + esc(a.threshold) + '</dd></div><div><dt>Own 7-day baseline</dt><dd>' + esc(String(a.baseline)) + '</dd></div></dl>' +
    '<p style="margin:6px 0"><strong>Why:</strong> ' + esc(a.reason) + '</p>' +
    '<p style="margin:6px 0"><strong>Next action:</strong> ' + esc(a.action) + '</p>' +
    (a.acked ? '' : '<button class="btn secondary small" data-ack="' + esc(a.id) + '">Acknowledge</button>') +
  '</div>';
}
function renderAlerts(){
  var all = buildAlerts(state);
  $('countAll').textContent = all.length;
  $('countCritical').textContent = all.filter(function(a){ return a.severity === 'critical'; }).length;
  $('countAlert').textContent = all.filter(function(a){ return a.severity === 'alert'; }).length;
  $('countWatch').textContent = all.filter(function(a){ return a.severity === 'watch'; }).length;
  $('countUnacked').textContent = all.filter(function(a){ return !a.acked; }).length;
  var f = state.alertFilter;
  var list = all.filter(function(a){
    if (f === 'all') return true;
    if (f === 'unacked') return !a.acked;
    return a.severity === f;
  });
  $('alertsList').innerHTML = list.length ? list.map(alertHtml).join('') : '<div class="card"><p style="margin:0">No alerts match this filter.</p></div>';
  document.querySelectorAll('[data-ack]').forEach(function(btn){
    btn.addEventListener('click', function(){
      state.acked[btn.getAttribute('data-ack')] = true; saveState(state); renderAll();
    });
  });
}

function renderCrewDetail(){
  var crew = state.crew.find(function(c){ return c.id === state.selectedCrew; }) || state.crew[0];
  var h = crewHistory(state, crew.id), latest = h[h.length-1], flags = crewFlags(state, crew);
  var st = crewStatus(state, crew);
  var rows = h.slice(-7).reverse().map(function(r){
    return '<tr><td>' + fmtDate(r.date) + '</td><td>' + r.hr + '</td><td>' + r.sys + '/' + r.dia + '</td><td>' + r.spo2 + '%</td><td>' + r.temp + '°C</td><td>' + r.sleep + ' h</td><td>' + r.exercise + ' min</td><td>' + (r.symptoms ? esc(r.symptoms) : '—') + '</td></tr>';
  }).join('');
  $('crewDetail').innerHTML =
    '<div class="card ' + (st==='nominal'?'status-green':st==='watch'?'status-amber':'status-red') + '">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h3 style="margin:0">' + esc(crew.name) + ' — ' + esc(crew.role) + '</h3>' + statusPill(st) + '</div>' +
    '<p class="muted">Age ' + crew.age + ' · Mission day ' + MISSION_DAY + ' of ' + MISSION_TOTAL + ' · Cumulative radiation (simulated): ' + crew.radCumulative + ' mSv · Check-in streak: ' + streakFor(state, crew.id) + ' days</p>' +
    '<p>' + esc(crew.note) + '</p>' +
    (latest ? '<div class="vitals">' +
      '<div class="vital"><div class="label">Heart rate</div><div class="value">' + latest.hr + ' bpm</div><div class="base">baseline ' + round1(baselineFor(crew.id, h, 'hr')) + '</div></div>' +
      '<div class="vital"><div class="label">Blood pressure</div><div class="value">' + latest.sys + '/' + latest.dia + '</div><div class="base">baseline ' + round1(baselineFor(crew.id, h, 'sys')) + '/' + round1(baselineFor(crew.id, h, 'dia')) + '</div></div>' +
      '<div class="vital"><div class="label">SpO2</div><div class="value">' + latest.spo2 + '%</div><div class="base">baseline ' + round1(baselineFor(crew.id, h, 'spo2')) + '%</div></div>' +
      '<div class="vital"><div class="label">Temperature</div><div class="value">' + latest.temp + ' °C</div><div class="base">baseline ' + round1(baselineFor(crew.id, h, 'temp')) + ' °C</div></div>' +
      '<div class="vital"><div class="label">Sleep</div><div class="value">' + latest.sleep + ' h (' + esc(latest.sleepQuality) + ')</div><div class="base">baseline ' + round1(baselineFor(crew.id, h, 'sleep')) + ' h</div></div>' +
      '<div class="vital"><div class="label">Exercise</div><div class="value">' + latest.exercise + ' min</div><div class="base">' + esc(latest.exerciseType) + '</div></div>' +
    '</div>' : '<p class="muted">No data — this crew member has no readings yet.</p>') +
    (flags.length ? '<h3>Flags on latest check-in</h3>' + flags.map(function(f){
      return '<p style="margin:6px 0"><span class="pill ' + (f.severity==='critical'||f.severity==='alert' ? 'red' : 'amber') + '">' + f.severity + '</span> <strong>' + esc(f.rule) + '</strong> — ' + esc(f.indicator) + ': ' + esc(f.value) + ' (threshold: ' + esc(f.threshold) + '; baseline: ' + esc(String(f.baseline)) + '). ' + esc(f.reason) + ' ' + esc(f.action) + '</p>';
    }).join('') : '<p style="margin-top:12px">No flags on the latest check-in.</p>') +
    '<h3>Last 7 days (simulated)</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>HR</th><th>BP</th><th>SpO2</th><th>Temp</th><th>Sleep</th><th>Exercise</th><th>Symptoms</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

var METRIC_META = {
  hr: { label: 'Heart rate (bpm)', field: 'hr', color: '#38bdf8' },
  sys: { label: 'Blood pressure — systolic (mmHg)', field: 'sys', color: '#a78bfa' },
  spo2: { label: 'SpO2 (%)', field: 'spo2', color: '#2fbf71' },
  temp: { label: 'Temperature (°C)', field: 'temp', color: '#f5a623' },
  sleep: { label: 'Sleep (hours)', field: 'sleep', color: '#38bdf8' },
  exercise: { label: 'Exercise (minutes)', field: 'exercise', color: '#2fbf71' }
};
function hourlySeries(crew, field){
  /* Deterministic 24-hour series for today, built from the crew baseline. */
  var rng = mulberry32(500 + crew.id.length * 31 + field.length);
  var base = crew.baseline[field] == null ? 0 : crew.baseline[field];
  var latest = latestReading(state, crew.id);
  var pts = [];
  for (var h = 0; h < 24; h++){
    var v = base + (rng()-0.5) * (field === 'hr' ? 10 : field === 'spo2' ? 1.4 : field === 'temp' ? 0.4 : field === 'sleep' ? 0 : 8);
    if (field === 'sleep' || field === 'exercise'){ v = h === 23 && latest ? latest[field] : null; }
    pts.push({ label: String(h).padStart(2,'0') + ':00', value: v == null ? null : round1(v) });
  }
  if (latest && (field === 'sleep' || field === 'exercise')) pts[23].value = latest[field];
  return pts;
}
function renderTrends(){
  var crew = state.crew.find(function(c){ return c.id === state.selectedCrew; }) || state.crew[0];
  var meta = METRIC_META[state.trendMetric];
  var h = crewHistory(state, crew.id);
  var base = baselineFor(crew.id, h, meta.field);
  var labels = [], values = [];
  if (state.trendRange === '24h'){
    var pts = hourlySeries(crew, meta.field).filter(function(p){ return p.value != null; });
    labels = pts.map(function(p){ return p.label; }); values = pts.map(function(p){ return p.value; });
  } else {
    var last7 = h.slice(-7);
    labels = last7.map(function(r){ return fmtDate(r.date); }); values = last7.map(function(r){ return r[meta.field]; });
  }
  var missing = values.filter(function(v){ return v == null; }).length;
  $('trendSummary').innerHTML = '<strong>' + esc(crew.name) + ' — ' + esc(meta.label) + '</strong> · Own 7-day baseline: ' +
    (base == null ? 'No baseline yet — not enough data' : round1(base)) + ' · Range: ' + (state.trendRange === '24h' ? 'last 24 hours' : 'last 7 days') +
    (missing ? ' · ' + missing + ' point(s) missing — shown as gaps, not guessed.' : '');
  $('trendTableWrap').innerHTML = '<table><thead><tr><th>Time</th><th>' + esc(meta.label) + '</th><th>Own baseline</th></tr></thead><tbody>' +
    labels.map(function(l, i){ return '<tr><td>' + esc(l) + '</td><td>' + (values[i] == null ? 'No data' : values[i]) + '</td><td>' + (base == null ? '—' : round1(base)) + '</td></tr>'; }).join('') + '</tbody></table>';
  if (chartInstance){ chartInstance.destroy(); chartInstance = null; }
  var canvas = $('trendChart');
  if (window.Chart && !state.settings.lowBandwidth && values.some(function(v){ return v != null; })){
    chartInstance = new Chart(canvas, { type: 'line',
      data: { labels: labels, datasets: [
        { label: meta.label, data: values, borderColor: meta.color, backgroundColor: meta.color + '33', tension: 0.3, spanGaps: true },
        { label: 'Own 7-day baseline', data: labels.map(function(){ return base == null ? null : round1(base); }), borderColor: '#f5a623', borderDash: [6,4], pointRadius: 0, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#e8eef7' } } },
        scales: { x: { ticks: { color: '#9fb0c8' }, grid: { color: '#22395c' } }, y: { ticks: { color: '#9fb0c8' }, grid: { color: '#22395c' } } } }
    });
  }
}

function renderBodyMap(){
  var crew = state.crew.find(function(c){ return c.id === state.selectedCrew; }) || state.crew[0];
  var flags = crewFlags(state, crew);
  var sys = state.selectedSystem;
  var info = BODY_SYSTEMS[sys];
  var sysFlags = flags.filter(function(f){ return (SYSTEM_RULES[sys] || []).indexOf(f.rule) !== -1; });
  var worst = sysFlags.some(function(f){ return f.severity === 'critical'; }) ? 'critical' : sysFlags.some(function(f){ return f.severity === 'alert'; }) ? 'alert' : sysFlags.length ? 'watch' : 'nominal';
  $('bodyInfo').innerHTML = '<h3>' + esc(info.title) + ' — ' + esc(crew.name) + '</h3>' +
    '<p>' + statusPill(worst) + '</p>' +
    '<p><strong>Indicators:</strong> ' + info.indicators.map(esc).join(', ') + '.</p>' +
    '<p><strong>Spaceflight hazard:</strong> ' + esc(info.hazard) + '</p>' +
    '<p><strong>Guidance:</strong> ' + esc(info.guidance) + '</p>' +
    (sysFlags.length ? '<h3>Flags for this system</h3>' + sysFlags.map(function(f){
      return '<p style="margin:6px 0"><strong>' + esc(f.rule) + '</strong> — ' + esc(f.value) + ' (threshold: ' + esc(f.threshold) + '; baseline: ' + esc(String(f.baseline)) + '). ' + esc(f.reason) + '</p>';
    }).join('') : '<p class="muted">No flags for this system on the latest check-in.</p>') +
    '<p class="muted small">Latest check-in: ' + (latestReading(state, crew.id) ? fmtDate(latestReading(state, crew.id).date) : 'no data') + ' · All data simulated.</p>';
  document.querySelectorAll('.body-part').forEach(function(el){
    var s = el.getAttribute('data-system');
    var f = flags.filter(function(x){ return (SYSTEM_RULES[s] || []).indexOf(x.rule) !== -1; });
    el.classList.remove('warn','crit','selected');
    if (f.some(function(x){ return x.severity === 'critical' || x.severity === 'alert'; })) el.classList.add('crit');
    else if (f.length) el.classList.add('warn');
    if (s === sys) el.classList.add('selected');
  });
}

function renderSettings(){
  $('setEnv').value = state.settings.env;
  $('setRole').value = state.settings.role;
  $('setLowBandwidth').checked = state.settings.lowBandwidth;
  var env = ENVIRONMENTS[state.settings.env];
  $('envDetail').textContent = 'Ground delay: ' + env.delay + '. ' + env.advice;
  $('roleNote').textContent = state.settings.role === 'Astronaut'
    ? 'Astronaut view: the dashboard and crew screens show only the crew member selected on Crew Detail (' + (state.crew.find(function(c){ return c.id === state.selectedCrew; }) || {}).name + ').'
    : state.settings.role + ' view: all crew members are visible.';
  document.body.classList.toggle('low-bandwidth', !!state.settings.lowBandwidth);
}

function renderAll(){
  fillCrewSelects();
  renderDashboard();
  renderAlerts();
  renderCrewDetail();
  renderBodyMap();
  renderTrends();
  renderSettings();
}

/* ---------- Navigation ---------- */
function showPage(name){
  document.querySelectorAll('section.page').forEach(function(s){ s.classList.remove('active'); });
  var page = $('page-' + name); if (page) page.classList.add('active');
  document.querySelectorAll('[data-nav]').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-nav') === name); });
  if (name === 'trends') renderTrends();
  if (name === 'bodymap') renderBodyMap();
  if (name === 'crew') renderCrewDetail();
  if (name === 'alerts') renderAlerts();
  window.scrollTo(0, 0);
}

/* ---------- CSV export ---------- */
function exportCsv(){
  var rows = [['date','crew','heart_rate_bpm','bp_systolic_mmhg','bp_diastolic_mmhg','spo2_pct','temp_c','glucose_mgdl','sleep_h','sleep_quality','mood_1_5','stress_1_5','exercise_min','exercise_type','symptoms','source']];
  state.readings.forEach(function(r){
    var crew = state.crew.find(function(c){ return c.id === r.crewId; });
    rows.push([r.date, crew ? crew.name : r.crewId, r.hr, r.sys, r.dia, r.spo2, r.temp, r.glucose == null ? '' : r.glucose, r.sleep, r.sleepQuality, r.mood, r.stress, r.exercise, r.exerciseType, '"' + String(r.symptoms || '').replace(/"/g,'""') + '"', r.source]);
  });
  var blob = new Blob([rows.map(function(r){ return r.join(','); }).join('\n')], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'astrovibes-crew-health-readings-simulated.csv'; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
}

/* ---------- Check-in submit ---------- */
function handleCheckin(e){
  e.preventDefault();
  var crewId = $('ciCrew').value;
  var crew = state.crew.find(function(c){ return c.id === crewId; });
  var glucoseRaw = $('ciGlucose').value;
  var reading = {
    date: todayISO(0), crewId: crewId, source: 'manual (simulated)',
    hr: +$('ciHr').value, sys: +$('ciSys').value, dia: +$('ciDia').value,
    spo2: +$('ciSpo2').value, temp: +$('ciTemp').value,
    glucose: glucoseRaw === '' ? null : +glucoseRaw,
    sleep: +$('ciSleep').value, sleepQuality: $('ciSleepQuality').value,
    mood: +$('ciMood').value, stress: +$('ciStress').value,
    exercise: +$('ciExercise').value, exerciseType: $('ciExerciseType').value,
    symptoms: $('ciSymptoms').value.trim()
  };
  var history = crewHistory(state, crewId).filter(function(r){ return r.date !== reading.date; });
  var flags = evaluateReading(crew, reading, history);
  var triage = triageFromFlags(flags);
  var env = ENVIRONMENTS[state.settings.env];
  var missing = [];
  if (reading.glucose == null) missing.push('Glucose was not measured — no value was guessed for it.');
  var idx = state.readings.findIndex(function(r){ return r.crewId === crewId && r.date === reading.date; });
  if (idx >= 0) state.readings[idx] = reading; else state.readings.push(reading);
  state.selectedCrew = crewId;
  saveState(state);
  var flagHtml = flags.length ? '<h3>Flags found (' + flags.length + ')</h3>' + flags.map(function(f){
    return '<p style="margin:6px 0"><span class="pill ' + (f.severity==='critical'||f.severity==='alert' ? 'red' : 'amber') + '">' + f.severity + '</span> <strong>' + esc(f.rule) + '</strong> — ' + esc(f.indicator) + ': ' + esc(f.value) + ' (threshold: ' + esc(f.threshold) + '; baseline: ' + esc(String(f.baseline)) + '). ' + esc(f.reason) + '</p>';
  }).join('') : '<p>No flags. Every value is inside its demonstration limit and close to this astronaut’s own baseline.</p>';
  $('triageResult').innerHTML = '<div class="triage-result ' + triage.cls + '"><h3>Triage: ' + triage.tier + ' — ' + esc(crew.name) + '</h3>' +
    '<p><strong>Next action:</strong> ' + esc(triage.action) + '</p>' +
    '<p><strong>Environment (' + esc(state.settings.env) + '):</strong> ground delay ' + esc(env.delay) + '. ' + esc(env.advice) + '</p>' +
    (missing.length ? '<p><strong>Missing data:</strong> ' + missing.map(esc).join(' ') + '</p>' : '') +
    flagHtml + '<p class="muted small">Check-in saved. This is a risk flag, not a diagnosis. Always follow the flight surgeon / medical team.</p></div>';
  renderAll();
  $('triageResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- Wire up ---------- */
document.addEventListener('DOMContentLoaded', function(){
  renderAll();
  document.querySelectorAll('[data-nav]').forEach(function(b){
    b.addEventListener('click', function(){ showPage(b.getAttribute('data-nav')); });
  });
  $('checkinForm').addEventListener('submit', handleCheckin);
  $('exportCsvBtn').addEventListener('click', exportCsv);
  $('exportCsvBtn2').addEventListener('click', exportCsv);
  document.querySelectorAll('.body-part').forEach(function(el){
    el.addEventListener('click', function(){ state.selectedSystem = el.getAttribute('data-system'); saveState(state); renderBodyMap(); });
  });
  document.querySelectorAll('#metricRow button').forEach(function(b){
    b.addEventListener('click', function(){
      state.trendMetric = b.getAttribute('data-metric'); saveState(state);
      document.querySelectorAll('#metricRow button').forEach(function(x){ x.classList.toggle('active', x === b); });
      renderTrends();
    });
  });
  document.querySelectorAll('#rangeRow button').forEach(function(b){
    b.addEventListener('click', function(){
      state.trendRange = b.getAttribute('data-range'); saveState(state);
      document.querySelectorAll('#rangeRow button').forEach(function(x){ x.classList.toggle('active', x === b); });
      renderTrends();
    });
  });
  document.querySelectorAll('#alertFilters button').forEach(function(b){
    b.addEventListener('click', function(){
      state.alertFilter = b.getAttribute('data-filter'); saveState(state);
      document.querySelectorAll('#alertFilters button').forEach(function(x){ x.classList.toggle('active', x === b); });
      renderAlerts();
    });
  });
  ['ciCrew','bodyCrew','trendCrew','crewSelect'].forEach(function(id){
    $(id).addEventListener('change', function(){
      state.selectedCrew = $(id).value; saveState(state); renderAll();
      if (id === 'crewSelect') showPage('crew');
    });
  });
  $('setEnv').addEventListener('change', function(){ state.settings.env = $('setEnv').value; saveState(state); renderAll(); });
  $('setRole').addEventListener('change', function(){ state.settings.role = $('setRole').value; saveState(state); renderAll(); });
  $('setLowBandwidth').addEventListener('change', function(){ state.settings.lowBandwidth = $('setLowBandwidth').checked; saveState(state); renderAll(); });
  $('resetDataBtn').addEventListener('click', function(){
    if (confirm('Reset all demo data to the original simulated seed? Your check-ins will be lost.')){
      localStorage.removeItem(STORAGE_KEY); state = loadState(); renderAll(); showPage('dashboard');
    }
  });
  /* Restore saved metric / range / filter button states. */
  document.querySelectorAll('#metricRow button').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-metric') === state.trendMetric); });
  document.querySelectorAll('#rangeRow button').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-range') === state.trendRange); });
  document.querySelectorAll('#alertFilters button').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-filter') === state.alertFilter); });
});

/* Expose the pure risk engine for testing (harmless in the browser). */
if (typeof module !== 'undefined' && module.exports){
  module.exports = { evaluateReading: evaluateReading, triageFromFlags: triageFromFlags, buildSeed: buildSeed, ENVIRONMENTS: ENVIRONMENTS };
}
