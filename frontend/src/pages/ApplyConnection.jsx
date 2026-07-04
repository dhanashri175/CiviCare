import { useEffect, useState } from "react";
import { apiFetch, useAuth } from "../App";

const CLOUDINARY_CLOUD  = "dc3zbx1as";
const CLOUDINARY_PRESET = "jalsetu_upload";

export default function ApplyConnection() {
  const { setPage } = useAuth();
  const [wards, setWards]   = useState([]);
  const [step, setStep]     = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState("");

  const [form, setForm] = useState({
    ward_id:"", property_number:"", applicant_name:"", applicant_phone:"",
    applicant_email:"", address:"",
    connection_type:"domestic", pipe_size:"0.5",
    aadhaar_doc_url:"", property_doc_url:"",
  });

  const [aadhaarUploading, setAadhaarUploading]   = useState(false);
  const [propertyUploading, setPropertyUploading] = useState(false);

  const [wardsError, setWardsError] = useState(false);
  useEffect(() => {
    apiFetch("/connections/wards")
      .then(data => { setWards(data); setWardsError(false); })
      .catch(() => setWardsError(true));
  }, []);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function uploadDoc(file, type) {
    const setter = type==="aadhaar" ? setAadhaarUploading : setPropertyUploading;
    setter(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("upload_preset", CLOUDINARY_PRESET);
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,{method:"POST",body:fd});
      const data = await res.json();
      if (!data.secure_url) throw new Error("Upload failed");
      update(type==="aadhaar" ? "aadhaar_doc_url" : "property_doc_url", data.secure_url);
    } catch { setError("Document upload failed. Please try again."); }
    finally { setter(false); }
  }

  function validateStep1() {
    if (!form.applicant_name.trim())  return "Full name is required";
    if (!form.applicant_phone.trim() || form.applicant_phone.length < 10) return "Valid 10-digit phone number required";
    if (!form.applicant_email.trim() || !/^\S+@\S+\.\S+$/.test(form.applicant_email)) return "Valid email is required";
    if (!form.ward_id)                return "Please select your ward";
    if (!form.address.trim())         return "Address is required";
    if (!form.property_number.trim()) return "Property number is required";
    return null;
  }

  async function submit() {
    if (!form.aadhaar_doc_url) return setError("Aadhaar document is required");
    if (!form.property_doc_url) return setError("Property document is required");
    setSubmitting(true); setError("");
    try {
      const data = await apiFetch("/connections/apply",{
        method:"POST",
        body: JSON.stringify({ ...form, ward_id: parseInt(form.ward_id) })
      });
      setResult(data); setStep(4);
    } catch(e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  const PIPE_OPTIONS = [
    ["0.5","½ inch"],["0.75","¾ inch"],["1.0","1 inch"],["1.5","1½ inch"]
  ];

  if (step === 4 && result) return (
    <div className="page">
      <div className="success-card">
        <div style={{fontSize:"3rem"}}>✅</div>
        <h2>Application Submitted!</h2>
        <p>Your Application ID: <strong>#{result.application_id}</strong></p>

        {/* Login info — account created immediately */}
        <div style={{background:"rgba(22,163,74,0.08)",border:"1.5px solid rgba(22,163,74,0.3)",
          borderRadius:12,padding:14,margin:"16px 0",textAlign:"left"}}>
          <div style={{fontWeight:700,color:"var(--green-700)",marginBottom:8}}>🔑 You can log in now!</div>
          <div style={{fontSize:13,color:"var(--stone-700)"}}>
            <div>Property Number: <strong>{result.property_number}</strong></div>
            <div style={{marginTop:4}}>Password: <strong>{result.property_number}</strong> (change after first login)</div>
          </div>
        </div>

        <p style={{fontSize:13,color:"var(--stone-500)",marginBottom:16}}>
          {result.note}
        </p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <button className="btn-primary" onClick={()=>setPage("login")}>🔑 Login Now</button>
          <button className="btn-secondary" onClick={()=>setPage("track")}>📋 Track Application</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page" style={{maxWidth:680}}>
      <div className="page-header">
        <h1>🔌 Apply for Water Connection</h1>
        <p>Phaltan Municipal Council — New Connection Application</p>
      </div>

      {/* Step indicator */}
      <div style={{display:"flex",marginBottom:24,background:"var(--glass-bg)",backdropFilter:"blur(16px)",
        border:"1.5px solid var(--glass-border)",borderRadius:16,padding:8}}>
        {[["1","Basic Info"],["2","Connection"],["3","Documents"]].map(([n,l],i)=>(
          <div key={n} style={{flex:1,textAlign:"center",padding:"10px 8px",borderRadius:12,
            background:step===i+1?"linear-gradient(135deg,var(--amber-500),var(--terra-400))":"transparent",
            color:step===i+1?"white":step>i+1?"var(--green-600)":"var(--stone-400)",
            fontWeight:step===i+1?700:500,fontSize:13,transition:"all 0.2s"}}>
            {step>i+1?"✅":n}. {l}
          </div>
        ))}
      </div>

      {wardsError && (
        <div className="error-box" style={{marginBottom:16}}>
          ⚠️ Could not load ward list. Please check your connection and refresh the page.
        </div>
      )}
      {error && <div className="error-box" style={{marginBottom:16}}>{error}</div>}

      <div className="section">
        {/* STEP 1 — Basic Info */}
        {step===1 && <>
          <h3>👤 Applicant Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name <span className="required">*</span></label>
              <input value={form.applicant_name} onChange={e=>update("applicant_name",e.target.value)} placeholder="As per Aadhaar card" />
            </div>
            <div className="form-group">
              <label>Mobile Number <span className="required">*</span></label>
              <input value={form.applicant_phone} onChange={e=>update("applicant_phone",e.target.value)} placeholder="10-digit number" maxLength={10} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email <span className="required">*</span></label>
              <input type="email" value={form.applicant_email} onChange={e=>update("applicant_email",e.target.value)} placeholder="example@email.com" />
            </div>
            <div className="form-group">
              <label>Ward <span className="required">*</span></label>
              <select value={form.ward_id} onChange={e=>update("ward_id",e.target.value)}>
                <option value="">Select your ward</option>
                {wards.map(w=><option key={w.id} value={w.id}>Ward {w.ward_no} — {w.ward_name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Property Number <span className="required">*</span></label>
              <input value={form.property_number} onChange={e=>update("property_number",e.target.value)} placeholder="e.g. PMC/W1/0001" />
              <div style={{fontSize:11,color:"var(--stone-400)",marginTop:3}}>
                Max 2 domestic connections per property. 3rd onwards treated as commercial.
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Property Address <span className="required">*</span></label>
            <textarea value={form.address} onChange={e=>update("address",e.target.value)} rows={3} placeholder="Full address where connection is required..." />
          </div>
          <button className="btn-primary" disabled={wardsError} onClick={()=>{
            const err=validateStep1(); if(err){setError(err);return;} setError(""); setStep(2);
          }}>Next: Connection Details →</button>
        </>}

        {/* STEP 2 — Connection Details */}
        {step===2 && <>
          <h3>🔌 Connection Details</h3>
          <div className="alert-banner alert-blue" style={{marginBottom:14}}>
            ℹ️ Pipe size and connection type determine your annual panipatti rate. Officer confirms pipe size during inspection.
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Connection Type <span className="required">*</span></label>
              <select value={form.connection_type} onChange={e=>update("connection_type",e.target.value)}>
                <option value="domestic">Domestic</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div className="form-group">
              <label>Pipe Size <span className="required">*</span></label>
              <select value={form.pipe_size} onChange={e=>update("pipe_size",e.target.value)}>
                {PIPE_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn-secondary" onClick={()=>setStep(1)}>← Back</button>
            <button className="btn-primary" disabled={wardsError} onClick={()=>{setError("");setStep(3);}}>Next: Upload Documents →</button>
          </div>
        </>}

        {/* STEP 3 — Documents */}
        {step===3 && <>
          <h3>📄 Document Upload</h3>
          <div className="alert-banner alert-yellow" style={{marginBottom:16}}>
            ⚠️ Both documents are <strong>compulsory</strong>. Application cannot be submitted without them.
          </div>

          {/* Aadhaar */}
          <div className="form-group">
            <label>Aadhaar Card / Identity Proof <span className="required">*</span></label>
            <label className={`upload-zone ${form.aadhaar_doc_url?"uploaded":""}`}>
              {aadhaarUploading ? <><div className="upload-icon">⏳</div><p>Uploading...</p></>
               : form.aadhaar_doc_url ? <><div className="upload-icon">✅</div>
                  <p style={{color:"var(--green-600)",fontWeight:600}}>Aadhaar Uploaded</p>
                  <a href={form.aadhaar_doc_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--amber-600)"}} onClick={e=>e.stopPropagation()}>View</a></>
               : <><div className="upload-icon">📄</div><p>Click to upload Aadhaar</p>
                  <p style={{fontSize:11,color:"var(--stone-400)"}}>JPG, PNG or PDF • Max 5MB</p>
                  <div className="upload-required">COMPULSORY</div></>}
              <input type="file" accept="image/*,application/pdf" onChange={e=>{const f=e.target.files[0];if(f)uploadDoc(f,"aadhaar");}} />
            </label>
          </div>

          {/* Property doc */}
          <div className="form-group">
            <label>Property Document (7/12 / Sale Deed / NOC) <span className="required">*</span></label>
            <label className={`upload-zone ${form.property_doc_url?"uploaded":""}`}>
              {propertyUploading ? <><div className="upload-icon">⏳</div><p>Uploading...</p></>
               : form.property_doc_url ? <><div className="upload-icon">✅</div>
                  <p style={{color:"var(--green-600)",fontWeight:600}}>Property Document Uploaded</p>
                  <a href={form.property_doc_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--amber-600)"}} onClick={e=>e.stopPropagation()}>View</a></>
               : <><div className="upload-icon">🏠</div><p>Click to upload Property Document</p>
                  <p style={{fontSize:11,color:"var(--stone-400)"}}>7/12 Utara, Sale Deed, or NOC • Max 5MB</p>
                  <div className="upload-required">COMPULSORY</div></>}
              <input type="file" accept="image/*,application/pdf" onChange={e=>{const f=e.target.files[0];if(f)uploadDoc(f,"property");}} />
            </label>
          </div>

          <div className="btn-row">
            <button className="btn-secondary" onClick={()=>setStep(2)}>← Back</button>
            <button className="btn-primary"
              disabled={submitting||aadhaarUploading||propertyUploading||!form.aadhaar_doc_url||!form.property_doc_url}
              onClick={submit}>
              {submitting?"Submitting...":aadhaarUploading||propertyUploading?"Uploading...":"✅ Submit Application"}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}
