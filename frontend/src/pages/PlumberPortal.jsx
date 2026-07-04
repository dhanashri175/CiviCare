import { useState, useEffect } from "react";
import { useAuth, apiFetch } from "../App";

export default function PlumberPortal() {
  const { user, logout } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [updating, setUpdating] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { loadComplaints(); }, []);

  async function loadComplaints() {
    setLoading(true);
    try {
      const data = await apiFetch("/complaints/");
      setComplaints(data);
    } catch (e) { setMsg("❌ Failed to load complaints"); }
    finally { setLoading(false); }
  }

  async function updateStatus(id, status, note = "") {
    setUpdating(id);
    try {
      await apiFetch(`/complaints/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status, resolution_note: note || undefined }),
      });
      setMsg("✅ Status updated");
      loadComplaints();
    } catch (e) { setMsg("❌ " + e.message); }
    finally { setUpdating(null); }
  }

  const filtered = filter === "all" ? complaints : complaints.filter(c => c.status === filter);
  const counts = {
    all: complaints.length,
    open: complaints.filter(c => c.status === "open").length,
    assigned: complaints.filter(c => c.status === "assigned").length,
    in_progress: complaints.filter(c => c.status === "in_progress").length,
    resolved: complaints.filter(c => c.status === "resolved").length,
  };

  return (
    <div className="plumber-page">
      {/* Header */}
      <div className="plumber-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>🔧 Plumber Portal</h1>
            <p>Welcome, <strong style={{ color: "var(--amber-700)" }}>{user.name}</strong> — Phaltan Municipal Council Water Dept.</p>
            <p style={{ marginTop: 4, fontSize: 12, color: "var(--stone-400)" }}>
              Showing only complaints assigned to you by the officer
            </p>
          </div>
          <button className="btn-secondary" onClick={logout} style={{ fontSize: 12 }}>Logout</button>
        </div>

        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
          {[
            { label: "Total", value: counts.all, color: "var(--amber-700)" },
            { label: "Open", value: counts.open, color: "var(--red-500)" },
            { label: "In Progress", value: counts.in_progress, color: "var(--blue-500)" },
            { label: "Resolved", value: counts.resolved, color: "var(--green-600)" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.5)", borderRadius: 12, padding: "10px 14px", textAlign: "center", backdropFilter: "blur(8px)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--stone-400)", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div className={msg.startsWith("✅") ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>
          {msg}
        </div>
      )}

      {/* Filter chips */}
      <div className="category-chips" style={{ marginBottom: 16 }}>
        {[["all","All"], ["open","Open"], ["assigned","Assigned"], ["in_progress","In Progress"], ["resolved","Resolved"]].map(([v, l]) => (
          <button key={v} className={`chip ${filter === v ? "chip-active" : ""}`} onClick={() => setFilter(v)}>
            {l} ({counts[v] ?? 0})
          </button>
        ))}
      </div>

      {/* Complaints list */}
      {loading ? (
        <div className="loading"><div className="loading-drop">🔧</div><p>Loading your assignments...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">✅</div>No complaints in this category</div>
      ) : (
        filtered.map(c => <ComplaintWorkCard key={c.id} complaint={c} onUpdate={updateStatus} updating={updating} />)
      )}
    </div>
  );
}

function ComplaintWorkCard({ complaint: c, onUpdate, updating }) {
  const [showResolve, setShowResolve] = useState(false);
  const [note, setNote] = useState("");

  const TYPE_ICONS = { no_supply: "🚱", low_pressure: "📉", pipe_burst: "💥", dirty_water: "🟤", billing_issue: "💰", other: "❓" };
  const icon = TYPE_ICONS[c.complaint_type] || "❓";
  const isUpdating = updating === c.id;

  function PriorityDots({ score }) {
    return (
      <div className="priority-bar">
        {[1,2,3,4,5].map(i => (
          <div key={i} className={`priority-dot ${i <= score ? "filled" : "empty"}`} />
        ))}
      </div>
    );
  }

  return (
    <div className={`complaint-work-card priority-${c.priority_score}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--stone-800)" }}>
              {c.complaint_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div style={{ fontSize: 12, color: "var(--stone-400)" }}>
              WO: {c.work_order_no} &bull; Ward {c.ward_id} &bull; {c.sla_hours}h SLA
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`badge badge-${c.status}`}>{c.status.replace(/_/g," ").toUpperCase()}</span>
          <PriorityDots score={c.priority_score} />
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--stone-600)", lineHeight: 1.6, marginBottom: 12 }}>{c.description}</p>

      {c.photo_url && (
        <div style={{ marginBottom: 12 }}>
          <a href={c.photo_url} target="_blank" rel="noreferrer">
            <img src={c.photo_url} alt="complaint" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10 }} />
          </a>
        </div>
      )}

      {c.resolution_note && (
        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid #BBF7D0", borderRadius: 10, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>
          📝 Resolution: {c.resolution_note}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--stone-400)", marginBottom: 12 }}>
        Filed: {c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN") : "—"}
        {c.resolved_at && <> &bull; Resolved: {new Date(c.resolved_at).toLocaleDateString("en-IN")}</>}
      </div>

      {/* Action buttons */}
      {c.status !== "resolved" && (
        <div className="btn-row">
          {c.status === "assigned" && (
            <button className="btn-ai" onClick={() => onUpdate(c.id, "in_progress")} disabled={isUpdating}>
              {isUpdating ? "..." : "▶ Start Work"}
            </button>
          )}
          {c.status === "in_progress" && (
            <button className="btn-success" onClick={() => setShowResolve(!showResolve)}>
              ✅ Mark Resolved
            </button>
          )}
          {(c.status === "open" || c.status === "assigned") && (
            <button className="btn-secondary" onClick={() => onUpdate(c.id, "in_progress")} disabled={isUpdating}>
              {isUpdating ? "..." : "⚙️ In Progress"}
            </button>
          )}
        </div>
      )}

      {showResolve && (
        <div style={{ marginTop: 12 }}>
          <textarea
            placeholder="Describe what was fixed (required)..."
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div className="btn-row">
            <button className="btn-success" disabled={!note.trim() || isUpdating}
              onClick={() => { onUpdate(c.id, "resolved", note); setShowResolve(false); }}>
              {isUpdating ? "Saving..." : "✅ Confirm Resolved"}
            </button>
            <button className="btn-secondary" onClick={() => setShowResolve(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
