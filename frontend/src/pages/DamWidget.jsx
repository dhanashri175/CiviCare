import { useEffect, useState } from "react";
import { apiFetch } from "../App";

export default function DamWidget({ showRefresh = false }) {
  const [dam, setDam]           = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadDam(); }, []);

  async function loadDam() {
    try { setDam(await apiFetch("/dam/current")); }
    catch(e) { console.error("Dam load:", e); }
    finally { setLoading(false); }
  }

  async function refresh() {
    setRefreshing(true);
    try { setDam(await apiFetch("/dam/refresh", { method:"POST" })); }
    catch(e) { console.error("Dam refresh:", e); }
    finally { setRefreshing(false); }
  }

  if (loading) return (
    <div className="dam-widget-enhanced">
      <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",
        color:"var(--stone-400)",fontSize:13}}>Loading dam data...</div>
    </div>
  );

  if (!dam) return null;

  const pct    = dam.level_percent || 0;
  const color  = dam.status === "green" ? "var(--green-500)"
               : dam.status === "yellow" ? "var(--amber-500)"
               : "var(--red-500)";
  const isLive = dam.source === "CWC via data.gov.in";

  return (
    <div className="dam-widget-enhanced">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <span style={{fontSize:16,fontWeight:800,color:"var(--amber-700)"}}>
              🏔️ {dam.dam_name}
            </span>
            
          </div>
          <div style={{fontSize:11,color:"var(--stone-400)"}}>
            {dam.river} River &bull; {dam.district} &bull; Capacity: {dam.full_capacity_mcm} MCM
            {dam.date && <> &bull; Updated: {dam.date}</>}
          </div>
        </div>
        {showRefresh && (
          <button className="btn-secondary" style={{fontSize:11,padding:"5px 12px"}}
            onClick={refresh} disabled={refreshing}>
            {refreshing ? "⏳" : "🔄 Refresh"}
          </button>
        )}
      </div>

      {/* Level bar */}
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:12,marginBottom:5,color:"var(--stone-500)"}}>
            <span>Water level</span>
            <span style={{fontWeight:700,color}}>
              {pct.toFixed(1)}%
              {dam.status === "green" ? " ✅" : dam.status === "yellow" ? " ⚠️" : " 🔴"}
            </span>
          </div>
          <div style={{background:"var(--stone-100)",borderRadius:100,height:16,
            overflow:"hidden",boxShadow:"inset 0 2px 4px rgba(0,0,0,0.06)"}}>
            <div className="dam-bar-animated" style={{
              height:"100%", borderRadius:100, width:`${pct}%`,
              background:`linear-gradient(90deg, ${color}88, ${color})`,
              transition:"width 1.2s cubic-bezier(0.4,0,0.2,1)"
            }} />
          </div>
          {/* Threshold markers */}
          <div style={{position:"relative",height:16,marginTop:4}}>
            <div style={{position:"absolute",left:"40%",height:8,width:1,
              background:"var(--amber-400)",top:0}} />
            <div style={{position:"absolute",left:"75%",height:8,width:1,
              background:"var(--green-500)",top:0}} />
            <span style={{position:"absolute",left:"38%",fontSize:9,
              color:"var(--amber-600)",top:8}}>40%</span>
            <span style={{position:"absolute",left:"73%",fontSize:9,
              color:"var(--green-600)",top:8}}>75%</span>
          </div>
        </div>

        {/* Big % circle */}
        <div style={{width:72,height:72,borderRadius:"50%",
          border:`4px solid ${color}`,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",flexShrink:0,
          background:"rgba(255,255,255,0.5)",backdropFilter:"blur(8px)"}}>
          <span style={{fontSize:18,fontWeight:800,color,lineHeight:1}}>
            {pct.toFixed(0)}
          </span>
          <span style={{fontSize:9,color:"var(--stone-400)",fontWeight:600}}>%</span>
        </div>
      </div>

      {/* Storage MCM */}
      {dam.storage_mcm && (
        <div style={{marginTop:12,display:"flex",gap:16,fontSize:12,
          color:"var(--stone-500)",flexWrap:"wrap"}}>
          <span>💧 Storage: <strong style={{color:"var(--stone-700)"}}>
            {dam.storage_mcm} MCM</strong></span>
          <span>📦 Capacity: <strong style={{color:"var(--stone-700)"}}>
            {dam.full_capacity_mcm} MCM</strong></span>
          
        </div>
      )}
    </div>
  );
}