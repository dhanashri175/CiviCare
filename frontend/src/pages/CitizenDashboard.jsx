import { useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchBlob, useAuth } from "../App";

const CLOUDINARY_CLOUD  = "dc3zbx1as";
const CLOUDINARY_PRESET = "jalsetu_upload";

// Marathi / English strings for this page
const P = {
  en: {
    loadingPortal: "Loading your portal...",
    citizenPortal: "💧 Citizen Portal",
    ward: "Ward",
    outstandingBill: "outstanding bill",
    due: "Due",
    tabs: [["home","🏠 Home"],["connection","🔗 Connection"],["bills","💰 Bills"],
           ["complaints","📋 Complaints"],["services","🛠 Services"],["chatbot","🤖 Assistant"]],
    todaySupply: "Today's Water Supply",
    daysSupplied: "Days Supplied (30d)",
    supplyScore: "Supply Score",
    waterStress: "Water Stress",
    announcements: "📢 Announcements",
    noAnnouncements: "No announcements",
    smsSent: "SMS sent",
    connection: "My Water Connection",
    noConnection: "No active connection found.",
    consumerNo: "Consumer Number",
    connType: "Connection Type",
    pipeSize: "Pipe Size",
    construction: "Construction",
    taps: "No. of Taps",
    floors: "No. of Floors",
    families: "No. of Families",
    address: "Address",
    connectedSince: "Connected Since",
    bills: "💰 My Bills (Pani Pati)",
    noBills: "No bills found",
    annualBill: "Annual Bill",
    baseCharge: "Base Water Charge",
    additionalTaps: "Additional Taps",
    arrears: "Arrears",
    latePenalty: "Late Penalty (2%/mo)",
    totalPayable: "Total Payable",
    dueDate: "Due",
    paid: "Paid",
    receipt: "Receipt",
    explainIn: "Explain in:",
    downloadBill: "⬇️ Download Bill",
    downloadReceipt: "⬇️ Payment Receipt",
    explainBill: "🤖 Explain My Bill",
    explaining: "🤖 Explaining...",
    aiExplanation: "🤖 AI BILL EXPLANATION",
    fileComplaint: "➕ File a Complaint",
    problemType: "Problem Type",
    expectedResolution: "Expected resolution",
    hours: "hours",
    description: "Description",
    speakHint: "💡 Elderly citizens: tap 🎤 and speak in Marathi or Hindi",
    photoOptional: "Photo (Optional)",
    clickPhoto: "Click to add photo (optional)",
    removePhoto: "✕ Remove Photo",
    submitComplaint: "📤 File Complaint",
    uploading: "Uploading...",
    submitting: "Submitting...",
    duplicateCheck: "similar complaint(s) already filed in your ward in the last 72 hours.",
    myComplaints: "📋 My Complaints",
    noComplaints: "No complaints filed",
    resolution: "Resolution",
    services: "🛠 Raise Service Request",
    myServiceReqs: "📋 My Service Requests",
    noServiceReqs: "No service requests",
    additionalDetails: "Additional Details",
    newOwnerName: "New Owner Name",
    newOwnerPhone: "New Owner Phone",
    submitRequest: "Submit Request",
    assistantGreet: "नमस्कार! 👋 मी CiviCare Assistant आहे.",
    chatPlaceholder: "तुमचा प्रश्न विचारा... (Marathi/Hindi/English)",
    chatSuggestions: ["माझे बिल किती आहे?","पाणी कधी येणार?","तक्रार कशी करायची?"],
  },
  mr: {
    loadingPortal: "पोर्टल लोड होत आहे...",
    citizenPortal: "💧 नागरिक पोर्टल",
    ward: "वॉर्ड",
    outstandingBill: "थकबाकी बिल",
    due: "देय तारीख",
    tabs: [["home","🏠 मुख्य"],["connection","🔗 कनेक्शन"],["bills","💰 बिले"],
           ["complaints","📋 तक्रारी"],["services","🛠 सेवा"],["chatbot","🤖 सहाय्यक"]],
    todaySupply: "आजचा पाणीपुरवठा",
    daysSupplied: "दिवस पुरवठा (३०दि)",
    supplyScore: "पुरवठा स्कोर",
    waterStress: "जल ताण",
    announcements: "📢 घोषणा",
    noAnnouncements: "कोणत्याही घोषणा नाहीत",
    smsSent: "SMS पाठवला",
    connection: "माझे जल कनेक्शन",
    noConnection: "सक्रिय कनेक्शन आढळले नाही.",
    consumerNo: "ग्राहक क्रमांक",
    connType: "कनेक्शन प्रकार",
    pipeSize: "पाईप आकार",
    construction: "बांधकाम प्रकार",
    taps: "नळ संख्या",
    floors: "मजले",
    families: "कुटुंबे",
    address: "पत्ता",
    connectedSince: "कनेक्शन दिनांक",
    bills: "💰 माझी बिले (पाणी पट्टी)",
    noBills: "कोणतीही बिले आढळली नाहीत",
    annualBill: "वार्षिक बिल",
    baseCharge: "मूळ पाणीपट्टी शुल्क",
    additionalTaps: "अतिरिक्त नळ शुल्क",
    arrears: "मागील थकबाकी",
    latePenalty: "उशीर दंड (२%/महिना)",
    totalPayable: "एकूण देय",
    dueDate: "देय तारीख",
    paid: "भरणा",
    receipt: "पावती",
    explainIn: "स्पष्टीकरण भाषा:",
    downloadBill: "⬇️ बिल डाउनलोड",
    downloadReceipt: "⬇️ भरणा पावती",
    explainBill: "🤖 माझे बिल समजावा",
    explaining: "🤖 समजावत आहे...",
    aiExplanation: "🤖 AI बिल स्पष्टीकरण",
    disconnWarn: "खंडणी इशारा दिला आहे. कनेक्शन तुटणे टाळण्यासाठी तात्काळ भरणा करा.",
    fileComplaint: "➕ तक्रार नोंदवा",
    problemType: "समस्येचा प्रकार",
    expectedResolution: "अपेक्षित निराकरण",
    hours: "तास",
    description: "वर्णन",
    speakHint: "💡 वृद्ध नागरिक: 🎤 दाबा आणि मराठीत बोला",
    photoOptional: "फोटो (ऐच्छिक)",
    clickPhoto: "फोटो जोडण्यासाठी क्लिक करा",
    removePhoto: "✕ फोटो काढा",
    submitComplaint: "📤 तक्रार सादर करा",
    uploading: "अपलोड होत आहे...",
    submitting: "सादर होत आहे...",
    duplicateCheck: "सारख्या तक्रारी तुमच्या वॉर्डमध्ये गेल्या ७२ तासांत आधीच नोंदवल्या आहेत.",
    myComplaints: "📋 माझ्या तक्रारी",
    noComplaints: "कोणत्याही तक्रारी नाहीत",
    resolution: "निराकरण",
    services: "🛠 सेवा विनंती करा",
    myServiceReqs: "📋 माझ्या सेवा विनंत्या",
    noServiceReqs: "कोणत्याही सेवा विनंत्या नाहीत",
    additionalDetails: "अतिरिक्त माहिती",
    newOwnerName: "नवीन मालकाचे नाव",
    newOwnerPhone: "नवीन मालकाचा फोन",
    submitRequest: "विनंती सादर करा",
    assistantGreet: "नमस्कार! 👋 मी CiviCare सहाय्यक आहे. पाण्याच्या सेवांबद्दल मदत करतो.",
    chatPlaceholder: "तुमचा प्रश्न विचारा...",
    chatSuggestions: ["माझे बिल किती आहे?","पाणी कधी येणार?","तक्रार कशी करायची?"],
  }
};

