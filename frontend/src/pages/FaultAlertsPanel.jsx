import { useState, useEffect } from "react";
import { apiFetch } from "../App";

const TYPE_ICONS = {
  pipe_burst:"💥", no_supply:"🚱", dirty_water:"🟤",
  low_pressure:"📉", billing_issue:"💰", other:"❓"
};
const SEV_LABEL = { critical:"🔴 CRITICAL", moderate:"🟡 MODERATE", watch:"🔵 WATCH" };

export default function FaultAlertsPanel() {
  const [alerts, setAlerts]       = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [msg, setMsg]             = useState("");

  useEffect(() => { loadAlerts(); }, []);

  async function loadAlerts() {
    try { setAlerts(await apiFetch("/faults/active")); }
    catch(e) { console.error("Faults load:", e); }
  }

  async function runDetection() {
    setDetecting(true); setMsg("");
    try {
      const res = await apiFetch("/faults/detect", { method:"POST" });
      setMsg(res.message);
      await loadAlerts();
    } catch(e) { setMsg("❌ Detection failed: " + e.message); }
    finally { setDetecting(false); }
  }

  async function dismiss(id) {
    try {
      await apiFetch(`/faults/dismiss/${id}`, { method:"POST" });
      setAlerts(a => a.filter(x => x.id !== id));
    } catch(e) { setMsg("❌ " + e.message); }
  }

  async function resolve(id) {
    try {
      await apiFetch(`/faults/resolve/${id}`, { method:"POST" });
      setAlerts(a => a.filter(x => x.id !== id));
    } catch(e) { setMsg("❌ " + e.message); }
  }

  return (
    <div className="fault-alerts-panel">
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <h3 style={{fontSize:16,fontWeight:700,color:"var(--amber-700)",margin:0}}>
            ⚠️ Pipeline Fault Alerts
          </h3>
          <p style={{fontSize:12,color:"var(--stone-400)",margin:"3px 0 0"}}>
            AI-detected complaint clusters indicating potential infrastructure faults
          </p>
        </div>
        <button className="btn-ai" onClick={runDetection} disabled={detecting}
          style={{fontSize:12}}>
          {detecting ? "🤖 Scanning..." : "🔍 Run Detection"}
        </button>
      </div>

      {msg && (
        <div className={msg.startsWith("❌") ? "error-box" : "success-box"}
          style={{marginBottom:12,fontSize:13}}>{msg}</div>
      )}

      {alerts.length === 0 ? (
        <div style={{background:"rgba(34,197,94,0.06)",border:"1.5px solid #BBF7D0",
          borderRadius:14,padding:"16px 20px",fontSize:13,color:"var(--green-600)",
          display:"flex",gap:10,alignItems:"center"}}>
          ✅ No active fault alerts. System operating normally.
          <span style={{fontSize:11,color:"var(--stone-400)",marginLeft:"auto"}}>
            Last scanned: {new Date().toLocaleTimeString("en-IN")}
          </span>
        </div>
      ) : (
        alerts.map((a, idx) => (
          <div key={a.id} className={`fault-alert-card ${a.severity}`}
            style={{animationDelay:`${idx * 0.08}s`}}>
            <div className="fault-icon">{TYPE_ICONS[a.complaint_type] || "⚠️"}</div>
            <div className="fault-body">
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                <h4 style={{margin:0}}>
                  {a.complaint_type.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}
                  {" — "}Ward {a.ward_no}: {a.ward_name}
                </h4>
                <span className={`severity-badge severity-${a.severity}`}>
                  {SEV_LABEL[a.severity] || a.severity.toUpperCase()}
                </span>
              </div>

              <p>{a.ai_summary}</p>

              <div className="fault-meta">
                📊 {a.complaint_count} complaints &bull; {a.unique_citizens} unique citizens
                &bull; last {a.time_window_h}h &bull;{" "}
                {a.created_at ? new Date(a.created_at).toLocaleString("en-IN") : "Just now"}
              </div>

              <div className="fault-actions">
                <button className="btn-success" style={{fontSize:12,padding:"6px 12px"}}
                  onClick={() => resolve(a.id)}>✅ Mark Resolved</button>
                <button className="btn-secondary" style={{fontSize:12,padding:"6px 12px"}}
                  onClick={() => dismiss(a.id)}>✕ Dismiss (False Positive)</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
