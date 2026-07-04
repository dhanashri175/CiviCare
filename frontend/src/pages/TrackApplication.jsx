import { useState } from "react";
import { apiFetch, useAuth } from "../App";

const STATUS_STEPS = [
  { key: "applied",         label: "Application Received",      icon: "📋" },
  { key: "scheduled",       label: "Inspection Scheduled",      icon: "📅" },
  { key: "inspection",      label: "Inspection Done",            icon: "🔍" },
  { key: "payment_pending", label: "Payment Pending",            icon: "💳" },
  { key: "active",          label: "Connection Active",          icon: "💧" },
];

const STATUS_INFO = {
  applied: {
    color: "blue", icon: "📋",
    title: "Application Received",
    desc: "Your application has been received. An officer will contact you to schedule an inspection.",
  },
  scheduled: {
    color: "blue", icon: "📅",
    title: "Inspection Scheduled",
    desc: "An officer has scheduled a site inspection. Please be available at your property on the inspection date.",
  },
  inspection: {
    color: "yellow", icon: "🔍",
    title: "Inspection Completed",
    desc: "Site inspection is done. Connection charges have been calculated. Log in to your portal and pay the one-time connection charge to proceed.",
  },
  payment_pending: {
    color: "yellow", icon: "💳",
    title: "Payment Pending",
    desc: "Your payment has been declared. The officer will verify your payment and activate your connection.",
  },
  active: {
    color: "green", icon: "💧",
    title: "Connection Active",
    desc: "Your connection is active! You can now log in to the citizen portal with your property number.",
  },
  rejected: {
    color: "red", icon: "❌",
    title: "Application Rejected",
    desc: "Your application was rejected. Please see the reason below and contact the office.",
  },
};