const PIPE_LABEL = {"0.5":"½ इंच","0.75":"¾ इंच","1.0":"१ इंच","1.5":"१½ इंच"};
const PIPE_LABEL_EN = {"0.5":"½ inch","0.75":"¾ inch","1.0":"1 inch","1.5":"1½ inch"};

const COMPLAINT_TYPES_EN = [
  ["no_supply","🚱 No Water Supply"],["low_pressure","📉 Low Pressure"],
  ["pipe_burst","💥 Pipe Burst"],["dirty_water","🟤 Dirty/Discoloured Water"],
  ["billing_issue","💰 Billing Issue"],["other","❓ Other"],
];
const COMPLAINT_TYPES_MR = [
  ["no_supply","🚱 पाणी नाही"],["low_pressure","📉 कमी दाब"],
  ["pipe_burst","💥 पाईप फुटला"],["dirty_water","🟤 घाण पाणी"],
  ["billing_issue","💰 बिल समस्या"],["other","❓ इतर"],
];

const SERVICE_TYPES_EN = [
  ["name_transfer","Name Transfer"],
  ["perm_disconnection","Permanent Disconnection"],
  ["pipe_size_change","Pipe Size Change"],
];
const SERVICE_TYPES_MR = [
  ["name_transfer","नाव हस्तांतरण"],
  ["perm_disconnection","कायमची खंडणी"],
  ["pipe_size_change","पाईप आकार बदल"],
];

