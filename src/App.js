
import React, { useState, useEffect, useRef } from "react";
import { supabase } from './supabase';

const COLORS = {
  green: "#2D6A4F",
  greenLight: "#52B788",
  greenPale: "#D8F3DC",
  amber: "#E76F51",
  amberLight: "#F4A261",
  sky: "#1E88E5",
  skyLight: "#90CAF9",
  soil: "#6B4226",
  soilLight: "#A0622A",
  cream: "#FDFAF4",
  charcoal: "#1A1A2E",
  slate: "#374151",
  muted: "#6B7280",
  border: "#E5E7EB",
  white: "#FFFFFF",
};

const FREQUENCIES = ["Weekly", "Bi-weekly", "Monthly", "One-time"];
const SERVICES = ["Lawn mowing", "Hedge trimming", "Fertilization", "Aeration", "Leaf cleanup", "Snow removal", "Irrigation check"];

// -- Seed data --------------------------------------------------------------
const today = new Date();
const fmt = (d) => d.toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const initClients = [];

// Access levels: "crew" = field app only, "full" = full manager app
const ACCESS_LEVELS = [
  { id: "crew",    label: "Crew",    desc: "Field app only - jobs, notes, photos" },
  { id: "manager", label: "Manager", desc: "Full app - schedule, clients, earnings" },
  { id: "admin",   label: "Admin",   desc: "Full app + employee management" },
];

const initEmployees = [
  { id: 1, name: "Diego Reyes",    role: "Crew Lead",  phone: "503-555-0101", color: COLORS.green,     accessLevel: "admin",   pin: "1111", initials: "DR" },
  { id: 2, name: "Aisha Thompson", role: "Technician", phone: "503-555-0102", color: COLORS.sky,       accessLevel: "crew",    pin: "2222", initials: "AT" },
  { id: 3, name: "Marcus Webb",    role: "Technician", phone: "503-555-0103", color: COLORS.amber,     accessLevel: "crew",    pin: "3333", initials: "MW" },
  { id: 4, name: "Priya Santos",   role: "Crew Lead",  phone: "503-555-0104", color: COLORS.soilLight, accessLevel: "manager", pin: "4444", initials: "PS" },
];

const freqDays = { Weekly: 7, "Bi-weekly": 14, Monthly: 30, "One-time": null };

// -- Utility ----------------------------------------------------------------
function scheduleNext(client) {
  if (client.frequency === "One-time") return null;
  const d = freqDays[client.frequency];
  return fmt(addDays(new Date(client.nextService), d));
}

