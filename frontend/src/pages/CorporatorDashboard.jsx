import { useEffect, useState } from "react";
import { apiFetch, useAuth } from "../App";


export default function CorporatorDashboard() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [history, setHistory]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState("all");

  useEffect(() => {
    Promise.all([
      apiFetch("/complaints/"),
      user.ward_id ? apiFetch(`/supply/ward/${user.ward_id}/history`) : Promise.resolve(null),
    ]).then(([c, h]) => {
      setComplaints(c);
      setHistory(h);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="loading"><div className="loading-drop">🏛️</div><p>Loading ward data...</p></div>
  );

  const open       = complaints.filter(c => c.status === "open").length;
  const resolved   = complaints.filter(c => c.status === "resolved").length;
  const inProgress = complaints.filter(c => c.status === "in_progress" || c.status === "assigned").length;
  const resRate    = complaints.length ? Math.round(resolved / complaints.length * 100) : 0;

  // Type breakdown
  const typeCounts = complaints.reduce((acc, c) => {
    acc[c.complaint_type] = (acc[c.complaint_type] || 0) + 1;
    return acc;
  }, {});
  const topType = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0];

  const filtered = filter === "all" ? complaints : complaints.filter(c => c.status === filter);

  const TYPE_ICONS = {
    no_supply:"🚱", low_pressure:"📉", pipe_burst:"💥",
    dirty_water:"🟤", billing_issue:"💰", other:"❓"
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>🏛️ Corporator Dashboard</h1>
        <p>Ward {user.ward_id} — Phaltan Municipal Council &bull; <strong>{user.name}</strong></p>
      </div>

      {/* Animated stat grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-value">{complaints.length}</div>
          <div className="stat-label">Total Complaints</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-value" style={{color:"var(--red-500)"}}>{open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚙️</div>
          <div className="stat-value" style={{color:"var(--blue-500)"}}>{inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value" style={{color:"var(--green-600)"}}>{resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-value">{resRate}%</div>
          <div className="stat-label">Resolution Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💧</div>
          <div className="stat-value">{history?.supply_score || 0}%</div>
          <div className="stat-label">Supply Score (30d)</div>
        </div>
      </div>

      {/* Top complaint insight */}
      {topType && (
        <div className="alert-banner alert-yellow">
          🔝 Most common issue in your ward: <strong>
            {topType[0].replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}
          </strong> ({topType[1]} complaints). Consider raising this in the next council meeting.
        </div>
      )}

      {/* Supply history */}
      {history && (
        <div className="section">
          <h3>💧 Ward Supply Health (Last 30 Days)</h3>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13}}>
            {[
              ["Days Supplied", history.days_supplied + " / 30"],
              ["Supply Score", history.supply_score + "%"],
              ["Stress Level", history.stress_level?.toUpperCase()],
            ].map(([label, val]) => (
              <div key={label} style={{background:"var(--amber-50)",border:"1px solid var(--amber-200)",
                borderRadius:12,padding:"10px 16px",minWidth:120,textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:800,color:"var(--amber-700)"}}>{val}</div>
                <div style={{fontSize:11,color:"var(--stone-400)",marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

     

      {/* Complaint type breakdown */}
      {Object.keys(typeCounts).length > 0 && (
        <div className="section">
          <h3>📊 Complaint Breakdown by Type</h3>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([type, count]) => (
              <div key={type} style={{
                background:"var(--glass-bg)",backdropFilter:"blur(8px)",
                border:"1.5px solid var(--glass-border)",borderRadius:14,
                padding:"10px 16px",textAlign:"center",minWidth:110
              }}>
                <div style={{fontSize:22}}>{TYPE_ICONS[type] || "❓"}</div>
                <div style={{fontSize:16,fontWeight:800,color:"var(--amber-700)"}}>{count}</div>
                <div style={{fontSize:11,color:"var(--stone-400)",marginTop:2}}>
                  {type.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complaints list */}
      <div className="section">
        <h3>📋 Ward Complaints</h3>
        <div className="category-chips" style={{marginBottom:14}}>
          {["all","open","assigned","in_progress","resolved"].map(s => (
            <button key={s} className={`chip ${filter===s?"chip-active":""}`}
              onClick={() => setFilter(s)}>
              {s === "all" ? `All (${complaints.length})` : `${s.replace(/_/g," ")} (${complaints.filter(c=>c.status===s).length})`}
            </button>
          ))}
        </div>

        {filtered.length === 0
          ? <div className="empty"><div className="empty-icon">✅</div>No complaints in this category</div>
          : filtered.map(c => (
            <div key={c.id} className="card">
              <div className="card-header">
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:20}}>{TYPE_ICONS[c.complaint_type] || "❓"}</span>
                  <div className="card-title">
                    {c.complaint_type?.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span className={`badge badge-${c.status}`}>
                    {c.status.replace(/_/g," ").toUpperCase()}
                  </span>
                  <span className="badge" style={{background:"var(--amber-50)",
                    color:"var(--amber-700)",border:"1px solid var(--amber-200)"}}>
                    P{c.priority_score}/5
                  </span>
                </div>
              </div>
              <div className="card-body">{c.description}</div>
              {c.resolution_note && (
                <div style={{marginTop:6,padding:"6px 10px",background:"rgba(34,197,94,0.08)",
                  borderRadius:8,fontSize:12,color:"var(--green-600)"}}>
                  ✅ {c.resolution_note}
                </div>
              )}
              <div className="card-meta" style={{marginTop:6}}>
                WO: {c.work_order_no} &bull; SLA: {c.sla_hours}h &bull;{" "}
                {c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN") : ""}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
