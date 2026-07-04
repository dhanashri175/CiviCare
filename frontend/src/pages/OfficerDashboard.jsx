import { useEffect, useState } from "react";
import { apiFetch, useAuth } from "../App";

import FaultAlertsPanel from "./FaultAlertsPanel";

export default function OfficerDashboard() {
  const { user } = useAuth();
  const [tab, setTab]       = useState("faults");
  const [wards, setWards]   = useState([]);
  const [plumbers, setPlumbers] = useState([]);

  useEffect(() => {
    apiFetch("/connections/wards").then(setWards).catch(()=>{});
    apiFetch("/users/plumbers").then(setPlumbers).catch(()=>{});
  }, []);

  const TABS = [
    ["faults","⚠️ Fault Alerts"],["applications","📋 Applications"],
    ["supply","💧 Supply"],["billing","💰 Billing"],
    ["complaints","🛠 Complaints"],["services","📝 Service Requests"],
    ["announce","📢 Announce"],["rates","💴 Rates"],["staff","👥 Staff"],
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1>👮 Officer Dashboard</h1>
        <p>Phaltan Municipal Council — Water Department &bull; <strong>{user.name}</strong></p>
      </div>
      <div className="tabs">
        {TABS.map(([t,l]) => (
          <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {tab==="faults"       && <FaultAlertsPanel />}
      {tab==="applications" && <ApplicationsTab wards={wards} />}
      {tab==="supply"       && <SupplyTab wards={wards} />}
      {tab==="billing"      && <BillingTab wards={wards} />}
      {tab==="complaints"   && <ComplaintsTab plumbers={plumbers} />}
      {tab==="services"     && <ServiceRequestsTab />}
      {tab==="announce"     && <AnnouncementTab wards={wards} />}
      {tab==="rates"        && <RatesTab />}
      
      {tab==="staff"        && <StaffTab />}
    </div>
  );
}

// ── APPLICATIONS ──────────────────────────────────────────────
function ApplicationsTab({ wards }) {
  const [apps, setApps]         = useState([]);
  const [filter, setFilter]     = useState("applied");
  const [scheduling, setScheduling] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [msg, setMsg]           = useState("");

  function reload() {
    apiFetch(`/connections/applications?status=${filter}`).then(setApps).catch(()=>{});
  }
  useEffect(reload, [filter]);

  async function scheduleInspection(appId, data) {
    try {
      await apiFetch("/connections/schedule",{method:"POST",body:JSON.stringify({connection_id:appId,...data})});
      setMsg("✅ Inspection scheduled"); setScheduling(null); reload();
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function reject(appId) {
    if (!rejectReason.trim()) return setMsg("❌ Rejection reason is required");
    try {
      await apiFetch("/connections/reject",{method:"POST",body:JSON.stringify({
        connection_id:appId, rejection_reason:rejectReason.trim()
      })});
      setMsg("✅ Application rejected"); setRejectingId(null); setRejectReason(""); reload();
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function saveInspection(appId, data) {
    try {
      const res = await apiFetch("/connections/inspect",{method:"POST",body:JSON.stringify({connection_id:appId,...data})});
      setMsg(`✅ Inspection recorded! Charges: ₹${res.charges?.total?.toLocaleString("en-IN")}`);
      setInspecting(null); reload();
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function approve(appId) {
    try {
      const res = await apiFetch("/connections/approve",{method:"POST",body:JSON.stringify({connection_id:appId})});
      setMsg(`✅ Connection activated! No: ${res.connection_number} | Bill FY${res.bill_generated?.billing_year}: ₹${res.bill_generated?.total_amount}`);
      reload();
    } catch(e) { setMsg("❌ "+e.message); }
  }

  const STATUS_LABELS = {
    applied:"📋 Applied", scheduled:"📅 Scheduled", inspection:"🔍 Inspected",
    payment_pending:"💳 Payment Pending", active:"✅ Active", rejected:"❌ Rejected"
  };

  return (
    <div className="section">
      <h3>📋 Connection Applications</h3>
      {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}

      {/* Flow hint */}
      <div style={{display:"flex",gap:0,marginBottom:16,overflowX:"auto"}}>
        {["applied","scheduled","inspection","payment_pending","active"].map((s,i)=>(
          <div key={s} style={{display:"flex",alignItems:"center"}}>
            <div style={{padding:"4px 10px",borderRadius:20,fontSize:11,whiteSpace:"nowrap",cursor:"pointer",
              background:filter===s?"var(--amber-500)":"var(--stone-100)",
              color:filter===s?"white":"var(--stone-500)",fontWeight:filter===s?700:400}}
              onClick={()=>setFilter(s)}>{STATUS_LABELS[s]}</div>
            {i<4 && <span style={{color:"var(--stone-300)",margin:"0 2px",fontSize:12}}>→</span>}
          </div>
        ))}
        <div style={{marginLeft:8,padding:"4px 10px",borderRadius:20,fontSize:11,cursor:"pointer",
          background:filter==="rejected"?"var(--red-500)":"var(--stone-100)",
          color:filter==="rejected"?"white":"var(--stone-500)"}}
          onClick={()=>setFilter("rejected")}>❌ Rejected</div>
      </div>

      {apps.length===0
        ? <div className="empty"><div className="empty-icon">📂</div>No applications with status: {filter}</div>
        : apps.map(app=>(
          <div key={app.id} className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{app.applicant_name}</div>
                <div className="card-meta">
                  📞 {app.applicant_phone} &bull; {app.applicant_email} &bull; Ward {app.ward_id} &bull; {app.connection_type} &bull; Pipe {app.pipe_size}" &bull; Prop: {app.property_number}
                </div>
              </div>
              <span className={`badge badge-${app.status==="scheduled"?"in_progress":app.status==="inspection"?"assigned":app.status}`}>
                {STATUS_LABELS[app.status]||app.status}
              </span>
            </div>

            <div className="card-body">📍 {app.address}</div>

            {/* Inspection date if scheduled */}
            {app.inspection_date && (
              <div style={{marginTop:6,fontSize:12,color:"var(--stone-500)"}}>
                📅 Inspection: {new Date(app.inspection_date).toLocaleDateString("en-IN")}
                {app.inspection_notes && ` — ${app.inspection_notes}`}
              </div>
            )}

            {/* Charges after inspection */}
            {app.total_connection_charges > 0 && (
              <div style={{background:"var(--amber-50)",borderRadius:8,padding:10,marginTop:8,fontSize:12}}>
                <strong style={{color:"var(--amber-700)"}}>
                  💰 Connection Charges: ₹{app.total_connection_charges?.toLocaleString("en-IN")}
                </strong>
                <span style={{color:"var(--stone-500)",marginLeft:8}}>
                  Deposit ₹{app.deposit_amount?.toLocaleString("en-IN")} + Fitting ₹{app.fitting_charges?.toLocaleString("en-IN")} + Maintenance ₹{app.maintenance_charges?.toLocaleString("en-IN")}
                  {app.pipe_distance_charges>0 && ` + Pipe ₹${app.pipe_distance_charges?.toLocaleString("en-IN")}`}
                </span>
                {app.status==="payment_pending" && (
                  <div style={{marginTop:4,color:"var(--green-600)",fontWeight:600}}>
                    ✅ Citizen has paid full connection charges — verify and approve below
                  </div>
                )}
              </div>
            )}

            {/* Rejection reason */}
            {app.rejection_reason && (
              <div className="error-box" style={{marginTop:8,fontSize:12}}>
                Rejection reason: {app.rejection_reason}
              </div>
            )}

            {/* Document links */}
            <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {app.aadhaar_doc_url?.includes("cloudinary") && (
                <a href={app.aadhaar_doc_url} target="_blank" rel="noreferrer"
                  className="btn-secondary" style={{fontSize:11,padding:"4px 10px"}}>📄 Aadhaar</a>
              )}
              {app.property_doc_url?.includes("cloudinary") && (
                <a href={app.property_doc_url} target="_blank" rel="noreferrer"
                  className="btn-secondary" style={{fontSize:11,padding:"4px 10px"}}>🏠 Property Doc</a>
              )}
            </div>

            {/* ACTION BUTTONS based on status */}
            <div className="btn-row" style={{marginTop:10,flexWrap:"wrap"}}>

              {/* applied → schedule inspection OR reject */}
              {app.status==="applied" && <>
                <button className="btn-ai" style={{fontSize:12}} onClick={()=>{setScheduling(app.id);setRejectingId(null);}}>
                  📅 Schedule Inspection
                </button>
                <button className="btn-danger" style={{fontSize:12}} onClick={()=>{setRejectingId(app.id);setScheduling(null);}}>
                  ❌ Reject
                </button>
              </>}

              {/* scheduled → record inspection OR reject */}
              {app.status==="scheduled" && <>
                <button className="btn-primary" style={{fontSize:12}} onClick={()=>{setInspecting(app.id);setRejectingId(null);}}>
                  🔍 Record Inspection
                </button>
                <button className="btn-danger" style={{fontSize:12}} onClick={()=>{setRejectingId(app.id);setScheduling(null);}}>
                  ❌ Reject
                </button>
              </>}

              {/* inspection → waiting for citizen payment (no reject at this stage) */}
              {app.status==="inspection" && (
                <div style={{fontSize:12,color:"var(--stone-500)"}}>
                  ⏳ Waiting for citizen to pay one-time connection charge of ₹{app.total_connection_charges?.toLocaleString("en-IN")} online
                </div>
              )}

              {/* payment_pending → approve (citizen has paid) */}
              {app.status==="payment_pending" && (
                <button className="btn-success" style={{fontSize:13}}
                  onClick={()=>{if(confirm(`Approve and activate? Citizen has declared payment of ₹${app.total_connection_charges?.toLocaleString("en-IN")}.`)) approve(app.id);}}>
                  ✅ Verify Payment & Activate Connection
                </button>
              )}
            </div>

            {/* Reject form */}
            {rejectingId===app.id && (
              <div style={{background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.2)",borderRadius:10,padding:12,marginTop:10}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--red-700)",marginBottom:8}}>❌ Reject Application</div>
                <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={2}
                  placeholder="Enter rejection reason (required — citizen will see this)..."
                  style={{width:"100%",padding:"8px",borderRadius:8,border:"1px solid rgba(220,38,38,0.3)",
                    marginBottom:8,fontSize:13,resize:"vertical"}} />
                <div className="btn-row">
                  <button className="btn-danger" style={{fontSize:12}} onClick={()=>reject(app.id)}>Confirm Rejection</button>
                  <button className="btn-secondary" style={{fontSize:12}} onClick={()=>{setRejectingId(null);setRejectReason("");}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Schedule inspection form */}
            {scheduling===app.id && (
              <ScheduleForm appId={app.id} onSave={scheduleInspection} onCancel={()=>setScheduling(null)} />
            )}

            {/* Record inspection form */}
            {inspecting===app.id && (
              <InspectionForm appId={app.id} app={app} onSave={saveInspection} onCancel={()=>setInspecting(null)} />
            )}
          </div>
        ))}
    </div>
  );
}

function ScheduleForm({ appId, onSave, onCancel }) {
  const today = new Date().toISOString().split("T")[0];
  const [d, setD]         = useState("");
  const [note, setNote]   = useState("");
  return (
    <div style={{background:"var(--amber-50)",borderRadius:12,padding:14,marginTop:10,border:"1px solid var(--amber-200)"}}>
      <div style={{fontSize:13,fontWeight:600,color:"var(--amber-700)",marginBottom:10}}>📅 Schedule Inspection</div>
      <div className="form-row">
        <div className="form-group">
          <label>Inspection Date <span style={{color:"var(--red-500)"}}>*</span></label>
          <input type="date" value={d} min={today} onChange={e=>setD(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Note to citizen (optional)</label>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Officer will visit at 10am" />
        </div>
      </div>
      <div className="btn-row">
        <button className="btn-primary" disabled={!d}
          onClick={()=>onSave(appId,{inspection_date:d,officer_note:note||undefined})}>
          📅 Schedule
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}


function InspectionForm({ appId, app, onSave, onCancel }) {
  const today = new Date().toISOString().split("T")[0];
  const [d, setD]         = useState("");
  const [notes, setNotes] = useState("");
  const [pipe, setPipe]   = useState(app?.pipe_size || "0.5");
  const [dist, setDist]   = useState(0);

  // Live charge preview — values come from DB on save; this is illustrative only
  const connType = app?.connection_type || "domestic";

  return (
    <div style={{background:"var(--amber-50)",borderRadius:12,padding:14,marginTop:10,border:"1px solid var(--amber-200)"}}>
      <div style={{fontSize:13,fontWeight:600,color:"var(--amber-700)",marginBottom:10}}>🔍 Record Inspection</div>
      <div className="form-row">
        <div className="form-group">
          <label>Inspection Date <span style={{color:"var(--red-500)"}}>*</span></label>
          <input type="date" value={d} min={today} onChange={e=>setD(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Pipe Size (confirmed on site)</label>
          <select value={pipe} onChange={e=>setPipe(e.target.value)}>
            {[["0.5","½ inch"],["0.75","¾ inch"],["1.0","1 inch"],["1.5","1½ inch"]].map(([v,l])=>(
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Distance from Main Water Line (metres)</label>
          <input type="number" value={dist} min={0} step={0.5} onChange={e=>setDist(e.target.value)} placeholder="0" />
          <div style={{fontSize:11,color:"var(--stone-400)",marginTop:2}}>
            Charge of ₹640/m applies if main line is &gt;1m away (exact rate from system rates)
          </div>
        </div>
        <div className="form-group">
          <label>Inspection Notes</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Site observations..." />
        </div>
      </div>
      <div className="alert-banner alert-blue" style={{marginTop:8,marginBottom:8,fontSize:12}}>
        ℹ️ Connection charges (deposit, fitting, maintenance + pipe distance) will be calculated from current system rates after saving.
      </div>
      <div className="btn-row">
        <button className="btn-primary" disabled={!d}
          onClick={()=>onSave(appId,{
            inspection_date:d, inspection_notes:notes,
            pipe_size:pipe, pipe_distance_meters:parseFloat(dist)||0
          })}>
          💾 Save Inspection
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}


// ── SUPPLY ────────────────────────────────────────────────────
function SupplyTab({ wards }) {
  const [selectedWards, setSelectedWards] = useState([]);
  const [form, setForm] = useState({date:"",supply_start:"",supply_duration:"",status:"supplied",reason:""});
  const [msg, setMsg]   = useState("");

  function toggleWard(id) {
    setSelectedWards(prev => prev.includes(id) ? prev.filter(w=>w!==id) : [...prev, id]);
  }

  async function submit() {
    if (selectedWards.length===0) return setMsg("❌ Select at least one ward");
    try {
      const res = await apiFetch("/supply/log",{method:"POST",body:JSON.stringify({
        ward_ids:selectedWards, date:form.date, supply_start:form.supply_start||undefined,
        supply_duration:form.supply_duration?parseInt(form.supply_duration):undefined,
        status:form.status, reason:form.reason||undefined
      })});
      setMsg(`✅ ${res.message}`);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  return (
    <div className="section">
      <h3>💧 Log Water Supply</h3>
      {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
      <div className="form-group">
        <label>Select Ward(s) <span style={{color:"var(--red-500)"}}>*</span></label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6,marginTop:6}}>
          {wards.map(w=>(
            <label key={w.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
              background:selectedWards.includes(w.id)?"var(--amber-100)":"var(--glass-bg)",
              border:`1.5px solid ${selectedWards.includes(w.id)?"var(--amber-400)":"var(--glass-border)"}`,
              borderRadius:10,cursor:"pointer",fontSize:13}}>
              <input type="checkbox" checked={selectedWards.includes(w.id)}
                onChange={()=>toggleWard(w.id)} style={{width:"auto",margin:0}} />
              Ward {w.ward_no} — {w.ward_name}
            </label>
          ))}
        </div>
        <div style={{marginTop:8,display:"flex",gap:8}}>
          <button className="btn-secondary" style={{fontSize:11,padding:"4px 12px"}}
            onClick={()=>setSelectedWards(wards.map(w=>w.id))}>Select All</button>
          <button className="btn-secondary" style={{fontSize:11,padding:"4px 12px"}}
            onClick={()=>setSelectedWards([])}>Clear</button>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} /></div>
        <div className="form-group"><label>Status</label>
          <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
            {["supplied","maintenance","pipe_burst","shortage"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Supply Start Time</label><input type="time" value={form.supply_start} onChange={e=>setForm(p=>({...p,supply_start:e.target.value}))} /></div>
        <div className="form-group"><label>Duration (minutes)</label><input type="number" value={form.supply_duration} onChange={e=>setForm(p=>({...p,supply_duration:e.target.value}))} /></div>
      </div>
      <div className="form-group"><label>Reason (if not supplied)</label><input value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} /></div>
      <button className="btn-primary" onClick={submit}>Log Supply</button>
    </div>
  );
}

// ── BILLING ───────────────────────────────────────────────────
// ── BILLING ───────────────────────────────────────────────
function BillingTab({ wards }) {
  const [view, setView]         = useState("generate");
  const [connections, setConns] = useState([]);   // all active connections for dropdown
  const [connSearch, setConnSearch] = useState(""); // search filter
  const [selectedConn, setSelectedConn] = useState(null);
  const [year, setYear]         = useState(new Date().getMonth()>=3?new Date().getFullYear():new Date().getFullYear()-1);
  const [preview, setPreview]   = useState(null);
  const [allBills, setAllBills] = useState([]);
  const [statusFilter, setStatusFilter] = useState("payment_declared");
  const [billSearch, setBillSearch] = useState("");
  const [msg, setMsg]           = useState("");

  useEffect(() => {
    apiFetch("/billing/active-connections").then(setConns).catch(()=>{});
  }, []);

  useEffect(() => {
    if (view==="manage") loadAllBills();
  }, [view, statusFilter]);

  async function loadAllBills() {
    try { setAllBills(await apiFetch(`/billing/all?status=${statusFilter}`)); }
    catch(e) { setMsg("❌ "+e.message); }
  }

  async function getPreview() {
    if (!selectedConn) return setMsg("❌ Select a connection first");
    try {
      setPreview(await apiFetch(`/billing/calculate/${selectedConn.id}?billing_year=${year}`));
      setMsg("");
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function generate() {
    if (!selectedConn) return setMsg("❌ Select a connection first");
    try {
      const res = await apiFetch("/billing/generate",{method:"POST",body:JSON.stringify({
        connection_id: selectedConn.id, billing_year: parseInt(year)
      })});
      setMsg(`✅ Bill generated! FY ${res.billing_year || year} | Rate: ₹${res.panipatti_rate} | Arrears: ₹${res.arrears} | Total: ₹${res.total_amount} | Due: ${res.due_date}`);
      setPreview(null);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function generateAll() {
    if (!confirm(`Generate FY ${year} panipatti bills for ALL active connections?`)) return;
    try {
      const res = await apiFetch(`/billing/generate-all?billing_year=${year}`,{method:"POST"});
      setMsg(`✅ ${res.message} | Due: ${res.due_date}`);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function confirmPayment(billId, paymentId) {
    try {
      const res = await apiFetch(`/billing/confirm-payment?bill_id=${billId}&payment_id=${paymentId}`,{method:"POST"});
      setMsg(`✅ Confirmed! Receipt: ${res.receipt_no} | Paid: ₹${res.amount_confirmed} | Remaining: ₹${res.remaining}`);
      loadAllBills();
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function sendNotices() {
    if (!confirm(`Send overdue notices for FY ${year}?`)) return;
    try {
      const res = await apiFetch(`/billing/send-notices?billing_year=${year}`,{method:"POST"});
      setMsg(`✅ ${res.message}`);
    } catch(e) { setMsg("❌ "+e.message); }
  }



  // Filtered connections for dropdown
  const filteredConns = connections.filter(conn => {
    const q = connSearch.toLowerCase();
    return !q || conn.connection_number?.toLowerCase().includes(q)
              || conn.property_number?.toLowerCase().includes(q)
              || conn.applicant_name?.toLowerCase().includes(q);
  });

  // Filtered bills for manage tab
  const filteredBills = allBills.filter(b => {
    const q = billSearch.toLowerCase();
    return !q || b.connection_number?.toLowerCase().includes(q)
              || b.property_number?.toLowerCase().includes(q)
              || b.consumer_name?.toLowerCase().includes(q);
  });

  const PIPE = {"0.5":"½","0.75":"¾","1.0":"1","1.5":"1½"};

  return (
    <div>
      <div className="tabs" style={{marginBottom:16}}>
        {[["generate","🧾 Generate"],["manage","📋 All Bills"]].map(([v,l])=>(
          <button key={v} className={`tab ${view===v?"active":""}`} onClick={()=>setView(v)}>{l}</button>
        ))}
      </div>

      {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}

      {view==="generate" && (
        <div className="section">
          <h3>🧾 Generate Panipatti Bill</h3>
          <div className="alert-banner alert-yellow" style={{marginBottom:14}}>
            📅 FY: April 1 – March 31 &bull; Due date: <strong>March 31</strong> of following year &bull; Bill is generated at current panipatti rates
          </div>

          {/* Connection search + select */}
          <div className="form-group" style={{marginBottom:8}}>
            <label>Search & Select Connection <span className="required">*</span></label>
            <input value={connSearch} onChange={e=>{setConnSearch(e.target.value);setSelectedConn(null);setPreview(null);}}
              placeholder="Search by name, property number or connection number..."
              style={{marginBottom:8}} />
            {/* Connection list */}
            <div style={{maxHeight:220,overflowY:"auto",border:"1px solid var(--stone-200)",borderRadius:10}}>
              {connections.length === 0
                ? <div style={{padding:12,fontSize:13,color:"var(--stone-400)",textAlign:"center"}}>No active connections found</div>
                : filteredConns.length === 0
                ? <div style={{padding:12,fontSize:13,color:"var(--stone-400)",textAlign:"center"}}>No connections match "{connSearch}"</div>
                : filteredConns.map(conn => (
                  <div key={conn.id}
                    onClick={()=>{setSelectedConn(conn);setPreview(null);setMsg("");}}
                    style={{
                      padding:"10px 14px", cursor:"pointer", fontSize:13,
                      background: selectedConn?.id===conn.id ? "var(--amber-50)" : "transparent",
                      borderBottom:"1px solid var(--stone-100)",
                      borderLeft: selectedConn?.id===conn.id ? "3px solid var(--amber-500)" : "3px solid transparent",
                    }}
                    onMouseEnter={e=>{ if(selectedConn?.id!==conn.id) e.currentTarget.style.background="var(--stone-50)"; }}
                    onMouseLeave={e=>{ if(selectedConn?.id!==conn.id) e.currentTarget.style.background="transparent"; }}>
                    <div style={{fontWeight:600,color:"var(--stone-800)"}}>
                      {conn.connection_number} — {conn.applicant_name}
                    </div>
                    <div style={{fontSize:11,color:"var(--stone-400)",marginTop:2}}>
                      Prop: {conn.property_number} &bull; Ward {conn.ward_id} &bull; {conn.connection_type} &bull; {PIPE[conn.pipe_size]||conn.pipe_size}
                    </div>
                  </div>
                ))
              }
            </div>
            {selectedConn && (
              <div style={{marginTop:6,padding:"6px 10px",background:"var(--amber-50)",
                border:"1px solid var(--amber-200)",borderRadius:8,fontSize:12,color:"var(--amber-800)"}}>
                ✅ Selected: <strong>{selectedConn.connection_number}</strong> — {selectedConn.applicant_name}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Financial Year</label>
            <input type="number" value={year} onChange={e=>{setYear(e.target.value);setPreview(null);}}
              style={{maxWidth:120}} />
            <div style={{fontSize:11,color:"var(--stone-400)",marginTop:3}}>
              Enter the April start year (e.g. 2025 = FY 2025-26)
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div style={{background:"var(--amber-50)",border:"1px solid var(--amber-200)",borderRadius:12,padding:14,marginBottom:12}}>
              <div style={{fontWeight:700,color:"var(--amber-700)",marginBottom:8}}>
                Bill Preview — {preview.connection_number} — FY {year}-{parseInt(year)+1}
              </div>
              {preview.already_exists && (
                <div className="alert-banner alert-red" style={{marginBottom:8,fontSize:12}}>
                  ⚠️ A bill already exists for this connection and FY. Generating will fail.
                </div>
              )}
              <div style={{fontSize:12,color:"var(--stone-500)",marginBottom:6}}>
                {preview.applicant_name} &bull; {preview.property_number} &bull; Due: {preview.due_date}
              </div>
              {[
                ["Panipatti Rate (flat)", `₹${preview.breakdown?.panipatti_rate?.toLocaleString("en-IN")}`],
                ["Arrears (prev year unpaid)", `₹${preview.breakdown?.arrears?.toLocaleString("en-IN")}`],
                ["Total Bill", `₹${preview.breakdown?.total?.toLocaleString("en-IN")}`],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",
                  fontSize:13,padding:"4px 0",borderBottom:"1px solid var(--amber-100)"}}>
                  <span>{k}</span><strong style={{color:"var(--amber-700)"}}>{v}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="btn-row">
            <button className="btn-secondary" onClick={getPreview} disabled={!selectedConn}>👁 Preview</button>
            <button className="btn-primary" onClick={generate} disabled={!selectedConn || preview?.already_exists}>🧾 Generate</button>
            <button className="btn-success" onClick={generateAll}>⚡ Generate All Active</button>
            <button className="btn-danger" onClick={sendNotices}>📨 Send Notices</button>

          </div>
        </div>
      )}

      {view==="manage" && (
        <div className="section">
          <h3>📋 All Bills</h3>
          <div className="category-chips" style={{marginBottom:10}}>
            {[["payment_declared","🔔 Declared"],["pending","⏳ Pending"],
              ["partial","💰 Partial"],["absorbed","📦 Absorbed"],["overdue","⚠️ Overdue"],["paid","✅ Paid"]].map(([s,l])=>(
              <button key={s} className={`chip ${statusFilter===s?"chip-active":""}`}
                onClick={()=>setStatusFilter(s)}>{l}</button>
            ))}
          </div>
          <input value={billSearch} onChange={e=>setBillSearch(e.target.value)}
            placeholder="Search by name, property no, or connection no..."
            style={{marginBottom:12}} />
          {statusFilter==="payment_declared" && (
            <div className="alert-banner alert-blue" style={{marginBottom:12}}>
              🔔 Citizen has declared payment. Verify cash/cheque received and confirm below.
            </div>
          )}
          {filteredBills.length===0
            ? <div className="empty">No bills with status: {statusFilter}</div>
            : filteredBills.map(b=>(
              <div key={b.id} className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">{b.consumer_name}</div>
                    <div className="card-meta">
                      {b.connection_number} &bull; Prop: {b.property_number} &bull; Ward {b.ward_id} &bull; {b.billing_fy}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:800,
                      color:(b.remaining_amount??0)<=0?"var(--green-600)":"var(--amber-700)"}}>
                      ₹{(b.remaining_amount??0).toLocaleString("en-IN")}
                      <span style={{fontSize:11,fontWeight:400,color:"var(--stone-400)"}}> remaining</span>
                    </div>
                    <div style={{fontSize:12,color:"var(--stone-500)",marginTop:2}}>
                      <span>Bill: ₹{(b.total_amount??0).toLocaleString("en-IN")}</span>
                      <span style={{margin:"0 6px"}}>|</span>
                      <span style={{color:"var(--green-600)"}}>Paid: ₹{(b.amount_paid??0).toLocaleString("en-IN")}</span>
                      {(b.arrears??0) > 0 && <><span style={{margin:"0 6px"}}>|</span>
                      <span style={{color:"var(--red-500)"}}>Arrears: ₹{b.arrears?.toLocaleString("en-IN")}</span></>}
                    </div>
                    <span className={`badge badge-${b.status==="payment_declared"?"assigned":b.status==="partial"?"in_progress":b.status}`}
                      style={{marginTop:4,display:"inline-block"}}>
                      {b.status==="payment_declared"?"🔔 DECLARED":
                       b.status==="partial"?"💰 PARTIAL":
                       b.status==="absorbed"?"📦 ABSORBED":b.status==="overdue"?"⚠️ OVERDUE":
                       b.status==="paid"?"✅ PAID":
                       "⏳ "+b.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Bill breakdown */}
                <div style={{display:"flex",gap:16,fontSize:12,color:"var(--stone-500)",
                  marginTop:6,padding:"6px 0",borderTop:"1px solid var(--stone-100)"}}>
                  <span>Rate: ₹{(b.panipatti_rate??0).toLocaleString("en-IN")}</span>
                  {b.arrears > 0 && <span style={{color:"var(--red-500)"}}>Arrears: ₹{b.arrears.toLocaleString("en-IN")}</span>}
                  <span>Due: {b.due_date}</span>
                  {b.notice_sent && <span style={{color:"var(--red-500)"}}>📨 Notice sent</span>}
                </div>

                {/* Unconfirmed declared payments */}
                {(b.payments||[]).filter(p=>!p.is_confirmed).map(p=>(
                  <div key={p.id} style={{background:"var(--amber-50)",border:"1px solid var(--amber-200)",
                    borderRadius:8,padding:10,marginTop:8}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--amber-700)"}}>
                      🔔 Citizen declared ₹{p.amount?.toLocaleString("en-IN")} on {p.paid_date}
                    </div>
                    <button className="btn-success" style={{marginTop:6,fontSize:12}}
                      onClick={()=>confirmPayment(b.id, p.id)}>
                      ✅ Confirm ₹{p.amount?.toLocaleString("en-IN")}
                    </button>
                  </div>
                ))}

                {/* Confirmed payment history */}
                {(b.payments||[]).filter(p=>p.is_confirmed).length > 0 && (
                  <div style={{fontSize:12,color:"var(--green-600)",marginTop:6}}>
                    ✅ Confirmed: {(b.payments||[]).filter(p=>p.is_confirmed).map(p=>`₹${p.amount?.toLocaleString("en-IN")} on ${p.paid_date}`).join(" + ")}
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}


// ── COMPLAINTS ────────────────────────────────────────────────
function NonInfraActions({ complaint, onResolve, onInProgress }) {
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  if (!expanded) return (
    <button className="btn-secondary" style={{fontSize:12}}
      onClick={()=>setExpanded(true)}>💬 Add Note / Resolve</button>
  );
  return (
    <div style={{background:"var(--amber-50)",border:"1px solid var(--amber-200)",
      borderRadius:10,padding:12,marginTop:8,width:"100%"}}>
      <div style={{fontSize:12,fontWeight:600,color:"var(--amber-700)",marginBottom:8}}>
        Officer Response ({complaint.complaint_type?.replace(/_/g," ")})
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3}
        placeholder="Enter your response or resolution note..."
        style={{width:"100%",fontSize:13,padding:"8px",borderRadius:8,
          border:"1px solid var(--amber-300)",marginBottom:8,resize:"vertical"}} />
      <div style={{display:"flex",gap:8}}>
        <button className="btn-success" style={{fontSize:12}}
          onClick={()=>onResolve(complaint.id, note)}>✅ Mark Resolved</button>
        <button className="btn-secondary" style={{fontSize:12}}
          onClick={()=>onInProgress(complaint.id, note)}>🔄 Mark In Progress</button>
        <button className="btn-secondary" style={{fontSize:12}}
          onClick={()=>setExpanded(false)}>Cancel</button>
      </div>
    </div>
  );
}

function ComplaintsTab({ plumbers }) {
  const [complaints, setComplaints] = useState([]);
  const [filter, setFilter]         = useState("open");
  const [msg, setMsg]               = useState("");

  useEffect(() => {
    apiFetch(`/complaints/${filter!=="all"?`?status=${filter}`:""}`).then(setComplaints).catch(()=>{});
  }, [filter]);

  async function assign(complaintId, plumberId) {
    try {
      await apiFetch(`/complaints/${complaintId}`,{method:"PUT",
        body:JSON.stringify({status:"assigned",assigned_to:parseInt(plumberId)})});
      setMsg("✅ Assigned to plumber");
      apiFetch(`/complaints/?status=${filter}`).then(setComplaints);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function resolveWithNote(complaintId, note) {
    if (!note?.trim()) return setMsg("❌ Please enter a resolution note");
    try {
      await apiFetch(`/complaints/${complaintId}`,{method:"PUT",
        body:JSON.stringify({status:"resolved", resolution_note: note.trim(), officer_note: note.trim()})});
      setMsg("✅ Complaint resolved");
      apiFetch(`/complaints/?status=${filter}`).then(setComplaints);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  async function markInProgress(complaintId, note) {
    try {
      await apiFetch(`/complaints/${complaintId}`,{method:"PUT",
        body:JSON.stringify({status:"in_progress", officer_note: note||undefined})});
      setMsg("✅ Marked in progress");
      apiFetch(`/complaints/?status=${filter}`).then(setComplaints);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  const TYPE_ICONS = {no_supply:"🚱",low_pressure:"📉",pipe_burst:"💥",dirty_water:"🟤",billing_issue:"💰",other:"❓"};

  return (
    <div className="section">
      <h3>🛠 Complaint Management</h3>
      <div className="alert-banner alert-yellow" style={{marginBottom:12,fontSize:12}}>
        ⚠️ Only infra complaints (pipe burst, no supply, low pressure, dirty water) can be assigned to plumbers. Billing issues handled at office level.
      </div>
      {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
      <div className="category-chips" style={{marginBottom:14}}>
        {["all","open","assigned","in_progress","resolved"].map(s=>(
          <button key={s} className={`chip ${filter===s?"chip-active":""}`} onClick={()=>setFilter(s)}>{s}</button>
        ))}
      </div>
      {complaints.length===0
        ? <div className="empty">No complaints</div>
        : complaints.map(c=>(
          <div key={c.id} className="card">
            <div className="card-header">
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:20}}>{TYPE_ICONS[c.complaint_type]||"❓"}</span>
                <div>
                  <div className="card-title">{c.complaint_type?.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</div>
                  <div className="card-meta">WO: {c.work_order_no} &bull; Ward {c.ward_id} &bull; Filed by: {c.filed_by||"—"}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <span className={`badge badge-${c.status}`}>{c.status.toUpperCase()}</span>
                <span className="badge" style={{background:"var(--amber-50)",color:"var(--amber-700)",border:"1px solid var(--amber-200)"}}>P{c.priority_score}</span>
              </div>
            </div>
            <div className="card-body">{c.description}</div>

            {/* Photo — visible to officer */}
            {c.photo_url && (
              <div style={{marginTop:8}}>
                <a href={c.photo_url} target="_blank" rel="noreferrer">
                  <img src={c.photo_url} alt="complaint"
                    style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:10,cursor:"pointer"}} />
                </a>
                <div style={{fontSize:11,color:"var(--stone-400)",marginTop:2}}>Click to view full image</div>
              </div>
            )}

            {/* Assigned plumber display */}
            {c.assigned_plumber_name && (
              <div style={{marginTop:8,padding:"6px 10px",background:"rgba(14,165,233,0.08)",
                border:"1px solid rgba(14,165,233,0.2)",borderRadius:8,fontSize:12,color:"var(--blue-600)"}}>
                🔧 Assigned to: <strong>{c.assigned_plumber_name}</strong>
              </div>
            )}

            {/* Assign to plumber — only for infra types */}
            {c.status==="open" && c.is_infra && plumbers.length>0 && (
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10}}>
                <select style={{flex:1,padding:"6px 10px",borderRadius:8,fontSize:13}}
                  onChange={e=>e.target.value&&assign(c.id,e.target.value)}>
                  <option value="">Assign plumber...</option>
                  {plumbers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {(c.status==="open"||c.status==="in_progress") && !c.is_infra && (
              <NonInfraActions key={c.id} complaint={c} onResolve={resolveWithNote} onInProgress={markInProgress} />
            )}
            {c.status==="open" && c.is_infra && c.assigned_plumber_name && (
              <div style={{marginTop:6,display:"flex",gap:6}}>
                <button className="btn-success" style={{fontSize:12}}
                  onClick={()=>resolveWithNote(c.id,"Resolved by assigned plumber")}>✅ Mark Resolved</button>
              </div>
            )}
            {c.resolution_note && (
              <div style={{marginTop:8,padding:"6px 10px",background:"rgba(34,197,94,0.08)",
                borderRadius:8,fontSize:12,color:"var(--green-600)"}}>✅ {c.resolution_note}</div>
            )}
          </div>
        ))}
    </div>
  );
}

// ── SERVICE REQUESTS ──────────────────────────────────────────
function ServiceRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter]     = useState("pending");
  const [msg, setMsg]           = useState("");

  useEffect(() => {
    apiFetch(`/service-requests/?status=${filter}`).then(setRequests).catch(()=>{});
  }, [filter]);

  async function process(id, approved, note="") {
    try {
      await apiFetch("/service-requests/process",{method:"POST",
        body:JSON.stringify({request_id:id,approved,officer_note:note||undefined})});
      setMsg(approved?"✅ Request approved":"✅ Request rejected");
      apiFetch(`/service-requests/?status=${filter}`).then(setRequests);
    } catch(e) { setMsg("❌ "+e.message); }
  }

  const TYPE_ICONS = {name_transfer:"👤",temp_disconnection:"⏸️",perm_disconnection:"🔴",reconnection:"🔄",pipe_size_change:"🔧"};

  return (
    <div className="section">
      <h3>📝 Service Requests</h3>
      {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
      <div className="category-chips" style={{marginBottom:14}}>
        {["pending","in_progress","completed","rejected"].map(s=>(
          <button key={s} className={`chip ${filter===s?"chip-active":""}`} onClick={()=>setFilter(s)}>{s}</button>
        ))}
      </div>
      {requests.length===0
        ? <div className="empty">No requests</div>
        : requests.map(r=>(
          <div key={r.id} className="card">
            <div className="card-header">
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:20}}>{TYPE_ICONS[r.request_type]||"📝"}</span>
                <div>
                  <div className="card-title">{r.request_type?.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</div>
                  <div className="card-meta">{r.consumer_name} — {r.property_number || r.connection_number} &bull; Ward {r.ward_id}</div>
                </div>
              </div>
              <span className={`badge badge-${r.status}`}>{r.status.toUpperCase()}</span>
            </div>
            {r.description && <div className="card-body">{r.description}</div>}
            {r.new_owner_name && <div style={{fontSize:13,marginTop:4,color:"var(--stone-600)"}}>👤 New Owner: <strong>{r.new_owner_name}</strong> {r.new_owner_phone && `| 📞 ${r.new_owner_phone}`}</div>}
            {r.document_url && <a href={r.document_url} target="_blank" rel="noreferrer" className="btn-secondary" style={{display:"inline-block",marginTop:6,fontSize:11,padding:"3px 10px"}}>📄 View Document</a>}
            {r.has_unpaid_bills && (
              <div className="alert-banner alert-red" style={{marginTop:8,marginBottom:4}}>
                ⚠️ This citizen has unpaid bills. Disconnection cannot be approved until dues are cleared.
              </div>
            )}
            {r.officer_note && <div style={{marginTop:6,fontSize:12,color:"var(--stone-500)"}}>Note: {r.officer_note}</div>}
            {r.status==="pending" && (
              <div className="btn-row" style={{marginTop:10}}>
                <button className="btn-success" style={{fontSize:12}}
                  onClick={()=>{
                    const note=prompt("Officer note (optional):")||"";
                    process(r.id,true,note);
                  }}>✅ Approve</button>
                <button className="btn-danger" style={{fontSize:12}}
                  onClick={()=>{const note=prompt("Rejection reason:");if(note)process(r.id,false,note);}}>❌ Reject</button>
              </div>
            )}
            <div className="card-meta" style={{marginTop:6}}>{r.created_at?new Date(r.created_at).toLocaleDateString("en-IN"):""}</div>
          </div>
        ))}
    </div>
  );
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────
function AnnouncementTab({ wards }) {
  const [form, setForm] = useState({title:"",message:"",target_wards:[],ann_type:"general",send_sms:false});
  const [msg, setMsg]   = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [anns, setAnns] = useState([]);

  useEffect(()=>{ apiFetch("/announcements/").then(setAnns).catch(()=>{}); },[]);

  function toggleWard(id) {
    setForm(p=>({...p,target_wards:p.target_wards.includes(id)?p.target_wards.filter(w=>w!==id):[...p.target_wards,id]}));
  }

  const targetWardsStr = form.target_wards.length===0 ? "all" : form.target_wards.join(",");

  async function aiSuggest() {
    setSuggesting(true); setSuggestion(null);
    try {
      const data = await apiFetch("/announcements/ai-suggest",{method:"POST",
        body:JSON.stringify({ward_id:form.target_wards.length===1?form.target_wards[0]:null})});
      setSuggestion(data);
    } catch(e) { setMsg("❌ AI suggestion failed"); }
    finally { setSuggesting(false); }
  }

  async function submit() {
    if (!form.title||!form.message) return setMsg("❌ Title and message required");
    try {
      const payload = {...form, target_wards: targetWardsStr};
      const data = await apiFetch("/announcements/",{method:"POST",body:JSON.stringify(payload)});
      let m="✅ Announcement posted!";
      if(data.sms_sent) m+=` 📱 SMS to ${data.sms_count} citizens.`;
      setMsg(m);
      setForm({title:"",message:"",target_wards:[],ann_type:"general",send_sms:false});
      apiFetch("/announcements/").then(setAnns).catch(()=>{});
    } catch(e) { setMsg("❌ "+e.message); }
  }

  return (
    <div>
      <div className="section">
        <h3>📢 Post Announcement</h3>
        {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
        <div className="ai-suggestion">
          <h4>🤖 AI Announcement Suggester</h4>
          <button className="btn-ai" onClick={aiSuggest} disabled={suggesting}>
            {suggesting?"🤖 Analysing...":"✨ AI Suggestion"}
          </button>
          {suggestion && (
            <div style={{marginTop:10,background:"rgba(255,255,255,0.6)",borderRadius:10,padding:12}}>
              <div style={{fontWeight:700,fontSize:13,color:"var(--amber-700)",marginBottom:4}}>{suggestion.title}</div>
              <div style={{fontSize:13,color:"var(--stone-600)"}}>{suggestion.message}</div>
              <button className="btn-primary" style={{marginTop:8,fontSize:12}}
                onClick={()=>{setForm(p=>({...p,title:suggestion.title,message:suggestion.message}));setSuggestion(null);}}>
                ✅ Use This
              </button>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Title</label>
          <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Announcement title" />
        </div>
        <div className="form-group">
          <label>Message</label>
          <textarea value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} rows={4} />
        </div>
        <div className="form-group">
          <label>Target Ward(s) — leave blank for all wards</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:6,marginTop:6}}>
            {wards.map(w=>(
              <label key={w.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
                background:form.target_wards.includes(w.id)?"var(--amber-100)":"var(--glass-bg)",
                border:`1.5px solid ${form.target_wards.includes(w.id)?"var(--amber-400)":"var(--glass-border)"}`,
                borderRadius:8,cursor:"pointer",fontSize:12}}>
                <input type="checkbox" checked={form.target_wards.includes(w.id)}
                  onChange={()=>toggleWard(w.id)} style={{width:"auto",margin:0}} />
                Ward {w.ward_no} — {w.ward_name}
              </label>
            ))}
          </div>
          {form.target_wards.length===0 && <div style={{fontSize:11,color:"var(--stone-400)",marginTop:4}}>No wards selected = sent to all wards</div>}
        </div>
        <div className="form-row">
          <div className="form-group"><label>Type</label>
            <select value={form.ann_type} onChange={e=>setForm(p=>({...p,ann_type:e.target.value}))}>
              {["general","maintenance","emergency","festival"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:20}}>
              <input type="checkbox" checked={form.send_sms} onChange={e=>setForm(p=>({...p,send_sms:e.target.checked}))} style={{width:"auto",margin:0}} />
              📱 Send SMS via Twilio
            </label>
          </div>
        </div>
        <button className="btn-primary" onClick={submit}>📢 Post</button>
      </div>
      <div className="section">
        <h3>📋 Recent Announcements</h3>
        {anns.length===0?<div className="empty">No announcements</div>:anns.map(a=>(
          <div key={a.id} className="ann-card">
            <h4>{a.title}</h4><p>{a.message}</p>
            <div className="ann-meta">
              {new Date(a.created_at).toLocaleDateString("en-IN")} &bull;
              {a.target_wards==="all"?" All wards":" Wards: "+a.target_wards}
              {a.sms_sent && <> &bull; 📱 SMS to {a.sms_count}</>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RATES ─────────────────────────────────────────────────────
function RatesTab() {
  const [rates, setRates]       = useState([]);
  const [search, setSearch]     = useState("");
  const [editing, setEditing]   = useState(null);
  const [editVal, setEditVal]   = useState("");
  const [msg, setMsg]           = useState("");

  useEffect(()=>{ apiFetch("/billing/rates").then(setRates).catch(()=>{}); },[]);

  async function saveRate(rateId) {
    try {
      await apiFetch(`/billing/rates/${rateId}`,{method:"PUT",
        body:JSON.stringify({rate_key:editing.rate_key, rate_value:parseFloat(editVal)})});
      setMsg("✅ Rate updated — affects all new bills generated after this");
      apiFetch("/billing/rates").then(setRates);
      setEditing(null); setEditVal("");
    } catch(e) { setMsg("❌ "+e.message); }
  }

  // Group rates for display
  const panipatti    = rates.filter(r=>r.rate_key.startsWith("panipatti_"));
  const deposits     = rates.filter(r=>r.rate_key.startsWith("deposit_"));
  const fitting      = rates.filter(r=>r.rate_key.startsWith("fitting_"));
  const maintenance  = rates.filter(r=>r.rate_key.startsWith("maintenance_"));
  const construction = rates.filter(r=>r.rate_key.startsWith("construction_"));
  const other        = rates.filter(r=>["pipe_distance_per_meter"].includes(r.rate_key));

  const filtered = search
    ? rates.filter(r=>r.rate_key.includes(search.toLowerCase()))
    : null;

  function RateRow({r}) {
    const isEditing = editing?.id === r.id;
    return (
      <tr key={r.id}>
        <td style={{fontFamily:"monospace",fontSize:12}}>{r.rate_key}</td>
        <td style={{fontSize:11,color:"var(--stone-400)",maxWidth:200}}>{r.description}</td>
        {isEditing ? (
          <>
            <td><input type="number" value={editVal} onChange={e=>setEditVal(e.target.value)}
              style={{width:90,padding:"4px 6px"}} autoFocus /></td>
            <td style={{display:"flex",gap:4}}>
              <button className="btn-success" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>saveRate(r.id)}>Save</button>
              <button className="btn-secondary" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>{setEditing(null);setEditVal("");}}>✕</button>
            </td>
          </>
        ) : (
          <>
            <td style={{fontWeight:700,color:"var(--amber-700)"}}>
              {r.rate_key.startsWith("construction_") ? `×${r.rate_value}` : `₹${r.rate_value?.toLocaleString("en-IN")}`}
            </td>
            <td><button className="btn-secondary" style={{fontSize:11,padding:"4px 8px"}}
              onClick={()=>{setEditing(r);setEditVal(r.rate_value);}}>✏️ Edit</button></td>
          </>
        )}
      </tr>
    );
  }

  function RateGroup({title, rows}) {
    if (!rows || rows.length===0) return null;
    return (
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:"var(--amber-700)",marginBottom:8,borderBottom:"2px solid var(--amber-200)",paddingBottom:4}}>{title}</div>
        <table className="data-table">
          <thead><tr><th>Rate Key</th><th>Description</th><th>Value</th><th>Action</th></tr></thead>
          <tbody>{rows.map(r=><RateRow key={r.id} r={r}/>)}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="section">
        <h3>💴 All System Rates</h3>
        <div className="alert-banner alert-yellow" style={{marginBottom:12}}>
          ⚠️ Rate changes affect all <strong>new bills generated after the change</strong>. Already-generated bills are not affected — they store a snapshot of the rate at generation time.
        </div>
        {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Search rate key..." style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"1px solid var(--stone-200)",marginBottom:16}} />
        {search ? (
          <RateGroup title={`Search results for "${search}"`} rows={filtered} />
        ) : (<>
          <RateGroup title="📋 Annual Panipatti Rates (₹/year)" rows={panipatti} />
          <RateGroup title="💰 One-time Deposit (refundable)" rows={deposits} />
          <RateGroup title="🔧 Fitting Charges (by pipe size)" rows={fitting} />
          <RateGroup title="🛠️ Maintenance Charges (by pipe size)" rows={maintenance} />
          <RateGroup title="🏗️ Construction Multipliers" rows={construction} />
          <RateGroup title="📏 Other Charges" rows={other} />
        </>)}
      </div>
    </div>
  );
}


// ── STAFF ─────────────────────────────────────────────────────
function StaffTab() {
  const [staff, setStaff] = useState([]);
  const [form, setForm]   = useState({name:"",email:"",role:"plumber",phone:""});
  const [msg, setMsg]     = useState("");

  useEffect(()=>{ apiFetch("/users/staff").then(setStaff).catch(()=>{}); },[]);

  async function createStaff() {
    try {
      await apiFetch("/users/create-staff",{method:"POST",body:JSON.stringify(form)});
      setMsg("✅ Account created! Initial password = email");
      apiFetch("/users/staff").then(setStaff);
      setForm({name:"",email:"",role:"plumber",phone:""});
    } catch(e) { setMsg("❌ "+e.message); }
  }

  return (
    <div>
      <div className="section">
        <h3>👥 Create Staff Account</h3>
        {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
        <div className="form-row">
          <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} /></div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Role</label>
            <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
              <option value="plumber">Plumber</option>
              <option value="corporator">Corporator</option>
              <option value="officer">Officer</option>
            </select>
          </div>
          <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} /></div>
        </div>
        <button className="btn-primary" onClick={createStaff}>Create Account</button>
      </div>
      <div className="section">
        <h3>📋 Staff Members</h3>
        {staff.length===0?<div className="empty">No staff</div>:staff.map(s=>(
          <div key={s.id} className="card">
            <div className="card-header">
              <div className="card-title">{s.name}</div>
              <span className={`badge badge-${s.role==="plumber"?"assigned":s.role==="officer"?"active":"in_progress"}`}>{s.role.toUpperCase()}</span>
            </div>
            <div className="card-body">{s.email} {s.phone&&`• ${s.phone}`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