export default function TrackApplication() {
  const { setPage } = useAuth();
  const [appId, setAppId]   = useState("");
  const [result, setResult] = useState(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function track() {
    if (!appId.trim()) return setError("Please enter your application ID");
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await apiFetch(`/connections/track/${appId}`);
      setResult(data);
    } catch(e) { setError("Application not found. Please check your ID."); }
    finally { setLoading(false); }
  }

  const info = result ? STATUS_INFO[result.status] || STATUS_INFO.applied : null;
  const currentStep = STATUS_STEPS.findIndex(s => s.key === result?.status);

  return (
    <div className="page" style={{maxWidth:600,margin:"0 auto"}}>
      <div className="page-header">
        <h1>📋 Track Application</h1>
        <p>Enter your application ID to check status</p>
      </div>

      <div className="section">
        <div className="form-row">
          <div className="form-group">
            <label>Application ID</label>
            <input value={appId} onChange={e=>setAppId(e.target.value)}
              placeholder="e.g. 7" type="number"
              onKeyDown={e=>e.key==="Enter"&&track()} />
            <div style={{fontSize:11,color:"var(--stone-400)",marginTop:3}}>
              You received this ID when you submitted your application
            </div>
          </div>
          <div className="form-group" style={{display:"flex",alignItems:"flex-end"}}>
            <button className="btn-primary" onClick={track} disabled={loading} style={{width:"100%"}}>
              {loading ? "Checking..." : "🔍 Track"}
            </button>
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>

      {result && info && (
        <div className="section">
          {/* Progress steps */}
          {result.status !== "rejected" && (
            <div style={{display:"flex",alignItems:"center",marginBottom:24,overflowX:"auto",paddingBottom:4}}>
              {STATUS_STEPS.map((step, i) => {
                const done    = i <= currentStep;
                const current = i === currentStep;
                return (
                  <div key={step.key} style={{display:"flex",alignItems:"center",flexShrink:0}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{
                        width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:18,
                        background: done ? "linear-gradient(135deg,var(--amber-500),var(--terra-400))" : "var(--stone-100)",
                        border: current ? "3px solid var(--amber-500)" : "none",
                        color: done ? "white" : "var(--stone-400)",
                        boxShadow: current ? "0 0 0 4px rgba(245,158,11,0.2)" : "none",
                      }}>
                        {done && i < currentStep ? "✅" : step.icon}
                      </div>
                      <div style={{fontSize:10,color:done?"var(--amber-700)":"var(--stone-400)",
                        fontWeight:current?700:400,textAlign:"center",maxWidth:70}}>
                        {step.label}
                      </div>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div style={{height:2,width:32,flexShrink:0,margin:"0 4px",marginBottom:20,
                        background: i < currentStep ? "var(--amber-400)" : "var(--stone-200)"}} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Status card */}
          <div style={{
            background: info.color==="green" ? "rgba(22,163,74,0.06)" :
                        info.color==="red"   ? "rgba(220,38,38,0.06)" :
                        info.color==="yellow"? "rgba(245,158,11,0.06)" : "rgba(59,130,246,0.06)",
            border: `1.5px solid ${
              info.color==="green" ? "rgba(22,163,74,0.3)" :
              info.color==="red"   ? "rgba(220,38,38,0.3)" :
              info.color==="yellow"? "rgba(245,158,11,0.3)" : "rgba(59,130,246,0.3)"}`,
            borderRadius:16,padding:20,
          }}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
              <div style={{fontSize:32}}>{info.icon}</div>
              <div>
                <div style={{fontSize:18,fontWeight:700,color:"var(--stone-800)"}}>{info.title}</div>
                <div style={{fontSize:13,color:"var(--stone-500)",marginTop:4}}>{info.desc}</div>
              </div>
            </div>

            {/* Details */}
            {[
              ["Applicant Name", result.applicant_name],
              ["Property Number", result.property_number],
              ["Application ID", `#${result.application_id}`],
              ["Applied On", result.applied_on ? new Date(result.applied_on).toLocaleDateString("en-IN") : "—"],
              ["Inspection", result.inspection_done ? `✅ Done on ${result.inspection_date ? new Date(result.inspection_date).toLocaleDateString("en-IN") : "—"}` : result.inspection_scheduled ? `📅 Scheduled on ${result.inspection_date ? new Date(result.inspection_date).toLocaleDateString("en-IN") : "—"}` : "❌ Not yet scheduled"],
              result.total_connection_charges > 0 && ["Connection Charges", `₹${result.total_connection_charges?.toLocaleString("en-IN")}`],
              result.connection_number && ["Connection Number", result.connection_number],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",
                padding:"8px 0",borderBottom:"1px solid rgba(0,0,0,0.05)",fontSize:14}}>
                <span style={{color:"var(--stone-500)"}}>{label}</span>
                <strong style={{color:"var(--stone-800)",maxWidth:"55%",textAlign:"right"}}>{val}</strong>
              </div>
            ))}

            {result.rejection_reason && (
              <div className="error-box" style={{marginTop:12}}>
                <strong>Rejection reason:</strong> {result.rejection_reason}
              </div>
            )}
          </div>

          {/* After activation — login prompt */}
          {result.status === "active" && (
            <div style={{marginTop:16,background:"rgba(22,163,74,0.08)",border:"1.5px solid rgba(22,163,74,0.3)",
              borderRadius:14,padding:16,textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:8}}>🎉</div>
              <div style={{fontSize:16,fontWeight:700,color:"var(--green-700)",marginBottom:4}}>
                Your connection is active!
              </div>
              <div style={{fontSize:13,color:"var(--stone-600)",marginBottom:12}}>
                Log in with your property number <strong>{result.property_number}</strong>.<br/>
                Initial password = your property number (you'll be asked to change it).
              </div>
              <button className="btn-success" style={{fontSize:14}}
                onClick={()=>setPage("login")}>
                🔑 Go to Login
              </button>
            </div>
          )}

          {/* Payment pending — guidance */}
          {result.status === "payment_pending" && (
            <div style={{marginTop:16,background:"rgba(59,130,246,0.08)",border:"1.5px solid rgba(59,130,246,0.3)",
              borderRadius:14,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--blue-700)",marginBottom:8}}>
                🔔 Payment Declared — Awaiting Verification
              </div>
              <div style={{fontSize:13,color:"var(--stone-600)"}}>
                Your payment of <strong>₹{result.total_connection_charges?.toLocaleString("en-IN")}</strong> has been declared.
                The officer will verify and activate your connection shortly.
              </div>
            </div>
          )}

          {result.status === "inspection" && result.total_connection_charges > 0 && (
            <div style={{marginTop:16,background:"rgba(245,158,11,0.08)",border:"1.5px solid rgba(245,158,11,0.3)",
              borderRadius:14,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--amber-700)",marginBottom:8}}>
                💳 Next Step: Pay Connection Charges
              </div>
              <div style={{fontSize:13,color:"var(--stone-600)"}}>
                Log in to your citizen portal and pay the one-time connection charge of{" "}
                <strong>₹{result.total_connection_charges?.toLocaleString("en-IN")}</strong>.
                Once paid, the officer will verify and activate your connection.
              </div>
              <button className="btn-primary" style={{marginTop:12,fontSize:14}}
                onClick={()=>setPage("login")}>
                🔑 Log in to Pay
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
