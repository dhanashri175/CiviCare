import { useEffect, useState } from "react";
import { apiFetch, useAuth } from "../App";
import logo from "../assets/logo.png";
export default function PublicDashboard() {
  const { setPage } = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWard, setSelectedWard] = useState(null);

  useEffect(() => {
    apiFetch("/dashboard/public").then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="loading-drop">💧</div><p>Loading CiviCare Dashboard...</p></div>;
  if (!data) return <div className="page"><div className="empty">Unable to load dashboard</div></div>;

  const dam = data.dam_level;
  const city = data.city_stats;

  return (
    
    <div className="page">
      {/* Hero */}
      <div className="page-header" style={{textAlign:"center",padding:"36px 32px"}}>
        

        <img src={logo} alt="CiviCare Logo" style={{width: "auto", height: "auto", marginBottom: 2}} />
        
       
        <p style={{fontSize:15,color:"var(--stone-500)",marginBottom:20}}>
          Phaltan Municipal Council — Smart Water Governance & Grievance Resolution
        </p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <button className="btn-primary" onClick={() => setPage("apply")}>🔌 Apply for Connection</button>
          <button className="btn-secondary" onClick={() => setPage("track")}>🔍 Track Application</button>
          <button className="btn-secondary" onClick={() => setPage("login")}>🔑 Citizen Login</button>
        </div>
      </div>

      {/* City Stats — Complaint Transparency */}
      <div className="stat-grid" style={{marginBottom:20}}>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-value">{city.complaints_this_month}</div>
          <div className="stat-label">Complaints This Month</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{city.resolved_complaints}</div>
          <div className="stat-label">Resolved Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-value">{city.open_complaints}</div>
          <div className="stat-label">Open Complaints</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-value">{city.overall_resolution_rate}%</div>
          <div className="stat-label">Resolution Rate</div>
        </div>
      </div>

     

      {/* Ward-wise Complaint Transparency */}
      <div className="section">
        <h3>🗺️ Ward-wise Complaint Transparency</h3>
        <p style={{fontSize:12,color:"var(--stone-400)",marginBottom:16}}>
          Real-time complaint data per ward — as mandated by RTI & citizen transparency norms.
        </p>

        <div className="ward-grid">
          {data.ward_stats.map(w => (
            <div key={w.ward_id} className="ward-card" onClick={() => setSelectedWard(selectedWard?.ward_id === w.ward_id ? null : w)} style={{cursor:"pointer"}}>
              <h4>Ward {w.ward_no} — {w.ward_name}</h4>
              <div className="area">{w.area_name}</div>

              {/* Supply score bar */}
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                  <span style={{color:"var(--stone-400)"}}>Supply Score (30d)</span>
                  <span style={{fontWeight:700,color:w.supply_score_30d>=85?"var(--green-600)":w.supply_score_30d>=60?"var(--amber-600)":"var(--red-500)"}}>{w.supply_score_30d}%</span>
                </div>
                <div style={{background:"var(--stone-100)",borderRadius:100,height:6,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:100,width:`${w.supply_score_30d}%`,
                    background:w.supply_score_30d>=85?"var(--green-500)":w.supply_score_30d>=60?"var(--amber-500)":"var(--red-500)",
                    transition:"width 0.8s"}} />
                </div>
              </div>

              <div className="ward-stat-row"><span className="label">📋 Total Complaints</span><span className="value">{w.total_complaints}</span></div>
              <div className="ward-stat-row"><span className="label">✅ Resolved</span><span className="value" style={{color:"var(--green-600)"}}>{w.resolved_complaints}</span></div>
              <div className="ward-stat-row"><span className="label">⏳ Open</span><span className="value" style={{color:"var(--red-500)"}}>{w.open_complaints}</span></div>
              <div className="ward-stat-row"><span className="label">📅 This Month</span><span className="value">{w.complaints_this_month}</span></div>
              <div className="ward-stat-row"><span className="label">📈 Resolution Rate</span>
                <span className="value" style={{color:w.resolution_rate>=70?"var(--green-600)":"var(--amber-600)"}}>{w.resolution_rate}%</span>
              </div>

              {/* Expanded details */}
              {selectedWard?.ward_id === w.ward_id && (
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--stone-200)"}}>
                  <div className="ward-stat-row">
                    <span className="label">⚡ Avg Resolution</span>
                    <span className="value">{w.avg_resolution_hours ? `${w.avg_resolution_hours}h` : "—"}</span>
                  </div>
                  <div className="ward-stat-row">
                    <span className="label">📍 This Week</span>
                    <span className="value">{w.complaints_this_week} complaints</span>
                  </div>
                  {w.top_complaint_type && (
                    <div className="ward-stat-row">
                      <span className="label">🔝 Top Issue</span>
                      <span className="value" style={{fontSize:11}}>{w.top_complaint_type.replace(/_/g," ")}</span>
                    </div>
                  )}
                  <div className="ward-stat-row">
                    <span className="label">💧 Today Supply</span>
                    <span className="value" style={{textTransform:"capitalize"}}>{w.today_status.replace(/_/g," ")}</span>
                  </div>
                </div>
              )}
              <div style={{marginTop:10,fontSize:11,color:"var(--amber-600)",textAlign:"center"}}>
                {selectedWard?.ward_id === w.ward_id ? "▲ Less" : "▼ More details"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div style={{textAlign:"center",marginTop:24,fontSize:12,color:"var(--stone-400)"}}>
        CiviCare — AI-Powered Municipal Water Governance &bull; Phaltan Municipal Council &bull; Data updated in real-time
      </div>
    </div>
  );
}