export default function CitizenDashboard() {
  const { user, lang } = useAuth();
  const p = P[lang] || P.en;
  const [tab, setTab] = useState("home");
  const [connections, setConnections]      = useState([]);  // all connections for this property
  const [supplyToday, setSupplyToday]     = useState(null);
  const [complaints, setComplaints]       = useState([]);
  const [allBills, setAllBills]           = useState([]);   // array of {connection_id, bills, ...}
  const [announcements, setAnnouncements] = useState([]);
  const [history, setHistory]             = useState(null);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [mustChangePwd, setMustChangePwd] = useState(user?.must_change_pwd);


  useEffect(() => {
    Promise.all([
      apiFetch("/connections/my").catch(() => []),
      apiFetch("/supply/today").catch(() => []),
      apiFetch("/complaints/my").catch(() => []),
      apiFetch("/billing/my").catch(() => []),
      apiFetch('/announcements/?ward_id=${user.ward_id}').catch(() => []),
      // apiFetch("/announcements/").catch(() => []),
      apiFetch("/service-requests/my").catch(() => []),
    ]).then(([conns, today, comps, billData, anns, srs]) => {
      const connList = Array.isArray(conns) ? conns : [];
      setConnections(connList);
      if (connList.length > 0 && today) setSupplyToday(Array.isArray(today) ? today.find(w => w.ward_id === user.ward_id) : null);
      setComplaints(comps);
      setAllBills(Array.isArray(billData) ? billData : []);
      setAnnouncements(anns);
      setServiceRequests(srs);
      if (user.ward_id)
        apiFetch(`/supply/ward/${user.ward_id}/history`).then(setHistory).catch(() => {});
    }).finally(() => setLoading(false));
  }, []);



  if (loading) return <div className="loading"><div className="loading-drop">💧</div><p>{p.loadingPortal}</p></div>;
  
  // Flatten all bills from all connections for alerts
  const allFlatBills = allBills.flatMap(cb => (cb.bills || []));
  const pendingBill  = allFlatBills.find(b => ["pending","partial","overdue"].includes(b.status));

  return (
    <div className="page">
      {/* Mandatory password change popup for new users */}
      {mustChangePwd && (
        <ChangePasswordModal onDone={() => {
          setMustChangePwd(false);
          const u = JSON.parse(localStorage.getItem("civicare_user")||"{}");
          u.must_change_pwd = false;
          localStorage.setItem("civicare_user", JSON.stringify(u));
        }} lang={lang} />
      )}
      <div className="page-header">
        <h1>{p.citizenPortal}</h1>
        <p>{user.name} &bull; Property No: <strong>{user.property_number}</strong>
          {" "}&bull;{" "}
          {connections.filter(c=>c.status==="active").length > 0
            ? `${connections.filter(c=>c.status==="active").length} active connection(s)`
            : connections.length > 0 ? "Application in progress" : "No connections yet"}
        </p>
      </div>


      {pendingBill && (
        <div className="alert-banner alert-yellow">
          ⚠️ {p.outstandingBill}: <strong>₹{pendingBill.remaining_amount?.toLocaleString("en-IN")} remaining</strong> — FY {pendingBill.billing_year}-{pendingBill.billing_year+1} &bull; Due: {pendingBill.due_date}
        </div>
      )}
      {connections.length > 0 && connections.every(c=>c.status!=="active") && (
        <div className="alert-banner alert-blue">
          📋 Your application is being processed. Check the <strong>Connection</strong> tab for current status.
        </div>
      )}

      <div className="tabs">
        {p.tabs.map(([t, l]) => (
          <button key={t} className={`tab ${tab===t?"active":""}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab==="home"       && <HomeTab supplyToday={supplyToday} history={history} announcements={announcements} p={p} />}
      {tab==="connection" && <ConnectionTab connections={connections} p={p} lang={lang} />}
      {tab==="bills"      && <BillsTab allBills={allBills} p={p} lang={lang} />}
      {tab==="complaints" && <ComplaintsTab complaints={complaints} setComplaints={setComplaints} wardId={user.ward_id} connectionId={connections.find(c=>c.status==="active")?.id} connections={connections.filter(c=>c.status==="active")} p={p} lang={lang} />}
      {tab==="services"   && <ServicesTab serviceRequests={serviceRequests} setServiceRequests={setServiceRequests} connections={connections} p={p} lang={lang} />}
      {tab==="chatbot"    && <ChatbotTab user={user} p={p} />}

    </div>
  );
}

function ChangePasswordModal({ onDone, lang }) {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const isMr = lang === "mr";

  async function submit() {
    setMsg("");
    if (newPwd.length < 6) return setMsg(isMr ? "नवीन पासवर्ड किमान 6 अक्षरांचा असावा." : "New password must be at least 6 characters.");
    if (newPwd !== confirm) return setMsg(isMr ? "पासवर्ड जुळत नाही." : "Passwords do not match.");
    try {
      await apiFetch("/auth/change-password",{method:"POST",body:JSON.stringify({old_password:oldPwd,new_password:newPwd})});
      setSuccess(true);
      setTimeout(() => onDone(), 1500);
    } catch(e) { setMsg(e.message); }
  }

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.6)",
      zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
      <div style={{background:"white",borderRadius:16,padding:"32px 28px",maxWidth:420,width:"100%",
        boxShadow:"0 20px 60px rgba(0,0,0,0.3)",position:"relative"}}>
        {success ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <h3 style={{color:"var(--green-600)",margin:0}}>{isMr ? "पासवर्ड यशस्वीरित्या बदलला!" : "Password changed successfully!"}</h3>
          </div>
        ) : (
          <>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:36,marginBottom:8}}>🔒</div>
              <h3 style={{margin:"0 0 6px 0",fontSize:18}}>{isMr ? "पासवर्ड बदला" : "Change Your Password"}</h3>
              <p style={{fontSize:13,color:"var(--stone-500)",margin:0}}>
                {isMr ? "सुरक्षिततेसाठी तुमचा पासवर्ड बदलणे आवश्यक आहे." : "You must change your password before continuing."}
              </p>
              <p style={{fontSize:12,color:"var(--stone-400)",margin:"6px 0 0"}}>
                {isMr ? "तुमचा प्रॉपर्टी नंबर हा सुरुवातीचा पासवर्ड आहे." : "Your property number is your initial password."}
              </p>
            </div>
            {msg && <div className="error-box" style={{marginBottom:12}}>{msg}</div>}
            <div className="form-group">
              <label>{isMr ? "सध्याचा पासवर्ड" : "Current Password"}</label>
              <input type="password" value={oldPwd} onChange={e=>setOldPwd(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label>{isMr ? "नवीन पासवर्ड" : "New Password"} (min 6 chars)</label>
              <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{isMr ? "पासवर्ड पुन्हा टाका" : "Confirm New Password"}</label>
              <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&submit()} />
            </div>
            <button className="btn-primary full-width" onClick={submit}>
              {isMr ? "पासवर्ड बदला" : "Change Password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function HomeTab({ supplyToday, history, announcements, p }) {
  const statusIcon = { supplied:"✅", maintenance:"🔧", pipe_burst:"💥", shortage:"⛔", not_logged:"⏳" };
  return (
    <div>
      <div className={`supply-status-card ${supplyToday?.status || "not_logged"}`}>
        <div className="supply-icon">{statusIcon[supplyToday?.status] || "⏳"}</div>
        <div className="supply-info">
          <h3>{p.todaySupply}</h3>
          <p>{supplyToday?.status==="supplied"
            ? `${supplyToday.supply_start} — ${supplyToday.supply_duration} min`
            : supplyToday?.reason || "—"}</p>
        </div>
      </div>
      {history && (
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-icon">📅</div><div className="stat-value">{history.days_supplied}</div><div className="stat-label">{p.daysSupplied}</div></div>
          <div className="stat-card"><div className="stat-icon">📊</div><div className="stat-value">{history.supply_score}%</div><div className="stat-label">{p.supplyScore}</div></div>
          <div className="stat-card"><div className="stat-icon">🌊</div><div className="stat-value" style={{fontSize:18,textTransform:"capitalize"}}>{history.stress_level}</div><div className="stat-label">{p.waterStress}</div></div>
        </div>
      )}
      <div className="section">
        <h3>{p.announcements}</h3>
        {announcements.length===0
          ? <div className="empty"><div className="empty-icon">📭</div>{p.noAnnouncements}</div>
          : announcements.slice(0,5).map(a=>(
            <div key={a.id} className="ann-card">
              <h4>{a.title}</h4><p>{a.message}</p>
              <div className="ann-meta">{new Date(a.created_at).toLocaleDateString("en-IN")} {a.sms_sent && `• 📱 ${p.smsSent}`}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function CitizenPayChargesPanel({ conn }) {
  const [declaring, setDeclaring] = useState(false);
  const [msg, setMsg]             = useState("");
  const [done, setDone]           = useState(false);

  async function pay() {
    setDeclaring(true); setMsg("");
    try {
      const res = await apiFetch("/connections/declare-charge-payment", {
        method: "POST",
        body: JSON.stringify({ connection_id: conn.id, amount: conn.total_connection_charges })
      });
      setDone(true);
      setMsg(`✅ Payment declared! Officer will verify and activate your connection.`);
    } catch(e) { setMsg("❌ "+e.message); }
    finally { setDeclaring(false); }
  }

  if (done) return (
    <div className="alert-banner alert-blue" style={{marginTop:8}}>
      🔔 Payment declared. Officer will verify and activate your connection shortly.
    </div>
  );

  return (
    <div style={{background:"rgba(22,163,74,0.06)",border:"1.5px solid rgba(22,163,74,0.3)",
      borderRadius:12,padding:16,marginTop:12}}>
      <div style={{fontWeight:700,color:"var(--green-700)",marginBottom:8,fontSize:14}}>
        💳 Pay Connection Charges
      </div>
      <div style={{fontSize:13,color:"var(--stone-700)",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px",fontSize:12,marginBottom:8}}>
          <span style={{color:"var(--stone-500)"}}>Deposit (refundable):</span>
          <strong>₹{conn.deposit_amount?.toLocaleString("en-IN")}</strong>
          <span style={{color:"var(--stone-500)"}}>Fitting charges:</span>
          <strong>₹{conn.fitting_charges?.toLocaleString("en-IN")}</strong>
          <span style={{color:"var(--stone-500)"}}>Maintenance charges:</span>
          <strong>₹{conn.maintenance_charges?.toLocaleString("en-IN")}</strong>
          {conn.pipe_distance_charges > 0 && <>
            <span style={{color:"var(--stone-500)"}}>Pipe distance charges:</span>
            <strong>₹{conn.pipe_distance_charges?.toLocaleString("en-IN")}</strong>
          </>}
          <span style={{color:"var(--green-700)",fontWeight:700}}>Total:</span>
          <strong style={{color:"var(--green-700)",fontSize:15}}>₹{conn.total_connection_charges?.toLocaleString("en-IN")}</strong>
        </div>
        <div style={{fontSize:11,color:"var(--stone-400)"}}>
          Deposit ₹{conn.deposit_amount?.toLocaleString("en-IN")} is refundable when you request permanent disconnection.
        </div>
      </div>
      {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:10,fontSize:13}}>{msg}</div>}
      <div className="alert-banner alert-yellow" style={{marginBottom:10,fontSize:12}}>
        ⚠️ This is a <strong>one-time connection charge</strong>. Full payment is required — partial payments are not accepted.
      </div>
      <button className="btn-success" onClick={pay} disabled={declaring} style={{width:"100%"}}>
        {declaring ? "⏳ Processing..." : `💳 Pay ₹${conn.total_connection_charges?.toLocaleString("en-IN")} — Full Payment`}
      </button>
      <div style={{fontSize:11,color:"var(--stone-400)",marginTop:6,textAlign:"center"}}>
        Once you pay, the officer will verify and activate your connection.
      </div>
    </div>
  );
}

function ConnectionTab({ connections, p, lang }) {
  const PL = {"0.5":"½ inch","0.75":"¾ inch","1.0":"1 inch","1.5":"1½ inch"};

  const STATUS_DESC = {
    applied:         { icon:"📋", color:"blue",   label:"Application Received",   desc:"Your application has been received. An officer will schedule an inspection." },
    inspection:      { icon:"🔍", color:"yellow", label:"Inspection Done",         desc:"Site inspection completed. Please pay the one-time connection charges below to proceed." },
    payment_pending: { icon:"💳", color:"yellow", label:"Payment Declared",          desc:"Your payment has been declared. Officer will verify and activate your connection." },
    active:          { icon:"💧", color:"green",  label:"Connection Active",        desc:"Your water connection is active." },
    rejected:        { icon:"❌", color:"red",    label:"Application Rejected",     desc:"Your application was rejected. Please contact the office." },
  };

  if (!connections || connections.length === 0)
    return (
      <div className="section">
        <div className="empty">
          <div className="empty-icon">🔌</div>
          <p>{p.noConnection}</p>
        </div>
      </div>
    );

  return (
    <div>
      {connections.map((conn, idx) => {
        const si = STATUS_DESC[conn.status] || STATUS_DESC.applied;
        const isActive = conn.status === "active";
        return (
          <div key={conn.id} className="section" style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h3>🔌 {conn.connection_type === "domestic" ? "Domestic" : "Commercial"} Connection {idx+1}</h3>
              <span className={`badge badge-${conn.status === "payment_pending" ? "overdue" : conn.status}`}>
                {si.icon} {si.label}
              </span>
            </div>

            {/* Status banner for non-active */}
            {!isActive && (
              <div style={{
                background: si.color==="green" ? "rgba(22,163,74,0.06)" :
                            si.color==="red"   ? "rgba(220,38,38,0.06)" :
                            si.color==="yellow"? "rgba(245,158,11,0.08)" : "rgba(59,130,246,0.06)",
                border: `1px solid ${si.color==="green"?"rgba(22,163,74,0.3)":si.color==="red"?"rgba(220,38,38,0.3)":si.color==="yellow"?"rgba(245,158,11,0.3)":"rgba(59,130,246,0.3)"}`,
                borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:13,
                color: si.color==="yellow"?"var(--amber-800)":si.color==="red"?"var(--red-700)":"var(--blue-700)"
              }}>
                {si.desc}
                {(conn.status === "inspection" || conn.status === "payment_pending") && conn.total_connection_charges > 0 && (
                  <div style={{marginTop:6,fontWeight:700}}>
                    Amount to pay: ₹{conn.total_connection_charges?.toLocaleString("en-IN")}
                    {conn.deposit_amount > 0 && ` (includes refundable deposit of ₹${conn.deposit_amount?.toLocaleString("en-IN")})`}
                  </div>
                )}
                {conn.rejection_reason && (
                  <div style={{marginTop:6,fontWeight:600}}>Reason: {conn.rejection_reason}</div>
                )}
              </div>
            )}

            {/* Connection details */}
            {[
              isActive && ["Connection No.", conn.connection_number],
              ["Application ID", `#${conn.id}` + (isActive ? "" : " (use this to track your application)")],
              ["Type", conn.connection_type === "domestic" ? "Domestic" : "Commercial"],
              ["Pipe Size", PL[conn.pipe_size] || conn.pipe_size],
              ["Address", conn.address],
              isActive && ["Connected Since", conn.connected_at ? new Date(conn.connected_at).toLocaleDateString("en-IN") : "—"],
              isActive && conn.deposit_amount > 0 && ["Deposit Paid", `₹${conn.deposit_amount?.toLocaleString("en-IN")} (refundable on disconnection)`],
              !isActive && ["Applied On", conn.created_at ? new Date(conn.created_at).toLocaleDateString("en-IN") : "—"],
              !isActive && conn.inspection_date && ["Inspection Date", new Date(conn.inspection_date).toLocaleDateString("en-IN")],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",
                borderBottom:"1px solid var(--stone-100)",fontSize:14}}>
                <span style={{color:"var(--stone-500)"}}>{label}</span>
                <strong style={{color:"var(--stone-800)",maxWidth:"60%",textAlign:"right"}}>{val}</strong>
              </div>
            ))}

            {/* Pay connection charges — shown after inspection */}
            {conn.status === "inspection" && conn.total_connection_charges > 0 && (
              <CitizenPayChargesPanel conn={conn} />
            )}
            {conn.status === "payment_pending" && (
              <div className="alert-banner alert-blue" style={{marginTop:12}}>
                🔔 Payment declared. Officer will verify and activate your connection shortly.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BillsTab({ allBills, p, lang }) {
  const [declaring, setDeclaring]     = useState(null);
  const [declareAmt, setDeclareAmt]   = useState("");
  const [declareMsg, setDeclareMsg]   = useState("");
  const [downloading, setDownloading] = useState(null);
  const [explaining, setExplaining]   = useState(null);
  const [explanation, setExplanation] = useState({});
  const [explainLang, setExplainLang] = useState(lang==="mr"?"marathi":"english");

  const connectionGroups = Array.isArray(allBills) ? allBills : [];
  const LANG_OPTIONS = [["marathi","मराठी"],["hindi","हिंदी"],["english","English"]];

  async function downloadPDF(billId, type) {
    setDownloading(`${type}-${billId}`);
    try {
      const blob = await apiFetchBlob(`/billing/${type}/${billId}`);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a"); a.href=url;
      a.download = `CiviCare_Bill_${billId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert("Download failed: "+e.message); }
    finally { setDownloading(null); }
  }

  async function declarePayment(billId, amount) {
    setDeclaring(billId); setDeclareMsg("");
    try {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) { setDeclareMsg("❌ Enter a valid amount"); setDeclaring(null); return; }
      await apiFetch("/billing/declare-payment",{method:"POST",body:JSON.stringify({bill_id:billId,amount:amt})});
      setDeclareMsg(`✅ Payment of ₹${amt.toLocaleString("en-IN")} declared. Officer will confirm.`);
      setDeclareAmt("");
    } catch(e) { setDeclareMsg("❌ "+e.message); }
    finally { setDeclaring(null); }
  }

  async function explainBill(billId) {
    setExplaining(billId);
    try {
      const data = await apiFetch("/billing/ai-explain",{method:"POST",body:JSON.stringify({bill_id:billId,language:explainLang})});
      setExplanation(prev=>({...prev,[billId]:data.explanation}));
    } catch { setExplanation(prev=>({...prev,[billId]:"Unable to explain at this time."})); }
    finally { setExplaining(null); }
  }

  if (connectionGroups.length === 0)
    return <div className="section"><div className="empty"><div className="empty-icon">🧾</div>{p.noBills}</div></div>;

  return (
    <div>
      {declareMsg && <div className={declareMsg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{declareMsg}</div>}
      {connectionGroups.map(group => (
        <div key={group.connection_id} className="section" style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h3>🧾 {p.bills} — {group.connection_number}</h3>
            <span style={{fontSize:12,color:"var(--stone-500)",textTransform:"capitalize"}}>{group.connection_type} · {group.pipe_size}"</span>
          </div>
          {group.oldest_unpaid_year && (
            <div className="alert-banner alert-red" style={{marginBottom:12}}>
              ⚠️ Oldest unpaid bill: FY {group.oldest_unpaid_year}. Please clear older bills first.
            </div>
          )}
          {(group.bills || []).length === 0
            ? <div className="empty">{p.noBills}</div>
            : (group.bills || []).filter(b => b.status !== "absorbed").map(b => (
            <div key={b.id} className="bill-card">
              <div className="card-header">
                <div>
                  <div className="bill-amount">₹{b.remaining_amount?.toLocaleString("en-IN")} <span style={{fontSize:13,fontWeight:400,color:"var(--stone-400)"}}>remaining</span></div>
                  <div className="bill-year">{p.annualBill} {b.billing_year}-{b.billing_year+1}</div>
                </div>
                <span className={`badge badge-${b.status==="payment_declared"?"assigned":b.status}`}>
                  {b.status==="payment_declared"?"🔔 DECLARED":
                   b.status==="partial"?"💰 PARTIAL":
                   b.status.toUpperCase()}
                </span>
              </div>

              {/* Bill breakdown */}
              <div className="bill-breakdown">
                {[
                  [p.baseCharge, b.panipatti_rate],
                  b.construction_factor && b.construction_factor!==1 && [`× Construction Factor (${b.construction_factor})`, b.adjusted_panipatti],
                  b.arrears > 0 && ["Arrears (prev year unpaid)", b.arrears],
                  ["Total Bill", b.total_amount],
                  b.amount_paid > 0 && ["Paid So Far", `-₹${b.amount_paid?.toLocaleString("en-IN")}`],
                ].filter(Boolean).map(([label, val]) => (
                  <div key={label} className="bill-row">
                    <span>{label}</span>
                    <span style={{color: label==="Paid So Far" ? "var(--green-600)" : undefined}}>
                      {label==="Paid So Far" ? val : `₹${typeof val === "number" ? val.toLocaleString("en-IN") : val}`}
                    </span>
                  </div>
                ))}
                <div className="bill-row" style={{borderTop:"2px solid var(--amber-200)",paddingTop:6}}>
                  <span><strong>Balance Due</strong></span>
                  <strong style={{color: b.remaining_amount > 0 ? "var(--red-600)" : "var(--green-600)"}}>
                    ₹{b.remaining_amount?.toLocaleString("en-IN")}
                  </strong>
                </div>
              </div>

              <div style={{fontSize:12,color:"var(--stone-400)",marginBottom:10}}>
                {p.dueDate}: {b.due_date}
              </div>

              {b.notice_sent && b.status!=="paid" && (
                <div className="alert-banner alert-red" style={{marginBottom:10}}>
                  ⚠️ NOTICE: Bill overdue. Unpaid balance will be added as arrears next year.
                </div>
              )}
              {b.status==="payment_declared" && (
                <div className="alert-banner alert-blue" style={{marginBottom:10}}>
                  🔔 Payment declared. Awaiting officer confirmation.
                </div>
              )}

              {/* Payment history */}
              {(b.payments || []).filter(p2=>p2.is_confirmed).length > 0 && (
                <div style={{background:"var(--green-50,#f0fdf4)",border:"1px solid #bbf7d0",borderRadius:8,padding:10,marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--green-700)",marginBottom:6}}>✅ Payment History</div>
                  {b.payments.filter(p2=>p2.is_confirmed).map(pay=>(
                    <div key={pay.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
                      <span>{pay.paid_date}</span>
                      <span style={{fontWeight:600}}>₹{pay.amount?.toLocaleString("en-IN")}</span>
                      <code style={{fontSize:10,color:"var(--stone-400)"}}>{pay.receipt_no}</code>
                    </div>
                  ))}
                </div>
              )}

              {/* Declare payment — only if something is still owed */}
              {b.remaining_amount > 0 && b.status !== "payment_declared" && (
                <div style={{background:"var(--amber-50)",border:"1px solid var(--amber-200)",borderRadius:8,padding:10,marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--amber-700)",marginBottom:6}}>
                    💳 Declare a payment (any amount up to ₹{b.remaining_amount?.toLocaleString("en-IN")})
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input type="number" value={declaring===b.id ? declareAmt : ""}
                      onChange={e=>setDeclareAmt(e.target.value)}
                      placeholder={`Amount (max ₹${b.remaining_amount})`}
                      style={{flex:1,padding:"6px 10px",borderRadius:8,border:"1px solid var(--amber-300)"}}
                      min={1} max={b.remaining_amount} step={1}
                      onFocus={()=>setDeclaring(b.id)} />
                    <button className="btn-success" style={{fontSize:12,whiteSpace:"nowrap"}}
                      onClick={()=>declarePayment(b.id, declaring===b.id ? declareAmt : "")}
                      disabled={declaring===b.id && !declareAmt}>
                      ✅ Declare
                    </button>
                  </div>
                  <div style={{fontSize:11,color:"var(--stone-400)",marginTop:4}}>
                    Pay any amount — officer confirms. Full balance due by {b.due_date}.
                  </div>
                </div>
              )}

              {/* AI explain + download */}
              <div style={{marginBottom:8,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"var(--stone-400)"}}>{p.explainIn}</span>
                {LANG_OPTIONS.map(([v,l])=>(
                  <button key={v} className={`chip ${explainLang===v?"chip-active":""}`}
                    style={{fontSize:11}} onClick={()=>setExplainLang(v)}>{l}</button>
                ))}
              </div>
              <div className="btn-row">
                <button className="btn-download" onClick={()=>downloadPDF(b.id,"receipt")}
                  disabled={downloading===`receipt-${b.id}`}>
                  {downloading===`receipt-${b.id}`?"...":p.downloadBill}
                </button>
                {b.amount_paid > 0 && (
                  <button className="btn-download" style={{background:"linear-gradient(135deg,#16A34A,#15803D)"}}
                    onClick={()=>downloadPDF(b.id,"payment-receipt")}
                    disabled={downloading===`payment-receipt-${b.id}`}>
                    {downloading===`payment-receipt-${b.id}`?"...":p.downloadReceipt || "⬇️ Receipt"}
                  </button>
                )}
                <button className="btn-ai" onClick={()=>explainBill(b.id)} disabled={explaining===b.id}>
                  {explaining===b.id ? p.explaining : p.explainBill}
                </button>
              </div>
              {explanation[b.id] && (
                <div className="ai-explain-box">
                  <div className="ai-label">{p.aiExplanation}</div>
                  {explanation[b.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ComplaintsTab({ complaints, setComplaints, wardId, connectionId, connections, p, lang }) {
  const [ctype, setCtype]     = useState("no_supply");
  const [desc, setDesc]       = useState("");
  const [photoFile, setPhotoFile]   = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]         = useState("");
  const [duplicate, setDuplicate] = useState(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef();
  const recognitionRef = useRef(null);
  const TYPES = lang==="mr" ? COMPLAINT_TYPES_MR : COMPLAINT_TYPES_EN;
  const SLA = {"no_supply":12,"low_pressure":24,"pipe_burst":4,"dirty_water":8,"billing_issue":72,"other":48};

  useEffect(() => {
    if (!wardId) return;
    apiFetch("/complaints/duplicate-check",{method:"POST",body:JSON.stringify({complaint_type:ctype,ward_id:wardId})})
      .then(d => setDuplicate(d.is_duplicate?d:null)).catch(()=>setDuplicate(null));
  }, [ctype, wardId]);

  function toggleSpeech() {
    if (!("webkitSpeechRecognition" in window)&&!("SpeechRecognition" in window)) {
      alert("Speech recognition not supported. Please use Chrome."); return;
    }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = lang==="mr" ? "mr-IN" : "hi-IN";
    recognition.interimResults = false;
    recognition.onresult = e => setDesc(prev => prev ? prev+" "+e.results[0][0].transcript : e.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start(); setListening(true);
  }

  async function submit() {
    if (!desc.trim()) return setMsg(lang==="mr"?"कृपया समस्या वर्णन करा":"Please describe the problem");
    setSubmitting(true); setMsg("");
    try {
      let photoUrl = null;
      if (photoFile) {
        setUploading(true);
        const fd = new FormData(); fd.append("file",photoFile); fd.append("upload_preset",CLOUDINARY_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,{method:"POST",body:fd});
        const data = await res.json(); photoUrl = data.secure_url; setUploading(false);
      }
      const newC = await apiFetch("/complaints/",{method:"POST",body:JSON.stringify({complaint_type:ctype,description:desc,photo_url:photoUrl,connection_id:connectionId})});
      setComplaints(prev=>[newC,...prev]);
      setDesc(""); setPhotoFile(null); setPhotoPreview(null); setDuplicate(null);
      setMsg(`✅ ${lang==="mr"?"तक्रार नोंदवली":"Complaint filed"} | WO: ${newC.work_order_no}`);
    } catch(e) { setMsg("❌ "+e.message); }
    finally { setSubmitting(false); setUploading(false); }
  }

  return (
    <div>
      <div className="section">
        <h3>{p.fileComplaint}</h3>
        {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
        {duplicate && <div className="alert-dup">⚠️ {duplicate.complaint_count} {p.duplicateCheck}</div>}
        <div className="form-group">
          <label>{p.problemType}</label>
          <select value={ctype} onChange={e=>setCtype(e.target.value)}>
            {TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <div style={{fontSize:12,color:"var(--stone-400)",marginTop:4}}>{p.expectedResolution}: {SLA[ctype]} {p.hours}</div>
        </div>
        <div className="form-group">
          <label style={{display:"flex",alignItems:"center",gap:8}}>
            {p.description}
            <button type="button" className={`speech-btn ${listening?"listening":""}`}
              onClick={toggleSpeech} style={{padding:"4px 10px",fontSize:11}}>
              {listening ? "🔴 ..." : "🎤 "+( lang==="mr"?"बोला":"Speak")}
            </button>
          </label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4}
            placeholder={lang==="mr"?"समस्या सांगा...":"Describe the problem..."} />
          <div style={{fontSize:11,color:"var(--stone-400)",marginTop:4}}>{p.speakHint}</div>
        </div>
        <div className="form-group">
          <label>{p.photoOptional}</label>
          <div className={`upload-zone ${photoPreview?"uploaded":""}`} onClick={()=>fileRef.current.click()}>
            {photoPreview
              ? <img src={photoPreview} alt="preview" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8}} />
              : <><div className="upload-icon">📷</div><p>{p.clickPhoto}</p></>}
            <input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f));}}} />
          </div>
          {photoFile && <button className="btn-secondary" style={{marginTop:6,fontSize:12}} onClick={()=>{setPhotoFile(null);setPhotoPreview(null);}}>{p.removePhoto}</button>}
        </div>
        <button className="btn-primary" onClick={submit} disabled={submitting||uploading}>
          {uploading?p.uploading:submitting?p.submitting:p.submitComplaint}
        </button>
      </div>
      <div className="section">
        <h3>{p.myComplaints}</h3>
        {complaints.length===0
          ? <div className="empty"><div className="empty-icon">✅</div>{p.noComplaints}</div>
          : complaints.map(c=>(
            <div key={c.id} className="card">
              <div className="card-header">
                <div className="card-title">{c.complaint_type?.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</div>
                <span className={`badge badge-${c.status}`}>{c.status.replace(/_/g," ").toUpperCase()}</span>
              </div>
              <div className="card-body">{c.description}</div>
              {c.resolution_note && <div className="alert-green" style={{marginTop:8,padding:"8px 12px",fontSize:13,borderRadius:10}}>✅ {p.resolution}: {c.resolution_note}</div>}
              <div className="card-meta" style={{marginTop:8}}>WO: {c.work_order_no} &bull; P{c.priority_score}/5 &bull; {c.sla_hours}h SLA &bull; {c.created_at?new Date(c.created_at).toLocaleDateString("en-IN"):""}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function ServicesTab({ serviceRequests, setServiceRequests, connections, p, lang }) {
  const [reqType, setReqType]         = useState("name_transfer");
  const [selectedConnId, setSelectedConnId] = useState(connections?.[0]?.id || "");
  const [desc, setDesc]               = useState("");
  const [newOwnerName, setNewOwnerName]   = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [msg, setMsg]                 = useState("");
  const TYPES = lang==="mr" ? SERVICE_TYPES_MR : SERVICE_TYPES_EN;

  async function submit() {
    setMsg("");
    if (!selectedConnId) { setMsg("❌ Please select a connection"); return; }
    try {
      const data = await apiFetch("/service-requests/",{method:"POST",body:JSON.stringify({
        connection_id: parseInt(selectedConnId),
        request_type:reqType,description:desc,
        new_owner_name:newOwnerName||undefined,new_owner_phone:newOwnerPhone||undefined,
        new_owner_email:newOwnerEmail||undefined
      })});
      const updated = await apiFetch("/service-requests/my").catch(() => null);
      if (updated) setServiceRequests(updated);
      setMsg("✅ "+(lang==="mr"?"विनंती सादर केली! ID: ":"Request submitted! ID: ")+data.request_id);
      setDesc(""); setNewOwnerName(""); setNewOwnerPhone("");
    } catch(e) { setMsg("❌ "+e.message); }
  }

  return (
    <div>
      <div className="section">
        <h3>{p.services}</h3>
        {msg && <div className={msg.startsWith("✅")?"success-box":"error-box"} style={{marginBottom:12}}>{msg}</div>}
        {connections && connections.length > 1 && (
          <div className="form-group">
            <label>{lang==="mr"?"कनेक्शन निवडा":"Select Connection"} <span className="required">*</span></label>
            <select value={selectedConnId} onChange={e=>setSelectedConnId(e.target.value)}>
              {connections.map(conn=>(
                <option key={conn.id} value={conn.id}>
                  {conn.connection_number} — {conn.connection_type} ({conn.pipe_size}")
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group"><label>{lang==="mr"?"विनंतीचा प्रकार":"Request Type"}</label>
          <select value={reqType} onChange={e=>setReqType(e.target.value)}>
            {TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {reqType==="name_transfer" && (
          <>
            <div className="form-row">
              <div className="form-group"><label>{p.newOwnerName} *</label><input value={newOwnerName} onChange={e=>setNewOwnerName(e.target.value)} /></div>
              <div className="form-group"><label>{p.newOwnerPhone}</label><input value={newOwnerPhone} onChange={e=>setNewOwnerPhone(e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label>New Owner Email (optional — updates account email)</label>
              <input type="email" value={newOwnerEmail} onChange={e=>setNewOwnerEmail(e.target.value)} placeholder="newowner@email.com" />
            </div>
          </>
        )}
        {reqType==="perm_disconnection" && (() => {
          const selConn = connections?.find(c=>String(c.id)===String(selectedConnId));
          return (
            <div className="alert-banner alert-yellow" style={{marginBottom:12}}>
              ℹ️ <strong>Permanent Disconnection Info:</strong><br/>
              • All pending bills must be cleared before requesting disconnection.<br/>
              • Your refundable deposit (₹{selConn?.deposit_amount?.toLocaleString("en-IN") || "—"}) will be returned after officer approval.<br/>
              • Disconnection is final — you will need to apply again for a new connection.
            </div>
          );
        })()}
        <div className="form-group"><label>{p.additionalDetails}</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} />
        </div>
        <button className="btn-primary" onClick={submit}>{p.submitRequest}</button>
      </div>
      <div className="section">
        <h3>{p.myServiceReqs}</h3>
        {serviceRequests.length===0
          ? <div className="empty"><div className="empty-icon">📝</div>{p.noServiceReqs}</div>
          : serviceRequests.map(sr=>(
            <div key={sr.id} className="card">
              <div className="card-header">
                <div className="card-title">{sr.request_type?.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</div>
                <span className={`badge badge-${sr.status}`}>{sr.status.toUpperCase()}</span>
              </div>
              {sr.officer_note && <div className="card-body" style={{marginTop:6}}>{sr.officer_note}</div>}
            {sr.request_type==="perm_disconnection" && sr.status==="completed" && (
              <div className="alert-banner alert-blue" style={{marginTop:8}}>
                ✅ Disconnection approved. Your deposit will be refunded by the municipal office.
              </div>
            )}
              <div className="card-meta" style={{marginTop:6}}>{sr.created_at?new Date(sr.created_at).toLocaleDateString("en-IN"):""}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function ChatbotTab({ user, p }) {
  // "model" role matches Gemini's expected format — backend uses this for history
  const [messages, setMessages] = useState([{ role: "model", text: p.assistantGreet }]);
  const [input, setInput]       = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const bottomRef = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Build history for backend — exclude the greeting to save tokens
  function buildHistory() {
    return messages.slice(1).map(m => ({ role: m.role, text: m.text }));
  }

  async function send(overrideText) {
    const userMsg = (overrideText || input).trim();
    if (!userMsg || loadingChat) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoadingChat(true);
    try {
      const data = await apiFetch("/chatbot/message-authenticated", {
        method: "POST",
        body: JSON.stringify({ message: userMsg, history: buildHistory() }),
      });
      setMessages(prev => [...prev, { role: "model", text: data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: "model", text: "⚠️ कनेक्शन समस्या. पुन्हा प्रयत्न करा." }]);
    } finally {
      setLoadingChat(false);
    }
  }

  return (
    <div className="section">
      <h3>🤖 CiviCare AI Assistant</h3>
      <div className="chatbot-window">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === "user" ? "user" : "bot"}`}>{m.text}</div>
          ))}
          {loadingChat && <div className="chat-msg bot" style={{ opacity: 0.6 }}>⏳</div>}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-row">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={p.chatPlaceholder}
            onKeyDown={e => e.key === "Enter" && send()}
          />
          <button className="btn-primary" onClick={() => send()} disabled={loadingChat}>Send</button>
        </div>
      </div>
      {/* Suggestions auto-send on click, not just fill input */}
      <div className="category-chips" style={{ marginTop: 10 }}>
        {p.chatSuggestions.map(q => (
          <button key={q} className="chip" onClick={() => send(q)} disabled={loadingChat}>{q}</button>
        ))}
      </div>
    </div>
  );
}