function formatDuration(ms) {
  if (!ms) return "-";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function incPerHour(revenue, ms) {
  if (!ms || ms < 60000) return null;
  const hrs = ms / 3600000;
  return (revenue / hrs).toFixed(2);
}

// -- Components -------------------------------------------------------------
function Badge({ label, color = COLORS.greenPale, textColor = COLORS.green }) {
  return (
    <span style={{ background: color, color: textColor, padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.charcoal, letterSpacing: -0.3 }}>{title}</h2>
      {action}
    </div>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
      background: active ? COLORS.green : "transparent",
      color: active ? COLORS.white : COLORS.muted,
      border: active ? `1px solid ${COLORS.green}` : `1px solid ${COLORS.border}`,
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

// -- Job Detail Modal -------------------------------------------------------
function JobDetailModal({ client, employees, jobs, setJobs, onSave, onDelete, onComplete, onClose, onEditClient }) {
  const [activeTab, setActiveTab] = useState("schedule"); // "schedule" | "notes"
  const [date, setDate] = useState(client.nextService || fmt(today));
  const [time, setTime] = useState(client.scheduledTime || "");
  const [assignedIds, setAssignedIds] = useState(
    client.assignedEmployeeIds || (client.assignedEmployeeId ? [client.assignedEmployeeId] : [])
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // -- Visit notes state --
  // Current visit = job matching clientId + nextService date, or a new pending one
  const currentVisitDate = client.nextService || fmt(today);
  const currentJob = jobs.find(j => j.clientId === client.id && j.date === currentVisitDate);
  const [noteText, setNoteText]   = useState(currentJob?.managerNote   || "");
  const [photos,   setPhotos]     = useState(currentJob?.managerPhotos || []);
  const [noteSaved, setNoteSaved] = useState(false);

  const todayStr = fmt(today);
  const activeJob = jobs.find(j => j.clientId === client.id && j.clockIn && !j.clockOut);

  const statusInfo = (d) => {
    if (d < todayStr) return { bg: "#FEF3C7", text: "#D97706", label: "Overdue" };
    if (d === todayStr) return { bg: COLORS.greenPale, text: COLORS.green, label: "Today" };
    return { bg: "#EFF6FF", text: COLORS.sky, label: d };
  };
  const status = statusInfo(client.nextService);

  const toggleEmp = (id) => setAssignedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const handleSave = () => {
    onSave(client.id, {
      nextService: date,
      scheduledTime: time,
      assignedEmployeeIds: assignedIds,
      assignedEmployeeId: assignedIds[0] || null,
    });
    onClose();
  };

  const handleDelete = () => { onDelete(client.id); onClose(); };

  // Save notes/photos to the job record (create one if it doesn't exist yet)
  const saveVisitNotes = (newNote, newPhotos) => {
    setJobs(prev => {
      const existing = prev.find(j => j.clientId === client.id && j.date === currentVisitDate);
      if (existing) {
        return prev.map(j => j.clientId === client.id && j.date === currentVisitDate
          ? { ...j, managerNote: newNote, managerPhotos: newPhotos }
          : j
        );
      }
      // No job record yet for this visit - create a pending one
      return [...prev, {
        id: Date.now(),
        clientId: client.id, clientName: client.name,
        date: currentVisitDate, status: "pending",
        revenue: client.rate, managerNote: newNote, managerPhotos: newPhotos,
      }];
    });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const handlePhotoAdd = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos(prev => {
          const updated = [...prev, { url: ev.target.result, addedAt: new Date().toISOString(), addedBy: "manager" }];
          saveVisitNotes(noteText, updated);
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      saveVisitNotes(noteText, updated);
      return updated;
    });
  };

  // All past visits for this client (excluding current)
  const pastVisits = jobs
    .filter(j => j.clientId === client.id && j.date !== currentVisitDate && (j.managerNote || (j.managerPhotos || []).length > 0 || j.status === "completed"))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Crew notes from crew app for current visit
  const crewNotes = jobs.filter(j => j.clientId === client.id && j.date === currentVisitDate && (j.notes || (j.photos || []).length > 0));

  const tabStyle = (id) => ({
    flex: 1, padding: "9px 4px", border: "none", background: "transparent", cursor: "pointer",
    color: activeTab === id ? COLORS.green : COLORS.muted,
    borderBottom: activeTab === id ? `2px solid ${COLORS.green}` : "2px solid transparent",
    fontSize: 12, fontWeight: activeTab === id ? 700 : 500, fontFamily: "inherit",
  });

  const totalPhotos = photos.length + crewNotes.reduce((s, j) => s + (j.photos || []).length, 0);
  const hasNotes = noteText || totalPhotos > 0 || crewNotes.some(j => j.notes);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}
    >
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", paddingBottom: 32 }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.charcoal, marginBottom: 2 }}>{client.name}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>{client.address}</div>
              <button onClick={onEditClient} style={{ fontSize: 11, color: COLORS.sky, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, textDecoration: "underline" }}>
                Edit Edit client agreement fwd
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexShrink: 0 }}>
              <Badge label={status.label} color={status.bg} textColor={status.text} />
              {activeJob && <Badge label="Live" color="#ECFDF5" textColor="#059669" />}
              <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
            {client.services.map(s => <Badge key={s} label={s} color="#F3F4F6" textColor={COLORS.slate} />)}
            <Badge label={"$" + client.rate} color={COLORS.greenPale} textColor={COLORS.green} />
            <Badge label={client.frequency} color="#EFF6FF" textColor={COLORS.sky} />
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
          <button style={tabStyle("schedule")} onClick={() => setActiveTab("schedule")}>Cal Schedule</button>
          <button style={tabStyle("notes")} onClick={() => setActiveTab("notes")}>
            Photo Notes & photos {hasNotes ? <span style={{ background: COLORS.green, color: "#fff", borderRadius: 99, padding: "1px 6px", fontSize: 9, fontWeight: 700, marginLeft: 4 }}>{totalPhotos > 0 ? totalPhotos : "Done"}</span> : ""}
          </button>
          <button style={tabStyle("history")} onClick={() => setActiveTab("history")}>
              History {pastVisits.length > 0 ? <span style={{ background: COLORS.muted, color: "#fff", borderRadius: 99, padding: "1px 6px", fontSize: 9, marginLeft: 4 }}>{pastVisits.length}</span> : ""}
          </button>
        </div>

        {/* -- SCHEDULE TAB -- */}
        {activeTab === "schedule" && (
          <div style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, color: COLORS.charcoal, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Time <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, color: COLORS.charcoal, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Assigned crew</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {employees.map(emp => {
                  const selected = assignedIds.includes(emp.id);
                  return (
                    <div key={emp.id} onClick={() => toggleEmp(emp.id)} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      borderRadius: 12, cursor: "pointer",
                      background: selected ? emp.color + "14" : "#F9FAFB",
                      border: `1.5px solid ${selected ? emp.color : COLORS.border}`,
                      transition: "all 0.13s",
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                        {emp.initials || emp.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.charcoal }}>{emp.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.muted }}>{emp.role}</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: `2px solid ${selected ? emp.color : COLORS.border}`, background: selected ? emp.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 700 }}>{selected ? "Done" : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button onClick={handleSave} style={{ flex: 2, background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Save changes</button>
              <button onClick={() => { onComplete(client.id); onClose(); }} style={{ flex: 1, background: COLORS.greenPale, color: COLORS.green, border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Done Complete</button>
            </div>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", background: "transparent", color: "#DC2626", border: "1.5px solid #FECACA", borderRadius: 12, padding: "11px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Remove this job</button>
            ) : (
              <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626", marginBottom: 10, textAlign: "center" }}>Remove {client.name} from schedule?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleDelete} style={{ flex: 1, background: "#DC2626", color: "#fff", border: "none", borderRadius: 9, padding: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Yes, remove</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 9, padding: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -- NOTES & PHOTOS TAB -- */}
        {activeTab === "notes" && (
          <div style={{ padding: "16px 22px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.charcoal, marginBottom: 4 }}>
              Visit: {currentVisitDate}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>
              Notes and photos are saved per visit and visible in the history tab after completion.
            </div>

            {/* Manager notes */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Manager notes</label>
              <textarea
                value={noteText}
                onChange={e => { setNoteText(e.target.value); setNoteSaved(false); }}
                rows={4}
                placeholder={`Notes for ${client.name}'s ${currentVisitDate} visit...\ne.g. gate code, special instructions, issues found, work scope changes`}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, outline: "none" }}
              />
              <button onClick={() => saveVisitNotes(noteText, photos)} style={{
                marginTop: 8, width: "100%",
                background: noteSaved ? COLORS.greenPale : "#F3F4F6",
                color: noteSaved ? COLORS.green : COLORS.slate,
                border: `1px solid ${noteSaved ? COLORS.greenLight : COLORS.border}`,
                borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
              }}>{noteSaved ? "Done Saved" : "Save note"}</button>
            </div>

            {/* Photo upload */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Job photos</label>

              {photos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                  {photos.map((p, i) => (
                    <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#F3F4F6" }}>
                      <img src={p.url} alt={`Visit photo ${i+1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.35)", padding: "3px 5px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.8)" }}>{p.addedBy === "crew" ? "Crew Crew" : "List Mgr"}</span>
                        <button onClick={() => removePhoto(i)} style={{ background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 16, height: 16, cursor: "pointer", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>X</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: `2px dashed ${COLORS.greenLight}`, borderRadius: 10, padding: "14px",
                cursor: "pointer", color: COLORS.green, fontWeight: 600, fontSize: 13,
                background: COLORS.greenPale + "55",
              }}>
                <span style={{ fontSize: 18 }}>Photo</span>
                <span>Add photo</span>
                <input type="file" accept="image/*" multiple onChange={handlePhotoAdd} style={{ display: "none" }} />
              </label>
            </div>

            {/* Crew notes from field (read-only) */}
            {crewNotes.length > 0 && (
              <div style={{ background: "#F0F9FF", borderRadius: 12, border: `1px solid ${COLORS.skyLight}`, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.sky, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Crew Field notes (from crew app)</div>
                {crewNotes.map((j, i) => (
                  <div key={i}>
                    {j.notes && <div style={{ fontSize: 13, color: COLORS.slate, lineHeight: 1.6, marginBottom: 8, whiteSpace: "pre-wrap" }}>{j.notes}</div>}
                    {(j.photos || []).length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                        {j.photos.map((p, pi) => (
                          <div key={pi} style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
                            <img src={p.url} alt="Crew photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- HISTORY TAB -- */}
        {activeTab === "history" && (
          <div style={{ padding: "16px 22px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.charcoal, marginBottom: 14 }}>
              Visit history for {client.name}
            </div>

            {pastVisits.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 20px", color: COLORS.muted, fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>List</div>
                No past visit records yet. Notes and photos from completed visits will appear here.
              </div>
            )}

            {pastVisits.map((visit, i) => {
              const mNote = visit.managerNote;
              const mPhotos = visit.managerPhotos || [];
              const cNote = visit.notes; // from crew app
              const cPhotos = visit.photos || [];
              const allPhotos = [...mPhotos, ...cPhotos];
              const hasContent = mNote || cNote || allPhotos.length > 0;

              return (
                <div key={i} style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: hasContent ? 10 : 0 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal }}>{visit.date}</div>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2, display: "flex", gap: 8 }}>
                        <Badge label={visit.status === "completed" ? "Done Completed" : visit.status} color={visit.status === "completed" ? COLORS.greenPale : "#F3F4F6"} textColor={visit.status === "completed" ? COLORS.green : COLORS.muted} />
                        {allPhotos.length > 0 && <span style={{ fontSize: 10, color: COLORS.muted }}>Photo {allPhotos.length} photo{allPhotos.length !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    {visit.revenue && <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.green }}>${visit.revenue}</span>}
                  </div>

                  {mNote && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Manager note</div>
                      <div style={{ fontSize: 12, color: COLORS.slate, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{mNote}</div>
                    </div>
                  )}
                  {cNote && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.sky, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Crew Crew note</div>
                      <div style={{ fontSize: 12, color: COLORS.slate, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cNote}</div>
                    </div>
                  )}
                  {allPhotos.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                      {allPhotos.map((p, pi) => (
                        <div key={pi} style={{ aspectRatio: "1", borderRadius: 7, overflow: "hidden", position: "relative" }}>
                          <img src={p.url} alt="Visit" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,0.45)", borderRadius: 4, padding: "1px 4px", fontSize: 7, color: "#fff" }}>{pi < mPhotos.length ? "mgr" : "crew"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!hasContent && <div style={{ fontSize: 11, color: COLORS.muted, fontStyle: "italic" }}>No notes or photos for this visit.</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Shared: job card for a single client + employee context ----------------
function JobCard({ client, jobs, employees, onOpen, compact = false }) {
  const todayStr = fmt(today);
  const activeJob = jobs.find(j => j.clientId === client.id && j.clockIn && !j.clockOut);
  const assignedIds = client.assignedEmployeeIds || (client.assignedEmployeeId ? [client.assignedEmployeeId] : []);
  const assignedEmps = employees.filter(e => assignedIds.includes(e.id));

  const statusInfo = (date) => {
    if (date < todayStr) return { bg: "#FEF3C7", text: "#D97706", label: "Overdue" };
    if (date === todayStr) return { bg: COLORS.greenPale, text: COLORS.green, label: "Today" };
    return { bg: "#EFF6FF", text: COLORS.sky, label: date };
  };
  const status = statusInfo(client.nextService);
  const completedVisit = jobs.find(j => j.clientId === client.id && j.date === (client._completedOnDate || client.nextService) && j.status === "completed");
  const isDoneCard = !!completedVisit || !!client._completedOnDate;

  return (
    <div onClick={() => onOpen(client)} style={{ cursor: "pointer" }}>
      <Card style={{
        marginBottom: compact ? 7 : 10,
        padding: compact ? "11px 13px" : "14px 18px",
        transition: "box-shadow 0.15s",
        userSelect: "none",
        opacity: isDoneCard ? 0.7 : 1,
        background: isDoneCard ? "#F9FAFB" : COLORS.white,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: compact ? 12 : 14, color: isDoneCard ? COLORS.muted : COLORS.charcoal }}>{isDoneCard ? "Done " : ""}{client.name}</span>
              {!isDoneCard && <Badge label={status.label} color={status.bg} textColor={status.text} />}
              {isDoneCard && <Badge label="Completed" color={COLORS.greenPale} textColor={COLORS.green} />}
              {activeJob && !isDoneCard && <Badge label="Live" color="#ECFDF5" textColor="#059669" />}
            </div>
            {!compact && <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>{client.address}</div>}
            {!compact && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 5 }}>
                {client.services.map(s => <Badge key={s} label={s} color="#F3F4F6" textColor={COLORS.slate} />)}
              </div>
            )}
            <div style={{ fontSize: 11, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: COLORS.green }}>${client.rate}</span>
              {client.scheduledTime && <><span>.</span><span>{client.scheduledTime}</span></>}
              {assignedEmps.length > 0 ? (
                <>
                  <span>.</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    {assignedEmps.map((e, i) => (
                      <span key={e.id} title={e.name} style={{ width: 16, height: 16, borderRadius: "50%", background: e.color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, border: "1.5px solid #fff", marginLeft: i > 0 ? -4 : 0 }}>
                        {e.name.split(" ").map(n => n[0]).join("")}
                      </span>
                    ))}
                    <span style={{ marginLeft: 6, color: COLORS.slate }}>{assignedEmps.map(e => e.name.split(" ")[0]).join(", ")}</span>
                  </span>
                </>
              ) : (
                <span style={{ color: "#F59E0B", fontStyle: "italic" }}>. unassigned</span>
              )}
            </div>
          </div>
          <div style={{ color: COLORS.border, fontSize: 20, paddingTop: 2, flexShrink: 0 }}>Next</div>
        </div>
      </Card>
    </div>
  );
}

// -- Copy CSV to clipboard button -------------------------------------------
function CopyCSVButton({ rows, jobs, employees, todayStr }) {
  const [copied, setCopied] = useState(false);

  const buildCSV = () => {
    const headers = ["Date","Time","Employee","Customer","Address","Services","Amount","Status","Notes"];
    const csvRows = [headers.join("\t")]; // tab-separated pastes better into Excel
    rows.forEach(c => {
      const aids = c.assignedEmployeeIds || (c.assignedEmployeeId ? [c.assignedEmployeeId] : []);
      const empNames = employees.filter(e => aids.includes(e.id)).map(e => e.name).join("; ");
      const completedJob = jobs.find(j => j.clientId === c.id && j.date === c.nextService && j.status === "completed");
      const status = completedJob ? "Completed" : "Scheduled";
      const visitNote = jobs.find(j => j.clientId === c.id && j.date === c.nextService)?.managerNote || "";
      csvRows.push([
        c.nextService,
        c.scheduledTime || "",
        empNames,
        c.name,
        c.address,
        c.services.join("; "),
        `$${c.rate}`,
        status,
        visitNote,
      ].join("\t"));
    });
    return csvRows.join("\n");
  };

  const handleCopy = () => {
    const text = buildCSV();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } else {
      // Fallback for environments without clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <button onClick={handleCopy} style={{
      display: "flex", alignItems: "center", gap: 6,
      background: copied ? COLORS.greenPale : COLORS.white,
      color: copied ? COLORS.green : COLORS.slate,
      border: `1px solid ${copied ? COLORS.greenLight : COLORS.border}`,
      borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700,
      cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
    }}>
      {copied ? "Done Copied!" : "List Copy for Excel"}
    </button>
  );
}

// -- Master Schedule View ---------------------------------------------------
function MasterScheduleView({ clients, setClients, jobs, setJobs, employees, onOpenJob }) {
  const todayStr = fmt(today);
  const [dragIdx, setDragIdx]   = useState(null); // index in flat list being dragged
  const [dragOver, setDragOver] = useState(null);
  const [jobStates, setJobStates] = useState({}); // { clientId: "idle"|"running"|"done", clockIn }

  // -- Build flat ordered list ----------------------------------------------
  // Active clients with a scheduled date, sorted by date then time then sortOrder
  const buildRows = () => {
    const active = clients.filter(c => c.active && c.nextService);
    const sorted = [...active].sort((a, b) => {
      const dateComp = (a.nextService || "").localeCompare(b.nextService || "");
      if (dateComp !== 0) return dateComp;
      // Within same day: use sortOrder if set, else scheduledTime
      if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
      return (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99");
    });
    return sorted;
  };

  const rows = buildRows();

  // Group rows by date for separator rendering
  const dates = [...new Set(rows.map(r => r.nextService))];

  // Accumulated revenue per employee per day
  const accrued = {}; // { empId_date: total }
  rows.forEach(c => {
    const aids = c.assignedEmployeeIds || (c.assignedEmployeeId ? [c.assignedEmployeeId] : []);
    const key = `${aids[0]}_${c.nextService}`;
    accrued[key] = (accrued[key] || 0) + (c.rate || 0);
  });

  // Running accrued as we iterate - compute per-row running total
  const runningMap = {}; // key fwd running so far
  const rowAccrued = rows.map(c => {
    const aids = c.assignedEmployeeIds || (c.assignedEmployeeId ? [c.assignedEmployeeId] : []);
    const key = `${aids[0]}_${c.nextService}`;
    runningMap[key] = (runningMap[key] || 0) + (c.rate || 0);
    return runningMap[key];
  });

  // -- Drag reorder ---------------------------------------------------------
  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOver(idx);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOver(null); return; }

    const dragged = rows[dragIdx];
    const target  = rows[dropIdx];

    // Reorder: build new order within the same date group
    const sameDate = rows.filter(r => r.nextService === dragged.nextService);
    const otherDate = rows.filter(r => r.nextService !== dragged.nextService);

    const fromIdx = sameDate.findIndex(r => r.id === dragged.id);
    const toIdx   = sameDate.findIndex(r => r.id === target.id);

    if (toIdx === -1) {
      // Dropped onto a different date - move to that date
      setClients(prev => prev.map(c => c.id === dragged.id ? { ...c, nextService: target.nextService } : c));
    } else {
      // Reorder within same date and recalc times
      const reordered = [...sameDate];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      // Redistribute times starting from first item's time or 8am, spacing by default duration
      const baseTime = reordered[0]?.scheduledTime || "08:00";
      const [bh, bm] = baseTime.split(":").map(Number);
      let cursor = bh * 60 + bm;

      setClients(prev => {
        const updated = { ...Object.fromEntries(prev.map(c => [c.id, c])) };
        reordered.forEach((c, i) => {
          const dur = c.scheduledDuration || 60;
          const h = Math.floor(cursor / 60);
          const m = cursor % 60;
          updated[c.id] = { ...updated[c.id], scheduledTime: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`, sortOrder: i };
          cursor += dur + 15; // 15 min travel buffer
        });
        return prev.map(c => updated[c.id] || c);
      });
    }

    setDragIdx(null);
    setDragOver(null);
  };

  // -- Job start/stop -------------------------------------------------------
  const toggleJob = (clientId) => {
    const st = jobStates[clientId];
    if (!st || st.status === "idle") {
      setJobStates(prev => ({ ...prev, [clientId]: { status: "running", clockIn: new Date().toISOString() } }));
    } else if (st.status === "running") {
      const dur = Date.now() - new Date(st.clockIn).getTime();
      setJobStates(prev => ({ ...prev, [clientId]: { ...st, status: "done", clockOut: new Date().toISOString(), duration: dur } }));
      const client = clients.find(c => c.id === clientId);
      const completedDate = client.nextService || todayStr;
      const next = scheduleNext(client);
      const aids = client.assignedEmployeeIds || (client.assignedEmployeeId ? [client.assignedEmployeeId] : []);
      setJobs(prev => [...prev, {
        id: Date.now(), clientId, clientName: client.name,
        date: completedDate, status: "completed", revenue: client.rate,
        completedAt: new Date().toISOString(), duration: dur,
        employeeId: aids[0] || null,
        employeeName: employees.find(e => e.id === aids[0])?.name || null,
      }]);
      supabase.from('jobs').insert({
  client_id: clientId,
  client_name: client.name,
  date: completedDate,
  status: 'completed',
  revenue: client.rate,
  clock_in: st.clockIn,
  clock_out: new Date().toISOString(),
  duration: dur,
  employee_id: aids[0] || null,
  employee_name: employees.find(e => e.id === aids[0])?.name || null,
});
      setClients(prev => prev.map(c => c.id === clientId ? {
        ...c, nextService: next,
        completedVisitDates: [...(c.completedVisitDates || []), completedDate],
      } : c));
    } else if (st.status === "done") {
      setJobStates(prev => ({ ...prev, [clientId]: { status: "idle" } }));
    }
  };

  // -- Live tick for running jobs -------------------------------------------
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtElapsed = (clockIn) => {
    const ms = Date.now() - new Date(clockIn).getTime();
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m%60}m` : `${m}m`;
  };

  // -- Excel export ---------------------------------------------------------
  const exportExcel = () => {
    const headers = ["Date","Time","Employee","Customer","Address","Services","Amount","Status","Notes"];
    const csvRows = [headers.join(",")];
    rows.forEach(c => {
      const aids = c.assignedEmployeeIds || (c.assignedEmployeeId ? [c.assignedEmployeeId] : []);
      const empNames = employees.filter(e => aids.includes(e.id)).map(e => e.name).join("; ");
      const st = jobStates[c.id];
      const status = st?.status === "done" ? "Completed" : st?.status === "running" ? "In progress" : "Scheduled";
      const visitNote = jobs.find(j => j.clientId === c.id && j.date === c.nextService)?.managerNote || "";
      const row = [
        c.nextService, c.scheduledTime || "", empNames,
        `"${c.name}"`, `"${c.address}"`,
        `"${c.services.join("; ")}"`, c.rate, status, `"${visitNote}"`
      ];
      csvRows.push(row.join(","));
    });
    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `GreenRoute_Schedule_${todayStr}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // -- Cell styles -----------------------------------------------------------
  const TH = ({ children, w, center }) => (
    <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, textAlign: center ? "center" : "left", whiteSpace: "nowrap", width: w, background: COLORS.cream, borderBottom: `2px solid ${COLORS.border}`, position: "sticky", top: 0, zIndex: 5 }}>
      {children}
    </th>
  );

  const TD = ({ children, center, muted, bold, color, style: s = {} }) => (
    <td style={{ padding: "8px 10px", fontSize: 12, color: color || (muted ? COLORS.muted : COLORS.charcoal), fontWeight: bold ? 700 : 400, textAlign: center ? "center" : "left", verticalAlign: "middle", ...s }}>
      {children}
    </td>
  );

  const statusMeta = (clientId) => {
    const st = jobStates[clientId];
    if (!st || st.status === "idle") return { label: "Scheduled", bg: "#EFF6FF", text: COLORS.sky };
    if (st.status === "running")     return { label: "Running",   bg: "#ECFDF5", text: "#059669" };
    return                                   { label: "Done",     bg: COLORS.greenPale, text: COLORS.green };
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.charcoal }}>Master Schedule</div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>{rows.length} jobs . drag rows to reorder . times auto-adjust</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportExcel} style={{ display: "flex", alignItems: "center", gap: 6, background: "#16A34A", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            dn Excel
          </button>
          <CopyCSVButton rows={rows} jobs={jobs} employees={employees} todayStr={todayStr} />
        </div>
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.muted, fontSize: 14, background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}` }}>
          No scheduled jobs yet. Add clients and set service dates to see them here.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  <TH w={24}></TH>
                  <TH w={28} center>Edit</TH>
                  <TH w={80} center>Status</TH>
                  <TH w={90} center>Start / Stop</TH>
                  <TH w={90}>Employee</TH>
                  <TH>Customer</TH>
                  <TH>Address</TH>
                  <TH w={70} center>Amount</TH>
                  <TH w={70} center>Accrued</TH>
                  <TH>Notes</TH>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group by employee, then by date within each employee
                  const empGroups = [];
                  // Unassigned group first
                  const unassignedRows = rows.filter(r => (r.assignedEmployeeIds?.length === 0 || !r.assignedEmployeeId) && !r.assignedEmployeeIds?.length);
                  if (unassignedRows.length > 0) empGroups.push({ emp: null, rows: unassignedRows });
                  // Each employee
                  employees.forEach(emp => {
                    const empRows = rows.filter(r => {
                      const aids = r.assignedEmployeeIds || (r.assignedEmployeeId ? [r.assignedEmployeeId] : []);
                      return aids.includes(emp.id);
                    });
                    if (empRows.length > 0) empGroups.push({ emp, rows: empRows });
                  });

                  return empGroups.map(({ emp, rows: empRows }) => {
                    const empDates = [...new Set(empRows.map(r => r.nextService))].sort();
                    const empTotal = empRows.reduce((s, c) => s + (c.rate || 0), 0);

                    return (
                      <React.Fragment key={emp?.id || "unassigned"}>
                        {/* Employee header row */}
                        <tr>
                          <td colSpan={10} style={{ padding: "12px 16px 8px", background: emp ? emp.color : COLORS.amber, borderTop: "3px solid rgba(0,0,0,0.1)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {emp ? (
                                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>
                                    {emp.initials || emp.name.split(" ").map(n => n[0]).join("")}
                                  </div>
                                ) : (
                                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>!</div>
                                )}
                                <div>
                                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{emp ? emp.name : "Unassigned"}</div>
                                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{emp?.role || ""} . {empRows.length} job{empRows.length !== 1 ? "s" : ""}</div>
                                </div>
                              </div>
                              <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize: 15 }}>${empTotal.toLocaleString()}</div>
                            </div>
                          </td>
                        </tr>

                        {/* Days within this employee */}
                        {empDates.map(date => {
                          const dateRows = empRows.filter(r => r.nextService === date);
                          const isToday = date === todayStr;
                          const dateTotalForEmp = dateRows.reduce((s, c) => s + (c.rate || 0), 0);
                          // Running accrued within this emp+date
                          let empDayAccrued = 0;

                          return (
                            <React.Fragment key={date}>
                              {/* Date sub-header */}
                              <tr>
                                <td colSpan={10} style={{ padding: "7px 16px 5px", background: isToday ? COLORS.greenPale : "#F8FAF8", borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}` }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: isToday ? COLORS.green : COLORS.slate }}>
                                      {isToday && "Cal "}{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                      {isToday && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.green, fontWeight: 600 }}>Today</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: COLORS.muted }}>{dateRows.length} jobs . ${dateTotalForEmp}</div>
                                  </div>
                                </td>
                              </tr>

                              {/* Job rows */}
                              {dateRows.map((client, relIdx) => {
                                const absIdx = rows.findIndex(r => r.id === client.id);
                                const aids = client.assignedEmployeeIds || (client.assignedEmployeeId ? [client.assignedEmployeeId] : []);
                                const empList = employees.filter(e => aids.includes(e.id));
                                const st = jobStates[client.id] || { status: "idle" };
                                const isDoneJob = st.status === "done" || jobs.some(j => j.clientId === client.id && j.date === client.nextService && j.status === "completed");
                                const sm = isDoneJob ? { label: "Done", bg: COLORS.greenPale, text: COLORS.green } : statusMeta(client.id);
                                const visitNote = jobs.find(j => j.clientId === client.id && j.date === client.nextService)?.managerNote || "";
                                const isDraggingThis = dragIdx === absIdx;
                                const isDropTarget  = dragOver === absIdx && dragIdx !== absIdx;
                                const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(client.address)}`;
                                empDayAccrued += (client.rate || 0);

                                return (
                                  <tr key={client.id}
                                    draggable
                                    onDragStart={e => handleDragStart(e, absIdx)}
                                    onDragOver={e => handleDragOver(e, absIdx)}
                                    onDragLeave={() => setDragOver(null)}
                                    onDrop={e => handleDrop(e, absIdx)}
                                    style={{
                                      background: isDraggingThis ? COLORS.greenPale : isDropTarget ? "#EFF6FF" : isDoneJob ? "#F9FAFB" : relIdx % 2 === 0 ? COLORS.white : "#FAFAFA",
                                      borderBottom: `1px solid ${COLORS.border}`,
                                      opacity: isDraggingThis ? 0.5 : isDoneJob ? 0.75 : 1,
                                      transition: "background 0.1s",
                                    }}
                                  >
                                    <TD center muted><span style={{ fontSize: 14, cursor: "grab", opacity: 0.4 }}> </span></TD>
                                    <TD center>
                                      <button onClick={() => onOpenJob(client)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 4px", borderRadius: 6, color: COLORS.sky }} title="Edit job">Edit</button>
                                    </TD>
                                    <TD center>
                                      <span style={{ background: sm.bg, color: sm.text, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                                        {isDoneJob ? "Done Done" : sm.label === "Running" ? `On ${fmtElapsed(st.clockIn)}` : sm.label}
                                      </span>
                                    </TD>
                                    <TD center>
                                      <button onClick={() => toggleJob(client.id)} style={{
                                        background: st.status === "running" ? COLORS.amber : isDoneJob ? "#F3F4F6" : COLORS.green,
                                        color: isDoneJob ? COLORS.muted : "#fff",
                                        border: "none", borderRadius: 8, padding: "5px 10px",
                                        fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                                      }}>
                                        {st.status === "running" ? "Stop Stop" : isDoneJob ? "Reset Reset" : "Start Start"}
                                      </button>
                                    </TD>
                                    <TD>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                        {empList.map(e => (
                                          <span key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11 }}>
                                            <span style={{ width: 16, height: 16, borderRadius: "50%", background: e.color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700 }}>{e.initials || e.name[0]}</span>
                                            <span style={{ color: COLORS.slate }}>{e.name.split(" ")[0]}</span>
                                          </span>
                                        ))}
                                        {empList.length === 0 && <span style={{ color: COLORS.amber, fontSize: 11, fontStyle: "italic" }}>Unassigned</span>}
                                      </div>
                                    </TD>
                                    <TD>
                                      <div>
                                        <button onClick={() => onOpenJob(client)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                                          <span style={{ fontWeight: 600, fontSize: 12, color: isDoneJob ? COLORS.muted : COLORS.green, textDecoration: "underline dotted" }}>{isDoneJob ? "Done " : ""}{client.name}</span>
                                        </button>
                                        <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 1 }}>
                                          {client.scheduledTime ? formatTime12(client.scheduledTime) : "No time set"} . {client.frequency}
                                        </div>
                                      </div>
                                    </TD>
                                    <TD>
                                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.sky, fontSize: 11, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                        <span>Map</span>
                                        <span style={{ textDecoration: "underline dotted" }}>{client.address}</span>
                                      </a>
                                    </TD>
                                    <TD center bold color={isDoneJob ? COLORS.muted : COLORS.green}>${client.rate}</TD>
                                    <TD center>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.charcoal }}>${empDayAccrued}</span>
                                    </TD>
                                    <TD>
                                      {visitNote
                                        ? <span style={{ fontSize: 11, color: COLORS.slate, fontStyle: "italic", maxWidth: 140, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }} title={visitNote}>{visitNote}</span>
                                        : <span style={{ color: COLORS.border, fontSize: 11 }}>-</span>
                                      }
                                    </TD>
                                  </tr>
                                );
                              })}

                              {/* Date subtotal */}
                              <tr style={{ background: "#F3F8F5", borderBottom: `1px solid ${COLORS.greenLight}40` }}>
                                <td colSpan={7} style={{ padding: "5px 16px", fontSize: 10, color: COLORS.muted, fontStyle: "italic" }}>
                                  {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} total
                                </td>
                                <td style={{ padding: "5px 10px", textAlign: "center", fontWeight: 700, fontSize: 12, color: COLORS.green }}>${dateTotalForEmp}</td>
                                <td colSpan={2} />
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// -- TAB: Schedule ----------------------------------------------------------

// Timeline constants
const HOUR_START = 6;   // 6 AM
const HOUR_END   = 20;  // 8 PM
const TOTAL_HRS  = HOUR_END - HOUR_START;
const ROW_H      = 72;  // px per employee row
const LABEL_W    = 68;  // px for name column
const JOB_DUR    = 60;  // default job duration in minutes

function timeToX(time, totalWidth) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  const mins = (h - HOUR_START) * 60 + m;
  return (mins / (TOTAL_HRS * 60)) * totalWidth;
}

function xToTime(x, totalWidth) {
  const mins = Math.round((x / totalWidth) * TOTAL_HRS * 60);
  const clamped = Math.max(0, Math.min(TOTAL_HRS * 60 - JOB_DUR, mins));
  const h = HOUR_START + Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function formatTime12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")}${ampm}`;
}

// -- Timeline Day View ------------------------------------------------------
function TimelineDayView({ clients, setClients, jobs, employees, visibleEmps, focusedDayStr, onOpenJob, getCompletedJob }) {
  const containerRef = useRef(null);

  // drag state - type: "move" | "resize-left" | "resize-right" | "shelf"
  const [drag, setDrag] = useState(null);
  const [dropRowId, setDropRowId] = useState(null); // empId row being hovered over

  const dayClients = clients.filter(c => c.active && c.nextService === focusedDayStr);
  const getAids = (c) => c.assignedEmployeeIds || (c.assignedEmployeeId ? [c.assignedEmployeeId] : []);

  // Jobs with no time set (scheduled for day but unscheduled on timeline)
  const unscheduled = dayClients.filter(c => getAids(c).length > 0 && !c.scheduledTime);
  // Jobs with no crew assigned for this day
  const unassigned = dayClients.filter(c => getAids(c).length === 0);

  const getTimelineW = () => containerRef.current ? containerRef.current.getBoundingClientRect().width - LABEL_W : 480;

  // Convert time string fwd duration in minutes (stored on client as scheduledDuration)
  const getDur = (c) => c.scheduledDuration || JOB_DUR;

  const minsToX = (mins, tw) => (mins / (TOTAL_HRS * 60)) * tw;
  const xToMins = (x, tw) => Math.round((x / tw) * TOTAL_HRS * 60);

  const timeToMins = (t) => {
    if (!t) return (8 - HOUR_START) * 60; // default 8am
    const [h, m] = t.split(":").map(Number);
    return (h - HOUR_START) * 60 + m;
  };

  const minsToTimeStr = (mins) => {
    const clamped = Math.max(0, Math.min(TOTAL_HRS * 60 - 15, mins));
    const h = HOUR_START + Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };

  // -- Pointer handlers --
  const startDrag = (e, client, type) => {
    e.preventDefault();
    e.stopPropagation();
    const tw = getTimelineW();
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const origMins = timeToMins(client.scheduledTime);
    const origDur = getDur(client);

    const state = { clientId: client.id, type, startX, origMins, origDur, tw,
      currentMins: origMins, currentDur: origDur,
      dropEmpId: getAids(client)[0] || null,
      fromShelf: false,
    };
    setDrag(state);

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const deltaMins = xToMins(dx, tw);
      const rect2 = containerRef.current?.getBoundingClientRect();
      // figure out row
      if (rect2) {
        const relY = ev.clientY - rect2.top;
        const headerH = 28; // hour header height approx
        const rowIdx = Math.max(0, Math.floor((relY - headerH) / ROW_H));
        const hovEmp = visibleEmps[rowIdx];
        setDropRowId(hovEmp?.id || null);
        setDrag(prev => prev ? { ...prev, dropEmpId: hovEmp?.id || prev.dropEmpId } : null);
      }
      setDrag(prev => {
        if (!prev) return null;
        if (type === "move" || type === "shelf") {
          const newMins = Math.max(0, Math.min(TOTAL_HRS * 60 - prev.currentDur, prev.origMins + deltaMins));
          return { ...prev, currentMins: newMins };
        } else if (type === "resize-left") {
          const newMins = Math.max(0, Math.min(prev.origMins + prev.origDur - 15, prev.origMins + deltaMins));
          const newDur = Math.max(15, prev.origDur - (newMins - prev.origMins));
          return { ...prev, currentMins: newMins, currentDur: newDur };
        } else if (type === "resize-right") {
          const newDur = Math.max(15, Math.min(TOTAL_HRS * 60 - prev.origMins, prev.origDur + deltaMins));
          return { ...prev, currentDur: newDur };
        }
        return prev;
      });
    };

    const onUp = () => {
      setDrag(prev => {
        if (prev) {
          const newTime = minsToTimeStr(prev.currentMins);
          setClients(cl => cl.map(c => {
            if (c.id !== prev.clientId) return c;
            const existingIds = getAids(c);
            let newIds = existingIds;
            if (prev.dropEmpId && !existingIds.includes(prev.dropEmpId)) {
              newIds = [prev.dropEmpId, ...existingIds.slice(1)];
            } else if (prev.dropEmpId) {
              newIds = [prev.dropEmpId, ...existingIds.filter(id => id !== prev.dropEmpId)];
            }
            // If dragging from shelf, keep existing crew if no new row chosen
            if ((type === "shelf" || type === "move") && prev.dropEmpId === null) {
              newIds = existingIds.length > 0 ? existingIds : newIds;
            }
            return {
              ...c, scheduledTime: newTime,
              scheduledDuration: prev.currentDur,
              assignedEmployeeIds: newIds,
              assignedEmployeeId: newIds[0] || null,
            };
          }));
        }
        return null;
      });
      setDropRowId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Shelf drag-from (unscheduled / unassigned chips)
  const startShelfDrag = (e, client) => startDrag(e, { ...client, scheduledTime: client.scheduledTime || "08:00" }, "shelf");

  const hours = Array.from({ length: TOTAL_HRS + 1 }, (_, i) => HOUR_START + i);

  // -- Render a job block inside a row --
  const JobBlock = ({ client, emp }) => {
    const isDragging = drag?.clientId === client.id;
    const aids = getAids(client);
    const extraEmps = employees.filter(e => aids.includes(e.id) && e.id !== emp.id);
    const tw = getTimelineW();

    const mins = isDragging ? drag.currentMins : timeToMins(client.scheduledTime);
    const dur  = isDragging ? drag.currentDur  : getDur(client);
    const leftPct  = (mins / (TOTAL_HRS * 60)) * 100;
    const widthPct = (dur  / (TOTAL_HRS * 60)) * 100;
    const blockColor = emp.color;
    const completedJob = getCompletedJob ? getCompletedJob(client.id, focusedDayStr) : null;
    const isDone = !!completedJob || !!client._completedOnDate;

    return (
      <div
        style={{
          position: "absolute",
          left: `calc(${leftPct}% + 1px)`,
          width: `calc(${widthPct}% - 2px)`,
          top: 5, height: ROW_H - 10,
          background: isDragging ? blockColor + "ee" : isDone ? "#F3F4F6" : blockColor + "25",
          border: `1.5px solid ${isDone ? "#D1D5DB" : blockColor}`,
          opacity: isDone ? 0.75 : 1,
          borderRadius: 7,
          zIndex: isDragging ? 30 : 3,
          boxShadow: isDragging ? `0 6px 20px ${blockColor}44` : "none",
          overflow: "hidden",
          transition: isDragging ? "none" : "box-shadow 0.15s",
          cursor: isDragging ? "grabbing" : "default",
        }}
      >
        {/* Left resize handle */}
        <div
          onPointerDown={e => startDrag(e, client, "resize-left")}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "transparent", zIndex: 10, borderRadius: "7px 0 0 7px" }}
        />

        {/* Main body - click to open, drag to move */}
        <div
          onPointerDown={e => {
            e.preventDefault();
            e.stopPropagation();
            const downX = e.clientX;
            const downY = e.clientY;
            let didDrag = false;
            const onMoveCheck = (mv) => {
              if (Math.abs(mv.clientX - downX) > 5 || Math.abs(mv.clientY - downY) > 5) {
                didDrag = true;
                window.removeEventListener("pointermove", onMoveCheck);
                startDrag(e, client, "move");
              }
            };
            const onUpCheck = () => {
              window.removeEventListener("pointermove", onMoveCheck);
              window.removeEventListener("pointerup", onUpCheck);
              if (!didDrag) onOpenJob(client);
            };
            window.addEventListener("pointermove", onMoveCheck);
            window.addEventListener("pointerup", onUpCheck);
          }}
          style={{ position: "absolute", left: 8, right: 8, top: 0, bottom: 0, cursor: "pointer", padding: "4px 3px" }}
        >
          <div style={{ fontSize: 9, fontWeight: 700, color: isDragging ? "#fff" : isDone ? COLORS.muted : COLORS.charcoal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {isDone ? "Done " : ""}{client.name}
          </div>
          <div style={{ fontSize: 8, color: isDragging ? "rgba(255,255,255,0.85)" : COLORS.muted, lineHeight: 1.3 }}>
            {formatTime12(minsToTimeStr(mins))}
            {dur !== JOB_DUR ? ` . ${dur}m` : ""}
          </div>
          {extraEmps.length > 0 && (
            <div style={{ display: "flex", gap: 1, marginTop: 2 }}>
              {extraEmps.map(e => (
                <span key={e.id} style={{ width: 9, height: 9, borderRadius: "50%", background: e.color, display: "inline-block", border: "1px solid rgba(255,255,255,0.7)" }} />
              ))}
            </div>
          )}
        </div>

        {/* Right resize handle */}
        <div
          onPointerDown={e => startDrag(e, client, "resize-right")}
          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "transparent", zIndex: 10, borderRadius: "0 7px 7px 0" }}
        />
      </div>
    );
  };

  return (
    <div style={{ userSelect: "none" }}>

      {/* -- Holding shelf -- */}
      {(unscheduled.length > 0 || unassigned.length > 0) && (
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
          {unscheduled.length > 0 && (
            <div style={{ marginBottom: unassigned.length > 0 ? 10 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
                Cal Scheduled - no time set ({unscheduled.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {unscheduled.map(c => {
                  const aids = getAids(c);
                  const emps = employees.filter(e => aids.includes(e.id));
                  return (
                    <div
                      key={c.id}
                      onPointerDown={e => startShelfDrag(e, c)}
                      onClick={() => onOpenJob(c)}
                      style={{
                        background: emps[0] ? emps[0].color + "18" : "#F3F4F6",
                        border: `1.5px solid ${emps[0]?.color || COLORS.border}`,
                        borderRadius: 8, padding: "5px 10px", cursor: "grab",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {emps.map(e => (
                        <span key={e.id} style={{ width: 14, height: 14, borderRadius: "50%", background: e.color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 7, fontWeight: 700, flexShrink: 0 }}>
                          {e.initials || e.name[0]}
                        </span>
                      ))}
                      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.charcoal }}>{c.name}</span>
                      <span style={{ fontSize: 9, color: COLORS.muted }}>${c.rate}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unassigned.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.amber, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
                ! Unassigned - drag to a crew row ({unassigned.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {unassigned.map(c => (
                  <div
                    key={c.id}
                    onPointerDown={e => startShelfDrag(e, c)}
                    onClick={() => onOpenJob(c)}
                    style={{
                      background: "#FFF7ED", border: `1.5px solid ${COLORS.amberLight}`,
                      borderRadius: 8, padding: "5px 10px", cursor: "grab",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 11 }}>!</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.amber }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 8 }}>
            drag Drag any chip down onto a crew row to schedule it on the timeline
          </div>
        </div>
      )}

      {/* -- Timeline grid -- */}
      <div
        ref={containerRef}
        style={{ overflowX: "auto", background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}` }}
      >
        {/* Hour header */}
        <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.white, zIndex: 10 }}>
          <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`, padding: "4px 0" }} />
          <div style={{ flex: 1, minWidth: 480 }}>
            <div style={{ display: "flex" }}>
              {hours.map(h => {
                const h12 = h % 12 || 12;
                const ampm = h >= 12 ? "p" : "a";
                return (
                  <div key={h} style={{ flex: 1, fontSize: 9, color: COLORS.muted, padding: "4px 0 4px 3px", borderLeft: h > HOUR_START ? `1px solid ${COLORS.border}` : "none" }}>
                    {`${h12}${ampm}`}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Employee rows */}
        {visibleEmps.map((emp, rowIdx) => {
          const empClients = dayClients.filter(c => getAids(c).includes(emp.id) && c.scheduledTime);
          // also show dragging-from-shelf if hovering this row
          const isDragTarget = dropRowId === emp.id && drag && !getAids(clients.find(c => c.id === drag.clientId) || {}).includes(emp.id);

          return (
            <div key={emp.id} style={{
              display: "flex", borderBottom: `1px solid ${COLORS.border}`,
              background: isDragTarget ? emp.color + "12" : rowIdx % 2 === 0 ? COLORS.white : "#FAFAFA",
              height: ROW_H, transition: "background 0.12s", position: "relative",
            }}>
              {/* Label */}
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "4px 6px" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 10 }}>
                  {emp.initials || emp.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div style={{ fontSize: 9, color: COLORS.muted, textAlign: "center", lineHeight: 1.2 }}>{emp.name.split(" ")[0]}</div>
              </div>

              {/* Lane */}
              <div style={{ flex: 1, position: "relative", minWidth: 480, height: ROW_H }}>
                {/* Grid lines */}
                {hours.slice(1).map(h => (
                  <div key={h} style={{ position: "absolute", top: 0, bottom: 0, left: `${((h - HOUR_START) / TOTAL_HRS) * 100}%`, borderLeft: `1px solid ${COLORS.border}`, opacity: 0.4, pointerEvents: "none" }} />
                ))}
                {/* Half-hour marks */}
                {hours.slice(0, TOTAL_HRS).map(h => (
                  <div key={`h${h}`} style={{ position: "absolute", top: "50%", bottom: 0, left: `${((h - HOUR_START + 0.5) / TOTAL_HRS) * 100}%`, borderLeft: `1px dashed ${COLORS.border}`, opacity: 0.3, pointerEvents: "none" }} />
                ))}

                {/* Now line */}
                {focusedDayStr === fmt(today) && (() => {
                  const now = new Date();
                  const pct = ((now.getHours() - HOUR_START) * 60 + now.getMinutes()) / (TOTAL_HRS * 60);
                  if (pct < 0 || pct > 1) return null;
                  return (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct * 100}%`, borderLeft: "2px solid #EF4444", zIndex: 6, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", top: 2, left: 2, background: "#EF4444", color: "#fff", borderRadius: 4, fontSize: 7, padding: "1px 3px", whiteSpace: "nowrap" }}>now</div>
                    </div>
                  );
                })()}

                {/* Job blocks */}
                {empClients.map(client => (
                  <JobBlock key={client.id} client={client} emp={emp} />
                ))}

                {/* Ghost block when dragging shelf item over this row */}
                {drag && dropRowId === emp.id && (() => {
                  const c = clients.find(x => x.id === drag.clientId);
                  if (!c) return null;
                  const leftPct = (drag.currentMins / (TOTAL_HRS * 60)) * 100;
                  const widthPct = (drag.currentDur / (TOTAL_HRS * 60)) * 100;
                  return (
                    <div style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, top: 5, height: ROW_H - 10, background: emp.color + "30", border: `2px dashed ${emp.color}`, borderRadius: 7, zIndex: 2, pointerEvents: "none" }} />
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {[
          { icon: "move", text: "Drag block to move" },
          { icon: "=", text: "Drag edges to resize" },
          { icon: "drag", text: "Drag to another row to reassign" },
          { icon: " ", text: "Click to edit" },
        ].map(({ icon, text }) => (
          <span key={text} style={{ fontSize: 10, color: COLORS.muted }}>{icon} {text}</span>
        ))}
      </div>
    </div>
  );
}

function ScheduleTab({ clients, setClients, jobs, setJobs, employees, onNavigateClients }) {
  const [viewMode, setViewMode] = useState("day");
  const [crewMode, setCrewMode] = useState("all");
  const [focusedEmpIdx, setFocusedEmpIdx] = useState(0);
  const [visibleEmpIds, setVisibleEmpIds] = useState(employees.map(e => e.id));
  const [showCrewPicker, setShowCrewPicker] = useState(false);
  const [openJob, setOpenJob] = useState(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);

  const todayStr = fmt(today);
  const visibleEmps = employees.filter(e => visibleEmpIds.includes(e.id));
  const focusedDay = addDays(today, dayOffset);
  const focusedDayStr = fmt(focusedDay);

  const getWeekStart = (offset) => {
    const d = new Date(today);
    const dow = d.getDay();
    return addDays(d, (dow === 0 ? -6 : 1 - dow) + offset * 7);
  };
  const weekStart = getWeekStart(weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const clientsOnDay = (dateStr) => {
    const scheduled = clients.filter(c => c.active && c.nextService === dateStr);
    const completedToday = clients.filter(c => c.active && c.nextService !== dateStr && (c.completedVisitDates || []).includes(dateStr));
    const all = [...scheduled, ...completedToday.map(c => ({ ...c, _completedOnDate: dateStr }))];
    return all.sort((a, b) => (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99"));
  };

  const assignedEmpIds = (c) => c.assignedEmployeeIds || (c.assignedEmployeeId ? [c.assignedEmployeeId] : []);
  const isAssignedTo = (c, empId) => assignedEmpIds(c).includes(empId);

  const handleComplete = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    const completedDate = client.nextService || todayStr;
    const next = scheduleNext(client);
    const aids = assignedEmpIds(client);
    // Keep client on schedule with completedDate stored; nextService moves to next visit
    // We store completedVisitDates so the schedule can show the green check
    setClients(prev => prev.map(c => c.id === clientId ? {
      ...c,
      nextService: next,
      completedVisitDates: [...(c.completedVisitDates || []), completedDate],
    } : c));
    setJobs(prev => [...prev, {
      id: Date.now(), clientId, clientName: client.name,
      date: completedDate, status: "completed", revenue: client.rate,
      completedAt: new Date().toISOString(),
      employeeId: aids[0] || null,
      employeeName: employees.find(e => e.id === aids[0])?.name || null,
      duration: null,
    }]);
    // Save job to Supabase
supabase.from('jobs').insert({
  client_id: clientId,
  client_name: client.name,
  date: completedDate,  
  status: "completed",
  revenue: client.rate,
  employee_id: aids[0] || null,
  employee_name: employees.find(e => e.id === aids[0])?.name || null,
}).then(({ error }) => console.log('job save:', error));

// Update client in Supabase
supabase.from('clients').update({
  next_service: next,
  completed_visit_dates: [...(client.completedVisitDates || []), completedDate],
}).eq('id', clientId).then(({ error }) => console.log('client update:', error));
  };

  const handleSaveJob = (clientId, changes) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...changes } : c));
    setOpenJob(prev => prev ? { ...prev, ...changes } : null);
    if (changes.id) supabase.from('jobs').update(changes).eq('id', changes.id).then(({ error }) => console.log('job update:', error));  
  };

  const handleDeleteJob = (clientId) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, active: false, nextService: null } : c));
  };

  // Returns completed job record if this client's visit on dateStr is done
  const getCompletedJob = (clientId, dateStr) =>
    jobs.find(j => j.clientId === clientId && j.date === dateStr && j.status === "completed");

  const NavBar = ({ label, onPrev, onNext, onToday }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
      <button onClick={onPrev} style={{ width: 32, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.slate }}>Prev</button>
      <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 13, color: COLORS.charcoal }}>{label}</div>
      <button onClick={onToday} style={{ padding: "4px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.white, cursor: "pointer", fontSize: 11, fontWeight: 600, color: COLORS.muted }}>Today</button>
      <button onClick={onNext} style={{ width: 32, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.slate }}>Next</button>
    </div>
  );

  // -- Week view: vertical timeline columns --
  const WEEK_HOUR_START = 6;
  const WEEK_HOUR_END = 20;
  const WEEK_SLOT_H = 44; // px per hour slot

  const WeekDayCol = ({ date }) => {
    const ds = fmt(date);
    const isToday = ds === todayStr;
    const allDay = clients.filter(c => c.active && c.nextService === ds);
    const scheduled = allDay.filter(c => c.scheduledTime)
      .sort((a,b) => a.scheduledTime.localeCompare(b.scheduledTime));
    const unscheduledDay = allDay.filter(c => !c.scheduledTime && (c.assignedEmployeeIds||[]).length > 0);
    const unassignedDay  = allDay.filter(c => (c.assignedEmployeeIds||[]).length === 0);
    const [dragOverSlot, setDragOverSlot] = useState(null); // hour number being hovered

    // Place a job at a given hour when dropped
    const dropOnSlot = (e, hour) => {
      e.preventDefault();
      const clientId = parseInt(e.dataTransfer.getData("clientId"));
      const time = `${String(hour).padStart(2,"0")}:00`;
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, nextService: ds, scheduledTime: time } : c));
      setDragOverSlot(null);
    };

    // Move to this day (no specific time)
    const dropOnHeader = (e) => {
      e.preventDefault();
      const clientId = parseInt(e.dataTransfer.getData("clientId"));
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, nextService: ds } : c));
    };

    const hours = Array.from({ length: WEEK_HOUR_END - WEEK_HOUR_START }, (_, i) => WEEK_HOUR_START + i);

    // Get jobs that fall within an hour slot
    const jobsAtHour = (h) => scheduled.filter(c => {
      const [ch] = c.scheduledTime.split(":").map(Number);
      return ch === h;
    });

    const ShelfChip = ({ client, amber }) => {
      const aids = client.assignedEmployeeIds || [];
      const emps = employees.filter(e => aids.includes(e.id));
      return (
        <div
          draggable
          onDragStart={e => e.dataTransfer.setData("clientId", client.id)}
          onClick={() => setOpenJob(client)}
          title="Drag onto a time slot below"
          style={{
            background: amber ? "#FFF7ED" : (emps[0]?.color + "15" || "#F3F4F6"),
            border: `1px solid ${amber ? COLORS.amberLight : (emps[0]?.color || COLORS.border)}`,
            borderRadius: 6, padding: "3px 6px", cursor: "grab", marginBottom: 3,
            display: "flex", alignItems: "center", gap: 4,
          }}>
          {emps.slice(0,2).map(e => (
            <span key={e.id} style={{ width: 11, height: 11, borderRadius: "50%", background: e.color, display:"inline-flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:6, fontWeight:700, flexShrink:0 }}>{e.initials?.[0]||e.name[0]}</span>
          ))}
          <span style={{ fontSize: 9, fontWeight: 600, color: amber ? COLORS.amber : COLORS.charcoal, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{client.name}</span>
        </div>
      );
    };

    return (
      <div style={{ flex: 1, minWidth: 100, display: "flex", flexDirection: "column", borderRight: `1px solid ${COLORS.border}` }}>
        {/* Column header */}
        <div
          style={{ textAlign: "center", padding: "6px 4px 4px", background: isToday ? COLORS.green : COLORS.cream, borderBottom: `1px solid ${COLORS.border}`, position: "sticky", top: 0, zIndex: 5 }}
          onDragOver={e => e.preventDefault()}
          onDrop={dropOnHeader}
        >
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: isToday ? "rgba(255,255,255,0.8)" : COLORS.muted }}>{date.toLocaleDateString("en-US", { weekday: "short" })}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? "#fff" : COLORS.charcoal, lineHeight: 1.2 }}>{date.getDate()}</div>
        </div>

        {/* Unscheduled / unassigned shelf */}
        {(unscheduledDay.length > 0 || unassignedDay.length > 0) && (
          <div style={{ padding: "4px 4px 6px", borderBottom: `2px dashed ${COLORS.amberLight}`, background: "#FFFDF7" }}>
            {unassignedDay.map(c => <ShelfChip key={c.id} client={c} amber />)}
            {unscheduledDay.map(c => <ShelfChip key={c.id} client={c} amber={false} />)}
          </div>
        )}

        {/* Hourly time slots */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {hours.map(h => {
            const slotJobs = jobsAtHour(h);
            const isOver = dragOverSlot === h;
            const h12 = h % 12 || 12;
            const ampm = h >= 12 ? "p" : "a";
            return (
              <div key={h}
                style={{ minHeight: WEEK_SLOT_H, borderBottom: `1px solid ${COLORS.border}`, background: isOver ? COLORS.greenPale : "transparent", transition: "background 0.1s", position: "relative" }}
                onDragOver={e => { e.preventDefault(); setDragOverSlot(h); }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={e => dropOnSlot(e, h)}
              >
                {/* Hour label */}
                <div style={{ fontSize: 8, color: COLORS.muted, padding: "2px 4px", lineHeight: 1 }}>{`${h12}${ampm}`}</div>
                {/* Jobs in this slot */}
                <div style={{ padding: "0 3px 3px" }}>
                  {slotJobs.map(c => {
                    const aids = c.assignedEmployeeIds || [];
                    const emps = employees.filter(e => aids.includes(e.id));
                    const isUnassigned = aids.length === 0;
                    const isDoneWeek = jobs.some(j => j.clientId === c.id && j.date === ds && j.status === "completed");
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={e => e.dataTransfer.setData("clientId", c.id)}
                        onClick={() => setOpenJob(c)}
                        style={{
                          background: isUnassigned ? "#FFF7ED" : isDoneWeek ? "#F3F4F6" : (emps[0]?.color + "20" || COLORS.white),
                          border: `1.5px solid ${isUnassigned ? COLORS.amberLight : isDoneWeek ? "#D1D5DB" : (emps[0]?.color || COLORS.border)}`,
                          borderLeft: `3px solid ${isUnassigned ? COLORS.amber : isDoneWeek ? "#9CA3AF" : (emps[0]?.color || COLORS.green)}`,
                          borderRadius: 6, padding: "3px 6px", marginBottom: 3,
                          cursor: "pointer", opacity: isDoneWeek ? 0.7 : 1,
                        }}>
                        <div style={{ fontWeight: 600, fontSize: 9, color: isDoneWeek ? COLORS.muted : COLORS.charcoal, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{isDoneWeek ? "Done " : ""}{c.name}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:3, marginTop:1 }}>
                          <span style={{ fontSize:8, color:COLORS.muted }}>{formatTime12(c.scheduledTime)}</span>
                          {emps.slice(0,2).map(e=>(
                            <span key={e.id} style={{width:10,height:10,borderRadius:"50%",background:e.color,display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:6,fontWeight:700}}>{e.initials?.[0]||e.name[0]}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Drop hint */}
                {isOver && <div style={{ position:"absolute", inset:2, border:`2px dashed ${COLORS.green}`, borderRadius:6, pointerEvents:"none", opacity:0.6 }} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // -- Crew views (unchanged) --
  const allActiveClients = clients.filter(c => c.active && c.nextService);
  const jobsForEmp = (empId) => allActiveClients.filter(c => isAssignedTo(c, empId))
    .sort((a, b) => (a.nextService || "").localeCompare(b.nextService || ""));
  const unassignedAll = allActiveClients.filter(c => assignedEmpIds(c).length === 0);

  const empColumn = (emp, clientList, isCompact) => (
    <div key={emp.id} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "8px 12px", borderRadius: 10, background: emp.color + "18", border: `1.5px solid ${emp.color}40` }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
          {(emp.initials || emp.name.split(" ").map(n => n[0]).join(""))}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: COLORS.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.name.split(" ")[0]}</div>
          <div style={{ fontSize: 10, color: COLORS.muted }}>{clientList.length} job{clientList.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
      {clientList.length === 0
        ? <div style={{ textAlign: "center", padding: "20px 8px", color: COLORS.muted, fontSize: 11, background: "#F9FAFB", borderRadius: 10, border: `1px dashed ${COLORS.border}` }}>No jobs</div>
        : clientList.map(c => <JobCard key={c.id} client={c} jobs={jobs} employees={employees} onOpen={setOpenJob} compact={isCompact} />)
      }
    </div>
  );

  const CrewViews = () => (
    <div>
      <div style={{ display: "flex", background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 3, gap: 2, marginBottom: 14 }}>
        {[{ id: "all", label: "All" }, { id: "single", label: "One crew" }, { id: "side", label: "Side by side" }].map(m => (
          <button key={m.id} onClick={() => setCrewMode(m.id)} style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", cursor: "pointer", background: crewMode === m.id ? COLORS.green : "transparent", color: crewMode === m.id ? "#fff" : COLORS.muted, fontSize: 12, fontWeight: crewMode === m.id ? 700 : 500, fontFamily: "inherit", transition: "all 0.15s" }}>{m.label}</button>
        ))}
      </div>
      {crewMode === "all" && (
        <div>
          {allActiveClients.filter(c => assignedEmpIds(c).length > 0).map(c => <JobCard key={c.id} client={c} jobs={jobs} employees={employees} onOpen={setOpenJob} />)}
          {unassignedAll.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.amber, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 }}>! Unassigned ({unassignedAll.length})</div>
              {unassignedAll.map(c => <JobCard key={c.id} client={c} jobs={jobs} employees={employees} onOpen={setOpenJob} />)}
            </div>
          )}
        </div>
      )}
      {crewMode === "single" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
            {visibleEmps.map((emp, idx) => {
              const isFocused = idx === focusedEmpIdx;
              return (
                <button key={emp.id} onClick={() => setFocusedEmpIdx(idx)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 12, border: "none", cursor: "pointer", background: isFocused ? emp.color : COLORS.white, boxShadow: isFocused ? `0 2px 8px ${emp.color}44` : "none", outline: isFocused ? "none" : `1px solid ${COLORS.border}`, transition: "all 0.15s", flexShrink: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: isFocused ? "rgba(255,255,255,0.3)" : emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>{(emp.initials || emp.name.split(" ").map(n => n[0]).join(""))}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: isFocused ? "#fff" : COLORS.charcoal, whiteSpace: "nowrap" }}>{emp.name.split(" ")[0]}</div>
                  <div style={{ fontSize: 10, color: isFocused ? "rgba(255,255,255,0.75)" : COLORS.muted }}>{jobsForEmp(emp.id).length} jobs</div>
                </button>
              );
            })}
          </div>
          {visibleEmps[focusedEmpIdx] && (() => {
            const emp = visibleEmps[focusedEmpIdx];
            const cl = jobsForEmp(emp.id);
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{(emp.initials || emp.name.split(" ").map(n => n[0]).join(""))}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.charcoal }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{emp.role} . {cl.length} job{cl.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                {cl.length === 0
                  ? <div style={{ textAlign: "center", padding: "30px 20px", color: COLORS.muted, fontSize: 13 }}>No jobs assigned.</div>
                  : cl.map(c => <JobCard key={c.id} client={c} jobs={jobs} employees={employees} onOpen={setOpenJob} />)
                }
              </div>
            );
          })()}
        </div>
      )}
      {crewMode === "side" && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", overflowX: "auto" }}>
          {visibleEmps.map(emp => empColumn(emp, jobsForEmp(emp.id), true))}
          {unassignedAll.length > 0 && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "8px 12px", borderRadius: 10, background: "#FFF7ED", border: `1.5px solid ${COLORS.amberLight}` }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: COLORS.amber }}>! Unassigned</div>
                <div style={{ fontSize: 10, color: COLORS.muted }}>{unassignedAll.length} job{unassignedAll.length !== 1 ? "s" : ""}</div>
              </div>
              {unassignedAll.map(c => <JobCard key={c.id} client={c} jobs={jobs} employees={employees} onOpen={setOpenJob} compact />)}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const dayLabel = focusedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const weekStartLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weekEndLabel = addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 3, gap: 2, flex: 1 }}>
          {[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "crew", label: "Crew" }].map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: "none", cursor: "pointer", background: viewMode === m.id ? COLORS.green : "transparent", color: viewMode === m.id ? "#fff" : COLORS.muted, fontSize: 12, fontWeight: viewMode === m.id ? 700 : 500, fontFamily: "inherit", transition: "all 0.15s" }}>{m.label}</button>
          ))}
        </div>
        <button onClick={() => setViewMode(viewMode === "master" ? "day" : "master")} style={{ display: "flex", alignItems: "center", gap: 5, background: viewMode === "master" ? COLORS.green : COLORS.white, border: `1px solid ${viewMode === "master" ? COLORS.green : COLORS.border}`, borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: viewMode === "master" ? "#fff" : COLORS.slate, cursor: "pointer", flexShrink: 0 }}>
          List Master
        </button>
        <button onClick={() => setShowCrewPicker(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 600, color: COLORS.slate, cursor: "pointer", flexShrink: 0 }}>
          Crew {visibleEmpIds.length}/{employees.length}
        </button>
      </div>

      {/* Day view */}
      {viewMode === "day" && (
        <div>
          <NavBar
            label={dayLabel}
            onPrev={() => setDayOffset(d => d - 1)}
            onNext={() => setDayOffset(d => d + 1)}
            onToday={() => setDayOffset(0)}
          />
          <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 8, textAlign: "center" }}>
            Drag jobs left/right to change time . Drag to another row to reassign crew
          </div>
          <TimelineDayView
            clients={clients}
            setClients={setClients}
            jobs={jobs}
            employees={employees}
            visibleEmps={visibleEmps}
            focusedDayStr={focusedDayStr}
            onOpenJob={setOpenJob}
            getCompletedJob={getCompletedJob}
          />
        </div>
      )}

      {/* Week view */}
      {viewMode === "week" && (
        <div>
          <NavBar
            label={`${weekStartLabel}   ${weekEndLabel}`}
            onPrev={() => setWeekOffset(w => w - 1)}
            onNext={() => setWeekOffset(w => w + 1)}
            onToday={() => setWeekOffset(0)}
          />
          <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", height: 540, overflowX: "auto" }}>
              {weekDays.map(d => <WeekDayCol key={fmt(d)} date={d} />)}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: COLORS.muted, marginTop: 6 }}>
            Drag jobs between columns to reschedule . Drag onto a time slot to set a time . Click any job to edit
          </div>
        </div>
      )}

      {/* Crew view */}
      {viewMode === "crew" && <CrewViews />}

      {/* Master schedule view */}
      {viewMode === "master" && (
        <MasterScheduleView
          clients={clients}
          setClients={setClients}
          jobs={jobs}
          setJobs={setJobs}
          employees={employees}
          onOpenJob={setOpenJob}
        />
      )}

      {/* Crew picker modal */}
      {showCrewPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: COLORS.white, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360, maxHeight: "80vh", overflowY: "auto", position: "relative" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, color: COLORS.charcoal }}>Visible crew</h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: COLORS.muted }}>Shown as rows in the Day timeline</p>
            <button onClick={() => setShowCrewPicker(false)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: COLORS.muted }}>✕</button>
            
            {employees.map(emp => {
              const selected = visibleEmpIds.includes(emp.id);
              return (
                <div key={emp.id} onClick={() => setVisibleEmpIds(prev => selected ? prev.filter(id => id !== emp.id) : [...prev, emp.id])} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 6, cursor: "pointer", background: selected ? emp.color + "12" : "#F9FAFB", border: `1.5px solid ${selected ? emp.color : COLORS.border}`, transition: "all 0.15s" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{(emp.initials || emp.name.split(" ").map(n => n[0]).join(""))}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.charcoal }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{emp.role}</div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? emp.color : COLORS.border}`, background: selected ? emp.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff" }}>{selected ? "Done" : ""}</div>
                </div>
              );
            })}
            <button onClick={() => setShowCrewPicker(false)} style={{ width: "100%", marginTop: 10, background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
          </div>
        </div>
      )}

      {/* Job detail modal */}
      {openJob && (
        <JobDetailModal
          client={openJob}
          employees={employees}
          jobs={jobs}
          setJobs={setJobs}
          onSave={handleSaveJob}
          onDelete={handleDeleteJob}
          onComplete={handleComplete}
          onClose={() => setOpenJob(null)}
          onEditClient={() => { setOpenJob(null); onNavigateClients(openJob.id); }}
        />
      )}
    </div>
  );
}
// -- TAB: Employees ---------------------------------------------------------
const ACCESS_COLORS = {
  crew:    { bg: "#F3F4F6", text: COLORS.muted },
  manager: { bg: "#EFF6FF", text: COLORS.sky },
  admin:   { bg: COLORS.greenPale, text: COLORS.green },
};

function EmployeeEditorModal({ employee, onSave, onClose, onDelete }) {
  const isNew = !employee;
  const blank = { name: "", role: "", phone: "", color: COLORS.green, accessLevel: "crew", pin: "", initials: "" };
  const [form, setForm] = useState(employee ? { ...employee } : blank);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showPin, setShowPin] = useState(false);

  const colorOptions = [COLORS.green, COLORS.sky, COLORS.amber, COLORS.soilLight, "#7C3AED", "#DB2777", "#0891B2", "#D97706"];

  const autoInitials = (name) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", paddingBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.charcoal }}>{isNew ? "Add crew member" : "Edit crew member"}</div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
        </div>

        <div style={{ padding: "18px 22px" }}>
          {/* Avatar preview */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: form.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 22 }}>
              {form.initials || autoInitials(form.name || "?")}
            </div>
          </div>

          {/* Basic info */}
          {[["Full name", "name"], ["Role (e.g. Crew Lead)", "role"], ["Phone", "phone"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input value={form[key] || ""} onChange={e => {
                setF(key, e.target.value);
                if (key === "name") setF("initials", autoInitials(e.target.value));
              }}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}

          {/* Color picker */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 8 }}>Avatar color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {colorOptions.map(c => (
                <div key={c} onClick={() => setF("color", c)} style={{
                  width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                  border: form.color === c ? "3px solid " + COLORS.charcoal : "3px solid transparent",
                  boxSizing: "border-box", transition: "border 0.1s",
                }} />
              ))}
            </div>
          </div>

          {/* Access level */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 8 }}>App access level</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ACCESS_LEVELS.map(al => (
                <div key={al.id} onClick={() => setF("accessLevel", al.id)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                  border: `1.5px solid ${form.accessLevel === al.id ? COLORS.green : COLORS.border}`,
                  background: form.accessLevel === al.id ? COLORS.greenPale : "#F9FAFB",
                  transition: "all 0.13s",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal }}>{al.label}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{al.desc}</div>
                  </div>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${form.accessLevel === al.id ? COLORS.green : COLORS.border}`,
                    background: form.accessLevel === al.id ? COLORS.green : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 11, fontWeight: 700,
                  }}>{form.accessLevel === al.id ? "Done" : ""}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PIN */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>
              App PIN (4 digits)
              <span style={{ color: COLORS.muted, fontWeight: 400, marginLeft: 6 }}>- used to log into the crew app</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type={showPin ? "text" : "password"}
                maxLength={4}
                value={form.pin || ""}
                onChange={e => setF("pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="    "
                style={{ flex: 1, border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 18, fontFamily: "monospace", letterSpacing: 6, boxSizing: "border-box" }}
              />
              <button onClick={() => setShowPin(s => !s)} style={{ background: "#F3F4F6", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, cursor: "pointer", color: COLORS.muted }}>
                {showPin ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button onClick={() => {
            if (!form.name) return;
            const saved = { ...form, id: employee?.id || Date.now(), initials: form.initials || autoInitials(form.name) };
console.log('Saving employee:', saved.name);
supabase.from('employees').insert({
  name: saved.name, role: saved.role, phone: saved.phone,
  color: saved.color, access_level: saved.accessLevel,
  pin: saved.pin, initials: saved.initials,
}).then(({ data, error }) => {
  console.log('Supabase result:', data, error);
});
onSave(saved);
            onClose();
          }} style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {isNew ? "Add crew member" : "Save changes"}
          </button>
          {!isNew && (
  <button onClick={() => { onDelete(employee.id); onClose(); }} style={{ width: "100%", marginTop: 8, background: "transparent", border: `1px solid ${COLORS.amber}`, borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 600, color: COLORS.amber, cursor: "pointer" }}>
    Delete crew member
  </button>
)}
        </div>
      </div>
    </div>
  );
}

function EmployeesTab({ employees, setEmployees, clients, jobs, setJobs }) {
  const [activeEmp, setActiveEmp] = useState(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [note, setNote] = useState("");
  const [editingEmp, setEditingEmp] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  const todayJobs = jobs.filter(j => j.date === fmt(today));
  const empJob = (empId) => jobs.find(j => j.employeeId === empId && !j.clockOut && j.clockIn);

  const handleClockIn = (empId) => {
    if (!selectedClient) return;
    const client = clients.find(c => c.id === parseInt(selectedClient));
    if (!client) return;
    setJobs(prev => [...prev, {
      id: Date.now(), clientId: client.id, clientName: client.name,
      date: fmt(today), status: "in_progress", revenue: client.rate,
      employeeId: empId, employeeName: employees.find(e => e.id === empId)?.name,
      clockIn: new Date().toISOString(), clockOut: null, duration: null,
      lat: client.lat, lng: client.lng, note,
    }]);
    setActiveEmp(null); setSelectedClient(""); setNote("");
  };

  const handleClockOut = (empId) => {
    setJobs(prev => prev.map(j => {
      if (j.employeeId === empId && !j.clockOut && j.clockIn) {
        const dur = new Date() - new Date(j.clockIn);
        return { ...j, clockOut: new Date().toISOString(), duration: dur, status: "completed" };
      }
      return j;
    }));
  };

  const saveEmployee = (emp) => {
    setEmployees(prev => {
      const exists = prev.find(e => e.id === emp.id);
      return exists ? prev.map(e => e.id === emp.id ? emp : e) : [...prev, emp];
    });
  };

  return (
    <div>
      <SectionHeader title="Field crew" action={
        <button onClick={() => { setEditingEmp(null); setShowEditor(true); }} style={{
          background: COLORS.green, color: "#fff", border: "none", borderRadius: 8,
          padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>+ Add member</button>
      } />

      {employees.map(emp => {
        const active = empJob(emp.id);
        const todayDone = todayJobs.filter(j => j.employeeId === emp.id && j.clockOut);
        const totalHrs = todayDone.reduce((s, j) => s + (j.duration || 0), 0) / 3600000;
        const totalRev = todayDone.reduce((s, j) => s + (j.revenue || 0), 0);
        const al = ACCESS_LEVELS.find(a => a.id === (emp.accessLevel || "crew"));
        const alColor = ACCESS_COLORS[emp.accessLevel || "crew"];

        return (
          <Card key={emp.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {(emp.initials || emp.name.split(" ").map(n => n[0]).join(""))}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{emp.role}</div>
                  </div>
                  {active ? <Badge label="On On site" color="#ECFDF5" textColor="#059669" /> : <Badge label="Available" color="#F3F4F6" textColor={COLORS.muted} />}
                  <Badge label={al?.label || "Crew"} color={alColor.bg} textColor={alColor.text} />
                </div>

                {active && (
                  <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "8px 10px", marginTop: 4, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: COLORS.green }}>  {active.clientName}</div>
                    <div style={{ color: COLORS.muted }}>Clocked in: {new Date(active.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    {active.note && <div style={{ color: COLORS.slate, marginTop: 2 }}>Note: {active.note}</div>}
                  </div>
                )}

                {todayDone.length > 0 && (
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>
                    Today: {todayDone.length} job{todayDone.length > 1 ? "s" : ""} . {totalHrs.toFixed(1)}h . ${totalRev}
                    {totalHrs > 0 && <span style={{ color: COLORS.green, fontWeight: 600 }}> . ${(totalRev / totalHrs).toFixed(0)}/hr</span>}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                {active ? (
                  <button onClick={() => handleClockOut(emp.id)} style={{ background: COLORS.amber, color: "#fff", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clock out</button>
                ) : (
                  <button onClick={() => setActiveEmp(emp.id)} style={{ background: COLORS.green, color: "#fff", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clock in</button>
                )}
                <button onClick={() => { setEditingEmp(emp); setShowEditor(true); }} style={{ background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Clock-in modal */}
      {activeEmp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: COLORS.white, borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, color: COLORS.charcoal }}>Clock in</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: COLORS.muted }}>{employees.find(e => e.id === activeEmp)?.name}</p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Select job</label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
              style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, marginBottom: 12, boxSizing: "border-box" }}>
              <option value="">-- Choose client --</option>
              {clients.filter(c => c.active && c.nextService <= fmt(addDays(today, 1))).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any notes..."
              style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, marginBottom: 16, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => handleClockIn(activeEmp)} disabled={!selectedClient} style={{
                flex: 1, background: selectedClient ? COLORS.green : COLORS.border,
                color: selectedClient ? "#fff" : COLORS.muted, border: "none", borderRadius: 8,
                padding: "10px", fontWeight: 700, cursor: selectedClient ? "pointer" : "default",
              }}>On Clock in</button>
              <button onClick={() => setActiveEmp(null)} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showEditor && (
        <EmployeeEditorModal
          employee={editingEmp}
          onSave={saveEmployee}
          onClose={() => { setShowEditor(false); setEditingEmp(null); }}
onDelete={(id) => {
  setEmployees(prev => prev.filter(e => e.id !== id));
  supabase.from('employees').delete().eq('id', id);
}}
        />
      )}
    </div>
  );
}

// -- Client Import Modal ----------------------------------------------------
function ClientImportModal({ onImport, onClose }) {
  const [step, setStep] = useState("upload"); // "upload" | "map" | "preview" | "done"
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState("");

  const APP_FIELDS = [
    { key: "name",        label: "Client / business name", required: true },
    { key: "address",     label: "Address",                required: false },
    { key: "email",       label: "Email",                  required: false },
    { key: "phone",       label: "Phone",                  required: false },
    { key: "rate",        label: "Rate per visit ($)",      required: false },
    { key: "frequency",   label: "Frequency",              required: false },
    { key: "nextService", label: "Next service date",      required: false },
    { key: "notes",       label: "Notes",                  required: false },
    { key: "phone_2",       label: "Phone 2",           required: false },
  { key: "contact_name",  label: "Contact name",       required: false },
  { key: "address_2",     label: "Address 2",          required: false },
  { key: "city",          label: "City",               required: false },
  { key: "state",         label: "State",              required: false },
  { key: "zip",           label: "Zip",                required: false },
  { key: "property_size", label: "Property size",      required: false },
  { key: "alerts",        label: "Alerts",             required: false },
  ];

  // Parse CSV or TSV text
  const parseCSV = (text) => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    // Detect delimiter
    const delim = lines[0].includes("\t") ? "\t" : ",";
    const parseRow = (line) => {
      const result = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === delim && !inQ) { result.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      result.push(cur.trim());
      return result;
    };
    const hdrs = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
    const rows = lines.slice(1).map(l => {
      const vals = parseRow(l);
      return Object.fromEntries(hdrs.map((h, i) => [h, (vals[i] || "").replace(/^"|"$/g, "").trim()]));
    });
    return { headers: hdrs, rows };
  };

  // Auto-guess column mapping
  const autoMap = (hdrs) => {
    const guesses = {};
    const matchers = {
      name:        ["name","client","customer","business","company","full name","contact"],
      address:     ["address","street","location","addr"],
      email:       ["email","e-mail","mail"],
      phone:       ["phone","cell","mobile","telephone","tel"],
      rate:        ["rate","price","cost","amount","charge","fee"],
      frequency:   ["frequency","freq","schedule","interval","recurrence"],
      nextService: ["next","service date","start","next visit","next service","date"],
      notes:       ["notes","note","comments","comment","memo"],
    };
    hdrs.forEach(h => {
      const hl = h.toLowerCase();
      for (const [field, keywords] of Object.entries(matchers)) {
        if (!guesses[field] && keywords.some(k => hl.includes(k))) {
          guesses[field] = h;
        }
      }
    });
    return guesses;
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { headers: hdrs, rows } = parseCSV(ev.target.result);
        if (!hdrs.length) { setError("Could not read file - make sure it's a CSV or Excel-exported CSV."); return; }
        setHeaders(hdrs);
        setRawRows(rows);
        setMapping(autoMap(hdrs));
        setStep("map");
      } catch (err) {
        setError("Error reading file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const normalizeFrequency = (val) => {
    const v = (val || "").toLowerCase();
    if (v.includes("week") && (v.includes("bi") || v.includes("every 2") || v.includes("other"))) return "Bi-weekly";
    if (v.includes("week")) return "Weekly";
    if (v.includes("month")) return "Monthly";
    if (v.includes("one") || v.includes("once") || v.includes("single")) return "One-time";
    return "Weekly";
  };

  const buildPreview = () => {
    const rows = rawRows.slice(0, 200).map((row, i) => {
      const get = (field) => mapping[field] ? row[mapping[field]] || "" : "";
      return {
        _row: i + 2,
        _valid: !!get("name"),
        name:        get("name"),
        address:     get("address"),
        email:       get("email"),
        phone:       get("phone"),
        rate:        parseFloat(get("rate")) || 0,
        frequency:   normalizeFrequency(get("frequency")) || "Weekly",
        nextService: get("nextService") || fmt(today),
        notes:       get("notes"),
        active:      true,
        services:    [],
        lat:         45.52, lng: -122.67,
      };
    }).filter(r => r._valid);
    setPreview(rows);
    setStep("preview");
  };

  const handleImport = () => {
    const newClients = preview.map(c => ({ ...c, id: Date.now() + Math.random() }));
    onImport(newClients);
    setImported(newClients.length);
    setStep("done");
  };

  const fieldColor = (field) => {
    if (!mapping[field] && APP_FIELDS.find(f => f.key === field)?.required) return "#FEF2F2";
    if (mapping[field]) return COLORS.greenPale;
    return "#F9FAFB";
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "95vh", overflowY: "auto", paddingBottom: 32 }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.charcoal }}>Import clients</div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
              {step === "upload" ? "Upload a CSV or Excel file" : step === "map" ? "Match your columns" : step === "preview" ? `${preview.length} clients ready to import` : `${imported} clients imported!`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", padding: "12px 22px 0", gap: 4 }}>
          {["upload", "map", "preview", "done"].map((s, i) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 99, background: ["upload","map","preview","done"].indexOf(step) >= i ? COLORS.green : COLORS.border, transition: "background 0.3s" }} />
          ))}
        </div>

        <div style={{ padding: "18px 22px" }}>

          {/* -- STEP 1: UPLOAD -- */}
          {step === "upload" && (
            <div>
              <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: `1px solid ${COLORS.skyLight}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.sky, marginBottom: 8 }}>List Supported formats</div>
                <div style={{ fontSize: 12, color: COLORS.slate, lineHeight: 1.7 }}>
                    <strong>CSV file</strong> (.csv) - exported from Excel, Google Sheets, or Jobber<br/>
                    <strong>Excel file saved as CSV</strong> - File fwd Save As fwd CSV in Excel<br/>
                    First row must be column headers<br/>
                    Up to 200 clients per import
                </div>
              </div>

              {/* Template download hint */}
              <div style={{ background: COLORS.cream, borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.charcoal, marginBottom: 6 }}>Tip Expected columns (in any order)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Name", "Address", "Email", "Phone", "Phone 2", "Contact Name", "Address 2", "City", "State", "Zip", "Rate", "Frequency", "Next Service Date", "Property Size", "Alerts", "Notes"].map(col => (
                    <span key={col} style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, color: COLORS.slate }}>{col}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8 }}>Columns are matched automatically - exact names not required.</div>
              </div>

              {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#DC2626" }}>{error}</div>}

              <label style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                border: `2px dashed ${COLORS.green}`, borderRadius: 14, padding: "32px 20px",
                cursor: "pointer", background: COLORS.greenPale + "44", textAlign: "center",
              }}>
                <span style={{ fontSize: 36 }}>Files</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.green }}>Click to choose your file</div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>CSV or Excel-exported CSV</div>
                </div>
                <input type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
              </label>
            </div>
          )}

          {/* -- STEP 2: MAP COLUMNS -- */}
          {step === "map" && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 16, lineHeight: 1.6 }}>
                We found <strong>{headers.length} columns</strong> and <strong>{rawRows.length} rows</strong>. Match your spreadsheet columns to the app fields below. Green = auto-matched.
              </div>

              {APP_FIELDS.map(field => (
                <div key={field.key} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.slate, flex: 1 }}>
                      {field.label}
                      {field.required && <span style={{ color: "#DC2626", marginLeft: 3 }}>*</span>}
                    </label>
                    {mapping[field.key] && <span style={{ fontSize: 10, color: COLORS.green, fontWeight: 600 }}>Done matched</span>}
                  </div>
                  <select
                    value={mapping[field.key] || ""}
                    onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                    style={{ width: "100%", border: `1.5px solid ${mapping[field.key] ? COLORS.greenLight : COLORS.border}`, borderRadius: 10, padding: "8px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: fieldColor(field.key) }}
                  >
                    <option value="">- Not included -</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}

              <div style={{ background: "#FEF3C7", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#92400E" }}>
                ! <strong>Name</strong> is required. All other fields are optional - you can fill them in after import.
              </div>

              <button onClick={buildPreview} style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Preview import fwd
              </button>
            </div>
          )}

          {/* -- STEP 3: PREVIEW -- */}
          {step === "preview" && (
            <div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
                Review your clients before importing. All will be added as active with weekly frequency unless your file specified otherwise.
              </div>

              <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 12, marginBottom: 16 }}>
                {preview.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", borderBottom: i < preview.length - 1 ? `1px solid ${COLORS.border}` : "none", background: i % 2 === 0 ? COLORS.white : "#FAFAFA" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.charcoal }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>{c.address || "No address"}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                        {c.phone && <span style={{ fontSize: 10, color: COLORS.muted }}>Tel {c.phone}</span>}
                        {c.email && <span style={{ fontSize: 10, color: COLORS.muted }}>Email {c.email}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {c.rate > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.green }}>${c.rate}</div>}
                      <div style={{ fontSize: 10, color: COLORS.muted }}>{c.frequency}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: COLORS.greenPale, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: COLORS.green, fontWeight: 600, textAlign: "center" }}>
                Ready to import {preview.length} client{preview.length !== 1 ? "s" : ""}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setStep("map")} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Back Back</button>
                <button onClick={handleImport} style={{ flex: 2, background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Done Import {preview.length} clients
                </button>
              </div>
            </div>
          )}

          {/* -- STEP 4: DONE -- */}
          {step === "done" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>!</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: COLORS.green, marginBottom: 8 }}>{imported} clients imported!</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 24, lineHeight: 1.6 }}>
                Your clients have been added to the Clients tab. You can edit each one to add services, set schedule dates, and assign crew members.
              </div>
              <button onClick={onClose} style={{ background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px 32px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                View clients fwd
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// -- TAB: Clients -----------------------------------------------------------
function ClientsTab({ clients, setClients, initialEditId, onEditHandled }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const blankForm = { name: "", address: "", frequency: "Weekly", services: [], rate: "", lat: 45.52, lng: -122.67, active: true, nextService: fmt(today) };
  const [form, setForm] = useState(blankForm);

  // Auto-open edit form when navigated from schedule modal
  useEffect(() => {
    if (initialEditId) {
      const c = clients.find(x => x.id === initialEditId);
      if (c) { handleEdit(c); onEditHandled(); }
    }
  }, [initialEditId]);

  const toggleService = (s) => setForm(f => ({ ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s] }));

  const handleSave = () => {
    if (!form.name || form.rate === "") return;
    if (editId) {
     setClients(prev => prev.map(c => c.id === editId ? { ...form, id: editId, rate: parseFloat(form.rate) } : c));
      supabase.from('clients').update({
        name: form.name, address: form.address,
        frequency: form.frequency, services: form.services,
        rate: parseFloat(form.rate), next_service: form.nextService,
        contact_name: form.contact_name, phone: form.phone, phone_2: form.phone_2,
      email: form.email, address_2: form.address_2, city: form.city,
      state: form.state, zip: form.zip, property_size: form.property_size,
      alerts: form.alerts,
      }).eq('id', editId).then(({ error }) => { console.log('client update:', error); }); 
    } else {
      supabase.from('clients').insert({
  name: form.name, address: form.address,
  frequency: form.frequency, services: form.services,
  rate: parseFloat(form.rate), next_service: form.nextService,
  contact_name: form.contact_name, phone: form.phone, phone_2: form.phone_2,
      email: form.email, address_2: form.address_2, city: form.city,
      state: form.state, zip: form.zip, property_size: form.property_size,
      alerts: form.alerts,
  active: true,
  assigned_employee_ids: [],
  completed_visit_dates: [],
}).select().then(({ data, error }) => {
  if (data && data[0]) {
    const newClient = { ...data[0], nextService: data[0].next_service, assignedEmployeeIds: data[0].assigned_employee_ids || [], completedVisitDates: data[0].completed_visit_dates || [] };
    setClients(prev => [...prev, newClient]);
  }
  console.log('client save:', data, error);
});
    };
    setShowAdd(false);
    setEditId(null);
    setForm(blankForm);
  }

  const handleEdit = (c) => {
    setForm({ ...c, rate: c.rate.toString() });
    setEditId(c.id);
    setShowAdd(true);
  };
const handleDelete = (id) => {
    if (!window.confirm("Delete this client? This cannot be undone.")) return;
    setClients(prev => prev.filter(c => c.id !== id));
    supabase.from('clients').delete().eq('id', id).then(({ error }) => { console.log('delete result:', id, error); });
    setShowAdd(false);
    setEditId(null);
    setForm(blankForm);
  };
  const toggleActive = (id) => setClients(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));

  return (
    <div>
      <SectionHeader title={`Clients (${clients.length})`} action={
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={() => setShowImport(true)} style={{
            background: COLORS.white, color: COLORS.sky, border: `1px solid ${COLORS.skyLight}`, borderRadius: 8,
            padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>up Import</button>
          <button onClick={() => { setForm(blankForm); setEditId(null); setShowAdd(true); }} style={{
            background: COLORS.green, color: "#fff", border: "none", borderRadius: 8,
            padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>+ Add client</button>
        </div>
      } />

      {clients.map(c => (
        <Card key={c.id} style={{ marginBottom: 10, opacity: c.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal }}>{c.name}</span>
                <Badge label={c.frequency} color={COLORS.greenPale} textColor={COLORS.green} />
                {!c.active && <Badge label="Inactive" color="#F3F4F6" textColor={COLORS.muted} />}
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>{c.address}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {c.services.map(s => <Badge key={s} label={s} color="#F3F4F6" textColor={COLORS.slate} />)}
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: COLORS.green }}>${c.rate}</span>
                <span style={{ color: COLORS.muted }}> per visit . Next: {c.nextService || "N/A"}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
              <button onClick={() => handleEdit(c)} style={{ background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
              <button onClick={() => toggleActive(c.id)} style={{ background: "transparent", color: c.active ? COLORS.amber : COLORS.green, border: `1px solid ${c.active ? COLORS.amberLight : COLORS.greenLight}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{c.active ? "Pause" : "Activate"}</button>
            </div>
          </div>
        </Card>
      ))}

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20, overflowY: "auto" }}>
          <div style={{ background: COLORS.white, borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, color: COLORS.charcoal }}>{editId ? "Edit client" : "Add client"}</h3>
            {[["Client / business name", "name", "text"], ["Address", "address", "text"]].map(([label, key, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
                <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Frequency</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }}>
                {FREQUENCIES.map(fr => <option key={fr}>{fr}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 6 }}>Services</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SERVICES.map(s => (
                  <button key={s} onClick={() => toggleService(s)} style={{
                    padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: form.services.includes(s) ? COLORS.green : "#F3F4F6",
                    color: form.services.includes(s) ? "#fff" : COLORS.slate,
                    border: "none",
                  }}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Rate per visit ($)</label>
              <input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder="0.00"
                style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>First/next service date</label>
              <input type="date" value={form.nextService} onChange={e => setForm(f => ({ ...f, nextService: e.target.value }))}
                style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <>
            <div style={{ marginBottom: 12 }}>
  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Contact name</label>
  <input value={form.contact_name || ""} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
    style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
</div>
<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Phone</label>
    <input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Phone 2</label>
    <input value={form.phone_2 || ""} onChange={e => setForm(f => ({ ...f, phone_2: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
</div>
<div style={{ marginBottom: 12 }}>
  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Email</label>
  <input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
    style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
</div>
<div style={{ marginBottom: 12 }}>
  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Address 2</label>
  <input value={form.address_2 || ""} onChange={e => setForm(f => ({ ...f, address_2: e.target.value }))}
    style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
</div>
<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
  <div style={{ flex: 2 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>City</label>
    <input value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>State</label>
    <input value={form.state || ""} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Zip</label>
    <input value={form.zip || ""} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
</div>
<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Property size</label>
    <input value={form.property_size || ""} onChange={e => setForm(f => ({ ...f, property_size: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
  <div style={{ flex: 1 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 4 }}>Alerts</label>
    <input value={form.alerts || ""} onChange={e => setForm(f => ({ ...f, alerts: e.target.value }))}
      style={{ width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14 }} />
  </div>
</div>
</>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} style={{ flex: 1, background: COLORS.green, color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, cursor: "pointer" }}>Save</button>
              {editId && <button onClick={() => handleDelete(editId)} style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Delete</button>}
              <button onClick={() => { setShowAdd(false); setEditId(null); }} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ClientImportModal
          onImport={(newClients) => setClients(prev => [...prev, ...newClients])}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
function AnalyticsTab({ jobs, clients }) {
  const [period, setPeriod] = useState("week");

  const now = new Date();
  const periodStart = period === "today" ? fmt(today)
    : period === "week" ? fmt(addDays(now, -7))
    : fmt(addDays(now, -30));

  const filtered = jobs.filter(j => j.date >= periodStart && j.status === "completed");
  const totalRev = filtered.reduce((s, j) => s + (j.revenue || 0), 0);
  const totalMs = filtered.reduce((s, j) => s + (j.duration || 0), 0);
  const totalHrs = totalMs / 3600000;
  const avgPerHour = totalHrs > 0 ? totalRev / totalHrs : null;
  const jobCount = filtered.length;

  // Per-client breakdown
  const byClient = {};
  filtered.forEach(j => {
    if (!byClient[j.clientId]) byClient[j.clientId] = { name: j.clientName, rev: 0, ms: 0, count: 0 };
    byClient[j.clientId].rev += j.revenue || 0;
    byClient[j.clientId].ms += j.duration || 0;
    byClient[j.clientId].count += 1;
  });
  const clientRows = Object.values(byClient).sort((a, b) => b.rev - a.rev);

  // Per-employee breakdown
  const byEmp = {};
  filtered.forEach(j => {
    if (!j.employeeName) return;
    if (!byEmp[j.employeeName]) byEmp[j.employeeName] = { rev: 0, ms: 0, count: 0 };
    byEmp[j.employeeName].rev += j.revenue || 0;
    byEmp[j.employeeName].ms += j.duration || 0;
    byEmp[j.employeeName].count += 1;
  });
  const empRows = Object.entries(byEmp).sort((a, b) => b[1].rev - a[1].rev);

  const StatBox = ({ label, value, sub, color = COLORS.green }) => (
    <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px", flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.muted }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"]].map(([v, l]) => (
          <Pill key={v} label={l} active={period === v} onClick={() => setPeriod(v)} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <StatBox label="Revenue" value={`$${totalRev.toLocaleString()}`} sub={`${jobCount} jobs`} color={COLORS.green} />
        <StatBox label="Hours worked" value={totalHrs > 0 ? `${totalHrs.toFixed(1)}h` : "-"} sub="field time" color={COLORS.sky} />
        <StatBox label="Income / hr" value={avgPerHour ? `$${avgPerHour.toFixed(0)}` : "-"} sub="avg rate" color={COLORS.amber} />
      </div>

      {clientRows.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <SectionHeader title="Revenue by client" />
          {clientRows.map((c, i) => {
            const hrs = c.ms / 3600000;
            const iph = hrs > 0 ? c.rev / hrs : null;
            const pct = totalRev > 0 ? (c.rev / totalRev) * 100 : 0;
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: COLORS.charcoal }}>{c.name}</span>
                  <span style={{ color: COLORS.green, fontWeight: 700 }}>${c.rev}</span>
                </div>
                <div style={{ background: COLORS.greenPale, borderRadius: 99, height: 6, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, background: COLORS.green, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                  <span>{c.count} visit{c.count !== 1 ? "s" : ""} . {hrs.toFixed(1)}h</span>
                  {iph && <span style={{ color: COLORS.green, fontWeight: 600 }}>${iph.toFixed(0)}/hr</span>}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {empRows.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <SectionHeader title="Employee productivity" />
          {empRows.map(([name, e], i) => {
            const hrs = e.ms / 3600000;
            const iph = hrs > 0 ? e.rev / hrs : null;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < empRows.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.charcoal }}>{name}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{e.count} jobs . {hrs.toFixed(1)}h</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: COLORS.green, fontSize: 14 }}>${e.rev}</div>
                  {iph && <div style={{ fontSize: 11, color: COLORS.muted }}>${iph.toFixed(0)}/hr</div>}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.muted, fontSize: 14 }}>
          No completed jobs in this period yet.<br />
          <span style={{ fontSize: 12 }}>Complete jobs from the Schedule tab to see analytics.</span>
        </div>
      )}

      {jobs.length > 0 && filtered.length === 0 && (
        <Card>
          <SectionHeader title="Recent job log" />
          {jobs.slice(-5).reverse().map((j, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: i < 4 ? `1px solid ${COLORS.border}` : "none" }}>
              <div>
                <div style={{ fontWeight: 600, color: COLORS.charcoal }}>{j.clientName}</div>
                <div style={{ color: COLORS.muted }}>{j.date} . {j.employeeName || "unassigned"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: COLORS.green, fontWeight: 700 }}>${j.revenue}</div>
                <div style={{ color: COLORS.muted }}>{formatDuration(j.duration)}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// -- CREW APP (embedded) ----------------------------------------------------
// Aliases to share globals with manager app
const CREW_TODAY = today;
const crewFmt = fmt;
const crewAddDays = addDays;
const crewTodayStr = fmt(today);
// -- Design tokens ---------------------------------------------------------
const G = {
  green:      "#1B4332",
  greenMid:   "#2D6A4F",
  greenLight: "#52B788",
  greenPale:  "#D8F3DC",
  greenGlow:  "#40916C",
  amber:      "#E76F51",
  amberLight: "#F4A261",
  sky:        "#0EA5E9",
  red:        "#DC2626",
  redPale:    "#FEF2F2",
  charcoal:   "#111827",
  slate:      "#374151",
  muted:      "#6B7280",
  border:     "#E5E7EB",
  surface:    "#F8FAF9",
  white:      "#FFFFFF",
};

// -- Seed data (mirrors manager app) ---------------------------------------
// crew TODAY defined below
// crew fmt defined below
// crew addDays defined below
// crew crewTodayStr defined below

// Crew app derives its employee list from initEmployees (shared source of truth)
const CREW_EMPLOYEES = initEmployees;

const CREW_CLIENTS = [
  { id: 1, name: "Hartwell Residence",    address: "4821 Maple Ridge Dr, Vancouver, WA",    lat: 45.523, lng: -122.676, frequency: "Weekly",    services: ["Lawn mowing", "Hedge trimming"],                            rate: 95,  nextService: crewTodayStr,                     assignedEmployeeIds: [1, 2] },
  { id: 2, name: "Greenfield Office Park",address: "1200 Commerce Blvd, Vancouver, WA",     lat: 45.531, lng: -122.682, frequency: "Bi-weekly", services: ["Lawn mowing", "Fertilization"],                             rate: 240, nextService: crewFmt(crewAddDays(CREW_TODAY, 2)),      assignedEmployeeIds: [1] },
  { id: 3, name: "Lakeview Estates HOA",  address: "800 Lakeview Circle, Vancouver, WA",    lat: 45.518, lng: -122.660, frequency: "Weekly",    services: ["Lawn mowing", "Leaf cleanup"],                              rate: 320, nextService: crewTodayStr,                     assignedEmployeeIds: [2, 3] },
  { id: 4, name: "Morrison Household",    address: "3355 Birch Lane, Vancouver, WA",         lat: 45.527, lng: -122.690, frequency: "Monthly",   services: ["Aeration", "Fertilization"],                                rate: 175, nextService: crewFmt(crewAddDays(CREW_TODAY, 5)),      assignedEmployeeIds: [4] },
  { id: 5, name: "Sunrise Garden Club",   address: "211 Sunrise Ave, Vancouver, WA",          lat: 45.515, lng: -122.670, frequency: "Bi-weekly", services: ["Lawn mowing", "Hedge trimming", "Irrigation check"],        rate: 280, nextService: crewFmt(crewAddDays(CREW_TODAY, 3)),      assignedEmployeeIds: [3, 4] },
];

// -- Helpers ---------------------------------------------------------------
function mapsUrl(client) {
  const q = encodeURIComponent(client.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

function fmtDuration(ms) {
  if (!ms || ms < 1000) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
               : `${m}:${String(s % 60).padStart(2, "0")}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

// -- PIN Login -------------------------------------------------------------
function CrewLoginScreen({ onLogin, employees }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleDigit = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      const emp = selected && (employees || CREW_EMPLOYEES).find(e => e.name === selected.name);
      setTimeout(() => {
        if (emp && emp.pin === next) {
          onLogin(emp);
        } else {
          setError("Wrong PIN. Try again.");
          setPin("");
        }
      }, 200);
    }
  };

  const handleBack = () => { setPin(p => p.slice(0, -1)); setError(""); };

  return (
    <div style={{ minHeight: "100vh", background: G.green, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>GR</div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, letterSpacing: -0.5 }}>GreenRoute Crew</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4 }}>
          {CREW_TODAY.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {!selected ? (
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, textAlign: "center", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.8 }}>Who are you?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(employees || CREW_EMPLOYEES).map(emp => (
              <button key={emp.id} onClick={() => setSelected(emp)} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.2)",
                borderRadius: 14, cursor: "pointer", transition: "all 0.15s", color: "#fff",
              }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: emp.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{emp.initials}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{emp.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{emp.role}</div>
                </div>
                <div style={{ marginLeft: "auto", opacity: 0.4, fontSize: 20 }}>Next</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
          <button onClick={() => { setSelected(null); setPin(""); setError(""); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, marginBottom: 20, fontFamily: "inherit" }}>Back Back</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: selected.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff" }}>{selected.initials}</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{selected.name}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Enter your PIN</div>
            </div>
          </div>

          {/* PIN dots */}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 6 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: i < pin.length ? G.greenLight : "rgba(255,255,255,0.2)", transition: "background 0.15s", border: "2px solid rgba(255,255,255,0.3)" }} />
            ))}
          </div>
          {error && <div style={{ color: G.amberLight, fontSize: 12, marginBottom: 8, minHeight: 18 }}>{error}</div>}
          {!error && <div style={{ minHeight: 24 }} />}

          {/* Numpad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
            {[1,2,3,4,5,6,7,8,9,"",0,"del"].map((d, i) => (
              <button key={i} onClick={() => d === "del" ? handleBack() : d !== "" ? handleDigit(String(d)) : null}
                disabled={d === ""}
                style={{
                  height: 62, borderRadius: 14, border: "none", cursor: d === "" ? "default" : "pointer",
                  background: d === "" ? "transparent" : d === "del" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
                  color: "#fff", fontSize: d === "del" ? 20 : 22, fontWeight: 600,
                  fontFamily: "inherit", transition: "background 0.1s",
                  opacity: d === "" ? 0 : 1,
                }} onMouseDown={e => { if (d !== "") e.currentTarget.style.background = "rgba(255,255,255,0.22)"; }}
                onMouseUp={e => { if (d !== "" && d !== "del") e.currentTarget.style.background = "rgba(255,255,255,0.12)"; else if (d === "del") e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              >{d}</button>
            ))}
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 16 }}>Demo PINs: 1111 . 2222 . 3333 . 4444</div>
        </div>
      )}
    </div>
  );
}

// -- Live timer hook -------------------------------------------------------
function useCrewTick(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

// -- Job detail screen -----------------------------------------------------
function CrewJobDetail({ client, jobState, empId, onBack, onUpdate }) {
  const { status, clockIn, clockOut, duration, notes: savedNotes, photos: savedPhotos } = jobState;
  const [noteText, setNoteText] = useState(savedNotes || "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [photos, setPhotos] = useState(savedPhotos || []);
  const textRef = useRef(null);
  const fileRef = useRef(null);

  const isRunning = status === "running" && clockIn && !clockOut;
  useCrewTick(isRunning);

  const elapsed = isRunning
    ? Date.now() - new Date(clockIn).getTime()
    : (duration || 0);

  const handleStart = () => {
    onUpdate(client.id, { status: "running", clockIn: new Date().toISOString(), clockOut: null, duration: 0 });
  };

  const handleStop = () => {
    const dur = Date.now() - new Date(clockIn).getTime();
    onUpdate(client.id, { status: "done", clockOut: new Date().toISOString(), duration: dur });
  };

  const handleSaveNote = () => {
    onUpdate(client.id, { notes: noteText, photos });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const handlePhotoAdd = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const newPhoto = { url: ev.target.result, caption: "", addedAt: new Date().toISOString() };
        setPhotos(prev => {
          const updated = [...prev, newPhoto];
          onUpdate(client.id, { photos: updated });
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      onUpdate(client.id, { photos: updated });
      return updated;
    });
  };

  const isOverdue = client.nextService < crewTodayStr;
  const isToday = client.nextService === crewTodayStr;

  return (
    <div style={{ minHeight: "100vh", background: G.surface, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: G.green, padding: "0 0 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 0" }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>Prev</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 }}>{client.frequency}</div>
          </div>
          {status === "done" && <div style={{ background: G.greenLight, color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Done Done</div>}
        </div>

        {/* Timer display */}
        <div style={{ textAlign: "center", padding: "22px 20px 26px" }}>
          <div style={{ color: isRunning ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 52, fontWeight: 800, letterSpacing: -2, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {fmtDuration(elapsed)}
          </div>
          {clockIn && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 6 }}>
            Started {new Date(clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {clockOut && ` . Finished ${new Date(clockOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </div>}
        </div>
      </div>

      <div style={{ padding: "18px 16px 40px" }}>
        {/* Start / Stop button */}
        {status !== "done" && (
          <div style={{ marginBottom: 18 }}>
            {!isRunning ? (
              <button onClick={handleStart} style={{
                width: "100%", background: G.greenGlow, color: "#fff", border: "none",
                borderRadius: 16, padding: "18px", fontSize: 17, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.3,
                boxShadow: `0 4px 20px ${G.greenGlow}55`,
              }}>Start Start job</button>
            ) : (
              <button onClick={handleStop} style={{
                width: "100%", background: G.amber, color: "#fff", border: "none",
                borderRadius: 16, padding: "18px", fontSize: 17, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.3,
                boxShadow: `0 4px 20px ${G.amber}55`,
              }}>Stop Stop &amp; complete</button>
            )}
          </div>
        )}

        {/* Address + Directions */}
        <div style={{ background: G.white, borderRadius: 14, border: `1px solid ${G.border}`, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Location</div>
          <div style={{ fontSize: 14, color: G.charcoal, fontWeight: 500, marginBottom: 12, lineHeight: 1.4 }}>{client.address}</div>
          <a href={mapsUrl(client)} target="_blank" rel="noopener noreferrer" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: G.sky, color: "#fff", borderRadius: 10, padding: "11px 16px",
            fontWeight: 700, fontSize: 13, textDecoration: "none", fontFamily: "inherit",
          }}>
            <span style={{ fontSize: 16 }}>Map</span> Open in Google Maps
          </a>
        </div>

        {/* Services checklist */}
        <div style={{ background: G.white, borderRadius: 14, border: `1px solid ${G.border}`, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Services</div>
          {client.services.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${G.border}` }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${status === "done" ? G.greenLight : G.border}`, background: status === "done" ? G.greenPale : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {status === "done" && <span style={{ color: G.greenMid, fontSize: 12, fontWeight: 700 }}>Done</span>}
              </div>
              <span style={{ fontSize: 14, color: G.slate, fontWeight: 500 }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Notes + Photos */}
        <div style={{ background: G.white, borderRadius: 14, border: `1px solid ${G.border}`, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Notes &amp; photos</div>

          {/* Photo grid */}
          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "#F3F4F6" }}>
                  <img src={p.url} alt={`Photo ${i+1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button onClick={() => removePhoto(i)} style={{
                    position: "absolute", top: 4, right: 4, width: 22, height: 22,
                    borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none",
                    color: "#fff", fontSize: 12, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", lineHeight: 1,
                  }}>X</button>
                  {p.caption && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 9, padding: "3px 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.caption}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            border: `2px dashed ${G.greenLight}`, borderRadius: 10, padding: "12px",
            cursor: "pointer", marginBottom: 12, color: G.greenMid, fontWeight: 600,
            fontSize: 13, background: G.greenPale + "55",
          }}>
            <span style={{ fontSize: 18 }}>Photo</span>
            <span>Add photo</span>
            <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoAdd}
              style={{ display: "none" }} />
          </label>

          <textarea ref={textRef} value={noteText} onChange={e => { setNoteText(e.target.value); setNoteSaved(false); }}
            placeholder="Add notes... gate code, issues, special instructions..."
            rows={3}
            style={{ width: "100%", border: `1.5px solid ${G.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, color: G.charcoal, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }}
          />
          <button onClick={handleSaveNote} style={{
            marginTop: 8, width: "100%", background: noteSaved ? G.greenPale : G.surface,
            color: noteSaved ? G.greenMid : G.slate, border: `1px solid ${noteSaved ? G.greenLight : G.border}`,
            borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
          }}>{noteSaved ? "Done Saved" : "Save note"}</button>
        </div>

        {/* Job info strip */}
        <div style={{ background: G.white, borderRadius: 14, border: `1px solid ${G.border}`, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Job info</div>
          {[
            ["Schedule", client.nextService + (client.scheduledTime ? ` at ${client.scheduledTime}` : "")],
            ["Frequency", client.frequency],
  
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${G.border}` }}>
              <span style={{ fontSize: 13, color: G.muted }}>{k}</span>
              <span style={{ fontSize: 13, color: G.charcoal, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- Job card on home screen -----------------------------------------------
function CrewHomeJobCard({ client, jobState, onOpen }) {
  const { status, clockIn, clockOut, duration } = jobState;
  const isRunning = status === "running" && clockIn;
  useCrewTick(isRunning);

  const elapsed = isRunning ? Date.now() - new Date(clockIn).getTime() : (duration || 0);
  const isToday = client.nextService === crewTodayStr;
  const isOverdue = client.nextService < crewTodayStr;

  const statusBadge = status === "done"
    ? { bg: G.greenPale, text: G.greenMid, label: "Done Done" }
    : isRunning
    ? { bg: "#ECFDF5", text: "#059669", label: "* Running" }
    : isOverdue
    ? { bg: "#FEF3C7", text: "#D97706", label: "Overdue" }
    : isToday
    ? { bg: G.greenPale, text: G.greenMid, label: "Today" }
    : { bg: "#EFF6FF", text: G.sky, label: client.nextService };

  return (
    <div onClick={() => onOpen(client)} style={{
      background: G.white, borderRadius: 14,
      border: `1.5px solid ${isRunning ? G.greenLight : status === "done" ? G.greenPale : G.border}`,
      padding: "14px 16px", marginBottom: 10, cursor: "pointer",
      boxShadow: isRunning ? `0 2px 12px ${G.greenGlow}22` : "none",
      transition: "box-shadow 0.15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: G.charcoal }}>{client.name}</span>
            <span style={{ background: statusBadge.bg, color: statusBadge.text, padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{statusBadge.label}</span>
          </div>
          <div style={{ fontSize: 12, color: G.muted, marginBottom: 6 }}>{client.address}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {client.services.map(s => (
              <span key={s} style={{ background: "#F3F4F6", color: G.slate, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 500 }}>{s}</span>
            ))}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {isRunning
            ? <div style={{ fontSize: 18, fontWeight: 800, color: G.greenMid, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(elapsed)}</div>
            : elapsed > 0
            ? <div style={{ fontSize: 13, fontWeight: 700, color: G.muted }}>{fmtDuration(elapsed)}</div>
            : client.scheduledTime
            ? <div style={{ fontSize: 13, fontWeight: 600, color: G.muted }}>  {client.scheduledTime}</div>
            : <div style={{ color: G.border, fontSize: 20 }}>Next</div>
          }
          <div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>{client.frequency}</div>
        </div>
      </div>
    </div>
  );
}

// -- Home screen -----------------------------------------------------------
function CrewHomeScreen({ employee, onLogout, onOpenJob, jobStates }) {
  const myJobs = CREW_CLIENTS.filter(c =>
    (c.assignedEmployeeIds || []).includes(employee.id) && c.active !== false
  );
  const todayJobs = myJobs.filter(c => c.nextService === crewTodayStr);
  const upcomingJobs = myJobs.filter(c => c.nextService > crewTodayStr);

  const doneCount = todayJobs.filter(c => jobStates[c.id]?.status === "done").length;
  const runningJob = todayJobs.find(c => jobStates[c.id]?.status === "running");

  return (
    <div style={{ minHeight: "100vh", background: G.surface, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: G.green, padding: "18px 18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>GR GreenRoute</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 }}>
              {CREW_TODAY.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{employee.name.split(" ")[0]}</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{employee.role}</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: employee.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>{employee.initials}</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Today's jobs", val: todayJobs.length, sub: `${doneCount} of ${todayJobs.length} done` },
            { label: "In progress", val: runningJob ? "On site" : "-", sub: runningJob ? runningJob.name.split(" ")[0] : "" },
            { label: "Status", val: doneCount === todayJobs.length && todayJobs.length > 0 ? "All done!" : runningJob ? "Running" : "Ready", sub: "" },
          ].map(({ label, val, sub }) => (
            <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 10px 8px", textAlign: "center" }}>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, marginTop: 3 }}>{val}</div>
              {sub && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 1 }}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "18px 16px 32px" }}>
        {/* Today */}
        {todayJobs.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Today . {todayJobs.length} job{todayJobs.length !== 1 ? "s" : ""}</div>
            {todayJobs.map(c => (
              <CrewHomeJobCard key={c.id} client={c} jobState={jobStates[c.id] || {}} onOpen={onOpenJob} />
            ))}
          </div>
        )}

        {/* Upcoming */}
        {upcomingJobs.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: G.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Upcoming</div>
            {upcomingJobs.map(c => (
              <CrewHomeJobCard key={c.id} client={c} jobState={jobStates[c.id] || {}} onOpen={onOpenJob} />
            ))}
          </div>
        )}

        {todayJobs.length === 0 && upcomingJobs.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: G.muted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>!</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: G.charcoal, marginBottom: 6 }}>No jobs assigned</div>
            <div style={{ fontSize: 13 }}>Check with your manager for your schedule.</div>
          </div>
        )}

        {/* Logout */}
        <button onClick={onLogout} style={{
          width: "100%", marginTop: 16, background: "transparent", color: G.muted,
          border: `1px solid ${G.border}`, borderRadius: 12, padding: "11px",
          fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Sign out</button>
      </div>
    </div>
  );
}

// -- Root ------------------------------------------------------------------
function CrewApp({ employees }) {
  const [employee, setEmployee] = useState(null);
  const [openClient, setOpenClient] = useState(null);
  const [jobStates, setJobStates] = useState({});

  const updateJob = (clientId, patch) => {
    setJobStates(prev => ({ ...prev, [clientId]: { ...(prev[clientId] || {}), ...patch } }));
  };

  // Not logged in - show login
  if (!employee) return <CrewLoginScreen onLogin={setEmployee} employees={employees} />;

  // Manager or Admin - show the full app with a sign-out button overlay
  if (employee.accessLevel === "manager" || employee.accessLevel === "admin") {
    return (
      <div style={{ position: "relative" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 999, background: COLORS.green, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: employee.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 11 }}>{employee.initials}</div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{employee.name}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>{employee.accessLevel === "admin" ? "Admin" : "Manager"} access</div>
            </div>
          </div>
          <button onClick={() => setEmployee(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Sign out</button>
        </div>
        <App />
      </div>
    );
  }

  // Crew - show field app
  if (openClient) {
    return (
      <CrewJobDetail
        client={openClient}
        jobState={jobStates[openClient.id] || {}}
        empId={employee.id}
        onBack={() => setOpenClient(null)}
        onUpdate={updateJob}
      />
    );
  }

  return (
    <CrewHomeScreen
      employee={employee}
      onLogout={() => setEmployee(null)}
      onOpenJob={setOpenClient}
      jobStates={jobStates}
    />
  );
}

// -- QUOTES -----------------------------------------------------------------

const QUOTE_SERVICES = [
  { label: "Lawn mowing",      defaultPrice: 65 },
  { label: "Hedge trimming",   defaultPrice: 80 },
  { label: "Fertilization",    defaultPrice: 95 },
  { label: "Aeration",         defaultPrice: 120 },
  { label: "Leaf cleanup",     defaultPrice: 75 },
  { label: "Snow removal",     defaultPrice: 110 },
  { label: "Irrigation check", defaultPrice: 85 },
  { label: "Dethatching",      defaultPrice: 130 },
  { label: "Mulching",         defaultPrice: 90 },
  { label: "Overseeding",      defaultPrice: 140 },
  { label: "Custom service",   defaultPrice: 0 },
];

const STATUS_META = {
  draft:    { label: "Draft",    bg: "#F3F4F6", text: COLORS.muted },
  sent:     { label: "Sent",    bg: "#EFF6FF", text: COLORS.sky },
  accepted: { label: "Accepted", bg: COLORS.greenPale, text: COLORS.green },
  declined: { label: "Declined", bg: "#FEF2F2", text: "#DC2626" },
};

function quoteNumber(id) {
  return "QT-" + String(id).padStart(4, "0");
}

function buildMailto(quote) {
  const subject = encodeURIComponent(`Your quote from GreenRoute - ${quoteNumber(quote.id)}`);
  const lines = [
    `Hi ${quote.clientName || "there"},`,
    ``,
    `Thank you for your interest in GreenRoute lawn & landscape services. Please find your quote below.`,
    ``,
    `Quote: ${quoteNumber(quote.id)}`,
    `Date: ${quote.createdAt?.slice(0, 10) || fmt(today)}`,
    `Valid until: ${quote.validUntil || "-"}`,
    ``,
    `-----------------------------`,
    `SERVICES`,
    `-----------------------------`,
    ...quote.lineItems.map(li => `${li.label}${li.description ? " - " + li.description : ""}  x${li.qty}  $${(li.price * li.qty).toFixed(2)}`),
    ``,
    `-----------------------------`,
    `Subtotal: $${quote.subtotal?.toFixed(2)}`,
    quote.discount > 0 ? `Discount: -$${quote.discount?.toFixed(2)}` : null,
    `TOTAL: $${quote.total?.toFixed(2)}`,
    `-----------------------------`,
    ``,
    quote.notes ? `Notes:\n${quote.notes}` : null,
    ``,
    `To accept this quote, simply reply to this email.`,
    ``,
    `Best regards,`,
    `GreenRoute Lawn & Landscape`,
  ].filter(l => l !== null).join("\n");

  return `mailto:${quote.clientEmail || ""}?subject=${subject}&body=${encodeURIComponent(lines)}`;
}

// Quote preview / send modal
function QuotePreviewModal({ quote, onClose, onUpdateStatus }) {
  const status = STATUS_META[quote.status] || STATUS_META.draft;
  const mailto = buildMailto(quote);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", paddingBottom: 32 }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.charcoal }}>{quoteNumber(quote.id)}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{quote.clientName} . {quote.createdAt?.slice(0, 10)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ background: status.bg, color: status.text, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{status.label}</span>
              <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
            </div>
          </div>
        </div>

        {/* Quote document */}
        <div style={{ margin: "16px 22px", background: COLORS.cream, borderRadius: 14, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
          {/* Business header */}
          <div style={{ background: COLORS.green, padding: "20px 22px" }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>GR GreenRoute</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 }}>Lawn &amp; Landscape Services</div>
          </div>

          <div style={{ padding: "18px 22px" }}>
            {/* Quote meta */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Prepared for</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal, marginTop: 3 }}>{quote.clientName || "-"}</div>
                {quote.clientEmail && <div style={{ fontSize: 12, color: COLORS.muted }}>{quote.clientEmail}</div>}
                {quote.clientAddress && <div style={{ fontSize: 12, color: COLORS.muted }}>{quote.clientAddress}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Quote</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal, marginTop: 3 }}>{quoteNumber(quote.id)}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>Date: {quote.createdAt?.slice(0, 10)}</div>
                {quote.validUntil && <div style={{ fontSize: 12, color: COLORS.muted }}>Valid until: {quote.validUntil}</div>}
              </div>
            </div>

            {/* Line items */}
            <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.border}`, marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, background: COLORS.green, padding: "8px 12px" }}>
                {["Service", "Qty", "Unit price", "Total"].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.4, textAlign: h !== "Service" ? "right" : "left" }}>{h}</div>
                ))}
              </div>
              {quote.lineItems.map((li, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, padding: "10px 12px", background: i % 2 === 0 ? COLORS.white : COLORS.cream, borderTop: `1px solid ${COLORS.border}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.charcoal }}>{li.label}</div>
                    {li.description && <div style={{ fontSize: 11, color: COLORS.muted }}>{li.description}</div>}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.slate, textAlign: "right", paddingLeft: 12 }}>{li.qty}</div>
                  <div style={{ fontSize: 13, color: COLORS.slate, textAlign: "right", paddingLeft: 12 }}>${li.price.toFixed(2)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.charcoal, textAlign: "right", paddingLeft: 12 }}>${(li.price * li.qty).toFixed(2)}</div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 24, fontSize: 13, color: COLORS.muted }}>
                <span>Subtotal</span><span style={{ minWidth: 70, textAlign: "right" }}>${quote.subtotal?.toFixed(2)}</span>
              </div>
              {quote.discount > 0 && (
                <div style={{ display: "flex", gap: 24, fontSize: 13, color: COLORS.amber }}>
                  <span>Discount</span><span style={{ minWidth: 70, textAlign: "right" }}>-${quote.discount?.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 24, fontSize: 16, fontWeight: 800, color: COLORS.green, borderTop: `2px solid ${COLORS.border}`, paddingTop: 8, marginTop: 4 }}>
                <span>Total</span><span style={{ minWidth: 70, textAlign: "right" }}>${quote.total?.toFixed(2)}</span>
              </div>
            </div>

            {/* Notes */}
            {quote.notes && (
              <div style={{ background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Notes</div>
                <div style={{ fontSize: 13, color: COLORS.slate, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{quote.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "0 22px" }}>
          {/* Send button */}
          <a href={mailto} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: COLORS.sky, color: "#fff", borderRadius: 12, padding: "14px",
            fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 10,
          }}>
            <span>Email</span> Send quote via email
          </a>

          {/* Copy plain text */}
          <button onClick={() => {
            const text = `${quoteNumber(quote.id)} - ${quote.clientName}\n\n` +
              quote.lineItems.map(li => `${li.label} x${li.qty} = $${(li.price * li.qty).toFixed(2)}`).join("\n") +
              `\n\nTotal: $${quote.total?.toFixed(2)}`;
            navigator.clipboard?.writeText(text);
          }} style={{ width: "100%", background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 12, padding: "11px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
            List Copy quote summary
          </button>

          {/* Status actions */}
          <div style={{ display: "flex", gap: 8 }}>
            {quote.status !== "accepted" && (
              <button onClick={() => { onUpdateStatus(quote.id, "accepted"); onClose(); }} style={{ flex: 1, background: COLORS.greenPale, color: COLORS.green, border: `1px solid ${COLORS.greenLight}`, borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Done Mark accepted</button>
            )}
            {quote.status !== "declined" && (
              <button onClick={() => { onUpdateStatus(quote.id, "declined"); onClose(); }} style={{ flex: 1, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>X Mark declined</button>
            )}
            {(quote.status === "accepted" || quote.status === "declined") && (
              <button onClick={() => { onUpdateStatus(quote.id, "draft"); onClose(); }} style={{ flex: 1, background: "#F3F4F6", color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>  Revert to draft</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Quote builder / editor modal
function QuoteEditorModal({ quote, clients, onSave, onClose }) {
  const isNew = !quote;
  const blank = {
    clientName: "", clientEmail: "", clientAddress: "",
    lineItems: [{ label: "", description: "", qty: 1, price: 0 }],
    discount: 0, notes: "", validUntil: fmt(addDays(today, 30)),
    status: "draft", createdAt: new Date().toISOString(),
  };
  const [form, setForm] = useState(quote ? { ...quote } : blank);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setItem = (i, k, v) => setForm(f => {
    const items = [...f.lineItems];
    items[i] = { ...items[i], [k]: k === "qty" || k === "price" ? parseFloat(v) || 0 : v };
    return { ...f, lineItems: items };
  });

  const addItem = (preset) => setForm(f => ({
    ...f,
    lineItems: [...f.lineItems, preset
      ? { label: preset.label, description: "", qty: 1, price: preset.defaultPrice }
      : { label: "", description: "", qty: 1, price: 0 }
    ],
  }));

  const removeItem = (i) => setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));

  const subtotal = form.lineItems.reduce((s, li) => s + (li.qty * li.price), 0);
  const total = Math.max(0, subtotal - (form.discount || 0));

  const handleSave = () => {
    onSave({ ...form, subtotal, total, id: quote?.id || Date.now() });
    onClose();
  };

  // Auto-fill from client
  const fillFromClient = (clientId) => {
    const c = clients.find(cl => cl.id === parseInt(clientId));
    if (!c) return;
    setForm(f => ({
      ...f,
      clientName: c.name,
      clientAddress: c.address,
      lineItems: c.services.map(s => {
        const preset = QUOTE_SERVICES.find(qs => qs.label === s);
        return { label: s, description: "", qty: 1, price: preset?.defaultPrice || 0 };
      }),
    }));
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "95vh", overflowY: "auto", paddingBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>

        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.charcoal }}>{isNew ? "New quote" : `Edit ${quoteNumber(quote.id)}`}</div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
        </div>

        <div style={{ padding: "18px 22px" }}>
          {/* Import from existing client */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Import from existing client</label>
            <select onChange={e => fillFromClient(e.target.value)} defaultValue=""
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">- Select client to autofill -</option>
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Client info */}
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Client details</div>
          {[
            ["Client / business name", "clientName", "text"],
            ["Email address", "clientEmail", "email"],
            ["Address", "clientAddress", "text"],
          ].map(([label, key, type]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input type={type} value={form[key]} onChange={e => setField(key, e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Valid until</label>
              <input type="date" value={form.validUntil} onChange={e => setField("validUntil", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Line items */}
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Services &amp; pricing</div>

          {form.lineItems.map((li, i) => (
            <div key={i} style={{ background: COLORS.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select value={li.label} onChange={e => {
                  const preset = QUOTE_SERVICES.find(s => s.label === e.target.value);
                  setItem(i, "label", e.target.value);
                  if (preset && preset.defaultPrice > 0) setItem(i, "price", preset.defaultPrice);
                }} style={{ flex: 1, border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: COLORS.white }}>
                  <option value="">- Select service -</option>
                  {QUOTE_SERVICES.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select>
                <button onClick={() => removeItem(i)} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>X</button>
              </div>
              <input placeholder="Description (optional)" value={li.description} onChange={e => setItem(i, "description", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box", background: COLORS.white }} />
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 10, color: COLORS.muted, marginBottom: 3 }}>Qty</label>
                  <input type="number" min="1" value={li.qty} onChange={e => setItem(i, "qty", e.target.value)}
                    style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: COLORS.white }} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ display: "block", fontSize: 10, color: COLORS.muted, marginBottom: 3 }}>Unit price ($)</label>
                  <input type="number" min="0" step="0.01" value={li.price} onChange={e => setItem(i, "price", e.target.value)}
                    style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: COLORS.white }} />
                </div>
                <div style={{ flex: 1.5, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <label style={{ display: "block", fontSize: 10, color: COLORS.muted, marginBottom: 3 }}>Line total</label>
                  <div style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: COLORS.green }}>${(li.qty * li.price).toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Add service buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
            <button onClick={() => addItem(null)} style={{ background: COLORS.green, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add service</button>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {QUOTE_SERVICES.slice(0, 5).map(s => (
                <button key={s.label} onClick={() => addItem(s)} style={{ background: COLORS.cream, color: COLORS.slate, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>+ {s.label}</button>
              ))}
            </div>
          </div>

          {/* Discount + Notes */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Discount ($)</label>
            <input type="number" min="0" value={form.discount} onChange={e => setField("discount", parseFloat(e.target.value) || 0)}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Notes / terms</label>
            <textarea value={form.notes} onChange={e => setField("notes", e.target.value)}
              rows={3} placeholder="Payment terms, special conditions, expiry notes..."
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
          </div>

          {/* Running total */}
          <div style={{ background: COLORS.greenPale, borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            {form.discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.amber, marginBottom: 4 }}>
                <span>Discount</span><span>-${form.discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: COLORS.green, borderTop: `1px solid ${COLORS.greenLight}`, paddingTop: 8, marginTop: 6 }}>
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>

          <button onClick={handleSave} style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {isNew ? "Create quote" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Quotes tab
function QuotesTab({ quotes, setQuotes, clients }) {
  const [showEditor, setShowEditor] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [previewQuote, setPreviewQuote] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const saveQuote = (q) => {
    setQuotes(prev => {
      const exists = prev.find(x => x.id === q.id);
      return exists ? prev.map(x => x.id === q.id ? q : x) : [...prev, q];
    });
  };

  const updateStatus = (id, status) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status } : q));
    setPreviewQuote(prev => prev?.id === id ? { ...prev, status } : prev);
  };

  const deleteQuote = (id) => {
    setQuotes(prev => prev.filter(q => q.id !== id));
    setPreviewQuote(null);
  };

  const filtered = filterStatus === "all" ? quotes : quotes.filter(q => q.status === filterStatus);
  const sorted = [...filtered].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const stats = {
    total: quotes.length,
    sent: quotes.filter(q => q.status === "sent").length,
    accepted: quotes.filter(q => q.status === "accepted").length,
    revenue: quotes.filter(q => q.status === "accepted").reduce((s, q) => s + (q.total || 0), 0),
  };

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Total", val: stats.total, color: COLORS.charcoal },
          { label: "Sent", val: stats.sent, color: COLORS.sky },
          { label: "Accepted", val: stats.accepted, color: COLORS.green },
          { label: "Won revenue", val: `$${stats.revenue.toLocaleString()}`, color: COLORS.green },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 3 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["all", "draft", "sent", "accepted", "declined"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
              background: filterStatus === s ? COLORS.green : "#F3F4F6",
              color: filterStatus === s ? "#fff" : COLORS.muted,
            }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        <button onClick={() => { setEditQuote(null); setShowEditor(true); }} style={{
          background: COLORS.green, color: "#fff", border: "none", borderRadius: 10,
          padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
        }}>+ New quote</button>
      </div>

      {/* Quote list */}
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "44px 20px", color: COLORS.muted }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>List</div>
          <div style={{ fontWeight: 700, color: COLORS.charcoal, marginBottom: 6 }}>No quotes yet</div>
          <div style={{ fontSize: 13 }}>Create your first quote to get started.</div>
        </div>
      )}

      {sorted.map(q => {
        const sm = STATUS_META[q.status] || STATUS_META.draft;
        return (
          <div key={q.id} onClick={() => setPreviewQuote(q)} style={{
            background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`,
            padding: "14px 16px", marginBottom: 9, cursor: "pointer",
            transition: "box-shadow 0.12s",
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.07)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal }}>{q.clientName || "Unnamed client"}</span>
                  <span style={{ background: sm.bg, color: sm.text, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{sm.label}</span>
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>{quoteNumber(q.id)} . {q.createdAt?.slice(0, 10)} {q.validUntil ? `. Valid until ${q.validUntil}` : ""}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {q.lineItems.slice(0, 3).map((li, i) => (
                    <span key={i} style={{ background: "#F3F4F6", color: COLORS.slate, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 500 }}>{li.label}</span>
                  ))}
                  {q.lineItems.length > 3 && <span style={{ color: COLORS.muted, fontSize: 10 }}>+{q.lineItems.length - 3} more</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.green }}>${q.total?.toFixed(0)}</div>
                <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>{q.lineItems.length} item{q.lineItems.length !== 1 ? "s" : ""}</div>
                <button onClick={e => { e.stopPropagation(); setEditQuote(q); setShowEditor(true); }} style={{
                  marginTop: 6, background: "#F3F4F6", border: "none", borderRadius: 7,
                  padding: "4px 10px", fontSize: 10, fontWeight: 600, color: COLORS.slate, cursor: "pointer",
                }}>Edit</button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Modals */}
      {showEditor && (
        <QuoteEditorModal
          quote={editQuote}
          clients={clients}
          onSave={saveQuote}
          onClose={() => { setShowEditor(false); setEditQuote(null); }}
        />
      )}
      {previewQuote && (
        <QuotePreviewModal
          quote={previewQuote}
          onClose={() => setPreviewQuote(null)}
          onUpdateStatus={updateStatus}
        />
      )}
    </div>
  );
}

// -- Crew View Tab (phone frame preview) -----------------------------------
function CrewViewTab({ employees }) {
  const [resetKey, setResetKey] = useState(0);

  const empList = [
    { id: 1, initials: "DR", name: "Diego",  color: COLORS.green },
    { id: 2, initials: "AT", name: "Aisha",  color: COLORS.sky },
    { id: 3, initials: "MW", name: "Marcus", color: COLORS.amber },
    { id: 4, initials: "PS", name: "Priya",  color: COLORS.soilLight },
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.charcoal, marginBottom: 4 }}>Crew app preview</div>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
          See exactly what your crew sees on their phones. Log in as any crew member using their PIN.
        </div>
      </div>

      {/* Reset + PIN hints */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {empList.map(e => (
            <span key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: COLORS.slate }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: e.color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 800 }}>{e.initials}</span>
              {e.name} <span style={{ color: COLORS.muted, fontFamily: "monospace" }}>{e.id}{e.id}{e.id}{e.id}</span>
            </span>
          ))}
        </div>
        <button onClick={() => setResetKey(k => k + 1)} style={{ background: "#F3F4F6", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: COLORS.slate, cursor: "pointer" }}>Reset Reset</button>
      </div>

      {/* Phone frame */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{
          width: 340,
          background: "#1a1a1a",
          borderRadius: 44,
          padding: "14px 8px",
          boxShadow: "0 28px 64px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.07)",
        }}>
          {/* Notch */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <div style={{ width: 110, height: 26, background: "#000", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#222", border: "1.5px solid #333" }} />
              <div style={{ width: 50, height: 7, borderRadius: 4, background: "#222" }} />
            </div>
          </div>
          {/* Screen */}
          <div style={{ borderRadius: 30, overflow: "hidden", height: 640, overflowY: "auto", background: "#fff" }}>
           <CrewApp key={resetKey} employees={employees} />
          </div>
          {/* Home bar */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <div style={{ width: 100, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.2)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// -- BACKFLOW TESTING MODULE ------------------------------------------------

const ASSEMBLY_TYPES = ["RP - Reduced Pressure", "DC - Double Check", "PVB - Pressure Vacuum Breaker", "SVB - Spill-Resistant Vacuum Breaker", "AVB - Atmospheric Vacuum Breaker"];
const ASSEMBLY_SIZES = ['3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '4"', '6"'];
const WATER_PURVEYORS = ["Portland Water Bureau", "Tualatin Valley Water", "Lake Oswego", "Tigard Water", "Beaverton Water", "Oregon City", "West Slope Water", "Oak Lodge Water", "Salem Water", "Other"];

const BF_STATUS = {
  pass:    { label: "Pass",    bg: COLORS.greenPale, text: COLORS.green,   icon: "Done" },
  fail:    { label: "Fail",    bg: "#FEF2F2",        text: "#DC2626",       icon: "X" },
  pending: { label: "Due",     bg: "#FEF3C7",        text: "#D97706",       icon: "Due" },
  overdue: { label: "Overdue", bg: "#FEE2E2",        text: "#DC2626",       icon: "!" },
};

function bfReportNumber(id) {
  return "BF-" + String(id).padStart(5, "0");
}

function nextTestDue(testDate) {
  if (!testDate) return null;
  const d = new Date(testDate);
  d.setFullYear(d.getFullYear() + 1);
  return fmt(d);
}

function assemblyStatus(assembly, tests) {
  const lastTest = tests.filter(t => t.assemblyId === assembly.id).sort((a, b) => b.testDate.localeCompare(a.testDate))[0];
  if (!lastTest) return "pending";
  const due = nextTestDue(lastTest.testDate);
  if (!due) return "pending";
  const today_ = fmt(today);
  if (due < today_) return "overdue";
  const warn = fmt(addDays(today, -30));
  if (due <= fmt(addDays(today, 30))) return "pending";
  return lastTest.result === "pass" ? "pass" : "fail";
}

// -- Backflow Test Report Modal --------------------------------------------
function BackflowTestModal({ assembly, existingTest, testerInfo, onSave, onClose }) {
  const isNew = !existingTest;
  const blank = {
    testDate: fmt(today),
    testerCertNum: testerInfo?.certNumber || "",
    testerName: testerInfo?.name || "",
    gaugeMake: testerInfo?.gaugeMake || "",
    gaugeSerial: testerInfo?.gaugeSerial || "",
    gaugeCalDate: testerInfo?.gaugeCalDate || "",
    // RP readings
    rv_opened: "", chk1_held: "", chk1_leaked: false, chk2_held: "", chk2_leaked: false,
    // DC readings
    chk1_dc: "", chk2_dc: "",
    // PVB/SVB readings
    ag_opened: "", chk_pvb: "",
    result: "pass", repairsMade: false, repairNotes: "", notes: "",
    waterPurveyor: assembly.waterPurveyor || "",
    submittedToPurveyor: false, submittedDate: "",
  };
  const [form, setForm] = useState(existingTest ? { ...existingTest } : blank);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const aType = assembly.assemblyType || "";
  const isRP = aType.startsWith("RP");
  const isDC = aType.startsWith("DC");
  const isPVB = aType.startsWith("PVB") || aType.startsWith("SVB");

  const buildMailto = () => {
    const subj = encodeURIComponent(`Backflow Test Report ${bfReportNumber(form.id || Date.now())} - ${assembly.locationName}`);
    const body = encodeURIComponent([
      `BACKFLOW ASSEMBLY TEST REPORT`,
      `Report #: ${bfReportNumber(form.id || Date.now())}`,
      `Date: ${form.testDate}`,
      ``,
      `PROPERTY`,
      `Location: ${assembly.locationName}`,
      `Address: ${assembly.address}`,
      `Water Purveyor: ${form.waterPurveyor}`,
      ``,
      `ASSEMBLY`,
      `Type: ${assembly.assemblyType}`,
      `Make/Model: ${assembly.make} ${assembly.model}`,
      `Serial #: ${assembly.serialNumber}`,
      `Size: ${assembly.size}`,
      ``,
      `TESTER`,
      `Name: ${form.testerName}`,
      `OHA Cert #: ${form.testerCertNum}`,
      `Gauge: ${form.gaugeMake} S/N ${form.gaugeSerial}`,
      `Gauge Calibration Date: ${form.gaugeCalDate}`,
      ``,
      `TEST RESULTS: ${form.result?.toUpperCase()}`,
      isRP ? `RV Opened At: ${form.rv_opened} psid` : "",
      isRP ? `Check Valve 1: ${form.chk1_held} psid${form.chk1_leaked ? " (LEAKED)" : ""}` : "",
      isRP ? `Check Valve 2: ${form.chk2_held} psid${form.chk2_leaked ? " (LEAKED)" : ""}` : "",
      isDC ? `Check Valve 1: ${form.chk1_dc} psid` : "",
      isDC ? `Check Valve 2: ${form.chk2_dc} psid` : "",
      isPVB ? `Air Gap Opened At: ${form.ag_opened} psid` : "",
      isPVB ? `Check Valve: ${form.chk_pvb} psid` : "",
      form.repairsMade ? `Repairs Made: ${form.repairNotes}` : "",
      form.notes ? `Notes: ${form.notes}` : "",
    ].filter(Boolean).join("\n"));
    return `mailto:?subject=${subj}&body=${body}`;
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "95vh", overflowY: "auto", paddingBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.charcoal }}>{isNew ? "New test report" : "Edit test report"}</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{assembly.locationName} . {assembly.assemblyType}</div>
          </div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
        </div>

        <div style={{ padding: "16px 22px" }}>
          {/* Test date + purveyor */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Test date</label>
              <input type="date" value={form.testDate} onChange={e => setF("testDate", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Water purveyor</label>
              <select value={form.waterPurveyor} onChange={e => setF("waterPurveyor", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
                <option value="">- Select -</option>
                {WATER_PURVEYORS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Tester credentials */}
          <div style={{ background: "#EFF6FF", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.sky, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Tester credentials (OAR 333-061-0072)</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Tester name</label>
                <input value={form.testerName} onChange={e => setF("testerName", e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>OHA Cert #</label>
                <input value={form.testerCertNum} onChange={e => setF("testerCertNum", e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Gauge make / serial</label>
                <input value={form.gaugeMake} onChange={e => setF("gaugeMake", e.target.value)} placeholder="Make & S/N"
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Gauge cal. date</label>
                <input type="date" value={form.gaugeCalDate} onChange={e => setF("gaugeCalDate", e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>

          {/* Test readings - RP */}
          {isRP && (
            <div style={{ background: COLORS.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>RP test readings (psid)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["RV opened at", "rv_opened"], ["Check valve 1 held at", "chk1_held"], ["Check valve 2 held at", "chk2_held"]].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
                    <input type="number" step="0.1" value={form[key]} onChange={e => setF(key, e.target.value)} placeholder="0.0"
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                {[["chk1_leaked", "Check 1 leaked"], ["chk2_leaked", "Check 2 leaked"]].map(([key, label]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: COLORS.slate }}>
                    <input type="checkbox" checked={form[key]} onChange={e => setF(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* DC readings */}
          {isDC && (
            <div style={{ background: COLORS.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>DC test readings (psid)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["Check valve 1", "chk1_dc"], ["Check valve 2", "chk2_dc"]].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
                    <input type="number" step="0.1" value={form[key]} onChange={e => setF(key, e.target.value)} placeholder="0.0"
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PVB/SVB readings */}
          {isPVB && (
            <div style={{ background: COLORS.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>PVB/SVB test readings (psid)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["Air gap opened at", "ag_opened"], ["Check valve held at", "chk_pvb"]].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
                    <input type="number" step="0.1" value={form[key]} onChange={e => setF(key, e.target.value)} placeholder="0.0"
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pass / Fail */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {["pass", "fail"].map(r => (
              <button key={r} onClick={() => setF("result", r)} style={{
                flex: 1, padding: "13px", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit",
                fontWeight: 800, fontSize: 15,
                background: form.result === r ? (r === "pass" ? COLORS.green : "#DC2626") : "#F3F4F6",
                color: form.result === r ? "#fff" : COLORS.muted,
              }}>{r === "pass" ? "Done Pass" : "X Fail"}</button>
            ))}
          </div>

          {/* Repairs */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: form.repairsMade ? 8 : 14, fontSize: 13, color: COLORS.slate }}>
            <input type="checkbox" checked={form.repairsMade} onChange={e => setF("repairsMade", e.target.checked)} />
            Repairs made during test
          </label>
          {form.repairsMade && (
            <textarea value={form.repairNotes} onChange={e => setF("repairNotes", e.target.value)}
              rows={2} placeholder="Describe repairs made..."
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", marginBottom: 14, boxSizing: "border-box" }} />
          )}

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Additional notes</label>
            <textarea value={form.notes} onChange={e => setF("notes", e.target.value)} rows={2} placeholder="Any observations..."
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          {/* Submitted to purveyor */}
          <div style={{ background: "#FFF7ED", borderRadius: 12, padding: "12px 14px", marginBottom: 18, border: `1px solid ${COLORS.amberLight}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.amber, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Purveyor submission (required within 10 days)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: COLORS.slate, marginBottom: form.submittedToPurveyor ? 8 : 0 }}>
              <input type="checkbox" checked={form.submittedToPurveyor} onChange={e => setF("submittedToPurveyor", e.target.checked)} />
              Report submitted to water purveyor
            </label>
            {form.submittedToPurveyor && (
              <div>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4, marginTop: 4 }}>Submission date</label>
                <input type="date" value={form.submittedDate} onChange={e => setF("submittedDate", e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => { onSave({ ...form, assemblyId: assembly.id, id: existingTest?.id || Date.now() }); onClose(); }}
              style={{ flex: 2, background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Save test report
            </button>
            <a href={buildMailto()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: COLORS.sky, color: "#fff", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Email Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Assembly Edit Modal ----------------------------------------------------
function AssemblyModal({ assembly, clients, onSave, onClose }) {
  const isNew = !assembly;
  const blank = { locationName: "", address: "", clientId: null, waterPurveyor: "", assemblyType: ASSEMBLY_TYPES[0], make: "", model: "", serialNumber: "", size: ASSEMBLY_SIZES[0], installDate: "", hazardLevel: "high", locationDescription: "" };
  const [form, setForm] = useState(assembly ? { ...assembly } : blank);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fillFromClient = (id) => {
    const c = clients.find(cl => cl.id === parseInt(id));
    if (!c) return;
    setF("locationName", c.name);
    setF("address", c.address);
    setF("clientId", c.id);
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "95vh", overflowY: "auto", paddingBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.charcoal }}>{isNew ? "Add assembly" : "Edit assembly"}</div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
        </div>

        <div style={{ padding: "16px 22px" }}>
          {/* Link to existing client */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Import from client</label>
            <select onChange={e => fillFromClient(e.target.value)} defaultValue=""
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">- Autofill from existing client -</option>
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Location */}
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Location</div>
          {[["Property / location name", "locationName"], ["Service address", "address"], ["Location description (e.g. backyard, meter room)", "locationDescription"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input value={form[key] || ""} onChange={e => setF(key, e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Water purveyor</label>
            <select value={form.waterPurveyor} onChange={e => setF("waterPurveyor", e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">- Select purveyor -</option>
              {WATER_PURVEYORS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          {/* Assembly details */}
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>Assembly details</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Assembly type</label>
            <select value={form.assemblyType} onChange={e => setF("assemblyType", e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
              {ASSEMBLY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Size</label>
              <select value={form.size} onChange={e => setF("size", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
                {ASSEMBLY_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Hazard level</label>
              <select value={form.hazardLevel} onChange={e => setF("hazardLevel", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
                <option value="high">High hazard</option>
                <option value="low">Low hazard</option>
              </select>
            </div>
          </div>
          {[["Make", "make"], ["Model", "model"], ["Serial number", "serialNumber"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input value={form[key] || ""} onChange={e => setF(key, e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Install date</label>
            <input type="date" value={form.installDate || ""} onChange={e => setF("installDate", e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <button onClick={() => { onSave({ ...form, id: assembly?.id || Date.now() }); onClose(); }}
            style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {isNew ? "Add assembly" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Main Backflow Tab ------------------------------------------------------
function BackflowTab({ assemblies, setAssemblies, bfTests, setBfTests, clients, testerInfo, setTesterInfo }) {
  const [view, setView] = useState("dashboard"); // dashboard | assemblies | tests | settings
  const [showAssemblyModal, setShowAssemblyModal] = useState(false);
  const [editAssembly, setEditAssembly] = useState(null);
  const [testModal, setTestModal] = useState(null); // { assembly, test? }
  const [filterStatus, setFilterStatus] = useState("all");
  const [showTesterSettings, setShowTesterSettings] = useState(false);
  const [tForm, setTForm] = useState(testerInfo);

  const saveAssembly = (a) => {
    setAssemblies(prev => {
      const exists = prev.find(x => x.id === a.id);
      return exists ? prev.map(x => x.id === a.id ? a : x) : [...prev, a];
    });
  };

  const saveTest = (t) => {
    setBfTests(prev => {
      const exists = prev.find(x => x.id === t.id);
      return exists ? prev.map(x => x.id === t.id ? t : x) : [...prev, t];
    });
    // mark sent if submitted
    if (t.submittedToPurveyor) {
      setBfTests(prev => prev.map(x => x.id === t.id ? { ...x, submittedToPurveyor: true } : x));
    }
  };

  const getLastTest = (assemblyId) => {
    return bfTests.filter(t => t.assemblyId === assemblyId).sort((a, b) => b.testDate.localeCompare(a.testDate))[0];
  };

  // Stats
  const overdueCount = assemblies.filter(a => assemblyStatus(a, bfTests) === "overdue").length;
  const dueCount = assemblies.filter(a => assemblyStatus(a, bfTests) === "pending").length;
  const passCount = assemblies.filter(a => assemblyStatus(a, bfTests) === "pass").length;
  const unsubmittedTests = bfTests.filter(t => !t.submittedToPurveyor);

  const filteredAssemblies = filterStatus === "all" ? assemblies
    : assemblies.filter(a => assemblyStatus(a, bfTests) === filterStatus);

  const NavBtn = ({ id, label, icon }) => (
    <button onClick={() => setView(id)} style={{
      flex: 1, padding: "8px 4px", border: "none", background: "transparent", cursor: "pointer",
      color: view === id ? COLORS.sky : COLORS.muted,
      borderBottom: view === id ? `2px solid ${COLORS.sky}` : "2px solid transparent",
      fontSize: 11, fontWeight: view === id ? 700 : 500, fontFamily: "inherit",
    }}>
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div>{label}</div>
    </button>
  );

  return (
    <div>
      {/* Sub-nav */}
      <div style={{ display: "flex", background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}`, marginBottom: 14, overflow: "hidden" }}>
        <NavBtn id="dashboard" label="Dashboard" icon="*" />
        <NavBtn id="assemblies" label="Assemblies" icon="Fix" />
        <NavBtn id="tests" label="Test log" icon="Note" />
        <NavBtn id="settings" label="My cert" icon="Cert" />
      </div>

      {/* -- DASHBOARD -- */}
      {view === "dashboard" && (
        <div>
          {/* Alert banners */}
          {overdueCount > 0 && (
            <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>!!</span>
              <div>
                <div style={{ fontWeight: 700, color: "#DC2626", fontSize: 13 }}>{overdueCount} assembly{overdueCount > 1 ? " is" : " is"} overdue</div>
                <div style={{ fontSize: 11, color: "#DC2626", opacity: 0.8 }}>Annual test required by OAR 333-061 - schedule immediately</div>
              </div>
            </div>
          )}
          {unsubmittedTests.length > 0 && (
            <div style={{ background: "#FFF7ED", border: `1.5px solid ${COLORS.amberLight}`, borderRadius: 12, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>Due</span>
              <div>
                <div style={{ fontWeight: 700, color: COLORS.amber, fontSize: 13 }}>{unsubmittedTests.length} report{unsubmittedTests.length > 1 ? "s" : ""} not yet submitted to purveyor</div>
                <div style={{ fontSize: 11, color: COLORS.amber, opacity: 0.85 }}>Required within 10 working days of test date</div>
              </div>
            </div>
          )}
          {!testerInfo.certNumber && (
            <div style={{ background: "#EFF6FF", border: `1.5px solid ${COLORS.skyLight}`, borderRadius: 12, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("settings")}>
              <span style={{ fontSize: 20 }}>Cert</span>
              <div>
                <div style={{ fontWeight: 700, color: COLORS.sky, fontSize: 13 }}>Add your OHA certification info</div>
                <div style={{ fontSize: 11, color: COLORS.sky, opacity: 0.85 }}>Pre-fills test reports automatically</div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Total assemblies", val: assemblies.length, color: COLORS.charcoal, icon: "Fix" },
              { label: "Tests this year", val: bfTests.filter(t => t.testDate?.startsWith(new Date().getFullYear())).length, color: COLORS.sky, icon: "Note" },
              { label: "Overdue", val: overdueCount, color: overdueCount > 0 ? "#DC2626" : COLORS.muted, icon: "!!" },
              { label: "Due soon (30 days)", val: dueCount, color: dueCount > 0 ? COLORS.amber : COLORS.muted, icon: "Due" },
            ].map(s => (
              <div key={s.label} style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Upcoming tests */}
          <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal, marginBottom: 10 }}>Needs attention</div>
          {assemblies.filter(a => ["overdue", "pending"].includes(assemblyStatus(a, bfTests))).length === 0 && (
            <div style={{ textAlign: "center", padding: "24px", color: COLORS.muted, fontSize: 13, background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}` }}>
              Done All assemblies are current
            </div>
          )}
          {assemblies.filter(a => ["overdue", "pending"].includes(assemblyStatus(a, bfTests))).map(a => {
            const st = assemblyStatus(a, bfTests);
            const sm = BF_STATUS[st];
            const last = getLastTest(a.id);
            const due = last ? nextTestDue(last.testDate) : "Never tested";
            return (
              <div key={a.id} onClick={() => setTestModal({ assembly: a })} style={{ background: COLORS.white, borderRadius: 12, border: `1.5px solid ${st === "overdue" ? "#FECACA" : COLORS.amberLight}`, padding: "12px 16px", marginBottom: 8, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal }}>{a.locationName}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{a.assemblyType} . {a.size} . S/N {a.serialNumber || "-"}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>{a.waterPurveyor || "Purveyor not set"}</div>
                    <div style={{ fontSize: 11, color: st === "overdue" ? "#DC2626" : COLORS.amber, fontWeight: 600, marginTop: 4 }}>Due: {due}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span style={{ background: sm.bg, color: sm.text, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{sm.icon} {sm.label}</span>
                    <span style={{ fontSize: 11, color: COLORS.sky, fontWeight: 600 }}>+ Record test</span>
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={() => { setEditAssembly(null); setShowAssemblyModal(true); }} style={{ width: "100%", marginTop: 10, background: COLORS.sky, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            + Add backflow assembly
          </button>
        </div>
      )}

      {/* -- ASSEMBLIES LIST -- */}
      {view === "assemblies" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {["all", "pass", "pending", "overdue", "fail"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "4px 11px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: filterStatus === s ? COLORS.sky : "#F3F4F6", color: filterStatus === s ? "#fff" : COLORS.muted }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={() => { setEditAssembly(null); setShowAssemblyModal(true); }} style={{ background: COLORS.sky, color: "#fff", border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add</button>
          </div>

          {filteredAssemblies.length === 0 && (
            <div style={{ textAlign: "center", padding: "44px 20px", color: COLORS.muted }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>Fix</div>
              <div style={{ fontWeight: 700, color: COLORS.charcoal, marginBottom: 6 }}>No assemblies yet</div>
              <div style={{ fontSize: 13 }}>Add your first backflow assembly to get started.</div>
            </div>
          )}

          {filteredAssemblies.map(a => {
            const st = assemblyStatus(a, bfTests);
            const sm = BF_STATUS[st];
            const last = getLastTest(a.id);
            return (
              <div key={a.id} style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "14px 16px", marginBottom: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal }}>{a.locationName}</span>
                      <span style={{ background: sm.bg, color: sm.text, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{sm.icon} {sm.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{a.assemblyType} . {a.size} . {a.make} {a.model}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>S/N: {a.serialNumber || "-"} . {a.waterPurveyor || "-"}</div>
                    {a.locationDescription && <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 2, fontStyle: "italic" }}>{a.locationDescription}</div>}
                    {last && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 3 }}>Last tested: {last.testDate} . Next due: {nextTestDue(last.testDate)}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setTestModal({ assembly: a })} style={{ background: COLORS.sky, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Test</button>
                    <button onClick={() => { setEditAssembly(a); setShowAssemblyModal(true); }} style={{ background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* -- TEST LOG -- */}
      {view === "tests" && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal, marginBottom: 12 }}>All test reports ({bfTests.length})</div>
          {bfTests.length === 0 && (
            <div style={{ textAlign: "center", padding: "44px 20px", color: COLORS.muted }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>Note</div>
              <div style={{ fontWeight: 700, color: COLORS.charcoal, marginBottom: 6 }}>No tests recorded yet</div>
              <div style={{ fontSize: 13 }}>Record a test from an assembly card.</div>
            </div>
          )}
          {[...bfTests].sort((a, b) => b.testDate.localeCompare(a.testDate)).map(t => {
            const assembly = assemblies.find(a => a.id === t.assemblyId);
            const passed = t.result === "pass";
            return (
              <div key={t.id} style={{ background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: "12px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal }}>{assembly?.locationName || "Unknown"}</span>
                      <span style={{ background: passed ? COLORS.greenPale : "#FEF2F2", color: passed ? COLORS.green : "#DC2626", borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{passed ? "Done Pass" : "X Fail"}</span>
                      {!t.submittedToPurveyor && <span style={{ background: "#FFF7ED", color: COLORS.amber, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>Not submitted</span>}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{bfReportNumber(t.id)} . {t.testDate} . Cert #{t.testerCertNum || "-"}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{assembly?.assemblyType} . {assembly?.waterPurveyor || "-"}</div>
                    {t.repairsMade && <div style={{ fontSize: 11, color: COLORS.amber, marginTop: 2 }}>Fix Repairs: {t.repairNotes}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                    <button onClick={() => assembly && setTestModal({ assembly, test: t })} style={{ background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                    {!t.submittedToPurveyor && (
                      <button onClick={() => setBfTests(prev => prev.map(x => x.id === t.id ? { ...x, submittedToPurveyor: true, submittedDate: fmt(today) } : x))}
                        style={{ background: COLORS.greenPale, color: COLORS.green, border: "none", borderRadius: 8, padding: "5px 11px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Done Submitted</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* -- TESTER CERT SETTINGS -- */}
      {view === "settings" && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal, marginBottom: 4 }}>Your OHA certification</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 16, lineHeight: 1.5 }}>
            This info pre-fills every test report you create. OHA certifications expire every 2 years - keep your expiry date updated.
          </div>

          {[
            ["Full name", "name", "text"],
            ["OHA Cert #", "certNumber", "text"],
            ["LCB / CCB license #", "licenseNumber", "text"],
          ].map(([label, key, type]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input type={type} value={tForm[key] || ""} onChange={e => setTForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Cert expiry date</label>
              <input type="date" value={tForm.certExpiry || ""} onChange={e => setTForm(f => ({ ...f, certExpiry: e.target.value }))}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 6 }}>Test gauge</div>
          {[["Gauge make / model", "gaugeMake"], ["Gauge serial #", "gaugeSerial"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input value={tForm[key] || ""} onChange={e => setTForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Last gauge calibration date</label>
            <input type="date" value={tForm.gaugeCalDate || ""} onChange={e => setTForm(f => ({ ...f, gaugeCalDate: e.target.value }))}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          {/* Cert expiry warning */}
          {tForm.certExpiry && (() => {
            const daysLeft = Math.ceil((new Date(tForm.certExpiry) - today) / 86400000);
            if (daysLeft < 0) return (
              <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: "#DC2626", fontSize: 13 }}>! Certification expired!</div>
                <div style={{ fontSize: 12, color: "#DC2626" }}>Expired {Math.abs(daysLeft)} days ago. You cannot legally test in Oregon with an expired cert.</div>
              </div>
            );
            if (daysLeft < 90) return (
              <div style={{ background: "#FFF7ED", border: `1.5px solid ${COLORS.amberLight}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: COLORS.amber, fontSize: 13 }}>Due Cert expiring in {daysLeft} days</div>
                <div style={{ fontSize: 12, color: COLORS.amber }}>OHA renewal applications are mailed in October. Combo renewal fee: $305.</div>
              </div>
            );
            return <div style={{ background: COLORS.greenPale, borderRadius: 12, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: COLORS.green, fontWeight: 600 }}>Done Cert valid . {daysLeft} days remaining</div>;
          })()}

          <button onClick={() => { setTesterInfo(tForm); localStorage.setItem('testerInfo', JSON.stringify(tForm)); }}
            style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Save certification info
          </button>
          <div style={{ fontSize: 11, color: COLORS.muted, textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
            Oregon OHA certifications renew every 2 years.<br />
            Certification info: <a href="https://www.oregon.gov/oha/ph/healthyenvironments/drinkingwater/crossconnection/certification/pages/index.aspx" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.sky }}>oregon.gov/oha</a>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAssemblyModal && (
        <AssemblyModal assembly={editAssembly} clients={clients} onSave={saveAssembly} onClose={() => { setShowAssemblyModal(false); setEditAssembly(null); }} />
      )}
      {testModal && (
        <BackflowTestModal assembly={testModal.assembly} existingTest={testModal.test || null} testerInfo={testerInfo} onSave={saveTest} onClose={() => setTestModal(null)} />
      )}
    </div>
  );
}

// -- PROJECTS MODULE --------------------------------------------------------

const PROJECT_STATUSES = {
  planning:    { label: "Planning",    bg: "#EFF6FF", text: "#1E88E5",  icon: "Ruler" },
  active:      { label: "Active",      bg: "#ECFDF5", text: "#059669",  icon: "Build" },
  on_hold:     { label: "On hold",     bg: "#FEF3C7", text: "#D97706",  icon: "||" },
  completed:   { label: "Completed",   bg: COLORS.greenPale, text: COLORS.green, icon: "Done" },
  cancelled:   { label: "Cancelled",   bg: "#F3F4F6", text: COLORS.muted, icon: "X" },
};

const EXPENSE_CATS = ["Materials", "Equipment rental", "Dump fees", "Fuel", "Permits", "Subcontractor", "Other"];
const TASK_STATUSES = ["todo", "in_progress", "done"];

function projectNumber(id) { return "PRJ-" + String(id).padStart(4, "0"); }
function pctComplete(tasks) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter(t => t.status === "done").length / tasks.length) * 100);
}
function projectMargin(project) {
  const revenue = project.contractValue || 0;
  const laborCost = (project.laborHours || 0) * (project.laborRate || 0);
  const expenses = (project.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const subCost = (project.subcontractors || []).reduce((s, sc) => s + (sc.amount || 0), 0);
  const totalCost = laborCost + expenses + subCost;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
  return { revenue, totalCost, laborCost, expenses: expenses + subCost, profit, margin };
}

// -- Project Detail View ----------------------------------------------------
function ProjectDetail({ project, employees, clients, onUpdate, onBack }) {
  const [activeSection, setActiveSection] = useState("overview");
  const [editingTask, setEditingTask] = useState(null);
  const [newTask, setNewTask] = useState("");
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingSub, setEditingSub] = useState(null);

  const fin = projectMargin(project);
  const pct = pctComplete(project.tasks);
  const sm = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.planning;

  const updateProject = (patch) => onUpdate({ ...project, ...patch });

  // -- Tasks --
  const addTask = () => {
    if (!newTask.trim()) return;
    const task = { id: Date.now(), title: newTask.trim(), status: "todo", assigneeId: null, dueDate: "", notes: "" };
    updateProject({ tasks: [...(project.tasks || []), task] });
    setNewTask("");
  };
  const updateTask = (id, patch) => updateProject({ tasks: (project.tasks || []).map(t => t.id === id ? { ...t, ...patch } : t) });
  const removeTask = (id) => updateProject({ tasks: (project.tasks || []).filter(t => t.id !== id) });
  const cycleTaskStatus = (id) => {
    const t = (project.tasks || []).find(t => t.id === id);
    const next = { todo: "in_progress", in_progress: "done", done: "todo" };
    updateTask(id, { status: next[t.status] });
  };

  // -- Expenses --
  const blankExp = { id: null, description: "", category: EXPENSE_CATS[0], amount: "", date: fmt(today), vendor: "", receipt: false };
  const [expForm, setExpForm] = useState(blankExp);
  const saveExpense = () => {
    if (!expForm.description || !expForm.amount) return;
    const exp = { ...expForm, id: expForm.id || Date.now(), amount: parseFloat(expForm.amount) };
    const existing = (project.expenses || []).find(e => e.id === exp.id);
    updateProject({ expenses: existing ? (project.expenses || []).map(e => e.id === exp.id ? exp : e) : [...(project.expenses || []), exp] });
    setExpForm(blankExp); setEditingExpense(null);
  };

  // -- Subcontractors --
  const blankSub = { id: null, name: "", trade: "", phone: "", email: "", amount: "", status: "pending", notes: "" };
  const [subForm, setSubForm] = useState(blankSub);
  const saveSub = () => {
    if (!subForm.name) return;
    const sub = { ...subForm, id: subForm.id || Date.now(), amount: parseFloat(subForm.amount) || 0 };
    const existing = (project.subcontractors || []).find(s => s.id === sub.id);
    updateProject({ subcontractors: existing ? (project.subcontractors || []).map(s => s.id === sub.id ? sub : s) : [...(project.subcontractors || []), sub] });
    setSubForm(blankSub); setEditingSub(null);
  };

  const sections = [
    { id: "overview", label: "Overview", icon: "Stats" },
    { id: "tasks",    label: `Tasks (${(project.tasks||[]).length})`, icon: "Done" },
    { id: "expenses", label: `Expenses`, icon: "$" },
    { id: "subs",     label: `Subs`, icon: "Sub" },
    { id: "files",    label: "Notes", icon: "Note" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.cream, fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ background: COLORS.green, padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>Prev</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{projectNumber(project.id)} . {project.clientName || "No client"}</div>
          </div>
          <span style={{ background: sm.bg, color: sm.text, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{sm.icon} {sm.label}</span>
        </div>
        {/* Progress bar */}
        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 99, height: 6, marginBottom: 2 }}>
          <div style={{ width: `${pct}%`, background: COLORS.greenLight, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, textAlign: "right", paddingBottom: 10 }}>{pct}% complete</div>
        {/* Sub-nav */}
        <div style={{ display: "flex", overflowX: "auto", gap: 0 }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", flexShrink: 0,
              color: activeSection === s.id ? "#fff" : "rgba(255,255,255,0.5)",
              borderBottom: activeSection === s.id ? "2px solid rgba(255,255,255,0.9)" : "2px solid transparent",
              fontSize: 11, fontWeight: activeSection === s.id ? 700 : 500, fontFamily: "inherit",
            }}>{s.icon} {s.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 14px 40px" }}>
        {/* -- OVERVIEW -- */}
        {activeSection === "overview" && (
          <div>
            {/* Financial summary */}
            <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Financial summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {[
                  { label: "Contract value", val: `$${fin.revenue.toLocaleString()}`, color: COLORS.green },
                  { label: "Total cost", val: `$${fin.totalCost.toLocaleString()}`, color: COLORS.amber },
                  { label: "Gross profit", val: `$${fin.profit.toLocaleString()}`, color: fin.profit >= 0 ? COLORS.green : "#DC2626" },
                  { label: "Margin", val: `${fin.margin}%`, color: fin.margin >= 30 ? COLORS.green : fin.margin >= 15 ? COLORS.amber : "#DC2626" },
                ].map(item => (
                  <div key={item.label} style={{ background: COLORS.cream, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: item.color, marginTop: 3 }}>{item.val}</div>
                  </div>
                ))}
              </div>
              {/* Cost breakdown bar */}
              {fin.totalCost > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>Cost breakdown</div>
                  <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 10 }}>
                    {[
                      { val: fin.laborCost, color: COLORS.sky, label: "Labor" },
                      { val: (project.expenses||[]).reduce((s,e)=>s+(e.amount||0),0), color: COLORS.amber, label: "Materials/misc" },
                      { val: (project.subcontractors||[]).reduce((s,sc)=>s+(sc.amount||0),0), color: COLORS.soilLight, label: "Subs" },
                    ].filter(b => b.val > 0).map(b => (
                      <div key={b.label} title={`${b.label}: $${b.val.toFixed(0)}`} style={{ flex: b.val, background: b.color, minWidth: 4 }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                    {[
                      { label: "Labor", val: fin.laborCost, color: COLORS.sky },
                      { label: "Materials/misc", val: (project.expenses||[]).reduce((s,e)=>s+(e.amount||0),0), color: COLORS.amber },
                      { label: "Subcontractors", val: (project.subcontractors||[]).reduce((s,sc)=>s+(sc.amount||0),0), color: COLORS.soilLight },
                    ].map(b => (
                      <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }} />
                        <span style={{ color: COLORS.muted }}>{b.label}: <strong style={{ color: COLORS.charcoal }}>${b.val.toLocaleString()}</strong></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Project info */}
            <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Project details</div>
              {[
                ["Client", project.clientName || "-"],
                ["Address", project.address || "-"],
                ["Start date", project.startDate || "-"],
                ["Target completion", project.endDate || "-"],
                ["Contract value", `$${(project.contractValue || 0).toLocaleString()}`],
                ["Labor hours budgeted", `${project.budgetedHours || 0} hrs`],
                ["Labor rate", `$${project.laborRate || 0}/hr`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                  <span style={{ fontSize: 13, color: COLORS.muted }}>{k}</span>
                  <span style={{ fontSize: 13, color: COLORS.charcoal, fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Status changer */}
            <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Update status</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {Object.entries(PROJECT_STATUSES).map(([key, s]) => (
                  <button key={key} onClick={() => updateProject({ status: key })} style={{
                    padding: "7px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                    background: project.status === key ? s.text : "#F3F4F6",
                    color: project.status === key ? "#fff" : COLORS.muted,
                  }}>{s.icon} {s.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* -- TASKS -- */}
        {activeSection === "tasks" && (
          <div>
            {/* Add task */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input value={newTask} onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTask()}
                placeholder="Add a task..."
                style={{ flex: 1, border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
              <button onClick={addTask} style={{ background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>+</button>
            </div>

            {/* Group by status */}
            {["todo", "in_progress", "done"].map(st => {
              const tasks = (project.tasks || []).filter(t => t.status === st);
              if (!tasks.length) return null;
              const stLabel = { todo: "To do", in_progress: "In progress", done: "Done" };
              const stColor = { todo: COLORS.muted, in_progress: COLORS.sky, done: COLORS.green };
              return (
                <div key={st} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: stColor[st], textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{stLabel[st]} . {tasks.length}</div>
                  {tasks.map(t => {
                    const assignee = employees.find(e => e.id === t.assigneeId);
                    return (
                      <div key={t.id} style={{ background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <button onClick={() => cycleTaskStatus(t.id)} style={{
                          width: 22, height: 22, borderRadius: "50%", border: `2px solid ${stColor[st]}`,
                          background: st === "done" ? COLORS.green : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0, marginTop: 1, color: "#fff", fontSize: 12,
                        }}>{st === "done" ? "Done" : ""}</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: st === "done" ? COLORS.muted : COLORS.charcoal, textDecoration: st === "done" ? "line-through" : "none" }}>{t.title}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            {assignee && <span style={{ fontSize: 10, color: COLORS.muted }}>User {assignee.name.split(" ")[0]}</span>}
                            {t.dueDate && <span style={{ fontSize: 10, color: COLORS.muted }}>Cal {t.dueDate}</span>}
                            {t.notes && <span style={{ fontSize: 10, color: COLORS.muted, fontStyle: "italic" }}>{t.notes.slice(0, 40)}{t.notes.length > 40 ? "..." : ""}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                          <button onClick={() => setEditingTask(t)} style={{ background: "#F3F4F6", border: "none", borderRadius: 7, padding: "4px 9px", fontSize: 11, cursor: "pointer", color: COLORS.slate }}>Edit</button>
                          <button onClick={() => removeTask(t.id)} style={{ background: "#FEF2F2", border: "none", borderRadius: 7, padding: "4px 9px", fontSize: 11, cursor: "pointer", color: "#DC2626" }}>X</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!(project.tasks || []).length && (
              <div style={{ textAlign: "center", padding: "32px 20px", color: COLORS.muted, fontSize: 13 }}>No tasks yet - add one above.</div>
            )}
          </div>
        )}

        {/* -- EXPENSES -- */}
        {activeSection === "expenses" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.charcoal }}>
                Total: <span style={{ color: COLORS.amber }}>${(project.expenses || []).reduce((s, e) => s + (e.amount || 0), 0).toLocaleString()}</span>
              </div>
              <button onClick={() => { setExpForm(blankExp); setEditingExpense("new"); }} style={{ background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add expense</button>
            </div>

            {/* Labor line */}
            <div style={{ background: "#EFF6FF", borderRadius: 12, border: `1px solid ${COLORS.skyLight}`, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.sky }}>Labor cost</div>
                <div style={{ fontWeight: 700, color: COLORS.sky }}>${fin.laborCost.toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 10, color: COLORS.muted, marginBottom: 3 }}>Hours worked</label>
                  <input type="number" value={project.laborHours || ""} onChange={e => updateProject({ laborHours: parseFloat(e.target.value) || 0 })}
                    placeholder="0" style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 10, color: COLORS.muted, marginBottom: 3 }}>Labor rate ($/hr)</label>
                  <input type="number" value={project.laborRate || ""} onChange={e => updateProject({ laborRate: parseFloat(e.target.value) || 0 })}
                    placeholder="0" style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              </div>
            </div>

            {/* Expense list */}
            {(project.expenses || []).length === 0 && (
              <div style={{ textAlign: "center", padding: "24px", color: COLORS.muted, fontSize: 13, background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}`, marginBottom: 10 }}>
                No expenses recorded yet.
              </div>
            )}
            {(project.expenses || []).sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(e => (
              <div key={e.id} style={{ background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: "11px 14px", marginBottom: 7, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.charcoal }}>{e.description}</div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    <span style={{ background: "#F3F4F6", borderRadius: 6, padding: "1px 6px", marginRight: 6 }}>{e.category}</span>
                    {e.date}{e.vendor ? ` . ${e.vendor}` : ""}
                    {e.receipt && <span style={{ marginLeft: 6, color: COLORS.green }}>Rcpt</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: COLORS.amber }}>${e.amount.toFixed(2)}</span>
                  <button onClick={() => { setExpForm({ ...e, amount: e.amount.toString() }); setEditingExpense(e.id); }} style={{ background: "#F3F4F6", border: "none", borderRadius: 7, padding: "4px 9px", fontSize: 11, cursor: "pointer", color: COLORS.slate }}>Edit</button>
                  <button onClick={() => updateProject({ expenses: (project.expenses || []).filter(x => x.id !== e.id) })} style={{ background: "#FEF2F2", border: "none", borderRadius: 7, padding: "4px 9px", fontSize: 11, cursor: "pointer", color: "#DC2626" }}>X</button>
                </div>
              </div>
            ))}

            {/* Expense form */}
            {editingExpense && (
              <div style={{ background: COLORS.white, borderRadius: 14, border: `1.5px solid ${COLORS.green}`, padding: "14px 16px", marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal, marginBottom: 12 }}>{editingExpense === "new" ? "Add expense" : "Edit expense"}</div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Description</label>
                  <input value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                    style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Category</label>
                    <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
                      {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Amount ($)</label>
                    <input type="number" step="0.01" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Date</label>
                    <input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Vendor</label>
                    <input value={expForm.vendor} onChange={e => setExpForm(f => ({ ...f, vendor: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13, color: COLORS.slate, marginBottom: 12 }}>
                  <input type="checkbox" checked={expForm.receipt} onChange={e => setExpForm(f => ({ ...f, receipt: e.target.checked }))} />
                  Receipt obtained
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveExpense} style={{ flex: 1, background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                  <button onClick={() => { setEditingExpense(null); setExpForm(blankExp); }} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -- SUBCONTRACTORS -- */}
        {activeSection === "subs" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.charcoal }}>
                Sub total: <span style={{ color: COLORS.soilLight }}>${(project.subcontractors || []).reduce((s, sc) => s + (sc.amount || 0), 0).toLocaleString()}</span>
              </div>
              <button onClick={() => { setSubForm(blankSub); setEditingSub("new"); }} style={{ background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add sub</button>
            </div>

            {(project.subcontractors || []).length === 0 && !editingSub && (
              <div style={{ textAlign: "center", padding: "32px 20px", color: COLORS.muted, fontSize: 13, background: COLORS.white, borderRadius: 12, border: `1px solid ${COLORS.border}`, marginBottom: 10 }}>
                No subcontractors added yet.
              </div>
            )}

            {(project.subcontractors || []).map(sc => {
              const scStatus = { pending: { bg: "#FEF3C7", text: "#D97706" }, hired: { bg: COLORS.greenPale, text: COLORS.green }, paid: { bg: "#F0F9FF", text: COLORS.sky }, cancelled: { bg: "#FEF2F2", text: "#DC2626" } };
              const s = scStatus[sc.status] || scStatus.pending;
              return (
                <div key={sc.id} style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "14px 16px", marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.charcoal }}>{sc.name}</span>
                        <span style={{ background: s.bg, color: s.text, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{sc.status}</span>
                      </div>
                      {sc.trade && <div style={{ fontSize: 11, color: COLORS.muted }}>{sc.trade}</div>}
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {sc.phone && <a href={`tel:${sc.phone}`} style={{ color: COLORS.sky }}>Tel {sc.phone}</a>}
                        {sc.email && <a href={`mailto:${sc.email}`} style={{ color: COLORS.sky }}>Email {sc.email}</a>}
                      </div>
                      {sc.notes && <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 4, fontStyle: "italic" }}>{sc.notes}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: 16, color: COLORS.soilLight }}>${(sc.amount || 0).toLocaleString()}</span>
                      <button onClick={() => { setSubForm({ ...sc, amount: sc.amount?.toString() || "" }); setEditingSub(sc.id); }} style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", color: COLORS.slate, fontWeight: 600 }}>Edit</button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Sub form */}
            {editingSub && (
              <div style={{ background: COLORS.white, borderRadius: 14, border: `1.5px solid ${COLORS.green}`, padding: "14px 16px", marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.charcoal, marginBottom: 12 }}>{editingSub === "new" ? "Add subcontractor" : "Edit subcontractor"}</div>
                {[["Company / name", "name"], ["Trade / specialty", "trade"], ["Phone", "phone"], ["Email", "email"]].map(([label, key]) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
                    <input value={subForm[key] || ""} onChange={e => setSubForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Contract amount ($)</label>
                    <input type="number" value={subForm.amount || ""} onChange={e => setSubForm(f => ({ ...f, amount: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Status</label>
                    <select value={subForm.status} onChange={e => setSubForm(f => ({ ...f, status: e.target.value }))}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
                      {["pending", "hired", "paid", "cancelled"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Notes</label>
                  <textarea value={subForm.notes || ""} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveSub} style={{ flex: 1, background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                  <button onClick={() => { setEditingSub(null); setSubForm(blankSub); }} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -- NOTES -- */}
        {activeSection === "files" && (
          <div>
            <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Project notes</div>
              <textarea value={project.notes || ""} onChange={e => updateProject({ notes: e.target.value })} rows={8}
                placeholder="Scope of work, special instructions, site access info, permit numbers..."
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }} />
            </div>
            <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Permit / license info</div>
              {[["Permit number", "permitNumber"], ["Permit issued by", "permitIssuedBy"], ["Permit expiry", "permitExpiry"], ["CCB license #", "ccbNumber"]].map(([label, key]) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
                  <input value={project[key] || ""} onChange={e => updateProject({ [key]: e.target.value })}
                    style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Task edit modal */}
      {editingTask && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditingTask(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "20px 22px 32px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.charcoal, marginBottom: 14 }}>Edit task</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Task title</label>
              <input value={editingTask.title} onChange={e => setEditingTask(t => ({ ...t, title: e.target.value }))}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Assign to</label>
                <select value={editingTask.assigneeId || ""} onChange={e => setEditingTask(t => ({ ...t, assigneeId: parseInt(e.target.value) || null }))}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
                  <option value="">Unassigned</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Due date</label>
                <input type="date" value={editingTask.dueDate || ""} onChange={e => setEditingTask(t => ({ ...t, dueDate: e.target.value }))}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: COLORS.slate, marginBottom: 4 }}>Notes</label>
              <textarea value={editingTask.notes || ""} onChange={e => setEditingTask(t => ({ ...t, notes: e.target.value }))} rows={2}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { updateTask(editingTask.id, editingTask); setEditingTask(null); }}
                style={{ flex: 1, background: COLORS.green, color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
              <button onClick={() => setEditingTask(null)} style={{ flex: 1, background: "#F3F4F6", color: COLORS.slate, border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Project Editor Modal ---------------------------------------------------
function ProjectEditorModal({ project, clients, onSave, onClose }) {
  const isNew = !project;
  const blank = { name: "", clientId: null, clientName: "", address: "", status: "planning", startDate: fmt(today), endDate: "", contractValue: "", budgetedHours: "", laborRate: "45", description: "", tasks: [], expenses: [], subcontractors: [] };
  const [form, setForm] = useState(project ? { ...project, contractValue: project.contractValue?.toString() || "", budgetedHours: project.budgetedHours?.toString() || "", laborRate: project.laborRate?.toString() || "45" } : blank);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,15,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}>
      <div style={{ background: COLORS.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", paddingBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: COLORS.border }} />
        </div>
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: COLORS.charcoal }}>{isNew ? "New project" : "Edit project"}</div>
          <button onClick={onClose} style={{ background: "#F3F4F6", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: COLORS.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Project name</label>
            <input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Hartwell Backyard Renovation"
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Client</label>
            <select onChange={e => {
              const c = clients.find(cl => cl.id === parseInt(e.target.value));
              setF("clientId", c?.id || null); setF("clientName", c?.name || ""); setF("address", c?.address || "");
            }} defaultValue={form.clientId || ""}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">- Select client or type below -</option>
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {[["Client name (if not above)", "clientName"], ["Address", "address"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>{label}</label>
              <input value={form[key] || ""} onChange={e => setF(key, e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Start date</label>
              <input type="date" value={form.startDate} onChange={e => setF("startDate", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Target completion</label>
              <input type="date" value={form.endDate || ""} onChange={e => setF("endDate", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Contract value ($)</label>
            <input type="number" value={form.contractValue} onChange={e => setF("contractValue", e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Budgeted hours</label>
              <input type="number" value={form.budgetedHours} onChange={e => setF("budgetedHours", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Labor rate ($/hr)</label>
              <input type="number" value={form.laborRate} onChange={e => setF("laborRate", e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: COLORS.slate, marginBottom: 4 }}>Project description</label>
            <textarea value={form.description || ""} onChange={e => setF("description", e.target.value)} rows={3}
              placeholder="Scope of work, key deliverables..."
              style={{ width: "100%", border: `1.5px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <button onClick={() => {
            onSave({ ...form, id: project?.id || Date.now(), contractValue: parseFloat(form.contractValue) || 0, budgetedHours: parseFloat(form.budgetedHours) || 0, laborRate: parseFloat(form.laborRate) || 45 });
            onClose();
          }} style={{ width: "100%", background: COLORS.green, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {isNew ? "Create project" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Projects Tab -----------------------------------------------------------
function ProjectsTab({ projects, setProjects, employees, clients }) {
  const [openProject, setOpenProject] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const saveProject = (p) => {
    setProjects(prev => {
      const exists = prev.find(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [...prev, p];
    });
    if (openProject?.id === p.id) setOpenProject(p);
  };

  const updateProject = (p) => saveProject(p);

  if (openProject) {
    const live = projects.find(p => p.id === openProject.id) || openProject;
    return <ProjectDetail project={live} employees={employees} clients={clients} onUpdate={updateProject} onBack={() => setOpenProject(null)} />;
  }

  const filtered = filterStatus === "all" ? projects : projects.filter(p => p.status === filterStatus);
  const sorted = [...filtered].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));

  // Summary stats
  const active = projects.filter(p => p.status === "active");
  const totalValue = projects.reduce((s, p) => s + (p.contractValue || 0), 0);
  const totalProfit = projects.reduce((s, p) => { const f = projectMargin(p); return s + f.profit; }, 0);

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Active",      val: active.length,                         color: COLORS.green },
          { label: "Total value", val: `$${totalValue.toLocaleString()}`,      color: COLORS.sky },
          { label: "Gross profit",val: `$${totalProfit.toLocaleString()}`,     color: totalProfit >= 0 ? COLORS.green : "#DC2626" },
          { label: "Projects",    val: projects.length,                        color: COLORS.charcoal },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, marginTop: 3 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["all", "planning", "active", "on_hold", "completed"].map(s => {
            const sm = PROJECT_STATUSES[s];
            return (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: "4px 11px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
                background: filterStatus === s ? COLORS.green : "#F3F4F6",
                color: filterStatus === s ? "#fff" : COLORS.muted,
              }}>{s === "all" ? "All" : sm?.label || s}</button>
            );
          })}
        </div>
        <button onClick={() => { setEditProject(null); setShowEditor(true); }} style={{
          background: COLORS.green, color: "#fff", border: "none", borderRadius: 10,
          padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
        }}>+ New project</button>
      </div>

      {/* Project list */}
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "44px 20px", color: COLORS.muted }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>Build</div>
          <div style={{ fontWeight: 700, color: COLORS.charcoal, marginBottom: 6 }}>No projects yet</div>
          <div style={{ fontSize: 13 }}>Create your first project to track costs, tasks, and subs.</div>
        </div>
      )}

      {sorted.map(p => {
        const sm = PROJECT_STATUSES[p.status] || PROJECT_STATUSES.planning;
        const fin = projectMargin(p);
        const pct = pctComplete(p.tasks);
        const tasksDone = (p.tasks || []).filter(t => t.status === "done").length;
        const tasksTotal = (p.tasks || []).length;
        return (
          <div key={p.id} onClick={() => setOpenProject(p)} style={{
            background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`,
            padding: "14px 16px", marginBottom: 10, cursor: "pointer",
            transition: "box-shadow 0.12s",
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.07)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.charcoal }}>{p.name}</span>
                  <span style={{ background: sm.bg, color: sm.text, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{sm.icon} {sm.label}</span>
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{projectNumber(p.id)} . {p.clientName || "No client"}</div>
                {p.startDate && <div style={{ fontSize: 11, color: COLORS.muted }}>{p.startDate}{p.endDate ? ` fwd ${p.endDate}` : ""}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.green }}>${(p.contractValue || 0).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: fin.margin >= 30 ? COLORS.green : fin.margin >= 15 ? COLORS.amber : "#DC2626", fontWeight: 600 }}>{fin.margin}% margin</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: "#F3F4F6", borderRadius: 99, height: 5, marginBottom: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, background: COLORS.green, height: "100%", borderRadius: 99, transition: "width 0.3s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.muted }}>
              <span>{tasksTotal > 0 ? `${tasksDone}/${tasksTotal} tasks` : "No tasks"}</span>
              <div style={{ display: "flex", gap: 10 }}>
                {(p.subcontractors || []).length > 0 && <span>Sub {p.subcontractors.length} sub{p.subcontractors.length !== 1 ? "s" : ""}</span>}
                {(p.expenses || []).length > 0 && <span>$ ${(p.expenses || []).reduce((s,e)=>s+(e.amount||0),0).toLocaleString()}</span>}
              </div>
            </div>
          </div>
        );
      })}

      {showEditor && (
        <ProjectEditorModal project={editProject} clients={clients} onSave={saveProject} onClose={() => { setShowEditor(false); setEditProject(null); }} />
      )}
    </div>
  );
}
//-- ROOT APP ---------------------------------------------------------------
export default function App() {
  const [tab, setTab] = useState("schedule");
  const [clients, setClients] = useState(initClients);
  const [employees, setEmployees] = useState(initEmployees);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [bfTests, setBfTests] = useState([]);
  const [testerInfo, setTesterInfo] = useState(() => { try { const s = localStorage.getItem('testerInfo'); return s ? JSON.parse(s) : { name: "", certNumber: "", certExpiry: "", licenseNumber: "", gaugeMake: "", gaugeSerial: "", gaugeCalDate: "" }; } catch(e) { return { name: "", certNumber: "", certExpiry: "", licenseNumber: "", gaugeMake: "", gaugeSerial: "", gaugeCalDate: "" }; } });
  
  // Load data from Supabase on startup
  const [editClientId, setEditClientId] = useState(null);
  const [dbLoaded, setDbLoaded] = useState(false);

  // Load from Supabase on startup
  useEffect(() => {
    Promise.all([
      supabase.from('employees').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('jobs').select('*'),
  ]).then(([{ data: emps }, { data: cls }, { data: jbs }]) => {
      if (emps && emps.length > 0) {
        setEmployees(emps.map(e => ({
          ...e, accessLevel: e.access_level,
        })));
      }
      if (cls && cls.length > 0) {
        setClients(cls.map(c => ({
          ...c,
          nextService: c.next_service,
          scheduledTime: c.scheduled_time,
          assignedEmployeeIds: c.assigned_employee_ids || [],
          completedVisitDates: c.completed_visit_dates || [],
        })));
        if (jbs && jbs.length > 0) {
      setJobs(jbs);
    }
      }
      setDbLoaded(true);
    });
  }, []);

  
  const navigateToClient = (clientId) => {
    setEditClientId(clientId);
    setTab("clients");
  };

  const todayCount = clients.filter(c => c.active && c.nextService === fmt(today)).length;
  const activeCount = jobs.filter(j => j.clockIn && !j.clockOut).length;
  const pendingQuotes = quotes.filter(q => q.status === "draft" || q.status === "sent").length;

  const overdueBackflow = assemblies.filter(a => {
    const tests = bfTests.filter(t => t.assemblyId === a.id).sort((a, b) => b.testDate.localeCompare(a.testDate));
    const last = tests[0];
    if (!last) return true;
    const due = new Date(last.testDate); due.setFullYear(due.getFullYear() + 1);
    return due < today;
  }).length;

  const activeProjects = projects.filter(p => p.status === "active").length;

  const tabs = [
    { id: "schedule",  label: "Schedule", icon: "Cal", badge: todayCount > 0 ? todayCount : null },
    { id: "employees", label: "Crew",     icon: "Crew", badge: activeCount > 0 ? activeCount : null },
    { id: "clients",   label: "Clients",  icon: "Home", badge: null },
    { id: "quotes",    label: "Quotes",   icon: "List", badge: pendingQuotes > 0 ? pendingQuotes : null },
    { id: "projects",  label: "Projects", icon: "Build",  badge: activeProjects > 0 ? activeProjects : null },
    { id: "backflow",  label: "Backflow", icon: "Flow", badge: overdueBackflow > 0 ? overdueBackflow : null },
    { id: "analytics", label: "Earnings", icon: "Stats", badge: null },
    { id: "crewview",  label: "Crew app", icon: "App", badge: null },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: COLORS.cream, minHeight: "100vh", maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${COLORS.border}`, padding: "10px 20px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Logo */}
          <svg viewBox="0 0 260 64" width="200" height="50" xmlns="http://www.w3.org/2000/svg" aria-label="Landscapes by NW Mowbotics">
            {/* Mountain silhouette */}
            <g transform="translate(0, 0)">
              {/* Dark green mountain base */}
              <path d="M8 46 L28 12 L38 26 L44 18 L62 46 Z" fill="#1B4332"/>
              {/* Topographic lines on left peak */}
              <path d="M12 42 L28 16 L34 26" fill="none" stroke="#2D6A4F" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M16 42 L28 20 L33 28" fill="none" stroke="#2D6A4F" strokeWidth="1" strokeLinecap="round"/>
              <path d="M20 42 L28 24 L32 30" fill="none" stroke="#2D6A4F" strokeWidth="0.8" strokeLinecap="round"/>
              <path d="M24 44 L28 28 L31 33" fill="none" stroke="#2D6A4F" strokeWidth="0.6" strokeLinecap="round"/>
              {/* Light green right peak */}
              <path d="M34 46 L44 20 L54 46 Z" fill="#52B788"/>
              {/* Topographic lines on right peak */}
              <path d="M36 44 L44 24 L52 44" fill="none" stroke="#40916C" strokeWidth="1" strokeLinecap="round"/>
              <path d="M38 44 L44 28 L50 44" fill="none" stroke="#40916C" strokeWidth="0.8" strokeLinecap="round"/>
              {/* Ground spread */}
              <ellipse cx="35" cy="47" rx="28" ry="4" fill="#1B4332" opacity="0.35"/>
            </g>
            {/* "Landscapes" script text */}
            <text x="68" y="36" fontFamily="Georgia, 'Times New Roman', serif" fontSize="22" fontStyle="italic" fontWeight="400" fill="#1B4332" letterSpacing="-0.5">Landscapes</text>
            {/* "by NW MOWBOTICS" small text */}
            <text x="82" y="50" fontFamily="'DM Sans', Arial, sans-serif" fontSize="9.5" fontWeight="700" fill="#52B788" letterSpacing="1.5">by NW MOWBOTICS</text>
          </svg>

          {/* Today's job count */}
          <div style={{ textAlign: "right" }}>
            <div style={{ color: COLORS.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
            <div style={{ color: COLORS.green, fontWeight: 800, fontSize: 20, lineHeight: 1.1 }}>{todayCount}<span style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted }}> job{todayCount !== 1 ? "s" : ""}</span></div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", background: COLORS.white, borderBottom: `1px solid ${COLORS.border}`, position: "sticky", top: 70, zIndex: 49 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "10px 2px", border: "none", background: "transparent", cursor: "pointer",
            color: tab === t.id ? COLORS.green : COLORS.muted,
            borderBottom: tab === t.id ? `2px solid ${COLORS.green}` : "2px solid transparent",
            fontSize: 10, fontWeight: tab === t.id ? 700 : 500, fontFamily: "inherit",
            transition: "all 0.15s", position: "relative",
          }}>
            <div style={{ fontSize: 15 }}>{t.icon}</div>
            <div>{t.label}</div>
            {t.badge && (
              <div style={{ position: "absolute", top: 6, right: "calc(50% - 14px)", background: COLORS.amber, color: "#fff", borderRadius: 99, width: 15, height: 15, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {t.badge}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "16px 14px 32px" }}>
        {tab === "schedule"  && <ScheduleTab clients={clients} setClients={setClients} jobs={jobs} setJobs={setJobs} employees={employees} onNavigateClients={navigateToClient} />}
        {tab === "employees" && <EmployeesTab employees={employees} setEmployees={setEmployees} clients={clients} jobs={jobs} setJobs={setJobs} />}
        {tab === "clients"   && <ClientsTab clients={clients} setClients={setClients} initialEditId={editClientId} onEditHandled={() => setEditClientId(null)} />}
        {tab === "quotes"    && <QuotesTab quotes={quotes} setQuotes={setQuotes} clients={clients} />}
        {tab === "projects"  && <ProjectsTab projects={projects} setProjects={setProjects} employees={employees} clients={clients} />}
        {tab === "backflow"  && <BackflowTab assemblies={assemblies} setAssemblies={setAssemblies} bfTests={bfTests} setBfTests={setBfTests} clients={clients} testerInfo={testerInfo} setTesterInfo={setTesterInfo} />}
        {tab === "analytics" && <AnalyticsTab jobs={jobs} clients={clients} />}
        {tab === "crewview" && <CrewViewTab employees={employees} />}
      </div>
    </div>
  );
}

